#!/usr/bin/env node
// P-134 self-test (before any P-134 data). Replays P-122's 43 scored run files (gitignored, int-v8's worktree:
// out/p122/runs; the list is p122-final-args.txt, the runner's block order) through score134.mjs:
//   1. with P-122's arm pins, the wrapper reproduces P-122's score-final.json (verdict, GM/EX/ES/FLICKER gates, parity);
//   2. with P-134's arm pins, every counted run of those records is VOID (C served v8, V served v9-final: neither is
//      P-134's C = v9-final + rev 7d / V = v9.1d), so P-134's pins are live and the verdict is insufficient; the pins
//      equal fixes/v9-best/build.mjs's V9D and V91D_EXPECT;
//   3. hold134.sh: TICKET guard, part R refused, unknown items refused, M/X/S accepted, the 420 s time guard;
//   4. serve134.sh and score134.mjs pin the same full hashes, and the served-hash case names them.
// Prints SELFTEST-134 OK <n> or the failures (exit 1); SKIP (exit 2) when the P-122 records are missing.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
process.chdir(root);
const W = await import(join(here, 'score134.mjs'));
const { Q, P134, score134 } = W;
let n = 0; const bad = [];
const ok = (c, what) => { n++; if (!c) bad.push(what); };
const args = readFileSync(join(here, 'p122-final-args.txt'), 'utf8').trim().split(/\s+/);
const files = args.map((a) => a.slice(a.indexOf(':') + 1));
const ref = 'out/p122/score-final.json';
if (![ref, ...files].every((p) => existsSync(p))) { console.log(`SELFTEST-134 SKIP P-122 records missing (${[ref, ...files].filter((p) => !existsSync(p)).slice(0, 3).join(', ')} ...)`); process.exit(2); }
const flick = (entries) => Q.flickerGate(Q.flickerFiles(entries), (P, C, V) => spawnSync(process.execPath, [Q.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V], { encoding: 'utf8' }));
const want = JSON.parse(readFileSync(ref, 'utf8'));

// 1. P-122's pins: the wrapper is P-122's scorer
Q.V9S.pin(Q.P122);
const e1 = Q.V9S.loadEntries(args);
const o1 = score134(e1, flick(e1));
ok(o1.verdict === want.verdict, `1 verdict ${o1.verdict} vs P-122 ${want.verdict}`);
for (const k of ['GM', 'EX', 'ES']) ok(JSON.stringify(o1.gates[k]) === JSON.stringify(want.gates[k]), `1 gate ${k} differs from P-122's`);
ok(JSON.stringify(Object.fromEntries(Object.entries(o1.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict])))
  === JSON.stringify(Object.fromEntries(Object.entries(want.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict]))), '1 FLICKER part verdicts differ');
ok(o1.reported.parity.verdict === want.reported.parity.verdict, `1 parity ${o1.reported.parity.verdict} vs ${want.reported.parity.verdict}`);
ok(o1.runs.map((r) => `${r.item}:${r.void.length}`).join() === want.runs.map((r) => `${r.item}:${r.void.length}`).join(), '1 per-run void pattern differs');

// 2. P-134's pins on P-122's records. The arm pins reach the S sentinels (record meta.served vs EXPECT.C): P-122's
//    sentinels served v8 as C, so each is VOID "served not arm C". G runs carry no served map: their arm identity is
//    the hold's served-hash check log (serve134.sh's case below, test 4), which the scorer requires "ok" per item.
Q.V9S.pin(P134);
const e2 = Q.V9S.loadEntries(args);
const o2 = score134(e2, flick(e2));
const sent = o2.runs.filter((r) => r.kind === 'S');
ok(sent.length >= 10, `2 sentinels ${sent.length}`);
ok(sent.every((r) => r.void.some((x) => /served not arm C/.test(x))), `2 a v8 sentinel is not VOID under P-134 pins: ${sent.filter((r) => !r.void.some((x) => /served not arm C/.test(x))).map((r) => r.item).join(',')}`);
ok(o1.runs.filter((r) => r.kind === 'S').every((r) => !r.void.some((x) => /served not arm/.test(x))), '2 a sentinel is VOID under P-122 pins');
const g2 = o2.runs.filter((r) => r.kind === 'G');
ok(g2.length >= 20 && g2.every((r) => !r.void.some((x) => /served check/.test(x))), '2 G runs lost their served check log');
const noLog = score134([{ ...e2.find((e) => e.item === 'gMV1'), checkLog: null }]).runs[0];
ok(noLog.void.includes('no served check log'), '2 a G run without its served check log is not VOID');
// P-134's pins are build.mjs's: C = V9D (v9-final + rev 7d, the landed bytes), V = V91D_EXPECT (v9.1d); C is not v9-final
const bm = readFileSync('fixes/v9-best/build.mjs', 'utf8');
const pin = (name) => bm.match(new RegExp(`export const ${name} = [^\\n]*?exp\\('([0-9a-f]{12})', '([0-9a-f]{12})'\\)`))?.slice(1, 3) ?? [];
const [d9j, d9c] = pin('V9D'), [d91j, d91c] = pin('V91D_EXPECT');
ok(d9j && P134.C.js.startsWith(d9j) && P134.C.css.startsWith(d9c), `2 P-134 C is not build.mjs V9D (${d9j}/${d9c})`);
ok(d91j && P134.V.js.startsWith(d91j) && P134.V.css.startsWith(d91c), `2 P-134 V is not build.mjs V91D_EXPECT (${d91j}/${d91c})`);
ok(P134.C.js !== Q.P122.V.js, '2 P-134 C is v9-final without rev 7d');

// 3. hold134.sh guards
const hold = readFileSync(join(here, 'hold134.sh'), 'utf8');
const r0 = spawnSync('sh', [join(here, 'hold134.sh'), 'H1a', 'sCo'], { encoding: 'utf8', env: { ...process.env, TICKET: 'P-122' } });
ok(r0.status === 2 && /TICKET is not P-134/.test(r0.stdout), `3 TICKET guard: exit ${r0.status} ${r0.stdout.trim()}`);
const loop = hold.slice(hold.indexOf('PARTS=""'), hold.indexOf('esac; done') + 'esac; done'.length);
const items = (list) => spawnSync('sh', ['-c', `H=T; ${loop}; echo "PARTS$PARTS"`, 'sh', ...list], { encoding: 'utf8' });
for (const bad1 of [['wgRV'], ['gRV1'], ['gRC1'], ['gQV1'], ['nV1']]) { const r = items(bad1); ok(r.status === 4, `3 item ${bad1} not refused (exit ${r.status})`); }
const good = items(['sCo', 'wgMC', 'wgMV', 'gMC1', 'gMV1', 'gXV4', 'gSC3', 'wC', 'sCc']);
ok(good.status === 0 && good.stdout.trim() === 'PARTS M M M M X S', `3 good items: exit ${good.status} ${good.stdout.trim()}`);
const lateDef = hold.match(/^late\(\) \{.*\}$/m)?.[0];
const lr = lateDef ? spawnSync('sh', ['-c', `T0=1000; ${lateDef}; for t in 1420 1421; do late $t && echo late || echo ok; done`], { encoding: 'utf8' }).stdout.trim() : '';
ok(lr === 'ok\nlate', `3 time guard: ${JSON.stringify(lr)}`);
ok(/^S=out\/p134\/snap; O=out\/p134\/runs;/m.test(hold) && /\[ "\$TICKET" = P-134 \]/.test(hold), '3 hold134 folders or ticket');

// 3b. both scripts cd to this checkout's root (they sit 3 levels deep; the P-122 originals 4: a copied depth sent the
//     first `serve134.sh snap` to .claude/worktrees/out, caught and fixed before any data)
for (const f of ['hold134.sh', 'serve134.sh']) {
  const cdl = readFileSync(join(here, f), 'utf8').match(/^cd "\$\(dirname "\$0"\)[^\n]*$/m)?.[0];
  const pwd = cdl ? spawnSync('sh', ['-c', `${cdl} && pwd -P`, join(here, f)], { encoding: 'utf8' }).stdout.trim() : '';
  ok(pwd === realpathSync(root), `3b ${f} cds to ${pwd || 'nothing'}, not the checkout root`);
}

// 4. serve134.sh pins
const srv = readFileSync(join(here, 'serve134.sh'), 'utf8');
const v = (k) => srv.match(new RegExp(`^${k}=([0-9a-f]{64})$`, 'm'))?.[1];
ok(v('CJ') === P134.C.js && v('CC') === P134.C.css && v('VJ') === P134.V.js && v('VC') === P134.V.css, '4 serve134 full hashes differ from score134 pins');
ok(srv.includes(`C:${P134.C.js.slice(0, 12)}:${P134.C.css.slice(0, 12)}|V:${P134.V.js.slice(0, 12)}:${P134.V.css.slice(0, 12)}`), '4 served-hash case');
ok(/^S=out\/p134\/snap/m.test(srv), '4 serve134 snapshot folder');

console.log(bad.length ? `SELFTEST-134 FAIL ${bad.length} of ${n}\n  ${bad.join('\n  ')}` : `SELFTEST-134 OK ${n}`);
process.exit(bad.length ? 1 : 0);

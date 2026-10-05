#!/usr/bin/env node
// P-142 self-test (before any P-142 data). Replays P-122's 43 scored run files (gitignored, int-v8's worktree:
// out/p122/runs; the list is p122-final-args.txt, the runner's block order) through score142.mjs, plus synthetic part-H
// records written to out/p142/selftest:
//   1. with P-122's arm pins, parts M, X, S score exactly as P-122's score-final.json (GM/EX/ES/FLICKER, parity, voids);
//      NF's end windows on P-122's X records (C = v8, V = v9-final) are printed as a descriptive check of the reader;
//   2. with P-142's arm pins, P-122's S sentinels are VOID (they served v8 as C; P-142's C is v9-final); the pins equal
//      fixes/v9-best/build.mjs's V9_EXPECT and V92_EXPECT;
//   3. part H: synthetic hero-flick records (four 0.72 flips a run): clean arms -> NF flips no-worse; V with one 60 ms
//      frame after every flip -> NF WORSE; no check log, 30 Hz and no-flip runs are VOID; the sentinel chain voids H runs
//      before a failing sentinel only; fewer than 3 usable runs -> insufficient;
//   4. hold142.sh: TICKET guard, part R refused, unknown items refused, M/X/S/H accepted, the 420 s time guard, folders;
//      PROG_H equals the compiled flick-hero-v1 program (iphone.mjs gesture --dry-run, no phone);
//   5. serve142.sh and score142.mjs pin the same full hashes, and the served-hash case names them.
// Prints SELFTEST-142 OK <n> or the failures (exit 1); SKIP (exit 2) when the P-122 records are missing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
process.chdir(root);
const W = await import(join(here, 'score142.mjs'));
const { Q, P142, score142, chainH, scoreH } = W;
let n = 0; const bad = [];
const ok = (c, what) => { n++; if (!c) bad.push(what); };
const args = readFileSync(join(here, 'p122-final-args.txt'), 'utf8').trim().split(/\s+/);
const files = args.map((a) => a.slice(a.indexOf(':') + 1));
const ref = 'out/p122/score-final.json';
if (![ref, ...files].every((p) => existsSync(p))) { console.log(`SELFTEST-142 SKIP P-122 records missing (${[ref, ...files].filter((p) => !existsSync(p)).slice(0, 3).join(', ')} ...)`); process.exit(2); }
const runF = (P, C, V) => spawnSync(process.execPath, [Q.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V], { encoding: 'utf8' });
const flick = (entries) => Q.flickerGate(Q.flickerFiles(entries), runF);
const want = JSON.parse(readFileSync(ref, 'utf8'));

// 1. P-122's pins: parts M, X, S are P-122's scorer
Q.V9S.pin(Q.P122);
const e1 = Q.V9S.loadEntries(args);
const o1 = score142(e1, flick(e1), runF);
for (const k of ['GM', 'EX', 'ES']) ok(JSON.stringify(o1.gates[k]) === JSON.stringify(want.gates[k]), `1 gate ${k} differs from P-122's`);
ok(JSON.stringify(Object.fromEntries(Object.entries(o1.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict])))
  === JSON.stringify(Object.fromEntries(Object.entries(want.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict]))), '1 FLICKER part verdicts differ');
ok(o1.reported.parity.verdict === want.reported.parity.verdict, `1 parity ${o1.reported.parity.verdict} vs ${want.reported.parity.verdict}`);
ok(o1.runs.filter((r) => r.part !== 'H').map((r) => `${r.item}:${r.void.length}`).join() === want.runs.map((r) => `${r.item}:${r.void.length}`).join(), '1 per-run void pattern differs');
ok(/^insufficient/.test(o1.gates.FLICKER_H.verdict) && /^insufficient/.test(o1.gates.NF.kinds.flipDown.verdict), '1 no H runs is not insufficient');
ok(/^insufficient/.test(o1.verdict) || /^BEHAVIOUR/.test(o1.verdict), `1 block verdict without part H: ${o1.verdict}`);
const nx = o1.gates.NF.parts.X;
ok(nx.nC >= 3 && nx.nV >= 3, `1 NF part X usable runs C ${nx.nC} V ${nx.nV}`);
console.log(`descriptive (P-122 records, C = v8, V = v9-final): NF endIn ${o1.gates.NF.kinds.endIn.verdict} > 50 C ${JSON.stringify(o1.gates.NF.kinds.endIn.gt50.C)} V ${JSON.stringify(o1.gates.NF.kinds.endIn.gt50.V)}; endOut ${o1.gates.NF.kinds.endOut.verdict} C ${JSON.stringify(o1.gates.NF.kinds.endOut.gt50.C)} V ${JSON.stringify(o1.gates.NF.kinds.endOut.gt50.V)}; windows X C ${JSON.stringify(o1.gates.NF.kinds.endIn.windowsC)} V ${JSON.stringify(o1.gates.NF.kinds.endIn.windowsV)}`);

// 2. P-142's pins on P-122's records
Q.V9S.pin(P142);
const e2 = Q.V9S.loadEntries(args);
const o2 = score142(e2, flick(e2), runF);
const sent = o2.runs.filter((r) => r.kind === 'S');
ok(sent.length >= 10 && sent.every((r) => r.void.some((x) => /served not arm C/.test(x))), '2 a v8 sentinel is not VOID under P-142 pins');
const g2 = o2.runs.filter((r) => r.kind === 'G');
ok(g2.length >= 20 && g2.every((r) => !r.void.some((x) => /served check/.test(x))), '2 G runs lost their served check log');
const bm = readFileSync('fixes/v9-best/build.mjs', 'utf8');
const pin = (name) => bm.match(new RegExp(`export const ${name} = exp\\('([0-9a-f]{12})', '([0-9a-f]{12})'\\)`))?.slice(1, 3) ?? [];
const [fj, fc] = pin('V9_EXPECT'), [vj, vc] = pin('V92_EXPECT');
ok(fj && P142.C.js.startsWith(fj) && P142.C.css.startsWith(fc), `2 P-142 C is not build.mjs V9_EXPECT (${fj}/${fc})`);
ok(vj && P142.V.js.startsWith(vj) && P142.V.css.startsWith(vc), `2 P-142 V is not build.mjs V92_EXPECT (${vj}/${vc})`);
ok(P142.C.js === Q.P122.V.js && P142.C.css === Q.P122.V.css, '2 P-142 C is not P-122 V (v9-final)');

// 3. part H on synthetic records
const D = 'out/p142/selftest'; rmSync(D, { recursive: true, force: true }); mkdirSync(D, { recursive: true });
const okLog = 'B pid 1 port 1 served JS x CSS y ok\nC pid 2 port 2 served JS x CSS y ok\nV pid 3 port 3 served JS x CSS y ok\n';
// four flips: 0 -> 1900 -> 0 twice, 20 px a frame (y_flip = 0.72 * (1630 - 775) = 615.6)
const hero = ({ slow = 0, dt = 16.7, flat = false } = {}) => {
  const ys = []; const leg = (a, b) => { const s = a < b ? 20 : -20; for (let y = a; s > 0 ? y < b : y > b; y += s) ys.push(y); };
  if (flat) for (let i = 0; i < 400; i++) ys.push(i % 2 ? 300 : 302); else { leg(0, 1900); leg(1900, 0); leg(0, 1900); leg(1900, 0); ys.push(0); }
  // slow: one long frame right after each crossing frame (nf-read's windows start after the crossing frame)
  const fr = []; let t = 0, pill = true, next = false;
  for (const y of ys) {
    const nowPill = !(y >= 615.6), flip = fr.length > 0 && nowPill !== pill; pill = nowPill;
    const d = fr.length ? (next && slow ? slow : dt) : null; next = flip;
    t += d ?? 0; fr.push([t, d, y, 775]);
  }
  return { run: { segments: [{ frames: fr, marks: [[0, 'idle'], [100, 'down1']] }], errors: [] } };
};
let set = 0, DS = D;
const fresh = () => { DS = join(D, `set${++set}`); mkdirSync(DS, { recursive: true }); }; // one folder per set: loadEntries takes the newest *-check-<item>.log of the record's folder
const put = (item, j, log = okLog) => { const f = join(DS, `p142-${item}.json`); writeFileSync(f, JSON.stringify(j)); if (log !== null) writeFileSync(join(DS, `p142-T-check-${item}.log`), log); return `${item}:${f}`; };
Q.V9S.pin(P142);
fresh(); const clean = Q.V9S.loadEntries([put('gHC1', hero()), put('gHC2', hero()), put('gHC3', hero()), put('gHV1', hero()), put('gHV2', hero()), put('gHV3', hero())]);
const oc = score142(clean, null, runF);
ok(/^no worse/.test(oc.gates.NF.kinds.flipDown.verdict) && /^no worse/.test(oc.gates.NF.kinds.flipUp.verdict), `3 clean flips: ${oc.gates.NF.kinds.flipDown.verdict} / ${oc.gates.NF.kinds.flipUp.verdict}`);
ok(oc.reported.H.every((r) => !r.void.length && r.flips.down === 2 && r.flips.up === 2), `3 clean H runs: ${JSON.stringify(oc.reported.H)}`);
ok(/^insufficient/.test(oc.gates.FLICKER_H.verdict), `3 synthetic records (no inject data) give FLICKER_H ${oc.gates.FLICKER_H.verdict}`);
ok(/^insufficient/.test(oc.gates.NF.kinds.endIn.verdict), '3 no X runs: endIn not insufficient');
fresh(); const worse = Q.V9S.loadEntries([put('gHC1', hero()), put('gHC2', hero()), put('gHC3', hero()), put('gHV1', hero({ slow: 60 })), put('gHV2', hero({ slow: 60 })), put('gHV3', hero({ slow: 60 }))]);
const ow = score142(worse, null, runF);
ok(/^WORSE/.test(ow.gates.NF.kinds.flipDown.verdict) && /^WORSE/.test(ow.gates.NF.verdict) && ow.verdict === 'WORSE', `3 slow flips: ${ow.gates.NF.kinds.flipDown.verdict}; block ${ow.verdict}`);
fresh(); const voids = Q.V9S.loadEntries([put('gHV1', hero(), null), put('gHV2', hero({ dt: 33.3 })), put('gHV3', hero({ flat: true }))]);
const ov = score142(voids, null, runF).reported.H;
ok(ov[0].void.includes('no served check log'), `3 no check log: ${ov[0].void}`);
ok(ov[1].void.some((v) => /30 Hz/.test(v)), `3 30 Hz: ${ov[1].void}`);
ok(ov[2].void.some((v) => /no flip window/.test(v)), `3 no flips: ${ov[2].void}`);
fresh(); ok(/^insufficient/.test(score142(Q.V9S.loadEntries([put('gHC1', hero()), put('gHV1', hero())]), null, runF).gates.NF.kinds.flipUp.verdict), '3 one run an arm is not insufficient');
const chainOf = (pass) => {
  const es = [{ item: 'sCo' }, { item: 'wgHC' }, { item: 'gHC1' }, { item: 'gHV1' }, { item: 'sCc' }, { item: 'gHV2' }];
  const f = join(D, 'chain.json'); writeFileSync(f, JSON.stringify(hero()));
  const hr = ['gHC1', 'gHV1', 'gHV2'].map((it) => scoreH(it, hero(), okLog, f));
  chainH(es, [{ kind: 'S', item: 'sCo', sentinel: { pass: true } }, { kind: 'S', item: 'sCc', sentinel: { pass } }], hr);
  return hr.map((r) => r.void.length);
};
ok(chainOf(false).join() === '1,1,0', `3 failing sentinel voids the H runs before it only: ${chainOf(false)}`);
ok(chainOf(true).join() === '0,0,0', `3 passing sentinel voids nothing: ${chainOf(true)}`);

// 4. hold142.sh guards
const hold = readFileSync(join(here, 'hold142.sh'), 'utf8');
const r0 = spawnSync('sh', [join(here, 'hold142.sh'), 'H1a', 'sCo'], { encoding: 'utf8', env: { ...process.env, TICKET: 'P-134' } });
ok(r0.status === 2 && /TICKET is not P-142/.test(r0.stdout), `4 TICKET guard: exit ${r0.status} ${r0.stdout.trim()}`);
const loop = hold.slice(hold.indexOf('PARTS=""'), hold.indexOf('esac; done') + 'esac; done'.length);
const items = (list) => spawnSync('sh', ['-c', `H=T; ${loop}; echo "PARTS$PARTS"`, 'sh', ...list], { encoding: 'utf8' });
for (const b of [['wgRV'], ['gRV1'], ['gRC1'], ['gQV1'], ['nV1'], ['gHX1']]) { const r = items(b); ok(r.status === 4, `4 item ${b} not refused (exit ${r.status})`); }
const good = items(['sCo', 'wgMC', 'wgHV', 'gMC1', 'gHV1', 'gXV4', 'gSC3', 'gHC2', 'wC', 'sCc']);
ok(good.status === 0 && good.stdout.trim() === 'PARTS M H M H X S H', `4 good items: exit ${good.status} ${good.stdout.trim()}`);
const lateDef = hold.match(/^late\(\) \{.*\}$/m)?.[0];
const lr = lateDef ? spawnSync('sh', ['-c', `T0=1000; ${lateDef}; for t in 1420 1421; do late $t && echo late || echo ok; done`], { encoding: 'utf8' }).stdout.trim() : '';
ok(lr === 'ok\nlate', `4 time guard: ${JSON.stringify(lr)}`);
ok(/^S=out\/p142\/snap; O=out\/p142\/runs;/m.test(hold) && /\[ "\$TICKET" = P-142 \]/.test(hold), '4 hold142 folders or ticket');
for (const f of ['hold142.sh', 'serve142.sh']) {
  const cdl = readFileSync(join(here, f), 'utf8').match(/^cd "\$\(dirname "\$0"\)[^\n]*$/m)?.[0];
  const pwd = cdl ? spawnSync('sh', ['-c', `${cdl} && pwd -P`, join(here, f)], { encoding: 'utf8' }).stdout.trim() : '';
  ok(pwd === realpathSync(root), `4 ${f} cds to ${pwd || 'nothing'}, not the checkout root`);
}
const progH = hold.match(/PROG_H=([0-9a-f]{12})/)?.[1];
const dry = spawnSync(process.execPath, ['tools/iphone.mjs', 'gesture', 'fixes/v8-best/phone/g/flick-hero-v1.json', '--dry-run'], { encoding: 'utf8' });
const gh = (dry.stdout + dry.stderr).match(/^GESTURE_HASH ([0-9a-f]{12})/m)?.[1];
ok(progH && gh === progH, `4 PROG_H ${progH} vs compiled ${gh}`);
for (const [P, s] of [['M', 'fixes/v9-best/phone/p121/flick-middle-v2.json'], ['X', 'fixes/v9-best/phone/p121/flick-end-v2.json --param speed=fast'], ['S', 'fixes/v9-best/phone/p121/flick-end-v2.json --param speed=slow']]) {
  const d = spawnSync(process.execPath, ['tools/iphone.mjs', 'gesture', ...s.split(' '), '--dry-run'], { encoding: 'utf8' });
  ok((d.stdout + d.stderr).match(/^GESTURE_HASH ([0-9a-f]{12})/m)?.[1] === hold.match(new RegExp(`PROG_${P}=([0-9a-f]{12})`))?.[1], `4 PROG_${P} differs from the compiled program`);
}

// 5. serve142.sh pins
const srv = readFileSync(join(here, 'serve142.sh'), 'utf8');
const v = (k) => srv.match(new RegExp(`^${k}=([0-9a-f]{64})$`, 'm'))?.[1];
ok(v('CJ') === P142.C.js && v('CC') === P142.C.css && v('VJ') === P142.V.js && v('VC') === P142.V.css, '5 serve142 full hashes differ from score142 pins');
ok(srv.includes(`C:${P142.C.js.slice(0, 12)}:${P142.C.css.slice(0, 12)}|V:${P142.V.js.slice(0, 12)}:${P142.V.css.slice(0, 12)}`), '5 served-hash case');
ok(/^S=out\/p142\/snap/m.test(srv) && /SRCC=out\/v92\/snap-30f6371751f4\/F; SRCV=out\/v92\/snap-30f6371751f4\/V/.test(srv), '5 serve142 folders');

console.log(bad.length ? `SELFTEST-142 FAIL ${bad.length} of ${n}\n  ${bad.join('\n  ')}` : `SELFTEST-142 OK ${n}`);
process.exit(bad.length ? 1 : 0);

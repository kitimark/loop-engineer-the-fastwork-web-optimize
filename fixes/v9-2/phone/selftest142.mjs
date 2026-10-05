#!/usr/bin/env node
// P-142 self-test (before any P-142 data). Replays P-122's 43 scored run files (gitignored, int-v8's worktree:
// out/p122/runs; the list is p122-final-args.txt, the runner's block order) through score142.mjs. Rev 1.3a (lead,
// pre-data): part H and the NF gate are dropped (nf OUT, v9.2 = v9.1d), so their checks became refusal checks:
//   1. with P-122's arm pins, parts M, X, S score exactly as P-122's score-final.json (GM/EX/ES/FLICKER, parity, voids);
//      the gates are GM, EX, ES, FLICKER only (no FLICKER_H, no NF);
//   2. with P-142's arm pins, P-122's S sentinels are VOID (they served v8 as C; P-142's C is v9-final); the pins equal
//      fixes/v9-best/build.mjs's V9_EXPECT and V92_EXPECT;
//   3. score142 refuses any part-H item (counted or warm-up) before scoring;
//   4. hold142.sh: TICKET guard, parts R and H refused, unknown items refused, M/X/S accepted, the 420 s time guard,
//      folders; PROG_M/X/S equal the compiled programs (iphone.mjs gesture --dry-run, no phone);
//   5. serve142.sh and score142.mjs pin the same full hashes, and the served-hash case names them.
// Prints SELFTEST-142 OK <n> or the failures (exit 1); SKIP (exit 2) when the P-122 records are missing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../..');
process.chdir(root);
const W = await import(join(here, 'score142.mjs'));
const { Q, P142, score142 } = W;
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
const o1 = score142(e1, flick(e1));
for (const k of ['GM', 'EX', 'ES']) ok(JSON.stringify(o1.gates[k]) === JSON.stringify(want.gates[k]), `1 gate ${k} differs from P-122's`);
ok(JSON.stringify(Object.fromEntries(Object.entries(o1.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict])))
  === JSON.stringify(Object.fromEntries(Object.entries(want.gates.FLICKER.parts).map(([P, x]) => [P, x.verdict]))), '1 FLICKER part verdicts differ');
ok(o1.reported.parity.verdict === want.reported.parity.verdict, `1 parity ${o1.reported.parity.verdict} vs ${want.reported.parity.verdict}`);
ok(o1.runs.map((r) => `${r.item}:${r.void.length}`).join() === want.runs.map((r) => `${r.item}:${r.void.length}`).join(), '1 per-run void pattern differs');
ok(JSON.stringify(Object.keys(o1.gates)) === JSON.stringify(['GM', 'EX', 'ES', 'FLICKER']), `1 gates ${Object.keys(o1.gates)}`);
ok(o1.verdict === want.verdict, `1 block verdict ${o1.verdict} vs P-122's ${want.verdict}`);

// 2. P-142's pins on P-122's records
Q.V9S.pin(P142);
const e2 = Q.V9S.loadEntries(args);
const o2 = score142(e2, flick(e2));
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

// 3. part H refused (rev 1.3a)
for (const it of ['gHC1', 'gHV2', 'wgHC']) {
  let msg = '';
  try { score142([{ item: 'sCo' }, { item: it }]); } catch (e) { msg = e.message; }
  ok(msg.includes(W.H_DROPPED) && msg.includes(it), `3 H item ${it} not refused (${msg || 'scored'})`);
}

// 4. hold142.sh guards
const hold = readFileSync(join(here, 'hold142.sh'), 'utf8');
const r0 = spawnSync('sh', [join(here, 'hold142.sh'), 'H1a', 'sCo'], { encoding: 'utf8', env: { ...process.env, TICKET: 'P-134' } });
ok(r0.status === 2 && /TICKET is not P-142/.test(r0.stdout), `4 TICKET guard: exit ${r0.status} ${r0.stdout.trim()}`);
const loop = hold.slice(hold.indexOf('PARTS=""'), hold.indexOf('esac; done') + 'esac; done'.length);
const items = (list) => spawnSync('sh', ['-c', `H=T; ${loop}; echo "PARTS$PARTS"`, 'sh', ...list], { encoding: 'utf8' });
for (const b of [['wgRV'], ['gRV1'], ['gRC1'], ['gQV1'], ['nV1'], ['gHX1'], ['wgHV'], ['gHV1'], ['gHC2'], ['gMC1', 'gHV1']]) { const r = items(b); ok(r.status === 4, `4 item ${b} not refused (exit ${r.status})`); }
const good = items(['sCo', 'wgMC', 'gMC1', 'gXV4', 'gSC3', 'wC', 'sCc']);
ok(good.status === 0 && good.stdout.trim() === 'PARTS M M X S', `4 good items: exit ${good.status} ${good.stdout.trim()}`);
const lateDef = hold.match(/^late\(\) \{.*\}$/m)?.[0];
const lr = lateDef ? spawnSync('sh', ['-c', `T0=1000; ${lateDef}; for t in 1420 1421; do late $t && echo late || echo ok; done`], { encoding: 'utf8' }).stdout.trim() : '';
ok(lr === 'ok\nlate', `4 time guard: ${JSON.stringify(lr)}`);
ok(/^S=out\/p142\/snap; O=out\/p142\/runs;/m.test(hold) && /\[ "\$TICKET" = P-142 \]/.test(hold), '4 hold142 folders or ticket');
for (const f of ['hold142.sh', 'serve142.sh']) {
  const cdl = readFileSync(join(here, f), 'utf8').match(/^cd "\$\(dirname "\$0"\)[^\n]*$/m)?.[0];
  const pwd = cdl ? spawnSync('sh', ['-c', `${cdl} && pwd -P`, join(here, f)], { encoding: 'utf8' }).stdout.trim() : '';
  ok(pwd === realpathSync(root), `4 ${f} cds to ${pwd || 'nothing'}, not the checkout root`);
}
for (const [P, s] of [['M', 'fixes/v9-best/phone/p121/flick-middle-v2.json'], ['X', 'fixes/v9-best/phone/p121/flick-end-v2.json --param speed=fast'], ['S', 'fixes/v9-best/phone/p121/flick-end-v2.json --param speed=slow']]) {
  const d = spawnSync(process.execPath, ['tools/iphone.mjs', 'gesture', ...s.split(' '), '--dry-run'], { encoding: 'utf8' });
  ok((d.stdout + d.stderr).match(/^GESTURE_HASH ([0-9a-f]{12})/m)?.[1] === hold.match(new RegExp(`PROG_${P}=([0-9a-f]{12})`))?.[1], `4 PROG_${P} differs from the compiled program`);
}

// 5. serve142.sh pins
const srv = readFileSync(join(here, 'serve142.sh'), 'utf8');
const v = (k) => srv.match(new RegExp(`^${k}=([0-9a-f]{64})$`, 'm'))?.[1];
ok(v('CJ') === P142.C.js && v('CC') === P142.C.css && v('VJ') === P142.V.js && v('VC') === P142.V.css, '5 serve142 full hashes differ from score142 pins');
ok(srv.includes(`C:${P142.C.js.slice(0, 12)}:${P142.C.css.slice(0, 12)}|V:${P142.V.js.slice(0, 12)}:${P142.V.css.slice(0, 12)}`), '5 served-hash case');
ok(/^S=out\/p142\/snap/m.test(srv) && /SRCC=out\/v92\/snap-941aa13e5bdf\/F; SRCV=out\/v92\/snap-941aa13e5bdf\/V/.test(srv), '5 serve142 folders');

// 6. rev 1.4: sim92's scroll-window check and part1read.mjs's insufficient branch (part 1's truncation must fail)
const W2 = await import(join(root, 'fixes/v9-2/sim92check.mjs')), { scrollCheck } = W2;
const R = await import(join(root, 'fixes/v9-2/part1read.mjs'));
const trunc = { kind: 'scroll', stop: 'top->end', step: 24, renderingFrames: 31, layouts: 31, styleRecalcs: 33, perFrame: { layouts: 1, styleRecalcs: 1.065 } };
const TB = { B: 50 }; // a test bound; the pinned BOUND_B is set from the arm-C smoke (rev 1.4b)
const full = (pf = 0.75) => ({ kind: 'scroll', stop: 'top->end', step: 24, frames: 255, y: 6075, max: 6075, startMax: 6075, endMax: 6075, ih0: 775, ih1: 775, renderingFrames: 262, layouts: Math.round(262 * pf), styleRecalcs: Math.round(262 * pf), perFrame: { layouts: pf, styleRecalcs: pf } });
const ct = scrollCheck(trunc);
ok(!ct.ok && ct.why.includes('frames undefined') && ct.why.some((w) => /renderingFrames 31 < 203/.test(w)), `6 truncated window passes the check: ${JSON.stringify(ct)}`);
ok(scrollCheck(full(), TB).ok, `6 full window fails: ${JSON.stringify(scrollCheck(full(), TB))}`);
ok(!scrollCheck({ ...full(), y: 5000 }, TB).ok, '6 max scrollY not reached passes');
ok(!scrollCheck({ ...full(), frames: 200 }, TB).ok, '6 frames under the floor passes');
ok(!scrollCheck({ ...full(), renderingFrames: 150 }, TB).ok, '6 renderingFrames under the floor passes');
ok(!scrollCheck({ ...full(), timeout: 30000, frames: undefined, y: undefined }, TB).ok, '6 timeout passes');
// rev 1.4b: toolbar collapse (innerHeight 775 -> 815, live max 6075 -> 6035, reached) passes; a stall mid-page is VOID;
// a collapse larger than B fails; with B unset (the pinned null) every window fails
const collapse = { ...full(), frames: 253, y: 6035, max: 6035, endMax: 6035, ih1: 815 };
ok(scrollCheck(collapse, TB).ok, `6 toolbar collapse fails: ${JSON.stringify(scrollCheck(collapse, TB))}`);
const stall = { ...full(), frames: 140, y: 3000, max: 6035, endMax: 6035, ih1: 815, stalled: true };
const cs = scrollCheck(stall, TB);
ok(!cs.ok && cs.why.some((w) => /live max scrollY not reached .*stalled/.test(w)), `6 stall mid-page passes: ${JSON.stringify(cs)}`);
ok(!scrollCheck({ ...collapse, max: 5975, endMax: 5975, y: 5975 }, TB).ok, '6 a drop of 100 px > B 50 passes');
ok(W2.BOUND_B !== null || !scrollCheck(full()).ok, '6 B unset but a window passes');
const ld = (arm, rep, w, v) => ({ arm, rep, windows: [w], ...(v ? { void: v } : {}) });
const six = (wF, wV) => [ld('F', 1, wF), ld('V', 1, wV), ld('V', 2, wV), ld('F', 2, wF), ld('F', 3, wF), ld('V', 3, wV)];
const sc = (loads) => R.read1cScroll(loads, TB).map((x) => x.verdict);
ok(sc(six(trunc, trunc)).every((v) => /^insufficient/.test(v)), `6 truncated part-1-shaped loads not insufficient: ${sc(six(trunc, trunc))}`);
ok(sc(six(full(), full())).every((v) => v === 'no-worse'), `6 full equal loads not no-worse: ${sc(six(full(), full()))}`);
ok(sc(six(full(0.75), full(3.2))).every((v) => v === 'WORSE'), `6 V +2.45 per frame not WORSE: ${sc(six(full(0.75), full(3.2)))}`);
const short = six(full(), full()); short[2] = ld('V', 2, trunc, 'scroll check: frames undefined');
ok(sc(short).every((v) => /^insufficient/.test(v)), `6 two valid V loads not insufficient: ${sc(short)}`);
const fixed = [...short, ld('V', 12, full())];
ok(sc(fixed).every((v) => v === 'no-worse'), `6 a valid re-run (rep + 10) does not restore n = 3: ${sc(fixed)}`);
const c1a = R.read1a([{ arm: 'F', windows: [{ label: 'rest-0', perSec: { mainFrames: 39, rafFire: 1 } }] }, { arm: 'V', windows: [{ label: 'rest-0', perSec: { mainFrames: 39, rafFire: 1 } }] }]);
ok(c1a.every((x) => /^insufficient/.test(x.verdict)), '6 1a with one load an arm not insufficient');
const p1 = R.readPart1({ chrome: [], sim: six(trunc, trunc) });
ok(p1.verdict === 'INSUFFICIENT', `6 part 1 with truncated scroll windows: ${p1.verdict}`);

console.log(bad.length ? `SELFTEST-142 FAIL ${bad.length} of ${n}\n  ${bad.join('\n  ')}` : `SELFTEST-142 OK ${n}`);
process.exit(bad.length ? 1 : 0);

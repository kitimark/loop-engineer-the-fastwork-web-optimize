#!/usr/bin/env node
// P-122 scorer self-test (before any P-122 data). Uses P-120's and P-121's committed records (gitignored, in int-v8's
// worktree: out/pv9/runs, out/p121/phone) and synthetic copies of them. Prints SELFTEST-122 OK <n> or the failures.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../../../..');
const P = await import(join(here, 'score.mjs'));
const { V9S, GT, scoreRun, scoreP122, gateR, depth90, parse } = P;
let n = 0; const bad = [];
const ok = (c, what) => { n++; if (!c) bad.push(what); };
const rd = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const CHECK = 'B x ok\nC x ok\nV x ok\n';
V9S.pin(P.P122);
// served pins: relabel a record as arm A (the arms' hashes), for path/ceiling checks on B or other-arm records
const asArm = (j, A) => { const k = clone(j); k.meta = k.meta || {}; k.meta.served = { '/_app/immutable/nodes/2.DyWL8TcE.js': P.P122[A].js.slice(0, 12), '/_app/immutable/assets/2.gBuqKVzi.css': P.P122[A].css.slice(0, 12) }; return k; };

// 1. items
ok(parse('wC').warmup && parse('wgRV').warmup && parse('gXV2').part === 'X' && parse('nC3').kind === 'M' && parse('sCo').kind === 'S', 'item parse');
let threw = false; try { parse('gEV1'); } catch { threw = true; } ok(threw, 'P-120 part E item refused');
threw = false; try { parse('mC1'); } catch { threw = true; } ok(threw, 'H1 m item refused');

const need = ['out/p121/phone/m340.json', 'out/p121/phone/efast.json', 'out/p121/phone/eslow.json', 'out/pv9/runs/pv9-gMV1.json', 'out/pv9/runs/pv9-gMC1.json'];
if (!need.every((p) => existsSync(join(root, p)))) { console.log(`SELFTEST-122 SKIP records missing (${need.filter((p) => !existsSync(join(root, p))).join(', ')})`); process.exit(2); }
const m340 = rd(need[0]), efast = rd(need[1]), eslow = rd(need[2]), gMV1 = rd(need[3]), gMC1 = rd(need[4]);
const segE = (j) => j.run.segments.find((s) => s.marks.some((m) => m[1] === 'into1'));

// 2. path gates per part: gM
ok(scoreRun('gMC1', asArm(m340, 'C'), CHECK).void.length === 0, 'm340 (B, P-121 pin) passes gM as C');
ok(scoreRun('gMV1', asArm(m340, 'V'), CHECK).void.length === 0, 'm340 passes gM as V');
ok(scoreRun('gMV1', gMV1, CHECK).void.some((v) => /path: path not covered: 1 traversals/.test(v)), 'H3a2 gMV1 (v1 script) VOIDs on traversals');
ok(scoreRun('gMC1', gMC1, CHECK).void.some((v) => /max y/.test(v)), 'H3a2 gMC1 VOIDs on max y');
ok(scoreRun('gMC1', asArm(m340, 'C'), null).void.includes('no served check log'), 'no served check log voids');

// 3. gX: C needs the release and leaving the end; V needs only the fast stroke (rev 7c catches), caught is reported
const xc = scoreRun('gXC1', asArm(efast, 'C'), CHECK), xv = scoreRun('gXV1', asArm(efast, 'V'), CHECK);
ok(xc.void.length === 0 && xc.path.outs.every((o) => o.fromEnd >= 1600), 'efast passes gX as C');
ok(xv.void.length === 0 && xv.path.outs.every((o) => o.caught === false), 'efast passes gX as V, not caught');
const caught = clone(asArm(efast, 'V')); { const s = segE(caught), mx = Math.max(s.docH, s.docH1) - s.vh0; s.frames.forEach((f) => { if (f[0] >= s.marks.find((m) => m[1] === 'out1')[0]) f[2] = Math.max(f[2], mx - 800); }); }
const xvc = scoreRun('gXV1', caught, CHECK), xcc = scoreRun('gXC1', asArm(caught, 'C'), CHECK);
ok(xvc.void.length === 0 && xvc.path.outs.every((o) => o.caught === true), 'a caught copy passes gX as V, caught');
ok(xcc.void.some((v) => /left the end by/.test(v)), 'the caught copy VOIDs gX as C');
ok(scoreRun('gXV1', asArm(eslow, 'V'), CHECK).void.some((v) => /not fast by the rule/.test(v)), 'a slow stroke VOIDs gX as V');

// 4. gS
ok(scoreRun('gSV1', asArm(eslow, 'V'), CHECK).void.length === 0 && scoreRun('gSC1', asArm(eslow, 'C'), CHECK).void.length === 0, 'eslow passes gS on both arms');
ok(scoreRun('gSV1', asArm(efast, 'V'), CHECK).void.some((v) => /too fast/.test(v)), 'efast VOIDs gS');

// 5. the V ceiling (EX / ES): efast on B has frames > 50 in its window (OBSERVED in the P-121 hold), eslow none
const blk = (items) => scoreP122(items.map(([i, j]) => ({ item: i, j, checkLog: CHECK })));
const exBad = blk([['gXV1', asArm(efast, 'V')], ['gXV2', asArm(efast, 'V')], ['gXV3', asArm(efast, 'V')]]);
ok(/^WORSE \(V ceiling/.test(exBad.gates.EX.verdict) && exBad.verdict === 'WORSE', 'EX ceiling fails on frames > 50');
const esOk = blk([['gSV1', asArm(eslow, 'V')], ['gSV2', asArm(eslow, 'V')]]);
ok(/^no-worse/.test(esOk.gates.ES.verdict), 'ES ceiling passes with 0 frames > 50');
ok(/^insufficient/.test(blk([['gSV1', asArm(eslow, 'V')]]).gates.ES.verdict), 'ES with 1 valid V run is insufficient');
const one54 = clone(asArm(eslow, 'V')); { const s = segE(one54), t0 = s.marks.find((m) => m[1] === 'into1')[0]; const i = s.frames.findIndex((f, k) => k > 0 && f[0] > t0 && f[2] !== s.frames[k - 1][2]); s.frames[i][1] = 52; }
const ts = blk([['gSV1', one54], ['gSV2', asArm(eslow, 'V')]]);
ok(/^WORSE/.test(ts.gates.ES.verdict) && ts.gates.ES.thresholdSensitive && ts.gates.ES.near.includes(52), 'a 52 ms frame: WORSE, threshold-sensitive (> 54 twin passes), flagged near');

// 6. gR (I-179): synthetic ret strokes on V's geometry: docH 6810, vh 775, lvh 775 -> closed rest 5260, open 6035
function retRun(kind) {
  const seg = { docH: 6810, docH1: 6810, vh0: 775, frames: [], touches: [], marks: [] };
  let t = 0; const F = (y) => { seg.frames.push([t, 16, Math.round(y), 775]); t += 16; };
  seg.marks.push([t, 'into1']); for (let i = 0; i < 20; i++) F(3400 + i * 130);
  for (const k of [1, 2, 3]) {
    seg.marks.push([t, `ret${k}`]); F(5260);
    const lift = kind === 'far' ? 5260 - 300 : 5260 - 0.12 * 775; // p -0.39 or -0.12 at lift
    seg.touches.push([t, 's', 1, 0, 0, 0, 500]); for (let i = 1; i <= 6; i++) { seg.touches.push([t, 'm', 1, 0, 0, 0, 500 + ((5260 - lift) * i) / 6]); F(5260 - ((5260 - lift) * i) / 6); }
    seg.touches.push([t, 'e', 0, 0, 0, 0, 500 + (5260 - lift)]);
    for (let i = 1; i <= 10; i++) F(lift - 40 * i); // glides away to p < -0.15
    if (kind === 'finger') { seg.touches.push([t, 's', 1, 0, 0, 0, 400]); seg.touches.push([t + 5, 'e', 0, 0, 0, 0, 400]); }
    for (let i = 1; i <= 20; i++) F(lift - 400 + ((6035 - lift + 400) * i) / 20); // back to the open end
    seg.marks.push([t, `into${k + 1}`]); F(6035);
  }
  seg.marks.push([t, 'end']); F(6035);
  return { run: { segments: [seg], untils: [] }, meta: {} };
}
const r1 = gateR(retRun('near')), r2 = gateR(retRun('finger')), r3 = gateR(retRun('far'));
ok(r1.ok && r1.inRange === 3 && r1.returned === 3 && r1.rets.every((x) => Math.abs(x.pLift + 0.12) < 0.01 && x.returnMs > 0), 'gateR: lift at p -0.12, glide away, back at open with no finger: 3 returns');
ok(r2.ok && r2.returned === 0, 'gateR: a finger down before the return: not counted');
ok(!r3.ok && /no ret stroke lifted/.test(r3.why[0]), 'gateR: lifts at p -0.39 VOID (path not covered)');

// 7. F-260 depth line
const d = depth90([[0, 16, 1000], [10, 16, 5300], [20, 16, 5500]], 6810, 775, 15, 99);
ok(d.y90 === 5354 && d.firstAt === 20 && d.inWindow === true, 'depth90: y90 = 0.9 docH - vh, first frame at or past it, in window');
ok(depth90([[0, 16, 6000]], 6810, 775, 15, 99).inWindow === false, 'depth90: reached before the window');

// 8. the hold script (text): TICKET P-122, N2 program pins, items, wda check, VOID on a failed counted item
const h = readFileSync(join(here, 'hold122.sh'), 'utf8');
ok(/\[ "\$TICKET" = P-122 \]/.test(h), 'hold122 refuses without TICKET=P-122');
ok(/PROG_M=607b59612abb; PROG_X=21aaafd3a9fd; PROG_S=7312cdcd2574; PROG_R=92bcef2b02df$/m.test(h), 'hold122 N2 pins (R = 92bcef2b02df, flick-return-v1 2ddbab3c23a1 compiled)');
ok(/--dry-run 2>&1 \| sed -n 's\/\^GESTURE_HASH/.test(h) && /exit 4; }\n    echo "PROG/.test(h), 'hold122 compiles each part and VOIDs a different program before the gate');
ok(h.indexOf('wda check') < h.indexOf('gate start') && h.indexOf('PROG $P') < h.indexOf('gate start'), 'wda check and N2 before the start gate');
ok(!/--cycles 4|--driver morph/.test(h) && /^  w\[CV\]\|sC\[oc\]\) ;;$/m.test(h), 'no M leg: n items are unknown (VOID), no morph driver');
ok(/G\) node tools\/iphone.mjs gesture \$\(script \$P\) --inject \$INJ /.test(h) && /^INJ=fixes\/nav-hit-cache\/flicker-inject.mjs$/m.test(h), 'every G run carries the flicker logger');
ok(/^S=out\/p122\/snap;/m.test(h) && /sh \$G2\/serve122.sh check/.test(h) && !/phone\/serve.sh/.test(h), 'v9-final servers and copies (serve122.sh, out/p122/snap)');
const sv = readFileSync(join(here, 'serve122.sh'), 'utf8');
ok(sv.includes(P.P122.V.js) && sv.includes(P.P122.V.css) && sv.includes(P.P122.C.js) && /V:647c9ef2b1e2:e1359ab9994a\)/.test(sv) && P.P122.V.js.startsWith('647c9ef2b1e2'), 'serve122 pins the scorer\'s arms (V = v9-final without scroll-cb or close, 647c9ef2b1e2 / e1359ab9994a)');
// flicker (lead ruling F3): G1 decides; G2/G3 and INCONCLUSIVE are reported only; VOID or no G1 line is insufficient
const G1 = (v, c, w) => `G1 V monotone blinks ${v} (C ${c}): ${v ? 'FAIL' : 'pass'}\nG2 blinks V 3 <= C 0 + 1: FAIL\nFLICKER-GATE ${w} (K=8)`;
ok(P.flickerVerdict(0, G1(0, 0, 'PASS')).startsWith('no-worse'), 'flicker: PASS -> no-worse');
ok(P.flickerVerdict(5, G1(0, 2, 'INCONCLUSIVE')).startsWith('no-worse') && /INCONCLUSIVE \(G2\/G3 reported only\)/.test(P.flickerVerdict(5, G1(0, 2, 'INCONCLUSIVE'))), 'flicker: INCONCLUSIVE with G1 pass -> no-worse (reported, never insufficient)');
ok(P.flickerVerdict(3, G1(0, 0, 'FAIL')).startsWith('no-worse'), 'flicker: G2/G3 FAIL with G1 pass -> no-worse (G2/G3 reported only)');
ok(P.flickerVerdict(3, G1(2, 0, 'FAIL')).startsWith('WORSE (G1: V monotone blinks 2'), 'flicker: G1 FAIL -> WORSE');
ok(P.flickerVerdict(4, G1(0, 0, 'VOID')).startsWith('insufficient') && P.flickerVerdict(1, '').startsWith('insufficient') && P.flickerVerdict(0, 'no g1 here').startsWith('insufficient'), 'flicker: VOID, a usage error or no G1 line -> insufficient');
// F5 time guard: late() from hold122.sh, run at the 900 s boundary (elapsed + 240 > 900), and where the loop calls it
const lateDef = h.match(/^late\(\) \{.*\}$/m)?.[0];
const lr = lateDef ? spawnSync('sh', ['-c', `T0=1000; ${lateDef}; for t in 1660 1661 1000; do late $t && echo late || echo ok; done`], { encoding: 'utf8' }).stdout.trim().split('\n') : [];
ok(lateDef === 'late() { [ $(( $1 - T0 + 240 )) -gt 900 ]; }' && JSON.stringify(lr) === '["ok","late","ok"]', 'time guard: elapsed 660 s may start a G item (660 + 240 = 900), 661 s may not');
const loop = h.slice(h.indexOf('for I in "$@"; do\n  case $I in wg*|g*)'));
ok(loop.length > 0 && /case \$I in wg\*\|g\*\) now=\$\(date \+%s\)\n    if late "\$now"; then echo "HOLD \$H VOID time: [^\n]*"\n      node tools\/iphone.mjs park --owner "\$R" > \/dev\/null 2>&1; exit 7; fi ;; esac\n  sh \$G2\/serve122.sh check/.test(loop) && h.indexOf('late "$now"') < h.indexOf('HOLD $H VALID'), 'time guard checked before every wg/g item, parks and exits 7 (VOID time)');
const ffs = P.flickerFiles([{ item: 'gMC1', file: 'a', j: {} }, { item: 'gXV2', file: 'b', j: {} }, { item: 'gRV1', file: 'c', j: {} }, { item: 'wgMV', file: 'd', j: {} }, { item: 'sCo', file: 'e', j: {} }, { item: 'gSV1', file: 'f', j: null }]);
ok(JSON.stringify(ffs) === '{"C":["a"],"V":["b"]}', 'flicker input: counted M/X/S G runs with a record; no R, warm-ups or sentinels');
ok(!('Mmoving' in esOk.gates) && /^insufficient/.test(blk([['gSV1', asArm(eslow, 'V')], ['gSV2', asArm(eslow, 'V')]]).gates.GM.verdict), 'no M gates; GM with no part-M runs is insufficient');
ok(/g\[MXSR\]\[CV\]\[0-9\]\*\) BAD=/.test(h) && h.indexOf('BAD="$BAD $I"') < h.indexOf('HOLD $H VALID'), 'a failed counted item voids the hold before VALID');

// 9. fling-distance parity (lead ruling F2): lift to settle (or to the next stroke), M's first page-up fling after mid1
// and X's first stroke after into1, median gap > 300 AND >= 2 pairs, the shorter side clipped at its own end does not count
// synth(mark, y0, moves, docH): one segment; per move d a stroke (d > 0: finger up, page down), 4 moving frames under the
// finger, the lift, a 30-frame glide of d, then `still` frames (30 = 480 ms settled; 0 = the next stroke comes first)
function synth(mark, y0, moves, docH = 6810, still = 30) {
  const vh = 775, seg = { docH, docH1: docH, vh0: vh, frames: [], touches: [], marks: [] };
  let t = 0, y = y0; const F = () => { y = Math.min(Math.max(y, 0), docH - vh); seg.frames.push([t, 16, Math.round(y), vh]); t += 16; };
  F(); seg.marks.push([t, mark]); F();
  for (const d of moves) {
    const s = Math.sign(d); seg.touches.push([t, 's', 1, 0, 0, 0, 600]);
    for (let i = 1; i <= 4; i++) { seg.touches.push([t, 'm', 1, 0, 0, 0, 600 - s * 20 * i]); y += s * 20; F(); }
    seg.touches.push([t, 'e', 0, 0, 0, 0, 600 - s * 80]);
    for (let i = 1; i <= 30; i++) { y += d / 30; F(); }
    for (let i = 0; i < still; i++) F();
  }
  seg.marks.push([t, 'end']); F();
  return { run: { segments: [seg], untils: [] }, meta: {} };
}
const Mrun = (up) => synth('mid1', 2040, [2205, -up, 2190, -2190]);
const Xrun = (d, docH) => synth('into1', 3400, [d, -900], docH);
const ld = P.liftDists(Mrun(2204), 'M');
ok(ld.flings.length === 4 && ld.flings[0].page === 'down' && Math.abs(ld.flings[0].d - 2205) <= 1 && ld.flings[1].page === 'up' && Math.abs(ld.flings[1].d - 2204) <= 1 && ld.flings.every((f) => f.how === 'settle'), 'liftDists: lift to settle per stroke, page direction from the finger');
const ldn = P.liftDists(synth('mid1', 2040, [2205, -2204], 6810, 0), 'M');
ok(ldn.flings[0].how === 'next stroke' && Math.abs(ldn.flings[0].d - 2205) <= 1, 'liftDists: the next stroke ends a fling that has not settled');
const runs = (P_, cs, vs) => [...cs.map((j, i) => ({ item: `g${P_}C${i + 1}`, j })), ...vs.map((j, i) => ({ item: `g${P_}V${i + 1}`, j }))];
const Xok = runs('X', [Xrun(1500, 6000), Xrun(1500, 6000), Xrun(1500, 6000)], [Xrun(1450, 6810), Xrun(1500, 6810), Xrun(1520, 6810)]);
const parM = (cUps, vUps, x = Xok) => P.parity([...runs('M', cUps.map(Mrun), vUps.map(Mrun)), ...x, { item: 'wgMV', j: Mrun(100) }]);
const p1 = parM([2204, 2204, 2204], [2127, 2150, 2190]);
ok(p1.verdict === 'pass' && p1.parts.M.verdict === 'pass' && p1.parts.X.verdict === 'pass' && Math.abs(p1.parts.M.gap + 54) <= 2, 'parity: V within 300 px of C on M and X: pass (warm-ups ignored)');
const p2 = parM([2204, 2204, 2204], [1255, 1255, 1255]);
ok(p2.verdict === 'BEHAVIOUR FAIL' && p2.parts.M.pairHits === 3 && p2.parts.X.verdict === 'pass' && /^M first page-up fling after mid1: median V 12\d\d vs C 220\d/.test(p2.fail[0]), 'parity: the Simulator gap (V 1255 vs C 2204) is BEHAVIOUR FAIL');
const p3 = parM([2200, 1800, 2600], [1850, 1400, 2700]);
ok(p3.verdict === 'BEHAVIOUR FAIL' && p3.parts.M.pairHits === 2, 'parity: median gap > 300 and 2 of 3 pairs: BEHAVIOUR FAIL');
const p4 = parM([2200, 1800, 2600], [1850, 1600, 2700]);
ok(p4.verdict === 'pass' && p4.parts.M.medCounts && p4.parts.M.pairHits === 1, 'parity: median gap > 300 but only 1 of 3 pairs: pass');
const p5 = parM([2204, 2204, 2204], [1255, 2200, 2200]);
ok(p5.verdict === 'pass' && !p5.parts.M.medCounts, 'parity: one short pair, median within 300: pass');
// X: C's into fling ends at v8's own end (5220 = 5995 - 775), V's travels on to v9's lower end: the shorter side is clipped
const xClip = runs('X', [Xrun(1820, 5995), Xrun(1820, 5995), Xrun(1820, 5995)], [Xrun(2635, 6810), Xrun(2635, 6810), Xrun(2635, 6810)]);
const p6 = parM([2204, 2204, 2204], [2204, 2204, 2204], xClip);
ok(p6.verdict === 'pass' && p6.parts.X.clipC && p6.parts.X.gap > 800 && p6.parts.X.pairHits === 0, 'parity: X gap with C clipped at its own end does not count');
const xShort = runs('X', [Xrun(1500, 6810), Xrun(1500, 6810), Xrun(1500, 6810)], [Xrun(900, 6810), Xrun(900, 6810), Xrun(1450, 6810)]);
const p7 = parM([2204, 2204, 2204], [2204, 2204, 2204], xShort);
ok(p7.verdict === 'BEHAVIOUR FAIL' && p7.parts.X.verdict === 'BEHAVIOUR FAIL' && p7.parts.M.verdict === 'pass', 'parity: X into fling 600 px short on V (unclipped) in 2 of 3 pairs: BEHAVIOUR FAIL');
const p8 = P.parity([...runs('M', [Mrun(2204)], [Mrun(1255)]), ...Xok]);
ok(/^insufficient/.test(p8.verdict) && /M insufficient \(1 pair/.test(p8.verdict), 'parity: fewer than 2 pairs is insufficient, never pass or FAIL');
// the block: path-voided runs still feed the parity; BEHAVIOUR FAIL leads the verdict, the frame verdict is kept after it
const blkP = scoreP122([...runs('M', [Mrun(2204), Mrun(2204), Mrun(2204)], [Mrun(1255), Mrun(1255), Mrun(1255)]), ...Xok].map((e) => ({ ...e, checkLog: CHECK })));
ok(blkP.runs.some((r) => r.void.length) && blkP.reported.parity.verdict === 'BEHAVIOUR FAIL' && /^BEHAVIOUR FAIL; frames (WORSE|insufficient|no-worse)/.test(blkP.verdict), 'block: VOID runs feed the parity; BEHAVIOUR FAIL; frames <verdict>');
const src = readFileSync(join(here, 'score.mjs'), 'utf8');
ok(/console\.log\('BEHAVIOUR FAIL'\)/.test(src), 'the CLI prints BEHAVIOUR FAIL on its own line');

console.log(bad.length ? `SELFTEST-122 FAIL ${bad.length} of ${n}:\n  ${bad.join('\n  ')}` : `SELFTEST-122 OK ${n}`);
process.exit(bad.length ? 1 : 0);

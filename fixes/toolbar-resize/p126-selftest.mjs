#!/usr/bin/env node
// toolbar-resize P-126 self-test for read-inval126.mjs, on synthetic runs only (no real capture is read).
//   node fixes/toolbar-resize/p126-selftest.mjs      -> SELFTEST PASS (n checks) | SELFTEST FAIL ...
// Builds g-/tl- files in the format sim.mjs writes (segments of [t, dt, y, ih] frames, the p125 inject record with
// `io` entries [time, in, top, bottom, rootH], Timeline records with startTime in seconds and offsetMs) under a temp
// folder, one scenario per folder, 5 C runs + wpx/wc1 replicates, and checks the frozen calls.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { read, stackKey, quadBox, loadRun } from './read-inval126.mjs';

const PAGE = 'http://localhost:1/_app/immutable/nodes/2.DyWL8TcE.js';
const fails = []; let n = 0;
const ok = (c, msg) => { n++; if (!c) fails.push(msg); };
const st = (frames) => ({ callFrames: frames, truncated: false });
const pf = (line, fn = '') => ({ functionName: fn, url: PAGE, scriptId: '1', lineNumber: line, columnNumber: 1 });
const inj = { functionName: 'setAttribute', url: '', scriptId: '9', lineNumber: 12, columnNumber: 3 };
const nat = { functionName: 'setAttribute', url: '[native code]', scriptId: '0', lineNumber: 0, columnNumber: 0 };

// --- stack keys
ok(stackKey(st([nat, inj, pf(2742)])) === 'fwWC', 'inject and native frames skipped -> fwWC');
ok(stackKey(st([pf(2737)])) === 'fwWC' && stackKey(st([pf(2749)])) === 'fwWC', 'region padded by one line');
ok(stackKey(st([pf(2750, 'x')])) === '2.DyWL8TcE.js:x@2750', 'outside every region keys by file:function@line');
ok(stackKey(st([{ ...pf(2742), url: 'http://localhost:1/_app/immutable/chunks/X.js' }])) === 'X.js:?@2742', 'region only in the v8 nodes file');
ok(stackKey(st([nat])) === 'native' && stackKey(null) === 'native', 'no page frame -> native');
ok(stackKey(st([inj])) === 'probe' && stackKey(st([nat, inj])) === 'probe', 'C1: probe-only stack -> probe, not native');
const ext = { functionName: 'f', url: 'https://cdn.example/lib/x.js', scriptId: '5', lineNumber: 3, columnNumber: 1 };
ok(stackKey(st([nat, inj, ext])) === 'ext:x.js:f@3' && stackKey(st([ext, pf(2742)])) === 'fwWC', 'other urls key as ext:, a page frame still wins');
ok(stackKey(st([pf(2796)])) === 'sceneCE' && stackKey(st([pf(14210)])) === 'sceneC', 'scene regions');
const qb = quadBox([0, 0, 430, 0, 430, 775, 0, 775]);
ok(qb && qb.x1 === 430 && qb.y1 === 775, 'quad box');

// --- synthetic runs
// frames: 300 at 16.667 ms; ih 775 rest, 6 moving frames per step (4 steps), 815 rest between; y = 8 i (< 3250).
function build(dir, name, sc) {
  const frames = [], recs = [];
  const steps = [[50, 775, 815], [150, 815, 775], [200, 775, 815], [260, 815, 775]];
  let ih = 775;
  for (let i = 0; i < 300; i++) {
    const s = steps.find(([a]) => i >= a && i < a + 6);
    if (s) ih = Math.round(s[1] + ((s[2] - s[1]) * (i - s[0] + 1)) / 7);
    else { const last = steps.filter(([a]) => i >= a + 6).pop(); ih = last ? last[2] : 775; }
    const t = 1000 + i * 16.667, dt = 16.667;
    frames.push([t, dt, i * 8, ih]);
    const moving = ih > 775 && ih < 815, mid = (t - dt / 2) / 1000, ch = [];
    if (moving && !sc.thinAfter3?.(i)) {
      const L = { startTime: mid + 0.001, endTime: mid + 0.022, type: 'Layout', data: { root: sc.subtree ? [0, 100, 430, 100, 430, 300, 0, 300] : [0, 0, 430, 0, 430, ih, 0, ih] }, children: [] };
      if (sc.forced) L.stackTrace = st([pf(5000, 'gBCR')]);
      if (sc.forcedProbe) L.stackTrace = st([nat, inj]);
      for (let j = 0; j < (sc.nativeN || 0); j++) ch.push({ startTime: mid - 0.002 - j * 0.0001, type: 'InvalidateLayout', data: {}, children: [] });
      for (let j = 0; j < (sc.pageN || 0); j++) ch.push({ startTime: mid - 0.002 - j * 0.0001, type: 'ScheduleStyleRecalculation', data: {}, stackTrace: st([pf(7000, 'rate')]), children: [] });
      if (sc.probe) ch.push({ startTime: mid - 0.003, type: 'ScheduleStyleRecalculation', data: {}, stackTrace: st([nat, inj]), children: [] });
      ch.push({ startTime: mid, endTime: mid + 0.023, type: 'RecalculateStyles', data: {}, children: [L] });
      if (sc.native) ch.push({ startTime: mid - 0.002, type: 'ScheduleStyleRecalculation', data: {}, children: [] });
      if (sc.fwwc) ch.push({ startTime: mid - 0.003, type: 'ScheduleStyleRecalculation', data: {}, stackTrace: st([nat, inj, pf(2742)]), children: [] });
      if (sc.scene) ch.push({ startTime: mid - 0.004, type: 'InvalidateLayout', data: {}, stackTrace: st([pf(2796)]), children: [] });
      if (sc.resize) ch.push({ startTime: mid - 0.005, type: 'EventDispatch', data: { type: 'resize', defaultPrevented: false }, children: [] });
    } else {
      ch.push({ startTime: mid, endTime: mid + 0.002, type: 'Layout', data: { root: [0, 0, 430, 0, 430, ih, 0, ih] }, children: [] });
      if (sc.native && i % 10 === 0) ch.push({ startTime: mid - 0.002, type: 'ScheduleStyleRecalculation', data: {}, children: [] });
      if (sc.nativeN) ch.push({ startTime: mid - 0.002, type: 'InvalidateLayout', data: {}, children: [] });
      if (sc.pageN) ch.push({ startTime: mid - 0.002, type: 'ScheduleStyleRecalculation', data: {}, stackTrace: st([pf(7000, 'rate')]), children: [] });
      if (sc.sceneEverywhere) ch.push({ startTime: mid - 0.004, type: 'InvalidateLayout', data: {}, stackTrace: st([pf(2796)]), children: [] });
    }
    if (sc.sceneEverywhere && moving) ch.push({ startTime: mid - 0.004, type: 'InvalidateLayout', data: {}, stackTrace: st([pf(2796)]), children: [] });
    if (sc.prevOnly && moving) recs.push({ startTime: (t - dt - dt / 2) / 1000, type: 'ScheduleStyleRecalculation', data: {}, stackTrace: st([pf(9000, 'prev')]), children: [] });
    recs.push({ startTime: mid - 0.006, endTime: mid + 0.024, type: 'RenderingFrame', data: {}, children: ch });
  }
  const io = sc.io ?? [[0, 1, 0, 100, 775], [3000, 1, 0, 100, 815]];
  if (sc.viewOnlyMoving) { io.length = 0; let last = null; frames.forEach(([t, dt, y, h]) => { const m = h > 775 && h < 815 ? 1 : 0; if (m !== last) { io.push([t - dt + 0.1, m, 0, 100, h]); last = m; } }); }
  const inject = { arm: name.startsWith('C') ? 'none' : name.replace(/-H\d+$/, ''), io, wr: [], ioInstalled: true };
  writeFileSync(join(dir, `g-${name}.json`), JSON.stringify({ run: { segments: [{ frames }], inject: [{ value: inject }] } }));
  writeFileSync(join(dir, `tl-${name}.json`), JSON.stringify({ kind: 'gesture-timeline', offsetMs: 0, recs }));
}
const NAMES = ['C-H1', 'wpx-H1', 'C-H2', 'wc1-H1', 'C-H3', 'wc1-H2', 'C-H4', 'wpx-H2', 'C-H5'];
const root = mkdtempSync(join(tmpdir(), 'p126-selftest-'));
const scen = (label, sc) => { const d = join(root, label); mkdirSync(d); for (const nm of NAMES) build(d, nm, sc); return read(d, NAMES); };
try {
  const A = scen('A', { native: true, fwwc: true, resize: true });
  ok(A.C.H === 120, `A: heavy frames pooled over 5 C runs (got ${A.C.H})`);
  ok(A.C.reading === 'NATIVE', `A: native + fwWC only -> NATIVE (got ${A.C.reading})`);
  ok(A.C.feats['inval:fwWC']?.call === 'COVERS', 'A: fwWC reported COVERS but does not decide');
  ok(A.C.feats['inval:native']?.call === 'COVERS', 'A: native COVERS');
  ok(A.C.feats['ev:resize']?.call === 'COVERS', 'A: resize events COVERS');
  ok(A.C.parent === 'RECALC' && A.C.forced === 'UPDATE' && A.C.root === 'VIEW', `A: RECALC / UPDATE / VIEW (got ${A.C.parent} ${A.C.forced} ${A.C.root})`);
  ok(A.agree === 'AGREE' && A.R.H === 96, `A: replicate set agrees (H ${A.R?.H})`);
  ok(!A.C.controlWide && A.C.control > 20, 'A: in-view control set used');
  ok(A.k1.call === 'SUPPORTS' && A.k1.ihMin === 775 && A.k1.ihMax === 815, `A: K1 SUPPORTS (got ${A.k1.call})`);
  ok(JSON.stringify(A.k1b.viewRootHeights.slice(0, 1)) !== '[]', 'A: K1b VIEW root heights listed');
  ok(A.C.feats['inval:fwWC'].floor === 10 && A.R.feats['inval:fwWC'].floor === 8, 'floor scales with pooled runs (10 for 5, 8 for 4)');

  const B = scen('B', { native: true, fwwc: true, scene: true });
  ok(B.C.reading === 'SCRIPT-SOURCE(sceneCE)', `B: scene invalidation on step frames -> SCRIPT-SOURCE(sceneCE) (got ${B.C.reading})`);

  const Cc = scen('C', { native: true, sceneEverywhere: true });
  ok(Cc.C.feats['inval:sceneCE']?.call === 'NO-LINK' && Cc.C.reading === 'NATIVE', `C: scene everywhere (base 1) -> NO-LINK, NATIVE (got ${Cc.C.feats['inval:sceneCE']?.call} ${Cc.C.reading})`);

  const D = scen('D', { native: true, forced: true });
  ok(D.C.forced === 'SCRIPT' && D.C.forcedKeys['2.DyWL8TcE.js:gBCR@5000'] === 120, `D: forced layout keyed (got ${D.C.forced} ${JSON.stringify(D.C.forcedKeys)})`);

  const E = scen('E', { native: true, subtree: true });
  ok(E.C.root === 'SUBTREE', `E: subtree root (got ${E.C.root})`);

  const F = scen('F', {});
  ok(F.C.reading === 'UNCLEAR', `F: no invalidation records -> UNCLEAR (got ${F.C.reading})`);

  const G = scen('G', { native: true, prevOnly: true });
  ok(G.C.feats['inval:2.DyWL8TcE.js:prev@9000']?.Hw === 120, 'G: a record in the previous frame carries');
  const gRun = loadRun(join(root, 'G'), 'C-H1');
  ok(gRun.frames[50].carry.has('inval:2.DyWL8TcE.js:prev@9000'), 'G: first moving frame carries from the rest frame before it');

  const K = scen('K', { native: true, io: [[0, 1, 0, 100, 775]] });
  ok(K.k1.call === 'ONE-HEIGHT', `K: one root height -> ONE-HEIGHT (got ${K.k1.call})`);
  const K0 = scen('K0', { native: true, io: [[0, 1, 0, 100, null]] });
  ok(K0.k1.call === 'NONE', `K0: no heights -> NONE (got ${K0.k1.call})`);

  const W = scen('W', { native: true, viewOnlyMoving: true });
  ok(W.C.controlWide === true, 'W: < 20 in-view rest frames -> wide control (flagged)');

  const T = scen('T', { native: true, thinAfter3: (i) => !(i >= 50 && i < 51) });
  ok(T.C.H === 5 && T.R.H === 4, `T: 1 heavy frame per run (got ${T.C.H}/${T.R.H})`);
  ok(T.R.parent === 'THIN' && T.R.reading === 'UNCLEAR', `T: R with 4 heavy frames is THIN, UNCLEAR (got ${T.R.parent} ${T.R.reading})`);

  // --- rev 2 (ops C1, C2)
  ok(A.C.feats['inval:native'].rate?.linked === true && A.C.feats['inval:native'].rate.floor === 20 && A.R.feats['inval:native'].rate.floor === 16, 'rate on inval keys, floor max(8, 4 x runs)');
  ok(!('rate' in A.C.feats['ev:resize']), 'rate only on inval keys');
  const Pr = scen('Pr', { probe: true });
  ok(Pr.C.feats['inval:probe']?.call === 'COVERS' && Pr.C.probeLinked === true && Pr.C.reading === 'UNCLEAR', `C1: probe-linked work never decides (got ${Pr.C.feats['inval:probe']?.call} ${Pr.C.reading})`);
  ok(!Pr.C.feats['inval:native'], 'C1: probe work is not counted as native');
  const N = scen('N', { nativeN: 4 });
  ok(N.C.feats['inval:native'].base === 1 && N.C.feats['inval:native'].call === 'NO-LINK', `C2: native in every control frame saturates presence (base ${N.C.feats['inval:native'].base}, ${N.C.feats['inval:native'].call})`);
  ok(N.C.feats['inval:native'].rate.linked === true && N.C.reading === 'NATIVE', `C2: 4x native rate on step frames -> RATE-LINKED, NATIVE (RRlo ${N.C.feats['inval:native'].rate.RRlo}, ${N.C.reading})`);
  const N1 = scen('N1', { nativeN: 1 });
  ok(N1.C.feats['inval:native'].rate.linked === false && N1.C.reading === 'UNCLEAR', `C2: equal native rate -> no link, UNCLEAR (RR ${N1.C.feats['inval:native'].rate.RR}, ${N1.C.reading})`);
  const S = scen('S', { nativeN: 1, pageN: 4 });
  ok(S.C.feats['inval:2.DyWL8TcE.js:rate@7000'].call === 'NO-LINK' && S.C.reading === 'SCRIPT-SOURCE(2.DyWL8TcE.js:rate@7000)', `C2: the rate decides script keys too (got ${S.C.reading})`);
  const T2 = scen('T2', { nativeN: 4, thinAfter3: (i) => !(i >= 50 && i < 51) });
  ok(T2.C.feats['inval:native'].rate.s === 20 && T2.C.feats['inval:native'].rate.linked === true && T2.R.feats['inval:native'].rate.s === 16 && T2.R.feats['inval:native'].rate.linked === true, `rate floor reached exactly (C s ${T2.C.feats['inval:native'].rate.s}, R s ${T2.R.feats['inval:native'].rate.s})`);
  const T3 = scen('T3', { nativeN: 3, thinAfter3: (i) => !(i >= 50 && i < 51) });
  ok(T3.C.feats['inval:native'].rate.s === 15 && T3.C.feats['inval:native'].rate.linked === false, `below the rate floor -> no link (s ${T3.C.feats['inval:native'].rate.s})`);
  const Fp = scen('Fp', { native: true, forcedProbe: true });
  ok(Fp.C.forced === 'UPDATE' && Fp.C.forcedKeys.probe === 120, `a probe-forced Layout is not SCRIPT (got ${Fp.C.forced})`);
} finally { rmSync(root, { recursive: true, force: true }); }
if (fails.length) { console.log(`SELFTEST FAIL (${fails.length} of ${n})`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`SELFTEST PASS (${n} checks)`);

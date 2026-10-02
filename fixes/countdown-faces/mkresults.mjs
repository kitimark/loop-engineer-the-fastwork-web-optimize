// countdown-faces: compose fixes/countdown-faces/results.json from the probe outputs in out/countdown-faces/ (counts,
// call tree, frozen-frame pixels, Simulator; no timing verdicts).
//   node fixes/countdown-faces/mkresults.mjs <counts-r2.json> <pixels-r2.json> <profile-r2.json> [<sim-r2.json>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';

const D = join(WT, 'out/countdown-faces');
const J = (n) => JSON.parse(readFileSync(join(D, n), 'utf8'));
const [countsR2, pixelsR2, profileR2, simR2] = process.argv.slice(2);
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const stat = (xs) => ({ median: +med(xs).toFixed(2), min: Math.min(...xs), max: Math.max(...xs), n: xs.length });

const one = (v) => ({ styleWrites: sum(v.mutations.style), styleRecalcs: v.trace.updateLayoutTree, elementsStyled: v.trace.elementsStyled,
  faceStyleInvalidations: v.trace.faceStyleInvalidations, layouts: v.trace.layout, paints: v.trace.paint, countdownRafCallbacks: v.trace.cdRafCallbacks,
  rafCallbacks: v.trace.rafCallbacks, faceLayers: v.layers?.faceLayers, tasksMs: v.trace.taskMs, styleMs: v.trace.styleMs, countdownRafMs: v.trace.cdRafMs });

const out = {
  topic: 'countdown-faces', round: 2,
  kind: 'counts + call-tree attribution + frozen-frame pixel diffs (no timing A/B, no gain claim)',
  config: { chrome: 'mobile 430x932 DPR3 touch, CPU 6x, serve --vendors=local --https --latency 150', baselineSnapshot: null,
    note: 'counts are the result; ms values are rough (CPU 6x, exclusive hold, not a timing A/B). Round 2 build: the hidden digit keeps the original spring running on rAF and skips only the state write.' },
  servedSha256: {
    base: sha(join(resolveTree('site-pretty'), NODE)),
    poc: sha(join(WT, 'fixes/countdown-faces/overlay', NODE)),
    note: `sha256 of ${NODE} as served per arm (base: the baseline's pretty copy, the probe's --root; poc: the overlay) at the time results.json was written`,
  },
  arms: { base: 'frozen baseline', poc: 'PoC: 3 faces per digit + no state writes while the clock cannot be seen (the spring keeps running)',
    still: '(round 1) baseline with the digit spring always snapping: the floor', faces: '(round 1) PoC part (a) only' },
  fullPage3s: null, callTree6s: null, pixels: null, simulator: null, round1: null, files: {},
};

// ---- full-page counts, round 2: base vs poc, n=3, 3 s windows aligned to the second ticks ----
{
  const r = J(countsR2); out.files[countsR2] = { startedAt: r.startedAt, endedAt: r.endedAt, load1: r.load1 };
  const by = {};
  for (const x of r.results) if (x.full) for (const [pos, v] of Object.entries(x.full.positions)) {
    ((by[x.full.arm] ||= {})[pos] ||= []).push({ ...one(v), tickAligned: v.tickAligned, canBeSeen: v.census.map((c) => c.canBeSeen) });
  }
  out.fullPage3s = { runs: 3, windowsAlignedToTicks: true, perArm: {} };
  for (const [arm, P] of Object.entries(by)) {
    out.fullPage3s.perArm[arm] = {};
    for (const [pos, runs] of Object.entries(P)) {
      const keys = Object.keys(runs[0]).filter((k) => typeof runs[0][k] === 'number');
      out.fullPage3s.perArm[arm][pos] = {
        canBeSeen: runs[0].canBeSeen, allTickAligned: runs.every((x) => x.tickAligned),
        ...Object.fromEntries(keys.map((k) => [k, stat(runs.map((x) => x[k]))])),
        perCountdownFrame: { styleWrites: stat(runs.map((x) => +(x.styleWrites / Math.max(1, x.countdownRafCallbacks)).toFixed(2))),
          elementsStyledPerRecalc: stat(runs.map((x) => +(x.elementsStyled / Math.max(1, x.styleRecalcs)).toFixed(2))) },
      };
    }
  }
}
// ---- call tree, round 2: base vs poc, n=1 ----
{
  const r = J(profileR2); out.files[profileR2] = { startedAt: r.startedAt, endedAt: r.endedAt, load1: r.load1 };
  out.callTree6s = { runs: 1, note: 'n=1, CPU 6x, attribution only; busy = sampled - idle', perArm: {} };
  for (const x of r.results) if (x.full) {
    out.callTree6s.perArm[x.full.arm] = Object.fromEntries(Object.entries(x.full.positions).map(([k, w]) => [k, {
      busyMs: +(w.profile.sampledMs - w.profile.idleMs).toFixed(1), jsMs: w.profile.jsMs, countdownInclusiveMs: w.profile.countdownInclusiveMs,
      countdownShareOfBusy: w.profile.countdownShareOfBusy, styleMs: w.trace?.styleMs, elementsStyled: w.trace?.elementsStyled, styleRecalcs: w.trace?.updateLayoutTree,
      layouts: w.trace?.layout, paints: w.trace?.paint, countdownRafCallbacks: w.trace?.cdRafCallbacks, topCountdownFrames: w.profile.topCountdownFrames }]));
  }
}
// ---- pixels, round 2 ----
{
  const p = J(pixelsR2), r = p.results; out.files[pixelsR2] = { startedAt: p.startedAt, endedAt: p.endedAt };
  const cat = (k) => (k.startsWith('resume') ? (k.includes('two target changes') ? 'resume, two changes out of sight' : 'resume') : 'roll') + (k.includes('@120Hz') ? ' @120Hz' : ' @60Hz');
  out.pixels = { harness: 'frozen frames: countdown clocks virtual, its rAF frames stepped at jittered stamps G + k*FR + J(k), J in [-1, 1] ms on a 0.1 ms grid; ticks at grid + FR/3; A B A order', comparisons: {} };
  for (const k of Object.keys(r)) if (Array.isArray(r[k]) && r[k][0]?.key) {
    const v = r[k];
    if (k.startsWith('firstVisible')) { out.pixels.comparisons[k] = { runs: v.length, faceStateDiffer: v.filter((x) => !x.same).length, missing: v.filter((x) => !x.a || !x.b).length, example: v[0] }; continue; }
    const byCat = {};
    for (const x of v) { const c = (byCat[cat(x.key)] ||= { shots: 0, pixelDiffer: 0, faceStateDiffer: 0 }); c.shots++; c.pixelDiffer += x.identicalBytes ? 0 : 1; c.faceStateDiffer += x.sameFaces ? 0 : 1; }
    out.pixels.comparisons[k] = { shots: v.length, pixelDiffer: v.filter((x) => !x.identicalBytes).length, faceStateDiffer: v.filter((x) => !x.sameFaces).length, byCategory: byCat };
  }
  out.pixels.blankShots = r.blankShots.length; out.pixels.errors = r.errors; out.pixels.clip = r.clip;
  out.pixels.realFrameStamps = { note: 'real Chrome rAF stamps in the same pages (no throttling, display off): not a regular grid', perArm: r.stamps };
}
// ---- Simulator ----
if (simR2 && existsSync(join(D, simR2))) { out.simulator = J(simR2); out.files[simR2] = 'simulator (round 2 build)'; }
// ---- round 1 (kept for the isolated page and the still/faces arms; labelled) ----
{
  const iso = J('counts-2026-10-02T19-13-31-387Z.json'); out.files['counts-2026-10-02T19-13-31-387Z.json'] = { startedAt: iso.startedAt, note: 'round 1 build; exclusive hold' };
  const isoRow = (v) => ({ ...one(v), faceLayerRepaints: v.layers.facePaints, layersTotal: v.layers.total, textChanges: sum(v.mutations.text),
    perCountdownFrame: { styleWrites: +(sum(v.mutations.style) / Math.max(1, v.trace.cdRafCallbacks)).toFixed(2), elementsStyled: +(v.trace.elementsStyled / Math.max(1, v.trace.cdRafCallbacks)).toFixed(2),
      layouts: +(v.trace.layout / Math.max(1, v.trace.cdRafCallbacks)).toFixed(4), paints: +(v.trace.paint / Math.max(1, v.trace.cdRafCallbacks)).toFixed(4) } });
  const fullR1 = {};
  for (const [f, note] of [['counts-2026-10-02T15-43-00-533Z.json', 'base + still; SHARED-lane hold at load1 4.2-7.1: roughMs VOID'], ['counts-2026-10-02T15-49-10-207Z.json', 'faces arm from an EARLIER build (countdown range end 4038, not 4055)']]) {
    const r = J(f); out.files[f] = { startedAt: r.startedAt, note };
    for (const x of r.results) if (x.full && x.full.arm !== 'poc') fullR1[x.full.arm] = { note, positions: Object.fromEntries(Object.entries(x.full.positions).map(([k, v]) => [k, { styleWrites: sum(v.mutations.style), elementsStyled: v.trace?.elementsStyled, styleRecalcs: v.trace?.updateLayoutTree, countdownRafCallbacks: v.trace?.cdRafCallbacks, faceLayers: v.layers?.faceLayers }])) };
  }
  out.round1 = {
    note: 'round 1, n=1, not tick-aligned. The isolated page shows a visible, rolling clock: the round-2 PoC runs the same visible path as round 1 (state write every frame), so these still describe it.',
    isolatedPage6s: Object.fromEntries(iso.results.map((x) => [x.iso.arm, isoRow(x.iso)])),
    fullPage3s: fullR1,
  };
}
out.config.baselineSnapshot = JSON.parse(readFileSync(join(WT, 'baseline.json'), 'utf8')).snapshot ?? null;
writeFileSync(join(WT, 'fixes/countdown-faces/results.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ full: Object.fromEntries(Object.entries(out.fullPage3s.perArm).map(([a, P]) => [a, Object.fromEntries(Object.entries(P).map(([k, v]) => [k, [v.styleWrites.median, v.styleRecalcs.median, v.elementsStyled.median, v.layouts.median, v.paints.median, v.countdownRafCallbacks.median, v.rafCallbacks.median, v.tasksMs.median, v.styleMs.median, v.allTickAligned]]))])), pixels: out.pixels.comparisons, sha: out.servedSha256 }, null, 0));

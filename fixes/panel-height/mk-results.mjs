#!/usr/bin/env node
// panel-height: writes fixes/panel-height/results.json from the gitignored raw outputs (counts and pixels only, no
// timing): Chrome counts (ph-chrome.mjs, D and Dfix), the Chrome pixel check (em-p1-px.mjs shots scored by px3.mjs),
// and the Simulator run(s) (ph-sim.mjs ph.json) when given.
//   node fixes/panel-height/mk-results.mjs --chrome <D.json>,<Dfix.json> [--px "<px3 output file>"] [--sim <ph.json>[,<ph.json>]]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const out = {
  topic: 'panel-height',
  kind: 'counts, geometry and pixels only (no timing; memory defer-timing-focus-call-tree)',
  base: { name: 'A = v9-final + F1/U2 + I-219 + P1 + P1b (a), fix-end-morph-p1 snapshot A1', js: 'ed44af454a92', css: 'cfb8b8c5b019' },
  options: {
    svh: { delta: 'fixes/panel-height/delta-svh.diff', deltaSha: '0d7142505704', css: '75c30c18d971', tryit: 'fixes/panel-height-svh/patch.diff' },
    dvh: { delta: 'fixes/panel-height/delta-dvh.diff', deltaSha: '030ff98f6239', css: '0546615f27ea', tryit: 'fixes/panel-height-dvh/patch.diff' },
  },
  baselineSnapshot: (() => { try { return J(join(WT, "baseline.json")).snapshot || null; } catch { return null; } })(),
  measurementCodeChanged: false,
  chrome: null, chromePixels: null, simulator: null,
};
const ch = arg('--chrome');
if (ch) {
  const [d, f] = ch.split(',').map(J);
  const ph = (r) => Object.fromEntries(Object.entries(r.arms[0].phases).map(([k, p]) => [k, { mStart: p.before.m, mEnd: p.after.m, layouts: p.layouts, dirtyObjects: p.trace.dirtyObjects, styleRecalcs: p.styles, elementsRestyled: p.trace.styleElements, paints: p.trace.paints, roCallbacks: p.ro, roByTarget: p.roEntries, navStyleWrites: p.mo, clipChanges: p.clip, navHeights: p.navHeights }]));
  out.chrome = {
    tool: 'fixes/panel-height/ph-chrome.mjs', steps: '16 viewport-height steps per phase, 775 -> 815 -> 775 (8 each way), one per 2 rAFs',
    units: d.arms[0].units775, unitsAt815: d.arms[0].units815,
    note: 'Chrome emulation resolves vh = svh = lvh = dvh = the viewport, so A, S and D behave alike in Chrome; D models dvh on iOS (panel follows each step), Dfix (panel pinned to 815 - 24 px) models vh/svh on iOS',
    load1: { D: [d.load1, d.load1End], Dfix: [f.load1, f.load1End] },
    D: ph(d), Dfix: ph(f), raw: [basename(ch.split(',')[0]), basename(ch.split(',')[1])],
  };
}
const px = arg('--px');
if (px && existsSync(px)) out.chromePixels = { tool: 'fixes/end-morph-p1/gates/em-p1-px.mjs (A, V, A2 loads; the V2 load was cut at the 120 s cap) scored by fixes/panel-height/px3.mjs', viewport: '430x775 DPR 3', pair: 'A vs D', lines: readFileSync(px, 'utf8').trim().split('\n') };
const sim = arg('--sim');
if (sim) out.simulator = sim.split(',').map((f) => { const r = J(f); return { file: f.replace(WT + '/', ''), label: r.label, startedAt: r.startedAt, arms: r.arms.map((a) => ({ arm: a.arm, served: a.served, safari: a.ua, error: a.error || null, geo: a.geo, phases: Object.fromEntries(Object.entries(a.phases || {}).map(([k, p]) => [k, { tl: p.tl, topObservers: p.topObservers, log: p.log }])), probe: a.probe ? Object.fromEntries(Object.entries(a.probe.windows).map(([k, w]) => [k, { frames: w.frames, ih: w.ih, dvh: w.dvh, svh: w.svh, lvh: w.lvh, vh: w.vh, roCallbacks: w.roCallbacks, roDvh: w.roDvh, dvhEqualsIh: w.dvhEqualsIh }])) : null })) }; });
writeFileSync(join(WT, 'fixes/panel-height/results.json'), JSON.stringify(out, null, 1) + '\n');
console.log('WROTE fixes/panel-height/results.json');

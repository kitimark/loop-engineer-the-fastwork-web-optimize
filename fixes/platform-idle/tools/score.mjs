// platform-idle (P-077) scorer. Reads the pre-registered records (idlecount.mjs, Chrome; simcount.mjs, Simulator) and prints
// the outcome. Rules are in fixes/platform-idle/README.md "D card (P-077)"; this file is their executable form.
// usage: node fixes/platform-idle/tools/score.mjs <chrome-records.json> <sim-records.json> [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
const [cPath, sPath] = process.argv.slice(2);
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
// served hashes fixed before data (sha256, first 12 hex, of the overlay files at the card commit)
const EXPECT = {
  C: { js: '7bf7c4657d21', css: 'f523598b2a24' },
  V: { js: 'de29ff8aa622', css: 'd67d599ab034' },
  B: { js: '4606120cf392', css: '27776f3d4138' },
};
const ENGINES = {
  chrome: { file: cPath, stops: { primary: 5346, secondary: 4660 }, key: (w) => w.y, counts: ['styleRecalcs', 'prePaints', 'paints'], guard: ['layouts', 'layerizes'], report: ['functionCalls', 'beginFrames', 'drawFrames'] },
  sim: { file: sPath, stops: { primary: 'bottom', secondary: 'y4660' }, key: (w) => w.stop, counts: ['styleRecalcs', 'layouts', 'paints'], guard: ['renderingFrames', 'composites'], report: ['functionCalls', 'timerFires', 'rafs'] },
};
const FLOOR = 2; // counts per 20 s window (the ts-costcard 2-count floor)
function voidReason(l) {
  if (l.void) return l.void;
  const e = EXPECT[l.arm]; if (!e) return 'unknown arm';
  if (!l.served || l.served.js !== e.js || l.served.css !== e.css) return `served ${l.served && l.served.js}/${l.served && l.served.css} != ${e.js}/${e.css}`;
  for (const w of l.windows) {
    if (!w.ms || (l.engine === 'sim' && !w.records)) return `empty window ${w.y ?? w.stop}`;
    const k = w.check || {};
    if (l.arm === 'V') {
      if (k.smilAnimate !== 0) return 'V still has SMIL <animate>';
      if (k.dashInView > 0 && (k.glintActive !== 2 || !k.running.some((n) => /pi-glint/.test(n)))) return `V glint not running at ${w.y ?? w.stop}`;
      if (k.sweepTitlesInView > 0 && k.running.filter((n) => /pi-sweep-band/.test(n)).length < k.sweepTitlesInView) return `V sweep band not running at ${w.y ?? w.stop}`;
    }
    if (l.arm === 'C') {
      if (!(k.smilAnimate > 0)) return 'C has no SMIL glint';
      if (k.sweepTitlesInView > 0 && !k.running.some((n) => /sweep/.test(n))) return `C sweep not running at ${w.y ?? w.stop}`;
    }
  }
  return null;
}
const out = { engines: {}, outcome: null };
for (const [eng, E] of Object.entries(ENGINES)) {
  const loads = JSON.parse(readFileSync(E.file, 'utf8')).loads.filter((l) => l.engine === eng);
  const valid = { C: [], V: [], B: [] }, voids = [];
  for (const l of loads) { const r = voidReason(l); if (r) voids.push(`${l.arm}${l.rep}: ${r}`); else (valid[l.arm] ||= []).push(l); }
  const R = (out.engines[eng] = { loads: Object.fromEntries(Object.entries(valid).map(([a, v]) => [a, v.length])), voids, stops: {} });
  if (valid.C.length < 2 || valid.V.length < 2) { R.verdict = 'VOID'; continue; }
  let primaryLower = true, noWorse = true;
  for (const [role, stop] of Object.entries(E.stops)) {
    const S = (R.stops[role] = { stop, counts: {} });
    for (const k of [...E.counts, ...E.guard, ...E.report]) {
      const per = (a) => valid[a].map((l) => l.windows.find((w) => E.key(w) === stop)?.[k]).filter((v) => v != null);
      const c = per('C'), v = per('V'), b = per('B');
      const cMin = Math.min(...c), vMax = Math.max(...v);
      const judged = E.counts.includes(k), guarded = judged || E.guard.includes(k);
      const tol = Math.max(FLOOR, Math.ceil(0.1 * cMin));
      const lower = vMax < cMin - tol;
      const nw = vMax <= cMin + tol;
      // per event: the 20 s window holds 5 sweep cycles and 4 glint cycles
      S.counts[k] = { judged, guarded, C: c, V: v, B: b, perSweepCycle: { C: c.map((x) => x / 5), V: v.map((x) => x / 5) }, perGlintCycle: { C: c.map((x) => x / 4), V: v.map((x) => x / 4) }, lower, noWorse: nw };
      if (judged && role === 'primary' && !lower) primaryLower = false;
      if (guarded && !nw) noWorse = false;
    }
  }
  R.primaryLower = primaryLower; R.noWorse = noWorse;
  R.verdict = primaryLower && noWorse ? 'PASS' : !noWorse ? 'WORSE' : 'NOT-LOWER';
}
const c = out.engines.chrome.verdict, s = out.engines.sim.verdict;
out.outcome = c === 'VOID' || s === 'VOID' ? 'VOID: re-run the void engine (new loads, same order rule)'
  : c === 'PASS' && s === 'PASS' ? 'PASS: less-work gate met in both engines; next the short phone no-worse check (lead) and the pixel proposal (user)'
  : c === 'PASS' && s === 'NOT-LOWER' ? 'CHROME-ONLY: Chrome lower, Simulator no worse but not lower; back to the lead (land on Chrome benefit, or drop the WebKit-facing claim)'
  : 'FAIL: ' + (c === 'WORSE' || s === 'WORSE' ? 'more work somewhere' : 'Chrome not lower') + '; do not land, redesign or drop';
console.log(JSON.stringify(out, null, 1));
console.log('OUTCOME', out.outcome);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));

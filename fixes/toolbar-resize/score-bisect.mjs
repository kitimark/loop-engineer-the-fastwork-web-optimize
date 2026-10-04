#!/usr/bin/env node
// toolbar-resize P-109 scorer: Simulator subtree bisect (mechanism, attribution; Simulator times are compared only
// within one session against interleaved C runs, never as a gain).
//   node fixes/toolbar-resize/score-bisect.mjs <folder> <run> ... [--json out.json]
// <folder> holds g-<run>.json (sim.mjs gesture --out) + tl-<run>.json (--timeline). <run> = <arm>-H<n>, arm C = v7.
// FROZEN filters (P-109):
// - frames: the recorded segment with the most frames; a frame is [t, dt, y, innerHeight, ...] in page ms.
// - toolbar-moving frame: innerHeight strictly between the run's min and max innerHeight (the two toolbar states);
//   hero zone: y < 3250 (same split as P-106).
// - a Layout belongs to a frame when its Timeline start lies in (t - dt, t]; Timeline s -> page ms: s*1000 - tl.offsetMs.
// - per run: n moving hero frames, medianLargest (ms, largest Layout per frame, 0 when none), inStyle (frames with a
//   Layout >= 0.5 ms nested in RecalculateStyles), counted when n >= 8.
// - ratio = arm medianLargest / mean medianLargest of the nearest C run before and after it.
//   LOCATES ratio <= 0.30; PARTIAL <= 0.70; NONE otherwise; INSUFFICIENT when the arm or no C run counts.
// - replication gate (else the block says NO-REPLICA and no arm is judged): every C run counted and inStyle >= 0.5 n.
// - GEOMETRY (ops C1): an arm whose final page height (segment docH1) differs from any neighbouring C run's by > 2 px
//   is called GEOMETRY and not judged.
// - VOID: C medianLargest drifts > 30 % from the first to the last C run.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
const pos = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
const [dir, ...names] = pos;
if (!dir || !names.length) { console.error('usage: score-bisect.mjs <folder> <run> ... [--json out.json]'); process.exit(1); }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
function score(name) {
  const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8'));
  const seg = [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  const lays = [];
  const walk = (r, inStyle) => { if (r.type === 'Layout' && r.endTime != null) lays.push([r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000, inStyle]);
    (r.children || []).forEach((c) => walk(c, inStyle || r.type === 'RecalculateStyles')); };
  (tl.recs || []).forEach((r) => walk(r, false));
  const ihs = seg.frames.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
  const big = []; let inStyle = 0;
  for (const [t, dt, y, ih] of seg.frames) {
    if (!(ih > lo && ih < hi) || y >= 3250) continue;
    const inF = lays.filter((l) => l[0] > t - dt && l[0] <= t);
    big.push(inF.reduce((m, l) => Math.max(m, l[1]), 0));
    if (inF.some((l) => l[2] && l[1] >= 0.5)) inStyle++;
  }
  const arm = name.replace(/-H\d+$/, '');
  return { name, arm, ih: [lo, hi], n: big.length, medianLargest: r3(median(big)), inStyle, counted: big.length >= 8, docH: [seg.docH, seg.docH1] };
}
const runs = names.map(score);
const C = runs.filter((r) => r.arm === 'C');
const replica = C.length > 0 && C.every((r) => r.counted && r.inStyle >= 0.5 * r.n);
const drift = C.length >= 2 && C[0].medianLargest ? r3(Math.abs(C[C.length - 1].medianLargest - C[0].medianLargest) / C[0].medianLargest) : null;
const verdicts = {};
runs.forEach((r, i) => {
  if (r.arm === 'C') return;
  const nb = [];
  for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C') { nb.push(runs[j]); break; }
  for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C') { nb.push(runs[j]); break; }
  const cs = nb.filter((c) => c.counted), cMean = cs.length ? cs.reduce((a, c) => a + c.medianLargest, 0) / cs.length : null;
  const ratio = r.counted && cMean ? r3(r.medianLargest / cMean) : null;
  const geom = nb.some((c) => Math.abs((c.docH[1] ?? c.docH[0]) - (r.docH[1] ?? r.docH[0])) > 2);
  const call = !replica ? 'NO-REPLICA' : geom ? 'GEOMETRY' : ratio == null ? 'INSUFFICIENT' : ratio <= 0.3 ? 'LOCATES' : ratio <= 0.7 ? 'PARTIAL' : 'NONE';
  verdicts[r.name] = { ratio, cMean: r3(cMean), neighbours: nb.map((c) => c.name), call };
});
const out = { scorer: 'fixes/toolbar-resize/score-bisect.mjs', runs, replica, drift, void: drift != null && drift > 0.3, verdicts };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
for (const r of runs) console.log(`${r.name.padEnd(10)} ih ${r.ih.join('-')} hero moving ${r.n} medL ${r.medianLargest} ms inStyle ${r.inStyle} docH ${r.docH.join('->')}${r.counted ? '' : ' thin'}${verdicts[r.name] ? ` -> ratio ${verdicts[r.name].ratio} ${verdicts[r.name].call}` : ''}`);
console.log(`REPLICA ${replica} DRIFT ${drift} VOID ${out.void}`);

// P-091 post-hoc reader (fix-nav-morph; written AFTER the block's data, exploratory: not the ticketed scorer, decides nothing).
// Why: in the 10-04 Serious Timelines much of each rendering update is recorded outside any RenderingFrame (top-level
// RecalculateStyles + Layout, FireAnimationFrame, ObserverCallback), and the RenderingFrame record sits nested inside a
// Composite record. The frozen scorer (edge-score.mjs) matches one RenderingFrame per edge frame, so it reads those frames
// as "unmatched" / "outside". This reader drops the matching: it partitions the frame's own interval (t_{k-1}, t_k] on the
// page clock (the time between the previous rAF stamp and this one) by the deepest record covering each 0.1 ms, with the
// scorer's bucket names:
//   style  = inside a RecalculateStyles (nested Layout included);   layout = a Layout not inside a RecalculateStyles;
//   paint  = Paint;   script = FunctionCall, FireAnimationFrame, ObserverCallback, EventDispatch, TimerFire;
//   compositeRecord = a Composite record's own time (not covered by a deeper record above);
//   otherRecord = any other record (RenderingFrame's own time included);   none = no record covers the instant.
// owner = the largest bucket if >= 50 % of the interval, else "split".
//   node fixes/nav-morph/edge-span.mjs <score.json> --dir <folder of the run files> [--out <file.json>]
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2), score = JSON.parse(readFileSync(args[0], 'utf8'));
const oi = args.indexOf('--out'), outFile = oi >= 0 ? args[oi + 1] : null;
const di = args.indexOf('--dir'), dir = di >= 0 ? args[di + 1].replace(/\/$/, '') + '/' : '';
const at = (f) => (f.startsWith('/') ? f : dir + f);
const SCRIPT = new Set(['FunctionCall', 'FireAnimationFrame', 'ObserverCallback', 'EventDispatch', 'TimerFire']);
const R1 = (x) => Math.round(x * 10) / 10;
const out = [];
for (const run of score.runs) {
  if (run.void) { out.push({ arm: run.arm, frames: run.frames, void: run.void }); continue; }
  const fj = JSON.parse(readFileSync(at(run.frames), 'utf8'));
  const F = fj.run ? fj.run.segments[score.seg || 0].frames : fj.frames;
  const tl = JSON.parse(readFileSync(at(run.timeline), 'utf8')), T = Array.isArray(tl) ? tl[score.seg || 0] : tl;
  const pt = (s) => (s - T.syncTL) * 1000 + T.syncT;
  // flatten: [start, end, depth, bucket]
  const iv = [];
  const walk = (r, depth, inStyle) => {
    const s = pt(r.startTime), e = r.endTime != null ? pt(r.endTime) : s;
    const st = inStyle || r.type === 'RecalculateStyles';
    const b = st ? 'style' : r.type === 'Layout' ? 'layout' : r.type === 'Paint' ? 'paint' : SCRIPT.has(r.type) ? 'script' : r.type === 'Composite' ? 'compositeRecord' : 'otherRecord';
    if (e > s) iv.push([s, e, depth, b]);
    for (const c of r.children || []) walk(c, depth + 1, st);
  };
  for (const r of T.recs) walk(r, 0, false);
  const k0 = F.findIndex((f) => f[0] >= run.crossing.t);
  const rows = [];
  for (const ed of run.edge.filter((x) => x.dt > 34)) {
    const k = k0 + ed.rel, lo = F[k - 1][0], hi = F[k][0];
    const near = iv.filter(([s, e]) => e > lo && s < hi);
    const b = { style: 0, layout: 0, paint: 0, compositeRecord: 0, script: 0, otherRecord: 0, none: 0 };
    for (let t = lo + 0.05; t < hi; t += 0.1) {
      let best = null; for (const x of near) if (x[0] <= t && t < x[1] && (!best || x[2] > best[2])) best = x;
      b[best ? best[3] : 'none'] += 0.1;
    }
    const top = Object.entries(b).sort((x, y) => y[1] - x[1])[0];
    rows.push({ rel: ed.rel, dt: ed.dt, scorer: ed.rf ? ed.rf.owner : 'unmatched', owner: top[1] >= 0.5 * (hi - lo) ? top[0] : 'split', ms: Object.fromEntries(Object.entries(b).map(([q, v]) => [q, R1(v)])) });
  }
  out.push({ arm: run.arm, frames: run.frames.split('/').pop(), edge: rows });
  console.log(`${run.arm} ${run.frames.split('/').pop()}: ${rows.length} edge frame(s)` + rows.map((r) => ` | ${r.dt}ms@${r.rel >= 0 ? '+' : ''}${r.rel} ${r.owner} (scorer ${r.scorer}) ${JSON.stringify(r.ms)}`).join(''));
}
const tally = {};
for (const r of out) for (const e of r.edge || []) { const key = `${r.arm}:${e.owner}`; tally[key] = (tally[key] || 0) + 1; }
console.log(`edge frames by owner (post-hoc): ${JSON.stringify(tally)}`);
if (outFile) writeFileSync(outFile, JSON.stringify({ tool: 'edge-span.mjs (post-hoc, exploratory)', source: args[0], runs: out, tally }, null, 1) + '\n');

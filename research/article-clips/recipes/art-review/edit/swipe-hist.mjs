// edit-article-p1 (read-only): recompute the closing histogram from the herocatch v2 replays, window as
// fixes/worst-cases-capture/wc-read.mjs case herocatch: frames with t in (mark finger, mark end]. Bins (lo, hi].
import fs from 'node:fs';
const DIR = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs';
const RUNS = { orig: ['20261010T110844Z-ar-herocatch-orig', '20261010T111421Z-ar-herocatch-orig'], g0m: ['20261010T111040Z-ar-herocatch-g0m', '20261010T111222Z-ar-herocatch-g0m'] };
const BINS = [[0, 20], [20, 34], [34, 50], [50, 100], [100, 200], [200, Infinity]];
const mark = (seg, n) => (seg.marks || []).find((m) => m[1] === n)?.[0];
const out = {};
for (const [arm, ids] of Object.entries(RUNS)) {
  const pooled = { n: 0, ms: 0, span: 0, bins: BINS.map(() => 0), gt34: 0, gt50: 0, gt100: 0, worst: 0, runs: [] };
  for (const id of ids) {
    const rec = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, 'utf8'));
    const seg = (rec.run?.segments || []).find((s) => (s.marks || []).length) || rec.run.segments[0];
    const a = mark(seg, 'finger'), b = mark(seg, 'end') ?? seg.frames.at(-1)[0];
    const fr = seg.frames.filter((f) => f[0] > a && f[0] <= b);
    const bins = BINS.map(([lo, hi]) => fr.filter((f) => f[1] > lo && f[1] <= hi).length);
    const r = { id, n: fr.length, windowS: +((b - a) / 1000).toFixed(2), sumMs: Math.round(fr.reduce((s, f) => s + f[1], 0)), bins,
      gt34: fr.filter((f) => f[1] > 34).length, gt50: fr.filter((f) => f[1] > 50).length, gt100: fr.filter((f) => f[1] > 100).length,
      worst: Math.round(Math.max(...fr.map((f) => f[1]))), maxY: Math.max(...fr.map((f) => f[2])), heat: rec.meta?.profile ? `${rec.meta.profile.start?.state} ${rec.meta.profile.start?.battC} -> ${rec.meta.profile.end?.state} ${rec.meta.profile.end?.battC}` : null };
    pooled.runs.push(r); pooled.n += r.n; pooled.ms += r.sumMs; pooled.span += (b - a);
    r.bins.forEach((c, i) => (pooled.bins[i] += c)); pooled.gt34 += r.gt34; pooled.gt50 += r.gt50; pooled.gt100 += r.gt100; pooled.worst = Math.max(pooled.worst, r.worst);
    console.log(arm, id.slice(0, 16), 'n', r.n, 'win', r.windowS, 's', 'bins', bins.join('/'), '>34', r.gt34, '>50', r.gt50, '>100', r.gt100, 'worst', r.worst, 'maxY', r.maxY, 'heat', r.heat);
  }
  pooled.fps = +(pooled.n / (pooled.span / 1000)).toFixed(1);
  pooled.share = pooled.bins.map((c) => +(100 * c / pooled.n).toFixed(2));
  console.log(arm, 'POOLED n', pooled.n, 'span', (pooled.span / 1000).toFixed(1), 's fps', pooled.fps, 'bins', pooled.bins.join('/'), 'share', pooled.share.join('/'), '>34', pooled.gt34, (100 * pooled.gt34 / pooled.n).toFixed(2) + '%', '1 in', (pooled.n / pooled.gt34).toFixed(1), '>50', pooled.gt50, (100 * pooled.gt50 / pooled.n).toFixed(2) + '%', '>100', pooled.gt100, 'worst', pooled.worst);
  out[arm] = pooled;
}
fs.writeFileSync(new URL('./swipe-hist.json', import.meta.url), JSON.stringify(out, null, 1));

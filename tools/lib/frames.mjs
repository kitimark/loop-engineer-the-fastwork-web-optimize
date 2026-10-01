// Long-frame clusters by scroll position (experiment E5, research/architecture/measurement-review.md): on
// the iPhone the long frames of a scripted scroll land at the same scrollY in every run; this groups the
// frames longer than `minMs` of many runs into scrollY buckets and reports the positions where a long
// frame occurs in at least `minShare` of the runs. Input: per-frame logs [t, dt, scrollY] from
// verify.mjs --frame-log (verify.json: results[].frameLog.<phase>) or from tools/iphone.mjs scroll
// (out/iphone/*.json: frames + marks.<phase>). CLI: tools/frames.mjs.
import { basename } from 'node:path';

/** Runs [{label, run, source, frames: [[t, dt, y], ...]}] from one parsed JSON file. */
export function runsFromJson(json, { file = '', phase = 'scroll' } = {}) {
  if (Array.isArray(json?.results)) {
    return json.results.filter((r) => !r.diff && r.frameLog?.[phase]).map((r) => ({ label: `${r.label}${r.viewport && r.viewport !== 'mobile' ? ' ' + r.viewport : ''}`, run: r.run, source: file, frames: r.frameLog[phase] }));
  }
  if (Array.isArray(json?.frames)) {
    const m = json.marks?.[phase];
    const frames = m ? json.frames.filter(([t]) => t >= m[0] && t <= m[1]) : json.frames;
    return [{ label: json.meta?.label || basename(file).replace(/-\d+\.json$/, '').replace(/\.json$/, ''), run: 0, source: file, frames }];
  }
  return [];
}

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Clusters per label. A run "hits" bucket b when one of its frames > minMs ends at a scrollY in b; a
 * bucket is stable when >= minShare of the runs hit it or a neighbour (b-1..b+1: positions jitter by a
 * few px between runs). Adjacent stable buckets merge into a cluster, trimmed to buckets with hits.
 * Returns [{label, runs, clusters: [{y0, y1, share, runsHit, framesPerRun, msPerRun}]}].
 */
export function clusters(runs, { minMs = 34, bucketPx = 50, minShare = 0.6 } = {}) {
  const byLabel = new Map();
  for (const r of runs) (byLabel.get(r.label) || byLabel.set(r.label, []).get(r.label)).push(r);
  const out = [];
  for (const [label, rs] of byLabel) {
    const n = rs.length;
    const hits = rs.map((r) => {
      const m = new Map(); // bucket -> [frames, ms]
      for (const [, dt, y] of r.frames) if (dt > minMs) { const b = Math.floor(y / bucketPx); const v = m.get(b) || [0, 0]; v[0]++; v[1] += dt; m.set(b, v); }
      return m;
    });
    const all = [...new Set(hits.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
    const near = (b) => hits.filter((m) => m.has(b - 1) || m.has(b) || m.has(b + 1)).length;
    const stable = new Set();
    for (const b of all) for (const c of [b - 1, b, b + 1]) if (near(c) / n >= minShare) stable.add(c);
    const sorted = [...stable].sort((a, b) => a - b);
    const groups = [];
    for (const b of sorted) { const g = groups[groups.length - 1]; if (g && b === g[g.length - 1] + 1) g.push(b); else groups.push([b]); }
    const cl = [];
    for (let g of groups) {
      g = g.filter((b) => hits.some((m) => m.has(b)));
      if (!g.length) continue;
      const lo = g[0], hi = g[g.length - 1];
      const inG = (m) => [...m.entries()].filter(([b]) => b >= lo && b <= hi);
      const runsHit = hits.filter((m) => inG(m).length).length;
      if (runsHit / n < minShare) continue;
      const frames = hits.reduce((x, m) => x + inG(m).reduce((y, [, v]) => y + v[0], 0), 0);
      const ms = hits.reduce((x, m) => x + inG(m).reduce((y, [, v]) => y + v[1], 0), 0);
      cl.push({ y0: lo * bucketPx, y1: (hi + 1) * bucketPx, share: r1(runsHit / n), runsHit, framesPerRun: r1(frames / n), msPerRun: Math.round(ms / n) });
    }
    out.push({ label, runs: n, clusters: cl });
  }
  return out;
}

/** Clusters of side a and side b that overlap (by scrollY range), and the ones found on one side only. */
export function compare(a, b) {
  const ov = (x, y) => x.y0 < y.y1 && y.y0 < x.y1;
  return {
    common: a.clusters.filter((x) => b.clusters.some((y) => ov(x, y))).map((x) => ({ a: x, b: b.clusters.filter((y) => ov(x, y)) })),
    onlyA: a.clusters.filter((x) => !b.clusters.some((y) => ov(x, y))),
    onlyB: b.clusters.filter((y) => !a.clusters.some((x) => ov(x, y))),
  };
}

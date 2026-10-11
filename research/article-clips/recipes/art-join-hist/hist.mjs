// art-join-hist: frame-time bins for the Day 9 Join-fade moment from the REAL iPhone end-of-page take (-ar-endoc,
// 10 Oct, A V V A, tool-set Serious): frames in the open phases (mark O1 -> C1 and O2 -> C2), pooled per arm.
import fs from 'node:fs';
const DIR = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs';
const RUNS = { orig: ['20261010T125906Z-ar-endoc-orig', '20261010T130503Z-ar-endoc-orig'], g0m: ['20261010T130126Z-ar-endoc-g0m', '20261010T130321Z-ar-endoc-g0m'] };
const BINS = [[0, 20], [20, 34], [34, 50], [50, 100], [100, 200], [200, Infinity]];
const out = {};
for (const [arm, ids] of Object.entries(RUNS)) {
  const P = { n: 0, span: 0, bins: BINS.map(() => 0), gt34: 0, gt50: 0, worst: 0, runs: [] };
  for (const id of ids) {
    const rec = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, 'utf8'));
    const segs = rec.run.segments; const fr0 = segs.flatMap((s) => s.frames); const mk = {};
    segs.forEach((s) => (s.marks || []).forEach((m) => { mk[m[1]] = m[0]; }));
    const w = [['O1-open-fast-60px-50ms', 'C1-close-fast-120px-60ms'], ['O2-open-fast-60px-50ms', 'C2-close-fast-120px-60ms']];
    const fr = w.flatMap(([a, b]) => fr0.filter((f) => f[0] > mk[a] && f[0] <= mk[b]));
    const span = w.reduce((s, [a, b]) => s + mk[b] - mk[a], 0);
    const r = { id, n: fr.length, spanS: +(span / 1000).toFixed(2), bins: BINS.map(([lo, hi]) => fr.filter((f) => f[1] > lo && f[1] <= hi).length),
      gt34: fr.filter((f) => f[1] > 34).length, gt50: fr.filter((f) => f[1] > 50).length, worst: Math.round(Math.max(...fr.map((f) => f[1]))) };
    P.runs.push(r); P.n += r.n; P.span += span; r.bins.forEach((c, i) => { P.bins[i] += c; }); P.gt34 += r.gt34; P.gt50 += r.gt50; P.worst = Math.max(P.worst, r.worst);
  }
  P.spanS = +(P.span / 1000).toFixed(2); out[arm] = P;
}
fs.writeFileSync('hist.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, 'n', v.n, 'span', v.spanS, 'bins', v.bins.join(' '), '>34', v.gt34, '>50', v.gt50, 'worst', v.worst, v.runs.map((r) => `${r.id.slice(9, 16)} ${r.n}fr ${r.gt34}/${r.gt50} max ${r.worst}`).join(' | '));

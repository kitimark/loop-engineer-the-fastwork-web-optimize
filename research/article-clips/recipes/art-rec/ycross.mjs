// art-rec: movie time (s into the .mov) at which a wc run's rAF log first crosses given scrollY values.
// Mapping as wc-offsets.mjs (cap-worst): mark page ms -> offsets.json movS. Numbers only.
import { readFileSync } from 'node:fs';
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/';
const off = JSON.parse(readFileSync(R + 'offsets.json', 'utf8'));
const [run, ...ys] = process.argv.slice(2);
const r = JSON.parse(readFileSync(R + 'runs/' + run + '.json', 'utf8'));
const o = off.find((x) => x.run === run);
const s = r.run.segments[0];
const mk = Object.fromEntries(s.marks.map(([t, n]) => [n, t]));
const m0 = o.marks[0]; const toMov = (t) => m0.movS + (t - mk[m0.name]) / 1000;
for (const Y of ys.map(Number)) {
  const f = s.frames.find((x) => x[2] >= Y);
  console.log(run, 'y>=' + Y, f ? `t ${Math.round(f[0])} mov ${toMov(f[0]).toFixed(3)} y ${Math.round(f[2])}` : 'never');
}
// longest frames with y in [1000,1700] and [1850,2100]
for (const [a, b] of [[1000, 1700], [1850, 2100]]) {
  const ff = s.frames.filter((x) => x[2] >= a && x[2] <= b).sort((p, q) => q[1] - p[1]).slice(0, 4);
  console.log(` y ${a}-${b} longest:`, ff.map((x) => `${Math.round(x[1])}ms@mov ${toMov(x[0]).toFixed(2)} y${Math.round(x[2])}`).join('; '));
}

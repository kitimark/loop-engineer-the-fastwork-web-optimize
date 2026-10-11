// Day 5: longest rAF frame during the slow drags of a wc-hero run, which drag it falls in, and drag starts (page ms
// relative to the "fade" mark), from cap-worst's gesture record (rAF frames [t, y, ...]). Numbers only.
import { readFileSync } from 'node:fs';
const R = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs/';
for (const run of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(R + run + '.json', 'utf8'));
  const s = r.run.segments[0];
  const mk = Object.fromEntries(s.marks.map(([t, n]) => [n, t]));
  const f = s.frames;
  if (run === process.argv[2]) console.log('frame sample', JSON.stringify(f.slice(0, 2)), 'strokes sample', JSON.stringify(r.run.strokes?.slice?.(0, 3)).slice(0, 400));
  const ff = f.filter((x) => x[0] >= mk.fade && x[0] <= mk.end);
  // drag starts: first y change after each idle gap
  const starts = []; let still = 0;
  for (let i = 1; i < ff.length; i++) { const dy = Math.abs(ff[i][2] - ff[i - 1][2]); if (dy >= 0.5) { if (still >= 150 || !starts.length) starts.push(ff[i - 1][0]); still = 0; } else still += ff[i][0] - ff[i - 1][0]; }
  const gaps = ff.map((x) => [x[1], x[0], x[2]]);
  gaps.sort((a, b) => b[0] - a[0]);
  const top = gaps.slice(0, 5).map(([d, t, y]) => `${Math.round(d)}ms@+${Math.round(t - mk.fade)} y${Math.round(y)} drag${starts.filter((st) => st <= t).length}`);
  console.log(run, 'drag starts (ms after fade mark):', starts.map((t) => Math.round(t - mk.fade)).join(', '), '| longest frames:', top.join('; '));
}

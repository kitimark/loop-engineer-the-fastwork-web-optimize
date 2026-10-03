// P-073 v1c Simulator check (fix-nav-morph; counts only, Simulator ms never count, F-084).
// Per gesture record (sim.mjs gesture or iphone.mjs gesture, arm-scope-touch-v1 / v1c): the pin exposure.
//   node fixes/morph-webkit/v1c-count.mjs <gesture record.json> ...
// settleY = scrollY of the last frame before the 'end' mark; pushes = touch sequences from pin arrival (first frame
// y >= 5200, -300 ms) to the 'end' mark; prevented = defaultPrevented touchmoves / touchmoves over those pushes.
import { readFileSync } from 'node:fs';

for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const s = r.run.segments[0], fr = s.frames;
  const name = f.split('/').pop();
  const ip = fr.findIndex((x) => x[2] >= 5200);
  if (ip < 0) { console.log(name, 'no pin', 'aborted', r.run.aborted); continue; }
  const tp = fr[ip][0], tend = fr[fr.length - 1][0];
  const lastT = s.marks.filter((m) => m[1] === 'transit').pop()[0];
  const endM = s.marks.find((m) => m[1] === 'end')[0];
  const before = fr.filter((x) => x[0] < endM);
  const seqs = []; let cur = null;
  for (const e of s.touches.filter((x) => x[0] >= tp - 300)) {
    if (e[1] === 's') { cur = { t: e[0], m: 0, p: 0 }; seqs.push(cur); } else if (e[1] === 'm' && cur) { cur.m++; cur.p += e[4]; }
  }
  const loop = seqs.filter((q) => q.t < endM), end = seqs.filter((q) => q.t >= endM);
  const sum = (a, k) => a.reduce((n, q) => n + q[k], 0);
  const after = fr.slice(ip).map((x) => x[2]);
  console.log(name, JSON.stringify({
    program: r.program.hash.slice(0, 12), strokes: r.run.strokes.length, aborted: r.run.aborted ?? null, errors: (r.run.errors || []).length,
    approachY: (fr.filter((x) => x[0] <= lastT).pop() || [])[2], settleY: before[before.length - 1][2], yRange: [Math.min(...after), Math.max(...after)],
    pushesToEnd: loop.length, prevented: `${sum(loop, 'p')}/${sum(loop, 'm')}`, perPush: loop.map((q) => `${q.p}/${q.m}`).join(' '),
    endPushes: end.map((q) => `${q.p}/${q.m}`).join(' '), pushStartsS: loop.map((q) => +((q.t - tp) / 1000).toFixed(1)).join(','),
    pinToEndMarkS: +((endM - tp) / 1000).toFixed(1), pinToRunEndS: +((tend - tp) / 1000).toFixed(1),
  }));
}

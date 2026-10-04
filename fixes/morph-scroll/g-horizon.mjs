// PR-018 rev 6d: how far does iOS momentum carry the page after a swipe that lifts while moving, against the scroll
// speed at lift-off? From rev 4 G records (rev 4 lets the momentum run out, then rests 200 ms before its settle).
// Usage (worktree root): node fixes/morph-scroll/g-horizon.mjs out/morph-scroll/g6/slow/R4-1.json [...]
// Per marked end stroke: v = speed over the 50 ms before lift (px/ms), d = scrollY at the first 150 ms of stillness
// after lift minus scrollY at lift (px), h = d / v (ms): the "horizon" a projection q = p + h * v / t would need.
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(f, 'utf8')).run;
  for (const seg of run.segments || []) {
    const fr = seg.frames || [], tc = seg.touches || [], mk = seg.marks || [];
    const yAt = (t) => { let r = fr[0]; for (const x of fr) { if (x[0] > t) break; r = x; } return r[2]; };
    for (const [mt, name] of mk) {
      if (!/^E\d/.test(name)) continue;
      const ts = tc.find((x) => x[0] >= mt && x[1] === 's');
      const te = ts && tc.find((x) => x[0] > ts[0] && (x[1] === 'e' || x[1] === 'c') && x[2] === 0);
      if (!te) continue;
      const tl = te[0], yl = yAt(tl), v = (yl - yAt(tl - 50)) / 50;
      const after = fr.filter((x) => x[0] > tl);
      let last = tl, ly = yl, yStill = null;
      for (const x of after) { if (x[2] !== ly) { last = x[0]; ly = x[2]; } else if (x[0] - last >= 150) { yStill = ly; break; } }
      const d = yStill == null ? null : yStill - yl;
      console.log(`${f.split('/').pop().padEnd(10)} ${name.padEnd(28)} v ${v.toFixed(2).padStart(6)} px/ms  momentum ${String(d).padStart(5)} px  horizon ${d != null && Math.abs(v) > 0.05 ? (d / v).toFixed(0) : '-'} ms  (stopped ${(last - tl).toFixed(0)} ms after lift)`);
    }
  }
}

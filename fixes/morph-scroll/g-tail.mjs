// PR-018 rev 6 trace: in the rev 4 G records (g-momentum-v1.json, out/morph-scroll/g/), how long after a flick's
// lift-off the scroll speed (over 4 frames) falls below 0.5 and 0.1 px/ms. ("last move" is not meaningful: it scans the
// rest of the segment; the glide end is g-momentum-analyze.mjs's glideMs.) Usage: node fixes/morph-scroll/g-tail.mjs
import { readFileSync } from 'node:fs';
const dir = 'out/morph-scroll/g/';   // run from the worktree root
const out = {};
for (const f of ['R4-1.json', 'R4-6.json', 'V7-2.json']) {
  const run = JSON.parse(readFileSync(dir + f, 'utf8')).run;
  for (const seg of run.segments || []) {
    const fr = seg.frames || [], tc = seg.touches || [];
    for (const [mt, name] of seg.marks || []) {
      if (!/^flick/.test(name)) continue;
      const ts = tc.find((x) => x[0] >= mt && x[1] === 's');
      const te = ts && tc.find((x) => x[0] > ts[0] && (x[1] === 'e' || x[1] === 'c') && x[2] === 0);
      if (!te) continue;
      const after = fr.filter((x) => x[0] > te[0]);
      let t05 = null, t01 = null, last = null;
      for (let i = 4; i < after.length; i++) {
        const v = Math.abs(after[i][2] - after[i - 4][2]) / (after[i][0] - after[i - 4][0]);
        if (t05 == null && v < 0.5) t05 = after[i][0] - te[0];
        if (t01 == null && v < 0.1) t01 = after[i][0] - te[0];
        if (after[i][2] !== after[i - 1][2]) last = after[i][0] - te[0];
      }
      (out[f.split('-')[0]] ||= []).push([name, Math.round(t05), Math.round(t01), Math.round(last)]);
    }
  }
}
for (const [k, v] of Object.entries(out)) console.log(k, 'flick: ms to <0.5 px/ms, to <0.1 px/ms, last move', JSON.stringify(v));

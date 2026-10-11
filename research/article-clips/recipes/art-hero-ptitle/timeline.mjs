// Prints a compact timeline of a herouser record: touches, scroll segments, long frames (>34) with scrollY.
import fs from 'node:fs';
const f = process.argv[2];
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const fr = j.frames; const t0 = fr[0][0];
const ev = [];
for (const t of j.touches) if (t[1] !== 'm') ev.push([t[0], `TOUCH ${t[1]} y=${t[5]} cy=${t[6]}`]);
// motion state changes
let moving = false, lastY = fr[0][2], restStart = fr[0][0];
for (const [t, dt, y, ih] of fr) {
  const m = y !== lastY;
  if (m && !moving) ev.push([t, `  move start from y=${lastY} (rest ${(t - restStart) | 0} ms)`]);
  if (!m && moving) { ev.push([t, `  rest at y=${y} ih=${ih}`]); restStart = t; }
  moving = m; lastY = y;
  if (dt > 34) ev.push([t, `    long ${dt} ms y=${y} ih=${ih}${m ? ' mov' : ' still'}`]);
}
ev.sort((a, b) => a[0] - b[0]);
for (const [t, s] of ev) console.log(String(t).padStart(6), s);

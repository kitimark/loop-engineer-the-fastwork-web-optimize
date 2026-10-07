// logo-close: the logo's x per 120 Hz frame from logo-path.mjs output, A (red) and B (blue), as a PNG with two panels:
// left the open's first 120 ms (ONLY=a or ONLY=b: one arm on the same axes), right the close's last 200 ms (t 500..700). Grey grid every 10 px of x and 20 ms of t.
//   node fixes/logo-close/probe/plot.mjs out/logo-close/path/path-430x775.json dir:g00c dir:lcfix out/logo-close/plot-430.png
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { encodePng } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const [file, armA, armB, out] = process.argv.slice(2);
const r = JSON.parse(readFileSync(file, 'utf8'));
const PW = 480, PH = 360, M = 30, W = PW * 2 + M * 3, H = PH + M * 2;
const img = Buffer.alloc(W * H * 3, 255);
const px = (x, y, c, s = 1) => { for (let dy = -s + 1; dy < s; dy++) for (let dx = -s + 1; dx < s; dx++) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const i = (Y * W + X) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; } };
const line = (x0, y0, x1, y1, c, s) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let k = 0; k <= n; k++) px(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, c, s); };
const panels = [{ ph: 'open', t0: 0, t1: 120 }, { ph: 'close', t0: 500, t1: 700 }];
const all = [armA, armB].flatMap((a) => panels.flatMap((p) => r.runs[a][p.ph].filter((f) => f.frame && f.t >= p.t0 && f.t <= p.t1).map((f) => f.x)));
const xMin = Math.floor(Math.min(...all) / 10) * 10 - 5, xMax = Math.ceil(Math.max(...all) / 10) * 10 + 5;
panels.forEach((p, k) => {
  const ox = M + k * (PW + M), oy = M;
  const sx = (t) => ox + ((t - p.t0) / (p.t1 - p.t0)) * PW, sy = (x) => oy + PH - ((x - xMin) / (xMax - xMin)) * PH;
  for (let x = Math.ceil(xMin / 10) * 10; x <= xMax; x += 10) line(ox, sy(x), ox + PW, sy(x), [225, 225, 225], 1);
  for (let t = p.t0; t <= p.t1; t += 20) line(sx(t), oy, sx(t), oy + PH, [225, 225, 225], 1);
  line(ox, oy, ox, oy + PH, [120, 120, 120], 1); line(ox, oy + PH, ox + PW, oy + PH, [120, 120, 120], 1);
  for (const [a, c] of [[armA, [220, 40, 40]], [armB, [30, 90, 230]]].filter(([a]) => !process.env.ONLY || (process.env.ONLY === 'a' ? a === armA : a === armB))) {
    const F = r.runs[a][p.ph].filter((f) => f.frame && f.t >= p.t0 - 1e-6 && f.t <= p.t1 + 1e-6);
    for (let i = 1; i < F.length; i++) line(sx(F[i - 1].t), sy(F[i - 1].x), sx(F[i].t), sy(F[i].x), c, 1);
    for (const f of F) px(sx(f.t), sy(f.x), c, 3);
  }
});
writeFileSync(out, encodePng(W, H, img));
console.log(`PLOT ${out}: x ${xMin}..${xMax} px (grid 10 px), t open 0..120, close 500..700 ms (grid 20 ms)`);

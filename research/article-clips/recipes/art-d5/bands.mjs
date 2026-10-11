// Bands for Day 5 (same code geometry as art-hero-ptitle/classify.mjs): o windows first, then
// heroOnly = y < 600 and moving or within 1 s of moving (hero cards leaving, People card not yet shown),
// overlap = 600 <= y < 855 (hero exit still running while the People card fades in / sits on top),
// rest = everything else (page still, or below 855).
import fs from 'node:fs';
const [f, from, to] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const seg = j.run?.segments?.find((s) => (s.marks || []).length) || j.run?.segments?.[0] || j;
const t0 = from ? Number(from) : -Infinity, t1 = to ? Number(to) : Infinity;
const Y_IN = 242, Y_OUT = 970, Y_FLIP = 600, Y_HERO = 855;
let inView = false, enterT = null, expandedAt = null, closeAt = null, prevY = seg.frames[0][2], lastMove = -1e9;
const cls = {}; const add = (c, fr) => { (cls[c] ||= []).push(fr); };
for (const fr of seg.frames) {
  const [t, dt, y] = fr;
  const iv = y >= Y_IN && y <= Y_OUT;
  if (iv && !inView) { enterT = t; expandedAt = null; }
  if (!iv && inView) { if (expandedAt != null || (enterT != null && t - enterT >= 1300)) closeAt = t; enterT = null; expandedAt = null; }
  inView = iv;
  if (inView && enterT != null && expandedAt == null && t - enterT >= 1420) expandedAt = enterT + 1420;
  if (y !== prevY) lastMove = t;
  let c;
  if (expandedAt != null && t > expandedAt && t <= expandedAt + 920) c = 'o';
  else if (closeAt != null && t > closeAt && t <= closeAt + 920) c = 'o';
  else if (y < Y_FLIP && y > 0 && t - lastMove < 1000) c = 'heroOnly';
  else if (y >= Y_FLIP && y < Y_HERO) c = 'overlap';
  else c = 'rest';
  prevY = y;
  if (t > t0 && t <= t1) add(c, fr);
}
const row = (a = []) => { const g = (x) => a.filter((q) => q[1] > x).length; const ms = a.reduce((s, q) => s + q[1], 0);
  return `${String(a.length).padStart(4)} fr ${(ms/1000).toFixed(1).padStart(5)} s  >34 ${String(g(34)).padStart(3)}  >50 ${String(g(50)).padStart(3)}  max ${a.length ? Math.round(Math.max(...a.map((q) => q[1]))) : '-'}`; };
console.log(f.split('/').pop(), from ? `(${from} -> ${to})` : '');
for (const c of ['heroOnly', 'overlap', 'o', 'rest']) console.log('  ' + c.padEnd(9), row(cls[c]));

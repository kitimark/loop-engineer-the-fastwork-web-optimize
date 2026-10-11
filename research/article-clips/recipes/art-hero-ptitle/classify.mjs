// Classifies every frame of a phone rAF log by what the ORIGINAL page's code does at that moment (derived geometry,
// research/design-engineering/hero.md section 2: track 1630, hero pinned and its exit writer active for y < 855,
// 0.72 flip at y ~587-616, heading 35 % crossing at y ~242, timer cleared above y ~970).
// The 'o' model follows baseline JS 6238-6267: enter -> +1300 is-stack -> +120 is-expanded; width/height transition
// 0.92 s (CSS 2471-2473); leave -> reset (the same transition back, 0.92 s).
// Classes (first match): oOpen = is-expanded .. +920 ms; oClose = leave .. +920 ms (only if it had opened);
// flip = the frame that crosses y 600 either way and the next one; heroMove = y changed and y < 855;
// move = other moving frames; rest = the page still.
import fs from 'node:fs';
const [f, from, to] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const seg = j.run?.segments?.find((s) => (s.marks || []).length) || j.run?.segments?.[0] || j;
const marks = Object.fromEntries((seg.marks || []).map((m) => [m[1], m[0]]));
const t0 = from ? (marks[from] ?? Number(from)) : -Infinity;
const t1 = to ? (marks[to] ?? Number(to)) : Infinity;
const Y_IN = 242, Y_OUT = 970, Y_FLIP = 600, Y_HERO = 855;
let inView = false, enterT = null, expandedAt = null, closeAt = null, prevY = seg.frames[0][2], flipLeft = 0;
const cls = {};
const add = (c, fr) => { (cls[c] ||= []).push(fr); };
for (const fr of seg.frames) {
  const [t, dt, y] = fr;
  const iv = y >= Y_IN && y <= Y_OUT;
  if (iv && !inView) { enterT = t; expandedAt = null; }
  if (!iv && inView) { if (expandedAt != null || (enterT != null && t - enterT >= 1300)) closeAt = t; enterT = null; expandedAt = null; }
  inView = iv;
  if (inView && enterT != null && expandedAt == null && t - enterT >= 1420) expandedAt = enterT + 1420;
  if ((prevY < Y_FLIP) !== (y < Y_FLIP)) flipLeft = 2;
  const moving = y !== prevY;
  let c;
  if (flipLeft > 0) { c = 'flip'; flipLeft--; }
  else if (expandedAt != null && t > expandedAt && t <= expandedAt + 920) c = 'oOpen';
  else if (closeAt != null && t > closeAt && t <= closeAt + 920) c = 'oClose';
  else if (moving && y < Y_HERO) c = 'heroMove';
  else if (moving) c = 'move';
  else c = 'rest';
  prevY = y;
  if (t > t0 && t <= t1) add(c, fr);
}
const row = (a = []) => {
  const g = (x) => a.filter((q) => q[1] > x).length;
  const ms = a.reduce((s, q) => s + q[1], 0);
  return `${String(a.length).padStart(4)} fr ${String(Math.round(ms)).padStart(6)} ms  mean ${(a.length ? ms / a.length : 0).toFixed(1).padStart(5)}  >34 ${String(g(34)).padStart(3)}  >50 ${String(g(50)).padStart(3)}  max ${a.length ? Math.max(...a.map((q) => q[1])) : '-'}`;
};
console.log(f.split('/').pop(), from ? `(${from} -> ${to})` : '');
for (const c of ['heroMove', 'flip', 'move', 'oOpen', 'oClose', 'rest']) console.log('  ' + c.padEnd(9), row(cls[c]));

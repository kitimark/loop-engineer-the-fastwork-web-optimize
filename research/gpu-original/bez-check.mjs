// g0 desk check (arch-gpu-original, 2026-10-07): is cubic-bezier(1/3, 1, 2/3, 1) the original morph tween curve?
// The original: ZM/YM (baseline JS 12688-12697): value = from + (to - from) * (1 - (1 - t)^3), t = elapsed / 680 ms.
// Solver: a JS port of WebKit's UnitBezier (Source/WebCore/platform/graphics/UnitBezier.h, Newton, epsilon 1e-7).
// Run: node research/gpu-original/bez-check.mjs   (no browser, no lock)
const p1x = 1 / 3, p1y = 1, p2x = 2 / 3, p2y = 1;
const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
const X = (s) => ((ax * s + bx) * s + cx) * s;
const Y = (s) => ((ay * s + by) * s + cy) * s;
const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
function solveX(x) {
  let s = x;
  for (let i = 0; i < 8; i++) {
    const e = X(s) - x;
    if (Math.abs(e) < 1e-7) return s;
    const d = dX(s);
    if (Math.abs(d) < 1e-7) break;
    s -= e / d;
  }
  return s;
}
let max = 0;
for (let i = 0; i <= 10000; i++) {
  const t = i / 10000;
  max = Math.max(max, Math.abs(1 - (1 - t) ** 3 - Y(solveX(t))));
}
console.log(`x(s) coefficients ax ${ax.toExponential(2)} bx ${bx.toExponential(2)} (0 = x(s) is s, no solve error)`);
console.log(`max |curve difference| over 10001 points: ${max.toExponential(2)}; over a 1280 px span: ${(max * 1280).toExponential(2)} px`);

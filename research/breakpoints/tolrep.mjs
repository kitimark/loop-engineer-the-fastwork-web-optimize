// de-breakpoints, T-034 §3.2.1: tolerance report (research/pixel-tolerance §1) on probe-loads shots: X vs Y with A/A X vs X2; per card area, flat share
// usage (worktree root): [RR=rr5] node research/breakpoints/tolrep.mjs <stop> <xi> <yi> <x2i>
import { readFileSync } from 'node:fs'; import { inflateSync } from 'node:zlib';
const WT = process.cwd() + '/'; // run from the worktree root
const src = readFileSync(WT + 'research/breakpoints/sim-vp.mjs', 'utf8');
const fn = src.slice(src.indexOf('function pngPixels'), src.indexOf('function cmp'));
const pngPixels = new Function('inflateSync', fn + 'return pngPixels;')(inflateSync);
const D = WT + 'out/breakpoints/' + (process.env.RR || 'rr5') + '/';
const J = JSON.parse(readFileSync(D + 'loads.json', 'utf8'));
const [stop, xi, yi, x2i] = process.argv.slice(2); const ord = J.order;
const f = (i) => D + `png/${i}-${ord[i]}-${stop}.png`; const sh = (i) => J.shots.find((s) => s.i === +i && s.stop === stop);
const X = pngPixels(readFileSync(f(xi))), Y = pngPixels(readFileSync(f(yi))), X2 = pngPixels(readFileSync(f(x2i)));
const W = X.w, H = X.h, bp = X.bpp, mask = [xi, yi, x2i].flatMap((i) => sh(i).cd), cards = sh(xi).cards;
const inR = (q, a, b, p = 0) => a >= q.l - p && a <= q.r + p && b >= q.t - p && b <= q.b + p;
const d3 = (P, Q, i) => Math.max(Math.abs(P.px[i] - Q.px[i]), Math.abs(P.px[i + 1] - Q.px[i + 1]), Math.abs(P.px[i + 2] - Q.px[i + 2]));
const flat = (a, b) => { for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
  const u = Math.min(W - 1, Math.max(0, a + dx)), v = Math.min(H - 1, Math.max(0, b + dy)); const k = (v * W + u) * bp + c; lo = Math.min(lo, X.px[k]); hi = Math.max(hi, X.px[k]); } if (hi - lo > 2) return false; } return true; };
let max = 0, aaMax = 0, beyond = 0, fl = 0, maxE = 0, maxF = 0; const per = {}, ob = [1e9, 1e9, -1, -1];
for (let p = 0, i = 0; p < W * H; p++, i += bp) { const a = p % W, b = (p / W) | 0; if (mask.some((q) => inR(q, a, b, 2))) continue;
  const d = d3(X, Y, i), aa = d3(X, X2, i); if (d > max) max = d; if (aa > aaMax) aaMax = aa;
  if (d > 8 && aa <= 8) { beyond++; if (flat(a, b)) { fl++; maxF = Math.max(maxF, d); } else maxE = Math.max(maxE, d);
    const k = cards.findIndex((q) => inR(q, a, b)); const n = k < 0 ? "other" : "card" + k; per[n] = (per[n] || 0) + 1; if (k < 0) { ob[0] = Math.min(ob[0], a); ob[1] = Math.min(ob[1], b); ob[2] = Math.max(ob[2], a); ob[3] = Math.max(ob[3], b); } } }
console.log("other bbox " + ob);
console.log(`${stop} X=${xi}${ord[xi]} Y=${yi}${ord[yi]} AA=${x2i}${ord[x2i]}: max ${max} (A/A max ${aaMax}) beyond ${(100 * beyond / (W * H)).toFixed(3)}% = ${beyond} css px2 (dpr 1); flat ${(100 * fl / Math.max(1, beyond)).toFixed(1)}% (fill max ${maxF}, edge max ${maxE}); per ${JSON.stringify(Object.fromEntries(Object.entries(per).sort((u, v) => v[1] - u[1])))}`);

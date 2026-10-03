// carousel-leaver, phase-free scorer (added after P-086's Sim run, post hoc: the Simulator's rAF frames land at irregular
// times, so score.mjs's same-frame-index match gives a baseline A/A of 11.8 px in L.w there).
// node shape.mjs <ref.json> <other.json>
// Progress coordinate: the leaver's own transform scale s (1 -> 0.35, the same eased curve in every build). For every
// sliding frame of <other> (swap frames excluded) the <ref> value at the same s is linearly interpolated between the
// two pooled ref points that bracket it, and |delta| is taken. Quantities (CSS px, carousel-relative):
//   L.xr, L.w   the leaver's layout rect (includes the 32 px box st6-rb2 keeps)
//   V.x0, V.x1  the leaver's visible outline: the rect for a box, or the clip-path ellipse(rx ..) x s around the rect
//               centre (st6-rb2): the face's visible left and right edge
//   L.o         opacity;  F1.xr  the first follower's left
// Output: max and median |delta| per quantity, and the F1 end offset (last sliding frame minus rest) per slide per file.
import { readFileSync } from 'node:fs';
const [fa, fb] = process.argv.slice(2, 4);
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const isSliding = (fr) => /\bis-sliding\b/.test(fr.cls) || fr.imgs.some((i) => /\bis-exit\b/.test(i[6]));
const scale = (tr) => { if (!tr || tr === 'none') return 1; const m = /matrix\(([^,]+)/.exec(tr); return m ? +m[1] : NaN; };
function points(S) {
  const P = [], ends = [];
  for (let i = 1; i < S.length; i++) {
    const fr = S[i], nx = S[i + 1];
    if (!isSliding(fr)) continue;
    if (nx && !isSliding(nx)) { let r = i; while (r > 0 && isSliding(S[r])) r--;
      if (r > 0 && fr.imgs[1] && S[r].imgs[1]) ends.push(+((fr.imgs[1][0] - fr.cx) - (S[r].imgs[1][0] - S[r].cx)).toFixed(3)); }
    const L = fr.imgs[0], F1 = fr.imgs[1]; if (!L || !F1) continue;
    const s = scale(L[3]), xr = L[0] - fr.cx, w = L[1];
    const m = /ellipse\(([\d.]+)px/.exec(L[5] || ''); const c = xr + w / 2, vw = m ? 2 * +m[1] * s : w;
    P.push({ s, 'L.xr': xr, 'L.w': w, 'V.x0': c - vw / 2, 'V.x1': c + vw / 2, 'L.o': L[2], 'F1.xr': F1[0] - fr.cx });
  }
  return { P, ends };
}
const A = points(load(fa)), B = points(load(fb));
const keys = ['L.xr', 'L.w', 'V.x0', 'V.x1', 'L.o', 'F1.xr'];
const D = Object.fromEntries(keys.map((k) => [k, []]));
let used = 0, outside = 0;
for (const p of B.P) {
  let hi = null, lo = null;
  for (const r of A.P) { if (r.s >= p.s && (!hi || r.s < hi.s)) hi = r; if (r.s <= p.s && (!lo || r.s > lo.s)) lo = r; }
  if (!hi || !lo) { outside++; continue; }
  used++;
  const f = hi.s === lo.s ? 0 : (hi.s - p.s) / (hi.s - lo.s);
  for (const k of keys) D[k].push(Math.abs(p[k] - (hi[k] + f * (lo[k] - hi[k]))));
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
console.log(JSON.stringify({ ref: fa.split('/').pop(), other: fb.split('/').pop(), refPoints: A.P.length, used, outside,
  max: Object.fromEntries(keys.map((k) => [k, D[k].length ? +Math.max(...D[k]).toFixed(3) : null])),
  median: Object.fromEntries(keys.map((k) => [k, D[k].length ? +med(D[k]).toFixed(3) : null])),
  endsRef: A.ends, endsOther: B.ends }));

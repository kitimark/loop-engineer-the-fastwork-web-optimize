// P-142 rev 1.1 (lead ruling): T2 shade of the pixels beyond A/A in both pairs ("consistent", pxlib scoreStop's mask), split
// edge / fill by pxlib's own flat rule (3x3 luma range of A <= 2 = fill). Analysis of existing screenshots only.
//   node t2shade.mjs <px dir> <y> [<y> ...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05';
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const [dir, ...ys] = process.argv.slice(2);
const dpr = JSON.parse(readFileSync(join(dir, 'px.json'), 'utf8')).dpr || 3;
for (const y of ys) {
  const P = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, pngPixels(readFileSync(join(dir, `${a}-y${y}.png`)))]));
  const dAV = delta(P.A, P.V), dAV2 = delta(P.A, P.V2), dA2V = delta(P.A2, P.V), dA2V2 = delta(P.A2, P.V2), dAA = delta(P.A, P.A2), dVV = delta(P.V, P.V2);
  const X = P.A, out = { edge: { n: 0, max: 0, hist: {} }, fill: { n: 0, max: 0, hist: {} } }, px = [];
  for (let p = 0; p < dAV.length; p++) {
    const v = Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]), m = Math.max(dAA[p], dVV[p]);
    if (!(v > 8 && m <= 8)) continue;
    const x = p % X.w, yy0 = (p - x) / X.w; let lo = 255, hi = 0;
    for (let yy = Math.max(0, yy0 - 1); yy <= Math.min(X.h - 1, yy0 + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(X.w - 1, x + 1); xx++) { const i = (yy * X.w + xx) * X.bpp; const l = (X.px[i] + X.px[i + 1] + X.px[i + 2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
    const k = hi - lo <= 2 ? 'fill' : 'edge'; const o = out[k]; o.n++; o.max = Math.max(o.max, v); const b = Math.min(255, Math.floor(v / 32) * 32); o.hist[b] = (o.hist[b] || 0) + 1;
    px.push([x, yy0, v, k]);
  }
  const verdict = out.edge.max > 128 || out.fill.max > 64 ? 'T2 FAIL' : 'within T2';
  console.log(JSON.stringify({ y: +y, dpr, beyondPx: px.length, cssPx2: Math.round(px.length / dpr / dpr), edge: out.edge, fill: out.fill, verdict, top: px.sort((a, b) => b[2] - a[2]).slice(0, 8) }));
}

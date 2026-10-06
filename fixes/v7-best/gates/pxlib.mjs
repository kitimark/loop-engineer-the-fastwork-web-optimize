// v7-best pixel scoring, shared by px-chrome.mjs and px-sim.mjs: the PR-010 "tolerance report"
// (research/pixel-tolerance/README.md §1) for a pair X (old) ~ Y (new) and an A/A pair on the same stop.
// PNG decoder: fix-cd-strip's / fix-cd-roll-ca's pngPixels (fixes/cd-roll-ca/pixels.mjs), copied with credit.
//   node fixes/v7-best/gates/pxlib.mjs rescore <px dir> [dpr] [top]   # re-score saved shots <arm>-y<y>.png from px.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * Decodes an 8-bit, non-interlaced RGB or RGBA PNG and always returns RGBA (bpp 4; an RGB file gets alpha 255), with
 * srcBpp = the file's own 3 or 4. 2026-10-06 (F-314, arch-compositor-morph): it used to return the file's own bpp, and
 * delta()/score() index both images with the first one's bpp, so an RGBA shot (Chrome's Page.captureScreenshot writes
 * RGBA when any pixel is not opaque) against an RGB shot compared misaligned bytes: 0.05 % real read as 60-88 %.
 * Any other PNG (palette, grey, 16-bit, interlaced) is refused with an error, not misread.
 */
export function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4);
      if (d[8] !== 8 || (d[9] !== 2 && d[9] !== 6) || d[12] !== 0) throw new Error(`pngPixels: only 8-bit non-interlaced RGB/RGBA PNGs (bit depth ${d[8]}, colour type ${d[9]}, interlace ${d[12]})`);
      bpp = d[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const src = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? src[y * stride + x - bpp] : 0, b = y ? src[(y - 1) * stride + x] : 0, c = x >= bpp && y ? src[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      src[y * stride + x] = v & 255; } }
  if (bpp === 4) return { w, h, bpp: 4, srcBpp: 4, px: src };
  const px = Buffer.alloc(w * h * 4);
  for (let p = 0, i = 0, j = 0; p < w * h; p++, i += 3, j += 4) { px[j] = src[i]; px[j + 1] = src[i + 1]; px[j + 2] = src[i + 2]; px[j + 3] = 255; }
  return { w, h, bpp: 4, srcBpp: 3, px };
}
/** per-pixel max channel difference (RGB; each image indexed with its own bpp; sizes must match) */
export const delta = (X, Y) => {
  if (X.w !== Y.w || X.h !== Y.h) throw new Error(`delta: image sizes differ (${X.w}x${X.h} vs ${Y.w}x${Y.h})`);
  const n = X.w * X.h, d = new Uint8Array(n);
  for (let p = 0, i = 0, j = 0; p < n; p++, i += X.bpp, j += Y.bpp) { let m = 0; for (let c = 0; c < 3; c++) { const v = Math.abs(X.px[i + c] - Y.px[j + c]); if (v > m) m = v; } d[p] = m; }
  return d;
};
export const aa = (d) => { let m = 0, o = 0; for (const v of d) { if (v > m) m = v; if (v > 8) o++; } return { maxLevel: m, over8Pct: +(100 * o / d.length).toFixed(4) }; };
/**
 * X~Y beyond the A/A mask: pixels > 8 levels in X~Y where the A/A pair is <= 8. Flat = the 3x3 range of X's luma <= 2.
 * Clusters: 16 CSS px cells, 8-connected; bbox in CSS px of the shot (minus `top` CSS px for the hit lookup, the
 * Simulator's browser chrome above the page); `under` = the hit-grid label nearest the cluster centre.
 */
export function score(X, Y, dXY, dAA, hits, dpr, top = 0) {
  const n = X.w * X.h; let max = 0, any = 0, over = 0, beyond = 0, flat = 0, aaOver = 0; const cell = 16 * dpr, gw = Math.ceil(X.w / cell), gh = Math.ceil(X.h / cell), g = new Uint32Array(gw * gh), gmax = new Uint8Array(gw * gh);
  for (let p = 0; p < n; p++) { const v = dXY[p]; if (v > max) max = v; if (v) any++; if (v > 8) over++; if (dAA[p] > 8) aaOver++;
    if (v > 8 && dAA[p] <= 8) { beyond++; const x = p % X.w, y = (p - x) / X.w; const k = Math.floor(y / cell) * gw + Math.floor(x / cell); g[k]++; if (v > gmax[k]) gmax[k] = v;
      let lo = 255, hi = 0; for (let yy = Math.max(0, y - 1); yy <= Math.min(X.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(X.w - 1, x + 1); xx++) { const i = (yy * X.w + xx) * X.bpp; const l = (X.px[i] + X.px[i + 1] + X.px[i + 2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
      if (hi - lo <= 2) flat++; } }
  const seen = new Uint8Array(gw * gh), clusters = [];
  for (let k = 0; k < g.length; k++) { if (!g[k] || seen[k]) continue; const st = [k]; seen[k] = 1; let px = 0, mx = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (st.length) { const q = st.pop(); px += g[q]; mx = Math.max(mx, gmax[q]); const cx = q % gw, cy = (q - cx) / gw; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const r = ny * gw + nx; if (g[r] && !seen[r]) { seen[r] = 1; st.push(r); } } }
    const bb = [x0 * 16, y0 * 16, (x1 + 1) * 16, (y1 + 1) * 16]; const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 - top];
    let best = null, bd = 1e9; for (const [hx, hy, l] of hits || []) { const dd = (hx - c[0]) ** 2 + (hy - c[1]) ** 2; if (dd < bd) { bd = dd; best = l; } }
    clusters.push({ px, cssPx2: Math.round(px / dpr / dpr), maxLevel: mx, bboxCss: bb, under: best }); }
  clusters.sort((a, b) => b.px - a.px);
  return { maxLevel: max, anyPx: any, over8: over, aaOver8: aaOver, beyondAA: beyond, beyondPct: +(100 * beyond / n).toFixed(4), beyondCssPx2: Math.round(beyond / dpr / dpr), flatShare: beyond ? +(flat / beyond).toFixed(3) : null, clusters: clusters.slice(0, 8) };
}
/** one stop: A~V beyond A~A2, and the second sample A2~V2 beyond V~V2 */
export function scoreStop(files, hits, dpr, top = 0) {
  const P = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, pngPixels(readFileSync(files[a]))]));
  const dAV = delta(P.A, P.V), dAA = delta(P.A, P.A2), dVV = delta(P.V, P.V2), dA2V2 = delta(P.A2, P.V2);
  // consistent: over 8 in all four cross pairs (A~V, A~V2, A2~V, A2~V2) while neither A/A pair (A~A2, V~V2) is over 8 there:
  // a difference of the build, not of one load's timer phase
  const dAV2 = delta(P.A, P.V2), dA2V = delta(P.A2, P.V); const n = dAV.length, dMin = new Uint8Array(n), dMask = new Uint8Array(n);
  for (let p = 0; p < n; p++) { dMin[p] = Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]); dMask[p] = Math.max(dAA[p], dVV[p]); }
  return { AV: score(P.A, P.V, dAV, dAA, hits.V, dpr, top), A2V2: score(P.A2, P.V2, dA2V2, dVV, hits.V2, dpr, top), consistent: score(P.A, P.V, dMin, dMask, hits.V, dpr, top), AA: aa(dAA), VV: aa(dVV) };
}
export const line = (y, row) => `y ${String(y).padStart(5)}  A~V beyond A/A ${row.AV.beyondCssPx2} css px2 (${row.AV.beyondPct} %, max ${row.AV.maxLevel}, flat ${row.AV.flatShare})  A2~V2 ${row.A2V2.beyondCssPx2} (${row.A2V2.beyondPct} %, max ${row.A2V2.maxLevel})  consistent ${row.consistent.beyondCssPx2} (${row.consistent.beyondPct} %, max ${row.consistent.maxLevel}, flat ${row.consistent.flatShare})  A/A over8 ${row.AA.over8Pct} %  V/V ${row.VV.over8Pct} %${(row.consistent.clusters[0] || row.AV.clusters[0]) ? '  top: ' + JSON.stringify(row.consistent.clusters[0] || row.AV.clusters[0]) : ''}`;

if (process.argv[1] && process.argv[1].endsWith('pxlib.mjs') && process.argv[2] === 'rescore') {
  const dir = process.argv[3]; const res = JSON.parse(readFileSync(join(dir, 'px.json'), 'utf8'));
  const dpr = Number(process.argv[4] || res.dpr || 3), top = Number(process.argv[5] || res.top || 0);
  const hitsOf = (arm, y) => res.loads.find((l) => l.arm === arm)?.stops.find((s) => s.y === y)?.hits;
  const out = [];
  for (const y of res.ys) {
    const files = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, join(dir, `${a}-y${y}.png`)]));
    const row = { y, ...scoreStop(files, { V: hitsOf('V', y) || res.hitsV?.[y], V2: hitsOf('V2', y) || res.hitsV2?.[y] }, dpr, top) };
    out.push(row); console.log(line(y, row));
  }
  writeFileSync(join(dir, 'rescore.json'), JSON.stringify(out, null, 1));
}

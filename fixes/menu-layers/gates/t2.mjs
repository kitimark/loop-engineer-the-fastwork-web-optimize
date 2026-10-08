// g0-box: PR-010 wide (T2) report for a seek outdir (four loads A, V, A2, V2; fixes/g0-box/gates/seek.mjs), with the
// flat (fill) pixels' max split out from the edge pixels' max. No browser.
//   node fixes/g0-box/gates/t2.mjs <outdir> [--dpr 3] [--top 56]
// Per stop: consistent pixels = over 8 levels in all four cross pairs (A~V, A~V2, A2~V, A2~V2) while neither A/A pair
// (A~A2, V~V2) is over 8 there (the same rule as pxlib scoreStop). Rows above --top CSS px are not counted (the
// Simulator's status bar above the page; 0 for Chrome). Each consistent pixel is
//   edge: the 3x3 luma range around it is > 16 levels in A or in V (an outline, a glyph, a corner's anti-aliasing);
//   flat: otherwise (a fill or a smooth gradient: where a colour difference shows as a colour, not as a line).
// T2 (PR-010 wide): flat max <= 64, edge max <= 128, consistent area <= 0.5 % of the frame, each cluster
// (16 CSS px cells, 8-connected) <= 2000 CSS px2.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport')[0]); process.exit(0); }
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const dir = resolve(argv[0]);
const dpr = Number(arg('--dpr', '3')), topCss = Number(arg('--top', '56'));
const LIM = { flat: 64, edge: 128, pct: 0.5, cluster: 2000 };
const stops = readdirSync(dir).filter((f) => /^A-.*\.png$/.test(f)).map((f) => f.slice(2, -4)).sort();
const luma = (P, x, y) => { const i = (y * P.w + x) * P.bpp; return (P.px[i] + P.px[i + 1] + P.px[i + 2]) / 3; };
const range3 = (P, x, y) => { let lo = 255, hi = 0; for (let yy = Math.max(0, y - 1); yy <= Math.min(P.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(P.w - 1, x + 1); xx++) { const l = luma(P, xx, yy); if (l < lo) lo = l; if (l > hi) hi = l; } return hi - lo; };
const rows = []; const worst = { flat: 0, edge: 0, pct: 0, cluster: 0 }; let fails = 0;
for (const s of stops) {
  let P; try { P = Object.fromEntries(['A', 'V', 'A2', 'V2'].map((a) => [a, pngPixels(readFileSync(join(dir, `${a}-${s}.png`)))])); } catch { continue; }
  const d = [delta(P.A, P.V), delta(P.A, P.V2), delta(P.A2, P.V), delta(P.A2, P.V2)], dAA = delta(P.A, P.A2), dVV = delta(P.V, P.V2);
  const W = P.A.w, H = P.A.h, y0 = Math.round(topCss * dpr), counted = W * (H - y0);
  const cell = 16 * dpr, gw = Math.ceil(W / cell), gh = Math.ceil(H / cell), g = new Uint32Array(gw * gh), gmax = new Uint8Array(gw * gh);
  let n = 0, nFlat = 0, fMax = 0, eMax = 0, fAt = null, eAt = null;
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; const v = Math.min(d[0][p], d[1][p], d[2][p], d[3][p]);
    if (v <= 8 || Math.max(dAA[p], dVV[p]) > 8) continue;
    n++; const k = Math.floor(y / cell) * gw + Math.floor(x / cell); g[k]++; if (v > gmax[k]) gmax[k] = v;
    const edge = range3(P.A, x, y) > 16 || range3(P.V, x, y) > 16;
    if (edge) { if (v > eMax) { eMax = v; eAt = [Math.round(x / dpr), Math.round(y / dpr)]; } }
    else { nFlat++; if (v > fMax) { fMax = v; fAt = [Math.round(x / dpr), Math.round(y / dpr)]; } }
  }
  const seen = new Uint8Array(gw * gh); let big = null;
  for (let k = 0; k < g.length; k++) { if (!g[k] || seen[k]) continue; const st = [k]; seen[k] = 1; let px = 0, mx = 0, bx = [1e9, 1e9, -1, -1];
    while (st.length) { const q = st.pop(); px += g[q]; mx = Math.max(mx, gmax[q]); const cx = q % gw, cy = (q - cx) / gw; bx = [Math.min(bx[0], cx), Math.min(bx[1], cy), Math.max(bx[2], cx), Math.max(bx[3], cy)];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const r = ny * gw + nx; if (g[r] && !seen[r]) { seen[r] = 1; st.push(r); } } }
    const c = { cssPx2: Math.round(px / dpr / dpr), max: mx, bboxCss: [bx[0] * 16, bx[1] * 16, (bx[2] + 1) * 16, (bx[3] + 1) * 16] };
    if (!big || c.cssPx2 > big.cssPx2) big = c; }
  const pct = +(100 * n / counted).toFixed(4);
  const row = { stop: s, cssPx2: Math.round(n / dpr / dpr), pct, flatShare: n ? +(nFlat / n).toFixed(3) : null, flatMax: fMax, flatAt: fAt, edgeMax: eMax, edgeAt: eAt, biggest: big };
  row.pass = fMax <= LIM.flat && eMax <= LIM.edge && pct <= LIM.pct && (!big || big.cssPx2 <= LIM.cluster);
  if (!row.pass) fails++;
  worst.flat = Math.max(worst.flat, fMax); worst.edge = Math.max(worst.edge, eMax); worst.pct = Math.max(worst.pct, pct); worst.cluster = Math.max(worst.cluster, big?.cssPx2 || 0);
  rows.push(row);
  console.log(`${s.padEnd(12)} ${row.pass ? 'pass' : 'FAIL'} consistent ${String(row.cssPx2).padStart(5)} css px2 (${pct} %) flat max ${String(fMax).padStart(3)}${fAt ? ' @' + fAt : ''} share ${row.flatShare} | edge max ${String(eMax).padStart(3)}${eAt ? ' @' + eAt : ''}${big ? ` | biggest ${big.cssPx2} px2 max ${big.max} [${big.bboxCss}]` : ''}`);
}
const summary = { dir, dpr, topCss, limits: LIM, stops: rows.length, fails, worst };
console.log('T2', fails ? 'FAIL' : 'PASS', JSON.stringify(summary));
writeFileSync(join(dir, 't2.json'), JSON.stringify({ summary, rows }, null, 1));

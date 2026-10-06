// P1-only pixels against T2 (gate (b), exact-m form). A copy, with credit, of review-end-morph-p1's scorer (dd.mjs in its
// scratch folder, 2026-10-06) with: R's own A/A (R2, from gates/rv1-frames.mjs), the stops mapped by order (P1's px
// stops up0.02 ... up0.99 = the reference's ms list in the same order, at the same exact m values), and a T2 verdict
// per stop. Counts and pixels only.
//   node fixes/end-morph-p1/gates/p1only.mjs <P1 px dir> <rv1frames dir> [--dil 3] [--json out.json]
// P1 mask: pixels where every cross pair of {A, A2} (v9-final + hook-free 7c stop) x {V, V2} (P1) differs by > 8 levels
// while A vs A2 and V vs V2 differ by <= 8. R1 mask: the same for {M, M2} (best-build + hook) x {R, R2} (rev 1).
// P1-only = P1 mask minus the R1 mask dilated by --dil device px (3 = 1 css px at DPR 3). Shade = the smallest of the
// four cross deltas; fill when A's 3x3 luminance range <= 2, else edge.
// T2 (PR-010 wide; memory "illusion-must-be-pixel-identical"): P1-only area <= 2,000 css px, share <= 0.5 %, fill shade
// <= 64, edge shade <= 128. A stop passes only when all four hold.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const a = process.argv.slice(2);
const [pxDir, refDir] = a;
const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const DIL = Number(opt('--dil', '3')), jsonOut = opt('--json', null);
const ref = JSON.parse(readFileSync(join(refDir, 'frames.json'), 'utf8'));
const px = JSON.parse(readFileSync(join(pxDir, 'px.json'), 'utf8'));
const upStops = px.loads[0].stops.filter((s) => s.k.startsWith('up') && s.m > 0 && s.m < 1);
if (upStops.length !== ref.ms.length) throw new Error(`stops ${upStops.length} vs ref ms ${ref.ms.length}`);
const P = (f) => pngPixels(readFileSync(f));
const dpr = px.dpr || 3;
const out = [];
for (let k = 0; k < ref.ms.length; k++) {
  const st = upStops[k], m = ref.ms[k], mP = Number(st.state.m);
  const f = (arm) => join(pxDir, `${arm}-${st.k}.png`);
  const A = P(f('A')), V = P(f('V')), A2 = P(f('A2')), V2 = P(f('V2'));
  const fr = (b) => P(ref.builds[b].frames[k].file);
  const M = fr('M'), R = fr('R'), M2 = fr('M2'), R2 = fr('R2');
  if (A.w !== M.w || A.h !== M.h) { out.push({ stop: st.k, error: `size ${A.w}x${A.h} vs ${M.w}x${M.h}` }); continue; }
  const n = A.w * A.h, W = A.w;
  const dAV = delta(A, V), dAV2 = delta(A, V2), dA2V = delta(A2, V), dA2V2 = delta(A2, V2), dAA = delta(A, A2), dVV = delta(V, V2);
  const dMR = delta(M, R), dMR2 = delta(M, R2), dM2R = delta(M2, R), dM2R2 = delta(M2, R2), dMM = delta(M, M2), dRR = delta(R, R2);
  const p1 = new Uint8Array(n), r1 = new Uint8Array(n), lev = new Uint8Array(n), rlev = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const mn = Math.min(dAV[p], dAV2[p], dA2V[p], dA2V2[p]); lev[p] = mn;
    if (mn > 8 && dAA[p] <= 8 && dVV[p] <= 8) p1[p] = 1;
    rlev[p] = Math.min(dMR[p], dMR2[p], dM2R[p], dM2R2[p]);
    if (rlev[p] > 8 && dMM[p] <= 8 && dRR[p] <= 8) r1[p] = 1;
  }
  let r1d = r1;
  if (DIL) { r1d = new Uint8Array(n); for (let p = 0; p < n; p++) if (r1[p]) { const x = p % W, y = (p - x) / W; for (let yy = Math.max(0, y - DIL); yy <= Math.min(A.h - 1, y + DIL); yy++) for (let xx = Math.max(0, x - DIL); xx <= Math.min(W - 1, x + DIL); xx++) r1d[yy * W + xx] = 1; } }
  let nP = 0, nR = 0, both = 0, newPx = 0, newFill = 0, newEdge = 0, maxFill = 0, maxEdge = 0, fillOver = 0, edgeOver = 0; let bb = [1e9, 1e9, -1, -1];
  const over = []; // device px over the T2 levels, for clusters
  for (let p = 0; p < n; p++) {
    if (p1[p]) nP++; if (r1[p]) nR++; if (p1[p] && r1[p]) both++;
    if (p1[p] && !r1d[p]) {
      newPx++; const x = p % W, y = (p - x) / W; let lo = 255, hi = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(A.h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) { const i = (yy * W + xx) * A.bpp; const l = (A.px[i] + A.px[i + 1] + A.px[i + 2]) / 3; if (l < lo) lo = l; if (l > hi) hi = l; }
      const v = lev[p];
      if (hi - lo <= 2) { newFill++; if (v > maxFill) maxFill = v; if (v > 64) { fillOver++; over.push([x, y]); } }
      else { newEdge++; if (v > maxEdge) maxEdge = v; if (v > 128) { edgeOver++; over.push([x, y]); } }
      bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    }
  }
  // the whole residue of each fix against its own base, by band (nav row: css y < 70; panel: y >= 70): area, max shade,
  // area over 128 (any class). Compares the kind and size of P1's residue with rev 1's where element positions differ.
  const band = (mask, L) => { const o = { nav: [0, 0, 0], panel: [0, 0, 0] }; for (let p = 0; p < n; p++) if (mask[p]) { const y = Math.floor(p / W) / dpr, b = y < 70 ? o.nav : o.panel; b[0]++; if (L[p] > b[1]) b[1] = L[p]; if (L[p] > 128) b[2]++; } for (const k of ['nav', 'panel']) o[k] = [Math.round(o[k][0] / dpr / dpr), o[k][1], Math.round(o[k][2] / dpr / dpr)]; return o; };
  const resP1 = band(p1, lev), resR1 = band(r1, rlev);
  // clusters of over-level pixels on a 16 css px grid
  const cell = 16 * dpr, cl = new Map();
  for (const [x, y] of over) { const key = `${Math.floor(x / cell) * 16},${Math.floor(y / cell) * 16}`; cl.set(key, (cl.get(key) || 0) + 1); }
  const css = (x) => Math.round(x / dpr / dpr);
  const area = css(newPx), share = (100 * newPx) / n;
  const t2 = { area: area <= 2000, share: share <= 0.5, fill: maxFill <= 64, edge: maxEdge <= 128 };
  const pass = Object.values(t2).every(Boolean);
  const r = { stop: st.k, mP1: mP, mRef: m, p1Mask: css(nP), r1Mask: css(nR), overlap: css(both), p1Only: area, sharePct: +share.toFixed(3),
    fill: { area: css(newFill), max: maxFill, over64: css(fillOver) }, edge: { area: css(newEdge), max: maxEdge, over128: css(edgeOver) },
    bboxCss: newPx ? bb.map((v) => Math.round(v / dpr)) : null, overCells16: [...cl.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k2, c]) => `${k2}:${css(c)}`), t2, verdict: pass ? 'T2 PASS' : 'T2 FAIL', residue: { P1: resP1, R1: resR1 } };
  out.push(r);
  console.log(`${st.k.padEnd(8)} m ${mP.toFixed(5)}/${m.toFixed(5)} P1 ${r.p1Mask} R1 ${r.r1Mask} both ${r.overlap} | P1-only ${area} css px (${r.sharePct} %) fill ${r.fill.area} max ${maxFill} (>64 ${r.fill.over64}) edge ${r.edge.area} max ${maxEdge} (>128 ${r.edge.over128}) bbox ${r.bboxCss} | over-cells ${r.overCells16.join(' ')} | ${r.verdict}`);
  console.log(`         residue [area css px, max shade, area > 128]: nav P1 ${resP1.nav} R1 ${resR1.nav} | panel P1 ${resP1.panel} R1 ${resR1.panel}`);
}
const all = out.every((r) => r.verdict === 'T2 PASS');
console.log(`GATE (b) exact-m P1-only: ${all ? 'T2 PASS at every stop' : `T2 FAIL at ${out.filter((r) => r.verdict !== 'T2 PASS').map((r) => r.stop).join(', ')}`} (dil ${DIL} device px)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ pxDir, refDir, dil: DIL, stops: out, all }, null, 1));

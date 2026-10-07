// logo-close: from g0px.mjs / g0sim.mjs side-by-side diff PNGs (A | B | diff x20, scale 1), the differing pixels
// outside the logo's band and inside it. The logo moves only along the nav bar's row: the band is the bar row,
// css y BAND_T..BAND_B (default 25..56) and x 0..BAND_R (default 300), which holds every logo position with 0 < m < 1
// at <= 640 px (logo-path.mjs: x 32..169 + width 122 * 0.75). Saturated diff values (>= 13 levels) read as 13.
//   node fixes/logo-close/probe/outside-logo.mjs <dir of diff PNGs> [dpr] [top offset in device px, Simulator only] [file name part, e.g. -diff]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { png } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const [dir, dprArg, topArg, pat, gate] = process.argv.slice(2);
// optional gate JSON (g0px.mjs <phase>-<W>.json or g0sim.mjs g0sim.json): its kept-v14 masks (countdowns, #platform
// glints; css rects, + MARGIN css px: g0px 30, g0sim 40) are left out, as the gates' own "outside the masks" counts do
const MARGIN = Number(process.env.MARGIN || 30);
const G = gate ? JSON.parse(readFileSync(gate, 'utf8')) : null;
const masksOf = (stop) => {
  if (!G) return [];
  const rs = G.runs ? G.runs.flatMap((r) => (r.frames || []).filter((f) => f.stop === stop).flatMap((f) => (f.state.mask || []).map(([l, t, r2, b]) => ({ l, t, r: r2, b }))))
    : Object.values(G.stops).flatMap((a) => a.filter((s) => s.stop === stop).flatMap((s) => s.mask || []));
  return rs.map((q) => ({ l: q.l - (G.runs ? MARGIN : 0), t: q.t - (G.runs ? MARGIN : 0), r: q.r + (G.runs ? MARGIN : 0), b: q.b + (G.runs ? MARGIN : 0) }));
};
const SKIP_T = Number(process.env.SKIP_T ?? -1e9); // css y above which rows are left out (Simulator: the status bar, < 0)
const dpr = Number(dprArg || 3), top = Number(topArg || 0);
const BT = Number(process.env.BAND_T || 25), BB = Number(process.env.BAND_B || 56), BR = Number(process.env.BAND_R || 300);
const out = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.png') && (!pat || x.includes(pat))).sort()) {
  const P = png(readFileSync(join(dir, f)));
  const w = (P.w - 2) / 3, ox = 2 * w + 2;
  const stop = f.replace(/^.*?-(?=(open|close|closed|held|rev|join)\b)/, '').replace(/(-diff)?\.png$/, ''), MK = masksOf(stop);
  let maskedN = 0, inN = 0, inMax = 0, outN = 0, outMax = 0, outBox = null;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < w; x++) {
    const i = (y * P.w + ox + x) * P.bpp, v = P.px[i];
    if (!v) continue;
    const d = Math.min(13, Math.round(v / 20)) || 1, cy = (y - top) / dpr, cx = x / dpr;
    if (cy < SKIP_T) continue;
    if (MK.some((q) => cx >= q.l && cx < q.r && cy >= q.t && cy < q.b)) { maskedN++; continue; }
    if (cy >= BT && cy <= BB && cx <= BR) { inN++; inMax = Math.max(inMax, d); }
    else { outN++; outMax = Math.max(outMax, d); outBox = outBox ? [Math.min(outBox[0], cx), Math.min(outBox[1], cy), Math.max(outBox[2], cx), Math.max(outBox[3], cy)] : [cx, cy, cx, cy]; }
  }
  out.push({ f, stop, maskedN, inN, inMax, outN, outMax, outBox: outBox && outBox.map(Math.round) });
  console.log(`${stop}: masked ${maskedN}; logo band ${inN} px (max ${inMax}${inMax >= 13 ? '+' : ''}); outside ${outN} px (max ${outMax}${outMax >= 13 ? '+' : ''})${outBox ? ' box ' + JSON.stringify(outBox.map(Math.round)) : ''}`);
}

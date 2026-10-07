// logo-close: a frame strip of the nav bar's left half from g0px.mjs side-by-side PNGs (A | B | diff, scale 1, DPR 3):
// row 1 = A, row 2 = B (ROWS=a or ROWS=b: one of them), one column per stop (in the order given), crop css x 0..CW, y CY0..CY1.
//   node fixes/logo-close/probe/strip.mjs out/logo-close/px/end-430x775 'g0_vs_dir:lcfix' close-520,close-560,close-600,closed-rest out/logo-close/strip-close.png
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { png, encodePng } = await import(join(WT, 'fixes/best-build/gates/lib.mjs'));
const [dir, pair, stops, out] = process.argv.slice(2);
const D = Number(process.env.DPR || 3), CW = Number(process.env.CW || 215), CY0 = Number(process.env.CY0 || 16), CY1 = Number(process.env.CY1 || 66), G = 9;
const cw = CW * D, ch = (CY1 - CY0) * D, S = stops.split(',');
const ROWS = process.env.ROWS || 'ab', RW = [...ROWS].map((r) => (r === 'a' ? 0 : 1));
const W = S.length * cw + (S.length + 1) * G, H = RW.length * ch + (RW.length + 1) * G, img = Buffer.alloc(W * H * 3, 255);
S.forEach((stop, k) => {
  const P = png(readFileSync(join(dir, `${pair}-${stop}.png`))), w = (P.w - 2) / 3;
  for (const [row, ox] of RW.map((r, k) => [k, r ? w + 1 : 0])) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = ((CY0 * D + y) * P.w + ox + x) * P.bpp, o = ((G + row * (ch + G) + y) * W + G + k * (cw + G) + x) * 3;
    img[o] = P.px[i]; img[o + 1] = P.px[i + 1]; img[o + 2] = P.px[i + 2];
  }
});
writeFileSync(out, encodePng(W, H, img));
console.log(`STRIP ${out}: ${S.join(' | ')}; top row A, bottom row B`);

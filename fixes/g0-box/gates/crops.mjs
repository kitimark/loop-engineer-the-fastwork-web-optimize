// g0-box: zoomed crops of the N worst T2 stops of a seek outdir (after t2.mjs wrote <outdir>/t2.json), for the proposal.
//   node fixes/g0-box/gates/crops.mjs <outdir> <dest dir> [--n 6] [--size 32] [--zoom 4] [--dpr 3]
// Per stop (worst edge max first): <stop>-a.png = A crop | the per-pixel difference, <stop>-b.png = B crop | the same difference (same size, for a slider) (x1:
// white = the largest difference), both nearest-neighbour zoomed. The crop is size x size CSS px around the stop's
// worst edge pixel, clamped to the frame. Prints one line per stop. No browser.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport')[0]); process.exit(0); }
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [dir, dest] = argv; mkdirSync(dest, { recursive: true });
const N = Number(arg('--n', '6')), S = Number(arg('--size', '32')), Z = Number(arg('--zoom', '4')), dpr = Number(arg('--dpr', '3'));
const t2 = JSON.parse(readFileSync(join(dir, 't2.json'), 'utf8'));
const worst = t2.rows.filter((r) => r.edgeAt).sort((a, b) => b.edgeMax - a.edgeMax).slice(0, N);
function crc32(buf) { let crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { let c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
const chunk = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const td = Buffer.concat([Buffer.from(t), dd]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, cr]); };
/** panels: [(x, y) => [r, g, b]] each W x H device px; written side by side with a 2-px grey gap, zoomed Z */
function write(file, panels, W, H) {
  const gap = 2, OW = (panels.length * W + (panels.length - 1) * gap) * Z, OH = H * Z, row = OW * 3 + 1, raw = Buffer.alloc(row * OH, 128);
  for (let oy = 0; oy < OH; oy++) { raw[oy * row] = 0; for (let ox = 0; ox < OW; ox++) {
    const ux = Math.floor(ox / Z), pi = Math.floor(ux / (W + gap)), px = ux - pi * (W + gap); if (px >= W) continue;
    const [r, g, b] = panels[pi](px, Math.floor(oy / Z)); const o = oy * row + 1 + ox * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(OW, 0); ih.writeUInt32BE(OH, 4); ih[8] = 8; ih[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
for (const r of worst) {
  const A = pngPixels(readFileSync(join(dir, `A-${r.stop}.png`))), V = pngPixels(readFileSync(join(dir, `V-${r.stop}.png`))), d = delta(A, V);
  const W = S * dpr, H = S * dpr;
  const x0 = Math.max(0, Math.min(A.w - W, Math.round((r.edgeAt[0] - S / 2) * dpr))), y0 = Math.max(0, Math.min(A.h - H, Math.round((r.edgeAt[1] - S / 2) * dpr)));
  const px = (P) => (x, y) => { const i = ((y0 + y) * P.w + x0 + x) * 4; return [P.px[i], P.px[i + 1], P.px[i + 2]]; };
  const dp = (x, y) => { const v = d[(y0 + y) * A.w + x0 + x]; return [v, v, v]; };
  write(join(dest, `${r.stop}-a.png`), [px(A), dp], W, H);
  write(join(dest, `${r.stop}-b.png`), [px(V), dp], W, H);
  console.log(`${r.stop} edge max ${r.edgeMax} at css ${r.edgeAt} | crop css ${Math.round(x0 / dpr)},${Math.round(y0 / dpr)} ${S}x${S} x${Z} | ${r.cssPx2} css px2 (${r.pct} %)`);
}

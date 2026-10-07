// g0-box: quick two-arm scan of a seek outdir (no A/A rule): per stop, pixels > 8 levels, max level and the bounding box
// (css px) of the pixels > 8. Diagnostic only; the verdict is seek.mjs --score (PR-010 four loads).
//   node fixes/g0-box/gates/avscan.mjs <outdir> [A] [V] [dpr 3]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { pngPixels, delta } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const [dir, A = 'A', V = 'V', dpr = 3] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.startsWith(A + '-') && f.endsWith('.png')).sort();
let worst = 0;
for (const f of files) {
  const g = V + f.slice(A.length);
  let a, b; try { a = pngPixels(readFileSync(join(dir, f))); b = pngPixels(readFileSync(join(dir, g))); } catch { continue; }
  const d = delta(a, b); let n = 0, mx = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let p = 0; p < d.length; p++) { const v = d[p]; if (v > mx) mx = v; if (v > 8) { n++; const x = p % a.w, y = (p / a.w) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  worst = Math.max(worst, mx);
  const pct = (100 * n / d.length).toFixed(3);
  console.log(`${f.slice(A.length + 1, -4).padEnd(12)} max ${String(mx).padStart(3)} >8 ${String(n).padStart(7)} (${pct} %)${n ? ` box css ${Math.round(x0 / dpr)},${Math.round(y0 / dpr)}-${Math.round(x1 / dpr)},${Math.round(y1 / dpr)}` : ''}`);
}
console.log('WORST max', worst);

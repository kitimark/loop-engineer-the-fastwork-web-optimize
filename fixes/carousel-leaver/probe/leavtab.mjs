// print the leaver per frame for slide #n of a series file: t since slide start, rect x/w, opacity, transform, clip, css width, border
import { readFileSync } from 'node:fs';
const [f, nArg] = process.argv.slice(2); const S = JSON.parse(readFileSync(f, 'utf8')); const want = Number(nArg || 1);
const isL = (i) => /is-exit/.test(i[6]) ; const sliding = (fr) => /is-sliding/.test(fr.cls) || fr.imgs.some(isL);
let n = 0, t0 = null, prev = false;
for (const fr of S) {
  const on = sliding(fr);
  if (on && !prev) { n++; t0 = fr.t; }
  if (n === want && (on || prev)) {
    const L = fr.imgs.find((i) => isL(i) || (/is-sliding/.test(fr.cls) && /st5-lead/.test(i[6])));
    const F1 = fr.imgs[fr.imgs.indexOf(L) + 1];
    console.log(`${(fr.t - t0).toFixed(0).padStart(4)} ${on ? 'S' : 'r'} L x ${L ? (L[0] - fr.cx).toFixed(2) : '-'} w ${L ? L[1].toFixed(2) : '-'} o ${L ? L[2].toFixed(3) : '-'} tf ${L ? L[3] : '-'} clip ${L ? L[5] : '-'} cssw ${L ? L[8] : '-'} bw ${L ? L[10] : '-'} | F1 x ${F1 ? (F1[0] - fr.cx).toFixed(2) : '-'}`);
  }
  if (n === want && prev && !on) break;
  prev = on;
}

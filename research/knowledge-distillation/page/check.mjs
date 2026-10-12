// Structural checks on the built page: duplicate ids, SVG text past its viewBox (estimated widths), unbalanced tags.
import { readFileSync } from 'node:fs';
const html = readFileSync(process.argv[2], 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('ids', ids.length, 'duplicates', [...new Set(dup)].join(', ') || 'none');
let bad = 0;
for (const m of html.matchAll(/<svg viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*aria-label="([^"]{0,50})[^>]*>(.*?)<\/svg>/gs)) {
  const [, W, H, label, body] = m;
  for (const t of body.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
    const a = t[1], txt = t[2].replace(/&[a-z]+;/g, 'x');
    const x = +(/\sx="([-\d.]+)"/.exec(a)?.[1] ?? 0) + +(/\sdx="([-\d.]+)"/.exec(a)?.[1] ?? 0), y = +(/\sy="([-\d.]+)"/.exec(a)?.[1] ?? 0);
    const cls = /class="([^"]*)"/.exec(a)?.[1] || '';
    const fs = /t-d/.test(cls) ? 13 : /t-p/.test(cls) ? 11.5 : /t-s/.test(cls) ? 11 : 12;
    const em = /t-d|t-p/.test(cls) ? 0.56 : 0.6;
    const w = txt.length * fs * em;
    const anc = /text-anchor="(\w+)"/.exec(a)?.[1] || 'start';
    const x0 = anc === 'start' ? x : anc === 'middle' ? x - w / 2 : x - w, x1 = x0 + w;
    if (x0 < -1 || x1 > +W + 1 || y > +H + 1 || y < fs * 0.7) { bad++; console.log(`  [${label}] "${txt}" x ${x0.toFixed(0)}..${x1.toFixed(0)} of ${W}, y ${y} of ${H}`); }
  }
}
console.log('svg text overflow estimates:', bad);
const open = (html.match(/<details/g) || []).length, close = (html.match(/<\/details>/g) || []).length;
console.log('details', open, close, 'figure', (html.match(/<figure/g) || []).length, (html.match(/<\/figure>/g) || []).length, 'math', (html.match(/<math/g) || []).length, (html.match(/<\/math>/g) || []).length);

import fs from 'node:fs';
const f = process.argv[2]; const h = fs.readFileSync(f, 'utf8');
const voids = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const stack = []; let bad = 0; const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g; let m;
const strip = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
while ((m = re.exec(strip))) { if (!m[2]) continue; const [, close, tag0, , self] = m; const tag = tag0.toLowerCase();
  if (self || (voids.has(tag) && !close)) continue;
  if (!close) stack.push(tag); else { const top = stack.pop(); if (top !== tag) { bad++; if (bad < 5) console.log('MISMATCH', top, '/', tag, 'at', m.index); if (top) stack.push(top); } } }
console.log('nesting mismatches', bad, 'unclosed', stack.slice(-5));
const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('ids', ids.length, 'dups', [...new Set(dup)]);
const hrefs = [...h.matchAll(/href="#([^"]+)"/g)].map(x => x[1]); const miss = [...new Set(hrefs.filter(x => !ids.includes(x)))];
const urls = [...h.matchAll(/url\(#([^)]+)\)/g)].map(x => x[1]); const missu = [...new Set(urls.filter(x => !ids.includes(x)))];
console.log('internal links', hrefs.length, 'missing', miss, 'svg url refs missing', missu);
const srcs = [...h.matchAll(/<li id="src-(\d+)" value="(\d+)">/g)].map(x => [+x[1], +x[2]]);
console.log('sources', srcs.length, 'ids==values', srcs.every(([a, b]) => a === b), 'sequential', srcs.every(([a], i) => a === i + 1));

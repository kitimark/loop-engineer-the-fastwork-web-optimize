// edit-article-p1: link/id/figure checks on the v65 draft (read-only).
import fs from 'node:fs';
const f = process.argv[2]; const h = fs.readFileSync(f, 'utf8');
const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
const hrefs = [...h.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const missing = [...new Set(hrefs.filter((x) => !ids.includes(x)))];
const jsIds = [...h.matchAll(/getElementById\("?'?([\w-]+)/g)].map((m) => m[1]).filter((x) => !ids.includes(x));
console.log('ids', ids.length, 'dup', dup, 'hrefs', hrefs.length, 'missing', missing, 'js ids missing', jsIds);
// figure numbers in page order
const caps = [...h.matchAll(/capture-ready · 1200 px · Fig\. (\d+)/g)].map((m) => +m[1]);
const figIds = [...h.matchAll(/<figure class="cap"[^>]*id="fig-(\d+)"/g)].map((m) => +m[1]);
console.log('cap-bar figs', caps.join(','), '| figure ids', figIds.join(','));
const capNotes = [...h.matchAll(/\(Fig\. (\d+)[;)]/g)].map((m) => +m[1]);
console.log('caption self-refs', capNotes.join(','));
// src numbering
const srcIds = [...h.matchAll(/<li id="src-(\d+)" value="(\d+)"/g)].map((m) => [+m[1], +m[2]]);
console.log('src ids ok', srcIds.every(([a, b], i) => a === b && a === i + 1), srcIds.length);
const firstCite = []; for (const m of h.matchAll(/href="#src-(\d+)"/g)) if (!firstCite.includes(+m[1])) firstCite.push(+m[1]);
console.log('first-citation order', firstCite.join(','));
const unused = srcIds.map(([a]) => a).filter((a) => !hrefs.includes('src-' + a)); console.log('uncited sources', unused);
// every Fig. N mention in text, with context
const text = h.replace(/<script[\s\S]*?<\/script>/g, '');
const refs = [...text.matchAll(/Fig\. (\d+)/g)].map((m) => +m[1]); console.log('Fig. mentions', [...new Set(refs)].sort((a, b) => a - b).join(','));
// tag balance for common block tags (outside scripts)
for (const t of ['figure', 'figcaption', 'p', 'ul', 'li', 'table', 'tr', 'td', 'th', 'div', 'svg', 'video', 'h3', 'h4', 'blockquote', 'ol', 'footer', 'main', 'thead', 'tbody', 'a', 'em', 'strong', 'text', 'g']) {
  const o = (text.match(new RegExp(`<${t}[\\s>]`, 'g')) || []).length, c = (text.match(new RegExp(`</${t}>`, 'g')) || []).length;
  if (o !== c) console.log('UNBALANCED', t, o, c);
}
const media = [...h.matchAll(/(?:src)="((?:videos|gifs)\/[^"]+)"/g)].map((m) => m[1]); console.log('media', media.length, 'dups', media.filter((x, i) => media.indexOf(x) !== i));

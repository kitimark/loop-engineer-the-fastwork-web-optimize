// Does a rendering update (rAF callbacks = FireAnimationFrame) run inside Composite windows? (DESCRIPTIVE)
// Counts record types overall and FireAnimationFrame by whether a Composite is open around it, and, per heavy frame,
// whether a FireAnimationFrame starts inside the same Composite window as the heavy Layout before that Layout.
//   node raf.mjs <sim125 dir> <read-inval126.mjs path>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, readerPath] = process.argv.slice(2);
const { loadRun } = await import(readerPath);
const names = ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5', 'wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'];
const types = {}, faf = { inComposite: 0, outside: 0 };
let heavyN = 0, heavyRafBefore = 0;
for (const n of names) {
  const R = loadRun(dir, n);
  const tl = JSON.parse(readFileSync(join(dir, `tl-${n}.json`), 'utf8'));
  const off = tl.offsetMs || 0;
  const comps = [];
  const walk = (r, inC) => {
    types[r.type] = (types[r.type] || 0) + 1;
    if (r.type === 'FireAnimationFrame') faf[inC ? 'inComposite' : 'outside']++;
    if (r.type === 'Composite') comps.push(r);
    for (const c of r.children || []) walk(c, inC || r.type === 'Composite');
  };
  for (const r of tl.recs || []) walk(r, false);
  for (const q of R.frames) {
    if (!q.heavy || !q.L || !q.L.anc.includes('Composite')) continue;
    heavyN++;
    const lt = q.L.t;
    const c = comps.find((x) => x.startTime * 1000 - off <= lt && (x.endTime ?? Infinity) * 1000 - off >= lt);
    if (!c) continue;
    let found = false;
    const d = (x) => { for (const ch of x.children || []) { if (ch.type === 'FireAnimationFrame' && ch.startTime * 1000 - off < lt) found = true; d(ch); } };
    d(c);
    if (found) heavyRafBefore++;
  }
}
console.log('record types:', JSON.stringify(Object.fromEntries(Object.entries(types).sort((a, b) => b[1] - a[1]))));
console.log('FireAnimationFrame inside a Composite window:', faf.inComposite, 'outside:', faf.outside);
console.log(`heavy Layouts inside Composite: ${heavyN}; with a FireAnimationFrame earlier in the same window: ${heavyRafBefore}`);

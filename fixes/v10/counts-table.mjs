// v10 (int-v8): copy of fix-end-morph-p1's fixes/end-morph-p1/counts-table.mjs at 0af9e816, with credit; unchanged. Its header:
// end-morph-p1 (fix-end-morph-p1): phase totals of em-chrome.mjs result files side by side (paint, paint area in kpx,
// raster, style, layout, forced) plus rev 3's #platform opacity sample. Counts only.
//   node fixes/end-morph-p1/counts-table.mjs <em-*.json> ...
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const files = process.argv.slice(2);
const R = files.map((f) => ({ f: basename(f), r: JSON.parse(readFileSync(f, 'utf8')) }));
const phases = ['approach', 'open', 'restOpen', 'close', 'restClosed', 'liftOpenDrag', 'liftOpen', 'liftCloseDrag', 'liftClose'];
console.log('phase'.padEnd(14), R.map((x) => `${x.r.label}(${x.r.served?.js?.slice(0, 6)})`.padEnd(46)).join(''));
for (const ph of phases) {
  const cells = R.map(({ r }) => { const t = r.phases[ph]?.totals; return t ? `p ${t.paint} / ${Math.round(t.paintArea / 1000)}k r ${t.raster} s ${t.style} l ${t.layout} pp ${t.prePaint}`.padEnd(46) : '-'.padEnd(46); });
  console.log(ph.padEnd(14), cells.join(''));
}
console.log('platformOp'.padEnd(14), R.map(({ r }) => { const p = r.platformOpacity; return p ? `frames ${p.frames} >=1: ${p.atOrAbove1} max ${p.max} (fade>=1 ${p.fadeAtOrAbove1})`.padEnd(46) : '-'.padEnd(46); }).join(''));

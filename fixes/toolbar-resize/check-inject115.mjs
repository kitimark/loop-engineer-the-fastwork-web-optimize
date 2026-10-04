#!/usr/bin/env node
// toolbar-resize P-115 applied-arm gate (frozen with the card; same rule as check-inject110): an arm run counts only when
// its gesture file's inject record shows the arm applied; otherwise INSUFFICIENT (never NONE), and the record is reported.
//   node fixes/toolbar-resize/check-inject115.mjs <folder> <run> ...   (run = <arm>-H<n>; C runs need arm 'none')
// Per arm: record present, arm matches; non-C: applied === true and css holds the arm's rule;
//   svh: measured.cardMinH ends in px and is > 0;  csl: computed contain includes 'layout';
//   cva: measured.showcaseH > 0 and computed content-visibility is 'auto'.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...runs] = process.argv.slice(2);
if (!dir || !runs.length) { console.error('usage: check-inject115.mjs <folder> <run> ...'); process.exit(1); }
const RULE = { svh: '.start-selling-future-card{min-height:', csl: '.start-selling-future-showcase{contain:layout', cva: '.start-selling-future-showcase{content-visibility:auto' };
let bad = 0;
for (const run of runs) {
  const arm = run.replace(/-H\d+$/, ''), want = arm === 'C' ? 'none' : arm;
  let v = null; const why = [];
  try { const g = JSON.parse(readFileSync(join(dir, `g-${run}.json`), 'utf8')); v = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof v === 'string') v = JSON.parse(v); } catch (e) { why.push(`read: ${e.message}`); }
  if (!v) why.push('no inject record');
  else {
    if (v.arm !== want) why.push(`arm ${v.arm} != ${want}`);
    if (arm !== 'C') {
      if (v.applied !== true) why.push('applied not true');
      if (!String(v.css || '').includes(RULE[arm] || '?')) why.push(`css lacks ${RULE[arm]}`);
      if (arm === 'svh' && !(/px$/.test(v.measured?.cardMinH || '') && parseFloat(v.measured.cardMinH) > 0)) why.push(`cardMinH ${v.measured?.cardMinH}`);
      if (arm === 'csl' && !String(v.cs?.contain || '').includes('layout')) why.push(`computed contain ${v.cs?.contain}`);
      if (arm === 'cva' && !(v.measured?.showcaseH > 0 && v.cs?.cv === 'auto')) why.push(`showcaseH ${v.measured?.showcaseH} cv ${v.cs?.cv}`);
    }
  }
  if (why.length) bad++;
  console.log(`${run.padEnd(9)} ${why.length ? 'NOT-APPLIED -> INSUFFICIENT: ' + why.join('; ') : 'applied'} | ${JSON.stringify(v).slice(0, 300)}`);
}
console.log(`INJECT-GATE ${bad ? `${bad} run(s) not applied` : 'all applied'}`);

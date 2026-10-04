#!/usr/bin/env node
// toolbar-resize P-110 applied-arm gate (ops C1, frozen with the card): an arm run counts only when its gesture file's
// inject record shows the arm really applied; otherwise its call is INSUFFICIENT (never NONE) and the record is reported.
//   node fixes/toolbar-resize/check-inject110.mjs <folder> <run> ...   (run = <arm>-H<n>; C runs need arm 'none')
// Rules, per arm run (g-<run>.json, run.inject[0].value, or top-level inject[0].value):
//   - record present, value.arm === the run's arm (C: 'none');
//   - non-C: applied === true and value.css contains the arm's rule
//       nav: '.start-selling-top-nav{position:absolute'   pain: '.pain-sticky{position:relative'   navpain: both
//       ph/ps/pc: the child selector + 'content-visibility:hidden';
//   - ph/ps/pc: heightsBefore[arm] > 0 and the child's class is among value.kids.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...runs] = process.argv.slice(2);
if (!dir || !runs.length) { console.error('usage: check-inject110.mjs <folder> <run> ...'); process.exit(1); }
const SEL = { ph: 'start-selling-future-header', ps: 'start-selling-future-showcase', pc: 'start-selling-future-community-pill' };
const RULE = { nav: ['.start-selling-top-nav{position:absolute'], pain: ['.pain-sticky{position:relative'], navpain: ['.start-selling-top-nav{position:absolute', '.pain-sticky{position:relative'] };
for (const k of Object.keys(SEL)) RULE[k] = [`.${SEL[k]}{content-visibility:hidden`];
let bad = 0;
for (const run of runs) {
  const arm = run.replace(/-H\d+$/, ''), want = arm === 'C' ? 'none' : arm;
  let v = null, why = [];
  try { const g = JSON.parse(readFileSync(join(dir, `g-${run}.json`), 'utf8')); const rec = (g.run?.inject || g.inject || [])[0]; v = rec?.value ?? null; if (typeof v === 'string') v = JSON.parse(v); } catch (e) { why.push(`read: ${e.message}`); }
  if (!v) why.push('no inject record');
  else {
    if (v.arm !== want) why.push(`arm ${v.arm} != ${want}`);
    if (arm !== 'C') {
      if (v.applied !== true) why.push('applied not true');
      for (const r of RULE[arm] || ['?']) if (!String(v.css || '').includes(r)) why.push(`css lacks ${r}`);
      if (SEL[arm]) {
        if (!(v.heightsBefore?.[arm] > 0)) why.push(`heightsBefore.${arm} = ${v.heightsBefore?.[arm]}`);
        if (!(v.kids || []).includes(SEL[arm])) why.push(`${SEL[arm]} not among kids ${JSON.stringify(v.kids)}`);
      }
    }
  }
  if (why.length) bad++;
  console.log(`${run.padEnd(11)} ${why.length ? 'NOT-APPLIED -> INSUFFICIENT' : 'applied'}${why.length ? ': ' + why.join('; ') : ''} | ${JSON.stringify(v).slice(0, 300)}`);
}
console.log(`INJECT-GATE ${bad ? `${bad} run(s) not applied` : 'all applied'}`);

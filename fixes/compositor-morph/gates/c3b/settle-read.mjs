// c3b gate reader (arch-compositor-morph): settle-css.json's differences, with the time-driven animations set aside
// (the countdown's digit cells and strip, .svelte-1quva9c; the panel's column marquee, .start-selling-morph-col-track;
// both move with the clock, not with m, as the A/A shows), grouped by element and property.
//   node fixes/compositor-morph/gates/c3b/settle-read.mjs <out/cm/settlecss-…/settle-css.json>
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const d = j.diff || [];
const isTime = (x) => /svelte-1quva9c|morph-col-track/.test(x.what);
const rest = d.filter((x) => !isTime(x));
console.log(`${process.argv[2]}: ${d.length} differences, ${d.length - rest.length} time-driven, ${rest.length} other`);
const kinds = {};
for (const x of rest) {
  const k = `${x.what.replace(/^[0-9]+ /, '')} ${x.props ? x.props.map((p) => p.split(':')[0]).join(',') : `${x.a} | ${x.b}`}`;
  (kinds[k] ||= []).push(x.m);
}
for (const [k, ms] of Object.entries(kinds)) console.log(`  ${ms.length} x  ${k.slice(0, 240)}  (m ${ms.join(' ')})`);

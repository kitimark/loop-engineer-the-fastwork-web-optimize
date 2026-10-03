// Run score.mjs on every pair and print one summary line per pair (P-086 (1)/(3) result tables).
// node pairs.mjs <dir> <prefix> A~A2,A~E,...   (files <dir>/<prefix><arm>.json; writes <dir>/score-<prefix><a>-<b>.json)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const [dir, prefix, pairs] = process.argv.slice(2);
const SC = join(dirname(fileURLToPath(import.meta.url)), 'score.mjs');
for (const p of pairs.split(',')) {
  const [a, b] = p.split('~');
  const out = execFileSync(process.execPath, [SC, join(dir, `${prefix}${a}.json`), join(dir, `${prefix}${b}.json`)], { encoding: 'utf8' });
  writeFileSync(join(dir, `score-${prefix}${a}-${b}.json`), out);
  const r = JSON.parse(out), m = r.max;
  const keys = ['L.xr', 'L.w', 'L.o', 'L.s', 'F1.xr', 'F1.w', 'F2.xr', 'F3.xr', 'N.xr', 'N.w', 'N.o', 'N.s'];
  console.log(`${a}~${b} slides ${r.compared} matched ${r.matched} skipped ${r.skipped} swapRace ${r.stateMismatch.length} | ${keys.map((k) => `${k} ${m[k] ? m[k].d : '-'}`).join(' | ')}`);
  console.log(`   ends(endOffset/snap/frames) ${a}: ${r.ends.ref.map((e) => `${e.endOffset}/${e.snap}/${e.nFrames}`).join(' ')}  ${b}: ${r.ends.other.map((e) => `${e.endOffset}/${e.snap}/${e.nFrames}`).join(' ')}`);
}

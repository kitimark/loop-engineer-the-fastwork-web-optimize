#!/usr/bin/env node
// P-137o block 2 run gates (fixes/end-bg/README.md "P-137o"): research/serious-heat/phone/p129-gates.mjs on the fs-fixed
// script. The frozen P-129 reader's readRun gives G1-G5 and the sentinel numbers unchanged; its G6 (the program must be
// fs-v1, 8737f212c0ff) is replaced by the same check against fs-fixed's compiled hash (FIXED_HASH). Gate lines only.
//   node fixes/end-bg/phone/p137f-gates.mjs <folder> <run>...   (E* counted, S* sentinels)
// Lines: "GATES <run> E ok idle <s>" | "GATES <run> E INVALID <why>" | "SENTINEL <run> PASS|FAIL fps <f> slow <s>".
// Exit 0 all ok / PASS, 1 any INVALID / FAIL, 2 usage.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { readRun, SENT } = await import(pathToFileURL(join(here, '..', '..', '..', 'research', 'serious-heat', 'p129-read.mjs')).href);
export const FIXED_HASH = '194dab83774c'; // g-fastshort-fixed-v1.json compiled (iphone.mjs gesture --dry-run, 2026-10-11)
export function gateRun(g, tl, role) {
  const r = readRun(g, tl, role);
  r.why = r.why.filter((w) => !w.startsWith('G6'));
  if (!String(g?.program?.hash || '').startsWith(FIXED_HASH)) r.why.push(`G6 script hash ${String(g?.program?.hash || 'none').slice(0, 12)} is not fs-fixed ${FIXED_HASH}`);
  if (role === 'S') r.sentinel = r.fps >= SENT.fps && r.slowShare <= SENT.slow && !r.why.length ? 'PASS' : 'FAIL';
  return r;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, ...runs] = process.argv.slice(2);
  if (!dir || !runs.length || dir === '--help' || dir === '-h') { console.log('usage: node fixes/end-bg/phone/p137f-gates.mjs <folder> <run>...'); process.exit(dir === '--help' || dir === '-h' ? 0 : 2); }
  const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  let bad = 0;
  for (const run of runs) {
    const role = run[0] === 'S' ? 'S' : 'E';
    const g = load(join(dir, `g-${run}.json`));
    if (!g) { console.log(role === 'S' ? `SENTINEL ${run} FAIL no record` : `GATES ${run} E INVALID no record`); bad++; continue; }
    const r = gateRun(g, role === 'S' ? null : load(join(dir, `tl-${run}.json`)), role);
    if (role === 'S') { if (r.sentinel !== 'PASS') bad++; console.log(`SENTINEL ${run} ${r.sentinel} fps ${r.fps} slow ${r.slowShare}${r.why.length ? ` (${r.why.join('; ')})` : ''}`); }
    else if (r.why.length) { bad++; console.log(`GATES ${run} E INVALID ${r.why.join('; ')}`); }
    else console.log(`GATES ${run} E ok idle ${r.idle}`);
  }
  process.exit(bad ? 1 : 0);
}

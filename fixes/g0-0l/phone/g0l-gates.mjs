#!/usr/bin/env node
// g0.0l copy (fix-scrollcb-g0, 2026-10-09) of fix-g0-box's p129-gates-g0.mjs: reads g0l-read-gates.mjs (G6: the two g0.0l programs).
// P-129 runner's gate check (card: research/serious-heat/README.md §5 "P-129"): runs the FROZEN reader's per-run gates
// (p129-read.mjs readRun: G1-G6, and the sentinel rule for S runs) on single runs as the block goes, so the runner knows
// which counted run to re-run (block step 5) and whether S0/S1 pass. It prints ONLY gate results (gate reasons, idle,
// sentinel fps and slow share), never part A/B/S numbers: the block's readings stay unseen until the block ends.
//   node fixes/g0-box/phone/p129-gates-g0.mjs <folder> <run>...   (P-164 g0 copy: reads p129-read-g0.mjs, FS_HASH 38d7fe5d7fa8)
// Role from the run name's first letter: E (early) / L (late) counted Timeline-on runs (g-<run>.json + tl-<run>.json;
// re-runs are named <run>r, e.g. E2r), S (sentinel, Timeline off, g-<run>.json only).
// Lines: "GATES <run> <role> ok idle <s>" | "GATES <run> <role> INVALID <why>" | "SENTINEL <run> PASS|FAIL fps <f> slow <s> [why]".
// Exit 0 every run ok / PASS, 1 any INVALID / FAIL, 2 usage.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { readRun } = await import(pathToFileURL(join(here, 'g0l-read-gates.mjs')).href);
const [dir, ...runs] = process.argv.slice(2);
if (!dir || !runs.length || dir === '--help' || dir === '-h') {
  console.log('usage: node research/serious-heat/phone/p129-gates.mjs <folder> <run>...  (E*, L* counted; S* sentinels)');
  process.exit(dir === '--help' || dir === '-h' ? 0 : 2);
}
const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
let bad = 0;
for (const run of runs) {
  const role = run[0];
  if (!['E', 'L', 'S'].includes(role)) { console.log(`GATES ${run} ? INVALID unknown role (run names start with E, L or S)`); bad++; continue; }
  const g = load(join(dir, `g-${run}.json`));
  if (!g) { console.log(role === 'S' ? `SENTINEL ${run} FAIL no record` : `GATES ${run} ${role} INVALID no record g-${run}.json`); bad++; continue; }
  const tl = role === 'S' ? null : load(join(dir, `tl-${run}.json`));
  const r = readRun(g, tl, role);
  if (role === 'S') {
    if (r.sentinel !== 'PASS') bad++;
    console.log(`SENTINEL ${run} ${r.sentinel} fps ${r.fps} slow ${r.slowShare}${r.why.length ? ` (${r.why.join('; ')})` : ''}`);
  } else if (r.why.length) {
    bad++; console.log(`GATES ${run} ${role} INVALID ${r.why.join('; ')}`);
  } else console.log(`GATES ${run} ${role} ok idle ${r.idle}`);
}
process.exit(bad ? 1 : 0);

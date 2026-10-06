#!/usr/bin/env node
// panel-height (fix-panel-height, user T-204 #20/#22): the open end-of-page nav panel is sized from 100vh on phones
// (<= 640 px), and iOS Safari resolves vh to the large viewport (toolbar collapsed), so with the toolbar shown the open
// panel runs past the visible screen. Two CSS-only options, each a delta on A (fix-end-morph-p1's v10 candidate =
// v9-final + F1/U2 + I-219 + P1 + P1b (a); snapshot out/ph/A, JS ed44af454a92 / CSS cfb8b8c5b019):
//   S (svh): --panel-h: calc(100svh - 24px)   in the top-nav <= 640 px rule and in P1's .fw-rv-glass[data-fw-rv] rule
//   D (dvh): --panel-h: calc(100dvh - 24px)   same two places
// Both places must change together: P1's glass repeats the nav's formulas (its own --panel-h) and P1b's probe
// .fw-rv-size inherits the nav's --panel-h.
// Writes out/ph/{S,D}/ (overlay dirs = A with the CSS changed; JS unchanged), fixes/panel-height/delta-{svh,dvh}.diff
// (CSS only, against A's CSS; 3 lines of context) and prints sha256/12 of every file.
//   node fixes/panel-height/build.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = '_app/immutable/assets/2.gBuqKVzi.css', JS = '_app/immutable/nodes/2.DyWL8TcE.js';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const die = (m) => { console.error('REFUSED: ' + m); process.exit(3); };
const A = join(WT, 'out/ph/A');
const css = readFileSync(join(A, CSS), 'utf8'), js = readFileSync(join(A, JS));
if (sha(css) !== 'cfb8b8c5b019') die(`A's CSS is ${sha(css)}, expected cfb8b8c5b019`);
console.log(`A    js ${sha(js)} css ${sha(css)}`);
// the two rules, matched with their selector so nothing else can be hit
const SITES = [
  { name: 'top-nav <= 640 px', re: /(@media \(width<=640px\) \{\n  \.start-selling-top-nav\.svelte-1dcozpm \{\n(?:    [^\n]*\n)*?    --panel-h: )calc\(100vh - 24px\);/g },
  { name: 'P1 .fw-rv-glass', re: /(  \.fw-rv-glass\[data-fw-rv\] \{\n(?:    [^\n]*\n)*?    --panel-h: )calc\(100vh - 24px\);/g },
];
for (const [key, unit] of [['S', 'svh'], ['D', 'dvh']]) {
  let out = css;
  for (const s of SITES) {
    const n = [...out.matchAll(s.re)].length;
    if (n !== 1) die(`${s.name}: ${n} matches, expected 1`);
    out = out.replace(s.re, `$1calc(100${unit} - 24px);`);
  }
  const dir = join(WT, 'out/ph', key);
  rmSync(dir, { recursive: true, force: true });
  cpSync(A, dir, { recursive: true });
  rmSync(join(dir, CSS), { force: true }); // the snapshot copies are read-only
  writeFileSync(join(dir, CSS), out);
  const d = spawnSync('diff', ['-u', '--label', `a/${CSS}`, '--label', `b/${CSS}`, join(A, CSS), join(dir, CSS)], { encoding: 'utf8' });
  if (d.status !== 1) die(`diff exit ${d.status}`);
  const f = join(WT, 'fixes/panel-height', `delta-${unit}.diff`);
  writeFileSync(f, d.stdout);
  const hunks = (d.stdout.match(/^@@/gm) || []).length, minus = (d.stdout.match(/^-[^-]/gm) || []).length;
  if (hunks !== 2 || minus !== 2) die(`${unit}: ${hunks} hunks, ${minus} removed lines (expected 2 and 2)`);
  console.log(`${key}    js ${sha(readFileSync(join(dir, JS)))} css ${sha(out)}   delta-${unit}.diff ${sha(d.stdout)} (${hunks} hunks)`);
}

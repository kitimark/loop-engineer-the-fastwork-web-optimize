#!/usr/bin/env node
// The test suite runner behind `npm test` and `npm run test:changed` (user T-105 #2, ts-testspeed; library
// tools/lib/test-run.mjs; numbers: research/architecture/test-speed.md).
//
//   node tools/test-run.mjs                       # npm test: tests/{unit,e2e,hooks}/*.test.mjs, longest file first
//   node tools/test-run.mjs --changed [--base main] [--list]
//                                                 # npm run test:changed: only the files mapped to this branch's changes
//                                                 # (committed since the merge-base, staged, unstaged, untracked). For
//                                                 # iteration only: the pre-commit hook and landing run the full suite.
//   node tools/test-run.mjs <file>...             # these files (same order rule)
//   options: --concurrency N (default 8, lead decision 2026-10-04: npm-test keeps lane weight 2; FW_TEST_CONCURRENCY), --timeout MS (per test, default 120000),
//            --plan (print the order and the predicted wall time, run nothing),
//            --record (after a full, passing run: write the per-file seconds to tests/durations.json),
//            --durations FILE (read / --record another per-file seconds file; the tests use it)
//
// Why not `node --test <globs>`: it sorts the files by name, so the slowest e2e files (sim*.test.mjs, ~165 s alone)
// started last and set the wall time. node:test's run() keeps the given order: longest first (LPT) from
// tests/durations.json (a file without an entry counts DEFAULT_SEC). Same per-file process isolation, same spec
// output, same per-test timeout; exit 1 when a test fails or is cancelled, 2 on a usage error.
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSuite, readDurations, orderLongestFirst, predictWall, fileSeconds, testsForChanges, readToolSources, DURATIONS_FILE, DEFAULT_SEC } from './lib/test-run.mjs';
import { toolingChanges } from './lib/scope.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const usage = 'usage: node tools/test-run.mjs [--changed [--base <ref>] [--list]] [--concurrency N] [--timeout MS] [--plan] [--record] [--durations FILE] [<test file>...]';
let changed = false, list = false, plan = false, record = false, base = 'main', durationsFile = join(REPO, DURATIONS_FILE);
let concurrency = Number(process.env.FW_TEST_CONCURRENCY || 8), timeout = 120000;
const given = [];
const num = (a, v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) { console.error(`test-run: ${a} needs a whole number >= 1 (got ${v})`); process.exit(2); } return n; };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--changed') changed = true;
  else if (a === '--list') list = true;
  else if (a === '--plan') plan = true;
  else if (a === '--record') record = true;
  else if (a === '--base') base = argv[++i];
  else if (a === '--durations') durationsFile = resolve(argv[++i] ?? '');
  else if (a === '--concurrency') concurrency = num(a, argv[++i]);
  else if (a === '--timeout') timeout = num(a, argv[++i]);
  else if (a === '-h' || a === '--help') { console.log(usage); process.exit(0); }
  else if (a.startsWith('-')) { console.error(`test-run: unknown option ${a}\n${usage}`); process.exit(2); }
  else given.push(relative(REPO, resolve(a)));
}
if (!Number.isInteger(concurrency) || concurrency < 1) { console.error(`test-run: FW_TEST_CONCURRENCY must be a whole number >= 1 (got ${process.env.FW_TEST_CONCURRENCY})`); process.exit(2); }
if (changed && given.length) { console.error(`test-run: --changed or files, not both\n${usage}`); process.exit(2); }

const suite = listSuite(REPO);
let files = given.length ? given : suite;
if (changed) {
  let ch;
  try { ch = toolingChanges({ cwd: REPO, base }); } catch (e) { console.error(`test-run: ${e.message}`); process.exit(2); }
  const paths = [...new Set(ch.changes.map((c) => c.path))];
  const testSources = Object.fromEntries(suite.map((f) => [f, readFileSync(join(REPO, f), 'utf8')]));
  const r = testsForChanges(paths, { suite, toolSources: readToolSources(REPO), testSources });
  if (r.all) console.log(`TEST-CHANGED all ${suite.length} files: ${r.why}`);
  else {
    console.log(`TEST-CHANGED ${r.files.length} of ${suite.length} files for ${paths.length} changed tooling path(s) since ${base}`);
    for (const f of r.files) console.log(`  ${f}  (${r.why[f]})`);
  }
  files = r.all ? suite : r.files;
  console.log('TEST-CHANGED is for iteration only: the pre-commit hook and landing run the full npm test');
  if (list) process.exit(0);
  if (!files.length) process.exit(0);
}
const durations = readDurations(durationsFile);
files = orderLongestFirst(files, durations);
if (plan) {
  for (const f of files) console.log(`${(Number.isFinite(durations[f]) ? durations[f].toFixed(1) : `~${DEFAULT_SEC}`).padStart(7)} s  ${f}`);
  console.log(`TEST-PLAN ${files.length} files at concurrency ${concurrency}: predicted wall ${Math.round(predictWall(files, durations, concurrency))} s (summed ${Math.round(files.reduce((a, f) => a + (durations[f] ?? DEFAULT_SEC), 0))} s; from ${relative(REPO, durationsFile)})`);
  process.exit(0);
}

const t0 = Date.now();
let failed = 0;
const events = [];
const stream = run({ files: files.map((f) => join(REPO, f)), concurrency, timeout });
stream.on('test:fail', (e) => { failed++; events.push(e); });
stream.on('test:pass', (e) => events.push(e));
const out = stream.compose(new spec());
out.pipe(process.stdout, { end: false });
out.on('end', () => {
  const wallSec = (Date.now() - t0) / 1000;
  const per = Object.entries(fileSeconds(events)).map(([f, s]) => [relative(REPO, f), s]).sort((a, b) => b[1] - a[1]);
  console.log(`TEST-RUN ${files.length} files, concurrency ${concurrency}, wall ${wallSec.toFixed(1)} s; slowest: ${per.slice(0, 3).map(([f, s]) => `${f} ${s.toFixed(1)} s`).join(', ')}`);
  if (record) {
    if (failed || changed || (given.length && durationsFile === join(REPO, DURATIONS_FILE))) console.log(`TEST-RUN not recorded: ${failed ? 'a test failed' : 'not the full suite'}`);
    else {
      writeFileSync(durationsFile, JSON.stringify({ note: 'per-file seconds (sum of top-level test durations) from `node tools/test-run.mjs --record`; only the order of npm test reads it', concurrency, recordedAt: new Date().toISOString(), files: Object.fromEntries(per.map(([f, s]) => [f, Math.round(s * 10) / 10]).sort((a, b) => (a[0] < b[0] ? -1 : 1))) }, null, 1) + '\n');
      console.log(`TEST-RUN recorded ${per.length} files in ${relative(REPO, durationsFile)}`);
    }
  }
  if (failed) process.exitCode = 1;
});

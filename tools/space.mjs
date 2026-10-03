#!/usr/bin/env node
// Disk space report (incident I-095). READ-ONLY: it measures and lists; it never deletes, moves or changes a file.
// The user decides what to delete (Claude Code agents may not delete existing files outside their own worktree).
//
//   node tools/space.mjs report [--list <file.tsv>] [--json] [--idle-hours 2] [--scratch <dir>]... [--top 12]
//
// Lists, with sizes: (1) throwaway Chrome profiles no running process uses, (2) out/ of finished worktrees (branch
// has nothing main lacks, or its board row is done / landed / dropped / parked; "check first" when a process still
// runs in it, it was written to in the last --idle-hours, or it holds evidence), (3) the session scratch folders,
// (4) the must-keep evidence of the evidence.json manifests (fixes/README.md "Evidence keep-list"), and the free space.
// --list writes every path with its category and status (TSV) for review. --scratch replaces the scratch roots found
// by default (/private/tmp/claude-<uid>/<this project>/<session>/scratchpad). Classification: tools/lib/space.mjs.
//
// Paths in the output are local (this Mac only): never paste them into a committed file (CLAUDE.md Hard rule 12).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { mainCheckout } from './lib/paths.mjs';
import { buildReport, renderText, renderList } from './lib/space.mjs';
import { list as boardRows } from './lib/status.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const opts = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const flag = (n) => argv.includes(`--${n}`);
const USAGE = 'usage: node tools/space.mjs report [--list <file.tsv>] [--json] [--idle-hours 2] [--scratch <dir>]... [--top 12]   (read-only)';
const die = (m) => { console.error(m); process.exit(2); };

if (cmd !== 'report' || flag('help')) die(USAGE);
const known = new Set(['--list', '--json', '--idle-hours', '--scratch', '--top']);
for (let i = 1; i < argv.length; i++) {
  if (!known.has(argv[i])) die(`unknown argument ${argv[i]}\n${USAGE}`);
  if (argv[i] !== '--json') { if (argv[i + 1] === undefined) die(`${argv[i]} needs a value\n${USAGE}`); i++; }
}
const idleHours = Number(opt('idle-hours', 2));
if (!(idleHours >= 0)) die('--idle-hours must be a number >= 0');
const top = Number(opt('top', 12));
if (!(Number.isInteger(top) && top > 0)) die('--top must be a positive integer');

let rows = [];
try { rows = boardRows(); } catch {}
const scratch = opts('scratch');
const r = buildReport({ mainRoot: mainCheckout(), idleHours, rows, ...(scratch.length ? { scratchRoots: scratch } : {}) });
if (flag('json')) console.log(JSON.stringify(r, null, 1));
else console.log(renderText(r, { top }));
const listFile = opt('list');
if (listFile) {
  const f = resolve(process.cwd(), listFile);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, renderList(r));
  (flag('json') ? console.error : console.log)(`\nlist file: ${f} (review it; nothing was deleted)`);
}

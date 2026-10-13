#!/usr/bin/env node
// Disk space report (incident I-095) and auto-clean (incident I-124, user T-049 #27).
//
//   node tools/space.mjs report [--list <file.tsv>] [--json] [--idle-hours 2] [--scratch <dir>]... [--top 12]
//   node tools/space.mjs prune [--apply] [--json] [--scratch <dir>]... [--top 12]
//   node tools/space.mjs restore [--dry-run | --apply] [--json] [--root <out dir>]... [--archive] [--no-git]
//
// `report` is READ-ONLY: it measures and lists; it never deletes, moves or changes a file. `prune` alone is a dry run
// (what would go and why the rest stays); `prune --apply` removes only the auto-clean classes of tools/lib/space-prune.mjs
// (leftover Chrome profiles, uncited full-frame image files after a record + thumbnails, rebuildable snapshot copies,
// each unused for a day) and logs every removal with its size to .git/fastwork-mirror/space/prune.log (kept, for the
// write-up). Never: JSON, Markdown, logs, results, phone records, recordings, cited, fresh or held paths.
// `idle.mjs watch --by lead` runs the same prune by itself (FW_SPACE_AUTOPRUNE=0 turns that off).
// `restore` (incident I-275) puts pruned images back from their frames-pruned.json records: the same path in site/, else
// an exact name + size match in the console store, any checkout's out/, research/ or git history when all candidates
// have the same content (tools/lib/space-restore.mjs). A dry run unless --apply; --root (default the main checkout's
// out/) is repeatable; out/archive only with --archive. --apply also moves records out of deploy trees into pruned-records/.
//
// Lists, with sizes: (1) throwaway Chrome profiles no running process uses, (2) out/ of finished worktrees (branch
// has nothing main lacks, or its board row is done / landed / dropped / parked; "check first" when a process still
// runs in it, it was written to in the last --idle-hours, or it holds evidence), (3) the session scratch folders,
// (4) the must-keep evidence of the evidence.json manifests (fixes/README.md "Evidence keep-list"), and the free space.
// --list writes every path with its category and status (TSV) for review. --scratch replaces the scratch roots found
// by default (/private/tmp/claude-<uid>/<this project>/<session>/scratchpad). Classification: tools/lib/space.mjs.
//
// It refuses (exit 3, WAIT) beside anyone else's exclusive normal hold on chrome-measure (a timing A/B, a build, a phone
// part that wants a quiet Mac): its du, ps, lsof and git load the Mac for ~30 s. Run it inside your own hold, which
// waits its turn: node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools/space.mjs report
//
// Paths in the output are local (this Mac only): never paste them into a committed file (CLAUDE.md Hard rule 12).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { mainCheckout, resolveTree, sharedStateDir } from './lib/paths.mjs';
import { buildReport, renderText, renderList, spaceRunRefusalNow, fmtSize, worktrees } from './lib/space.mjs';
import { runPrune, renderPlan, pruneLogFile } from './lib/space-prune.mjs';
import { planRestore, applyRestore, renderRestore } from './lib/space-restore.mjs';
import { list as boardRows } from './lib/status.mjs';
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const opts = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : []));
const flag = (n) => argv.includes(`--${n}`);
const USAGE = 'usage: node tools/space.mjs report [--list <file.tsv>] [--json] [--idle-hours 2] [--scratch <dir>]... [--top 12]   (read-only)\n       node tools/space.mjs prune [--apply] [--json] [--scratch <dir>]... [--top 12]   (dry run unless --apply)\n       node tools/space.mjs restore [--dry-run | --apply] [--json] [--root <out dir>]... [--archive] [--no-git]   (dry run unless --apply)';
const die = (m) => { console.error(m); process.exit(2); };

if (!['report', 'prune', 'restore'].includes(cmd) || flag('help')) die(USAGE);
const known = new Set(cmd === 'report' ? ['--list', '--json', '--idle-hours', '--scratch', '--top'] : cmd === 'prune' ? ['--apply', '--json', '--scratch', '--top'] : ['--apply', '--dry-run', '--json', '--root', '--archive', '--no-git']);
const bare = new Set(['--json', '--apply', '--dry-run', '--archive', '--no-git']);
for (let i = 1; i < argv.length; i++) {
  if (!known.has(argv[i])) die(`unknown argument ${argv[i]}\n${USAGE}`);
  if (!bare.has(argv[i])) { if (argv[i + 1] === undefined) die(`${argv[i]} needs a value\n${USAGE}`); i++; }
}
const idleHours = Number(opt('idle-hours', 2));
if (!(idleHours >= 0)) die('--idle-hours must be a number >= 0');
const top = Number(opt('top', 12));
if (!(Number.isInteger(top) && top > 0)) die('--top must be a positive integer');

const busy = spaceRunRefusalNow();
if (busy) { console.error(busy); process.exit(3); }

const scratch = opts('scratch');
if (cmd === 'restore') {
  if (flag('apply') && flag('dry-run')) die('--apply and --dry-run exclude each other');
  const mainRoot = mainCheckout();
  const outRoots = opts('root').map((r) => resolve(process.cwd(), r));
  const plan = planRestore({
    outRoots: outRoots.length ? outRoots : [join(mainRoot, 'out')],
    siteRoot: resolveTree('site'),
    searchDirs: [join(sharedStateDir(), 'console'), ...worktrees(mainRoot).map((w) => join(w.path, 'out')), join(mainRoot, 'research')],
    gitRoot: flag('no-git') ? null : mainRoot,
    archive: flag('archive'),
  });
  const result = flag('apply') ? applyRestore(plan, { gitRoot: mainRoot, by: process.env.FW_AGENT || 'space.mjs', log: (m) => console.error(m) }) : null;
  const show = (p) => relative(mainRoot, p) || '.';
  const text = flag('json') ? JSON.stringify({ plan, result }, null, 1) : renderRestore(plan, result, show);
  await new Promise((r) => process.stdout.write(text + '\n', r)); // a pipe takes 64 KB before exit() would cut it
  process.exit(result && result.failed.length ? 1 : 0);
}
if (cmd === 'prune') {
  const apply = flag('apply');
  const log = (m) => console.error(m);
  const res = runPrune({ mainRoot: mainCheckout(), apply, by: process.env.FW_AGENT || 'space.mjs', log, ...(scratch.length ? { scratchRoots: scratch } : {}) });
  if (res.busy) { console.error(`WAIT: another prune runs (pid ${res.busy.pid}, by ${res.busy.by || '?'}); try again when it ends`); process.exit(3); }
  if (flag('json')) console.log(JSON.stringify({ plan: res.plan, result: res.result }, null, 1));
  else {
    console.log(renderPlan(res.plan, { top }));
    if (res.result) console.log(`\nREMOVED ${res.result.removed.length} item(s), ${fmtSize(res.result.bytes)}; skipped ${res.result.skipped.length}; log: .git/fastwork-mirror/space/${pruneLogFile().split('/').pop()}`);
    else console.log('\nDRY RUN: nothing was deleted. node tools/space.mjs prune --apply removes these (idle.mjs watch --by lead does it by itself).');
  }
  process.exit(0);
}
let rows = [];
try { rows = boardRows(); } catch {}
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

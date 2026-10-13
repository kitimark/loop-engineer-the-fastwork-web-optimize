// tools/release/evidence.mjs: save the uncommitted work of every worktree as a branch of the release mirror (I-269).
//   node tools/release/evidence.mjs <source-repo> <mirror.git> [--dry-run]
// For every worktree of <source-repo> (the main checkout and every linked one) whose `git status` shows uncommitted
// or untracked, not ignored changes, it creates branch evidence/<worktree-name> in <mirror.git> ONLY: a commit on
// the worktree's HEAD whose tree is HEAD plus the worktree's files as they are now (deleted files removed). It
// stages through a temporary GIT_INDEX_FILE with --git-dir=<mirror> --work-tree=<worktree>, so the source repo, its
// index files and the worktrees stay byte-identical (every source-side git call runs with --no-optional-locks).
// rewrite.mjs runs it before the history rewrite, so evidence branches are scrubbed and SHA-remapped like the rest.
// Skipped (one SKIP line each): a clean worktree, a missing or prunable one, an unborn HEAD, a HEAD commit the mirror
// lacks. Prints "EVIDENCE <branch> base <sha10> modified <n> untracked <n> deleted <n>" per branch, then
// "EVIDENCE_DONE <n> branches". --dry-run lists what it would save and writes nothing. The commits carry the identity
// of the worktree's HEAD commit. Refuses (REFUSED, exit 2) a <mirror.git> that is the source's git dir, inside it or
// inside a worktree. Exit 0, 2 usage or refused.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { gitEnv } from './check.mjs';
import { tildify } from './rules.mjs';

exitOnHelp(import.meta.url);

const run = (args, { cwd, env, input } = {}) => execFileSync('git', args, { cwd, env: gitEnv(env), input, encoding: 'utf8', maxBuffer: 2 ** 30, stdio: ['pipe', 'pipe', 'pipe'] });
const src = (repo, ...a) => run(['--no-optional-locks', '-C', repo, ...a]);

/** The source repo's worktrees: [{path, head, branch, bare, prunable, main}] (`git worktree list --porcelain`). */
export function listWorktrees(source) {
  const out = src(source, 'worktree', 'list', '--porcelain');
  const list = [];
  for (const block of out.split('\n\n').map((b) => b.trim()).filter(Boolean)) {
    const w = { main: list.length === 0 };
    for (const l of block.split('\n')) {
      const [k, ...rest] = l.split(' ');
      const v = rest.join(' ');
      if (k === 'worktree') w.path = v;
      else if (k === 'HEAD') w.head = v;
      else if (k === 'branch') w.branch = v.replace(/^refs\/heads\//, '');
      else if (k === 'bare') w.bare = true;
      else if (k === 'detached') w.detached = true;
      else if (k === 'prunable') w.prunable = true;
    }
    list.push(w);
  }
  return list;
}

/** Changed paths of a worktree, read-only: {modified:[], untracked:[], deleted:[]} (porcelain v1, no renames). */
export function worktreeChanges(wt) {
  const out = src(wt, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=all');
  const ch = { modified: [], untracked: [], deleted: [] };
  for (const e of out.split('\0').filter(Boolean)) {
    const xy = e.slice(0, 2), p = e.slice(3);
    if (xy === '??') ch.untracked.push(p);
    else if (xy.includes('D') && !existsSync(join(wt, p))) ch.deleted.push(p);
    else ch.modified.push(p);
  }
  return ch;
}

const realish = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const within = (p, dir) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/** Why the mirror is inside the source repo's git dir or one of its worktrees (or contains one), or null. */
export function mirrorInSource(source, mirror, worktrees = listWorktrees(source)) {
  const m = realish(mirror);
  const common = realish(resolve(source, src(source, 'rev-parse', '--git-common-dir').trim()));
  if (within(m, common) || within(common, m)) return 'is the source repo\'s git dir (or inside it)';
  for (const w of worktrees) if (w.path && (within(m, realish(w.path)) || within(realish(w.path), m))) return 'is inside (or contains) a worktree of the source repo';
  return null;
}

const refSafe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.]+$/g, '').replace(/\.\.+/g, '.').replace(/\.lock$/, '-lock') || 'worktree';

/**
 * Create evidence/<name> branches in the mirror; returns [{branch, base, commit, modified, untracked, deleted}] and
 * calls log(line) for EVIDENCE / SKIP lines. Writes only to the mirror (objects and refs) and a temp index.
 */
export function makeEvidence({ source, mirror, dryRun = false, log = () => {}, now = new Date() }) {
  const M = (args, opts = {}) => run(['--git-dir', mirror, ...args], opts);
  const worktrees = listWorktrees(source);
  const why = mirrorInSource(source, mirror, worktrees);
  if (why) throw new Error(`refused: the mirror ${tildify(mirror)} ${why}; evidence is written to the output mirror only`);
  const taken = new Set(M(['for-each-ref', '--format=%(refname)', 'refs/heads/evidence/']).split('\n').filter(Boolean));
  const made = [];
  for (const w of worktrees) {
    if (w.bare) continue;
    const name = refSafe(basename(w.path || 'worktree'));
    if (!w.path || w.prunable || !existsSync(w.path)) { log(`SKIP ${name}: worktree missing or prunable`); continue; }
    if (!w.head || /^0+$/.test(w.head)) { log(`SKIP ${name}: no HEAD commit`); continue; }
    const ch = worktreeChanges(w.path);
    const n = ch.modified.length + ch.untracked.length + ch.deleted.length;
    if (!n) continue;
    try { M(['cat-file', '-e', `${w.head}^{commit}`]); } catch { log(`SKIP ${name}: its HEAD ${w.head.slice(0, 10)} is not in the mirror (no branch points at it)`); continue; }
    let branch = `evidence/${name}`;
    for (let i = 2; taken.has(`refs/heads/${branch}`); i++) branch = `evidence/${name}-${i}`;
    const counts = `modified ${ch.modified.length} untracked ${ch.untracked.length} deleted ${ch.deleted.length}`;
    if (dryRun) { log(`EVIDENCE ${branch} base ${w.head.slice(0, 10)} ${counts} (dry run)`); made.push({ branch, base: w.head, ...ch }); continue; }
    const tmp = mkdtempSync(join(tmpdir(), 'fw-evidence-'));
    try {
      // the identity of the worktree's HEAD commit: one the history already has (check.mjs --source allows those)
      const [an, ae] = M(['log', '-1', '--format=%an%x00%ae', w.head]).replace(/\n$/, '').split('\0');
      const env = { GIT_INDEX_FILE: join(tmp, 'index'), GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: ae, GIT_COMMITTER_NAME: an, GIT_COMMITTER_EMAIL: ae };
      const MW = (args, opts = {}) => run(['--git-dir', mirror, '--work-tree', w.path, ...args], { ...opts, cwd: tmp, env: { ...env, ...(opts.env || {}) } });
      MW(['read-tree', w.head]);
      MW(['update-index', '--add', '--remove', '-z', '--stdin'], { input: [...ch.modified, ...ch.untracked, ...ch.deleted].join('\0') + '\0' });
      const tree = MW(['write-tree']).trim();
      if (tree === M(['rev-parse', `${w.head}^{tree}`]).trim()) { log(`SKIP ${name}: status shows changes but the files equal HEAD`); continue; }
      const msg = `evidence: uncommitted work in worktree ${name}\n\nSaved when the release was built (tools/release/evidence.mjs, I-269), read from the\nworktree's files without touching them.\n\nWorktree branch: ${w.branch || '(detached HEAD)'}\nBase: ${w.head}\nModified ${ch.modified.length}, untracked ${ch.untracked.length}, deleted ${ch.deleted.length}\n`;
      const date = now.toISOString();
      const commit = MW(['commit-tree', tree, '-p', w.head, '-F', '-'], { input: msg, env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }).trim();
      M(['update-ref', `refs/heads/${branch}`, commit, '']);
      taken.add(`refs/heads/${branch}`);
      made.push({ branch, base: w.head, commit, ...ch });
      log(`EVIDENCE ${branch} base ${w.head.slice(0, 10)} ${counts}`);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  log(`EVIDENCE_DONE ${made.length} branches`);
  return made;
}

function main(argv) {
  const pos = argv.filter((a) => !a.startsWith('--'));
  const bad = argv.filter((a) => a.startsWith('--') && a !== '--dry-run');
  if (pos.length !== 2 || bad.length) { console.error('usage: evidence.mjs <source-repo> <mirror.git> [--dry-run]'); return 2; }
  const [source, mirror] = pos.map((p) => resolve(p));
  const why = mirrorInSource(source, mirror);
  if (why) { console.log(`REFUSED the mirror ${tildify(mirror)} ${why}; evidence is written to the output mirror only`); return 2; }
  if (!existsSync(join(mirror, 'objects'))) { console.error(`evidence: ${tildify(mirror)} is not a git dir`); return 2; }
  makeEvidence({ source, mirror, dryRun: argv.includes('--dry-run'), log: (l) => console.log(l) });
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));

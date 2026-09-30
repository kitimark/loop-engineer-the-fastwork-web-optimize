// Where things live, from any checkout: the main checkout or a linked git worktree.
//
// The mirrored site (site/, site-pretty/) is gitignored, so a fresh `git worktree add` doesn't have
// it. Tools therefore look it up in this order:
//   1. $FW_MIRROR_HOME: a directory that contains site/ (and usually site-pretty/)
//   2. this checkout, if it has site/.mirror/manifest.json (the main checkout)
//   3. the main checkout: dirname of `git rev-parse --git-common-dir`
// Worktrees read the baseline in place. They never copy or modify it; per-fix changes go into
// fixes/<topic>/overlay/, which serve.mjs layers on top (see fixes/README.md).
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** Root of *this* checkout (main checkout or worktree): the parent of tools/. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(...args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

let _common;
/** Absolute path of the shared .git directory (same for every worktree of this repo). */
export function gitCommonDir() {
  if (_common === undefined) {
    const d = git('rev-parse', '--path-format=absolute', '--git-common-dir');
    _common = d ? resolve(d) : null;
  }
  return _common;
}

/** True when this checkout is a linked worktree rather than the main checkout. */
export function isLinkedWorktree() {
  const gd = git('rev-parse', '--path-format=absolute', '--git-dir');
  const cd = gitCommonDir();
  return !!(gd && cd && resolve(gd) !== cd);
}

/** The main checkout (where site/ normally lives). */
export function mainCheckout() {
  const cd = gitCommonDir();
  if (!cd) return REPO;
  return basename(cd) === '.git' ? dirname(cd) : cd; // bare repos: best effort
}

const hasMirror = (dir) => existsSync(join(dir, 'site', '.mirror', 'manifest.json'));
const BASELINE_TREES = new Set(['site', 'site-pretty']);

/** Directory holding the shared, read-only baseline (site/, site-pretty/) and shared out/certs. */
export function mirrorHome() {
  if (process.env.FW_MIRROR_HOME) return resolve(process.env.FW_MIRROR_HOME);
  if (hasMirror(REPO)) return REPO;
  return mainCheckout();
}

/**
 * Resolve a tree name like "site" or "site-pretty" (or a path). Absolute paths are kept.
 * Relative paths are tried against this checkout first, then against mirrorHome().
 */
export function resolveTree(p) {
  if (isAbsolute(p)) return p;
  // An explicit $FW_MIRROR_HOME wins over a site/ that happens to exist in this checkout (tests point
  // the tools at a fixture baseline this way, even when run from the main checkout).
  // The baseline trees never fall back: with FW_MIRROR_HOME set, a missing site/ must fail loudly rather
  // than silently serve this checkout's own copy. Other names (custom roots) may still fall back.
  if (process.env.FW_MIRROR_HOME) {
    const h = resolve(process.env.FW_MIRROR_HOME, p);
    if (existsSync(h) || BASELINE_TREES.has(p)) return h;
  }
  const local = resolve(REPO, p);
  if (existsSync(local)) return local;
  return resolve(mirrorHome(), p);
}

/** Directory for cross-worktree state (measurement lock). Lives in the shared .git dir. */
export function sharedStateDir() {
  if (process.env.FW_STATE_DIR) return resolve(process.env.FW_STATE_DIR);
  return join(gitCommonDir() || join(REPO, 'out'), 'fastwork-mirror');
}

/** Short stable id for this checkout, e.g. "wt-countdown-3f2a1c". */
export function checkoutId() {
  return basename(REPO) + '-' + createHash('sha1').update(REPO).digest('hex').slice(0, 6);
}

/** Deterministic per-checkout starting port in [5200, 5999] (5173 stays the main session's). */
export function autoPortBase() {
  const h = createHash('sha1').update(REPO).digest().readUInt32BE(0);
  return 5200 + (h % 800);
}

export function sha256File(f) {
  return createHash('sha256').update(readFileSync(f)).digest('hex');
}

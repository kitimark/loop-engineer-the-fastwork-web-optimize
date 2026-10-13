// The study's baseline is a frozen snapshot of fastwork.com, COMMITTED on main (user decision 2026-10-01):
//   site/          byte-identical production mirror (tools/mirror.mjs)
//   site-pretty/   the same tree, JS/CSS formatted by an exact Prettier version (tools/prettify.mjs)
//   baseline.json  the pin: snapshot id, git tree ids of both dirs, build id, crawl date, Prettier version
//
// Snapshot id: b<_app/version.json build>-<first 8 hex of contentHash>, where contentHash =
// sha256("site <tree>\nsite-pretty <tree>\n") over the two git tree ids (a tree id hashes every byte
// below it), so the id changes whenever any served or formatted byte does.
//
// Every tool that reads or serves the baseline calls requireBaseline() at start. It checks the
// checkout each tree resolves to (tools/lib/paths.mjs resolveTree: this checkout's own site/ if it has
// one, else the main checkout; worktrees are normally sparse and have none):
//   - its HEAD tree ids equal this checkout's pin       else BASELINE-MISMATCH
//   - git status shows no change under site/ site-pretty/ else BASELINE-MODIFIED (a re-mirror under review)
// and refuses (exit 3) with the fix. FW_BASELINE_ALLOW_MODIFIED=1 (the user's, while reviewing a new
// snapshot) downgrades the refusal to a warning; results then record baseline.state != "ok".
// No baseline.json (temp test repos, branches from before the snapshot commit) = "unpinned": unchecked.
// I-268, the public release: a checkout whose HEAD does not track site/ / site-pretty/ at all (the release removes the
// snapshot from history; `npm run init` unpacks it from a Release file) but has the files: their git tree ids are
// computed in a throwaway git dir (untrackedTreeId) and compared with the pin: equal = ok, source "untracked, verified";
// different = BASELINE-MODIFIED. Cached by a stat fingerprint, so verify.mjs's per-run re-check stays fast. A checkout
// that tracks the snapshot (this study's repo) is checked exactly as before.
// I-270: the release's snapshot file ships with secret-shaped values redacted (third-party keys in vendored code); the
// snapshot asset of HEAD's tools/release/release-assets.json lists each such file as {path, rule, originalBlob,
// redactedBlob}. The check accepts exactly those: a listed file must have the redactedBlob and hold the packer's
// "[secret omitted: <rule>]" mark, its originalBlob goes into the tree id in its place (git needs only the blob id, not
// the original bytes), and every other byte must match the pin. Only where HEAD does not track the snapshot: a tracked
// snapshot (this study's repo) never takes a swap.
// A malformed listing, or one naming a path outside site/ or site-pretty/, refuses (BASELINE-MODIFIED).
// FW_MIRROR_HOME (tests' fixture baselines) = "override": unchecked.
import { existsSync, readFileSync, realpathSync, readdirSync, lstatSync, mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { REPO, resolveTree, isLinkedWorktree, mainCheckout } from './paths.mjs';

export const PIN_FILE = 'baseline.json';
export const TREES = ['site', 'site-pretty'];
/** Non-cone sparse patterns for agent worktrees: everything except the two snapshot dirs. */
export const SPARSE_PATTERNS = ['/*', '!/site/', '!/site-pretty/'];
export const ALLOW_ENV = 'FW_BASELINE_ALLOW_MODIFIED';
export const EXIT_BASELINE = 3;

/** How long one git call of the check may take (ms): verify.mjs re-checks between runs while it holds the
 *  lock, so a hung git (a stuck index.lock, a slow disk) must not block it past its I-023 watchdog. */
export const GIT_TIMEOUT_MS = 10000;
/** git in `cwd`; never takes optional locks (index refresh), so checking the main checkout can't
 *  collide with the lead's git commands there. Killed after GIT_TIMEOUT_MS ({ok: false, timedOut: true}). */
export function git(cwd, args, extraEnv = null) {
  const timeout = Number(process.env.FW_BASELINE_GIT_TIMEOUT_MS) || GIT_TIMEOUT_MS; // tests shorten it
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  if (extraEnv) for (const [k, v] of Object.entries(extraEnv)) { if (v == null) delete env[k]; else env[k] = v; }
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env, maxBuffer: 1 << 28, timeout, killSignal: 'SIGKILL' });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  return { ok: r.status === 0 && !r.error, out: (r.stdout || '').replace(/\n$/, ''), err: timedOut ? `timed out after ${timeout} ms` : (r.stderr || r.error?.message || '').trim(), ...(timedOut ? { timedOut: true } : {}) };
}
class GitTimeout extends Error {}
/** git for baselineStatus: a timeout aborts the check (state "timeout"), any other failure is the caller's. */
function gitChecked(cwd, args, extraEnv) {
  const r = git(cwd, args, extraEnv);
  if (r.timedOut) throw new GitTimeout(`git ${args.slice(0, 2).join(' ')} in ${cwd}: ${r.err}`);
  return r;
}
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };

export function contentHash(trees) {
  return createHash('sha256').update(TREES.map((t) => `${t} ${trees[t]}\n`).join('')).digest('hex');
}
export function snapshotId(build, trees) {
  return `b${build || 'unknown'}-${contentHash(trees).slice(0, 8)}`;
}

/** The pin of checkout `dir`: the parsed baseline.json, null when absent, {error} when unusable. */
export function readPin(dir = REPO) {
  const f = join(dir, PIN_FILE);
  if (!existsSync(f)) return null;
  try {
    const p = JSON.parse(readFileSync(f, 'utf8'));
    if (typeof p?.snapshot !== 'string' || !TREES.every((t) => /^[0-9a-f]{40,64}$/.test(p.trees?.[t] ?? ''))) throw new Error('needs "snapshot" and "trees": {"site", "site-pretty"} git tree ids');
    return p;
  } catch (e) {
    return { error: `${f}: ${e.message}` };
  }
}

/**
 * Compute the pin of the snapshot that is staged (from: 'index', after `git add site site-pretty`) or
 * committed (from: a revision such as 'HEAD') in checkout `cwd`. Throws when a tree is absent.
 */
export function computePin({ cwd = REPO, from = 'index', prettier = null, note = null, now = new Date() } = {}) {
  const trees = {}, files = {};
  for (const t of TREES) {
    const r = from === 'index' ? git(cwd, ['write-tree', `--prefix=${t}/`]) : git(cwd, ['rev-parse', '--verify', '-q', `${from}:${t}`]);
    if (!r.ok || !r.out) throw new Error(`${t}/ is not ${from === 'index' ? 'staged' : `committed at ${from}`} in ${cwd}${r.err ? ` (${r.err.split('\n')[0]})` : ''}. Stage it first: git add ${TREES.join(' ')}`);
    trees[t] = r.out;
    files[t] = git(cwd, ['ls-tree', '-r', '--name-only', trees[t]]).out.split('\n').filter(Boolean).length;
  }
  const blob = (p) => { const r = git(cwd, ['cat-file', 'blob', `${trees.site}:${p}`]); return r.ok ? r.out : null; };
  let build = null, manifest = null;
  try { build = String(JSON.parse(blob('_app/version.json')).version ?? '') || null; } catch {}
  try { manifest = JSON.parse(blob('.mirror/manifest.json')); } catch {}
  return {
    snapshot: snapshotId(build, trees),
    build,
    builtAt: /^\d{13}$/.test(build ?? '') ? new Date(Number(build)).toISOString() : null, // SvelteKit's default version.name: build time in ms
    origin: manifest?.origin ?? null,
    crawledAt: manifest?.lastRun ?? null,
    trees,
    contentHash: contentHash(trees),
    files,
    prettier,
    pinnedAt: now.toISOString(),
    note,
  };
}

/** True when checkout `dir` is a sparse checkout (agent worktrees: site/ and site-pretty/ left out). */
export function isSparse(dir = REPO) {
  return git(dir, ['sparse-checkout', 'list']).ok;
}

// ---- I-268: a snapshot present as files but not tracked by git (the public release) ----------------------------------
/** Files inside a tree that never count, in both modes: this repo's .gitignore keeps them out of the committed snapshot
 *  (serve.mjs's 404 log, a Chrome profile, Finder's .DS_Store), so an untracked copy must leave them out too. */
const VOLATILE = (rel) => rel === '.mirror/missing-local.txt' || rel === '.mirror/chrome-profile' || rel.startsWith('.mirror/chrome-profile/') || rel === '.DS_Store' || rel.endsWith('/.DS_Store');
const volatileExcludes = (t) => [`:(exclude)${t}/.mirror/missing-local.txt`, `:(exclude)${t}/.mirror/chrome-profile`, `:(exclude,glob)${t}/**/.DS_Store`];
/** git env for the throwaway git dir: nothing from a calling hook (GIT_DIR, GIT_INDEX_FILE, ...) may redirect it, and no
 *  system, global or inherited `-c` config (filters, attributes, templates) may change what it hashes. */
const ISOLATED = { GIT_DIR: null, GIT_WORK_TREE: null, GIT_COMMON_DIR: null, GIT_OBJECT_DIRECTORY: null, GIT_ALTERNATE_OBJECT_DIRECTORIES: null, GIT_INDEX_FILE: null, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: null, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_PARAMETERS: null, GIT_CONFIG_COUNT: null, GIT_TEMPLATE_DIR: null, GIT_ATTR_NOSYSTEM: '1' };
/** Byte-exact hashing whatever the user's git config says (autocrlf, file modes, attributes); uncompressed loose objects: speed. */
const RAW = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.fileMode=true', '-c', 'core.symlinks=true', '-c', 'core.attributesFile=/dev/null', '-c', 'core.compression=0', '-c', 'core.looseCompression=0', '-c', 'gc.auto=0'];

/**
 * A cheap fingerprint of directory `dir`: sha256 over every entry's relative path, mode, size, mtime, ctime and inode
 * (lstat, ns resolution; volatile files skipped). Any write changes ctime, which no tool can set back, so an unchanged
 * fingerprint means unchanged bytes. Null when `dir` is unreadable.
 */
export function treeFingerprint(dir) {
  const h = createHash('sha256');
  const walk = (abs, rel) => {
    for (const n of readdirSync(abs).sort()) {
      const r = rel ? `${rel}/${n}` : n;
      if (VOLATILE(r)) continue;
      const st = lstatSync(join(abs, n), { bigint: true });
      h.update(`${r}\0${st.mode}\0${st.size}\0${st.mtimeNs}\0${st.ctimeNs}\0${st.ino}\n`);
      if (st.isDirectory()) walk(join(abs, n), r);
    }
  };
  try { walk(dir, ''); } catch { return null; }
  return h.digest('hex');
}

/**
 * The git tree id that `<home>/<t>/` would have if committed (what baseline.json pins): `git add --force` into a
 * throwaway bare git dir and index under the system temp dir, then `write-tree --prefix=<t>/`; the temp dir is removed.
 * `home` need not be a git checkout (npm run init checks its staging dir with it). Throws on a git failure.
 * I-270 `swaps` (redactionList): each listed file below <t>/ must hash to its redactedBlob (else RedactionError) and
 * enters the tree as its originalBlob, so the id is the pinned one when nothing else changed.
 */
export function dirTreeId(home, t, { swaps = [] } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'fw-baseline-tree-'));
  try {
    const gd = join(tmp, 'g');
    const env = { ...ISOLATED, GIT_INDEX_FILE: join(tmp, 'index') };
    const init = gitChecked(tmp, ['init', '-q', '--bare', '--template=', gd], ISOLATED);
    if (!init.ok) throw new Error(`git init failed: ${init.err}`);
    const add = gitChecked(home, [...RAW, `--git-dir=${gd}`, `--work-tree=${home}`, 'add', '--force', '--', t, ...volatileExcludes(t)], env);
    if (!add.ok) throw new Error(`git add ${t} failed: ${add.err.split('\n')[0]}`);
    const mine = swaps.filter((s) => s.path.startsWith(`${t}/`));
    for (const s of mine) {
      const ls = gitChecked(home, [...RAW, `--git-dir=${gd}`, `--work-tree=${home}`, 'ls-files', '-s', '-z', '--', `:(literal)${s.path}`], env);
      const m = ls.out.split('\0').map((l) => /^(\d{6}) ([0-9a-f]+) 0\t(.*)$/s.exec(l)).find((x) => x?.[3] === s.path);
      if (!ls.ok || !m) throw new RedactionError(`${s.path} is listed as redacted (${s.rule}) but is not a file of ${t}/`);
      if (m[2] !== s.redactedBlob) throw new RedactionError(`${s.path} is listed as redacted (${s.rule}) but its blob ${m[2].slice(0, 10)} is not the listed ${s.redactedBlob.slice(0, 10)}`);
      // a redacted file shows where: a listing that names a file the packer never redacted is no redaction
      let body = '';
      try { body = readFileSync(join(home, s.path), 'latin1'); } catch {}
      if (!s.rule.split(',').some((id) => body.includes(`[secret omitted: ${id}]`))) throw new RedactionError(`${s.path} is listed as redacted (${s.rule}) but holds no "[secret omitted: …]" mark`);
      const ui = gitChecked(home, [...RAW, `--git-dir=${gd}`, 'update-index', '--cacheinfo', `${m[1]},${s.originalBlob},${s.path}`], env);
      if (!ui.ok) throw new Error(`git update-index ${s.path} failed: ${ui.err.split('\n')[0]}`);
    }
    // the original blobs are not in the throwaway object store; their ids are all a tree id needs
    const wt = gitChecked(home, [...RAW, `--git-dir=${gd}`, 'write-tree', ...(mine.length ? ['--missing-ok'] : []), `--prefix=${t}/`], env);
    if (!wt.ok || !wt.out) throw new Error(`git write-tree --prefix=${t}/ failed: ${wt.err.split('\n')[0] || 'no tree (empty directory?)'}`);
    return wt.out;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** The release manifest (I-268, I-270), relative to the checkout root. */
export const RELEASE_MANIFEST = 'tools/release/release-assets.json';
/** A listed redaction that does not hold (the file is not the listed redacted one, or is gone): not the snapshot. */
export class RedactionError extends Error {}
const BLOB = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * I-270: the redactions a release manifest lists (the snapshot asset's "redacted"), validated: {swaps: [{path, rule,
 * originalBlob, redactedBlob}]} or {error}. A path must be a plain relative path below site/ or site-pretty/, listed
 * once; "redacted" on any other asset kind is an error.
 */
export function redactionList(manifest) {
  const swaps = [], seen = new Set();
  for (const a of Array.isArray(manifest?.assets) ? manifest.assets : []) {
    if (a?.redacted === undefined) continue;
    if (a.kind !== 'snapshot') return { error: `asset ${JSON.stringify(a.name)} (${a.kind}) lists redactions; only the snapshot may` };
    if (!Array.isArray(a.redacted)) return { error: `asset ${JSON.stringify(a.name)}: "redacted" must be a list` };
    for (const r of a.redacted) {
      const p = r?.path;
      if (typeof p !== 'string' || !TREES.some((t) => p.startsWith(`${t}/`)) || p.split('/').some((x) => !x || x === '.' || x === '..') || /[\\\0\n]/.test(p)) return { error: `redaction path ${JSON.stringify(p)} is not a file below ${TREES.map((t) => `${t}/`).join(' or ')}` };
      if (seen.has(p)) return { error: `redaction path ${JSON.stringify(p)} is listed twice` };
      if (typeof r.rule !== 'string' || !/^[\w-]+(?:,[\w-]+)*$/.test(r.rule)) return { error: `redaction of ${p}: "rule" must name the rule id(s)` };
      if (!BLOB.test(r.originalBlob ?? '') || !BLOB.test(r.redactedBlob ?? '') || r.originalBlob === r.redactedBlob) return { error: `redaction of ${p}: "originalBlob" and "redactedBlob" must be two different git blob ids` };
      seen.add(p);
      swaps.push({ path: p, rule: r.rule, originalBlob: r.originalBlob, redactedBlob: r.redactedBlob });
    }
  }
  return { swaps };
}

/** The redactions HEAD's release manifest lists in checkout `home` (committed, so a local edit cannot widen them):
 *  {swaps} (none without a committed manifest) or {error}. */
export function releaseRedactions(home) {
  const r = gitChecked(home, ['show', `HEAD:${RELEASE_MANIFEST}`]);
  if (!r.ok) return { swaps: [] };
  let m;
  try { m = JSON.parse(r.out); } catch (e) { return { error: `HEAD:${RELEASE_MANIFEST} is not JSON (${e.message})` }; }
  return redactionList(m);
}

const treeCache = new Map(); // `${home}\0${t}` -> {fp, tree}: this process
/** Where the fingerprint cache of checkout `home` lives: its own git dir (null when it has none). */
function cacheFile(home) {
  const r = gitChecked(home, ['rev-parse', '--absolute-git-dir']);
  return r.ok && r.out ? join(r.out, 'fastwork-mirror', 'baseline-untracked.json') : null;
}
const readCache = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };

/**
 * dirTreeId(home, t), cached by treeFingerprint: the first check of an untracked snapshot hashes it (about a second
 * for the real 61 MB one), later checks only stat its files. Returns {tree, cached}.
 */
export function untrackedTreeId(home, t, { swaps = [] } = {}) {
  const mine = swaps.filter((s) => s.path.startsWith(`${t}/`));
  const key = `${real(home)}\0${t}${mine.length ? `\0${createHash('sha256').update(JSON.stringify(mine)).digest('hex').slice(0, 16)}` : ''}`;
  const fp = treeFingerprint(join(home, t));
  const mem = treeCache.get(key);
  if (fp && mem?.fp === fp) return { tree: mem.tree, cached: true };
  const f = cacheFile(home);
  const disk = f ? readCache(f) : {};
  if (fp && disk[key]?.fp === fp && /^[0-9a-f]{40,64}$/.test(disk[key].tree ?? '')) {
    treeCache.set(key, disk[key]);
    return { tree: disk[key].tree, cached: true };
  }
  const tree = dirTreeId(home, t, { swaps: mine });
  if (fp) {
    treeCache.set(key, { fp, tree });
    if (f) {
      try { // best effort; the fingerprint was taken before hashing, so a file changed meanwhile never matches it again
        mkdirSync(dirname(f), { recursive: true });
        const tmpf = `${f}.${process.pid}.tmp`;
        writeFileSync(tmpf, JSON.stringify({ ...readCache(f), [key]: { fp, tree, at: new Date().toISOString() } }, null, 1) + '\n');
        renameSync(tmpf, f);
      } catch {}
    }
  }
  return { tree, cached: false };
}

const RESTORE = (where) => `git -C ${where} restore --source=HEAD --staged --worktree -- ${TREES.join(' ')} && git -C ${where} clean -fd -- ${TREES.join(' ')}`;

/**
 * Where the baseline of this checkout comes from and whether it is the pinned snapshot.
 * Returns {state, ok, snapshot, pin, homes, message}; state is one of
 *   ok | unpinned | override | bad-pin | missing | untracked | mismatch | modified | timeout
 * (timeout: a git call of the check did not answer within GIT_TIMEOUT_MS; not usable, never a crash).
 */
export function baselineStatus({ repo = REPO, env = process.env } = {}) {
  try {
    return checkStatus({ repo, env });
  } catch (e) {
    if (!(e instanceof GitTimeout)) throw e;
    const raw = readPin(repo);
    const pin = raw && !raw.error ? raw : null;
    return { state: 'timeout', ok: false, snapshot: pin?.snapshot ?? null, pin, homes: [], message: `BASELINE-TIMEOUT: could not check the baseline: ${e.message}. Is a git command stuck in that checkout (index.lock)? Retry; report an incident (class env) if it persists.` };
  }
}
function checkStatus({ repo, env }) {
  const git = gitChecked;
  const raw = readPin(repo);
  const pin = raw && !raw.error ? raw : null;
  const res = (state, ok, message, extra = {}) => ({ state, ok, snapshot: pin?.snapshot ?? null, pin, message, ...extra });
  if (env.FW_MIRROR_HOME) return res('override', true, `baseline from FW_MIRROR_HOME=${env.FW_MIRROR_HOME} (not checked against ${PIN_FILE})`, { homes: [resolve(env.FW_MIRROR_HOME)] });
  const dirs = Object.fromEntries(TREES.map((t) => [t, resolveTree(t)]));
  const homes = [...new Set(TREES.map((t) => dirname(dirs[t])))];
  if (!raw) return res('unpinned', true, `no ${PIN_FILE} in ${repo}: the baseline is not pinned here (unchecked)`, { homes });
  if (raw.error) return res('bad-pin', false, `BASELINE-PIN-INVALID: ${raw.error}. Restore it: git checkout HEAD -- ${PIN_FILE}`, { homes });
  const own = (home) => real(home) === real(repo);
  const ownCopy = 'node tools/baseline.mjs sparse --off   (checks out this branch\'s own committed copy, ~60 MB, <1 s)';

  const verified = {}; // I-268: t -> {home, tree} for a snapshot tree HEAD does not track, hashed from its files
  let redactions = null; // I-270: HEAD's release manifest's listed redactions, read once when a tree is untracked
  for (const t of TREES) {
    const home = dirname(dirs[t]);
    if (!existsSync(dirs[t])) {
      const release = !isLinkedWorktree() && !git(home, ['rev-parse', '--verify', '-q', `HEAD:${t}`]).ok; // I-268: HEAD has no snapshot to check out
      return res('missing', false, `BASELINE-MISSING: ${dirs[t]} does not exist; ${PIN_FILE} pins ${pin.snapshot}.\n  ${isLinkedWorktree() ? `This worktree is sparse and the main checkout has no ${t}/. Use your own copy: ${ownCopy}` : release ? `This checkout does not track the snapshot (the public release): install it from the release file: npm run init` : `Check it out: git checkout HEAD -- ${TREES.join(' ')}`}`, { homes });
    }
    const top = git(home, ['rev-parse', '--show-toplevel']);
    const isTop = top.ok && real(top.out) === real(home);
    const tracked = isTop && git(home, ['ls-files', '--error-unmatch', '--', `${t}/.mirror/manifest.json`, `${t}/index.html`]).ok;
    if (isTop && !tracked && !git(home, ['rev-parse', '--verify', '-q', `HEAD:${t}`]).ok && !git(home, ['ls-files', '--', `${t}/`]).out) {
      // HEAD does not track the tree at all and nothing is staged under it: the release's unpacked snapshot
      redactions ??= releaseRedactions(home);
      if (redactions.error) return res('modified', false, `BASELINE-MODIFIED: ${PIN_FILE} pins ${pin.snapshot}, but ${RELEASE_MANIFEST}'s list of redacted snapshot files is not usable: ${redactions.error}. Only listed redactions of files below ${TREES.map((x) => `${x}/`).join(' and ')} are accepted.\n  Restore it: git checkout HEAD -- ${RELEASE_MANIFEST}, or take a release's manifest unchanged.`, { homes });
      try {
        verified[t] = { home, tree: untrackedTreeId(home, t, { swaps: redactions.swaps }).tree };
        continue;
      } catch (e) {
        if (e instanceof GitTimeout) throw e;
        if (e instanceof RedactionError) return res('modified', false, `BASELINE-MODIFIED: ${dirs[t]} (not tracked by git): ${e.message}: it is not the snapshot ${pin.snapshot} that ${PIN_FILE} pins.\n  Restore it: remove ${t}/ and run npm run init (unpacks and verifies the release file).\n  (The user, reviewing a new snapshot, may set ${ALLOW_ENV}=1 to measure it anyway.)`, { homes });
        return res('untracked', false, `BASELINE-UNTRACKED: ${PIN_FILE} pins ${pin.snapshot}, but ${dirs[t]} is not tracked by git and could not be hashed (${e.message}).\n  Restore it from the release file: npm run init`, { homes });
      }
    }
    if (!tracked) {
      return res('untracked', false, `BASELINE-UNTRACKED: ${PIN_FILE} pins ${pin.snapshot}, but ${dirs[t]} is not a committed snapshot (not tracked by git in ${home}).\n  ${own(home) ? `Check it out: git checkout HEAD -- ${TREES.join(' ')}` : `The main checkout lacks the snapshot commit. Tell the lead; meanwhile: ${ownCopy}`}`, { homes });
    }
  }
  const vbad = TREES.filter((t) => verified[t] && verified[t].tree !== pin.trees[t]);
  if (vbad.length) {
    return res('modified', false, `BASELINE-MODIFIED: ${vbad.map((t) => `${dirs[t]} (not tracked by git) has tree ${verified[t].tree.slice(0, 10)}, not the pinned ${pin.trees[t].slice(0, 10)}`).join('; ')}: it is not the snapshot ${pin.snapshot} that ${PIN_FILE} pins (a changed, added or missing file). Tools only measure the pinned snapshot (CLAUDE.md Hard rules 3-4).\n  Restore it: remove ${vbad.map((t) => `${t}/`).join(' and ')} and run npm run init (unpacks and verifies the release file).\n  (The user, reviewing a new snapshot, may set ${ALLOW_ENV}=1 to measure it anyway.)`, { homes });
  }
  const mism = [];
  for (const t of TREES.filter((x) => !verified[x])) {
    const home = dirname(dirs[t]);
    const have = git(home, ['rev-parse', '--verify', '-q', `HEAD:${t}`]).out || '(none)';
    if (have !== pin.trees[t]) mism.push({ t, home, have });
  }
  if (mism.length) {
    const m = mism[0];
    const fix = own(m.home)
      ? `${PIN_FILE} does not describe this checkout's committed ${m.t}/: restore the pin (git checkout HEAD -- ${PIN_FILE}) or re-pin (lead only, see CLAUDE.md).`
      : `The main checkout is at another snapshot (a newer pin on main?). Either rebase onto it (git rebase main, then re-measure) or keep measuring ${pin.snapshot}: ${ownCopy}`;
    return res('mismatch', false, `BASELINE-MISMATCH: this checkout pins ${pin.snapshot} (${mism.map((x) => `${x.t} ${pin.trees[x.t].slice(0, 10)}`).join(', ')}) but ${m.home} has ${mism.map((x) => `${x.t} ${x.have.slice(0, 10)}`).join(', ')} at HEAD.\n  ${fix}`, { homes });
  }
  for (const home of homes) {
    const here = TREES.filter((t) => dirname(dirs[t]) === home && !verified[t]);
    if (!here.length) continue;
    const st = git(home, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...here]);
    const changed = st.out.split('\n').filter(Boolean);
    if (!st.ok || changed.length) {
      const what = st.ok ? `${changed.length} changed path(s), first: ${changed.slice(0, 3).map((l) => l.trim()).join('; ')}` : `git status failed: ${st.err}`;
      const fix = own(home)
        ? `Restore the committed snapshot: ${RESTORE(home)}`
        : `The main checkout's snapshot has local changes (a new mirror the user is reviewing?). Don't touch it; report an incident (class baseline) and keep measuring the committed snapshot on your own copy: ${ownCopy}\n  Lead/user, to restore the main checkout: ${RESTORE(home)}`;
      return res('modified', false, `BASELINE-MODIFIED: the committed snapshot ${pin.snapshot} in ${home} has local changes (${what}). Tools only measure the committed snapshot (CLAUDE.md Hard rules 3-4).\n  ${fix}\n  (The user, reviewing a new snapshot, may set ${ALLOW_ENV}=1 to measure it anyway.)`, { homes });
    }
  }
  const vt = TREES.filter((t) => verified[t]);
  const nred = redactions?.swaps?.length || 0;
  if (vt.length) return res('ok', true, `baseline ${pin.snapshot} (${homes.join(', ')}) matches ${PIN_FILE} (untracked, verified: ${vt.join(', ')}${nred ? `; ${nred} redacted file(s) as ${RELEASE_MANIFEST} lists` : ''})`, { homes, source: 'untracked, verified', ...(nred ? { redacted: nred } : {}) });
  return res('ok', true, `baseline ${pin.snapshot} (${homes.join(', ')}) matches ${PIN_FILE}`, { homes });
}

/** Check at tool start: returns the status when usable, else prints the refusal and exits 3. */
export function requireBaseline(tool, { env = process.env } = {}) {
  const s = baselineStatus({ env });
  if (s.ok) return s;
  if (env[ALLOW_ENV] === '1' && s.state !== 'bad-pin') {
    process.stderr.write(`WARNING ${tool}: ${ALLOW_ENV}=1: using a baseline that is NOT the pinned snapshot (state ${s.state}); results record it.\n  ${s.message}\n`);
    return s;
  }
  process.stderr.write(`${tool}: ${s.message}\n`);
  process.exit(EXIT_BASELINE);
}

/** What results.json / verify.json / bench-results.json record about the baseline (metadata only). */
export const baselineMeta = (s) => ({ snapshot: s.snapshot, state: s.state });

/** States a measurement may run on unflagged: the pinned snapshot, or no pin / FW_MIRROR_HOME (unchecked by design). */
export const CLEAN_STATES = new Set(['ok', 'unpinned', 'override']);
/**
 * The verdict prefix for a measurement that started on baseline status `start` and ended on `end`
 * (a fresh baselineStatus() at the end of a run): null when both are clean and the same snapshot;
 * BASELINE-<STATE> when it did not measure the pinned snapshot (FW_BASELINE_ALLOW_MODIFIED=1) or the
 * baseline changed under it (a re-mirror mid-A/B; BASELINE-TIMEOUT when the re-check's git hung);
 * BASELINE-REPINNED when it changed to another clean state (a new pin landed mid-run). Not to be confused
 * with bench.mjs's BASELINE-CHANGED (a patch.diff made on another mirror). fix.mjs ab and bench.mjs
 * prefix every verdict with it, like CONTAMINATED (host).
 */
export function baselineTag(start, end = start) {
  if (!CLEAN_STATES.has(start.state)) return `BASELINE-${String(start.state).toUpperCase()}`;
  if (!end || (end.state === start.state && end.snapshot === start.snapshot)) return null;
  return CLEAN_STATES.has(end.state) ? 'BASELINE-REPINNED' : `BASELINE-${String(end.state).toUpperCase()}`;
}

export { mainCheckout };

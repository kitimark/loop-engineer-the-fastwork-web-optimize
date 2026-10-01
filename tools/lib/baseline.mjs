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
// FW_MIRROR_HOME (tests' fixture baselines) = "override": unchecked.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { REPO, resolveTree, isLinkedWorktree, mainCheckout } from './paths.mjs';

export const PIN_FILE = 'baseline.json';
export const TREES = ['site', 'site-pretty'];
/** Non-cone sparse patterns for agent worktrees: everything except the two snapshot dirs. */
export const SPARSE_PATTERNS = ['/*', '!/site/', '!/site-pretty/'];
export const ALLOW_ENV = 'FW_BASELINE_ALLOW_MODIFIED';
export const EXIT_BASELINE = 3;

/** git in `cwd`; never takes optional locks (index refresh), so checking the main checkout can't
 *  collide with the lead's git commands there. */
export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 1 << 28 });
  return { ok: r.status === 0, out: (r.stdout || '').replace(/\n$/, ''), err: (r.stderr || '').trim() };
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

const RESTORE = (where) => `git -C ${where} restore --source=HEAD --staged --worktree -- ${TREES.join(' ')} && git -C ${where} clean -fd -- ${TREES.join(' ')}`;

/**
 * Where the baseline of this checkout comes from and whether it is the pinned snapshot.
 * Returns {state, ok, snapshot, pin, homes, message}; state is one of
 *   ok | unpinned | override | bad-pin | missing | untracked | mismatch | modified.
 */
export function baselineStatus({ repo = REPO, env = process.env } = {}) {
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

  for (const t of TREES) {
    const home = dirname(dirs[t]);
    if (!existsSync(dirs[t])) {
      return res('missing', false, `BASELINE-MISSING: ${dirs[t]} does not exist; ${PIN_FILE} pins ${pin.snapshot}.\n  ${isLinkedWorktree() ? `This worktree is sparse and the main checkout has no ${t}/. Use your own copy: ${ownCopy}` : `Check it out: git checkout HEAD -- ${TREES.join(' ')}`}`, { homes });
    }
    const top = git(home, ['rev-parse', '--show-toplevel']);
    if (!top.ok || real(top.out) !== real(home) || !git(home, ['ls-files', '--error-unmatch', '--', `${t}/.mirror/manifest.json`, `${t}/index.html`]).ok) {
      return res('untracked', false, `BASELINE-UNTRACKED: ${PIN_FILE} pins ${pin.snapshot}, but ${dirs[t]} is not a committed snapshot (not tracked by git in ${home}).\n  ${own(home) ? `Check it out: git checkout HEAD -- ${TREES.join(' ')}` : `The main checkout lacks the snapshot commit. Tell the lead; meanwhile: ${ownCopy}`}`, { homes });
    }
  }
  const mism = [];
  for (const t of TREES) {
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
    const here = TREES.filter((t) => dirname(dirs[t]) === home);
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

export { mainCheckout };

// Scope guard (incident I-021): did this branch change the shared tooling?
//
// Roles that never change tooling (fix owners, bench authors, architecture, management, reviewers) run
// `npm run test:unit` (this guard, then the unit tests) instead of the full `npm test`. The unit tests
// only say something about the tools if the tools are main's, so the guard checks that first: every
// path the branch changed since its merge-base with main (committed), plus the index (staged), the
// working tree (unstaged) and untracked, non-ignored files. Renames count as delete + add, so moving a
// tool away is caught too.
//
// Tooling = what `npm test` covers or what shapes every agent: tools/, tests/, package.json,
// .githooks/, and .claude/ except .claude/agents/ (role definitions are docs; management edits them).
// A toolsmith branch (or an INCIDENTS.md section 1 self-fix) opts out explicitly with FW_TOOLING=1 or
// --tooling, and then runs the full `npm test`.
//
// The committed baseline snapshot (site/, site-pretty/, baseline.json; tools/lib/baseline.mjs) changes
// only on main or a baseline/* branch, through the pre-commit hook's authorized update. Commits that skip
// pre-commit (git revert, cherry-pick, rebase, am) could still carry a snapshot change on a fix branch,
// so the guard refuses any such change on other branches (SCOPE SNAPSHOT), with no opt-out: FW_TOOLING=1
// does not cover it.
import { spawnSync } from 'node:child_process';

const TOOLING = [/^tools\//, /^tests\//, /^package(-lock)?\.json$/, /^\.githooks\//, /^\.claude\/(?!agents\/)/];
const SNAPSHOT = [/^site\//, /^site-pretty\//, /^baseline\.json$/];
/** Branches that may change the snapshot (with the pre-commit authorized update): main and baseline/*. */
const SNAPSHOT_BRANCH = /^(main|baseline\/.+)$/;

/** True for a repo-relative path (forward slashes) that belongs to the shared tooling. */
export const isToolingPath = (p) => TOOLING.some((re) => re.test(p));
/** True for a repo-relative path of the committed baseline snapshot or its pin. */
export const isSnapshotPath = (p) => SNAPSHOT.some((re) => re.test(p));

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout;
}
const names = (out) => out.split('\0').filter(Boolean);

/**
 * Changed paths of the checkout at `cwd` relative to `base` (default main).
 * Returns {base, mergeBase, head, branch, total (all changed paths), changes: [{where, path}] (tooling
 * only), snapshot: [{where, path}] (snapshot paths)}, where is committed | staged | unstaged | untracked.
 * Throws when git or the base ref fails.
 */
export function toolingChanges({ cwd = process.cwd(), base = 'main' } = {}) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const head = git(top, ['rev-parse', 'HEAD']).trim();
  const branch = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); // HEAD when detached
  let mergeBase;
  try { mergeBase = git(top, ['merge-base', base, 'HEAD']).trim(); } catch (e) { throw new Error(`no merge-base with "${base}": ${e.message}`); }
  const diff = (...a) => names(git(top, ['-c', 'core.quotePath=false', 'diff', '--name-only', '-z', '--no-renames', ...a]));
  const sets = {
    committed: diff(mergeBase, 'HEAD'),
    staged: diff('--cached'),
    unstaged: diff(),
    untracked: names(git(top, ['ls-files', '-z', '--others', '--exclude-standard'])),
  };
  const all = new Set(Object.values(sets).flat());
  const changes = [], snapshot = [];
  for (const [where, list] of Object.entries(sets)) for (const path of list) {
    if (isToolingPath(path)) changes.push({ where, path });
    if (isSnapshotPath(path)) snapshot.push({ where, path });
  }
  return { base, mergeBase, head, branch, total: all.size, changes, snapshot };
}

/**
 * toolingChanges plus the verdict: ok unless tooling changed without the explicit opt-out, or the
 * snapshot changed on a branch other than main / baseline/* (snapshotBlocked; no opt-out).
 */
export function checkScope({ cwd, base = 'main', tooling = false } = {}) {
  const r = toolingChanges({ cwd, base });
  const touched = r.changes.length > 0;
  const snapshotBlocked = r.snapshot.length > 0 && !SNAPSHOT_BRANCH.test(r.branch);
  return { ...r, ok: (!touched || tooling) && !snapshotBlocked, allowed: touched && tooling, snapshotBlocked };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Human-readable result; first line starts with SCOPE SNAPSHOT | SCOPE OK | SCOPE TOOLING-ALLOWED | SCOPE TOOLING. */
export function formatScope(r) {
  const since = `since merge-base ${r.mergeBase.slice(0, 7)} with ${r.base}`;
  if (r.snapshotBlocked) {
    const snap = [
      `SCOPE SNAPSHOT: ${plural(r.snapshot.length, 'snapshot path')} changed ${since} on branch ${r.branch}:`,
      r.snapshot.map((c) => `  ${c.where.padEnd(9)} ${c.path}`).join('\n'),
      'The committed baseline snapshot (site/, site-pretty/, baseline.json) changes only on main or a baseline/* branch,',
      'by the authorized update (the user\'s call; CLAUDE.md Hard rule 3). A revert, cherry-pick, rebase or am skips the',
      'pre-commit hook, so this branch must not carry such a change, whatever FW_TOOLING says. Undo it:',
      `  git restore --staged --worktree --source=${r.mergeBase.slice(0, 12)} -- site site-pretty baseline.json && git clean -fd -- site site-pretty`,
      '  then commit the restore if the change was committed (a sparse worktree: node tools/baseline.mjs sparse afterwards).',
    ].join('\n');
    return r.changes.length ? `${snap}\n${formatScope({ ...r, snapshotBlocked: false })}` : snap;
  }
  const list = r.changes.map((c) => `  ${c.where.padEnd(9)} ${c.path}`).join('\n');
  if (!r.changes.length) return `SCOPE OK: no tooling paths changed ${since} (${plural(r.total, 'changed path')})`;
  if (r.allowed) return `SCOPE TOOLING-ALLOWED (tooling branch): ${plural(r.changes.length, 'tooling path')} changed ${since}; run the full npm test\n${list}`;
  return [
    `SCOPE TOOLING: ${plural(r.changes.length, 'tooling path')} changed ${since}:`,
    list,
    'Your role does not change tooling (tools/, tests/, package.json, .githooks/, .claude/ except agents/),',
    'and the unit-only run does not cover such changes. If the change was an accident, undo it:',
    `  git restore --staged --worktree --source=${r.mergeBase.slice(0, 12)} -- <path>   (committed: then commit the revert)`,
    '  a file your branch added: git rm it (untracked: delete it).',
    'If it is a tool fix on purpose (toolsmith, or an INCIDENTS.md section 1 self-fix): keep it in its own commit,',
    'rerun with FW_TOOLING=1 (or --tooling) and run the full suite under the short lane:',
    '  node tools/lock.mjs run chrome-measure --owner <you> --short --max-seconds 150 -- npm test',
  ].join('\n');
}

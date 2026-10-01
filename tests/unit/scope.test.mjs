// tools/lib/scope.mjs (incident I-021): the scope guard behind `npm run test:unit`. Non-tooling roles
// (fix owners, bench authors, architecture, management, reviewers) run only the unit tests, so the guard
// must catch every way their branch could have changed the tooling: committed since the merge-base with
// main, staged, unstaged, untracked, and renamed away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempDir, git } from '../helpers.mjs';
import { isToolingPath, toolingChanges, checkScope, formatScope } from '../../tools/lib/scope.mjs';

const put = (root, rel, text = 'x\n') => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

/** A repo with main (tooling + docs) and a branch `fix/t` checked out, like a fix worktree. */
function repo() {
  const root = tempDir('fw-scope-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'commit.gpgsign', 'false');
  for (const f of ['tools/a.mjs', 'tests/unit/a.test.mjs', 'package.json', '.githooks/pre-commit', '.claude/settings.json', '.claude/hooks/git-guard.mjs', '.claude/agents/fix-owner.md', 'fixes/README.md', 'CLAUDE.md']) put(root, f);
  put(root, '.gitignore', 'fixes/*/overlay/\nout/\n.claude/worktrees/\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  git(root, 'checkout', '-q', '-b', 'fix/t');
  return root;
}
const paths = (r) => r.map((c) => `${c.where}:${c.path}`).sort();

test('isToolingPath: tools, tests, package.json, .githooks and .claude config are tooling; agent docs are not', () => {
  for (const p of ['tools/fix.mjs', 'tools/lib/lock.mjs', 'tests/unit/x.test.mjs', 'tests/helpers.mjs', 'package.json', 'package-lock.json',
    '.githooks/pre-commit', '.claude/settings.json', '.claude/hooks/git-guard.mjs', '.claude/commands/x.md']) assert.equal(isToolingPath(p), true, p);
  for (const p of ['fixes/nav-morph/README.md', 'fixes/nav-morph/patch.diff', 'research/x/tools/probe.mjs', 'CLAUDE.md', 'README.md',
    '.claude/agents/fix-owner.md', 'fixes/tools/README.md', 'toolsX/a', 'tests.md', 'sub/package.json']) assert.equal(isToolingPath(p), false, p);
});

test('toolingChanges: a branch that only touched fixes/ and docs is clean', () => {
  const root = repo();
  put(root, 'fixes/t/README.md'); put(root, '.claude/agents/fix-owner.md', 'edited\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fix');
  put(root, 'fixes/t/results.json');                      // untracked, not tooling
  put(root, 'fixes/t/overlay/tools/x.js');                // gitignored overlay
  put(root, 'CLAUDE.md', 'edited\n');                     // unstaged, not tooling
  const r = toolingChanges({ cwd: root });
  assert.equal(r.base, 'main');
  assert.equal(r.mergeBase, git(root, 'rev-parse', 'main'));
  assert.deepEqual(r.changes, []);
  assert.ok(r.total >= 3, `counts every changed path (${r.total})`);
});

test('toolingChanges: committed, staged, unstaged and untracked tooling paths are all reported', () => {
  const root = repo();
  put(root, 'tools/a.mjs', 'committed\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'oops');
  put(root, 'tests/unit/new.test.mjs'); git(root, 'add', 'tests/unit/new.test.mjs');
  put(root, 'package.json', '{}\n');
  put(root, '.githooks/new-hook');
  put(root, '.claude/settings.json', '{}\n'); git(root, 'add', '.claude/settings.json'); put(root, '.claude/settings.json', '{"a":1}\n');
  assert.deepEqual(paths(toolingChanges({ cwd: root }).changes), [
    'committed:tools/a.mjs', 'staged:.claude/settings.json', 'staged:tests/unit/new.test.mjs',
    'unstaged:.claude/settings.json', 'unstaged:package.json', 'untracked:.githooks/new-hook',
  ]);
});

test('toolingChanges: moving or deleting a tool counts (renames are split into delete + add)', () => {
  const root = repo();
  git(root, 'mv', 'tools/a.mjs', 'fixes/a.mjs'); git(root, 'commit', '-q', '-m', 'move');
  rmSync(join(root, 'tests/unit/a.test.mjs'));
  assert.deepEqual(paths(toolingChanges({ cwd: root }).changes), ['committed:tools/a.mjs', 'unstaged:tests/unit/a.test.mjs']);
});

test('toolingChanges: tooling that landed on main after the branch point is not the branch\'s change', () => {
  const root = repo();
  put(root, 'fixes/t/README.md'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fix');
  git(root, 'checkout', '-q', 'main');
  put(root, 'tools/a.mjs', 'landed tool fix\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'tools: fix');
  git(root, 'checkout', '-q', 'fix/t');
  assert.deepEqual(toolingChanges({ cwd: root }).changes, []);
  // and a branch that is behind main still sees its own tooling commit
  put(root, 'tools/lib/b.mjs'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'oops');
  assert.deepEqual(paths(toolingChanges({ cwd: root }).changes), ['committed:tools/lib/b.mjs']);
});

test('toolingChanges: on main itself only the working tree counts; another base can be named', () => {
  const root = repo();
  git(root, 'checkout', '-q', 'main');
  assert.deepEqual(toolingChanges({ cwd: root }).changes, []);
  put(root, 'tools/a.mjs', 'wip\n');
  assert.deepEqual(paths(toolingChanges({ cwd: root }).changes), ['unstaged:tools/a.mjs']);
  git(root, 'checkout', '-q', '-f', 'fix/t');
  git(root, 'branch', 'wave1', 'main');
  put(root, 'tools/c.mjs'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'c');
  assert.deepEqual(paths(toolingChanges({ cwd: root, base: 'wave1' }).changes), ['committed:tools/c.mjs']);
  assert.throws(() => toolingChanges({ cwd: root, base: 'no-such-branch' }), /no-such-branch/);
});

test('checkScope / formatScope: fail names the files; the tooling opt-out passes but still lists them', () => {
  const root = repo();
  put(root, 'tools/a.mjs', 'x2\n');
  const bad = checkScope({ cwd: root });
  assert.equal(bad.ok, false);
  assert.equal(bad.allowed, false);
  const text = formatScope(bad);
  assert.match(text, /^SCOPE TOOLING/m);
  assert.match(text, /unstaged\s+tools\/a\.mjs/);
  assert.match(text, /FW_TOOLING=1/);
  const allowed = checkScope({ cwd: root, tooling: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.allowed, true);
  assert.match(formatScope(allowed), /^SCOPE TOOLING-ALLOWED.*\n.*tools\/a\.mjs/m);
  rmSync(join(root, 'tools/a.mjs')); git(root, 'checkout', '-q', '--', 'tools/a.mjs');
  const good = checkScope({ cwd: root });
  assert.equal(good.ok, true);
  assert.match(formatScope(good), /^SCOPE OK: no tooling paths changed since merge-base [0-9a-f]{7,} with main/);
});

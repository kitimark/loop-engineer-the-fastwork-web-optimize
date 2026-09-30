// Tests for the versioned git hooks in .githooks/ (CLAUDE.md "Hard rules" 1-2: rebase +
// fast-forward only, no merge or squash-merge commits, never push). Every test builds a throwaway
// repo in the OS temp dir and runs git with `-c core.hooksPath=<this checkout>/.githooks`, with the
// user's global/system git config switched off, so nothing here touches this repository.
// Hook semantics: https://git-scm.com/docs/githooks. Run: node --test tests/hooks/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = join(ROOT, '.githooks');

function makeRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rebase-only-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = {
    ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no',
  };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|PREFIX|CONFIG_(COUNT|PARAMETERS|KEY_|VALUE_))/.test(k)) delete env[k];
  const repo = join(dir, 'repo');
  const run = (cwd, hooks, args) => spawnSync('git', [...(hooks ? ['-c', `core.hooksPath=${HOOKS}`] : ['-c', 'core.hooksPath=/dev/null']), ...args], { cwd, env, encoding: 'utf8' });
  const mk = (cwd = repo) => {
    const git = (...args) => run(cwd, true, args);
    const ok = (...args) => { const r = git(...args); assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`); return r.stdout.trim(); };
    const noHooks = (...args) => { const r = run(cwd, false, args); assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stderr}`); return r.stdout.trim(); };
    const commit = (file, content, msg = file) => { writeFileSync(join(cwd, file), content); ok('add', file); ok('commit', '-q', '-m', msg); return ok('rev-parse', 'HEAD'); };
    const merges = (ref = '--all') => ok('rev-list', '--merges', ref);
    return { git, ok, noHooks, commit, merges, cwd };
  };
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { env });
  const r = mk();
  r.commit('a.txt', 'a\n');
  r.ok('switch', '-q', '-c', 'feature');
  r.commit('b.txt', 'b\n');
  r.ok('switch', '-q', 'main');
  r.commit('c.txt', 'c\n'); // main and feature have diverged
  return { ...r, mk, dir, repo };
}

const refused = (r, re = /rebase-only/) => {
  assert.notEqual(r.status, 0, `expected failure, got success:\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, re);
};

test('non-fast-forward merge is rejected (pre-merge-commit)', (t) => {
  const g = makeRepo(t);
  const before = g.ok('rev-parse', 'main');
  refused(g.git('merge', '--no-edit', 'feature'), /refusing to create a merge commit/);
  g.ok('merge', '--abort');
  assert.equal(g.ok('rev-parse', 'main'), before);
  assert.equal(g.merges(), '');
});

test('--no-ff merge is rejected even when a fast-forward is possible', (t) => {
  const g = makeRepo(t);
  g.ok('switch', '-q', '-c', 'ahead', 'main');
  g.commit('d.txt', 'd\n');
  g.ok('switch', '-q', 'main');
  refused(g.git('merge', '--no-ff', '--no-edit', 'ahead'));
  g.ok('merge', '--abort');
  assert.equal(g.merges(), '');
});

test('git pull without --rebase from a diverged branch is rejected', (t) => {
  const g = makeRepo(t);
  refused(g.git('pull', '--no-rebase', '--no-edit', '.', 'feature'));
  g.git('merge', '--abort');
  assert.equal(g.merges(), '');
});

test('conflicted merge concluded with git commit is rejected (commit-msg), and --no-verify too (reference-transaction)', (t) => {
  const g = makeRepo(t);
  g.ok('switch', '-q', 'feature');
  g.commit('c.txt', 'feature side\n', 'conflicting c');
  g.ok('switch', '-q', 'main');
  const before = g.ok('rev-parse', 'main');
  const m = g.git('merge', 'feature');
  assert.notEqual(m.status, 0); // conflict: pre-merge-commit doesn't run here (githooks docs)
  writeFileSync(join(g.cwd, 'c.txt'), 'resolved\n');
  g.ok('add', 'c.txt');
  refused(g.git('commit', '-m', 'merge'), /MERGE_HEAD/);
  refused(g.git('commit', '--no-verify', '-m', 'merge'), /refusing to move branch/);
  refused(g.git('merge', '--continue'));
  g.ok('merge', '--abort');
  assert.equal(g.ok('rev-parse', 'main'), before);
  assert.equal(g.merges(), '');
});

test('git merge --no-verify is still rejected (reference-transaction backstop)', (t) => {
  const g = makeRepo(t);
  refused(g.git('merge', '--no-verify', '--no-edit', 'feature'), /refusing to move branch/);
  g.ok('merge', '--abort');
  assert.equal(g.merges(), '');
});

test('squash merge commit is rejected (SQUASH_MSG)', (t) => {
  const g = makeRepo(t);
  g.ok('merge', '--squash', 'feature'); // only stages; the commit is what we block
  refused(g.git('commit', '-m', 'squash'), /squash merge is pending/);
  g.ok('reset', '-q', '--merge');
  assert.notEqual(g.git('rev-parse', '-q', '--verify', 'HEAD:b.txt').status, 0); // nothing was committed
});

test('plumbing merge commits cannot be put on a branch (commit-tree + update-ref / branch)', (t) => {
  const g = makeRepo(t);
  const tree = g.ok('rev-parse', 'main^{tree}');
  const mc = g.ok('commit-tree', tree, '-p', 'main', '-p', 'feature', '-m', 'plumbing merge');
  refused(g.git('update-ref', 'refs/heads/main', mc), /refusing to move branch/);
  refused(g.git('branch', 'sneaky', mc), /refusing to move branch/);
  assert.equal(g.merges('--branches'), '');
});

test('fast-forwarding onto a branch that already contains a merge commit is rejected', (t) => {
  const g = makeRepo(t);
  g.ok('switch', '-q', '-c', 'dirty', 'feature');
  g.noHooks('merge', '--no-edit', 'main'); // made with the hooks disabled
  g.ok('switch', '-q', 'main');
  refused(g.git('merge', '--ff-only', 'dirty'), /refusing to move branch/);
});

test('rebase onto main, then fast-forward only, is accepted and history stays linear', (t) => {
  const g = makeRepo(t);
  g.ok('switch', '-q', 'feature');
  g.ok('rebase', '-q', 'main');
  g.ok('switch', '-q', 'main');
  g.ok('merge', '--ff-only', 'feature');
  assert.equal(g.ok('rev-parse', 'main'), g.ok('rev-parse', 'feature'));
  assert.equal(g.merges(), '');
  assert.equal(g.ok('rev-list', '--count', 'main'), '3');
  // a rebase that needs conflict resolution is fine too (no MERGE_HEAD involved)
  g.ok('switch', '-q', '-c', 'f2', 'main~2');
  g.commit('c.txt', 'other\n', 'f2 c'); // add/add conflict with main's c.txt
  assert.notEqual(g.git('rebase', 'main').status, 0);
  writeFileSync(join(g.cwd, 'c.txt'), 'resolved\n');
  g.ok('add', 'c.txt');
  g.ok('-c', 'core.editor=true', 'rebase', '--continue');
  g.ok('switch', '-q', 'main');
  g.ok('merge', '--ff-only', 'f2');
  assert.equal(g.merges(), '');
});

test('everyday operations keep working: commit, branch, stash, cherry-pick, pull --rebase, delete', (t) => {
  const g = makeRepo(t);
  g.ok('switch', '-q', '-c', 'topic', 'main');
  g.commit('e.txt', 'e\n');
  writeFileSync(join(g.cwd, 'e.txt'), 'wip\n');
  g.ok('stash'); // refs/stash holds merge-shaped commits: not a branch, allowed
  g.ok('stash', 'pop');
  g.ok('checkout', '-q', '--', 'e.txt');
  g.ok('cherry-pick', 'feature');
  g.ok('pull', '-q', '--rebase', '.', 'main');
  g.ok('switch', '-q', 'main');
  g.ok('branch', '-D', 'topic');
  g.ok('commit', '--allow-empty', '-q', '-m', 'empty');
  assert.equal(g.merges('--branches'), '');
});

test('hooks apply in linked worktrees (MERGE_HEAD is per worktree)', (t) => {
  const g = makeRepo(t);
  const wt = join(g.dir, 'wt');
  g.ok('worktree', 'add', '-q', '-b', 'wt/x', wt, 'main');
  const w = g.mk(wt);
  w.commit('w.txt', 'w\n');
  refused(w.git('merge', '--no-edit', 'feature'));
  w.ok('merge', '--abort');
  w.ok('rebase', '-q', 'main'); // already up to date: the branch was cut from main
  g.ok('merge', '--ff-only', 'wt/x');
  assert.equal(g.merges(), '');
});

test('pre-push rejects every push', () => {
  // Invoked directly (as git would: remote name + URL args, ref lines on stdin); this suite never runs `git push`.
  const r = spawnSync(join(HOOKS, 'pre-push'), ['origin', 'https://example.invalid/x.git'], {
    input: 'refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 0000000000000000000000000000000000000000\n',
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pushing is not allowed/);
});

test('hook files are executable (git silently ignores non-executable hooks)', () => {
  for (const h of ['pre-merge-commit', 'commit-msg', 'reference-transaction', 'pre-push']) {
    const p = join(HOOKS, h);
    assert.ok(existsSync(p), `${h} missing`);
    const r = spawnSync('test', ['-x', p]);
    assert.equal(r.status, 0, `${h} is not executable`);
  }
});

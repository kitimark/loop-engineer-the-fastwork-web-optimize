// .githooks/pre-commit in a throwaway repo (core.hooksPath is set in *that* repo's config only):
// blocks Fastwork assets / overlays / out/ / *.pem even when force-added, runs the test command only
// when tooling is staged, blocks on failure, and never leaks git's hook env into the tests.
// FW_PRECOMMIT_TEST_CMD stands in for `npm test` (the real suite would recurse into itself).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeTempRepo, run, git } from '../helpers.mjs';

let repo;
before(() => {
  repo = makeTempRepo({ worktree: 'hook-wt', withHooks: true });
  git(repo.main, 'config', 'core.hooksPath', '.githooks');
});
const put = (dir, rel, s = 'x\n') => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), s); };
const commit = (dir, cmd, msg = 'test') => run('git', ['commit', '-q', '-m', msg], { cwd: dir, env: cmd === undefined ? {} : { FW_PRECOMMIT_TEST_CMD: cmd } });
const marker = (dir) => join(dir, 'tests-ran.txt');
const markCmd = (dir, code = 0) => `node -e "require('fs').writeFileSync(${JSON.stringify(marker(dir)).replace(/"/g, "'")}, JSON.stringify({GIT_DIR: process.env.GIT_DIR || null, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE || null, cwd: process.cwd()})); process.exit(${code})"`;
const head = (dir) => git(dir, 'rev-parse', 'HEAD');

test('the hook is versioned and executable', () => {
  assert.ok(existsSync(join(repo.main, '.githooks', 'pre-commit')));
  assert.equal(git(repo.main, 'ls-files', '-s', '.githooks/pre-commit').split(' ')[0], '100755');
});

test('non-tooling commits pass without running the tests', () => {
  put(repo.wt, 'fixes/demo/README.md', '# Fix: demo\n');
  put(repo.wt, 'fixes/demo/patch.diff', 'diff\n');
  git(repo.wt, 'add', 'fixes/demo');
  const r = commit(repo.wt, markCmd(repo.wt));
  assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(marker(repo.wt)), false);
});

for (const bad of ['site/index.html', 'site-pretty/_app/x.js', 'out/ab/t/verify.json', 'fixes/demo/overlay/_app/x.js', '.serena/cache/typescript/document_symbols.pkl', 'certs/lan-key.pem', 'tools/some.PEM']) {
  test(`blocks force-added ${bad}`, () => {
    put(repo.wt, bad);
    git(repo.wt, 'add', '-f', bad);
    const before = head(repo.wt);
    const r = commit(repo.wt, 'exit 0');
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /refusing to commit mirrored Fastwork assets/);
    assert.ok(r.stderr.includes('  ' + bad), r.stderr);
    assert.equal(head(repo.wt), before);
    git(repo.wt, 'restore', '--staged', bad);
    unlinkSync(join(repo.wt, bad));
  });
}

test('tooling change + failing tests: commit blocked; passing tests: committed; git env not leaked', () => {
  put(repo.wt, 'tools/extra.mjs', '// new tool\n');
  git(repo.wt, 'add', 'tools/extra.mjs');
  const before = head(repo.wt);
  const fail = commit(repo.wt, markCmd(repo.wt, 1));
  assert.notEqual(fail.code, 0);
  assert.match(fail.stderr, /tooling changed \(tools\/extra\.mjs\); running: /);
  assert.match(fail.stderr, /failed \(exit 1\); commit blocked/);
  assert.equal(head(repo.wt), before);
  const seen = JSON.parse(readFileSync(marker(repo.wt), 'utf8'));
  assert.deepEqual([seen.GIT_DIR, seen.GIT_INDEX_FILE], [null, null], 'GIT_* hook env must not reach the tests');
  assert.equal(seen.cwd, repo.wt, 'tests run at the top of the committing worktree');
  rmSync(marker(repo.wt));

  const ok = commit(repo.wt, markCmd(repo.wt, 0));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stderr, /tests passed in \d+ s/);
  assert.notEqual(head(repo.wt), before);
  rmSync(marker(repo.wt));
});

test('every protected tooling path triggers the tests, deletions included', () => {
  for (const [rel, del] of [['tests/x.test.mjs', false], ['package.json', false], ['.claude/settings.json', false], ['.claude/hooks/guard.mjs', false], ['.githooks/pre-commit', false], ['tools/extra.mjs', true]]) {
    if (del) git(repo.wt, 'rm', '-q', rel);
    else { put(repo.wt, rel, readFileSyncSafe(join(repo.wt, rel)) + '\n'); git(repo.wt, 'add', rel); }
    const r = commit(repo.wt, 'exit 3');
    assert.notEqual(r.code, 0, rel);
    assert.match(r.stderr, /commit blocked/, rel);
    git(repo.wt, 'reset', '-q', 'HEAD', '--', rel);
    if (run('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd: repo.wt }).code === 0) git(repo.wt, 'checkout', '-q', 'HEAD', '--', rel);
    else rmSync(join(repo.wt, rel));
  }
});
function readFileSyncSafe(f) { try { return readFileSync(f, 'utf8'); } catch { return ''; } }

test('the main checkout uses the same hook (core.hooksPath is shared config)', () => {
  put(repo.main, 'tools/main-only.mjs');
  git(repo.main, 'add', 'tools/main-only.mjs');
  const r = commit(repo.main, 'exit 1');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /commit blocked/);
  git(repo.main, 'reset', '-q');
});

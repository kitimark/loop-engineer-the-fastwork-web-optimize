// .githooks/pre-commit in a throwaway repo (core.hooksPath is set in *that* repo's config only):
// blocks overlays / out/ / *.pem / volatile mirror files even when force-added, refuses any change to the
// committed baseline snapshot (site/, site-pretty/, baseline.json) except an authorized snapshot update,
// runs the test command only when tooling is staged, blocks on failure, and never leaks git's hook env
// into the tests.
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

for (const bad of ['out/ab/t/verify.json', 'fixes/demo/overlay/_app/x.js', '.serena/cache/typescript/document_symbols.pkl', 'certs/lan-key.pem', 'tools/some.PEM', 'site/.mirror/missing-local.txt', 'site-pretty/.mirror/chrome-profile/Default/Cookies']) {
  test(`blocks force-added ${bad}`, () => {
    put(repo.wt, bad);
    git(repo.wt, 'add', '-f', bad);
    const before = head(repo.wt);
    const r = commit(repo.wt, 'exit 0');
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /pre-commit: refusing to commit overlays/);
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

// Release-only commits run the release command (user T-170 #489): every staged tooling path must be a release path.
const commit2 = (dir, full, rel) => run('git', ['commit', '-q', '-m', 'release'], { cwd: dir, env: { FW_PRECOMMIT_TEST_CMD: full, FW_PRECOMMIT_RELEASE_TEST_CMD: rel } });
const undo = (dir) => { git(dir, 'reset', '-q', 'HEAD'); git(dir, 'checkout', '-q', 'HEAD', '--', '.'); git(dir, 'clean', '-fdq', '--', 'tools', 'tests', 'docs'); };
test('release-only tooling commits run the release command; any other tooling path runs the full command', () => {
  const cases = [
    // [staged paths, expected command: 'release' | 'full']
    [['tools/release/pack.mjs', 'tests/unit/release-pack.test.mjs', 'tests/e2e/release-build.test.mjs', 'tests/fixtures/release/stub.mjs'], 'release'],
    [['tools/release/pack.mjs', 'docs/notes.md'], 'release'], // non-tooling paths don't count
    [['tools/release/pack.mjs', 'tools/lib/baseline.mjs'], 'full'],
    [['tools/release/pack.mjs', 'package.json'], 'full'],
    [['tools/release/pack.mjs', '.githooks/pre-commit'], 'full'],
    [['tests/unit/release.test.mjs'], 'full'], // no "release-" prefix
    [['tests/e2e/sub/release-x.test.mjs'], 'full'], // not directly in unit/ or e2e/
    [['tests/hooks/release-x.test.mjs'], 'full'],
    [['tools/releases/x.mjs'], 'full'],
    [['tests/fixtures/release-other/x.mjs'], 'full'],
  ];
  for (const [paths, want] of cases) {
    for (const p of paths) { const was = readFileSyncSafe(join(repo.wt, p)); put(repo.wt, p, p.endsWith('.json') ? (was || '{}') + '\n' : was + '// edit\n'); git(repo.wt, 'add', p); }
    const before = head(repo.wt);
    try {
      // the expected command fails: the commit must be blocked by it, and name the mode
      const r = want === 'release' ? commit2(repo.wt, 'exit 0', 'exit 5') : commit2(repo.wt, 'exit 5', 'exit 0');
      assert.notEqual(r.code, 0, `${paths.join(' + ')} should run the ${want} command`);
      assert.match(r.stderr, /failed \(exit 5\); commit blocked/, `${paths.join(' + ')}: ${r.stderr}`);
      assert.match(r.stderr, want === 'release' ? /pre-commit: release-only tooling changed/ : /pre-commit: tooling changed/, paths.join(' + '));
      assert.equal(head(repo.wt), before);
    } finally { undo(repo.wt); }
  }
});

test('a release-only commit with a passing release command is committed; a release deletion counts as release-only', () => {
  put(repo.wt, 'tools/release/gone.mjs', '// a\n');
  git(repo.wt, 'add', 'tools/release/gone.mjs');
  const ok = commit2(repo.wt, 'exit 5', 'exit 0');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stderr, /release-only tooling changed \(tools\/release\/gone\.mjs\); running: exit 0/);
  git(repo.wt, 'rm', '-q', 'tools/release/gone.mjs');
  const del = commit2(repo.wt, 'exit 5', 'exit 0');
  assert.equal(del.code, 0, del.out);
  assert.match(del.stderr, /release-only tooling changed/);
});

test('the release command defaults to npm run test:release, which runs the unit and release e2e tests', () => {
  const hook = readFileSync(new URL('../../.githooks/pre-commit', import.meta.url), 'utf8');
  assert.match(hook, /FW_PRECOMMIT_RELEASE_TEST_CMD \|\| 'npm run test:release'/);
  assert.match(hook, /FW_PRECOMMIT_TEST_CMD \|\| 'npm test'/);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:release'], /"tests\/unit\/\*\.test\.mjs" "tests\/e2e\/release-\*\.test\.mjs"/);
});

test('the main checkout uses the same hook (core.hooksPath is shared config)', () => {
  put(repo.main, 'tools/main-only.mjs');
  git(repo.main, 'add', 'tools/main-only.mjs');
  const r = commit(repo.main, 'exit 1');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /commit blocked/);
  git(repo.main, 'reset', '-q');
});

// ---- the committed baseline snapshot (site/, site-pretty/, baseline.json; CLAUDE.md Hard rules 3-4) ----
// Only an authorized snapshot update may change it: FW_BASELINE_UPDATE=<id of the staged baseline.json>,
// staged trees == pin, nothing else staged, committed on main (or baseline/*).
const bcommit = (dir, marker, msg = 'baseline', extra = []) => run('git', ['commit', '-q', ...extra, '-m', msg], { cwd: dir, env: { FW_PRECOMMIT_TEST_CMD: 'exit 0', ...(marker === undefined ? {} : { FW_BASELINE_UPDATE: marker }) } });
const pin = (dir) => {
  const r = run(process.execPath, [join(dir, 'tools', 'baseline.mjs'), 'pin', '--prettier', '3.9.9'], { cwd: dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PINNED b\d+-[0-9a-f]{8} /m);
  git(dir, 'add', 'baseline.json');
  return JSON.parse(readFileSync(join(dir, 'baseline.json'), 'utf8'));
};
const snapshotFiles = (dir, v) => {
  put(dir, 'site/index.html', `<!doctype html><p>build ${v}</p>\n`);
  put(dir, 'site/_app/version.json', `{"version":"178928448129${v}"}`);
  put(dir, 'site/.mirror/manifest.json', JSON.stringify({ origin: 'https://fastwork.example', lastRun: '2026-09-30T19:03:53.263Z', files: {} }));
  put(dir, 'site-pretty/index.html', `<!doctype html><p>build ${v}</p>\n`);
  put(dir, 'site-pretty/_app/version.json', `{"version":"178928448129${v}"}`);
};
const refusedBaseline = (r, re) => {
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.stderr, /pre-commit: BASELINE-MODIFIED: /);
  assert.match(r.stderr, re);
  assert.match(r.stderr, /git restore --source=HEAD --staged --worktree -- site site-pretty baseline\.json/, 'names the fix');
};
let s1;

test('baseline: a first snapshot without the marker is refused; the authorized form (main, marker = staged pin) commits it', () => {
  git(repo.main, 'reset', '-q');
  snapshotFiles(repo.main, 5);
  put(repo.main, 'site/.mirror/missing-local.txt', '/never-committed\n'); // gitignored: serve.mjs's 404 log
  git(repo.main, 'add', 'site', 'site-pretty');
  assert.doesNotMatch(git(repo.main, 'diff', '--cached', '--name-only'), /missing-local/);
  const before = head(repo.main);
  refusedBaseline(bcommit(repo.main), /not an authorized snapshot update/);
  s1 = pin(repo.main);
  assert.match(s1.snapshot, /^b1789284481295-[0-9a-f]{8}$/);
  assert.equal(s1.prettier, '3.9.9');
  assert.equal(s1.origin, 'https://fastwork.example');
  assert.equal(s1.crawledAt, '2026-09-30T19:03:53.263Z');
  refusedBaseline(bcommit(repo.main), /FW_BASELINE_UPDATE is not set/);
  refusedBaseline(bcommit(repo.main, 'b1789284481295-00000000'), /does not name the staged snapshot/);
  assert.equal(head(repo.main), before);
  const ok = bcommit(repo.main, s1.snapshot, `baseline: snapshot ${s1.snapshot}`);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stderr, new RegExp(`authorized baseline snapshot update ${s1.snapshot} on main`));
  assert.equal(git(repo.main, 'rev-parse', 'HEAD:site'), s1.trees.site);
  assert.equal(git(repo.main, 'rev-parse', 'HEAD:site-pretty'), s1.trees['site-pretty']);
  assert.equal(git(repo.main, 'status', '--porcelain', '--', 'site', 'site-pretty', 'baseline.json'), '', 'tracked and clean; missing-local.txt ignored');
});

test('baseline: a modified, deleted or added snapshot file is refused without the marker (also via commit -a)', () => {
  const before = head(repo.main);
  put(repo.main, 'site/index.html', '<!doctype html><p>a re-mirror</p>\n');
  git(repo.main, 'add', 'site/index.html');
  refusedBaseline(bcommit(repo.main), /not an authorized/);
  git(repo.main, 'restore', '--staged', '--worktree', 'site/index.html');
  git(repo.main, 'rm', '-q', 'site-pretty/index.html');
  refusedBaseline(bcommit(repo.main), /not an authorized/);
  git(repo.main, 'restore', '--staged', '--worktree', 'site-pretty/index.html');
  put(repo.main, 'site/_app/immutable/new.js', 'x\n');
  git(repo.main, 'add', 'site');
  refusedBaseline(bcommit(repo.main), /not an authorized/);
  git(repo.main, 'rm', '-q', '--cached', 'site/_app/immutable/new.js');
  rmSync(join(repo.main, 'site/_app/immutable/new.js'));
  put(repo.main, 'site/index.html', '<!doctype html><p>edited</p>\n');
  refusedBaseline(bcommit(repo.main, undefined, 'sneaky', ['-a']), /not an authorized/);
  git(repo.main, 'restore', '--staged', '--worktree', 'site/index.html');
  assert.equal(head(repo.main), before);
});

test('baseline: the marker does not authorize a stale pin, a forged id, a mixed commit, a pin-only edit or an agent branch', () => {
  const before = head(repo.main);
  // stale pin: site/ changed and staged, baseline.json still describes the old trees
  put(repo.main, 'site/index.html', '<!doctype html><p>new build</p>\n');
  git(repo.main, 'add', 'site');
  refusedBaseline(bcommit(repo.main, s1.snapshot), /trees\.site .* is not the staged site\//);
  // a forged pin whose id does not derive from the staged trees
  const p = pin(repo.main);
  writeFileSync(join(repo.main, 'baseline.json'), JSON.stringify({ ...p, snapshot: 'b1789284481295-deadbeef' }));
  git(repo.main, 'add', 'baseline.json');
  refusedBaseline(bcommit(repo.main, 'b1789284481295-deadbeef'), /do not derive from the staged trees/);
  // mixed with any other path
  pin(repo.main);
  put(repo.main, 'fixes/demo/notes.md', 'x\n');
  git(repo.main, 'add', 'fixes/demo/notes.md');
  refusedBaseline(bcommit(repo.main, p.snapshot), /must contain only site\/, site-pretty\/ and baseline\.json; also staged: fixes\/demo\/notes\.md/);
  git(repo.main, 'rm', '-q', '--cached', 'fixes/demo/notes.md');
  rmSync(join(repo.main, 'fixes/demo/notes.md'));
  git(repo.main, 'restore', '--source=HEAD', '--staged', '--worktree', 'site', 'site-pretty', 'baseline.json');
  // baseline.json alone is part of the snapshot too
  writeFileSync(join(repo.main, 'baseline.json'), JSON.stringify({ ...s1, note: 'edited' }));
  git(repo.main, 'add', 'baseline.json');
  refusedBaseline(bcommit(repo.main), /not an authorized/);
  git(repo.main, 'restore', '--source=HEAD', '--staged', '--worktree', 'baseline.json');
  assert.equal(head(repo.main), before);
  // an agent's branch (a worktree cut from main) can't commit a snapshot even with a correct marker
  const wt = join(repo.main, '.claude', 'worktrees', 'snap-wt');
  git(repo.main, 'worktree', 'add', '-q', wt, '-b', 'wt/snap');
  put(wt, 'site/index.html', '<!doctype html><p>agent build</p>\n');
  git(wt, 'add', 'site');
  const q = pin(wt);
  refusedBaseline(bcommit(wt, q.snapshot), /committed on main \(or a baseline\/\* branch\), not on "wt\/snap"/);
  git(repo.main, 'worktree', 'remove', '--force', wt);
});

test('baseline: a second authorized snapshot on main replaces the first; ordinary commits stay unaffected', () => {
  snapshotFiles(repo.main, 6);
  git(repo.main, 'add', 'site', 'site-pretty');
  const s2 = pin(repo.main);
  assert.notEqual(s2.snapshot, s1.snapshot);
  assert.match(s2.snapshot, /^b1789284481296-/);
  const ok = bcommit(repo.main, s2.snapshot);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(git(repo.main, 'rev-parse', 'HEAD:site'), s2.trees.site);
  put(repo.main, 'research/notes.md', 'unrelated\n');
  git(repo.main, 'add', 'research/notes.md');
  const plain = bcommit(repo.main, undefined, 'notes');
  assert.equal(plain.code, 0, plain.out);
  assert.doesNotMatch(plain.stderr, /BASELINE/);
});

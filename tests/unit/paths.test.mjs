// tools/lib/paths.mjs: where the baseline, shared state and ports come from, in a main checkout,
// in a real linked git worktree, with $FW_MIRROR_HOME / $FW_STATE_DIR overrides, and outside git.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';
import { makeTempRepo, tempDir, run } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

/** Evaluate paths.mjs exports as seen from the checkout `checkout` (REPO comes from the file location). */
function probe(checkout, env = {}) {
  const src = `const p = await import(${JSON.stringify(join(checkout, 'tools/lib/paths.mjs'))});
    console.log(JSON.stringify({ REPO: p.REPO, common: p.gitCommonDir(), linked: p.isLinkedWorktree(), main: p.mainCheckout(),
      home: p.mirrorHome(), site: p.resolveTree('site'), pretty: p.resolveTree('site-pretty'), abs: p.resolveTree('/abs/x'),
      custom: p.resolveTree('custom-root'), state: p.sharedStateDir(), port: p.autoPortBase(), id: p.checkoutId() }));`;
  const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: checkout, env });
  assert.equal(r.code, 0, r.out);
  return JSON.parse(r.stdout);
}

let repo, other;
before(() => {
  repo = makeTempRepo({ worktree: 'paths-wt' });
  makeFixtureHome(repo.main); // the baseline lives in the main checkout, like the real one
  other = tempDir('fw-home-');
  makeFixtureHome(other);
});

test('main checkout: finds its own site/ and uses the shared .git for state', () => {
  const p = probe(repo.main);
  assert.equal(p.REPO, repo.main);
  assert.equal(p.linked, false);
  assert.equal(p.common, join(repo.main, '.git'));
  assert.equal(p.main, repo.main);
  assert.equal(p.home, repo.main);
  assert.equal(p.site, join(repo.main, 'site'));
  assert.equal(p.pretty, join(repo.main, 'site-pretty'));
  assert.equal(p.abs, '/abs/x');
  assert.equal(p.state, join(repo.main, '.git', 'fastwork-mirror'));
});

test('linked worktree: no copy of the baseline, discovers the main checkout via git-common-dir', () => {
  const p = probe(repo.wt);
  assert.equal(p.REPO, repo.wt);
  assert.equal(p.linked, true);
  assert.equal(p.common, join(repo.main, '.git'));
  assert.equal(p.main, repo.main);
  assert.equal(p.home, repo.main);
  assert.equal(p.site, join(repo.main, 'site'));
  assert.equal(p.pretty, join(repo.main, 'site-pretty'));
  // lock state is shared by every worktree
  assert.equal(p.state, probe(repo.main).state);
  // relative custom roots that exist nowhere resolve against the mirror home
  assert.equal(p.custom, join(repo.main, 'custom-root'));
});

test('a tree that exists in the worktree itself is preferred over the main checkout', () => {
  mkdirSync(join(repo.wt, 'custom-root'), { recursive: true });
  assert.equal(probe(repo.wt).custom, join(repo.wt, 'custom-root'));
});

test('ports and ids are deterministic per checkout and inside 5200-5999 (never 5173)', () => {
  for (const c of [repo.main, repo.wt]) {
    const a = probe(c), b = probe(c);
    assert.equal(a.port, b.port);
    assert.ok(a.port >= 5200 && a.port <= 5999, `port ${a.port}`);
    assert.match(a.id, /^[\w.-]+-[0-9a-f]{6}$/);
  }
  assert.notEqual(probe(repo.main).id, probe(repo.wt).id);
});

test('FW_MIRROR_HOME overrides discovery, even in a checkout that has its own site/', () => {
  for (const c of [repo.main, repo.wt]) {
    const p = probe(c, { FW_MIRROR_HOME: other });
    assert.equal(p.home, other);
    assert.equal(p.site, join(other, 'site'));
    assert.equal(p.pretty, join(other, 'site-pretty'));
  }
  // a name that FW_MIRROR_HOME does not have still falls back to the checkout
  assert.equal(probe(repo.wt, { FW_MIRROR_HOME: other }).custom, join(repo.wt, 'custom-root'));
});

test('FW_STATE_DIR overrides the lock/state directory', () => {
  const d = tempDir('fw-state-');
  assert.equal(probe(repo.wt, { FW_STATE_DIR: d }).state, d);
});

test('outside any git repo: falls back to the checkout itself and out/ for state', () => {
  const d = tempDir('fw-nogit-');
  cpSync(join(repo.main, 'tools'), join(d, 'tools'), { recursive: true });
  const p = probe(d, { GIT_CEILING_DIRECTORIES: d.split('/').slice(0, -1).join('/') });
  assert.equal(p.common, null);
  assert.equal(p.linked, false);
  assert.equal(p.main, d);
  assert.equal(p.home, d);
  assert.equal(p.state, join(d, 'out', 'fastwork-mirror'));
});

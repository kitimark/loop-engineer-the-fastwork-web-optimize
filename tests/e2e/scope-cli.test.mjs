// tools/scope.mjs CLI (incident I-021): the scope guard that `npm run test:unit` runs first, in a
// linked worktree like the ones fix owners work in. Exit 0 = clean (or tooling explicitly allowed),
// 1 = tooling touched, 2 = cannot tell (no base ref).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo, node, git, tool } from '../helpers.mjs';

test('scope.mjs in a fix worktree: clean -> 0; a touched tool -> 1 naming it; FW_TOOLING=1 / --tooling -> 0; --dir; bad base -> 2', () => {
  const { wt } = makeTempRepo({ worktree: 'fix-scope' });
  const scope = (args = [], env = {}) => node(tool('scope.mjs'), args, { cwd: wt, env });

  mkdirSync(join(wt, 'fixes', 'scope'), { recursive: true });
  writeFileSync(join(wt, 'fixes', 'scope', 'README.md'), 'notes\n');
  let r = scope();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^SCOPE OK: no tooling paths changed since merge-base [0-9a-f]+ with main \(1 changed path\)/m);

  writeFileSync(join(wt, 'tools', 'fix.mjs'), '// oops\n', { flag: 'a' });
  git(wt, 'add', 'tools/fix.mjs');
  git(wt, 'commit', '-q', '-m', 'oops');
  writeFileSync(join(wt, 'package.json'), '{}\n');
  r = scope();
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^SCOPE TOOLING: 2 tooling paths changed/m);
  assert.match(r.stderr, /committed\s+tools\/fix\.mjs/);
  assert.match(r.stderr, /unstaged\s+package\.json/);
  assert.match(r.stderr, /npm test/);

  for (const [args, env] of [[[], { FW_TOOLING: '1' }], [['--tooling'], {}]]) {
    r = scope(args, env);
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, /^SCOPE TOOLING-ALLOWED/m);
    assert.match(r.stdout, /tools\/fix\.mjs/);
  }
  r = scope([], { FW_TOOLING: '0' });
  assert.equal(r.code, 1, 'FW_TOOLING=0 is not an opt-out');

  // --dir: a reviewer checks the owner's worktree from anywhere (here: from the temp repo's parent)
  r = node(tool('scope.mjs'), ['--dir', wt], { cwd: join(wt, '..') });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /committed\s+tools\/fix\.mjs/);

  r = scope(['--base', 'no-such-branch']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /no-such-branch/);
});

test('scope.mjs: a fix branch that carries a baseline snapshot change (e.g. from a revert, which skips pre-commit) -> 1, even with FW_TOOLING=1', () => {
  const { wt } = makeTempRepo({ worktree: 'fix-snapshot' });
  const scope = (args = [], env = {}) => node(tool('scope.mjs'), args, { cwd: wt, env });
  mkdirSync(join(wt, 'site-pretty'), { recursive: true });
  writeFileSync(join(wt, 'site-pretty', 'index.html'), '<p>new build</p>\n');
  writeFileSync(join(wt, 'baseline.json'), '{}\n');
  git(wt, 'add', 'site-pretty', 'baseline.json');
  git(wt, 'commit', '-q', '-m', 'Revert "baseline: snapshot"');
  for (const [args, env] of [[[], {}], [[], { FW_TOOLING: '1' }], [['--tooling'], {}]]) {
    const r = scope(args, env);
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /^SCOPE SNAPSHOT: 2 snapshot paths changed since merge-base [0-9a-f]+ with main on branch /m);
    assert.match(r.stderr, /committed\s+baseline\.json/);
    assert.match(r.stderr, /committed\s+site-pretty\/index\.html/);
  }
});

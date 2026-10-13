// tools/release/outgoing.mjs by hand: lists and checks the commits not pushed yet (the pre-push mode, with real pushes
// into a temp bare remote: tests/hooks/git-hooks.test.mjs and tests/e2e/githooks.test.mjs). A temp repo whose
// remote-tracking ref stands in for the public history; a temp known values file with made-up values. Nothing pushes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, run, node, REPO } from '../helpers.mjs';

const TOOL = join(REPO, 'tools', 'release', 'outgoing.mjs');
const NAME = 'Quentin Zorblax';

function repo({ name = 't', email = 't@example.invalid' } = {}) {
  const d = tempDir('fw-outgoing-');
  const known = join(d, 'known.json');
  writeFileSync(known, JSON.stringify({ literals: [{ value: NAME, token: '<name>' }, { value: 'qzuser', token: '<user>' }], lanPrefixes: ['10.77.31'] }), { mode: 0o600 });
  const env = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, FW_RELEASE_KNOWN: known };
  const cwd = join(d, 'repo');
  mkdirSync(cwd);
  const git = (...a) => { const r = run('git', a, { cwd, env }); assert.equal(r.code, 0, r.out); return r.stdout.trim(); };
  const commit = (file, text, msg) => { writeFileSync(join(cwd, file), text); git('add', file); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'main');
  commit('a.txt', 'a\n', 'a');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD'); // what the remote has (as after a fetch)
  const out = (args = [], extra = {}) => node(TOOL, args, { cwd, env: { ...env, ...extra } });
  return { cwd, git, commit, out, known };
}

test('outgoing.mjs by hand: default range (HEAD not on the remote), a range argument, exit 0 / 1 / 2, never a value', () => {
  const g = repo();
  let r = g.out();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CHECK 0 residual \(\d+ rules\)\nOUTGOING 0 commit\(s\) to origin: clean\n$/);
  g.commit('b.txt', 'b\n', 'add b');
  r = g.out();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^COMMIT [0-9a-f]{10} add b\nCHECK 0 residual \(\d+ rules\)\nOUTGOING 1 commit\(s\) to origin: clean\n$/);
  g.commit('c.txt', `met ${NAME}\n`, `thanks ${NAME}`);
  r = g.out();
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^COMMIT [0-9a-f]{10} thanks <name>$/m, 'subjects print with tokens');
  assert.match(r.stdout, /^HIT lit\d+-\S+ commit@[0-9a-f]{10}:\d+$/m);
  assert.match(r.stdout, /^HIT lit\d+-\S+ c\.txt@[0-9a-f]{10}:1$/m);
  assert.match(r.stdout, /^OUTGOING 2 commit\(s\) to origin: REFUSED$/m);
  assert.doesNotMatch(r.out, /zorblax/i);
  // a range: only the clean commit
  r = g.out(['origin/main..HEAD~1']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^OUTGOING 1 commit\(s\) to origin: clean$/m);
  // another remote name: nothing is known there, so everything on HEAD is outgoing and its identity is unknown
  r = g.out(['--remote', 'elsewhere']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^HIT identity-unknown commit@/m);
  assert.match(r.stdout, /^OUTGOING 3 commit\(s\) to elsewhere: REFUSED$/m);
  // usage and a missing known values file: exit 2 (the hook refuses on any non-zero exit)
  assert.equal(g.out(['--bogus']).code, 2);
  assert.equal(g.out(['a', 'b']).code, 2);
  r = g.out([], { FW_RELEASE_KNOWN: join(g.cwd, '..', 'none.json') });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /^OUTGOING refused: known values file .* not found/m);
  // a bad range: a git error refuses too
  r = g.out(['no-such-ref..HEAD']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /^OUTGOING failed \(refusing\): /m);
  // --help prints the header and runs nothing
  r = node(TOOL, ['--help'], { cwd: g.cwd });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^tools\/release\/outgoing\.mjs: the scrub check of what a push would publish/);
});

test('outgoing.mjs: an author/committer line naming a public identity is not scanned (the user keeps their name), an unknown one is', () => {
  // as check.mjs --source: the user's own name is a known value, and it is the identity of the public history
  const g = repo({ name: NAME, email: 'qz@example.invalid' });
  g.commit('b.txt', 'b\n', 'add b');
  let r = g.out();
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CHECK 0 residual/m);
  // the same name with another email is a new identity: refused, and its line is scanned (the name is a hit)
  writeFileSync(join(g.cwd, 'c.txt'), 'c\n');
  g.git('add', 'c.txt');
  g.git('commit', '-q', '--author', `${NAME} <other@example.invalid>`, '-m', 'add c');
  r = g.out();
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^HIT identity-unknown commit@[0-9a-f]{10}:3$/m);
  assert.match(r.stdout, /^HIT lit\d+-\S+ commit@[0-9a-f]{10}:3$/m);
  assert.doesNotMatch(r.stdout, /^HIT \S+ commit@[0-9a-f]{10}:4$/m, 'the committer line (public identity) is not scanned');
  assert.doesNotMatch(r.out, /zorblax/i);
});

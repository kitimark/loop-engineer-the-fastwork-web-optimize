// Tests for the versioned git hooks in .githooks/ (CLAUDE.md "Hard rules" 1-2: rebase +
// fast-forward only, no merge or squash-merge commits; only the user pushes, after the scrub check). Every test builds a throwaway
// repo in the OS temp dir and runs git with `-c core.hooksPath=<this checkout>/.githooks`, with the
// user's global/system git config switched off, so nothing here touches this repository.
// Hook semantics: https://git-scm.com/docs/githooks. Run: node --test tests/hooks/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, cpSync, chmodSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = join(ROOT, '.githooks');

const gitEnv = (home) => {
  const env = {
    ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
    GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no',
  };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|PREFIX|CONFIG_(COUNT|PARAMETERS|KEY_|VALUE_))/.test(k)) delete env[k];
  return env;
};

// The diverged start repo (main: a, c; feature: a, b), built once per file with the hooks on, exactly as
// each test used to build it, and copied per test (incident I-027: the ~6 hooked git spawns per test were
// most of this file's wall time). Every test still gets its own copy.
let template;
function templateRepo() {
  if (template) return template;
  const dir = mkdtempSync(join(tmpdir(), 'rebase-only-tpl-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const env = gitEnv(dir);
  const repo = join(dir, 'repo');
  const git = (...args) => { const r = spawnSync('git', ['-c', `core.hooksPath=${HOOKS}`, ...args], { cwd: repo, env, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`); };
  const commit = (file) => { writeFileSync(join(repo, file), `${file[0]}\n`); git('add', file); git('commit', '-q', '-m', file); };
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { env });
  commit('a.txt');
  git('switch', '-q', '-c', 'feature');
  commit('b.txt');
  git('switch', '-q', 'main');
  commit('c.txt'); // main and feature have diverged
  return (template = repo);
}

function makeRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rebase-only-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = gitEnv(dir);
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
  cpSync(templateRepo(), repo, { recursive: true });
  const r = mk();
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

// pre-push (user, 2026-10-13: only the user pushes, after a scrub check): the hook runs tools/release/outgoing.mjs
// on git's ref lines and refuses unless it exits 0. Real pushes into a temp bare remote, with a temp known values file
// (made-up values only).
const PLANT = { name: 'Quentin Zorblax', user: 'qzuser' };
function pushRepo(t, { knownFile, allow = [], hooks = HOOKS } = {}) {
  const g = makeRepo(t);
  const remote = join(g.dir, 'remote.git');
  assert.equal(spawnSync('git', ['init', '-q', '--bare', remote], { env: gitEnv(g.dir) }).status, 0);
  g.noHooks('remote', 'add', 'origin', remote);
  g.noHooks('push', '-q', 'origin', 'main'); // the public history: pushed before the hook existed
  const known = join(g.dir, 'known.json');
  writeFileSync(known, JSON.stringify({ literals: [{ value: PLANT.name, token: '<name>' }, { value: PLANT.user, token: '<user>' }], lanPrefixes: ['10.77.31'], allow }), { mode: 0o600 });
  const env = { ...gitEnv(g.dir), FW_RELEASE_KNOWN: knownFile ?? known };
  const push = (...args) => {
    const r = spawnSync('git', ['-c', `core.hooksPath=${hooks}`, 'push', ...args], { cwd: g.repo, env, encoding: 'utf8' });
    return { ...r, out: `${r.stdout}${r.stderr}` };
  };
  const remoteHead = (ref = 'main') => spawnSync('git', ['--git-dir', remote, 'rev-parse', '-q', '--verify', ref], { encoding: 'utf8' }).stdout.trim();
  // a commit made with the hooks off (pre-commit itself refuses some of the paths the push must refuse too)
  const rawCommit = (file, content, msg = file) => { mkdirSync(dirname(join(g.repo, file)), { recursive: true }); writeFileSync(join(g.repo, file), content); g.noHooks('add', '-f', file); g.noHooks('commit', '-q', '-m', msg); };
  return { ...g, remote, push, remoteHead, rawCommit };
}
/** A PNG with the given ancillary chunks (pngChunk from the release fixtures). */
const pngWith = (pngChunk, extra = []) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0])), ...extra, pngChunk('IDAT', deflateSync(Buffer.from([0, 0]))), pngChunk('IEND', Buffer.alloc(0))]);
const pushRefused = (r, re) => {
  assert.notEqual(r.status, 0, `expected the push to be refused:\n${r.out}`);
  assert.match(r.out, /rebase-only: push refused/);
  assert.match(r.out, re);
};

test('pre-push: a clean fast-forward push passes the scrub check and lands', (t) => {
  const g = pushRepo(t);
  const c = g.commit('d.txt', 'd\n', 'add d');
  const r = g.push('-q', 'origin', 'main');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^COMMIT [0-9a-f]{10} add d$/m);
  assert.match(r.out, /^CHECK 0 residual \(\d+ rules\)$/m);
  assert.match(r.out, /^OUTGOING 1 commit\(s\) to origin: clean$/m);
  assert.equal(g.remoteHead(), c);
  // nothing new to push: no ref lines, nothing to check
  assert.equal(g.push('-q', 'origin', 'main').status, 0);
  // a new branch: only the commits the remote does not have are outgoing
  g.ok('switch', '-q', '-c', 'topic');
  g.commit('e.txt', 'e\n', 'add e');
  const n = g.push('origin', 'topic');
  assert.equal(n.status, 0, n.out);
  assert.match(n.out, /^OUTGOING 1 commit\(s\) to origin: clean$/m);
  // what the remote has comes from the remote (ls-remote), not from remote-tracking refs: none left here
  for (const r of g.ok('for-each-ref', '--format=%(refname)', 'refs/remotes').split('\n').filter(Boolean)) g.ok('update-ref', '-d', r);
  g.ok('switch', '-q', '-c', 'topic2');
  g.commit('f.txt', 'f\n', 'add f');
  const n2 = g.push('origin', 'topic2');
  assert.equal(n2.status, 0, n2.out);
  assert.match(n2.out, /^OUTGOING 1 commit\(s\) to origin: clean$/m);
});

test('pre-push: a clean picture and an allow-listed binary pass; the remote-tracking refs do not hide a commit the remote lacks', async (t) => {
  const { pngChunk } = await import('../fixtures/release/stage.mjs');
  const g = pushRepo(t, { allow: [{ path: 'fixtures/*.bin', pattern: 'x', reason: 'test binary' }] });
  g.commit('pic.png', pngWith(pngChunk), 'a picture');
  mkdirSync(join(g.repo, 'fixtures'), { recursive: true });
  g.commit('fixtures/data.bin', Buffer.from([0, 1, 2, 3, 0, 255]), 'a binary the known file allows');
  const r = g.push('origin', 'main');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^OUTGOING 2 commit\(s\) to origin: clean$/m);
  // a planted commit that only a local remote-tracking ref points at (the remote never had it)
  g.ok('switch', '-q', '-c', 'x');
  g.commit('p.txt', `by ${PLANT.name}\n`, 'planted');
  g.ok('update-ref', 'refs/remotes/origin/x', 'HEAD');
  g.commit('q.txt', 'q\n', 'on top');
  const before = g.remoteHead('x');
  pushRefused(g.push('origin', 'x'), /^HIT lit\d+-\S+ p\.txt@[0-9a-f]{10}:1$/m);
  assert.equal(g.remoteHead('x'), before);
});

test('pre-push: a planted personal value, secret shape or unknown identity refuses; the value is never printed', async (t) => {
  const { FAKE_KEY } = await import('../fixtures/release/stage.mjs');
  for (const [what, plant, re, args] of [
    ['file content', (g) => g.commit('d.txt', `by ${PLANT.name}\n`, 'add d'), /^HIT lit\d+-\S+ d\.txt@[0-9a-f]{10}:1$/m],
    ['letter case', (g) => g.commit('d.txt', `by ${PLANT.name.toUpperCase()}\n`, 'add d'), /^HIT lit\d+-\S+ d\.txt@/m],
    ['commit message', (g) => g.commit('d.txt', 'd\n', `thanks ${PLANT.name}`), /^HIT lit\d+-\S+ commit@[0-9a-f]{10}:\d+$/m],
    ['path name', (g) => g.commit(`${PLANT.user}.txt`, 'd\n', 'add a file'), /^HIT lit\d+-\S+ path@[0-9a-f]{10}\/<user>\.txt:0$/m],
    ['LAN address', (g) => g.commit('d.txt', 'http://10.77.31.12:5173/\n', 'add d'), /^HIT lan0 d\.txt@/m],
    ['secret shape', (g) => g.commit('d.js', `const apiKey = "${FAKE_KEY}";\n`, 'add d'), /^HIT secret-kv d\.js@/m],
    ['unknown identity', (g) => { writeFileSync(join(g.repo, 'd.txt'), 'd\n'); g.ok('add', 'd.txt'); g.ok('commit', '-q', '--author', 'Someone Else <else@example.invalid>', '-m', 'add d'); }, /^HIT identity-unknown commit@[0-9a-f]{10}:\d+$/m],
    ['an earlier commit of the range', (g) => { g.commit('d.txt', `by ${PLANT.name}\n`, 'add d'); g.commit('d.txt', 'd\n', 'clean again'); }, /^HIT lit\d+-\S+ d\.txt@/m],
    ['a replace ref hiding the planted blob (pack-objects sends the original)', (g) => {
      g.commit('d.txt', `by ${PLANT.name}\n`, 'add d');
      writeFileSync(join(g.dir, 'clean.txt'), 'd\n');
      g.ok('replace', g.ok('rev-parse', 'HEAD:d.txt'), g.ok('hash-object', '-w', join(g.dir, 'clean.txt')));
    }, /^HIT lit\d+-\S+ d\.txt@[0-9a-f]{10}:1$/m],
    ['UTF-16 text', (g) => g.commit('d.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`by ${PLANT.name}\n`, 'utf16le')]), 'add d'), /^HIT lit\d+-\S+ d\.txt@[0-9a-f]{10}:1$/m],
    ['UTF-16 text without a BOM', (g) => g.commit('d.txt', Buffer.from(`notes by ${PLANT.name}\n`, 'utf16le'), 'add d'), /^HIT lit\d+-\S+ d\.txt@[0-9a-f]{10}:1$/m],
    ['the snapshot', (g) => g.rawCommit('site/index.html', '<p>x</p>\n', 'snapshot'), /^HIT path-forbidden path@[0-9a-f]{10}\/site\/index\.html:0$/m],
    ['measurement output', (g) => g.rawCommit('out/ab/verify.json', '{}\n', 'out'), /^HIT path-forbidden path@[0-9a-f]{10}\/out\/ab\/verify\.json:0$/m],
    ['an overlay', (g) => g.rawCommit('fixes/x/overlay/a.js', 'x\n', 'overlay'), /^HIT path-forbidden path@[0-9a-f]{10}\/fixes\/x\/overlay\/a\.js:0$/m],
    ['a key file', (g) => g.rawCommit('certs/lan.PEM', 'x\n', 'pem'), /^HIT path-forbidden /m],
    ['a Python cache', (g) => g.rawCommit('research/x/__pycache__/a.pyc', 'x\n', 'pyc'), /^HIT path-forbidden /m],
    ['a binary blob', (g) => g.commit('d.bin', Buffer.from([0, 1, 2, 3, 0, 255]), 'add d'), /^HIT binary-unchecked d\.bin@[0-9a-f]{10}:0$/m],
    ['a picture with text metadata', async (g) => { const { pngChunk } = await import('../fixtures/release/stage.mjs'); g.commit('p.png', pngWith(pngChunk, [pngChunk('tEXt', Buffer.from('Comment\0hello'))]), 'add p'); }, /^HIT media-text p\.png@[0-9a-f]{10}:0$/m],
    ['a file named as a picture that is none', (g) => g.commit('p.png', 'not a picture\n', 'add p'), /^HIT media-not-an-image p\.png@/m],
    ['a pushed ref name', (g) => g.commit('d.txt', 'd\n', 'add d'), /^HIT lit\d+-\S+ ref@refs\/heads\/<user>-topic:0$/m, ['origin', `HEAD:refs/heads/${PLANT.user}-topic`]],
  ]) {
    await t.test(what, async (tt) => {
      const g = pushRepo(tt);
      const before = g.remoteHead();
      await plant(g);
      const r = g.push(...(args ?? ['origin', 'main']));
      pushRefused(r, re);
      assert.match(r.out, /^OUTGOING \d+ commit\(s\) to origin: REFUSED$/m);
      assert.doesNotMatch(r.out.toLowerCase(), new RegExp(`${PLANT.name.toLowerCase()}|${PLANT.user}|${FAKE_KEY.toLowerCase()}|10\\.77\\.31`), 'no value is printed');
      assert.equal(g.remoteHead(), before, 'the remote did not move');
    });
  }
});

test('pre-push: a merge commit, a non-fast-forward, a delete, a tag and a remote commit not fetched are refused', (t) => {
  const g = pushRepo(t);
  const before = g.remoteHead();
  // a merge commit among the outgoing commits (made with the hooks off: the push is the last line)
  g.noHooks('merge', '-q', '--no-ff', '--no-edit', 'feature');
  pushRefused(g.push('origin', 'main'), /^REFUSED merge commit [0-9a-f]{10} in the outgoing commits/m);
  assert.equal(g.remoteHead(), before);
  // a non-fast-forward (forced: git itself refuses it without --force)
  g.ok('reset', '-q', '--hard', 'main~1'); // drop the merge: main at c again ...
  g.ok('reset', '-q', '--hard', 'main~1'); // ... and at a: the remote's c is no ancestor
  g.commit('e.txt', 'e\n', 'add e');
  pushRefused(g.push('--force', 'origin', 'main'), /^REFUSED refs\/heads\/main: not a fast-forward/m);
  assert.equal(g.remoteHead(), before);
  // a delete
  g.noHooks('push', '-q', 'origin', 'feature');
  pushRefused(g.push('origin', '--delete', 'feature'), /^REFUSED deleting refs\/heads\/feature/m);
  assert.ok(g.remoteHead('feature'));
  // a tag
  g.ok('tag', 'v9', 'feature');
  pushRefused(g.push('origin', 'v9'), /^REFUSED refs\/tags\/v9: only branches/m);
  assert.equal(g.remoteHead('v9'), '');
  // the remote moved on and this clone has not fetched it
  const other = join(g.dir, 'other');
  g.noHooks('clone', '-q', '-b', 'main', g.remote, other);
  const o = g.mk(other);
  o.commit('f.txt', 'f\n', 'add f');
  o.noHooks('push', '-q', 'origin', 'main');
  g.ok('reset', '-q', '--hard', before);
  g.commit('h.txt', 'h\n', 'add h');
  pushRefused(g.push('--force', 'origin', 'main'), /^REFUSED refs\/heads\/main: the remote is at [0-9a-f]{10}, which is not here \(fetch first/m);
});

test('pre-push: no known values file, or an unreadable one, refuses (fail closed)', (t) => {
  for (const [knownFile, re] of [['/nonexistent/known.json', /known values file .* not found/], [null, /readable by others/]]) {
    const g = pushRepo(t, { knownFile: knownFile ?? undefined });
    if (!knownFile) chmodSync(join(g.dir, 'known.json'), 0o644);
    const before = g.remoteHead();
    g.commit('d.txt', 'd\n', 'add d');
    pushRefused(g.push('origin', 'main'), re);
    assert.equal(g.remoteHead(), before);
  }
});

test('pre-push: hooks without the scrub tool beside them refuse every push (fail closed)', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'rebase-only-hooks-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  cpSync(HOOKS, join(d, '.githooks'), { recursive: true }); // the hooks alone: no tools/release/ beside them
  const g = pushRepo(t, { hooks: join(d, '.githooks') });
  g.commit('d.txt', 'd\n', 'add d');
  const before = g.remoteHead();
  pushRefused(g.push('origin', 'main'), /push refused: the scrub check \S+outgoing\.mjs is missing \(fail-closed\)/);
  assert.equal(g.remoteHead(), before);
});

test('hook files are executable (git silently ignores non-executable hooks)', () => {
  for (const h of ['pre-merge-commit', 'commit-msg', 'reference-transaction', 'pre-push']) {
    const p = join(HOOKS, h);
    assert.ok(existsSync(p), `${h} missing`);
    const r = spawnSync('test', ['-x', p]);
    assert.equal(r.status, 0, `${h} is not executable`);
  }
});

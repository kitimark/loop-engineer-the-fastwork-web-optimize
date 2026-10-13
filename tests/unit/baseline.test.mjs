// tools/lib/baseline.mjs + tools/baseline.mjs: the committed baseline snapshot and its pin baseline.json.
// Pin format (snapshot id = b<build>-<contentHash[0:8]>, tree ids from the index or a commit), and the
// status every tool checks at start, seen from a main checkout and from a linked worktree (sparse: reads
// the main checkout's snapshot; own copy: reads its own): ok / unpinned / override / bad-pin / modified
// (also untracked new files; gitignored volatile files don't count) / mismatch / untracked / missing.
// Temp repos only (no hooks): the authorized-commit rules are covered by tests/e2e/githooks.test.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, statSync, utimesSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { makeTempRepo, tempDir, run, git } from '../helpers.mjs';
import { makeFixtureHome } from '../fixtures/baseline.mjs';

const probe = (checkout, env = {}) => {
  const src = `const b = await import(${JSON.stringify(join(checkout, 'tools/lib/baseline.mjs'))});
    const s = b.baselineStatus(); console.log(JSON.stringify({ ...s, meta: b.baselineMeta(s), sparse: b.isSparse() }));`;
  const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: checkout, env });
  assert.equal(r.code, 0, r.out);
  return JSON.parse(r.stdout);
};
const cli = (checkout, args, env = {}) => run(process.execPath, [join(checkout, 'tools', 'baseline.mjs'), ...args], { cwd: checkout, env });
const pinOf = (dir) => JSON.parse(readFileSync(join(dir, 'baseline.json'), 'utf8'));
/** Stage site/ + site-pretty/, pin, commit (what the lead does; no hooks in these temp repos). */
function commitSnapshot(dir, msg = 'snapshot') {
  git(dir, 'add', 'site', 'site-pretty');
  const r = cli(dir, ['pin', '--prettier', '3.9.9', '--note', 'test']);
  assert.equal(r.code, 0, r.out);
  git(dir, 'add', 'baseline.json');
  git(dir, 'commit', '-q', '-m', msg);
  return pinOf(dir);
}

let repo, wt, s1;
before(() => {
  repo = makeTempRepo({ worktree: null });
  makeFixtureHome(repo.main);
  s1 = commitSnapshot(repo.main);
  wt = join(repo.main, '.claude', 'worktrees', 'bl-wt');
  git(repo.main, 'worktree', 'add', '-q', wt, '-b', 'wt/bl');
});

test('pin format: id, trees, content hash, build, crawl data, file counts; index == HEAD once committed', () => {
  assert.equal(s1.trees.site, git(repo.main, 'rev-parse', 'HEAD:site'));
  assert.equal(s1.trees['site-pretty'], git(repo.main, 'rev-parse', 'HEAD:site-pretty'));
  const h = createHash('sha256').update(`site ${s1.trees.site}\nsite-pretty ${s1.trees['site-pretty']}\n`).digest('hex');
  assert.equal(s1.contentHash, h);
  assert.equal(s1.snapshot, `bfixture-${h.slice(0, 8)}`);
  assert.equal(s1.build, 'fixture');
  assert.equal(s1.builtAt, null, 'only a 13-digit ms build id is a timestamp');
  assert.equal(s1.origin, 'https://fastwork.com');
  assert.equal(s1.prettier, '3.9.9');
  assert.equal(s1.note, 'test');
  assert.equal(s1.files.site, Number(git(repo.main, 'ls-files', 'site').split('\n').length));
  assert.ok(s1.files['site-pretty'] > 5);
  const r = run(process.execPath, ['--input-type=module', '-e', `const b = await import(${JSON.stringify(join(repo.main, 'tools/lib/baseline.mjs'))}); console.log(JSON.stringify(b.computePin({ from: 'HEAD', prettier: '3.9.9' })))`], { cwd: repo.main });
  const head = JSON.parse(r.stdout);
  assert.deepEqual([head.snapshot, head.trees, head.contentHash], [s1.snapshot, s1.trees, s1.contentHash]);
  // a 13-digit SvelteKit build id is the build time
  const d = tempDir('fw-pin-');
  git(d, 'init', '-q', '-b', 'main');
  mkdirSync(join(d, 'tools'));
  run('cp', ['-R', join(repo.main, 'tools') + '/', join(d, 'tools')]);
  makeFixtureHome(d);
  writeFileSync(join(d, 'site', '_app', 'version.json'), '{"version":"1789284481295"}');
  git(d, 'add', 'site', 'site-pretty');
  const p = cli(d, ['pin']);
  assert.equal(p.code, 0, p.out);
  assert.match(p.stderr, /Prettier version unknown/);
  assert.match(p.stdout, /FW_BASELINE_UPDATE=b1789284481295-[0-9a-f]{8} git commit/);
  assert.equal(pinOf(d).builtAt, '2026-09-13T07:28:01.295Z');
});

test('pin refuses when the snapshot is not staged', () => {
  const d = tempDir('fw-pin-empty-');
  git(d, 'init', '-q', '-b', 'main');
  run('cp', ['-R', join(repo.main, 'tools') + '/', join(d, 'tools')]);
  const r = cli(d, ['pin']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /site\/ is not staged .*git add site site-pretty/);
  assert.equal(existsSync(join(d, 'baseline.json')), false);
});

test('main checkout with the committed snapshot: ok, metadata records the id', () => {
  const s = probe(repo.main);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.snapshot, s1.snapshot);
  assert.deepEqual(s.meta, { snapshot: s1.snapshot, state: 'ok' });
  assert.deepEqual(s.homes, [repo.main]);
  assert.equal(s.message, `baseline ${s1.snapshot} (${repo.main}) matches baseline.json`);
  const c = cli(repo.main, ['status']);
  assert.equal(c.code, 0, c.out);
  assert.match(c.stdout, new RegExp(`^snapshot\\s+${s1.snapshot}$`, 'm'));
  // I-268: a tracked snapshot is checked as before: no `source`, nothing hashed, no fingerprint cache written
  assert.equal('source' in s, false);
  assert.match(c.stdout, /^read from  \S+$/m);
  assert.equal(existsSync(join(repo.main, '.git', 'fastwork-mirror', 'baseline-untracked.json')), false);
  // a tracked snapshot deleted from the working tree: checked out from HEAD, as before (not npm run init)
  renameSync(join(repo.main, 'site-pretty'), join(repo.main, 'site-pretty.away'));
  try {
    const m = probe(repo.main);
    assert.equal(m.state, 'missing');
    assert.match(m.message, /Check it out: git checkout HEAD -- site site-pretty$/);
  } finally { renameSync(join(repo.main, 'site-pretty.away'), join(repo.main, 'site-pretty')); }
});

test('I-268 release checkout: HEAD does not track the snapshot, the unpacked files are verified against the pin', () => {
  // the public release: site/ and site-pretty/ are gone from history (gitignored), baseline.json stays, npm run init unpacks them
  const rel = makeTempRepo({ worktree: null });
  writeFileSync(join(rel.main, 'baseline.json'), JSON.stringify(s1, null, 1) + '\n');
  writeFileSync(join(rel.main, '.gitignore'), `${readFileSync(join(rel.main, '.gitignore'), 'utf8')}/site/\n/site-pretty/\n`);
  git(rel.main, 'add', 'baseline.json', '.gitignore');
  git(rel.main, 'commit', '-q', '-m', 'release pin');
  // no files: missing, as before
  let m = probe(rel.main);
  assert.equal(m.state, 'missing');
  assert.match(m.message, /does not track the snapshot \(the public release\): install it from the release file: npm run init$/);
  makeFixtureHome(rel.main);
  const cache = join(rel.main, '.git', 'fastwork-mirror', 'baseline-untracked.json');
  let s = probe(rel.main);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.ok, true);
  assert.equal(s.source, 'untracked, verified');
  assert.equal(s.snapshot, s1.snapshot);
  assert.deepEqual(s.meta, { snapshot: s1.snapshot, state: 'ok' });
  assert.deepEqual(s.homes, [rel.main]);
  assert.match(s.message, /matches baseline\.json \(untracked, verified: site, site-pretty\)$/);
  assert.equal(git(rel.main, 'status', '--porcelain'), '', 'the check writes nothing into the checkout');
  const c = cli(rel.main, ['status']);
  assert.equal(c.code, 0, c.out);
  assert.match(c.stdout, /^read from  .* \(untracked, verified\)$/m);
  // the fingerprint cache: written once, used by the next process (verify.mjs re-checks after every run)
  assert.ok(existsSync(cache));
  const ids = (dir) => {
    const src = `const b = await import(${JSON.stringify(join(dir, 'tools/lib/baseline.mjs'))});
      console.log(JSON.stringify(b.TREES.map((t) => b.untrackedTreeId(${JSON.stringify(dir)}, t))));`;
    const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: dir });
    assert.equal(r.code, 0, r.out);
    return JSON.parse(r.stdout);
  };
  assert.deepEqual(ids(rel.main), [{ tree: s1.trees.site, cached: true }, { tree: s1.trees['site-pretty'], cached: true }]);
  // volatile files the tools write (and Finder's .DS_Store) do not count, as in a tracked checkout
  writeFileSync(join(rel.main, 'site', '.mirror', 'missing-local.txt'), '/x\n');
  writeFileSync(join(rel.main, 'site-pretty', '_app', '.DS_Store'), 'x');
  mkdirSync(join(rel.main, 'site', '.mirror', 'chrome-profile'), { recursive: true });
  writeFileSync(join(rel.main, 'site', '.mirror', 'chrome-profile', 'Prefs'), '{}');
  assert.equal(probe(rel.main).state, 'ok');
  // a tampered byte (same size, mtime set back: the ctime still moves), an added and a deleted file: modified
  const idx = join(rel.main, 'site-pretty', 'index.html');
  const orig = readFileSync(idx);
  for (const [mutate, undo] of [
    [() => { const st = statSync(idx); const b = Buffer.from(orig); b[b.length - 2] ^= 1; writeFileSync(idx, b); utimesSync(idx, st.atime, st.mtime); }, () => writeFileSync(idx, orig)],
    [() => writeFileSync(join(rel.main, 'site', '_app', 'new-build.js'), 'x'), () => rmSync(join(rel.main, 'site', '_app', 'new-build.js'))],
    [() => rmSync(join(rel.main, 'site', 'robots.txt')), () => writeFileSync(join(rel.main, 'site', 'robots.txt'), 'User-agent: *\nAllow: /\n')],
  ]) {
    mutate();
    s = probe(rel.main);
    assert.equal(s.state, 'modified', s.message);
    assert.equal(s.ok, false);
    assert.match(s.message, /^BASELINE-MODIFIED: .*\(not tracked by git\) has tree [0-9a-f]{10}, not the pinned [0-9a-f]{10}: it is not the snapshot bfixture-\w+ .*npm run init/s);
    assert.equal(cli(rel.main, ['status']).code, 3);
    const src = `const b = await import(${JSON.stringify(join(rel.main, 'tools/lib/baseline.mjs'))}); b.requireBaseline('demo'); console.log('CONTINUED');`;
    const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: rel.main });
    assert.equal(r.code, 3, r.out);
    assert.match(r.stderr, /^demo: BASELINE-MODIFIED: /);
    undo();
  }
  s = probe(rel.main);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.source, 'untracked, verified');
  // a pin that does not describe the files (another snapshot's release file unpacked): modified, not ok
  writeFileSync(join(rel.main, 'baseline.json'), JSON.stringify({ ...s1, trees: { ...s1.trees, 'site-pretty': 'f'.repeat(40) } }));
  s = probe(rel.main);
  assert.equal(s.state, 'modified');
  assert.match(s.message, /site-pretty \(not tracked by git\) has tree \w{10}, not the pinned ffffffffff/);
  git(rel.main, 'checkout', '--', 'baseline.json');
  assert.equal(probe(rel.main).state, 'ok');
});

test('I-270 release checkout with redacted snapshot files: exactly the listed swaps are accepted, anything else is MODIFIED', () => {
  const rel = makeTempRepo({ worktree: null });
  writeFileSync(join(rel.main, 'baseline.json'), JSON.stringify(s1, null, 1) + '\n');
  writeFileSync(join(rel.main, '.gitignore'), `${readFileSync(join(rel.main, '.gitignore'), 'utf8')}/site/\n/site-pretty/\n`);
  makeFixtureHome(rel.main);
  // the release redacted one vendored file: its bytes differ from the pinned ones, the manifest lists both blob ids
  const path = 'site-pretty/index.html';
  const orig = readFileSync(join(rel.main, path));
  const redacted = Buffer.concat([orig, Buffer.from('<!-- apiKey: "[secret omitted: secret-kv]" -->\n')]);
  writeFileSync(join(rel.main, path), redacted);
  const blobOf = (buf) => run('git', ['hash-object', '--stdin'], { cwd: rel.main, input: buf }).stdout.trim();
  const entry = { path, rule: 'secret-kv', originalBlob: blobOf(orig), redactedBlob: blobOf(redacted) };
  assert.equal(entry.originalBlob, git(repo.main, 'rev-parse', `HEAD:${path}`));
  const manifest = (redactedList) => JSON.stringify({ version: 1, release: 'r1', assets: [{ name: 's.tar.gz', sha256: '0'.repeat(64), bytes: 1, unpackTo: '.', kind: 'snapshot', redacted: redactedList }] }, null, 1) + '\n';
  const commitManifest = (redactedList) => {
    writeFileSync(join(rel.main, 'tools', 'release', 'release-assets.json'), manifest(redactedList));
    git(rel.main, 'add', 'baseline.json', '.gitignore', 'tools/release/release-assets.json');
    git(rel.main, 'commit', '-q', '-m', 'release manifest');
  };
  // without a listing the redacted file is a change
  git(rel.main, 'add', 'baseline.json', '.gitignore');
  git(rel.main, 'commit', '-q', '-m', 'release pin');
  let s = probe(rel.main);
  assert.equal(s.state, 'modified', s.message);
  // 1. the accepted swap
  commitManifest([entry]);
  s = probe(rel.main);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.source, 'untracked, verified');
  assert.equal(s.redacted, 1);
  assert.match(s.message, /\(untracked, verified: site, site-pretty; 1 redacted file\(s\) as tools\/release\/release-assets\.json lists\)$/);
  // a local, uncommitted edit of the manifest does not count (HEAD's listing is read)
  writeFileSync(join(rel.main, 'tools', 'release', 'release-assets.json'), manifest([]));
  assert.equal(probe(rel.main).state, 'ok');
  git(rel.main, 'checkout', '--', 'tools/release/release-assets.json');
  // 2. an unlisted change
  writeFileSync(join(rel.main, 'site', 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  s = probe(rel.main);
  assert.equal(s.state, 'modified', s.message);
  assert.match(s.message, /^BASELINE-MODIFIED: .*site \(not tracked by git\) has tree/);
  writeFileSync(join(rel.main, 'site', 'robots.txt'), 'User-agent: *\nAllow: /\n');
  assert.equal(probe(rel.main).state, 'ok');
  // 3. a listed path whose current blob is not the redactedBlob (here: the original, unredacted bytes)
  writeFileSync(join(rel.main, path), orig);
  s = probe(rel.main);
  assert.equal(s.state, 'modified', s.message);
  assert.match(s.message, /^BASELINE-MODIFIED: \S+site-pretty \(not tracked by git\): site-pretty\/index\.html is listed as redacted \(secret-kv\) but its blob \w{10} is not the listed \w{10}/);
  writeFileSync(join(rel.main, path), redacted);
  assert.equal(probe(rel.main).state, 'ok');
  // 4. a listing that names a path outside site*/ (or is malformed): refused as a whole
  for (const [bad, re] of [
    [[entry, { ...entry, path: 'tools/lib/baseline.mjs' }], /redaction path "tools\/lib\/baseline\.mjs" is not a file below site\/ or site-pretty\//],
    [[{ ...entry, path: 'site/../tools/x.js' }], /is not a file below/],
    [[{ ...entry, redactedBlob: entry.originalBlob }], /must be two different git blob ids/],
    [[entry, entry], /is listed twice/],
  ]) {
    commitManifest(bad);
    s = probe(rel.main);
    assert.equal(s.state, 'modified', s.message);
    assert.match(s.message, re);
    assert.match(s.message, /^BASELINE-MODIFIED: baseline\.json pins \S+, but tools\/release\/release-assets\.json's list of redacted snapshot files is not usable/);
  }
  // 5. a listed swap whose original blob id is wrong: the tree id is not the pinned one
  commitManifest([{ ...entry, originalBlob: 'a'.repeat(40) }]);
  s = probe(rel.main);
  assert.equal(s.state, 'modified', s.message);
  assert.match(s.message, /site-pretty \(not tracked by git\) has tree \w{10}, not the pinned/);
  // 6. a listing that covers a changed file the packer never redacted (no "[secret omitted: …]" mark in it)
  const robots = join(rel.main, 'site', 'robots.txt');
  const robotsOrig = readFileSync(robots);
  writeFileSync(robots, 'User-agent: *\nDisallow: /\n');
  commitManifest([entry, { path: 'site/robots.txt', rule: 'secret-kv', originalBlob: blobOf(robotsOrig), redactedBlob: blobOf(readFileSync(robots)) }]);
  s = probe(rel.main);
  assert.equal(s.state, 'modified', s.message);
  assert.match(s.message, /site\/robots\.txt is listed as redacted \(secret-kv\) but holds no "\[secret omitted: …\]" mark/);
  writeFileSync(robots, robotsOrig);
  commitManifest([entry]);
  assert.equal(probe(rel.main).state, 'ok');
  // 7. a checkout that tracks the snapshot (this study's repo) never takes a swap, listed or not
  const tracked = makeTempRepo({ worktree: null });
  makeFixtureHome(tracked.main);
  commitSnapshot(tracked.main);
  writeFileSync(join(tracked.main, path), redacted);
  writeFileSync(join(tracked.main, 'tools', 'release', 'release-assets.json'), manifest([entry]));
  git(tracked.main, 'add', 'tools/release/release-assets.json');
  git(tracked.main, 'commit', '-q', '-m', 'a manifest in the study repo');
  s = probe(tracked.main);
  assert.equal(s.state, 'modified', s.message);
  assert.match(s.message, /^BASELINE-MODIFIED: the committed snapshot \S+ in \S+ has local changes/);
});

test('I-278 temp repos own their release manifest and snapshot ignore lines: makeTempRepo leaves out the checkout\'s', () => {
  const r = makeTempRepo({ worktree: null });
  assert.equal(existsSync(join(r.main, 'tools', 'release', 'release-assets.json')), false);
  assert.ok(existsSync(join(r.main, 'tools', 'release', 'init.mjs')), 'the rest of tools/release/ is copied');
  const src = `const b = await import(${JSON.stringify(join(r.main, 'tools/lib/baseline.mjs'))}); console.log(JSON.stringify(b.releaseRedactions(${JSON.stringify(r.main)})));`;
  const o = run(process.execPath, ['--input-type=module', '-e', src], { cwd: r.main });
  assert.equal(o.code, 0, o.out);
  assert.deepEqual(JSON.parse(o.stdout), { swaps: [] });
  // nor the checkout's ignore lines for the snapshot dirs (the study ignores its untracked snapshot): a fixture repo can
  // track one; the volatile files stay ignored
  for (const f of ['site/index.html', 'site-pretty/index.html']) assert.equal(run('git', ['check-ignore', '-q', f], { cwd: r.main }).code, 1, f);
  assert.equal(run('git', ['check-ignore', '-q', 'site/.mirror/missing-local.txt'], { cwd: r.main }).code, 0);
});

test('I-268 dirTreeId: the tree id git would commit, also outside a git checkout; treeFingerprint moves on any write', async () => {
  const b = await import('../../tools/lib/baseline.mjs');
  const d = tempDir('fw-dirtree-');
  makeFixtureHome(d);
  assert.equal(b.dirTreeId(d, 'site'), s1.trees.site);
  assert.equal(b.dirTreeId(d, 'site-pretty'), s1.trees['site-pretty']);
  const fp = b.treeFingerprint(join(d, 'site'));
  assert.match(fp, /^[0-9a-f]{64}$/);
  assert.equal(b.treeFingerprint(join(d, 'site')), fp, 'stable');
  writeFileSync(join(d, 'site', '.DS_Store'), 'x');
  assert.equal(b.treeFingerprint(join(d, 'site')), fp, 'volatile files skipped');
  const f = join(d, 'site', 'robots.txt');
  const st = statSync(f);
  writeFileSync(f, readFileSync(f));
  utimesSync(f, st.atime, st.mtime);
  assert.notEqual(b.treeFingerprint(join(d, 'site')), fp, 'same bytes and mtime, but rewritten: ctime moved');
  assert.equal(b.treeFingerprint(join(d, 'nope')), null);
  assert.throws(() => b.dirTreeId(d, 'nope'), /git add nope failed/);
});

test('I-268 dirTreeId ignores the reader\'s git config: a global, -c or template clean filter cannot change the tree id', () => {
  const d = tempDir('fw-dirtree-cfg-');
  makeFixtureHome(d);
  const cfg = tempDir('fw-dirtree-evil-');
  writeFileSync(join(cfg, 'attributes'), '* filter=evil\n');
  const evil = `[filter "evil"]\n\tclean = sed s/a/b/g\n[core]\n\tattributesFile = ${join(cfg, 'attributes')}\n\tautocrlf = true\n`;
  writeFileSync(join(cfg, 'gitconfig'), evil);
  mkdirSync(join(cfg, 'templates', 'info'), { recursive: true });
  writeFileSync(join(cfg, 'templates', 'info', 'attributes'), '* filter=evil\n');
  writeFileSync(join(cfg, 'templates', 'config'), evil);
  const env = {
    GIT_CONFIG_GLOBAL: join(cfg, 'gitconfig'), GIT_CONFIG_SYSTEM: join(cfg, 'gitconfig'), GIT_TEMPLATE_DIR: join(cfg, 'templates'),
    GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'filter.evil.clean', GIT_CONFIG_VALUE_0: 'sed s/a/b/g', GIT_CONFIG_KEY_1: 'core.attributesFile', GIT_CONFIG_VALUE_1: join(cfg, 'attributes'),
  };
  // the hostile config does change what plain git hashes (so the check below is not vacuous)
  const plain = run('git', ['-c', `core.attributesFile=${join(cfg, 'attributes')}`, '-c', 'filter.evil.clean=sed s/a/b/g', 'hash-object', join(d, 'site', 'robots.txt')], { cwd: d, env });
  assert.notEqual(plain.stdout.trim(), run('git', ['hash-object', '--no-filters', join(d, 'site', 'robots.txt')], { cwd: d }).stdout.trim());
  const src = `const b = await import(${JSON.stringify(join(repo.main, 'tools/lib/baseline.mjs'))}); console.log(b.dirTreeId(${JSON.stringify(d)}, 'site'), b.dirTreeId(${JSON.stringify(d)}, 'site-pretty'));`;
  const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: d, env });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout.trim(), `${s1.trees.site} ${s1.trees['site-pretty']}`);
});

test('unpinned (no baseline.json) and FW_MIRROR_HOME are unchecked', () => {
  const other = makeTempRepo({ worktree: null });
  makeFixtureHome(other.main);
  assert.equal(probe(other.main).state, 'unpinned');
  assert.equal(probe(other.main).ok, true);
  const s = probe(repo.main, { FW_MIRROR_HOME: other.main });
  assert.equal(s.state, 'override');
  assert.equal(s.ok, true);
});

test('modified: an edited, a deleted and an untracked new snapshot file are caught; gitignored volatile files are not', () => {
  writeFileSync(join(repo.main, 'site', '.mirror', 'missing-local.txt'), '/x\n'); // serve.mjs's 404 log: ignored
  assert.equal(probe(repo.main).state, 'ok');
  for (const [mutate, undo] of [
    [() => writeFileSync(join(repo.main, 'site-pretty', 'index.html'), 'changed'), () => git(repo.main, 'checkout', '--', 'site-pretty/index.html')],
    [() => rmSync(join(repo.main, 'site', 'robots.txt')), () => git(repo.main, 'checkout', '--', 'site/robots.txt')],
    [() => writeFileSync(join(repo.main, 'site', '_app', 'new-build.js'), 'x'), () => rmSync(join(repo.main, 'site', '_app', 'new-build.js'))],
  ]) {
    mutate();
    const s = probe(repo.main);
    assert.equal(s.state, 'modified');
    assert.equal(s.ok, false);
    assert.match(s.message, /^BASELINE-MODIFIED: the committed snapshot bfixture-\w+ in .* has local changes \(1 changed path/);
    assert.match(s.message, /git -C .* restore --source=HEAD --staged --worktree -- site site-pretty && git -C .* clean -fd -- site site-pretty/);
    const c = cli(repo.main, ['status']);
    assert.equal(c.code, 3, c.out);
    undo();
  }
  assert.equal(probe(repo.main).state, 'ok');
});

test('bad pin and a pin that does not describe the committed trees', () => {
  const orig = readFileSync(join(repo.main, 'baseline.json'), 'utf8');
  try {
    writeFileSync(join(repo.main, 'baseline.json'), '{ not json');
    assert.equal(probe(repo.main).state, 'bad-pin');
    writeFileSync(join(repo.main, 'baseline.json'), JSON.stringify({ ...s1, trees: { ...s1.trees, site: '0'.repeat(40) } }));
    const s = probe(repo.main);
    assert.equal(s.state, 'mismatch');
    assert.match(s.message, /BASELINE-MISMATCH: .*does not describe this checkout's committed site\//s);
  } finally { writeFileSync(join(repo.main, 'baseline.json'), orig); }
});

test('worktree: sparse leaves the snapshot out and reads the main checkout; own copy reads itself; both checked', () => {
  // a fresh worktree has a full copy (git worktree add checks out everything) and uses it
  assert.ok(existsSync(join(wt, 'site', 'index.html')));
  let s = probe(wt);
  assert.equal(s.state, 'ok', s.message);
  assert.deepEqual(s.homes, [wt]);
  // sparse: the copy goes away, the main checkout's snapshot is read
  const sp = cli(wt, ['sparse']);
  assert.equal(sp.code, 0, sp.out);
  assert.match(sp.stdout, /^SPARSE: /m);
  assert.equal(existsSync(join(wt, 'site')), false);
  assert.equal(existsSync(join(wt, 'site-pretty')), false);
  assert.equal(git(wt, 'status', '--porcelain'), '', 'a sparse worktree is clean');
  s = probe(wt);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.sparse, true);
  assert.deepEqual(s.homes, [repo.main]);
  assert.equal(probe(repo.main).sparse, false, 'sparse is per worktree');
  assert.equal(cli(repo.main, ['sparse']).code, 2, 'never in the main checkout');
  // the main checkout's snapshot is changed (a re-mirror under review): the worktree is told to use its own copy
  writeFileSync(join(repo.main, 'site', 'index.html'), 'new build');
  s = probe(wt);
  assert.equal(s.state, 'modified');
  assert.match(s.message, /main checkout's snapshot has local changes .*Don't touch it/s);
  assert.match(s.message, /node tools\/baseline\.mjs sparse --off/);
  assert.equal(cli(wt, ['sparse']).code, 0, 'already sparse: idempotent');
  const off = cli(wt, ['sparse', '--off']);
  assert.equal(off.code, 0, off.out);
  assert.match(off.stdout, /^OWN COPY: /m);
  s = probe(wt);
  assert.equal(s.state, 'ok', s.message);
  assert.deepEqual(s.homes, [wt]);
  // going sparse again is refused while the main checkout doesn't hold this pin unchanged
  const again = cli(wt, ['sparse']);
  assert.equal(again.code, 3, again.out);
  assert.match(again.stderr, /keeping this worktree's own copy/);
  assert.ok(existsSync(join(wt, 'site', 'index.html')));
  git(repo.main, 'checkout', '--', 'site/index.html');
  assert.equal(cli(wt, ['sparse']).code, 0);
});

test('worktree pinned to an older snapshot than main: mismatch until it rebases (or uses its own copy)', () => {
  writeFileSync(join(repo.main, 'site', 'index.html'), 'snapshot 2');
  const s2 = commitSnapshot(repo.main, 'snapshot 2');
  assert.notEqual(s2.snapshot, s1.snapshot);
  let s = probe(wt);
  assert.equal(s.state, 'mismatch');
  assert.match(s.message, new RegExp(`BASELINE-MISMATCH: this checkout pins ${s1.snapshot} .*git rebase main`, 's'));
  assert.equal(cli(wt, ['sparse', '--off']).code, 0);
  assert.equal(probe(wt).state, 'ok', 'its own copy is the snapshot it pins');
  assert.equal(cli(wt, ['sparse']).code, 3, 'not lossless: main holds another snapshot');
  git(wt, 'rebase', '-q', 'main');
  s = probe(wt);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.snapshot, s2.snapshot);
  assert.equal(cli(wt, ['sparse']).code, 0);
  assert.equal(probe(wt).snapshot, s2.snapshot);
});

test('untracked / missing: a pinned worktree whose main checkout has no committed snapshot', () => {
  const r2 = makeTempRepo({ worktree: 'nosnap' });
  // main checkout: untracked site/ (e.g. before the snapshot commit); the worktree's branch already pins one
  makeFixtureHome(r2.main);
  writeFileSync(join(r2.wt, 'baseline.json'), JSON.stringify(s1));
  // I-268 (intended change): HEAD tracks nothing under site*/, so the files are hashed and compared with the pin; the
  // fixture is byte-identical to s1, so this is the pinned snapshot (before I-268: BASELINE-UNTRACKED)
  let s = probe(r2.wt);
  assert.equal(s.state, 'ok', s.message);
  assert.equal(s.source, 'untracked, verified');
  writeFileSync(join(r2.main, 'site', 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  s = probe(r2.wt);
  assert.equal(s.state, 'modified');
  assert.match(s.message, /^BASELINE-MODIFIED: .*site \(not tracked by git\) has tree \w{10}, not the pinned/);
  // something staged under site/ (a snapshot commit being prepared) but not the snapshot's key files: still untracked
  git(r2.main, 'add', 'site/robots.txt');
  s = probe(r2.wt);
  assert.equal(s.state, 'untracked');
  assert.match(s.message, /^BASELINE-UNTRACKED: .*not a committed snapshot/);
  rmSync(join(r2.main, 'site'), { recursive: true });
  rmSync(join(r2.main, 'site-pretty'), { recursive: true });
  s = probe(r2.wt);
  assert.equal(s.state, 'missing');
  assert.match(s.message, /^BASELINE-MISSING: /);
});

test('requireBaseline: refuses with exit 3 and the message; FW_BASELINE_ALLOW_MODIFIED=1 warns and continues', () => {
  writeFileSync(join(repo.main, 'site', 'index.html'), 'under review');
  try {
    const src = `const b = await import(${JSON.stringify(join(repo.main, 'tools/lib/baseline.mjs'))}); const s = b.requireBaseline('demo'); console.log('CONTINUED ' + s.state);`;
    const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: repo.main });
    assert.equal(r.code, 3, r.out);
    assert.match(r.stderr, /^demo: BASELINE-MODIFIED: /);
    assert.doesNotMatch(r.stdout, /CONTINUED/);
    const a = run(process.execPath, ['--input-type=module', '-e', src], { cwd: repo.main, env: { FW_BASELINE_ALLOW_MODIFIED: '1' } });
    assert.equal(a.code, 0, a.out);
    assert.match(a.stderr, /^WARNING demo: FW_BASELINE_ALLOW_MODIFIED=1: using a baseline that is NOT the pinned snapshot \(state modified\)/);
    assert.match(a.stdout, /CONTINUED modified/);
  } finally { git(repo.main, 'checkout', '--', 'site/index.html'); }
});

test('baselineTag: the verdict prefix for a measurement that did not stay on the pinned snapshot', async () => {
  const { baselineTag } = await import('../../tools/lib/baseline.mjs');
  const S = (state, snapshot = 'b1-aaaaaaaa') => ({ state, snapshot });
  for (const st of ['ok', 'unpinned', 'override']) assert.equal(baselineTag(S(st)), null, `${st} is clean`);
  assert.equal(baselineTag(S('ok'), S('ok')), null, 'unchanged across the run');
  // started on a baseline that is not the pinned snapshot (only possible with FW_BASELINE_ALLOW_MODIFIED=1)
  assert.equal(baselineTag(S('modified')), 'BASELINE-MODIFIED');
  assert.equal(baselineTag(S('untracked'), S('ok')), 'BASELINE-UNTRACKED', 'the start state wins');
  assert.equal(baselineTag(S('mismatch'), S('mismatch')), 'BASELINE-MISMATCH');
  // changed during the run: a re-mirror (modified), a re-pin (another clean snapshot), the pin removed
  assert.equal(baselineTag(S('ok'), S('modified')), 'BASELINE-MODIFIED');
  assert.equal(baselineTag(S('ok'), S('missing')), 'BASELINE-MISSING');
  // a new pin mid-run: REPINNED, not bench.mjs's BASELINE-CHANGED (a patch made on another mirror; review-snapshot-fu)
  assert.equal(baselineTag(S('ok'), S('ok', 'b2-bbbbbbbb')), 'BASELINE-REPINNED');
  assert.equal(baselineTag(S('ok'), S('unpinned', null)), 'BASELINE-REPINNED');
  assert.equal(baselineTag(S('ok'), S('timeout')), 'BASELINE-TIMEOUT');
  assert.equal(baselineTag(S('ok'), null), null, 'no end status: only the start counts');
});

test('a hung git in the check: state "timeout" after FW_BASELINE_GIT_TIMEOUT_MS, flagged, never a crash or a hang', () => {
  // a fake git first on PATH: `git status` hangs (a stuck index.lock, a slow disk), everything else is the real git
  const realGit = run('sh', ['-c', 'command -v git']).stdout.trim();
  const bin = tempDir('fw-hung-git-');
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" status "*) exec sleep 30;; esac\nexec ${realGit} "$@"\n`, { mode: 0o755 });
  const t0 = Date.now();
  // 3 s, not less: under the pre-commit suite's load a real git call can take ~1 s and must not time out first
  const s = probe(repo.main, { PATH: `${bin}:${process.env.PATH}`, FW_BASELINE_GIT_TIMEOUT_MS: '3000' });
  assert.ok(Date.now() - t0 < 25000, `returned after ${Date.now() - t0} ms`);
  assert.equal(s.state, 'timeout');
  assert.equal(s.ok, false);
  assert.equal(s.snapshot, pinOf(repo.main).snapshot);
  assert.match(s.message, /^BASELINE-TIMEOUT: could not check the baseline: git status .* timed out after 3000 ms/);
  const src = `const b = await import(${JSON.stringify(join(repo.main, 'tools/lib/baseline.mjs'))});
    console.log(b.GIT_TIMEOUT_MS, b.baselineTag({ state: 'ok', snapshot: 'x' }, b.baselineMeta(b.baselineStatus())));`;
  const r = run(process.execPath, ['--input-type=module', '-e', src], { cwd: repo.main, env: { PATH: `${bin}:${process.env.PATH}`, FW_BASELINE_GIT_TIMEOUT_MS: '3000' } });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout.trim(), '10000 BASELINE-TIMEOUT', 'default 10 s; a run whose re-check hung is flagged');
});

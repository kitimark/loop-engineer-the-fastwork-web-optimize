// tools/release/init.mjs (incident I-268): `npm run init` installs the public release's large files listed in
// tools/release/release-assets.json (the snapshot site/ + site-pretty/, media, data): fetch (--from <dir>, or the
// public release URL), size + sha256, tar into staging, the snapshot's git tree ids against baseline.json, no target
// with other bytes, then move; any failed check exits non-zero with nothing installed. Temp repos, fixture snapshot,
// a local HTTP server for the URL path (FW_RELEASE_BASE_URL); never the network, never the real checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, symlinkSync, linkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { makeTempRepo, tempDir, run, runAsync, git, sha256 } from '../helpers.mjs';
import { makeFixtureHome, PNG } from '../fixtures/baseline.mjs';

const B = await import('../../tools/lib/baseline.mjs');

/** A pin for the fixture snapshot, as `baseline.mjs pin` would write it. */
function fixturePin() {
  const d = tempDir('fw-rel-pin-');
  makeFixtureHome(d);
  const trees = Object.fromEntries(B.TREES.map((t) => [t, B.dirTreeId(d, t)]));
  return { snapshot: B.snapshotId('fixture', trees), build: 'fixture', trees, contentHash: B.contentHash(trees), prettier: '3.9.9' };
}
const PIN = fixturePin();

/** The release clone: baseline.json committed, site/ and site-pretty/ gitignored and absent (or tracked: the study repo). */
function releaseRepo({ tracked = false, ignored = true } = {}) {
  const r = makeTempRepo({ worktree: null });
  writeFileSync(join(r.main, 'baseline.json'), JSON.stringify(PIN, null, 1) + '\n');
  if (tracked) {
    makeFixtureHome(r.main);
    git(r.main, 'add', 'site', 'site-pretty', 'baseline.json');
  } else {
    if (ignored) writeFileSync(join(r.main, '.gitignore'), `${readFileSync(join(r.main, '.gitignore'), 'utf8')}/site/\n/site-pretty/\n`);
    git(r.main, 'add', 'baseline.json', '.gitignore');
  }
  git(r.main, 'commit', '-q', '-m', 'release');
  return r.main;
}

const tar = (file, cwd, ...paths) => { const t = run('tar', ['-czf', file, '-C', cwd, ...paths], { env: { COPYFILE_DISABLE: '1' } }); assert.equal(t.code, 0, t.out); };
const entry = (dir, name, kind, unpackTo = '.') => { const b = readFileSync(join(dir, name)); return { name, sha256: sha256(b), bytes: b.length, unpackTo, kind }; };
const SNAP = `snapshot-${PIN.snapshot}.tar.gz`;

/** Release files in a fresh dir: the snapshot (from `snapHome`, default an exact fixture) and a media file. */
function makeAssets({ snapHome = null, mediaFirst = true, extraMedia = null } = {}) {
  const dir = tempDir('fw-rel-assets-');
  if (!snapHome) { snapHome = tempDir('fw-rel-snap-'); makeFixtureHome(snapHome); }
  tar(join(dir, SNAP), snapHome, 'site', 'site-pretty');
  const media = tempDir('fw-rel-media-');
  mkdirSync(join(media, 'out', 'media'), { recursive: true });
  writeFileSync(join(media, 'out', 'media', 'pic.png'), PNG);
  mkdirSync(join(media, 'research', 'r1'), { recursive: true });
  writeFileSync(join(media, 'research', 'r1', 'data.json'), '{"n":1}\n');
  extraMedia?.(media);
  tar(join(dir, 'media-1.tar.gz'), media, 'out', 'research');
  const assets = [entry(dir, SNAP, 'snapshot'), entry(dir, 'media-1.tar.gz', 'media')];
  if (mediaFirst) assets.reverse(); // a failing snapshot check must also keep the (good) earlier media file out
  return { dir, manifest: { version: 1, release: 'v-test', repo: 'owner/repo', assets } };
}
const writeManifest = (m) => { const f = join(tempDir('fw-rel-man-'), 'release-assets.json'); writeFileSync(f, JSON.stringify(m)); return f; };
const init = (repo, args, env = {}) => run(process.execPath, [join(repo, 'tools', 'release', 'init.mjs'), ...args], { cwd: repo, env });
const status = (repo) => run(process.execPath, [join(repo, 'tools', 'baseline.mjs'), 'status'], { cwd: repo });
/** Nothing installed and no staging left behind. */
function assertNothingInstalled(repo) {
  for (const p of ['site', 'site-pretty', 'out/media/pic.png', 'research/r1/data.json']) assert.equal(existsSync(join(repo, p)), false, `${p} must not exist`);
  const work = join(repo, 'out', 'release-init');
  if (existsSync(work)) assert.deepEqual(readdirSync(work).filter((f) => f.startsWith('stage-')), [], 'no staging dir left');
  const dl = join(work, 'downloads');
  if (existsSync(dl)) assert.deepEqual(readdirSync(dl).filter((f) => f.endsWith('.part')), [], 'no partial download left');
}

test('I-268 init --from <dir>: fetch, verify, unpack; the snapshot then reads as ok (untracked, verified); a rerun skips', () => {
  const repo = releaseRepo();
  const { dir, manifest } = makeAssets();
  // the default manifest path, as in the release
  writeFileSync(join(repo, 'tools', 'release', 'release-assets.json'), JSON.stringify(manifest, null, 1));
  assert.equal(status(repo).code, 3, 'missing before init');
  const r = init(repo, ['--from', dir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^INIT v-test: 2 of 2 asset\(s\) to install from /m);
  assert.match(r.stdout, new RegExp(`^GOT ${SNAP.replace(/\./g, '\\.')}: \\d+ bytes, sha256 ok \\(from `, 'm'));
  assert.match(r.stdout, new RegExp(`^VERIFIED ${SNAP.replace(/\./g, '\\.')}: site [0-9a-f]{10}, site-pretty [0-9a-f]{10} = baseline\\.json ${PIN.snapshot}$`, 'm'));
  assert.match(r.stdout, /^UNPACKED media-1\.tar\.gz -> \.: 2 file\(s\)$/m);
  assert.match(r.stdout, new RegExp(`^BASELINE ${PIN.snapshot} ok \\(untracked, verified\\)$`, 'm'));
  assert.match(r.stdout, /^INIT OK v-test: 2 asset\(s\) installed$/m);
  assert.deepEqual(readFileSync(join(repo, 'out', 'media', 'pic.png')), PNG);
  assert.equal(readFileSync(join(repo, 'research', 'r1', 'data.json'), 'utf8'), '{"n":1}\n');
  const st = status(repo);
  assert.equal(st.code, 0, st.out);
  assert.match(st.stdout, /^state      ok$/m);
  assert.match(st.stdout, /\(untracked, verified\)$/m);
  assert.deepEqual(readdirSync(join(repo, 'out', 'release-init', 'downloads')), [], 'downloads removed after a good install');
  assert.deepEqual(readdirSync(join(repo, 'out', 'release-init')).filter((f) => f.startsWith('stage-')), []);
  assert.doesNotMatch(git(repo, 'status', '--porcelain'), /site/, 'the snapshot stays out of git');
  const again = init(repo, ['--from', dir]);
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, new RegExp(`^SKIP ${SNAP.replace(/\./g, '\\.')}: the pinned snapshot ${PIN.snapshot} is already in place \\(untracked, verified\\)$`, 'm'));
  assert.match(again.stdout, /^SKIP media-1\.tar\.gz: already installed$/m);
  assert.match(again.stdout, /^INIT OK v-test: nothing to do$/m);
});

test('I-268 init: a tampered byte in the snapshot fails the tree check; nothing is installed, not even the earlier media file', () => {
  const repo = releaseRepo();
  const bad = tempDir('fw-rel-bad-');
  makeFixtureHome(bad);
  const f = join(bad, 'site-pretty', 'index.html');
  const b = readFileSync(f); b[10] ^= 1; writeFileSync(f, b);
  const { dir, manifest } = makeAssets({ snapHome: bad }); // its sha256 and size match the tampered file: only the tree check sees it
  const r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, new RegExp(`^INIT FAILED: SNAPSHOT-MISMATCH ${SNAP.replace(/\./g, '\\.')}: site-pretty tree [0-9a-f]{10}, baseline\\.json pins [0-9a-f]{10}: not the snapshot`, 'm'));
  assert.doesNotMatch(r.stderr, /(^|; )site tree/, 'site/ itself is the pinned one');
  assert.doesNotMatch(r.stdout, /^UNPACKED/m);
  assertNothingInstalled(repo);
});

test('I-268 init: a wrong sha256, a wrong size and a missing asset fail before anything is unpacked', () => {
  const repo = releaseRepo();
  const { dir, manifest } = makeAssets();
  const snapAt = manifest.assets.findIndex((a) => a.kind === 'snapshot');
  const variant = (patch) => { const m = structuredClone(manifest); Object.assign(m.assets[snapAt], patch); return writeManifest(m); };
  let r = init(repo, ['--from', dir, '--assets', variant({ sha256: '0'.repeat(64) })]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: snapshot-\S+: sha256 [0-9a-f]{12}… does not match release-assets\.json's 000000000000…$/m);
  assertNothingInstalled(repo);
  assert.equal(existsSync(join(repo, 'out', 'release-init', 'downloads', SNAP)), false, 'a bad download is deleted');
  r = init(repo, ['--from', dir, '--assets', variant({ bytes: manifest.assets[snapAt].bytes + 1 })]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: snapshot-\S+: \d+ bytes, release-assets\.json lists \d+$/m);
  assertNothingInstalled(repo);
  r = init(repo, ['--from', dir, '--assets', variant({ bytes: manifest.assets[snapAt].bytes - 1 })]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /more than the \d+ bytes release-assets\.json lists/);
  assertNothingInstalled(repo);
  rmSync(join(dir, SNAP));
  r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: MISSING snapshot-\S+: not in /m);
  assertNothingInstalled(repo);
});

test('I-268 init: an existing target with other bytes is a conflict (nothing installed); identical files are skipped', () => {
  const repo = releaseRepo();
  const { dir, manifest } = makeAssets();
  const m = writeManifest(manifest);
  mkdirSync(join(repo, 'out', 'media'), { recursive: true });
  writeFileSync(join(repo, 'out', 'media', 'pic.png'), 'mine');
  let r = init(repo, ['--from', dir, '--assets', m]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: CONFLICT: 1 target\(s\) in .*nothing installed.*\n  out\/media\/pic\.png exists with other content/m);
  assert.equal(readFileSync(join(repo, 'out', 'media', 'pic.png'), 'utf8'), 'mine', 'left alone');
  for (const p of ['site', 'site-pretty', 'research/r1/data.json']) assert.equal(existsSync(join(repo, p)), false, p);
  assert.ok(existsSync(join(repo, 'out', 'release-init', 'downloads', SNAP)), 'verified downloads are kept for the rerun');
  writeFileSync(join(repo, 'out', 'media', 'pic.png'), PNG);
  r = init(repo, ['--from', dir, '--assets', m]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /earlier download/);
  assert.match(r.stdout, /^UNPACKED media-1\.tar\.gz -> \.: 1 file\(s\), 1 already identical$/m);
  // a site/ that is not the pinned snapshot is never merged into: init refuses before fetching
  const repo2 = releaseRepo();
  mkdirSync(join(repo2, 'site'));
  writeFileSync(join(repo2, 'site', 'index.html'), 'old');
  r = init(repo2, ['--from', dir, '--assets', m]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: site\/ exist but are not the pinned snapshot .*move them away/m);
  assert.equal(existsSync(join(repo2, 'out', 'release-init', 'downloads')), false, 'nothing fetched');
});

test('I-268 init: unsafe release files are refused (link, a media file writing the snapshot, unpackTo outside, bad manifest)', () => {
  const repo = releaseRepo();
  let { dir, manifest } = makeAssets({ extraMedia: (d) => symlinkSync('/etc', join(d, 'out', 'media', 'etc')) });
  let r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: media-1\.tar\.gz: out\/media\/etc is a link or special file \(type l\)/m);
  assertNothingInstalled(repo);
  // refused from the tar listing, before extraction: a hard link, a fifo, anything under .git/ (any case)
  for (const [extra, re] of [
    [(d) => linkSync(join(d, 'out', 'media', 'pic.png'), join(d, 'out', 'media', 'hard.png')), /^INIT FAILED: media-1\.tar\.gz: out\/media\/(hard|pic)\.png is a link or special file \(type h\)/m],
    [(d) => run('mkfifo', [join(d, 'out', 'media', 'fifo')]), /^INIT FAILED: media-1\.tar\.gz: out\/media\/fifo is a link or special file \(type p\)/m],
    [(d) => { mkdirSync(join(d, 'out', '.git', 'hooks'), { recursive: true }); writeFileSync(join(d, 'out', '.git', 'hooks', 'post-checkout'), '#!/bin/sh\n'); }, /^INIT FAILED: media-1\.tar\.gz: out\/\.git\/? would write into a \.git directory/m],
    [(d) => { mkdirSync(join(d, 'research', '.GIT')); writeFileSync(join(d, 'research', '.GIT', 'config'), 'x'); }, /^INIT FAILED: media-1\.tar\.gz: research\/\.GIT\/? would write into a \.git directory/m],
  ]) {
    ({ dir, manifest } = makeAssets({ extraMedia: extra }));
    r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, re);
    assertNothingInstalled(repo);
    assert.equal(existsSync(join(repo, 'out', '.git')), false);
  }
  ({ dir, manifest } = makeAssets());
  // a media file under site/ (unpackTo "."): only the snapshot file may write the baseline
  const media2 = tempDir('fw-rel-m2-');
  mkdirSync(join(media2, 'site'));
  writeFileSync(join(media2, 'site', 'index.html'), 'x');
  tar(join(dir, 'evil.tar.gz'), media2, 'site');
  manifest.assets.push(entry(dir, 'evil.tar.gz', 'media'));
  r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /^INIT FAILED: evil\.tar\.gz: a media file may not write the snapshot \(site\/index\.html\)$/m);
  assertNothingInstalled(repo);
  const bad = (patch, re) => {
    const m = structuredClone(manifest);
    patch(m);
    const x = init(repo, ['--from', dir, '--assets', writeManifest(m)]);
    assert.equal(x.code, 2, x.out);
    assert.match(x.stderr, re);
  };
  bad((m) => { m.assets[0].unpackTo = '../x'; }, /"unpackTo" must be a path inside the checkout/);
  bad((m) => { m.assets[0].unpackTo = '.git/hooks'; }, /"unpackTo" must be a path inside the checkout, outside \.git\//);
  bad((m) => { m.assets[0].unpackTo = 'out/.Git'; }, /outside \.git\//);
  bad((m) => { m.assets[0].name = '../x.tar.gz'; }, /"name" must be a plain/);
  bad((m) => { m.version = 2; }, /"version" must be 1/);
  bad((m) => { m.assets[0].kind = 'other'; }, /"kind" must be/);
  bad((m) => { m.assets = []; }, /"assets" must be a non-empty list/);
  const none = init(repo, ['--from', dir]);
  assert.equal(none.code, 2, none.out);
  assert.match(none.stderr, /release-assets\.json: no such file \(the release packer writes it\)/);
  assertNothingInstalled(repo);
});

test('I-268 init without --from: the public release URL (redirect followed), 404 is MISSING; --dry-run shows the github.com URL', async () => {
  const repo = releaseRepo();
  const { dir, manifest } = makeAssets();
  const m = writeManifest(manifest);
  const seen = [];
  const srv = createServer((req, res) => {
    seen.push(req.url);
    const rel = req.url.match(/^\/owner\/repo\/releases\/download\/v-test\/([^/]+)$/);
    if (rel) { res.writeHead(302, { location: `/objects/${rel[1]}` }); return res.end(); } // github.com redirects to its object store
    const obj = req.url.match(/^\/objects\/([^/]+)$/);
    const f = obj && join(dir, decodeURIComponent(obj[1]));
    if (f && existsSync(f)) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(readFileSync(f)); }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    // dry run: no network, nothing written; the real URL form
    let r = init(repo, ['--dry-run', '--assets', m]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, new RegExp(`^WOULD FETCH ${SNAP.replace(/\./g, '\\.')} \\(\\d+ bytes, snapshot\\) https://github\\.com/owner/repo/releases/download/v-test/${SNAP.replace(/\./g, '\\.')} -> \\.$`, 'm'));
    r = init(repo, ['--dry-run', '--assets', m, '--repo', 'someone/else']);
    assert.match(r.stdout, /https:\/\/github\.com\/someone\/else\/releases\/download\/v-test\/media-1\.tar\.gz/);
    assert.equal(existsSync(join(repo, 'out', 'release-init')), false, 'a dry run writes nothing');
    const noRepo = structuredClone(manifest); delete noRepo.repo;
    r = init(repo, ['--dry-run', '--assets', writeManifest(noRepo)]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.stderr, /pass --repo <owner>\/<repo> or --from <dir>/);
    assert.deepEqual(seen, []);
    // a missing release file
    const gone = structuredClone(manifest); gone.assets[0].name = 'nope.tar.gz';
    r = await runAsync(process.execPath, [join(repo, 'tools', 'release', 'init.mjs'), '--assets', writeManifest(gone)], { cwd: repo, env: { FW_RELEASE_BASE_URL: base } });
    assert.equal(r.code, 1, r.out);
    assert.match(r.stderr, /^INIT FAILED: MISSING nope\.tar\.gz: HTTP 404 at http:\/\/127\.0\.0\.1:\d+\/owner\/repo\/releases\/download\/v-test\/nope\.tar\.gz$/m);
    assertNothingInstalled(repo);
    seen.length = 0;
    r = await runAsync(process.execPath, [join(repo, 'tools', 'release', 'init.mjs'), '--assets', m], { cwd: repo, env: { FW_RELEASE_BASE_URL: base } });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(seen.filter((u) => u.includes('/releases/')).sort(), [`/owner/repo/releases/download/v-test/${SNAP}`, '/owner/repo/releases/download/v-test/media-1.tar.gz'].sort());
    assert.equal(seen.filter((u) => u.startsWith('/objects/')).length, 2, 'redirects followed');
    assert.match(r.stdout, new RegExp(`^BASELINE ${PIN.snapshot} ok \\(untracked, verified\\)$`, 'm'));
    assert.equal(status(repo).code, 0);
  } finally { srv.close(); }
});

test('I-268 init in a checkout that tracks the snapshot (the study repo): the snapshot is skipped, the check is the tracked one', () => {
  const repo = releaseRepo({ tracked: true });
  const { dir, manifest } = makeAssets();
  const r = init(repo, ['--from', dir, '--assets', writeManifest(manifest)]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^SKIP ${SNAP.replace(/\./g, '\\.')}: the pinned snapshot ${PIN.snapshot} is already in place \\(tracked by git\\)$`, 'm'));
  assert.match(r.stdout, /^UNPACKED media-1\.tar\.gz -> \.: 2 file\(s\)$/m);
  assert.doesNotMatch(r.stdout, /^BASELINE /m);
  assert.equal(git(repo, 'status', '--porcelain', '--', 'site', 'site-pretty'), '');
  const st = status(repo);
  assert.equal(st.code, 0, st.out);
  assert.doesNotMatch(st.stdout, /untracked, verified/);
  assert.equal(existsSync(join(repo, '.git', 'fastwork-mirror', 'baseline-untracked.json')), false, 'nothing hashed');
  const ex = join(repo, '.git', 'info', 'exclude');
  assert.doesNotMatch(existsSync(ex) ? readFileSync(ex, 'utf8') : '', /^\/site/m, 'a tracked snapshot is never ignored');
});

test('I-268 init: a release whose .gitignore does not list the snapshot keeps it out of git status via .git/info/exclude', () => {
  const repo = releaseRepo({ ignored: false });
  const { dir, manifest } = makeAssets();
  const m = writeManifest(manifest);
  const ex = join(repo, '.git', 'info', 'exclude');
  const before = existsSync(ex) ? readFileSync(ex, 'utf8') : '';
  const r = init(repo, ['--from', dir, '--assets', m]);
  assert.equal(r.code, 0, r.out);
  assert.equal(git(repo, 'ls-files', '--others', '--exclude-standard', '--', 'site', 'site-pretty'), '', 'what tools/scope.mjs counts as untracked');
  assert.doesNotMatch(git(repo, 'status', '--porcelain'), /site/);
  const after = readFileSync(ex, 'utf8');
  assert.ok(after.startsWith(before), 'existing excludes kept');
  assert.deepEqual(after.split('\n').filter((l) => /^\/site/.test(l)), ['/site/', '/site-pretty/']);
  // a rerun after the snapshot was removed adds no second copy
  rmSync(join(repo, 'site'), { recursive: true });
  rmSync(join(repo, 'site-pretty'), { recursive: true });
  const again = init(repo, ['--from', dir, '--assets', m]);
  assert.equal(again.code, 0, again.out);
  assert.equal(readFileSync(ex, 'utf8'), after);
  assert.equal(status(repo).code, 0);
});

test('I-268 init --help prints the usage and writes nothing', () => {
  const repo = releaseRepo();
  const r = init(repo, ['--help']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^npm run init \(I-268\)/);
  assert.equal(existsSync(join(repo, 'out')), false);
  const u = init(repo, ['--frm', 'x']);
  assert.equal(u.code, 2);
  assert.match(u.stderr, /unknown argument --frm/);
});

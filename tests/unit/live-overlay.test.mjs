// I-209: a proposal's Try-it entry may point at a local, gitignored overlay directory (fixes/<topic>/overlay) instead of
// a committed patch.diff: `diff -u` turns a re-encoded image into "Binary files differ", so B built from patch.diff can
// never show an image change, and committing the bytes (git diff --binary) would break Hard rule 3. The overlay is
// copied into the console store (content-addressed, built once, never committed), the proposal keeps only its path,
// a content hash and the file list. tools/lib/live.mjs (resolveLiveOverlay, storeLiveOverlay, buildLiveOverlay),
// tools/lib/proposal.mjs (normalize, post, revise, setLive, publicView) and the CLI's flags. Fixture baseline, temp repo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempDir, git } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';
import { pngBytes } from '../fixtures/fake-media.mjs';

let L, P, C, fx, repo;
const PNG = pngBytes(8, 6, [10, 20, 30]);
const PNG2 = pngBytes(8, 6, [200, 20, 30]);

/** fixes/<topic>/overlay in the temp repo (untracked, like the real one: gitignored). */
function makeOverlay(topic, files) {
  for (const [p, bytes] of Object.entries(files)) {
    const f = join(repo, 'fixes', topic, 'overlay', p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, bytes);
  }
  return `fixes/${topic}/overlay`;
}
const sample = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'End background', area: 'end', topic: 'end-bg',
  problem: 'The end image is large.', idea: 'Re-encode it.', looksSame: 'Same picture.',
  visualDiff: ['None at 1x.'], risk: 'Low.',
  compare: { a: { label: 'Original' }, b: { label: 'Smaller' }, view: 'side' },
  ...over,
});

before(async () => {
  const home = tempDir('fw-liveov-home-');
  fx = makeFixtureHome(home);
  repo = tempDir('fw-liveov-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README'), 'temp\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  process.env.FW_MIRROR_HOME = home;
  process.env.FW_STATE_DIR = join(repo, '.git', 'fastwork-mirror');
  L = await import('../../tools/lib/live.mjs');
  P = await import('../../tools/lib/proposal.mjs');
  C = await import('../../tools/lib/proposal-cli.mjs');
});

test('resolveLiveOverlay: a fix overlay directory -> {overlay, blob (content hash), base, files, size}; nothing is written', () => {
  const ov = makeOverlay('img', { '_app/img/end.png': PNG, '_app/img/a.txt': 'x\n' });
  const r = L.resolveLiveOverlay({ overlay: ov, repoDir: repo });
  assert.equal(r.overlay, ov);
  assert.match(r.blob, /^[0-9a-f]{40}$/);
  assert.equal(r.base, 'site-pretty');
  assert.deepEqual(r.files, ['_app/img/a.txt', '_app/img/end.png']);
  assert.equal(r.size, PNG.length + 2);
  assert.equal(r.dir, join(repo, ov));
  assert.equal(existsSync(L.liveOverlayDir(r.blob)), false, 'resolving writes nothing');
  assert.equal(L.resolveLiveOverlay({ overlay: ov, repoDir: repo }).blob, r.blob, 'deterministic');
  // the hash follows the bytes (a re-encoded image) and the names
  writeFileSync(join(repo, ov, '_app/img/end.png'), PNG2);
  const r2 = L.resolveLiveOverlay({ overlay: ov, repoDir: repo });
  assert.notEqual(r2.blob, r.blob);
  writeFileSync(join(repo, ov, '_app/img/end.png'), PNG);
  assert.equal(L.resolveLiveOverlay({ overlay: ov, repoDir: repo }).blob, r.blob, 'back to the same bytes, the same blob');
});

test('resolveLiveOverlay refuses: a bad path, a missing or empty dir, a symlink, over the size limit (clear error)', () => {
  for (const bad of ['tools', 'fixes/img', 'fixes/img/overlay/x', '../fixes/img/overlay', '/abs/fixes/img/overlay', 'fixes/Img/overlay', 'fixes/img/patch.diff', 42]) {
    assert.throws(() => L.resolveLiveOverlay({ overlay: bad, repoDir: repo }), /must be a fix's overlay directory, fixes\/<topic>\/overlay/, String(bad));
  }
  assert.throws(() => L.resolveLiveOverlay({ overlay: 'fixes/nowhere/overlay', repoDir: repo }), /fixes\/nowhere\/overlay is not a directory/);
  mkdirSync(join(repo, 'fixes', 'empty', 'overlay'), { recursive: true });
  assert.throws(() => L.resolveLiveOverlay({ overlay: 'fixes/empty/overlay', repoDir: repo }), /has no file/);
  const ov = makeOverlay('linked', { 'a.txt': 'x' });
  symlinkSync(join(repo, 'README'), join(repo, ov, 'link.txt'));
  assert.throws(() => L.resolveLiveOverlay({ overlay: ov, repoDir: repo }), /link\.txt is a symbolic link/);
  const big = makeOverlay('big', { 'a.bin': Buffer.alloc(3000) });
  const old = process.env.FW_LIVE_OVERLAY_MAX_BYTES;
  process.env.FW_LIVE_OVERLAY_MAX_BYTES = '2000';
  try { assert.throws(() => L.resolveLiveOverlay({ overlay: big, repoDir: repo }), /fixes\/big\/overlay is 3000 bytes, over the 2000 byte limit/); }
  finally { if (old === undefined) delete process.env.FW_LIVE_OVERLAY_MAX_BYTES; else process.env.FW_LIVE_OVERLAY_MAX_BYTES = old; }
  assert.equal(L.MAX_OVERLAY_BYTES, 200 * 1024 * 1024, 'the default limit is 200 MB');
});

test('storeLiveOverlay + buildLiveOverlay: the overlay (binary bytes intact) is copied into the console store once, ready, no temp dirs', () => {
  const ov = makeOverlay('store', { '_app/img/end.png': PNG, 'x.js': 'console.log(1)\n' });
  const r = L.resolveLiveOverlay({ overlay: ov, repoDir: repo });
  assert.throws(() => L.buildLiveOverlay(r.blob), /no stored/);
  const dir = L.storeLiveOverlay(r);
  assert.equal(dir, L.liveOverlayDir(r.blob));
  assert.ok(dir.startsWith(join(repo, '.git', 'fastwork-mirror', 'console', 'live', 'overlays')), dir);
  assert.deepEqual(readFileSync(join(dir, '_app/img/end.png')), PNG);
  assert.equal(readFileSync(join(dir, 'x.js'), 'utf8'), 'console.log(1)\n');
  assert.ok(existsSync(`${dir}.ready`));
  assert.deepEqual(readdirSync(dirname(dir)).filter((f) => /\.tmp-/.test(f)), []);
  assert.equal(L.buildLiveOverlay(r.blob), dir, 'built (copied) at post time; building is a no-op');
  // the source can change afterwards: the stored copy is immutable (content-addressed)
  writeFileSync(join(repo, ov, 'x.js'), 'changed\n');
  assert.equal(L.storeLiveOverlay(r), dir);
  assert.equal(readFileSync(join(dir, 'x.js'), 'utf8'), 'console.log(1)\n');
});

test('normalize: live {overlay} (and the CLI form) -> {overlay, blob, base, files}, no patch/ref; errors name the field', () => {
  const ov = makeOverlay('norm', { '_app/img/end.png': PNG });
  const n = P.normalize(sample({ live: { overlay: ov } }), { repoDir: repo, draft: true });
  assert.deepEqual(n.errors, []);
  const { src, ...entry } = n.fields.live;
  assert.deepEqual(entry, { overlay: ov, blob: L.resolveLiveOverlay({ overlay: ov, repoDir: repo }).blob, base: 'site-pretty', files: ['_app/img/end.png'] });
  assert.equal(src, join(repo, ov), 'freshly read: the copy is made when the proposal is stored');
  assert.deepEqual(P.normalize(sample(), { repoDir: repo, draft: true, live: { overlay: ov } }).errors, []);
  assert.deepEqual(P.normalize(sample({ live: ov }), { repoDir: repo, draft: true }).errors, [], 'the string form is an overlay path');
  assert.match(P.normalize(sample({ live: { overlay: 'fixes/nope/overlay' } }), { repoDir: repo, draft: true }).errors.join('\n'), /^live\.overlay: fixes\/nope\/overlay is not a directory/m);
  assert.match(P.normalize(sample({ live: { overlay: 'tools/lib' } }), { repoDir: repo, draft: true }).errors.join('\n'), /^live\.overlay: must be a fix's overlay directory/m);
  assert.match(P.normalize(sample({ live: { overlay: ov, patch: 'fixes/demo/patch.diff' } }), { repoDir: repo, draft: true }).errors.join('\n'), /^live: either overlay or patch, not both/m);
});

test('post a draft with a live overlay: copied into the store, the proposal keeps no image bytes; revise keeps, replaces or drops it', async () => {
  const ov = makeOverlay('post', { '_app/img/end.png': PNG });
  const { proposal: p } = await P.postProposal({ by: 'fix-x', raw: sample({ title: 'Overlay post' }), draft: true, live: { overlay: ov }, repoDir: repo });
  assert.deepEqual(Object.keys(p.live).sort(), ['base', 'blob', 'files', 'overlay']);
  assert.equal(p.live.overlay, ov);
  assert.deepEqual(readFileSync(join(L.liveOverlayDir(p.live.blob), '_app/img/end.png')), PNG, 'the bytes are in the store');
  assert.equal(JSON.stringify(P.get(p.id)).includes(PNG.toString('latin1').slice(0, 8)), false, 'no image bytes in the proposal');
  // for the page


  assert.deepEqual(P.publicView({ ...P.get(p.id), state: 'proposed' }).live, { patch: ov, version: p.live.blob.slice(0, 12), files: 1 });
  assert.match(P.showText(P.get(p.id)), /live B: fixes\/post\/overlay @ [0-9a-f]{12} \(1 file\(s\) on site-pretty/);
  // revise: kept, then replaced by a changed overlay, then replaced by a patch-less drop
  let r = await P.reviseProposal(p.id, { by: 'fix-x', note: 'text only', repoDir: repo });
  assert.equal(r.proposal.live.blob, p.live.blob, 'kept (re-validated against the store, not the working dir)');
  writeFileSync(join(repo, ov, '_app/img/end.png'), PNG2);
  r = await P.reviseProposal(p.id, { by: 'fix-x', note: 'new image', live: { overlay: ov }, repoDir: repo });
  assert.notEqual(r.proposal.live.blob, p.live.blob, 'replaced');
  assert.deepEqual(readFileSync(join(L.liveOverlayDir(r.proposal.live.blob), '_app/img/end.png')), PNG2);
  assert.deepEqual(readFileSync(join(L.liveOverlayDir(p.live.blob), '_app/img/end.png')), PNG, 'the old version stays');
  r = await P.reviseProposal(p.id, { by: 'fix-x', note: 'no B', raw: sample({ title: 'Overlay post' }), repoDir: repo });
  assert.equal(r.proposal.live, undefined);
});

test('setLive with overlay: on an option; --clear; patch and overlay together refused; A may be an overlay too', async () => {
  const opt = (name) => ({ name, label: `L ${name}`, idea: `I ${name}.`, looksSame: 'Same.', visualDiff: ['None.'], risk: 'Low.', compare: { b: { label: `B ${name}` } } });
  const raw = sample({ title: 'Overlay options', compare: { a: { label: 'Original' } }, options: [opt('one'), opt('two')], visualDiff: undefined, looksSame: undefined, risk: undefined });
  const ov = makeOverlay('opt', { '_app/img/end.png': PNG });
  const ov2 = makeOverlay('opt-a', { '_app/img/end.png': PNG2 });
  const { proposal: p } = await P.postProposal({ by: 'fix-x', raw, draft: true, repoDir: repo, option: 'one', live: { overlay: ov } });
  assert.equal(P.findOption(p, 'one').live.overlay, ov);
  await assert.rejects(P.setLive(p.id, { by: 'fix-x', overlay: ov, repoDir: repo }), /has options: say which one B is for/);
  await assert.rejects(P.setLive(p.id, { by: 'fix-x', option: 'two', overlay: ov, patch: 'fixes/demo/patch.diff', repoDir: repo }), /--overlay or --patch, not both/);
  await assert.rejects(P.setLive(p.id, { by: 'fix-x', option: 'two', overlay: 'fixes/nope/overlay', repoDir: repo }), /--overlay: fixes\/nope\/overlay is not a directory/);
  const q = await P.setLive(p.id, { by: 'fix-x', option: 'two', overlay: ov, a: { overlay: ov2 }, repoDir: repo });
  const two = P.findOption(q, 'two').live;
  assert.equal(two.overlay, ov);
  assert.equal(two.a.overlay, ov2);
  assert.notEqual(two.a.blob, two.blob);
  assert.deepEqual(readFileSync(join(L.liveOverlayDir(two.a.blob), '_app/img/end.png')), PNG2);
  assert.match(q.history.at(-1).note, /^live B: fixes\/opt\/overlay @ [0-9a-f]{12}; A: fixes\/opt-a\/overlay @ [0-9a-f]{12}$/);
  assert.equal(P.liveAWarning(two), null, 'no patch text to compare, so no "not covered" warning');
  assert.deepEqual(P.publicView({ ...q, state: 'proposed' }).options[1].live, { patch: ov, version: two.blob.slice(0, 12), files: 1, a: { patch: ov2, version: two.a.blob.slice(0, 12), files: 1 } });
  const c = await P.setLive(p.id, { by: 'fix-x', option: 'two', clear: true, repoDir: repo });
  assert.equal(P.findOption(c, 'two').live, undefined);
});

test('CLI flags: --live-overlay on post/revise, --overlay on `proposal live`; mixing it with --live-patch is refused', () => {
  const a = (...x) => C.parseArgs(x);
  assert.deepEqual(C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay')), { overlay: 'fixes/img/overlay' });
  assert.deepEqual(C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay', '--live-a-patch', 'fixes/base/patch.diff', '--live-a-ref', 'main')),
    { overlay: 'fixes/img/overlay', a: { patch: 'fixes/base/patch.diff', ref: 'main' } });
  assert.deepEqual(C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay', '--live-a-overlay', 'fixes/base/overlay')), { overlay: 'fixes/img/overlay', a: { overlay: 'fixes/base/overlay' } });
  assert.deepEqual(C.liveFromArgs(a('--live-patch', 'fixes/x/patch.diff')), { patch: 'fixes/x/patch.diff', ref: 'HEAD' }, 'the patch form is unchanged');
  assert.throws(() => C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay', '--live-patch', 'fixes/x/patch.diff')), /--live-overlay or --live-patch, not both/);
  assert.throws(() => C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay', '--live-ref', 'main')), /--live-ref goes with --live-patch/);
  assert.throws(() => C.liveFromArgs(a('--live-overlay', 'fixes/img/overlay', '--live-none', 'why')), /--live-none "<why>" or --live-overlay/);
  assert.throws(() => C.liveFromArgs(a('--live-a-overlay', 'fixes/base/overlay')), /--live-a-overlay \(A\) goes with/);
  assert.match(P.LIVE_REQUIRED, /--live-overlay/);
});

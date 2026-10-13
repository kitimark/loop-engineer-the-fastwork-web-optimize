// I-270: the release packer (tools/release/pack.mjs) and the build command (tools/release/build.mjs), end to end on a
// fixture source repo, console store and out/ tree with made-up values. rewrite.mjs (I-269) is a
// stub here (tests/fixtures/release/); rules.mjs and check.mjs are I-269's. Nothing here pushes, uploads or touches
// the real store, out/ or known.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir, node, git, sha256, makeTempRepo } from '../helpers.mjs';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import { stageTools, writeKnown, makeState, makeSourceRepo, makeOutRoot, fakeBins, tarHeaders, V, ALL_VALUES, FAKE_KEY, SECRET_FILE, SECRET_COPY, png, pngChunk, gif, gifComment, gifApp, xmp, avif } from '../fixtures/release/stage.mjs';
import { walkFiles, tarList } from '../../tools/release/release-util.mjs';

const root = tempDir('fw-release-e2e-');
const staged = stageTools(root);
const R = await import(staged.url('rules.mjs'));
const PK = await import(staged.url('pack.mjs'));
const knownPath = writeKnown(root);
const rules = R.buildRules(R.loadKnown(knownPath));
const bins0 = fakeBins(join(root, 'bin'));
process.env.FW_FFMPEG = bins0.ffmpeg; // packRelease runs in this process
const tarBytes = (archive) => (archive.endsWith('.gz') ? gunzipSync(readFileSync(archive)) : readFileSync(archive));
const tarCat = (archive, member) => spawnSync('tar', ['-xOf', archive, member], { encoding: 'utf8' }).stdout;

function fixture() {
  const d = tempDir('fw-release-fx-');
  const source = makeSourceRepo(join(d, 'src'), git);
  makeOutRoot(join(source, 'out'));
  const state = makeState(join(d, 'state'));
  const media = join(d, 'media', 'console', 'proposals', 'PR-001');
  mkdirSync(media, { recursive: true });
  writeFileSync(join(media, 'r1-a-1.webp'), 'RIFF\x08\x00\x00\x00WEBPVP8 ');
  writeFileSync(join(media, 'r1-video-a.mp4'), 'mp4');
  return { d, source, state, media: join(d, 'media'), outRoot: join(source, 'out') };
}

test('I-270 pack: four release files, manifest per the schema, sha256 and size of each', async () => {
  const f = fixture();
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules, repo: 'someone/study' });
  const m = JSON.parse(readFileSync(join(assets, 'release-assets.json'), 'utf8'));
  assert.deepEqual(Object.keys(m), ['version', 'release', 'repo', 'assets']);
  assert.equal(m.version, 1);
  const id = JSON.parse(readFileSync(join(f.source, 'baseline.json'), 'utf8')).snapshot;
  assert.match(id, /^b1000-[0-9a-f]{8}$/);
  assert.equal(m.release, `release-${id}`);
  assert.deepEqual(m.assets.map((a) => [a.name, a.kind, a.unpackTo]), [[`snapshot-${id}.tar.gz`, 'snapshot', '.'], ['proposal-media.tar', 'media', '.'], ['out-media.tar', 'media', '.'], ['out-data.tar.gz', 'data', '.']]);
  for (const a of m.assets) {
    const b = readFileSync(join(assets, a.name));
    assert.equal(a.bytes, b.length, a.name);
    assert.equal(a.sha256, sha256(b), a.name);
    assert.deepEqual(Object.keys(a), ['name', 'sha256', 'bytes', 'unpackTo', 'kind', ...(a.kind === 'snapshot' ? ['redacted'] : [])]);
  }
  assert.deepEqual(r.manifest, m);
  const snap = tarList(join(assets, `snapshot-${id}.tar.gz`));
  assert.ok(snap.some((x) => x.startsWith('site/')) && snap.some((x) => x.startsWith('site-pretty/')));
  assert.ok(snap.every((x) => /^site(-pretty)?(\/|$)/.test(x)), 'only the two snapshot trees');
  assert.deepEqual(tarList(join(assets, 'proposal-media.tar')), ['console/proposals/PR-001/r1-a-1.webp', 'console/proposals/PR-001/r1-video-a.mp4']);
  assert.deepEqual(tarList(join(assets, 'out-media.tar')), ['out/article-gifs/a.gif', 'out/article-video/v.mp4', 'out/people-blink/art/p.mov']);
  const ff = readFileSync(join(root, 'bin', 'ffmpeg.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((c) => c.includes(join(f.outRoot, 'article-video', 'v.mp4')) || c.includes(join(f.outRoot, 'people-blink', 'art', 'p.mov')));
  assert.equal(ff.length, 2, 'both out/ videos lose their container metadata');
  for (const c of ff) assert.ok(c.join(' ').includes('-map_metadata -1') && c.join(' ').includes('-c copy'));
  assert.deepEqual(tarList(join(assets, 'out-data.tar.gz')), ['out/ab/hero/results.json', 'out/ab/hero/shot.png', 'out/iphone-screen/r.json', 'out/snapshots/best/x.js', 'out/tryit/t.diff', 'out/lead/notes.txt', 'out/lead/pic.avif']);
  const login = os.userInfo().username;
  for (const a of ['proposal-media.tar', 'out-media.tar', 'out-data.tar.gz']) {
    const heads = tarHeaders(tarBytes(join(assets, a)));
    assert.ok(heads.length >= 2, a);
    for (const h of heads) assert.deepEqual([parseInt(h.uid, 8), parseInt(h.gid, 8), h.uname, h.gname], [0, 0, '', ''], `${a} ${h.name}: no owner in the header`);
    assert.ok(!tarBytes(join(assets, a)).includes(Buffer.from(login)), `${a} holds the login name`);
    const types = spawnSync('tar', ['-tvf', join(assets, a)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map((l) => l[0]);
    assert.ok(types.length && types.every((t) => t === '-'), `${a}: regular files only (npm run init refuses links and special files)`);
  }
});

test('I-270 pack: a secret-shaped value in the snapshot is redacted and listed with both blob ids; a secret holding a known value is left for the check', async () => {
  const f = fixture();
  // a second vendored file whose "secret" holds a known literal: redacting it would hide the literal, so it ships as is;
  // a third whose redaction would break its JS (an unquoted value): it ships as is too, and the build is not ready
  writeFileSync(join(f.source, 'site', 'own.js'), `x = { token: "${V.home}${'Ab1'.repeat(8)}" };\n`);
  writeFileSync(join(f.source, 'site', 'raw.js'), `var apiKey = Qr5${'Tu8'.repeat(9)};\n`);
  git(f.source, 'add', '-A'); git(f.source, 'commit', '-q', '-m', 'own');
  const pin = JSON.parse(readFileSync(join(f.source, 'baseline.json'), 'utf8'));
  const trees = { site: git(f.source, 'rev-parse', 'HEAD:site'), 'site-pretty': git(f.source, 'rev-parse', 'HEAD:site-pretty') };
  writeFileSync(join(f.source, 'baseline.json'), JSON.stringify({ ...pin, trees }));
  git(f.source, 'commit', '-q', '-am', 'repin');
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  const snapAsset = r.manifest.assets.find((a) => a.kind === 'snapshot');
  const red = tarCat(join(assets, snapAsset.name), SECRET_FILE);
  assert.ok(!red.includes(FAKE_KEY), 'the key is gone');
  assert.match(red, /apiKey: "\[secret omitted: secret-kv\]",\n  region: 'x',/, 'only the value, the rest byte for byte');
  const copy = tarCat(join(assets, snapAsset.name), SECRET_COPY);
  assert.equal(copy, 'var cfg=JSON.parse("{\\"apiKey\\":\\"[secret omitted: secret-kv]\\",\\"region\\":\\"x\\"}");\n', 'the same value in the site/ copy, where no shape matches');
  const blob = (x) => spawnSync('git', ['hash-object', '--stdin'], { input: x, encoding: 'utf8' }).stdout.trim();
  assert.deepEqual(snapAsset.redacted, [
    { path: SECRET_COPY, rule: 'secret-kv', originalBlob: git(f.source, 'rev-parse', `HEAD:${SECRET_COPY}`), redactedBlob: blob(copy) },
    { path: SECRET_FILE, rule: 'secret-kv', originalBlob: git(f.source, 'rev-parse', `HEAD:${SECRET_FILE}`), redactedBlob: blob(red) },
  ]);
  assert.deepEqual(r.redacted.map((x) => [x.path, x.count, x.syntax]), [[SECRET_COPY, 1, 'js'], [SECRET_FILE, 1, 'js']], 'both still parse (node --check)');
  assert.deepEqual(r.redactKept, [{ path: 'site/own.js', rule: 'secret-kv', why: 'a known value inside it' }, { path: 'site/raw.js', rule: 'secret-kv', why: 'the redacted file is no valid js' }]);
  assert.ok(tarCat(join(assets, snapAsset.name), 'site/own.js').includes(V.home), 'not redacted: the build check reports it');
  assert.equal(tarCat(join(assets, snapAsset.name), 'site/robots.txt'), readFileSync(join(f.source, 'site', 'robots.txt'), 'utf8'), 'other files as they are');
  // no secret in the snapshot: plain git archive, no "redacted" key
  const g = fixture();
  rmSync(join(g.source, SECRET_FILE));
  git(g.source, 'commit', '-q', '-am', 'no key');
  const gp = JSON.parse(readFileSync(join(g.source, 'baseline.json'), 'utf8'));
  writeFileSync(join(g.source, 'baseline.json'), JSON.stringify({ ...gp, trees: { site: git(g.source, 'rev-parse', 'HEAD:site'), 'site-pretty': git(g.source, 'rev-parse', 'HEAD:site-pretty') } }));
  git(g.source, 'commit', '-q', '-am', 'repin');
  const r2 = await PK.packRelease({ source: g.source, mediaDir: g.media, outRoot: g.outRoot, assetsDir: join(g.d, 'assets'), rules });
  assert.equal('redacted' in r2.manifest.assets[0], false);
  assert.deepEqual(r2.redacted, []);
});

test('I-270 pack: out-data text files are scrubbed, binaries kept; never-packed out/ entries are listed with reasons', async () => {
  const f = fixture();
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  const data = join(assets, 'out-data.tar.gz');
  assert.deepEqual(JSON.parse(tarCat(data, 'out/ab/hero/results.json')), { host: '192.168.0.12', cwd: '/Users/<user>/src' });
  assert.match(tarCat(data, 'out/lead/notes.txt'), /asked <name>/);
  assert.match(tarCat(data, 'out/tryit/t.diff'), /# <email>/);
  assert.deepEqual(JSON.parse(tarCat(data, 'out/iphone-screen/r.json')), { device: '<device-name>' });
  assert.ok(r.hits.length >= 4 && r.hits.every((h) => h.count > 0));
  const ex = Object.fromEntries(r.excluded.map((e) => [e.path, e.reason]));
  assert.equal(ex['out/certs/'], 'TLS keys and certificates');
  assert.equal(ex['out/chrome-verify-profile/'], 'Chrome profiles (history, cookies)');
  assert.equal(ex['out/archive/'], 'raw output of old runs, not reviewed');
  assert.equal(ex['out/engines/'], 'browser engine builds (third-party binaries)');
  assert.equal(ex['out/pages-repo/'], 'site page builds (published on their own)');
  assert.equal(ex['out/cf-review/'], 'Cloudflare review data');
  assert.equal(ex['out/top.log'], 'loose logs');
  assert.match(ex['out/other/'], /not in the release include set/);
  const inside = r.excluded.filter((e) => e.path.startsWith('inside included')).map((e) => e.reason).sort();
  assert.deepEqual(inside, ['Chrome profile folders', 'Finder metadata', 'SQLite databases', 'browser cookie or login stores', 'key or certificate file', 'log files',
    'not cited by path in the committed write-ups (out/lead, out/tryit ship only cited files)', 'screen recordings and capture logs (only the JSON results ship)']);
  for (const a of ['out-media.tar', 'out-data.tar.gz']) for (const x of tarList(join(assets, a))) assert.ok(!/DS_Store|\.pem$|Cookies|Login Data|\.log$|\.db$|t163-draft|console-cited|link\.txt|tryit\/x\.txt|\.mov$.*iphone|iphone-screen\/r\.(mov|log)/.test(x), x);
  // out/lead and out/tryit: only what research/notes/README.md cites (its run.log is cited, but logs never ship; its
  // cited link and its out/lead/../tryit/x.txt never ship either)
  assert.equal(r.cited, 3);
  assert.deepEqual(tarList(data).filter((x) => /^out\/(lead|tryit)\//.test(x)), ['out/tryit/t.diff', 'out/lead/notes.txt', 'out/lead/pic.avif']);
  assert.deepEqual(r.textFiles, ['out/ab/hero/results.json', 'out/iphone-screen/r.json', 'out/snapshots/best/x.js', 'out/tryit/t.diff', 'out/lead/notes.txt'], 'every shipped text file, for the needs-human-read list');
  assert.deepEqual(PK.citedOutPaths({ source: f.source }), new Set(['out/lead/notes.txt', 'out/lead/pic.avif', 'out/tryit/t.diff', 'out/lead/run.log', 'out/lead/link.txt', 'out/lead/gone.png']), 'no .. path');
  // any out/ folder: what out/ does not have is CITED-MISSING (a link counts as there; placeholders and checkout/ are no path)
  const all = PK.citedOutAll({ source: f.source });
  assert.deepEqual([...all].sort(), ['out/ab/old-run/results.json', 'out/article/old/shot.png', 'out/article/old/x.png', 'out/lead/gone.png', 'out/lead/link.txt', 'out/lead/notes.txt', 'out/lead/pic.avif', 'out/lead/run.log', 'out/people-blink/gone.mov', 'out/tryit/t.diff']);
  assert.deepEqual(PK.citedMissing(f.outRoot, all), ['out/ab/old-run/results.json', 'out/article/old/shot.png', 'out/article/old/x.png', 'out/lead/gone.png', 'out/people-blink/gone.mov'], '../../out/ and ./out/ citations count');
  assert.deepEqual(PK.citedMissing(f.outRoot, all).filter(PK.inShippedDir), ['out/ab/old-run/results.json', 'out/lead/gone.png', 'out/people-blink/gone.mov'], 'out/article is no folder the release ships from');
});

test('I-270 pack: AppleDouble ._ files (a restore may bring them) are skipped as Finder metadata, never refused pictures', async () => {
  const f = fixture();
  const fork = Buffer.concat([Buffer.from([0, 5, 0x16, 7, 0, 2, 0, 0]), Buffer.from('Mac OS X        '), Buffer.alloc(16)]); // AppleDouble header
  writeFileSync(join(f.outRoot, 'article-gifs', '._a.gif'), fork);
  writeFileSync(join(f.outRoot, 'ab', 'hero', '._shot.png'), fork);
  writeFileSync(join(f.outRoot, 'ab', 'hero', '._results.json'), fork);
  assert.equal(PK.outFiles(f.outRoot, { cited: PK.citedOutPaths({ source: f.source }) }).skipped.get('Finder metadata'), 4, '.DS_Store and the three ._ files');
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  assert.deepEqual(r.images.refused, [], 'no picture refused: the build stays ready');
  for (const a of ['out-media.tar', 'out-data.tar.gz']) for (const x of tarList(join(assets, a))) assert.ok(!/(^|\/)\._/.test(x), x);
});

test('I-270 pack: a linked out/lead or out/tryit folder is refused (it could point anywhere)', async () => {
  for (const dir of ['lead', 'tryit']) {
    const f = fixture();
    const real = join(f.d, `elsewhere-${dir}`);
    mkdirSync(real); writeFileSync(join(real, 'notes.txt'), 'from elsewhere\n');
    rmSync(join(f.outRoot, dir), { recursive: true });
    symlinkSync(real, join(f.outRoot, dir));
    assert.throws(() => PK.outFiles(f.outRoot, { cited: new Set([`out/${dir}/notes.txt`]) }), new RegExp(`out/${dir} is a symbolic link`));
    await assert.rejects(PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: join(f.d, 'assets'), rules }), /is a symbolic link/);
  }
});

test('I-270 pack: shipped pictures lose their metadata (PNG, GIF, losslessly); an AVIF with XMP is refused and left out', async () => {
  const f = fixture();
  const text = pngChunk('tEXt', 'Author\0someone'), time = pngChunk('tIME', '\x07\xea\x0a\x0d\x00\x00\x00'), x = pngChunk('iTXt', `XML:com.adobe.xmp\0\0\0\0\0${xmp()}`);
  writeFileSync(join(f.outRoot, 'article-gifs', 'meta.png'), png(800, 600, '', [text, time, x]));
  writeFileSync(join(f.outRoot, 'article-gifs', 'meta.gif'), gif([gifApp('NETSCAPE2.0', '\x01\x00\x00'), gifComment('made by someone'), gifApp('XMP DataXMP', xmp())]));
  writeFileSync(join(f.outRoot, 'lead', 'snap.avif'), avif(true));
  writeFileSync(join(f.outRoot, 'ab', 'hero', 'notes.png'), 'text with a picture name\n');
  writeFileSync(join(f.source, 'research', 'notes', 'more.md'), 'and out/lead/snap.avif\n');
  git(f.source, 'add', 'research'); git(f.source, 'commit', '-q', '-m', 'cite');
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  const media = join(assets, 'out-media.tar');
  const pngOut = spawnSync('tar', ['-xOf', media, 'out/article-gifs/meta.png']).stdout;
  assert.deepEqual(pngOut, png(800, 600), 'the text, time and XMP chunks are gone; IHDR, IDAT, IEND byte for byte');
  const gifOut = spawnSync('tar', ['-xOf', media, 'out/article-gifs/meta.gif']).stdout;
  assert.deepEqual(gifOut, gif([gifApp('NETSCAPE2.0', '\x01\x00\x00')]), 'the comment and the XMP block are gone, the looping block stays');
  assert.deepEqual(r.images.stripped.filter((s) => /meta\./.test(s.path)).map((s) => [s.path, s.kinds]).sort(), [['out/article-gifs/meta.gif', ['comment', 'xmp']], ['out/article-gifs/meta.png', ['text', 'time', 'xmp']]]);
  assert.deepEqual(r.images.refused, [{ path: 'out/ab/hero/notes.png', kinds: ['not-an-image'] }, { path: 'out/lead/snap.avif', kinds: ['xmp'] }]);
  assert.ok(!tarList(join(assets, 'out-data.tar.gz')).includes('out/ab/hero/notes.png'), 'text named .png is no picture: refused, not shipped as text');
  assert.ok(!tarList(join(assets, 'out-data.tar.gz')).includes('out/lead/snap.avif'), 'a refused picture is not packed');
  assert.ok(tarList(join(assets, 'out-data.tar.gz')).includes('out/lead/pic.avif'), 'an AVIF without metadata ships');
  assert.match(r.excluded.find((e) => e.path === 'out/lead/snap.avif').reason, /^picture refused: xmp/);
  assert.equal(r.counts['images refused'], 2);
});

test('I-270 pack: a data: URI picture in a shipped text file is checked like a file: a PNG stripped in place, an AVIF with XMP refused', async () => {
  const f = fixture();
  const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
  const meta = png(800, 600, '', [pngChunk('tEXt', 'Author\0someone')]);
  writeFileSync(join(f.outRoot, 'ab', 'hero', 'report.html'), `<h1>run</h1><img src="${dataUri('image/png', meta)}">\n`);
  writeFileSync(join(f.outRoot, 'ab', 'hero', 'bad.html'), `<img src="${dataUri('image/png', png(10, 10))}"><img src="${dataUri('image/avif', avif(true))}"><img src="data:image/png;base64,abc">\n`);
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  const data = join(assets, 'out-data.tar.gz');
  const html = tarCat(data, 'out/ab/hero/report.html');
  assert.equal(html, `<h1>run</h1><img src="${dataUri('image/png', png(800, 600))}">\n`, 'the URI rewritten with the stripped PNG, the rest of the page as it was');
  assert.ok(r.images.stripped.some((s) => s.path === 'out/ab/hero/report.html#data-1'));
  assert.deepEqual(r.images.refused.filter((x) => x.path.includes('#data-')), [{ path: 'out/ab/hero/bad.html#data-2', kinds: ['xmp'] }, { path: 'out/ab/hero/bad.html#data-3', kinds: ['undecodable-data-uri'] }]);
  assert.ok(!tarList(data).includes('out/ab/hero/bad.html'), 'a page with a refused picture is left out');
  assert.match(r.excluded.find((e) => e.path === 'out/ab/hero/bad.html').reason, /a data: URI in it was refused/);
  assert.match(r.excluded.find((e) => e.path === 'out/ab/hero/bad.html#data-2').reason, /^picture refused: xmp/);
  assert.ok(r.textFiles.includes('out/ab/hero/report.html'), 'still on the human-read list');
});

test('I-270 pack: an out-media text file is checked too: its PNG stripped, its AVIF with XMP refused, the page left out', async () => {
  const f = fixture();
  const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
  writeFileSync(join(f.outRoot, 'article-gifs', 'page.html'), `<img src="${dataUri('image/png', png(20, 20, '', [pngChunk('tEXt', 'Author\0someone')]))}"><img src="${dataUri('image/avif', avif(true))}">\n`);
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules });
  assert.ok(r.images.stripped.some((s) => s.path === 'out/article-gifs/page.html#data-1'));
  assert.deepEqual(r.images.refused.filter((x) => x.path.includes('#data-')), [{ path: 'out/article-gifs/page.html#data-2', kinds: ['xmp'] }]);
  assert.ok(!tarList(join(assets, 'out-media.tar')).includes('out/article-gifs/page.html'), 'left out of out-media.tar');
  assert.ok(tarList(join(assets, 'out-media.tar')).includes('out/article-gifs/a.gif'), 'the rest of out-media ships');
});

test('I-270 pack: refuses a snapshot whose trees are not the pinned ones, and an asset at the size limit', async () => {
  const f = fixture();
  await assert.rejects(PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: join(f.d, 'a1'), rules, maxBytes: 64 }), /at or over the 64-byte Release file limit: split it/);
  writeFileSync(join(f.source, 'site', 'extra.txt'), 'changed');
  git(f.source, 'add', '-A'); git(f.source, 'commit', '-q', '-m', 'drift');
  await assert.rejects(PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: join(f.d, 'a2'), rules }), /BASELINE-MISMATCH: HEAD:site/);
  assert.ok(!existsSync(join(f.d, 'a2', 'release-assets.json')), 'no manifest after a refusal');
});

test('I-270 pack -> npm run init --from <assets> (I-268): a release clone installs every Release file; the snapshot reads ok', async () => {
  const f = fixture();
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules, repo: 'someone/study' });
  // the release clone: this repo's tools, the source's pin, no site/ or site-pretty/ in git or on disk
  const clone = makeTempRepo({ worktree: null }).main;
  writeFileSync(join(clone, 'baseline.json'), readFileSync(join(f.source, 'baseline.json')));
  writeFileSync(join(clone, 'tools', 'release', 'release-assets.json'), JSON.stringify(r.manifest, null, 2) + '\n');
  mkdirSync(join(clone, 'console'));
  writeFileSync(join(clone, 'console', '.gitignore'), 'proposals/*/\n'); // as build.mjs's last commit writes it
  git(clone, 'add', 'baseline.json', 'tools/release/release-assets.json', 'console/.gitignore');
  git(clone, 'commit', '-q', '-m', 'release');
  const init = node(join(clone, 'tools', 'release', 'init.mjs'), ['--from', assets], { cwd: clone, timeout: 90000 });
  assert.equal(init.code, 0, init.out);
  assert.match(init.stdout, /^INIT OK release-\S+: 4 asset\(s\) installed$/m);
  assert.match(init.stdout, /^VERIFIED snapshot-\S+: .* \(2 redacted file\(s\) counted as their original blobs\)$/m, 'the redacted key files verified against the pin');
  assert.match(init.stdout, /^BASELINE \S+ ok \(untracked, verified\)$/m);
  assert.ok(!readFileSync(join(clone, SECRET_FILE), 'utf8').includes(FAKE_KEY));
  assert.deepEqual(readFileSync(join(clone, 'console/proposals/PR-001/r1-a-1.webp')), readFileSync(join(f.media, 'console/proposals/PR-001/r1-a-1.webp')));
  assert.deepEqual(readFileSync(join(clone, 'out/article-gifs/a.gif')), readFileSync(join(f.outRoot, 'article-gifs/a.gif')));
  assert.deepEqual(JSON.parse(readFileSync(join(clone, 'out/ab/hero/results.json'), 'utf8')), { host: '192.168.0.12', cwd: '/Users/<user>/src' });
  assert.ok(existsSync(join(clone, 'site')) && existsSync(join(clone, 'site-pretty')));
  assert.doesNotMatch(git(clone, 'status', '--porcelain'), /site|console|out\//, 'installed files stay out of git');
});

test('I-270 init: a snapshot file changed beyond the listed redaction fails (SNAPSHOT-MISMATCH), nothing installed', async () => {
  const f = fixture();
  const assets = join(f.d, 'assets');
  const r = await PK.packRelease({ source: f.source, mediaDir: f.media, outRoot: f.outRoot, assetsDir: assets, rules, repo: 'someone/study' });
  const snapAsset = r.manifest.assets.find((a) => a.kind === 'snapshot');
  // repack the snapshot with one byte changed, the manifest's sha256 and size updated (a tamperer would do both)
  const blobOf = (buf) => spawnSync('git', ['hash-object', '--stdin'], { input: buf, encoding: 'utf8' }).stdout.trim();
  // listSwap: also list the tampered file as a redaction (a manifest edited after packing, then committed);
  // editAfter: change the working manifest after the commit (uncommitted)
  const tamper = (rel, edit, { listSwap = false, commitEdit = (m) => m, editAfter = null } = {}) => {
    const x = tempDir('fw-release-tamper-');
    spawnSync('tar', ['-xzf', join(assets, snapAsset.name), '-C', x]);
    const before = readFileSync(join(x, rel));
    if (edit) writeFileSync(join(x, rel), edit(before.toString('utf8')));
    const swaps = listSwap ? [...snapAsset.redacted, { path: rel, rule: 'secret-kv', originalBlob: blobOf(before), redactedBlob: blobOf(readFileSync(join(x, rel))) }] : snapAsset.redacted;
    const out = join(tempDir('fw-release-tampered-'), snapAsset.name);
    assert.equal(spawnSync('tar', ['-czf', out, '-C', x, 'site', 'site-pretty']).status, 0);
    const b = readFileSync(out);
    const clone = makeTempRepo({ worktree: null }).main;
    writeFileSync(join(clone, 'baseline.json'), readFileSync(join(f.source, 'baseline.json')));
    const m = commitEdit({ ...r.manifest, assets: [{ ...snapAsset, sha256: sha256(b), bytes: b.length, redacted: swaps }] });
    writeFileSync(join(clone, 'tools', 'release', 'release-assets.json'), JSON.stringify(m, null, 2) + '\n');
    git(clone, 'add', 'baseline.json', 'tools/release/release-assets.json');
    git(clone, 'commit', '-q', '-m', 'release');
    if (editAfter) writeFileSync(join(clone, 'tools', 'release', 'release-assets.json'), JSON.stringify(editAfter(m), null, 2) + '\n');
    const init = node(join(clone, 'tools', 'release', 'init.mjs'), ['--from', dirname(out)], { cwd: clone, timeout: 90000 });
    return { init, clone };
  };
  const other = tamper('site/robots.txt', (t) => t.replace('Allow', 'Disallow'));
  assert.equal(other.init.code, 1, other.init.out);
  assert.match(other.init.stderr, /^INIT FAILED: SNAPSHOT-MISMATCH snapshot-\S+: site tree \w{10}, baseline\.json pins \w{10}/m);
  assert.ok(!existsSync(join(other.clone, 'site')), 'nothing installed');
  // the tampered file listed as a redaction too (manifest edited after packing, committed): it holds no redaction mark
  const covered = tamper('site/robots.txt', (t) => t.replace('Allow', 'Disallow'), { listSwap: true });
  assert.equal(covered.init.code, 1, covered.init.out);
  assert.match(covered.init.stderr, /^INIT FAILED: SNAPSHOT-MISMATCH snapshot-\S+: site\/robots\.txt is listed as redacted \(secret-kv\) but holds no "\[secret omitted: …\]" mark/m);
  // the redaction's original blob id changed in the manifest: the tree id is not the pinned one
  assert.equal(tamper(SECRET_FILE, null).init.code, 0, 'the same release untampered (repacked) installs');
  const wrongOrig = tamper(SECRET_FILE, null, { commitEdit: (m) => ({ ...m, assets: [{ ...m.assets[0], redacted: m.assets[0].redacted.map((x) => (x.path === SECRET_FILE ? { ...x, originalBlob: 'f'.repeat(40) } : x)) }] }) });
  assert.equal(wrongOrig.init.code, 1, wrongOrig.init.out);
  assert.match(wrongOrig.init.stderr, /^INIT FAILED: SNAPSHOT-MISMATCH snapshot-\S+: site-pretty tree \w{10}, baseline\.json pins \w{10}/m);
  // an uncommitted edit of the manifest (a swap added after packing) does not count: init refuses it
  const edited = tamper(SECRET_FILE, null, { editAfter: (m) => ({ ...m, assets: [{ ...m.assets[0], redacted: [...m.assets[0].redacted, { ...m.assets[0].redacted[0], path: 'site/robots.txt' }] }] }) });
  assert.equal(edited.init.code, 1, edited.init.out);
  assert.match(edited.init.stderr, /^INIT FAILED: SNAPSHOT-MISMATCH snapshot-\S+: its list of redacted files \(3\) is not the one HEAD:tools\/release\/release-assets\.json commits \(2\); was the manifest edited after packing\?/m);
  const listed = tamper(SECRET_FILE, (t) => t.replace("region: 'x'", "region: 'y'"));
  assert.equal(listed.init.code, 1, listed.init.out);
  assert.match(listed.init.stderr, /^INIT FAILED: SNAPSHOT-MISMATCH snapshot-\S+: site-pretty\/__vendor\/tag\.js is listed as redacted \(secret-kv\) but its blob \w{10} is not the listed \w{10}/m);
  // a listing that names a path outside site*/: refused before anything is fetched
  const clone = makeTempRepo({ worktree: null }).main;
  writeFileSync(join(clone, 'baseline.json'), readFileSync(join(f.source, 'baseline.json')));
  const bad = join(clone, 'bad-assets.json');
  writeFileSync(bad, JSON.stringify({ ...r.manifest, assets: [{ ...snapAsset, redacted: [{ ...snapAsset.redacted[0], path: 'tools/release/init.mjs' }] }] }));
  const ib = node(join(clone, 'tools', 'release', 'init.mjs'), ['--from', assets, '--assets', bad], { cwd: clone });
  assert.equal(ib.code, 2, ib.out);
  assert.match(ib.stderr, /redaction path "tools\/release\/init\.mjs" is not a file below site\/ or site-pretty\//);
});

function buildFixture() {
  const d = tempDir('fw-release-build-');
  const source = makeSourceRepo(join(d, 'src'), git);
  makeOutRoot(join(source, 'out'));
  const state = makeState(join(d, 'state'));
  const bins = fakeBins(join(d, 'bin'));
  const out = join(d, 'release');
  const args = ['--out', out, '--repo', 'someone/study', '--known', knownPath, '--source', source, '--state', state, '--out-root', join(source, 'out'), '--jobs', '2'];
  return { d, source, state, out, outRoot: join(source, 'out'), args, env: bins.env };
}
const noValues = (s, what) => { for (const v of ALL_VALUES) assert.ok(!s.includes(v), `${what} holds a made-up value`); };

test('I-270 build: release repo + console export commit + assets + CHECK 0 residual + scrub report without values', () => {
  const b = buildFixture();
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^STEP rewrite$[\s\S]*^STEP worktree$[\s\S]*^STEP export-console$[\s\S]*^STEP pictures$[\s\S]*^STEP pack$[\s\S]*^STEP commit$[\s\S]*^STEP check$[\s\S]*^STEP report$/m);
  assert.match(r.stdout, /^CHECK 0 residual$/m);
  assert.match(r.stdout, /^BUILD OK /m);
  noValues(r.out, 'build output');
  const repo = join(b.out, 'repo');
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'release: console record export');
  const changed = git(repo, 'show', '--name-only', '--format=', 'HEAD').split('\n');
  assert.ok(changed.includes('console/index.md') && changed.includes('console/threads/T-001.md') && changed.includes('console/.gitignore') && changed.includes('tools/release/release-assets.json'));
  assert.ok(changed.every((x) => x.startsWith('console/') || x === 'tools/release/release-assets.json'), 'the last commit holds only the console export and the manifest');
  assert.ok(!existsSync(join(repo, 'chat')) && !existsSync(join(b.out, 'chat')), 'no chat export (user T-170 #454)');
  for (const f of ['LICENSE', 'LICENSES/MIT.txt', 'REUSE.toml']) {
    assert.deepEqual(readFileSync(join(repo, f)), readFileSync(join(b.source, f)), `${f} byte-identical`);
    assert.equal(git(repo, 'rev-parse', `HEAD:${f}`), git(b.source, 'rev-parse', `HEAD:${f}`), `${f}: same blob`);
  }
  assert.equal(git(repo, 'log', '--format=%h', '--', 'console'), git(repo, 'log', '-1', '--format=%h'), 'console/ enters history only in the last commit');
  assert.ok(!changed.some((x) => /\.(webp|mp4|png)$/.test(x)), 'no pictures in git');
  assert.equal(readFileSync(join(repo, 'console', '.gitignore'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).join(), 'proposals/*/');
  const mirror = join(b.out, 'history', 'repo.git');
  assert.deepEqual(JSON.parse(readFileSync(join(b.out, 'history', 'rewrite-args.json'), 'utf8')), [b.source, join(b.out, 'history'), '--known', knownPath], 'I-269 rewrite.mjs command line');
  assert.equal(git(mirror, 'rev-parse', 'main'), git(repo, 'rev-parse', 'HEAD'), "the last commit is on the mirror's main");
  assert.match(git(mirror, 'branch', '--list'), /evidence\/stub/, 'evidence branches (made by rewrite.mjs) kept');
  assert.equal(git(mirror, 'remote'), '', 'no remote');
  const m = JSON.parse(git(repo, 'show', 'HEAD:tools/release/release-assets.json'));
  assert.deepEqual(m.assets.map((a) => a.name), readdirSync(join(b.out, 'assets')).filter((x) => x !== 'release-assets.json').sort((x, y) => m.assets.findIndex((a) => a.name === x) - m.assets.findIndex((a) => a.name === y)));
  for (const a of m.assets) assert.equal(sha256(readFileSync(join(b.out, 'assets', a.name))), a.sha256);
  assert.ok(!existsSync(join(b.out, 'check-assets')), 'unpacked check copies removed');
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  noValues(rep, 'scrub report');
  assert.match(rep, new RegExp(`\\| source repo HEAD \\| ${git(b.source, 'rev-parse', 'HEAD')} \\|`));
  assert.match(rep, new RegExp(`\\| release main HEAD \\| ${git(repo, 'rev-parse', 'HEAD')} \\|`));
  assert.match(rep, /\| residual \(check\.mjs\) \| \*\*0\*\* \(CHECK 0 residual\) \|/);
  for (const a of m.assets) assert.ok(rep.includes(`| ${a.name} | ${a.kind} | ${a.bytes} | ${a.sha256} |`), a.name);
  for (const x of rules) assert.match(rep, new RegExp(`^\\| ${x.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| `, 'm'), `rule row ${x.id}`);
  assert.match(rep, /^\| rule id \| token \| console \| out-data \| residual \|$/m);
  const homeRow = rep.split('\n').find((l) => l.startsWith(`| ${rules.find((x) => x.kind === 'literal' && x.match === V.home).id} |`)).split('|').map((c) => c.trim());
  assert.ok(Number(homeRow[3]) >= 1 && Number(homeRow[4]) >= 1 && homeRow[5] === '0', `home replaced in console and out-data, no residual: ${homeRow.join(' ')}`);
  assert.doesNotMatch(rep, /chat/i, 'no chat export in the report');
  assert.match(rep, /## History rewrite[\s\S]*\| evidence branches \| 1 \|/);
  assert.match(rep, /\| allow#0 \| tests\/fixtures\/ \| 0 \| fixture LAN address of a test \|/, 'the rewrite replaces everywhere, like filter-repo');
  for (const f of ['LICENSE', 'LICENSES/MIT.txt', 'REUSE.toml']) assert.ok(rep.includes(`| ${f} | identical to the source |`), `licence row ${f}`);
  assert.doesNotMatch(r.stdout, /LICENCE-CHANGED/);
  assert.match(rep, /\| \.git\/fastwork-mirror\/locks\/ \| lock state/);
  assert.match(rep, /\| GitHub repo \(release-assets\.json "repo"\) \| someone\/study \|/);
  assert.match(r.stdout, /^REDACTED site-pretty\/__vendor\/tag\.js secret-kv 1$/m);
  assert.match(r.stdout, /^REDACTED site\/__vendor\/tag\.js secret-kv 1$/m);
  assert.match(rep, /## Snapshot redactions[\s\S]*\| site\/__vendor\/tag\.js \| secret-kv \| 1 \| js \| redacted \|\n\| site-pretty\/__vendor\/tag\.js \| secret-kv \| 1 \| js \| redacted \|/);
  assert.ok(!rep.includes(FAKE_KEY) && !r.out.includes(FAKE_KEY), 'the key is printed nowhere');
  assert.deepEqual(m.assets[0].redacted.map((x) => x.path), ['site/__vendor/tag.js', 'site-pretty/__vendor/tag.js']);
  assert.equal(m.repo, 'someone/study');
  assert.match(rep, /\| out\/article-video\/v\.mp4 \|  \| video: watch it \| container metadata stripped \|/, 'out/ media on the review sheet');
  // out/lead: only what the committed write-ups cite (a console thread naming a file ships nothing); every shipped
  // out-data text file on the human-read list
  assert.match(r.stdout, /^CITED 3 out\/lead and out\/tryit file\(s\) ship \(6 path\(s\) cited\)$/m);
  // cited but not in out/: reported (pictures first in the report), not a refusal
  assert.match(r.stdout, /^CITED-MISSING 3 out\/ path\(s\) cited by the committed text do not exist \(2 picture or video file\(s\)\); listed in the scrub report$/m);
  assert.match(r.stdout, /^CITED-ELSEWHERE 2 \(per-worktree outputs, never shipped\)$/m);
  assert.match(rep, /## Cited but missing in out\/\n[\s\S]*?Not listed: 2 missing path\(s\) in other out\/ folders[\s\S]*?\n- out\/lead\/gone\.png\n- out\/people-blink\/gone\.mov\n- out\/ab\/old-run\/results\.json\n\n/);
  assert.doesNotMatch(rep, /^- out\/article\//m);
  // no xattrs, ACLs or Apple metadata in any archive, the snapshot's git archive included
  assert.match(r.stdout, /^TAR-META 0 xattr, ACL or Apple metadata record\(s\) in 4 archive\(s\)$/m);
  assert.match(r.stdout, /^HISTORY-PICTURES 0 checked in \d+ blob\(s\) of every ref \(0 clean, listed for review\), 0 problem\(s\), 0 noted; 0 unreachable blob\(s\) skipped \(never pushed\); \d+(\.\d)? s$/m);
  assert.match(rep, /^Tar headers: every archive is read for xattrs, ACLs and Apple metadata .*: none\.$/m);
  assert.ok(!tarList(join(b.out, 'assets', 'out-data.tar.gz')).includes('out/lead/console-cited.txt'), 'cited by the console export only');
  assert.doesNotMatch(rep, /console-cited/);
  assert.match(rep, /^- out-data\.tar\.gz out\/tryit\/t\.diff \(out\/\): shipped text file$/m);
  assert.match(r.stdout, /^IMAGES \d+ checked, \d+ stripped, 0 refused$/m);
  assert.match(rep, /## Picture metadata\n\nPNG and GIF ship without/);
  // the source's commit by the user (V.name, V.email) is in the mirror: check.mjs accepts it only with --source
  const ckNo = node(join(staged.dir, 'check.mjs'), [join(b.out, 'history', 'repo.git'), '--known', knownPath]);
  assert.equal(ckNo.code, 1, 'without --source the identity lines are hits');
  assert.match(ckNo.stdout, /^CHECK [1-9]\d* residual/m);
  const ckSrc = node(join(staged.dir, 'check.mjs'), [join(b.out, 'history', 'repo.git'), '--known', knownPath, '--source', b.source]);
  assert.equal(ckSrc.code, 0, ckSrc.out);
  assert.match(rep, /\| out\/certs\/ \| TLS keys and certificates \|/);
  assert.match(rep, /^- T-001 #3 \(user\): thai-text$/m);
  assert.match(rep, /^- T-001 #4 \(user\): .*pasted-email/m);
  assert.match(rep, /## Image review sheet[\s\S]*\| console\/proposals\/PR-001\/r1-b-1\.webp \| 1290x2796 \| time-like, iphone, wifi, known-literal \| none \|/);
  for (const f of walkFiles(b.out).filter((x) => !x.startsWith('history/repo.git/') && !x.startsWith('assets/'))) noValues(readFileSync(join(b.out, f), 'latin1') + f, f);
});

test('I-270 build: a value left in the release repo is a residual: exit 1, BUILD NOT READY, report names rule and path only', () => {
  const b = buildFixture();
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: { ...b.env, FW_TEST_REWRITE_LEAK: '1' }, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /BUILD NOT READY: \d+ residual hit/);
  assert.doesNotMatch(r.stdout, /^CHECK 0 residual$/m);
  noValues(r.out, 'build output');
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  noValues(rep, 'scrub report');
  assert.match(rep, /\| residual \(check\.mjs\) \| \*\*[1-9]\d*\*\* - NOT READY \|/);
  assert.match(rep, /### Residual hits\n\n- \S+ history\/repo\.git .*LEAK\.md\S*:1$/m);
});

test('I-270 build: a value in a Release file is a residual named by file and repo path; --quality reaches cwebp', () => {
  const b = buildFixture();
  writeFileSync(join(b.source, 'out', 'people-blink', 'art', 'notes.txt'), `shot by ${V.name}\n`); // media ship as they are
  const r = node(join(staged.dir, 'build.mjs'), [...b.args, '--quality', '70'], { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /BUILD NOT READY: 2 residual hit/, 'the unpacked file and the archive bytes');
  noValues(r.out, 'build output');
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  noValues(rep, 'scrub report');
  assert.match(rep, /### Residual hits\n\n- \S+ assets\/out-media\.tar out\/people-blink\/art\/notes\.txt:1$/m, 'the path as npm run init unpacks it');
  assert.match(rep, /^- \S+ assets\/out-media\.tar \(archive bytes, 1x\)$/m);
  const calls = readFileSync(join(b.d, 'bin', 'cwebp.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(calls.length && calls.every((c) => c.join(' ').includes('-metadata none -q 70')), 'quality flag');
});

test('I-270 build: a licence file the rewrite changed (a rule matched it) is not ready: LICENCE-CHANGED, exit 1', () => {
  const b = buildFixture();
  writeFileSync(join(b.source, 'LICENSE'), `MIT License\n\nCopyright (c) 2026 ${V.name}\n`);
  git(b.source, 'commit', '-q', '-am', 'licence holder');
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^LICENCE-CHANGED LICENSE changed$/m);
  assert.match(r.stdout, /BUILD NOT READY: 0 residual hit\(s\), 1 licence file\(s\) changed by the rewrite/);
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  assert.ok(rep.includes('| LICENSE | **changed** - NOT READY |') && rep.includes('| REUSE.toml | identical to the source |'));
  noValues(r.out, 'build output');
  noValues(rep, 'scrub report');
});

test('I-270 build: the login name in a tar header is a residual (the archive bytes are scanned, not only the unpacked files)', () => {
  const b = buildFixture();
  // a tar that writes an owner name, as tar does by default: --uname '' replaced by --uname <made-up home name>
  const wrap = join(b.d, 'bin', 'tar-with-owner.mjs');
  writeFileSync(wrap, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2);
const i = a.indexOf('--uname');
if (i >= 0) a[i + 1] = ${JSON.stringify(V.home)};
process.exit(spawnSync('tar', a, { stdio: 'inherit' }).status);
`, { mode: 0o755 });
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: { ...b.env, FW_TAR: wrap }, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^HIT \S+ assets\/proposal-media\.tar \(archive bytes, \d+x\)$/m);
  assert.match(r.stdout, /^HIT \S+ assets\/out-data\.tar\.gz \(archive gunzipped, \d+x\)$/m);
  assert.match(r.stdout, /BUILD NOT READY/);
  noValues(r.out, 'build output');
});

test('I-270 build: an archive with xattrs or AppleDouble entries (a tar without the no-metadata flags) is not ready: TAR-META-HIT', { skip: process.platform !== 'darwin' && 'xattr and bsdtar defaults are macOS' }, () => {
  const b = buildFixture();
  assert.equal(spawnSync('xattr', ['-w', 'com.apple.metadata:fwtest', 'made-up', join(b.outRoot, 'article-gifs', 'a.gif')]).status, 0);
  // a tar as it behaves by default: the no-metadata flags dropped, COPYFILE_DISABLE unset
  const wrap = join(b.d, 'bin', 'tar-with-metadata.mjs');
  writeFileSync(wrap, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2).filter((x) => !['--no-xattrs', '--no-acls', '--no-mac-metadata'].includes(x));
const env = { ...process.env }; delete env.COPYFILE_DISABLE;
process.exit(spawnSync('tar', a, { stdio: 'inherit', env }).status);
`, { mode: 0o755 });
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: { ...b.env, FW_TAR: wrap }, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^TAR-META-HIT assets\/out-media\.tar out\/article-gifs\/a\.gif: xattr \(LIBARCHIVE\.xattr\)$/m);
  assert.match(r.stdout, /^TAR-META-HIT assets\/out-media\.tar out\/article-gifs\/\._a\.gif: AppleDouble entry \(\._\)$/m);
  assert.match(r.stdout, /^TAR-META [1-9]\d* xattr, ACL or Apple metadata record\(s\) in 4 archive\(s\)$/m);
  assert.match(r.stdout, /BUILD NOT READY: .* [1-9]\d* tar metadata record\(s\)/);
  assert.match(readFileSync(join(b.out, 'scrub-report.md'), 'utf8'), /^Tar headers: .*: \*\*[1-9]\d*\*\* - NOT READY\.$/m);
});

test('I-270 build: the picture policy covers the release git history: committed pictures (by name or magic bytes) and data URIs checked, problems not ready, clean ones on the sheet', () => {
  const b = buildFixture();
  const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
  writeFileSync(join(b.source, 'research', 'notes', 'fig.png'), png(64, 48));
  writeFileSync(join(b.source, 'research', 'notes', 'meta.png'), png(64, 48, '', [pngChunk('tEXt', 'Author\0made-up-author-7')]));
  // a picture committed under another name: found by its magic bytes
  writeFileSync(join(b.source, 'research', 'notes', 'plot.bin'), png(16, 16, '', [pngChunk('tEXt', 'Author\0made-up-author-7')]));
  const long = Buffer.alloc(90, 7).toString('base64').slice(0, 119); // 119 base64 characters: picture-shaped, does not decode
  // below 100 characters a run that is no picture is an example (noted): the AAAA fixture, a truncated 39-byte JPEG; but a
  // short run holding a known value is refused, and 100+ characters that decode to no picture are refused too
  const cut = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xdb, 0, 0x43]), Buffer.alloc(20, 1)]).subarray(0, 39);
  writeFileSync(join(b.source, 'research', 'notes', 'page.html'), `<img src="${dataUri('image/png', png(32, 32))}">\n<code>data:image/png;base64,abc</code> about data:image URIs\n<img src="data:image/png;base64,${long}">\n`
    + `<img src="data:image/png;base64,AAAA">\n<img src="${dataUri('image/jpeg', cut)}">\n<img src="${dataUri('image/png', Buffer.from(V.email))}">\n<img src="${dataUri('image/png', Buffer.alloc(90, 7))}">\n`);
  git(b.source, 'add', 'research'); git(b.source, 'commit', '-q', '-m', 'figures');
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^HISTORY-PICTURES 7 checked in \d+ blob\(s\) of every ref \(2 clean, listed for review\), 5 problem\(s\), 4 noted; 0 unreachable blob\(s\) skipped \(never pushed\); \d+(\.\d)? s$/m);
  assert.match(r.stdout, /^HISTORY-PICTURE-REFUSED git:research\/notes\/meta\.png@[0-9a-f]{12}: text, needs a strip \(not possible in history\)$/m);
  assert.match(r.stdout, /^HISTORY-PICTURE-REFUSED git:research\/notes\/plot\.bin@[0-9a-f]{12}: text, needs a strip \(not possible in history\)$/m);
  assert.match(r.stdout, /^HISTORY-PICTURE-REFUSED git:research\/notes\/page\.html@[0-9a-f]{12}#data-4: undecodable-data-uri$/m);
  assert.match(r.stdout, /^HISTORY-PICTURE-REFUSED git:research\/notes\/page\.html@[0-9a-f]{12}#data-7: known-value-in-data-uri$/m);
  assert.match(r.stdout, /^HISTORY-PICTURE-REFUSED git:research\/notes\/page\.html@[0-9a-f]{12}#data-8: not-an-image$/m);
  assert.doesNotMatch(r.stdout, /#data-[56]:/);
  assert.match(r.stdout, /BUILD NOT READY: .* 5 picture problem\(s\) in the release history/);
  const sheet = readFileSync(join(b.out, 'review-sheet.md'), 'utf8');
  assert.match(sheet, /\| git:research\/notes\/fig\.png@[0-9a-f]{12} \| 64x48 \| none found \| none \|/);
  assert.match(sheet, /\| git:research\/notes\/page\.html@[0-9a-f]{12}#data-1 \| 32x32 \| none found \| none \|/);
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  assert.match(rep, /## Pictures in the release history[\s\S]*#data-2: short undecodable run \(an example or placeholder\), 3 characters\n- git:research\/notes\/page\.html@[0-9a-f]{12}#data-3: unparsed data:image \(prose or code\)/);
  assert.match(rep, /#data-5: short run that is no picture this reads \(not-an-image; an example or placeholder\), 4 characters\n- git:research\/notes\/page\.html@[0-9a-f]{12}#data-6: short run that is no picture this reads \(unreadable; an example or placeholder\), 52 characters/);
  noValues(r.out + rep, 'build output and report');
  assert.match(rep, /unreachable blob\(s\) skipped \(no ref reaches them, so they are never pushed\); \d+(\.\d)? s\.\n\n/);
  assert.ok(!rep.includes('made-up-author-7') && !sheet.includes('made-up-author-7'), 'kinds only');
});

test('I-270 historyPictures: a short run is noted unless its text or its bytes (decoded leniently) hold a known value, in any letter case', async () => {
  const { historyPictures } = await import(join(staged.dir, 'pack.mjs'));
  const repo = tempDir('fw-hp-short-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const b64 = (s) => Buffer.from(s).toString('base64');
  writeFileSync(join(repo, 'a.md'), [
    'data:image/png;base64,AAAA', // an example: noted
    `data:image/png;base64,${b64(V.email.toUpperCase())}`, // decodes to a known value (any case)
    `data:image/png;base64,QUFB${V.home}QUFB`, // the run's own text holds one
    `data:image/png;base64,${b64(`xx${V.email}`).replace(/=+$/, '')}`, // padding missing: undecodable, decoded leniently
    `data:image\\/png;base64,${b64(V.email).replace(/\//g, '\\/')}`, // JSON's escaped form
  ].join('\n') + '\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'a');
  const hp = await historyPictures({ gitDir: join(repo, '.git'), rules });
  assert.deepEqual(hp.problems.map((p) => [p.path.replace(/@[0-9a-f]{12}/, ''), p.kinds]), [2, 3, 4, 5].map((n) => [`git:a.md#data-${n}`, ['known-value-in-data-uri']]));
  assert.deepEqual(hp.notes.map((n) => n.path.replace(/@[0-9a-f]{12}/, '')), ['git:a.md#data-1']);
  assert.ok(!JSON.stringify(hp.problems).includes(V.home), 'kinds and paths only');
});

test('I-270 historyPictures: only blobs a ref reaches are read; unreachable ones are counted (never pushed)', async () => {
  const { historyPictures } = await import(join(staged.dir, 'pack.mjs'));
  const repo = tempDir('fw-hp-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'a.png'), png(8, 8));
  git(repo, 'add', 'a.png'); git(repo, 'commit', '-q', '-m', 'a');
  const loose = join(tempDir('fw-hp-'), 'x.png');
  writeFileSync(loose, png(8, 8, '', [pngChunk('tEXt', 'Author\0made-up-author-7')]));
  git(repo, 'hash-object', '-w', loose); // in the object store, on no ref
  const hp = await historyPictures({ gitDir: join(repo, '.git'), rules: [] });
  assert.equal(hp.unreachable, 1);
  assert.equal(hp.checked, 1);
  assert.deepEqual(hp.problems, []);
});

test('I-270 build: --repo is required (npm run init downloads from it)', () => {
  const b = buildFixture();
  const i = b.args.indexOf('--repo');
  const r = node(join(staged.dir, 'build.mjs'), [...b.args.slice(0, i), ...b.args.slice(i + 2)], { env: b.env });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /usage: build\.mjs --out <dir> --repo <owner\/name>/);
  const bad = node(join(staged.dir, 'build.mjs'), b.args.map((x) => (x === 'someone/study' ? 'no-slash' : x)), { env: b.env });
  assert.equal(bad.code, 2, bad.out);
});

test('I-270 release CLIs: outputs inside the repo are refused (exit 2), a symlink into it too', () => {
  const d = tempDir('fw-release-guard-');
  const state = makeState(join(d, 'state'));
  const ec = node(join(staged.dir, 'export-console.mjs'), ['--out', join(root, 'console-out'), '--state', state, '--known', knownPath]);
  assert.equal(ec.code, 2, ec.out);
  assert.match(ec.stderr, /REFUSED: --out .* is inside the repo/);
  assert.ok(!existsSync(join(root, 'console-out')));
  const pc = node(join(staged.dir, 'pictures.mjs'), ['--out', join(d, 'media'), '--sheet', join(root, 'sheet.md'), '--state', state, '--known', knownPath]);
  assert.equal(pc.code, 2, pc.out);
  assert.match(pc.stderr, /REFUSED: --sheet /);
  const b = buildFixture();
  const pk = node(join(staged.dir, 'pack.mjs'), ['--assets', join(b.source, 'assets'), '--media', join(d, 'media'), '--source', b.source, '--known', knownPath]);
  assert.equal(pk.code, 2, pk.out);
  assert.match(pk.stderr, /REFUSED: --assets /);
  symlinkSync(b.source, join(b.d, 'src-link'));
  const viaLink = node(join(staged.dir, 'build.mjs'), ['--out', join(b.d, 'src-link', 'release'), ...b.args.slice(2)], { env: b.env });
  assert.equal(viaLink.code, 2, viaLink.out);
  assert.match(viaLink.stderr, /REFUSED: --out .* is inside the source repo/);
});

test('I-270 build: refuses --out inside the source repo or not empty (exit 2); a failing step stops the build (exit 1)', () => {
  const b = buildFixture();
  const inside = node(join(staged.dir, 'build.mjs'), ['--out', join(b.source, 'release'), ...b.args.slice(2)], { env: b.env });
  assert.equal(inside.code, 2, inside.out);
  assert.match(inside.stderr, /REFUSED: --out .* is inside the source repo/);
  mkdirSync(b.out, { recursive: true });
  writeFileSync(join(b.out, 'x'), 'x');
  const full = node(join(staged.dir, 'build.mjs'), b.args, { env: b.env });
  assert.equal(full.code, 2, full.out);
  assert.match(full.stderr, /REFUSED: --out .* is not empty/);
  const b2 = buildFixture();
  const fail = node(join(staged.dir, 'build.mjs'), b2.args, { env: { ...b2.env, FW_TEST_REWRITE_FAIL: '1' } });
  assert.equal(fail.code, 1, fail.out);
  assert.match(fail.stderr, /build: rewrite\.mjs exited 1/);
  assert.ok(!existsSync(join(b2.out, 'scrub-report.md')));
});

test('I-270 build: a missing rewrite.mjs (I-269 not landed) fails the build', () => {
  const b = buildFixture();
  const alone = stageTools(tempDir('fw-release-norewrite-'));
  rmSync(join(alone.dir, 'rewrite.mjs'));
  const r = node(join(alone.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /build: missing tools\/release\/rewrite\.mjs \(I-269 not landed/);
  assert.ok(!existsSync(join(b.out, 'scrub-report.md')));
});

test('I-270 release tools: --help prints the header and exits 0 before anything runs', () => {
  for (const t of ['build.mjs', 'export-console.mjs', 'pictures.mjs', 'pack.mjs']) {
    const r = node(join(staged.dir, t), ['--help']);
    assert.equal(r.code, 0, `${t}: ${r.out}`);
    assert.match(r.stdout, new RegExp(`^${t.replace('.', '\\.')}: `), t);
  }
});

test('I-270 export-console CLI: writes the export and prints counts and rule ids only', () => {
  const d = tempDir('fw-release-cli-');
  const state = makeState(join(d, 'state'));
  const r = node(join(staged.dir, 'export-console.mjs'), ['--out', join(d, 'console'), '--state', state, '--known', knownPath, '--summary', join(d, 'summary.json')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^EXPORTED threads 2 steps 1 proposals 1 status 1 findings 1 incidents 1 -> /m);
  assert.match(r.stdout, /^SCRUB \S+ \d+$/m);
  noValues(r.out, 'CLI output');
  noValues(readFileSync(join(d, 'summary.json'), 'utf8'), 'summary');
});

test('I-270 build: a refused picture (an AVIF with XMP) makes the build not ready; the sheet names its metadata', () => {
  const b = buildFixture();
  writeFileSync(join(b.source, 'out', 'lead', 'snap.avif'), avif(true));
  writeFileSync(join(b.source, 'research', 'notes', 'more.md'), 'and out/lead/snap.avif\n');
  git(b.source, 'add', 'research'); git(b.source, 'commit', '-q', '-m', 'cite');
  const r = node(join(staged.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^IMAGE-REFUSED out\/lead\/snap\.avif: xmp$/m);
  assert.match(r.stdout, /BUILD NOT READY: 0 residual hit\(s\), 0 licence file\(s\) changed by the rewrite, 1 picture\(s\) refused, 0 snapshot file\(s\) not redacted/);
  const rep = readFileSync(join(b.out, 'scrub-report.md'), 'utf8');
  assert.match(rep, /\| out\/lead\/snap\.avif \| \*\*xmp\*\* - NOT READY \|/);
  assert.match(rep, /\| out\/lead\/snap\.avif \|  \| no OCR for this format: look at it \| \*\*refused\*\* \(xmp\): xmp \|/);
  assert.ok(!tarList(join(b.out, 'assets', 'out-data.tar.gz')).includes('out/lead/snap.avif'));
});

test('I-270 build: a check.mjs run without its "CHECK n residual (r rules)" line fails the build (no silent pass)', () => {
  const b = buildFixture();
  const alone = stageTools(tempDir('fw-release-nocheckline-'));
  writeFileSync(join(alone.dir, 'check.mjs'), "console.log('looked at it');\n");
  const r = node(join(alone.dir, 'build.mjs'), b.args, { env: b.env, timeout: 90000 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /build: check\.mjs on the mirror printed no "CHECK <n> residual \(<r> rules\)" line \(exit 0\): not checked/);
  assert.doesNotMatch(r.stdout, /BUILD OK/);
});

test('I-270 build: with HOME elsewhere and --out under it, the output shows ~, never the home folder', () => {
  const b = buildFixture();
  const home = tempDir('fw-release-home-');
  const out = join(home, 'release');
  // git needs an identity without a global config: the one the source history already has (check.mjs --source)
  const [n, e] = git(b.source, 'log', '-1', '--format=%cn%x00%ce').split('\0');
  const env = { ...b.env, HOME: home, GIT_AUTHOR_NAME: n, GIT_AUTHOR_EMAIL: e, GIT_COMMITTER_NAME: n, GIT_COMMITTER_EMAIL: e };
  const r = node(join(staged.dir, 'build.mjs'), ['--out', out, ...b.args.slice(2)], { env, timeout: 90000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^BUILD OK ~\/release /m);
  assert.ok(!r.out.includes(home), 'no home folder in the output');
});

// I-074 (user T-028): live pages in proposals. tools/lib/framing.mjs (the --frame-ancestors value and the headers it
// changes), tools/lib/live.mjs (a committed fixes/<topic>/patch.diff read from git, stored by blob, built into an
// overlay under the shared state dir; the timing-hold check) and the proposal `live` entry (normalize, post, revise,
// setLive on a decided proposal, options, publicView, showText). The state dir lies inside the temp repo's .git, as in
// production (.git/fastwork-mirror), where `git apply` would otherwise refuse the overlay's paths.
// Fixture baseline ($FW_MIRROR_HOME), temp repo, no server, no Chrome.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, git } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS, PAGE_CSS } from '../fixtures/baseline.mjs';
import { parseFrameAncestors, withFrameAncestors, allowFraming, FRAME_ORIGIN } from '../../tools/lib/framing.mjs';

let L, P, fx, repo;
const blobs = {};
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** A fix.mjs-style patch of `files` ({urlPath: new text}) against the fixture's site-pretty; `baseSha` overrides the header. */
function makePatch(topic, files, { baseSha, stacked = false } = {}) {
  const gen = tempDir('fw-live-gen-');
  git(gen, 'init', '-q', '-b', 'main');
  git(gen, 'config', 'commit.gpgsign', 'false');
  for (const p of Object.keys(files)) {
    const src = join(fx.pretty, p.slice(1));
    if (existsSync(src)) { mkdirSync(dirname(join(gen, p.slice(1))), { recursive: true }); writeFileSync(join(gen, p.slice(1)), readFileSync(src)); }
  }
  writeFileSync(join(gen, '.keep'), '');
  git(gen, 'add', '-A');
  git(gen, 'commit', '-q', '-m', 'base');
  for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(join(gen, p.slice(1))), { recursive: true }); writeFileSync(join(gen, p.slice(1)), text); }
  git(gen, 'add', '-A');
  const diff = git(gen, 'diff', '--cached', '--no-color') + '\n';
  const head = [`# fastwork mirror fix: ${topic}`, '# baseline: site-pretty/ (Prettier-formatted copy of the production mirror); paths are URL paths'];
  if (stacked) head.push('# STACKED on fixes/other/overlay');
  for (const p of Object.keys(files)) {
    const src = join(fx.pretty, p.slice(1));
    if (existsSync(src)) head.push(`# base-sha256 ${p.slice(1)} ${baseSha || sha(readFileSync(src))}`);
  }
  return head.join('\n') + '\n' + diff;
}
function commitPatch(topic, text) {
  mkdirSync(join(repo, 'fixes', topic), { recursive: true });
  writeFileSync(join(repo, 'fixes', topic, 'patch.diff'), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `fix ${topic}`);
  return git(repo, 'rev-parse', `HEAD:fixes/${topic}/patch.diff`);
}

before(async () => {
  const home = tempDir('fw-live-home-');
  fx = makeFixtureHome(home);
  repo = tempDir('fw-live-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README'), 'temp\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  process.env.FW_MIRROR_HOME = home;
  process.env.FW_STATE_DIR = join(repo, '.git', 'fastwork-mirror'); // as in production: inside .git
  L = await import('../../tools/lib/live.mjs');
  P = await import('../../tools/lib/proposal.mjs');
  const js = fx.prettyFiles[PAGE_JS];
  blobs.demo = commitPatch('demo', makePatch('demo', { [PAGE_JS]: js + '/* PoC: demo */\n', '/added.js': 'console.log("new file")\n' }));
  blobs.css = commitPatch('css-only', makePatch('css-only', { [PAGE_CSS]: fx.prettyFiles[PAGE_CSS] + '/* PoC css */\n' }));
  blobs.drift = commitPatch('drift', makePatch('drift', { [PAGE_JS]: js + '/* drift */\n' }, { baseSha: 'f'.repeat(64) }));
  blobs.stacked = commitPatch('stacked', makePatch('stacked', { [PAGE_JS]: js + '/* stacked */\n' }, { stacked: true }));
  blobs.bad = commitPatch('no-apply', makePatch('no-apply', { [PAGE_JS]: js + '/* x */\n' }).replace(/^ (.*)$/m, ' this context line is not in the file'));
});

// ---- framing ----
test('parseFrameAncestors: exact localhost / 127.0.0.1 origins with a port, comma or space separated, deduplicated', () => {
  assert.deepEqual(parseFrameAncestors('http://localhost:5559'), ['http://localhost:5559']);
  assert.deepEqual(parseFrameAncestors('http://localhost:5559, http://127.0.0.1:5559 http://localhost:5559'), ['http://localhost:5559', 'http://127.0.0.1:5559']);
  assert.deepEqual(parseFrameAncestors('https://127.0.0.1:65535'), ['https://127.0.0.1:65535']);
  for (const bad of [undefined, null, '', '  ', '--quiet', 'http://localhost', 'http://localhost:5559/', 'http://localhost:0', 'http://localhost:65536',
    'http://evil.example:5559', 'http://localhost.evil.example:5559', 'http://192.168.1.2:5559', "'self'", '*', 'ws://localhost:1', 'http://[::1]:5559',
    'http://localhost:5559,http://evil.example:1']) {
    assert.throws(() => parseFrameAncestors(bad), /--frame-ancestors/, String(bad));
  }
  assert.ok(FRAME_ORIGIN.test('http://127.0.0.1:1') && !FRAME_ORIGIN.test('http://127.0.0.2:1'));
});

test('withFrameAncestors / allowFraming: the one frame-ancestors directive is replaced (or appended); x-frame-options goes; nothing else changes', () => {
  const o = ['http://localhost:5559', 'http://127.0.0.1:5559'];
  assert.equal(withFrameAncestors("default-src 'self'; frame-ancestors 'self'; base-uri 'self'", o), "default-src 'self'; frame-ancestors 'self' http://localhost:5559 http://127.0.0.1:5559; base-uri 'self'");
  assert.equal(withFrameAncestors("default-src 'self'", o), "default-src 'self'; frame-ancestors 'self' http://localhost:5559 http://127.0.0.1:5559");
  assert.equal(withFrameAncestors('', o.slice(0, 1)), "frame-ancestors 'self' http://localhost:5559");
  assert.equal(withFrameAncestors("frame-ancestors 'none'", o.slice(1)), "frame-ancestors 'self' http://127.0.0.1:5559");
  const h = { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "default-src 'self'; frame-ancestors 'self'", link: 'x' };
  assert.equal(allowFraming(h, o), h);
  assert.deepEqual(h, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; frame-ancestors 'self' http://localhost:5559 http://127.0.0.1:5559", link: 'x' });
});

// ---- live.mjs ----
test('resolveLivePatch: a committed fixes/<topic>/patch.diff -> blob, base, files, text; nothing written', () => {
  const r = L.resolveLivePatch({ patch: 'fixes/demo/patch.diff', repoDir: repo });
  assert.equal(r.blob, blobs.demo);
  assert.equal(r.ref, 'HEAD');
  assert.equal(r.base, 'site-pretty');
  assert.deepEqual(r.files.sort(), ['_app/immutable/nodes/2.fixture.js', 'added.js']);
  assert.equal(r.text, readFileSync(join(repo, 'fixes/demo/patch.diff'), 'utf8'));
  assert.equal(L.resolveLivePatch({ patch: 'fixes/demo/patch.diff', ref: 'main', repoDir: repo }).blob, blobs.demo);
  assert.equal(existsSync(L.livePatchFile(blobs.demo)), false, 'resolving stores nothing');
});

test('resolveLivePatch refuses: not a fix patch path, an uncommitted patch, a bad ref, a stacked patch, a patch without files', () => {
  const R = (patch, extra = {}) => () => L.resolveLivePatch({ patch, repoDir: repo, ...extra });
  for (const bad of ['tools/serve.mjs', 'fixes/demo/README.md', 'fixes/../x/patch.diff', '/abs/fixes/demo/patch.diff', 'fixes/Demo/patch.diff', 'fixes/demo/patch.diff ', '', undefined]) {
    assert.throws(R(bad), /fixes\/<topic>\/patch\.diff/, String(bad));
  }
  mkdirSync(join(repo, 'fixes', 'uncommitted'), { recursive: true });
  writeFileSync(join(repo, 'fixes', 'uncommitted', 'patch.diff'), 'x');
  assert.throws(R('fixes/uncommitted/patch.diff'), /not committed at HEAD/);
  assert.throws(R('fixes/demo/patch.diff', { ref: 'no-such-branch' }), /not committed at no-such-branch/);
  assert.throws(R('fixes/demo/patch.diff', { ref: '--output=x' }), /ref: a git ref/);
  assert.throws(R('fixes/stacked/patch.diff'), /stacked on fixes\/other\/overlay/);
  writeFileSync(join(repo, 'fixes', 'uncommitted', 'patch.diff'), '# nothing\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'empty patch');
  assert.throws(R('fixes/uncommitted/patch.diff'), /changes no file/);
});

test('buildLiveOverlay: baseline files + the stored patch, built once inside .git (git apply outside any repo); site-pretty untouched', () => {
  const before = readFileSync(join(fx.pretty, PAGE_JS.slice(1)), 'utf8');
  assert.throws(() => L.buildLiveOverlay(blobs.demo), /no stored patch/);
  const r = L.resolveLivePatch({ patch: 'fixes/demo/patch.diff', repoDir: repo });
  L.storeLivePatch(r.blob, r.text);
  assert.equal(L.storedLivePatch(r.blob), r.text);
  const dir = L.buildLiveOverlay(r.blob);
  assert.ok(dir.startsWith(join(repo, '.git', 'fastwork-mirror', 'console', 'live', 'overlays')), dir);
  assert.equal(readFileSync(join(dir, PAGE_JS.slice(1)), 'utf8'), before + '/* PoC: demo */\n');
  assert.equal(readFileSync(join(dir, 'added.js'), 'utf8'), 'console.log("new file")\n');
  assert.ok(existsSync(`${dir}.ready`));
  assert.equal(readFileSync(join(fx.pretty, PAGE_JS.slice(1)), 'utf8'), before, 'the baseline is never written');
  assert.deepEqual(readdirSync(dirname(dir)).filter((f) => /\.tmp-/.test(f)), [], 'no temp dirs left');
  assert.equal(L.buildLiveOverlay(r.blob), dir, 'built once');
  assert.throws(() => L.buildLiveOverlay('nope'), /bad blob id/);
  assert.throws(() => L.livePatchFile('../../x'), /bad blob id/);
});

test('buildLiveOverlay refuses a patch made on another baseline (BASELINE-CHANGED) and one that does not apply; nothing half-built', () => {
  for (const [topic, want] of [['drift', /BASELINE-CHANGED/], ['no-apply', /does not apply/]]) {
    const r = L.resolveLivePatch({ patch: `fixes/${topic}/patch.diff`, repoDir: repo });
    L.storeLivePatch(r.blob, r.text);
    assert.throws(() => L.buildLiveOverlay(r.blob), want, topic);
    const ov = join(L.liveDir(), 'overlays');
    assert.deepEqual(readdirSync(ov).filter((f) => f.startsWith(r.blob)), [], `${topic}: nothing left`);
  }
});

test('timingHold: only a live normal hold counts (not shared, short, no-timing, functional, stale, free)', () => {
  assert.deepEqual(L.timingHold({ holder: { owner: 'fix-a' }, stale: null }), { owner: 'fix-a' });
  for (const st of [null, {}, { holder: null }, { holder: { owner: 'x' }, stale: 'pid dead' }, { holder: { owner: 'x', shared: true } },
    { holder: { owner: 'x', short: true } }, { holder: { owner: 'x', noTiming: true } }, { holder: { owner: 'x', functional: true } }]) {
    assert.equal(L.timingHold(st), null, JSON.stringify(st));
  }
  assert.equal(L.measuringNow(), false, 'nobody holds the temp lock');
});

// ---- the proposal's live entry ----
/** Set a stored proposal's state as the store keeps it (publishing needs screenshots; state changes are not under test). */
function setState(id, state) {
  const f = join(process.env.FW_STATE_DIR, 'console', 'proposals', `${id}.json`);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.state = state;
  if (state === 'accepted') j.decision = { value: 'accept', at: new Date().toISOString(), rev: j.rev, notes: '' };
  writeFileSync(f, JSON.stringify(j));
  return P.get(id);
}
const sample = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Countdown faces', area: 'hero', topic: 'countdown-faces',
  problem: 'The countdown restyles every second.', idea: 'Swap whole faces.', looksSame: 'Same digits.',
  visualDiff: ['None at 1x.'], risk: 'Low.',
  compare: { a: { label: 'Original' }, b: { label: 'Faces' }, view: 'side' },
  ...over,
});

test('post a draft with a live B: validated from git, the patch kept in the store by blob, the proposal stores no patch text', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample(), draft: true, live: { patch: 'fixes/css-only/patch.diff', ref: 'HEAD' }, repoDir: repo });
  assert.deepEqual(p.live, { patch: 'fixes/css-only/patch.diff', ref: 'HEAD', blob: blobs.css, base: 'site-pretty', files: ['_app/immutable/assets/0.fixture.css'] });
  assert.equal(readFileSync(L.livePatchFile(blobs.css), 'utf8'), readFileSync(join(repo, 'fixes/css-only/patch.diff'), 'utf8'));
  const stored = setState(p.id, 'proposed'); // the page shows no drafts
  assert.equal(JSON.stringify(stored).includes('PoC css'), false, 'no patch text in the proposal');
  assert.deepEqual(P.publicView(stored).live, { patch: 'fixes/css-only/patch.diff', version: blobs.css.slice(0, 12), files: 1 });
  assert.match(P.showText(stored), /live B: fixes\/css-only\/patch\.diff @ [0-9a-f]{12} \(1 file\(s\) on site-pretty/);
  // in the file itself, and the errors name the field
  const n = P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff' } }), { repoDir: repo, draft: true });
  assert.equal(n.fields.live.blob, blobs.demo);
  assert.match(P.normalize(sample({ live: { patch: 'fixes/nope/patch.diff' } }), { repoDir: repo, draft: true }).errors.join('\n'), /^live\.patch: .*not committed/m);
  assert.match(P.normalize(sample({ live: 'tools/x' }), { repoDir: repo, draft: true }).errors.join('\n'), /^live\.patch: must be a fix's committed patch/m);
  // a proposal without live: no live key anywhere
  const { proposal: q } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'No live' }), draft: true });
  assert.equal('live' in P.publicView(setState(q.id, 'proposed')), false);
});

test('revise keeps, replaces or drops the live B; a stored entry is re-checked against the store', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'Revise live' }), draft: true, live: { patch: 'fixes/css-only/patch.diff' }, repoDir: repo });
  let r = await P.reviseProposal(p.id, { by: 'de-x', note: 'text only', repoDir: repo });
  assert.equal(r.proposal.live.blob, blobs.css, 'kept');
  r = await P.reviseProposal(p.id, { by: 'de-x', note: 'new B', live: { patch: 'fixes/demo/patch.diff' }, repoDir: repo });
  assert.equal(r.proposal.live.blob, blobs.demo, 'replaced');
  assert.ok(existsSync(L.livePatchFile(blobs.demo)));
  r = await P.reviseProposal(p.id, { by: 'de-x', note: 'no B', raw: sample({ title: 'Revise live' }), repoDir: repo });
  assert.equal(r.proposal.live, undefined, 'dropped');
});

test('options: B per option (--option), never top-level; setLive works on a decided proposal without a new revision', async () => {
  const opt = (name) => ({ name, label: `L ${name}`, idea: `I ${name}.`, looksSame: 'Same.', visualDiff: ['None.'], risk: 'Low.', compare: { b: { label: `B ${name}` } } });
  const raw = sample({ title: 'With options', compare: { a: { label: 'Original' } }, options: [opt('full'), opt('pause-only')], recommended: { option: 'full', why: 'Most saved.' }, visualDiff: undefined, looksSame: undefined, risk: undefined });
  assert.match(P.normalize({ ...raw, live: { patch: 'fixes/demo/patch.diff' } }, { repoDir: repo, draft: true }).errors.join('\n'), /live: with options, B goes in each option/);
  assert.match(P.normalize(raw, { repoDir: repo, draft: true, live: { patch: 'fixes/demo/patch.diff' } }).errors.join('\n'), /--live-patch: this proposal has options: say which one/);
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw, draft: true, option: 'full', live: { patch: 'fixes/demo/patch.diff' }, repoDir: repo });
  assert.equal(P.findOption(p, 'full').live.blob, blobs.demo);
  assert.equal(P.findOption(p, 'pause-only').live, undefined);
  setState(p.id, 'accepted');
  await assert.rejects(P.setLive(p.id, { by: 'de-x', patch: 'fixes/css-only/patch.diff', repoDir: repo }), /has options: say which one B is for/);
  await assert.rejects(P.setLive(p.id, { by: 'de-x', option: 'nope', patch: 'fixes/css-only/patch.diff', repoDir: repo }), /no option "nope"/);
  await assert.rejects(P.setLive(p.id, { by: 'de-x', option: 'full', repoDir: repo }), /--patch fixes\/<topic>\/patch\.diff is required/);
  await assert.rejects(P.setLive(p.id, { by: 'de-x', option: 'full', patch: 'fixes/nope/patch.diff', repoDir: repo }), /--patch: .*not committed/);
  await assert.rejects(P.setLive(p.id, { by: '', option: 'full', patch: 'fixes/demo/patch.diff', repoDir: repo }), /--by/);
  const rev = P.get(p.id).rev;
  let q = await P.setLive(p.id, { by: 'de-x', option: 'pause-only', patch: 'fixes/css-only/patch.diff', repoDir: repo });
  assert.equal(P.findOption(q, 'pause-only').live.blob, blobs.css);
  assert.equal(q.rev, rev, 'no new revision');
  assert.equal(q.state, 'accepted', 'the decision stands');
  assert.deepEqual(q.history.at(-1).option, 'pause-only');
  assert.match(q.history.at(-1).note, /^live B: fixes\/css-only\/patch\.diff @ [0-9a-f]{12}$/);
  const view = P.publicView(q);
  assert.deepEqual(view.options.map((o) => o.live && o.live.version), [blobs.demo.slice(0, 12), blobs.css.slice(0, 12)]);
  assert.match(P.showText(q), /option full[\s\S]*live B: fixes\/demo\/patch\.diff/);
  q = await P.setLive(p.id, { by: 'de-x', option: 'full', clear: true, repoDir: repo });
  assert.equal(P.findOption(q, 'full').live, undefined);
  assert.equal(q.history.at(-1).note, 'live B removed');
});

test('setLive on an accepted single-solution proposal: the decision stands, the state stays accepted', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'Accepted one' }), draft: true, repoDir: repo });
  // an accepted proposal as stored by the tool (publish needs screenshots; the state transition is not under test here)
  const f = join(process.env.FW_STATE_DIR, 'console', 'proposals', `${p.id}.json`);
  assert.ok(existsSync(f), f);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.state = 'accepted';
  j.decision = { value: 'accept', at: new Date().toISOString(), rev: j.rev, notes: '' };
  writeFileSync(f, JSON.stringify(j));
  await assert.rejects(P.setLive(p.id, { by: 'de-x', option: 'x', patch: 'fixes/demo/patch.diff', repoDir: repo }), /has no options/);
  const q = await P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', repoDir: repo });
  assert.equal(q.state, 'accepted');
  assert.deepEqual(q.decision, j.decision);
  assert.equal(q.live.blob, blobs.demo);
  j.state = 'withdrawn';
  writeFileSync(f, JSON.stringify({ ...q, state: 'withdrawn' }));
  await assert.rejects(P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', repoDir: repo }), /withdrawn/);
});

test('parseMarkdown: "live:" in the front matter (one solution) and on an option\'s pre-section lines', () => {
  const one = P.parseMarkdown('---\ntitle: T\narea: hero\nlive: fixes/demo/patch.diff\n---\n## What costs\nX.\n');
  assert.deepEqual(one.live, { patch: 'fixes/demo/patch.diff' });
  const opts = P.parseMarkdown('---\ntitle: T\narea: hero\n---\n## Option full: Full\nb: Faces\nlive: fixes/demo/patch.diff\n### The idea\nI.\n## Option lite\nb: Lite\n### The idea\nJ.\n');
  assert.deepEqual(opts.options.map((o) => o.live), [{ patch: 'fixes/demo/patch.diff' }, undefined]);
  assert.equal(opts.options[0].label, 'Full', 'the label stays');
});

test('proposals-page.html "Try it": two 430x932 iframes (A left, B right) from the console\'s local URLs only, one-at-a-time unloads the hidden one, the measuring note, heartbeat', () => {
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="detail"><\/div>\s*<div id="tryit"><\/div>\s*<div id="decide"><\/div>/, 'the panel has its own container between the card and the decision');
  assert.match(html, /el\('iframe', \{ src: url, title: label, width: '430', height: '932',[^}]*sandbox: 'allow-scripts allow-same-origin allow-forms' \}\)/);
  assert.match(html, /var want = one \? \[show\] : \['a', 'b'\];/, 'side by side: both frames; one at a time: only the shown one');
  assert.match(html, /f\.remove\(\)/, 'the hidden frame is removed (its page unloads)');
  assert.match(html, /if \(s === 'a'\) pair\.insertBefore\(f, pair\.firstChild\); else pair\.appendChild\(f\);/, 'A left, B right; a kept frame never moves');
  for (const s of ["'Side by side'", "'One at a time'", "'Show A (original)'", "'Show B (proposal)'", "'A: original'", "'B: proposal'", "'Open both pages'", "'Close the pages'"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("var TRY_NOTE = 'A measurement is running; scrolling here may disturb it';"));
  assert.match(html, /var a = localUrl\(j\.a\), b = localUrl\(j\.b\);/, 'only localhost URLs become a frame');
  assert.match(html, /livePost\('\/api\/live\/' \+ id \+ '\/start', body\)/);
  assert.match(html, /livePost\('\/api\/live\/ping', \{\}\)[\s\S]{0,400}\}, 60000\);/, 'a ping every minute while open');
  assert.match(html, /if \(key === tryKey\) return; \/\/ the frames stay loaded/, 'a refresh does not reload the frames');
});

test('console-server: only the proposals page may frame, and only localhost pages; nothing frames the console', async () => {
  const S = await import('../../tools/lib/console-server.mjs');
  assert.match(S.PROPOSALS_CSP, /(^|; )frame-src http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*;/);
  assert.match(S.PROPOSALS_CSP, /frame-ancestors 'none'/);
  assert.match(S.PROPOSALS_CSP, /default-src 'none'/);
  assert.doesNotMatch(S.PROPOSALS_CSP, /https:|\*\.|192\.168/);
});

// ---- I-093: a live A of its own (the current best build) -------------------------------------------------------
// A live entry may name its own A: {patch, ref?, a?: {patch, ref?}}. A = the baseline + a.patch, read from git and
// stored by blob exactly like B; both on the same base tree; without `a`, A is the plain baseline as before.
let siteBlob = null;
/** A committed patch whose header says it was made on site/ (not site-pretty/): a base-tree mismatch with the others. */
function onSitePatch() {
  if (!siteBlob) siteBlob = commitPatch('on-site', makePatch('on-site', { [PAGE_JS]: fx.prettyFiles[PAGE_JS] + '/* on site */\n' }).replace('# baseline: site-pretty/', '# baseline: site/'));
  return siteBlob;
}

test('I-093 normalize: live.a is resolved from git like B; no `a` leaves the entry unchanged', () => {
  const n = P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } } }), { repoDir: repo, draft: true });
  assert.deepEqual(n.errors, []);
  assert.equal(n.fields.live.blob, blobs.demo);
  const { text, ...a } = n.fields.live.a;
  assert.deepEqual(a, { patch: 'fixes/css-only/patch.diff', ref: 'HEAD', blob: blobs.css, base: 'site-pretty', files: ['_app/immutable/assets/0.fixture.css'] });
  assert.equal(text, readFileSync(join(repo, 'fixes/css-only/patch.diff'), 'utf8'), 'freshly read: its text goes to the store');
  assert.equal(P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff', ref: 'main' } } }), { repoDir: repo, draft: true }).fields.live.a.ref, 'main');
  // the string form of A
  assert.equal(P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff', a: 'fixes/css-only/patch.diff' } }), { repoDir: repo, draft: true }).fields.live.a.blob, blobs.css);
  // no `a`: exactly the old entry, no `a` key
  const plain = P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff' } }), { repoDir: repo, draft: true }).fields.live;
  assert.equal('a' in plain, false);
  assert.deepEqual(Object.keys(plain).sort(), ['base', 'blob', 'files', 'patch', 'ref', 'text']);
  // the CLI's entry (--live-patch … --live-a-patch …)
  const c = P.normalize(sample(), { repoDir: repo, draft: true, live: { patch: 'fixes/demo/patch.diff', ref: 'HEAD', a: { patch: 'fixes/css-only/patch.diff', ref: 'HEAD' } } });
  assert.deepEqual(c.errors, []);
  assert.equal(c.fields.live.a.blob, blobs.css);
});

test('I-093 normalize refuses: a bad A path, an uncommitted A, a stacked A, a bad A ref, A of A, a base-tree mismatch', () => {
  const err = (live, opts = {}) => P.normalize(sample({ live }), { repoDir: repo, draft: true, ...opts }).errors.join('\n');
  for (const bad of ['tools/serve.mjs', 'fixes/../x/patch.diff', '/abs/fixes/demo/patch.diff', 'fixes/Demo/patch.diff']) {
    assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: bad } }), /^live\.a\.patch: must be a fix's committed patch/m, bad);
  }
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/nope/patch.diff' } }), /^live\.a\.patch: .*not committed at HEAD/m);
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff', ref: 'no-such-branch' } }), /^live\.a\.patch: .*not committed at no-such-branch/m);
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff', ref: '--output=x' } }), /^live\.a\.patch: ref: a git ref/m);
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/stacked/patch.diff' } }), /^live\.a\.patch: .*stacked on fixes\/other\/overlay/m);
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: 42 }), /^live\.a: \{patch: "fixes\/<topic>\/patch\.diff", ref\?: "HEAD"\}/m);
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff', a: { patch: 'fixes/demo/patch.diff' } } }), /^live\.a\.a: A has no A of its own/m);
  onSitePatch();
  assert.match(err({ patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/on-site/patch.diff' } }), /^live\.a: A \(fixes\/on-site\/patch\.diff\) was made on site\/, B \(fixes\/demo\/patch\.diff\) on site-pretty\/: both must be on the same base tree/m);
  assert.match(err({ patch: 'fixes/on-site/patch.diff', a: { patch: 'fixes/demo/patch.diff' } }), /^live\.a: A \(fixes\/demo\/patch\.diff\) was made on site-pretty\/, B \(fixes\/on-site\/patch\.diff\) on site\/: both must be on the same base tree/m);
  assert.match(P.normalize(sample(), { repoDir: repo, draft: true, live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/on-site/patch.diff' } } }).errors.join('\n'), /^--live-a-patch: A \(fixes\/on-site\/patch\.diff\) was made on site\//m);
  assert.match(P.normalize(sample(), { repoDir: repo, draft: true, live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/nope/patch.diff' } } }).errors.join('\n'), /^--live-a-patch\.patch: .*not committed/m);
});

test('I-093 post, view, show, revise: A is stored by blob like B, shown with its version, kept by a revision; options carry their own A', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'With a base' }), draft: true, live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } }, repoDir: repo });
  assert.deepEqual(p.live.a, { patch: 'fixes/css-only/patch.diff', ref: 'HEAD', blob: blobs.css, base: 'site-pretty', files: ['_app/immutable/assets/0.fixture.css'] });
  assert.ok(existsSync(L.livePatchFile(blobs.css)), 'A kept in the store');
  const stored = setState(p.id, 'proposed');
  assert.equal(JSON.stringify(stored).includes('PoC css'), false, 'no patch text in the proposal');
  assert.deepEqual(P.publicView(stored).live, { patch: 'fixes/demo/patch.diff', version: blobs.demo.slice(0, 12), files: 2, a: { patch: 'fixes/css-only/patch.diff', version: blobs.css.slice(0, 12), files: 1 } });
  assert.match(P.showText(stored), /live B: fixes\/demo\/patch\.diff @ [0-9a-f]{12} .*\n\s+live A: fixes\/css-only\/patch\.diff @ [0-9a-f]{12} \(1 file\(s\) on site-pretty/);
  const { proposal: d } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'Revise a base' }), draft: true, live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } }, repoDir: repo });
  let r = await P.reviseProposal(d.id, { by: 'de-x', note: 'text only', repoDir: repo });
  assert.equal(r.proposal.live.a.blob, blobs.css, 'a stored A is re-checked against the store and kept');
  r = await P.reviseProposal(d.id, { by: 'de-x', note: 'B only', live: { patch: 'fixes/demo/patch.diff' }, repoDir: repo });
  assert.equal(r.proposal.live.a, undefined, 'a new live entry without A: A is the plain baseline again');
  // a stored A whose blob is not in the store is refused like a stored B
  assert.match(P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff', blob: blobs.demo, a: { patch: 'fixes/css-only/patch.diff', blob: 'e'.repeat(40) } } }), { repoDir: repo, draft: true }).errors.join('\n'), /^live\.a\.blob: not a patch in the console store/m);
  // options[].live.a through normalize
  const opt = (name, live) => ({ name, label: `L ${name}`, idea: `I ${name}.`, looksSame: 'Same.', visualDiff: ['None.'], risk: 'Low.', compare: { b: { label: `B ${name}` } }, live });
  const raw = sample({ title: 'Options with A', compare: { a: { label: 'Best build' } }, options: [opt('full', { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } }), opt('lite', { patch: 'fixes/demo/patch.diff' })], visualDiff: undefined, looksSame: undefined, risk: undefined });
  const n = P.normalize(raw, { repoDir: repo, draft: true });
  assert.deepEqual(n.errors, []);
  assert.equal(n.fields.options[0].live.a.blob, blobs.css);
  assert.equal('a' in n.fields.options[1].live, false);
  assert.match(P.normalize({ ...raw, options: [opt('full', { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/nope/patch.diff' } }), raw.options[1]] }, { repoDir: repo, draft: true }).errors.join('\n'), /^options\[0\]\.live\.a\.patch: .*not committed/m);
});

test('I-093 setLive: an A next to B (base checked, both stored); without A the entry is as before', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'setLive A' }), draft: true, repoDir: repo });
  setState(p.id, 'accepted');
  let q = await P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' }, repoDir: repo });
  assert.equal(q.state, 'accepted', 'the decision stands');
  assert.equal(q.live.blob, blobs.demo);
  assert.equal(q.live.a.blob, blobs.css);
  assert.equal(q.live.a.ref, 'HEAD');
  assert.match(q.history.at(-1).note, /^live B: fixes\/demo\/patch\.diff @ [0-9a-f]{12}; A: fixes\/css-only\/patch\.diff @ [0-9a-f]{12}$/);
  onSitePatch();
  await assert.rejects(P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/on-site/patch.diff' }, repoDir: repo }), /--a-patch: A \(fixes\/on-site\/patch\.diff\) was made on site\/, B \(fixes\/demo\/patch\.diff\) on site-pretty\//);
  await assert.rejects(P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/nope/patch.diff' }, repoDir: repo }), /--a-patch: .*not committed/);
  await assert.rejects(P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/stacked/patch.diff' }, repoDir: repo }), /--a-patch: .*stacked/);
  assert.equal(P.get(p.id).live.a.blob, blobs.css, 'a refused A changes nothing');
  q = await P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', repoDir: repo });
  assert.equal(q.live.a, undefined, 'without A: the plain baseline again');
  assert.match(q.history.at(-1).note, /^live B: fixes\/demo\/patch\.diff @ [0-9a-f]{12}$/);
});

test('I-093 createLiveServers.open: A from the A overlay when given, restarted on a new A blob; B reused; no A = the plain baseline', async () => {
  // a fake serve.mjs: answers every request with its own argv (as JSON), prints MIRROR_URL like the real one
  const dir = tempDir('fw-live-fake-serve-');
  const fake = join(dir, 'fake-serve.mjs');
  writeFileSync(fake, [
    "import http from 'node:http';",
    "const s = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ pid: process.pid, argv: process.argv.slice(2) })); });",
    "s.listen(0, '127.0.0.1', () => console.log('MIRROR_URL=http://localhost:' + s.address().port + '/'));",
    'setInterval(() => { if (process.ppid === 1) process.exit(0); }, 500);', // never outlive the test
  ].join('\n'));
  for (const t of ['demo', 'css-only']) { const r = L.resolveLivePatch({ patch: `fixes/${t}/patch.diff`, repoDir: repo }); L.storeLivePatch(r.blob, r.text); }
  const other = commitPatch('other-a', makePatch('other-a', { [PAGE_CSS]: fx.prettyFiles[PAGE_CSS] + '/* other base */\n' }));
  { const r = L.resolveLivePatch({ patch: 'fixes/other-a/patch.diff', repoDir: repo }); L.storeLivePatch(r.blob, r.text); }
  const site = onSitePatch();
  { const r = L.resolveLivePatch({ patch: 'fixes/on-site/patch.diff', repoDir: repo }); L.storeLivePatch(r.blob, r.text); }
  const srv = L.createLiveServers({ origins: ['http://localhost:5559'], serveScript: fake, idleMs: 600000 });
  const who = async (url) => (await fetch(url)).json();
  const overlayOf = (argv) => { const i = argv.indexOf('--overlay'); return i < 0 ? null : argv[i + 1]; };
  try {
    let u = await srv.open({ blob: blobs.demo, base: 'site-pretty' });
    let a = await who(u.a), b = await who(u.b);
    assert.equal(overlayOf(a.argv), null, 'no A: the plain baseline');
    assert.equal(a.argv[a.argv.indexOf('--root') + 1], 'site-pretty');
    assert.equal(overlayOf(b.argv), L.buildLiveOverlay(blobs.demo));
    const b0 = b.pid, a0 = a.pid;

    u = await srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: blobs.css });
    a = await who(u.a); b = await who(u.b);
    assert.equal(overlayOf(a.argv), L.buildLiveOverlay(blobs.css), 'A from the A overlay');
    assert.equal(a.argv[a.argv.indexOf('--root') + 1], 'site-pretty');
    assert.notEqual(a.pid, a0, 'A restarted for its overlay');
    assert.equal(b.pid, b0, 'B (the same blob) reused');
    for (const k of [a, b]) assert.deepEqual(k.argv.slice(k.argv.indexOf('--vendors=local')), ['--vendors=local', '--port', 'auto', '--host', '127.0.0.1', '--quiet', '--frame-ancestors', 'http://localhost:5559']);
    assert.equal(readFileSync(join(L.buildLiveOverlay(blobs.css), PAGE_CSS.slice(1)), 'utf8'), fx.prettyFiles[PAGE_CSS] + '/* PoC css */\n');
    const a1 = a.pid;

    u = await srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: blobs.css });
    assert.equal((await who(u.a)).pid, a1, 'the same A blob: reused');
    assert.equal((await who(u.b)).pid, b0);

    u = await srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: other });
    a = await who(u.a);
    assert.equal(overlayOf(a.argv), L.buildLiveOverlay(other), 'a new A blob: A serves its overlay');
    assert.notEqual(a.pid, a1, 'and was restarted');
    assert.equal((await who(u.b)).pid, b0, 'B untouched');

    u = await srv.open({ blob: blobs.demo, base: 'site-pretty' });
    a = await who(u.a);
    assert.equal(overlayOf(a.argv), null, 'A back to the plain baseline');
    assert.deepEqual(srv.running().map((k) => k.role).sort(), ['a', 'b'], 'only two children');

    await assert.rejects(srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: site }), /A was made on site\/, B on site-pretty\/: both must be on the same base tree/);
    await assert.rejects(srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: 'nope' }), /bad blob id/);
    await assert.rejects(srv.open({ blob: blobs.demo, base: 'site-pretty', aBlob: 'd'.repeat(40) }), /no stored patch/);
  } finally { await srv.close(); }
  assert.deepEqual(srv.running(), [], 'its children are gone');
});

test('I-093 liveNotCovered: B built on A repeats every line A adds or removes; missing ones are counted per file', () => {
  const diff = (file, hunk) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,3 +1,3 @@\n${hunk}\n`;
  const A = '# fastwork mirror fix: a\n' + diff('x.js', ' keep\n-old line\n+new line\n+++ looks like a header\n ctx') + diff('y.css', ' a\n+b {}\n ');
  assert.deepEqual(L.liveNotCovered(A, A), [], 'A covers itself');
  const B = diff('x.js', ' keep\n-old line\n+new line\n+++ looks like a header\n+more of B\n ctx') + diff('y.css', ' a\n+b {}\n+c {}\n ') + diff('z.js', '+only B');
  assert.deepEqual(L.liveNotCovered(A, B), [], 'a superset: no miss');
  const C = diff('x.js', ' keep\n+new line, changed by B\n ctx');
  assert.deepEqual(L.liveNotCovered(A, C), [{ file: 'x.js', lines: 3 }, { file: 'y.css', lines: 1 }], 'removed line kept, two added lines changed; y.css not touched');
  assert.equal(L.notCoveredWarning([], 'fixes/a/patch.diff', 'fixes/b/patch.diff'), null);
  assert.match(L.notCoveredWarning(L.liveNotCovered(A, C), 'fixes/a/patch.diff', 'fixes/b/patch.diff'), /^B \(fixes\/b\/patch\.diff\) does not carry all of A's \(fixes\/a\/patch\.diff\) changes: x\.js \(3 line\(s\)\), y\.css \(1 line\(s\)\); there B shows A's change undone or changed/);
  // a deleted file: its lines count under its old name
  const D = 'diff --git a/gone.js b/gone.js\ndeleted file mode 100644\n--- a/gone.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-console.log(1)\n';
  assert.deepEqual(L.liveNotCovered(D, ''), [{ file: 'gone.js', lines: 1 }]);
  assert.deepEqual(L.liveNotCovered(D, D), []);
});

test('I-093 normalize and setLive warn (not refuse) when B does not carry all of A\'s changes; no warning when B is built on A', async () => {
  commitPatch('on-css', makePatch('on-css', { [PAGE_CSS]: fx.prettyFiles[PAGE_CSS] + '/* PoC css */\n', [PAGE_JS]: fx.prettyFiles[PAGE_JS] + '/* built on css-only */\n' }));
  let n = P.normalize(sample({ live: { patch: 'fixes/on-css/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } } }), { repoDir: repo, draft: true });
  assert.deepEqual([n.errors, n.warnings], [[], []], 'B built on A');
  n = P.normalize(sample({ live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } } }), { repoDir: repo, draft: true });
  assert.deepEqual(n.errors, [], 'a warning only');
  assert.equal(n.fields.live.a.blob, blobs.css);
  assert.deepEqual(n.warnings, ["live.a: B (fixes/demo/patch.diff) does not carry all of A's (fixes/css-only/patch.diff) changes: _app/immutable/assets/0.fixture.css (1 line(s)); there B shows A's change undone or changed (is B built on A?)"]);
  n = P.normalize(sample(), { repoDir: repo, draft: true, live: { patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' } } });
  assert.match(n.warnings.join('\n'), /^--live-a-patch: B \(fixes\/demo\/patch\.diff\) does not carry all/m);
  const { proposal: p } = await P.postProposal({ by: 'de-x', raw: sample({ title: 'Warn on setLive' }), draft: true, repoDir: repo });
  let q = await P.setLive(p.id, { by: 'lead', patch: 'fixes/demo/patch.diff', a: { patch: 'fixes/css-only/patch.diff' }, repoDir: repo });
  assert.match(P.liveAWarning(q.live), /^B \(fixes\/demo\/patch\.diff\) does not carry all of A's \(fixes\/css-only\/patch\.diff\) changes/);
  q = await P.setLive(p.id, { by: 'lead', patch: 'fixes/on-css/patch.diff', a: { patch: 'fixes/css-only/patch.diff' }, repoDir: repo });
  assert.equal(P.liveAWarning(q.live), null);
  assert.equal(P.liveAWarning({ patch: 'fixes/demo/patch.diff', blob: blobs.demo }), null, 'no A: nothing to carry');
});

test('I-093 proposals-page.html: A is labelled with what it is (compare.a.label, "Original", or "Base: <patch>") and shows its version', () => {
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  assert.match(html, /function aLabelOf\(p, t\)/);
  assert.match(html, /t\.live\.a \? 'Base: ' \+ t\.live\.a\.patch : 'Original'/, 'no label: "Original" without A, "Base: fixes/<topic>/patch.diff" with one');
  assert.ok(html.includes('t.live.a.version'), 'the A version next to B\'s');
  assert.match(html, /var key = t \? p\.id \+ '\|' \+ p\.rev \+ '\|' \+ \(t\.option \|\| ''\) \+ '\|' \+ t\.live\.version \+ '\|' \+ \(t\.live\.a \? t\.live\.a\.version : ''\) : '';/, 'a new A reloads the panel');
});

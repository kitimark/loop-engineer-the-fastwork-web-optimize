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

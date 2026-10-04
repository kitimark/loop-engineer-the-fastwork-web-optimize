// I-126 + user T-086: a proposal's Try-it pages on the iPhone over the same Wi-Fi (tools/lib/live-phone.mjs) and the
// Proposals page's phone links (tools/lib/proposals-page.html): the Try-it card shows each side's phone link with the
// Mac's LAN address resolved at view time (or "not on the Wi-Fi" plus the start command), and the questions-and-answers
// box (T-048) turns a thread's http://lan:<port>/ placeholders into links like the Threads page (I-119).
// Fixture baseline ($FW_MIRROR_HOME), temp repo with the state dir inside its .git, a fake serve.mjs (127.0.0.1 only,
// exits with its parent), fake DOM. No real server on the network, no Chrome. Made-up address 192.0.2.44 (TEST-NET-1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, git } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';
import { checkMarkdown } from './md-cases.mjs';

const FAKE_LAN = '192.0.2.44';
let L, PH, P, fx, repo, fake;
const blobs = {};
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** A fix.mjs-style patch of one file of the fixture's site-pretty, committed in the temp repo; returns its blob. */
function commitPatch(topic, newText) {
  const rel = PAGE_JS.slice(1);
  const gen = tempDir('fw-phone-gen-');
  git(gen, 'init', '-q', '-b', 'main');
  git(gen, 'config', 'commit.gpgsign', 'false');
  const orig = readFileSync(join(fx.pretty, rel));
  mkdirSync(dirname(join(gen, rel)), { recursive: true });
  writeFileSync(join(gen, rel), orig);
  git(gen, 'add', '-A');
  git(gen, 'commit', '-q', '-m', 'base');
  writeFileSync(join(gen, rel), newText);
  const diff = git(gen, 'diff', '--no-color') + '\n';
  const text = `# fastwork mirror fix: ${topic}\n# baseline: site-pretty/ (Prettier-formatted copy of the production mirror); paths are URL paths\n# base-sha256 ${rel} ${sha(orig)}\n${diff}`;
  mkdirSync(join(repo, 'fixes', topic), { recursive: true });
  writeFileSync(join(repo, 'fixes', topic, 'patch.diff'), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `fix ${topic}`);
  const blob = git(repo, 'rev-parse', `HEAD:fixes/${topic}/patch.diff`);
  L.storeLivePatch(blob, text);
  return blob;
}

const started = new Set();
before(async () => {
  const home = tempDir('fw-phone-home-');
  fx = makeFixtureHome(home);
  repo = tempDir('fw-phone-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README'), 'temp\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  process.env.FW_MIRROR_HOME = home;
  process.env.FW_STATE_DIR = join(repo, '.git', 'fastwork-mirror');
  delete process.env.FW_PHONE_SERVE_HOST;
  L = await import('../../tools/lib/live.mjs');
  PH = await import('../../tools/lib/live-phone.mjs');
  P = await import('../../tools/lib/proposal.mjs');
  blobs.b = commitPatch('demo', fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  blobs.a = commitPatch('best', fx.prettyFiles[PAGE_JS] + '/* best build */\n');
  // a fake serve.mjs: writes the --state file like the real one, answers /__mirror/info with its --root and --overlay,
  // listens on 127.0.0.1 only, and exits when its parent (this test) is gone; with $FAKE_SERVE_PRE_I131 its info lacks
  // the `cache` field, like a serve.mjs from before I-131
  fake = join(tempDir('fw-phone-fake-'), 'fake-serve.mjs');
  writeFileSync(fake, [
    "import http from 'node:http'; import { writeFileSync, renameSync } from 'node:fs'; import { resolve } from 'node:path';",
    'const a = process.argv.slice(2); const opt = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };',
    "const root = resolve(process.env.FW_MIRROR_HOME, opt('--root')); const ov = opt('--overlay');",
    "const s = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(q.url === '/__mirror/info' ? { root, overlays: ov ? [{ dir: ov, files: [] }] : [], ...(process.env.FAKE_SERVE_PRE_I131 ? {} : { cache: 'revalidate' }) } : { argv: a, pid: process.pid })); });",
    "s.listen(0, '127.0.0.1', () => { const f = opt('--state'); writeFileSync(f + '.tmp', JSON.stringify({ url: 'http://localhost:' + s.address().port + '/', port: s.address().port, pid: process.pid, root, overlays: ov ? [ov] : [] })); renameSync(f + '.tmp', f); });",
    'const ppid = process.ppid; setInterval(() => { try { process.kill(ppid, 0); } catch { process.exit(0); } }, 300);',
  ].join('\n'));
});
after(() => { for (const pid of started) { try { process.kill(pid, 'SIGKILL'); } catch {} } });

const liveB = () => ({ patch: 'fixes/demo/patch.diff', blob: blobs.b, base: 'site-pretty' });
const liveAB = () => ({ ...liveB(), a: { patch: 'fixes/best/patch.diff', blob: blobs.a, base: 'site-pretty' } });
const who = async (port) => (await fetch(`http://127.0.0.1:${port}/x`)).json();

test('liveBuilds / buildKey / phoneLink / phoneCommand: one build per tree + patch; placeholders only; refused shapes', () => {
  assert.deepEqual(PH.liveBuilds(liveB()), { a: { base: 'site-pretty', blob: null }, b: { base: 'site-pretty', blob: blobs.b } });
  assert.deepEqual(PH.liveBuilds(liveAB()).a, { base: 'site-pretty', blob: blobs.a });
  assert.equal(PH.buildKey({ base: 'site-pretty', blob: null }), 'site-pretty');
  assert.equal(PH.buildKey({ base: 'site', blob: blobs.b }), `site+${blobs.b}`);
  assert.throws(() => PH.buildKey({ base: '../x', blob: null }), /bad base/);
  assert.throws(() => PH.buildKey({ base: 'site', blob: '../../etc' }), /bad blob id/);
  assert.throws(() => PH.liveBuilds({ none: 'Keep the original.' }), /no live pages \(Keep the original\.\)/);
  assert.throws(() => PH.liveBuilds(null), /no live pages/);
  assert.equal(PH.phoneLink(5231), 'http://lan:5231/');
  assert.equal(PH.phoneCommand('PR-017'), 'node tools/console.mjs proposal phone PR-017');
  assert.equal(PH.phoneCommand('PR-017', 'land'), 'node tools/console.mjs proposal phone PR-017 --option land');
});

test('phoneStatus: down without a state file; up only when the pid lives and /__mirror/info names the same build; href resolved now or null', async () => {
  const live = liveB();
  const lan = () => FAKE_LAN;
  assert.deepEqual(await PH.phoneStatus(live, { lan }), { wifi: true, a: { up: false }, b: { up: false } });
  mkdirSync(PH.phoneDir(), { recursive: true });
  const b = PH.liveBuilds(live).b;
  writeFileSync(PH.phoneStateFile(b), JSON.stringify({ port: 5321, pid: process.pid }));
  const right = async () => ({ root: join(fx.home || '/x', 'site-pretty'), overlays: [{ dir: L.liveOverlayDir(blobs.b) }] });
  assert.deepEqual((await PH.phoneStatus(live, { lan, probe: right })).b, { up: true, lan: 'http://lan:5321/', href: `http://${FAKE_LAN}:5321/` });
  // the A side (plain baseline) has no state file: down; the B side with another overlay, another tree, or no answer: down
  assert.deepEqual((await PH.phoneStatus(live, { lan, probe: right })).a, { up: false });
  for (const probe of [async () => ({ root: '/x/site-pretty', overlays: [{ dir: L.liveOverlayDir(blobs.a) }] }), async () => ({ root: '/x/site', overlays: [{ dir: L.liveOverlayDir(blobs.b) }] }), async () => ({ root: '/x/site-pretty', overlays: [] }), async () => null]) {
    assert.deepEqual((await PH.phoneStatus(live, { lan, probe })).b, { up: false });
  }
  // a dead pid is down whatever answers on the port
  writeFileSync(PH.phoneStateFile(b), JSON.stringify({ port: 5321, pid: 2 ** 22 + 12345 }));
  assert.deepEqual((await PH.phoneStatus(live, { lan, probe: right })).b, { up: false });
  // no Wi-Fi address: the placeholder, href null, and a plain note
  writeFileSync(PH.phoneStateFile(b), JSON.stringify({ port: 5321, pid: process.pid }));
  const off = await PH.phoneStatus(live, { lan: () => { throw new Error('no LAN address'); }, probe: right });
  assert.equal(off.wifi, false);
  assert.deepEqual(off.b, { up: true, lan: 'http://lan:5321/', href: null });
  assert.match(off.note, /no Wi-Fi address right now/);
  assert.equal((await PH.phoneStatus(live, { lan: () => 'not-an-ip', probe: right })).b.href, null);
});

test('startPhoneServers: detached serve.mjs per build, plain http on 0.0.0.0, --port fresh (I-131), no framing; reused; stop kills only its own; the registry holds no address', async () => {
  for (const f of readdirSync(PH.phoneDir())) if (f.endsWith('.json')) writeFileSync(join(PH.phoneDir(), f), '{}'); // the previous test's fakes
  const live = liveAB();
  const r = await PH.startPhoneServers(live, { serveScript: fake });
  for (const s of [r.a, r.b]) started.add(s.pid);
  assert.equal(r.a.reused, false);
  assert.equal(r.b.reused, false);
  assert.match(r.a.lan, /^http:\/\/lan:\d+\/$/);
  assert.notEqual(r.a.port, r.b.port);
  const a = await who(r.a.port), b = await who(r.b.port);
  const tailArgs = (argv) => argv.slice(argv.indexOf('--vendors=local'));
  for (const x of [a, b]) {
    assert.deepEqual(tailArgs(x.argv).slice(0, 6), ['--vendors=local', '--port', 'fresh', '--host', '0.0.0.0', '--quiet']);
    assert.ok(!x.argv.includes('--https') && !x.argv.includes('--frame-ancestors'), x.argv.join(' '));
  }
  assert.equal(a.argv[a.argv.indexOf('--overlay') + 1], L.liveOverlayDir(blobs.a), 'A: the baseline + its own patch');
  assert.equal(b.argv[b.argv.indexOf('--overlay') + 1], L.liveOverlayDir(blobs.b), 'B: the baseline + the proposal');
  assert.ok(existsSync(join(L.liveOverlayDir(blobs.b), PAGE_JS.slice(1))), 'the overlay was built from the stored patch');
  const st = await PH.phoneStatus(live, { lan: () => FAKE_LAN });
  assert.deepEqual(st.b, { up: true, lan: r.b.lan, href: r.b.lan.replace('lan', FAKE_LAN) });
  // reused, not restarted
  const again = await PH.startPhoneServers(live, { serveScript: fake });
  assert.deepEqual([again.a.pid, again.a.reused, again.b.pid, again.b.reused], [r.a.pid, true, r.b.pid, true]);
  // a plain-baseline A for another proposal is its own build
  const plain = await PH.startPhoneServers(liveB(), { serveScript: fake });
  started.add(plain.a.pid);
  assert.equal(plain.b.pid, r.b.pid, 'B is the same build: shared');
  assert.equal((await who(plain.a.port)).argv.includes('--overlay'), false, 'A without a patch: the plain baseline');
  const listed = await PH.listPhoneServers();
  assert.deepEqual(listed.filter((x) => x.up).map((x) => x.key).sort(), ['site-pretty', `site-pretty+${blobs.a}`, `site-pretty+${blobs.b}`].sort());
  // nothing in the registry names an address (Hard rule 12): ports, pids and paths only
  for (const f of readdirSync(PH.phoneDir())) assert.doesNotMatch(readFileSync(join(PH.phoneDir(), f), 'utf8'), /\b(?:192\.0\.2\.44|192\.168\.|10\.\d+\.\d+\.\d+)/, f);
  // stop: both builds of this entry go; the other proposal's plain A stays
  const s = await PH.stopPhoneServers(live);
  assert.deepEqual([s.a.stopped, s.b.stopped], [true, true]);
  const after1 = await PH.phoneStatus(live, { lan: () => FAKE_LAN });
  assert.deepEqual([after1.a, after1.b], [{ up: false }, { up: false }]);
  assert.equal((await PH.phoneStatus(liveB(), { lan: () => FAKE_LAN })).a.up, true, 'another build is not touched');
  assert.deepEqual(await PH.stopPhoneServers(live), { a: { stopped: false }, b: { stopped: false } }, 'stopping again: nothing to stop');
  await PH.stopPhoneServers(liveB());
  // a server that dies at start: a plain error with its stderr, no state file left
  const bad = join(dirname(fake), 'bad-serve.mjs');
  writeFileSync(bad, "console.error('BASELINE-MODIFIED: test'); process.exit(3);");
  await assert.rejects(PH.startPhoneServers(liveB(), { serveScript: bad }), /page server for the plain site-pretty exited \(3\): BASELINE-MODIFIED: test/);
  await assert.rejects(PH.startPhoneServers(liveB(), { serveScript: fake, host: '192.0.2.44' }), /0\.0\.0\.0 \(the Wi-Fi\) or 127\.0\.0\.1 \(tests\) only/);
});

test('startPhoneServers (I-131): a running server from before the fix (info without `cache`) is replaced, not reused', async () => {
  for (const f of readdirSync(PH.phoneDir())) if (f.endsWith('.json')) writeFileSync(join(PH.phoneDir(), f), '{}');
  process.env.FAKE_SERVE_PRE_I131 = '1';
  let old;
  try { old = await PH.startPhoneServers(liveB(), { serveScript: fake }); } finally { delete process.env.FAKE_SERVE_PRE_I131; }
  for (const s of [old.a, old.b]) started.add(s.pid);
  const st = await PH.phoneStatus(liveB(), { lan: () => FAKE_LAN });
  assert.equal(st.b.up, true, 'it still serves the build: the page shows it up');
  const now = await PH.startPhoneServers(liveB(), { serveScript: fake });
  for (const s of [now.a, now.b]) started.add(s.pid);
  assert.deepEqual([now.a.reused, now.b.reused], [false, false]);
  assert.notEqual(now.b.pid, old.b.pid);
  for (const pid of [old.a.pid, old.b.pid]) {
    let alive = true;
    for (let i = 0; i < 40 && alive; i++) { try { process.kill(pid, 0); await new Promise((r) => setTimeout(r, 50)); } catch { alive = false; } }
    assert.equal(alive, false, `the pre-I-131 server ${pid} was stopped`);
  }
  const again = await PH.startPhoneServers(liveB(), { serveScript: fake });
  assert.deepEqual([again.b.pid, again.b.reused], [now.b.pid, true], 'a post-I-131 server is reused as before');
  await PH.stopPhoneServers(liveB());
});

// ---- the Proposals page ----------------------------------------------------------------------------------------
function page({ fetchJson } = {}) {
  class N {
    constructor(tag, text) { this.tagName = tag; this.children = []; this.listeners = {}; this._t = text ?? ''; this.attrs = {}; this.className = ''; this.style = {}; this.hidden = false; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children = []; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
    appendChild(c) { this.children.push(c); return c; }
    insertBefore(c) { this.children.unshift(c); return c; }
    replaceChildren(...c) { this._t = ''; this.children = c; }
    querySelector() { return null; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  }
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const ids = {}, calls = [];
  const document = { getElementById: (i) => (ids[i] ||= new N('div')), createElement: (t) => new N(t), createTextNode: (t) => new N('#text', t), querySelector: () => null };
  const fetch = (url, init) => {
    calls.push(url);
    const j = fetchJson ? fetchJson(url, init) : null;
    if (!j) return new Promise(() => {}); // the page's own list and detail loads: never answered here
    return Promise.resolve({ ok: !j.error, status: j.error ? 404 : 200, json: async () => j });
  };
  const api = new Function('window', 'document', 'location', 'fetch', 'setInterval', 'clearInterval', `${js}\nreturn { renderTryIt: renderTryIt, drawPhone: drawPhone, talkThread: talkThread };`)(
    { addEventListener() {} }, document, { hash: '' }, fetch, () => 0, () => {});
  return { ...api, ids, calls, N };
}
const links = (node) => node.all().filter((x) => x.tagName === 'a').map((a) => [a.textContent, a.attrs.href]);

test('I-126 page: talk messages turn http://lan:<port>/ into the resolved link (or text + a note) and localhost links into links, as the Threads page', () => {
  const pg = page();
  const msg = { by: 'de-hero', at: '2026-10-04T07:00:00.000Z', text: 'Phone: http://lan:5231/ and the console http://localhost:5559/proposals, plus http://lan:5232/x' };
  const t = { id: 'T-090', status: 'open', state: 'answered', to: ['de-hero'], messages: [{ ...msg, lan: [{ text: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }, { text: 'http://lan:5232/x', href: `http://${FAKE_LAN}:5232/x` }] }] };
  const box = pg.talkThread(t, { id: 'PR-017' });
  const mt = box.all().find((x) => x.className === 'mt');
  assert.deepEqual(links(mt), [[`http://${FAKE_LAN}:5231/`, `http://${FAKE_LAN}:5231/`], ['http://localhost:5559/proposals', 'http://localhost:5559/proposals'], [`http://${FAKE_LAN}:5232/x`, `http://${FAKE_LAN}:5232/x`]]);
  assert.equal(mt.textContent, `Phone: http://${FAKE_LAN}:5231/ and the console http://localhost:5559/proposals, plus http://${FAKE_LAN}:5232/x`);
  // unresolved (no Wi-Fi address): the placeholder as text and a plain note, no link
  const off = pg.talkThread({ ...t, messages: [{ ...msg, lan: [{ text: 'http://lan:5231/', href: null }, { text: 'http://lan:5232/x', href: null }] }] }, { id: 'PR-017' });
  const mo = off.all().find((x) => x.className === 'mt');
  assert.deepEqual(links(mo), [['http://localhost:5559/proposals', 'http://localhost:5559/proposals']]);
  assert.equal(mo.textContent, 'Phone: http://lan:5231/ (Wi-Fi address not available) and the console http://localhost:5559/proposals, plus http://lan:5232/x (Wi-Fi address not available)');
  // a placeholder the server did not list, and a listed href that is no http(s)://<IPv4>:<port> URL: plain text
  const bare = pg.talkThread({ ...t, messages: [{ ...msg, lan: [{ text: 'http://lan:5231/', href: 'javascript:alert(1)' }] }] }, { id: 'PR-017' });
  assert.deepEqual(links(bare.all().find((x) => x.className === 'mt')), [['http://localhost:5559/proposals', 'http://localhost:5559/proposals']]);
});

test('I-129 page (user T-091): talk messages render pipe tables, "- " bullets and **bold** as the Threads page, as DOM nodes only', async () => {
  const pg = page();
  await checkMarkdown((text) => {
    const lan = text.includes('http://lan:5231/') ? [{ text: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }] : undefined;
    const box = pg.talkThread({ id: 'T-090', status: 'open', state: 'answered', to: ['de-hero'], messages: [{ by: 'de-hero', at: '2026-10-04T07:00:00.000Z', text, lan }] }, { id: 'PR-017' });
    return box.all().find((x) => x.className === 'mt');
  }, { lan: (port) => `http://${FAKE_LAN}:${port}/` });
});

test('T-086 page: each Try-it side shows its phone link (Wi-Fi address now) with Copy; down -> "not on the Wi-Fi" and the start command; no address -> placeholder and a note', () => {
  const pg = page();
  const box = new pg.N('div');
  const labels = { a: 'A: original', b: 'B: proposal (Land it)' };
  const start = 'node tools/console.mjs proposal phone PR-017 --option land';
  pg.drawPhone(box, { wifi: true, a: { up: true, lan: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }, b: { up: true, lan: 'http://lan:5232/', href: `http://${FAKE_LAN}:5232/` }, start }, labels);
  assert.deepEqual(links(box), [[`http://${FAKE_LAN}:5231/`, `http://${FAKE_LAN}:5231/`], [`http://${FAKE_LAN}:5232/`, `http://${FAKE_LAN}:5232/`]]);
  assert.equal(box.all().filter((x) => x.tagName === 'button' && x.textContent === 'Copy').length, 2);
  assert.match(box.textContent, /^On the iPhone \(same Wi-Fi as this Mac\)A: original/);
  assert.match(box.textContent, /Open them in Safari on an iPhone that is on the same Wi-Fi as this Mac/);
  assert.ok(!box.textContent.includes('proposal phone'), 'no command while both are up');
  // B down: A's link stays; B says so; the command that serves them
  const down = new pg.N('div');
  pg.drawPhone(down, { wifi: true, a: { up: true, lan: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }, b: { up: false }, start }, labels);
  assert.deepEqual(links(down).length, 1);
  assert.match(down.textContent, /B: proposal \(Land it\)not on the Wi-Fi now/);
  assert.match(down.textContent, /B is not served on the Wi-Fi yet, so the iPhone can't open it\. To serve them, ask the lead to run this on the Mac/);
  assert.equal(down.all().find((x) => x.tagName === 'code').textContent, start);
  const none = new pg.N('div');
  pg.drawPhone(none, { wifi: true, a: { up: false }, b: { up: false }, start }, labels);
  assert.match(none.textContent, /A and B are not served on the Wi-Fi yet, so the iPhone can't open them\./);
  assert.equal(links(none).length, 0);
  // up but no Wi-Fi address: the placeholder as text, no link, and the server's note
  const nowifi = new pg.N('div');
  pg.drawPhone(nowifi, { wifi: false, note: 'This Mac has no Wi-Fi address right now (is the Wi-Fi on?), so the iPhone cannot reach it.', a: { up: true, lan: 'http://lan:5231/', href: null }, b: { up: true, lan: 'http://lan:5232/', href: 'javascript:alert(1)' }, start }, labels);
  assert.equal(links(nowifi).length, 0, 'never a link without a resolved http://<IPv4>:<port>/ address');
  assert.match(nowifi.textContent, /http:\/\/lan:5231\/\(Wi-Fi address not available\)/);
  assert.match(nowifi.textContent, /no Wi-Fi address right now/);
  // checking, and a failed check
  const wait = new pg.N('div'); pg.drawPhone(wait, undefined, labels);
  assert.match(wait.textContent, /Checking whether these pages are on the Wi-Fi/);
  const err = new pg.N('div'); pg.drawPhone(err, { error: 'PR-017 option land has no live pages' }, labels);
  assert.match(err.textContent, /Could not check the phone links right now: PR-017 option land has no live pages/);
});

test('T-086 page: the Try-it card asks GET /api/live/<id>/phone (with the option) and shows the answer under the frames', async () => {
  const start = 'node tools/console.mjs proposal phone PR-900 --option land';
  const pg = page({ fetchJson: (url) => (url.startsWith('/api/live/') ? { wifi: true, a: { up: false }, b: { up: true, lan: 'http://lan:5232/', href: `http://${FAKE_LAN}:5232/` }, start } : null) });
  const p = { id: 'PR-900', rev: 1, title: 'x', by: 'de-x', state: 'proposed', options: [{ name: 'land', label: 'Land it', live: { patch: 'fixes/demo/patch.diff', version: 'abcdef012345', files: 1 } }], compare: { a: { label: 'Original' } } };
  pg.renderTryIt(p);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(pg.calls.filter((u) => u.startsWith('/api/live/')), ['/api/live/PR-900/phone?option=land'], 'a GET, never a start');
  const card = pg.ids.tryit;
  assert.match(card.textContent, /The frames below run on this Mac only \(localhost\)/);
  assert.match(card.textContent, /On the iPhone \(same Wi-Fi as this Mac\)A: originalnot on the Wi-Fi nowB: proposal \(Land it\)http:\/\/192\.0\.2\.44:5232\/Copy/);
  assert.equal(card.all().find((x) => x.tagName === 'code').textContent, start);
});

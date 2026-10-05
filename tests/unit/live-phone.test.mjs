// I-126 + user T-086: a proposal's Try-it pages on the iPhone over the same Wi-Fi (tools/lib/live-phone.mjs) and the
// Proposals page's phone links (tools/lib/proposals-page.html): the Try-it card shows each side's phone link with the
// Mac's LAN address resolved at view time (or "not on the Wi-Fi" plus the start command), and the questions-and-answers
// box (T-048) turns a thread's http://lan:<port>/ placeholders into links like the Threads page (I-119).
// Fixture baseline ($FW_MIRROR_HOME), temp repo with the state dir inside its .git, a fake serve.mjs (127.0.0.1 only,
// exits with its parent), fake DOM. No real server on the network, no Chrome. Made-up address 192.0.2.44 (TEST-NET-1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { tempDir, git, request } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';
import { checkMarkdown } from './md-cases.mjs';
import { ARTIFACT_OK, ARTIFACT_BAD } from './artifact-cases.mjs';

const FAKE_LAN = '192.0.2.44';
let L, PH, P, T, fx, repo;
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
  L = await import('../../tools/lib/live.mjs');
  PH = await import('../../tools/lib/live-phone.mjs');
  T = await import('../../tools/lib/tryit.mjs');
  P = await import('../../tools/lib/proposal.mjs');
  blobs.b = commitPatch('demo', fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  blobs.a = commitPatch('best', fx.prettyFiles[PAGE_JS] + '/* best build */\n');
  // I-157: the machine's own Try-it host may already listen on the first Try-it port (6400; pid 90540 did): hold the
  // lowest free one here, on every address like that host, so every run meets that case, live host or not
  const { portBusy } = await import('../../tools/lib/port-probe.mjs');
  for (let p = T.TRYIT_PORTS.from; p <= T.TRYIT_PORTS.to && !blocker; p++) {
    if (await portBusy(p)) continue;
    const s = net.createServer();
    const ok = await new Promise((done) => { s.once('error', () => done(false)); s.listen({ port: p, host: '0.0.0.0', exclusive: true }, () => done(true)); });
    if (ok) blocker = s;
  }
  assert.ok(blocker, 'a free Try-it port to hold');
});
let blocker = null;
after(() => blocker?.close());
// I-157: the real probe (never a stub that calls every port free): the build gets a port nobody listens on
const freePort = async (p) => (await import('../../tools/lib/port-probe.mjs')).portBusy(p);

const liveB = () => ({ patch: 'fixes/demo/patch.diff', blob: blobs.b, base: 'site-pretty' });
const liveAB = () => ({ ...liveB(), a: { patch: 'fixes/best/patch.diff', blob: blobs.a, base: 'site-pretty' } });

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

/** T-106: this process plays the Try-it host (127.0.0.1, the real mirror handler): host.json + status.json like runHost. */
let host = null, hostTimer = null;
function startHost() {
  host = T.createTryitHost({ host: '127.0.0.1', mount: T.mountBuild, retryMs: 0, onStatus: (builds) => writeFileSync(T.statusFile(), JSON.stringify({ pid: process.pid, builds })) });
  mkdirSync(T.tryitDir(), { recursive: true });
  writeFileSync(T.hostFile(), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  host.poll();
  hostTimer = setInterval(() => host.poll(), 30);
}
function stopHost() { clearInterval(hostTimer); host?.close(); host = null; rmSync(T.hostFile(), { force: true }); rmSync(T.statusFile(), { force: true }); }
const here = async () => ({ pid: process.pid, started: false }); // the host is this process: nothing is spawned

test('phoneStatus: down without a registry entry; registered but not served -> stopped + its link; up only when the running host listens and the entry is that build; href resolved now or null', async () => {
  const live = liveB();
  const lan = () => FAKE_LAN;
  assert.deepEqual(await PH.phoneStatus(live, { lan }), { wifi: true, a: { up: false }, b: { up: false } });
  const b = PH.liveBuilds(live).b;
  const { entry } = await T.addBuild({ name: PH.buildKey(b), overlays: [L.buildLiveOverlay(blobs.b)], busy: freePort });
  assert.deepEqual((await PH.phoneStatus(live, { lan })).b, { up: false, stopped: true, lan: `http://lan:${entry.port}/` }, 'no host running');
  startHost();
  try {
    await T.waitServed(entry.name, { timeoutMs: 3000 });
    assert.deepEqual((await PH.phoneStatus(live, { lan })).b, { up: true, lan: `http://lan:${entry.port}/`, href: `http://${FAKE_LAN}:${entry.port}/` });
    assert.deepEqual((await PH.phoneStatus(live, { lan })).a, { up: false }, 'the plain-baseline A is not registered');
    assert.equal(host.status()[entry.name].mounted, false, 'a status check loads no files');
    // the entry serving another overlay is not this build
    await T.addBuild({ name: PH.buildKey(b), overlays: [L.buildLiveOverlay(blobs.a)], busy: freePort });
    assert.deepEqual((await PH.phoneStatus(live, { lan })).b, { up: false });
    await T.addBuild({ name: PH.buildKey(b), overlays: [L.buildLiveOverlay(blobs.b)], busy: freePort });
    // no Wi-Fi address: the placeholder, href null, and a plain note
    await T.waitServed(entry.name, { timeoutMs: 3000 });
    const off = await PH.phoneStatus(live, { lan: () => { throw new Error('no LAN address'); } });
    assert.equal(off.wifi, false);
    assert.deepEqual(off.b, { up: true, lan: `http://lan:${entry.port}/`, href: null });
    assert.match(off.note, /no Wi-Fi address right now/);
    assert.equal((await PH.phoneStatus(live, { lan: () => 'not-an-ip' })).b.href, null);
  } finally { stopHost(); T.removeBuild(entry.name); }
});

test('startPhoneServers (T-106): each build registered with the ONE Try-it host, own port, --vendors=local, no-store; reused; stop leaves a Start page; the registry holds no address', async () => {
  startHost();
  try {
    const live = liveAB();
    const r = await PH.startPhoneServers(live, { ensure: here });
    assert.deepEqual([r.a.reused, r.b.reused, r.a.pid, r.b.pid], [false, false, process.pid, process.pid], 'one process serves both');
    assert.match(r.a.lan, /^http:\/\/lan:\d+\/$/);
    assert.notEqual(r.a.port, r.b.port);
    const info = async (port) => JSON.parse((await request(`http://127.0.0.1:${port}/__mirror/info`)).text);
    const ia = await info(r.a.port), ib = await info(r.b.port);
    assert.deepEqual(ia.overlays.map((o) => o.dir), [L.liveOverlayDir(blobs.a)], 'A: the baseline + its own patch');
    assert.deepEqual(ib.overlays.map((o) => o.dir), [L.liveOverlayDir(blobs.b)], 'B: the baseline + the proposal');
    assert.deepEqual([ib.vendors, ib.https, ib.cache], ['local', false, 'no-store']);
    const js = await request(`http://127.0.0.1:${r.b.port}${PAGE_JS}`);
    assert.match(js.text, /PoC: demo/);
    assert.equal(js.headers['cache-control'], 'no-store');
    assert.ok(existsSync(join(L.liveOverlayDir(blobs.b), PAGE_JS.slice(1))), 'the overlay was built from the stored patch');
    const st = await PH.phoneStatus(live, { lan: () => FAKE_LAN });
    assert.deepEqual(st.b, { up: true, lan: r.b.lan, href: r.b.lan.replace('lan', FAKE_LAN) });
    // reused, same ports
    const again = await PH.startPhoneServers(live, { ensure: here });
    assert.deepEqual([again.a.port, again.a.reused, again.b.port, again.b.reused], [r.a.port, true, r.b.port, true]);
    // a plain-baseline A for another proposal is its own build; B is shared
    const plain = await PH.startPhoneServers(liveB(), { ensure: here });
    assert.equal(plain.b.port, r.b.port, 'B is the same build: shared');
    assert.deepEqual((await info(plain.a.port)).overlays, [], 'A without a patch: the plain baseline');
    const listed = await PH.listPhoneServers();
    assert.deepEqual(listed.filter((x) => x.up).map((x) => x.key).sort(), ['site-pretty', `site-pretty+${blobs.a}`, `site-pretty+${blobs.b}`].sort());
    for (const f of readdirSync(join(T.tryitDir(), 'builds'))) assert.doesNotMatch(readFileSync(join(T.tryitDir(), 'builds', f), 'utf8'), /\b(?:192\.0\.2\.44|192\.168\.|10\.\d+\.\d+\.\d+)/, f);
    // stop: both builds of this entry; their ports answer with a Start page; the other proposal's plain A stays
    const s = await PH.stopPhoneServers(live);
    assert.deepEqual([s.a.stopped, s.b.stopped], [true, true]);
    const after1 = await PH.phoneStatus(live, { lan: () => FAKE_LAN });
    assert.deepEqual([after1.a, after1.b], [{ up: false, stopped: true, lan: r.a.lan }, { up: false, stopped: true, lan: r.b.lan }]);
    host.poll(); // the host sees the registry change at its next poll (1 s in runHost)
    const sp = await request(`http://127.0.0.1:${r.b.port}/`);
    assert.equal(sp.status, 503);
    assert.match(sp.text, />Start<\/button>/);
    assert.equal((await PH.phoneStatus(liveB(), { lan: () => FAKE_LAN })).a.up, true, 'another build is not touched');
    assert.deepEqual(await PH.stopPhoneServers(live), { a: { stopped: false }, b: { stopped: false } }, 'stopping again: nothing to stop');
    assert.deepEqual((await PH.listPhoneServers()).filter((x) => x.stopped).map((x) => x.key).sort(), [`site-pretty+${blobs.a}`, `site-pretty+${blobs.b}`].sort());
    // start again: the same ports serve again
    const back = await PH.startPhoneServers(live, { ensure: here });
    assert.deepEqual([back.a.port, back.b.port], [r.a.port, r.b.port]);
    assert.equal((await request(`http://127.0.0.1:${r.b.port}${PAGE_JS}`)).status, 200);
    for (const e of T.listBuilds()) T.removeBuild(e.name);
  } finally { stopHost(); }
  // no host and none can start: a plain error
  await assert.rejects(PH.startPhoneServers(liveB(), { ensure: async () => { throw new Error('the Try-it host exited (3): BASELINE-MODIFIED: test'); } }), /Try-it host exited \(3\): BASELINE-MODIFIED: test/);
  for (const e of T.listBuilds()) T.removeBuild(e.name);
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

test('I-191 page: talk messages make a claude.ai artifact link clickable (new tab), as the Threads page; look-alikes stay text', () => {
  const pg = page();
  const [u, c] = [ARTIFACT_OK[0], ARTIFACT_OK[4]];
  const text = `Review ${u}, code ${c}. Not ${ARTIFACT_BAD.join(' ')} but http://localhost:5559/proposals`;
  const box = pg.talkThread({ id: 'T-090', status: 'open', state: 'answered', to: ['de-hero'], messages: [{ by: 'de-hero', at: '2026-10-04T07:00:00.000Z', text }] }, { id: 'PR-017' });
  const mt = box.all().find((x) => x.className === 'mt');
  assert.deepEqual(mt.all().filter((x) => x.tagName === 'a').map((a) => [a.textContent, a.attrs.href, a.attrs.target, a.attrs.rel]),
    [[u, u, '_blank', 'noreferrer'], [c, c, '_blank', 'noreferrer'], ['http://localhost:5559/proposals', 'http://localhost:5559/proposals', undefined, 'noreferrer']]);
  assert.equal(mt.textContent, text);
});

test('I-129 page (user T-091): talk messages render pipe tables, "- " bullets and **bold** as the Threads page, as DOM nodes only', async () => {
  const pg = page();
  await checkMarkdown((text) => {
    const lan = text.includes('http://lan:5231/') ? [{ text: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }] : undefined;
    const box = pg.talkThread({ id: 'T-090', status: 'open', state: 'answered', to: ['de-hero'], messages: [{ by: 'de-hero', at: '2026-10-04T07:00:00.000Z', text, lan }] }, { id: 'PR-017' });
    return box.all().find((x) => x.className === 'mt');
  }, { lan: (port) => `http://${FAKE_LAN}:${port}/` });
});

test('T-086 page: each Try-it side shows its phone link (Wi-Fi address now) with Copy; down -> "not served now" and the start command (T-106: a Start button when the page can start them); no address -> placeholder and a note', async () => {
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
  assert.match(down.textContent, /B is not served now\. Press Start to serve it on the Wi-Fi \(a few seconds\)\./);
  assert.equal(down.all().find((x) => x.tagName === 'code').textContent, start, 'no start function: the command');
  const none = new pg.N('div');
  pg.drawPhone(none, { wifi: true, a: { up: false }, b: { up: false, stopped: true, lan: 'http://lan:5232/' }, start }, labels);
  assert.match(none.textContent, /A and B are not served now\. Press Start to serve them on the Wi-Fi/);
  assert.match(none.textContent, /B: proposal \(Land it\)not served now/);
  assert.equal(links(none).length, 0);
  // T-106: with a start function, a Start button (no command); a click serves them and redraws with the answer
  let clicks = 0;
  const up = { wifi: true, a: { up: true, lan: 'http://lan:5231/', href: `http://${FAKE_LAN}:5231/` }, b: { up: true, lan: 'http://lan:5232/', href: `http://${FAKE_LAN}:5232/` }, start };
  const withStart = { ...labels, start: () => { clicks++; return Promise.resolve(up); } };
  const btn = new pg.N('div');
  pg.drawPhone(btn, { wifi: true, a: { up: false }, b: { up: false }, start, state: 'proposed' }, withStart);
  assert.equal(btn.all().filter((x) => x.tagName === 'code').length, 0);
  const sb = btn.all().find((x) => x.tagName === 'button' && x.textContent === 'Start');
  assert.ok(sb, 'a Start button');
  assert.equal(clicks, 0, 'drawing starts nothing');
  sb.listeners.click[0]();
  assert.equal(sb.textContent, 'Starting…');
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  assert.equal(clicks, 1);
  assert.equal(links(btn).length, 2, 'redrawn with the served links');
  // a decided proposal: archived, still startable; a withdrawn one: archived, no Start (the command only)
  const arch = new pg.N('div');
  pg.drawPhone(arch, { wifi: true, a: { up: false }, b: { up: false }, start, state: 'accepted' }, withStart);
  assert.match(arch.textContent, /Archived: this proposal is decided, so its pages are not served now\. Press Start/);
  assert.ok(arch.all().find((x) => x.tagName === 'button' && x.textContent === 'Start'));
  const wd = new pg.N('div');
  pg.drawPhone(wd, { wifi: true, a: { up: false }, b: { up: false }, start, state: 'withdrawn' }, withStart);
  assert.match(wd.textContent, /Archived/);
  assert.ok(!wd.all().find((x) => x.tagName === 'button' && x.textContent === 'Start'));
  assert.equal(wd.all().find((x) => x.tagName === 'code').textContent, start);
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
  assert.ok(card.all().find((x) => x.tagName === 'button' && x.textContent === 'Start'), 'T-106: the card can start them');
  assert.equal(pg.calls.filter((u) => u.includes('/phone/start')).length, 0, 'rendering starts nothing');
});

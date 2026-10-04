// The user console's notifications and shared top bar (ts-console-nav, user request 2026-10-02): userTurn, the
// /api/waiting model (waitingView: sanitized titles only), the new-step / reminder rule (diffSteps, the same table
// run against the server's copy and the page's copy in console-nav.js), the macOS notifier for `serve --notify`
// (an argv array for execFile, no shell, a fake executor: no real osascript here), the menu on both pages and the
// shared page assets (no external URL, permission asked only on a click, storage in try/catch).
// Every test uses its own $FW_STATE_DIR. Example URLs use reserved .invalid hosts or a fake LAN address.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const C = await import('../../tools/lib/console.mjs');
const N = await import('../../tools/lib/console-notify.mjs');
const S = await import('../../tools/lib/console-server.mjs');
const NAV_JS = readFileSync(new URL('../../tools/lib/console-nav.js', import.meta.url), 'utf8');
const NAV_CSS = readFileSync(new URL('../../tools/lib/console-nav.css', import.meta.url), 'utf8');
/** The page's copy of the rule: console-nav.js run without a DOM exposes only its pure core. */
const pageCore = new Function('window', `${NAV_JS}\nreturn window.ConsoleNotify;`)({});

let state;
beforeEach(() => { state = tempDir('fw-console-notify-'); process.env.FW_STATE_DIR = state; });

const A = 'http://page-a.invalid:5401/';
const B = 'http://page-b.invalid:5402/';
const LAN = 'http://192.168.77.12:5497/';

test('userTurn: the user can act (Start, Done, swipe, pick); not while an agent loads a gated part or starts a recorder', async () => {
  const q = await C.post({ by: 'a', kind: 'question', title: 'Q' });
  assert.equal(N.userTurn(C.get(q.id)), true, 'a pending question');
  const p = await C.post({ by: 'r', kind: 'swipe-pair', title: 'Pair', url: A, url2: B });
  assert.equal(N.userTurn(C.get(p.id)), false, 'gated part 1 still waiting for the runner');
  await C.ack(p.id, { by: 'r', part: 1, state: 'loading' });
  assert.equal(N.userTurn(C.get(p.id)), false, 'loading');
  await C.ack(p.id, { by: 'r', part: 1, state: 'ready' });
  assert.equal(N.userTurn(C.get(p.id)), true, 'ready: Start');
  await C.start(p.id, { part: 1 });
  assert.equal(N.userTurn(C.get(p.id)), false, 'started, recorder starting: "don\'t swipe yet"');
  await C.ack(p.id, { by: 'r', part: 1, state: 'recording' });
  assert.equal(N.userTurn(C.get(p.id)), true, 'recording: swipe, then Done');
  await C.done(p.id, { part: 1 });
  await C.ack(p.id, { by: 'r', part: 2, state: 'ready' }); await C.start(p.id, { part: 2 });
  await C.ack(p.id, { by: 'r', part: 2, state: 'recording' }); await C.done(p.id, { part: 2 });
  assert.equal(N.userTurn(C.get(p.id)), true, 'the pick');
  await C.answer(p.id, { value: '1' });
  assert.equal(N.userTurn(C.get(p.id)), false, 'answered');
  const act = await C.post({ by: 'a', kind: 'action', title: 'Do', url: A });
  await C.start(act.id, {});
  assert.equal(N.userTurn(C.get(act.id)), true, 'started without a recorder: Done is the user\'s');
});

test('waitingView (GET /api/waiting): open steps only, count, ids and sanitized one-line titles; never a URL, instructions or meta', async () => {
  await C.post({ by: 'iphone-runner', kind: 'action', title: `Open ${LAN} on the phone\nnow`, url: LAN, instructions: `Load ${LAN}`, meta: { key: 'secret-key' } });
  const p = await C.post({ by: 'r', kind: 'swipe-pair', title: 'Pair 3', url: A, url2: B });
  const done = await C.post({ by: 'a', kind: 'question', title: 'Old' });
  await C.answer(done.id, { value: 'yes' });
  const v = N.waitingView(undefined, { remindMin: 5 });
  assert.equal(v.count, 2);
  assert.equal(v.yourTurn, 1, 'the action is the user\'s turn, the gated pair not yet');
  assert.equal(v.remindMin, 5);
  assert.deepEqual(v.steps.map((s) => [s.id, s.title, s.status, s.yourTurn]), [['C-001', 'Open <link> on the phone now', 'pending', true], [p.id, 'Pair 3', 'pending', false]]);
  assert.deepEqual(Object.keys(v.steps[0]).sort(), ['id', 'queuedAt', 'status', 'title', 'updatedAt', 'yourTurn']);
  const text = JSON.stringify(v);
  for (const bad of ['192.168', 'http', 'secret-key', 'Load ', 'invalid']) assert.ok(!text.includes(bad), `${bad} leaked: ${text}`);
});

// [name, steps per call (each {id, yourTurn, idleMin}), remindMin, expected events per call]
const CASES = [
  ['the first call seeds silently', [[{ id: 'C-001' }, { id: 'C-002' }]], 3, [[]]],
  ['a new id after seeding is new; a known one is not', [[{ id: 'C-001' }], [{ id: 'C-001' }, { id: 'C-002' }], [{ id: 'C-001' }, { id: 'C-002' }]], 3, [[], ['new C-002'], []]],
  ['a step that leaves and comes back (reopen) is new again', [[{ id: 'C-001' }], [], [{ id: 'C-001' }]], 3, [[], [], ['new C-001']]],
  ['one reminder per step after N idle minutes, on the user\'s turn', [[], [{ id: 'C-001', idleMin: 0 }], [{ id: 'C-001', idleMin: 2 }], [{ id: 'C-001', idleMin: 3 }], [{ id: 'C-001', idleMin: 9 }]], 3, [[], ['new C-001'], [], ['remind C-001'], []]],
  ['no reminder while it is the agent\'s turn', [[], [{ id: 'C-001', yourTurn: false }], [{ id: 'C-001', yourTurn: false, idleMin: 10 }]], 3, [[], ['new C-001'], []]],
  ['remind 0 = never', [[], [{ id: 'C-001' }], [{ id: 'C-001', idleMin: 60 }]], 0, [[], ['new C-001'], []]],
  ['a step already overdue when the page opens is not reminded', [[{ id: 'C-001', idleMin: 30 }], [{ id: 'C-001', idleMin: 31 }]], 3, [[], []]],
  ['a step seen fresh at seeding is reminded later', [[{ id: 'C-001', idleMin: 1 }], [{ id: 'C-001', idleMin: 4 }]], 3, [[], ['remind C-001']]],
];
const NOW = Date.parse('2026-10-02T12:00:00Z');
function runCase(diff, calls, remindMin) {
  let st = null;
  return calls.map((steps) => {
    const r = diff(st, steps.map((s) => ({ id: s.id, title: `t ${s.id}`, yourTurn: s.yourTurn !== false, updatedAt: new Date(NOW - (s.idleMin || 0) * 60000).toISOString() })), NOW, remindMin * 60000);
    st = JSON.parse(JSON.stringify(r.state)); // the page keeps it in localStorage as JSON
    return r.events.map((e) => `${e.kind} ${e.step.id}`);
  });
}

test('diffSteps: the new-step / reminder rule, the same table for the server (console-notify.mjs) and the page (console-nav.js)', () => {
  for (const [name, calls, remindMin, want] of CASES) {
    assert.deepEqual(runCase(N.diffSteps, calls, remindMin), want, `server: ${name}`);
    assert.deepEqual(runCase(pageCore.diffSteps, calls, remindMin), want, `page: ${name}`);
  }
  const before = { seeded: true, open: { 'C-001': { r: false } } };
  const frozen = JSON.stringify(before);
  N.diffSteps(before, [{ id: 'C-002', yourTurn: true, updatedAt: new Date(NOW).toISOString() }], NOW, 1);
  assert.equal(JSON.stringify(before), frozen, 'inputs are not mutated');
  assert.equal(pageCore.titleWith('User console', 2), '(2) User console');
  assert.equal(pageCore.titleWith('Fix progress', 0), 'Fix progress');
});

test('--notify: the osascript argv is constant AppleScript plus the id and sanitized title as plain arguments (no shell, no splicing)', () => {
  const hostile = `Pair "3"\n" & (do shell script "rm -rf ~") & " $(touch /tmp/x) \`id\` ${LAN} me@example.invalid`;
  const t = N.notificationText({ id: 'C-007', title: hostile });
  assert.equal(t.title, 'Console: new step');
  assert.ok(t.body.startsWith('C-007: '), 'the body starts with the id (never with "-")');
  assert.ok(!/[\n\r]/.test(t.body), 'one line');
  for (const bad of ['192.168', 'http', 'example.invalid']) assert.ok(!t.body.includes(bad), `${bad} leaked: ${t.body}`);
  assert.equal(N.notificationText({ id: 'C-7; rm', title: 'x' }).body, 'C-?: x', 'an odd id is not passed on');
  assert.equal(N.notificationText({ id: 'C-001', title: 'x' }, 'remind').title, 'Console: still waiting for you');
  const argv = N.osascriptArgv(t);
  assert.deepEqual(argv.slice(0, 6), ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']);
  assert.deepEqual(argv.slice(6), [t.title, t.body]);
  for (const line of argv.slice(0, 6)) assert.ok(!line.includes('Pair'), 'no step text in the script source');

  const calls = [];
  const fakeExec = (cmd, args, opts, cb) => { calls.push({ cmd, args, opts }); cb(null); };
  const notify = N.createNotifier({ exec: fakeExec, platform: 'darwin', log: '' });
  const got = notify({ id: 'C-007', title: hostile });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, '/usr/bin/osascript', 'an absolute path, run by execFile');
  assert.ok(Array.isArray(calls[0].args));
  assert.deepEqual(calls[0].args, got);
  assert.equal(calls[0].opts.shell, undefined, 'never a shell');
  assert.equal(N.createNotifier({ exec: () => assert.fail('no osascript off macOS'), platform: 'linux', log: '' })({ id: 'C-001', title: 'x' }), null);
  const errs = [];
  N.createNotifier({ exec: (c, a, o, cb) => cb(new Error('denied')), platform: 'darwin', log: '', onError: (e) => errs.push(e.message) })({ id: 'C-001', title: 'x' });
  assert.deepEqual(errs, ['denied']);
  const log = join(state, 'notify.log');
  N.createNotifier({ exec: () => assert.fail('the log replaces osascript'), platform: 'darwin', log })({ id: 'C-002', title: 'y' }, 'remind');
  assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), { cmd: '/usr/bin/osascript', argv: N.osascriptArgv({ title: 'Console: still waiting for you', body: 'C-002: y' }) });
});

test('stepWatcher (serve --notify): silent at start, one notification per new step, one reminder', () => {
  const seen = [];
  const w = N.stepWatcher({ notify: (s, k) => seen.push(`${k} ${s.id}`), remindMin: 3 });
  const st = (id, idleMin = 0) => ({ id, title: id, yourTurn: true, updatedAt: new Date(NOW - idleMin * 60000).toISOString() });
  w([st('C-001')], NOW);
  w([st('C-001'), st('C-002')], NOW);
  w([st('C-001', 4), st('C-002')], NOW);
  w([st('C-001', 5), st('C-002')], NOW);
  assert.deepEqual(seen, ['new C-002', 'remind C-001']);
});

test('menuHtml: the same top bar on every page, plain links, the current page highlighted, the badge on "Your steps"', () => {
  const steps = S.menuHtml('steps'), prog = S.menuHtml('progress'), stat = S.menuHtml('status'), thr = S.menuHtml('threads'), prop = S.menuHtml('proposals');
  const build = S.menuHtml('build'); // I-061
  const agents = S.menuHtml('agents'); // I-118
  for (const m of [steps, prog, stat, thr, prop, build, agents]) {
    assert.match(m, /<nav class="menu" aria-label="Console pages">/);
    assert.match(m, /href="\/">Your steps<span class="badge" data-badge hidden>0<\/span><\/a>/);
    assert.match(m, /href="\/agents">Agents<\/a>/);
    assert.match(m, /href="\/progress">Progress<\/a>/);
    assert.match(m, /href="\/build">Best build<\/a>/);
    assert.match(m, /href="\/status">Status<\/a>/);
    assert.match(m, /href="\/threads">Threads<span class="badge" data-thread-badge hidden>0<\/span><\/a>/);
    assert.match(m, /href="\/proposals">Proposals<span class="badge" data-badge-proposals hidden>0<\/span><\/a>/);
    for (const id of ['nav-sound', 'nav-desktop', 'nav-remind', 'nav-test', 'nav-theme', 'nav-banner']) assert.ok(m.includes(`id="${id}"`), id);
    assert.equal((m.match(/aria-current="page"/g) || []).length, 1);
  }
  assert.match(steps, /class="mbtn on" aria-current="page" title="[^"]*" href="\/"/);
  assert.match(prog, /class="mbtn on" aria-current="page" title="[^"]*" href="\/progress"/);
  assert.match(stat, /class="mbtn on" aria-current="page" title="[^"]*" href="\/status"/);
  assert.match(thr, /class="mbtn on" aria-current="page" title="[^"]*" href="\/threads"/);
  assert.equal(thr.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'the threads page: the same bar');
  assert.equal(stat.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'the status page: the same bar');
  assert.match(prop, /class="mbtn on" aria-current="page" title="[^"]*" href="\/proposals"/);
  assert.equal(prop.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'the proposals page: the same bar');
  assert.match(build, /class="mbtn on" aria-current="page" title="[^"]*" href="\/build"/);
  assert.equal(build.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'the best-build page: the same bar');
  assert.equal(steps.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'identical apart from the highlight');
  assert.match(agents, /class="mbtn on" aria-current="page" title="[^"]*" href="\/agents"/);
  assert.equal(agents.replace(' on" aria-current="page', ''), prog.replace(' on" aria-current="page', ''), 'the agents page: the same bar');
  for (const f of ['console-page.html', 'progress-page.html', 'status-page.html', 'threads-page.html', 'proposals-page.html', 'agents-page.html']) {
    const html = readFileSync(new URL(`../../tools/lib/${f}`, import.meta.url), 'utf8');
    assert.equal(html.split('<!--console-menu-->').length, 2, `${f}: one menu slot`);
    assert.ok(html.includes('<script src="/console-nav.js"></script>') && html.includes('<link rel="stylesheet" href="/console-nav.css">'), f);
  }
});

test('console-nav.js / .css: parse, load nothing from outside, ask notification permission only on a click, storage in try/catch', () => {
  assert.doesNotThrow(() => new Function(NAV_JS));
  for (const [name, src] of [['js', NAV_JS], ['css', NAV_CSS]]) {
    assert.ok(!/https?:\/\//i.test(src), `${name}: no URL at all`);
    assert.ok(!/@import|url\(|importScripts|new Audio\(|\.mp3|\.wav/i.test(src), `${name}: no external resource or sound file`);
  }
  const perm = NAV_JS.split('requestPermission').length - 1;
  assert.equal(perm, 1, 'one call site');
  const at = NAV_JS.indexOf('requestPermission');
  const handler = NAV_JS.lastIndexOf("db.addEventListener('click'", at);
  assert.ok(handler > 0 && at - handler < 400, 'requestPermission only inside the button\'s click handler');
  assert.equal((NAV_JS.match(/localStorage\./g) || []).length, 2, 'only get() and set() touch localStorage');
  assert.match(NAV_JS, /function get\(k\) \{ try \{ return localStorage\.getItem\(k\); \} catch/);
  assert.match(NAV_JS, /function set\(k, v\) \{ try \{ localStorage\.setItem\(k, v\); \} catch/);
  assert.match(NAV_JS, /createOscillator/, 'the chime is Web Audio');
  assert.match(NAV_JS, /new EventSource\('\/api\/events'\)/);
  assert.match(NAV_JS, /fetch\('\/api\/waiting'/, 'polling fallback');
});

// ---- console-nav.js against a small fake DOM: what the user sees and hears, without a browser ----
class El {
  constructor(tag, id) { Object.assign(this, { tagName: tag, id, children: [], attrs: {}, listeners: {}, hidden: false, textContent: '', className: '', options: [], value: '', disabled: false, open: false }); this.classList = { add() {}, remove() {} }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
  click() { for (const f of this.listeners.click || []) f({ target: this }); }
  replaceChildren(...c) { this.children = c; if (this.tagName === 'select') this.options = [...c]; }
  append(...c) { this.children.push(...c); }
  appendChild(c) { this.children.push(c); if (this.tagName === 'select') this.options.push(c); return c; }
  contains() { return false; }
  querySelector() { return null; }
  get offsetWidth() { return 0; }
}
/** One console tab: console-nav.js run on fake DOM, storage, Notification, Web Audio and EventSource. */
function fakePage({ path = '/progress', store = new Map(), blocked = false } = {}) {
  const els = {};
  for (const i of ['nav-theme', 'nav-sound', 'nav-desktop', 'nav-test', 'nav-alerts-sum', 'nav-banner']) els[i] = new El('div', i);
  els['nav-alerts'] = new El('details', 'nav-alerts');
  els['nav-remind'] = new El('select', 'nav-remind');
  els['nav-banner'].hidden = true;
  const badges = [new El('span'), new El('span')];
  const document = {
    title: 'Fix progress', documentElement: new El('html'),
    getElementById: (i) => els[i] || null,
    querySelectorAll: (sel) => (sel === '[data-badge]' ? badges : []),
    querySelector: () => null,
    createElement: (t) => new El(t),
    addEventListener: () => {},
    hasFocus: () => false,
  };
  const localStorage = blocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const notes = [], perms = [], oscillators = [], sources = [];
  function Notification(title, opts) { notes.push({ title, body: opts.body }); this.close = () => {}; }
  Notification.permission = 'default';
  Notification.requestPermission = () => { perms.push(1); Notification.permission = 'granted'; return Promise.resolve('granted'); };
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { const o = { frequency: {}, connect() {}, start() {}, stop() {} }; oscillators.push(o); return o; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  class EventSource {
    constructor(u) { this.url = u; this.l = {}; sources.push(this); }
    addEventListener(e, f) { this.l[e] = f; }
    emit(v) { this.l.waiting({ data: JSON.stringify(v) }); }
  }
  const location = { pathname: path, hash: '', href: path };
  const window = { AudioContext, Notification, EventSource, focus() {} };
  const noop = () => 0;
  new Function('window', 'document', 'localStorage', 'location', 'history', 'navigator', 'Notification', 'fetch', 'setInterval', 'setTimeout', 'EventSource', NAV_JS)(
    window, document, localStorage, location, { replaceState() {} }, {}, Notification, () => Promise.reject(new Error('no fetch')), noop, noop, EventSource);
  return { document, els, badges, notes, perms, oscillators, location, store, es: sources[0] };
}
const T0 = Date.now();
const wv = (steps, nowMs = T0) => ({ now: new Date(nowMs).toISOString(), count: steps.length, remindMin: 3,
  steps: steps.map(([id, title, yourTurn = true]) => ({ id, title, status: 'pending', yourTurn, updatedAt: new Date(T0).toISOString() })) });

test('console-nav.js in a fake page: badge, tab title, banner, chime, desktop notification after the click, mute, one reminder', async () => {
  const p = fakePage();
  assert.equal(p.es.url, '/api/events');
  assert.equal(p.perms.length, 0, 'no permission prompt on load');
  assert.equal(p.els['nav-desktop'].textContent, 'Enable desktop notifications');
  p.es.emit(wv([['C-001', 'First']]));
  assert.deepEqual(p.badges.map((b) => [b.textContent, b.hidden]), [['1', false], ['1', false]]);
  assert.equal(p.document.title, '(1) Fix progress');
  assert.equal(p.els['nav-banner'].hidden, true, 'what was there on open is not announced');
  assert.equal(p.oscillators.length, 0);

  p.es.emit(wv([['C-001', 'First'], ['C-002', 'Pair 3']]));
  assert.equal(p.document.title, '(2) Fix progress');
  assert.equal(p.els['nav-banner'].hidden, false);
  assert.equal(p.els['nav-banner'].children[0].textContent, 'New step: Pair 3');
  assert.equal(p.els['nav-banner'].children[1].textContent, 'Open C-002');
  assert.equal(p.oscillators.length, 2, 'a two-note chime');
  assert.equal(p.notes.length, 0, 'no desktop notification before the user allows it');

  p.els['nav-desktop'].click();
  await new Promise((r) => setImmediate(r));
  assert.equal(p.perms.length, 1);
  assert.match(p.els['nav-desktop'].textContent, /^Desktop notifications: on/);
  p.es.emit(wv([['C-001', 'First'], ['C-002', 'Pair 3'], ['C-003', 'Finger test']]));
  assert.deepEqual(p.notes, [{ title: 'New step: C-003', body: 'Finger test' }]);

  p.els['nav-sound'].click();
  assert.equal(p.store.get('console-sound'), 'off');
  assert.equal(p.els['nav-sound'].textContent, 'Sound: muted');
  const osc = p.oscillators.length;
  p.es.emit(wv([['C-001', 'First'], ['C-002', 'Pair 3'], ['C-003', 'Finger test'], ['C-004', 'Q']]));
  assert.equal(p.oscillators.length, osc, 'muted: no chime');
  assert.equal(p.notes.length, 2, 'the desktop notification still comes');

  // 4 min later, nothing changed (the server's 10 s heartbeats): one reminder (banner + desktop), only for steps on
  // the user's turn
  const later = T0 + 4 * 60000;
  for (let t = T0 + 10000; t <= later; t += 10000) p.es.emit(wv([['C-001', 'First'], ['C-002', 'Pair 3', false], ['C-003', 'Finger test'], ['C-004', 'Q']], t));
  assert.equal(p.els['nav-banner'].children[0].textContent, 'Still waiting for you: First (+2 more)');
  assert.deepEqual(p.notes.at(-1), { title: 'Still waiting for you: C-001', body: 'First' });
  const n = p.notes.length;
  p.es.emit(wv([['C-001', 'First'], ['C-003', 'Finger test'], ['C-004', 'Q']], later + 20000));
  assert.equal(p.notes.length, n, 'reminded once only');

  p.els['nav-banner'].children[1].click(); // Open C-001 from the Progress page: go to the steps page
  assert.equal(p.location.href, '/#C-001');
  p.es.emit(wv([], later + 25000));
  assert.deepEqual(p.badges.map((b) => b.hidden), [true, true]);
  assert.equal(p.document.title, 'Fix progress');
  assert.equal(p.els['nav-banner'].hidden, true, 'the banner goes when its steps do');

  assert.ok(p.els['nav-remind'].options.some((o) => o.textContent === 'never'));
  p.els['nav-remind'].value = '10';
  p.els['nav-remind'].listeners.change[0]();
  assert.equal(p.store.get('console-remind'), '10');
});

test('console-nav.js: blocked storage still shows badge and banner; two tabs of one browser chime once, both show the banner', () => {
  const p = fakePage({ blocked: true });
  p.es.emit(wv([['C-001', 'A']]));
  p.es.emit(wv([['C-001', 'A'], ['C-002', 'B']]));
  assert.equal(p.badges[0].textContent, '2');
  assert.equal(p.els['nav-banner'].hidden, false);
  assert.equal(p.els['nav-sound'].textContent, 'Sound: on');

  const store = new Map();
  const a = fakePage({ store }), b = fakePage({ store });
  for (const t of [a, b]) t.es.emit(wv([['C-001', 'A']]));
  for (const t of [a, b]) t.es.emit(wv([['C-001', 'A'], ['C-002', 'B']]));
  assert.equal(a.oscillators.length + b.oscillators.length, 2, 'one chime between the two tabs');
  assert.deepEqual([a.els['nav-banner'].hidden, b.els['nav-banner'].hidden], [false, false]);
});

test('createFeed (/api/events): the current state at once, a new step pushed, heartbeats, a closed client dropped, a notifier driven', async () => {
  const { EventEmitter } = await import('node:events');
  const res = Object.assign(new EventEmitter(), { chunks: [], writeHead(code, h) { this.code = code; this.h = h; }, write(c) { this.chunks.push(c); }, end() { this.ended = true; } });
  const fired = [];
  const feed = S.createFeed({ intervalMs: 20, heartbeatMs: 120, remindMin: 0, notify: (s, k) => fired.push(`${k} ${s.id}`) });
  try {
    feed.subscribe(new EventEmitter(), res);
    assert.equal(res.code, 200);
    assert.match(res.h['content-type'], /^text\/event-stream/);
    assert.equal(feed.subscribers(), 1);
    const events = () => res.chunks.filter((c) => c.startsWith('event: waiting\n')).map((c) => JSON.parse(c.split('\ndata: ')[1]));
    assert.equal(events()[0].count, 0);
    await C.post({ by: 'a', kind: 'question', title: `Ready? ${LAN}` });
    await new Promise((r) => setTimeout(r, 150));
    const withStep = events().filter((e) => e.count === 1);
    assert.ok(withStep.length >= 1, 'pushed');
    assert.equal(withStep[0].steps[0].title, 'Ready? <link>');
    assert.deepEqual(fired, ['new C-001']);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(events().length >= 3, `heartbeats: ${events().length}`);
    res.emit('close');
    assert.equal(feed.subscribers(), 0, 'a closed client is dropped');
  } finally { feed.close(); }
});

test('console-nav.js: proposals (ts-proposals): a new one shows a banner and chimes once, Open goes to /proposals#id, the title counts it, no reminder', () => {
  const wvp = (steps, props, nowMs = T0) => ({ ...wv(steps, nowMs), proposals: { count: props.length, items: props.map(([id, title]) => ({ id, title, status: 'proposed', yourTurn: true, updatedAt: new Date(T0).toISOString() })) } });
  const p = fakePage();
  p.es.emit(wvp([], [['PR-001', 'Old']]));
  assert.equal(p.els['nav-banner'].hidden, true, 'what was there on open is not announced');
  assert.equal(p.document.title, '(1) Fix progress');
  assert.equal(p.oscillators.length, 0);
  p.es.emit(wvp([['C-001', 'A step']], [['PR-001', 'Old'], ['PR-002', 'Glow as an image']]));
  assert.equal(p.document.title, '(3) Fix progress', 'steps + proposals');
  assert.equal(p.els['nav-banner'].hidden, false);
  assert.equal(p.els['nav-banner'].children[0].textContent, 'New proposal: Glow as an image');
  assert.equal(p.els['nav-banner'].children[1].textContent, 'Open PR-002');
  const osc = p.oscillators.length;
  assert.ok(osc >= 2, 'chimed');
  for (let t = T0 + 10000; t <= T0 + 20 * 60000; t += 60000) p.es.emit(wvp([['C-001', 'A step']], [['PR-001', 'Old'], ['PR-002', 'Glow as an image']], t));
  assert.ok(p.oscillators.length <= osc + 1, 'no proposal reminder (at most the step\'s one quiet reminder)');
  p.es.emit(wvp([['C-001', 'A step']], [['PR-001', 'Old'], ['PR-002', 'Glow as an image'], ['PR-003', 'Blur as an image']], T0 + 21 * 60000));
  p.els['nav-banner'].children[1].click();
  assert.equal(p.location.href, '/proposals#PR-003');
  p.es.emit(wvp([], [], T0 + 22 * 60000));
  assert.equal(p.document.title, 'Fix progress');
});

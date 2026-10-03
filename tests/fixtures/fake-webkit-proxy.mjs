#!/usr/bin/env node
// A fake ios_webkit_debug_proxy + iPhone Safari for the default test suite, so tools/iphone.mjs and
// tools/lib/wip.mjs run end to end without the shared phone. One tab; `GET /json` lists it, its
// webSocketDebuggerUrl speaks just enough of the WebKit Inspector Protocol (Target.targetCreated,
// Target.sendMessageToTarget -> Runtime.evaluate, Target.dispatchMessageFromTarget) for iphone.mjs `open`.
//
// Navigation (`location.href = "<url>"`) behaves like a phone that does NOT trust the mirror's
// self-signed certificate (incident I-003): the fake loads <url> with Node's default TLS verification;
// if that fails, the tab stays on <url> but shows Safari's certificate warning page (title "This
// Connection Is Not Private", a same-origin request to /__mirror/info fails).
//
//   node tests/fixtures/fake-webkit-proxy.mjs --port=0 --url=<initial tab url>
//   prints FAKE_WIP_PORT=<port> once listening. Env: FAKE_WIP_LOG=<file> appends one JSON line per
//   evaluated expression / navigation.
//
// Gesture runs (tools/iphone.mjs gesture): `--page` adds a page model, `--wda-port=0` also (and starts an
// in-process fake WebDriverAgent, tests/fixtures/fake-wda.mjs, printing FAKE_WDA_PORT=<port>) whose strokes
// play into that page in real time: touchstart/touchmove/touchend events, scrollY following the finger
// (clamped to 0..maxY), momentum after a fast lift-off (tau 450 ms), the toolbar collapsing (innerHeight
// 775 -> 815) on the way down and expanding on the way up. Other expressions run in a node:vm window with
// rAF (every 16 ms), passive/non-passive listeners, performance.now()/mark, scrollTo, location.reload()
// (a new document: new vm window, new target id). Options: --doc-height=N (default 6035: maxY 5220
// collapsed), --prevent-at-end (a page touchmove handler that calls preventDefault at the end, like the
// morph's scroll-jack), --foreground=<bundleId> for the fake WDA, --width=N (innerWidth, default 430; 932 is
// landscape), --hide-after-strokes=N (document.visibilityState turns "hidden" after N strokes, as when another
// app comes to the front), --jitter-at-end (near maxY the page runs a 60 px sawtooth, 1 px per 10 ms, and never
// comes to rest, like a pin fight that does not stop).
// Every listed target carries `appId` ("PID:<pid>", as ios_webkit_debug_proxy lists it); Safari's tab is PID:4242, the
// pid the fake WDA reports for Safari. --blank-view (incident I-037) also lists, BEFORE Safari's tab, another app's
// background about:blank web view (PID:1304) whose websocket opens but never answers a command, like the real one.
// --extra-tabs-after-reload (review-t1a N1): from the first reload on, Safari also lists a second tab on the same host
// ("second copy", so a reconnect by host is AMBIGUOUS) and an unrelated private tab ("Private Inbox", another LAN host).
// --one-client-per-page (incident I-038): like ios_webkit_debug_proxy, a page has one inspector client; a newer
// connection takes it, and the older one's next command is answered with a close (1001 "Page 9222/1 claimed by
// local") and never run (iwdp_start_devtools / iwdp_on_frame).
// safari-restart: the fake WDA's terminate / launch / url (or GET /__fake/app?kind=terminate|launch|url&url=U, what the
// fake devicectl and simctl call) quit and restart the fake Safari: --launch-ms=N (default 300), --launch-never,
// --launch-blank (it restores no page; a URL opened in it shows one),
// --fail-app=terminate|launch|url (the fake WDA fails that call).
// --stale-tab=<url> (incident I-050): a second Safari tab (PID:4242, page/5) restored from an earlier session, listed
// BEFORE the live one as the Simulator's Safari did; a dead server's page: its websocket opens and has a page target,
// but it never answers a command (logged as {staleConnected}); not listed while Safari is not running.
// --parked-twin (incident I-077, the phone after a park, OBSERVED 2026-10-02 23:26Z): while Safari's tab shows about:blank,
// /json also lists, BEFORE it, a second about:blank view of Safari's own app (page/6) that answers commands but says
// document.visibilityState "hidden" (Safari's tab says "visible" unless hidden); a navigation sent to it is logged as
// {twinNavigate: url} and changes nothing. --new-pid-on-launch: every Safari start gets a new pid (PID:4243, 4244, ...),
// as on the phone (OBSERVED: one new pid per safari-restart / devicectl restart).
// --resources=<file> (incident I-052): the page's Resource Timing entries (a JSON array, read at each request) for the
// expression of tools/lib/sim.mjs RESOURCES_JS, answered as {origin, entries}.
// WebKit Timeline (incident I-079; F-047, research/architecture/safari-inspector-probing.md finding 1), per inspector
// connection: Page.enable (re)starts that connection's stopwatch; Timeline.start emits Timeline.recordingStarted, then a
// RenderingFrame record every 16 ms, and a TimeStamp record {data: {message: name}} for each performance.mark(name)
// (the page clock converted to the stopwatch, like didPerformanceMark), all with startTime/endTime in stopwatch seconds
// (0 while no Page.enable was sent: the never-started stopwatch); Timeline.stop emits Timeline.recordingStopped. Each
// command is logged as {tl: method, gen, docOffsetMs} (docOffsetMs: Timeline ms minus page ms on this document, for
// Page.enable) so tests can check the sequence after every reload and the sync pair.
import './lifeline.mjs'; // I-072: registered for the test's teardown; ends with the test process
import http from 'node:http';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { startFakeWda } from './fake-wda.mjs';

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const LOG = process.env.FAKE_WIP_LOG;
const log = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...o }) + '\n'); };

const tab = { url: arg('url') || 'about:blank', title: 'start', warning: false, gen: 1, alive: true };
const stale = arg('stale-tab') ? { url: arg('stale-tab'), title: 'restored' } : null; // I-050
async function load(url) {
  if (url === 'about:blank') { Object.assign(tab, { url, title: '', warning: false }); tab.gen++; log({ navigated: url, warning: false, title: '' }); return; } // iphone.mjs park (I-047)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); // default TLS verification, like an untrusting phone
    const html = await r.text();
    Object.assign(tab, { url, title: (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1], warning: false });
  } catch (e) {
    const tls = /certificate|self.signed|CERT|DEPTH_ZERO/i.test(String(e.cause?.code || e.cause?.message || e.message));
    Object.assign(tab, { url, title: tls ? 'This Connection Is Not Private' : 'Failed to open page', warning: true });
  }
  tab.gen++;
  log({ navigated: url, warning: tab.warning, title: tab.title });
}

async function evaluate(expr) {
  const nav = expr.match(/location\.href = ("[^"]*")/);
  if (nav) { const u = JSON.parse(nav[1]); log({ navigate: u }); setTimeout(() => load(u), 50); return 'ok'; }
  if (expr.includes('/__mirror/info')) {
    let mirror = 0;
    if (!tab.warning) { try { mirror = (await fetch(new URL('/__mirror/info', tab.url), { signal: AbortSignal.timeout(5000) })).status; } catch {} }
    return { href: tab.url, title: tab.title, mirror };
  }
  if (arg('resources') && expr.includes("getEntriesByType('resource')")) { // I-052: sim.mjs fetched's Resource Timing read
    return JSON.stringify({ origin: new URL(tab.url).origin, entries: JSON.parse(readFileSync(arg('resources'), 'utf8')) });
  }
  if (expr === 'location.href') return tab.url;
  if (expr === 'document.readyState') return 'complete';
  if (expr === 'document.title') return tab.title;
  if (expr === 'document.visibilityState') return hidden ? 'hidden' : 'visible'; // I-077
  if (expr === '1') return 1;
  if (doc) {
    try { const v = vm.runInContext(expr, doc.ctx); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch (e) { return { __thrown: String(e) }; }
  }
  return undefined;
}

// ---- page model (--page / --wda-port) ------------------------------------------------------------------
const PAGE = process.argv.includes('--page') || arg('wda-port') !== null;
const DOC_H = Number(arg('doc-height') || 6035);
const WIDTH = Number(arg('width') || 430);
const BLANK_VIEW = process.argv.includes('--blank-view');
const EXTRA_TABS = process.argv.includes('--extra-tabs-after-reload');
const ONE_CLIENT = process.argv.includes('--one-client-per-page');
const PARKED_TWIN = process.argv.includes('--parked-twin'); // I-077
const NEW_PID = process.argv.includes('--new-pid-on-launch');
let safariPid = 4242;
function twinEvaluate(expr) { // I-077: Safari's other blank view: answers, hidden, never navigates
  const nav = expr.match(/location\.href = ("[^"]*")/);
  if (nav) { log({ twinNavigate: JSON.parse(nav[1]) }); return 'ok'; }
  log({ twinEvaluate: expr.slice(0, 80) });
  if (expr === 'document.visibilityState') return 'hidden';
  if (expr === 'location.href') return 'about:blank';
  if (expr === '1') return 1;
  return undefined;
}
const owner = new Map(); // page path -> the socket that holds the page
const HIDE_AFTER = arg('hide-after-strokes') === null ? Infinity : Number(arg('hide-after-strokes'));
let hidden = false, strokesPlayed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let doc = null, momentum = null;
function newDocument() {
  const t0 = performance.now();
  const listeners = [];
  let raf = [];
  const win = {
    scrollY: 0, innerWidth: WIDTH, innerHeight: 775,
    document: { documentElement: { scrollHeight: DOC_H }, readyState: 'complete', get title() { return tab.title; }, get visibilityState() { return hidden ? 'hidden' : 'visible'; } },
    location: { get href() { return tab.url; }, reload: () => { setTimeout(() => { tab.gen++; doc = newDocument(); log({ reloaded: tab.url, gen: tab.gen }); }, 100); } },
    performance: { now: () => performance.now() - t0, mark: (name) => { const startTime = performance.now() - t0; for (const f of markHooks) f(String(name), t0 + startTime); return { name: String(name), startTime }; } },
    requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; },
    addEventListener: (type, fn, o) => listeners.push({ type, fn, passive: typeof o === 'object' && !!o.passive, capture: typeof o === 'object' ? !!o.capture : !!o }),
    scrollTo: (x, y) => { win.scrollY = Math.max(0, Math.min(maxY(win), typeof x === 'object' ? x.top : y)); },
    setTimeout, clearTimeout, JSON, Math, Promise,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const timer = setInterval(() => { const q = raf; raf = []; const t = performance.now() - t0; q.forEach((cb) => { try { cb(t); } catch {} }); if (doc?.win !== win) clearInterval(timer); }, 16);
  timer.unref?.();
  if (process.argv.includes('--prevent-at-end')) listeners.push({ type: 'touchmove', fn: (e) => { if (win.scrollY >= maxY(win) - 2) e.preventDefault(); }, passive: false, capture: false });
  return { win, ctx, listeners, t0 };
}
const markHooks = new Set(); // I-079: the recording connections' TimeStamp emitters
const maxY = (w) => DOC_H - w.innerHeight;
function dispatch(type, { touches, clientY }) {
  const e = { type, cancelable: type !== 'touchcancel', defaultPrevented: false, touches: { length: touches }, changedTouches: [{ clientY }], timeStamp: doc.win.performance.now() };
  const ls = doc.listeners.filter((l) => l.type === type);
  for (const l of [...ls.filter((x) => x.capture), ...ls.filter((x) => !x.capture)]) {
    e.preventDefault = l.passive ? () => {} : () => { if (e.cancelable) e.defaultPrevented = true; };
    try { l.fn(e); } catch {}
  }
  return e;
}
function scrollBy(d) {
  const w = doc.win;
  w.scrollY = Math.max(0, Math.min(maxY(w), w.scrollY + d));
  if (d > 0 && w.scrollY > 100) w.innerHeight = 815; else if (d < 0) w.innerHeight = 775;
}
function startMomentum(v) { // v: px/ms of scroll
  momentum = { v };
  const m = momentum;
  const tick = () => {
    if (momentum !== m || !doc) return;
    scrollBy(m.v * 16); m.v *= Math.exp(-16 / 450);
    const w = doc.win;
    if (Math.abs(m.v) < 0.02 || w.scrollY <= 0 || w.scrollY >= maxY(w)) { momentum = null; return; }
    setTimeout(tick, 16);
  };
  setTimeout(tick, 16);
}
// Like XCTest (incident I-042, OBSERVED on the phone and the Simulator): the finger moves linearly from one path point
// to the next over the pointerMove's duration, and touches are sampled along the way, one touchmove per
// TOUCH_SAMPLE_MS (the phone's 16-17 ms for multi-move paths; --touch-sample-ms=N), the last at the point itself. A
// move shorter than one sample gives one touchmove, as the compiler-v1 8 ms moves did.
const TOUCH_SAMPLE_MS = Number(arg('touch-sample-ms') || 16);
async function playStroke(body) {
  let y = 0, down = false, lastV = 0;
  for (const a of body.actions[0].actions) {
    if (a.type === 'pointerMove') {
      const from = y, d = a.duration || 0;
      const n = down && d > 0 ? Math.max(1, Math.round(d / TOUCH_SAMPLE_MS)) : 1;
      for (let i = 1; i <= n; i++) {
        if (d) await sleep(d / n);
        const ny = from + ((a.y - from) * i) / n, step = ny - y; y = ny;
        if (down) { const e = dispatch('touchmove', { touches: 1, clientY: y }); if (!e.defaultPrevented) scrollBy(-step); lastV = d ? -step / (d / n) : 0; }
      }
    } else if (a.type === 'pointerDown') { down = true; momentum = null; dispatch('touchstart', { touches: 1, clientY: y }); }
    else if (a.type === 'pause') { await sleep(a.duration || 0); if (down) lastV = 0; }
    else if (a.type === 'pointerUp') { down = false; dispatch('touchend', { touches: 0, clientY: y }); if (Math.abs(lastV) > 0.3) startMomentum(lastV); }
  }
  if (++strokesPlayed >= HIDE_AFTER) { hidden = true; log({ hidden: true, after: strokesPlayed }); }
}
if (PAGE) doc = newDocument();

// ---- Safari quit / start (safari-restart): from the fake WDA's onApp, or GET /__fake/app?kind=..&url=.. (fake devicectl / simctl)
// A quit Safari lists no tab; a start lists its restored tab again after --launch-ms (default 300; --launch-never: never),
// as a new document (new target id); a URL opened in it loads like a navigation.
const LAUNCH_MS = Number(arg('launch-ms') || 300);
const LAUNCH_NEVER = process.argv.includes('--launch-never');
const LAUNCH_BLANK = process.argv.includes('--launch-blank'); // Safari starts but restores no page: only a URL opened in it lists one
let pendingUrl = null, launching = false;
function onApp(kind, body = {}) {
  log({ app: kind, url: body.url ?? null });
  if (kind === 'terminate') { tab.alive = false; launching = false; pendingUrl = null; return; }
  if (kind === 'url') {
    if (tab.alive) { setTimeout(() => load(body.url), 50); return; }
    pendingUrl = body.url;
    if (launching) return;
  }
  if (kind === 'launch' && tab.alive) return; // already running: like activate
  launching = true; // a launch, or a URL that starts Safari
  if (LAUNCH_NEVER) return;
  setTimeout(async () => {
    launching = false;
    if (pendingUrl) { const u = pendingUrl; pendingUrl = null; await load(u); } else if (LAUNCH_BLANK) return;
    tab.alive = true; tab.gen++; if (PAGE) doc = newDocument();
    if (NEW_PID) safariPid++; // I-077: a new process, a new appId
  }, LAUNCH_MS);
}
if (PAGE && process.argv.includes('--jitter-at-end')) { // a sawtooth: 1 px per 10 ms over maxY-59..maxY, never still for 100 ms
  setInterval(() => { const w = doc?.win; if (!w || momentum) return; if (w.scrollY >= maxY(w) - 60) w.scrollY = maxY(w) - (Math.floor(Date.now() / 10) % 60); }, 8).unref?.();
}

// ---- minimal RFC 6455 server (text frames, close, ping) -----------------------------------------
function frame(str) {
  const p = Buffer.from(str);
  let h;
  if (p.length < 126) h = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); }
  return Buffer.concat([h, p]);
}
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/__fake/app?')) {
    const q = new URL(req.url, 'http://x').searchParams;
    onApp(q.get('kind'), { url: q.get('url') });
    return res.end('ok');
  }
  if (req.url === '/json') {
    res.setHeader('content-type', 'application/json');
    if (!tab.alive) return res.end(JSON.stringify(BLANK_VIEW ? [{ url: 'about:blank', title: '', webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/2`, appId: 'PID:1304' }] : []));
    const ws = (n) => `ws://127.0.0.1:${server.address().port}/devtools/page/${n}`;
    const safari = { url: tab.url, title: tab.title, webSocketDebuggerUrl: ws(1), appId: `PID:${safariPid}` };
    const twin = PARKED_TWIN && tab.url === 'about:blank' ? [{ url: 'about:blank', title: '', webSocketDebuggerUrl: ws(6), appId: `PID:${safariPid}` }] : []; // I-077
    const extra = EXTRA_TABS && tab.gen > 1 ? [{ url: `${tab.url}copy/`, title: 'second copy', webSocketDebuggerUrl: ws(3), appId: 'PID:4242' },
      { url: 'http://192.168.0.9:8080/private/inbox', title: 'Private Inbox', webSocketDebuggerUrl: ws(4), appId: 'PID:4242' }] : [];
    const restored = stale ? [{ url: stale.url, title: stale.title, webSocketDebuggerUrl: ws(5), appId: 'PID:4242' }] : [];
    return res.end(JSON.stringify(BLANK_VIEW ? [{ url: 'about:blank', title: '', webSocketDebuggerUrl: ws(2), appId: 'PID:1304' }, ...restored, ...twin, safari, ...extra] : [...restored, ...twin, safari, ...extra]));
  }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (req.url === '/devtools/page/2') { log({ blankViewConnected: true }); sock.on('data', () => {}); sock.on('error', () => {}); return; } // the background view: silent
  const send = (o) => { if (!sock.destroyed) sock.write(frame(JSON.stringify(o))); };
  if (stale && req.url === '/devtools/page/5') { // the restored tab: a page target that never answers a command (I-050)
    log({ staleConnected: true });
    send({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'stale-1', type: 'page' } } });
    sock.on('data', () => {}); sock.on('error', () => {}); return;
  }
  if (owner.has(req.url)) log({ pageTaken: req.url });
  owner.set(req.url, sock);
  sock.on('close', () => { if (owner.get(req.url) === sock) owner.delete(req.url); });
  const isTwin = req.url === '/devtools/page/6'; // I-077
  const targetId = isTwin ? 'twin-1' : `page-${tab.gen}`; // target ids change on every navigation, like iOS
  send({ method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page' } } });
  // I-079: this connection's inspector agents (Page stopwatch, Timeline recording)
  const tl = { origin: null, timer: null, hook: null };
  const sw = (abs) => (tl.origin === null ? 0 : (abs - tl.origin) / 1000);
  const event = (method, params) => send({ method: 'Target.dispatchMessageFromTarget', params: { targetId, message: JSON.stringify({ method, params }) } });
  const stopTl = () => { clearInterval(tl.timer); tl.timer = null; if (tl.hook) markHooks.delete(tl.hook); tl.hook = null; };
  sock.on('close', stopTl);
  const timelineCmd = (method) => {
    if (method === 'Page.enable') tl.origin = performance.now();
    log({ tl: method, gen: tab.gen, ...(method === 'Page.enable' && doc ? { docOffsetMs: doc.t0 - tl.origin } : {}) });
    if (method === 'Timeline.start' && !tl.timer) {
      event('Timeline.recordingStarted', { startTime: sw(performance.now()) });
      tl.timer = setInterval(() => { const a = sw(performance.now()); event('Timeline.eventRecorded', { record: { startTime: a, endTime: a + 0.002, data: {}, children: [{ startTime: a, endTime: a + 0.001, data: {}, type: 'Layout' }], type: 'RenderingFrame' } }); }, 16);
      tl.timer.unref?.();
      tl.hook = (name, abs) => event('Timeline.eventRecorded', { record: { startTime: sw(abs), data: { message: name }, type: 'TimeStamp' } });
      markHooks.add(tl.hook);
    }
    if (method === 'Timeline.stop' && tl.timer) { stopTl(); setTimeout(() => event('Timeline.recordingStopped', { endTime: sw(performance.now()) }), 30); }
  };
  const handle = async (msg) => {
    if (msg.method !== 'Target.sendMessageToTarget') return send({ id: msg.id, result: {} });
    send({ id: msg.id, result: {} });
    const inner = JSON.parse(msg.params.message);
    let result = {};
    if (/^(Page\.(enable|disable)|Timeline\.)/.test(inner.method) && !isTwin) timelineCmd(inner.method);
    if (inner.method === 'Runtime.evaluate') {
      const v = isTwin ? twinEvaluate(inner.params.expression) : await evaluate(inner.params.expression);
      log({ evaluate: inner.params.expression.slice(0, 160), sha256: createHash('sha256').update(inner.params.expression).digest('hex') });
      result = v && typeof v === 'object' && '__thrown' in v ? { wasThrown: true, result: { type: 'string', value: v.__thrown } }
        : { result: v === undefined ? { type: 'undefined' } : { type: typeof v, value: v } };
    }
    send({ method: 'Target.dispatchMessageFromTarget', params: { targetId, message: JSON.stringify({ id: inner.id, result }) } });
  };
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(need);
      if (op === 8) { sock.end(Buffer.from([0x88, 0])); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      parts.push(payload);
      if (!fin) continue;
      if (ONE_CLIENT && owner.get(req.url) !== sock) { // someone took our page: close 1001 instead of an answer
        const reason = Buffer.from('Page 9222/1 claimed by local');
        sock.end(Buffer.concat([Buffer.from([0x88, 2 + reason.length, 0x03, 0xe9]), reason]));
        log({ stolenClose: req.url });
        return;
      }
      const text = Buffer.concat(parts).toString('utf8'); parts = [];
      try { handle(JSON.parse(text)).catch((e) => log({ error: String(e) })); } catch (e) { log({ error: String(e) }); }
    }
  });
  sock.on('error', () => {});
});
server.listen(Number(arg('port') || 0), '127.0.0.1', async () => {
  console.log(`FAKE_WIP_PORT=${server.address().port}`);
  if (arg('wda-port') !== null) {
    const w = await startFakeWda({ port: Number(arg('wda-port')), foreground: arg('foreground') || undefined, log: process.env.FAKE_WDA_LOG, onStroke: (body) => (doc ? playStroke(body) : null), onApp: (kind, body) => (body?.bundleId === 'com.apple.mobilesafari' ? onApp(kind, body) : null), failApp: arg('fail-app') });
    console.log(`FAKE_WDA_PORT=${w.port}`);
  }
});

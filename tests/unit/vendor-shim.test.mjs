// tools/vendor-shim.js in a Node vm sandbox with minimal DOM-shaped stubs (no jsdom): every egress path
// to a third-party origin is neutralised, same-origin traffic passes through untouched. The real-browser
// version of this check is tests/chrome/vendor-shim.chrome.test.mjs.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { tool } from '../helpers.mjs';

const SHIM = readFileSync(tool('vendor-shim.js'), 'utf8');
const ORIGIN = 'https://localhost:5230';
let w, calls;

function makeWindow() {
  calls = { fetch: [], xhr: [], beacon: [], ws: [] };
  const withSrc = (C) => { Object.defineProperty(C.prototype, 'src', { configurable: true, enumerable: true, get() { return this._src; }, set(v) { this._src = String(v); } }); return C; };
  class Element { setAttribute(n, v) { (this.attrs ||= {})[n] = String(v); if (n === 'src') this._src = String(v); } getAttribute(n) { return this.attrs?.[n] ?? null; } }
  const HTMLScriptElement = withSrc(class extends Element {});
  const HTMLImageElement = withSrc(class extends Element {});
  const HTMLIFrameElement = withSrc(class extends Element {});
  class XMLHttpRequest { open(m, u) { calls.xhr.push([m, u]); } }
  class RealWS { constructor(u) { calls.ws.push(u); this.real = true; } }
  const sb = {
    location: { origin: ORIGIN }, document: { baseURI: ORIGIN + '/' },
    Element, HTMLScriptElement, HTMLImageElement, HTMLIFrameElement, XMLHttpRequest, WebSocket: RealWS,
    navigator: { sendBeacon(u) { calls.beacon.push(u); return true; } },
    fetch(u) { calls.fetch.push(typeof u === 'object' ? u.url : u); return Promise.resolve('real'); },
    URL, Response, EventTarget, Event, CloseEvent: globalThis.CloseEvent || class CloseEvent extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } },
    setTimeout, JSON, Promise, Object, String, Array, Date,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SHIM, sb);
  return sb;
}
beforeEach(() => { w = makeWindow(); });

test('fetch: third-party answered locally (Amplitude gets an ack), same-origin and relative pass through', async () => {
  const r = await w.fetch('https://api2.amplitude.com/2/httpapi', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).events_ingested, 1);
  const g = await w.fetch('https://www.google-analytics.com/g/collect?v=2');
  assert.equal(g.status, 204);
  const req = { url: 'https://region1.analytics.google.com/g/collect' };
  assert.equal((await w.fetch(req)).status, 204, 'Request-like objects are checked by .url');
  assert.equal(await w.fetch('/_app/version.json'), 'real');
  assert.equal(await w.fetch(ORIGIN + '/x'), 'real');
  assert.deepEqual(calls.fetch, ['/_app/version.json', ORIGIN + '/x']);
});

test('XHR to a vendor is re-pointed at /__mirror/null (answered by serve.mjs), same-origin untouched', () => {
  new w.XMLHttpRequest().open('POST', 'https://www.google-analytics.com/g/collect');
  new w.XMLHttpRequest().open('GET', '/api/x');
  assert.deepEqual(calls.xhr, [['POST', '/__mirror/null?h=www.google-analytics.com'], ['GET', '/api/x']]);
});

test('sendBeacon to a vendor is swallowed (reported as queued), same-origin forwarded', () => {
  assert.equal(w.navigator.sendBeacon('https://cloudflareinsights.com/cdn-cgi/rum', 'x'), true);
  assert.equal(w.navigator.sendBeacon('/cdn-cgi/rum', 'x'), true);
  assert.deepEqual(calls.beacon, ['/cdn-cgi/rum']);
});

test('script src (property and setAttribute) to a vendor is rewritten to /__vendor/<host>/<path>?<query>', () => {
  const s = new w.HTMLScriptElement();
  s.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-X';
  assert.equal(s.src, '/__vendor/www.googletagmanager.com/gtm.js?id=GTM-X');
  const s2 = new w.HTMLScriptElement();
  s2.setAttribute('SRC', 'https://static.hotjar.com/c/hotjar-1.js?sv=6');
  assert.equal(s2.getAttribute('SRC'), '/__vendor/static.hotjar.com/c/hotjar-1.js?sv=6');
  const own = new w.HTMLScriptElement();
  own.src = '/analytics.js';
  assert.equal(own.src, '/analytics.js');
  assert.deepEqual([...w.__mirrorVendorShim.rewrittenScripts], ['https://www.googletagmanager.com/gtm.js?id=GTM-X', 'https://static.hotjar.com/c/hotjar-1.js?sv=6']);
});

test('tracking pixels become a data: GIF, vendor iframes about:blank; same-origin images untouched', () => {
  const img = new w.HTMLImageElement();
  img.src = 'https://www.facebook.com/tr?id=1';
  assert.match(img.src, /^data:image\/gif;base64,/);
  const own = new w.HTMLImageElement();
  own.src = '/img/logo.png';
  assert.equal(own.src, '/img/logo.png');
  const f = new w.HTMLIFrameElement();
  f.setAttribute('src', 'https://td.doubleclick.net/x');
  assert.equal(f.getAttribute('src'), 'about:blank');
  const n = w.__mirrorVendorShim.neutered;
  assert.equal(n['img www.facebook.com'], 1);
  assert.equal(n['iframe td.doubleclick.net'], 1);
});

test('WebSocket to a vendor is a local fake that opens, accepts sends and closes', async () => {
  const ws = new w.WebSocket('wss://ws.hotjar.com/api/v2/client/ws');
  assert.equal(ws.readyState, 0);
  const opened = await new Promise((res) => { ws.onopen = () => res(true); setTimeout(() => res(false), 500); });
  assert.equal(opened, true);
  assert.equal(ws.readyState, 1);
  ws.send('payload');
  let closed = false;
  ws.onclose = () => (closed = true);
  ws.close();
  assert.equal(closed, true);
  assert.equal(ws.readyState, 3);
  assert.deepEqual(calls.ws, [], 'nothing reached the real WebSocket');
  assert.equal(w.__mirrorVendorShim.neutered['websocket-send ws.hotjar.com'], 1);
});

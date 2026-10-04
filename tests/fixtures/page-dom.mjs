// A small fake DOM that runs a whole console page (I-096): the served HTML is parsed into elements (the static body,
// the menu, the ids), the page's inline scripts run against it with fetch going to a real test server, and
// /console-comments.js runs on top like in the browser. Enough of the DOM for the console pages (elements, text,
// attributes, simple selectors, events that bubble); no layout, no timers beyond short ones, no network but `base`.
// Tests only: nothing here is served.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS } from '../helpers.mjs';

const VOID = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => (ENT[e] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m)));

/** One compound selector: tag, #id, .class, [attr] or [attr="v"], in any mix ("section[data-item=\"x\"]", "a.row"). */
function compound(sel) {
  const parts = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([a-zA-Z][a-zA-Z0-9-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
  let m, at = 0;
  while ((m = re.exec(sel))) {
    if (m.index !== at) throw new Error(`fake DOM: selector not supported: ${sel}`);
    at = re.lastIndex;
    if (m[1]) parts.tag = m[1].toUpperCase();
    else if (m[2]) parts.id = m[2];
    else if (m[3]) parts.cls.push(m[3]);
    else parts.attrs.push([m[4], m[5] ?? m[6] ?? m[7]]);
  }
  if (at !== sel.length) throw new Error(`fake DOM: selector not supported: ${sel}`);
  return (n) => n.nodeType === 1 && (!parts.tag || n.tagName === parts.tag) && (!parts.id || n.getAttribute('id') === parts.id)
    && parts.cls.every((c) => n.classList.contains(c)) && parts.attrs.every(([k, v]) => n.hasAttribute(k) && (v === undefined || n.getAttribute(k) === v));
}
/** A selector list: "a, b" of descendant chains "x y". */
function matcher(sel) {
  const lists = sel.split(',').map((s) => s.trim().split(/\s+/).map(compound));
  return (n) => lists.some((chain) => {
    if (!chain[chain.length - 1](n)) return false;
    let i = chain.length - 2;
    for (let p = n.parentNode; p && i >= 0; p = p.parentNode) if (chain[i](p)) i--;
    return i < 0;
  });
}

export class FakeNode {
  constructor(doc, tag, text = '') {
    this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; this.listeners = {};
    if (tag === '#text') { this.nodeType = 3; this.nodeName = '#text'; this.data = String(text); return; }
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.attrs = {}; this.style = {};
    this.value = ''; this.checked = false; this.dataset = {};
    const self = this;
    this.classList = {
      contains: (c) => (self.attrs.class || '').split(/\s+/).includes(c),
      add: (...c) => { const s = new Set((self.attrs.class || '').split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); self.attrs.class = [...s].join(' '); },
      remove: (...c) => { self.attrs.class = (self.attrs.class || '').split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      toggle: (c, on) => { const has = self.classList.contains(c); const want = on === undefined ? !has : !!on; if (want && !has) self.classList.add(c); if (!want && has) self.classList.remove(c); return want; },
    };
  }
  // ---- text ----
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { if (this.nodeType === 3) { this.data = String(v); return; } this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))); }
  // ---- attributes, and the properties that reflect them ----
  getAttribute(k) { return this.attrs && k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return !!this.attrs && k in this.attrs; }
  toggleAttribute(k, on) { const want = on === undefined ? !this.hasAttribute(k) : !!on; if (want) this.attrs[k] = ''; else delete this.attrs[k]; return want; }
  get id() { return this.getAttribute('id') || ''; } set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; } set className(v) { this.setAttribute('class', v); }
  get href() { return this.getAttribute('href') || ''; } set href(v) { this.setAttribute('href', v); }
  get title() { return this.getAttribute('title') || ''; } set title(v) { this.setAttribute('title', v); }
  get type() { return this.getAttribute('type') || ''; } set type(v) { this.setAttribute('type', v); }
  get src() { return this.getAttribute('src') || ''; } set src(v) { this.setAttribute('src', v); }
  get hidden() { return this.hasAttribute('hidden'); } set hidden(v) { this.toggleAttribute('hidden', !!v); }
  get disabled() { return this.hasAttribute('disabled'); } set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get open() { return this.hasAttribute('open'); } set open(v) { this.toggleAttribute('open', !!v); }
  // ---- tree ----
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  _node(x) { return typeof x === 'string' ? this.ownerDocument.createTextNode(x) : x; }
  insertBefore(n, ref) {
    n = this._node(n);
    if (n.nodeType === 11) { [...n.childNodes].forEach((c) => this.insertBefore(c, ref)); return n; }
    if (n.parentNode) n.remove();
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    n.parentNode = this;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  append(...ns) { ns.forEach((n) => this.appendChild(n)); }
  prepend(...ns) { const first = this.firstChild; ns.forEach((n) => this.insertBefore(n, first)); }
  replaceChildren(...ns) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; this.append(...ns); }
  remove() { const p = this.parentNode; if (p) { p.childNodes = p.childNodes.filter((c) => c !== this); this.parentNode = null; } }
  before(...ns) { const p = this.parentNode; ns.forEach((n) => p.insertBefore(n, this)); }
  after(...ns) { const p = this.parentNode, next = this.nextSibling; ns.forEach((n) => p.insertBefore(n, next)); }
  replaceWith(...ns) { this.before(...ns); this.remove(); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  all() { return this.childNodes.flatMap((c) => (c.nodeType === 1 ? [c, ...c.all()] : [])); }
  matches(sel) { return matcher(sel)(this); }
  closest(sel) { const m = matcher(sel); for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (m(n)) return n; return null; }
  querySelector(sel) { return this.all().find(matcher(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter(matcher(sel)); }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  // ---- events, focus, layout stand-ins ----
  addEventListener(e, f) { (this.listeners[e] ||= []).push(f); }
  removeEventListener(e, f) { this.listeners[e] = (this.listeners[e] || []).filter((x) => x !== f); }
  dispatchEvent(ev) { return this.ownerDocument.fire(this, ev.type, ev); }
  click() { this.ownerDocument.fire(this, 'click'); }
  requestSubmit() { this.ownerDocument.fire(this, 'submit'); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  select() {} setSelectionRange() {} scrollIntoView() {} play() { return Promise.resolve(); } pause() {} load() {}
  getBoundingClientRect() { return { top: 100, right: 400, bottom: 140, left: 20, width: 380, height: 40 }; }
}

/** Parse an HTML fragment into `parent` (elements, text, attributes; script and style bodies kept as text). */
export function parseInto(doc, parent, html) {
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/gi;
  let cur = parent, m;
  while ((m = re.exec(html))) {
    if (m[1]) { // a closing tag: up to the nearest open element of that name
      const t = m[1].toUpperCase();
      for (let n = cur; n && n !== parent.parentNode; n = n.parentNode) if (n.tagName === t) { cur = n.parentNode; break; }
    } else if (m[2]) {
      const el = doc.createElement(m[2]);
      for (const a of (m[3] || '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.setAttribute(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''));
      cur.appendChild(el);
      const tag = m[2].toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'textarea') { // raw text up to the closing tag
        const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
        const body = html.slice(re.lastIndex, end < 0 ? html.length : end);
        if (body) el.appendChild(doc.createTextNode(tag === 'textarea' ? decode(body) : body));
        re.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1;
      } else if (!m[4] && !VOID.has(tag)) cur = el;
    } else if (m[5] && cur !== parent.parentNode) {
      if (m[0].startsWith('<!')) continue;
      cur.appendChild(doc.createTextNode(decode(m[5])));
    }
  }
}

/**
 * A page from `base` + `path`: parse it, run its inline scripts (fetch → the test server), then console-comments.js
 * when the page carries its tag (data-page). Returns {document, window, fire, settle, calls}.
 * It returns once the page has settled (I-132): none of its fetches in flight and none of its short timers pending,
 * for two polls in a row; `settle()` waits the same way after a click. No fixed sleep, so a slow (loaded) server
 * still yields the rendered page; a page that does not settle within `settleTimeoutMs` throws, naming what is pending.
 */
export async function loadPage(base, path, { hash = '', transform = (s) => s, settleTimeoutMs = 20000 } = {}) {
  const res = await fetch(new URL(path, base));
  const html = await res.text();
  const listeners = {};
  const document = {
    nodeType: 9, readyState: 'loading', visibilityState: 'visible', title: '', activeElement: null, currentScript: null,
    createElement: (t) => new FakeNode(document, t), createTextNode: (t) => new FakeNode(document, '#text', t),
    createDocumentFragment: () => Object.assign(new FakeNode(document, 'fragment'), { nodeType: 11 }),
    addEventListener: (e, f) => (listeners[e] ||= []).push(f), removeEventListener() {},
    getElementById: (id) => document.documentElement.all().find((n) => n.getAttribute('id') === id) || null,
    querySelector: (s) => document.documentElement.querySelector(s), querySelectorAll: (s) => document.documentElement.querySelectorAll(s),
    getSelection: () => null,
  };
  document.documentElement = new FakeNode(document, 'html');
  Object.defineProperty(document.documentElement, 'clientWidth', { value: 1200 });
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body = document.documentElement.appendChild(new FakeNode(document, 'body'));
  parseInto(document, document.body, body ? body[1] : html);
  const title = html.match(/<title>([^<]*)<\/title>/i); if (title) document.title = decode(title[1]);
  // events bubble from the target to the document, then the window
  const winListeners = {};
  document.fire = (target, type, extra = {}) => {
    const e = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    for (let n = target; n && n.nodeType === 1; n = n.parentNode) for (const f of n.listeners?.[type] || []) f.call(n, e);
    for (const f of listeners[type] || []) f(e);
    for (const f of winListeners[type] || []) f(e);
    return !e.defaultPrevented;
  };
  const calls = [];
  const inFlight = new Set(); // the page's fetches not yet answered (their urls)
  const pageFetch = async (url, init = {}) => {
    const call = { url: String(url), init };
    calls.push(call); inFlight.add(call);
    try {
      const r = await fetch(new URL(url, base), { method: init.method || 'GET', headers: init.headers, body: init.body });
      const text = await r.text();
      return { ok: r.ok, status: r.status, json: async () => JSON.parse(text), text: async () => text };
    } finally { inFlight.delete(call); }
  };
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const location = { hash, pathname: new URL(path, base).pathname, href: new URL(path + hash, base).href, origin: new URL(base).origin };
  location.replace = location.assign = (u) => { location.hash = new URL(u, location.href).hash; };
  const timers = new Set(); // the page's short timers not yet fired or cleared
  const setTimeoutShort = (f, ms = 0) => {
    if (ms > 100) return 0;
    const t = setTimeout(() => { timers.delete(t); f(); }, ms);
    timers.add(t); return t;
  };
  const clearTimeoutShort = (t) => { timers.delete(t); clearTimeout(t); };
  const window = {
    location, localStorage, document, scrollX: 0, scrollY: 0, innerWidth: 1200, innerHeight: 900,
    addEventListener: (e, f) => (winListeners[e] ||= []).push(f), removeEventListener() {},
    getSelection: () => window.selection || null, matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const run = (src, script) => {
    document.currentScript = script || null;
    new Function('window', 'document', 'location', 'fetch', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'localStorage', 'history', 'navigator', 'requestAnimationFrame', 'Image', src)(
      window, document, location, pageFetch, () => 0, () => {}, setTimeoutShort, clearTimeoutShort, localStorage, { replaceState() {}, pushState() {} }, { userAgent: 'fake' }, (f) => setTimeoutShort(f, 16),
      function Image() { return document.createElement('img'); });
    document.currentScript = null;
  };
  const scripts = document.body.querySelectorAll('script');
  for (const s of scripts) if (!s.getAttribute('src')) run(transform(s.textContent), s);
  const cs = scripts.find((s) => s.getAttribute('src') === '/console-comments.js');
  if (cs) run(readFileSync(join(TOOLS, 'lib', 'console-comments.js'), 'utf8'), cs);
  document.readyState = 'complete';
  for (const f of listeners.DOMContentLoaded || []) f({ type: 'DOMContentLoaded' });
  // settled: nothing in flight and no short timer pending at two polls 10 ms apart (a fetch answer's .then chain runs as
  // microtasks before the next poll, so a fetch it starts is seen)
  const settle = async ({ timeoutMs = settleTimeoutMs } = {}) => {
    const t0 = Date.now();
    for (let quiet = 0; quiet < 2;) {
      if (Date.now() - t0 > timeoutMs) {
        throw new Error(`fake DOM: ${path} did not settle in ${timeoutMs} ms: ${inFlight.size} fetch(es) pending (${[...inFlight].map((c) => c.url).join(', ')}), ${timers.size} short timer(s)`);
      }
      await new Promise((r) => setTimeout(r, 10));
      quiet = inFlight.size === 0 && timers.size === 0 ? quiet + 1 : 0;
    }
  };
  await settle();
  return { document, window, fire: document.fire, settle, calls };
}

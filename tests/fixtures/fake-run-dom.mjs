// A tiny fake Safari page in a node:vm context for `iphone.mjs run` (tools/lib/iphone-run.mjs, iphone-probe.mjs):
// enough DOM for the std probe and the drivers to run unchanged. Elements with attributes / classList / style,
// a MutationObserver that delivers records in microtask batches (old values, same-value writes included, like a
// browser), rAF at ~120 Hz (setInterval 8 ms, one timestamp per frame), smooth scrollBy, instant scrollTo,
// contentvisibilityautostatechange on document, performance.getEntriesByType('resource'), window scroll events
// (fired before the frame's rAF callbacks when scrollY changed, as in a browser), document.fonts, matchMedia, screen.
// Every read of window.scrollY is counted (win.__scrollYReads), to test which y source reads it per frame.
//
// The page's own behaviour (all through window.requestAnimationFrame looked up at call time, so the probe's
// wrapper sees it, like the real Svelte runtime):
//   - every frame: a `.track` element's inline transform follows scrollY (style), plus a same-value
//     data-fw-wc write (`same`);
//   - first frame with scrollY >= eventY (default 1960): ONE rAF callback busy-waits busyMs (90) and, in that
//     callback, sources 21 panel images, removes `inert` from the morph panel, adds `is-live` to it and flips
//     the platform section's data-start-selling-scene paused -> active (F-044's y~1960 frame, with more than
//     12 events in one frame);
//   - first frame with scrollY >= cvY (1250): a contentvisibilityautostatechange (rendered) on section.commission;
//   - first frame with scrollY >= fontY (900): document.fonts loadingdone with 2 font faces;
//   - morph: true defines window.__fwMorphDrive({hold, cycles}) like fix-nav-morph's overlays: the nav's
//     --morph goes 0 -> 1 over ~150 ms, holds, back, per cycle; __fwMD = JSON {all, moving, atOne, atZero, frames}.
import vm from 'node:vm';

/** The one script tests/fixtures/fake-run-proxy.mjs serves (/_app/immutable/app.js), for the served-hash check. */
export const APP_JS = "console.log('fake app');\n";

const SEL = /^([a-z0-9]*)((?:[.#][\w-]+)*)((?:\[[\w-]+(?:=[\w-]+)?\])*)$/i;
function matches(el, sel) {
  return sel.split(',').some((part) => {
    const m = part.trim().match(SEL);
    if (!m) throw new Error(`fake-run-dom: unsupported selector ${part}`);
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    for (const [, k, v] of m[2].matchAll(/([.#])([\w-]+)/g)) { if (k === '#' ? el.id !== v : !el.classList.contains(v)) return false; }
    for (const [, a, v] of m[3].matchAll(/\[([\w-]+)(?:=([\w-]+))?\]/g)) { if (!el.hasAttribute(a) || (v !== undefined && el.getAttribute(a) !== v)) return false; }
    return true;
  });
}

export function createPage({ docHeight = 2900, eventY = 1960, cvY = 1250, fontY = 900, busyMs = 90, morph = false, resources = [], href = 'http://127.0.0.1:9/', onReload = null } = {}) {
  const t0 = performance.now();
  const now = () => performance.now() - t0;
  const observers = new Set();
  const record = (r) => { for (const o of observers) if (o.on) o.push(r); };

  class El {
    constructor(tag, { id = '', cls = '', attrs = {}, top = 0 } = {}) {
      this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.attrs = new Map(); this.children = []; this.isConnected = true; this.top = top;
      if (id) this.attrs.set('id', id);
      if (cls) this.attrs.set('class', cls);
      for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
      const el = this;
      this.classList = {
        contains: (c) => el.cls().includes(c),
        add: (c) => { if (!el.cls().includes(c)) el.setAttribute('class', [...el.cls(), c].join(' ')); },
        remove: (c) => { if (el.cls().includes(c)) el.setAttribute('class', el.cls().filter((x) => x !== c).join(' ')); },
        [Symbol.iterator]: () => el.cls()[Symbol.iterator](),
      };
      const props = {};
      this.style = {
        getPropertyValue: (k) => props[k] ?? '',
        setProperty: (k, v) => { props[k] = String(v); el.setAttribute('style', Object.entries(props).map(([a, b]) => `${a}: ${b}`).join('; ')); },
      };
    }
    get id() { return this.attrs.get('id') || ''; }
    cls() { return (this.attrs.get('class') || '').split(/\s+/).filter(Boolean); }
    getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
    hasAttribute(n) { return this.attrs.has(n); }
    setAttribute(n, v) { const old = this.getAttribute(n); this.attrs.set(n, String(v)); record({ type: 'attributes', target: this, attributeName: n, oldValue: old }); }
    removeAttribute(n) { if (!this.attrs.has(n)) return; const old = this.attrs.get(n); this.attrs.delete(n); record({ type: 'attributes', target: this, attributeName: n, oldValue: old }); }
    appendChild(c) { this.children.push(c); record({ type: 'childList', target: this, addedNodes: [c], removedNodes: [] }); return c; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    querySelectorAll(s) { return this.all().filter((e) => matches(e, s)); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    getBoundingClientRect() { return { top: this.top - sy, height: 100 }; }
  }

  // the document
  const body = new El('body');
  const add = (parent, ...a) => { const e = new El(...a); parent.children.push(e); return e; };
  const nav = add(body, 'header', { cls: 'start-selling-top-nav svelte-x1' });
  const track = add(body, 'div', { cls: 'track', top: 300 });
  add(body, 'section', { cls: 'commission', top: cvY + 700 });
  const platform = add(body, 'section', { id: 'platform', cls: 'start-selling-platform', attrs: { 'data-start-selling-scene': 'paused' }, top: eventY + 900 });
  const panel = add(platform, 'div', { cls: 'start-selling-morph-panel', attrs: { inert: '' }, top: eventY + 1000 });
  const imgs = Array.from({ length: 21 }, () => add(panel, 'img'));
  for (const r of resources) add(body, 'script', { attrs: { src: r } });
  const docListeners = [];
  const document = {
    documentElement: { scrollHeight: docHeight }, readyState: 'complete', title: 'fake run page',
    querySelector: (s) => body.querySelector(s), querySelectorAll: (s) => body.querySelectorAll(s),
    addEventListener: (type, fn, capture) => docListeners.push({ type, fn, capture: typeof capture === 'object' ? !!capture.capture : !!capture }),
    removeEventListener: (type, fn) => { const i = docListeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) docListeners.splice(i, 1); },
    getAnimations: () => [{ timeline: new (class DocumentTimeline {})() }, { timeline: new (class ViewTimeline {})() }],
  };
  const dispatchDoc = (type, e) => { for (const l of docListeners.filter((x) => x.type === type)) l.fn(e); };
  const fontListeners = [];
  document.fonts = { status: 'loaded', addEventListener: (t, fn) => fontListeners.push({ t, fn }), removeEventListener: (t, fn) => { const i = fontListeners.findIndex((l) => l.t === t && l.fn === fn); if (i >= 0) fontListeners.splice(i, 1); } };
  const winListeners = [];

  class MutationObserver {
    constructor(cb) { this.cb = cb; this.q = []; this.on = false; this.scheduled = false; }
    observe() { this.on = true; observers.add(this); }
    disconnect() { this.on = false; this.q = []; observers.delete(this); }
    push(r) { this.q.push(r); if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => { this.scheduled = false; const q = this.q; this.q = []; if (q.length && this.on) this.cb(q, this); }); } }
  }

  let raf = [], rafId = 0, smooth = null;
  const maxY = () => docHeight - win.innerHeight;
  const clampY = (y) => Math.max(0, Math.min(maxY(), y));
  let sy = 0;
  const win = {
    get scrollY() { win.__scrollYReads = (win.__scrollYReads || 0) + 1; return sy; },
    set scrollY(v) { sy = v; },
    innerWidth: 430, innerHeight: 815, devicePixelRatio: 3,
    navigator: { userAgent: 'FakeSafari/1.0 (fake-run-dom)', hardwareConcurrency: 6 },
    matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: dark)' }), Date, screen: { width: 430, height: 932 },
    addEventListener: (type, fn, o) => winListeners.push({ type, fn, passive: !!(o && o.passive) }),
    removeEventListener: (type, fn) => { const i = winListeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) winListeners.splice(i, 1); },
    location: { href, origin: new URL(href).origin, reload: () => { win.__reloaded = true; if (onReload) onReload(); } },
    document, MutationObserver, URL, setTimeout, clearTimeout, queueMicrotask,
    performance: { now, mark: () => {}, getEntriesByType: (t) => (t === 'resource' ? resources.map((name, i) => ({ name, initiatorType: 'script', startTime: 10 + i, responseEnd: 20 + i, transferSize: 300, encodedBodySize: 25 })) : []) },
    requestAnimationFrame: (cb) => { raf.push(cb); return ++rafId; },
    scrollTo: (a, b) => { const top = typeof a === 'object' ? a.top : b; smooth = null; sy = clampY(top); },
    scrollBy: (o) => { const to = clampY(sy + o.top); if (o.behavior === 'smooth') smooth = { to, step: (to - sy) / 18 }; else sy = to; },
  };
  win.window = win;
  const ctx = vm.createContext(win);

  // page behaviour
  let fired = false, cvFired = false, fontFired = false, stopped = false;
  const engine = () => {
    if (stopped) return;
    track.style.setProperty('transform', `translateY(${-Math.round(sy / 2)}px)`);
    track.setAttribute('data-fw-wc', 'transform'); // same value every frame after the first
    if (!fired && sy >= eventY) {
      fired = true;
      const end = performance.now() + busyMs; while (performance.now() < end) {} // the long frame
      imgs.forEach((im, i) => im.setAttribute('src', `/img/${i}.webp`));
      panel.removeAttribute('inert');
      panel.classList.add('is-live');
      platform.setAttribute('data-start-selling-scene', 'active');
    }
    if (!fontFired && sy >= fontY) { fontFired = true; queueMicrotask(() => { for (const l of fontListeners.filter((x) => x.t === 'loadingdone')) l.fn({ fontfaces: [{}, {}] }); }); }
    if (!cvFired && sy >= cvY) { cvFired = true; const tgt = body.querySelector('section.commission'); queueMicrotask(() => dispatchDoc('contentvisibilityautostatechange', { target: tgt, skipped: false })); }
    win.requestAnimationFrame(engine);
  };
  win.requestAnimationFrame(engine);
  if (morph) {
    win.__fwMorphDrive = ({ hold = 2000, cycles = 3 } = {}) => {
      const f = []; let m = 0, last = now(), on = true;
      const log = (t) => { f.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(sy), m]); last = t; if (on) win.requestAnimationFrame(log); };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const tween = async (to) => { const from = m; for (let i = 1; i <= 18; i++) { await new Promise((r) => win.requestAnimationFrame(r)); m = Math.round((from + ((to - from) * i) / 18) * 1000) / 1000; nav.style.setProperty('--morph', String(m)); } };
      win.__fwMD = null;
      win.scrollTo({ top: maxY(), behavior: 'instant' });
      (async () => {
        await sleep(50); win.requestAnimationFrame(log);
        for (let c = 0; c < cycles; c++) { await tween(1); await sleep(hold); await tween(0); await sleep(hold); }
        on = false;
        const s = (fr) => { const d = fr.map((x) => x[1]).sort((a, b) => a - b); const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : null); return { frames: d.length, gt20: d.filter((x) => x > 20).length, gt34: d.filter((x) => x > 34).length, gt50: d.filter((x) => x > 50).length, p50: q(0.5), p95: q(0.95), max: d.at(-1) ?? null }; };
        const t = f.slice(1);
        win.__fwMD = JSON.stringify({ hold, cycles, all: s(t), moving: s(t.filter((x) => x[3] > 0.001 && x[3] < 0.999)), atOne: s(t.filter((x) => x[3] >= 0.999)), atZero: s(t.filter((x) => x[3] <= 0.001)), frames: f });
      })();
    };
  }

  let lastScrollFired = 0;
  const timer = setInterval(() => {
    if (smooth) { const d = smooth.to - sy; if (Math.abs(d) <= Math.abs(smooth.step) || smooth.step === 0) { sy = smooth.to; smooth = null; } else sy = Math.round(sy + smooth.step); }
    if (sy !== lastScrollFired) { lastScrollFired = sy; for (const l of winListeners.filter((x) => x.type === 'scroll')) l.fn({ type: 'scroll' }); }
    const q = raf; raf = [];
    const t = now();
    for (const cb of q) { try { cb(t); } catch (e) { win.__errors = (win.__errors || 0) + 1; } }
  }, 8);
  return {
    win, ctx, panel, imgs, nav,
    evaluate: (expr) => vm.runInContext(expr, ctx),
    stop: () => { stopped = true; clearInterval(timer); },
  };
}

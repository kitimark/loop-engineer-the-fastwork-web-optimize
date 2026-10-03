// A tiny fake Safari page in a node:vm context for `iphone.mjs run` (tools/lib/iphone-run.mjs, iphone-probe.mjs):
// enough DOM for the std probe and the drivers to run unchanged. Elements with attributes / classList / style,
// a MutationObserver that delivers records in microtask batches (old values, same-value writes included),
// rAF at ~120 Hz (every 8 ms, a long frame followed by a 1 ms gap; one timestamp per frame; callbacks in registration order with a microtask
// checkpoint after each one, as HTML's "clean up after running script" does, so a MutationObserver batch from a
// page callback is delivered before the next callback runs), smooth scrollBy, instant scrollTo,
// contentvisibilityautostatechange on document, performance.getEntriesByType('resource'), window scroll events
// (fired before the frame's rAF callbacks when scrollY changed, after the frame's stamp is taken, capture
// listeners first, a microtask checkpoint after each, as WebKit's rendering update does), a visualViewport
// (listeners only), document.fonts, matchMedia (prefers-reduced-motion: the fake Simulator's setting, I-100), screen.
// Every read of window.scrollY is counted (win.__scrollYReads), and every read of documentElement.scrollHeight
// (win.__scrollHeightReads, win.__scrollHeightReadsAtY0 for those at scrollY 0), to test which y source reads what.
// A simplification, not a browser: no layout at all, so the counts are reads, not forced layouts.
// clockMs: a coarse page clock (performance.now() and the rAF stamps floored to clockMs; Safari's stamps are 1 ms).
// tieAfterLong: the frame after a long one (> 16 ms) gets the stamp of the last observer delivery, and the page
// clock reads that same value inside an observer callback: a batch and the next frame's stamp tie exactly, the
// case that put a batch in the wrong row when batches were placed by delivery time (probe v2).
// scrollHandlerY: the page has a window scroll listener (bubble, registered before the probe) that adds
// `is-scrolled` to the nav on the first scroll event with scrollY >= scrollHandlerY and keeps that frame's stamp
// in win.__scrollMutStamp: work that runs before the frame's rAF callbacks.
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
//   - first frame with scrollY >= lateY (1700): a timer starts a SECOND page rAF loop, registered after the probe's,
//     which adds `is-late` to div.late in its first callback (a crossing whose MutationObserver batch comes after
//     the probe's rAF callback in that frame; the engine's batches come before it);
//   - morph: true defines window.__fwMorphDrive({hold, cycles}) like fix-nav-morph's overlays: the nav's
//     --morph goes 0 -> 1 over ~150 ms, holds, back, per cycle; __fwMD = JSON {all, moving, atOne, atZero, frames}.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

/** I-100: in a sim.mjs test the page's prefers-reduced-motion follows the fake Simulator's Reduce Motion setting (the
 *  booted device's com.apple.Accessibility ReduceMotionEnabled in $FAKE_SIMCTL_STATE, read at each call, like WebKit's
 *  live update); FAKE_PAGE_IGNORES_RM=1 makes it never report reduce. Outside a sim test: no-preference. */
function fakeReducedMotion() {
  const f = process.env.FAKE_SIMCTL_STATE;
  if (!f || process.env.FAKE_PAGE_IGNORES_RM) return false;
  try { return JSON.parse(readFileSync(f, 'utf8')).devices.some((d) => d.state === 'Booted' && d.defaults?.['com.apple.Accessibility']?.ReduceMotionEnabled === true); } catch { return false; }
}
const fakeMatchMedia = (q) => {
  if (q === '(prefers-reduced-motion: reduce)') return { matches: fakeReducedMotion() };
  if (q === '(prefers-reduced-motion: no-preference)') return { matches: !fakeReducedMotion() };
  return { matches: q === '(prefers-color-scheme: dark)' };
};

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

export function createPage({ docHeight = 2900, eventY = 1960, cvY = 1250, fontY = 900, lateY = 1700, busyMs = 90, clockMs = 0, tieAfterLong = false, scrollHandlerY = null, morph = false, resources = [], href = 'http://127.0.0.1:9/', onReload = null } = {}) {
  const t0 = performance.now();
  let inMO = null, lastDelivery = null;
  const now = () => { if (inMO !== null) return inMO; const v = performance.now() - t0; return clockMs ? Math.floor(v / clockMs) * clockMs : v; };
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
  const late = add(body, 'div', { cls: 'late', top: lateY + 600 });
  for (const r of resources) add(body, 'script', { attrs: { src: r } });
  const docListeners = [];
  const document = {
    documentElement: { get scrollHeight() { win.__scrollHeightReads++; if (sy === 0) win.__scrollHeightReadsAtY0++; return docHeight; } }, readyState: 'complete', title: 'fake run page',
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
    push(r) { this.q.push(r); if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => { this.scheduled = false; const q = this.q; this.q = []; if (q.length && this.on) { const at = now(); lastDelivery = at; if (tieAfterLong) inMO = at; try { this.cb(q, this); } finally { inMO = null; } } }); } }
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
    matchMedia: fakeMatchMedia, Date, screen: { width: 430, height: 932 },
    addEventListener: (type, fn, o) => winListeners.push({ type, fn, passive: !!(o && o.passive), capture: typeof o === 'object' ? !!(o && o.capture) : !!o }),
    removeEventListener: (type, fn) => { const i = winListeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) winListeners.splice(i, 1); },
    visualViewport: { listeners: [], addEventListener(type, fn) { this.listeners.push({ type, fn }); }, removeEventListener(type, fn) { const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) this.listeners.splice(i, 1); } },
    location: { href, origin: new URL(href).origin, reload: () => { win.__reloaded = true; if (onReload) onReload(); } },
    document, MutationObserver, URL, setTimeout, clearTimeout, queueMicrotask,
    performance: { now, mark: () => {}, getEntriesByType: (t) => (t === 'resource' ? resources.map((name, i) => ({ name, initiatorType: 'script', startTime: 10 + i, responseEnd: 20 + i, transferSize: 300, encodedBodySize: 25 })) : []) },
    requestAnimationFrame: (cb) => { raf.push(cb); return ++rafId; },
    scrollTo: (a, b) => { const top = typeof a === 'object' ? a.top : b; smooth = null; sy = clampY(top); },
    scrollBy: (o) => { const to = clampY(sy + o.top); if (o.behavior === 'smooth') smooth = { to, step: (to - sy) / 18 }; else sy = to; },
  };
  win.window = win;
  win.__scrollHeightReads = 0; win.__scrollHeightReadsAtY0 = 0;
  const ctx = vm.createContext(win);

  // page behaviour
  let fired = false, cvFired = false, fontFired = false, lateFired = false, stopped = false;
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
    if (!lateFired && sy >= lateY) { lateFired = true; setTimeout(() => win.requestAnimationFrame(() => { if (!stopped) late.classList.add('is-late'); }), 0); }
    if (!cvFired && sy >= cvY) { cvFired = true; const tgt = body.querySelector('section.commission'); queueMicrotask(() => dispatchDoc('contentvisibilityautostatechange', { target: tgt, skipped: false })); }
    win.requestAnimationFrame(engine);
  };
  win.requestAnimationFrame(engine);
  win.__winListeners = () => winListeners.map((l) => [l.type, l.capture, l.passive]);
  let curStamp = null, scrollMutDone = false;
  if (scrollHandlerY !== null) win.addEventListener('scroll', () => { if (!scrollMutDone && sy >= scrollHandlerY) { scrollMutDone = true; win.__scrollMutStamp = curStamp; nav.classList.add('is-scrolled'); } }, { passive: true });
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
  // Frames every 8 ms, and the next frame's timestamp at least 1 ms after the last callback of a long frame: with
  // setInterval an overdue tick fired right after the 90 ms frame, its timestamp within 0.1 ms of the observer
  // batch, and the probe's 0.1 ms rounding then placed the batch in the next row by chance (a flake under load).
  let timer = null, prevLong = false;
  const tick = async () => {
    const start = now();
    if (smooth) { const d = smooth.to - sy; if (Math.abs(d) <= Math.abs(smooth.step) || smooth.step === 0) { sy = smooth.to; smooth = null; } else sy = Math.round(sy + smooth.step); }
    const t = tieAfterLong && prevLong && lastDelivery !== null ? lastDelivery : now(); // the update's stamp, taken first
    curStamp = t;
    if (sy !== lastScrollFired) {
      lastScrollFired = sy;
      const ls = winListeners.filter((x) => x.type === 'scroll');
      for (const l of [...ls.filter((x) => x.capture), ...ls.filter((x) => !x.capture)]) { l.fn({ type: 'scroll' }); await null; } // microtask checkpoint per listener
    }
    const q = raf; raf = [];
    for (const cb of q) { try { cb(t); } catch (e) { win.__errors = (win.__errors || 0) + 1; } await null; } // microtask checkpoint per callback
    prevLong = now() - start > 16;
    if (!stopped) timer = setTimeout(tick, Math.max(1, 8 - (now() - start)));
  };
  timer = setTimeout(tick, 8);
  return {
    win, ctx, panel, imgs, nav,
    evaluate: (expr) => vm.runInContext(expr, ctx),
    stop: () => { stopped = true; clearTimeout(timer); },
  };
}

// tools/lib/bench-probes.mjs: the exact page code of Tier A (bench.mjs mech), run in node:vm with minimal
// DOM fakes. Every wrapper counts and filters correctly, keeps `this`, arguments and return values,
// counts only while recording and never for the runner's own reads; readAfterWrite resets per frame;
// no-op setProperty detection; quiescence; uninstall restores the originals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installSource, RESET, READ, QUIESCE, SNAPSHOT, GEOMETRY, SCROLL_TO, benchPage } from '../../tools/lib/bench-probes.mjs';

// chromeStyle: the shape Chrome 154 really has (I-028): no CSSStyleProperties / CSS2Properties, the
// prototype carries only cssText / cssFloat and the methods, and every declaration has its camelCase
// properties as OWN properties. Default: the Firefox / spec shape (accessors on the prototype).
const FIREFOX_STYLE = `for (const p of ['height', 'width', 'pointerEvents']) Object.defineProperty(CSSStyleDeclaration.prototype, p, { get() { return this._p[p] ?? ''; }, set(v) { this._p[p] = v; }, configurable: true });`;
const CHROME_STYLE = `
    Object.defineProperty(CSSStyleDeclaration.prototype, 'cssFloat', { get() { return this._p.float ?? ''; }, set(v) { this._p.float = v; }, configurable: true });
    const OwnStyle = CSSStyleDeclaration;
    CSSStyleDeclaration = function CSSStyleDeclaration() {
      const d = Reflect.construct(OwnStyle, [], CSSStyleDeclaration);
      for (const p of ['height', 'width', 'pointerEvents', 'transform']) Object.defineProperty(d, p, { get() { return this._p[p] ?? ''; }, set(v) { this._p[p] = String(v); }, enumerable: true, configurable: false });
      return d;
    };
    CSSStyleDeclaration.prototype = OwnStyle.prototype;
    OwnStyle.prototype.constructor = CSSStyleDeclaration;`;
function makePage({ chromeStyle = false } = {}) {
  const ctx = { console };
  vm.createContext(ctx);
  // a tiny DOM: elements with classes and a parent chain; selectors ".a", "#id", "tag", ".a .b" (descendant)
  vm.runInContext(`
    var rafQ = [], tick = 0, records = [], observers = [], scrollY = 0, innerHeight = 900;
    class Node {}
    class CharacterData extends Node {}
    var CSSStyleDeclaration = class CSSStyleDeclaration {
      constructor() { this._p = {}; }
      setProperty(k, v, prio) { this._p[k] = String(v); this._prio = prio || ''; return 'set:' + k; }
      getPropertyValue(k) { return this._p[k] ?? ''; }
      getPropertyPriority() { return this._prio || ''; }
      removeProperty(k) { const o = this._p[k]; delete this._p[k]; return o; }
    }
    Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', { get() { return JSON.stringify(this._p); }, set(v) { this._p = { text: v }; }, configurable: true });
    ${chromeStyle ? CHROME_STYLE : FIREFOX_STYLE}
    const simple = (e, s) => s.startsWith('.') ? e.classes.includes(s.slice(1)) : s.startsWith('#') ? e.id === s.slice(1) : e.tag === s;
    class Element extends Node {
      constructor(tag, classes = [], parent = null, id = '') { super(); this.tag = tag; this.classes = classes; this.parentElement = parent; this.id = id; this.nodeType = 1; this.attrs = {}; }
      matches(sel) { if (sel.includes('[[')) throw new SyntaxError('bad selector'); const parts = sel.trim().split(/\\s+/); if (!simple(this, parts.pop())) return false; let e = this.parentElement; for (const p of parts.reverse()) { while (e && !simple(e, p)) e = e.parentElement; if (!e) return false; e = e.parentElement; } return true; }
      closest(sel) { for (let e = this; e; e = e.parentElement) if (e.matches(sel)) return e; return null; }
      getBoundingClientRect() { return { top: this.top ?? 0, bottom: (this.top ?? 0) + 10, self: this }; }
      getClientRects() { return ['rects', this]; }
      getAttribute(a) { return a in this.attrs ? this.attrs[a] : a === 'class' ? this.classes.join(' ') : null; }
      setAttribute(a, v) { this.attrs[a] = v; }
      removeAttribute(a) { delete this.attrs[a]; }
      querySelector(s) { return 'qs:' + s; }
      querySelectorAll(s) { return ['qsa:' + s]; }
    }
    Object.defineProperty(Element.prototype, 'clientWidth', { get() { return 111; }, configurable: true });
    Object.defineProperty(Element.prototype, 'className', { get() { return this.classes.join(' '); }, set(v) { this.classes = v.split(' '); }, configurable: true });
    class HTMLElement extends Element {}
    Object.defineProperty(HTMLElement.prototype, 'style', { get() { return this._s || (this._s = new CSSStyleDeclaration()); }, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { get() { return 42; }, configurable: true });
    class Range { constructor(c) { this.startContainer = c; } getBoundingClientRect() { return 'range-rect'; } getClientRects() { return 'range-rects'; } }
    class DOMTokenList { add() {} remove() {} toggle() {} replace() {} }
    class DocumentFragment {}
    class Document { querySelector(s) { return all.find((e) => e.matches(s)) || null; } querySelectorAll(s) { return all.filter((e) => e.matches(s)); } elementFromPoint() { return 'efp'; } getAnimations() { return anims; } }
    class MutationObserver { constructor(cb) { this.cb = cb; observers.push(this); } observe(t, o) { this.opts = o; } disconnect() { this.off = true; } takeRecords() { const r = records; records = []; return r; } }
    const html = new HTMLElement('html');
    const body = new HTMLElement('body', [], html);
    const future = new HTMLElement('section', ['start-selling-future'], body);
    const card = new HTMLElement('div', ['card'], future);
    const nav = new HTMLElement('nav', ['top-nav'], body);
    nav.top = 2000;
    const all = [html, body, future, card, nav];
    var anims = [];
    const document = new Document();
    document.documentElement = html; document.body = body; document.images = [];
    html.style; // make sure a style object exists for the accessor lookup
    var window = globalThis;
    var matchMedia = function (q) { return { media: q, matches: false, self: this }; };
    var getComputedStyle = function (el) { return { getPropertyValue: (p) => (el._s && el._s._p[p]) || '', el }; };
    var requestAnimationFrame = function (cb) { rafQ.push(cb); return rafQ.length; };
    var setTimeout = function () { return 'timeout-id'; };
    var setInterval = function () { return 'interval-id'; };
    var scrollTo = function (o) { scrollY = o.top; };
    function frame() { tick += 16; const q = rafQ; rafQ = []; for (const cb of q) cb(tick); }
    function mutate(target, attributeName, oldValue, newValue) { target.attrs[attributeName] = newValue; records.push({ target, attributeName, oldValue }); }
    function deliver() { const r = records; records = []; for (const o of observers) if (!o.off) o.cb(r); }
    Object.assign(globalThis, { Node, CharacterData, CSSStyleDeclaration, Element, HTMLElement, Range, DOMTokenList, DocumentFragment, Document, MutationObserver, document, html, body, future, card, nav, all, frame, mutate, deliver });
  `, ctx);
  const run = (expr) => vm.runInContext(expr, ctx);
  const val = (expr) => JSON.parse(JSON.stringify(run(expr) ?? null));
  return { ctx, run, val, install: (probes) => run(installSource({ probes })), frame: () => run('frame()') };
}

test('installSource runs the page function once; __bench API present; install is idempotent', () => {
  const p = makePage();
  p.install({ q: { kind: 'querySelector', selector: '.x' } });
  assert.equal(typeof p.ctx.__bench.reset, 'function');
  const first = p.ctx.__bench;
  p.install({ q: { kind: 'querySelector', selector: '.x' } });
  assert.equal(p.ctx.__bench, first, 'second install is a no-op');
  assert.match(installSource({ probes: {} }), /^\(function benchPage\(cfg\)/);
  assert.equal(benchPage.length, 1);
});

test('setProperty: prop filter, receiver selector, no-op writes; counts only while recording; keeps this/return', () => {
  const p = makePage();
  p.install({
    all: { kind: 'setProperty', prop: '--future-shrink' },
    onFuture: { kind: 'setProperty', prop: '--future-shrink', selector: '.start-selling-future' },
    noop: { kind: 'setProperty', prop: '--future-shrink', noop: true },
  });
  p.run('future.style.setProperty("--future-shrink", 0.5)'); // not recording
  assert.equal(p.run(RESET('w')), true);
  const a0 = p.ctx.__bench.activity;
  assert.equal(p.run('future.style.setProperty("--future-shrink", 0.4)'), 'set:--future-shrink', 'return value kept');
  assert.equal(p.run('future.style.getPropertyValue("--future-shrink")'), '0.4', 'the write happened');
  p.run('future.style.setProperty("--future-shrink", 0.4)'); // same value: a no-op write
  p.run('card.style.setProperty("--future-shrink", 1)');
  p.run('card.style.setProperty("--other", 1)');
  p.run('__bench.internal(() => future.style.setProperty("--future-shrink", 9))'); // runner's own: never counted
  assert.deepEqual(p.val(READ('w')), { label: 'w', counts: { all: 3, onFuture: 2, noop: 1 }, frames: 0, errors: [] });
  assert.equal(p.ctx.__bench.activity - a0, 2, 'value changes seen by a write probe are quiescence activity (not the no-op write, the unprobed --other, or the runner\'s own)');
  p.run('future.style.setProperty("--future-shrink", 0.1)');
  assert.deepEqual(p.val(READ('w')).counts, { all: 3, onFuture: 2, noop: 1 }, 'not recording after read');
});

test('styleWrite wraps the style accessor setter; inlineProp counts changes of one custom property in the style attribute', () => {
  const p = makePage();
  p.install({
    pe: { kind: 'styleWrite', prop: 'pointerEvents', selector: '.top-nav' },
    h: { kind: 'styleWrite', prop: 'height' },
    missing: { kind: 'styleWrite', prop: 'noSuchProp' },
    plat: { kind: 'inlineProp', selector: '.start-selling-future', prop: '--platform-shrink' },
  });
  p.run(RESET('w'));
  p.run('nav.style.pointerEvents = "none"; card.style.pointerEvents = "auto"; card.style.height = "3px"');
  assert.equal(p.run('nav.style.pointerEvents'), 'none', 'setter still applied');
  p.run('mutate(future, "style", "--platform-shrink: 0.1; color: red", "--platform-shrink: 0.2; color: red")');
  p.run('mutate(future, "style", "--platform-shrink: 0.2; color: red", "--platform-shrink: 0.2; color: blue")'); // prop unchanged
  p.run('mutate(card, "style", "--platform-shrink: 0.2", "--platform-shrink: 0.3")'); // other element
  p.run('mutate(future, "style", "--platform-shrink: 0.2; color: blue", "color: blue")'); // removed
  // records are delivered in batches: each one's new value is the next record's oldValue
  const r = p.val(READ('w')); // read() flushes the pending records itself
  assert.deepEqual(r.counts, { pe: 1, h: 1, missing: 0, plat: 2 });
  assert.deepEqual(r.errors, ['styleWrite: no style accessor "noSuchProp" on this browser']);
  assert.deepEqual(p.val('observers[0].opts'), { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style'] });
});

test('styleWrite on the Chrome shape (own camelCase properties, I-028): el.style is a Proxy that sees the writes; same object, methods and setProperty probes still work', () => {
  const p = makePage({ chromeStyle: true });
  p.run('document.createElement = () => new HTMLElement("div")');
  assert.equal(p.run('Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "height")'), undefined, 'the real shape: nothing on the prototype');
  assert.equal(p.run('Object.getOwnPropertyDescriptor(card.style, "height").configurable'), false);
  p.install({
    tf: { kind: 'styleWrite', prop: 'transform', selector: '.top-nav' },
    h: { kind: 'styleWrite', prop: 'height' },
    sp: { kind: 'setProperty', prop: '--x', selector: '.card' },
    missing: { kind: 'styleWrite', prop: 'noSuchProp' },
    raw: { kind: 'readAfterWrite', selector: '.card' },
  });
  assert.equal(p.run('nav.style === nav.style'), true, 'one Proxy per declaration');
  assert.equal(p.run('nav.style instanceof CSSStyleDeclaration'), true);
  p.run('nav.style.transform = "translateY(1px)"'); // not recording
  p.run(RESET('w'));
  const a0 = p.ctx.__bench.activity;
  p.run('nav.style.transform = "translateY(2px)"; nav.style.transform = "translateY(2px)"; card.style.transform = "none"; card.style.height = "3px"');
  assert.equal(p.run('nav.style.transform'), 'translateY(2px)', 'the write reached the declaration');
  assert.equal(p.run('nav._s._p.transform'), 'translateY(2px)');
  assert.equal(p.run('card.style.setProperty("--x", 1)'), 'set:--x', 'methods are bound to the real declaration (this, return value)');
  assert.equal(p.run('card.style.getPropertyValue("--x")'), '1');
  p.run('card.style.width = "5px"; card.getBoundingClientRect()'); // an unprobed camelCase write still marks the frame dirty
  p.run('__bench.internal(() => { nav.style.transform = "x" })'); // the runner's own: never counted
  const r = p.val(READ('w'));
  assert.deepEqual(r.counts, { tf: 2, h: 1, sp: 1, missing: 0, raw: 1 });
  assert.deepEqual(r.errors, ['styleWrite: no style property "noSuchProp" on this browser']);
  assert.equal(p.ctx.__bench.activity - a0, 3, 'value changes: nav transform once (the repeat is a no-op), card height, --x');
  assert.equal(p.run('__bench.uninstall()'), true);
  assert.equal(p.run('nav.style === nav._s'), true, 'uninstall restores the plain declaration');
});

test('installed at document start (no documentElement yet): style accessors and DOM writes are still wrapped; the observer starts at DOMContentLoaded', () => {
  const p = makePage();
  p.run('var dcl = []; document.addEventListener = (t, f) => dcl.push([t, f]); var realRoot = document.documentElement; document.documentElement = null');
  p.install({ h: { kind: 'styleWrite', prop: 'height' }, raw: { kind: 'readAfterWrite' }, plat: { kind: 'inlineProp', selector: '.start-selling-future', prop: '--p' } });
  assert.equal(p.run('observers.length'), 0, 'no root to observe yet');
  p.run('document.documentElement = realRoot; for (const [t, f] of dcl) if (t === "DOMContentLoaded") f()');
  assert.equal(p.run('observers.length'), 1);
  p.run(RESET('w'));
  p.run('card.style.height = "3px"; card.getBoundingClientRect(); card.setAttribute("x", 1); card.getBoundingClientRect()');
  p.run('mutate(future, "style", "--p: 1", "--p: 2")');
  assert.deepEqual(p.val(READ('w')).counts, { h: 1, raw: 2, plat: 1 });
  assert.deepEqual(p.val(READ('w')).errors, []);
});

test('layoutRead: every method, method filter, subtree selector; getters return the original values', () => {
  const p = makePage();
  p.install({
    any: { kind: 'layoutRead' },
    rect: { kind: 'layoutRead', method: 'getBoundingClientRect' },
    inFuture: { kind: 'layoutRead', selector: '.start-selling-future' },
    range: { kind: 'layoutRead', method: 'Range.getClientRects', selector: '.start-selling-future' },
  });
  p.run(RESET('w'));
  assert.equal(p.run('card.getBoundingClientRect().self === card'), true, 'this kept');
  assert.equal(p.run('nav.getBoundingClientRect().top'), 2000);
  assert.equal(p.run('card.offsetTop'), 42);
  assert.equal(p.run('nav.clientWidth'), 111);
  assert.equal(p.run('getComputedStyle(card).el === card'), true);
  assert.equal(p.run('new Range(card).getClientRects()'), 'range-rects');
  assert.equal(p.run('document.elementFromPoint(1, 2)'), 'efp');
  assert.deepEqual(p.val(READ('w')).counts, { any: 7, rect: 2, inFuture: 4, range: 1 });
});

test('readAfterWrite: a read after a style/DOM write counts once; reads flush; each frame starts clean; subtree filter', () => {
  const p = makePage();
  p.install({ raw: { kind: 'readAfterWrite' }, rawFuture: { kind: 'readAfterWrite', selector: '.start-selling-future' } });
  p.run(RESET('w'));
  p.run('card.getBoundingClientRect()'); // no write yet
  p.run('future.style.setProperty("--x", 1); card.getBoundingClientRect(); card.getBoundingClientRect()'); // 1 forced, then clean
  p.run('card.style.height = "2px"; nav.offsetTop'); // accessor write, read outside the subtree
  p.run('card.setAttribute("data-x", 1)');
  p.frame(); // the runner's rAF callback clears the flag
  p.run('card.getBoundingClientRect()');
  p.run('card.className = "card b"; getComputedStyle(card)');
  p.run('__bench.internal(() => card.style.height = "9px"); card.getBoundingClientRect()'); // runner's write: not dirty
  assert.deepEqual(p.val(READ('w')).counts, { raw: 3, rawFuture: 2 });
});

test('matchMedia by exact query (whitespace-normalised), querySelector by argument, rAF and timer registrations', () => {
  const p = makePage();
  p.install({
    mq: { kind: 'matchMedia', query: '(min-width: 861px)' },
    qs: { kind: 'querySelector', selector: '.top-nav' },
    raf: { kind: 'raf' },
    timers: { kind: 'timer' },
    intervals: { kind: 'timer', type: 'setInterval' },
  });
  p.run(RESET('w'));
  assert.equal(p.run('matchMedia("(min-width:  861px)").media'), '(min-width:  861px)');
  p.run('matchMedia("(max-width: 860px)")');
  assert.equal(p.run('document.querySelector(".top-nav")'), nav_(p));
  p.run('document.querySelectorAll(".top-nav"); card.querySelector(".top-nav"); document.querySelector(".card")');
  p.run('requestAnimationFrame(() => {}); requestAnimationFrame(() => {})');
  assert.equal(p.run('setTimeout(() => {}, 1)'), 'timeout-id');
  assert.equal(p.run('setInterval(() => {}, 1)'), 'interval-id');
  p.frame(); p.frame(); // the runner's own frame loop is never counted as page rAF
  const r = p.val(READ('w'));
  assert.deepEqual(r.counts, { mq: 1, qs: 3, raf: 2, timers: 2, intervals: 1 });
  assert.equal(r.frames, 2, 'frames seen while recording');
  p.frame();
  assert.equal(p.val(READ('w')).frames, 2, 'no frames counted after read');
});
const nav_ = (p) => p.ctx.nav;

test('animations: distinct running animations whose target is under the selector and that animate a listed property', () => {
  const p = makePage();
  p.install({
    layoutProps: { kind: 'animations', selector: '.start-selling-future', props: ['width', 'margin-right'] },
    offscreen: { kind: 'animations', name: 'sweep', offscreen: true },
  });
  p.run(`anims = [
    { playState: 'running', animationName: 'avatars-exit', effect: { target: card, getKeyframes: () => [{ offset: 0, width: '10px', easing: 'linear' }, { marginRight: '0px' }] } },
    { playState: 'paused', animationName: 'avatars-exit', effect: { target: card, getKeyframes: () => [{ width: '1px' }] } },
    { playState: 'running', animationName: 'fade', effect: { target: card, getKeyframes: () => [{ opacity: 0 }] } },
    { playState: 'running', transitionProperty: 'width', effect: { target: nav, getKeyframes: () => [{ width: '1px' }] } },
    { playState: 'running', animationName: 'title-sweep', effect: { target: nav, getKeyframes: () => [{ backgroundPosition: '0 0' }] } },
  ]`);
  p.run(RESET('w'));
  p.frame(); p.frame(); p.frame();
  const r = p.val(READ('w'));
  assert.deepEqual(r.counts, { layoutProps: 1, offscreen: 1 }, 'each animation counted once over the window');
  assert.equal(r.frames, 3);
});

test('quiesce: resolves after 2 frames without activity, capped at 40 frames with continuous writes', async () => {
  const p = makePage();
  p.install({ w: { kind: 'setProperty', prop: '--x' }, h: { kind: 'styleWrite', prop: 'height' }, ip: { kind: 'inlineProp', selector: '.card', prop: '--p' } });
  let q = p.run(QUIESCE());
  p.frame(); p.frame(); p.frame();
  assert.deepEqual(JSON.parse(JSON.stringify(await q)), { frames: 2, capped: false });
  q = p.run(QUIESCE(2, 5));
  for (let i = 0; i < 6; i++) { p.run('future.style.setProperty("--x", Math.random())'); p.frame(); }
  assert.deepEqual(JSON.parse(JSON.stringify(await q)), { frames: 5, capped: true });
  // the same value written every frame (a loop that re-applies a transform) is settled
  q = p.run(QUIESCE(2, 5));
  for (let i = 0; i < 6; i++) { p.run('future.style.setProperty("--x", "same"); card.style.height = "5px"; mutate(card, "style", "--p: 1", "--p: 1"); deliver()'); p.frame(); }
  assert.deepEqual(JSON.parse(JSON.stringify(await q)), { frames: 3, capped: false });
  // the page's own animations (unprobed properties, other attributes) never hold a step open
  q = p.run(QUIESCE(2, 5));
  for (let i = 0; i < 6; i++) { p.run(`future.style.setProperty("--other", ${i}); card.style.width = "${i}px"; mutate(card, "class", "a", "b${i}"); deliver()`); p.frame(); }
  assert.deepEqual(JSON.parse(JSON.stringify(await q)), { frames: 2, capped: false });
  // a probed inline custom property that changes is activity
  q = p.run(QUIESCE(2, 40));
  const a0 = p.ctx.__bench.activity;
  p.run('mutate(card, "style", "--p: 1", "--p: 2"); deliver()');
  assert.equal(p.ctx.__bench.activity - a0, 1);
  for (let i = 0; i < 4; i++) p.frame();
  assert.equal((await q).capped, false);
});

test('snapshot and geometry never count; scrollTo from the runner is not counted either', () => {
  const p = makePage();
  p.install({ reads: { kind: 'layoutRead' }, qs: { kind: 'querySelector', selector: '.card' } });
  p.run(RESET('w'));
  p.run('future.style.setProperty("--future-shrink", "0.3")');
  const snap = p.val(SNAPSHOT({ classes: ['.card'], props: [['.card', '--future-shrink'], ['.start-selling-future', '--future-shrink']], attrs: [['.top-nav', 'data-y']] }));
  assert.deepEqual(snap, { 'class .card': ['card'], 'prop .card --future-shrink': '', 'prop .start-selling-future --future-shrink': '0.3', 'attr .top-nav data-y': [null] });
  p.run('document.documentElement.scrollHeight = 5000');
  const g = p.val(GEOMETRY({ segments: { nav: { from: '.top-nav', to: 'end', before: 1 }, bad: { from: '.nope', to: 'end' }, empty: { from: '.top-nav', to: '.top-nav' } }, spots: { top: { at: 'top' }, nav: { at: '.top-nav', offset: -0.5 } } }));
  assert.deepEqual(g, { maxY: 4100, innerHeight: 900, segments: { nav: { start: 1100, end: 4100 }, bad: { error: 'no element .nope' }, empty: { error: 'empty segment: .top-nav .. .top-nav (2000 .. 2000)' } }, spots: { top: { y: 0 }, nav: { y: 1550 } } });
  assert.equal(p.run(SCROLL_TO(300)), 300);
  assert.deepEqual(p.val(READ('w')).counts, { reads: 0, qs: 0 });
});

test('a bad selector is reported in errors and never matches; uninstall restores every original', () => {
  const p = makePage();
  const before = {
    sp: p.run('CSSStyleDeclaration.prototype.setProperty'),
    rect: p.run('Element.prototype.getBoundingClientRect'),
    style: p.run('Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style").get'),
    height: p.run('Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "height").set'),
    mm: p.run('matchMedia'), gcs: p.run('getComputedStyle'), raf: p.run('requestAnimationFrame'), st: p.run('setTimeout'),
    qs: p.run('Document.prototype.querySelector'),
  };
  p.install({
    bad: { kind: 'layoutRead', selector: 'a[[b' },
    sp: { kind: 'setProperty', prop: '--x', selector: '.card' },
    h: { kind: 'styleWrite', prop: 'height' },
    raw: { kind: 'readAfterWrite' },
    mm: { kind: 'matchMedia', query: '(x)' }, raf: { kind: 'raf' }, t: { kind: 'timer' }, qs: { kind: 'querySelector', selector: '.a' },
    ip: { kind: 'inlineProp', selector: '.card', prop: '--p' }, // the mutation observer runs only for inlineProp probes
  });
  assert.notEqual(p.run('CSSStyleDeclaration.prototype.setProperty'), before.sp);
  p.run(RESET('w'));
  p.run('card.getBoundingClientRect()');
  const r = p.val(READ('w'));
  assert.equal(r.counts.bad, 0);
  assert.deepEqual(r.errors, ['bad selector a[[b']);
  assert.equal(p.run('__bench.uninstall()'), true);
  assert.equal(p.run('typeof __bench'), 'undefined');
  assert.equal(p.run('CSSStyleDeclaration.prototype.setProperty'), before.sp);
  assert.equal(p.run('Element.prototype.getBoundingClientRect'), before.rect);
  assert.equal(p.run('Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style").get'), before.style);
  assert.equal(p.run('Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "height").set'), before.height);
  for (const k of ['mm', 'gcs', 'raf', 'st', 'qs']) assert.equal(p.run({ mm: 'matchMedia', gcs: 'getComputedStyle', raf: 'requestAnimationFrame', st: 'setTimeout', qs: 'Document.prototype.querySelector' }[k]), before[k], k);
  assert.equal(p.run('observers[0].off'), true, 'mutation observer disconnected');
});

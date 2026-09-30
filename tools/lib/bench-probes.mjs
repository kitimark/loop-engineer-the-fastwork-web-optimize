// Page side of Tier A (tools/bench.mjs mech): exact in-page counters, installed before any page script
// with Page.addScriptToEvaluateOnNewDocument, parameterised only by the data in fixes/<topic>/bench.json.
// Kept free of side effects (exported strings and pure helpers) so tests/unit/bench-probes.test.mjs runs
// the exact page code in node:vm, as tests/unit/perf-page.test.mjs does for verify.mjs.
//
// Wrappers keep `this`, the arguments and the return value (Reflect.apply), count only while a window is
// recording (reset .. read) and never while the runner itself reads the page (snapshot, geometry: the
// `paused` counter). Probes attribute by receiver, selector or argument, never by stack or function names.
//
// readAfterWrite (design §2, Q6) is a JS-side proxy for forced layout: a flag set by any wrapped style or
// DOM write, cleared at the start of each frame (the runner's own rAF callback, registered first) and by
// every layout read (a read flushes layout); a layout read while the flag is set counts. An upper bound.
//
// Quiescence: `activity` counts value CHANGES (setProperty and style accessor writes whose value differs
// from the current one, class/style attribute mutations whose value differs), recording or not; a loop
// that rewrites the same value every frame is settled. quiesce() waits for 2 frames without activity
// (capped at 40 frames).

/** The page function. Stringified into the page; never called in Node except by the vm tests. */
export function benchPage(cfg) {
  const W = window;
  if (W.__bench) return;
  const probes = cfg.probes || {};
  const ids = Object.keys(probes);
  const kinds = new Set(ids.map((id) => probes[id].kind));
  const WRITE_KINDS = { setProperty: 1, inlineProp: 1, styleWrite: 1 };
  const B = W.__bench = { on: false, label: null, paused: 0, activity: 0, frames: 0, dirty: false, counts: {}, errors: [], restore: [], seen: {}, version: 1 };
  const origRaf = W.requestAnimationFrame && W.requestAnimationFrame.bind(W);
  const err = (m) => { if (B.errors.length < 50 && B.errors.indexOf(m) < 0) B.errors.push(m); };
  const hit = (id) => { if (B.on && !B.paused) B.counts[id] = (B.counts[id] || 0) + 1; };
  const matches = (el, sel) => { if (!sel) return true; try { return !!(el && el.nodeType === 1 && el.matches(sel)); } catch (e) { err('bad selector ' + sel); return false; } };
  const within = (el, sel) => { if (!sel) return true; try { return !!(el && el.nodeType === 1 && el.closest(sel)); } catch (e) { err('bad selector ' + sel); return false; } };
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  function patch(obj, name, make, accessor) {
    if (!obj) return false;
    const d = Object.getOwnPropertyDescriptor(obj, name);
    if (!d) return false;
    const nd = { ...d };
    if (accessor === 'get' && d.get) nd.get = make(d.get);
    else if (accessor === 'set' && d.set) nd.set = make(d.set);
    else if (!accessor && typeof d.value === 'function') nd.value = make(d.value);
    else return false;
    Object.defineProperty(obj, name, nd);
    B.restore.push(() => Object.defineProperty(obj, name, d));
    return true;
  }
  /** Find the prototype on the chain of `o` that owns `name`. */
  const owner = (o, name) => { for (let p = o; p; p = Object.getPrototypeOf(p)) if (Object.getOwnPropertyDescriptor(p, name)) return p; return null; };

  // ---- which element owns a CSSStyleDeclaration (for receiver selectors) ----------------------------
  const declEl = new WeakMap();
  const needOwner = ids.some((id) => (probes[id].kind === 'setProperty' || probes[id].kind === 'styleWrite') && probes[id].selector);
  if (needOwner) for (const C of [W.HTMLElement, W.SVGElement, W.MathMLElement]) {
    if (!C) continue;
    patch(C.prototype, 'style', (get) => function () { const s = Reflect.apply(get, this, arguments); if (s && typeof s === 'object') declEl.set(s, this); return s; }, 'get');
  }

  // ---- writes: the dirty flag for readAfterWrite, plus the write-kind probes ---------------------------
  const markWrite = () => { if (!B.paused) B.dirty = true; };
  const DECL = W.CSSStyleDeclaration && W.CSSStyleDeclaration.prototype;
  const spProbes = ids.filter((id) => probes[id].kind === 'setProperty');
  if (DECL) {
    const getPV = DECL.getPropertyValue, getPP = DECL.getPropertyPriority;
    patch(DECL, 'setProperty', (orig) => function (prop, value, prio) {
      if (!B.paused) {
        markWrite();
        try { if (getPV.call(this, prop) !== String(value == null ? '' : value).trim()) B.activity++; } catch (e) {}
        for (const id of spProbes) {
          const p = probes[id];
          if (p.prop !== prop) continue;
          if (p.selector && !matches(declEl.get(this), p.selector)) continue;
          if (p.noop) {
            let same = false;
            try { same = getPV.call(this, prop) === String(value == null ? '' : value).trim() && (getPP.call(this, prop) || '') === (prio || ''); } catch (e) {}
            if (!same) continue;
          }
          hit(id);
        }
      }
      return Reflect.apply(orig, this, arguments);
    });
    patch(DECL, 'removeProperty', (orig) => function () { markWrite(); return Reflect.apply(orig, this, arguments); });
    patch(DECL, 'cssText', (set) => function () { markWrite(); return Reflect.apply(set, this, arguments); }, 'set');
  }
  // style accessors (el.style.height = ...): wrap the setters on the prototype that owns each one
  const swProbes = ids.filter((id) => probes[id].kind === 'styleWrite');
  const sample = W.document && W.document.documentElement && W.document.documentElement.style;
  const wrapAccessor = (prop, onSet) => {
    const o = sample && owner(sample, prop);
    const get = o && Object.getOwnPropertyDescriptor(o, prop).get;
    if (!o || !patch(o, prop, (set) => function (v) {
      let changed = true;
      try { changed = !get || String(get.call(this)) !== String(v == null ? '' : v); } catch (e) {}
      onSet(this, changed);
      return Reflect.apply(set, this, arguments);
    }, 'set')) return false;
    return true;
  };
  const wrappedAcc = new Set();
  for (const id of swProbes) {
    const p = probes[id];
    if (wrappedAcc.has(p.prop)) continue;
    wrappedAcc.add(p.prop);
    const mine = swProbes.filter((x) => probes[x].prop === p.prop);
    if (!wrapAccessor(p.prop, (decl, changed) => {
      if (B.paused) return;
      markWrite();
      if (changed) B.activity++;
      for (const x of mine) if (!probes[x].selector || matches(declEl.get(decl), probes[x].selector)) hit(x);
    })) err('styleWrite: no style accessor "' + p.prop + '" on this browser');
  }
  if (kinds.has('readAfterWrite') && sample) {
    // every other style accessor only marks the frame dirty
    const seen = new Set(wrappedAcc);
    for (let o = sample; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of Object.getOwnPropertyNames(o)) {
        if (seen.has(name) || name === 'cssText' || name === 'length' || name === 'parentRule') continue;
        const d = Object.getOwnPropertyDescriptor(o, name);
        if (!d || !d.set || !d.configurable) continue;
        seen.add(name);
        patch(o, name, (set) => function () { markWrite(); return Reflect.apply(set, this, arguments); }, 'set');
      }
    }
    const E = W.Element && W.Element.prototype, N = W.Node && W.Node.prototype, TL = W.DOMTokenList && W.DOMTokenList.prototype;
    for (const [o, names] of [[E, ['setAttribute', 'removeAttribute', 'toggleAttribute', 'append', 'prepend', 'remove', 'before', 'after', 'replaceWith', 'insertAdjacentElement', 'insertAdjacentHTML']], [N, ['appendChild', 'insertBefore', 'removeChild', 'replaceChild']], [TL, ['add', 'remove', 'toggle', 'replace']]]) {
      if (o) for (const n of names) patch(o, n, (orig) => function () { markWrite(); return Reflect.apply(orig, this, arguments); });
    }
    for (const [o, n] of [[E, 'className'], [E, 'innerHTML'], [N, 'textContent'], [W.CharacterData && W.CharacterData.prototype, 'data']]) patch(o, n, (set) => function () { markWrite(); return Reflect.apply(set, this, arguments); }, 'set');
  }

  // ---- layout reads ---------------------------------------------------------------------------------
  const lrProbes = ids.filter((id) => probes[id].kind === 'layoutRead');
  const rawProbes = ids.filter((id) => probes[id].kind === 'readAfterWrite');
  const onRead = (method, el) => {
    if (B.paused) return;
    for (const id of lrProbes) { const p = probes[id]; if ((!p.method || p.method === method) && within(el, p.selector)) hit(id); }
    if (B.dirty) for (const id of rawProbes) if (within(el, probes[id].selector)) hit(id);
    B.dirty = false; // a read flushes style and layout
  };
  if (lrProbes.length || rawProbes.length) {
    const E = W.Element && W.Element.prototype, H = W.HTMLElement && W.HTMLElement.prototype, R = W.Range && W.Range.prototype, D = W.Document && W.Document.prototype;
    for (const m of ['getBoundingClientRect', 'getClientRects']) {
      patch(E, m, (orig) => function () { onRead(m, this); return Reflect.apply(orig, this, arguments); });
      patch(R, m, (orig) => function () { const c = this.startContainer; onRead('Range.' + m, c && (c.nodeType === 1 ? c : c.parentElement)); return Reflect.apply(orig, this, arguments); });
    }
    for (const m of ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent']) patch(H, m, (get) => function () { onRead(m, this); return Reflect.apply(get, this, arguments); }, 'get');
    for (const m of ['clientTop', 'clientLeft', 'clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight']) patch(E, m, (get) => function () { onRead(m, this); return Reflect.apply(get, this, arguments); }, 'get');
    for (const m of ['elementFromPoint', 'elementsFromPoint']) patch(D, m, (orig) => function () { onRead(m, null); return Reflect.apply(orig, this, arguments); });
    if (typeof W.getComputedStyle === 'function') {
      const orig = W.getComputedStyle;
      W.getComputedStyle = function (el) { onRead('getComputedStyle', el); return Reflect.apply(orig, this, arguments); };
      B.restore.push(() => { W.getComputedStyle = orig; });
    }
  }

  // ---- matchMedia, querySelector, rAF, timers --------------------------------------------------------
  const mmProbes = ids.filter((id) => probes[id].kind === 'matchMedia');
  if (mmProbes.length && typeof W.matchMedia === 'function') {
    const orig = W.matchMedia;
    W.matchMedia = function (q) { if (!B.paused) for (const id of mmProbes) if (norm(probes[id].query) === norm(q)) hit(id); return Reflect.apply(orig, this, arguments); };
    B.restore.push(() => { W.matchMedia = orig; });
  }
  const qsProbes = ids.filter((id) => probes[id].kind === 'querySelector');
  if (qsProbes.length) {
    for (const C of [W.Document, W.Element, W.DocumentFragment]) for (const m of ['querySelector', 'querySelectorAll']) {
      patch(C && C.prototype, m, (orig) => function (sel) { if (!B.paused) for (const id of qsProbes) if (probes[id].selector === sel) hit(id); return Reflect.apply(orig, this, arguments); });
    }
  }
  const rafProbes = ids.filter((id) => probes[id].kind === 'raf');
  if (rafProbes.length && origRaf) {
    const orig = W.requestAnimationFrame;
    W.requestAnimationFrame = function () { if (!B.paused) for (const id of rafProbes) hit(id); return Reflect.apply(orig, this, arguments); };
    B.restore.push(() => { W.requestAnimationFrame = orig; });
  }
  for (const type of ['setTimeout', 'setInterval']) {
    const tp = ids.filter((id) => probes[id].kind === 'timer' && (!probes[id].type || probes[id].type === type));
    if (!tp.length || typeof W[type] !== 'function') continue;
    const orig = W[type];
    W[type] = function () { if (!B.paused) for (const id of tp) hit(id); return Reflect.apply(orig, this, arguments); };
    B.restore.push(() => { W[type] = orig; });
  }

  // ---- attribute mutations: inlineProp probes + quiescence activity ----------------------------------
  const ipProbes = ids.filter((id) => probes[id].kind === 'inlineProp');
  const propIn = (style, prop) => { const m = String(style || '').match(new RegExp('(?:^|;)\\s*' + prop.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*:\\s*([^;]*)')); return m ? m[1].trim() : null; };
  let mo = null;
  const onMutations = (list) => {
    // the new value of a mutation is the next record's oldValue for the same element and attribute, or,
    // for the last one in this batch, the attribute's current value
    const next = new Map();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      let per = next.get(m.target);
      if (!per) next.set(m.target, (per = {}));
      m.__new = m.attributeName in per ? per[m.attributeName] : m.target.getAttribute(m.attributeName);
      per[m.attributeName] = m.oldValue;
    }
    for (const m of list) {
      if (!B.paused && m.oldValue !== m.__new) B.activity++; // only real changes: same-value rewrites never settle otherwise
      if (m.attributeName !== 'style') continue;
      for (const id of ipProbes) {
        const p = probes[id];
        if (!matches(m.target, p.selector)) continue;
        if (propIn(m.oldValue, p.prop) !== propIn(m.__new, p.prop)) hit(id);
      }
    }
  };
  const startMo = () => {
    if (mo || typeof W.MutationObserver !== 'function' || !W.document || !W.document.documentElement) return;
    mo = new W.MutationObserver(onMutations);
    mo.observe(W.document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class'] });
  };
  startMo();
  if (!mo && W.document && W.document.addEventListener) W.document.addEventListener('DOMContentLoaded', startMo);
  const flush = () => { if (mo) onMutations(mo.takeRecords()); };

  // ---- animations: sampled once per frame while recording --------------------------------------------
  const anProbes = ids.filter((id) => probes[id].kind === 'animations');
  const animated = (a) => { const out = []; try { for (const k of a.effect.getKeyframes()) for (const n of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(n)) out.push(n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())); } catch (e) {} if (a.transitionProperty) out.push(a.transitionProperty); return out; };
  const sampleAnimations = () => {
    if (!anProbes.length || !W.document || typeof W.document.getAnimations !== 'function') return;
    B.paused++;
    try {
      for (const a of W.document.getAnimations()) {
        const t = a.effect && a.effect.target;
        for (const id of anProbes) {
          const p = probes[id];
          const seen = B.seen[id] || (B.seen[id] = new WeakSet());
          if (seen.has(a)) continue;
          if ((p.state || 'running') === 'running' && a.playState !== 'running') continue;
          if (p.selector && !within(t, p.selector)) continue;
          if (p.name && String(a.animationName || a.transitionProperty || a.id || '').indexOf(p.name) < 0) continue;
          if (p.props && !animated(a).some((x) => p.props.includes(x))) continue;
          if (p.offscreen) { const r = t && t.getBoundingClientRect(); if (!r || (r.bottom > 0 && r.top < W.innerHeight)) continue; }
          seen.add(a);
          B.counts[id] = (B.counts[id] || 0) + 1;
        }
      }
    } finally { B.paused--; }
  };

  // ---- the runner's frame loop: first rAF callback of every frame --------------------------------------
  B.stopped = false;
  const frame = () => {
    if (B.stopped) return;
    B.dirty = false;
    if (B.on) { B.frames++; sampleAnimations(); }
    B.tick = (B.tick || 0) + 1;
    origRaf(frame);
  };
  if (origRaf) origRaf(frame);

  // ---- the runner's API (called through Runtime.evaluate) ---------------------------------------------
  B.reset = (label) => { flush(); B.counts = {}; for (const id of ids) B.counts[id] = 0; B.seen = {}; B.frames = 0; B.label = label; B.on = true; return true; };
  B.read = (label) => {
    flush();
    B.on = false;
    const counts = {};
    for (const id of ids) counts[id] = B.counts[id] || 0;
    return { label, counts, frames: B.frames, errors: B.errors.slice() };
  };
  B.quiesce = (need = 2, cap = 40) => new Promise((res) => {
    let quiet = 0, frames = 0, last = (flush(), B.activity);
    const step = () => {
      flush();
      frames++;
      if (B.activity === last) quiet++; else { quiet = 0; last = B.activity; }
      if (quiet >= need) return res({ frames, capped: false });
      if (frames >= cap) return res({ frames, capped: true });
      origRaf(step);
    };
    origRaf(step);
  });
  B.internal = (fn) => { B.paused++; try { return fn(); } finally { B.paused--; } };
  B.uninstall = () => { B.stopped = true; if (mo) mo.disconnect(); while (B.restore.length) B.restore.pop()(); delete W.__bench; return true; };
}

/** Parity snapshot of the listed classes, computed custom properties and attributes (never counted). */
export function benchSnapshot(spec) {
  const B = window.__bench;
  const run = () => {
    const out = {};
    const all = (sel) => { try { return Array.from(document.querySelectorAll(sel)).slice(0, 50); } catch (e) { return null; } };
    for (const sel of spec.classes || []) { const els = all(sel); out['class ' + sel] = els ? els.map((e) => (e.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort().join(' ')) : 'bad selector'; }
    for (const [sel, prop] of spec.props || []) { const els = all(sel); out['prop ' + sel + ' ' + prop] = els && els[0] ? getComputedStyle(els[0]).getPropertyValue(prop).trim() : null; }
    for (const [sel, attr] of spec.attrs || []) { const els = all(sel); out['attr ' + sel + ' ' + attr] = els ? els.map((e) => e.getAttribute(attr)) : 'bad selector'; }
    return out;
  };
  return B ? B.internal(run) : run();
}

/** Scroll bounds of segments and spots, measured at the current scroll position (the runner is at 0). */
export function benchGeometry(g) {
  const B = window.__bench;
  const run = () => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const top = (sel) => { let e; try { e = document.querySelector(sel); } catch (x) { return { error: 'bad selector ' + sel }; } if (!e) return { error: 'no element ' + sel }; return { y: e.getBoundingClientRect().top + scrollY }; };
    const clamp = (y) => Math.round(Math.min(maxY, Math.max(0, y)));
    const out = { maxY, innerHeight, segments: {}, spots: {} };
    for (const [n, s] of Object.entries(g.segments || {})) {
      const f = s.from === 'top' ? { y: 0 } : top(s.from);
      const t = s.to === 'end' ? { y: maxY } : top(s.to);
      if (f.error || t.error) { out.segments[n] = { error: f.error || t.error }; continue; }
      const start = clamp(f.y - (s.before || 0) * innerHeight), end = clamp(t.y);
      out.segments[n] = end > start ? { start, end } : { error: 'empty segment: ' + s.from + ' .. ' + s.to + ' (' + start + ' .. ' + end + ')' };
    }
    for (const [n, s] of Object.entries(g.spots || {})) {
      const a = s.at === 'top' ? { y: 0 } : top(s.at);
      out.spots[n] = a.error ? { error: a.error } : { y: clamp(a.y + (s.offset || 0) * innerHeight) };
    }
    return out;
  };
  return B ? B.internal(run) : run();
}

/** Wait for fonts and images (capped), then two frames. */
export function benchSettle(maxMs) {
  const imgs = Array.from(document.images || []).filter((i) => !i.complete);
  const timeout = new Promise((r) => setTimeout(r, maxMs));
  const all = Promise.all([document.fonts ? document.fonts.ready : null, ...imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))]);
  return Promise.race([all, timeout]).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r({ pendingImages: Array.from(document.images || []).filter((i) => !i.complete).length })))));
}

// ---- expressions the runner sends (tests check the runner sends exactly these) ------------------------
const call = (fn, ...a) => `(${fn.toString()})(${a.map((x) => JSON.stringify(x)).join(', ')})`;
/** Source for Page.addScriptToEvaluateOnNewDocument: the probes of `cfg.probes` ({id: probe}). */
export const installSource = (cfg) => call(benchPage, { probes: cfg.probes || {} });
export const RESET = (label) => `window.__bench.reset(${JSON.stringify(label)})`;
export const READ = (label) => `window.__bench.read(${JSON.stringify(label)})`;
export const QUIESCE = (need = 2, cap = 40) => `window.__bench.quiesce(${need}, ${cap})`;
export const SCROLL_TO = (y) => `(window.__bench ? window.__bench.internal(() => window.scrollTo({ top: ${Number(y)}, behavior: 'instant' })) : window.scrollTo({ top: ${Number(y)}, behavior: 'instant' }), window.scrollY)`;
export const SNAPSHOT = (spec) => call(benchSnapshot, spec);
export const GEOMETRY = (g) => call(benchGeometry, g);
export const SETTLE = (maxMs = 10000) => call(benchSettle, maxMs);
export const ERRORS = 'window.__bench ? window.__bench.errors.slice() : ["probes not installed"]';

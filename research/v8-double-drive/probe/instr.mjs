// v8-double-drive: page instrumentation shared by dd-probe.mjs (Chrome) and dd-sim.mjs (WebKit, Simulator).
// Transition event log per (element, property), per-rAF samples of retargeted pairs (computed value vs the running
// CSSTransition end keyframe = the driven target) and per-rAF geometry of the shrink cards and the nav logo.
export const INSTR = `(() => {
  const pn = performance.now.bind(performance), raf = requestAnimationFrame.bind(window);
  const ids = new WeakMap(); let nid = 0; const els = [];
  const desc = (el) => { if (!el || !el.tagName) return '?'; const c = [...el.classList].filter((x) => !/^svelte-/.test(x)).slice(0, 4).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
  const path = (el) => { const p = []; for (let e = el, k = 0; e && e.nodeType === 1 && k < 4; e = e.parentElement, k++) p.unshift(desc(e)); return p.join(' > '); };
  const idOf = (el) => { let i = ids.get(el); if (i === undefined) { i = nid++; ids.set(el, i); els[i] = el; } return i; };
  const D = window.__dd = { ev: [], phase: 'load', seg: -1, samples: [], watch: new Map(), meta: {} };
  const log = (e) => {
    const el = e.target; if (!(el instanceof Element)) return;
    const id = idOf(el), key = id + '|' + e.propertyName + '|' + (e.pseudoElement || '');
    if (!D.meta[id]) D.meta[id] = { path: path(el) };
    D.ev.push([e.type[10] || 'r', Math.round(pn() * 10) / 10, Math.round(scrollY), key, D.phase, D.seg, Math.round(e.elapsedTime * 1000)]);
    if (e.type === 'transitionrun') { const w = D.watch.get(key) || { n: 0 }; w.n++; w.el = el; w.prop = e.propertyName; w.pseudo = e.pseudoElement || ''; D.watch.set(key, w); }
  };
  for (const t of ['transitionrun', 'transitioncancel', 'transitionend']) document.addEventListener(t, log, true);
  const num = (s) => (String(s).match(/-?\\d*\\.?\\d+(e-?\\d+)?/g) || []).map(Number);
  const camel = (p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  // geometry watch: one-frame switches (transform-origin, size, position) under a driven value
  const GEO = ['.commission-card', '.start-selling-future-card', '.start-selling-platform-card', '.start-selling-profile-shell.is-active-shell', '.start-selling-profile-chrome', '.start-selling-top-nav-logo'];
  D.geo = [];
  const r1 = (v) => Math.round(v * 10) / 10;
  const tick = () => {
    if (D.sampleOn) {
      const t = Math.round(pn() * 10) / 10, y = Math.round(scrollY);
      for (const sel of GEO) {
        const el = document.querySelector(sel); if (!el) continue;
        const r = el.getBoundingClientRect(); if (r.bottom < -innerHeight || r.top > 2 * innerHeight) continue;
        const cs = getComputedStyle(el); const sec = el.closest('section, header, .commission, .start-selling-future, .start-selling-platform') || el.parentElement;
        D.geo.push([t, y, sel, r1(r.left), r1(r.top), r1(r.right), r1(r.bottom), cs.transformOrigin, cs.transform.slice(0, 80), String(sec?.className || '').replace(/svelte-\\S+/g, '').replace(/\\s+/g, ' ').trim().slice(0, 160), el.getAnimations().length]);
      }
      for (const [key, w] of D.watch) {
        if (w.n < 2) continue; // only pairs that already retargeted once
        const cs = getComputedStyle(w.el, w.pseudo || null); const cur = cs.getPropertyValue(w.prop);
        const tr = w.el.getAnimations().find((a) => a.transitionProperty === w.prop && a.playState === 'running');
        let tgt = cur, gap = 0;
        if (tr) { const kf = tr.effect.getKeyframes(); const last = kf[kf.length - 1]; tgt = last[camel(w.prop)] ?? last[w.prop] ?? cur;
          const a = num(cur), b = num(tgt); if (a.length && a.length === b.length) gap = Math.max(...a.map((v, i) => Math.abs(v - b[i]))); else gap = cur === tgt ? 0 : NaN; }
        D.samples.push([t, y, key, tr ? 1 : 0, Math.round(gap * 1000) / 1000, D.phase, D.seg]);
      }
    }
    raf(tick);
  };
  raf(tick);
  D.durOf = () => { const o = {}; for (const [key, w] of D.watch) { const cs = getComputedStyle(w.el, w.pseudo || null);
    const props = cs.transitionProperty.split(','), dur = cs.transitionDuration.split(','), del = cs.transitionDelay.split(','), ez = cs.transitionTimingFunction.split(/,(?![^(]*\\))/);
    let i = props.findIndex((p) => p.trim() === w.prop); if (i < 0) i = props.findIndex((p) => p.trim() === 'all');
    o[key] = { n: w.n, path: D.meta[key.split('|')[0]]?.path, prop: w.prop, pseudo: w.pseudo, dur: i < 0 ? null : dur[i % dur.length].trim(), delay: i < 0 ? null : del[i % del.length].trim(), ease: i < 0 ? null : (ez[i % ez.length] || '').trim().slice(0, 60), restNow: cs.getPropertyValue(w.prop).slice(0, 120) }; }
    return o; };
})()`;

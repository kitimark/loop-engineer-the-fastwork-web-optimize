#!/usr/bin/env node
// End-of-page morph logger for the iPhone (WebKit): names the slow frames at the morph pin.
// Injects into the page Safari already shows (no navigation, no reload) and reads the log back later.
// The iphone lease is required (CLAUDE.md "Shared devices"); iphone-runner runs it during a finger test.
//
//   node fixes/morph-webkit/morph-log.mjs install --owner <lease owner>    # after the page has loaded, before the finger run
//   ... the user scrolls to the end and pushes past it (iphone.mjs record may run at the same time) ...
//   node fixes/morph-webkit/morph-log.mjs read --owner <lease owner> --label <label> [--out <file>]
//
// Per animation frame (rAF loop, no layout reads: className, inline style, scrollY, event counters):
//   t, dt, scrollY, --morph (inline style on the nav/morph element), nav morph classes, page rAF callback ms
//   (sum of the page's own rAF callbacks, sync part) + count + the longest one's source head,
//   scrollTo/scrollBy calls (pin) and their target, touchmove/wheel counts (cancelable, defaultPrevented),
//   scroll events, MutationObserver records on the nav/morph panel (class/style), visualViewport height.
// Plus a timeline of touchmove/wheel addEventListener/removeEventListener calls with their passive flag.
// `read` writes the raw log and a summary: frames > 34/50 ms split by morph active/inactive, and for the slow
// frames what happened in them (rAF JS ms vs the rest = style/layout/paint/GPU, pin calls, touch events).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const { openTab } = await import(join(REPO, 'tools/lib/wip.mjs'));
const { status: lockStatus } = await import(join(REPO, 'tools/lib/lock.mjs'));

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const cmd = argv[0];
const owner = opt('owner', process.env.FW_LOCK_OWNER);
const s = lockStatus('iphone');
if (!owner || !s.holder || s.stale || s.holder.owner !== owner) {
  console.error(`morph-log: you ("${owner}") don't hold the iphone lease (holder: ${s.holder?.owner ?? 'none'}). Pass --owner <holder>.`);
  process.exit(2);
}

const INSTALL = `(() => {
  if (window.__ml && !window.__ml.stop) return 'already installed';
  const L = window.__ml = { v: 1, href: location.href, vw: innerWidth, vh0: innerHeight, t0: performance.now(), frames: [], listeners: [], stop: false };
  const nav = () => document.querySelector('header.start-selling-top-nav');
  const morphEl = () => document.querySelector('.start-selling-morph-backdrop') || document.querySelector('.start-selling-morph');
  let cur = { raf: 0, rafN: 0, rafMax: 0, rafMaxSrc: '', pin: 0, pinTop: null, tm: 0, tmCancel: 0, tmPrevented: 0, wh: 0, whPrevented: 0, sc: 0, mut: 0 };
  const reset = () => { cur = { raf: 0, rafN: 0, rafMax: 0, rafMaxSrc: '', pin: 0, pinTop: null, tm: 0, tmCancel: 0, tmPrevented: 0, wh: 0, whPrevented: 0, sc: 0, mut: 0 }; };
  // page rAF callbacks: time each (sync part), keep the longest one's source head
  const rAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => rAF((ts) => { const a = performance.now(); try { return cb(ts); } finally { const d = performance.now() - a; cur.raf += d; cur.rafN++; if (d > cur.rafMax) { cur.rafMax = d; cur.rafMaxSrc = String(cb).slice(0, 80); } } });
  // pin: scrollTo / scrollBy calls
  for (const k of ['scrollTo', 'scrollBy']) { const f = window[k].bind(window); window[k] = (...a) => { cur.pin++; const o = a[0]; cur.pinTop = typeof o === 'object' && o ? o.top : a[1]; return f(...a); }; }
  // listener timeline (passive flag) for touch/wheel on window/document
  for (const tgt of [window, document]) {
    const add = tgt.addEventListener.bind(tgt), rem = tgt.removeEventListener.bind(tgt);
    tgt.addEventListener = (type, fn, o) => { if (/^(touch|wheel)/.test(type)) L.listeners.push([Math.round(performance.now() - L.t0), 'add', type, typeof o === 'object' ? !!o.passive : null, typeof o === 'object' ? !!o.capture : !!o]); return add(type, fn, o); };
    tgt.removeEventListener = (type, fn, o) => { if (/^(touch|wheel)/.test(type)) L.listeners.push([Math.round(performance.now() - L.t0), 'remove', type]); return rem(type, fn, o); };
  }
  // our own counters: passive, registered last on window (bubble), so the page's capture handlers already ran
  addEventListener('touchmove', (e) => { cur.tm++; e.cancelable && cur.tmCancel++; e.defaultPrevented && cur.tmPrevented++; }, { passive: true });
  addEventListener('wheel', (e) => { cur.wh++; e.defaultPrevented && cur.whPrevented++; }, { passive: true });
  addEventListener('scroll', () => { cur.sc++; }, { passive: true });
  const mo = new MutationObserver((r) => { cur.mut += r.length; });
  const watch = () => { for (const el of [nav(), morphEl(), document.querySelector('.start-selling-morph-panel'), document.querySelector('.start-selling-platform')]) el && mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }); };
  watch(); setTimeout(watch, 3000);
  let last = performance.now();
  const loop = (t) => {
    if (L.stop) return;
    const n = nav(), m = morphEl();
    const morph = (n && n.style.getPropertyValue('--morph')) || (m && m.style.getPropertyValue('--morph')) || '';
    const cls = n ? ['is-morphing', 'is-expanded', 'is-on-dark'].filter((c) => n.classList.contains(c)).map((c) => c[3]).join('') : '';
    L.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), morph === '' ? null : Math.round(parseFloat(morph) * 1000) / 1000, cls,
      Math.round(cur.raf * 10) / 10, cur.rafN, Math.round(cur.rafMax * 10) / 10, cur.pin, cur.pinTop, cur.tm, cur.tmCancel, cur.tmPrevented, cur.wh, cur.whPrevented, cur.sc, cur.mut,
      Math.round(window.visualViewport ? visualViewport.height : innerHeight), cur.rafMax > 8 ? cur.rafMaxSrc : '']);
    reset(); last = t; rAF(loop);
  };
  rAF(loop);
  return 'installed';
})()`;
const FIELDS = ['t', 'dt', 'scrollY', 'morph', 'navCls(m=is-morphing,e=is-expanded,o=is-on-dark)', 'rafMs', 'rafN', 'rafMaxMs', 'pinCalls', 'pinTop', 'touchmove', 'tmCancelable', 'tmPrevented', 'wheel', 'wheelPrevented', 'scrollEvents', 'mutations', 'vvH', 'rafMaxSrc(>8ms)'];

const c = await openTab(() => true);
if (cmd === 'install') {
  console.log(await c.evaluate(INSTALL), 'on', await c.evaluate('location.href'));
} else if (cmd === 'read') {
  const raw = await c.evaluate('(() => { if (!window.__ml) return null; window.__ml.stop = true; return JSON.stringify(window.__ml); })()');
  if (!raw) { console.error('morph-log: not installed on this page (reloaded?)'); process.exit(3); }
  const L = JSON.parse(raw);
  const F = L.frames.slice(1);
  const active = (f) => (f[3] ?? 0) > 0.001 || f[4].includes('m');
  const pick = (fs) => {
    const d = fs.map((f) => f[1]).sort((a, b) => a - b), q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : null;
    return { frames: fs.length, gt20: d.filter((x) => x > 20).length, gt34: d.filter((x) => x > 34).length, gt50: d.filter((x) => x > 50).length, p50: q(0.5), p95: q(0.95), max: d.at(-1) ?? null };
  };
  const slow = F.filter((f) => f[1] > 34);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const srcs = {}; for (const f of slow) if (f[18]) srcs[f[18]] = (srcs[f[18]] || 0) + 1;
  L.fields = FIELDS;
  L.summary = {
    all: pick(F), morphActive: pick(F.filter(active)), morphInactive: pick(F.filter((f) => !active(f))),
    slowFrames: { n: slow.length, active: slow.filter(active).length, scrollY: [...new Set(slow.map((f) => f[2]))].slice(0, 20),
      medianRafMs: med(slow.map((f) => f[5])), medianNonRafMs: med(slow.map((f) => f[1] - f[5])), withPin: slow.filter((f) => f[8] > 0).length,
      withTouchmove: slow.filter((f) => f[10] > 0).length, withPreventedTouchmove: slow.filter((f) => f[12] > 0).length, withMutations: slow.filter((f) => f[16] > 0).length,
      topRafSources: Object.entries(srcs).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    pinCallsTotal: F.reduce((a, f) => a + f[8], 0), touchmoveTotal: F.reduce((a, f) => a + f[10], 0), touchmovePreventedTotal: F.reduce((a, f) => a + f[12], 0),
    listenerTimeline: L.listeners,
  };
  L.meta = { owner, label: opt('label', 'morph'), date: new Date().toISOString() };
  const out = resolve(REPO, opt('out', join('out', 'iphone', `morph-log-${opt('label', 'morph')}-${Date.now()}.json`)));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(L));
  console.log(JSON.stringify(L.summary, null, 1));
  console.log('wrote', out);
} else {
  console.error('usage: morph-log.mjs install|read --owner <lease owner> [--label x] [--out file]');
  process.exit(1);
}
c.close();

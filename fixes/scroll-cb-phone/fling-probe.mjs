// scroll-cb-phone fling probe: an `sim.mjs gesture --count-only --inject` logger (tools/lib/gesture-run.mjs loadInject)
// for int-v8's finding (the first page-up fling after a page-down fling ends ~950 px short with scb, OBSERVED, Simulator).
// Mechanism only, no timing verdict: it logs the ORDER of events and the scroll positions they happen at.
//   scroll  [t, y]                    every window scroll event (passive), y = scrollY
//   resize  [t, innerHeight]          every window resize (the toolbar)
//   attr    [t, i, name, value, y]    data-start-selling-render / -scene flips of the dE sections (MutationObserver)
//   size    [t, i, height, y]         ResizeObserver heights of those sections and of <html> (i = -1), after layout
//   frames  the gesture recorder's own per-frame [t, dt, scrollY, innerHeight] (window.__fwg.frames), copied at read
// t = performance.now() (the recorder's clock) is kept only to order the streams; Simulator times are never a verdict.
// Sections: every element carrying data-start-selling-render or data-start-selling-scene at install, i = their index;
// secs[i] = [tag.class, document top at install, height at install] (one layout read at install, at the page top).

export const name = 'scb-fling';

export const install = `(() => {
  const o = window.__scbF;
  if (o) { try { o.mo.disconnect(); o.ro.disconnect(); removeEventListener('scroll', o.onS); removeEventListener('resize', o.onR); } catch (e) {} }
  const R = (v) => Math.round(v * 10) / 10;
  const els = Array.from(document.querySelectorAll('[data-start-selling-render], [data-start-selling-scene]'));
  const f = window.__scbF = { v: 1, t0: R(performance.now()), secs: [], scroll: [], resize: [], attr: [], size: [] };
  for (const e of els) {
    const b = e.getBoundingClientRect();
    f.secs.push([e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0], Math.round(b.top + scrollY), Math.round(b.height),
      e.getAttribute('data-start-selling-render'), e.getAttribute('data-start-selling-scene')]);
  }
  f.onS = () => { f.scroll.push([R(performance.now()), Math.round(scrollY)]); };
  f.onR = () => { f.resize.push([R(performance.now()), innerHeight]); };
  addEventListener('scroll', f.onS, { passive: true });
  addEventListener('resize', f.onR, { passive: true });
  f.mo = new MutationObserver((ms) => {
    const t = R(performance.now());
    for (const m of ms) f.attr.push([t, els.indexOf(m.target), m.attributeName, m.target.getAttribute(m.attributeName), Math.round(scrollY)]);
  });
  for (const e of els) f.mo.observe(e, { attributes: true, attributeFilter: ['data-start-selling-render', 'data-start-selling-scene'] });
  f.ro = new ResizeObserver((es) => {
    const t = R(performance.now());
    for (const x of es) f.size.push([t, x.target === document.documentElement ? -1 : els.indexOf(x.target), Math.round(x.borderBoxSize?.[0]?.blockSize ?? x.contentRect.height), Math.round(scrollY)]);
  });
  f.ro.observe(document.documentElement);
  for (const e of els) f.ro.observe(e);
  return 'scb-fling ' + els.length + ' sections';
})()`;

export const read = `(() => {
  const f = window.__scbF;
  if (!f) return JSON.stringify({ error: 'not installed' });
  const g = window.__fwg;
  return JSON.stringify({ v: f.v, t0: f.t0, secs: f.secs, scroll: f.scroll, resize: f.resize, attr: f.attr, size: f.size,
    frames: g && Array.isArray(g.frames) ? g.frames : null, touches: g && Array.isArray(g.touches) ? g.touches : null });
})()`;

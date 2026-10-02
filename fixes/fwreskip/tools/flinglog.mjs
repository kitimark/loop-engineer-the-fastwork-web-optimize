// fwreskip phone tickets G1 / G1b: `iphone.mjs gesture … --inject fixes/fwreskip/tools/flinglog.mjs`.
// Cheap in-page log, no per-frame reads and no forced layout (so it does not slow the main thread it is meant to race):
// - a MutationObserver on the render attribute of the hero track and #people: [t, scrollY, 'h'|'p', value] per flip,
//   to confirm the paired state (P: #people deferred) before the fling mark and to time #people's un-skip;
// - a full-viewport magenta flash 3 s after install (inside the 6 s idle phase), held >= 3 rAFs and >= 50 ms.
//   v2 used it as the recording calibration; since user rule T-018 (no screen or camera recording) G1b has no
//   recording, and the flash is only an in-page run marker (`flash` = [t0, tEnd, rAFs]);
// v3 (G1b, review-fwreskip-3 #4 and T-018), both read nothing from layout:
// - `scroll`: the timeStamp of every scroll event (passive listener, no scrollY read), so a P2 idle un-skip can be
//   checked against the last scroll event before it (>= 300 ms by design) and the WebKit momentum event rate is seen;
// - `io`: an IntersectionObserver (root = viewport, no margin) on the hero track and #people:
//   [entry.time, 'h'|'p', isIntersecting ? 1 : 0, render attribute at callback]. With the MO flips this gives the
//   main-thread half of the G1 FAIL rule: an element that intersects the viewport while it is `deferred` in a
//   committed rendering update. It cannot see what the UI process shows ahead of the main thread (open item iv).
export const name = 'fwreskip-flinglog';
export const version = 3;
export const install = `(() => {
  const R = 'data-start-selling-render';
  const L = (window.__fwFL = { v: 3, flips: [], flash: null, scroll: [], io: [], vh: innerHeight, vw: innerWidth });
  const hero = document.querySelector('.hero-track'), people = document.querySelector('#people');
  L.start = [performance.now(), Math.round(scrollY), hero && hero.getAttribute(R), people && people.getAttribute(R)];
  const mo = new MutationObserver((ms) => { for (const m of ms) L.flips.push([Math.round(performance.now()), Math.round(scrollY), m.target === hero ? 'h' : 'p', m.target.getAttribute(R)]); });
  for (const el of [hero, people]) if (el) mo.observe(el, { attributes: true, attributeFilter: [R] });
  addEventListener('scroll', (e) => { L.scroll.push(Math.round(e.timeStamp)); }, { passive: true });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { for (const x of es) L.io.push([Math.round(x.time), x.target === hero ? 'h' : 'p', x.isIntersecting ? 1 : 0, x.target.getAttribute(R)]); });
    for (const el of [hero, people]) if (el) io.observe(el);
  }
  setTimeout(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647;pointer-events:none';
    // held >= 3 rAFs and >= 50 ms: a one-vsync flash (19-21 ms) was missed by the ~58 fps capture (G1 block 1)
    requestAnimationFrame((t0) => { document.body.appendChild(d); let n = 0;
      const hold = (t) => { if (++n >= 3 && t - t0 >= 50) { d.remove(); L.flash = [Math.round(t0), Math.round(t), n]; } else requestAnimationFrame(hold); };
      requestAnimationFrame(hold); });
  }, 3000);
  return 'ok';
})()`;
export const read = `(() => { const L = window.__fwFL || {}; const R = 'data-start-selling-render';
  const h = document.querySelector('.hero-track'), p = document.querySelector('#people');
  L.end = [Math.round(performance.now()), Math.round(scrollY), h && h.getAttribute(R), p && p.getAttribute(R)];
  return JSON.stringify(L); })()`;

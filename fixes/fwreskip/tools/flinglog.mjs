// fwreskip phone ticket G1 (open item iv): `iphone.mjs gesture … --inject fixes/fwreskip/tools/flinglog.mjs`.
// Cheap in-page log, no per-frame reads and no forced layout (so it does not slow the main thread it is meant to race):
// - a MutationObserver on the render attribute of the hero track and #people: [t, scrollY, 'h'|'p', value] per flip,
//   to confirm the paired state (P: #people deferred) before the fling mark and to time #people's un-skip;
// - a one-rAF full-viewport magenta flash 3 s after install (inside the 6 s idle phase), the capture calibration:
//   a recording that does not show it is void.
export const name = 'fwreskip-flinglog';
export const install = `(() => {
  const R = 'data-start-selling-render';
  const L = (window.__fwFL = { flips: [], flash: null, vh: innerHeight, vw: innerWidth });
  const hero = document.querySelector('.hero-track'), people = document.querySelector('#people');
  L.start = [performance.now(), Math.round(scrollY), hero && hero.getAttribute(R), people && people.getAttribute(R)];
  const mo = new MutationObserver((ms) => { for (const m of ms) L.flips.push([Math.round(performance.now()), Math.round(scrollY), m.target === hero ? 'h' : 'p', m.target.getAttribute(R)]); });
  for (const el of [hero, people]) if (el) mo.observe(el, { attributes: true, attributeFilter: [R] });
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

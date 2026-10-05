// PR-018 rev 7d mechanism checks (`sim.mjs gesture … --inject` / `iphone.mjs gesture … --inject`): turns on rev 7d's
// debug-only touchend log (window.__msDbg: [timeStamp, __msFv px/ms, finger samples, __msFl, scrollY] per lift) and
// logs every scroll event's [timeStamp, scrollY] (passive listener; one scrollY read per event, no forced layout:
// the page has just scrolled). Read per segment: {dbg, scroll, endH, maxY, ih}. Rev 7c logs no dbg (no hook).
export const name = 'msdbg';
export const version = 1;
export const install = `(() => {
  window.__msDbg = [];
  const L = (window.__msDbgScroll = []);
  addEventListener('scroll', (e) => { L.push([Math.round(e.timeStamp), Math.round(scrollY)]); }, { passive: true });
  return 'ok';
})()`;
export const read = `(() => {
  const e = document.querySelector('.fw-ms-end');
  return JSON.stringify({ dbg: window.__msDbg || null, scroll: window.__msDbgScroll || [], endH: e ? e.offsetHeight : null,
    maxY: document.documentElement.scrollHeight - innerHeight, ih: innerHeight });
})()`;

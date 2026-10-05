// toolbar-resize P-125 in-page logger and arm (the v8 will-change window: px rootMargin vs pinned data-fw-wc), applied by
// `sim.mjs gesture --inject` after every page load, before the Timeline starts. Arm from $P125_ARM (the driver sets it):
//   none (C) | wpx | wc1.
//   wpx: nothing in the page; the arm is the served JS (the p125-wpx overlay: rootMargin `387.5px 0px 387.5px 0px` in
//        fwWC(), 50 % of the scripted innerHeight 775), checked by served hash in the driver. In the page it is C.
//   wc1: data-fw-wc pinned to 1: at install every [data-fw-wc="0"] is set to 1, and from then on a setAttribute of
//        data-fw-wc with any value but "1" is dropped (counted). The CSS `[data-fw-wc="0"] { will-change: auto }` then
//        never matches, so those elements keep their own will-change (promotion on) at every scroll position.
// Every arm, C included, gets the same code:
//   - a setAttribute wrapper (passes through in C and wpx; drops data-fw-wc != "1" in wc1);
//   - a MutationObserver on the document for data-fw-wc and data-start-selling-scene writes, logging
//     [performance.now(), key 0 fw-wc | 1 scene, value 1/0 (fw-wc) or 1 active / 0 paused, where 0 box-or-inside /
//     1 ancestor / 2 other] per record: the writes' times, in the frames' clock;
//   - an IntersectionObserver on the showcase (root = viewport, rootMargin 0, threshold 0), logging
//     [time, in, top, bottom, rootH] per entry: the in-view state per frame (as P-119);
//   - a promotion count at install (after the wc1 pin) and at read: elements with data-fw-wc, those at "0", and those
//     whose computed will-change is not auto (no getComputedStyle during the gesture).
// read() returns everything (gesture file `run.inject`). No arm changes anything else.
export const name = 'p125';
const ARM = process.env.P125_ARM || 'none';
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)};
  const pin = arm === 'wc1';
  const SEL = '#people .start-selling-future-card > .start-selling-future-showcase';
  const sc = document.querySelector(SEL);
  const r2 = (x) => Math.round(x * 100) / 100;
  const promo = () => { const els = [...document.querySelectorAll('.start-selling [data-fw-wc]')]; let n0 = 0, wc = 0; for (const e of els) { if (e.getAttribute('data-fw-wc') === '0') n0++; if (getComputedStyle(e).willChange !== 'auto') wc++; } return { n: els.length, n0, willChange: wc }; };
  const fresh = !window.__p125;
  const st = fresh ? { arm, pin, drops: 0, pinnedAtInstall: 0, installs: 0 } : window.__p125;
  st.installs++;
  if (fresh) {
    const orig = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (pin && n === 'data-fw-wc' && String(v) !== '1') { st.drops++; return; }
      return orig.call(this, n, v);
    };
  }
  if (pin) for (const e of document.querySelectorAll('[data-fw-wc="0"]')) { e.setAttribute('data-fw-wc', '1'); st.pinnedAtInstall++; }
  void document.body.offsetHeight;
  st.promo0 = promo();
  st.ih0 = innerHeight; st.scrollY0 = scrollY;
  st.wr = []; st.io = [];
  if (fresh) {
    const where = (el) => (sc && (el === sc || sc.contains(el)) ? 0 : sc && el.contains(sc) ? 1 : 2);
    const mo = new MutationObserver((rs) => { const t = r2(performance.now()); for (const r of rs) { const k = r.attributeName === 'data-fw-wc' ? 0 : 1, v = r.target.getAttribute(r.attributeName); st.wr.push([t, k, k === 0 ? (v === '1' ? 1 : 0) : (v === 'active' ? 1 : 0), where(r.target)]); } });
    mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-fw-wc', 'data-start-selling-scene'] });
    if (sc && 'IntersectionObserver' in window) {
      const ob = new IntersectionObserver((es) => { for (const e of es) st.io.push([r2(e.time), e.isIntersecting ? 1 : 0, r2(e.boundingClientRect.top), r2(e.boundingClientRect.bottom), e.rootBounds ? r2(e.rootBounds.height) : null]); }, { threshold: 0 });
      ob.observe(sc);
      st.ioInstalled = true;
    }
    st.promoFn = promo;
  }
  window.__p125 = st;
  return 'ok';
})()`;
export const read = () => `(() => { const s = window.__p125; if (!s) return null; const o = Object.assign({}, s); delete o.promoFn; o.promo1 = s.promoFn ? s.promoFn() : null; o.fwwc0AtRead = document.querySelectorAll('[data-fw-wc="0"]').length; return JSON.stringify(o); })()`;

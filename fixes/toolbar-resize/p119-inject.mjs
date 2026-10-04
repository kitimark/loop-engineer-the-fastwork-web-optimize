// toolbar-resize P-119 in-page arm (containment vs skip, plus the entering check): applied by `sim.mjs gesture --inject`
// after every page load, before the Timeline starts. Arm from $P110_ARM (the driver sets it): none (C) | cct | cva.
//   cct: contain: content on the showcase (= layout + paint + style; no size containment, no skip)
//   cva: content-visibility: auto; contain-intrinsic-block-size: auto <its measured height>px (P-115's rule, unchanged)
// Every arm, C included, also gets:
//   - an IntersectionObserver on the showcase (root = viewport, rootMargin 0, threshold 0: the same options WebKit's
//     content-visibility observer uses), logging {time, in, top, bottom, rootH} per entry: the crossing record;
//   - the look gate's structural probe, taken BEFORE the arm's rule is applied: what paint/style/layout containment
//     could change (descendants outside the box, fixed / absolute descendants whose containing block is outside it,
//     positioned z-index descendants when the box is not already a stacking context, counters, margin collapse
//     through the box's edges, ink-overflow sources near its edges, baseline alignment in the parent).
// read() returns what was applied, the measured values, the IO log and the probe (gesture file `run.inject`).
export const name = 'p119';
const ARM = process.env.P110_ARM || 'none';
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)};
  const SEL = '#people .start-selling-future-card > .start-selling-future-showcase';
  const sc = document.querySelector(SEL);
  const r2 = (x) => Math.round(x * 100) / 100;
  const m = { showcaseH: sc ? r2(sc.getBoundingClientRect().height) : null, showcaseTop0: sc ? r2(sc.getBoundingClientRect().top + scrollY) : null, scrollY0: scrollY, ih0: innerHeight };
  // look gate probe (before any arm rule)
  let look = null;
  if (sc) {
    const R = sc.getBoundingClientRect(), cs = getComputedStyle(sc), E = 0.5, NEAR = 32;
    const desc = [...sc.querySelectorAll('*')];
    const out = [], fixed = [], absOut = [], zidx = [], counters = [], ink = [];
    const lab = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    for (const el of desc) {
      const c = getComputedStyle(el); if (c.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.left < R.left - E || r.top < R.top - E || r.right > R.right + E || r.bottom > R.bottom + E)) out.push(lab(el));
      if (c.position === 'fixed') fixed.push(lab(el));
      if (c.position === 'absolute' && !(el.offsetParent && (el.offsetParent === sc || sc.contains(el.offsetParent)))) absOut.push(lab(el));
      if (c.position !== 'static' && c.zIndex !== 'auto') zidx.push(lab(el) + ':' + c.zIndex);
      if ((c.counterIncrement && c.counterIncrement !== 'none') || (c.counterReset && c.counterReset !== 'none') || (c.counterSet && c.counterSet !== 'none')) counters.push(lab(el));
      const near = r.left < R.left + NEAR || r.top < R.top + NEAR || r.right > R.right - NEAR || r.bottom > R.bottom - NEAR;
      if (near && ((c.boxShadow && c.boxShadow !== 'none') || (c.filter && c.filter !== 'none') || (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.textShadow && c.textShadow !== 'none'))) ink.push(lab(el));
    }
    const stacking = (cs.position !== 'static' && cs.zIndex !== 'auto') || cs.transform !== 'none' || parseFloat(cs.opacity) < 1 || cs.isolation === 'isolate' || cs.filter !== 'none' || /transform|opacity|filter/.test(cs.willChange || '') || (cs.contain && cs.contain !== 'none');
    const kids = [...sc.children].filter((k) => { const c = getComputedStyle(k); return c.display !== 'none' && c.position !== 'absolute' && c.position !== 'fixed'; });
    const first = kids[0] && getComputedStyle(kids[0]), last = kids[kids.length - 1] && getComputedStyle(kids[kids.length - 1]);
    const blockish = /^(block|list-item)$/.test(cs.display);
    const collapse = [];
    if (blockish && first && parseFloat(cs.paddingTop) === 0 && parseFloat(cs.borderTopWidth) === 0 && parseFloat(first.marginTop) !== 0) collapse.push('top:' + first.marginTop);
    if (blockish && last && parseFloat(cs.paddingBottom) === 0 && parseFloat(cs.borderBottomWidth) === 0 && parseFloat(last.marginBottom) !== 0) collapse.push('bottom:' + last.marginBottom);
    const pc = sc.parentElement && getComputedStyle(sc.parentElement);
    const baseline = /baseline/.test((cs.alignSelf || '') + ' ' + (pc ? pc.alignItems : '')) && /flex|grid/.test(pc ? pc.display : '');
    const clipped = /hidden|clip/.test(cs.overflowX) && /hidden|clip/.test(cs.overflowY);
    look = { n: desc.length, display: cs.display, overflow: cs.overflowX + '/' + cs.overflowY, clipped, stacking, out: out.slice(0, 8), nOut: out.length, fixed, absOut: absOut.slice(0, 8), nAbsOut: absOut.length, zidx: zidx.slice(0, 8), nZidx: zidx.length, counters, collapse, ink: ink.slice(0, 8), nInk: ink.length, baseline };
    look.clean = (clipped || out.length === 0) && fixed.length === 0 && absOut.length === 0 && (stacking || zidx.length === 0) && counters.length === 0 && collapse.length === 0 && (clipped || ink.length === 0) && !baseline;
  }
  let css = '';
  if (arm === 'cct' && sc) css = SEL + '{contain:content!important}';
  if (arm === 'cva' && sc && m.showcaseH > 0) css = SEL + '{content-visibility:auto!important;contain-intrinsic-block-size:auto ' + m.showcaseH + 'px!important}';
  if (css) { const st = document.createElement('style'); st.id = 'p119-arm'; st.textContent = css; document.head.appendChild(st); }
  void document.body.offsetHeight;
  const io = [];
  if (sc && 'IntersectionObserver' in window) {
    const ob = new IntersectionObserver((es) => { for (const e of es) io.push([r2(e.time), e.isIntersecting ? 1 : 0, r2(e.boundingClientRect.top), r2(e.boundingClientRect.bottom), e.rootBounds ? r2(e.rootBounds.height) : null]); }, { threshold: 0 });
    ob.observe(sc);
  }
  window.__p119 = { arm, css, measured: m, look, io, ioInstalled: !!(sc && 'IntersectionObserver' in window), docH0: document.documentElement.scrollHeight, ih: innerHeight };
  return 'ok';
})()`;
export const read = () => `JSON.stringify(Object.assign({}, window.__p119, { docH1: document.documentElement.scrollHeight, applied: !!document.getElementById('p119-arm'), cs: (() => { const sc = document.querySelector('#people .start-selling-future-card > .start-selling-future-showcase'); const c = sc && getComputedStyle(sc); return c ? { contain: c.contain, cv: c.contentVisibility } : null; })() }))`;

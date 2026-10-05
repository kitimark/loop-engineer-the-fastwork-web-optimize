// toolbar-resize page-side arm card (gpu-props levers; P-id from ops) in-page arm, applied by `sim.mjs gesture --inject` after
// every page load, before the Timeline starts (as P-110/P-115/P-119). Arm from $PGP_ARM (the driver sets it):
//   none (C) | nvc | nvn | tps | tp | vu0 | trk | pbx
//   nvc: every fixed renderer -> absolute, every sticky one -> relative (P-109's positive control, mechanism-only)
//        (the #platform rule also gets top:auto: its v9 sticky top is calc(100dvh - var(--fw-ms-h)), which as a relative
//        offset would move it; so these arms also drop that dvh user)
//   nvn: every sticky renderer -> relative, the fixed ones stay fixed (does a fixed renderer alone keep the step Layout?)
//   (nvc, nvn, tps: after the selector rule, any renderer the census still finds in a removed position gets an inline
//   !important position, listed in `extra`; renderers that appear later are only reported, in vcEnd)
//   tps: .hero-track gets contain: size layout (a layout boundary above the sticky hero); every other sticky -> relative
//   tp:  .hero-track and section.pain get contain: size layout (pain with contain-intrinsic-block-size = its measured
//        height); no position changes (#platform's v9 sticky and the fixed nav stay)
//   trk, pbx: the two halves of tp alone (only if the lead signs the literal arm list instead of nvn/tps)
//   vu0: vh/svh/lvh layout values of the large subtrees pinned to their own computed px at load (the list below);
//        dvh users are left alone (their values change with the toolbar by design, so a pin would change the look)
// Every arm, C included, also gets:
//   - census of viewport-constrained renderers (computed position fixed/sticky, rendered): before the arm rule, after it,
//     and again at read() (the page sets html.fw-ms and its classes after load);
//   - an IntersectionObserver on the showcase, logging [time, in, top, bottom, rootH] per entry (P-119's format, for
//     split-io119.mjs, descriptive);
//   - docH before and after the arm rule (geometry), and the computed contain of .hero-track and section.pain.
// read() returns everything (gesture file `run.inject`).
export const name = 'pgp';
const ARM = process.env.PGP_ARM || 'none';
export const FIXED = ['.why-bring', '.start-selling-people-o-preview', '.start-selling-morph', '.start-selling-top-nav.svelte-1dcozpm'];
export const STICKY = ['.commission-sticky', '.hero.svelte-1p2vpne', '.pain-sticky', '.start-selling-profile-sticky', '.action-footer.svelte-2l8ken', 'html.fw-ms .start-selling-platform'];
export const VU = [
  ['.hero-track.svelte-1p2vpne', 'height'], ['.hero.svelte-1p2vpne', 'height'], ['.hero.svelte-1p2vpne', 'min-height'],
  ['.commission', 'margin-top'], ['.commission-sticky', 'min-height'], ['section.pain', 'margin-top'], ['.pain-sticky', 'min-height'],
  ['.pain-hold', 'height'], ['.start-selling-future', 'margin-top'], ['.start-selling-future-card', 'min-height'],
  ['.start-selling-platform.is-platform-pain-underlay.is-platform-shrink-track', 'margin-top'], ['.fw-ms-end', 'height'],
];
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)}, FIXED = ${JSON.stringify(FIXED)}, STICKY = ${JSON.stringify(STICKY)}, VU = ${JSON.stringify(VU)};
  const r2 = (x) => Math.round(x * 100) / 100;
  const lab = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const census = () => { const out = []; for (const el of document.querySelectorAll('body *')) { const c = getComputedStyle(el); if ((c.position === 'fixed' || c.position === 'sticky') && c.display !== 'none' && el.getClientRects().length) out.push([lab(el), c.position, el.querySelectorAll('*').length]); } return out; };
  const SC = '#people .start-selling-future-card > .start-selling-future-showcase';
  const sc = document.querySelector(SC), trk = document.querySelector('.hero-track.svelte-1p2vpne'), pain = document.querySelector('section.pain');
  const m = { ih0: innerHeight, scrollY0: scrollY, painH: pain ? r2(pain.getBoundingClientRect().height) : null, trkH: trk ? r2(trk.getBoundingClientRect().height) : null, showcaseH: sc ? r2(sc.getBoundingClientRect().height) : null };
  const vc0 = census(), docHpre = document.documentElement.scrollHeight;
  const rel = (sels) => sels.map((s) => s + '{position:relative!important' + (/platform/.test(s) ? ';top:auto!important' : '') + '}').join('');
  const abs = (sels) => sels.map((s) => s + '{position:absolute!important}').join('');
  const TRK = '.hero-track.svelte-1p2vpne{contain:size layout!important}';
  let css = '', pins = [], skipped = [];
  if (arm === 'nvc') css = abs(FIXED) + rel(STICKY);
  if (arm === 'nvn') css = rel(STICKY);
  if (arm === 'tps') css = TRK + rel(STICKY.filter((s) => s !== '.hero.svelte-1p2vpne'));
  const PBX = pain && m.painH > 0 ? 'section.pain{contain:size layout!important;contain-intrinsic-block-size:' + m.painH + 'px!important}' : '';
  if (arm === 'trk') css = TRK;
  if (arm === 'pbx') css = PBX;
  if (arm === 'tp' && PBX) css = TRK + PBX;
  if (arm === 'vu0') {
    for (const [sel, prop] of VU) {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) { skipped.push(sel + ' ' + prop + ': no element'); continue; }
      const vals = [...new Set(els.map((el) => getComputedStyle(el).getPropertyValue(prop)))];
      if (vals.length !== 1 || !/^-?[0-9.]+px$/.test(vals[0])) { skipped.push(sel + ' ' + prop + ': ' + vals.join('|')); continue; }
      pins.push([sel, prop, vals[0]]); css += sel + '{' + prop + ':' + vals[0] + '!important}';
    }
  }
  if (css) { const st = document.createElement('style'); st.id = 'pgp-arm'; st.textContent = css; document.head.appendChild(st); }
  void document.body.offsetHeight;
  // nvc / nvn / tps cover EVERY viewport-constrained renderer the census finds, not only the listed selectors: any one
  // left after the rule gets an inline !important position (recorded in extra)
  const extra = [];
  const left = (want) => { for (const el of document.querySelectorAll('body *')) { const c = getComputedStyle(el); if (want.includes(c.position) && c.display !== 'none' && el.getClientRects().length) { if (arm === 'tps' && el.classList && el.classList.contains('hero') && el.classList.contains('svelte-1p2vpne')) continue; el.style.setProperty('position', c.position === 'fixed' ? 'absolute' : 'relative', 'important'); extra.push([lab(el), c.position]); } } };
  if (arm === 'nvc') left(['fixed', 'sticky']);
  if (arm === 'nvn' || arm === 'tps') left(['sticky']);
  void document.body.offsetHeight;
  const io = [];
  if (sc && 'IntersectionObserver' in window) {
    const ob = new IntersectionObserver((es) => { for (const e of es) io.push([r2(e.time), e.isIntersecting ? 1 : 0, r2(e.boundingClientRect.top), r2(e.boundingClientRect.bottom), e.rootBounds ? r2(e.rootBounds.height) : null]); }, { threshold: 0 });
    ob.observe(sc);
  }
  const cs = (el) => (el ? getComputedStyle(el).contain : null);
  window.__pgp = { arm, css, extra, pins, skipped, measured: m, vc0, vc1: census(), docHpre, docH0: document.documentElement.scrollHeight, painH1: pain ? r2(pain.getBoundingClientRect().height) : null, trkH1: trk ? r2(trk.getBoundingClientRect().height) : null, contain: { trk: cs(trk), pain: cs(pain) }, io, ioInstalled: !!(sc && 'IntersectionObserver' in window), census, fwms0: document.documentElement.classList.contains('fw-ms') };
  return 'ok';
})()`;
export const read = () => `(() => { const p = window.__pgp; if (!p) return 'null'; const { census, ...rest } = p; return JSON.stringify(Object.assign({}, rest, { vcEnd: census(), fwmsEnd: document.documentElement.classList.contains('fw-ms'), docH1: document.documentElement.scrollHeight, applied: !!document.getElementById('pgp-arm') || rest.extra.length > 0 })); })()`;

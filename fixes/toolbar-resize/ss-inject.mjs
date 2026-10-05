// toolbar-resize P-141 (single-sticky card): in-page arm, built from pgp-inject.mjs (2cfd9c00b9f1) with the
// same census, showcase IntersectionObserver log, docH and read(); applied by `sim.mjs gesture --inject` after every page
// load, before the Timeline starts. Arm from $PGP_ARM (the driver sets it):
//   none (C) | nvc | nvn | hso | pso | fso
//   nvc, nvn: exactly as in pgp-inject.mjs (P-133's arms: nvc every fixed -> absolute and every sticky -> relative;
//        nvn every sticky -> relative, fixed kept). #platform's rule also gets top:auto, as there.
//   keep-one-sticky arms: every sticky renderer -> relative EXCEPT one, which stays sticky; the fixed ones stay fixed.
//     hso: keeps the hero (.hero.svelte-1p2vpne)        pso: keeps .pain-sticky
//     fso: keeps #platform (html.fw-ms .start-selling-platform, sticky top calc(100dvh - var(--fw-ms-h)))
//   (nvc, nvn and the keep-one arms: after the selector rule, any other renderer the census still finds in a removed
//   position gets an inline !important position, listed in `extra`; renderers that appear later are only reported, in vcEnd)
// Every arm, C included: census of viewport-constrained renderers before and after the rule and at read(); the
// showcase IntersectionObserver log (split-io119.mjs format); docH before and after the rule; computed contain of
// .hero-track and section.pain. The page-side record keeps the name window.__pgp, so split-io119.mjs reads it as is.
// read() returns everything (gesture file `run.inject`).
export const name = 'ss';
export const KEEP = { hso: '.hero.svelte-1p2vpne', pso: '.pain-sticky', fso: 'html.fw-ms .start-selling-platform' };
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
  const arm = ${JSON.stringify(ARM)}, KEEP = ${JSON.stringify(KEEP)}, KEEPID = ${JSON.stringify({ hso: 'hero', pso: 'pain-sticky', fso: '#platform' })}, FIXED = ${JSON.stringify(FIXED)}, STICKY = ${JSON.stringify(STICKY)}, VU = ${JSON.stringify(VU)};
  const r2 = (x) => Math.round(x * 100) / 100;
  const lab = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  const census = () => { const out = []; for (const el of document.querySelectorAll('body *')) { const c = getComputedStyle(el); if ((c.position === 'fixed' || c.position === 'sticky') && c.display !== 'none' && el.getClientRects().length) out.push([lab(el), c.position, el.querySelectorAll('*').length]); } return out; };
  const SC = '#people .start-selling-future-card > .start-selling-future-showcase';
  const sc = document.querySelector(SC), trk = document.querySelector('.hero-track.svelte-1p2vpne'), pain = document.querySelector('section.pain');
  const m = { ih0: innerHeight, scrollY0: scrollY, painH: pain ? r2(pain.getBoundingClientRect().height) : null, trkH: trk ? r2(trk.getBoundingClientRect().height) : null, showcaseH: sc ? r2(sc.getBoundingClientRect().height) : null };
  const vc0 = census(), docHpre = document.documentElement.scrollHeight;
  const rel = (sels) => sels.map((s) => s + '{position:relative!important' + (/platform/.test(s) ? ';top:auto!important' : '') + '}').join('');
  const abs = (sels) => sels.map((s) => s + '{position:absolute!important}').join('');
  let css = '', pins = [], skipped = [];
  const kept = (el) => (arm === 'hso' && el.classList && el.classList.contains('hero') && el.classList.contains('svelte-1p2vpne')) || (arm === 'pso' && el.classList && el.classList.contains('pain-sticky')) || (arm === 'fso' && el.id === 'platform');
  if (arm === 'nvc') css = abs(FIXED) + rel(STICKY);
  if (arm === 'nvn') css = rel(STICKY);
  const keepSel = KEEP[arm] || null;
  if (keepSel) css = rel(STICKY.filter((x) => x !== keepSel));
  if (css) { const st = document.createElement('style'); st.id = 'pgp-arm'; st.textContent = css; document.head.appendChild(st); }
  void document.body.offsetHeight;
  // nvc / nvn / keep-one arms cover EVERY viewport-constrained renderer the census finds, not only the listed selectors: any one
  // left after the rule gets an inline !important position (recorded in extra)
  const extra = [];
  const left = (want) => { for (const el of document.querySelectorAll('body *')) { const c = getComputedStyle(el); if (want.includes(c.position) && c.display !== 'none' && el.getClientRects().length) { if (kept(el)) continue; el.style.setProperty('position', c.position === 'fixed' ? 'absolute' : 'relative', 'important'); extra.push([lab(el), c.position]); } } };
  if (arm === 'nvc') left(['fixed', 'sticky']);
  if (arm === 'nvn' || KEEP[arm]) left(['sticky']);
  void document.body.offsetHeight;
  const io = [];
  if (sc && 'IntersectionObserver' in window) {
    const ob = new IntersectionObserver((es) => { for (const e of es) io.push([r2(e.time), e.isIntersecting ? 1 : 0, r2(e.boundingClientRect.top), r2(e.boundingClientRect.bottom), e.rootBounds ? r2(e.rootBounds.height) : null]); }, { threshold: 0 });
    ob.observe(sc);
  }
  const cs = (el) => (el ? getComputedStyle(el).contain : null);
  window.__pgp = { arm, css, extra, pins, skipped, measured: m, vc0, vc1: census(), docHpre, docH0: document.documentElement.scrollHeight, painH1: pain ? r2(pain.getBoundingClientRect().height) : null, trkH1: trk ? r2(trk.getBoundingClientRect().height) : null, contain: { trk: cs(trk), pain: cs(pain) }, io, ioInstalled: !!(sc && 'IntersectionObserver' in window), keep: KEEPID[arm] || null, census, fwms0: document.documentElement.classList.contains('fw-ms') };
  return 'ok';
})()`;
export const read = () => `(() => { const p = window.__pgp; if (!p) return 'null'; const { census, ...rest } = p; return JSON.stringify(Object.assign({}, rest, { vcEnd: census(), fwmsEnd: document.documentElement.classList.contains('fw-ms'), docH1: document.documentElement.scrollHeight, applied: !!document.getElementById('pgp-arm') || rest.extra.length > 0 })); })()`;

// toolbar-resize P-115 in-page arm (candidate forms for the showcase cost): applied by `sim.mjs gesture --inject` after
// every page load, before the Timeline starts. Arm from $P110_ARM (the P-110 driver sets it): none (C) | svh | csl | cva.
//   svh: .start-selling-future-card min-height pinned to its own computed px (was 100svh at width <= 860px, CSS l.3522)
//   csl: contain: layout on the showcase
//   cva: content-visibility: auto on the showcase, contain-intrinsic-block-size: auto <its measured height>px
// read() returns what was applied, the measured values and the document height (gesture file `run.inject`).
export const name = 'p115';
const ARM = process.env.P110_ARM || 'none';
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)};
  const card = document.querySelector('#people .start-selling-future-card');
  const sc = document.querySelector('#people .start-selling-future-card > .start-selling-future-showcase');
  const m = { cardMinH: card ? getComputedStyle(card).minHeight : null, showcaseH: sc ? Math.round(sc.getBoundingClientRect().height * 100) / 100 : null };
  let css = '';
  if (arm === 'svh' && m.cardMinH && /px$/.test(m.cardMinH) && parseFloat(m.cardMinH) > 0) css = '#people .start-selling-future-card{min-height:' + m.cardMinH + '!important}';
  if (arm === 'csl' && sc) css = '#people .start-selling-future-card > .start-selling-future-showcase{contain:layout!important}';
  if (arm === 'cva' && sc && m.showcaseH > 0) css = '#people .start-selling-future-card > .start-selling-future-showcase{content-visibility:auto!important;contain-intrinsic-block-size:auto ' + m.showcaseH + 'px!important}';
  if (css) { const st = document.createElement('style'); st.id = 'p115-arm'; st.textContent = css; document.head.appendChild(st); }
  void document.body.offsetHeight;
  window.__p115 = { arm, css, measured: m, docH0: document.documentElement.scrollHeight, ih: innerHeight };
  return 'ok';
})()`;
export const read = () => `JSON.stringify(Object.assign({}, window.__p115, { docH1: document.documentElement.scrollHeight, applied: !!document.getElementById('p115-arm'), cs: (() => { const sc = document.querySelector('#people .start-selling-future-card > .start-selling-future-showcase'); const c = sc && getComputedStyle(sc); return c ? { contain: c.contain, cv: c.contentVisibility } : null; })() }))`;

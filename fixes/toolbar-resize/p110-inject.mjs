// toolbar-resize P-110 in-page arm (mechanism only): applied by `sim.mjs gesture --inject` after every page load,
// before the Timeline starts. Arm from $P110_ARM: none (control C) | nav | pain | navpain | ph | ps | pc.
//   nav:  .start-selling-top-nav position absolute        pain: .pain-sticky position relative   navpain: both
//   ph/ps/pc: content-visibility hidden on #people's header / showcase / community pill, with contain-intrinsic-block-size
//   pinned to that box's own measured height (so the page keeps its size; the GEOMETRY rule still checks docH).
// read() returns what was applied, the measured heights and the document height (landing in the gesture file's `inject`).
export const name = 'p110';
const ARM = process.env.P110_ARM || 'none';
const SEL = { ph: '.start-selling-future-header', ps: '.start-selling-future-showcase', pc: '.start-selling-future-community-pill' };
export const install = () => `(() => {
  const arm = ${JSON.stringify(ARM)}, SEL = ${JSON.stringify(SEL)};
  const P = '#people .start-selling-future-card > ';
  const h = {};
  for (const k of Object.keys(SEL)) { const e = document.querySelector(P + SEL[k]); h[k] = e ? Math.round(e.getBoundingClientRect().height * 100) / 100 : null; }
  let css = '';
  if (arm === 'nav' || arm === 'navpain') css += '.start-selling-top-nav{position:absolute!important}';
  if (arm === 'pain' || arm === 'navpain') css += '.pain-sticky{position:relative!important}';
  if (SEL[arm] && h[arm] != null) css += P + SEL[arm] + '{content-visibility:hidden!important;contain-intrinsic-block-size:' + h[arm] + 'px!important}';
  if (css) { const st = document.createElement('style'); st.id = 'p110-arm'; st.textContent = css; document.head.appendChild(st); }
  void document.body.offsetHeight;
  window.__p110 = { arm, css, heightsBefore: h, kids: [...document.querySelectorAll(P.trim().replace(/ >$/, '') + ' > *')].map((e) => e.className.split(' ')[0]), docH0: document.documentElement.scrollHeight, ih: innerHeight };
  return 'ok';
})()`;
export const read = () => `JSON.stringify(Object.assign({}, window.__p110, { docH1: document.documentElement.scrollHeight, applied: !!document.getElementById('p110-arm') }))`;

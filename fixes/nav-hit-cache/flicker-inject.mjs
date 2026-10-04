// nav-hit-cache flicker gate, the in-page part: an `iphone.mjs gesture --inject` logger (tools/lib/gesture-run.mjs
// loadInject). It logs every flip of `.pain` is-pain-dark and of the nav's (`.start-selling-top-nav`) is-on-dark as
// [t, kind, on]: t = performance.now() (the gesture recorder's clock), kind 'pain' | 'nav', on 1 | 0.
// It reads no layout and no scroll position: a MutationObserver on the two class attributes, classList.contains in
// its callback, nothing else (scrollY can update layout in WebKit; the recorder's per-frame scrollY is used instead).
// It records only real flips, so a page that rewrites the class with the same value every frame costs one callback
// per frame and records nothing. Scorer: flicker-gate.mjs.
//
//   node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner <you> --label <arm>-<n> \
//     --inject fixes/nav-hit-cache/flicker-inject.mjs
//   node fixes/nav-hit-cache/flicker-gate.mjs --arm C <C runs...> --arm V <V runs...>

export const name = 'nhc-flicker';

// Runs after every recorder install (every page load), so it re-binds to the new elements.
export const install = `(() => {
  if (window.__nhcF && window.__nhcF.mo) window.__nhcF.mo.disconnect();
  const p = document.querySelector('.pain'), nv = document.querySelector('.start-selling-top-nav');
  const R = (v) => Math.round(v * 10) / 10;
  const has = (e, c) => (e ? (e.classList.contains(c) ? 1 : 0) : null);
  const f = window.__nhcF = { v: 1, found: { pain: !!p, nav: !!nv }, t0: R(performance.now()),
    start: { pain: has(p, 'is-pain-dark'), nav: has(nv, 'is-on-dark') }, flips: [], cb: 0, mo: null };
  let lp = f.start.pain, ln = f.start.nav;
  f.mo = new MutationObserver(() => {
    f.cb++;
    const a = has(p, 'is-pain-dark'), b = has(nv, 'is-on-dark'), t = R(performance.now());
    if (a !== lp) { f.flips.push([t, 'pain', a]); lp = a; }
    if (b !== ln) { f.flips.push([t, 'nav', b]); ln = b; }
  });
  for (const e of [p, nv]) if (e) f.mo.observe(e, { attributes: true, attributeFilter: ['class'] });
  return 'nhc-flicker ' + (p ? 'pain' : 'NO-pain') + ' ' + (nv ? 'nav' : 'NO-nav');
})()`;

export const read = `(() => {
  const f = window.__nhcF;
  if (!f) return JSON.stringify({ error: 'not installed' });
  return JSON.stringify({ v: f.v, found: f.found, t0: f.t0, start: f.start, flips: f.flips, cb: f.cb });
})()`;

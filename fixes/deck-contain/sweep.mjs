// deck-contain P-143 rev 1.1 (N1): pinned deck-sweep check. be() (JS v9.1d l.11750-11761, run from the deck's scroll
// listener xe() through a rAF and a 150 ms timer) makes the shell whose offsetLeft centre is nearest the deck's centre
// active. With layout containment the shells' offsetParent becomes the deck and offsetLeft grows by the bleed, which
// moves the switch point. In the page: scroll-snap is switched off on the deck (inline, the same for every arm, so the
// sweep can stop between snap points), the deck's scrollLeft is stepped 0 -> SPAN in STEP px, and after each step (two
// rAFs + 200 ms, past the 150 ms timer) the active shell and active tab are read. Returns every switch: the first
// scrollLeft at which the active shell (and the tab) changed. be() calls he(id, false), which returns before any deck
// scroll (l.11699), so the sweep is not fought. Snap is restored at the end. Functional, no timing.
export const SWEEP = (step = 8, shells = 2) => `(async () => {
  const d = document.querySelector('.start-selling-profile-deck');
  const sh = [...d.children]; const pitch = sh[1].offsetLeft - sh[0].offsetLeft; const span = Math.round(pitch * ${shells});
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const read = () => ({ act: d.querySelector('.is-active-shell')?.dataset.profession || null,
    tab: document.querySelector('[data-profession-tab][aria-selected="true"], [data-profession-tab].is-active')?.dataset.professionTab || null });
  const snap = d.style.scrollSnapType; d.style.scrollSnapType = 'none';
  d.scrollLeft = 0; await raf2(); await wait(400);
  let prev = read(); const start = prev; const shellSw = []; const tabSw = [];
  for (let sl = ${step}; sl <= span; sl += ${step}) {
    d.scrollLeft = sl; await raf2(); await wait(200);
    const s = read();
    if (s.act !== prev.act) shellSw.push({ sl: Math.round(d.scrollLeft), from: prev.act, to: s.act });
    if (s.tab !== prev.tab) tabSw.push({ sl: Math.round(d.scrollLeft), from: prev.tab, to: s.tab });
    prev = s;
  }
  d.style.scrollSnapType = snap; d.scrollLeft = 0; await raf2(); await wait(400);
  return { pitch, span, step: ${step}, start, shellSw, tabSw, end: prev };
})()`;

// switch points of an arm vs base: equal when every switch goes between the same shells and lies within tol px
export function sweepDiff(base, arm, tol = 8) {
  const cmp = (a, b) => a.length === b.length && a.every((x, i) => x.from === b[i].from && x.to === b[i].to && Math.abs(x.sl - b[i].sl) <= tol);
  const shift = (a, b) => (a.length && a.length === b.length) ? b.map((x, i) => x.sl - a[i].sl) : null;
  return { shellEqual: cmp(base.shellSw, arm.shellSw), tabEqual: cmp(base.tabSw, arm.tabSw), shellShift: shift(base.shellSw, arm.shellSw), tabShift: shift(base.tabSw, arm.tabSw) };
}

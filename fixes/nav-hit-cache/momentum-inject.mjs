// In-page logger for the nav-hit-cache momentum case (gesture --inject; P-117 N1, lead ruling). Installed after each
// load, on the gesture tool's own inspector connection. Counts only, no timing claim.
// Question (UNRESOLVED in references): during momentum (finger lifted, the page gliding on) does WebKit fire a scroll
// event in every rendering update where the page moved? The nav cache takes its position from the last scroll event
// (__nsY); a frame that moved without one would run on a stale position.
// Per rAF (this logger's own loop, registered after the page's): [t, scrollY (rounded), scroll events since the last
// rAF, phase] with phase 1 = a finger is on the glass, 0 = no finger (momentum or rest). A scroll event is counted when
// it is dispatched (passive window listener). It also (re)arms the VA build's audit (window.__nhcAudit, build.mjs
// HOOK_V8): t / n frames that ran / skipped the real hit test, lag = frames where __nsY was not the live scrollY, and the
// theme / sticky / pill disagreements with the original's own reads in the same frame.
export const name = 'nhc-momentum';
export const install = `(() => {
  if (window.__nhm) return 'again';
  window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] };
  const L = window.__nhm = { f: [], ev: 0, touch: 0, se: 0 };
  addEventListener('scroll', () => { L.ev++; L.se++; }, { passive: true });
  addEventListener('touchstart', (e) => { L.touch = e.touches.length; }, { passive: true, capture: true });
  addEventListener('touchend', (e) => { L.touch = e.touches.length; }, { passive: true, capture: true });
  addEventListener('touchcancel', (e) => { L.touch = e.touches.length; }, { passive: true, capture: true });
  const tick = () => { L.f.push([Math.round(performance.now()), Math.round(scrollY), L.ev, L.touch ? 1 : 0]); L.ev = 0; if (L.f.length < 20000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 'ok'; })()`;
export const read = `JSON.stringify(window.__nhm ? (() => {
  const F = window.__nhm.f, A = window.__nhcAudit || null;
  const s = { frames: F.length, scrollEvents: window.__nhm.se, moved: 0, movedNoEvent: 0, touchMoved: 0, touchMovedNoEvent: 0,
    glideMoved: 0, glideMovedNoEvent: 0, glideFirstNoEvent: [], restWithEvent: 0, maxEventsPerFrame: 0 };
  for (let i = 1; i < F.length; i++) {
    const [t, y, ev, ph] = F[i], mv = y !== F[i - 1][1];
    s.maxEventsPerFrame = Math.max(s.maxEventsPerFrame, ev);
    if (!mv) { if (ev) s.restWithEvent++; continue; }
    s.moved++; if (!ev) s.movedNoEvent++;
    if (ph) { s.touchMoved++; if (!ev) s.touchMovedNoEvent++; }
    else { s.glideMoved++; if (!ev) { s.glideMovedNoEvent++; if (s.glideFirstNoEvent.length < 10) s.glideFirstNoEvent.push([t, F[i - 1][1], y]); } }
  }
  return { s, audit: A && { t: A.t, n: A.n, lag: A.lag, theme: A.m.length, sticky: A.v.length, pill: A.p.length,
      inSync: [A.m, A.v, A.p].map((l) => l.filter((x) => x[0] === x[3]).length), first: [...A.m, ...A.v, ...A.p].slice(0, 10) },
    frames: F, y: Math.round(scrollY), marks: performance.getEntriesByType('mark').map((e) => [e.name, Math.round(e.startTime)]) };
})() : null)`;

// The in-page half of tools/verify.mjs's measurement: a rAF frame logger + a long-animation-frame
// observer (LOGGER, injected before any page script), and the expressions that start (RESET) and read
// out (COLLECT, COLLECT_AT) one recording phase. Kept here, free of side effects, so the tests can run
// the exact page code in node:vm (tests/unit/perf-page.test.mjs).
//
// Phase boundaries (incident I-002 review): RESET stamps window.__perf.t0. LoAF entries are delivered
// asynchronously, so an entry from the previous phase's last frame can arrive after the next RESET;
// entries with startTime < t0 are dropped. Likewise a frame interval that began before t0 straddles the
// boundary and is not counted.

export const LOGGER = `(() => {
  const S = window.__perf = { frames: [], loaf: [], on: false, t0: 0 };
  let last = 0;
  const tick = (t) => { if (S.on && last && last >= S.t0) S.frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      if (!S.on) return;
      for (const e of list.getEntries()) if (e.startTime >= S.t0) S.loaf.push({
        start: e.startTime, duration: e.duration, blocking: e.blockingDuration,
        render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
        styleLayout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
        scripts: e.scripts.map((s) => ({ url: s.sourceURL, fn: s.sourceFunctionName, pos: s.sourceCharPosition,
          invoker: s.invoker, type: s.invokerType, dur: s.duration, forced: s.forcedStyleAndLayoutDuration, pause: s.pauseDuration })),
      });
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) { S.noLoaf = String(e); }
})();`;

/** Start a recording phase: clear the buffers, stamp the phase start, switch recording on. */
export const RESET = 'window.__perf.frames.length=0; window.__perf.loaf.length=0; window.__perf.t0=performance.now(); window.__perf.on=true';

/** Stop the phase and return its frames/LoAF. */
export const COLLECT = '(() => { const p = window.__perf; p.on = false; return JSON.parse(JSON.stringify(p)); })()';

/** Same as COLLECT, plus the scroll position at the end of the phase (the idle phase must stay at y=0). */
export const COLLECT_AT = '(() => { const p = window.__perf; p.on = false; const o = JSON.parse(JSON.stringify(p)); o.scrollY = scrollY; return o; })()';

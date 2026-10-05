/* P-148 motion hold (instrument, not a fix). Served as /px148-gate.js by the instrument overlay, loaded by a classic
   script as the first child of <head>, so it runs before every page module (both engines, base and arm alike).
   While __dcHoldOn() is in force, callbacks of window.setTimeout, window.setInterval and window.requestAnimationFrame
   are not run: timeouts and frames are queued and run by __dcHoldOff(); interval ticks are skipped and counted.
   The page's own calls go through these window properties (served JS calls window.setTimeout / setInterval /
   requestAnimationFrame or the bare globals, which resolve to the same properties at call time).
   __dcRAF is the original requestAnimationFrame, for the instrument's own frame waits. Counters per phase: __dcStat(). */
(() => {
  const W = window;
  const oRAF = W.requestAnimationFrame.bind(W), oST = W.setTimeout.bind(W), oSI = W.setInterval.bind(W);
  let hold = false, q = [], n = { raf: 0, timeout: 0, interval: 0 };
  W.__dcRAF = oRAF;
  W.requestAnimationFrame = (cb) => oRAF((t) => { if (!hold) return cb(t); n.raf++; q.push(() => W.requestAnimationFrame(cb)); });
  W.setTimeout = (cb, ms, ...a) => oST(() => {
    if (typeof cb !== 'function') return;
    if (!hold) return cb(...a);
    n.timeout++; q.push(() => cb(...a));
  }, ms);
  W.setInterval = (cb, ms, ...a) => oSI(() => {
    if (typeof cb !== 'function') return;
    if (!hold) return cb(...a);
    n.interval++;
  }, ms);
  W.__dcHoldOn = () => { hold = true; return 1; };
  W.__dcHoldOff = () => { hold = false; const r = q; q = []; for (const f of r) { try { f(); } catch (e) { setTimeout(() => { throw e; }, 0); } } return r.length; };
  W.__dcStat = (reset) => { const s = { ...n, queued: q.length, hold }; if (reset) n = { raf: 0, timeout: 0, interval: 0 }; return s; };
  W.__dcGate = 'px148-gate v1';
})();

// P-031 rAF-rate test pages (de-unknowns-ux, 2026-10-01). No Fastwork code.
// Question (claims-audit §2.7, F-071/F-073): do the 12-13 ms (~80 Hz) rAF runs in finger scrolls come from an
// accelerated CA animation on the page (candidate: WebKit asks (80,120,120) for each one) or from the touch scroll itself?
// Four pages, identical content and height (#list = 6000 px), differing only in the .mover square (rafrate.css):
//   static.html           no animation
//   anim-compositor.html  infinite CSS transform animation (composited candidate)
//   anim-paused.html      the same animation, animation-play-state: paused (present but not running)
//   anim-left.html        infinite CSS `left` animation (main-thread layout, not a CA animation)
// Logger: one rAF loop from load, logging [timestamp, scrollY] per callback (rAF-only scrollY read: neutral, P-023).
// Getter: window.__fwRafRate() -> JSON string {page, variant, ..., all/moving/idle: bins}, raw arrays with
// __fwRafRate({raw: true}). window.__fwRafRateReset() clears the log (call it right before a run). The page shows
// nothing about the log, so it does not change what is painted.
(() => {
  'use strict';
  const variant = document.body.dataset.variant;
  const words = ['Logo design', 'Web development', 'Translation', 'Video editing', 'Copywriting', 'Illustration', 'Marketing', 'Photography'];
  let html = '';
  for (let i = 0; i < 50; i++) {
    html += `<div class="card"><div class="thumb"></div><div class="txt"><b>${words[i % words.length]} #${i + 1}</b><span>Freelancer ${String.fromCharCode(65 + (i * 7) % 26)}. · ★ 4.${(i * 3) % 10} · from ${(i + 3) * 150} THB</span></div></div>`;
  }
  document.getElementById('list').innerHTML = html;

  const CAP = 40000; // ~8 min at 80 Hz
  let ts = [], ys = [], resetAt = 0;
  const tick = (t) => {
    if (ts.length < CAP) { ts.push(Math.round(t * 10) / 10); ys.push(Math.round(scrollY * 10) / 10); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // bins on the gap dt (ms); the phone stamps at 1 ms, so the P-031 bins are the integer ranges 11-14 and 16-17
  const BINS = [['lt10.5', 0, 10.5], ['11-14', 10.5, 14.5], ['15', 14.5, 15.5], ['16-17', 15.5, 17.5], ['18-25', 17.5, 25.5], ['gt25.5', 25.5, Infinity]];
  const binOf = (d) => BINS.find(([, lo, hi]) => d >= lo && d < hi)[0];
  function summarize(sel) {
    const out = Object.fromEntries(BINS.map(([k]) => [k, 0]));
    const ds = [];
    for (let i = 1; i < ts.length; i++) if (sel(i)) { const d = ts[i] - ts[i - 1]; out[binOf(d)]++; ds.push(d); }
    ds.sort((a, b) => a - b);
    const n = ds.length;
    return { n, bins: out, share11to14: n ? +(out['11-14'] / n).toFixed(3) : null, share16to17: n ? +(out['16-17'] / n).toFixed(3) : null,
      p50: n ? ds[n >> 1] : null, longestRun11to14: longestRun(sel) };
  }
  function longestRun(sel) {
    let best = 0, run = 0;
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      if (sel(i) && d >= 10.5 && d < 14.5) best = Math.max(best, ++run); else run = 0;
    }
    return best;
  }
  // a gap is "moving" when scrollY changed across it
  const moving = (i) => ys[i] !== ys[i - 1], idle = (i) => ys[i] === ys[i - 1];
  window.__fwRafRate = (opt = {}) => {
    const anims = document.getAnimations ? document.getAnimations().map((a) => ({ name: a.animationName || a.id || '?', state: a.playState })) : null;
    const r = { page: 'fw-rafrate-v1', variant, ua: navigator.userAgent, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight,
      docH: document.documentElement.scrollHeight, scrollRange: document.documentElement.scrollHeight - innerHeight,
      frames: ts.length, sinceResetMs: ts.length ? Math.round(ts[ts.length - 1] - (resetAt || ts[0])) : 0, capped: ts.length >= CAP,
      yMax: ys.length ? Math.max(...ys) : 0, animations: anims,
      all: summarize(() => true), moving: summarize(moving), idle: summarize(idle) };
    if (opt.raw) { r.ts = ts; r.ys = ys; }
    return JSON.stringify(r);
  };
  window.__fwRafRateReset = () => { ts = []; ys = []; resetAt = performance.now(); return 'reset'; };
})();

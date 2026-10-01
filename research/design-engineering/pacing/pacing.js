// Pacing-calibration page logic (see index.html header). A separate file: serve.mjs's CSP allows script-src 'self' only.
(() => {
  'use strict';
  const WATCH_MS = 4000, CYCLE = 1280, CARD_H = 120, N_CARDS = 24, PERIOD = CARD_H * N_CARDS;
  const strip = document.getElementById('strip');
  const words = ['Logo design', 'Web development', 'Translation', 'Video editing', 'Copywriting', 'Illustration', 'Marketing', 'Photography'];
  // two copies of the list so the wrap at PERIOD is seamless
  let html = '';
  for (let k = 0; k < 2 * N_CARDS; k++) {
    const i = k % N_CARDS;
    html += `<div class="card"><div class="thumb"></div><div class="txt"><b>${words[i % words.length]} #${i + 1}</b><span>Freelancer ${String.fromCharCode(65 + (i * 7) % 26)}. · ★ 4.${(i * 3) % 10} · from ${(i + 3) * 150} THB</span></div></div>`;
  }
  strip.innerHTML = html;

  const rnd = (() => { let s = (Date.now() ^ 0x5bd1e995) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // measured rAF interval decides the tick (60 or 120 Hz)
  let T = 1000 / 60;
  const measureRaf = () => new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (ts.length < 40) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } }; requestAnimationFrame(f); });

  // a pattern = list of present intervals in rAF ticks (k) or ms gaps (g); built after T is known
  function patterns() {
    const per = (ms) => Math.max(1, Math.round(ms / T));
    const hi = T < 12; // 120 Hz rAF
    return {
      steady: [1],
      g50: [per(50), 1, 1, 1, 1],
      s30: [per(33.33)],
      uneven: hi ? [3, 1] : [2, 1],
      g100: [per(100), ...Array(Math.max(1, Math.round((1000 - 100) / T))).fill(1)],
    };
  }

  const results = { page: 'fw-pacing-v1', startedAt: null, ua: navigator.userAgent, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, rafMs: null, trials: [] };
  window.__fwPacing = results;
  const save = () => { try { localStorage.setItem('fwPacing', JSON.stringify(results)); } catch (e) { /* private mode */ } };

  let plan = [], cur = null;
  function run(trial) {
    return new Promise((resolve) => {
      const seq = trial.seq; let si = 0, due = 0, t0 = 0, done = false;
      const raf = [], shown = [], ys = [];
      const SKIP = { early: [2, 3, 5, 6, 8, 9], late: [30, 31, 33, 34, 36, 37] }[trial.ease] || [];
      const tick = (ts) => {
        if (done) return;
        raf.push(Math.round(ts * 10) / 10);
        if (!t0) { t0 = ts; due = ts; }
        // present when this callback is the scheduled one (counted in rAF callbacks, so a system hitch shows up in raf[])
        if (trial.ease) {
          // the morph's tween: 739 px over 680 ms (1 - (1 - u)^3), 600 ms rest; skip 60 Hz ticks in SKIP of each cycle
          const el = ts - t0, cyc = Math.floor(el / CYCLE), ph = el - cyc * CYCLE, u = Math.min(1, ph / 680);
          if (!SKIP.includes(Math.round(ph / (1000 / 60)))) {
            const yy = cyc * 739 + 739 * (1 - (1 - u) ** 3);
            strip.style.transform = `translate3d(0, ${-(yy % PERIOD)}px, 0)`;
            shown.push(Math.round(ts * 10) / 10); ys.push(Math.round(yy * 10) / 10);
          }
        } else if (ts >= due - T / 2) {
          const yy = trial.v * (ts - t0) / 1000;
          strip.style.transform = `translate3d(0, ${-(yy % PERIOD)}px, 0)`;
          shown.push(Math.round(ts * 10) / 10); ys.push(Math.round(yy * 10) / 10);
          const k = seq[si++ % seq.length];
          due = (ts - due > T * 1.5 ? ts : due) + k * T;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      trial.stop = () => { done = true; trial.raf = raf; trial.shown = shown; trial.ys = ys; resolve(); };
    });
  }

  function next() {
    if (!plan.length) return finish();
    cur = plan.shift();
    document.getElementById('count').textContent = `${results.trials.length + 1} / ${results.trials.length + plan.length + 1}`;
    document.getElementById('rate').hidden = true;
    cur.startedAt = performance.now();
    run(cur);
    setTimeout(() => { document.getElementById('rate').hidden = false; }, WATCH_MS);
  }

  document.querySelectorAll('#rate button').forEach((b) => b.addEventListener('click', () => {
    if (!cur || document.getElementById('rate').hidden) return;
    cur.stop();
    results.trials.push({ n: results.trials.length + 1, pattern: cur.pattern, v: cur.v, ease: cur.ease || null, repeat: !!cur.repeat, seq: cur.seq || null, rating: +b.dataset.r,
      watchMs: Math.round(performance.now() - cur.startedAt), raf: cur.raf, shown: cur.shown, ys: cur.ys });
    save();
    strip.style.transform = 'translate3d(0,0,0)';
    cur = null;
    setTimeout(next, 600); // short blank between clips
  }));

  function finish() {
    document.getElementById('rate').hidden = true;
    document.getElementById('count').hidden = true;
    results.finishedAt = new Date().toISOString();
    save();
    document.getElementById('out').textContent = JSON.stringify({ page: results.page, rafMs: results.rafMs, ratings: results.trials.map((t) => [t.pattern, t.v, t.repeat ? 'r' : '', t.rating]) });
    document.getElementById('done').hidden = false;
  }

  measureRaf().then((ms) => {
    T = ms; results.rafMs = Math.round(ms * 100) / 100;
    document.getElementById('hz').textContent = `display rAF ≈ ${Math.round(1000 / ms)} Hz`;
  });

  document.getElementById('start').addEventListener('click', () => {
    const P = patterns();
    const base = [];
    for (const v of [600, 1600]) for (const [name, seq] of Object.entries(P)) base.push({ pattern: name, v, seq });
    for (const ease of ['early', 'late']) base.push({ pattern: `ease-${ease}`, v: 0, ease, seq: null });
    plan = shuffle(base.slice());
    // two repeats (consistency check), never back to back with their first showing
    const reps = shuffle(base.slice()).slice(0, 2).map((t) => ({ ...t, repeat: true }));
    for (const r of reps) { let at; do { at = 2 + Math.floor(rnd() * (plan.length - 1)); } while (plan[at - 1] && plan[at - 1].pattern === r.pattern && plan[at - 1].v === r.v); plan.splice(at, 0, r); }
    results.startedAt = new Date().toISOString();
    document.getElementById('intro').hidden = true;
    document.getElementById('count').hidden = false;
    setTimeout(next, 500);
  });
})();

// Pacing-calibration page v2 logic (see v2.html header). A separate file: serve.mjs's CSP allows script-src 'self' only (F-067).
(() => {
  'use strict';
  const WATCH_MS = 4000, PAIR_MS = 3 * 1280, BLANK_MS = 700, CYCLE = 1280, TWEEN = 680, AMP = 739, CARD_H = 120, N_CARDS = 24, PERIOD = CARD_H * N_CARDS;
  // 60 Hz tick indices (within each tween cycle) that are not presented: three 50 ms gaps (v1's sets)
  const SKIP = { none: [], early: [2, 3, 5, 6, 8, 9], late: [30, 31, 33, 34, 36, 37] };
  const $ = (id) => document.getElementById(id);
  const strip = $('strip');
  const words = ['Logo design', 'Web development', 'Translation', 'Video editing', 'Copywriting', 'Illustration', 'Marketing', 'Photography'];
  let html = '';
  for (let k = 0; k < 2 * N_CARDS; k++) {
    const i = k % N_CARDS;
    html += `<div class="card"><div class="thumb"></div><div class="txt"><b>${words[i % words.length]} #${i + 1}</b><span>Freelancer ${String.fromCharCode(65 + (i * 7) % 26)}. · ★ 4.${(i * 3) % 10} · from ${(i + 3) * 150} THB</span></div></div>`;
  }
  strip.innerHTML = html;
  const place = (yy) => { strip.style.transform = `translate3d(0, ${-(yy % PERIOD)}px, 0)`; };

  const seed = (Date.now() ^ 0x5bd1e995) >>> 0;
  const rnd = (() => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const r1 = (x) => Math.round(x * 10) / 10;

  let T = 1000 / 60;
  const measureRaf = () => new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (ts.length < 40) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } }; requestAnimationFrame(f); });
  // g100: one 100 ms gap per second, in rAF ticks (v1's pattern)
  const g100 = () => [Math.max(1, Math.round(100 / T)), ...Array(Math.max(1, Math.round((1000 - 100) / T))).fill(1)];

  // start one clip; returns stop() -> {raf, shown, ys}. spec: {ease, amp} (tween) or {v, seq} (linear, v1's scheduler)
  function start(spec) {
    let done = false, t0 = 0, due = 0, si = 0;
    const raf = [], shown = [], ys = [];
    const skip = spec.ease ? SKIP[spec.ease] : null;
    const tick = (ts) => {
      if (done) return;
      raf.push(r1(ts));
      if (!t0) { t0 = ts; due = ts; }
      if (skip) {
        const el = ts - t0, cyc = Math.floor(el / CYCLE), ph = el - cyc * CYCLE, u = Math.min(1, ph / TWEEN);
        if (!skip.includes(Math.round(ph / (1000 / 60)))) {
          const yy = cyc * spec.amp + spec.amp * (1 - (1 - u) ** 3);
          place(yy); shown.push(r1(ts)); ys.push(r1(yy));
        }
      } else if (ts >= due - T / 2) {
        const yy = spec.v * (ts - t0) / 1000;
        place(yy); shown.push(r1(ts)); ys.push(r1(yy));
        // next due from this frame's own stamp: v1 added k*T to the previous due, so a measured T slightly off the real
        // interval drifted until a tick was skipped (an unintended 33 ms frame, seen in the Chrome check)
        const k = spec.seq[si++ % spec.seq.length];
        due = ts + k * T;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { done = true; place(0); return { raf, shown, ys }; };
  }

  // shuffle until no two items of one group are adjacent and the first item passes `firstOk`
  function arrange(items, firstOk = () => true) {
    for (let n = 0; n < 5000; n++) {
      const a = shuffle(items.slice());
      if (firstOk(a[0]) && a.every((x, i) => i === 0 || a[i - 1].group !== x.group)) return a;
    }
    return items.slice();
  }

  function buildPlan() {
    const pairs = [];
    for (let i = 0; i < 4; i++) pairs.push({ kind: 'pair', group: 'ease-1', amp: AMP });
    for (const [group, amp] of [['ease-1/2', AMP / 2], ['ease-1/4', AMP / 4]]) for (let i = 0; i < 2; i++) pairs.push({ kind: 'pair', group, amp });
    pairs.push({ kind: 'pair', group: 'catch', amp: AMP, order: ['none', 'none'] });
    const p = arrange(pairs, (x) => x.group !== 'ease-1');
    // orders by occurrence: ease-1 AB, BA, BA, AB (A = early); half / quarter: random first, then reversed
    const EL = ['early', 'late'], LE = ['late', 'early'];
    const fixed = { 'ease-1': [EL, LE, LE, EL], 'ease-1/2': rnd() < 0.5 ? [EL, LE] : [LE, EL], 'ease-1/4': rnd() < 0.5 ? [EL, LE] : [LE, EL] };
    const seen = {};
    for (const x of p) { if (fixed[x.group]) { x.rep = (seen[x.group] = (seen[x.group] || 0) + 1); x.order = fixed[x.group][x.rep - 1]; } else x.rep = 1; }
    const rates = [];
    for (const v of [300, 600, 1600, 2400]) for (let rep = 1; rep <= 2; rep++) rates.push({ kind: 'rate', group: `g100-${v}`, v, rep });
    const q = arrange(rates);
    const reps = {};
    for (const x of q) x.rep = (reps[x.group] = (reps[x.group] || 0) + 1);
    return [...p, ...q];
  }

  const results = { page: 'fw-pacing-v2', seed, startedAt: null, finishedAt: null, ua: navigator.userAgent, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, rafMs: null, trials: [] };
  window.__fwPacingV2 = results;
  window.__fwPacingGet = () => JSON.stringify(results);
  const save = () => { try { localStorage.setItem('fwPacingV2', JSON.stringify(results)); } catch (e) { /* private mode */ } };

  let plan = [], idx = 0, cur = null, t00 = 0;
  const count = () => { $('count').textContent = `${idx + 1} / ${plan.length}`; };

  async function next() {
    if (idx >= plan.length) return finish();
    if (idx > 0 && plan[idx].kind === 'rate' && plan[idx - 1].kind === 'pair') { $('part2').hidden = false; return; }
    if (plan[idx].kind === 'rate') return runRate();
    // a pair: clip A, a blank, clip B, exactly 3 tween cycles each (3.84 s: both clips show 9 gaps), then choose
    cur = plan[idx]; count();
    cur.at = Math.round(performance.now() - t00);
    cur.clips = [];
    for (let c = 0; c < 2; c++) {
      $('badge').textContent = c ? 'B' : 'A'; $('badge').hidden = false;
      const stop = start({ ease: cur.order[c], amp: cur.amp });
      await wait(PAIR_MS);
      cur.clips.push(stop());
      $('badge').hidden = true;
      if (c === 0) await wait(BLANK_MS);
    }
    cur.shownAt = performance.now();
    $('choose').hidden = false;
  }

  const advance = () => { cur = null; idx++; save(); setTimeout(next, 600); };

  document.querySelectorAll('#choose button').forEach((b) => b.addEventListener('click', () => {
    if (!cur || cur.kind !== 'pair' || $('choose').hidden) return;
    $('choose').hidden = true;
    const c = b.dataset.c, chosen = cur.order[c === 'A' ? 0 : 1];
    results.trials.push({ n: idx + 1, kind: 'pair', group: cur.group, rep: cur.rep, amp: cur.amp, order: cur.order, choice: c, chosen,
      at: cur.at, rtMs: Math.round(performance.now() - cur.shownAt), clips: cur.clips });
    advance();
  }));

  document.querySelectorAll('#rate button').forEach((b) => b.addEventListener('click', () => {
    if (!cur || cur.kind !== 'rate' || $('rate').hidden) return;
    $('rate').hidden = true;
    const clip = cur.stop();
    results.trials.push({ n: idx + 1, kind: 'rate', group: cur.group, rep: cur.rep, v: cur.v, seq: cur.seq, rating: +b.dataset.r,
      at: cur.at, watchMs: Math.round(performance.now() - cur.startedAt), rtMs: Math.round(performance.now() - cur.shownAt), ...clip });
    advance();
  }));

  function summary() {
    const s = { page: results.page, rafMs: results.rafMs, lateChosen: {}, catch: null, ratings: {} };
    for (const t of results.trials) {
      if (t.kind === 'pair' && t.group === 'catch') s.catch = t.choice;
      else if (t.kind === 'pair') { const g = (s.lateChosen[t.group] ??= [0, 0]); g[0] += t.chosen === 'late' ? 1 : 0; g[1]++; }
      else (s.ratings[t.v] ??= []).push(t.rating);
    }
    s.lateChosen = Object.fromEntries(Object.entries(s.lateChosen).map(([g, [k, n]]) => [g, `${k}/${n}`]));
    s.choices = results.trials.filter((t) => t.kind === 'pair').map((t) => [t.group, t.order.map((o) => o[0]).join(''), t.choice]);
    return s;
  }

  function finish() {
    $('count').hidden = true;
    results.finishedAt = new Date().toISOString();
    save();
    $('out').textContent = JSON.stringify(summary());
    $('done').hidden = false;
  }

  measureRaf().then((ms) => {
    T = ms; results.rafMs = Math.round(ms * 100) / 100;
    $('hz').textContent = `display rAF ≈ ${Math.round(1000 / ms)} Hz`;
  });

  $('start').addEventListener('click', () => {
    plan = buildPlan(); idx = 0;
    results.plan = plan.map((x) => [x.group, x.rep, x.order ? x.order.join('-') : null]);
    results.startedAt = new Date().toISOString(); t00 = performance.now();
    $('intro').hidden = true; $('count').hidden = false;
    setTimeout(next, 500);
  });
  $('go2').addEventListener('click', () => {
    $('part2').hidden = true;
    runRate();
  });
  // a rating clip keeps moving until rated (as in v1); the panel appears after WATCH_MS
  function runRate() {
    cur = plan[idx]; count();
    cur.at = Math.round(performance.now() - t00);
    cur.seq = g100();
    cur.stop = start({ v: cur.v, seq: cur.seq });
    cur.startedAt = performance.now();
    setTimeout(() => { if (cur && cur.kind === 'rate') { cur.shownAt = performance.now(); $('rate').hidden = false; } }, WATCH_MS);
  }
})();

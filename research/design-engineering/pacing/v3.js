// Pacing v3: touch A/B ("which followed your finger better?"). See v3.html for the design and the modes,
// pacing-result.md §5 for the pre-registered reading. No Fastwork code.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const now = () => performance.now();
  const r1 = (x) => Math.round(x * 10) / 10;
  const P = new URLSearchParams(location.search);
  const LOAD = window.FW_V3_LOAD;
  const CAP = 40000;

  // ---------------------------------------------------------------------------------------------- states
  const STATES = {
    'hero-none': { surface: 'scroll', overlay: true, load: 'none', extra: null },
    'hero-trace': { surface: 'scroll', overlay: true, load: 'trace', extra: null },
    'drag-none': { surface: 'drag', load: 'none' },
    'drag-trace': { surface: 'drag', load: 'trace' },
    'drag-steady': { surface: 'drag', load: 'steady' },
    'scroll-passive': { surface: 'scroll', overlay: false, load: 'trace', extra: 'passive' },
    'scroll-nonpassive': { surface: 'scroll', overlay: false, load: 'trace', extra: 'nonpassive' },
  };
  // Fixed plan (pacing-result.md §5): never one arm twice in a row; the decision arm (passive) in order
  // AB, BA, BA, AB with A = scroll-nonpassive shown first. ?set=2 swaps the order inside every counted pair.
  const PLAN = [
    { arm: 'drag', practice: true, s: ['drag-trace', 'drag-none'] },
    { arm: 'hero', s: ['hero-trace', 'hero-none'] },
    { arm: 'drag', s: ['drag-none', 'drag-trace'] },
    { arm: 'passive', s: ['scroll-nonpassive', 'scroll-passive'] },
    { arm: 'steady', s: ['drag-steady', 'drag-trace'] },
    { arm: 'passive', s: ['scroll-passive', 'scroll-nonpassive'] },
    { arm: 'catch', s: ['scroll-passive', 'scroll-passive'] },
    { arm: 'hero', s: ['hero-none', 'hero-trace'] },
    { arm: 'passive', s: ['scroll-passive', 'scroll-nonpassive'] },
    { arm: 'drag', s: ['drag-trace', 'drag-none'] },
    { arm: 'steady', s: ['drag-trace', 'drag-steady'] },
    { arm: 'passive', s: ['scroll-nonpassive', 'scroll-passive'] },
  ];
  const SET = P.get('set') === '2' ? 2 : 1;

  // ---------------------------------------------------------------------------------------------- load
  // trace: the measured busy chunks in recorded time order, looped. Kind f (a rendering frame's work) runs inside
  // the rAF callback once due, at most one per callback; kind t runs as its own task (setTimeout) once due. When
  // the replay falls more than 100 ms behind (the page cannot keep up), the overdue chunks are skipped and counted.
  // steady: the trace's mean busy share, spread evenly: busyShare * 16.67 ms in every rAF callback.
  const Load = (() => {
    const F = [], T = [];
    let span = 0;
    for (const s of LOAD.sources) {
      for (const [st, d, k] of s.chunks) (k === 'f' ? F : T).push([span + st, d]);
      span += s.spanMs;
    }
    const steadyMs = LOAD.stats.busyShare * 1000 / 60;
    let mode = 'none', t0 = 0, fn = 0, tn = 0, timer = 0, log = [], skipped = 0;
    const at = (L, n) => L[n % L.length][0] + Math.floor(n / L.length) * span;
    const dur = (L, n) => L[n % L.length][1];
    function burn(d, kind) {
      const s = now(), e = s + d;
      while (now() < e) { /* busy */ }
      if (log.length < CAP) log.push([r1(s - t0), r1(now() - s), kind]);
    }
    function schedTask() {
      if (!T.length) return;
      timer = setTimeout(() => {
        if (mode !== 'trace') return;
        const e = now() - t0;
        while (at(T, tn + 1) <= e - 100) { tn++; skipped++; }
        burn(dur(T, tn), 't'); tn++;
        schedTask();
      }, Math.max(0, at(T, tn) - (now() - t0)));
    }
    return {
      start(m) { this.stop(); mode = m; t0 = now(); fn = 0; tn = 0; skipped = 0; log = []; if (m === 'trace') schedTask(); },
      stop() { clearTimeout(timer); mode = 'none'; },
      frame() {
        if (mode === 'steady') return burn(steadyMs, 's');
        if (mode !== 'trace') return;
        const e = now() - t0;
        if (at(F, fn) > e) return;
        while (at(F, fn + 1) <= e - 100) { fn++; skipped++; }
        burn(dur(F, fn), 'f'); fn++;
      },
      result() {
        const el = now() - t0, busy = log.reduce((a, c) => a + c[1], 0);
        return { mode, elapsedMs: r1(el), busyMs: r1(busy), busyShare: el > 0 ? Math.round(1000 * busy / el) / 1000 : null, skipped, chunks: log.slice() };
      },
      info: { traceSpanMs: span, frameChunks: F.length, taskChunks: T.length, steadyMs: r1(steadyMs), sources: LOAD.sources.map((s) => s.run), stats: LOAD.stats },
    };
  })();

  // ---------------------------------------------------------------------------------------------- surfaces
  const CARD_H = 120, N_CARDS = 120, N_TAGS = 9;
  const list = $('list');
  for (let i = 0; i < N_CARDS; i++) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<div class="thumb"></div><div class="txt"><b>Card ${i + 1}</b><span>Scroll me up and down</span></div>`;
    list.appendChild(c);
  }
  const tags = [];
  for (let k = 0; k < N_TAGS; k++) { const t = document.createElement('div'); t.className = 'tag'; $('hero').appendChild(t); tags.push({ el: t, c: null }); }
  const card = $('card');

  let cur = null; // the active state: { id, S, rec, extraCalls }
  let lastMove = null; // drag: [timeStamp, dx, dy] of the last applied touchmove
  let drag0 = null;

  // touch logger: passive capture listeners on window (they never block a scroll); every state has them
  const TCODE = { touchstart: 0, touchmove: 1, touchend: 2, touchcancel: 3 };
  const onTouch = (e) => {
    if (!cur) return;
    const t = e.changedTouches[0], r = cur.rec;
    if (r.touch.length < CAP) r.touch.push([TCODE[e.type], r1(e.timeStamp), r1(now()), e.cancelable ? 1 : 0, t ? r1(t.clientX) : null, t ? r1(t.clientY) : null]);
  };
  for (const ty of Object.keys(TCODE)) window.addEventListener(ty, onTouch, { capture: true, passive: true });

  // the variable of the passive arm: one more window touchmove listener, passive or not; it never prevents
  const extraH = () => { if (cur) cur.extraCalls++; };

  // drag surface: the card follows the finger from touchmove (relative drag), snaps home on release
  const dragArea = $('drag');
  dragArea.addEventListener('touchstart', (e) => { const t = e.touches[0]; drag0 = [t.clientX, t.clientY]; }, { passive: false });
  dragArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!drag0) return;
    const t = e.touches[0], dx = t.clientX - drag0[0], dy = t.clientY - drag0[1];
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    lastMove = [r1(e.timeStamp), r1(dx), r1(dy)];
  }, { passive: false });
  const release = () => { drag0 = null; card.style.transform = ''; lastMove = null; };
  dragArea.addEventListener('touchend', release, { passive: true });
  dragArea.addEventListener('touchcancel', release, { passive: true });

  let listTop = 0;
  function heroUpdate(y) {
    const maxY = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    $('bar').style.transform = `scaleX(${Math.min(1, Math.max(0, y / maxY))})`;
    const c0 = Math.floor((y - listTop) / CARD_H) - 1;
    for (let k = 0; k < N_TAGS; k++) {
      const c = c0 + k, tg = tags[k];
      tg.el.style.transform = `translate3d(116px, ${listTop + c * CARD_H + 82 - y}px, 0)`;
      if (tg.c !== c) { tg.c = c; tg.el.textContent = `tag ${c + 1}`; tg.el.style.visibility = c >= 0 && c < N_CARDS ? '' : 'hidden'; }
    }
  }

  function enter(id) {
    const S = STATES[id];
    if (!S) throw new Error(`unknown state ${id}`);
    leave();
    document.body.classList.toggle('dragmode', S.surface === 'drag');
    dragArea.hidden = S.surface !== 'drag';
    $('hero').hidden = !S.overlay;
    release();
    window.scrollTo(0, 0);
    listTop = list.getBoundingClientRect().top + scrollY;
    if (S.extra) window.addEventListener('touchmove', extraH, { capture: true, passive: S.extra === 'passive' });
    cur = { id, S, extraCalls: 0, rec: { state: id, t0: r1(now()), raf: [], touch: [] } };
    Load.start(S.load);
  }
  function leave() {
    if (!cur) return null;
    Load.stop();
    window.removeEventListener('touchmove', extraH, { capture: true });
    const out = { state: cur.id, surface: cur.S.surface, load: Load.result(), extra: cur.S.extra || null, extraCalls: cur.extraCalls, rec: cur.rec };
    out.load.chunks = out.load.chunks.length > 4000 ? out.load.chunks.slice(0, 4000) : out.load.chunks;
    cur = null;
    return out;
  }
  const snapshot = () => cur && { state: cur.id, surface: cur.S.surface, load: Load.result(), extra: cur.S.extra || null, extraCalls: cur.extraCalls, rec: cur.rec };

  // one rAF loop for the page: draw from the current input first, then pay the load (the frame is late by it)
  // raf entry: [ts, scrollY | null, last applied touchmove timeStamp | null, drag dy | null]
  function tick(ts) {
    requestAnimationFrame(tick);
    if (!cur) return;
    const r = cur.rec;
    if (cur.S.surface === 'scroll') {
      const y = scrollY;
      if (cur.S.overlay) heroUpdate(y);
      if (r.raf.length < CAP) r.raf.push([r1(ts), r1(y), null, null]);
    } else if (r.raf.length < CAP) r.raf.push([r1(ts), null, lastMove ? lastMove[0] : null, lastMove ? lastMove[2] : null]);
    Load.frame();
  }
  requestAnimationFrame(tick);

  function measureRaf() {
    return new Promise((res) => {
      const g = []; let last = null;
      const f = (t) => { if (last !== null) g.push(t - last); last = t; if (g.length < 60) requestAnimationFrame(f); else { g.sort((a, b) => a - b); res(g[30]); } };
      requestAnimationFrame(f);
    });
  }

  const base = () => ({ ua: navigator.userAgent, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, rafMs: null, load: Load.info });
  // only port + path of a served URL: LAN addresses stay out of results files (Hard rule 12)
  const urlLabel = (u) => { try { const x = new URL(u, location.href); return `:${x.port}${x.pathname}`; } catch (e) { return '?'; } };

  // ---------------------------------------------------------------------------------------------- mode G
  const gState = P.get('state');
  if (gState) {
    const res = { page: 'fw-pacing-v3', mode: 'g', state: gState, ...base(), startedAt: new Date().toISOString() };
    measureRaf().then((ms) => { res.rafMs = r1(ms); });
    $('count').textContent = gState; $('count').hidden = false;
    enter(gState);
    window.__fwPacingV3Reset = () => { enter(gState); return true; };
    window.__fwPacingV3Get = () => JSON.stringify({ ...res, readAt: new Date().toISOString(), visit: snapshot() });
    return;
  }

  // ---------------------------------------------------------------------------------------------- shared choose panel
  let choice = null, rating = null;
  function resetChoose(withAgain) {
    choice = null; rating = null;
    document.querySelectorAll('#choose button').forEach((b) => b.classList.remove('on'));
    $('nextBtn').disabled = true;
    document.querySelector('#choose .again').hidden = !withAgain;
  }
  document.querySelectorAll('#choose [data-c]').forEach((b) => b.addEventListener('click', () => {
    choice = b.dataset.c;
    document.querySelectorAll('#choose [data-c]').forEach((x) => x.classList.toggle('on', x === b));
    $('nextBtn').disabled = false;
  }));
  document.querySelectorAll('#choose [data-r]').forEach((b) => b.addEventListener('click', () => {
    rating = rating === +b.dataset.r ? null : +b.dataset.r;
    document.querySelectorAll('#choose [data-r]').forEach((x) => x.classList.toggle('on', +x.dataset.r === rating));
  }));

  // ---------------------------------------------------------------------------------------------- mode urls
  if (P.get('mode') === 'urls') {
    const a = P.get('a'), b = P.get('b'), q = P.get('q') || 'ab', nav = P.get('nav') === 'runner' ? 'runner' : 'self';
    const order = (P.get('order') || 'AB,BA').split(',').map((s) => s.trim().toUpperCase()).filter((s) => s === 'AB' || s === 'BA');
    const KEY = 'fwPacingV3urls', SKEY = `fwV3urls:${q}`;
    const load = (k, d, store) => { try { return JSON.parse(store.getItem(k)) || d; } catch (e) { return d; } };
    const all = load(KEY, {}, localStorage);
    const res = all[q] || (all[q] = { page: 'fw-pacing-v3-urls', q, a: urlLabel(a), b: urlLabel(b), order, ...base(), startedAt: new Date().toISOString(), trials: [] });
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private mode */ } };
    window.__fwPacingV3 = res;
    window.__fwPacingV3Get = () => JSON.stringify(res);
    let st = load(SKEY, { pair: 0, seen: [false, false], lastOpen: null, opens: [] }, sessionStorage);
    const put = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) { /* private mode */ } };
    const urlOf = (side) => { const o = order[st.pair]; return (o[side] === 'A') ? a : b; };
    const open = (side) => {
      st.lastOpen = side; st.opens.push({ side, at: new Date().toISOString() }); put();
      location.href = urlOf(side);
    };
    function render() {
      $('choose').hidden = true; $('urls').hidden = true; $('done').hidden = true;
      if (nav === 'runner') st.pair = Math.max(0, (+P.get('pair') || 1) - 1);
      if (st.lastOpen !== null) { st.seen[st.lastOpen] = true; st.opens[st.opens.length - 1].back = new Date().toISOString(); st.lastOpen = null; put(); }
      if (st.pair >= order.length) { $('out').textContent = JSON.stringify(res.trials.map((t) => [t.pair, t.order, t.choice, t.chosen, t.rating])); $('done').hidden = false; return; }
      $('count').textContent = `${st.pair + 1} / ${order.length}`; $('count').hidden = false;
      if (nav === 'self' && (!st.seen[0] || !st.seen[1])) {
        const side = st.seen[0] ? 1 : 0;
        $('urlsTitle').textContent = `Pair ${st.pair + 1} of ${order.length}: page ${side + 1}`;
        $('urlsText').textContent = `Tap Open to see page ${side + 1}. Scroll it the way you normally would for about 10 seconds: slow drags, quick flicks, stop and go. Then come back with the browser's back button.`;
        $('urlsNote').textContent = side ? 'Then you will pick the one that followed your finger better.' : '';
        $('urlsGo').onclick = () => open(side);
        $('urls').hidden = false;
        return;
      }
      resetChoose(nav === 'self');
      $('choose').hidden = false;
    }
    document.querySelectorAll('#choose [data-again]').forEach((x) => x.addEventListener('click', () => { if (nav === 'self') open(+x.dataset.again); }));
    $('nextBtn').addEventListener('click', () => {
      if (!choice) return;
      const o = order[st.pair], side = choice === 'first' ? 0 : 1;
      res.trials.push({ pair: st.pair + 1, order: o, choice, chosen: o[side], rating, nav, opens: st.opens, decidedAt: new Date().toISOString() });
      save();
      st = { pair: st.pair + 1, seen: [false, false], lastOpen: null, opens: [] }; put();
      if (nav === 'runner') { $('choose').hidden = true; $('out').textContent = 'Saved. Tell the lead you are done with this pair.'; $('done').hidden = false; return; }
      render();
    });
    window.addEventListener('pageshow', () => { st = load(SKEY, st, sessionStorage); render(); });
    measureRaf().then((ms) => { res.rafMs = r1(ms); save(); });
    return;
  }

  // ---------------------------------------------------------------------------------------------- mode session
  const results = { page: 'fw-pacing-v3', mode: 'session', set: SET, ...base(), startedAt: null, finishedAt: null, trials: [] };
  window.__fwPacingV3 = results;
  window.__fwPacingV3Get = () => JSON.stringify(results);
  const save = () => { try { localStorage.setItem('fwPacingV3', JSON.stringify(results)); } catch (e) { results.saveError = String(e); } };
  const plan = PLAN.map((p) => ({ ...p, s: (SET === 2 && !p.practice) ? [p.s[1], p.s[0]] : p.s.slice() }));
  results.plan = plan.map((p) => [p.arm, p.practice ? 'practice' : '', p.s.join(' | ')]);
  let idx = 0, pair = null, side = 0, t00 = 0, enterAt = 0, minMoves = 5;
  const HINT = { scroll: 'Scroll the list', drag: 'Drag the card' };

  function startPair() {
    if (idx >= plan.length) return finish();
    pair = { ...plan[idx], n: idx, visits: [], seen: [false, false], at: Math.round(now() - t00) };
    $('count').textContent = pair.practice ? 'practice' : `${idx} / ${plan.length - 1}`; $('count').hidden = false;
    visit(0);
  }
  function visit(s) {
    side = s;
    $('choose').hidden = true;
    enter(pair.s[s]);
    enterAt = now();
    $('badge').textContent = String(s + 1); $('badge').hidden = false;
    $('hint').textContent = `Version ${s + 1}: ${HINT[STATES[pair.s[s]].surface]}, then tap Done`;
    $('doneBtn').disabled = true; $('donebar').hidden = false;
  }
  // Done unlocks after 2 s and 5 touchmoves on this visit
  setInterval(() => {
    if (!cur || $('donebar').hidden) return;
    const moves = cur.rec.touch.reduce((k, t) => k + (t[0] === 1 ? 1 : 0), 0);
    $('doneBtn').disabled = !(moves >= minMoves && now() - enterAt >= 2000);
  }, 250);
  $('doneBtn').addEventListener('click', () => {
    const v = leave(); if (!v) return;
    v.side = side; v.atMs = Math.round(enterAt - t00); v.durMs = Math.round(now() - enterAt);
    pair.visits.push(v); pair.seen[side] = true;
    $('donebar').hidden = true; $('badge').hidden = true;
    window.scrollTo(0, 0);
    if (!pair.seen[1]) return setTimeout(() => visit(1), 400);
    pair.shownAt = now();
    resetChoose(true);
    $('choose').hidden = false;
  });
  document.querySelectorAll('#choose [data-again]').forEach((x) => x.addEventListener('click', () => { pair.again = (pair.again || 0) + 1; visit(+x.dataset.again); }));
  $('nextBtn').addEventListener('click', () => {
    if (!choice || !pair) return;
    $('choose').hidden = true;
    const k = choice === 'first' ? 0 : 1;
    results.trials.push({ n: pair.n, arm: pair.arm, practice: !!pair.practice, first: pair.s[0], second: pair.s[1], choice, chosen: pair.s[k],
      rating, again: pair.again || 0, at: pair.at, rtMs: Math.round(now() - pair.shownAt), visits: pair.visits });
    save();
    pair = null; idx++;
    setTimeout(startPair, 500);
  });

  function summary() {
    const s = { page: results.page, set: SET, rafMs: results.rafMs, arms: {}, catch: null, firstChosen: 0, counted: 0 };
    const win = { hero: 'hero-none', drag: 'drag-none', passive: 'scroll-passive', steady: 'drag-steady' };
    for (const t of results.trials) {
      if (t.practice) continue;
      s.counted++; if (t.choice === 'first') s.firstChosen++;
      if (t.arm === 'catch') { s.catch = { choice: t.choice, rating: t.rating }; continue; }
      const g = (s.arms[t.arm] ??= { key: win[t.arm], k: 0, n: 0 });
      g.n++; if (t.chosen === g.key) g.k++;
    }
    return s;
  }
  function finish() {
    $('count').hidden = true;
    results.finishedAt = new Date().toISOString();
    results.summary = summary();
    save();
    $('out').textContent = JSON.stringify(results.summary);
    $('done').hidden = false;
  }

  $('intro').hidden = false;
  measureRaf().then((ms) => { results.rafMs = r1(ms); $('hz').textContent = `display rAF ≈ ${Math.round(1000 / ms)} Hz · set ${SET}`; });
  $('start').addEventListener('click', () => {
    results.startedAt = new Date().toISOString(); t00 = now();
    $('intro').hidden = true;
    setTimeout(startPair, 300);
  });
})();

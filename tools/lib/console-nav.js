// The user console's shared top bar (ts-console-nav, user request 2026-10-02), loaded by both pages ("/" and
// "/progress") as /console-nav.js. The menu markup itself is server-made (console-server.mjs menuHtml), so it works as
// plain links without this script. This script adds:
//   - the live badge on "Your steps" (open steps: pending or active) and "(n) " in the tab title;
//   - notifications when a new step arrives: a banner with an Open button, a short Web Audio chime (mute: Alerts ->
//     Sound), a desktop notification once the user grants permission with a button (never asked on load), and one
//     reminder per step left on the user's turn for N minutes (default from the server, 3; Alerts -> Remind after);
//   - the theme switch (auto / light / dark), shared by both pages;
//   - threads (ts-console-threads): the "Threads" badge (threads with unread replies or a question for the user), and
//     on a new agent reply a banner (Open -> /threads#T-003), the chime and a desktop notification; the same rule as
//     console-threads.mjs diffThreads, from the `threads` events (polling fallback: /api/thread-feed). No reminders.
//   - proposals (ts-proposals): the "Proposals" badge (proposals waiting for the user's decision) and, on a new one, a
//     banner (Open -> /proposals#PR-001), the chime and a desktop notification; no reminders. From the `proposals`
//     field of the same `waiting` events.
// Data: the `waiting` events of GET /api/events (server-sent events: delivered at once even in a hidden tab, where
// Chrome may hold chained timers to one wake-up a minute after 5 min hidden; a polling fallback on /api/waiting).
// Only step ids and server-sanitized titles reach a notification. Nothing here loads anything from outside.
// Settings live in this browser's localStorage (every access in try/catch): console-sound, console-desktop,
// console-remind, console-theme, console-notify-state (which steps this browser already chimed for, so two open
// console tabs chime once; Web Locks serialize the tabs where available).
(function (root) {
  'use strict';

  // ---- pure core (also run by tests/unit/console-notify.test.mjs, against tools/lib/console-notify.mjs) ----
  /** Same rule as console-notify.mjs diffSteps: seed silently, 'new' per newly open id, one 'remind' per step. */
  function diffSteps(state, steps, nowMs, remindMs) {
    var seeded = !!(state && state.seeded);
    var prevOpen = (state && state.open) || {};
    var open = {}, events = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], prev = prevOpen[s.id];
      var idle = nowMs - Date.parse(s.updatedAt);
      var due = remindMs > 0 && s.yourTurn && idle >= remindMs;
      if (!seeded) { open[s.id] = { r: !!due }; continue; }
      if (!prev) { open[s.id] = { r: false }; events.push({ kind: 'new', step: s }); continue; }
      open[s.id] = { r: !!prev.r };
      if (due && !prev.r) { open[s.id].r = true; events.push({ kind: 'remind', step: s }); }
    }
    return { state: { seeded: true, open: open }, events: events };
  }
  function titleWith(base, n) { return (n > 0 ? '(' + n + ') ' : '') + base; }
  /** Same rule as console-threads.mjs diffThreads: seed silently; 'reply' when an unread thread's lastAgentN grew,
   *  'thread' for an unseen thread with unread replies (the lead started it). */
  function diffThreads(state, threads) {
    var seeded = !!(state && state.seeded);
    var prev = (state && state.seen) || {};
    var seen = {}, events = [];
    for (var i = 0; i < threads.length; i++) {
      var t = threads[i];
      seen[t.id] = t.lastAgentN;
      if (!seeded || !(t.unread > 0)) continue;
      if (!Object.prototype.hasOwnProperty.call(prev, t.id)) events.push({ kind: 'thread', thread: t });
      else if (t.lastAgentN > prev[t.id]) events.push({ kind: 'reply', thread: t });
    }
    return { state: { seeded: true, seen: seen }, events: events };
  }
  var ID = /^C-\d{1,6}$/;
  var TID = /^T-\d{1,6}$/;
  var PID = /^PR-\d{1,6}$/;
  var core = { diffSteps: diffSteps, diffThreads: diffThreads, titleWith: titleWith };
  root.ConsoleNotify = core;
  if (typeof document === 'undefined') return;

  // ---- storage ----
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function $(id) { return document.getElementById(id); }

  // ---- theme (auto / light / dark) ----
  var THEMES = ['auto', 'light', 'dark'];
  function theme() { var t = get('console-theme'); return THEMES.indexOf(t) >= 0 ? t : 'auto'; }
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    var b = $('nav-theme'); if (b) b.textContent = 'Theme: ' + t;
  }
  applyTheme(theme());

  // ---- sound: Web Audio, no files ----
  var actx = null;
  function audio() {
    if (actx) return actx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { actx = null; }
    return actx;
  }
  function unlock() { var c = audio(); if (c && c.state === 'suspended' && c.resume) c.resume().catch(function () {}); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, unlock, { passive: true }); });
  function soundOn() { return get('console-sound') !== 'off'; }
  function chime(quiet) {
    if (!soundOn()) return;
    var c = audio();
    if (!c) return;
    if (c.state === 'suspended' && c.resume) c.resume().catch(function () {});
    try {
      var t0 = c.currentTime + 0.03, notes = quiet ? [660] : [660, 990], peak = quiet ? 0.04 : 0.12;
      notes.forEach(function (f, i) {
        var o = c.createOscillator(), g = c.createGain(), s = t0 + i * 0.16;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(peak, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
        o.connect(g); g.connect(c.destination);
        o.start(s); o.stop(s + 0.45);
      });
    } catch (e) {}
  }

  // ---- desktop notifications (permission only on a click) ----
  function deskState() {
    if (!('Notification' in root)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission !== 'granted') return 'ask';
    return get('console-desktop') === 'off' ? 'paused' : 'on';
  }
  var DESK_LABEL = {
    unsupported: 'Desktop notifications: not available in this browser',
    blocked: 'Desktop notifications: blocked (allow them in the browser’s site settings)',
    ask: 'Enable desktop notifications',
    on: 'Desktop notifications: on (click to pause)',
    paused: 'Desktop notifications: paused (click to turn on)',
  };
  function desktop(title, body, id, force) {
    if (deskState() !== 'on') return;
    if (!force && document.hasFocus && document.hasFocus()) return; // the banner and chime cover a focused page
    try {
      var n = new Notification(title, { body: body, tag: 'console-' + id });
      n.onclick = function () { try { root.focus(); } catch (e) {} openStep(id); n.close(); };
    } catch (e) {}
  }

  // ---- reminder minutes ----
  var REMIND_CHOICES = [0, 1, 2, 3, 5, 10, 15, 30];
  var serverRemind = 3;
  function remindMin() {
    var v = get('console-remind');
    if (v !== null && v !== '' && !isNaN(Number(v))) return Math.max(0, Number(v));
    return serverRemind;
  }

  // ---- opening a step ----
  function onStepsPage() { return location.pathname === '/' || location.pathname === '/index.html'; }
  function reveal(id) {
    if (!ID.test(id)) return false;
    var sec = document.querySelector('section[data-id="' + id + '"]');
    if (!sec) return false;
    sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
    var b = sec.querySelector('button.primary:not([disabled])');
    if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    return true;
  }
  function openThread(id) {
    if (!TID.test(id)) return;
    if (location.pathname === '/threads' && typeof api.openThread === 'function') { api.openThread(id); return; }
    location.href = '/threads#' + id;
  }
  function openStep(id) {
    if (TID.test(id)) { openThread(id); return; }
    if (PID.test(id)) { if (location.pathname === '/proposals') location.hash = id; else location.href = '/proposals#' + id; return; }
    if (!ID.test(id)) return;
    if (onStepsPage() && reveal(id)) { try { history.replaceState(null, '', '#' + id); } catch (e) {} return; }
    location.href = '/#' + id;
  }

  // ---- banner ----
  var bannerIds = [];
  function showBanner(kind, list) {
    var b = $('nav-banner');
    if (!b || !list.length) return;
    var s = list[0];
    bannerIds = list.map(function (x) { return x.id; });
    b.replaceChildren();
    b.className = 'nav-banner' + (kind === 'remind' ? ' remind' : '');
    var txt = document.createElement('span');
    txt.className = 'nb-text';
    var lead = kind === 'remind' ? 'Still waiting for you: ' : kind === 'reply' ? 'New reply in ' + s.id + ': ' : kind === 'thread' ? 'New thread ' + s.id + ': ' : kind === 'proposal' ? 'New proposal: ' : 'New step: ';
    txt.textContent = lead + s.title + (list.length > 1 ? ' (+' + (list.length - 1) + ' more)' : '');
    var open = document.createElement('button');
    open.type = 'button'; open.className = 'nb-open'; open.textContent = 'Open ' + s.id;
    open.addEventListener('click', function () { hideBanner(); openStep(s.id); });
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'nb-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.addEventListener('click', hideBanner);
    b.append(txt, open, x);
    b.hidden = false;
  }
  function hideBanner() { var b = $('nav-banner'); if (b) b.hidden = true; bannerIds = []; }

  // ---- badge and title ----
  var baseTitle = document.title.replace(/^\(\d+\) /, '');
  var stepCount = 0, threadCount = 0, proposalCount = 0;
  function setCount(n) {
    stepCount = n;
    document.querySelectorAll('[data-badge]').forEach(function (e) {
      e.textContent = String(n); e.hidden = !(n > 0); e.setAttribute('aria-label', n + ' waiting for you');
    });
    document.title = titleWith(baseTitle, stepCount + threadCount + proposalCount);
  }
  function setThreadCount(n) {
    threadCount = n;
    document.querySelectorAll('[data-thread-badge]').forEach(function (e) {
      e.textContent = String(n); e.hidden = !(n > 0); e.setAttribute('aria-label', n + ' thread(s) with news for you');
    });
    document.title = titleWith(baseTitle, stepCount + threadCount + proposalCount);
  }
  function setProposalCount(n) {
    proposalCount = n;
    document.querySelectorAll('[data-badge-proposals]').forEach(function (e) {
      e.textContent = String(n); e.hidden = !(n > 0); e.setAttribute('aria-label', n + ' proposal(s) waiting for your decision');
    });
    document.title = titleWith(baseTitle, stepCount + threadCount + proposalCount);
  }

  // ---- the waiting feed ----
  var tabState = null, last = null, skew = 0;
  function loadShared(nowMs) {
    var st = null;
    try { st = JSON.parse(get('console-notify-state') || 'null'); } catch (e) { st = null; }
    // no console tab alive for 30 s: start over silently (no chime for what arrived while nobody looked)
    if (!st || typeof st !== 'object' || !(nowMs - (st.at || 0) < 30000)) return null;
    return st;
  }
  function withLock(fn) {
    if (root.navigator && navigator.locks && navigator.locks.request) navigator.locks.request('console-notify', function () { fn(); }).catch(function () { fn(); });
    else fn();
  }
  function handle(v, changed) {
    last = v;
    if (typeof v.remindMin === 'number') serverRemind = v.remindMin;
    if (v.proposals) setProposalCount(v.proposals.count || 0);
    setCount(v.count);
    var nowMs = Date.now() + skew, remMs = remindMin() * 60000;
    // this tab: banners
    var mine = diffSteps(tabState, v.steps, nowMs, remMs);
    tabState = mine.state;
    var news = mine.events.filter(function (e) { return e.kind === 'new'; }).map(function (e) { return e.step; });
    var rem = mine.events.filter(function (e) { return e.kind === 'remind'; }).map(function (e) { return e.step; });
    if (news.length) showBanner('new', news); else if (rem.length) showBanner('remind', rem);
    // a step banner goes when its steps are finished (a thread banner stays until dismissed or opened)
    if (bannerIds.length && ID.test(bannerIds[0]) && !v.steps.some(function (s) { return bannerIds.indexOf(s.id) >= 0; })) hideBanner();
    if (v.proposals && Array.isArray(v.proposals.items)) proposalsFeed(v.proposals.items, nowMs);
    // every tab of this browser together: chime and desktop notification once
    withLock(function () {
      var r = diffSteps(loadShared(nowMs), v.steps, nowMs, remMs);
      r.state.at = nowMs;
      set('console-notify-state', JSON.stringify(r.state));
      var n = r.events.filter(function (e) { return e.kind === 'new'; });
      var m = r.events.filter(function (e) { return e.kind === 'remind'; });
      if (n.length) {
        chime(false);
        n.slice(0, 3).forEach(function (e) { desktop('New step: ' + e.step.id, e.step.title, e.step.id); });
      } else if (m.length) {
        chime(true);
        desktop('Still waiting for you: ' + m[0].step.id, m[0].step.title, m[0].step.id);
      }
    });
    if (changed && typeof api.onChange === 'function') { try { api.onChange(v); } catch (e) {} }
  }
  // proposals: a banner per new one in this tab; the chime and desktop notification once per browser; no reminders
  var proposalTab = null;
  function proposalsFeed(items, nowMs) {
    var rows = items.filter(function (p) { return PID.test(p.id); });
    var mine = diffSteps(proposalTab, rows, nowMs, 0);
    proposalTab = mine.state;
    if (mine.events.length) showBanner('proposal', mine.events.map(function (e) { return e.step; }));
    if (bannerIds.length && PID.test(bannerIds[0]) && !rows.some(function (p) { return bannerIds.indexOf(p.id) >= 0; })) hideBanner();
    withLock(function () {
      var st = null;
      try { st = JSON.parse(get('console-proposal-state') || 'null'); } catch (e) { st = null; }
      if (!st || typeof st !== 'object' || !(nowMs - (st.at || 0) < 30000)) st = null; // no tab alive for 30 s: reseed silently
      var r = diffSteps(st, rows, nowMs, 0);
      r.state.at = nowMs;
      set('console-proposal-state', JSON.stringify(r.state));
      if (r.events.length) {
        chime(false);
        r.events.slice(0, 3).forEach(function (e) { desktop('New proposal: ' + e.step.id, e.step.title, e.step.id); });
      }
    });
  }
  var sig = '';
  function receive(v) {
    if (!v || !Array.isArray(v.steps)) return;
    var s = JSON.stringify([v.steps, v.proposals || null]);
    var changed = s !== sig; sig = s;
    var t = Date.parse(v.now); if (!isNaN(t)) skew = t - Date.now(); // only fresh data sets the clock
    handle(v, changed); // unchanged (a heartbeat): only the time moved on, for reminders
  }
  function tickReminders() { if (last) handle(last, false); }
  // ---- the threads feed ----
  var threadTab = null, threadSig = '';
  function receiveThreads(v) {
    if (!v || !Array.isArray(v.threads)) return;
    var s = JSON.stringify(v.threads);
    var changed = s !== threadSig; threadSig = s;
    setThreadCount(v.badge || 0);
    // the thread the user is reading right now (visible page) raises nothing
    var reading = document.visibilityState === 'visible' && typeof api.readingThread === 'function' ? api.readingThread() : null;
    var rows = v.threads.filter(function (t) { return TID.test(t.id); });
    var mine = diffThreads(threadTab, rows);
    threadTab = mine.state;
    var ev = mine.events.filter(function (e) { return e.thread.id !== reading; });
    if (ev.length) showBanner(ev[0].kind, ev.map(function (e) { return e.thread; }));
    withLock(function () {
      var st = null;
      try { st = JSON.parse(get('console-thread-state') || 'null'); } catch (e) { st = null; }
      var nowMs = Date.now();
      if (!st || typeof st !== 'object' || !(nowMs - (st.at || 0) < 30000)) st = null; // no tab alive for 30 s: reseed silently
      var r = diffThreads(st, rows);
      r.state.at = nowMs;
      set('console-thread-state', JSON.stringify(r.state));
      var n = r.events.filter(function (e) { return e.thread.id !== reading; });
      if (n.length) {
        chime(false);
        n.slice(0, 3).forEach(function (e) { desktop((e.kind === 'thread' ? 'New thread: ' : 'New reply: ') + e.thread.id, e.thread.title, e.thread.id); });
      }
    });
    if (changed && typeof api.onThreads === 'function') { try { api.onThreads(v); } catch (e) {} }
  }
  var polling = null;
  function poll() {
    fetch('/api/waiting', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(receive).catch(function () {});
    fetch('/api/thread-feed', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(receiveThreads).catch(function () {});
  }
  function startPolling() { if (!polling) { poll(); polling = setInterval(poll, 1000); } }
  function connect() {
    if (!root.EventSource) { startPolling(); return; }
    var es = new EventSource('/api/events');
    es.addEventListener('waiting', function (e) { try { receive(JSON.parse(e.data)); } catch (x) {} });
    es.addEventListener('threads', function (e) { try { receiveThreads(JSON.parse(e.data)); } catch (x) {} });
    es.onopen = function () { if (polling) { clearInterval(polling); polling = null; } };
    es.onerror = function () { if (es.readyState === 2) { startPolling(); setTimeout(connect, 30000); } }; // CLOSED (e.g. an older server): poll, retry later
  }
  setInterval(tickReminders, 5000); // reminders also fire between server events

  // ---- the Alerts panel ----
  function renderControls() {
    var sb = $('nav-sound');
    if (sb) { sb.textContent = soundOn() ? 'Sound: on' : 'Sound: muted'; sb.setAttribute('aria-pressed', String(soundOn())); }
    var db = $('nav-desktop');
    if (db) { var d = deskState(); db.textContent = DESK_LABEL[d]; db.disabled = d === 'unsupported' || d === 'blocked'; }
    var rs = $('nav-remind');
    if (rs) {
      var cur = remindMin();
      if (!rs.options.length || REMIND_CHOICES.indexOf(cur) < 0) {
        rs.replaceChildren();
        var ch = REMIND_CHOICES.indexOf(cur) < 0 ? REMIND_CHOICES.concat([cur]).sort(function (a, b) { return a - b; }) : REMIND_CHOICES;
        ch.forEach(function (m) { var o = document.createElement('option'); o.value = String(m); o.textContent = m === 0 ? 'never' : m + ' min'; rs.appendChild(o); });
      }
      rs.value = String(cur);
    }
    var sum = $('nav-alerts-sum');
    if (sum) sum.setAttribute('data-muted', String(!soundOn()));
  }
  function wire() {
    var sb = $('nav-sound');
    if (sb) sb.addEventListener('click', function () { set('console-sound', soundOn() ? 'off' : 'on'); renderControls(); if (soundOn()) chime(true); });
    var db = $('nav-desktop');
    if (db) db.addEventListener('click', function () {
      var d = deskState();
      if (d === 'ask') {
        var done = function () { set('console-desktop', 'on'); renderControls(); };
        try { var p = Notification.requestPermission(done); if (p && p.then) p.then(done); } catch (e) { done(); }
      } else if (d === 'on') { set('console-desktop', 'off'); renderControls(); }
      else if (d === 'paused') { set('console-desktop', 'on'); renderControls(); }
    });
    var rs = $('nav-remind');
    if (rs) rs.addEventListener('change', function () { set('console-remind', rs.value); renderControls(); });
    var tb = $('nav-test');
    if (tb) tb.addEventListener('click', function () {
      unlock();
      var fake = { id: 'C-000', title: 'Test: this is how a new step looks' };
      chime(false);
      desktop('New step: ' + fake.id, fake.title, fake.id, true);
      showBanner('new', [fake]);
    });
    var th = $('nav-theme');
    if (th) th.addEventListener('click', function () { var t = THEMES[(THEMES.indexOf(theme()) + 1) % 3]; set('console-theme', t); applyTheme(t); });
    var det = $('nav-alerts');
    if (det) document.addEventListener('click', function (e) { if (det.open && !det.contains(e.target)) det.open = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && det && det.open) det.open = false; });
    document.addEventListener('visibilitychange', renderControls);
    renderControls();
    applyTheme(theme());
  }

  // threads page hooks: openThread(id) (navigate in place), readingThread() -> the id shown and visible, onThreads(feed)
  var api = { core: core, reveal: reveal, openStep: openStep, openThreadLink: openThread, onChange: null, chime: chime, openThread: null, readingThread: null, onThreads: null };
  root.ConsoleNav = api;
  wire();
  connect();
})(typeof window !== 'undefined' ? window : this);

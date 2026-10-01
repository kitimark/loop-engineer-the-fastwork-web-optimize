// The user console's HTTP server (tools/console.mjs serve): the page (tools/lib/console-page.html) and a
// small JSON API over the store in ./console.mjs. Localhost only (127.0.0.1), never port 5173.
//   GET  /                       the page
//   GET  /api/steps              {now, steps: [public views]} (open steps oldest first, then the last finished ones)
//   POST /api/steps/<id>/<act>   act = start | done | answer | skip | reopen; JSON body {part, value, notes}
//   GET  /api/health             {ok, pid}
//   GET  /progress               the fix-progress page (tools/lib/progress-page.html; read-only)
//   GET  /api/progress           its model (tools/lib/progress.mjs currentView: curated fixes/PROGRESS.json + live
//                                locks, incidents and waiting steps; scrubbed of URLs, addresses and ids)
//   GET  /api/waiting            the badge / notification model (console-notify.mjs waitingView): {now, count,
//                                yourTurn, remindMin, steps: [{id, title (sanitized), status, yourTurn, updatedAt,
//                                queuedAt}]}; never a URL, instructions or meta
//   GET  /api/events             the same as server-sent events (`event: waiting`): at once, on every change (the
//                                store is checked every 500 ms) and every 10 s as a heartbeat
//   GET  /console-nav.js|.css    the shared top bar of both pages (menu, badge, banner, chime, desktop notifications)
// Both pages carry the same menu (menuHtml, injected at <!--console-menu-->), the current page highlighted.
// startServer(…, {notify: true}) (`console.mjs serve --notify`): a macOS notification per new step and one reminder
// (console-notify.mjs; osascript through execFile with an argv array, off by default, local only).
// POSTs need the header `x-console: 1` (a page on another origin can't send it without a CORS preflight,
// which this server never answers) and every request a localhost Host header (no DNS rebinding).
import http from 'node:http';
import { mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { list, publicView, start, done, answer, skip, reopen, consoleDir, serverFile, OPEN } from './console.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { currentView } from './progress.mjs';
import { waitingView, stepWatcher, createNotifier, DEFAULT_REMIND_MIN } from './console-notify.mjs';

/** The page (plain HTML, inline CSS and JS, no external requests). Read per request: an edit shows on reload. */
const PAGE_FILE = new URL('./console-page.html', import.meta.url);
const page = () => readFileSync(PAGE_FILE, 'utf8');
const PROGRESS_PAGE_FILE = new URL('./progress-page.html', import.meta.url);
const progressPage = () => readFileSync(PROGRESS_PAGE_FILE, 'utf8');
const NAV_JS_FILE = new URL('./console-nav.js', import.meta.url);
const NAV_CSS_FILE = new URL('./console-nav.css', import.meta.url);

/** The shared top bar of both pages; `current` = 'steps' | 'progress' (highlighted, aria-current). Plain links. */
export function menuHtml(current) {
  const on = (k) => (k === current ? ' on" aria-current="page' : '');
  return `<nav class="menu" aria-label="Console pages"><div class="menu-in">`
    + `<a class="mbtn${on('steps')}" title="What the agents need from you" href="/">Your steps<span class="badge" data-badge hidden>0</span></a>`
    + `<a class="mbtn${on('progress')}" title="Where the fixes stand" href="/progress">Progress</a>`
    + `<span class="menu-sp"></span>`
    + `<details class="alerts" id="nav-alerts"><summary id="nav-alerts-sum">Alerts</summary><div class="alerts-panel">`
    + `<button type="button" id="nav-sound" aria-pressed="true">Sound: on</button>`
    + `<button type="button" id="nav-desktop">Enable desktop notifications</button>`
    + `<label>Remind me after <select id="nav-remind" aria-label="Remind me after"></select></label>`
    + `<button type="button" id="nav-test">Test alert</button>`
    + `<button type="button" id="nav-theme">Theme: auto</button>`
    + `<p class="hint">A new step shows a banner here, chimes and puts the count in the tab title. Sound needs one click on the page first. Settings stay in this browser.</p>`
    + `</div></details></div></nav>`
    + `<div id="nav-banner" class="nav-banner" role="status" aria-live="polite" hidden></div>`;
}
const withMenu = (html, current) => html.replace('<!--console-menu-->', menuHtml(current));

const FINISHED_SHOWN = 40;
const ACTIONS = {
  start: (id, b) => start(id, { part: b.part }),
  done: (id, b) => done(id, { part: b.part, notes: b.notes }),
  answer: (id, b) => answer(id, { value: b.value, notes: b.notes, scale: b.scale }),
  skip: (id, b) => skip(id, { notes: b.notes }),
  reopen: (id) => reopen(id, { who: 'user' }),
};

/** Steps for the page: open ones in queue order, then the most recently finished (answered/skipped). */
export function pageSteps() {
  const all = list();
  const open = all.filter((s) => OPEN.has(s.status));
  const finished = all.filter((s) => s.status === 'answered' || s.status === 'skipped')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, FINISHED_SHOWN);
  return [...open, ...finished].map(publicView);
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': CSP,
  });
  res.end(data);
}
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * The waiting feed: checks the store every `intervalMs`, pushes `event: waiting` to every /api/events client on a
 * change and every `heartbeatMs`, and drives the --notify watcher. One timer per server.
 */
export function createFeed({ remindMin = DEFAULT_REMIND_MIN, notify = null, intervalMs = 500, heartbeatMs = 10000 } = {}) {
  const subs = new Set();
  const watch = notify ? stepWatcher({ notify, remindMin }) : null;
  let sig = null, view = null, beat = Date.now();
  const write = (res, v) => { try { res.write(`event: waiting\ndata: ${JSON.stringify(v)}\n\n`); } catch {} };
  const tick = () => {
    if (!subs.size && !watch) { view = null; sig = null; return; } // nobody listens: no store reads
    let v;
    try { v = waitingView(undefined, { remindMin }); } catch { return; } // a half-written step file: next tick
    const s = JSON.stringify(v.steps);
    if (watch) { try { watch(v.steps, Date.parse(v.now)); } catch {} }
    view = v;
    if (s !== sig) { sig = s; beat = Date.now(); for (const r of subs) write(r, v); }
    else if (Date.now() - beat >= heartbeatMs) { beat = Date.now(); for (const r of subs) write(r, v); }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return {
    current: () => view || waitingView(undefined, { remindMin }),
    subscribe(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': CSP,
      });
      res.write('retry: 2000\n\n');
      const v = this.current();
      write(res, v);
      if (!subs.size) sig = JSON.stringify(v.steps);
      subs.add(res);
      res.on('close', () => subs.delete(res));
    },
    close() { clearInterval(timer); for (const r of subs) { try { r.end(); } catch {} } subs.clear(); },
    subscribers: () => subs.size,
  };
}

function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const localHost = (h, port) => h === `localhost:${port}` || h === `127.0.0.1:${port}` || h === `[::1]:${port}`;

export function handler(port, feed = null) {
  return async (req, res) => {
    try {
      if (!localHost(req.headers.host || '', port())) return send(res, 421, { error: 'localhost only' });
      const u = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) return send(res, 200, withMenu(page(), 'steps'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/console-nav.js') return send(res, 200, readFileSync(NAV_JS_FILE, 'utf8'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/console-nav.css') return send(res, 200, readFileSync(NAV_CSS_FILE, 'utf8'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/waiting') return send(res, 200, feed ? feed.current() : waitingView());
      if (req.method === 'GET' && u.pathname === '/api/events') {
        if (!feed) return send(res, 404, { error: 'no event feed' });
        return feed.subscribe(req, res);
      }
      if (req.method === 'GET' && u.pathname === '/api/health') return send(res, 200, { ok: true, pid: process.pid });
      if (req.method === 'GET' && u.pathname === '/api/steps') return send(res, 200, { now: iso(), steps: pageSteps() });
      if (req.method === 'GET' && (u.pathname === '/progress' || u.pathname === '/progress.html')) return send(res, 200, withMenu(progressPage(), 'progress'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/progress') return send(res, 200, await currentView());
      const m = u.pathname.match(/^\/api\/steps\/(C-\d{1,6})\/([a-z]+)$/);
      if (m && req.method === 'POST') {
        if (req.headers['x-console'] !== '1') return send(res, 403, { error: 'missing x-console header' });
        const act = ACTIONS[m[2]];
        if (!act) return send(res, 404, { error: `unknown action ${m[2]}` });
        let body = {};
        const raw = await readBody(req);
        if (raw) { try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'body is not JSON' }); } }
        try { return send(res, 200, { step: publicView(await act(m[1], body || {})) }); } catch (e) { return send(res, 409, { error: e.message }); }
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: e.message || String(e) });
    }
  };
}

/** The running server named by server.json, if its pid lives (the caller checks that it answers). */
export function runningServer() {
  const s = readJson(serverFile());
  if (!s || !s.url || !s.pid) return null;
  try { process.kill(s.pid, 0); } catch (e) { if (e.code !== 'EPERM') return null; }
  return s;
}

/**
 * Listen on the first free port of `candidates` (127.0.0.1) and record it in server.json.
 * opts: {notify: false | true | fn(step, kind), remindMin: 3, onNotifyError}. Returns {server, port, url, feed, close()}.
 */
export async function startServer(candidates, { notify = false, remindMin = DEFAULT_REMIND_MIN, onNotifyError } = {}) {
  let port = 0;
  const notifyFn = typeof notify === 'function' ? notify : notify ? createNotifier({ onError: onNotifyError }) : null;
  const feed = createFeed({ remindMin, notify: notifyFn });
  const server = http.createServer(handler(() => port, feed));
  for (const c of candidates) {
    if (c === 5173) continue; // the main session's mirror port, never
    const ok = await new Promise((resolve, reject) => {
      const onErr = (e) => { server.off('listening', onOk); if (e.code === 'EADDRINUSE' || e.code === 'EACCES') resolve(false); else reject(e); };
      const onOk = () => { server.off('error', onErr); resolve(true); };
      server.once('error', onErr); server.once('listening', onOk);
      server.listen(c, '127.0.0.1');
    });
    if (ok) { port = server.address().port; break; }
  }
  if (!port) { feed.close(); throw new Error(`no free port among ${candidates.length} candidate(s) (${candidates[0]}…)`); }
  const url = `http://localhost:${port}/`;
  mkdirSync(consoleDir(), { recursive: true });
  writeJson(serverFile(), { url, port, pid: process.pid, startedAt: iso() });
  const close = () => {
    const s = readJson(serverFile());
    if (s && s.pid === process.pid) { try { unlinkSync(serverFile()); } catch {} }
    feed.close();
    const done = new Promise((r) => server.close(() => r()));
    server.closeAllConnections?.();
    return done;
  };
  return { server, port, url, feed, close };
}

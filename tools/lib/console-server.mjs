// The user console's HTTP server (tools/console.mjs serve): the page (tools/lib/console-page.html) and a
// small JSON API over the store in ./console.mjs. Localhost only (127.0.0.1), never port 5173.
//   GET  /                       the page
//   GET  /api/steps              {now, steps: [public views]} (open steps oldest first, then the last finished ones)
//   POST /api/steps/<id>/<act>   act = start | done | answer | skip | reopen; JSON body {part, value, notes}
//   GET  /api/health             {ok, pid}
//   GET  /progress               the fix-progress page (tools/lib/progress-page.html; read-only)
//   GET  /api/progress           its model (tools/lib/progress.mjs currentView: curated fixes/PROGRESS.json + live
//                                locks, incidents and waiting steps; scrubbed of URLs, addresses and ids)
//   GET  /status                 the status board (tools/lib/status-page.html; read-only): every workstream's priority,
//                                state, waits (self-reported + derived from the locks, steps, incidents), owner, note
//   GET  /api/status             its model (tools/lib/status.mjs currentStatusView; scrubbed like /api/progress)
//   GET  /api/waiting            the badge / notification model (console-notify.mjs waitingView): {now, count,
//                                yourTurn, remindMin, steps: [{id, title (sanitized), status, yourTurn, updatedAt,
//                                queuedAt}]}; never a URL, instructions or meta
//   GET  /api/events             the same as server-sent events (`event: waiting`): at once, on every change (the
//                                store is checked every 500 ms) and every 10 s as a heartbeat
//   GET  /console-nav.js|.css    the shared top bar of both pages (menu, badge, banner, chime, desktop notifications)
//   GET  /threads                the threads page (tools/lib/threads-page.html; ts-console-threads, console-threads.mjs)
//   GET  /api/threads            {now, threads: [summary]} (the user's unread first, closed last)
//   GET  /api/threads/<T-id>     {thread} (messages; no agents' read marks, no history)
//   GET  /api/thread-feed        the badge / notification model (console-threads.mjs feedView: ids, sanitized titles,
//                                counts); also pushed as `event: threads` on /api/events
//   POST /api/threads            {title, text, topic?}: the user starts a thread
//   POST /api/threads/<T-id>/<act>  act = reply {text} | read {n} | close | reopen  (the user, from the page)
//   Thread POSTs: like the step POSTs (localhost Host, x-console: 1), plus an Origin, when sent, must be this server's
//   localhost origin, and a body over 64 KB gets 413.
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
import { currentStatusView } from './status.mjs';
import { waitingView, stepWatcher, createNotifier, DEFAULT_REMIND_MIN } from './console-notify.mjs';
import { feedView as threadFeedView, threadWatcher, listThreads, getThread, summary as threadSummary, pageThread, pageOrder, createThread, replyUser, markRead, setStatus, USER } from './console-threads.mjs';

/** The page (plain HTML, inline CSS and JS, no external requests). Read per request: an edit shows on reload. */
const PAGE_FILE = new URL('./console-page.html', import.meta.url);
const page = () => readFileSync(PAGE_FILE, 'utf8');
const PROGRESS_PAGE_FILE = new URL('./progress-page.html', import.meta.url);
const progressPage = () => readFileSync(PROGRESS_PAGE_FILE, 'utf8');
const STATUS_PAGE_FILE = new URL('./status-page.html', import.meta.url);
const statusPage = () => readFileSync(STATUS_PAGE_FILE, 'utf8');
const NAV_JS_FILE = new URL('./console-nav.js', import.meta.url);
const NAV_CSS_FILE = new URL('./console-nav.css', import.meta.url);
const THREADS_PAGE_FILE = new URL('./threads-page.html', import.meta.url);
const threadsPage = () => readFileSync(THREADS_PAGE_FILE, 'utf8');

/** The shared top bar of every page; `current` = 'steps' | 'status' | 'progress' | 'threads' (highlighted, aria-current). Plain links. */
export function menuHtml(current) {
  const on = (k) => (k === current ? ' on" aria-current="page' : '');
  return `<nav class="menu" aria-label="Console pages"><div class="menu-in">`
    + `<a class="mbtn${on('steps')}" title="What the agents need from you" href="/">Your steps<span class="badge" data-badge hidden>0</span></a>`
    + `<a class="mbtn${on('status')}" title="Who is doing what, in priority order" href="/status">Status</a>`
    + `<a class="mbtn${on('progress')}" title="Where the fixes stand" href="/progress">Progress</a>`
    + `<a class="mbtn${on('threads')}" title="Your questions to the agents, one thread per topic" href="/threads">Threads<span class="badge" data-thread-badge hidden>0</span></a>`
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
  const twatch = notify ? threadWatcher({ notify }) : null; // a new reply: 'reply' / 'thread' (no reminders for threads)
  let sig = null, view = null, beat = Date.now(), tsig = null, tview = null;
  const write = (res, v) => { try { res.write(`event: waiting\ndata: ${JSON.stringify(v)}\n\n`); } catch {} };
  const writeT = (res, v) => { try { res.write(`event: threads\ndata: ${JSON.stringify(v)}\n\n`); } catch {} };
  const tick = () => {
    if (!subs.size && !watch) { view = null; sig = null; tview = null; tsig = null; return; } // nobody listens: no store reads
    let tv = null;
    try { tv = threadFeedView(); } catch {} // a half-written thread file: next tick
    if (tv) {
      if (twatch) { try { twatch(tv.threads); } catch {} }
      tview = tv;
      const ts = JSON.stringify([tv.badge, tv.threads]);
      if (ts !== tsig) { tsig = ts; for (const r of subs) writeT(r, tv); }
    }
    let v;
    try { v = waitingView(undefined, { remindMin }); } catch { return; } // a half-written step file: next tick
    const s = JSON.stringify(v.steps);
    if (watch) { try { watch(v.steps, Date.parse(v.now)); } catch {} }
    view = v;
    if (s !== sig) { sig = s; beat = Date.now(); for (const r of subs) write(r, v); }
    else if (Date.now() - beat >= heartbeatMs) { beat = Date.now(); for (const r of subs) { write(r, v); if (tview) writeT(r, tview); } }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return {
    current: () => view || waitingView(undefined, { remindMin }),
    currentThreads: () => tview || threadFeedView(),
    subscribe(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': CSP,
      });
      res.write('retry: 2000\n\n');
      const v = this.current();
      write(res, v);
      try { const tv = this.currentThreads(); writeT(res, tv); if (!subs.size) tsig = JSON.stringify([tv.badge, tv.threads]); } catch {}
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

/** Thread POSTs: x-console: 1 (no cross-origin page sends it without a preflight we never answer) and, when the
 *  browser sends an Origin, this server's own localhost origin. Returns an error message, or null when allowed. */
export function threadPostRefusal(req, port) {
  if (req.headers['x-console'] !== '1') return 'missing x-console header';
  const o = req.headers.origin;
  if (o !== undefined && !(o === `http://localhost:${port}` || o === `http://127.0.0.1:${port}` || o === `http://[::1]:${port}`)) return 'foreign origin';
  return null;
}

/** A JSON body of at most `max` bytes: {body} | {status, error} (413 too large, 400 not a JSON object). */
function readJsonBody(req, max = 64 * 1024) {
  return new Promise((resolve) => {
    let n = 0, over = false; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > max) over = true; else chunks.push(c); });
    req.on('error', () => resolve({ status: 400, error: 'request error' }));
    req.on('end', () => {
      if (over) return resolve({ status: 413, error: 'body too large (64 KB max)' });
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({ body: {} });
      try { const b = JSON.parse(raw); return resolve(b && typeof b === 'object' && !Array.isArray(b) ? { body: b } : { status: 400, error: 'body is not a JSON object' }); } catch { return resolve({ status: 400, error: 'body is not JSON' }); }
    });
  });
}

const THREAD_ACTIONS = {
  reply: (id, b) => replyUser(id, { text: b.text }),
  read: (id, b) => markRead(id, USER, b.n),
  close: (id) => setStatus(id, { status: 'closed', fromPage: true }),
  reopen: (id) => setStatus(id, { status: 'open', fromPage: true }),
};

/** The thread routes; returns true when it answered. */
async function threadRoute(req, res, u, port, feed) {
  const p = u.pathname;
  if (req.method === 'GET' && (p === '/threads' || p === '/threads.html')) { send(res, 200, withMenu(threadsPage(), 'threads'), 'text/html; charset=utf-8'); return true; }
  if (req.method === 'GET' && p === '/api/thread-feed') { send(res, 200, feed ? feed.currentThreads() : threadFeedView()); return true; }
  if (req.method === 'GET' && p === '/api/threads') { send(res, 200, { now: iso(), threads: listThreads().map((t) => threadSummary(t)).sort(pageOrder) }); return true; }
  const one = p.match(/^\/api\/threads\/(T-\d{1,6})$/);
  if (req.method === 'GET' && one) {
    try { send(res, 200, { thread: pageThread(getThread(one[1])) }); } catch (e) { send(res, 404, { error: e.message }); }
    return true;
  }
  const act = p.match(/^\/api\/threads\/(T-\d{1,6})\/([a-z]+)$/);
  if (req.method === 'POST' && (p === '/api/threads' || act)) {
    const refused = threadPostRefusal(req, port);
    if (refused) { send(res, 403, { error: refused }); return true; }
    const fn = act ? THREAD_ACTIONS[act[2]] : null;
    if (act && !fn) { send(res, 404, { error: `unknown action ${act[2]}` }); return true; }
    const b = await readJsonBody(req);
    if (b.error) { send(res, b.status, { error: b.error }); return true; }
    try {
      const r = act ? await fn(act[1], b.body) : await createThread({ title: b.body.title, text: b.body.text, topic: b.body.topic, fromPage: true });
      send(res, 200, { thread: pageThread(r.thread) });
    } catch (e) { send(res, /^no thread /.test(e.message) ? 404 : 409, { error: e.message }); }
    return true;
  }
  return false;
}

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
      if (req.method === 'GET' && (u.pathname === '/status' || u.pathname === '/status.html')) return send(res, 200, withMenu(statusPage(), 'status'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/status') return send(res, 200, await currentStatusView());
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
      if (await threadRoute(req, res, u, port(), feed)) return;
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

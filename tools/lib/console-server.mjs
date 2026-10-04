// The user console's HTTP server (tools/console.mjs serve): the page (tools/lib/console-page.html) and a
// small JSON API over the store in ./console.mjs. Localhost only (127.0.0.1), never port 5173.
//   GET  /                       the page
//   GET  /api/steps              {now, steps: [public views]} (open steps oldest first, then the last finished ones)
//   POST /api/steps/<id>/<act>   act = start | done | answer | skip | reopen | restart; JSON body {part, value, notes}
//                                (done on a runner-ended part: 403 with a plain message, I-059; other refusals 409)
//   GET  /api/health             {ok, pid}
//   GET  /progress               the fix-progress page (tools/lib/progress-page.html; read-only)
//   GET  /api/progress           its model (tools/lib/progress.mjs currentView: curated fixes/PROGRESS.json + live
//                                locks, incidents and waiting steps; scrubbed of URLs, addresses and ids)
//   GET  /build                  today's best build (the progress page's build view, I-061): what is in it, the whole
//                                build vs the original, what was tried and not applied and why
//   GET  /writeup/<path>         a write-up the build page links (a .md under fixes/ or research/; text/plain, scrubbed)
//   GET  /status                 the status board (tools/lib/status-page.html; read-only): every workstream's priority,
//                                state, waits (self-reported + derived from the locks, steps, incidents), owner, note
//   GET  /api/status             its model (tools/lib/status.mjs currentStatusView; scrubbed like /api/progress)
//   GET  /agents                 I-118: every agent, running now first, then the finished ones by last activity
//                                (tools/lib/agents-page.html; read-only); /agent/<name>: one agent's page (the same file)
//   GET  /api/agents             {schema fw-agents/1, agents: [{name, running, now, lastAt, lastWhat, href}]}
//   GET  /api/agent/<name>       {schema fw-agent/1, …}: one agent's status rows, live holds and queue places, waits,
//                                holds.log lines, console steps, threads, commits on main tagged "(<name>)", fixes/*/README.md
//                                that name it, incidents, findings, proposals, and the merged timeline (agent-view.mjs:
//                                bounded reads, cached, scrubbed like /api/status); 400 for a name that is no agent name
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
//   POST /api/threads            {title, text, topic?, images?, forLead?}: the user starts a thread
//   POST /api/threads/<T-id>/<act>  act = reply {text, images?, forLead?} | read {n} | close | reopen  (the user, from the page)
//                                T-050: forLead true = the "For the lead" tick (the lead's triage wait wakes at once);
//                                summaries and threads carry toState [{name, listening, how}] and backstopMin (10)
//                                images (I-089): [{data: base64, caption?}], sniffed and limited in console-threads.mjs;
//                                these two POSTs take up to THREAD_BODY_MAX bytes, every other one 64 KB
//   GET  /thread-media/<T-id>/<name>  a thread's image (m4-1.png), from the store only: strict names, and only a name
//                                one of the thread's messages carries (console-threads.mjs threadMediaFile)
//   GET  /console-comments.js    comments on console items (I-090, user T-043): every page loads it with the menu
//   GET  /api/comments?page=<p>  {page, items: {<item>: {count, open, threads: [{id, state}]}}}: the markers of one page
//   POST /api/comments           {anchor: {page, item, quote?, label?}, text}: the user's comment becomes a thread with
//                                that anchor (console-comments.mjs normAnchor: a known page, an allowlisted item id,
//                                caps); the lead reads it (thread wait). Same guards as the thread POSTs, 64 KB.
//                                I-096: every page is also its own anchor "part:page" (any line on it; the line goes
//                                along as the quote), so the user can comment anywhere.
//                                T-048: on a proposal (anchor page proposals) the thread is assigned at once to the
//                                proposal's author (proposal-talk.mjs talkRoute), whose thread wait wakes on it too.
//   Thread POSTs: like the step POSTs (localhost Host, x-console: 1), plus an Origin, when sent, must be this server's
//   localhost origin, and a body over 64 KB gets 413.
//   GET  /proposals              the proposals page (tools/lib/proposals-page.html, ts-proposals): PoCs to compare and decide
//   GET  /api/proposals          {now, proposals: [summaries]} (waiting first; no drafts, no withdrawn ones)
//   GET  /api/proposals/<id>/talk  T-048: {talk: {id, to, threads: [page threads anchored on it, oldest first]}}: the
//                                questions and answers under the proposal (proposal-talk.mjs talkView); 404 when hidden.
//                                /api/proposals adds talk: {count, open, waiting, unread, yourTurn} to a proposal with any.
//   GET  /api/proposals/<id>     one proposal (proposal.mjs publicView: text, gain, compare with /media/ URLs; no history)
//   POST /api/proposals/<id>/<act>  act = decide {value: accept|reject|change, notes, rev, option?} | undo {rev}
//                                (option: I-053, the picked option's name on a proposal with options); 409 while the
//                                proposal is on hold (T-030: "PR-008 is on hold (lead: …)"), or revised since `rev`
//   GET  /media/<id>/<name>      a proposal's screenshot or video, from the store only (strict names; Range for video)
//   POST /api/live/<id>/start    I-074 "Try it": {option?} -> {a, b, measuring, idleMin, version}: starts (or reuses) two
//                                tools/serve.mjs children, A = the baseline, B = the baseline + the proposal's (option's)
//                                live patch (tools/lib/live.mjs), on 127.0.0.1 with --frame-ancestors this console's origins;
//                                404 when it has no live entry. Guarded like the thread POSTs (x-console, own Origin).
//                                409 for a console opened at http://[::1]:<port>: open it at localhost or 127.0.0.1
//                                (an IPv6 literal is no CSP host-source, CSP3 §2.3.1 grammar, so no frame-ancestors).
//   POST /api/live/ping          {ok, measuring, running}: the open panel's heartbeat (every minute); 10 min without one
//                                ($FW_CONSOLE_LIVE_IDLE_SEC) and the children are killed; also when the console exits.
//                                measuring: chrome-measure has a timing hold (the panel shows a note, never blocks).
//   The proposals page alone may frame http://localhost:* and http://127.0.0.1:* (CSP frame-src); nothing frames the console.
// Both pages carry the same menu (menuHtml, injected at <!--console-menu-->), the current page highlighted.
// startServer(…, {notify: true}) (`console.mjs serve --notify`): a macOS notification per new step and one reminder
// (console-notify.mjs; osascript through execFile with an argv array, off by default, local only).
// POSTs need the header `x-console: 1` (a page on another origin can't send it without a CORS preflight,
// which this server never answers) and every request a localhost Host header (no DNS rebinding).
import http from 'node:http';
import { mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { list, publicView, start, done, answer, skip, reopen, restart, consoleDir, serverFile, OPEN } from './console.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { currentView, readWriteup } from './progress.mjs';
import { currentStatusView } from './status.mjs';
import { currentAgentView, currentAgentsList, parseAgent } from './agent-view.mjs';
import { waitingView, stepWatcher, createNotifier, DEFAULT_REMIND_MIN } from './console-notify.mjs';
import { feedView as threadFeedView, threadWatcher, listThreads, getThread, summary as threadSummary, threadState, pageThread, pageOrder, createThread, replyUser, markRead, setStatus, USER, threadMediaFile, LIMITS as THREAD_LIMITS } from './console-threads.mjs';
import { listeningState } from './thread-routing.mjs';
import { PAGES as COMMENT_PAGES, normAnchor, commentTitle, markersFor } from './console-comments.mjs';
import { pageProposals, publicView as proposalView, get as getProposal, decide as decideProposal, undoDecision, mediaFile, findOption } from './proposal.mjs';
import { createLiveServers, measuringNow } from './live.mjs';
import { talkRoute, talkView, talkIndex } from './proposal-talk.mjs';
import { statSync, createReadStream } from 'node:fs';

/** The page (plain HTML, inline CSS and JS, no external requests). Read per request: an edit shows on reload. */
const PAGE_FILE = new URL('./console-page.html', import.meta.url);
const page = () => readFileSync(PAGE_FILE, 'utf8');
const PROGRESS_PAGE_FILE = new URL('./progress-page.html', import.meta.url);
const progressPage = () => readFileSync(PROGRESS_PAGE_FILE, 'utf8');
const STATUS_PAGE_FILE = new URL('./status-page.html', import.meta.url);
const statusPage = () => readFileSync(STATUS_PAGE_FILE, 'utf8');
const PROPOSALS_PAGE_FILE = new URL('./proposals-page.html', import.meta.url);
const proposalsPage = () => readFileSync(PROPOSALS_PAGE_FILE, 'utf8');
const NAV_JS_FILE = new URL('./console-nav.js', import.meta.url);
const NAV_CSS_FILE = new URL('./console-nav.css', import.meta.url);
const COMMENTS_JS_FILE = new URL('./console-comments.js', import.meta.url);
const THREADS_PAGE_FILE = new URL('./threads-page.html', import.meta.url);
const threadsPage = () => readFileSync(THREADS_PAGE_FILE, 'utf8');
const AGENTS_PAGE_FILE = new URL('./agents-page.html', import.meta.url);
const agentsPage = () => readFileSync(AGENTS_PAGE_FILE, 'utf8');

/** The shared top bar of every page; `current` = 'steps' | 'status' | 'agents' | 'progress' | 'build' | 'threads' | 'proposals' (highlighted, aria-current). Plain links. */
export function menuHtml(current) {
  const on = (k) => (k === current ? ' on" aria-current="page' : '');
  return `<nav class="menu" aria-label="Console pages"><div class="menu-in">`
    + `<a class="mbtn${on('steps')}" title="What the agents need from you" href="/">Your steps<span class="badge" data-badge hidden>0</span></a>`
    + `<a class="mbtn${on('status')}" title="Who is doing what, in priority order" href="/status">Status</a>`
    + `<a class="mbtn${on('agents')}" title="Every agent, running now or finished: everything one agent did, on one page" href="/agents">Agents</a>`
    + `<a class="mbtn${on('progress')}" title="Where the fixes stand" href="/progress">Progress</a>`
    + `<a class="mbtn${on('build')}" title="What is in today's best build, how much it helps, and what was tried and not applied" href="/build">Best build</a>`
    + `<a class="mbtn${on('threads')}" title="Your questions to the agents, one thread per topic" href="/threads">Threads<span class="badge" data-thread-badge hidden>0</span></a>`
    + `<a class="mbtn${on('proposals')}" title="Look-alike changes to compare and accept" href="/proposals">Proposals<span class="badge" data-badge-proposals hidden>0</span></a>`
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
/** I-090: the Comment button, box and markers on every page (console-comments.js reads `data-page`). */
export const commentsScript = (current) => `<script src="/console-comments.js" data-page="${current}" defer></script>`;
const withMenu = (html, current) => html.replace('<!--console-menu-->', menuHtml(current) + commentsScript(current));

const FINISHED_SHOWN = 40;
const ACTIONS = {
  start: (id, b) => start(id, { part: b.part }),
  done: (id, b) => done(id, { part: b.part, notes: b.notes }),
  answer: (id, b) => answer(id, { value: b.value, notes: b.notes, scale: b.scale }),
  skip: (id, b) => skip(id, { notes: b.notes }),
  reopen: (id) => reopen(id, { who: 'user' }),
  restart: (id, b) => restart(id, { notes: b.notes }), // the page's "Start over" (I-059): every part again, waits end with REDO
};

/** Steps for the page: open ones in queue order, then the most recently finished (answered/skipped). */
export function pageSteps() {
  const all = list();
  const open = all.filter((s) => OPEN.has(s.status));
  const finished = all.filter((s) => s.status === 'answered' || s.status === 'skipped')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, FINISHED_SHOWN);
  return [...open, ...finished].map(publicView);
}

function send(res, code, body, type = 'application/json; charset=utf-8', csp = CSP) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': csp,
  });
  res.end(data);
}
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
/** I-074: the proposals page may frame the "Try it" page servers (localhost only; their ports are chosen at start). */
export const PROPOSALS_CSP = CSP.replace("media-src 'self';", "media-src 'self'; frame-src http://localhost:* http://127.0.0.1:*;");

/**
 * The waiting feed: checks the store every `intervalMs`, pushes `event: waiting` to every /api/events client on a
 * change and every `heartbeatMs`, and drives the --notify watcher. One timer per server.
 */
export function createFeed({ remindMin = DEFAULT_REMIND_MIN, notify = null, intervalMs = 500, heartbeatMs = 10000 } = {}) {
  const subs = new Set();
  const watch = notify ? stepWatcher({ notify, remindMin }) : null;
  const twatch = notify ? threadWatcher({ notify }) : null; // a new reply: 'reply' / 'thread' (no reminders for threads)
  const watchProposals = notify ? stepWatcher({ notify: (p) => notify(p, 'proposal'), remindMin: 0 }) : null; // new proposals only, no reminder
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
    const s = JSON.stringify([v.steps, v.proposals]);
    if (watch) { try { watch(v.steps, Date.parse(v.now)); } catch {} }
    if (watchProposals && v.proposals) { try { watchProposals(v.proposals.items, Date.parse(v.now)); } catch {} }
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
      if (!subs.size) sig = JSON.stringify([v.steps, v.proposals]);
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

// ---- proposals (ts-proposals) ----
const PROPOSAL_ACTIONS = {
  decide: (id, b) => decideProposal(id, { value: b.value, notes: b.notes, rev: b.rev, option: typeof b.option === 'string' ? b.option : undefined, who: 'user' }),
  undo: (id, b) => undoDecision(id, { rev: b.rev, who: 'user' }),
};

/** A stored screenshot or video; a single bytes=a-b range for video seeking. */
function sendMedia(req, res, m) {
  const size = statSync(m.file).size;
  const h = {
    'content-type': m.type, 'cache-control': 'private, max-age=86400', 'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': CSP,
    'cross-origin-resource-policy': 'same-origin',
  };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    let start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
    let end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { ...h, 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...h, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return createReadStream(m.file, { start, end }).on('error', () => res.destroy()).pipe(res);
  }
  res.writeHead(200, { ...h, 'content-length': size });
  return createReadStream(m.file).on('error', () => res.destroy()).pipe(res);
}

/**
 * I-074: the "Try it" routes; true when handled. `live()`: the console's page servers (createLiveServers), or null when
 * this server has none (a handler built without them).
 */
async function liveRoute(req, res, u, port, live) {
  const start = u.pathname.match(/^\/api\/live\/(PR-\d{3,6})\/start$/);
  if (req.method !== 'POST' || !(start || u.pathname === '/api/live/ping')) return false;
  const refused = threadPostRefusal(req, port);
  if (refused) { send(res, 403, { error: refused }); return true; }
  const srv = live ? live() : null;
  if (!srv) { send(res, 404, { error: 'this console serves no live pages' }); return true; }
  const b = await readJsonBody(req);
  if (b.error) { send(res, b.status, { error: b.error }); return true; }
  if (!start) { const running = srv.ping(); send(res, 200, { ok: true, measuring: measuringNow(), running: running.length }); return true; }
  // the page servers name only http://localhost:<port> and http://127.0.0.1:<port> in frame-ancestors (an IPv6 literal
  // is no CSP host-source), so a console opened at http://[::1]:<port> could not show them: say so instead of blank frames
  if (/^\[/.test(String(req.headers.host || ''))) { send(res, 409, { error: `"Try it" works only when the console is opened at http://localhost:${port}/ or http://127.0.0.1:${port}/ (not [::1])` }); return true; }
  let p = null;
  try { p = getProposal(start[1]); } catch {}
  if (!p || !proposalView(p)) { send(res, 404, { error: `no proposal ${start[1]}` }); return true; }
  let target = p;
  if (p.options?.length) {
    target = typeof b.body.option === 'string' ? findOption(p, b.body.option) : null;
    if (!target) { send(res, 400, { error: `${p.id} has options: say which one (option)` }); return true; }
  }
  if (!target.live?.blob) { send(res, 404, { error: `${p.id}${p.options?.length ? ` option ${target.name}` : ''} has no live pages (the author adds them: node tools/console.mjs proposal live …)` }); return true; }
  try {
    const aBlob = target.live.a?.blob || null; // I-093: A = the baseline + its own patch, when the entry names one
    const urls = await srv.open({ blob: target.live.blob, base: target.live.base || 'site-pretty', aBlob });
    send(res, 200, { a: urls.a, b: urls.b, measuring: measuringNow(), idleMin: Math.round(srv.idleMs / 6000) / 10, version: target.live.blob.slice(0, 12), ...(aBlob && { aVersion: aBlob.slice(0, 12) }) });
  } catch (e) { send(res, 503, { error: e.message }); }
  return true;
}

/** The proposals routes; true when handled. */
export async function proposalRoute(req, res, u) {
  if (req.method === 'GET' && (u.pathname === '/proposals' || u.pathname === '/proposals.html')) { send(res, 200, withMenu(proposalsPage(), 'proposals'), 'text/html; charset=utf-8', PROPOSALS_CSP); return true; }
  if (req.method === 'GET' && u.pathname === '/api/proposals') {
    let talk = {};
    try { talk = talkIndex(); } catch {} // T-048: questions per proposal; a half-written thread file: next poll
    send(res, 200, { now: iso(), proposals: pageProposals().map((p) => (talk[p.id] ? { ...p, talk: talk[p.id] } : p)) });
    return true;
  }
  // T-048: the questions and comments on one proposal (threads anchored on it), for the talk box under it
  const tk = u.pathname.match(/^\/api\/proposals\/(PR-\d{3,6})\/talk$/);
  if (tk && req.method === 'GET') {
    let v = null;
    try { v = talkView(tk[1]); } catch {}
    if (!v || v.id !== tk[1]) send(res, 404, { error: `no proposal ${tk[1]}` }); else send(res, 200, { now: iso(), talk: v });
    return true;
  }
  let m = u.pathname.match(/^\/api\/proposals\/(PR-\d{3,6})$/);
  if (m && req.method === 'GET') {
    let v = null;
    try { v = proposalView(getProposal(m[1])); } catch {}
    if (!v || v.id !== m[1]) send(res, 404, { error: `no proposal ${m[1]}` }); else send(res, 200, { now: iso(), proposal: v });
    return true;
  }
  m = u.pathname.match(/^\/media\/(PR-\d{3,6})\/([A-Za-z0-9.-]{1,40})$/);
  if (m && req.method === 'GET') {
    const f = mediaFile(m[1], m[2]);
    let visible = false;
    try { visible = !!proposalView(getProposal(m[1])); } catch {}
    if (!f || !visible) send(res, 404, { error: 'not found' }); else sendMedia(req, res, f);
    return true;
  }
  m = u.pathname.match(/^\/api\/proposals\/(PR-\d{3,6})\/([a-z]+)$/);
  if (m && req.method === 'POST') {
    if (req.headers['x-console'] !== '1') { send(res, 403, { error: 'missing x-console header' }); return true; }
    const act = PROPOSAL_ACTIONS[m[2]];
    if (!act) { send(res, 404, { error: `unknown action ${m[2]}` }); return true; }
    let body = {};
    const raw = await readBody(req);
    if (raw) { try { body = JSON.parse(raw); } catch { send(res, 400, { error: 'body is not JSON' }); return true; } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
    let cur = null;
    try { cur = proposalView(getProposal(m[1])); } catch {}
    if (!cur) { send(res, 404, { error: `no proposal ${m[1]}` }); return true; }
    try { send(res, 200, { proposal: proposalView(await act(m[1], body)) }); } catch (e) { send(res, 409, { error: e.message }); }
    return true;
  }
  return false;
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
      if (over) return resolve({ status: 413, error: `body too large (${max >= 1048576 ? `${Math.round(max / 1048576)} MB` : `${Math.round(max / 1024)} KB`} max)` });
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({ body: {} });
      try { const b = JSON.parse(raw); return resolve(b && typeof b === 'object' && !Array.isArray(b) ? { body: b } : { status: 400, error: 'body is not a JSON object' }); } catch { return resolve({ status: 400, error: 'body is not JSON' }); }
    });
  });
}

/** I-089: a new thread or a reply may carry images (base64, a third more than their bytes) next to 64 KB of text. */
export const THREAD_BODY_MAX = Math.ceil(THREAD_LIMITS.pageImageBytes * 4 / 3) + 64 * 1024 + THREAD_LIMITS.images * 1024;
const THREAD_ACTIONS = {
  reply: (id, b) => replyUser(id, { text: b.text, images: b.images, forLead: b.forLead === true }),
  read: (id, b) => markRead(id, USER, b.n),
  close: (id) => setStatus(id, { status: 'closed', fromPage: true }),
  reopen: (id) => setStatus(id, { status: 'open', fromPage: true }),
};

/** T-050: (agent) -> {listening, how}, from live thread waits and the last 5 min of thread activity. */
const listening = (threads = listThreads()) => { try { return listeningState({ threads }); } catch { return null; } };

/** The thread routes; returns true when it answered. */
async function threadRoute(req, res, u, port, feed) {
  const p = u.pathname;
  if (req.method === 'GET' && (p === '/threads' || p === '/threads.html')) { send(res, 200, withMenu(threadsPage(), 'threads'), 'text/html; charset=utf-8'); return true; }
  if (req.method === 'GET' && p === '/api/thread-feed') { send(res, 200, feed ? feed.currentThreads() : threadFeedView()); return true; }
  if (req.method === 'GET' && p === '/api/threads') {
    const all = listThreads(), ls = listening(all); // T-050: who reads each thread, listening or not
    send(res, 200, { now: iso(), threads: all.map((t) => threadSummary(t, USER, ls)).sort(pageOrder) });
    return true;
  }
  const one = p.match(/^\/api\/threads\/(T-\d{1,6})$/);
  if (req.method === 'GET' && one) {
    try { send(res, 200, { thread: pageThread(getThread(one[1]), listening()) }); } catch (e) { send(res, 404, { error: e.message }); }
    return true;
  }
  const media = p.match(/^\/thread-media\/(T-\d{1,6})\/([A-Za-z0-9.-]{1,40})$/);
  if (req.method === 'GET' && media) {
    const f = threadMediaFile(media[1], media[2]);
    if (!f) send(res, 404, { error: 'not found' }); else sendMedia(req, res, f);
    return true;
  }
  // I-090: comments on console items
  if (req.method === 'GET' && p === '/api/comments') {
    const page = u.searchParams.get('page') || '';
    if (!COMMENT_PAGES.includes(page)) { send(res, 400, { error: `page must be one of ${COMMENT_PAGES.join(', ')}` }); return true; }
    send(res, 200, markersFor(page, listThreads(), threadState));
    return true;
  }
  if (req.method === 'POST' && p === '/api/comments') {
    const refused = threadPostRefusal(req, port);
    if (refused) { send(res, 403, { error: refused }); return true; }
    const b = await readJsonBody(req);
    if (b.error) { send(res, b.status, { error: b.error }); return true; }
    try {
      const anchor = normAnchor(b.body.anchor), text = b.body.text;
      const route = talkRoute(anchor); // T-048: a comment on a proposal goes to its author too (and the lead)
      const r = await createThread({ title: commentTitle(anchor, typeof text === 'string' ? text : ''), text, anchor, fromPage: true, ...(route?.to.length && { routeTo: route.to, routeNote: route.note }) });
      send(res, 200, { thread: pageThread(r.thread, listening()) });
    } catch (e) { send(res, 409, { error: e.message }); }
    return true;
  }
  const act = p.match(/^\/api\/threads\/(T-\d{1,6})\/([a-z]+)$/);
  if (req.method === 'POST' && (p === '/api/threads' || act)) {
    const refused = threadPostRefusal(req, port);
    if (refused) { send(res, 403, { error: refused }); return true; }
    const fn = act ? THREAD_ACTIONS[act[2]] : null;
    if (act && !fn) { send(res, 404, { error: `unknown action ${act[2]}` }); return true; }
    const b = await readJsonBody(req, !act || act[2] === 'reply' ? THREAD_BODY_MAX : undefined);
    if (b.error) { send(res, b.status, { error: b.error }); return true; }
    try {
      const r = act ? await fn(act[1], b.body) : await createThread({ title: b.body.title, text: b.body.text, topic: b.body.topic, images: b.body.images, forLead: b.body.forLead === true, fromPage: true });
      send(res, 200, { thread: pageThread(r.thread, listening()) });
    } catch (e) { send(res, /^no thread /.test(e.message) ? 404 : 409, { error: e.message }); }
    return true;
  }
  return false;
}

export function handler(port, feed = null, live = null) {
  return async (req, res) => {
    try {
      if (!localHost(req.headers.host || '', port())) return send(res, 421, { error: 'localhost only' });
      const u = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) return send(res, 200, withMenu(page(), 'steps'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/console-nav.js') return send(res, 200, readFileSync(NAV_JS_FILE, 'utf8'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/console-comments.js') return send(res, 200, readFileSync(COMMENTS_JS_FILE, 'utf8'), 'text/javascript; charset=utf-8');
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
      // I-061: today's best build (the progress page in its build view) and the write-ups it links (read-only, scrubbed)
      if (req.method === 'GET' && (u.pathname === '/build' || u.pathname === '/build.html')) return send(res, 200, withMenu(progressPage(), 'build'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname.startsWith('/writeup/')) {
        let rel; try { rel = decodeURIComponent(u.pathname.slice('/writeup/'.length)); } catch { return send(res, 400, { error: 'bad path' }); }
        const text = readWriteup(rel);
        return text === null ? send(res, 404, { error: 'no such write-up (a .md file under fixes/ or research/)' }) : send(res, 200, text, 'text/plain; charset=utf-8');
      }
      if (req.method === 'GET' && (u.pathname === '/status' || u.pathname === '/status.html')) return send(res, 200, withMenu(statusPage(), 'status'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/status') return send(res, 200, await currentStatusView());
      // I-118: every agent (running now or finished), and everything one agent did, on one page (agent-view.mjs)
      if (req.method === 'GET' && (u.pathname === '/agents' || u.pathname === '/agents.html')) return send(res, 200, withMenu(agentsPage(), 'agents'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/agents') return send(res, 200, await currentAgentsList());
      const ag = u.pathname.match(/^\/(api\/)?agent\/([^/]*)$/);
      if (ag && req.method === 'GET') {
        let name; try { name = parseAgent(decodeURIComponent(ag[2])); } catch (e) { return send(res, 400, { error: e.message }); }
        return ag[1] ? send(res, 200, await currentAgentView(name)) : send(res, 200, withMenu(agentsPage(), 'agents'), 'text/html; charset=utf-8');
      }
      const m = u.pathname.match(/^\/api\/steps\/(C-\d{1,6})\/([a-z]+)$/);
      if (m && req.method === 'POST') {
        if (req.headers['x-console'] !== '1') return send(res, 403, { error: 'missing x-console header' });
        const act = ACTIONS[m[2]];
        if (!act) return send(res, 404, { error: `unknown action ${m[2]}` });
        let body = {};
        const raw = await readBody(req);
        if (raw) { try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'body is not JSON' }); } }
        try { return send(res, 200, { step: publicView(await act(m[1], body || {})) }); } catch (e) { return send(res, e.status || 409, { error: e.message }); } // 403: a runner-ended part (I-059)
      }
      if (await threadRoute(req, res, u, port(), feed)) return;
      if (await proposalRoute(req, res, u)) return;
      if (await liveRoute(req, res, u, port(), live)) return;
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
export async function startServer(candidates, { notify = false, remindMin = DEFAULT_REMIND_MIN, onNotifyError, live: liveOpts = {} } = {}) {
  let port = 0;
  const notifyFn = typeof notify === 'function' ? notify : notify ? createNotifier({ onError: onNotifyError }) : null;
  const feed = createFeed({ remindMin, notify: notifyFn });
  // I-074: the "Try it" page servers, created on the first panel open (they need this server's port for framing)
  let liveSrv = null;
  const live = () => (liveSrv ||= createLiveServers({ origins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`], ...liveOpts }));
  const server = http.createServer(handler(() => port, feed, live));
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
    return Promise.all([done, liveSrv ? liveSrv.close() : null]).then(() => {});
  };
  return { server, port, url, feed, close, live: () => liveSrv };
}

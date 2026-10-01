// The user console's HTTP server (tools/console.mjs serve): the page (tools/lib/console-page.html) and a
// small JSON API over the store in ./console.mjs. Localhost only (127.0.0.1), never port 5173.
//   GET  /                       the page
//   GET  /api/steps              {now, steps: [public views]} (open steps oldest first, then the last finished ones)
//   POST /api/steps/<id>/<act>   act = start | done | answer | skip | reopen; JSON body {part, value, notes}
//   GET  /api/health             {ok, pid}
//   GET  /progress               the fix-progress page (tools/lib/progress-page.html; read-only)
//   GET  /api/progress           its model (tools/lib/progress.mjs currentView: curated fixes/PROGRESS.json + live
//                                locks, incidents and waiting steps; scrubbed of URLs, addresses and ids)
// POSTs need the header `x-console: 1` (a page on another origin can't send it without a CORS preflight,
// which this server never answers) and every request a localhost Host header (no DNS rebinding).
import http from 'node:http';
import { mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { list, publicView, start, done, answer, skip, reopen, consoleDir, serverFile, OPEN } from './console.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { currentView } from './progress.mjs';

/** The page (plain HTML, inline CSS and JS, no external requests). Read per request: an edit shows on reload. */
const PAGE_FILE = new URL('./console-page.html', import.meta.url);
const page = () => readFileSync(PAGE_FILE, 'utf8');
const PROGRESS_PAGE_FILE = new URL('./progress-page.html', import.meta.url);
const progressPage = () => readFileSync(PROGRESS_PAGE_FILE, 'utf8');

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
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
  res.end(data);
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

export function handler(port) {
  return async (req, res) => {
    try {
      if (!localHost(req.headers.host || '', port())) return send(res, 421, { error: 'localhost only' });
      const u = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) return send(res, 200, page(), 'text/html; charset=utf-8');
      if (req.method === 'GET' && u.pathname === '/api/health') return send(res, 200, { ok: true, pid: process.pid });
      if (req.method === 'GET' && u.pathname === '/api/steps') return send(res, 200, { now: iso(), steps: pageSteps() });
      if (req.method === 'GET' && (u.pathname === '/progress' || u.pathname === '/progress.html')) return send(res, 200, progressPage(), 'text/html; charset=utf-8');
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
 * Returns {server, port, url, close()}.
 */
export async function startServer(candidates) {
  let port = 0;
  const server = http.createServer(handler(() => port));
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
  if (!port) throw new Error(`no free port among ${candidates.length} candidate(s) (${candidates[0]}…)`);
  const url = `http://localhost:${port}/`;
  mkdirSync(consoleDir(), { recursive: true });
  writeJson(serverFile(), { url, port, pid: process.pid, startedAt: iso() });
  const close = () => {
    const s = readJson(serverFile());
    if (s && s.pid === process.pid) { try { unlinkSync(serverFile()); } catch {} }
    return new Promise((r) => server.close(() => r()));
  };
  return { server, port, url, close };
}

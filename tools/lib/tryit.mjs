// T-106: ONE process serves every Try-it page (the /build page's versions, `console.mjs proposal phone`), instead of one
// long-lived tools/serve.mjs per build. CLI: tools/tryit.mjs.
//
// Registry (shared git dir, every worktree sees it): <state>/tryit/
//   builds/<name>.json   {name, root: site-pretty|site, overlays: [abs dirs], vendors, latency, port, stopped, label, by, addedAt}
//   host.json            the running host {pid, startedAt, host, idleMs, checkout}
//   status.json          what the host serves now {pid, builds: {<name>: {port, listening, mounted, stopped, lastHit, error}}}
//   host.log             the host's stderr
// The host (createTryitHost) re-reads builds/ every second and keeps one plain-http listener per build on its own port
// (builds share file names, so one port per build; phone links http://lan:<port>/ stay valid as long as the entry does).
// A listener is cheap: the build's mount (lib/mirror-handler.mjs, the code serve.mjs runs, with its file cache) is
// created on the first request and dropped after `idleMs` without one (default 30 min). A build marked `stopped` keeps
// its port and answers every page with a Start page: one tap (POST /__tryit/start) serves it again.
// Try-it pages always send Cache-Control: no-store (I-131: no browser keeps another build's copy of a hashed file).
// Ports: 6400-6599 by default (no serve.mjs used them before, so no browser holds a stale copy there), never 5173/5559.
// FW_TRYIT_HOST=127.0.0.1 keeps the host off the Wi-Fi (the tests); anything but 0.0.0.0 / 127.0.0.1 is refused.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, rmSync, openSync, closeSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { REPO, sharedStateDir, resolveTree } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { portBusy } from './port-probe.mjs';
import { createMirrorHandler } from './mirror-handler.mjs';
import { baselineStatus, baselineMeta, ALLOW_ENV } from './baseline.mjs';

export const TRYIT_PORTS = Object.freeze({ from: 6400, to: 6599 });
export const DEFAULT_IDLE_MIN = 30;
export const NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,120}$/;
const ROOTS = ['site-pretty', 'site'];
const RESERVED = new Set([5173, 5559]);
export const HOSTS = ['0.0.0.0', '127.0.0.1'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const tryitDir = () => join(sharedStateDir(), 'tryit');
const buildsDir = () => join(tryitDir(), 'builds');
export const hostFile = () => join(tryitDir(), 'host.json');
export const statusFile = () => join(tryitDir(), 'status.json');
export const hostLog = () => join(tryitDir(), 'host.log');
function checkName(n) { if (typeof n !== 'string' || !NAME.test(n)) throw new Error(`bad Try-it build name ${JSON.stringify(n)} (letters, digits, . _ + -)`); return n; }
const buildFile = (n) => join(buildsDir(), `${checkName(n)}.json`);
/** The phone link as stored and printed: the placeholder host `lan` (lib/lan.mjs), never an address (Hard rule 12). */
export const tryitLink = (port) => `http://lan:${port}/`;

function writeJson(f, obj) {
  mkdirSync(join(f, '..'), { recursive: true });
  const tmp = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  renameSync(tmp, f);
}
function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function validEntry(e) {
  return e && typeof e === 'object' && NAME.test(String(e.name)) && ROOTS.includes(e.root) && Array.isArray(e.overlays)
    && Number.isInteger(e.port) && e.port >= 1024 && e.port <= 65535;
}
/** Every registered build, by name. */
export function listBuilds() {
  let names = [];
  try { names = readdirSync(buildsDir()).filter((f) => f.endsWith('.json')); } catch { return []; }
  return names.sort().map((f) => readJson(join(buildsDir(), f))).filter((e) => validEntry(e) && existsSync(buildFile(e.name)));
}
export function getBuild(name) { const e = readJson(buildFile(name)); return validEntry(e) && e.name === name ? e : null; }
/** What decides the served bytes: a change drops the mount. */
const configKey = (e) => JSON.stringify([e.root, e.overlays, e.vendors, e.latency]);

/**
 * Register (or update) a build: {entry, created, updated}. Overlays: existing dirs (made absolute). Port: `port` (when
 * free and not another entry's) or the lowest free one in TRYIT_PORTS. An existing entry keeps its port.
 */
export async function addBuild({ name, root = 'site-pretty', overlays = [], vendors = 'local', latency = 0, port = null, label = null, by = 'unknown', range = TRYIT_PORTS, busy = portBusy } = {}) {
  checkName(name);
  if (!ROOTS.includes(root)) throw new Error(`root: ${ROOTS.join(' or ')} (got ${JSON.stringify(root)})`);
  if (!['block', 'local', 'off'].includes(vendors)) throw new Error('vendors: block|local|off');
  latency = Number(latency);
  if (!(latency >= 0 && latency <= 5000)) throw new Error('latency: 0-5000 ms');
  const ovs = (overlays || []).map((d) => resolve(String(d)));
  for (const d of ovs) if (!existsSync(d) || !statSync(d).isDirectory()) throw new Error(`overlay ${d} is not a directory`);
  if (label != null && (typeof label !== 'string' || label.length > 120)) throw new Error('label: plain text, at most 120 characters');
  if (port != null && (!Number.isInteger(port) || port < 1024 || port > 65535 || RESERVED.has(port))) throw new Error(`port: 1024-65535, not ${[...RESERVED].join('/')} (got ${port})`);
  // withGuard runs its callback synchronously: probe free ports outside it, then re-check and write inside it
  for (let attempt = 0; attempt < 5; attempt++) {
    const all = listBuilds();
    const old = all.find((e) => e.name === name) || null;
    const taken = new Set(all.filter((e) => e.name !== name).map((e) => e.port));
    if (port != null && taken.has(port)) throw new Error(`port ${port} is already the Try-it build "${all.find((e) => e.port === port).name}"`);
    let p = old && port == null ? old.port : port;
    if (p == null) {
      for (let c = range.from; c <= range.to && p == null; c++) if (!taken.has(c) && !RESERVED.has(c) && !(await busy(c))) p = c;
      if (p == null) throw new Error(`no free Try-it port in ${range.from}-${range.to} (node tools/tryit.mjs rm <name> frees one)`);
    }
    const r = await withGuard('tryit-registry', () => {
      const now = listBuilds();
      const cur = now.find((e) => e.name === name) || null;
      if (now.some((e) => e.name !== name && e.port === p) || (cur?.port ?? null) !== (old?.port ?? null)) return null; // raced: again
      const entry = { name, root, overlays: ovs, vendors, latency, port: p, stopped: false, label: label ?? cur?.label ?? null, by: cur?.by || by, addedAt: cur?.addedAt || new Date().toISOString() };
      const same = cur && configKey(cur) === configKey(entry) && cur.port === entry.port && !cur.stopped && cur.label === entry.label;
      if (!same) writeJson(buildFile(name), entry);
      return { entry, created: !cur, updated: !!cur && !same };
    });
    if (r) return r;
  }
  throw new Error('the Try-it registry kept changing; try again');
}
/** Unregister: the host closes its port within a second. Returns the old entry or null. */
export function removeBuild(name) {
  const e = getBuild(name);
  rmSync(buildFile(name), { force: true });
  return e;
}
/** Mark a build stopped (its port shows a Start page) or not. Returns the entry or null. */
export function setStopped(name, stopped) {
  const e = getBuild(name);
  if (!e) return null;
  if (!!e.stopped !== !!stopped) writeJson(buildFile(name), { ...e, stopped: !!stopped });
  return { ...e, stopped: !!stopped };
}

/** The running host's record, or null (no file, or its pid is gone). */
export function readHost() { const h = readJson(hostFile()); return h && pidAlive(h.pid) ? h : null; }
/** What the running host serves now, or null when no host runs. */
export function readStatus() {
  const h = readHost();
  const s = readJson(statusFile());
  return h && s && s.pid === h.pid ? s : null;
}

// ---- the host ----------------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function startPage(e, path) {
  const to = /^\/(?!\/)[^\s"<>]*$/.test(path) ? path : '/';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not served: ${esc(e.label || e.name)}</title>
<style>body{font:17px/1.4 -apple-system,system-ui,sans-serif;margin:0;padding:24px 16px;background:#f6f6f4;color:#222}main{max-width:32em;margin:auto}
button{font:inherit;font-weight:600;padding:12px 28px;border-radius:10px;border:0;background:#2456c9;color:#fff}p.s{color:#666;font-size:14px}</style></head>
<body><main><h1>Not served right now</h1><p>This Try-it page (${esc(e.label || e.name)}) is not being served at the moment.</p>
<form method="post" action="/__tryit/start"><input type="hidden" name="to" value="${esc(to)}"><button type="submit">Start</button></form>
<p class="s">It starts in a few seconds, then this page opens.</p></main></body></html>
`;
}
function plain(res, status, text, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(text);
}

/** The default mount: the pinned baseline (else an error page) + the build's overlays, no-store, quiet. */
export function mountBuild(e) {
  const st = baselineStatus();
  if (!st.ok && process.env[ALLOW_ENV] !== '1') throw new Error(st.message);
  return createMirrorHandler({
    root: resolveTree(e.root), manifestRoot: resolveTree('site'), overlays: e.overlays, vendors: e.vendors || 'local',
    compress: 'br', noCache: true, quiet: true, latency: e.latency || 0, baseline: baselineMeta(st),
  });
}

/**
 * The host: {poll(), sweep(), status(), close()}. `mount(entry)` -> {handler} (default mountBuild); `now` and `idleMs`
 * injectable for the tests; `onStatus(status)` after each change (runHost writes status.json).
 */
export function createTryitHost({ host = '0.0.0.0', idleMs = DEFAULT_IDLE_MIN * 60000, now = Date.now, mount = mountBuild, busy = portBusy, retryMs = 5000, onStatus = () => {}, log = () => {} } = {}) {
  if (!HOSTS.includes(host)) throw new Error(`host: 0.0.0.0 (the Wi-Fi) or 127.0.0.1 (tests) only (got ${JSON.stringify(host)})`);
  const builds = new Map(); // name -> {entry, server, listening, starting, error, triedAt, mount, mountedAt, lastHit}
  let last = '';

  function status() {
    const out = {};
    for (const [n, b] of builds) out[n] = { port: b.entry.port, listening: b.listening, mounted: !!b.mount, stopped: !!b.entry.stopped, lastHit: b.lastHit ? new Date(b.lastHit).toISOString() : null, error: b.error };
    return out;
  }
  function changed() { const s = status(); const j = JSON.stringify(s); if (j !== last) { last = j; onStatus(s); } }

  function onRequest(b, req, res) {
    b.lastHit = now();
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__tryit/start' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        const to = new URLSearchParams(body).get('to') || '/';
        const fresh = setStopped(b.entry.name, false);
        if (fresh) b.entry = fresh;
        log(`start ${b.entry.name} (Start page)`);
        changed();
        res.writeHead(303, { location: /^\/(?!\/)/.test(to) ? to : '/', 'cache-control': 'no-store' });
        res.end();
      });
      return;
    }
    if (b.entry.stopped) { const fresh = getBuild(b.entry.name); if (fresh && !fresh.stopped) { b.entry = fresh; changed(); } }
    if (b.entry.stopped) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '5' });
      res.end(req.method === 'HEAD' ? undefined : startPage(b.entry, u.pathname + u.search));
      return;
    }
    if (!b.mount) {
      try { b.mount = mount(b.entry); b.mountedAt = now(); b.error = null; log(`mount ${b.entry.name}`); } catch (e) {
        b.error = String(e.message || e).split('\n')[0];
        changed();
        return plain(res, 503, `Try-it build "${b.entry.name}" can't be served: ${e.message}\n`);
      }
      changed();
    }
    b.mount.handler(req, res);
  }

  function listen(b) {
    b.starting = true; b.triedAt = now();
    const port = b.entry.port;
    busy(port).then((taken) => {
      if (!builds.has(b.entry.name) || builds.get(b.entry.name) !== b || b.closed) { b.starting = false; return; }
      if (taken) { b.starting = false; b.error = `port ${port} is in use (something listens on ${taken}:${port})`; changed(); return; }
      const server = http.createServer((req, res) => onRequest(b, req, res));
      server.once('error', (e) => { b.starting = false; b.error = `port ${port}: ${e.code || e.message}`; b.server = null; changed(); });
      server.listen(port, host, () => {
        b.starting = false;
        if (b.closed) { server.close(); return; }
        b.server = server; b.listening = true; b.error = null;
        log(`listen ${b.entry.name} :${port}`);
        changed();
      });
    });
  }
  function close(b) {
    b.closed = true; b.mount = null;
    if (b.server) { b.server.close(); b.server.closeAllConnections?.(); }
    b.server = null; b.listening = false;
  }

  return {
    /** Re-read the registry: open ports of new builds, close removed ones, drop mounts whose files changed. */
    poll() {
      const seen = new Set();
      for (const e of listBuilds()) {
        seen.add(e.name);
        let b = builds.get(e.name);
        if (b && b.entry.port !== e.port) { close(b); builds.delete(e.name); b = null; }
        if (!b) { b = { entry: e, server: null, listening: false, starting: false, error: null, triedAt: 0, mount: null, lastHit: 0 }; builds.set(e.name, b); }
        else { if (configKey(b.entry) !== configKey(e) && b.mount) { b.mount = null; log(`config changed ${e.name}: unmounted`); } b.entry = e; }
        if (!b.listening && !b.starting && now() - b.triedAt >= (b.triedAt ? retryMs : 0)) listen(b);
      }
      for (const [n, b] of builds) if (!seen.has(n)) { close(b); builds.delete(n); log(`closed ${n}`); }
      changed();
    },
    /** Drop the mounts unused for idleMs (their listeners stay). Returns the names dropped. */
    sweep() {
      const out = [];
      for (const [n, b] of builds) if (b.mount && now() - Math.max(b.lastHit, b.mountedAt || 0) >= idleMs) { b.mount = null; out.push(n); log(`idle ${n}: unmounted`); }
      if (out.length) changed();
      return out;
    },
    status,
    idleMs,
    close() { for (const b of builds.values()) close(b); builds.clear(); },
  };
}

/** `tryit.mjs host`: run the host in this process until a signal. Refuses (ALREADY) when another host runs. */
export async function runHost({ idleMs = idleFromEnv(), host = process.env.FW_TRYIT_HOST || '0.0.0.0', pollMs = 1000 } = {}) {
  const other = await withGuard('tryit-host', () => {
    const h = readHost();
    if (h && h.pid !== process.pid) return h;
    writeJson(hostFile(), { pid: process.pid, startedAt: new Date().toISOString(), host, idleMs, checkout: REPO });
    return null;
  });
  if (other) { console.log(`ALREADY Try-it host pid ${other.pid} (since ${other.startedAt})`); return 0; }
  const startedAt = new Date().toISOString();
  const H = createTryitHost({
    host, idleMs,
    onStatus: (builds) => writeJson(statusFile(), { pid: process.pid, startedAt, host, idleMs, updatedAt: new Date().toISOString(), builds }),
    log: (m) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}Z] ${m}\n`),
  });
  H.poll();
  const pt = setInterval(() => H.poll(), pollMs);
  const st = setInterval(() => H.sweep(), Math.max(1000, Math.min(60000, Math.floor(idleMs / 4))));
  let done = false;
  const quit = () => {
    if (done) return; done = true;
    clearInterval(pt); clearInterval(st); H.close();
    for (const f of [hostFile(), statusFile()]) { const j = readJson(f); if (j && j.pid === process.pid) rmSync(f, { force: true }); }
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, quit);
  console.log(`TRYIT_HOST pid ${process.pid} host ${host} idle ${Math.round(idleMs / 60000 * 10) / 10} min`);
  return new Promise(() => {}); // runs until a signal
}
export function idleFromEnv() { const m = Number(process.env.FW_TRYIT_IDLE_MIN); return (m > 0 ? m : DEFAULT_IDLE_MIN) * 60000; }

/** Start the host detached unless one runs: {pid, started}. Its stderr goes to host.log. */
export async function ensureHost({ script = join(REPO, 'tools', 'tryit.mjs'), timeoutMs = 15000 } = {}) {
  const h = readHost();
  if (h) return { pid: h.pid, started: false };
  mkdirSync(tryitDir(), { recursive: true });
  const fd = openSync(hostLog(), 'a');
  let proc;
  try { proc = spawn(process.execPath, [script, 'host'], { cwd: REPO, detached: true, stdio: ['ignore', 'ignore', fd] }); } finally { closeSync(fd); }
  let exited = null;
  proc.once('exit', (code, sig) => { exited = { code, sig }; });
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    await sleep(100);
    const now = readHost();
    if (now) { proc.unref(); return { pid: now.pid, started: now.pid === proc.pid }; }
    if (exited) throw new Error(`the Try-it host exited (${exited.code ?? exited.sig}): ${tailLog()}`);
  }
  try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ }
  throw new Error(`the Try-it host did not start within ${timeoutMs / 1000} s: ${tailLog()}`);
}
function tailLog() { try { return readFileSync(hostLog(), 'utf8').trim().split('\n').slice(-2).join(' ') || 'no message'; } catch { return 'no message'; } }

/** Wait until the running host listens on build `name`'s port: {port}. Throws on a lasting error or after timeoutMs. */
export async function waitServed(name, { timeoutMs = 15000 } = {}) {
  let errSince = 0;
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    const s = readStatus()?.builds?.[name];
    if (s?.listening && !s.stopped) return { port: s.port }; // a Start: the host has seen the entry un-stopped
    if (s?.error) { errSince ||= Date.now(); if (Date.now() - errSince > 6000) throw new Error(`Try-it build "${name}": ${s.error}`); } else errSince = 0;
    await sleep(100);
  }
  throw new Error(`Try-it build "${name}" is not served within ${timeoutMs / 1000} s (node tools/tryit.mjs list; log: ${hostLog()})`);
}

/** Register (or keep) a build, un-stop it, make sure the host runs and serves it: {entry, created, updated, port, hostPid}. */
export async function ensureBuild(spec, { ensure = ensureHost } = {}) {
  const r = await addBuild(spec);
  const h = await ensure();
  const { port } = await waitServed(spec.name);
  return { ...r, port, hostPid: h.pid };
}

/** Rows for `tryit.mjs list` and the console: [{name, port, state, label, overlays, lastHit, error}]. */
export function buildRows() {
  const st = readStatus();
  return listBuilds().map((e) => {
    const s = st?.builds?.[e.name];
    const state = !st ? 'host-down' : e.stopped ? 'stopped' : s?.error ? 'error' : !s?.listening ? 'starting' : s.mounted ? 'served' : 'idle';
    return { name: e.name, port: e.port, state, label: e.label, root: e.root, overlays: e.overlays, latency: e.latency, lastHit: s?.lastHit || null, error: s?.error || null };
  });
}

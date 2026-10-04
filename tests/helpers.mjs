// Shared helpers for the tooling tests (node --test, no dependencies).
//
// Everything a test creates (temp dirs, temp git repos/worktrees, child processes) is registered here
// and removed in an 'exit' hook, so a failing or interrupted test still cleans up after itself.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

// Same for in-process git calls (tools/lib/paths.mjs imported by unit tests).
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k];
// I-124: the timing-hold disk floor (lib/disk.mjs) reads the real disk; tests that take timing holds must not fail
// because the Mac is nearly full. A test of the floor sets FW_TIMING_MIN_FREE_GB and the fake FW_DISK_FREE_GB itself.
// Likewise the disk alarm and the automatic prune of idle.mjs watch (lib/space-watch.mjs) stay off in tests, so a
// watch test never posts a disk thread or scans the real temp dir; their own tests switch them on with fixtures.
process.env.FW_TIMING_MIN_FREE_GB = '0';
process.env.FW_SPACE_ALARM_GB = '0';
process.env.FW_SPACE_AUTOPRUNE = '0';
delete process.env.FW_DISK_FREE_GB;
delete process.env.FW_SIPS;

export const TESTS = dirname(fileURLToPath(import.meta.url));
/** The checkout whose tools are under test (main checkout or a worktree). */
export const REPO = resolve(TESTS, '..');
export const TOOLS = join(REPO, 'tools');
export const tool = (name) => join(TOOLS, name);
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- cleanup registry ------------------------------------------------------------------------------
const tempDirs = new Set();
const children = new Set();
const realWorktrees = new Set(); // worktrees added to *this* repo (smoke test) -> git worktree remove
function cleanupSync() {
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  children.clear();
  killFixtures();
  if (fixtureDir) { try { rmSync(fixtureDir, { recursive: true, force: true }); } catch {} }
  for (const wt of realWorktrees) {
    spawnSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' });
  }
  if (realWorktrees.size) spawnSync('git', ['-C', REPO, 'worktree', 'prune'], { stdio: 'ignore' });
  realWorktrees.clear();
  for (const d of tempDirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} }
  tempDirs.clear();
}
process.on('exit', cleanupSync);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { cleanupSync(); process.exit(130); });

/** A fresh temp dir (realpath: macOS /var -> /private/var), removed at exit. */
export function tempDir(prefix = 'fw-test-') {
  const d = realpathSync(mkdtempSync(join(os.tmpdir(), prefix)));
  tempDirs.add(d);
  return d;
}
export function removeTemp(d) { try { rmSync(d, { recursive: true, force: true }); } catch {} tempDirs.delete(d); }
// ---- long-lived fixtures (I-072) -------------------------------------------------------------------
// The tools start some fixtures detached (fake xcodebuild runner, fake iproxy, fake iwdp and its Safari tab): own
// process group, ppid 1 once the tool exits, so neither `children` above nor a lane's tree kill reaches them. Each
// such fixture imports tests/fixtures/lifeline.mjs, which registers it in FIXTURE_DIR (via $FW_TEST_FIXTURES, set by
// cleanEnv) and ends it once this process is gone ($FW_TEST_LIFELINE).
export const FIXTURES = join(TESTS, 'fixtures');
export const LIFELINE = pathToFileURL(join(FIXTURES, 'lifeline.mjs')).href;
let fixtureDir = null;
function fixtureRegistry() {
  if (!fixtureDir) fixtureDir = realpathSync(mkdtempSync(join(os.tmpdir(), 'fw-fixtures-'))); // removed at exit (cleanupSync)
  return fixtureDir;
}
/** The fixtures registered by this test process that still run: [{pid, script, at}]. */
export function liveFixtures({ since = 0 } = {}) {
  if (!fixtureDir || !existsSync(fixtureDir)) return [];
  const recs = [];
  for (const f of readdirSync(fixtureDir)) {
    let r; try { r = JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')); } catch { continue; }
    if (Number.isInteger(r.pid) && r.at >= since) recs.push(r);
  }
  if (!recs.length) return [];
  // only a live process whose command line names our fixtures dir (its script or --import lifeline.mjs): never a reused pid
  const ps = spawnSync('ps', ['-ww', '-o', 'pid=,command=', '-p', recs.map((r) => r.pid).join(',')], { encoding: 'utf8' });
  const ours = new Set(String(ps.stdout || '').split('\n').filter((l) => l.includes(FIXTURES)).map((l) => Number(l.trim().split(/\s+/)[0])));
  return recs.filter((r) => ours.has(r.pid));
}
/**
 * Kill the registered fixtures (since: only those registered at or after that Date.now()), each with its process
 * group (a detached fixture leads one: the fake xcodebuild's helper, fake iwdp's tab). Synchronous, so the exit hook
 * can use it; returns the pids killed. Wire it per test where a tool starts detached fixtures:
 *   let t0; beforeEach(() => { t0 = Date.now(); }); afterEach(() => killFixtures({ since: t0 }));
 */
export function killFixtures({ since = 0 } = {}) {
  const live = liveFixtures({ since });
  for (const r of live) {
    try { process.kill(-r.pid, 'SIGKILL'); } catch {}
    try { process.kill(r.pid, 'SIGKILL'); } catch {}
    try { rmSync(join(fixtureDir, `${r.pid}.json`), { force: true }); } catch {}
  }
  return live.map((r) => r.pid);
}

export function registerRealWorktree(p) { realWorktrees.add(p); }
export function unregisterRealWorktree(p) { realWorktrees.delete(p); }

// ---- environment -----------------------------------------------------------------------------------
/**
 * tests/fixtures/fake-host.mjs: the host that tool subprocesses see by default ($FW_TEST_HOST, tools/lib/host.mjs):
 * a quiet Mac (load1 1, 5 % CPU), so verify's recheck and the lock's host gate (I-016/I-017) never wait on
 * the real, possibly busy machine. Pass FW_TEST_HOST: '' for the real host (the opt-in Chrome tests do).
 */
export const FAKE_HOST = join(TESTS, 'fixtures', 'fake-host.mjs');
/** A clean env for tool subprocesses: no inherited mirror/lock/port overrides unless given. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['FW_MIRROR_HOME', 'FW_STATE_DIR', 'FW_BASE', 'FW_ALLOW_MAIN', 'FW_LOCK_OWNER', 'FW_LOCK_HELD', 'FW_LOCK_SHARED', 'FW_LOCK_SHARED_JOIN_LOAD', 'FW_LOCK_SHARED_JOIN_BUSY', 'FW_LOCK_LOAD1', 'PORT', 'CHROME', 'FW_IPHONE_PORT', 'FW_IPHONE_DEVICE_PORT', 'NODE_TEST_CONTEXT', 'FW_PRECOMMIT_TEST_CMD', 'FW_GATE_MAX_LOAD1', 'FW_GATE_MAX_BUSY', 'FW_GATE_MAX_WAIT', 'FW_TOOLING', 'FW_BASELINE_UPDATE', 'FW_BASELINE_ALLOW_MODIFIED', 'FW_WDA_URL', 'FW_WDA_HOME', 'FW_XCODEBUILD', 'FW_IPROXY', 'FW_IDEVICE_ID', 'FW_IDEVICEINFO', 'FW_SECURITY', 'FW_SIMCTL', 'FW_IWDP', 'FW_LSOF', 'FW_OPEN', 'FW_OSASCRIPT', 'FW_IOSCAP_ROOT', 'FW_IOSCAP_OPEN', 'FW_SWIFTC', 'FW_CODESIGN', 'FW_LAN_ADDRESS', 'FW_LAN_IFACES', 'FW_PS', 'FW_IDLE_NOW', 'FW_RUN_PROFILES']) delete env[k]; // FW_RUN_PROFILES: npm test in a shared lane (I-106)
  for (const k of Object.keys(env)) if (/^FW_SIM_/.test(k)) delete env[k]; // FW_SIM_SESSION, FW_SIM_PORT, FW_SIM_UDID, ... (a test run from inside a sim session)
  for (const k of Object.keys(env)) if (/^FAKE_HOST_/.test(k)) delete env[k];
  env.FW_TEST_HOST = FAKE_HOST;
  env.FW_TEST_LIFELINE = String(process.pid); // I-072: long-lived fixtures end with this test process
  env.FW_TEST_FIXTURES = fixtureRegistry();
  env.FW_CAFFEINATE = 'off'; // no real sleep assertions from tests (I-026); a test passes the fake via `extra`
  env.FW_ANSWER_LINT = 'off'; // I-146: test texts skip the answer-format lint (honoured only with $FW_STATE_DIR); its own tests pass 'on'
  delete env.FW_NO_CAFFEINATE; // I-070: a test that passes the fake gets it, whatever the caller's shell says
  // a git hook exports GIT_DIR / GIT_INDEX_FILE / ...: never let them redirect the temp repos' git calls
  for (const k of Object.keys(env)) if (/^GIT_/.test(k)) delete env[k];
  return { ...env, GIT_AUTHOR_NAME: 'fw-test', GIT_AUTHOR_EMAIL: 'fw-test@example.invalid', GIT_COMMITTER_NAME: 'fw-test', GIT_COMMITTER_EMAIL: 'fw-test@example.invalid', ...extra };
}

/** Run a command synchronously. Returns {code, stdout, stderr, out (both)}. */
export function run(cmd, args, { cwd = REPO, env = {}, timeout = 60000, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: cleanEnv(env), encoding: 'utf8', timeout, input, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, signal: r.signal, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}
export const node = (script, args = [], opts = {}) => run(process.execPath, [script, ...args], opts);

/** Run a command asynchronously (does not block the event loop; needed while servers run in-process). */
export function runAsync(cmd, args, { cwd = REPO, env = {}, timeout = 120000 } = {}) {
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(c);
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    // on timeout: SIGTERM first (the tools clean up their servers/Chrome/locks), SIGKILL if that fails
    const t = setTimeout(() => { c.kill('SIGTERM'); setTimeout(() => c.kill('SIGKILL'), 5000).unref(); }, timeout);
    c.on('exit', (code, signal) => { clearTimeout(t); children.delete(c); res({ code, signal, stdout, stderr, out: stdout + stderr }); });
  });
}
export const nodeAsync = (script, args = [], opts = {}) => runAsync(process.execPath, [script, ...args], opts);

export function git(cwd, ...args) {
  const r = run('git', args, { cwd });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.out}`);
  return r.stdout.trim();
}

// ---- long-running processes (servers) --------------------------------------------------------------
/**
 * Spawn a long-running process and wait until `ready(stdout)` returns a truthy value (default: a
 * MIRROR_URL= line). Returns {proc, url, port, stdout(), stderr(), stop()}. Killed at exit regardless.
 */
export async function startProc(cmd, args, { cwd = REPO, env = {}, ready, timeout = 20000 } = {}) {
  const proc = spawn(cmd, args, { cwd, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(proc);
  let out = '', err = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (err += d));
  const exited = new Promise((r) => proc.on('exit', (code, signal) => { children.delete(proc); r({ code, signal }); }));
  ready ||= (s) => { const m = s.match(/^MIRROR_URL=(\S+)$/m); return m && m[1]; };
  const t0 = Date.now();
  let got;
  for (;;) {
    got = ready(out);
    if (got) break;
    if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`process exited early (${proc.exitCode ?? proc.signalCode}): ${cmd} ${args.join(' ')}\n${out}\n${err}`);
    if (Date.now() - t0 > timeout) { proc.kill('SIGKILL'); throw new Error(`timeout waiting for readiness: ${cmd} ${args.join(' ')}\n${out}\n${err}`); }
    await sleep(25);
  }
  const url = typeof got === 'string' ? got : null;
  return {
    proc, url, port: url ? Number(new URL(url).port) : null, exited,
    stdout: () => out, stderr: () => err,
    async stop(sig = 'SIGTERM') {
      if (proc.exitCode === null && proc.signalCode === null) { proc.kill(sig); const t = setTimeout(() => proc.kill('SIGKILL'), 3000); await exited; clearTimeout(t); }
      children.delete(proc);
    },
  };
}
/**
 * Signal tests (incidents I-008, I-009): start the tool as `node --import SLOW_EXIT <script>` with
 * env SLOW_EXIT_DIR=<dir> (tests/fixtures/slow-exit.mjs), then call this: it sends `sig`, waits until
 * the process is inside its 'exit' listeners, sends `sig` again and lets the exit finish. Resolves
 * with {code, signal}; {signal: 'SIGTERM'} means the second signal killed it before its cleanup ran.
 */
export const SLOW_EXIT = pathToFileURL(join(TESTS, 'fixtures', 'slow-exit.mjs')).href;
export async function signalTwiceDuringExit(proc, dir, sig = 'SIGTERM') {
  const exited = proc.exitCode !== null || proc.signalCode !== null
    ? Promise.resolve({ code: proc.exitCode, signal: proc.signalCode })
    : new Promise((r) => proc.once('exit', (code, signal) => r({ code, signal })));
  proc.kill(sig);
  for (const t = Date.now() + 10000; Date.now() < t && !existsSync(join(dir, 'exit-started'));) await sleep(5);
  if (!existsSync(join(dir, 'exit-started'))) throw new Error('the process never reached its exit listeners');
  try { proc.kill(sig); } catch {}
  writeFileSync(join(dir, 'second-sent'), '');
  return exited;
}
export const startServe = (args, opts = {}) => startProc(process.execPath, [opts.script || tool('serve.mjs'), ...args], opts);

/** A port that is free right now (bound on 0.0.0.0 like serve.mjs, then released). */
export function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '0.0.0.0', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

/** Minimal HTTP(S) client: returns {status, headers, body(Buffer, decoded), raw(Buffer), ms}. */
export function request(url, { method = 'GET', headers = {}, body, decode = true } = {}) {
  return new Promise((res, rej) => {
    const t0 = performance.now();
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.request(url, { method, headers, rejectUnauthorized: false, agent: false }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks);
        let b = raw;
        const enc = r.headers['content-encoding'];
        if (decode && enc === 'br') b = zlib.brotliDecompressSync(raw);
        else if (decode && enc === 'gzip') b = zlib.gunzipSync(raw);
        res({ status: r.statusCode, headers: r.headers, body: b, raw, text: b.toString('utf8'), ms: performance.now() - t0 });
      });
    });
    req.on('error', rej);
    req.setTimeout(15000, () => req.destroy(new Error('timeout ' + url)));
    if (body) req.write(body);
    req.end();
  });
}

// ---- temp repositories -----------------------------------------------------------------------------
/**
 * A throwaway git repo that contains a copy of the *working-tree* tools/ (so tests exercise the code
 * under review, not HEAD), fixes/_template, package.json and .gitignore, committed on main, plus an
 * optional linked worktree at <root>/main/.claude/worktrees/<wtName>. Lives under a temp dir.
 * Returns {root, main, wt}.
 */
export function makeTempRepo({ worktree = 'fix-wt', withHooks = false } = {}) {
  const root = tempDir('fw-repo-');
  const main = join(root, 'main');
  mkdirSync(main);
  cpSync(TOOLS, join(main, 'tools'), { recursive: true });
  cpSync(join(REPO, 'fixes', '_template'), join(main, 'fixes', '_template'), { recursive: true });
  for (const f of ['package.json', '.gitignore']) cpSync(join(REPO, f), join(main, f));
  if (withHooks && existsSync(join(REPO, '.githooks'))) cpSync(join(REPO, '.githooks'), join(main, '.githooks'), { recursive: true });
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'commit.gpgsign', 'false');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');
  let wt = null;
  if (worktree) {
    wt = join(main, '.claude', 'worktrees', worktree);
    git(main, 'worktree', 'add', '-q', wt, '-b', `wt/${worktree}`);
  }
  return { root, main, wt };
}

// ---- tests/chrome: one chrome-measure hold per file (incident I-022) ---------------------------------
/**
 * The real-Chrome tests queue on chrome-measure behind agents' A/B runs, often for longer than the
 * per-test timeout. So a chrome test file takes the lock once, in a before() hook with its own wait
 * budget (`{ timeout: Infinity }` there; the per-test clock starts after it), runs every tool it spawns
 * under that hold (pass `lock.env` in their env: FW_LOCK_HELD lets verify.mjs / fix.mjs ab re-enter it
 * instead of queueing behind it), and releases it in after(), which also runs when tests fail.
 *
 *   const lock = chromeLock(`test-chrome-x-${process.pid}`, { cmd: 'x test' });
 *   before(() => lock.acquire(), { timeout: Infinity });   // first hook of the file
 *   after(() => lock.release());
 * A functional-only file (no timing) may pass `{ shared: true, weight, maxSec }`: run by `npm run test:chrome:fn` (inside
 * a `lock.mjs run --shared` slot, FW_LOCK_SHARED) it re-enters that slot, and `lock.env` carries FW_LOCK_SHARED; run any
 * other way (on its own, or by test:chrome) it takes the same exclusive hold as without `shared` (review-lock-share B1:
 * a bounded shared hold here has no `run` to kill the file at its --max-seconds).
 */
export function chromeLock(owner, meta = {}, { waitSec = Number(process.env.FW_TEST_CHROME_LOCK_WAIT_SEC || 4 * 3600), shared = false, weight = 1, maxSec = 300 } = {}) {
  let handle = null;
  const lock = {
    owner, env: {},
    async acquire() {
      // the Chrome suite measures the real machine: opt this test process into the real host samplers,
      // which tools/lib/host.mjs refuses inside node --test otherwise (I-024); the lock's host gate
      // samples it while this file queues
      if (process.env.FW_TEST_HOST === undefined) process.env.FW_TEST_HOST = '';
      const { acquire, heldEnv, parseHeld } = await import('../tools/lib/lock.mjs');
      const inSlot = shared && !!parseHeld(process.env.FW_LOCK_SHARED)['chrome-measure'];
      handle = await acquire('chrome-measure', { owner, kind: 'process', meta, timeoutSec: waitSec, ...(inSlot ? { shared, weight, maxSec } : {}) });
      lock.env = inSlot ? { ...handle.env } : { FW_LOCK_HELD: heldEnv('chrome-measure', handle.holder.token) }; // inSlot: FW_LOCK_SHARED of the enclosing slot
      if (process.env.FW_STATE_DIR) lock.env.FW_STATE_DIR = process.env.FW_STATE_DIR;
      return handle;
    },
    release() { try { handle?.release(); } finally { handle = null; } },
  };
  return lock;
}

/**
 * The CDP commands of a fake-Chrome log (tests/fixtures/fake-chrome.mjs, $FAKE_CHROME_LOG) as stable
 * tokens "<method> <params JSON>": browser-assigned ids dropped, strings over 160 chars hashed. For golden
 * tests of what a tool sends (verify.mjs's default sequence, incident I-018 review).
 */
export function cdpTokens(log) {
  const VOLATILE = new Set(['targetId', 'browserContextId', 'objectId', 'sessionId']);
  const norm = (v) => (typeof v === 'string' ? (v.length > 160 ? `sha256:${sha256(v).slice(0, 16)}` : v)
    : Array.isArray(v) ? v.map(norm)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, norm(x)])) : v);
  return log.filter((l) => l.method && !l.method.startsWith('(')).map((l) => `${l.method} ${JSON.stringify(norm(l.params ?? {}))}`);
}

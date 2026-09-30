// Shared helpers for the tooling tests (node --test, no dependencies).
//
// Everything a test creates (temp dirs, temp git repos/worktrees, child processes) is registered here
// and removed in an 'exit' hook, so a failing or interrupted test still cleans up after itself.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

// Same for in-process git calls (tools/lib/paths.mjs imported by unit tests).
for (const k of Object.keys(process.env)) if (/^GIT_/.test(k)) delete process.env[k];

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
export function registerRealWorktree(p) { realWorktrees.add(p); }
export function unregisterRealWorktree(p) { realWorktrees.delete(p); }

// ---- environment -----------------------------------------------------------------------------------
/** A clean env for tool subprocesses: no inherited mirror/lock/port overrides unless given. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['FW_MIRROR_HOME', 'FW_STATE_DIR', 'FW_BASE', 'FW_ALLOW_MAIN', 'FW_LOCK_OWNER', 'FW_LOCK_HELD', 'PORT', 'CHROME', 'FW_IPHONE_PORT', 'FW_IPHONE_DEVICE_PORT', 'NODE_TEST_CONTEXT', 'FW_PRECOMMIT_TEST_CMD']) delete env[k];
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

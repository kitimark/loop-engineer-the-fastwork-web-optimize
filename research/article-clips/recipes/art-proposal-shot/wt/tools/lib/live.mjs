// I-074 (user T-028): "Try it" on the console's proposals page: scroll the original page (A, the baseline) and the PoC
// (B, the baseline + a committed fixes/<topic>/patch.diff) side by side in two iframes.
//
// The proposal names B with a `live` entry ({patch: "fixes/<topic>/patch.diff", ref?: "HEAD"}, per option or for the
// single solution; tools/lib/proposal.mjs validates it). At validation the patch is read from git (`<ref>:<patch>`, so
// only a committed patch), and its text is kept in the console store under its blob id (content-addressed, immutable):
//   <console>/live/patches/<blob>.diff     the patch as committed
//   <console>/live/overlays/<blob>/        the overlay it builds (baseline files + the patch, built once; never site/)
// The console (createLiveServers) starts two tools/serve.mjs children lazily, on the first panel open: A = the baseline,
// B = the baseline + that overlay; both on 127.0.0.1, --port auto (5200-5999, never 5173), --vendors=local, plain http,
// --frame-ancestors <the console's origins>. It reuses them, restarts B for another patch, and kills them (only its
// own children) after `idleMs` (10 min) without a panel open (the page pings every minute while it is open) and when
// the console exits. measuringNow(): a timing hold on chrome-measure (the panel shows a note; it never blocks).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { REPO, sharedStateDir, resolveTree } from './paths.mjs';
import { patchHeader, baselineDrift } from './bench-overlay.mjs';
import { status as lockStatus, isGroup } from './lock.mjs';

/** A live patch path: a fix's committed deliverable. */
export const LIVE_PATCH = /^fixes\/[a-z0-9][a-z0-9-]{1,60}\/patch\.diff$/;
/** A git ref the patch is read from (default HEAD of the checkout the command runs in). */
export const LIVE_REF = /^(?!-)[A-Za-z0-9._/@{}~^-]{1,100}$/;
export const BLOB = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const DEFAULT_IDLE_SEC = 600;
const BASES = new Set(['site-pretty', 'site']);

export const liveDir = () => join(sharedStateDir(), 'console', 'live');
export const livePatchFile = (blob) => join(liveDir(), 'patches', `${checkBlob(blob)}.diff`);
const overlayOf = (blob) => join(liveDir(), 'overlays', checkBlob(blob));

function checkBlob(b) { if (!BLOB.test(String(b))) throw new Error(`bad blob id ${JSON.stringify(b)}`); return b; }

/** git without the GIT_* variables a hook exports (GIT_DIR would redirect `-C <dir>`), plus `extra`. */
function gitEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_/.test(k)) delete env[k];
  return { ...env, ...extra };
}
function git(cwd, args, extra) { return spawnSync('git', args, { cwd, env: gitEnv(extra), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }

/** The tree a patch was made against (`# baseline: site-pretty/` from fix.mjs diff; default site-pretty). */
export function patchBase(text) {
  const m = String(text).match(/^# baseline: (site-pretty|site)\//m);
  return m ? m[1] : 'site-pretty';
}

/**
 * Read a committed patch: `git -C <repoDir> rev-parse <ref>:<patch>` and its text. Returns {patch, ref, blob, base,
 * files, text} or throws a plain error (not committed, stacked, no files). Nothing is written.
 */
export function resolveLivePatch({ patch, ref = 'HEAD', repoDir = process.cwd() }) {
  if (typeof patch !== 'string' || !LIVE_PATCH.test(patch)) throw new Error(`must be a fix's committed patch, fixes/<topic>/patch.diff (got ${JSON.stringify(patch)})`);
  if (typeof ref !== 'string' || !LIVE_REF.test(ref)) throw new Error(`ref: a git ref such as HEAD or main (got ${JSON.stringify(ref)})`);
  const r = git(repoDir, ['rev-parse', '--verify', '--quiet', `${ref}:${patch}`]);
  const blob = r.status === 0 ? r.stdout.trim() : '';
  if (!BLOB.test(blob)) throw new Error(`${patch} is not committed at ${ref} in ${repoDir === process.cwd() ? 'this checkout' : repoDir} (commit it first; only a committed patch is served)`);
  const t = git(repoDir, ['cat-file', 'blob', blob]);
  if (t.status !== 0) throw new Error(`git cat-file ${blob.slice(0, 12)} failed: ${(t.stderr || '').trim()}`);
  const text = t.stdout;
  const h = patchHeader(text);
  if (h.stackedOn) throw new Error(`${patch} is stacked on fixes/${h.stackedOn}/overlay; only a patch on the plain baseline can be served`);
  if (!h.files.length) throw new Error(`${patch} changes no file (no "+++ b/<path>" line)`);
  const bad = h.files.find((f) => !f || f.startsWith('/') || f.split('/').includes('..'));
  if (bad) throw new Error(`${patch}: bad file path ${JSON.stringify(bad)}`);
  return { patch, ref, blob, base: patchBase(text), files: h.files, text };
}

/** Keep a resolved patch's text in the store (once per blob). */
export function storeLivePatch(blob, text) {
  const f = livePatchFile(blob);
  if (existsSync(f)) return f;
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, f);
  return f;
}

/** The stored patch of `blob`, or null. */
export function storedLivePatch(blob) {
  try { return readFileSync(livePatchFile(blob), 'utf8'); } catch { return null; }
}

/**
 * The overlay dir of `blob` (built once from the stored patch on the baseline's files; content-addressed). Throws
 * BASELINE-CHANGED when the baseline's bytes differ from the patch's base-sha256 lines, or when the patch does not apply.
 */
export function buildLiveOverlay(blob) {
  const dest = overlayOf(blob);
  if (existsSync(`${dest}.ready`) && existsSync(dest)) return dest;
  const text = storedLivePatch(blob);
  if (text === null) throw new Error(`no stored patch ${blob.slice(0, 12)} (set the live entry again: node tools/console.mjs proposal live …)`);
  const h = patchHeader(text);
  const baseDir = resolveTree(patchBase(text));
  if (!existsSync(baseDir)) throw new Error(`baseline ${baseDir} not found`);
  const drift = baselineDrift(text, baseDir);
  if (drift.length) throw new Error(`BASELINE-CHANGED: the patch was made on another baseline (${drift.map((d) => d.file).join(', ')})`);
  const tmp = `${dest}.tmp-${process.pid}-${randomBytes(3).toString('hex')}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    for (const f of h.files) {
      const src = join(baseDir, f);
      if (existsSync(src)) { mkdirSync(dirname(join(tmp, f)), { recursive: true }); copyFileSync(src, join(tmp, f)); }
    }
    // `git apply` outside any repository (the store lies inside .git, whose paths git apply refuses): the ceiling
    // stops git's repository search at the overlay dir itself, so it patches the files in cwd like patch(1).
    const r = git(tmp, ['apply', '--whitespace=nowarn', livePatchFile(blob)], { GIT_CEILING_DIRECTORIES: dirname(tmp) });
    if (r.status !== 0) throw new Error(`the patch does not apply on the baseline: ${((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0]}`);
    rmSync(dest, { recursive: true, force: true });
    renameSync(tmp, dest);
    writeFileSync(`${dest}.ready`, new Date().toISOString() + '\n');
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return dest;
}

/** A timing hold on chrome-measure right now (a normal hold: not shared, short or no-timing): {owner} or null. */
export function timingHold(st) {
  const h = st?.holder;
  if (!h || st.stale) return null;
  if (isGroup(h) || h.shared || h.short || h.noTiming || h.functional) return null;
  return { owner: h.owner };
}
export function measuringNow() {
  try { return !!timingHold(lockStatus('chrome-measure')); } catch { return false; }
}

const idleFromEnv = () => { const s = Number(process.env.FW_CONSOLE_LIVE_IDLE_SEC); return s > 0 ? s * 1000 : DEFAULT_IDLE_SEC * 1000; };

/**
 * The console's two page servers. opts: {origins: [console origins for --frame-ancestors], idleMs (default 10 min,
 * $FW_CONSOLE_LIVE_IDLE_SEC), sweepMs, serveScript, startTimeoutMs}. Returns {open({blob, base}) -> {a, b} URLs,
 * ping(), sweep(), running(), stopAll(), close()}.
 */
export function createLiveServers({ origins, idleMs = idleFromEnv(), sweepMs, serveScript = join(REPO, 'tools', 'serve.mjs'), startTimeoutMs = 30000 } = {}) {
  if (!Array.isArray(origins) || !origins.length) throw new Error('createLiveServers: origins required');
  const kids = new Map(); // role 'a' | 'b' -> {proc, key, url, exited}
  let lastSeen = 0, chain = Promise.resolve(), closed = false;
  const onExit = () => { for (const k of kids.values()) { try { k.proc.kill('SIGTERM'); } catch {} } };
  process.on('exit', onExit);
  const sweeper = setInterval(() => { sweep(); }, sweepMs ?? Math.max(50, Math.min(30000, Math.floor(idleMs / 4))));
  sweeper.unref?.();

  const alive = (k) => k && k.proc.exitCode === null && k.proc.signalCode === null;
  function stop(role) {
    const k = kids.get(role);
    kids.delete(role);
    if (!alive(k)) return Promise.resolve();
    k.proc.kill('SIGTERM');
    const t = setTimeout(() => { try { k.proc.kill('SIGKILL'); } catch {} }, 3000);
    t.unref?.();
    return k.exited.then(() => clearTimeout(t));
  }
  function start(role, key, extra) {
    const args = [serveScript, ...extra, '--vendors=local', '--port', 'auto', '--host', '127.0.0.1', '--quiet', '--frame-ancestors', origins.join(',')];
    const proc = spawn(process.execPath, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    const k = { proc, key, url: null };
    k.exited = new Promise((r) => proc.once('exit', () => { if (kids.get(role) === k) kids.delete(role); r(); }));
    kids.set(role, k);
    let out = '', err = '';
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { reject(new Error(`the ${role === 'a' ? 'original' : 'PoC'} page server did not start within ${startTimeoutMs / 1000} s`)); stop(role); }, startTimeoutMs);
      proc.stdout.on('data', (d) => {
        if (k.url) return; // keep draining
        out += d;
        const m = out.match(/^MIRROR_URL=(\S+)$/m);
        if (m) { k.url = m[1].replace(/^http:\/\/localhost:/, "http://127.0.0.1:"); clearTimeout(t); resolve(k); } // it listens on 127.0.0.1 only
      });
      proc.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
      proc.once('exit', (code) => {
        if (k.url) return;
        clearTimeout(t);
        reject(new Error(`the ${role === 'a' ? 'original' : 'PoC'} page server exited (${code}): ${err.trim().split('\n').slice(-2).join(' ') || 'no message'}`));
      });
    });
  }
  async function ensure(role, key, extra) {
    const k = kids.get(role);
    if (alive(k) && k.key === key && k.url) return k;
    await stop(role);
    return start(role, key, extra);
  }
  function sweep(now = Date.now()) {
    if (kids.size && now - lastSeen >= idleMs) { chain = chain.then(() => Promise.all([stop('a'), stop('b')])).catch(() => {}); return true; }
    return false;
  }
  return {
    /** Start (or reuse) A = the baseline and B = the baseline + the overlay of `blob`. */
    open({ blob, base = 'site-pretty' }) {
      if (closed) return Promise.reject(new Error('the console is stopping'));
      if (!BASES.has(base)) return Promise.reject(new Error(`bad base ${base}`));
      lastSeen = Date.now();
      const run = chain.then(async () => {
        const overlay = buildLiveOverlay(blob);
        const a = await ensure('a', `base:${base}`, ['--root', base]);
        const b = await ensure('b', `blob:${blob}:${base}`, ['--root', base, '--overlay', overlay]);
        lastSeen = Date.now();
        return { a: a.url, b: b.url };
      });
      chain = run.catch(() => {});
      return run;
    },
    idleMs,
    ping() { lastSeen = Date.now(); return this.running(); },
    sweep,
    running() { return [...kids.entries()].filter(([, k]) => alive(k)).map(([role, k]) => ({ role, pid: k.proc.pid, url: k.url, key: k.key })); },
    stopAll() { chain = chain.then(() => Promise.all([stop('a'), stop('b')])).catch(() => {}); return chain; },
    close() {
      closed = true;
      clearInterval(sweeper);
      const done = this.stopAll().then(() => process.off('exit', onExit));
      return done;
    },
  };
}

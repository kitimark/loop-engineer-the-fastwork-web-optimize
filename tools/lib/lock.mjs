// Named cross-worktree locks for shared physical resources.
//
//   chrome-measure  the Mac's CPU while Chrome runs a throttled measurement (verify.mjs takes it itself)
//   iphone          the one iPhone 15 Pro Max on ios_webkit_debug_proxy (a lease taken with tools/lock.mjs)
//
// State lives in the shared git dir, so every worktree of this repo sees the same locks:
//   <git-common-dir>/fastwork-mirror/locks/<resource>.json         current holder
//   <git-common-dir>/fastwork-mirror/locks/<resource>.queue.json   FIFO of waiters
//   <git-common-dir>/fastwork-mirror/locks/<resource>.guard/       short mutex around every read-modify-write
//
// Two kinds of holder:
//   - process: held by a running process (pid). Stale as soon as that pid is gone (crash-safe), or
//     when its optional TTL runs out.
//   - lease:   taken by one CLI call and released by a later one (an agent holds the iPhone for
//     minutes across many commands). Stale when `expiresAt` passes; `renew` extends it.
// A stale holder is replaced by the next acquirer. Waiters are served first-come-first-served:
// each waiter has a queue entry that it refreshes whenever it retries; an entry not refreshed for
// `queueTtlSec` (default 10 min) is dropped, so a crashed waiter never blocks the queue.
import { mkdirSync, rmdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { sharedStateDir, REPO } from './paths.mjs';

export const RESOURCES = {
  'chrome-measure': 'Mac CPU during a throttled Chrome measurement (tools/verify.mjs, tools/fix.mjs ab)',
  iphone: 'the shared iPhone 15 Pro Max (ios_webkit_debug_proxy :9221/:9222, one page at a time)',
};

export const lockDir = () => join(sharedStateDir(), 'locks');
const holderFile = (r) => join(lockDir(), `${r}.json`);
const queueFile = (r) => join(lockDir(), `${r}.queue.json`);
const guardDir = (r) => join(lockDir(), `${r}.guard`);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function checkName(r) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(r)) throw new Error(`bad resource name "${r}"`);
}

export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readJson(f, d) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } }
function writeJson(f, v) { const t = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`; writeFileSync(t, JSON.stringify(v, null, 1)); renameSync(t, f); }

/** Why a holder record is stale, or null if it is live. */
export function staleReason(h, now = Date.now()) {
  if (!h) return 'none';
  if (h.expiresAt && now > Date.parse(h.expiresAt)) return `expired at ${h.expiresAt}`;
  if (h.kind === 'process' && !pidAlive(h.pid)) return `pid ${h.pid} is gone`;
  return null;
}

// mkdir is atomic: whoever creates the guard dir owns the critical section (a few ms). A guard older
// than 10 s belongs to a process that died inside the critical section and is removed.
async function withGuard(r, fn) {
  mkdirSync(lockDir(), { recursive: true });
  const g = guardDir(r);
  for (let i = 0; ; i++) {
    try { mkdirSync(g); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(g).mtimeMs > 10000) { rmdirSync(g); continue; } } catch {}
      if (i > 2000) throw new Error(`lock guard ${g} stuck`);
      await sleep(5 + Math.random() * 20);
    }
  }
  try { return fn(); } finally { try { rmdirSync(g); } catch {} }
}

function pruneQueue(q, now = Date.now(), queueTtlSec = 600) {
  return q.filter((w) => now - Date.parse(w.lastSeen) < (w.queueTtlSec ?? queueTtlSec) * 1000 && (!w.pid || w.kind !== 'process' || pidAlive(w.pid)));
}

/** Snapshot of one resource: {resource, holder, stale, queue}. */
export function status(r) {
  checkName(r);
  const h = readJson(holderFile(r), null);
  const q = pruneQueue(readJson(queueFile(r), []));
  return { resource: r, holder: h, stale: h ? staleReason(h) : null, queue: q };
}

export function allStatus() {
  let names = new Set(Object.keys(RESOURCES));
  try { for (const f of readdirSync(lockDir())) { const m = f.match(/^([a-z0-9-]+)\.json$/); if (m) names.add(m[1]); } } catch {}
  return [...names].map(status);
}

/**
 * One acquisition attempt. Returns {ok:true, holder} or {ok:false, holder, position}.
 * opts: {owner, kind:'process'|'lease', ttlSec, pid, meta, queueTtlSec}
 */
export async function tryAcquire(r, opts) {
  checkName(r);
  const { owner, kind = 'lease', ttlSec, pid = process.pid, meta = {}, queueTtlSec = 600 } = opts;
  if (!owner) throw new Error('owner is required (e.g. the fix topic)');
  return withGuard(r, () => {
    const now = Date.now();
    let h = readJson(holderFile(r), null);
    let q = pruneQueue(readJson(queueFile(r), []), now, queueTtlSec);
    const reason = h && staleReason(h, now);
    if (h && reason) {
      writeJson(join(lockDir(), `${r}.last-stale.json`), { ...h, staleBecause: reason, clearedAt: new Date(now).toISOString(), clearedBy: owner });
      try { unlinkSync(holderFile(r)); } catch {}
      h = null;
    }
    if (h && h.owner === owner && (h.kind === 'lease' || h.pid === pid)) {
      // re-entrant for the same owner: refresh the TTL
      if (ttlSec) h.expiresAt = new Date(now + ttlSec * 1000).toISOString();
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true };
    }
    const mine = q.findIndex((w) => w.owner === owner);
    const headOk = q.length === 0 || mine === 0;
    if (!h && headOk) {
      h = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout: REPO, host: os.hostname(), acquiredAt: new Date(now).toISOString(),
        expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : undefined, meta,
      };
      writeJson(holderFile(r), h);
      if (mine === 0) q.shift();
      writeJson(queueFile(r), q);
      return { ok: true, holder: h };
    }
    // busy (or someone queued earlier): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec };
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.findIndex((w) => w.owner === owner) + 1, queue: q };
  });
}

/** Leave the queue without acquiring (e.g. an agent gives up waiting). */
export async function dequeue(r, owner) {
  checkName(r);
  return withGuard(r, () => { const q = readJson(queueFile(r), []).filter((w) => w.owner !== owner); writeJson(queueFile(r), q); return q; });
}

/** Release. Only the owner may release unless force. Returns the removed holder or null. */
export async function release(r, { owner, force = false } = {}) {
  checkName(r);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h) return null;
    if (!force && h.owner !== owner) throw new Error(`${r} is held by "${h.owner}", not "${owner}" (use --force only if that holder is really gone)`);
    unlinkSync(holderFile(r));
    return h;
  });
}

/** Extend a lease. */
export async function renew(r, { owner, ttlSec }) {
  checkName(r);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || h.owner !== owner || staleReason(h)) throw new Error(`${r} is not held by "${owner}"${h ? ` (holder: ${h.owner}${staleReason(h) ? ', stale' : ''})` : ''}`);
    h.expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    writeJson(holderFile(r), h);
    return h;
  });
}

/**
 * Wait (FIFO) and acquire. Polls with backoff; logs who is holding every 30 s.
 * Process-kind locks are also released automatically on exit / SIGINT / SIGTERM.
 * Returns {holder, release()}.
 */
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, timeoutSec = 3600, pollMs = 2000, maxPollMs = 15000, log = (s) => console.error(s) } = {}) {
  const t0 = Date.now();
  let lastLog = 0, wait = pollMs;
  for (;;) {
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta });
    if (res.ok) {
      if (Date.now() - t0 > 1500) log(`[lock ${r}] acquired after ${Math.round((Date.now() - t0) / 1000)} s`);
      let done = false;
      const rel = () => {
        if (done) return; done = true;
        // synchronous best effort (also used from the 'exit' handler)
        try { const h = readJson(holderFile(r), null); if (h && h.token === res.holder.token) unlinkSync(holderFile(r)); } catch {}
      };
      if (kind === 'process') {
        process.on('exit', rel);
        for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { rel(); process.exit(130); });
      }
      return { holder: res.holder, release: rel };
    }
    if (Date.now() - t0 > timeoutSec * 1000) { await dequeue(r, owner); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s; held by ${res.holder?.owner}`); }
    if (Date.now() - lastLog > 30000) {
      const h = res.holder;
      log(`[lock ${r}] busy: held by "${h?.owner}" (${h?.kind}${h?.pid ? ' pid ' + h.pid : ''}, since ${h?.acquiredAt}${h?.expiresAt ? ', expires ' + h.expiresAt : ''}); you are #${res.position} in queue`);
      lastLog = Date.now();
    }
    await sleep(wait + Math.random() * 500);
    wait = Math.min(maxPollMs, Math.round(wait * 1.5));
  }
}

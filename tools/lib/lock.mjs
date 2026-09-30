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
//
// Short lane (incident I-007): a waiter that asks for `short` with a `maxSec` (<= SHORT_MAX_SEC; the
// pre-commit `npm test`, ~35 s) still waits for the current holder (never preempts), but at the next
// hand-over it is served before earlier normal waiters (5-min A/Bs). At most one short job runs between
// two normal holders while a normal job is waiting (<resource>.last-grant.json remembers whether the
// last grant was short), so shorts can't starve the queue. A short holder expires at acquiredAt + maxSec
// (no --ttl, re-acquire or renew stretches it); `lock.mjs run --short` also kills its command then.
// A short waiter must keep polling: its queue entry is dropped after SHORT_QUEUE_TTL_SEC without a
// refresh, so a short job that stopped waiting never holds up the hand-over.
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
const lastGrantFile = (r) => join(lockDir(), `${r}.last-grant.json`);
export const SHORT_MAX_SEC = 300;
const SHORT_QUEUE_TTL_SEC = 60;
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
// Exported for other shared stores in the same state dir (tools/lib/incident.mjs); `fn` must be
// synchronous and short.
export async function withGuard(r, fn) {
  checkName(r);
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

/** Snapshot of one resource: {resource, holder, stale, queue, next} (next: the waiter served at the next hand-over). */
export function status(r) {
  checkName(r);
  const h = readJson(holderFile(r), null);
  const q = pruneQueue(readJson(queueFile(r), []));
  const next = q.length ? q[nextIndex(q, !!readJson(lastGrantFile(r), {}).short)].owner : null;
  return { resource: r, holder: h, stale: h ? staleReason(h) : null, queue: q, next };
}

export function allStatus() {
  let names = new Set(Object.keys(RESOURCES));
  try { for (const f of readdirSync(lockDir())) { const m = f.match(/^([a-z0-9-]+)\.json$/); if (m) names.add(m[1]); } } catch {}
  return [...names].map(status);
}

/** Index of the waiter served at the next hand-over: FIFO, except the short lane (see header). */
function nextIndex(q, lastGrantShort) {
  const i = q.findIndex((w) => (lastGrantShort ? !w.short : w.short));
  return i < 0 ? 0 : i;
}

/**
 * One acquisition attempt. Returns {ok:true, holder} or {ok:false, holder, position, queue, next}.
 * opts: {owner, kind:'process'|'lease', ttlSec, pid, meta, queueTtlSec, short, maxSec}
 */
export async function tryAcquire(r, opts) {
  checkName(r);
  const { owner, kind = 'lease', pid = process.pid, meta = {}, short = false, maxSec } = opts;
  let { ttlSec, queueTtlSec = 600 } = opts;
  if (!owner) throw new Error('owner is required (e.g. the fix topic)');
  if (short) {
    if (!(maxSec > 0 && maxSec <= SHORT_MAX_SEC)) throw new Error(`a short job needs --max-seconds between 1 and ${SHORT_MAX_SEC} (got ${maxSec})`);
    ttlSec = kind === 'process' ? maxSec + 5 : maxSec; // + the grace `lock.mjs run` gives the command after SIGTERM
    queueTtlSec = Math.min(queueTtlSec, SHORT_QUEUE_TTL_SEC);
  }
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
      if (ttlSec && !h.short) h.expiresAt = new Date(now + ttlSec * 1000).toISOString();
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true };
    }
    const mine = q.findIndex((w) => w.owner === owner);
    const lastGrantShort = !!readJson(lastGrantFile(r), {}).short;
    const headOk = q.length === 0 || mine === nextIndex(q, lastGrantShort);
    if (!h && headOk) {
      h = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout: REPO, host: os.hostname(), acquiredAt: new Date(now).toISOString(),
        expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : undefined, meta,
        ...(short ? { short: true, maxSec } : {}),
      };
      writeJson(holderFile(r), h);
      writeJson(lastGrantFile(r), { owner, short, at: h.acquiredAt });
      if (mine >= 0) q.splice(mine, 1);
      writeJson(queueFile(r), q);
      return { ok: true, holder: h };
    }
    // busy (or someone else is served first): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, ...(short ? { short: true, maxSec } : {}) };
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.findIndex((w) => w.owner === owner) + 1, queue: q, next: q[nextIndex(q, lastGrantShort)].owner };
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
    if (h.short) throw new Error(`${r} is held by "${owner}" as a short job (max ${h.maxSec} s); a short job cannot be renewed`);
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
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, short = false, maxSec, timeoutSec = 3600, pollMs = 2000, maxPollMs = short ? 3000 : 15000, log = (s) => console.error(s) } = {}) {
  const t0 = Date.now();
  let lastLog = 0, wait = pollMs;
  for (;;) {
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta, short, maxSec });
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
    // no holder but not our turn: the lock is being handed over to the waiter served next
    const h = res.holder, handover = `free, handing over to "${res.next}"`;
    if (Date.now() - t0 > timeoutSec * 1000) { await dequeue(r, owner); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s; ${h ? `held by ${h.owner}` : handover}`); }
    if (Date.now() - lastLog > 30000) {
      log(`[lock ${r}] busy: ${h ? `held by "${h.owner}" (${h.kind}${h.pid ? ' pid ' + h.pid : ''}, since ${h.acquiredAt}${h.expiresAt ? ', expires ' + h.expiresAt : ''})` : handover}; you are #${res.position} in queue`);
      lastLog = Date.now();
    }
    await sleep(wait + Math.random() * 500);
    wait = Math.min(maxPollMs, Math.round(wait * 1.5));
  }
}

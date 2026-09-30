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
// `queueTtlSec` (default 10 min) is dropped, so a crashed waiter never blocks the queue. A queue place
// belongs to the waiting process: killing a waiting verify.mjs / fix.mjs ab / `lock.mjs run` (SIGTERM,
// Ctrl-C) gives it up, and a restart queues at the back. To keep a place without a live process, queue
// a lease with `lock.mjs acquire` (retry within 10 min).
//
// Short lane (incident I-007): a waiter that asks for `short` with a `maxSec` (<= SHORT_MAX_SEC; the
// pre-commit `npm test`, ~35 s) still waits for the current holder (never preempts), but at the next
// hand-over it is served before earlier normal waiters (5-min A/Bs). Queued short jobs drain back to
// back while the run of consecutive short grants still fits SHORT_DRAIN_SEC (from the first short
// grant, counting the next job's max-seconds); then the next normal waiter goes first
// (<resource>.last-grant.json records the last grant and when the short run started), so shorts
// can't starve the queue: a waiting normal job is delayed by at most SHORT_DRAIN_SEC. A short holder expires at acquiredAt + maxSec
// (no --ttl, re-acquire or renew stretches it); `lock.mjs run --short` also kills its command then.
// A short waiter must keep polling: its queue entry is dropped after SHORT_QUEUE_TTL_SEC without a
// refresh, so a short job that stopped waiting never holds up the hand-over.
//
// Re-entry. The same owner re-enters its own lease (any pid) or its own process lock (same pid). A
// descendant process re-enters its ancestor's hold through FW_LOCK_HELD=<resource>:<token>[,...], which
// `lock.mjs run` exports to its command (incident I-005: `lock.mjs run chrome-measure -- fix.mjs ab`
// would otherwise wait forever for itself, since verify.mjs is another pid). The token must equal the
// live holder's random token; a stale holder's token grants nothing. A re-entrant acquire never
// changes the holder record or the queue, and its release (and exit) leaves the outer hold alone.
// Nested in a short `run`, it is bounded by that run's --max-seconds too.
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
export const SHORT_DRAIN_SEC = 300; // a run of back-to-back short jobs ends within this (incident I-011)
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** Parse FW_LOCK_HELD ("<resource>:<token>,...") into {resource: token}. */
export function parseHeld(s) {
  const out = {};
  for (const part of String(s || '').split(',')) { const m = part.trim().match(/^([a-z0-9][a-z0-9-]{0,40}):([0-9a-f]{12})$/); if (m) out[m[1]] = m[2]; }
  return out;
}

/** FW_LOCK_HELD value for a child of a process that holds `r` with `token` (keeps other resources' entries). */
export function heldEnv(r, token, prev = process.env.FW_LOCK_HELD) {
  return Object.entries({ ...parseHeld(prev), [r]: token }).map(([k, v]) => `${k}:${v}`).join(',');
}

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
  const next = q.length ? q[nextIndex(q, effectiveLastGrant(readJson(lastGrantFile(r), {}), h))].owner : null;
  return { resource: r, holder: h, stale: h ? staleReason(h) : null, queue: q, next };
}

export function allStatus() {
  let names = new Set(Object.keys(RESOURCES));
  try { for (const f of readdirSync(lockDir())) { const m = f.match(/^([a-z0-9-]+)\.json$/); if (m) names.add(m[1]); } } catch {}
  return [...names].map(status);
}

// last-grant.json can lag behind reality: clients on lock code from before the short lane grant by plain
// FIFO and never write it (incident I-011). So (1) a live holder not recorded there (another token) *is*
// the last grant, and whoever sees it records it; (2) a short record only counts while that short hold
// could still be running (+ a grace for the hand-over): after that, a normal job must have had its turn.
function effectiveLastGrant(lg, h) {
  if (h && h.token && h.token !== lg.token) return { owner: h.owner, short: !!h.short, maxSec: h.maxSec, at: h.acquiredAt, token: h.token };
  return lg;
}
function lastGrantShort(lg, now = Date.now()) {
  return !!lg.short && now - Date.parse(lg.at) < ((lg.maxSec || SHORT_MAX_SEC) + 5 + 30) * 1000;
}

/** When the current run of back-to-back short grants started (ms), or null after a normal grant. */
function shortRunStart(lg, now = Date.now()) {
  return lastGrantShort(lg, now) ? Date.parse(lg.runStart || lg.at) : null;
}

/** Index of the waiter served at the next hand-over: FIFO, except the short lane (see header). */
function nextIndex(q, lg, now = Date.now()) {
  const s = q.findIndex((w) => w.short), n = q.findIndex((w) => !w.short);
  if (s < 0 || n < 0) return 0;
  const start = shortRunStart(lg, now) ?? now;
  return now - start + (q[s].maxSec || SHORT_MAX_SEC) * 1000 <= SHORT_DRAIN_SEC * 1000 ? s : n;
}

/**
 * One acquisition attempt. Returns {ok:true, holder} or {ok:false, holder, position, queue, next}.
 * opts: {owner, kind:'process'|'lease', ttlSec, pid, meta, queueTtlSec, short, maxSec, held}
 * `held`: an FW_LOCK_HELD string; a token matching the live holder re-enters it ({reentrant, inherited}).
 */
export async function tryAcquire(r, opts) {
  checkName(r);
  const { owner, kind = 'lease', pid = process.pid, meta = {}, short = false, maxSec, held } = opts;
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
    if (h && h.token && parseHeld(held)[r] === h.token) {
      // a descendant of the holder (FW_LOCK_HELD from `lock.mjs run`): runs under the ancestor's hold
      return { ok: true, holder: h, reentrant: true, inherited: true };
    }
    if (h && h.owner === owner && (h.kind === 'lease' || h.pid === pid)) {
      // re-entrant for the same owner: refresh the TTL
      if (ttlSec && !h.short) h.expiresAt = new Date(now + ttlSec * 1000).toISOString();
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true };
    }
    const mine = q.findIndex((w) => w.owner === owner);
    const lg = readJson(lastGrantFile(r), {});
    const seen = effectiveLastGrant(lg, h);
    if (seen !== lg) writeJson(lastGrantFile(r), seen); // record a grant made by old code (I-011)
    const headOk = q.length === 0 || mine === nextIndex(q, seen, now);
    if (!h && headOk) {
      h = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout: REPO, host: os.hostname(), acquiredAt: new Date(now).toISOString(),
        expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : undefined, meta,
        ...(short ? { short: true, maxSec } : {}),
      };
      writeJson(holderFile(r), h);
      const runStart = short ? new Date(shortRunStart(seen, now) ?? now).toISOString() : undefined;
      writeJson(lastGrantFile(r), { owner, short, maxSec, at: h.acquiredAt, token: h.token, runStart });
      if (mine >= 0) q.splice(mine, 1);
      writeJson(queueFile(r), q);
      return { ok: true, holder: h };
    }
    // busy (or someone else is served first): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, ...(short ? { short: true, maxSec } : {}) };
    if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019, lock-repair.mjs)
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.findIndex((w) => w.owner === owner) + 1, queue: q, next: q[nextIndex(q, seen, now)].owner };
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
 * A re-entrant acquire (the same owner's lease, or an ancestor's hold via `held`, default
 * $FW_LOCK_HELD) returns at once, and its release() is a no-op: the outer holder releases.
 * Returns {holder, release(), reentrant}.
 */
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, short = false, maxSec, held = process.env.FW_LOCK_HELD, timeoutSec = 3600, pollMs = 2000, maxPollMs = short ? 3000 : 15000, log = (s) => console.error(s) } = {}) {
  const t0 = Date.now();
  let lastLog = 0, wait = pollMs;
  for (;;) {
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta, short, maxSec, held });
    if (res.ok && res.reentrant) return { holder: res.holder, release: () => {}, reentrant: true };
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
        // process.on, not once: a once-listener is removed before it runs, which restores the default
        // action, so a second signal (fix.mjs ab forwards SIGTERM twice) killed the process midway through
        // process.exit() and skipped later 'exit' listeners such as lib/cdp.mjs killOnExit (incident I-008).
        for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { rel(); process.exit(130); });
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

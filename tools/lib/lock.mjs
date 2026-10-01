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
// a lease with `lock.mjs acquire` (retry within 10 min). At a hand-over, though, only waiters seen within
// HANDOVER_FRESH_SEC compete (I-020): a waiter that is not polling is skipped and keeps its place.
//
// Short lane (incident I-007): a waiter that asks for `short` with a `maxSec` (<= SHORT_MAX_SEC; the
// pre-commit `npm test`, ~35 s) still waits for the current holder (never preempts), but at the next
// hand-over it is served before earlier normal waiters (5-min A/Bs). Queued short jobs drain back to
// back (all of them, I-020) while the run of consecutive short grants still fits SHORT_DRAIN_SEC (900 s,
// from the first short grant, counting the next job's max-seconds); then the next normal waiter goes first
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
//
// Host admission gate (incident I-016, postmortem 2026-09-30 §3 (a)): for a gated resource
// (chrome-measure), the waiter served next that is a *normal* job is granted only when the host is quiet
// (tools/lib/host.mjs quiet(): CPU <= 25 % busy over a >= 10 s window, load1 <= 6, memory pressure
// normal). Until then it keeps its place (the queue entry records `gate: {since, at, reasons, load1,
// busyPct, pressure}`) and samples the host. Short jobs are exempt: they may be granted while the head
// normal waiter waits for quiet (by the short lane, or past the drain budget by the gate exemption), but
// only during the first THRESHOLDS.gateShortPassSec (120 s, at most the cap) of its gate wait, and never
// past a waiter the lead moved (I-030); then no short job passes it until it is granted, so the host can
// settle. FW_GATE_SHORT_PASS sets that window per process: a short job's grant is decided in the short
// job's own process (its env), like every tryAcquire with the caller's THRESHOLDS. After
// THRESHOLDS.gateMaxWaitSec (600 s; env FW_GATE_MAX_WAIT) the waiter is granted anyway: the holder record
// gets `gateTimeout: true`, a line goes to locks/host-alerts.log, and verify.mjs marks every run of that hold contaminated. Every gated grant
// records `gate: {quiet, waitedSec, reasons, load1, busyPct, sysPct, pressure}` in the holder. The host
// sample is passed in by the caller (tryAcquire's `host`); acquire() and `lock.mjs acquire` take it.
// I-033: a gate window in which the host slept (sample.suspended) is not quiet, whatever its load (the 04:00Z
// A/A was granted on a window with a 27 s sleep in it); tryAcquire sums the sleep over the gate wait in the
// waiter's queue entry (kept across short jobs) into the grant's `gate.sleptSec` / `gate.woke`, and verify.mjs
// warns on a run of such a hold. The gateMaxWaitSec cap counts awake time only, and a window the host slept
// through never ends in a gate timeout (review-host-state B1): the next, fresh window decides.
//
// No-timing holds (ts-lock-bundle; `lock.mjs run --no-timing`): a normal job that measures nothing (a build, other
// minutes of CPU work) still holds chrome-measure, so no measurement runs beside it (Hard rule 7), but it skips the
// host gate: it does not need a quiet host and must not wait for one while the user works at the Mac. Its holder
// carries `noTiming: true`. The gate's guarantee stays whole: a timing acquirer (a normal, gated one: verify.mjs,
// fix.mjs ab, bench, a normal `lock.mjs run`) never re-enters a no-timing hold (FW_LOCK_HELD or same owner: it
// throws), and after the hold every timing waiter passes the gate on a fresh window as usual. Short jobs and nested
// no-timing runs may re-enter it. Timed iPhone runs refuse during it like during any normal hold (iphone-run.mjs).
//
// Shared short holds (ts-lock-bundle (f), lead 15:0xZ: the short lane had 8 jobs queued): while the holder is a short
// job and NO normal job waits (no normal entry in the queue, a no-timing one included), the next short waiter may
// share the hold: it gets the co-hold slot <resource>.cohold.json (SHARED_SHORT: at most 2 holders), if it comes from
// another checkout than the holder (two jobs of one worktree would share its out/). A normal waiter that arrives
// blocks new shared entries (the condition fails) and waits for both to end: the slot is promoted into the holder
// file when the holder ends (release, exit, stale), so <resource>.json is "the holder" whenever anyone holds, and a
// normal grant, which needs no holder, also needs the co-holder gone. The co-holder is a short holder like any other
// (expiresAt = acquiredAt + maxSec, stale on a dead pid, re-entry by its own token or owner) and carries
// `cohold: true, sharedWith: <holder>`; status() returns it as `cohold`; it keeps the Mac awake through the shared
// queue assertion (awake.mjs keepAwakeQueued), so the holder's own assertion is not replaced. Normal holds and the
// host gate are unchanged: a normal job never shares, and no short job joins a normal hold.
import { mkdirSync, rmdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { sharedStateDir, REPO } from './paths.mjs';
import { THRESHOLDS, sample, quiet } from './host.mjs';
import { keepAwake, stopAwake, keepAwakeQueued } from './awake.mjs';

export const RESOURCES = {
  'chrome-measure': 'Mac CPU during a throttled Chrome measurement (tools/verify.mjs, tools/fix.mjs ab)',
  iphone: 'the shared iPhone 15 Pro Max (ios_webkit_debug_proxy :9221/:9222, one page at a time)',
};

export const lockDir = () => join(sharedStateDir(), 'locks');
const holderFile = (r) => join(lockDir(), `${r}.json`);
const queueFile = (r) => join(lockDir(), `${r}.queue.json`);
const guardDir = (r) => join(lockDir(), `${r}.guard`);
const lastGrantFile = (r) => join(lockDir(), `${r}.last-grant.json`);
const coholdFile = (r) => join(lockDir(), `${r}.cohold.json`);
/** Resources where a second short job may share a short hold (ts-lock-bundle (f)): at most this many holders at once. */
export const SHARED_SHORT = Object.freeze({ 'chrome-measure': 2 });
export const SHORT_MAX_SEC = 300;
const SHORT_QUEUE_TTL_SEC = 60;
// a run of back-to-back short jobs ends within this (I-011: 300 s; I-020: 900 s, so a hand-over drains all
// queued short jobs, e.g. 180 + 240 + 300 s, now that normal holds are <= ~10 min)
export const SHORT_DRAIN_SEC = 900;
/** Resources whose normal waiters pass the host admission gate (I-016). */
export const GATED = Object.freeze({ 'chrome-measure': true });
export const hostAlertsFile = () => join(lockDir(), 'host-alerts.log');
/** One JSON line per chrome-measure `lock.mjs run` hold: display / wake / assertion at its start and end (T8+, I-033). */
export const holdsLogFile = () => join(lockDir(), 'holds.log');
const GATE_FRESH_MS = 60000; // a waiter's gate record counts as "waiting for quiet" while refreshed within this
// Incident I-020 (research/architecture/tools-speed.md #1): a normal *lease* on chrome-measure holds the
// Mac between an agent's turns (one sat idle 4 min of a 40-min lease). Measure in one process hold
// (`lock.mjs run chrome-measure -- sh -c '…'`); a lease gets a default TTL and can't outlive
// acquiredAt + maxHoldSec (--ttl above it is refused; renew / re-entry are clamped). Process holds and
// short leases are unchanged; the iphone lease keeps its CLI default (900 s).
export const LEASE_POLICY = { 'chrome-measure': { defaultTtlSec: 600, maxHoldSec: 1200 } };
// Incident I-020 (#4): fast hand-over. The waiter served next polls every NEXT_POLL_MS (others keep
// their backoff), and at a hand-over a waiter whose lastSeen is older than HANDOVER_FRESH_SEC (it is not
// polling: a CLI `acquire` retried every few minutes) is skipped; it keeps its place for the next one.
// HANDOVER_FRESH_SEC must exceed the slowest poll of a waiting loop (acquire(): 15.5 s; `acquire --wait`: 15 s).
export const NEXT_POLL_MS = 1000;
export const HANDOVER_FRESH_SEC = 30;
// the iphone protocol (CLAUDE.md) has waiters retry every 2-5 min, so there a stale lastSeen means nothing: strict FIFO
const SLOW_POLL_RESOURCES = new Set(['iphone']);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const capMs = (r, h) => (LEASE_POLICY[r] && h.kind === 'lease' && !h.short ? Date.parse(h.acquiredAt) + LEASE_POLICY[r].maxHoldSec * 1000 : Infinity);

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
  const next = q.length ? q[nextIndex(q, effectiveLastGrant(readJson(lastGrantFile(r), {}), h), Date.now(), undefined, r)].owner : null;
  const c = SHARED_SHORT[r] ? readJson(coholdFile(r), null) : null;
  return { resource: r, holder: h, stale: h ? staleReason(h) : null, queue: q, next, ...(c && !staleReason(c) ? { cohold: c } : {}) };
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
  if (h && h.token && h.token !== lg.token) return { owner: h.owner, short: !!h.short, maxSec: h.maxSec, at: h.acquiredAt, token: h.token, ...(h.runStart ? { runStart: h.runStart } : {}) };
  return lg;
}
function lastGrantShort(lg, now = Date.now()) {
  return !!lg.short && now - Date.parse(lg.at) < ((lg.maxSec || SHORT_MAX_SEC) + 5 + 30) * 1000;
}

/** When the current run of back-to-back short grants started (ms), or null after a normal grant. */
function shortRunStart(lg, now = Date.now()) {
  return lastGrantShort(lg, now) ? Date.parse(lg.runStart || lg.at) : null;
}

/**
 * Index (in q) of the waiter served at the next hand-over: FIFO, except the short lane (see header), among
 * the waiters seen within HANDOVER_FRESH_SEC (`caller`, the one polling now, counts as seen); if none was,
 * among all. Not for SLOW_POLL_RESOURCES, whose waiters retry every few minutes by protocol.
 * `T`: the polling process's THRESHOLDS (gateShortPassSec, gateMaxWaitSec).
 */
function nextIndex(q, lg, now = Date.now(), caller, r, T = THRESHOLDS) {
  let pool = q.map((w, i) => [w, i]);
  if (!SLOW_POLL_RESOURCES.has(r)) {
    const fresh = pool.filter(([w]) => w.owner === caller || now - Date.parse(w.lastSeen) <= HANDOVER_FRESH_SEC * 1000);
    if (fresh.length) pool = fresh;
  }
  const s = pool.find(([w]) => w.short), n = pool.find(([w]) => !w.short);
  if (!s || !n) return pool[0][1];
  if (n[0].movedBy && n[1] < s[1]) return n[1]; // the lead moved this normal waiter ahead of these short jobs (I-019): its priority wins (I-020)
  if (gatePassDone(n[0], now, T)) return n[1]; // its host gate has waited out the short jobs' pass window (I-030)
  const start = shortRunStart(lg, now) ?? now;
  return now - start + (s[0].maxSec || SHORT_MAX_SEC) * 1000 <= SHORT_DRAIN_SEC * 1000 ? s[1] : n[1];
}

/** The short jobs' pass window at a normal waiter's host gate (I-030): gateShortPassSec, at most the cap. */
const passWindowMs = (T) => Math.min(T.gateShortPassSec ?? T.gateMaxWaitSec, T.gateMaxWaitSec) * 1000;

/**
 * A normal waiter whose host-gate wait began at least the pass window ago (I-030): no short job passes it any
 * more, neither through the short-lane drain (nextIndex) nor through the gate exemption (gateHolding), so the
 * host can settle and it is granted on a quiet host, not by a contaminated gate timeout. Freshness is the
 * hand-over pool's (lastSeen), not gate.at: a waiter refreshes gate.at only while the lock is free, so behind
 * a 300 s short its gate record looks stale exactly when this rule has to hold.
 */
function gatePassDone(w, now, T = THRESHOLDS) {
  return !!(w && !w.short && w.gate && now - Date.parse(w.gate.since) >= passWindowMs(T));
}

/**
 * The head normal waiter is held back by the host gate right now and short jobs may pass it. Never when the
 * lead moved it (I-019 movedBy): the move wins, at the gate too (I-030). Otherwise only during the first
 * gateShortPassSec of its gate wait (I-030: each short job keeps the host busy, so back-to-back shorts kept
 * the gate closed and starved the waiter into a contaminated gate timeout); past it the host can settle.
 * The window is at most the cap (review-gate R1: once due, it is granted next).
 */
function gateHolding(w, now, T = THRESHOLDS) {
  if (!w || w.short || w.movedBy || !w.gate || w.gate.quiet === true || now - Date.parse(w.gate.at) >= GATE_FRESH_MS) return false;
  return !gatePassDone(w, now, T);
}

/**
 * One acquisition attempt. Returns {ok:true, holder} or {ok:false, holder, position, queue, next, gated}.
 * opts: {owner, kind:'process'|'lease', ttlSec, pid, meta, queueTtlSec, short, maxSec, held, host, thresholds, noTiming}
 * `held`: an FW_LOCK_HELD string; a token matching the live holder re-enters it ({reentrant, inherited}).
 * `noTiming`: a normal job that measures nothing (a build, CPU work; `lock.mjs run --no-timing`): passes the host gate,
 * and its holder carries `noTiming: true`. A timing acquirer (normal, not noTiming) never re-enters such a hold: throws.
 * `host`: for a GATED resource, the caller's latest host reading {quiet: true|false|null, reasons, sample}
 * (null quiet = not measured yet). Omitted: no gate (library callers that don't sample). A normal waiter
 * whose turn it is gets {ok:false, gated:true, gate} until host.quiet, or until the gate times out.
 */
export async function tryAcquire(r, opts) {
  checkName(r);
  const { owner, kind = 'lease', pid = process.pid, meta = {}, short = false, maxSec, held, host, thresholds: T = THRESHOLDS, noTiming = false, checkout = REPO } = opts;
  let { ttlSec, queueTtlSec = 600 } = opts;
  if (!owner) throw new Error('owner is required (e.g. the fix topic)');
  if (noTiming && short) throw new Error('--no-timing is for normal holds (builds, CPU work); a short job passes the host gate already');
  if (short) {
    if (!(maxSec > 0 && maxSec <= SHORT_MAX_SEC)) throw new Error(`a short job needs --max-seconds between 1 and ${SHORT_MAX_SEC} (got ${maxSec})`);
    ttlSec = kind === 'process' ? maxSec + 5 : maxSec; // + the grace `lock.mjs run` gives the command after SIGTERM
    queueTtlSec = Math.min(queueTtlSec, SHORT_QUEUE_TTL_SEC);
  }
  const pol = !short && kind === 'lease' && LEASE_POLICY[r];
  if (pol) {
    if (ttlSec > pol.maxHoldSec) throw new Error(`a ${r} lease is capped at ${pol.maxHoldSec} s (asked --ttl ${ttlSec}); measure inside one process hold instead: node tools/lock.mjs run ${r} --owner <topic> -- sh -c '<ab && probe>' (I-020)`);
    ttlSec ||= pol.defaultTtlSec;
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
    // the co-hold slot (shared short holds, ts-lock-bundle (f)): a stale co-holder is cleared like a stale holder, and a
    // live one takes the holder's place once the holder is gone, so a normal grant (no holder) also waits for it
    let c = SHARED_SHORT[r] ? readJson(coholdFile(r), null) : null;
    const creason = c && staleReason(c, now);
    if (c && creason) {
      writeJson(join(lockDir(), `${r}.last-stale.json`), { ...c, staleBecause: creason, clearedAt: new Date(now).toISOString(), clearedBy: owner });
      try { unlinkSync(coholdFile(r)); } catch {}
      c = null;
    }
    if (c && !h) { h = promote(r, c); c = null; }
    const cInherit = c && c.token && parseHeld(held)[r] === c.token, cSame = c && c.owner === owner && (c.kind === 'lease' || c.pid === pid);
    if (cInherit) return { ok: true, holder: c, reentrant: true, inherited: true };
    if (cSame) return { ok: true, holder: c, reentrant: true };
    const inherit = h && h.token && parseHeld(held)[r] === h.token, same = h && h.owner === owner && (h.kind === 'lease' || h.pid === pid);
    // a no-timing hold was granted without the host gate (the host may be loud, e.g. the user at the Mac, or the
    // hold's own build): a timing run (verify.mjs, fix.mjs ab, bench, a normal `lock.mjs run`) never runs inside it
    if ((inherit || same) && h.noTiming && GATED[r] && !short && !noTiming) throw new Error(noTimingRefusal(r, h));
    if (inherit) {
      // a descendant of the holder (FW_LOCK_HELD from `lock.mjs run`): runs under the ancestor's hold
      return { ok: true, holder: h, reentrant: true, inherited: true };
    }
    if (same) {
      // re-entrant for the same owner: refresh the TTL
      if (ttlSec && !h.short) h.expiresAt = new Date(Math.min(now + ttlSec * 1000, capMs(r, h))).toISOString();
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true };
    }
    const mine = q.findIndex((w) => w.owner === owner);
    const lg = readJson(lastGrantFile(r), {});
    const seen = effectiveLastGrant(lg, h);
    if (seen !== lg) writeJson(lastGrantFile(r), seen); // record a grant made by old code (I-011)
    const ni = q.length ? nextIndex(q, seen, now, owner, r, T) : -1;
    // a shared short hold (ts-lock-bundle (f)): the holder is short, the slot is free, no normal job waits, this short
    // job is the one served next, and it comes from another checkout
    if (h && short && (SHARED_SHORT[r] || 1) >= 2 && !c && h.short && h.checkout !== checkout && !q.some((w) => !w.short) && (q.length === 0 || mine === ni)) {
      c = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout, host: os.hostname(), acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlSec * 1000).toISOString(), meta,
        short: true, maxSec, cohold: true, sharedWith: h.owner, runStart: new Date(shortRunStart(seen, now) ?? now).toISOString(),
      };
      writeJson(coholdFile(r), c);
      if (mine >= 0) { q.splice(mine, 1); writeJson(queueFile(r), q); }
      return { ok: true, holder: c, cohold: true };
    }
    // short jobs are exempt from the host gate: the first short waiter may pass a head normal waiter held by it
    // (not one the lead moved, and only early in its gate wait: gateHolding, I-030)
    const headOk = q.length === 0 || mine === ni || (short && GATED[r] && gateHolding(q[ni], now, T) && mine === q.findIndex((w) => w.short));
    let gateRec;
    if (!h && headOk && GATED[r] && !short && !noTiming && host !== undefined) {
      const since = (mine >= 0 && q[mine].gate?.since) || new Date(now).toISOString();
      const waitedSec = Math.round((now - Date.parse(since)) / 1000);
      const x = host?.sample || {};
      // I-033: the host sleep over this gate wait, summed in the queue entry's gate record (keyed by `since`, so it
      // survives short jobs passing in between); each call carries at most one new window (host.sample)
      const prev = mine >= 0 && q[mine].gate?.since === since ? q[mine].gate : null;
      const sl = prev?.sleptSec != null || x.sleptSec != null ? { sleptSec: Math.round(((prev?.sleptSec || 0) + (x.sleptSec || 0)) * 10) / 10, woke: !!(prev?.woke || x.woke) } : {};
      const g = { since, at: new Date(now).toISOString(), quiet: host?.quiet ?? null, reasons: host?.reasons || [], load1: x.load1 ?? null, busyPct: x.busyPct ?? null, sysPct: x.sysPct ?? null, pressure: x.pressureMax ?? x.pressure ?? null, ...sl, ...(x.stub ? { stub: x.stub } : {}) };
      // the cap counts awake time: a sleep is not a busy host (review-host-state B1: a 472 s Maintenance Sleep pushed
      // the wall clock past the cap, and the very next window granted by timeout, contaminating every run of the hold);
      // and a window the host slept through never times out: one fresh window after the wake decides (as waitQuiet, I-023)
      const capped = !x.suspended && now - Date.parse(since) - (sl.sleptSec || 0) * 1000 >= T.gateMaxWaitSec * 1000;
      if (host?.quiet === true) gateRec = { quiet: true, waitedSec, reasons: [], load1: g.load1, busyPct: g.busyPct, sysPct: g.sysPct, pressure: g.pressure, ...sl, ...(x.stub ? { stub: x.stub } : {}) };
      else if (capped) gateRec = { quiet: false, timeout: true, waitedSec, reasons: g.reasons, load1: g.load1, busyPct: g.busyPct, sysPct: g.sysPct, pressure: g.pressure, ...sl, ...(x.stub ? { stub: x.stub } : {}) };
      else {
        // not quiet (or not measured yet): keep the head place, record why for `status`
        const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, gate: g };
        if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019) survives the gate (review-gate R2)
        if (mine >= 0) q[mine] = entry; else q.push(entry);
        writeJson(queueFile(r), q);
        return { ok: false, gated: true, gate: g, holder: null, position: q.findIndex((w) => w.owner === owner) + 1, queue: q, next: owner };
      }
    }
    if (!h && headOk) {
      h = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout, host: os.hostname(), acquiredAt: new Date(now).toISOString(),
        expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : undefined, meta,
        ...(short ? { short: true, maxSec } : {}),
        ...(noTiming ? { noTiming: true } : {}),
        ...(gateRec ? { gate: gateRec, ...(gateRec.timeout ? { gateTimeout: true } : {}) } : {}),
      };
      if (gateRec?.timeout) { try { appendFileSync(hostAlertsFile(), JSON.stringify({ at: h.acquiredAt, resource: r, owner, event: 'gate-timeout', ...gateRec }) + '\n'); } catch {} }
      writeJson(holderFile(r), h);
      const runStart = short ? new Date(shortRunStart(seen, now) ?? now).toISOString() : undefined;
      writeJson(lastGrantFile(r), { owner, short, maxSec, at: h.acquiredAt, token: h.token, runStart });
      if (mine >= 0) q.splice(mine, 1);
      writeJson(queueFile(r), q);
      return { ok: true, holder: h };
    }
    // busy (or someone else is served first): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, ...(short ? { short: true, maxSec } : {}), ...(noTiming ? { noTiming: true } : {}),
      // a gate wait survives a short job granted in between, so short jobs can't stretch the gate's cap
      ...(mine >= 0 && q[mine].gate ? { gate: q[mine].gate } : {}) };
    if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019, lock-repair.mjs)
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.findIndex((w) => w.owner === owner) + 1, queue: q, next: q[nextIndex(q, seen, now, owner, r, T)].owner };
  });
}

/** Why a timing acquirer may not run inside the no-timing hold `h` (ts-lock-bundle). */
export function noTimingRefusal(r, h) {
  return `${r} is held by "${h.owner}" as a no-timing hold (lock.mjs run --no-timing: builds and CPU work, granted without the host gate, so the host may be loud): a timing run (verify.mjs, fix.mjs ab, bench, a normal lock.mjs run) never runs inside it. Run it in its own hold after this one.`;
}

/**
 * The host reading for a gated waiter whose turn it is: one quiet() window (default 10 s) through
 * tools/lib/host.mjs, so the host is judged while the lock is free (the window restarts at every try).
 */
export async function gateSample({ thresholds: T = THRESHOLDS, samplers } = {}) {
  const x = await sample({ windowSec: T.quietMinWindowSec, samplers });
  const q = quiet(x, T);
  // I-033: a window the host slept through is not quiet (its ticks cover only the awake part, and the host is
  // rarely settled right after a wake), as in waitQuiet (I-023): the next window decides
  if (x.suspended) return { quiet: false, reasons: [...q.reasons, `host slept ${x.sleptSec ?? '?'} s in this window`], sample: x };
  return { ...q, sample: x };
}

/** Leave the queue without acquiring (e.g. an agent gives up waiting). */
export async function dequeue(r, owner) {
  checkName(r);
  return withGuard(r, () => { const q = readJson(queueFile(r), []).filter((w) => w.owner !== owner); writeJson(queueFile(r), q); return q; });
}

/**
 * The co-holder `c` becomes the holder (the holder ended). The holder file is written (atomically) before the slot
 * is removed, so a reader never sees neither; the record keeps its token, owner and expiry, `cohold` becomes
 * `promotedAt`.
 */
function promote(r, c) {
  const { cohold, sharedWith, ...rest } = c;
  const p = { ...rest, sharedWith, promotedAt: new Date().toISOString() };
  writeJson(holderFile(r), p);
  try { unlinkSync(coholdFile(r)); } catch {}
  return p;
}

/**
 * Release. Only the owner may release unless force. Returns the removed holder or null. A co-holder (shared short
 * hold) releases its slot; when the holder releases, a live co-holder takes its place (ts-lock-bundle (f)).
 */
export async function release(r, { owner, force = false } = {}) {
  checkName(r);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    const c = SHARED_SHORT[r] ? readJson(coholdFile(r), null) : null;
    if (c && c.owner === owner && !(h && h.owner === owner)) { unlinkSync(coholdFile(r)); return c; }
    if (!h) return null;
    if (!force && h.owner !== owner) throw new Error(`${r} is held by "${h.owner}"${c ? ` and "${c.owner}" (shared short hold)` : ''}, not "${owner}" (use --force only if that holder is really gone)`);
    if (c && !staleReason(c)) promote(r, c);
    else { unlinkSync(holderFile(r)); if (c) { try { unlinkSync(coholdFile(r)); } catch {} } }
    return h;
  });
}

/**
 * Synchronous best-effort release of the hold with `token` (an 'exit' handler can't wait for the guard): the holder
 * file is removed, or replaced by a live co-holder (one rename), or the co-hold slot is removed. A race with an
 * acquirer is settled by the next tryAcquire, which promotes or clears under the guard.
 */
function releaseToken(r, token) {
  try {
    const h = readJson(holderFile(r), null);
    if (h && h.token === token) {
      const c = SHARED_SHORT[r] ? readJson(coholdFile(r), null) : null;
      if (c && !staleReason(c)) promote(r, c); else unlinkSync(holderFile(r));
      return;
    }
    const c = SHARED_SHORT[r] ? readJson(coholdFile(r), null) : null;
    if (c && c.token === token) unlinkSync(coholdFile(r));
  } catch {}
}

/** Extend a lease. */
export async function renew(r, { owner, ttlSec }) {
  checkName(r);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || h.owner !== owner || staleReason(h)) throw new Error(`${r} is not held by "${owner}"${h ? ` (holder: ${h.owner}${staleReason(h) ? ', stale' : ''})` : ''}`);
    if (h.short) throw new Error(`${r} is held by "${owner}" as a short job (max ${h.maxSec} s); a short job cannot be renewed`);
    const want = Date.now() + ttlSec * 1000, cap = capMs(r, h);
    h.expiresAt = new Date(Math.min(want, cap)).toISOString();
    writeJson(holderFile(r), h);
    return want > cap ? { ...h, capped: true } : h;
  });
}

/**
 * Wait (FIFO) and acquire. Polls with backoff; logs who is holding every 30 s.
 * Process-kind locks are also released automatically on exit / SIGINT / SIGTERM.
 * A re-entrant acquire (the same owner's lease, or an ancestor's hold via `held`, default
 * $FW_LOCK_HELD) returns at once, and its release() is a no-op: the outer holder releases.
 * Returns {holder, release(), reentrant}.
 */
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, short = false, maxSec, held = process.env.FW_LOCK_HELD, timeoutSec = 3600, pollMs = 2000, maxPollMs = short ? 3000 : 15000, log = (s) => console.error(s), thresholds: T = THRESHOLDS, hostSamplers, noTiming = false, checkout } = {}) {
  const t0 = Date.now();
  let lastLog = 0, wait = pollMs;
  const gated = !!GATED[r] && !short && !noTiming;
  let host = gated ? { quiet: null, reasons: ['not measured yet'] } : undefined;
  // ts-lock-bundle (b): the gate's timeout counts awake time, like its cap (review-host-state B1): the host sleep the
  // gate windows saw is subtracted, and a window the host slept through never ends in a throw (one fresh window decides)
  let gateSleptMs = 0, sleptLast = false;
  for (;;) {
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta, short, maxSec, held, host, thresholds: T, noTiming, ...(checkout ? { checkout } : {}) });
    // queued behind someone, or the head waiter held at the host gate on a host measured not quiet (ts-lock-bundle (a);
    // not the first, unmeasured round every gated grant takes): no system sleep while anyone waits (I-026 reopened);
    // a gate wait is minutes of waiting too, and a sleep in it only stretches it (I-033)
    if (!res.ok && (!res.gated || host.quiet === false)) keepAwakeQueued(r);
    if (res.gated) {
      // our turn, but the host is not (known to be) quiet: measure one window, then try again at once
      if (host.quiet === false && Date.now() - lastLog > 30000) {
        log(`[lock ${r}] free, but the host is not quiet (${host.reasons.join(', ')}); waiting since ${res.gate.since}, granted anyway after ${T.gateMaxWaitSec} s`);
        lastLog = Date.now();
      }
      if (!sleptLast && Date.now() - t0 - gateSleptMs > timeoutSec * 1000) { await dequeue(r, owner); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s waiting for a quiet host${gateSleptMs ? ` (awake time; the host slept ${Math.round(gateSleptMs / 1000)} s more)` : ''}`); }
      host = await gateSample({ thresholds: T, samplers: hostSamplers }); // its sleep is summed by tryAcquire (I-033)
      sleptLast = !!host.sample?.suspended;
      if (sleptLast) gateSleptMs += (host.sample.sleptSec || 0) * 1000;
      continue;
    }
    if (gated) host = { quiet: null, reasons: ['not measured yet'] }; // the window restarts at the next hand-over
    if (res.ok && res.reentrant) return { holder: res.holder, release: () => {}, reentrant: true };
    if (res.ok) {
      if (Date.now() - t0 > 1500) log(`[lock ${r}] acquired after ${Math.round((Date.now() - t0) / 1000)} s`);
      let done = false;
      keepAwake(r, res.holder); // no system sleep while chrome-measure is held (I-026, lib/awake.mjs)
      const rel = () => {
        if (done) return; done = true;
        // synchronous best effort (also used from the 'exit' handler)
        releaseToken(r, res.holder.token);
        stopAwake(r, res.holder.token);
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
    // the waiter served next polls fast (I-020): a hand-over no longer waits out its backoff
    await sleep(res.next === owner ? Math.min(wait, NEXT_POLL_MS) + Math.random() * 100 : wait + Math.random() * 500);
    wait = Math.min(maxPollMs, Math.round(wait * 1.5));
  }
}

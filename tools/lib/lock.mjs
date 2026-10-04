// Named cross-worktree locks for shared physical resources.
//
//   chrome-measure  the Mac's CPU while Chrome runs a throttled measurement (verify.mjs takes it itself)
//   iphone          the one iPhone 15 Pro Max on ios_webkit_debug_proxy (a lease taken with tools/lock.mjs)
//
// State lives in the shared git dir, so every worktree of this repo sees the same locks:
//   <git-common-dir>/fastwork-mirror/locks/<resource>.json         current holder
//   <git-common-dir>/fastwork-mirror/locks/<resource>.queue.json   FIFO of waiters
//   <git-common-dir>/fastwork-mirror/locks/<resource>.guard/       short mutex around every read-modify-write
//   <git-common-dir>/fastwork-mirror/locks/<resource>.last-release.json   who left the holder file last, and when (I-105:
//     tools/idle.mjs reads how long a lock has stood free; written on release, a process hold's end, the last reader)
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
// (<resource>.last-grant.json records the last grant and when the short run started; a short hold that ends with
// nobody queued takes its record along, I-081), so shorts
// can't starve the queue: a waiting normal job is delayed by at most SHORT_DRAIN_SEC. A short holder expires at acquiredAt + maxSec
// (no --ttl, re-acquire or renew stretches it); `lock.mjs run --short` also kills its command then.
// A short process waiter (`lock.mjs run --short|--shared`) must keep polling: its queue entry is dropped after
// SHORT_QUEUE_TTL_SEC without a refresh, so a short job that stopped waiting never holds up the hand-over. A lease waiter
// (`lock.mjs acquire`, short or shared too) keeps its place for queueTtlSec like any lease (I-113); while it is not
// polling a hand-over skips it.
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
// no-timing runs may re-enter it. Phone runs (iphone.mjs run|scroll|record|gesture) refuse during someone else's no-timing
// hold like during any normal hold, but run inside their own (phoneRunRefusal, I-056): the phone stamps its own frames, so
// "nothing timed inside" means Mac timing; the hold is what keeps the Mac quiet while it records and drives the phone.
// Beside a shared group they run by default (Mac-quiet preferred, not required) and record the Mac state in the run
// record; --require-quiet (FW_PHONE_REQUIRE_QUIET=1) makes them wait for it (phoneGuard).
// A no-timing run nested inside a timing hold (FW_LOCK_HELD) throws too (a short hold may host it). Run only this
// checkout's tools inside a no-timing hold; an older checkout's verify/ab/bench would not refuse.
//
// Shared lane (ts-lock-share, research/architecture/lock-shared-lane.md): jobs that only confirm functionality (npm test,
// headless checks, DOM probes, bench mech, a Simulator mechanism session) hold chrome-measure as READERS, in parallel
// with each other but never beside an exclusive (timing) holder. The readers form ONE group that lives in <r>.json as
// a holder record old lock code reads as a live short lease ({owner: "(shared)", kind: "lease", short: true, shared:
// true, format: "rw1", readers: [...]}), so code from before the lane never sees the lock free while a reader runs
// (shelf B2). Invariant: the group's expiresAt >= every reader's hard deadline (a process reader: acquiredAt + maxSec
// + killGraceSec, `lock.mjs run` kills it at maxSec; a lease reader: acquiredAt + maxSec), so old code clears the group
// only when no reader can still run. A reader joins while the weights fit the switch file's cap (default
// SHARED_LANE.defaultCap 3, at most SHARED_LANE.cap 4), host CPU busy <= sharedJoinBusy() over the reader's own
// polls (default 75 %; the switch file's joinBusy; I-051), or before its first busy sample load1 <= sharedJoinLoad()
// (default 2x the cpu count; the switch file's joinLoad); neither for the opener, and no exclusive waiter is queued (writer preference), except the
// readers queued before the group opened, for batchJoinSec. The group opens at a hand-over like a short job (the short
// lane, its drain budget, I-030 and lead moves apply to reader entries); right after a group, the exclusive waiters go
// first, but never before a reader queued ahead of them, and a reader queued readerMaxWaitSec goes before any exclusive
// waiter (I-049: writer preference only closes joins; it does not reorder the queue), except one the lead moved ahead of
// it (I-097: a lead move wins over that age bound, and such a waiter closes joins for the opening batch too, so the
// running group only drains and the moved hold is served at its end). A reader's command gets FW_LOCK_SHARED=<r>:<reader token>, never FW_LOCK_HELD: a nested shared acquire re-enters
// that slot (if it is no heavier than the slot), an exclusive one is refused at once (B1); readers are keyed by token,
// not owner (B3); readers join in queue order (a heavier reader waiting for room holds the lighter ones behind it once it
// has waited readerBypassSec; before that a reader that fits joins past it, I-049). The
// lane is off unless the lead switched it on (<r>.shared.json); while off, a shared acquire is an exclusive short job with
// the same maxSec (its holder and queue entry carry `functional: true` and the weight), so callers never branch, and it
// behaves as a slot the same way (review-lock-share N2): its command gets FW_LOCK_SHARED=<r>:<holder token> (no
// FW_LOCK_HELD), so nothing timed starts inside it in either switch state. A shared acquire that re-enters an exclusive
// hold (FW_LOCK_HELD, or the same owner like any short job) also hands its command FW_LOCK_SHARED with that hold's
// token. sharedSlot() tells a timed tool (iphone.mjs, sim.mjs) that it runs inside such a slot. With no-timing holds: a
// shared acquire inside one re-enters it like a short job; a --no-timing acquire inside a slot is refused like any
// exclusive one; --shared --no-timing is refused.
import { mkdirSync, rmdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { sharedStateDir, REPO } from './paths.mjs';
import { THRESHOLDS, sample, quiet } from './host.mjs';
import { keepAwake, stopAwake, awakeHold } from './awake.mjs'; // I-070: measurement holds only (user C-024)
import { warmSummary, reapWarm, reapWarmSync, reapNote, settleSec, gateReapMs } from './sim-warm.mjs';
import { stepGrace } from './phone-step.mjs'; // I-123: an iphone lease does not run out under the user's step
import { timingDiskRefusal } from './disk.mjs'; // I-124: no new timing hold on a nearly full disk

export const RESOURCES = {
  'chrome-measure': 'Mac CPU during a throttled Chrome measurement (tools/verify.mjs, tools/fix.mjs ab)',
  iphone: 'the shared iPhone 15 Pro Max (ios_webkit_debug_proxy :9221/:9222, one page at a time)',
  simulator: 'the one iOS Simulator fw-sim (tools/sim.mjs session holds it: one session at a time; strict FIFO, not gated)',
};

export const lockDir = () => join(sharedStateDir(), 'locks');
const holderFile = (r) => join(lockDir(), `${r}.json`);
const queueFile = (r) => join(lockDir(), `${r}.queue.json`);
const guardDir = (r) => join(lockDir(), `${r}.guard`);
const lastGrantFile = (r) => join(lockDir(), `${r}.last-grant.json`);
const lastReleaseFile = (r) => join(lockDir(), `${r}.last-release.json`);
/**
 * I-105: record that holder `h` left the holder file of `r` at `now` ({owner, token, kind, acquiredAt, at, how}), so the
 * idle alarm knows since when the lock stands free (a lease release left no trace before). Best effort: a failed write
 * never fails the release. Old lock code does not write it; readers check it against the last grant.
 */
function noteRelease(r, h, how, now = Date.now()) {
  try { writeJson(lastReleaseFile(r), { owner: h?.owner ?? null, token: h?.token ?? null, kind: h?.kind ?? null, acquiredAt: h?.acquiredAt ?? null, at: iso(now), how }); } catch {}
}
/** The last release record of `r` (noteRelease), or null. */
export const lastRelease = (r) => (checkName(r), readJson(lastReleaseFile(r), null));
/** The last grant record of `r` ({owner, short, at, token, …}), or null. */
export const lastGrant = (r) => (checkName(r), readJson(lastGrantFile(r), null));
export const SHORT_MAX_SEC = 300;
const SHORT_QUEUE_TTL_SEC = 60;
// a run of back-to-back short jobs ends within this (I-011: 300 s; I-020: 900 s, so a hand-over drains all
// queued short jobs, e.g. 180 + 240 + 300 s, now that normal holds are <= ~10 min)
export const SHORT_DRAIN_SEC = 900;
/** Resources whose normal waiters pass the host admission gate (I-016). */
export const GATED = Object.freeze({ 'chrome-measure': true });
/** The shared lane's bounds and the per-job weights (ts-lock-share; the lead approved cap 4 and these weights). */
export const SHARED_LANE = Object.freeze({
  cap: 4, // weight units of all readers at once: the most the lead's switch may allow (--cap)
  defaultCap: 3, // the cap when the switch names none (the lead, 2026-10-02: 3 Chrome agents in parallel)
  joinLoadPerCpu: 2, // a joining reader needs load1 <= this x the cpu count, unless the switch names --join-load; only
  // before its first CPU busy sample (I-051)
  joinBusyPct: 75, // I-051: a joining reader needs host CPU busy <= this (% of all cores), unless the switch names --join-busy
  busyWindowMs: 1000, // I-051: a waiting reader's busy sample spans at least this much of its own polls
  maxSec: 300, // per reader (a job in jobMaxSec: that, I-114); `lock.mjs run` kills its command at maxSec (SIGKILL 3 s later)
  batchJoinSec: 30, // readers queued before the group opened may join this long despite a waiting writer
  expiryGraceSec: 10, // group expiresAt = the latest reader deadline + this
  killGraceSec: 5, // a process reader's deadline = acquiredAt + maxSec + this (the SIGTERM -> SIGKILL grace)
  readerMaxWaitSec: 600, // I-049: a reader queued this long goes before any exclusive waiter at the next hand-over
  readerBypassSec: 300, // I-049: a reader that fits may join past a non-fitting reader ahead until that one waited this long
  weights: Object.freeze({ check: 1, probe: 1, 'bench-mech': 1, 'test-chrome-fn': 1, 'npm-test': 2, simulator: 3 }),
  // I-114 (the lead's ruling): a job named here (by `--weight <name>`, the library's `job`) may take this --max-seconds
  // instead of maxSec; the commit hook's npm test takes ~250 s, too close to 300
  jobMaxSec: Object.freeze({ 'npm-test': 480 }),
});
/** I-114: the --max-seconds bound of a shared job: SHARED_LANE.jobMaxSec[job] for a named job, else maxSec. */
export const sharedMaxSec = (job) => (job && Object.hasOwn(SHARED_LANE.jobMaxSec, job) ? SHARED_LANE.jobMaxSec[job] : SHARED_LANE.maxSec);
export const SHARED_FORMAT = 'rw1';
export const GROUP_OWNER = '(shared)';
/**
 * A joining reader needs load1 <= this: the switch file's joinLoad (`--join-load N`), else joinLoadPerCpu x the cpu
 * count (FW_LOCK_SHARED_JOIN_LOAD overrides both, for tests). Only readers join a loaded host; timing stays exclusive.
 */
export const sharedJoinLoad = (r = 'chrome-measure') => Number(process.env.FW_LOCK_SHARED_JOIN_LOAD) || sharedSwitch(r).joinLoad || SHARED_LANE.joinLoadPerCpu * os.cpus().length;
/**
 * I-051: a joining reader needs host CPU busy <= this, measured over its own polls (cpuTimes deltas, at least
 * busyWindowMs): the switch file's joinBusy (`--join-busy P`), else joinBusyPct (FW_LOCK_SHARED_JOIN_BUSY overrides
 * both, for tests). load1 lags a Simulator boot by minutes (load1 132 at 33-42 % busy, 2026-10-02), so it applies only
 * until the reader has its first busy sample.
 */
/**
 * I-057: FW_LOCK_LOAD1, a test-only stand-in for the host load1 in a reader's join check, so CLI tests of the shared
 * lane do not depend on the real load of the machine running them. A positive number (or 0), else null (real
 * os.loadavg). An explicit `load1` option wins over it.
 */
export const envLoad1 = () => {
  const s = process.env.FW_LOCK_LOAD1;
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export const sharedJoinBusy = (r = 'chrome-measure') => Number(process.env.FW_LOCK_SHARED_JOIN_BUSY) || sharedSwitch(r).joinBusy || SHARED_LANE.joinBusyPct;
/** Cumulative cpu times of all cores, {idle, total} (ms): two of them give cpuBusyPct. */
export function cpuTimes() {
  return os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
}
/** Host CPU busy (% of all cores) between two cpuTimes() snapshots; null when no cpu time passed. */
export function cpuBusyPct(a, b) {
  const dt = b.total - a.total;
  return dt > 0 ? Math.round(1000 * (1 - (b.idle - a.idle) / dt)) / 10 : null;
}
const switchFile = (r) => join(lockDir(), `${r}.shared.json`);
export const isGroup = (h) => !!(h && h.shared === true);
const knownGroup = (h) => isGroup(h) && h.format === SHARED_FORMAT && Array.isArray(h.readers);
const iso = (t) => new Date(t).toISOString();
export const hostAlertsFile = () => join(lockDir(), 'host-alerts.log');
/** One JSON line per chrome-measure `lock.mjs run` hold: display / wake / assertion at its start and end (T8+, I-033). */
export const holdsLogFile = () => join(lockDir(), 'holds.log');
export const GATE_REAP_TRIES = 2; // review-i063 n1: failed warm-Simulator shutdowns at the host gate before its wait ends (WAIT)
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
// iphone waiters queue with `lock.mjs acquire iphone … --wait` (or re-run acquire within 10 min, CLAUDE.md), not by
// fast polling, so there a stale lastSeen means nothing: strict FIFO
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

/** FW_LOCK_SHARED value for a child of a shared reader of `r` with reader `token` (keeps other resources' entries). */
export function sharedEnv(r, token, prev = process.env.FW_LOCK_SHARED) {
  return heldEnv(r, token, prev);
}

/** The lead's switch for the shared lane of `r`: {enabled, cap, joinLoad?, joinBusy?}. Absent or unreadable = off. */
export function sharedSwitch(r) {
  const x = readJson(switchFile(r), null);
  const cap = Number.isInteger(x?.cap) && x.cap >= 1 && x.cap <= SHARED_LANE.cap ? x.cap : SHARED_LANE.defaultCap;
  return { enabled: x?.enabled === true, cap, ...(x?.joinLoad > 0 ? { joinLoad: x.joinLoad } : {}), ...(x?.joinBusy > 0 && x.joinBusy <= 100 ? { joinBusy: x.joinBusy } : {}) };
}

/** Turn the shared lane of `r` on or off (the lead only; audited in locks/audit.log). Readers already in a group stay. */
export async function setSharedSwitch(r, { on, by, reason, cap, joinLoad, joinBusy } = {}) {
  checkName(r);
  if (!GATED[r]) throw new Error(`the shared lane exists only on ${Object.keys(GATED).join(', ')} (not "${r}")`);
  if (by !== 'lead') throw new Error('only the lead switches the shared lane (--by lead)');
  if (!reason) throw new Error('switching the shared lane needs --reason "<why>" (it goes into the audit log)');
  if (cap !== undefined && !(Number.isInteger(cap) && cap >= 1 && cap <= SHARED_LANE.cap)) throw new Error(`--cap must be an integer 1..${SHARED_LANE.cap} (got ${cap})`);
  if (joinLoad !== undefined && !(Number.isFinite(joinLoad) && joinLoad > 0)) throw new Error(`--join-load must be a load1 value > 0 (got ${joinLoad})`);
  if (joinBusy !== undefined && !(Number.isFinite(joinBusy) && joinBusy > 0 && joinBusy <= 100)) throw new Error(`--join-busy must be a CPU busy % in (0, 100] (got ${joinBusy})`);
  return withGuard(r, () => {
    const before = readJson(switchFile(r), null);
    const after = { enabled: !!on, ...(cap !== undefined ? { cap } : {}), ...(joinLoad !== undefined ? { joinLoad } : {}), ...(joinBusy !== undefined ? { joinBusy } : {}), by, reason, at: iso(Date.now()) };
    writeJson(switchFile(r), after);
    appendFileSync(join(lockDir(), 'audit.log'), JSON.stringify({ ts: after.at, by, reason, resource: r, code: 'shared-switch', file: `${r}.shared.json`, fix: on ? 'on' : 'off', before, after }) + '\n');
    return sharedSwitch(r);
  });
}

/** A process reader's hard deadline (ms): `lock.mjs run` kills it at maxSec; a lease reader just expires. */
const readerDeadline = (kind, at, maxSec) => at + (maxSec + (kind === 'process' ? SHARED_LANE.killGraceSec : 0)) * 1000;
/** Readers that can still run at `now`. */
export const liveReaders = (g, now = Date.now()) => (g.readers || []).filter((x) => Date.parse(x.deadline) > now && (x.kind !== 'process' || pidAlive(x.pid)));
/**
 * `g` with `readers`, its expiresAt, maxSec and meta recomputed (expiresAt = the latest deadline + expiryGraceSec;
 * maxSec = the longest reader's, at least SHARED_LANE.maxSec: I-114 lets an npm-test reader take more).
 */
export function groupWith(g, readers) {
  const end = Math.max(...readers.map((x) => Date.parse(x.deadline)));
  const maxSec = Math.max(SHARED_LANE.maxSec, ...readers.map((x) => x.maxSec || 0));
  return { ...g, readers, expiresAt: iso(end + SHARED_LANE.expiryGraceSec * 1000), maxSec, meta: { ...g.meta, readers: readers.map((x) => `${x.owner} (w${x.weight})`).join(', ') } };
}
const readerList = (g) => (g.readers || []).map((x) => `"${x.owner}"`).join(', ') || 'none';

/** Why an exclusive acquirer may not start inside the shared reader slot `x` (B1). */
export function sharedRefusal(r, x) {
  return `${r}: this process runs inside the shared (functional) hold of "${x.owner}" (FW_LOCK_SHARED): an exclusive or timing job (verify.mjs, fix.mjs ab, bench gain, a normal or --short lock.mjs run) never runs inside it. Run it in its own hold after this one.`;
}

/** Why a shared job of `weight` may not re-enter the lighter slot `x` (review-lock-share N8: the cap counts slots). */
export function slotWeightRefusal(r, x, weight) {
  return `${r}: this shared job needs weight ${weight}, but the shared (functional) slot of "${x.owner}" it runs inside has weight ${x.weight}: give the outer job --weight ${weight} or more (it counts against the cap for everything inside it)`;
}

/**
 * The functional slot named by token `tok` in holder `h` (inside the guard, or on a snapshot): a live group reader, or
 * a non-group holder with that token (the switch-off stand-in, `functional: true`, weighs its own weight; any other
 * exclusive hold a --shared job re-entered is no limit: the cap). null if `tok` names nothing live there.
 */
export function slotIn(h, tok, now = Date.now()) {
  if (!tok || !h) return null;
  if (knownGroup(h)) return liveReaders(h, now).find((x) => x.token === tok) || null;
  if (isGroup(h) || h.token !== tok || staleReason(h, now)) return null;
  return { owner: h.owner, token: h.token, weight: h.functional ? h.weight || 1 : SHARED_LANE.cap, holder: true };
}

/**
 * The live shared (functional) slot this process runs inside: FW_LOCK_SHARED names a live reader of `r`, the switch-off
 * stand-in or an exclusive hold a --shared job re-entered ({owner, token, weight}); null outside one (also for a token of
 * a finished slot or another state dir). Timed tools refuse inside one (review-lock-share N5/N6).
 */
export function sharedSlot(r, sharedHeld = process.env.FW_LOCK_SHARED, now = Date.now()) {
  checkName(r);
  return slotIn(readJson(holderFile(r), null), parseHeld(sharedHeld)[r], now);
}

/** Why `what` (a timed run) refuses here: FW_LOCK_SHARED names a chrome-measure slot (live or not), or FW_SIM_FUNCTIONAL=1; else null. */
export function timedInSlotRefusal(what, env = process.env) {
  const tok = parseHeld(env.FW_LOCK_SHARED)['chrome-measure'];
  if (!tok && env.FW_SIM_FUNCTIONAL !== '1') return null;
  const x = tok ? sharedSlot('chrome-measure', env.FW_LOCK_SHARED) : null;
  return `refusing: ${what} is a timing run, and this process runs inside ${tok ? `a shared (functional) slot${x ? ` of "${x.owner}"` : ''} (FW_LOCK_SHARED)` : 'a functional Simulator session (FW_SIM_FUNCTIONAL)'}: nothing timed runs in a functional slot, whatever the shared lane's switch says (review-lock-share N5/N6). Run it in its own normal hold: node tools/lock.mjs run chrome-measure --owner <you> -- <cmd>`;
}

/** The hold that keeps the Mac quiet for a recorded / timed phone run (I-056; the lead's convention, 2026-10-02). */
export const phoneHoldCmd = (owner = '<you>') => `node tools/lock.mjs run chrome-measure --owner ${owner} --no-timing --max-seconds 600 -- sh -c '<phone part>'`;
/** I-056: FW_PHONE_REQUIRE_QUIET=1 makes every phone run wait for shared jobs, as --require-quiet does. */
export const phoneRequireQuiet = (env = process.env) => env.FW_PHONE_REQUIRE_QUIET === '1';
/**
 * The shared (functional) jobs holding chrome-measure in a status snapshot: [{owner, weight}] (empty: none). A group in a
 * format this code does not know counts as one job of unknown weight; the switch-off stand-in for a reader (`functional:
 * true`, an exclusive short hold) counts with `laneOff: true`.
 */
export function sharedJobs(st, now = Date.now()) {
  const h = st?.holder;
  if (!h || st.stale) return [];
  if (isGroup(h)) return knownGroup(h) ? liveReaders(h, now).map((x) => ({ owner: x.owner, weight: x.weight || 1 })) : [{ owner: `(shared group, format "${h.format}")`, weight: null }];
  if (h.functional) return [{ owner: h.owner, weight: h.weight || 1, laneOff: true }];
  return [];
}
const jobList = (jobs) => jobs.map((x) => `"${x.owner}"${x.weight ? ` w${x.weight}` : ''}`).join(', ');
/** The Mac's state beside a phone run, for its record (I-056): {at, shared: sharedJobs, load1} (load1: FW_LOCK_LOAD1, else os.loadavg). */
export function phoneMacState({ st = status('chrome-measure'), now = Date.now(), load1 } = {}) {
  const ld = load1 ?? envLoad1() ?? os.loadavg()[0];
  const sw = warmSummary(undefined, now); // I-063: a warm (booted, idle) Simulator on the Mac, only when there is one
  return { at: new Date(now).toISOString(), shared: sharedJobs(st, now), load1: Math.round(ld * 100) / 100, ...(sw ? { simWarm: sw } : {}) };
}
/** One note line when shared jobs run beside a phone run that does not wait for them, else null. */
export function phoneMacNote(state) {
  if (!state?.shared?.length) return null;
  return `NOTE: shared jobs hold chrome-measure beside this phone run (${jobList(state.shared)}; load1 ${state.load1}): Mac-quiet is preferred, not required, so it runs and its record keeps the Mac state (mac); --require-quiet or FW_PHONE_REQUIRE_QUIET=1 waits for them instead (I-056)`;
}
/**
 * I-056: why a phone run that records or times (iphone.mjs run|scroll|record|gesture on the phone) may not start now,
 * or null. The phone stamps its own frames; the Mac drives it (and records its screen for a finger test). Mac load does
 * not pace the S driver (iphone-runner: rho +0.11 over 16 runs), so Mac-quiet is preferred, not required (the lead's rule
 * since 2026-10-02 08:33Z; user T-017: a console step the user waits on never waits on a Mac-quiet gate). It refuses
 * (WAIT, the caller exits 1 and retries later) while chrome-measure is held by:
 *  - anyone else's normal hold (a goal A/B, a build, a --no-timing hold);
 *  - only with `requireQuiet` (--require-quiet, or FW_PHONE_REQUIRE_QUIET=1 in `env`): a shared group with a live
 *    reader (or one in a format this code does not know), or the switch-off stand-in for a reader (`functional: true`).
 *    Without it a shared job does not stop the run: phoneGuard prints phoneMacNote and the record keeps phoneMacState.
 * It passes on a free or stale lock, an exclusive short-lane job (npm test --short, bench mech: as before), and the
 * runner's own exclusive hold: the holder's token is in FW_LOCK_HELD (`lock.mjs run` exports it to its command) or the
 * holder is `owner` (the phone run's lease owner). That includes the runner's own --no-timing hold: timing that the phone
 * stamps is not Mac timing, so the no-timing rule (nothing timed inside) does not apply to it, and the hold keeps every
 * other job, shared ones included, off the Mac. `allow` (--allow-during-measure) passes anything: diagnostics only.
 * `st`: a status('chrome-measure') snapshot; `env`: where FW_LOCK_HELD and FW_PHONE_REQUIRE_QUIET come from.
 */
export function phoneRunRefusal({ owner, allow = false, requireQuiet = false, st = status('chrome-measure'), env = process.env, now = Date.now() } = {}) {
  const h = st?.holder;
  if (allow || !h || st.stale) return null;
  const how = `run it inside your own hold, which waits its turn and keeps everything else off the Mac: ${phoneHoldCmd(owner || '<you>')} (I-056); or pass --allow-during-measure for a diagnostic run`;
  if (isGroup(h) || h.functional) {
    const jobs = sharedJobs(st, now);
    if (!jobs.length || !(requireQuiet || phoneRequireQuiet(env))) return null;
    return `WAIT: chrome-measure is held by ${isGroup(h) ? 'the shared lane' : 'a shared (functional) job, the shared lane is off'} (${jobList(jobs)}), and this run asks for a quiet Mac (${requireQuiet ? '--require-quiet' : 'FW_PHONE_REQUIRE_QUIET=1'}). Retry after ${isGroup(h) ? 'the group ends' : 'it ends'}, drop the quiet request to run beside it (the record keeps the Mac state), or ${how}`;
  }
  if (h.short) return null;
  const inherited = !!h.token && parseHeld(env.FW_LOCK_HELD)['chrome-measure'] === h.token;
  if (inherited || (owner && h.owner === owner)) return null;
  return `WAIT: chrome-measure is held by "${h.owner}" (${h.noTiming ? 'a no-timing hold: a build or CPU work' : 'a normal hold, e.g. a goal A/B'}): no timed iPhone runs meanwhile. Retry after it ends, or ${how}`;
}
/**
 * The phone measure guard for one run (I-056): throws Error(phoneRunRefusal) when the run may not start, else returns
 * {requireQuiet, allow, start: phoneMacState} and logs phoneMacNote (when `note`). Pass the result to phoneMacRecord at
 * the end of the run: it becomes the record's `mac` field.
 */
export function phoneGuard({ owner, allow = false, requireQuiet = false, st = status('chrome-measure'), env = process.env, now = Date.now(), load1, note = true, log = console.log } = {}) {
  const why = phoneRunRefusal({ owner, allow, requireQuiet, st, env, now });
  if (why) throw new Error(why);
  const quiet = !!(requireQuiet || phoneRequireQuiet(env));
  // I-063: a warm Simulator (booted, idle, kept for the next sim session) is Mac load. A run that asks for a quiet Mac
  // shuts it down first (sim.mjs shutdown --warm-only: under the simulator lock, never a live session's device) and
  // WAITs if that fails; any other run goes with a NOTE and the warm state in its record (mac.start.simWarm)
  let reaped = null;
  if (quiet && !allow && warmSummary(undefined, now)) {
    reaped = reapWarmSync({ reason: 'a phone run asks for a quiet Mac', by: owner || 'phone run', env });
    if (reaped && !reaped.ok) throw new Error(`WAIT: a warm Simulator (fw-sim) is booted and this run asks for a quiet Mac, but its shutdown failed (${reaped.error || '?'}): node tools/sim.mjs shutdown, then retry (I-063)`);
    if (reaped?.shutDown) {
      // review-i063 N6: the shutdown itself is load; the run starts after a settle (FW_SIM_SETTLE_SEC, default 20 s)
      const sec = settleSec(env);
      if (sec > 0) { log(`waiting ${sec} s for the Mac to settle after the Simulator shutdown (I-063; FW_SIM_SETTLE_SEC)`); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sec * 1000); }
      reaped.settledSec = sec;
    }
  }
  const start = phoneMacState({ st, now: reaped?.settledSec ? Date.now() : now, load1 });
  if (reaped) start.simWarm = reaped;
  const lines = note ? [phoneMacNote(start), reaped ? reapNote(reaped, 'this phone run') : start.simWarm?.stale ? `NOTE: a stale warm Simulator record (written before the Mac restarted, so fw-sim is not booted) is in the record (mac.start.simWarm); node tools/sim.mjs shutdown clears it (I-063)` : start.simWarm ? `NOTE: a warm Simulator (fw-sim, ${start.simWarm.keeperAlive ? 'booted' : 'recorded as booted, keeper not running'} and idle until ${start.simWarm.idleUntil}) is on the Mac beside this phone run: Mac-quiet is preferred, not required, so it runs and its record keeps it (mac.start.simWarm); --require-quiet or FW_PHONE_REQUIRE_QUIET=1 shuts it down first (I-063)` : null] : [];
  for (const line of lines) if (line) log(line);
  return { requireQuiet: quiet, allow: !!allow, start };
}
/** A phone run record's `mac` field (I-056): {requireQuiet, allow, start, end}, `end` read now; null without a guard. */
export const phoneMacRecord = (g, end = phoneMacState()) => (g ? { requireQuiet: g.requireQuiet, allow: g.allow, start: g.start, end } : null);

function checkName(r) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(r)) throw new Error(`bad resource name "${r}"`);
}

export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readJson(f, d) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } }
function writeJson(f, v) { const t = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`; writeFileSync(t, JSON.stringify(v, null, 1)); renameSync(t, f); }

/**
 * Why a holder record is stale, or null if it is live. I-123: an iphone lease that ran out while its owner has a console
 * step on the phone (lib/phone-step.mjs stepGrace: begun, not answered/skipped/cancelled) stays live for up to
 * LEASE_STEP_GRACE_SEC (600 s) past its expiry, the hard bound, so the phone is not handed over in the middle of the
 * user's step; status() names the step (`grace`), and the first other acquirer that sees it logs it (step-grace.log).
 */
export function staleReason(h, now = Date.now()) {
  if (!h) return 'none';
  if (h.expiresAt && now > Date.parse(h.expiresAt) && !stepGrace(h, now)) return `expired at ${h.expiresAt}`;
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

/** withGuard for an 'exit' handler (synchronous): gives up after maxMs and returns undefined (the caller's state is pruned later). */
function withGuardSync(r, fn, maxMs = 2000) {
  mkdirSync(lockDir(), { recursive: true });
  const g = guardDir(r), t0 = Date.now(), cell = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try { mkdirSync(g); break; } catch (e) {
      if (e.code !== 'EEXIST') return undefined;
      try { if (Date.now() - statSync(g).mtimeMs > 10000) { rmdirSync(g); continue; } } catch {}
      if (Date.now() - t0 > maxMs) return undefined;
      Atomics.wait(cell, 0, 0, 5 + Math.random() * 20);
    }
  }
  try { return fn(); } finally { try { rmdirSync(g); } catch {} }
}

/**
 * Inside the guard, as group `g` leaves the holder file (its last reader left, pruned, cleared as stale, or --force,
 * I-080): its last-grant record (groupGrant: short, drain budget spent) exists only so that an exclusive waiter that
 * waited through the group goes before later short-lane entries at the hand-over. With no exclusive (non-short) waiter
 * queued it decides nothing (short-lane entries go FIFO with it or without it), and left behind on an idle lock it
 * outlived its window (doctor: last-grant-short-outlived), so it is removed; with such a waiter queued it stays until
 * that waiter's grant replaces it. Old lock code reads a missing record as new code does.
 */
export const queuedWriter = (q) => q.some((w) => !w.short);
function endGroupGrant(r, g, now = Date.now()) {
  const lg = readJson(lastGrantFile(r), null);
  if (!lg || !lg.shared || !g?.token || lg.token !== g.token) return;
  if (queuedWriter(pruneQueue(readJson(queueFile(r), []), now))) return;
  try { unlinkSync(lastGrantFile(r)); } catch {}
}

/**
 * Inside the guard, as the exclusive short holder `h` leaves the holder file (released, its process's handle or exit
 * handler, or release --force, I-081): its last-grant record (short, runStart) counts a short-lane drain across
 * back-to-back short grants, so it stays while anyone is queued (the next short grant continues the run; a normal waiter
 * goes first once the budget is spent; a short passing a gated head continues it too). With nobody queued no waiter was
 * delayed by this hold, and left on the idle lock the record outlived its window (doctor: last-grant-short-outlived), so
 * it is removed: a later short on the idle lock starts a new run. Only its own record (same token) is touched.
 */
function endShortGrant(r, h, now = Date.now()) {
  if (!h?.short || isGroup(h) || !h.token) return;
  const lg = readJson(lastGrantFile(r), null);
  if (!lg || !lg.short || lg.shared || lg.token !== h.token) return;
  if (pruneQueue(readJson(queueFile(r), []), now).length) return;
  try { unlinkSync(lastGrantFile(r)); } catch {}
}

/** Inside the guard: drop reader `token` from the group; the last one closes it. {closed, group, reader} or null. */
function removeReader(r, token, now = Date.now()) {
  const h = readJson(holderFile(r), null);
  if (!knownGroup(h)) return null;
  const reader = h.readers.find((x) => x.token === token);
  if (!reader) return null;
  const rest = h.readers.filter((x) => x.token !== token);
  if (!rest.length) { try { unlinkSync(holderFile(r)); } catch {} noteRelease(r, h, `last reader "${reader.owner}" left`, now); endGroupGrant(r, h, now); return { closed: true, group: h, reader }; }
  const g = groupWith(h, rest);
  writeJson(holderFile(r), g);
  return { closed: false, group: g, reader };
}

/** A reader leaves the shared group of `r` (the last one closes it and ends the group's awake assertion). */
export async function releaseReader(r, token, { now = Date.now() } = {}) {
  checkName(r);
  const out = await withGuard(r, () => removeReader(r, token, now));
  if (out?.closed) stopAwake(r, out.group.token);
  return out || { closed: false, group: null, reader: null };
}

/** Inside the guard: drop readers that can no longer run; no live reader left removes the group (last-stale). */
function pruneGroup(r, h, now, by) {
  const live = liveReaders(h, now);
  if (live.length === h.readers.length && live.length) return h;
  if (!live.length) {
    writeJson(join(lockDir(), `${r}.last-stale.json`), { ...h, staleBecause: `no live reader (${readerList(h)}: process gone or past its deadline)`, clearedAt: iso(now), clearedBy: by });
    try { unlinkSync(holderFile(r)); } catch {}
    endGroupGrant(r, h, now);
    stopAwake(r, h.token);
    return null;
  }
  const g = groupWith(h, live);
  writeJson(holderFile(r), g);
  return g;
}

/** Queue entry `w` is this shared waiter's: the same owner and process (a process waiter) or checkout (a lease). */
const sameWaiter = (w, owner, kind, pid) => w.owner === owner && (kind === 'process' ? w.kind === 'process' && w.pid === pid : w.kind !== 'process' && w.checkout === REPO);

/** The first short-lane entry seen within HANDOVER_FRESH_SEC (or the caller's): a lease waiter that is not polling keeps
 * its place but does not hold the polling short jobs back at a gate-held head (I-113). -1 when there is none. */
function firstShortSeen(q, now, caller) {
  return q.findIndex((w) => w.short && (w.owner === caller || now - Date.parse(w.lastSeen) <= HANDOVER_FRESH_SEC * 1000));
}

function pruneQueue(q, now = Date.now(), queueTtlSec = 600) {
  return q.filter((w) => now - Date.parse(w.lastSeen) < (w.queueTtlSec ?? queueTtlSec) * 1000 && (!w.pid || w.kind !== 'process' || pidAlive(w.pid)));
}

/**
 * Snapshot of one resource: {resource, holder, stale, queue, next, handover?} (next: the waiter served at the next
 * hand-over; handover: handoverInfo() while the lock is free and someone waits, I-051).
 */
export function status(r) {
  checkName(r);
  const h = readJson(holderFile(r), null);
  const q = pruneQueue(readJson(queueFile(r), []));
  const next = q.length ? q[nextIndex(q, effectiveLastGrant(readJson(lastGrantFile(r), {}), h), Date.now(), undefined, r)].owner : null;
  const now = Date.now(), grace = h ? stepGrace(h, now) : null; // I-123: a lease kept for its owner's user step
  const st = { resource: r, holder: h, stale: h ? staleReason(h, now) : null, queue: q, next, ...(grace ? { grace } : {}) };
  const ho = handoverInfo(st);
  return ho ? { ...st, handover: ho } : st;
}

// I-051: a stalled hand-over was invisible in status (2026-10-02 sample: the lock stood free with a gated waiter served
// next for 182 s in 30 min, e.g. 00:21:52-00:22:54Z). The waiter served next polls every NEXT_POLL_MS; one not seen for
// this long is not taking the lock.
export const HANDOVER_STALL_SEC = 5;
/**
 * While `st` (a status()) is free and someone waits: {to, gated: [reasons], gatedSince} when the waiter served next is
 * held at the host gate (its gate record refreshed within GATE_FRESH_MS), else {to, notSeenSec} when it has not polled
 * for HANDOVER_STALL_SEC, else {to, seenSec}. null while held or with nobody waiting.
 */
export function handoverInfo(st, now = Date.now()) {
  if (!st || st.holder || !st.next) return null;
  const to = st.next, w = (st.queue || []).find((x) => x.owner === to);
  if (!w) return { to };
  const g = w.gate;
  if (g && g.quiet !== true && now - Date.parse(g.at) <= GATE_FRESH_MS) return { to, gated: g.reasons?.length ? g.reasons : ['not measured yet'], gatedSince: g.since };
  const seen = Math.max(0, Math.round((now - Date.parse(w.lastSeen)) / 1000));
  if (!Number.isFinite(seen)) return { to };
  return seen > HANDOVER_STALL_SEC ? { to, notSeenSec: seen } : { to, seenSec: seen };
}
/** 'handing over to "X" (gated: <reasons> | not seen for N s | seen N s ago)', '' for null. */
export function handoverText(ho) {
  if (!ho) return '';
  const why = ho.gated ? `gated: ${ho.gated.join(', ')}` : ho.notSeenSec != null ? `not seen for ${ho.notSeenSec} s` : ho.seenSec != null ? `seen ${ho.seenSec} s ago` : '';
  return `handing over to "${ho.to}"${why ? ` (${why})` : ''}`;
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
  // (a shared group's last-grant record has its short-drain budget spent (groupGrant), so right after a group a normal
  // waiter goes first; the rule is data old lock code reads the same way, so old and new code agree on who is next,
  // except where I-049 below picks a reader: a reader runs new code, so it takes that turn itself)
  const s = pool.find(([w]) => w.short), n = pool.find(([w]) => !w.short);
  if (!s || !n) return pool[0][1];
  // the lead moved this normal waiter ahead of these short jobs (I-019): its priority wins (I-020), also over the I-049
  // age bound below (I-097: readers queued 10 min passed a moved phone hold at every hand-over while the phone cooled)
  if (n[0].movedBy && n[1] < s[1]) return n[1];
  // I-049 (shared readers starved): a reader that waited readerMaxWaitSec goes before any exclusive waiter not moved
  const rd = pool.find(([w]) => w.shared);
  if (rd && now - Date.parse(rd[0].since) >= SHARED_LANE.readerMaxWaitSec * 1000) return rd[1];
  // I-049: an exclusive waiter never passes a reader queued before it (not after a group, not by its gate): writer
  // preference only closes joins to a running group. The short-lane entries go in queue order (s is at or before rd).
  if (rd && rd[1] < n[1]) return s[1];
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
 * One acquisition attempt. Returns {ok:true, holder, mode} or {ok:false, holder, position, queue, next, gated, why}.
 * opts: {owner, kind:'process'|'lease', ttlSec, pid, meta, queueTtlSec, short, maxSec, held, host, thresholds, noTiming,
 *        shared, weight, sharedHeld, load1, ncpu, now}
 * `held`: an FW_LOCK_HELD string; a token matching the live holder re-enters it ({reentrant, inherited}).
 * `noTiming`: a normal job that measures nothing (a build, CPU work; `lock.mjs run --no-timing`): passes the host gate,
 * and its holder carries `noTiming: true`. A timing acquirer (normal, not noTiming) never re-enters such a hold: throws.
 * `awake` (I-070): whether the new hold is a measurement that keeps the Mac awake (holder `awake: true`, lib/awake.mjs);
 * default: a timing hold of chrome-measure (not short, shared or noTiming). `lock.mjs run --no-timing` passes true when
 * its command wraps a phone part or a Simulator session; shared and short holds never get it.
 * `host`: for a GATED resource, the caller's latest host reading {quiet: true|false|null, reasons, sample}
 * (null quiet = not measured yet). Omitted: no gate (library callers that don't sample). A normal waiter
 * whose turn it is gets {ok:false, gated:true, gate} until host.quiet, or until the gate times out.
 * `shared` (ts-lock-share): a reader of the shared lane (see header), with `weight` (1..cap) and `maxSec` (1..300; I-114:
 * 1..sharedMaxSec(job) when `job` names it, e.g. 'npm-test' 1..480, whose weight is then at least that job's);
 * `sharedHeld`: an FW_LOCK_SHARED string: a live reader token there re-enters that slot (shared acquirer) or refuses
 * at once (exclusive acquirer, B1). `load1` / `ncpu` / `now`: injected for tests (default: FW_LOCK_LOAD1, else os.loadavg, the cpu
 * count, Date.now). `mode`: 'exclusive' | 'short' | 'shared' | 'reentrant' | 'reentrant-exclusive' | 'reentrant-shared'.
 */
export async function tryAcquire(r, opts) {
  checkName(r);
  const { owner, kind = 'lease', pid = process.pid, meta = {}, maxSec, held, host, thresholds: T = THRESHOLDS, noTiming = false, shared = false, weight = 1, job, sharedHeld, load1, ncpu, busyPct, awake, simWarm } = opts;
  let { ttlSec, queueTtlSec = 600, short = false } = opts;
  if (!owner) throw new Error('owner is required (e.g. the fix topic)');
  if (noTiming && short) throw new Error('--no-timing is for normal holds (builds, CPU work); a short job passes the host gate already');
  if (noTiming && shared) throw new Error('--no-timing and --shared do not combine: a shared job is a bounded functional reader already; a build that needs the Mac alone is --no-timing');
  const jobMax = sharedMaxSec(job); // I-114: npm-test may take more than SHARED_LANE.maxSec
  if (shared) {
    if (!GATED[r]) throw new Error(`--shared exists only on ${Object.keys(GATED).join(', ')} (not "${r}")`);
    if (short) throw new Error('--shared and --short do not combine: a shared job is bounded already (--max-seconds)');
    if (job !== undefined && !Object.hasOwn(SHARED_LANE.weights, job)) throw new Error(`unknown shared job "${job}" (${Object.keys(SHARED_LANE.weights).join(', ')})`);
    if (job !== undefined && !(weight >= SHARED_LANE.weights[job])) throw new Error(`a shared ${job} job's --weight is at least ${SHARED_LANE.weights[job]} (got ${weight})`);
    if (!(maxSec > 0 && maxSec <= jobMax)) throw new Error(`a shared job${jobMax !== SHARED_LANE.maxSec ? ` (${job})` : ''} needs --max-seconds between 1 and ${jobMax} (got ${maxSec})`);
    if (!(Number.isInteger(weight) && weight >= 1 && weight <= SHARED_LANE.cap)) throw new Error(`a shared job's --weight must be an integer 1..${SHARED_LANE.cap} (got ${weight})`);
  }
  const sw = shared ? sharedSwitch(r) : null;
  const lane = shared && sw.enabled; // a reader; with the switch off a shared acquire is an exclusive short job
  if (shared && !lane) short = true;
  if (short) {
    // the switch-off stand-in of a shared job keeps that job's bound (I-114); a plain --short job keeps SHORT_MAX_SEC
    const shortMax = shared ? Math.max(SHORT_MAX_SEC, jobMax) : SHORT_MAX_SEC;
    if (!(maxSec > 0 && maxSec <= shortMax)) throw new Error(`a short job needs --max-seconds between 1 and ${shortMax} (got ${maxSec})`);
    ttlSec = kind === 'process' ? maxSec + 5 : maxSec; // + the grace `lock.mjs run` gives the command after SIGTERM
    if (kind === 'process') queueTtlSec = Math.min(queueTtlSec, SHORT_QUEUE_TTL_SEC);
  }
  // a process reader polls like a short job; a lease waiter (`lock.mjs acquire`, re-run after exit 3) keeps its place
  // for the normal queue TTL, short or shared (I-113): a hand-over skips it while it is not polling (I-020)
  if (lane && kind === 'process') queueTtlSec = Math.min(queueTtlSec, SHORT_QUEUE_TTL_SEC);
  const pol = !short && !lane && kind === 'lease' && LEASE_POLICY[r];
  if (pol) {
    if (ttlSec > pol.maxHoldSec) throw new Error(`a ${r} lease is capped at ${pol.maxHoldSec} s (asked --ttl ${ttlSec}); measure inside one process hold instead: node tools/lock.mjs run ${r} --owner <topic> -- sh -c '<ab && probe>' (I-020)`);
    ttlSec ||= pol.defaultTtlSec;
  }
  return withGuard(r, () => {
    const now = opts.now ?? Date.now();
    let h = readJson(holderFile(r), null);
    let q = pruneQueue(readJson(queueFile(r), []), now, queueTtlSec);
    const reason = h && staleReason(h, now);
    if (h && reason) {
      writeJson(join(lockDir(), `${r}.last-stale.json`), { ...h, staleBecause: reason, clearedAt: new Date(now).toISOString(), clearedBy: owner });
      try { unlinkSync(holderFile(r)); } catch {}
      if (isGroup(h)) endGroupGrant(r, h, now);
      h = null;
    }
    if (knownGroup(h)) h = pruneGroup(r, h, now, owner);
    if (h && h.owner !== owner) noteStepGrace(r, h, now, owner); // I-123: logged once per lease and step
    // B1: inside a live functional slot (FW_LOCK_SHARED: a reader, the switch-off stand-in, or an exclusive hold a
    // --shared job re-entered) no exclusive job starts, on any path, in either switch state (N2); a shared one re-enters
    // it if it is no heavier than the slot (N8)
    const slot = slotIn(h, parseHeld(sharedHeld)[r], now);
    if (slot && !shared) throw new Error(sharedRefusal(r, slot));
    if (slot && weight > slot.weight) throw new Error(slotWeightRefusal(r, slot, weight));
    if (slot) return { ok: true, holder: h, ...(slot.holder ? {} : { reader: slot }), slot, reentrant: true, mode: 'reentrant-shared' };
    // re-entrant for the same owner, a shared acquirer too (like a short job on main, review-lock-share N1), but never
    // into a group (an owner name is no proof the job belongs to that reader)
    const inherit = h && !isGroup(h) && h.token && parseHeld(held)[r] === h.token, same = h && !isGroup(h) && h.owner === owner && (h.kind === 'lease' || h.pid === pid);
    // a no-timing hold was granted without the host gate (the host may be loud, e.g. the user at the Mac, or the
    // hold's own build): a timing run (verify.mjs, fix.mjs ab, bench, a normal `lock.mjs run`) never runs inside it;
    // a short or shared (functional) job may (ts-lock-share: a shared acquire inside FW_LOCK_HELD re-enters the hold)
    if ((inherit || same) && h.noTiming && GATED[r] && !short && !shared && !noTiming) throw new Error(noTimingRefusal(r, h));
    // and the other way round (review N7): a --no-timing run (a build) never runs inside a timing hold, whose
    // measurements it would load; a short hold may host it (short jobs measure nothing either)
    if (inherit && noTiming && !h.noTiming && !h.short) throw new Error(noTimingNestedRefusal(r, h));
    if (inherit) {
      // a descendant of the holder (FW_LOCK_HELD from `lock.mjs run`): runs under the ancestor's hold
      return { ok: true, holder: h, reentrant: true, inherited: true, mode: shared ? 'reentrant-exclusive' : 'reentrant' };
    }
    if (same) {
      // re-entrant for the same owner: refresh the TTL (and a new job description, I-060); never shorten the live
      // lease (I-091: a longer lease the owner set on purpose went stale while it waited), within the cap
      if (ttlSec && !h.short) h.expiresAt = new Date(Math.min(Math.max(now + ttlSec * 1000, Date.parse(h.expiresAt) || 0), capMs(r, h))).toISOString();
      if (meta?.job) h.meta = { ...(h.meta || {}), job: meta.job };
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true, mode: shared ? 'reentrant-exclusive' : 'reentrant' };
    }
    const lg = readJson(lastGrantFile(r), {});
    const seen = effectiveLastGrant(lg, h);
    if (seen !== lg) writeJson(lastGrantFile(r), seen); // record a grant made by old code (I-011)
    if (lane) return readerAttempt(r, { h, q, seen, now, owner, kind, pid, meta, maxSec, weight, cap: sw.cap, queueTtlSec, load1, ncpu, busyPct, T });
    // I-124: no NEW timing hold of a gated resource on a nearly full disk (lib/disk.mjs, FW_TIMING_MIN_FREE_GB, default
    // 8 GB). Re-entered holds returned above; shared, short and --no-timing holds and phone runs (meta.phoneRun, a `run` whose
    // command is iphone.mjs scroll|record|run|gesture: the phone stamps its own frames) pass. The waiter leaves the queue (a
    // DISK-LOW error, checked at every attempt), so the next waiter is served instead of waiting behind it.
    if (GATED[r] && !short && !shared && !noTiming && !meta.phoneRun) {
      const low = timingDiskRefusal(lockDir());
      if (low) {
        const k = q.findIndex((w) => w.owner === owner && !w.shared);
        if (k >= 0) { q.splice(k, 1); writeJson(queueFile(r), q); }
        throw new Error(`[lock ${r}] ${low}`);
      }
    }
    let mine = q.findIndex((w) => w.owner === owner && !w.shared);
    // the switch went off while this shared job waited as a reader: its reader entry becomes this entry, in place (N10)
    if (shared && mine < 0) mine = q.findIndex((w) => w.shared && sameWaiter(w, owner, kind, pid));
    const ni = q.length ? nextIndex(q, seen, now, owner, r, T) : -1;
    // short jobs are exempt from the host gate: the first short waiter may pass a head normal waiter held by it
    // (not one the lead moved, and only early in its gate wait: gateHolding, I-030)
    const headOk = q.length === 0 || mine === ni || (short && GATED[r] && gateHolding(q[ni], now, T) && mine === firstShortSeen(q, now, owner));
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
        const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, gate: g };
        if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019) survives the gate (review-gate R2)
        if (mine >= 0) q[mine] = entry; else q.push(entry);
        writeJson(queueFile(r), q);
        return { ok: false, gated: true, gate: g, holder: null, position: q.indexOf(entry) + 1, queue: q, next: owner };
      }
    }
    if (!h && headOk) {
      h = {
        resource: r, owner, kind, pid: kind === 'process' ? pid : undefined, token: randomBytes(6).toString('hex'),
        checkout: REPO, host: os.hostname(), acquiredAt: new Date(now).toISOString(),
        expiresAt: ttlSec ? new Date(now + ttlSec * 1000).toISOString() : undefined, meta,
        ...(short ? { short: true, maxSec } : {}),
        ...(shared ? { functional: true, weight } : {}), // the switch-off stand-in for a reader: a slot like one (N2)
        ...(noTiming ? { noTiming: true } : {}),
        // I-070 (user C-024): a measurement hold keeps the Mac awake (lib/awake.mjs keepAwake): a timing hold by itself, a
        // --no-timing one only when the caller says it wraps a phone part or a Simulator session (`awake`)
        ...(awakeHold(r, { short, shared, noTiming, awake }) ? { awake: true } : {}),
        ...(gateRec ? { gate: { ...gateRec, ...(simWarm ? { simWarm } : {}) }, ...(gateRec.timeout ? { gateTimeout: true } : {}) } : {}), // review-i063: the gate's Simulator reap
      };
      if (gateRec?.timeout) { try { appendFileSync(hostAlertsFile(), JSON.stringify({ at: h.acquiredAt, resource: r, owner, event: 'gate-timeout', ...gateRec }) + '\n'); } catch {} }
      writeJson(holderFile(r), h);
      const runStart = short ? new Date(shortRunStart(seen, now) ?? now).toISOString() : undefined;
      writeJson(lastGrantFile(r), { owner, short, maxSec, at: h.acquiredAt, token: h.token, runStart });
      if (mine >= 0) q.splice(mine, 1);
      writeJson(queueFile(r), q);
      return { ok: true, holder: h, mode: short ? 'short' : 'exclusive' };
    }
    // busy (or someone else is served first): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, ...(short ? { short: true, maxSec } : {}), ...(shared ? { functional: true, weight } : {}), ...(noTiming ? { noTiming: true } : {}),
      // a gate wait survives a short job granted in between, so short jobs can't stretch the gate's cap
      ...(mine >= 0 && q[mine].gate ? { gate: q[mine].gate } : {}) };
    if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019, lock-repair.mjs)
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.indexOf(entry) + 1, queue: q, next: q[nextIndex(q, seen, now, owner, r, T)].owner, mode: short ? 'short' : 'exclusive' };
  });
}

export const stepGraceLogFile = () => join(lockDir(), 'step-grace.log');
/**
 * Inside the guard: when the live holder `h` is a lease kept past its expiry for its owner's user step (I-123), record
 * it once per step in the holder (`stepGrace`) and as one line in locks/step-grace.log (who saw it: the acquirer `by`).
 */
function noteStepGrace(r, h, now, by) {
  const g = stepGrace(h, now);
  if (!g || h.stepGrace?.step === g.step) return;
  h.stepGrace = { ...g, since: new Date(now).toISOString() };
  writeJson(holderFile(r), h);
  try { appendFileSync(stepGraceLogFile(), JSON.stringify({ at: h.stepGrace.since, resource: r, owner: h.owner, token: h.token, step: g.step, expiredAt: g.expiredAt, until: g.until, seenBy: by }) + '\n'); } catch {}
}

/** Why a --no-timing run may not run inside the timing hold `h` (ts-lock-bundle, review N7). */
export function noTimingNestedRefusal(r, h) {
  return `${r} is held by "${h.owner}" as a timing hold: a --no-timing run (a build, CPU work) never runs inside it, it would load the host under that hold's measurements. Run it in its own hold after this one: node tools/lock.mjs run ${r} --owner <you> --no-timing -- <build>`;
}

/** Why a timing acquirer may not run inside the no-timing hold `h` (ts-lock-bundle). */
export function noTimingRefusal(r, h) {
  return `${r} is held by "${h.owner}" as a no-timing hold (lock.mjs run --no-timing: builds and CPU work, granted without the host gate, so the host may be loud): a timing run (verify.mjs, fix.mjs ab, bench, a normal lock.mjs run) never runs inside it. Run it in its own hold after this one.`;
}

/**
 * The last-grant record of a shared group (written at its opening and at every join). Writer preference after a group
 * is expressed only in data that lock code from before the lane reads the same way (so old and new code always agree on
 * who is served next; a rule only new code knew made a reader and an old waiter each wait for the other): `short` with
 * `at` = the latest grant into the group keeps the record a live short grant until that reader's end + the hand-over
 * grace (lastGrantShort: the group's maxSec, the longest reader's (300, or 480 with an npm-test reader, I-114), + 35 s
 * after `at`, >= 30 s past any reader's maxSec + killGraceSec), and `runStart` one SHORT_DRAIN_SEC
 * back marks the short-drain budget spent, so at the hand-over after a group a normal waiter goes before every short-lane
 * entry (reader or exclusive short); with no normal waiter, the short-lane entries go FIFO. When the group ends with no
 * normal waiter queued, the record is removed (endGroupGrant, I-080); otherwise that waiter's grant replaces it.
 */
export function groupGrant(g, now) {
  return { owner: GROUP_OWNER, short: true, shared: true, maxSec: Math.max(SHARED_LANE.maxSec, g.maxSec || 0), at: iso(now), token: g.token, runStart: iso(now - SHORT_DRAIN_SEC * 1000) };
}

/**
 * Inside the guard, the shared lane on: join the live group, open one on a free lock at this reader's turn, or queue
 * (a short-lane entry with `shared: true`, keyed by owner + pid, or owner + checkout for a lease reader).
 */
function readerAttempt(r, { h, q, seen, now, owner, kind, pid, meta, maxSec, weight, cap, queueTtlSec, load1, ncpu, busyPct, T }) {
  // its reader entry, or the switch-off entry it queued with before the lead switched the lane on (N10): kept in place
  const isMine = (w) => (w.shared || w.functional) && sameWaiter(w, owner, kind, pid);
  const mine = q.findIndex(isMine);
  const fresh = (w) => now - Date.parse(w.lastSeen) <= HANDOVER_FRESH_SEC * 1000;
  const reader = () => ({ owner, token: randomBytes(6).toString('hex'), kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, acquiredAt: iso(now), deadline: iso(readerDeadline(kind, now, maxSec)), maxSec, weight, meta });
  const leaveQueue = () => { if (mine >= 0) { q.splice(mine, 1); writeJson(queueFile(r), q); } };
  const wait = (why) => {
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : iso(now), lastSeen: iso(now), queueTtlSec, short: true, maxSec, shared: true, weight };
    if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt });
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    writeJson(queueFile(r), q);
    return { ok: false, holder: h, position: q.indexOf(entry) + 1, queue: q, next: q[nextIndex(q, seen, now, owner, r, T)].owner, why, mode: 'shared' };
  };
  // the same agent's lease reader from this checkout (an `acquire --shared` repeated to check or keep it) is that slot
  const again = knownGroup(h) && kind !== 'process' ? h.readers.find((x) => x.kind !== 'process' && x.owner === owner && x.checkout === REPO) : null;
  if (again) return { ok: true, holder: h, reader: again, reentrant: true, mode: 'reentrant-shared' };
  if (h && !knownGroup(h)) return wait(isGroup(h) ? `held by a shared group in format "${h.format}", which this lock code does not know: it waits as for an exclusive holder` : `held by "${h.owner}" (exclusive)`);
  if (h) {
    const writer = q.find((w) => !w.shared);
    const inBatch = mine >= 0 && Date.parse(q[mine].since) <= Date.parse(h.openedAt) && now - Date.parse(h.openedAt) <= SHARED_LANE.batchJoinSec * 1000;
    // I-097: an exclusive waiter the lead moved ahead of this reader closes joins for the opening batch too: the group
    // only drains, and the moved hold is served at its end
    const moved = q.slice(0, mine >= 0 ? mine : q.length).find((w) => !w.shared && w.movedBy);
    if (moved) return wait(`joins closed: "${moved.owner}" waits for an exclusive hold, moved ahead by ${moved.movedBy} (I-097)`);
    if (writer && !inBatch) return wait(`joins closed: "${writer.owner}" waits for an exclusive hold (writer preference)`);
    // readers join in queue order (review-lock-share N4; a reader that stopped polling does not hold the others up).
    // I-049 head-of-line: a reader that fits may pass readers ahead that do not fit now, while each of them has waited
    // less than readerBypassSec; past that the group drains for them. A reader ahead that fits is never passed.
    const used = h.readers.reduce((a, x) => a + (x.weight || 1), 0);
    const ahead = q.slice(0, mine >= 0 ? mine : q.length).find((w) => w.shared && fresh(w)
      && (used + (w.weight || 1) <= cap || now - Date.parse(w.since) >= SHARED_LANE.readerBypassSec * 1000));
    if (ahead) return wait(`"${ahead.owner}" queued first (readers join in queue order)`);
    if (used + weight > cap) return wait(`the shared group is full (weight ${used}/${cap}; this job needs ${weight})`);
    // I-051: CPU busy over the reader's own polls decides; load1 (it lags a Simulator boot by minutes) only before the
    // reader's first busy sample
    if (Number.isFinite(busyPct)) {
      const lim = sharedJoinBusy(r);
      if (busyPct > lim) return wait(`CPU ${Math.round(busyPct)} % busy > ${lim} %: no new reader joins a busy host`);
    } else {
      const ld = load1 ?? envLoad1() ?? os.loadavg()[0], lim = ncpu ?? sharedJoinLoad(r);
      if (ld > lim) return wait(`load1 ${Math.round(ld * 10) / 10} > ${lim}: no new reader joins a loaded host`);
    }
    const x = reader();
    const g = groupWith(h, [...h.readers, x]);
    writeJson(holderFile(r), g);
    writeJson(lastGrantFile(r), groupGrant(g, now)); // the record stays "short" until this reader's end + the grace
    leaveQueue();
    return { ok: true, holder: g, reader: x, mode: 'shared' };
  }
  // free: reader entries are short-lane entries; right after a group a normal waiter goes first (groupGrant spends the
  // drain budget) unless a reader queued before it (I-049), and no reader passes a gated head writer then (the gate exemption is for short jobs between exclusive
  // holds only)
  const ni = q.length ? nextIndex(q, seen, now, owner, r, T) : -1;
  const afterGroup = !!seen.shared;
  // the opener is the waiter served next (readers in queue order, N4), or the first short-lane entry past a gate-held head
  const headOk = q.length === 0 || mine === ni || (!afterGroup && GATED[r] && gateHolding(q[ni], now, T) && mine === firstShortSeen(q, now, owner));
  if (!headOk) return wait(`"${q[ni].owner}" is served first`);
  const x = reader();
  const g = groupWith({ resource: r, owner: GROUP_OWNER, kind: 'lease', token: randomBytes(6).toString('hex'), checkout: REPO, host: os.hostname(), acquiredAt: iso(now), openedAt: iso(now), meta: {}, short: true, maxSec: SHARED_LANE.maxSec, shared: true, format: SHARED_FORMAT }, [x]);
  writeJson(holderFile(r), g);
  writeJson(lastGrantFile(r), groupGrant(g, now));
  leaveQueue();
  return { ok: true, holder: g, reader: x, mode: 'shared', opened: true };
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

/** Leave the queue without acquiring (e.g. an agent gives up waiting). `match` (optional): which of the owner's entries. */
export async function dequeue(r, owner, match) {
  checkName(r);
  return withGuard(r, () => { const q = readJson(queueFile(r), []).filter((w) => !(w.owner === owner && (!match || match(w)))); writeJson(queueFile(r), q); return q; });
}

/**
 * Release. Only the owner may release unless force. Returns the removed holder or null.
 * A shared group (ts-lock-share) is never released by an owner name: `shared` releases the owner's lease reader acquired
 * from this checkout (a process reader leaves when its process ends; it is keyed by token, B3), and returns that reader
 * with `sharedReader: true`; `force` without `shared` removes the whole group (the lead, when its readers are gone).
 */
export async function release(r, { owner, force = false, shared = false } = {}) {
  checkName(r);
  const out = await withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h) return null;
    if (isGroup(h)) {
      if (!shared) {
        if (!force) throw new Error(`${r} is held by the shared group (readers ${readerList(h)}), not by "${owner}": a lease reader leaves with release --shared (node tools/lock.mjs release ${r} --shared --owner <it>), a process reader when its process ends (--force removes the whole group: only if those readers are really gone)`);
        unlinkSync(holderFile(r));
        noteRelease(r, h, 'release --force (shared group)');
        endGroupGrant(r, h);
        return h;
      }
      const mine = (h.readers || []).filter((x) => x.owner === owner);
      if (!mine.length) throw new Error(`${r}: the shared group has no reader "${owner}" (readers ${readerList(h)})`);
      const leases = mine.filter((x) => x.kind !== 'process');
      if (!leases.length) throw new Error(`${r}: the shared reader "${owner}" is a process reader (pid ${mine.map((x) => x.pid).join(', ')}): it leaves when its process ends`);
      const x = leases.find((y) => y.checkout === REPO) || (force ? leases[0] : null);
      if (!x) throw new Error(`${r}: the shared reader "${owner}" was acquired from ${leases.map((y) => y.checkout).join(', ')}, not from this checkout (${REPO}): release it there (--force only if that agent is really gone)`);
      const res = removeReader(r, x.token);
      return { ...x, sharedReader: true, closed: !!res?.closed, groupToken: h.token };
    }
    if (!force && h.owner !== owner) throw new Error(`${r} is held by "${h.owner}", not "${owner}" (use --force only if that holder is really gone)`);
    unlinkSync(holderFile(r));
    noteRelease(r, h, force && h.owner !== owner ? 'release --force' : 'release');
    endShortGrant(r, h);
    return h;
  });
  if (out?.sharedReader && out.closed) stopAwake(r, out.groupToken);
  return out;
}

/**
 * I-060: the holder describes what its hold is for (lib/hold-job.mjs; shown on the progress page). `job`: a parsed job
 * ({text, for?, at, etaAt?}) sets it, null clears it, undefined leaves it. `run`: a phone run's marker ({text, since,
 * pid}) sets it; null clears it only if `runPid` (default this process) set it; either stamps the holder's lastRunAt (I-111). Only the live holder (or, in a shared
 * group, the owner's own reader records) may describe it. Returns the updated holder, or {shared, readers} for a group.
 */
export async function describeHold(r, { owner, job, run, runPid = process.pid, now = Date.now() } = {}) {
  checkName(r);
  const apply = (m) => {
    const meta = { ...(m || {}) };
    if (job === null) delete meta.job; else if (job) meta.job = job;
    if (run === null) { if (!meta.run || meta.run.pid === runPid) delete meta.run; } else if (run) meta.run = run;
    return meta;
  };
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || staleReason(h, now)) throw new Error(`${r} is not held${h ? ` (the last holder "${h.owner}" is stale)` : ''}: describe a job on your own live hold (node tools/lock.mjs status ${r})`);
    if (knownGroup(h)) {
      const live = liveReaders(h, now);
      if (!live.some((x) => x.owner === owner)) throw new Error(`${r}: the shared group has no reader "${owner}" (readers ${readerList(h)})`);
      const readers = h.readers.map((x) => (x.owner === owner && live.includes(x) ? { ...x, meta: apply(x.meta) } : x));
      writeJson(holderFile(r), { ...h, readers });
      return { shared: true, readers: readers.filter((x) => x.owner === owner) };
    }
    if (h.owner !== owner) throw new Error(`${r} is held by "${h.owner}", not "${owner}": only the holder describes its job`);
    // I-111: a phone run's start or end (its own marker) stamps the holder's last use, read by the idle alarm (lib/idle.mjs)
    if (run || (run === null && h.meta?.run && h.meta.run.pid === runPid)) h.lastRunAt = new Date(now).toISOString();
    h.meta = apply(h.meta);
    writeJson(holderFile(r), h);
    return h;
  });
}

/**
 * Extend a lease to now + ttlSec (clamped to the cap). An explicit renew sets exactly that, shorter or not; `noShorten`
 * (an automatic renew: `lock.mjs renew --no-shorten`, which iphone.mjs run passes before every run) keeps a later
 * expiry the owner set (I-091) and returns {kept: true} then.
 */
export async function renew(r, { owner, ttlSec, noShorten = false }) {
  checkName(r);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || h.owner !== owner || staleReason(h)) throw new Error(`${r} is not held by "${owner}"${h ? ` (holder: ${h.owner}${staleReason(h) ? ', stale' : ''})` : ''}`);
    if (h.short) throw new Error(`${r} is held by "${owner}" as a short job (max ${h.maxSec} s); a short job cannot be renewed`);
    const want = Date.now() + ttlSec * 1000, cap = capMs(r, h), cur = Date.parse(h.expiresAt) || 0;
    const kept = noShorten && cur >= Math.min(want, cap);
    h.expiresAt = new Date(kept ? Math.min(cur, cap) : Math.min(want, cap)).toISOString();
    writeJson(holderFile(r), h);
    return { ...h, ...(want > cap ? { capped: true } : {}), ...(kept ? { kept: true } : {}) };
  });
}

/**
 * Wait (FIFO) and acquire. Polls with backoff; logs who is holding every 30 s.
 * Process-kind locks are also released automatically on exit / SIGINT / SIGTERM.
 * A re-entrant acquire (the same owner's lease, or an ancestor's hold via `held`, default
 * $FW_LOCK_HELD) returns at once, and its release() is a no-op: the outer holder releases.
 * `shared` (+ `weight`, `maxSec` <= 300, or <= sharedMaxSec(`job`), I-114): a reader of the shared lane (see header); `sharedHeld` (default
 * $FW_LOCK_SHARED) re-enters an ancestor's reader slot, and refuses an exclusive acquire inside one at once (B1).
 * Returns {holder, release(), reentrant, mode, env, reader}: `env` is what a child command needs to re-enter
 * ({FW_LOCK_SHARED} for a reader, a re-entered slot or an off-mode shared hold; {FW_LOCK_HELD} for an exclusive hold,
 * plus FW_LOCK_SHARED when a shared acquire re-entered it).
 */
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, short = false, shared = false, weight = 1, job, maxSec, held = process.env.FW_LOCK_HELD, sharedHeld = process.env.FW_LOCK_SHARED, timeoutSec = 3600, pollMs = 2000, maxPollMs = short || shared ? 3000 : 15000, log = (s) => console.error(s), thresholds: T = THRESHOLDS, hostSamplers, noTiming = false, awake, cpuSampler = cpuTimes, busyWindowMs = SHARED_LANE.busyWindowMs } = {}) {
  const t0 = Date.now();
  // I-051: a waiting reader measures host CPU busy over its own polls (no extra window inside the guard)
  let cpuBase = shared ? { at: Date.now(), t: cpuSampler() } : null, busyPct;
  let lastLog = 0, wait = pollMs;
  const gated = !!GATED[r] && !short && !shared && !noTiming;
  let host = gated ? { quiet: null, reasons: ['not measured yet'] } : undefined;
  // ts-lock-bundle (b): the gate's timeout counts awake time, like its cap (review-host-state B1): the host sleep the
  // gate windows saw is subtracted, and a window the host slept through never ends in a throw (one fresh window decides)
  let gateSleptMs = 0, sleptLast = false;
  // review-i063 N1: a warm Simulator (I-063) is Mac load: at the gate it counts as not quiet and is shut down (at most
  // every 30 s; sim.mjs shutdown --warm-only, under the simulator lock) unless its live keeper does that first, so every
  // timing hold settles without it. The grant carries the gate's last attempt as `simWarm` (verify.mjs records it).
  // review-i063 n1: a shutdown that fails twice at the gate ends this wait (dequeued, a WAIT error), instead of holding
  // every queued timing job behind a closed gate until gateMaxWaitSec; n3: a failed attempt that the keeper (or a
  // session) resolved later is annotated `resolvedLater`; the gate record of the grant carries it (`gate.simWarm`), so
  // a tool that re-enters this hold (lock.mjs run -- sh -c 'fix.mjs ab ...') records it too
  let gateWarm = null, gateReapAt = 0, gateWarmSince = 0, gateReapFails = 0;
  const myEntry = shared ? (w) => (!!w.shared || !!w.functional) && (kind !== 'process' || w.pid === process.pid) : (w) => !w.shared;
  for (;;) {
    if (cpuBase && Date.now() - cpuBase.at >= busyWindowMs) {
      const t = cpuSampler(), b = cpuBusyPct(cpuBase.t, t);
      if (b !== null) busyPct = b;
      cpuBase = { at: Date.now(), t };
    }
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta, short, shared, weight, job, maxSec, held, sharedHeld, host, thresholds: T, noTiming, awake, busyPct, simWarm: gateWarm });
    // a queued or gated waiter keeps nothing awake (I-070, user C-024: only measurements; I-026's queue assertion is gone)
    if (res.gated) {
      // our turn, but the host is not (known to be) quiet: measure one window, then try again at once
      if (host.quiet === false && Date.now() - lastLog > 30000) {
        log(`[lock ${r}] free, but the host is not quiet (${host.reasons.join(', ')}); waiting since ${res.gate.since}, granted anyway after ${T.gateMaxWaitSec} s`);
        lastLog = Date.now();
      }
      if (!sleptLast && Date.now() - t0 - gateSleptMs > timeoutSec * 1000) { await dequeue(r, owner, myEntry); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s waiting for a quiet host${gateSleptMs ? ` (awake time; the host slept ${Math.round(gateSleptMs / 1000)} s more)` : ''}`); }
      const sw0 = r === 'chrome-measure' ? warmSummary() : null;
      if (!sw0) gateWarmSince = 0; else gateWarmSince ||= Date.now();
      // a live keeper shuts it down itself on seeing this waiter (2 s polls): the gate acts only for a dead or late one
      const reapMs = gateReapMs();
      if (sw0 && (!sw0.keeperAlive || sw0.stale || Date.now() - gateWarmSince >= reapMs) && Date.now() - gateReapAt >= reapMs) {
        gateReapAt = Date.now();
        gateWarm = await reapWarm({ reason: 'the host gate of a timing hold', by: owner });
        // a busy simulator lock (a session, another reap: --warm-only's 60 s lock wait ran out) is no failed shutdown:
        // the gate stays closed and retries, without counting it (review-i063 follow-up)
        gateReapFails = gateWarm && !gateWarm.ok ? gateReapFails + (gateWarm.busy ? 0 : 1) : 0;
        if (gateWarm) log(`[lock ${r}] a warm Simulator (fw-sim) at the host gate: ${gateWarm.action}${gateWarm.ok ? '' : gateWarm.busy ? ` (${gateWarm.error || '?'}); retried, not counted as a failure` : ` (${gateWarm.error || '?'}); attempt ${gateReapFails} of ${GATE_REAP_TRIES}`} (I-063)`);
        if (gateReapFails >= GATE_REAP_TRIES) {
          await dequeue(r, owner, myEntry);
          throw new Error(`[lock ${r}] WAIT: a warm Simulator (fw-sim) is booted and its shutdown failed ${gateReapFails} times at the host gate (${gateWarm.error || '?'}): nothing timed starts beside it, so this wait ends (dequeued); node tools/sim.mjs doctor --fix (or shutdown), then retry (I-063)`);
        }
      }
      host = await gateSample({ thresholds: T, samplers: hostSamplers }); // its sleep is summed by tryAcquire (I-033)
      const sw = r === 'chrome-measure' ? warmSummary() : null;
      if (!sw && gateWarm && !gateWarm.ok && !gateWarm.resolvedLater) { gateWarm = { ...gateWarm, resolvedLater: new Date().toISOString() }; gateReapFails = 0; }
      if (sw) host = { ...host, quiet: false, reasons: [...(host.reasons || []), `a warm Simulator (fw-sim) is ${sw.stale ? 'recorded' : 'booted'} on the Mac (I-063${gateWarm && !gateWarm.ok ? `; ${gateWarm.busy ? 'its shutdown waits for the simulator lock' : 'its shutdown failed'}: ${gateWarm.error || '?'}` : ''})`] };
      sleptLast = !!host.sample?.suspended;
      if (sleptLast) gateSleptMs += (host.sample.sleptSec || 0) * 1000;
      continue;
    }
    if (gated) host = { quiet: null, reasons: ['not measured yet'] }; // the window restarts at the next hand-over
    if (res.ok && res.reentrant) {
      // a shared job re-entering an exclusive hold makes it a slot for its command too (N2): nothing timed starts in it
      const env = res.mode === 'reentrant-shared' ? { FW_LOCK_SHARED: sharedEnv(r, res.slot.token, sharedHeld) }
        : res.mode === 'reentrant-exclusive' ? { FW_LOCK_HELD: heldEnv(r, res.holder.token, held), FW_LOCK_SHARED: sharedEnv(r, res.holder.token, sharedHeld) }
          : { FW_LOCK_HELD: heldEnv(r, res.holder.token, held) };
      return { holder: res.holder, reader: res.reader, release: () => {}, reentrant: true, mode: res.mode, env };
    }
    if (res.ok && res.reader) {
      // a reader of the shared group: leaves by its own token; the last one out closes the group
      if (Date.now() - t0 > 1500) log(`[lock ${r}] joined the shared group after ${Math.round((Date.now() - t0) / 1000)} s`);
      let done = false;
      keepAwake(r, res.holder); // a no-op: a shared group is no measurement (I-070); its sim.mjs session keeps itself awake
      const token = res.reader.token;
      const rel = () => {
        if (done) return; done = true;
        // synchronous best effort (also used from the 'exit' handler); a reader the guard could not reach is pruned later
        const out = withGuardSync(r, () => removeReader(r, token));
        if (out?.closed) stopAwake(r, out.group.token);
      };
      if (kind === 'process') {
        process.on('exit', rel);
        for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { rel(); process.exit(130); });
      }
      return { holder: res.holder, reader: res.reader, release: rel, mode: 'shared', env: { FW_LOCK_SHARED: sharedEnv(r, token, sharedHeld) } };
    }
    if (res.ok) {
      if (Date.now() - t0 > 1500) log(`[lock ${r}] acquired after ${Math.round((Date.now() - t0) / 1000)} s`);
      let done = false;
      keepAwake(r, res.holder); // a measurement hold (holder.awake: timing, or `awake`) keeps the Mac awake until released (I-070, lib/awake.mjs)
      const rel = () => {
        if (done) return; done = true;
        // synchronous best effort (also used from the 'exit' handler)
        const drop = () => { const h = readJson(holderFile(r), null); if (h && h.token === res.holder.token) { unlinkSync(holderFile(r)); noteRelease(r, h, 'process hold ended'); return h; } return null; };
        // a short hold leaves under the guard, so its last-grant record can go with it (I-081); if the guard is not
        // reached in time, the holder goes as before and the record ends at its window (doctor: last-grant-short-outlived)
        const guarded = res.holder.short && withGuardSync(r, () => { try { const h = drop(); if (h) endShortGrant(r, h); } catch {} return true; });
        if (!guarded) { try { drop(); } catch {} }
        stopAwake(r, res.holder.token);
      };
      if (kind === 'process') {
        process.on('exit', rel);
        // process.on, not once: a once-listener is removed before it runs, which restores the default
        // action, so a second signal (fix.mjs ab forwards SIGTERM twice) killed the process midway through
        // process.exit() and skipped later 'exit' listeners such as lib/cdp.mjs killOnExit (incident I-008).
        for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { rel(); process.exit(130); });
      }
      // the switch-off stand-in for a reader is a slot like one (N2): its command gets FW_LOCK_SHARED, never FW_LOCK_HELD
      const env = shared ? { FW_LOCK_SHARED: sharedEnv(r, res.holder.token, sharedHeld) } : { FW_LOCK_HELD: heldEnv(r, res.holder.token, held) };
      return { holder: res.holder, release: rel, mode: res.mode, env, ...(gateWarm ? { simWarm: gateWarm } : {}) };
    }
    // no holder but not our turn: the lock is being handed over to the waiter served next
    const h = res.holder, handover = `free, handing over to "${res.next}"`;
    if (Date.now() - t0 > timeoutSec * 1000) { await dequeue(r, owner, myEntry); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s; ${h ? `held by ${h.owner}` : handover}`); }
    if (Date.now() - lastLog > 30000) {
      const held = h ? (isGroup(h) ? `shared by ${readerList(h)}` : `held by "${h.owner}" (${h.kind}${h.pid ? ' pid ' + h.pid : ''}, since ${h.acquiredAt}${h.expiresAt ? ', expires ' + h.expiresAt : ''})`) : handover;
      log(`[lock ${r}] busy: ${held}${res.why ? ` (${res.why})` : ''}; you are #${res.position} in queue`);
      lastLog = Date.now();
    }
    // the waiter served next polls fast (I-020): a hand-over no longer waits out its backoff
    await sleep(res.next === owner ? Math.min(wait, NEXT_POLL_MS) + Math.random() * 100 : wait + Math.random() * 500);
    wait = Math.min(maxPollMs, Math.round(wait * 1.5));
  }
}

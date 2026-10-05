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
//   <git-common-dir>/fastwork-mirror/locks/holds.log   one JSON line per chrome-measure `run` hold (tools/lock.mjs), and one
//     ledger line per iphone hold or lease at its end (I-167: its seconds by cause, lib/phone-ledger.mjs; the holder record
//     carries the marks: `uses` from describeHold's run marks, `waiters` from other owners' polls)
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
// job's own process (its env), like every tryAcquire with the caller's THRESHOLDS. I-185 (user T-165: the lane
// stood empty for minutes while 11 jobs waited behind a gated timing head): past the window, one capped non-timing
// job at a time (a short job, or a shared reader opening or joining a group) still passes the gated timing head,
// a moved one too, when its cap ends at least GATE_PASS_SETTLE_SEC (120 s) before the head's gate-timeout grant
// (now + maxSec + 120 <= gate.since + gateMaxWaitSec, awake time), so passes happen at 120-480 s and the head always
// keeps a 120 s settling window. A --no-timing hold (no cap) never passes, nor does a timing waiter;
// FW_GATE_SHORT_PASS=0: none. Candidates go by the status board's priority (lock-repair.mjs boardRanks, I-171),
// then queue order; each pass appends a `gate-pass` line to locks/audit.log (owner, head, headGatedSec, maxSec).
// Trade-off: every pass loads the host while the head waits for quiet, so passes can push the head toward a
// contaminated 600 s gate-timeout grant (the I-030 case); the fit rule bounds that but does not exclude it (a
// pass's tail load can outlast its 120 s settling window). After
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
// SHARED_LANE.defaultCap 3, at most SHARED_LANE.cap 6, I-136), host CPU busy <= sharedJoinBusy() over the reader's own
// polls (default 75 %; the switch file's joinBusy; I-051), or before its first busy sample load1 <= sharedJoinLoad()
// (default 2x the cpu count; the switch file's joinLoad); neither for the opener, and no exclusive waiter is queued
// ahead of it (writer preference; I-136: a reader queued ahead of every exclusive waiter joins, it runs before them
// anyway), except the readers queued before the group opened, for batchJoinSec. A --no-timing hold of the iphone lease
// owner (a phone part's quiet-Mac hold) queues ahead of every non-phone waiter (I-172; I-136 passed only the readers that
// queued after the lease began), never past a user step or a hand-made move, marked movedBy "phone-block priority" like a
// lead move (I-136, phoneBlockPriority); between the block's own parts it first gives one gap group to the readers queued
// before it (I-207, inBlockGap / gapEligible / gapEnd below). The group opens at a hand-over like a short job (the short
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
// Phone hold v2 T2 (I-168): agents hold the iphone as a process hold of `lock.mjs run iphone` (PHONE_HOLD bounds; the
// CLI refuses their `acquire iphone`, phoneAcquireRefusal); keepHold turns the hold into a keep lease of the same owner
// after its command, which that owner's next process hold takes over (same token) or which expires; a process hold
// without an expiry is not renewed; heldPhoneOwner/phoneHolder tell the phone tools whom the hold is for ($FW_LOCK_HELD).
import { mkdirSync, rmdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, appendFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { sharedStateDir, REPO } from './paths.mjs';
import { THRESHOLDS, sample, quiet } from './host.mjs';
import { keepAwake, stopAwake, awakeHold } from './awake.mjs'; // I-070: measurement holds only (user C-024)
import { warmSummary, reapWarm, reapWarmSync, reapNote, settleSec, gateReapMs } from './sim-warm.mjs';
import { stepGrace, readSteps } from './phone-step.mjs'; // I-123: an iphone lease does not run out under the user's step
import { timingDiskRefusal } from './disk.mjs'; // I-124: no new timing hold on a nearly full disk
import { phoneLedger, observeWaiters, openUse, closeUse } from './phone-ledger.mjs'; // I-167: one holds.log line per iphone hold

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
  // I-202: an iphone hold that carried a phone block keeps it on the record, so its owner can mark the gap after it
  const block = r === 'iphone' && h?.meta?.block?.id ? { block: h.meta.block } : {};
  try { writeJson(lastReleaseFile(r), { owner: h?.owner ?? null, token: h?.token ?? null, kind: h?.kind ?? null, acquiredAt: h?.acquiredAt ?? null, at: iso(now), how, ...block }); } catch {}
  if (r === 'iphone') noteIphoneEnd(h, { endedAt: now, how });
}
/**
 * I-167 (phone-hold v2 T1): the ledger line of iphone holder `h` ending at `endedAt` (lib/phone-ledger.mjs): its run
 * marks and waiter sightings (on the record), the iphone queue now (a last sighting), the holder's chrome-measure lines
 * in holds.log and its live chrome-measure holder / queue entry, its console steps. Synchronous (an exit handler calls it).
 */
export function iphoneLedger(h, { endedAt = Date.now(), how = 'open' } = {}) {
  const queue = pruneQueue(readJson(queueFile('iphone'), []), Date.now());
  let mac = null, steps = [];
  try { mac = status('chrome-measure'); } catch {}
  try { steps = readSteps(); } catch {}
  return phoneLedger(h, { endedAt, how, queue, macLines: holdsTailLines(), mac, steps });
}
/** I-167: append the ledger line of iphone holder `h` to holds.log (best effort: a failed write never fails the release). */
export function noteIphoneEnd(h, { endedAt = Date.now(), how }) {
  if (!h || isGroup(h)) return;
  try { appendFileSync(holdsLogFile(), JSON.stringify(iphoneLedger(h, { endedAt, how })) + '\n'); } catch {}
}
/** I-167: when a stale iphone holder ended: a lease at its expiry (or the end of its step grace, I-123), a process at its last mark. */
export function staleEnd(h, now = Date.now()) {
  const t = (s) => { const x = Date.parse(s); return Number.isFinite(x) ? x : null; };
  if (h.kind === 'process' && !pidAlive(h.pid)) return Math.max(...[h.acquiredAt, h.lastRunAt, ...(h.uses || []).map((u) => u.to)].map(t).filter((x) => x !== null && x <= now), t(h.acquiredAt) ?? now);
  const exp = t(h.expiresAt) ?? now, grace = t(h.stepGrace?.until);
  return Math.min(now, grace !== null && grace > exp ? grace : exp);
}
/**
 * I-168 (phone-hold v2 T2): `lock.mjs run iphone --keep S` after its command: the process hold `token` of process `pid`
 * becomes a keep lease of the same owner for keepSec ({keep: {from, until, sec}}, expiresAt = until). Inside it the
 * owner's next `run iphone` takes the hold over (tryAcquire: same token, a process hold again); otherwise it expires and
 * the next waiter takes the phone. Returns the kept holder, or null when the hold is not that process's (gone, re-entered).
 */
export async function keepHold(r, { token, pid = process.pid, keepSec, now = Date.now() } = {}) {
  checkName(r);
  if (!(keepSec > 0)) throw new Error(`keepSec must be > 0 (got ${keepSec})`);
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || isGroup(h) || h.token !== token || h.kind !== 'process' || h.pid !== pid) return null;
    const { pid: _p, ...rest } = h;
    const until = iso(now + keepSec * 1000);
    const k = { ...rest, kind: 'lease', expiresAt: until, keep: { from: iso(now), until, sec: keepSec } };
    writeJson(holderFile(r), k);
    return k;
  });
}
const HOLDS_TAIL_BYTES = 256 * 1024;
/** The last HOLDS_TAIL_BYTES of holds.log as parsed lines (a cut first line and bad lines skipped). */
function holdsTailLines() {
  let text;
  try {
    const f = holdsLogFile(), size = statSync(f).size;
    if (size <= HOLDS_TAIL_BYTES) text = readFileSync(f, 'utf8');
    else { const fd = openSync(f, 'r'); try { const buf = Buffer.alloc(HOLDS_TAIL_BYTES); readSync(fd, buf, 0, buf.length, size - buf.length); text = buf.toString('utf8'); text = text.slice(text.indexOf('\n') + 1); } finally { closeSync(fd); } }
  } catch { return []; }
  const out = [];
  for (const l of text.split('\n')) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch {} }
  return out;
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
/** The shared lane's bounds and the per-job weights (ts-lock-share; the lead approved cap 4 and these weights; I-136: cap 6). */
export const SHARED_LANE = Object.freeze({
  cap: 6, // weight units of all readers at once: the most the lead's switch may allow (--cap; 4 until I-136, user T-105)
  maxWeight: 4, // one job's --weight: 1..this (I-136 kept it at 4 when the cap went to 6)
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
/** One JSON line per chrome-measure `lock.mjs run` hold: display / wake / assertion at its start and end (T8+, I-033);
 * and one ledger line per iphone hold or lease at its end (I-167, noteIphoneEnd, lib/phone-ledger.mjs). */
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
/** I-176: FW_PHONE_WARMUP=1 is --warmup (an uncounted warm-up run). */
export const phoneWarmup = (env = process.env) => env.FW_PHONE_WARMUP === '1';
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
export function phoneRunRefusal({ owner, allow = false, requireQuiet = false, warmup = false, st = status('chrome-measure'), env = process.env, now = Date.now() } = {}) {
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
  // I-176: an uncounted warm-up run (--warmup, FW_PHONE_WARMUP=1) may go beside another agent's --no-timing hold (a build
  // or CPU work: the phone stamps its own frames and a warm-up's numbers are not counted); never beside a timing hold
  const warm = !!(warmup || phoneWarmup(env));
  if (warm && h.noTiming) return null;
  const hint = h.noTiming ? ` An uncounted warm-up run may go beside it: add --warmup (never a counted or sentinel/control run, I-176).` : warm ? ` (--warmup passes only beside a --no-timing hold, not a timing one, I-176)` : '';
  return `WAIT: chrome-measure is held by "${h.owner}" (${h.noTiming ? 'a no-timing hold: a build or CPU work' : 'a normal hold, e.g. a goal A/B'}): no timed iPhone runs meanwhile. Retry after it ends, or ${how}.${hint}`;
}
/** I-176: the other agent's --no-timing hold that an uncounted warm-up run goes beside, as {owner, kind: 'no-timing'}, else null (nothing relaxed: own or inherited hold, no warm-up, anything but a no-timing exclusive hold). */
export function warmupBeside({ owner, warmup = false, allow = false, st, env = process.env } = {}) {
  const h = st?.holder;
  if (!(warmup || phoneWarmup(env)) || allow || !h || st.stale || isGroup(h) || h.functional || h.short || !h.noTiming) return null;
  const inherited = !!h.token && parseHeld(env.FW_LOCK_HELD)['chrome-measure'] === h.token;
  return inherited || (owner && h.owner === owner) ? null : { owner: h.owner, kind: 'no-timing' };
}
/**
 * The phone measure guard for one run (I-056): throws Error(phoneRunRefusal) when the run may not start, else returns
 * {requireQuiet, allow, start: phoneMacState} and logs phoneMacNote (when `note`). Pass the result to phoneMacRecord at
 * the end of the run: it becomes the record's `mac` field.
 */
export function phoneGuard({ owner, allow = false, requireQuiet = false, warmup = false, st = status('chrome-measure'), env = process.env, now = Date.now(), load1, note = true, log = console.log } = {}) {
  const why = phoneRunRefusal({ owner, allow, requireQuiet, warmup, st, env, now });
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
  const beside = warmupBeside({ owner, warmup, allow, st, env });
  const lines = note ? [phoneMacNote(start), beside ? `NOTE: uncounted warm-up run beside "${beside.owner}"'s --no-timing hold (a build or CPU work): the phone stamps its own frames and a warm-up is not counted, so it runs; the record keeps mac.warmup and mac.beside (I-176)` : null, reaped ? reapNote(reaped, 'this phone run') : start.simWarm?.stale ? `NOTE: a stale warm Simulator record (written before the Mac restarted, so fw-sim is not booted) is in the record (mac.start.simWarm); node tools/sim.mjs shutdown clears it (I-063)` : start.simWarm ? `NOTE: a warm Simulator (fw-sim, ${start.simWarm.keeperAlive ? 'booted' : 'recorded as booted, keeper not running'} and idle until ${start.simWarm.idleUntil}) is on the Mac beside this phone run: Mac-quiet is preferred, not required, so it runs and its record keeps it (mac.start.simWarm); --require-quiet or FW_PHONE_REQUIRE_QUIET=1 shuts it down first (I-063)` : null] : [];
  for (const line of lines) if (line) log(line);
  return { requireQuiet: quiet, allow: !!allow, start, ...(warmup || phoneWarmup(env) ? { warmup: true } : {}), ...(beside ? { beside } : {}) };
}
/** A phone run record's `mac` field (I-056): {requireQuiet, allow, start, end}, `end` read now; null without a guard. */
export const phoneMacRecord = (g, end = phoneMacState()) => (g ? { requireQuiet: g.requireQuiet, allow: g.allow, start: g.start, end, ...(g.warmup ? { warmup: true } : {}), ...(g.beside ? { beside: g.beside } : {}) } : null); // I-176: warmup/beside only on an uncounted warm-up run

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
  const next = q.length ? q[nextIndex(q, effectiveLastGrant(readJson(lastGrantFile(r), {}), h), Date.now(), undefined, r)]?.owner ?? null : null;
  const now = Date.now(), grace = h ? stepGrace(h, now) : null; // I-123: a lease kept for its owner's user step
  const df = GATED[r] ? pruneQueue(readJson(deferredFile(r), []), now) : []; // I-160: Simulator sessions a phone block defers
  const bg = r === 'iphone' && (!h || staleReason(h, now)) ? gapBlock(h, now) : null; // I-202: the gap of a block between its holds
  const st = { resource: r, holder: h, stale: h ? staleReason(h, now) : null, queue: q, next, ...(grace ? { grace } : {}), ...(df.length ? { deferred: df } : {}), ...(bg ? { blockGap: bg } : {}) };
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
  // I-155: a not-ready waiter (acquire --not-ready) keeps its place but is never served; -1 when no waiter is ready
  let pool = q.map((w, i) => [w, i]).filter(([w]) => !w.notReady);
  if (!pool.length) return -1;
  if (!SLOW_POLL_RESOURCES.has(r)) {
    const fresh = pool.filter(([w]) => w.owner === caller || now - Date.parse(w.lastSeen) <= HANDOVER_FRESH_SEC * 1000);
    if (fresh.length) pool = fresh;
  }
  // (a shared group's last-grant record has its short-drain budget spent (groupGrant), so right after a group a normal
  // waiter goes first; the rule is data old lock code reads the same way, so old and new code agree on who is next,
  // except where I-049 below picks a reader: a reader runs new code, so it takes that turn itself)
  const s = pool.find(([w]) => w.short), n = pool.find(([w]) => !w.short);
  if (!s || !n) return pool[0][1];
  // I-207: the phone block's next part (phone-block priority) gives its gap to the readers queued before it re-queued (or
  // queued readerMaxWaitSec) once: the first of them opens the gap group, then the part goes first (gapPass marks the
  // gap given). Not past a hand-made move ahead of the part (the lead's or a delegate's): that goes first, as before.
  if (blockPart(n[0]) && !n[0].gapPass && !pool.some(([w], i) => i < n[1] && handMoved(w)) && inBlockGap(r, n[0], lg)) {
    const g = pool.find(([w]) => gapEligible(w, n[0], now) && (w.maxSec || SHARED_LANE.maxSec) <= PHONE_GAP_SEC);
    if (g) return g[1];
  }
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

// ---- I-207: the phone block's gap -----------------------------------------------------------------------------------
// P-130 (2026-10-05 11:03-11:22Z): the block's next part re-queued at once after each part and, moved by phone-block
// priority (I-172), went before every reader at every hand-over (a move wins over I-049's 10-min bound, I-097): a reader
// queued since 11:05:31 waited through the 11:08 and 11:15 gaps. Now each part that waits between the block's own parts
// (inBlockGap: the last hold to end was its owner's; the block's first part keeps I-172 as is) gives ONE gap group: readers queued before
// the part's entry (its `since`) or for readerMaxWaitSec open or join it, within the cap and the join load / busy checks,
// and each ends by the gap's end; then the part goes first. The group is the one running when the part queues, else the
// one a gap reader opens at the hand-over (only a reader whose cap is at most PHONE_GAP_SEC opens one). The part's queue
// entry records it (gapPass {at, token}); the part waits at most PHONE_GAP_SEC + batchJoinSec (+ the kill grace) after
// gapPass.at, or until the running group's own end if that is later. A hand-made move keeps precedence over both.
/** I-207: the longest reader cap a phone block's gap admits (the opener's --max-seconds; joiners end by gapEnd). */
export const PHONE_GAP_SEC = 300;
/** I-207: the queue entry of a phone block's next part (moved by phone-block priority, phoneBlockPriority). */
const blockPart = (w) => !!w && w.movedBy === PHONE_BLOCK_BY;
/** I-207: an entry the lead (or a delegate, I-171) moved by hand. */
const handMoved = (w) => !!w && !!w.movedBy && w.movedBy !== PHONE_BLOCK_BY;
/** I-207: reader entry `w` may run in the gap of block part `p`: queued before the part, or for readerMaxWaitSec (I-049). */
function gapEligible(w, p, now) {
  if (!w || !w.shared || w.notReady) return false;
  const since = Date.parse(w.since);
  return since < Date.parse(p.since) || now - since >= SHARED_LANE.readerMaxWaitSec * 1000;
}
/** I-207: when the gap group `h` of block part `p` must end (ms): the later of its readers' deadlines and the gap window. */
export function gapEnd(h, p) {
  const win = Date.parse(p.gapPass.at) + (PHONE_GAP_SEC + SHARED_LANE.batchJoinSec + SHARED_LANE.killGraceSec) * 1000;
  return Math.max(win, ...(h.readers || []).map((x) => Date.parse(x.deadline)).filter(Number.isFinite));
}
/** I-207: the block part in `q` whose gap is the group `h` ({part, end}), or null. */
export function gapOf(h, q) {
  const p = isGroup(h) ? (q || []).find((w) => blockPart(w) && w.gapPass?.token === h.token) : null;
  return p ? { part: p, end: gapEnd(h, p) } : null;
}
/**
 * I-207: block part `p` waits in a gap between its own parts: the last hold of `r` to end was its owner's (its previous
 * part; <r>.last-release.json, noteRelease), and nothing but a shared group was granted since (`lg`: the last grant). Its
 * first part, queued behind someone else's hold, keeps I-172's plain priority.
 */
function inBlockGap(r, p, lg) {
  const lr = readJson(lastReleaseFile(r), null);
  if (!lr || lr.owner !== p.owner) return false;
  const gAt = Date.parse(lg?.at);
  return !(gAt > Date.parse(lr.at)) || lg.shared === true || lg.owner === GROUP_OWNER;
}
/** I-207: inside the guard: the group `h` (just opened, or running when the part queued) is the gap of every block part in `q` without one that waits in a gap. */
function giveGap(r, q, h, lg, now) {
  let n = 0;
  for (const w of q) if (blockPart(w) && !w.gapPass && inBlockGap(r, w, lg)) { w.gapPass = { at: iso(now), token: h.token }; n++; }
  return n;
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

/** I-185: a gate pass ends at least this long before the head's gate-timeout grant, so the host can settle for the head. */
export const GATE_PASS_SETTLE_SEC = 120;
/** I-185: a timing waiter `w` held at its host gate (not quiet), whose wait the pass window has closed to I-030's passes. */
const gateHeldPastWindow = (w, now, T) => !!(w && !w.short && !w.shared && !w.functional && !w.noTiming && w.gate && w.gate.quiet !== true && gatePassDone(w, now, T));
/** I-185: a job capped at `maxSec` s, starting now, ends GATE_PASS_SETTLE_SEC before `w`'s gate-timeout grant (awake time, I-033). */
function gateFits(w, maxSec, now, T) {
  if (!(T.gateShortPassSec > 0) || !(maxSec > 0)) return false; // FW_GATE_SHORT_PASS=0: no pass at all; no cap: never
  const grantAt = Date.parse(w.gate.since) + ((w.gate.sleptSec || 0) + T.gateMaxWaitSec) * 1000;
  return now + (maxSec + GATE_PASS_SETTLE_SEC) * 1000 <= grantAt;
}
/**
 * I-185 (user T-165: the lane stood empty 22:04-22:07Z while 11 jobs waited behind a timing head at its host gate): the
 * queue entry that may pass the head `q[ni]` now, or null. The head is a timing waiter held at its gate (record fresh)
 * past the pass window (gatePassDone; a lead-moved head too); a candidate is a capped non-timing waiter (a short job or a
 * shared reader: short-lane entries with maxSec; a --no-timing hold has no cap and never passes, nor does a timing
 * waiter) seen within HANDOVER_FRESH_SEC whose cap fits (gateFits). Board priority first (`rankOf(owner)`: the owner's
 * best open status-row priority, lower first; null = unranked, last), then queue order. One job (or one group) at a time.
 */
function gatePassPick(q, ni, now, caller, T, rankOf) {
  const head = q[ni];
  if (!gateHeldPastWindow(head, now, T) || now - Date.parse(head.gate.at) >= GATE_FRESH_MS) return null;
  const c = q.map((w, i) => [w, i]).filter(([w, i]) => i !== ni && w.short && !w.notReady && (w.owner === caller || now - Date.parse(w.lastSeen) <= HANDOVER_FRESH_SEC * 1000) && gateFits(head, w.maxSec, now, T));
  if (!c.length) return null;
  const rk = (o) => { const p = rankOf ? rankOf(o) : null; return Number.isInteger(p) ? p : Infinity; };
  c.sort((a, b) => rk(a[0].owner) - rk(b[0].owner) || a[1] - b[1]);
  return c[0][0];
}
/** I-185: one locks/audit.log line per gate pass, so the hourly measures can count them. */
function auditGatePass(r, { owner, head, maxSec, now }) {
  const headGatedSec = Math.round((now - Date.parse(head.gate.since)) / 1000);
  try {
    appendFileSync(join(lockDir(), 'audit.log'), JSON.stringify({ ts: iso(now), by: 'lock', reason: `I-185 gate pass: "${owner}" (cap ${maxSec} s) runs while "${head.owner}" waits at the host gate (${headGatedSec} s)`, resource: r, code: 'gate-pass', owner, head: head.owner, headGatedSec, maxSec }) + '\n');
  } catch {}
}
/** I-185: the status board's priority per owner for gatePassPick (lib/lock-repair.mjs boardRanks, I-171), or null. */
async function boardRankOf() {
  try { const X = await import('./lock-repair.mjs'); return typeof X.boardRanks === 'function' ? await X.boardRanks() : null; } catch { return null; }
}
/** I-185: cheap unguarded peek: some waiter of `r` is held at its gate past the pass window (board ranks are worth reading). */
function gatePassPossible(r, now, T) {
  try { return readJson(queueFile(r), []).some((w) => gateHeldPastWindow(w, now, T)); } catch { return false; }
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
  const { owner, kind = 'lease', pid = process.pid, meta = {}, maxSec, held, host, thresholds: T = THRESHOLDS, noTiming = false, shared = false, weight = 1, job, sharedHeld, load1, ncpu, busyPct, awake, simWarm, sim, notReady = false } = opts;
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
    if (!(Number.isInteger(weight) && weight >= 1 && weight <= SHARED_LANE.maxWeight)) throw new Error(`a shared job's --weight must be an integer 1..${SHARED_LANE.maxWeight} (got ${weight})`);
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
  // I-185: the board ranks for a gate pass, read outside the guard and only when one is possible (a capped non-timing
  // caller, a waiter past its pass window); `opts.rankOf` injects them (tests)
  const rankOf = opts.rankOf !== undefined ? opts.rankOf
    : GATED[r] && (short || lane) && maxSec > 0 && T.gateShortPassSec > 0 && gatePassPossible(r, opts.now ?? Date.now(), T) ? await boardRankOf() : null;
  return withGuard(r, () => {
    const now = opts.now ?? Date.now();
    let h = readJson(holderFile(r), null);
    let q = pruneQueue(readJson(queueFile(r), []), now, queueTtlSec);
    const reason = h && staleReason(h, now);
    if (h && reason) {
      writeJson(join(lockDir(), `${r}.last-stale.json`), { ...h, staleBecause: reason, clearedAt: new Date(now).toISOString(), clearedBy: owner });
      try { unlinkSync(holderFile(r)); } catch {}
      if (isGroup(h)) endGroupGrant(r, h, now);
      if (r === 'iphone') noteIphoneEnd(h, { endedAt: staleEnd(h, now), how: h.keep ? `keep ended (${h.keep.sec} s after its run, I-168): ${reason}` : `stale: ${reason}` }); // I-167
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
    if (same && h.keep && kind === 'process') {
      // I-168: the owner's next `run iphone` inside its keep window continues the hold (same token, a process hold of
      // this process again; the OVERDUE clock restarts with the part, partAt). It releases at its end, or keeps again.
      const { keep: _k, expiresAt: _e, ...rest } = h;
      const m = { ...(h.meta || {}), ...meta };
      delete m.run; // the last part's wrapper marker (its process is gone)
      h = { ...rest, kind: 'process', pid, partAt: iso(now), keeps: (h.keeps || 0) + 1, meta: m };
      writeJson(holderFile(r), h);
      const k = q.findIndex((w) => w.owner === owner && !w.shared);
      if (k >= 0) { q.splice(k, 1); writeJson(queueFile(r), q); }
      return { ok: true, holder: h, mode: 'exclusive', resumed: true };
    }
    if (same) {
      // re-entrant for the same owner: refresh the TTL (and a new job description, I-060); never shorten the live
      // lease (I-091: a longer lease the owner set on purpose went stale while it waited), within the cap
      if (ttlSec && !h.short) h.expiresAt = new Date(Math.min(Math.max(now + ttlSec * 1000, Date.parse(h.expiresAt) || 0), capMs(r, h))).toISOString();
      if (meta?.job) h.meta = { ...(h.meta || {}), job: meta.job };
      writeJson(holderFile(r), h);
      return { ok: true, holder: h, reentrant: true, mode: shared ? 'reentrant-exclusive' : 'reentrant' };
    }
    // I-160: a Simulator session (a shared job named `simulator`, or `sim`) does not start beside a ticketed phone block;
    // it leaves the queue while deferred (so no waiter, old lock code included, waits behind it) and polls on
    if (GATED[r] && shared && (sim ?? job === 'simulator')) {
      const why = simDeferral({ owner, maxSec, h, q, now });
      if (why) {
        const k = q.findIndex((w) => (w.shared || w.functional) && sameWaiter(w, owner, kind, pid));
        if (k >= 0) { q.splice(k, 1); writeJson(queueFile(r), q); }
        noteDeferred(r, { owner, kind, pid, why, queueTtlSec, now });
        const ni = q.length ? nextIndex(q, effectiveLastGrant(readJson(lastGrantFile(r), {}), h), now, owner, r, T) : -1;
        return { ok: false, deferred: true, why, holder: h, position: 0, queue: q, next: ni >= 0 ? q[ni].owner : null, mode: lane ? 'shared' : 'short' };
      }
      dropDeferred(r, { owner, kind, pid });
    }
    const lg = readJson(lastGrantFile(r), {});
    const seen = effectiveLastGrant(lg, h);
    if (seen !== lg) writeJson(lastGrantFile(r), seen); // record a grant made by old code (I-011)
    if (lane) return readerAttempt(r, { h, q, seen, now, owner, kind, pid, meta, maxSec, weight, cap: sw.cap, queueTtlSec, load1, ncpu, busyPct, T, rankOf });
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
    // I-155: an acquire without --not-ready marks its entry ready (in place) before the hand-over picks the next waiter
    if (mine >= 0 && q[mine].notReady && !notReady) { const { notReady: _, ...w } = q[mine]; q[mine] = { ...w, readyAt: new Date(now).toISOString() }; } // I-167: readyAt
    const ni = q.length ? nextIndex(q, seen, now, owner, r, T) : -1;
    // short jobs are exempt from the host gate: the first short waiter may pass a head normal waiter held by it
    // (not one the lead moved, and only early in its gate wait: gateHolding, I-030); past that window, a short job whose
    // cap fits before the head's settling window (gatePassPick, I-185)
    let headOk = !notReady && (q.length === 0 || mine === ni || (short && GATED[r] && ni >= 0 && gateHolding(q[ni], now, T) && mine === firstShortSeen(q, now, owner)));
    const fitPass = !headOk && !h && !notReady && short && GATED[r] && ni >= 0 && mine >= 0 && gatePassPick(q, ni, now, owner, T, rankOf) === q[mine] ? q[ni] : null;
    if (fitPass) headOk = true;
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
      if (fitPass) auditGatePass(r, { owner, head: fitPass, maxSec, now });
      if (GATED[r] && !short && !shared) closeBetween(owner); // I-160: the phone block's next hold ends its between-holds window
      const runStart = short ? new Date(shortRunStart(seen, now) ?? now).toISOString() : undefined;
      writeJson(lastGrantFile(r), { owner, short, maxSec, at: h.acquiredAt, token: h.token, runStart });
      if (mine >= 0) q.splice(mine, 1);
      writeJson(queueFile(r), q);
      return { ok: true, holder: h, mode: short ? 'short' : 'exclusive' };
    }
    // busy (or someone else is served first): join / refresh the queue
    const entry = { owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: mine >= 0 ? q[mine].since : new Date(now).toISOString(), lastSeen: new Date(now).toISOString(), queueTtlSec, ...(short ? { short: true, maxSec } : {}), ...(shared ? { functional: true, weight } : {}), ...(noTiming ? { noTiming: true } : {}), ...(notReady ? { notReady: true } : {}), // I-155
      // a gate wait survives a short job granted in between, so short jobs can't stretch the gate's cap
      ...(mine >= 0 && q[mine].gate ? { gate: q[mine].gate } : {}),
      ...(mine >= 0 && q[mine].readyAt && !notReady ? { readyAt: q[mine].readyAt } : {}) }; // I-167: when a --not-ready entry turned ready
    if (mine >= 0 && q[mine].movedBy) Object.assign(entry, { movedBy: q[mine].movedBy, movedAt: q[mine].movedAt }); // a lead's reorder (I-019, lock-repair.mjs)
    if (mine >= 0 && q[mine].gapPass) entry.gapPass = q[mine].gapPass; // I-207: the gap this part gave
    if (mine >= 0) q[mine] = entry; else q.push(entry);
    if (GATED[r] && noTiming && !short && !shared) {
      q = phoneBlockPriority(q, entry, now); // I-136
      if (knownGroup(h) && blockPart(entry)) giveGap(r, [entry], h, seen, now); // I-207: a group running when the part re-queues is its gap
      if (!blockPart(entry)) delete entry.gapPass;
    }
    writeJson(queueFile(r), q);
    if (r === 'iphone' && h && !isGroup(h) && observeWaiters(h, q, now)) writeJson(holderFile(r), h); // I-167: a waiter seen on the hold
    return { ok: false, holder: h, position: q.indexOf(entry) + 1, queue: q, next: q[nextIndex(q, seen, now, owner, r, T)]?.owner ?? null, mode: short ? 'short' : 'exclusive', ...(notReady ? { notReady: true } : {}) };
  });
}

/** I-136: the movedBy mark of a phone block's quiet-Mac hold (see phoneBlockPriority). */
export const PHONE_BLOCK_BY = 'phone-block priority';
/** I-172: a user step's entry (owner `user` or `user-*`): phone-block priority never passes it. */
export const isUserOwner = (o) => typeof o === 'string' && /^user(-[A-Za-z0-9_.-]+)?$/.test(o);
/**
 * I-168 (phone-hold v2 T2): agents hold the iPhone only while a command runs, `lock.mjs run iphone` (a process hold):
 * --max-seconds defaults to and is capped at maxSec (blockMaxSec with --block <ticket>; past it the hold is OVERDUE and
 * warns, a phone part is never killed); --keep S (<= keepMaxSec) keeps it for the same owner's next part.
 */
export const PHONE_HOLD = Object.freeze({ maxSec: 900, blockMaxSec: 3600, keepMaxSec: 180,
  gapMarkSec: 180 }); // I-202: the block owner may mark --between (or --block none) this long after its phone hold ended
/** I-168: the command every phone refusal names. */
export const phoneRunCmd = (owner = '<you>') => `node tools/lock.mjs run iphone --owner ${owner} [--max-seconds ${PHONE_HOLD.maxSec}] [--keep 120] [--block <ticket>] -- <phone part>`;
/**
 * I-168: why `lock.mjs acquire iphone` (a lease) is refused for `owner`, or null. A lease is for the user's own hand test
 * (`user`, `user-*`), the lead (`lead`: --lead with a --reason, audited) and queueing early (`notReady`, I-155: it never
 * grants). Library callers (console.mjs steps, phone-hold v2 T3) are not refused: the CLI applies this.
 */
export function phoneAcquireRefusal({ owner, lead = false, reason, notReady = false } = {}) {
  if (lead) return String(reason ?? '').trim() ? null : 'acquire iphone --lead needs --reason "<why>" (audited in locks/audit.log; I-168)';
  if (notReady || isUserOwner(owner)) return null;
  return `REFUSED acquire iphone for "${owner}": agents hold the phone only while a command runs (phone hold v2, I-168). Run your phone part as: ${phoneRunCmd(owner)}. It takes the phone when the command starts and gives it back when it exits (--keep S, up to ${PHONE_HOLD.keepMaxSec} s, keeps it for your next part). Not ready yet: node tools/lock.mjs acquire iphone --owner ${owner} --not-ready (keeps your place). A lease is for the user's own test (--owner user-*) and the lead (--lead --reason "...").`;
}
/**
 * I-168: who holds the phone for a phone tool (iphone.mjs, ioscap.mjs, wait.mjs phone-temp): the live iphone holder's
 * owner when $FW_LOCK_HELD carries its token (the command of a `lock.mjs run iphone`, any --owner), else `owner` when it
 * holds the phone (any kind: a process hold, a keep window, a lease); null otherwise.
 */
export function heldPhoneOwner({ owner, st = status('iphone'), env = process.env } = {}) {
  const h = st.holder && !st.stale && !isGroup(st.holder) ? st.holder : null;
  if (!h) return null;
  if (h.token && parseHeld(env.FW_LOCK_HELD).iphone === h.token) return h.owner;
  return owner && h.owner === owner ? owner : null;
}
/** I-168: heldPhoneOwner, or throws: a usage error (e.usage) without --owner, else the refusal naming the run form. */
export function phoneHolder({ owner, st = status('iphone'), env = process.env } = {}) {
  const who = heldPhoneOwner({ owner, st, env });
  if (who) return who;
  if (!owner) throw Object.assign(new Error('--owner <topic> is required'), { usage: true });
  throw new Error(`you ("${owner}") don't hold the iphone lease${st.holder ? ` (holder: "${st.holder.owner}"${st.stale ? ', stale' : ''})` : ''}. Run: node tools/lock.mjs run iphone --owner ${owner} -- <this command> (the phone is yours while it runs; I-168)`);
}
/**
 * Inside the guard, for the queue entry `entry` (in `q`) of a --no-timing hold (I-136): while its owner holds the live
 * iphone (a lease, or a process hold), the hold is a phone part's quiet-Mac hold and the phone waits for it, so it
 * moves ahead of every non-phone waiter (I-172: timing, no-timing, short and shared readers alike, queued before or
 * after the lease; I-136 passed only the readers queued after the lease, so it sat behind earlier exclusive holds while
 * the phone idled). It stops behind a user step's entry (isUserOwner), a hand-made move (the lead's, or a delegate's,
 * I-171) and another phone-block entry (FIFO among phone owners), and carries movedBy PHONE_BLOCK_BY, which nextIndex
 * and the join rule read like a lead move (I-019/I-020/I-097; lock code from before I-136 reads that field the same
 * way). Bounded: a queue place only (it never preempts a holder or a running shared group), one entry per owner
 * (entries are keyed by owner), never over the lead's own move; once the phone is gone the mark goes and the place
 * stays. The holder's timing hold stays FIFO (a Chrome measurement is no phone part). Returns the (reordered) queue.
 */
function phoneBlockPriority(q, entry, now) {
  if (entry.movedBy && entry.movedBy !== PHONE_BLOCK_BY) return q; // the lead's (or a delegate's) move wins
  const ph = readJson(holderFile('iphone'), null);
  if (!(ph && ph.owner === entry.owner && !isGroup(ph) && !staleReason(ph, now))) {
    if (entry.movedBy === PHONE_BLOCK_BY) { delete entry.movedBy; delete entry.movedAt; }
    return q;
  }
  if (entry.movedBy !== PHONE_BLOCK_BY) Object.assign(entry, { movedBy: PHONE_BLOCK_BY, movedAt: new Date(now).toISOString() });
  const i = q.indexOf(entry);
  let at = i;
  while (at > 0 && !q[at - 1].movedBy && !isUserOwner(q[at - 1].owner)) at--;
  if (at === i) return q;
  const rest = q.filter((w) => w !== entry);
  return [...rest.slice(0, at), entry, ...rest.slice(at)];
}

// ---- I-160: a ticketed phone block on the iphone lease, and the Simulator sessions it defers ------------------------
// A Simulator boot took Mac load1 to 80-170 during P-111's timed phone holds (2026-10-04 15:34Z, 15:40Z). The runner marks
// its lease with the block (`lock.mjs doing iphone --owner <it> --block <ticket>`, also on `acquire iphone`; meta.block
// {id, at}) and, after each hold, a between-holds window (`--between <min>`: meta.between {at, until}). While the live lease
// carries a block, a Simulator session's shared acquire (job `simulator`, or a `run` wrapping `sim.mjs session`) neither
// joins nor opens a group, unless the window is open and its --max-seconds ends inside it; the window counts as shut
// while the runner holds or queues for chrome-measure or a phone run of its own is live, and it closes for good when
// the runner is granted its next exclusive chrome-measure hold (closeBetween) or starts a phone run (describeHold).
// The lease's owner itself is never deferred. A deferred session is not a queue entry (lock code from before I-160 would
// wait behind it): it is listed in <r>.deferred.json (status `deferred`), polls on, and re-queues at the back.
export const BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const deferredFile = (r) => join(lockDir(), `${r}.deferred.json`);
/** The phone block on the live iphone lease ({owner, id, since, between, run}), or null. `ph`: the iphone holder record. */
export function phoneBlock(ph = readJson(holderFile('iphone'), null), now = Date.now()) {
  if (ph && !isGroup(ph) && !staleReason(ph, now)) {
    if (!ph.meta?.block?.id) return null;
    return { owner: ph.owner, id: ph.meta.block.id, since: ph.meta.block.at ?? null, between: ph.meta.between || null, run: ph.meta.run || null };
  }
  return gapBlock(ph, now); // I-202: no live phone hold: the gap its block owner marked after it, if any
}
// ---- I-202: the between-holds window after a block's phone hold ended ------------------------------------------------
// P-122 (2026-10-05 08:42Z): with one `run iphone` per part, the phone is not held between parts, and `doing iphone
// --between` refused ("not held"), so neither the board nor the Simulator deferral saw the gap. Now the owner of an iphone
// hold that carried a block (meta.block) may, within PHONE_HOLD.gapMarkSec of its end and while nobody else held the
// phone since, mark the gap: --between <min> opens the window (iphone.block-gap.json {owner, token, block, endedAt,
// between}), --between 0 shuts it, --block none drops the record. While no hold is live and that ended hold is still the
// last one, phoneBlock() returns the block with that window until its `until` (status: `blockGap`); a live hold's own
// marks win. Everyone else is refused as before.
const blockGapFile = () => join(lockDir(), 'iphone.block-gap.json');
/** I-202: the last iphone hold that ended ({owner, token, block, endedAt}): a stale holder still on file, else the release record; null while one is live. */
function endedPhoneHold(ph, now) {
  if (ph && !isGroup(ph)) return staleReason(ph, now) ? { owner: ph.owner, token: ph.token, block: ph.meta?.block ?? null, endedAt: staleEnd(ph, now) } : null;
  const lr = readJson(lastReleaseFile('iphone'), null);
  return lr && lr.owner ? { owner: lr.owner, token: lr.token, block: lr.block ?? null, endedAt: Date.parse(lr.at) } : null;
}
/** I-202: the block of the gap record while its window is open and its hold is still the last one that ended, or null. */
function gapBlock(ph, now) {
  const g = readJson(blockGapFile(), null);
  if (!g?.between || !(now < Date.parse(g.between.until))) return null;
  const e = endedPhoneHold(ph, now);
  if (!e || e.token !== g.token || e.owner !== g.owner) return null;
  return { owner: g.owner, id: g.block.id, since: g.block.at ?? null, between: g.between, run: null, gap: true };
}
/**
 * I-202, inside the iphone guard (`h`: the holder file, absent or stale): `doing iphone --between|--block none` by
 * `owner` after its block's hold ended. Returns a holder-like record ({owner, meta: {block, between}, gap: true}) or null
 * when not allowed (the caller refuses as before).
 */
function markBlockGap(h, { owner, block, betweenMin, now }) {
  const e = endedPhoneHold(h, now);
  if (!e || e.owner !== owner || !e.block?.id) return null;
  const f = blockGapFile(), g0 = readJson(f, null);
  const mine = g0 && g0.token === e.token && g0.owner === owner ? g0 : null;
  const open = mine?.between && now < Date.parse(mine.between.until);
  if (!(now - e.endedAt <= PHONE_HOLD.gapMarkSec * 1000 || open)) return null;
  if (block === null) { try { unlinkSync(f); } catch {} return { owner, gap: true, meta: {} }; }
  const g = { owner, token: e.token, block: e.block, endedAt: iso(e.endedAt) };
  if (betweenMin) g.between = { at: iso(now), until: iso(now + betweenMin * 60000) };
  writeJson(f, g);
  return { owner, gap: true, meta: { block: g.block, ...(g.between ? { between: g.between } : {}) } };
}
/**
 * Inside the chrome-measure guard: why the Simulator session of `owner` (bounded by `maxSec`) may not start now, or null.
 * `h`, `q`: chrome-measure's holder and queue; `ph`: the iphone holder (read when omitted).
 */
export function simDeferral({ owner, maxSec, h, q = [], now = Date.now(), ph }) {
  const b = phoneBlock(ph === undefined ? readJson(holderFile('iphone'), null) : ph, now);
  if (!b || b.owner === owner) return null;
  const until = Date.parse(b.between?.until ?? '');
  const runLive = !!(b.run && pidAlive(b.run.pid));
  const holds = !!h && (knownGroup(h) ? h.readers.some((x) => x.owner === b.owner) : h.owner === b.owner);
  const queued = q.some((w) => w.owner === b.owner);
  const shut = holds ? `"${b.owner}" holds chrome-measure` : queued ? `"${b.owner}" waits for its next chrome-measure hold` : runLive ? `a phone run of "${b.owner}" is on` : null;
  if (!shut && Number.isFinite(until) && now + (maxSec || 0) * 1000 <= until) return null;
  const win = shut ? `the between-holds window is shut (${shut})`
    : !Number.isFinite(until) ? 'no between-holds window is open'
      : until <= now ? `its between-holds window ended at ${iso(until)}`
        : `its between-holds window ends at ${iso(until)}, before this session's ${maxSec} s would`;
  return `deferred: phone block ${b.id} of "${b.owner}" runs on the iPhone and ${win}: a Simulator session starts in a window that fits it (the runner opens one with: node tools/lock.mjs doing iphone --owner ${b.owner} --between <min>) or after the block (I-160)`;
}
/** Inside the guard: record (refresh) a deferred Simulator session in <r>.deferred.json, pruning entries not seen lately. */
function noteDeferred(r, { owner, kind, pid, why, queueTtlSec, now }) {
  const all = pruneQueue(readJson(deferredFile(r), []), now);
  const prev = all.find((w) => sameWaiter(w, owner, kind, pid)), list = all.filter((w) => w !== prev);
  list.push({ owner, kind, pid: kind === 'process' ? pid : undefined, checkout: REPO, since: prev?.since ?? iso(now), lastSeen: iso(now), queueTtlSec, why });
  writeJson(deferredFile(r), list);
}
/** Inside the guard: this session is no longer deferred. */
function dropDeferred(r, { owner, kind, pid }) {
  const f = deferredFile(r), list = readJson(f, null);
  if (!Array.isArray(list) || !list.some((w) => sameWaiter(w, owner, kind, pid))) return;
  writeJson(f, list.filter((w) => !sameWaiter(w, owner, kind, pid)));
}
/** The Simulator sessions deferred by a phone block right now (seen within their queue TTL). */
export const deferredSessions = (r) => (checkName(r), pruneQueue(readJson(deferredFile(r), []), Date.now()));
/** I-160: `owner` was granted an exclusive chrome-measure hold: its phone block's between-holds window ends (best effort). */
function closeBetween(owner) {
  const f = holderFile('iphone');
  if (readJson(f, null)?.owner !== owner) return;
  try { withGuardSync('iphone', () => { const x = readJson(f, null); if (x && x.owner === owner && x.meta?.between) { delete x.meta.between; writeJson(f, x); } }); } catch {}
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
function readerAttempt(r, { h, q, seen, now, owner, kind, pid, meta, maxSec, weight, cap, queueTtlSec, load1, ncpu, busyPct, T, rankOf = null }) {
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
    return { ok: false, holder: h, position: q.indexOf(entry) + 1, queue: q, next: q[nextIndex(q, seen, now, owner, r, T)]?.owner ?? null, why, mode: 'shared' };
  };
  // the same agent's lease reader from this checkout (an `acquire --shared` repeated to check or keep it) is that slot
  const again = knownGroup(h) && kind !== 'process' ? h.readers.find((x) => x.kind !== 'process' && x.owner === owner && x.checkout === REPO) : null;
  if (again) return { ok: true, holder: h, reader: again, reentrant: true, mode: 'reentrant-shared' };
  if (h && !knownGroup(h)) return wait(isGroup(h) ? `held by a shared group in format "${h.format}", which this lock code does not know: it waits as for an exclusive holder` : `held by "${h.owner}" (exclusive)`);
  if (h) {
    // I-136: only an exclusive waiter queued AHEAD of this reader closes its join (writer preference). A reader ahead of
    // every exclusive waiter runs before them anyway (I-049: none passes a reader queued before it), so it joins while it
    // fits instead of waiting for the group to drain and then opening the next one; the writer still goes first after
    // the readers ahead of it, and no reader queued behind it extends the group. A new reader (no entry yet) queues last.
    const writer = q.slice(0, mine >= 0 ? mine : q.length).find((w) => !w.shared);
    const inBatch = mine >= 0 && Date.parse(q[mine].since) <= Date.parse(h.openedAt) && now - Date.parse(h.openedAt) <= SHARED_LANE.batchJoinSec * 1000;
    // I-097: an exclusive waiter the lead moved ahead of this reader closes joins for the opening batch too: the group
    // only drains, and the moved hold is served at its end
    const before = q.slice(0, mine >= 0 ? mine : q.length);
    const moved = before.find((w) => !w.shared && w.movedBy);
    // I-207: this group is the gap of the phone block's next part (gapPass), and no hand-made move waits ahead: a reader
    // queued before that part (or for readerMaxWaitSec) joins past it and past the writers behind it, if it ends by the
    // gap's end
    const gp = blockPart(moved) && moved.gapPass?.token === h.token && mine >= 0 && gapEligible(q[mine], moved, now) && !before.some((w) => !w.shared && handMoved(w)) ? moved : null;
    const gEnd = gp ? gapEnd(h, gp) : null;
    if (gp && readerDeadline(kind, now, maxSec) > gEnd) return wait(`joins closed: this job's ${maxSec} s would end after the phone block's gap (the group of "${gp.owner}"'s gap ends ${iso(gEnd)}; I-207): it waits for the next gap`);
    if (moved && !gp) return wait(`joins closed: "${moved.owner}" waits for an exclusive hold, moved ahead by ${moved.movedBy} (I-097)`);
    if (writer && !inBatch && !gp) return wait(`joins closed: "${writer.owner}" waits for an exclusive hold (writer preference)`);
    // I-185: an in-batch join past a timing writer held at its host gate past the pass window is a gate pass: only when
    // this reader's cap ends before the writer's settling window (gateFits), and it is audited like one
    const joinPass = writer && gateHeldPastWindow(writer, now, T) ? writer : null;
    if (joinPass && !gateFits(joinPass, maxSec, now, T)) return wait(`joins closed: "${writer.owner}" waits at the host gate and this job's ${maxSec} s would not end ${GATE_PASS_SETTLE_SEC} s before its gate-timeout grant (I-185)`);
    // readers join in queue order (review-lock-share N4; a reader that stopped polling does not hold the others up).
    // I-049 head-of-line: a reader that fits may pass readers ahead that do not fit now, while each of them has waited
    // less than readerBypassSec; past that the group drains for them. A reader ahead that fits is never passed.
    const used = h.readers.reduce((a, x) => a + (x.weight || 1), 0);
    // (I-207: in a gap only the readers ahead that may join it now count)
    const ahead = q.slice(0, mine >= 0 ? mine : q.length).find((w) => w.shared && fresh(w)
      && (!gp || (gapEligible(w, gp, now) && readerDeadline(w.kind, now, w.maxSec || SHARED_LANE.maxSec) <= gEnd))
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
    if (joinPass) auditGatePass(r, { owner, head: joinPass, maxSec, now });
    return { ok: true, holder: g, reader: x, mode: 'shared' };
  }
  // free: reader entries are short-lane entries; right after a group a normal waiter goes first (groupGrant spends the
  // drain budget) unless a reader queued before it (I-049), and no reader passes a gated head writer then (the gate exemption is for short jobs between exclusive
  // holds only)
  const ni = q.length ? nextIndex(q, seen, now, owner, r, T) : -1;
  const afterGroup = !!seen.shared;
  // the opener is the waiter served next (readers in queue order, N4), or the first short-lane entry past a gate-held head
  const headOk = q.length === 0 || mine === ni || (!afterGroup && GATED[r] && ni >= 0 && gateHolding(q[ni], now, T) && mine === firstShortSeen(q, now, owner));
  // I-185: past the head's pass window, the reader picked by gatePassPick (its cap fits) opens a group, after a group too
  const fitPass = !headOk && GATED[r] && ni >= 0 && mine >= 0 && gatePassPick(q, ni, now, owner, T, rankOf) === q[mine] ? q[ni] : null;
  if (!headOk && !fitPass) return wait(`"${q[ni]?.owner}" is served first`);
  const x = reader();
  const g = groupWith({ resource: r, owner: GROUP_OWNER, kind: 'lease', token: randomBytes(6).toString('hex'), checkout: REPO, host: os.hostname(), acquiredAt: iso(now), openedAt: iso(now), meta: {}, short: true, maxSec: SHARED_LANE.maxSec, shared: true, format: SHARED_FORMAT }, [x]);
  writeJson(holderFile(r), g);
  writeJson(lastGrantFile(r), groupGrant(g, now));
  leaveQueue();
  if (giveGap(r, q, g, seen, now)) writeJson(queueFile(r), q); // I-207: a phone block part waiting in its gap: this group is it
  if (fitPass) auditGatePass(r, { owner, head: fitPass, maxSec, now });
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
export async function describeHold(r, { owner, job, run, runPid = process.pid, block, betweenMin, now = Date.now() } = {}) {
  checkName(r);
  // I-160: the phone block mark (a ticket id; null clears it and its window) and the between-holds window (minutes; 0 clears)
  if ((block !== undefined || betweenMin !== undefined) && r !== 'iphone') throw new Error(`--block and --between mark a phone block on the iphone lease (not ${r})`);
  if (block != null && !BLOCK_ID.test(String(block))) throw new Error(`--block must be a ticket id such as P-114 (letters, digits, . _ -; got "${block}")`);
  if (betweenMin !== undefined && !(Number.isFinite(betweenMin) && betweenMin >= 0 && betweenMin <= 120)) throw new Error(`--between must be minutes 0..120 (got ${betweenMin})`);
  const apply = (m) => {
    const meta = { ...(m || {}) };
    if (job === null) delete meta.job; else if (job) meta.job = job;
    if (run === null) {
      // I-155: an inner run's end gives the marker back to the outer run (a `lock.mjs run iphone` command) while that lives
      if (meta.run && meta.run.pid === runPid) { const o = meta.run.outer; if (o && pidAlive(o.pid)) meta.run = o; else delete meta.run; }
    } else if (run) {
      const cur = meta.run && meta.run.pid !== run.pid && pidAlive(meta.run.pid) ? (({ outer, ...x }) => x)(meta.run) : null;
      meta.run = { ...run, ...(cur ? { outer: cur } : {}) };
      if (!run.lockRun && !run.cooling) delete meta.between; // a phone run ends the window (I-160); a lock.mjs run iphone wrapper or a cooling wait (I-168) does not
    }
    if (block === null) { delete meta.block; delete meta.between; } else if (block && meta.block?.id !== String(block)) meta.block = { id: String(block), at: iso(now) };
    if (betweenMin === 0) delete meta.between; else if (betweenMin) meta.between = { at: iso(now), until: iso(now + betweenMin * 60000) };
    return meta;
  };
  return withGuard(r, () => {
    const h = readJson(holderFile(r), null);
    if (!h || staleReason(h, now)) {
      // I-202: the block owner marks the gap after its phone hold ended (only --between, --block none)
      const gapOnly = r === 'iphone' && job === undefined && run === undefined && (betweenMin !== undefined || block === null) && (block === undefined || block === null);
      const g = gapOnly ? markBlockGap(h, { owner, block, betweenMin, now }) : null;
      if (g) return g;
      throw new Error(`${r} is not held${h ? ` (the last holder "${h.owner}" is stale)` : ''}: describe a job on your own live hold (node tools/lock.mjs status ${r})${r === 'iphone' && gapOnly ? `; --between and --block none after a hold work only for the owner of the block's last hold, within ${PHONE_HOLD.gapMarkSec} s of its end or while its window is open (I-202)` : ''}`);
    }
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
    if (r === 'iphone') { if (run) openUse(h, run, now); else if (run === null) closeUse(h, runPid, now); } // I-167: the ledger's run marks
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
    // I-168: a process hold without an expiry (`lock.mjs run iphone`) ends with its process: nothing to renew (an expiry
    // set here would make the live hold stale; iphone.mjs run renews before every run)
    if (h.kind === 'process' && !h.expiresAt) return { ...h, kept: true };
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
export async function acquire(r, { owner, kind = 'process', ttlSec, meta, short = false, shared = false, weight = 1, job, sim, maxSec, held = process.env.FW_LOCK_HELD, sharedHeld = process.env.FW_LOCK_SHARED, timeoutSec = 3600, pollMs = 2000, maxPollMs = short || shared ? 3000 : 15000, log = (s) => console.error(s), thresholds: T = THRESHOLDS, hostSamplers, noTiming = false, awake, cpuSampler = cpuTimes, busyWindowMs = SHARED_LANE.busyWindowMs } = {}) {
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
    const res = await tryAcquire(r, { owner, kind, ttlSec, meta, short, shared, weight, job, sim, maxSec, held, sharedHeld, host, thresholds: T, noTiming, awake, busyPct, simWarm: gateWarm });
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
        // I-168: a hold this process turned into a keep window (keepHold), or that the owner's next part took over, is not this process's to drop
        const drop = () => { const h = readJson(holderFile(r), null); if (h && h.token === res.holder.token && !h.keep && (h.kind !== 'process' || h.pid === res.holder.pid)) { unlinkSync(holderFile(r)); noteRelease(r, h, 'process hold ended'); return h; } return null; };
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
    if (res.deferred) {
      // I-160: a Simulator session deferred by a phone block: not queued; polls on (it re-queues when the window opens)
      if (Date.now() - t0 > timeoutSec * 1000) { await withGuard(r, () => dropDeferred(r, { owner, kind, pid: process.pid })); throw new Error(`[lock ${r}] timed out after ${timeoutSec} s; ${res.why}`); }
      if (Date.now() - lastLog > 30000) { log(`[lock ${r}] ${res.why}`); lastLog = Date.now(); }
      await sleep(Math.min(wait, 5000) + Math.random() * 500);
      wait = Math.min(maxPollMs, Math.round(wait * 1.5));
      continue;
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

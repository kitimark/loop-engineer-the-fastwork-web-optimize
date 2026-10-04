// Idle alarm (incident I-105, user T-058 #4: "improve tools for ping you know our resource are not used for longer
// time"). The iPhone lease stood free for 14 min (03:10-03:24Z, 2026-10-04) while PASSed phone tickets waited, and no
// tool said so. This library notices a shared device that nobody uses while work waits for it, and says so once.
//
// Read-only on the locks: it never takes, renews or releases a lock or lease (it reads lock.mjs status(), the
// last-release and last-grant records and the tail of locks/holds.log), and touches no iPhone, Chrome or network.
//
// Alarm, per resource (iphone, chrome-measure): the lock has had no live holder for MORE than N minutes (default 5 for
// the iPhone, 10 for Chrome) AND ready work exists:
//   - queued waiters (lock status queue: entries refreshed within their queue TTL), or
//   - status-board rows that wait on it (readyRows): state "waiting", and
//       * --waiting-on phone (iphone) / chrome (chrome-measure): that resource, and nothing else is read; else
//       * a wait on the user or on an incident: none (the row is blocked on something else first); else
//       * the words of its --waiting-on text and its note: "phone"/"iphone" -> iphone; "chrome", "chrome-measure",
//         "measure", "measuring", "measurement(s)" -> chrome-measure; "lock(s)" -> chrome-measure unless the phone
//         is named too. Whole words only: a hyphenated name such as the agent iphone-runner does not count.
//     A row whose owner is already queued for that resource is listed once, as queued.
//
// Held but unused (I-111; fix-nav-morph held the lease ~6 min without a phone run while others queued): a held iPhone
// lease (not chrome-measure) is idle too when no phone run has used it for MORE than the same N minutes and someone
// other than the holder waits (the holder's own queue entry or board rows do not count). In use = a phone run's marker
// (holder meta.run, set by iphone.mjs run/scroll/record/gesture, a --warmup run included) names a live process. Last
// use (phoneUse) = the latest of: the lease's acquiredAt, the holder's lastRunAt (lib/lock.mjs describeHold stamps a
// run's start and end), a dead run marker's start, and the alarm's own sighting of a live run under this lease
// (state.json `activity` {token, at}; covers checkouts on older lock code). Its episode (kind "held") ends when the
// phone is used again, the lease is released or taken by another; the thread is addressed to the holder too.
// `iphone.mjs open`, `park`, a renew or `lock.mjs doing` are not phone runs, and neither is a phone-temp cooling wait.
// Not idle either (I-125; C-038 sat "ready" for the user's Start while the alarm called the lease unused): the holder
// has a console step the user is on (lib/phone-step.mjs userOnPhone: ready for Start, started, recording, or reset
// by a Start over), the rule of the lease grace (I-123 a); `OK iphone: … the user's step … is on the phone`, and it
// counts as a sighting of use, so the held-idle clock starts again when the step ends.
// Not idle either (I-144; T-121 told the user that their own phone time on PR-018 was idle): a lease the lead takes for
// the user's hand test, marked by its owner name: `user` or `user-<anything>` (e.g. `node tools/lock.mjs acquire iphone
// --owner user-try`); `OK iphone: held by user-try for the user's own hand test …`. It is never held-idle, however long
// the user takes; waiters still queue, and the free-period alarm starts again from its release.
// I-155 (a phone lease taken before its hold could start idled the iPhone; the alarm then fired on phone-side work):
//   - a not-ready waiter (lock.mjs acquire iphone --not-ready) is no ready work: it keeps its place, nobody waits on it;
//   - the holder is using the phone while it holds chrome-measure (its phone-block hold, exclusive or as a reader) or is
//     queued for it (`OK iphone: … holds the Chrome slot`), or while a `lock.mjs run iphone` command runs under its lease
//     (meta.run with lockRun: xctrace thermal gate, pre-warm); both count as a sighting of use, like a phone run.
//   - an alarm's episode keeps its owners (the holder of a held-idle lease; the waiting owners of a free one): the
//     status board shows a red alert on their rows while the episode is open (boardAlerts; lib/status.mjs boardAlertText),
//     and the watch prints one `NOTIFY <agent>` line each. The 5-min thread stays (user rule T-058, I-105).
// I-165 (fix-hero-exit-threaded idled the iPhone 9 min in `lock.mjs wait iphone --until mine --for N` on its own lease):
//   a held lease whose holder's only live process on it is a wait (a registered `lock.mjs wait iphone`, lib/waits.mjs)
//   is STUCK after SELF_WAIT_MIN minutes, whether or not someone else waits: `STUCK iphone: …`, an alarm like held-idle.
//   Not idle either (lead review of 10-04's idle alarms: 79 of 204 idle minutes were a holder waiting for the user's
//   Start): the holder's own open console step whose current part its runner has loading or ready, before the user's
//   Start (awaitsStart; any step kind with gated parts, the user's own test included). I-125 covered ready and started
//   phone steps; this adds a part still loading (e.g. "finish the previous swipe test first; this one loads after it")
//   and gated steps that are no phone step. `OK iphone: … its step … waits for the user's Start`, no thread.
// Queued is not use (phone-hold v2 T0, research/architecture/phone-hold-v2.md §5; mgmt-devices): the holder HOLDING
//   chrome-measure is use (I-155), but a holder only QUEUED for it (the T-150 kind of wait: the phone held 5-14 min
//   behind a Mac reader) is its own state, macWait: `OK iphone: <holder> waits for its Mac hold since hh:mm`, no use
//   sighting; past the phone limit (5 min) of that wait while others wait for the phone it alarms (`IDLE iphone: …
//   has waited N min for its Mac hold`), with the NOTIFY line and the red /status alert to the holder.
//
// Free since (freeSince): the latest end of a hold that came after the last grant:
//   - <r>.last-release.json (lib/lock.mjs noteRelease: a release, a process hold's end, the last shared reader leaving),
//   - the newest locks/holds.log line for the resource (every `lock.mjs run` hold, also from checkouts on older lock
//     code that write no release record),
//   - a stale lease's expiresAt (the lease ran out without a release);
// evidence older than the last grant (or than a stale holder's acquiredAt) belongs to an earlier free period and is
// ignored. With no usable evidence (e.g. a process holder that died without releasing, or a release by older lock
// code), the alarm counts from its own first sighting of this free period (state.json `seen`, keyed by the grant,
// release and stale-holder tokens), so `watch` is accurate to one poll and `check` to the previous check.
//
// Episodes: one free period = one episode, identified by its start (freeSince). The first alarm of an episode prints a
// line and posts one console thread (as the lead, assigned to the steward only, I-175: workers are never assignees;
// the steward nudges them by message, unset or parked: no assignee, the lead's triage); later polls of the same episode post nothing. When the resource is held again
// the episode ends: one ENDED line, and its thread is closed with a note by the next run as the lead (toClose). State (shared by every worktree):
//   <git-common-dir>/fastwork-mirror/idle/state.json   ($FW_STATE_DIR/idle/ in tests), under the "idle-alarm" guard.
import { mkdirSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, lastRelease, lastGrant, holdsLogFile, withGuard, isGroup, liveReaders } from './lock.mjs';
import { list as statusList } from './status.mjs';
import { readJson, writeJson, iso } from './store.mjs';
import { ownerPhoneStep, readSteps, stepText, isOpen } from './phone-step.mjs';
import { listWaits } from './waits.mjs';
import { stewardLine } from './thread-routing.mjs';

export const SCHEMA = 'fw-idle/1';
export const RESOURCES = Object.freeze({
  iphone: { name: 'the iPhone', short: 'iPhone', defaultMin: 5, waitKind: 'phone' },
  'chrome-measure': { name: 'the Chrome slot (chrome-measure)', short: 'Chrome slot', defaultMin: 10, waitKind: 'chrome' },
});
export const RESOURCE_NAMES = Object.keys(RESOURCES);
export const MIN_INTERVAL_SEC = 30; // never poll faster (the lead's rule for this tool)
export const DEFAULT_INTERVAL_SEC = 60;
export const CLAIM_TTL_MS = 120000; // a post claim older than this belongs to a poster that died
const GUARD = 'idle-alarm';
const HOLDS_TAIL_BYTES = 256 * 1024;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_ASSIGNEES = 8; // console-threads LIMITS.assignees

export const idleDir = () => join(sharedStateDir(), 'idle');
export const stateFile = () => join(idleDir(), 'state.json');
export const readState = () => {
  const s = readJson(stateFile());
  return s && s.schema === SCHEMA && s.resources && typeof s.resources === 'object' ? s : { schema: SCHEMA, resources: {} };
};

// ---- ready work: which board rows wait on which resource -----------------------------------------------------

export const PHONE_WORDS = /(?<![\w-])i?phones?(?![\w-])/i;
export const CHROME_WORDS = /(?<![\w-])(?:chrome(?:-measure)?|measure|measuring|measurements?)(?![\w-])/i;
export const LOCK_WORDS = /(?<![\w-])locks?(?![\w-])/i;

/** The resources a status-board row waits on (see the header): [] or some of ['iphone', 'chrome-measure'], with why. */
export function rowWaitsOn(row) {
  if (!row || row.state !== 'waiting') return [];
  const w = row.waitingOn || null;
  if (w?.kind === 'phone') return [{ resource: 'iphone', why: 'waits on the phone' }];
  if (w?.kind === 'chrome') return [{ resource: 'chrome-measure', why: 'waits on the Chrome slot' }];
  if (w?.kind === 'user' || w?.kind === 'incident') return [];
  const out = [];
  const inWait = String(w?.text || ''), inNote = String(row.note || '');
  const where = (re) => (re.test(inWait) ? 'its wait' : re.test(inNote) ? 'its note' : null);
  const phone = where(PHONE_WORDS);
  if (phone) out.push({ resource: 'iphone', why: `${phone} names the phone` });
  const chrome = where(CHROME_WORDS) || (!phone && where(LOCK_WORDS));
  if (chrome) out.push({ resource: 'chrome-measure', why: `${chrome} names Chrome or a measurement` });
  return out;
}

/**
 * Ready work for `r`: {queue: [{owner}], rows: [{id, owner, why}]}; rows whose owner is queued are left out, and so is
 * everything of `exclude` (the holder of a held-idle lease, I-111: its own wait is not someone else's).
 */
export function readyWork(r, { st, rows = [], exclude = null }) {
  const queue = [];
  for (const w of st?.queue || []) if (w?.owner && !w.notReady && w.owner !== exclude && !queue.some((x) => x.owner === w.owner)) queue.push({ owner: w.owner }); // I-155: a not-ready waiter is no ready work
  const queued = new Set(queue.map((x) => x.owner));
  const out = [];
  for (const row of rows) {
    const hit = rowWaitsOn(row).find((x) => x.resource === r);
    if (!hit || queued.has(row.owner) || (row.aliases || []).some((a) => queued.has(a))) continue;
    if (exclude && (row.owner === exclude || (row.aliases || []).includes(exclude))) continue;
    out.push({ id: row.id, owner: row.owner, why: hit.why });
  }
  return { queue, rows: out };
}

// ---- time math ------------------------------------------------------------------------------------------------

const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

/** The newest end (ms) of a holds.log line for `r` in `lines` (parsed objects or JSON strings), or null. */
export function holdsLogEnd(r, lines = []) {
  let end = null;
  for (const x of lines) {
    let o = x;
    if (typeof x === 'string') { try { o = JSON.parse(x); } catch { continue; } }
    if (!o || o.resource !== r) continue;
    const t = ms(o.endedAt) ?? ms(o.at);
    if (t !== null && (end === null || t > end)) end = t;
  }
  return end;
}

/** The last `bytes` of locks/holds.log as lines (a partial first line is dropped); [] without the file. */
export function holdsLogTail(bytes = HOLDS_TAIL_BYTES) {
  let fd;
  try {
    fd = openSync(holdsLogFile(), 'r');
    const size = fstatSync(fd).size, n = Math.min(size, bytes), buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString('utf8').split('\n');
    if (size > n) lines.shift();
    return lines.filter(Boolean);
  } catch { return []; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

/** The free period's key: changes on every grant, release or stale holder (the `seen` record is valid only within it). */
export const periodKey = ({ st, rel, grant }) => `${grant?.token || '-'}/${rel?.token || '-'}/${st?.holder?.token || '-'}`;

/**
 * Since when `r` stands free. In: st (lock status()), rel (lastRelease), grant (lastGrant), holdsEnd (ms, holdsLogEnd),
 * seen ({key, at} of this alarm's first sighting), now (ms). Out: {held: true, holder} while a live holder (a shared
 * group counts) has it; else {held: false, since (ms), how, key, observed: bool}.
 */
export function freeSince({ st, rel = null, grant = null, holdsEnd = null, seen = null, now = Date.now() }) {
  const h = st?.holder || null;
  if (h && !st.stale) return { held: true, holder: h };
  const key = periodKey({ st, rel, grant });
  const bound = Math.max(ms(grant?.at) ?? -Infinity, ms(h?.acquiredAt) ?? -Infinity);
  const cands = [];
  const relAt = ms(rel?.at);
  if (relAt !== null && relAt >= bound && relAt <= now) cands.push([relAt, `released by ${rel.owner || '?'}${rel.how && rel.how !== 'release' ? ` (${rel.how})` : ''}`]);
  if (holdsEnd !== null && holdsEnd >= bound && holdsEnd <= now) cands.push([holdsEnd, 'last hold in holds.log ended']);
  const exp = ms(h?.expiresAt);
  if (h && exp !== null && exp <= now && exp >= bound) cands.push([exp, `the lease of ${h.owner || '?'} ran out`]);
  if (cands.length) {
    const [since, how] = cands.reduce((a, b) => (b[0] > a[0] ? b : a));
    return { held: false, since, how, key, observed: false };
  }
  if (seen && seen.key === key && ms(seen.at) !== null && ms(seen.at) <= now) return { held: false, since: ms(seen.at), how: 'first seen free by the idle alarm (no release record)', key, observed: true };
  return { held: false, since: now, how: 'first seen free now (no release record)', key, observed: true };
}

const pidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * I-111: how a held iPhone lease is used. In: h (the live holder record), activity ({token, at}: the alarm's last
 * sighting of a live phone run under this lease), now. Out: {busy: true} while a phone run's marker (meta.run, set by
 * iphone.mjs run/scroll/record/gesture) names a live process; else {since (ms), how}: the latest of the lease's grant,
 * the holder's lastRunAt (lib/lock.mjs describeHold: a run's start or end), a dead run marker's start, the sighting.
 */
export function phoneUse(h, { activity = null, now = Date.now(), isAlive = pidAlive } = {}) {
  const run = h?.meta?.run || null;
  if (run && isAlive(run.pid)) return { busy: true };
  const who = h?.owner || '?';
  const cands = [[ms(h?.acquiredAt), `lease taken by ${who}`], [ms(h?.lastRunAt), `last phone run of ${who}`]];
  if (run) cands.push([ms(run.since), `a phone run of ${who} started (its process is gone)`]);
  if (activity && activity.token && activity.token === h?.token) cands.push([ms(activity.at), 'a phone run seen by the idle alarm']);
  const ok = cands.filter(([t]) => t !== null && t <= now);
  if (!ok.length) return { since: now, how: `held by ${who}, no record of its use` };
  const [since, how] = ok.reduce((a, b) => (b[0] > a[0] ? b : a));
  return { since, how };
}

/**
 * I-155: the lease holder's use of chrome-measure (`cm`, its lock status): 'holds' while it holds it (exclusive, or as a
 * live reader of a shared group), 'queued' while it waits for it (a ready entry), else null.
 */
export function chromeUse(owner, cm, now = Date.now()) {
  if (!owner || !cm) return null;
  const h = cm.holder;
  if (h && !cm.stale) {
    if (isGroup(h) ? liveReaders(h, now).some((x) => x.owner === owner) : h.owner === owner) return 'holds';
  }
  return (cm.queue || []).some((w) => w && w.owner === owner && !w.notReady) ? 'queued' : null;
}

/** T0: since when `owner` has stood (ready) in the chrome-measure queue (its entry's `since`, ms; `now` if unknown). */
export function macQueued(owner, cm, now = Date.now()) {
  const w = (cm?.queue || []).find((x) => x && x.owner === owner && !x.notReady);
  if (!w) return null;
  const t = ms(w.since);
  return t === null ? now : Math.min(t, now);
}

export const SELF_WAIT_MIN = 2;
/** I-165: an open step whose current part its runner has loading or ready, before the user's Start of that part. */
export const awaitsStart = (s) => isOpen(s) && Array.isArray(s.parts) && s.cur < s.parts.length && ['loading', 'ready'].includes(s.parts[s.cur]?.state);
/** I-165: the oldest live `lock.mjs wait <r>` of `owner` (from lib/waits.mjs listWaits records), or null. */
export function selfWait(owner, waits = [], r = 'iphone') {
  const mine = (waits || []).filter((w) => w && w.owner === owner && w.tool === 'lock.mjs wait' && String(w.what || '').startsWith(`lock ${r} `));
  if (!mine.length) return null;
  const w = mine.reduce((a, b) => (String(b.since) < String(a.since) ? b : a));
  return { what: w.what, since: ms(w.since), pid: w.pid };
}

/** I-144: a lease held for the user's own hand test: owner `user` or `user-<anything>` (e.g. the lead's `user-try`). */
export const isUserLease = (owner) => typeof owner === 'string' && /^user(-[A-Za-z0-9_.-]+)?$/.test(owner);

/** Whole minutes from `since` to `now` (floor, never negative). */
export const freeMinutes = (since, now) => Math.max(0, Math.floor((now - since) / 60000));

/**
 * One resource's verdict. In: r, st, rel, grant, holdsEnd, seen, rows (status-board items), min (threshold in
 * minutes), now. Out: {resource, held, holder?, since?, freeMin, how, key, observed, queue, rows, ready, alarm}.
 * alarm: free for MORE than `min` minutes (free ms > min x 60000) and ready work exists.
 */
export function assess(r, { st, rel, grant, holdsEnd, seen, activity = null, rows = [], steps = [], cm = null, waits = [], min = RESOURCES[r]?.defaultMin ?? 10, now = Date.now(), isAlive = pidAlive }) {
  const f = freeSince({ st, rel, grant, holdsEnd, seen, now });
  if (f.held && r === 'iphone' && !isGroup(f.holder)) {
    // I-111: a held iPhone lease is idle too while no phone run uses it (heldIdle; since = its last use)
    const holder = f.holder?.owner || '?', holderToken = f.holder?.token || null;
    const work = readyWork(r, { st, rows, exclude: holder });
    const ready = work.queue.length > 0 || work.rows.length > 0;
    // I-144: a lease the lead took for the user's own hand test (owner `user` or `user-*`) is the user's phone time
    if (isUserLease(holder)) return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: false, userLease: true, freeMin: 0, ...work, ready, alarm: false };
    const use = phoneUse(f.holder, { activity, now, isAlive });
    if (use.busy) return { resource: r, min, held: true, holder, holderToken, runLive: true, ...(f.holder?.meta?.run?.lockRun && { lockRun: true }), heldIdle: false, freeMin: 0, ...work, ready, alarm: false };
    // I-155: the holder's phone-block hold of chrome-measure is use of the phone too; queued for it is not (T0, below)
    const cu = chromeUse(holder, cm, now);
    if (cu === 'holds') return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: false, chromeUse: cu, freeMin: 0, ...work, ready, alarm: false };
    // I-125: the holder's console step the user is on (ready for Start, started, recording, or reset by Start over) is a
    // user wait, not idle (lib/phone-step.mjs ownerPhoneStep, the rule of the lease grace I-123 a)
    const us = ownerPhoneStep(holder, { steps, user: true });
    if (us) return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: false, userStep: stepText(us), freeMin: 0, ...work, ready, alarm: false };
    // I-165: the holder's own step waits for the user's Start (a part loading or ready): a user wait too, no thread
    const ws = (steps || []).find((x) => x && x.by === holder && awaitsStart(x));
    if (ws) return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: false, userStep: stepText(ws), userStart: true, freeMin: 0, ...work, ready, alarm: false };
    // I-165: the holder only waits on its own lease (a `lock.mjs wait iphone`): stuck after SELF_WAIT_MIN, waiters or not
    const sw = selfWait(holder, waits, r);
    const stuck = !!sw && sw.since !== null && now - Math.max(sw.since, use.since) > SELF_WAIT_MIN * 60000;
    // T0 (phone-hold v2 §5): queued for its Mac hold is a wait of its own, not use; it alarms past `min` of that wait
    const mq = cu === 'queued' ? macQueued(holder, cm, now) : null;
    const macWait = mq && { since: mq, min: freeMinutes(mq, now) };
    const over = macWait ? now - mq > min * 60000 : now - use.since > min * 60000;
    return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: true, since: use.since, freeMin: freeMinutes(use.since, now), how: use.how, key: `held:${holderToken || '-'}`, observed: false, ...work, ready,
      ...(sw && { selfWait: { what: sw.what, since: sw.since, min: freeMinutes(sw.since, now) } }), ...(stuck && { stuck: true }), ...(macWait && { macWait }), alarm: stuck || (ready && over) };
  }
  const work = readyWork(r, { st, rows });
  const ready = work.queue.length > 0 || work.rows.length > 0;
  if (f.held) return { resource: r, min, held: true, holder: f.holder?.owner || (isGroup(f.holder) ? '(shared)' : '?'), freeMin: 0, ...work, ready, alarm: false };
  const freeMs = now - f.since;
  return { resource: r, min, held: false, since: f.since, freeMin: freeMinutes(f.since, now), how: f.how, key: f.key, observed: f.observed, ...work, ready, alarm: ready && freeMs > min * 60000 };
}

/** Read everything assess() needs for each resource from the live stores (read-only). */
export function gather({ now = Date.now(), resources = RESOURCE_NAMES, state = readState() } = {}) {
  const rows = statusList();
  const tail = holdsLogTail();
  const sts = Object.fromEntries(resources.map((r) => [r, lockStatus(r)]));
  return resources.map((r) => ({
    r, st: sts[r], rel: lastRelease(r), grant: lastGrant(r), holdsEnd: holdsLogEnd(r, tail), seen: state.resources?.[r]?.seen || null,
    activity: state.resources?.[r]?.activity || null, rows, now,
    ...(r === 'iphone' && { steps: readSteps(), cm: sts['chrome-measure'] || lockStatus('chrome-measure'), waits: listWaits({ now }) }), // I-155, I-165
  }));
}

// ---- words ----------------------------------------------------------------------------------------------------

const hhmm = (t) => `${iso(t).slice(11, 16)}Z`;
const forText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const workList = (a) => [
  ...a.queue.map((x) => `${x.owner} (queued for it)`),
  ...a.rows.map((x) => `${x.id} (owner ${x.owner}; ${x.why})`),
].join(', ');

/** The stdout line for one assessment (check prints one per resource; watch prints alarms and ends). */
export function lineFor(a) {
  const R = RESOURCES[a.resource]?.short || a.resource;
  if (a.held && a.heldIdle && a.stuck) { // I-165
    const R = RESOURCES[a.resource]?.short || a.resource;
    return `STUCK ${a.resource}: ${a.holder} holds the ${R} lease but its only process on it is a wait (${a.selfWait.what}, for ${forText(a.selfWait.min)}; no phone run since ${hhmm(a.since)}): the lease is already its own, so that wait idles the phone; end it and run the phone part (I-165)${a.ready ? `; waiting: ${workList(a)}` : ''}`;
  }
  if (a.held && a.heldIdle && a.macWait && !a.stuck) { // T0 (phone-hold v2 §5): queued for its Mac hold is not use
    const tail = `(since ${hhmm(a.macWait.since)}; no phone run since ${hhmm(a.since)})`;
    if (a.alarm) return `IDLE ${a.resource}: ${R} held by ${a.holder}, which has waited ${forText(a.macWait.min)} for its Mac hold ${tail}, over the ${a.min} min limit, while work waits: ${workList(a)}`;
    return `OK ${a.resource}: ${a.holder} waits for its Mac hold since ${hhmm(a.macWait.since)} (${forText(a.macWait.min)}; not use of the phone)${a.ready ? `; waiting: ${workList(a)}` : ''}`;
  }
  if (a.held && a.heldIdle) { // I-111
    const use = `(${a.alarm ? 'no phone run ' : ''}since ${hhmm(a.since)}, ${a.how})`;
    if (a.alarm) return `IDLE ${a.resource}: ${R} held by ${a.holder} but unused for ${forText(a.freeMin)} ${use}, over the ${a.min} min limit, while work waits: ${workList(a)}`;
    const head = `OK ${a.resource}: held by ${a.holder}; no phone run for ${forText(a.freeMin)} ${use}`;
    return a.ready ? `${head}, under the ${a.min} min limit; waiting: ${workList(a)}` : `${head}, nobody else waits`;
  }
  if (a.held && a.userLease) return `OK ${a.resource}: held by ${a.holder} for the user's own hand test (the user's phone time, not idle; I-144)`;
  if (a.held && a.userStart) return `OK ${a.resource}: held by ${a.holder}; its step ${a.userStep} waits for the user's Start (a user wait, not idle; I-165)`;
  if (a.held && a.userStep) return `OK ${a.resource}: held by ${a.holder}; the user's step ${a.userStep} is on the phone (a user wait, not idle)`; // I-125
  if (a.held && a.chromeUse) return `OK ${a.resource}: held by ${a.holder}, which holds the Chrome slot (its phone-block hold): in use, not idle (I-155)`;
  if (a.held) return `OK ${a.resource}: held by ${a.holder}${a.runLive ? (a.lockRun ? ' (a lock.mjs run iphone command is on)' : ' (a phone run is on)') : ''}`;
  const free = `free for ${forText(a.freeMin)} (since ${hhmm(a.since)}, ${a.how})`;
  if (a.alarm) return `IDLE ${a.resource}: ${R} ${free}, over the ${a.min} min limit, while work waits: ${workList(a)}`;
  if (!a.ready) return `OK ${a.resource}: ${free}, no ready work`;
  return `OK ${a.resource}: ${free}, under the ${a.min} min limit; waiting: ${workList(a)}`;
}

/**
 * The owners an alarm concerns (agent names; at most 8): the idle holder, the queue, the waiting rows. They get the
 * watch's NOTIFY lines and the red /status alert; they are never the thread's assignees (I-175, user T-155 #5: the
 * thread goes to the steward, thread-routing stewardTo, who nudges them by message).
 */
export function addressees(a) {
  const names = [a.heldIdle ? a.holder : null, ...a.queue.map((x) => x.owner), ...a.rows.map((x) => x.owner)].filter((n) => n && n !== 'lead' && n !== 'user' && AGENT.test(n));
  return [...new Set(names)].slice(0, MAX_ASSIGNEES);
}

/**
 * The watch's `NOTIFY <n>: …` text for addressee `n` of a new alarm (I-155; the /status alert says the same). I-165: the
 * holder of a STUCK lease is told to end its wait on its own lease.
 */
export function notifyLine(a, n) {
  const R = RESOURCES[a.resource]?.short || a.resource, holder = n === a.holder && a.heldIdle;
  if (holder && a.macWait && !a.stuck) return `NOTIFY ${n}: you hold the ${R} lease while you wait for your Mac hold (${a.macWait.min} min) and others wait for the phone: release it (or queue with --not-ready) until your Mac hold comes, or ask the lead (status board alert; phone-hold v2 T0)`;
  if (holder && a.stuck) return `NOTIFY ${n}: you hold the ${R} lease and your only process on it is a wait on it (${a.selfWait.what}, for ${a.selfWait.min} min): end that wait and run your phone part, or release the lease (I-165)`;
  return `NOTIFY ${n}: ${holder ? 'you hold the iPhone lease with no phone run' : `${R} ${a.heldIdle ? `held by ${a.holder} unused` : 'free'}`} for ${a.freeMin} min while ${holder ? 'others wait' : 'you wait'} (status board alert; I-155)`;
}

/** The console thread for one alarm: {title, text}. Names and minutes only (no notes, URLs or devices; Hard rule 12). */
export function threadFor(a, { steward = null } = {}) {
  const R = RESOURCES[a.resource] || { name: a.resource, short: a.resource };
  const n = a.queue.length + a.rows.length;
  const jobs = `${n} ${n === 1 ? 'job waits' : 'jobs wait'}`;
  const waits = [];
  if (a.queue.length) waits.push(`Queued for it: ${a.queue.map((x) => x.owner).join(', ')}.`);
  if (a.rows.length) waits.push(`Waiting on the status board: ${a.rows.map((x) => `${x.id} (owner ${x.owner}; ${x.why})`).join('; ')}.`);
  if (a.heldIdle) { // I-111: held, but no phone run
    const L = [`${a.holder} has held the iPhone lease for ${forText(a.freeMin)} without a phone run (iphone.mjs run, scroll, record or gesture; since ${hhmm(a.since)}, ${a.how}). The limit is ${a.min} min.`, ...waits];
    if (a.stuck) L.splice(1, 0, `Its only process on the lease is a wait on that same lease (${a.selfWait.what}, for ${forText(a.selfWait.min)}), which can not end while it holds the lease: stop that wait (I-165).`);
    // I-175: facts for the steward, no line addressed to the holder (the steward nudges it by message)
    L.push(`What unblocks it: ${a.holder} runs its phone part now, or releases the lease (node tools/lock.mjs release iphone --owner ${a.holder}), or says why it waits.`);
    L.push(stewardLine(steward, [a.holder]));
    L.push('One message per idle period; this thread closes by itself when the phone is used again or released (tools/idle.mjs, I-105, I-111).');
    return { title: `${R.short} held by ${a.holder}, unused for ${forText(a.freeMin)} while ${jobs}`, text: L.join('\n') };
  }
  const title = `${R.short} free for ${forText(a.freeMin)} while ${jobs}`;
  const L = [`${R.name[0].toUpperCase()}${R.name.slice(1)} has had no holder for ${forText(a.freeMin)} (since ${hhmm(a.since)}; ${a.how}). The limit is ${a.min} min.`, ...waits];
  const next = addressees(a);
  L.push(`What unblocks it: ${next.length ? `the next of ${next.join(', ')}` : 'the next owner'} takes it${a.resource === 'iphone' ? ' (node tools/lock.mjs acquire iphone --owner <you> ...)' : ' (its queued hold, or node tools/lock.mjs run chrome-measure ...)'}.`);
  L.push(stewardLine(steward, next));
  L.push('One message per idle period; this thread closes by itself when the slot is taken (tools/idle.mjs, I-105).');
  return { title, text: L.join('\n') };
}

// ---- state: de-duplication per episode ------------------------------------------------------------------------

/** Why an episode ended, in plain words (the ENDED line and the note its thread is closed with). */
export function endNote(ep, a) {
  if (ep?.kind === 'held') { // I-111
    if (a.held && a.holder === ep.holder) return a.userStep ? `the user is on ${ep.holder}'s step` : `${ep.holder} used the phone again`;
    return a.held ? `taken by ${a.holder}` : `released by ${ep.holder}`;
  }
  return a.held ? `taken by ${a.holder}` : 'a new idle period started';
}

/**
 * Under the guard: record each assessment in the state and decide what to say. Returns per resource {a, news, ended}:
 *   news: 'alarm' for the first alarm of an episode (print it; post it when `claim` is true and the post is ours),
 *   ended: the finished episode {since, thread?, freeMin} when the resource is held again or a new free period began,
 *   post: this process claimed the episode's post, thread: the episode's thread once posted.
 * `claim`: also claim the episode's post for this process (pid), unless another live claim or a post exists.
 */
export async function record(assessments, { now = Date.now(), claim = false, pid = process.pid } = {}) {
  return withGuard(GUARD, () => {
    mkdirSync(idleDir(), { recursive: true });
    const s = readState();
    const out = [];
    for (const a of assessments) {
      const cur = s.resources[a.resource] || {};
      const res = { a, news: null, ended: null, post: false };
      const end = (ep) => ({ ...ep, endedAt: iso(now), heldBy: a.held ? a.holder : null, note: endNote(ep, a) });
      if (a.held && !a.heldIdle) {
        if (cur.episode) res.ended = end(cur.episode);
        delete cur.episode; delete cur.seen;
      } else {
        if (a.observed && (!cur.seen || cur.seen.key !== a.key)) cur.seen = { key: a.key, at: iso(a.since) };
        if (!a.observed) delete cur.seen;
        const since = iso(a.since), kind = a.heldIdle ? 'held' : 'free';
        if (cur.episode && (cur.episode.since !== since || (cur.episode.kind || 'free') !== kind)) { res.ended = end(cur.episode); delete cur.episode; }
        if (a.alarm) {
          // I-155: the episode keeps whom it concerns (the board's red alert on their rows, the watch's NOTIFY lines)
          if (!cur.episode) { cur.episode = { since, alarmedAt: iso(now), freeMin: a.freeMin, owners: addressees(a), ...(a.heldIdle && { kind, holder: a.holder }) }; res.news = 'alarm'; }
          const ep = cur.episode;
          const claimLive = ep.claim && now - (ms(ep.claim.at) ?? 0) < CLAIM_TTL_MS && ep.claim.pid !== pid;
          if (claim && !ep.thread && !claimLive) { ep.claim = { pid, at: iso(now) }; res.post = true; }
          if (ep.thread) res.thread = ep.thread;
        }
        // I-155: the board alert follows the alarm as it stands now (who waits, whether anyone still does)
        if (cur.episode) { cur.episode.alarmNow = !!a.alarm; if (a.alarm) cur.episode.owners = addressees(a); }
        // I-165: why a held-lease alarm stands, when it is not the plain held-idle rule (the board alert's wording)
        if (cur.episode && a.alarm) { if (a.stuck) cur.episode.why = 'stuck'; else if (a.macWait) cur.episode.why = 'mac-wait'; else delete cur.episode.why; }
      }
      // I-111: the alarm's own sighting of a live phone run, kept per lease (a checkout on older lock code stamps no lastRunAt)
      // (I-125: a user step on the phone counts as use too, so the held-idle clock starts again when the step ends)
      if ((a.runLive || a.userStep || a.chromeUse) && a.holderToken) cur.activity = { token: a.holderToken, at: iso(now) };
      else if (cur.activity && (!a.held || cur.activity.token !== a.holderToken)) delete cur.activity;
      s.resources[a.resource] = cur;
      out.push(res);
    }
    // an ended episode's thread waits here until the lead's run closes it (only the lead or an assignee may close)
    for (const res of out) {
      const t = res.ended?.thread;
      if (t && !(s.toClose ||= []).some((x) => x.thread === t)) s.toClose.push({ thread: t, resource: res.a.resource, note: res.ended.note, at: iso(now) });
    }
    s.updatedAt = iso(now);
    writeJson(stateFile(), s);
    return out;
  });
}

/** Under the guard: take (and clear) the threads of ended episodes that still need closing (the lead's run does). */
export async function takeToClose() {
  return withGuard(GUARD, () => {
    const s = readState();
    const list = s.toClose || [];
    if (!list.length) return [];
    s.toClose = [];
    writeJson(stateFile(), s);
    return list;
  });
}

/** Under the guard: the post for `r`'s episode `since` succeeded (thread id) or failed (the claim is dropped). */
export async function settle(r, since, { thread = null, by = null, error = null, now = Date.now() } = {}) {
  return withGuard(GUARD, () => {
    const s = readState();
    const ep = s.resources?.[r]?.episode;
    if (!ep || ep.since !== since) return null;
    delete ep.claim;
    if (thread) Object.assign(ep, { thread, postedBy: by, postedAt: iso(now) });
    if (error) ep.lastError = String(error).slice(0, 300);
    writeJson(stateFile(), s);
    return ep;
  });
}

// ---- I-155: the status board's red alert ------------------------------------------------------------------------

export const BOARD_FRESH_MS = 10 * 60000; // an episode is shown only while an alarm run (watch, check) updated the state lately

/**
 * The open idle episodes whose alarm stands as board alerts: [{resource, kind: 'held'|'free', holder, owners, since,
 * thread?}], [] when the state is older than BOARD_FRESH_MS (no alarm run keeps it current). Names only (Hard rule 12).
 */
export function boardAlerts({ state = readState(), now = Date.now() } = {}) {
  const at = ms(state.updatedAt);
  if (at === null || now - at > BOARD_FRESH_MS) return [];
  const out = [];
  for (const [r, cur] of Object.entries(state.resources || {})) {
    const ep = cur?.episode;
    const since = ms(ep?.since);
    if (!ep || since === null || !RESOURCES[r] || ep.alarmNow === false) continue;
    const owners = (Array.isArray(ep.owners) ? ep.owners : ep.holder ? [ep.holder] : []).filter((n) => typeof n === 'string' && AGENT.test(n));
    if (!owners.length) continue;
    out.push({ resource: r, kind: ep.kind === 'held' ? 'held' : 'free', holder: ep.holder || null, owners, since: ep.since, ...(ep.why && { why: ep.why }), ...(ep.thread && { thread: ep.thread }) });
  }
  return out;
}

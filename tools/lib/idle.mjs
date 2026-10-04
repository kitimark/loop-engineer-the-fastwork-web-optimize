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
// line and posts one console thread (as the lead, assigned to the desk and to the waiting owners, so the T-050 router
// and their `thread wait` reach them); later polls of the same episode post nothing. When the resource is held again
// the episode ends: one ENDED line, and its thread is closed with a note by the next run as the lead (toClose). State (shared by every worktree):
//   <git-common-dir>/fastwork-mirror/idle/state.json   ($FW_STATE_DIR/idle/ in tests), under the "idle-alarm" guard.
import { mkdirSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { status as lockStatus, lastRelease, lastGrant, holdsLogFile, withGuard, isGroup } from './lock.mjs';
import { list as statusList } from './status.mjs';
import { readJson, writeJson, iso } from './store.mjs';

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
  for (const w of st?.queue || []) if (w?.owner && w.owner !== exclude && !queue.some((x) => x.owner === w.owner)) queue.push({ owner: w.owner });
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

/** Whole minutes from `since` to `now` (floor, never negative). */
export const freeMinutes = (since, now) => Math.max(0, Math.floor((now - since) / 60000));

/**
 * One resource's verdict. In: r, st, rel, grant, holdsEnd, seen, rows (status-board items), min (threshold in
 * minutes), now. Out: {resource, held, holder?, since?, freeMin, how, key, observed, queue, rows, ready, alarm}.
 * alarm: free for MORE than `min` minutes (free ms > min x 60000) and ready work exists.
 */
export function assess(r, { st, rel, grant, holdsEnd, seen, activity = null, rows = [], min = RESOURCES[r]?.defaultMin ?? 10, now = Date.now(), isAlive = pidAlive }) {
  const f = freeSince({ st, rel, grant, holdsEnd, seen, now });
  if (f.held && r === 'iphone' && !isGroup(f.holder)) {
    // I-111: a held iPhone lease is idle too while no phone run uses it (heldIdle; since = its last use)
    const holder = f.holder?.owner || '?', holderToken = f.holder?.token || null;
    const work = readyWork(r, { st, rows, exclude: holder });
    const ready = work.queue.length > 0 || work.rows.length > 0;
    const use = phoneUse(f.holder, { activity, now, isAlive });
    if (use.busy) return { resource: r, min, held: true, holder, holderToken, runLive: true, heldIdle: false, freeMin: 0, ...work, ready, alarm: false };
    return { resource: r, min, held: true, holder, holderToken, runLive: false, heldIdle: true, since: use.since, freeMin: freeMinutes(use.since, now), how: use.how, key: `held:${holderToken || '-'}`, observed: false, ...work, ready, alarm: ready && now - use.since > min * 60000 };
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
  return resources.map((r) => ({
    r, st: lockStatus(r), rel: lastRelease(r), grant: lastGrant(r), holdsEnd: holdsLogEnd(r, tail), seen: state.resources?.[r]?.seen || null,
    activity: state.resources?.[r]?.activity || null, rows, now,
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
  if (a.held && a.heldIdle) { // I-111
    const use = `(${a.alarm ? 'no phone run ' : ''}since ${hhmm(a.since)}, ${a.how})`;
    if (a.alarm) return `IDLE ${a.resource}: ${R} held by ${a.holder} but unused for ${forText(a.freeMin)} ${use}, over the ${a.min} min limit, while work waits: ${workList(a)}`;
    const head = `OK ${a.resource}: held by ${a.holder}; no phone run for ${forText(a.freeMin)} ${use}`;
    return a.ready ? `${head}, under the ${a.min} min limit; waiting: ${workList(a)}` : `${head}, nobody else waits`;
  }
  if (a.held) return `OK ${a.resource}: held by ${a.holder}${a.runLive ? ' (a phone run is on)' : ''}`;
  const free = `free for ${forText(a.freeMin)} (since ${hhmm(a.since)}, ${a.how})`;
  if (a.alarm) return `IDLE ${a.resource}: ${R} ${free}, over the ${a.min} min limit, while work waits: ${workList(a)}`;
  if (!a.ready) return `OK ${a.resource}: ${free}, no ready work`;
  return `OK ${a.resource}: ${free}, under the ${a.min} min limit; waiting: ${workList(a)}`;
}

/** The owners to address (agent names), the desk first; at most 8 (a thread's assignee limit). */
export function addressees(a, desk = null) {
  const names = [desk, a.heldIdle ? a.holder : null, ...a.queue.map((x) => x.owner), ...a.rows.map((x) => x.owner)].filter((n) => n && n !== 'lead' && n !== 'user' && AGENT.test(n));
  return [...new Set(names)].slice(0, MAX_ASSIGNEES);
}

/** The console thread for one alarm: {title, text}. Names and minutes only (no notes, URLs or devices; Hard rule 12). */
export function threadFor(a, { desk = null } = {}) {
  const R = RESOURCES[a.resource] || { name: a.resource, short: a.resource };
  const n = a.queue.length + a.rows.length;
  const jobs = `${n} ${n === 1 ? 'job waits' : 'jobs wait'}`;
  const waits = [];
  if (a.queue.length) waits.push(`Queued for it: ${a.queue.map((x) => x.owner).join(', ')}.`);
  if (a.rows.length) waits.push(`Waiting on the status board: ${a.rows.map((x) => `${x.id} (owner ${x.owner}; ${x.why})`).join('; ')}.`);
  if (a.heldIdle) { // I-111: held, but no phone run
    const L = [`${a.holder} has held the iPhone lease for ${forText(a.freeMin)} without a phone run (iphone.mjs run, scroll, record or gesture; since ${hhmm(a.since)}, ${a.how}). The limit is ${a.min} min.`, ...waits];
    L.push(`${a.holder}: run your phone part now, or release the lease (node tools/lock.mjs release iphone --owner ${a.holder}) so the next one can start, or say here why it waits.${desk ? ` Desk (${desk}): please make sure the phone is used.` : ''}`);
    L.push('One message per idle period; this thread closes by itself when the phone is used again or released (tools/idle.mjs, I-105, I-111).');
    return { title: `${R.short} held by ${a.holder}, unused for ${forText(a.freeMin)} while ${jobs}`, text: L.join('\n') };
  }
  const title = `${R.short} free for ${forText(a.freeMin)} while ${jobs}`;
  const L = [`${R.name[0].toUpperCase()}${R.name.slice(1)} has had no holder for ${forText(a.freeMin)} (since ${hhmm(a.since)}; ${a.how}). The limit is ${a.min} min.`, ...waits];
  L.push(`Owners: take it now${a.resource === 'iphone' ? ' (node tools/lock.mjs acquire iphone --owner <you> ...)' : ' (your queued hold, or node tools/lock.mjs run chrome-measure ...)'}, or say here why not.${desk ? ` Desk (${desk}): please make sure the next one starts.` : ''}`);
  L.push('One message per idle period; this thread closes by itself when the slot is taken (tools/idle.mjs, I-105).');
  return { title, text: L.join('\n') };
}

// ---- state: de-duplication per episode ------------------------------------------------------------------------

/** Why an episode ended, in plain words (the ENDED line and the note its thread is closed with). */
export function endNote(ep, a) {
  if (ep?.kind === 'held') { // I-111
    if (a.held && a.holder === ep.holder) return `${ep.holder} used the phone again`;
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
          if (!cur.episode) { cur.episode = { since, alarmedAt: iso(now), freeMin: a.freeMin, ...(a.heldIdle && { kind, holder: a.holder }) }; res.news = 'alarm'; }
          const ep = cur.episode;
          const claimLive = ep.claim && now - (ms(ep.claim.at) ?? 0) < CLAIM_TTL_MS && ep.claim.pid !== pid;
          if (claim && !ep.thread && !claimLive) { ep.claim = { pid, at: iso(now) }; res.post = true; }
          if (ep.thread) res.thread = ep.thread;
        }
      }
      // I-111: the alarm's own sighting of a live phone run, kept per lease (a checkout on older lock code stamps no lastRunAt)
      if (a.runLive && a.holderToken) cur.activity = { token: a.holderToken, at: iso(now) };
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

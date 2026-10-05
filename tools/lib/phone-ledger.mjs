// Phone ledger (incident I-167, phone-hold v2 T1, research/architecture/phone-hold-v2.md §4.4): every iphone hold or
// lease writes ONE line to locks/holds.log at its end, with what its time went to, and `node tools/idle.mjs report
// --day` sums a day of them by cause. On 2026-10-04, 18 idle alarms (204 min) were reviewed by hand from threads, logs and
// lock files; idle gaps under 5 min, and any gap with nobody waiting, were invisible (no per-hold record existed).
//
// This module is pure (no lock, no file access): tools/lib/lock.mjs gathers the inputs at a hold's end (its holder
// record, the iphone queue, the holder's chrome-measure lines in holds.log and its live chrome-measure state, its console
// steps) and appends the line; tools/idle.mjs report reads the lines back.
//
// The line (resource "iphone", ledger 1): owner, kind, token, acquiredAt, endedAt, durationSec, how (release, process
// hold ended, stale: …), and the hold's seconds split into causes that add up to durationSec (each second goes to the
// first cause that covers it, in this order):
//   runSec      a phone run (iphone.mjs scroll|record|run|gesture marks it, lib/lock.mjs describeHold), or phone-side
//               work under the lease (`lock.mjs run iphone -- <cmd>`, I-155)
//   coolingSec  a cooling wait marked on the hold (a run mark with cooling: true; wait.mjs phone-temp marks it from T2 on)
//   userWaitSec the user's time: a console step of the holder from its first part loading / ready / Start until it is
//               answered, skipped or cancelled; the whole hold of a `user` / `user-*` owner (the user's own hand test)
//   macHoldSec  the holder holds chrome-measure (a phone part's Mac hold: use, I-155)
//   macWaitSec  the holder waits in the chrome-measure queue (phone-hold v2 §5: queued is not use)
//   idleSec     none of these; split by position into idleBeforeSec (before the first second of any cause above:
//               H-early), idleBetweenSec (between two: H-gap) and idleAfterSec (after the last: H-done)
// and, overlapping those: waitersPresentSec (someone else's ready entry, not --not-ready, was queued for the phone),
// idleWaitersSec (idle while a ready waiter was queued) and macWaitWaitersSec (Mac wait while a ready waiter was queued).
//
// Where the marks come from (all recorded by lib/lock.mjs on the holder record, so the line needs no other log):
//   h.uses    [{k: 'run'|'cooling', from, to?, pid}]: describeHold opens one at a run's start, closes it at its end.
//             An open use whose process is gone at the hold's end counts until its start only (zero), like the idle
//             alarm's dead run marker (lib/idle.mjs); a live one until the hold's end.
//   h.waiters [[from, to], ...]: every iphone tryAcquire of another owner while the hold is live extends it (from the
//             earliest ready entry's readyAt, else since), and so does the hold's end. A waiter that left between two
//             sightings counts until its last sighting.
// Mac hold / wait intervals come from the holder's chrome-measure lines in holds.log (acquiredAt-endedAt; queuedAt-
// acquiredAt, written by `lock.mjs run` since I-167) and its live chrome-measure holder or queue entry at the end.

export const LEDGER_VERSION = 1;
/** The causes that cover a second of a hold, in priority order (idle is what none covers). */
export const CAUSES = ['run', 'cooling', 'user', 'macHold', 'macWait'];
const FIELD = { run: 'runSec', cooling: 'coolingSec', user: 'userWaitSec', macHold: 'macHoldSec', macWait: 'macWaitSec', idle: 'idleSec' };
const MAX_USES = 200; // a hold with more run marks merges its two oldest closed ones (a 9-run block has ~20)
const MAX_WAITER_SPANS = 50;
const USER_OWNER = /^user(-[A-Za-z0-9_.-]+)?$/; // the user's own hand test (lib/lock.mjs isUserOwner)
const STEP_BEGIN = (x) => (x.action === 'ack' && (x.state === 'loading' || x.state === 'ready')) || x.action === 'start';
const STEP_CLOSE = new Set(['answer', 'skip', 'cancel']);

const ms = (s) => { const t = typeof s === 'number' ? s : Date.parse(s); return Number.isFinite(t) ? t : null; };
const iso = (t) => new Date(t).toISOString();
const sec = (x) => Math.round(x / 1000);
function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The ledger kind of holder `h`: user (owner user/user-*), keep (a keep window, T2), step (a console step lease, T3),
 *  process (a `lock.mjs run iphone` hold), lease (an agent's lease). */
export function ledgerKind(h) {
  if (USER_OWNER.test(String(h?.owner ?? ''))) return 'user';
  if (h?.keep) return 'keep';
  if (h?.meta?.step) return 'step';
  return h?.kind === 'process' ? 'process' : 'lease';
}

// ---- marks on the holder record (lib/lock.mjs calls these inside the iphone guard) ----------------------------------

/** A phone run (or cooling wait) of `run` ({pid, cooling?}) started at `now`: open a use on holder `h`. */
export function openUse(h, run, now = Date.now()) {
  const uses = Array.isArray(h.uses) ? h.uses : [];
  uses.push({ k: run.cooling ? 'cooling' : 'run', from: iso(now), ...(run.pid ? { pid: run.pid } : {}) });
  while (uses.length > MAX_USES) {
    const i = uses.findIndex((u, j) => j < uses.length - 1 && u.to && uses[j + 1].to && uses[j + 1].k === u.k);
    if (i < 0) { uses.shift(); continue; }
    uses.splice(i, 2, { k: uses[i].k, from: uses[i].from, to: uses[i + 1].to, merged: true });
  }
  h.uses = uses;
  return h;
}

/** The run of process `pid` ended at `now`: close its open use on holder `h` (no-op when there is none). */
export function closeUse(h, pid, now = Date.now()) {
  const u = (Array.isArray(h.uses) ? h.uses : []).findLast((x) => !x.to && x.pid === pid);
  if (u) u.to = iso(now);
  return !!u;
}

/** The ready waiters of queue `q` that are not the holder: entries without notReady (I-155). */
export const readyWaiters = (q, owner) => (Array.isArray(q) ? q : []).filter((w) => w && w.owner !== owner && !w.notReady);

/**
 * A sighting of queue `q` at `now` while `h` holds the phone: extend or open the holder's waiter span when a ready
 * waiter is queued. Returns true when `h.waiters` changed.
 */
export function observeWaiters(h, q, now = Date.now()) {
  const ws = readyWaiters(q, h.owner);
  if (!ws.length) return false;
  const a = ms(h.acquiredAt) ?? now;
  const first = Math.min(...ws.map((w) => ms(w.readyAt) ?? ms(w.since) ?? now));
  const from = Math.min(now, Math.max(a, first));
  const spans = Array.isArray(h.waiters) ? h.waiters : [];
  const last = spans[spans.length - 1];
  if (last && from <= ms(last[1])) { if (ms(last[1]) >= now) return false; last[1] = iso(now); }
  else spans.push([iso(from), iso(now)]);
  while (spans.length > MAX_WAITER_SPANS) spans.splice(0, 2, [spans[0][0], spans[1][1]]);
  h.waiters = spans;
  return true;
}

// ---- intervals -------------------------------------------------------------------------------------------------------

/** Run / cooling intervals of holder `h` up to `end` ({run: [[a, b]], cooling: [[a, b]]}). */
export function useIntervals(h, end, { isAlive = pidAlive } = {}) {
  const out = { run: [], cooling: [] };
  for (const u of Array.isArray(h?.uses) ? h.uses : []) {
    const a = ms(u.from);
    if (a === null) continue;
    const b = u.to ? ms(u.to) : u.pid && isAlive(u.pid) ? end : a; // a dead, unclosed mark: its start only
    (out[u.k === 'cooling' ? 'cooling' : 'run']).push([a, b ?? a]);
  }
  return out;
}

/** The chrome-measure hold and wait intervals of `owner`: from holds.log lines and the live chrome-measure status `mac`. */
export function macIntervals(owner, lines = [], mac = null, end = Date.now()) {
  const hold = [], wait = [];
  for (const l of lines) {
    if (!l || l.resource !== 'chrome-measure' || l.owner !== owner) continue;
    const a = ms(l.acquiredAt), b = ms(l.endedAt), q = ms(l.queuedAt);
    if (a !== null && b !== null) hold.push([a, b]);
    if (q !== null && a !== null && q < a) wait.push([q, a]);
  }
  const h = mac?.holder;
  if (h && !mac.stale) {
    if (Array.isArray(h.readers)) { for (const x of h.readers) if (x.owner === owner && ms(x.acquiredAt) !== null) hold.push([ms(x.acquiredAt), end]); }
    else if (h.owner === owner && ms(h.acquiredAt) !== null) hold.push([ms(h.acquiredAt), end]);
  }
  for (const w of mac?.queue || []) if (w.owner === owner && ms(w.since) !== null) wait.push([ms(w.since), end]);
  return { macHold: hold, macWait: wait };
}

/** The user's time on `owner`'s console steps (lib/phone-step.mjs records): first loading/ready/Start to the close. */
export function stepIntervals(owner, steps = [], end = Date.now()) {
  const out = [];
  for (const s of steps) {
    if (!s || s.by !== owner) continue;
    const hist = Array.isArray(s.history) ? s.history : [];
    const begin = hist.find(STEP_BEGIN);
    if (!begin || ms(begin.at) === null) continue;
    const a = ms(begin.at);
    let b = end;
    for (const x of hist) {
      if (ms(x.at) === null || ms(x.at) < a) continue;
      if (STEP_CLOSE.has(x.action)) b = ms(x.at);
      else if (x.action === 'reopen') b = end;
    }
    out.push([a, Math.max(a, b)]);
  }
  return out;
}

const covers = (list, t) => list.some(([a, b]) => a <= t && t < b);

/**
 * The ledger line of holder `h` that ended at `endedAt` (ms or ISO). Inputs (all optional): queue (the iphone queue at
 * the end: a last waiter sighting), macLines (holds.log lines), mac (chrome-measure status), steps (console steps),
 * how (why it ended), isAlive (pid check). Pure apart from isAlive.
 */
export function phoneLedger(h, { endedAt, how = 'released', queue = [], macLines = [], mac = null, steps = [], isAlive = pidAlive } = {}) {
  const A = ms(h.acquiredAt), E0 = ms(endedAt) ?? Date.now();
  const E = Math.max(A ?? E0, E0);
  const kind = ledgerKind(h);
  const hw = { ...h, waiters: (h.waiters || []).map((x) => [...x]) };
  observeWaiters(hw, queue, E);
  const sets = { ...useIntervals(h, E, { isAlive }), user: kind === 'user' ? [[A, E]] : stepIntervals(h.owner, steps, E), ...macIntervals(h.owner, macLines, mac, E) };
  const waiters = (hw.waiters || []).map(([a, b]) => [ms(a), ms(b)]).filter(([a, b]) => a !== null && b !== null);
  const pts = new Set([A, E]);
  for (const list of [...Object.values(sets), waiters]) for (const [a, b] of list) for (const t of [a, b]) if (t > A && t < E) pts.add(t);
  const P = [...pts].sort((x, y) => x - y);
  const acc = { run: 0, cooling: 0, user: 0, macHold: 0, macWait: 0, idle: 0, waiters: 0, idleWaiters: 0, macWaitWaiters: 0 };
  const segs = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], len = b - a, mid = a + len / 2;
    const cause = CAUSES.find((k) => covers(sets[k], mid)) || 'idle';
    const w = covers(waiters, mid);
    acc[cause] += len;
    if (w) { acc.waiters += len; if (cause === 'idle') acc.idleWaiters += len; if (cause === 'macWait') acc.macWaitWaiters += len; }
    segs.push([a, b, cause]);
  }
  const used = segs.filter((x) => x[2] !== 'idle');
  const F = used.length ? used[0][0] : E, L = used.length ? used[used.length - 1][1] : E;
  let before = 0, between = 0, after = 0;
  for (const [a, b, c] of segs) if (c === 'idle') { if (b <= F) before += b - a; else if (a >= L) after += b - a; else between += b - a; }
  const line = {
    at: iso(Date.now()), resource: 'iphone', ledger: LEDGER_VERSION, owner: h.owner, kind, token: h.token ?? null, how,
    acquiredAt: A === null ? null : iso(A), endedAt: iso(E), durationSec: sec(E - (A ?? E)),
  };
  for (const k of [...CAUSES, 'idle']) line[FIELD[k]] = sec(acc[k]);
  Object.assign(line, { idleBeforeSec: sec(before), idleBetweenSec: sec(between), idleAfterSec: sec(after), waitersPresentSec: sec(acc.waiters), idleWaitersSec: sec(acc.idleWaiters), macWaitWaitersSec: sec(acc.macWaitWaiters) });
  if (h.meta?.block?.id) line.block = h.meta.block.id;
  return line;
}

// ---- the day's report (idle.mjs report --day) ---------------------------------------------------------------------

/** The UTC day (YYYY-MM-DD) of `t`. */
export const dayOf = (t) => iso(ms(t)).slice(0, 10);
const SUM_FIELDS = ['durationSec', 'runSec', 'coolingSec', 'userWaitSec', 'macHoldSec', 'macWaitSec', 'idleSec', 'idleBeforeSec', 'idleBetweenSec', 'idleAfterSec', 'waitersPresentSec', 'idleWaitersSec', 'macWaitWaitersSec'];

/**
 * The ledger of UTC day `day`: the iphone ledger lines that ended in it, plus `open` (the live hold's line so far, when
 * it ends in that day). Returns {day, holds (oldest first), totals, freeSec (gaps between consecutive holds inside the
 * day), byOwner: [{owner, holds, ...sums}]}.
 */
export function ledgerReport(lines = [], { day, open = null } = {}) {
  const holds = lines.filter((l) => l && l.resource === 'iphone' && l.ledger && ms(l.endedAt) !== null && dayOf(l.endedAt) === day);
  if (open && dayOf(open.endedAt) === day) holds.push({ ...open, open: true });
  holds.sort((a, b) => ms(a.acquiredAt) - ms(b.acquiredAt));
  const totals = Object.fromEntries(SUM_FIELDS.map((k) => [k, holds.reduce((s, l) => s + (Number(l[k]) || 0), 0)]));
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  let freeSec = 0, prevEnd = null;
  for (const l of holds) {
    const a = Math.max(ms(l.acquiredAt), dayStart);
    if (prevEnd !== null && a > prevEnd) freeSec += sec(a - prevEnd);
    prevEnd = Math.max(prevEnd ?? 0, ms(l.endedAt));
  }
  const byOwner = new Map();
  for (const l of holds) {
    const o = byOwner.get(l.owner) || { owner: l.owner, holds: 0, ...Object.fromEntries(SUM_FIELDS.map((k) => [k, 0])) };
    o.holds++;
    for (const k of SUM_FIELDS) o[k] += Number(l[k]) || 0;
    byOwner.set(l.owner, o);
  }
  return { day, holds, totals, freeSec, byOwner: [...byOwner.values()].sort((a, b) => b.idleSec - a.idleSec || b.durationSec - a.durationSec) };
}

const mn = (s) => `${Math.round(s / 6) / 10} min`;
const hm = (t) => iso(ms(t)).slice(11, 16);

/** The report as text lines (minutes with one decimal; times UTC). */
export function reportText(rep) {
  const t = rep.totals;
  const out = [`PHONE LEDGER ${rep.day} (UTC; holds that ended that day${rep.holds.some((h) => h.open) ? ', and the open hold so far' : ''}): ${rep.holds.length} hold${rep.holds.length === 1 ? '' : 's'}, held ${mn(t.durationSec)}, free between holds ${mn(rep.freeSec)}`];
  if (!rep.holds.length) { out.push('  no iphone hold ended that day (lines are written since I-167)'); return out; }
  out.push(`  in use: phone runs ${mn(t.runSec)}, cooling ${mn(t.coolingSec)}, the user (steps, hand tests) ${mn(t.userWaitSec)}, Mac holds ${mn(t.macHoldSec)}`);
  out.push(`  Mac wait (held, queued for chrome-measure): ${mn(t.macWaitSec)}, ${mn(t.macWaitWaitersSec)} of it with a ready waiter`);
  out.push(`  idle (held, none of the above): ${mn(t.idleSec)}: before the first use ${mn(t.idleBeforeSec)} (H-early), between uses ${mn(t.idleBetweenSec)} (H-gap), after the last use ${mn(t.idleAfterSec)} (H-done); ${mn(t.idleWaitersSec)} with a ready waiter`);
  out.push(`  avoidable (held, idle or Mac wait, while a ready waiter was queued): ${mn(t.idleWaitersSec + t.macWaitWaitersSec)}`);
  out.push('by owner (most idle first):');
  for (const o of rep.byOwner) out.push(`  ${o.owner}: ${o.holds} hold${o.holds === 1 ? '' : 's'}, ${mn(o.durationSec)}; run ${mn(o.runSec)}, user ${mn(o.userWaitSec)}, Mac ${mn(o.macHoldSec)} + wait ${mn(o.macWaitSec)}, idle ${mn(o.idleSec)} (with a waiter ${mn(o.idleWaitersSec)})`);
  out.push('holds:');
  for (const l of rep.holds) {
    const parts = [['run', l.runSec], ['cooling', l.coolingSec], ['user', l.userWaitSec], ['Mac', l.macHoldSec], ['Mac wait', l.macWaitSec], ['idle', l.idleSec]].filter(([, v]) => v > 0).map(([k, v]) => `${k} ${mn(v)}`);
    const pos = l.idleSec > 0 ? ` (early ${mn(l.idleBeforeSec)}, gap ${mn(l.idleBetweenSec)}, done ${mn(l.idleAfterSec)})` : '';
    out.push(`  ${hm(l.acquiredAt)}-${hm(l.endedAt)}Z ${l.owner} ${l.kind}${l.block ? ` block ${l.block}` : ''}${l.open ? ' (open)' : ''}: ${mn(l.durationSec)}; ${parts.join(', ') || 'nothing'}${pos}${l.waitersPresentSec ? `; waiters ${mn(l.waitersPresentSec)}` : ''}${l.how && !l.open ? `; ${l.how}` : ''}`);
  }
  return out;
}

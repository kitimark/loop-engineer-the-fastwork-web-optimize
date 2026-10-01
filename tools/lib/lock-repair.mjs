// Doctor and audited repair for the lock state in <git-common-dir>/fastwork-mirror/locks/ (incident I-012).
//
// The lock files (see tools/lib/lock.mjs) can drift out of a consistent state: a crashed process leaves a
// guard dir or a *.tmp, a client on old lock code grants without writing <r>.last-grant.json (I-011: the
// record stayed "short" and starved the short lane), a queue entry outlives its waiter. Hand-editing the
// JSON races live acquirers and leaves no trace, so this module is the one sanctioned way to fix it:
//
//   doctor(r)  read-only. Checks the invariants below and describes, per problem, the fix it would apply.
//   repair(r)  dry run by default (the same plan, before/after). With apply: takes the resource's guard
//              (withGuard, the same mutex every acquire/release uses), re-diagnoses under it, applies only
//              the diagnosed fixes, writes atomically (tmp + rename), and appends one JSON line per change
//              to locks/audit.log ({ts, by, reason, resource, code, file, fix, before, after}).
//
// Invariants (problem codes):
//   holder-unparsable        <r>.json is not JSON or not a holder record      -> moved aside to <file>.corrupt-<ts>
//   holder-stale             holder pid is gone / lease expired              -> removed, recorded in <r>.last-stale.json
//   holder-live-forced       (only with forceHolder) a live holder           -> removed like a stale one; never the iphone
//   queue-unparsable         <r>.queue.json is not a JSON array              -> moved aside
//   queue-bad-entry          an entry without owner / lastSeen               -> dropped
//   queue-stale-entry        not refreshed within its queueTtlSec, or its process is gone -> dropped
//   queue-duplicate          the same owner queued twice                     -> later entries dropped (the first keeps its place)
//   last-grant-unparsable    <r>.last-grant.json is not a grant record       -> moved aside
//   last-grant-missing       a live holder but no last-grant record (old client) -> written from the holder
//   last-grant-mismatch      the record names another grant than the live holder (other token/owner/short,
//                            or older than the holder's acquiredAt: I-011)  -> rewritten from the holder
//   last-grant-short-outlived no holder, and a short record older than its hold could run -> removed
//   guard-leftover           <r>.guard older than guardAgeSec (default 10)   -> removed (by taking the guard)
//   tmp-leftover             <r>.*.tmp older than tmpAgeSec (default 60)     -> removed
// A live holder is never removed without forceHolder, and the iphone lease of a live holder never.
import { readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { lockDir, withGuard, pidAlive, staleReason, SHORT_MAX_SEC, SHORT_DRAIN_SEC, RESOURCES } from './lock.mjs';

export const auditFile = () => join(lockDir(), 'audit.log');
const files = (r) => ({ holder: `${r}.json`, queue: `${r}.queue.json`, lastGrant: `${r}.last-grant.json`, lastStale: `${r}.last-stale.json`, guard: `${r}.guard` });
// a short hold ends at acquiredAt + maxSec (+5 s grace for `lock.mjs run`) (+30 s for the hand-over): as in lib/lock.mjs
const SHORT_RECORD_GRACE_SEC = 35;
const iso = (t) => new Date(t).toISOString();

function checkName(r) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(r)) throw new Error(`bad resource name "${r}"`);
}

/** {exists, raw, value, error} for one JSON file (never throws). */
function readRaw(f) {
  let raw;
  try { raw = readFileSync(f, 'utf8'); } catch (e) { return { exists: false, raw: null, value: null, error: e.code === 'ENOENT' ? null : e.message }; }
  try { return { exists: true, raw, value: JSON.parse(raw), error: null }; } catch (e) { return { exists: true, raw, value: null, error: e.message }; }
}
function writeJsonAtomic(f, v) {
  const t = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(t, JSON.stringify(v, null, 1));
  renameSync(t, f);
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const validHolder = (h) => isObj(h) && typeof h.owner === 'string' && h.owner && !Number.isNaN(Date.parse(h.acquiredAt));
const validGrant = (g) => isObj(g) && typeof g.owner === 'string' && !Number.isNaN(Date.parse(g.at));
const clip = (s) => (s.length > 2000 ? s.slice(0, 2000) + '…' : s);
const who = (x) => `"${x.owner}"${x.short ? ` (short, max ${x.maxSec} s)` : ' (normal)'}`;
/** The last-grant record describing a holder (the shape lib/lock.mjs writes). */
export const grantOf = (h) => JSON.parse(JSON.stringify({ owner: h.owner, short: !!h.short, maxSec: h.maxSec, at: h.acquiredAt, token: h.token }));

function ageSec(p, now) { try { return (now - statSync(p).mtimeMs) / 1000; } catch { return null; } }

/**
 * Diagnose one resource from the files as they are now. Returns
 * {resource, holder, holderLive, problems:[{code, file, message, fix, before, after}], ops:[...]}.
 * `ops` is what repair applies (in order); `problems` is what a human reads.
 */
export function diagnose(r, { now = Date.now(), guardAgeSec = 10, tmpAgeSec = 60, forceHolder = false, skipGuard = false } = {}) {
  checkName(r);
  const dir = lockDir(), F = files(r), P = (f) => join(dir, f);
  const problems = [], ops = [];
  const add = (p, op) => { problems.push(p); if (op) ops.push(op); };
  const aside = (f) => `${f}.corrupt-${iso(now).replace(/[:.]/g, '-')}`;

  // holder
  const hr = readRaw(P(F.holder));
  let holder = null, holderLive = false;
  if (hr.exists && !validHolder(hr.value)) {
    add({ code: 'holder-unparsable', file: F.holder, message: `holder record is ${hr.error ? `not JSON (${hr.error})` : 'not a holder (no owner / acquiredAt)'}; readers treat the lock as free`, fix: `move it aside to ${aside(F.holder)}`, before: clip(hr.raw), after: null },
      { kind: 'rename', file: F.holder, to: aside(F.holder), expectRaw: hr.raw });
  } else if (hr.exists) {
    const h = hr.value, why = staleReason(h, now);
    if (why) {
      add({ code: 'holder-stale', file: F.holder, message: `holder ${who(h)} is stale: ${why}`, fix: `remove it (recorded in ${F.lastStale}, as an acquirer would)`, before: h, after: null },
        { kind: 'unlink-holder', file: F.holder, token: h.token, record: { ...h, staleBecause: why } });
    } else if (forceHolder) {
      if (r === 'iphone') {
        add({ code: 'holder-live-refused', file: F.holder, message: `the iphone lease of live holder ${who(h)} is never removed by repair (release it: lock.mjs release iphone --owner ${h.owner})`, fix: 'none (refused)', before: h, after: h });
        holder = h; holderLive = true;
      } else {
        add({ code: 'holder-live-forced', file: F.holder, message: `holder ${who(h)} is LIVE (${h.kind}${h.pid ? ' pid ' + h.pid : ''}${h.expiresAt ? ', until ' + h.expiresAt : ''}), removal forced with --force-holder`, fix: `remove it (recorded in ${F.lastStale})`, before: h, after: null },
          { kind: 'unlink-holder', file: F.holder, token: h.token, record: { ...h, staleBecause: 'removed by lock.mjs repair --force-holder' } });
      }
    } else { holder = h; holderLive = true; }
  }

  // queue
  const qr = readRaw(P(F.queue));
  if (qr.exists && !Array.isArray(qr.value)) {
    add({ code: 'queue-unparsable', file: F.queue, message: `queue is ${qr.error ? `not JSON (${qr.error})` : 'not an array'}; readers see an empty queue`, fix: `move it aside to ${aside(F.queue)}`, before: clip(qr.raw), after: null },
      { kind: 'rename', file: F.queue, to: aside(F.queue), expectRaw: qr.raw });
  } else if (qr.exists) {
    const keep = [], seen = new Set();
    let changed = false;
    for (const w of qr.value) {
      let code = null, message = null;
      if (!isObj(w) || typeof w.owner !== 'string' || !w.owner || Number.isNaN(Date.parse(w.lastSeen))) {
        code = 'queue-bad-entry'; message = `queue entry ${JSON.stringify(w)} has no owner or lastSeen`;
      } else if (now - Date.parse(w.lastSeen) >= (w.queueTtlSec ?? 600) * 1000) {
        code = 'queue-stale-entry'; message = `queue entry "${w.owner}" not refreshed since ${w.lastSeen} (queue TTL ${w.queueTtlSec ?? 600} s)`;
      } else if (w.kind === 'process' && w.pid && !pidAlive(w.pid)) {
        code = 'queue-stale-entry'; message = `queue entry "${w.owner}" waits in pid ${w.pid}, which is gone`;
      } else if (seen.has(w.owner)) {
        code = 'queue-duplicate'; message = `"${w.owner}" is queued more than once (since ${w.since})`;
      }
      if (code) { changed = true; add({ code, file: F.queue, message, fix: code === 'queue-duplicate' ? 'drop this later entry (the first keeps its place)' : 'drop the entry', before: w, after: null }); }
      else { seen.add(w.owner); keep.push(w); }
    }
    if (changed) ops.push({ kind: 'write-queue', file: F.queue, before: qr.value, value: keep });
  }

  // last grant (checked against the holder that survives the fixes above)
  const gr = readRaw(P(F.lastGrant));
  if (gr.exists && !validGrant(gr.value)) {
    add({ code: 'last-grant-unparsable', file: F.lastGrant, message: `last-grant record is ${gr.error ? `not JSON (${gr.error})` : 'not a grant (no owner / at)'}`, fix: holderLive ? `move it aside, write the live holder's grant` : `move it aside to ${aside(F.lastGrant)}`, before: clip(gr.raw), after: holderLive ? grantOf(holder) : null },
      { kind: 'rename', file: F.lastGrant, to: aside(F.lastGrant), expectRaw: gr.raw });
    if (holderLive) ops.push({ kind: 'write-grant', file: F.lastGrant, value: grantOf(holder) });
  } else if (holderLive) {
    const g = gr.value, want = grantOf(holder);
    if (!gr.exists) {
      add({ code: 'last-grant-missing', file: F.lastGrant, message: `holder ${who(holder)} since ${holder.acquiredAt} has no last-grant record (granted by old lock code, I-011)`, fix: 'write the holder\'s grant', before: null, after: want },
        { kind: 'write-grant', file: F.lastGrant, value: want });
    } else {
      const other = g.token && holder.token ? g.token !== holder.token : g.owner !== holder.owner || Date.parse(g.at) < Date.parse(holder.acquiredAt);
      if (other || !!g.short !== !!holder.short) {
        add({ code: 'last-grant-mismatch', file: F.lastGrant, message: `records ${who(g)} at ${g.at}, but the holder is ${who(holder)} since ${holder.acquiredAt} (a grant by old lock code, I-011)`, fix: 'rewrite it from the holder', before: g, after: want },
          { kind: 'write-grant', file: F.lastGrant, value: want });
      }
    }
  } else if (gr.exists && gr.value.short && now - Date.parse(gr.value.at) > ((gr.value.maxSec || SHORT_MAX_SEC) + SHORT_RECORD_GRACE_SEC) * 1000) {
    const g = gr.value;
    add({ code: 'last-grant-short-outlived', file: F.lastGrant, message: `no holder, but the record still says the last grant was short: ${who(g)} at ${g.at}, longer ago than that hold could run`, fix: 'remove the record (no short grant pending)', before: g, after: null },
      { kind: 'unlink', file: F.lastGrant, expectRaw: gr.raw });
  }

  // leftovers from crashed processes
  if (!skipGuard) {
    const a = ageSec(P(F.guard), now);
    if (a != null && a > guardAgeSec) {
      add({ code: 'guard-leftover', file: F.guard, message: `guard dir is ${Math.round(a)} s old (a process died inside the critical section)`, fix: 'remove it (taking the guard does)', before: `dir, ${Math.round(a)} s old`, after: null },
        { kind: 'guard' });
    }
  }
  let names = [];
  try { names = readdirSync(dir); } catch {}
  for (const n of names) {
    if (!n.startsWith(`${r}.`) || !n.endsWith('.tmp')) continue;
    const a = ageSec(P(n), now);
    if (a != null && a > tmpAgeSec) {
      add({ code: 'tmp-leftover', file: n, message: `temp file ${Math.round(a)} s old (a writer died between write and rename)`, fix: 'remove it', before: `file, ${Math.round(a)} s old`, after: null },
        { kind: 'unlink', file: n });
    }
  }
  return { resource: r, holder, holderLive, problems, ops };
}

/** Resource names with any state in the lock dir, plus the known resources. */
export function resourceNames() {
  const names = new Set(Object.keys(RESOURCES));
  try {
    for (const f of readdirSync(lockDir())) {
      const m = f.match(/^([a-z0-9][a-z0-9-]{0,40})\.(json|queue\.json|last-grant\.json|guard)$/);
      if (m) names.add(m[1]);
    }
  } catch {}
  return [...names].sort();
}

/** Read-only check of one resource (or all). Returns [{resource, holder, holderLive, problems}]. */
export function doctor(r, opts = {}) {
  return (r ? [r] : resourceNames()).map((n) => { const { ops, ...d } = diagnose(n, opts); return d; });
}

function audit(line) {
  mkdirSync(lockDir(), { recursive: true });
  appendFileSync(auditFile(), JSON.stringify(line) + '\n');
}

/**
 * Plan (dry run) or apply the doctor's fixes for one resource.
 * opts: {by, reason, apply=false, forceHolder=false, guardAgeSec, tmpAgeSec}
 * Returns {resource, applied, holder, holderLive, problems}. Throws if apply lacks by/reason, or if
 * forceHolder targets the live iphone lease.
 */
export async function repair(r, { by, reason, apply = false, forceHolder = false, guardAgeSec = 10, tmpAgeSec = 60 } = {}) {
  checkName(r);
  const opts = { guardAgeSec, tmpAgeSec, forceHolder };
  const refuse = (d) => {
    const p = d.problems.find((x) => x.code === 'holder-live-refused');
    if (p) throw new Error(`refusing to touch the iphone lease of a live holder: ${JSON.stringify(p.before)}`);
  };
  if (!apply) { const { ops, ...d } = diagnose(r, opts); refuse(d); return { ...d, applied: false }; }
  if (!by || !reason) throw new Error('repair --apply needs --by <who> and --reason "<why>" (they go into the audit log)');
  const { ops: _, ...pre } = diagnose(r, opts);
  refuse(pre);
  const hadGuard = pre.problems.find((p) => p.code === 'guard-leftover');
  if (!pre.problems.length) return { ...pre, applied: true };
  const dir = lockDir(), P = (f) => join(dir, f);
  return withGuard(r, () => {
    // re-check under the guard: nobody can acquire, release or queue meanwhile
    const now = Date.now();
    const d = diagnose(r, { ...opts, now, skipGuard: true });
    refuse(d);
    const ts = iso(now);
    const log = (p) => audit({ ts, by, reason, resource: r, code: p.code, file: p.file, fix: p.fix, before: p.before, after: p.after });
    if (hadGuard) { d.problems.unshift(hadGuard); } // withGuard removed it (older than 10 s) to let us in
    for (const op of d.ops) {
      const f = P(op.file);
      if (op.kind === 'rename') { if (existsSync(f)) renameSync(f, P(op.to)); }
      else if (op.kind === 'unlink') { try { unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
      else if (op.kind === 'unlink-holder') {
        writeJsonAtomic(P(files(r).lastStale), { ...op.record, clearedAt: ts, clearedBy: `lock.mjs repair (${by})` });
        unlinkSync(f);
      }
      else if (op.kind === 'write-queue' || op.kind === 'write-grant') writeJsonAtomic(f, op.value);
    }
    for (const p of d.problems) log(p);
    const { ops: __, ...rest } = d;
    return { ...rest, applied: true };
  });
}

// ---- queue reorder by the lead (incident I-019) --------------------------------------------------------
// The queue is FIFO by position in <r>.queue.json: tryAcquire finds a waiter's entry by owner, refreshes it
// in place (keeping `since` and, since I-019, `movedBy`/`movedAt`) and grants the entry nextIndex() picks
// among the live entries. So moving an entry inside that array is all a reorder needs: under the guard no
// acquirer can interleave, every waiter keeps its entry, and the moved one is granted in its new place.
// The short lane (I-007/I-011) still picks the first short waiter over normal ones within its drain budget,
// except that a normal waiter the lead moved ahead of short jobs is served before them (I-020).

/** A queue entry an acquirer would keep (the same test as pruneQueue in lib/lock.mjs). */
const liveWaiter = (w, now) => isObj(w) && typeof w.owner === 'string' && !!w.owner && !Number.isNaN(Date.parse(w.lastSeen))
  && now - Date.parse(w.lastSeen) < (w.queueTtlSec ?? 600) * 1000 && (!w.pid || w.kind !== 'process' || pidAlive(w.pid));

/** The move as a plan on the files as they are now (throws when it must be refused). */
function planMove(r, { owner, to, by, now }) {
  const dir = lockDir(), F = files(r);
  const qr = readRaw(join(dir, F.queue));
  if (qr.exists && !Array.isArray(qr.value)) throw new Error(`${F.queue} is not a JSON array; run node tools/lock.mjs doctor ${r} first`);
  const raw = qr.exists ? qr.value : [];
  const live = raw.filter((w) => liveWaiter(w, now));
  const hr = readRaw(join(dir, F.holder));
  const holder = validHolder(hr.value) && !staleReason(hr.value, now) ? hr.value : null;
  const hits = live.filter((w) => w.owner === owner);
  if (!hits.length) {
    if (holder && holder.owner === owner) throw new Error(`"${owner}" holds ${r}; --move only reorders waiting entries (the holder is never touched)`);
    throw new Error(`"${owner}" is not waiting for ${r} (queue: ${live.map((w) => w.owner).join(', ') || 'empty'})`);
  }
  if (hits.length > 1) throw new Error(`"${owner}" is queued more than once; fix that first: node tools/lock.mjs repair ${r}`);
  if (!Number.isInteger(to) || to < 1 || to > live.length) throw new Error(`--to must be a position from 1 to ${live.length} (the live queue as status shows it), got ${to}`);
  const target = hits[0], from = live.indexOf(target) + 1;
  const moved = { ...target, movedBy: by, movedAt: iso(now) };
  const others = live.filter((w) => w !== target);
  const after = [...others.slice(0, to - 1), moved, ...others.slice(to - 1)];
  // the file keeps entries acquirers will prune (stale, dead) where they are; the moved entry goes right
  // before the live entry it now precedes, or right after the last live one
  const rest = raw.filter((w) => w !== target);
  const at = to - 1 < others.length ? rest.indexOf(others[to - 1]) : rest.indexOf(others[others.length - 1]) + 1;
  const queue = [...rest.slice(0, at), moved, ...rest.slice(at)];
  const ahead = after.slice(0, to - 1).filter((w) => w.short).map((w) => w.owner), behind = after.slice(to).filter((w) => w.short).map((w) => w.owner);
  const note = target.short
    ? (live.some((w) => !w.short) ? 'short lane: a short job is served by the short-lane rule; its place only orders it among other short jobs' : null)
    : ahead.length ? `short lane: queued short jobs ahead of "${owner}" (${ahead.join(', ')}) are still served first at a hand-over while their ${SHORT_DRAIN_SEC} s drain budget lasts (I-007/I-011/I-020)`
    : behind.length ? `short lane: the lead's move puts "${owner}" ahead of the short jobs behind it (${behind.join(', ')}); it is served before them (I-020)` : null;
  // I-035: a move to the entry's own position still records the lead's mark (movedBy: served before the short jobs
  // behind it, I-020; never passed at its host gate, I-030): `marked`. Only an entry already marked by `by` is a no-op.
  return { resource: r, owner, from, to, changed: from !== to, marked: from === to && target.movedBy !== by, holder, before: live, after, queue, file: F.queue, note };
}

/**
 * The lead reorders the queue: move waiting `owner` to live position `to` (1-based, as `status` shows it).
 * opts: {owner, to, by, reason, apply=false}. Dry run by default (reads only). With apply: under the
 * resource's guard, re-plans, writes the queue atomically and appends one audit line (code "queue-move").
 * Only a waiting entry moves; its `since` is kept and `movedBy`/`movedAt` are recorded in it (also when it is
 * already at `to`: `marked`, I-035; a no-op only for an entry already marked by `by`). Refuses the
 * holder, a non-waiter, a position outside the live queue, and `by` other than "lead".
 * Returns {resource, owner, from, to, changed, marked, applied, holder, before, after, file, note}.
 */
export async function moveWaiter(r, { owner, to, by, reason, apply = false } = {}) {
  checkName(r);
  if (by !== 'lead') throw new Error(`only the lead reorders the queue (--by lead), got --by ${by === undefined ? '(none)' : `"${by}"`}`);
  if (!owner) throw new Error('--move <owner> names the waiting entry to move');
  if (apply && !reason) throw new Error('repair --move --apply needs --reason "<why>" (it goes into the audit log)');
  to = Number(to);
  const strip = ({ queue, ...p }) => p;
  if (!apply) return { ...strip(planMove(r, { owner, to, by, now: Date.now() })), applied: false };
  return withGuard(r, () => {
    const now = Date.now();
    const p = planMove(r, { owner, to, by, now });
    if (!p.changed && !p.marked) return { ...strip(p), applied: false };
    writeJsonAtomic(join(lockDir(), p.file), p.queue);
    const fix = p.changed ? `move "${owner}" from #${p.from} to #${p.to} (since ${p.after[p.to - 1].since} kept)` : `mark "${owner}" (#${p.from}) as moved by ${by}, position kept (I-035)`;
    audit({ ts: iso(now), by, reason, resource: r, code: 'queue-move', file: p.file, owner, from: p.from, to: p.to,
      fix, before: p.before.map((w) => w.owner), after: p.after.map((w) => w.owner) });
    return { ...strip(p), applied: true };
  });
}

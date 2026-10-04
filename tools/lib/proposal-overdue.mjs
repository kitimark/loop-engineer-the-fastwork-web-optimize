// Overdue revisions (incident I-177, user T-154 #7/#9, 2026-10-04): after the user asked for a change on a proposal,
// nothing alerted anyone while rev N+1 was slow (PR-018: 2 h 8 min with no sign of work; PR-021: 30+ min). A change
// request is OVERDUE when
//   not-started  its author has not marked it (`proposal revising`) more than --start-min minutes (default 15) after
//                the decision, or
//   eta-passed   the latest mark's eta has passed (a mark without an eta never alarms).
// overdueProposals() is the pure rule (the stored proposals and a clock in, the overdue ones out). Users:
//   node tools/console.mjs proposal overdue [--start-min 15] [--json]   # one OVERDUE line each, exit 3; 0 when none
//   tools/idle.mjs check|watch (overduePass, every pass): prints OVERDUE lines; with --by lead one console thread per
//                overdue episode (keyed by proposal, decision, reason and mark), assigned to the lead only: this is an
//                automated thread whose first tier is the lead, and workers (the proposal's author) are never
//                assignees (fixes/AGENT_ROLES.md "Automated threads: who answers"); the lead nudges the author. The
//                episode ends when the author marks it, posts rev N+1, or the decision changes; the lead's next pass
//                closes its thread. Ids, names, minutes and the author's own note only (Hard rule 12).
//   State: <git-common-dir>/fastwork-mirror/idle/proposal-overdue.json ($FW_STATE_DIR/idle/ in tests), "proposal-overdue" guard.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { readJson, writeJson, iso } from './store.mjs';
import { listProposals } from './proposal.mjs';
import { createThread, setStatus } from './console-threads.mjs';

export const SCHEMA = 'fw-proposal-overdue/1';
export const START_MIN = 15;
const GUARD = 'proposal-overdue';
const CLAIM_TTL_MS = 120000; // a post claim older than this belongs to a poster that died
export const stateFile = () => join(sharedStateDir(), 'idle', 'proposal-overdue.json');
export const readState = () => {
  const s = readJson(stateFile());
  return s && s.schema === SCHEMA && s.episodes && typeof s.episodes === 'object' ? s : { schema: SCHEMA, episodes: {}, toClose: [] };
};

const hhmm = (t) => `${new Date(t).toISOString().slice(11, 16)}Z`;
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** `--start-min`: minutes in [0, 1440]. */
export function startMinutes(v, def = START_MIN) {
  if (v === undefined) return def;
  const n = Number(v);
  if (String(v).trim() === '' || !Number.isFinite(n) || n < 0 || n > 24 * 60) throw new Error(`--start-min must be minutes in [0, 1440] (got "${v}")`);
  return n;
}

/**
 * The pure rule. items: stored proposals; now: ms. Returns [{id, title, by, rev, nextRev, reason: not-started |
 * eta-passed, decidedAt, minutes (since the decision, or past the eta), startMin, mark?, key}], oldest decision first.
 */
export function overdueProposals(items, { now = Date.now(), startMin = START_MIN } = {}) {
  const out = [];
  for (const p of items || []) {
    if (p?.state !== 'changes-requested' || !p.decision?.at) continue;
    const decidedAt = p.decision.at, d = Date.parse(decidedAt);
    const base = { id: p.id, title: p.title, by: p.by, rev: p.rev, nextRev: p.rev + 1, decidedAt, startMin };
    const m = p.revising;
    if (!m) {
      if (now - d > startMin * 60000) out.push({ ...base, reason: 'not-started', minutes: Math.floor((now - d) / 60000), key: `${p.id}|${decidedAt}|not-started|` });
    } else if (m.eta && now > Date.parse(m.eta)) {
      const mark = { by: m.by, at: m.at, note: m.note, eta: m.eta };
      out.push({ ...base, reason: 'eta-passed', minutes: Math.floor((now - Date.parse(m.eta)) / 60000), mark, key: `${p.id}|${decidedAt}|eta-passed|${m.at}` });
    }
  }
  return out.sort((a, b) => (a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0));
}

/** The stdout line for one overdue proposal. */
export function overdueLine(x) {
  const head = `OVERDUE ${x.id} rev ${x.nextRev} (${x.by})`;
  if (x.reason === 'not-started') return `${head}: not started ${x.minutes} min after the change request at ${hhmm(x.decidedAt)} (limit ${x.startMin} min)`;
  return `${head}: expected by ${hhmm(x.mark.eta)}, ${x.minutes} min late (revising since ${hhmm(x.mark.at)}: ${clip(x.mark.note, 120)})`;
}

/** The console thread for one overdue proposal: {title, text}. The first line is for the user, in plain words. */
export function overdueThread(x) {
  const mark = `node tools/console.mjs proposal revising ${x.id} --by ${x.by} --note "<the step it is on>" --eta +<N>m`;
  if (x.reason === 'not-started') {
    return {
      title: `${x.id}: revision ${x.nextRev} not started ${x.minutes} min after your change request`,
      text: [
        `For you: you asked for a change on ${x.id} ("${clip(x.title, 80)}") at ${hhmm(x.decidedAt)}, ${x.minutes} min ago. Its author ${x.by} has not said that revision ${x.nextRev} is under way. The lead has been told and will check; nothing for you to do.`,
        `Lead: ask ${x.by} where it stands, then have it mark the work so the Proposals page shows it: ${mark}`,
        'One message per overdue period; this thread closes by itself when the revision is marked or posted, or the decision changes (tools/idle.mjs, I-177).',
      ].join('\n'),
    };
  }
  return {
    title: `${x.id}: revision ${x.nextRev} is ${x.minutes} min past its expected time`,
    text: [
      `For you: ${x.by} expected revision ${x.nextRev} of ${x.id} ("${clip(x.title, 80)}") by ${hhmm(x.mark.eta)}; it is ${x.minutes} min late. Its last step: "${clip(x.mark.note, 200)}". The lead has been told and will check; nothing for you to do.`,
      `Lead: ask ${x.by} where it stands; a new mark with a new expected time closes this: ${mark}`,
      'One message per overdue period; this thread closes by itself when the revision is marked again or posted, or the decision changes (tools/idle.mjs, I-177).',
    ].join('\n'),
  };
}

/**
 * Under the guard: record the overdue list. Returns {items: [{x, news, post, thread}], ended: [{key, id, thread}]}:
 * news on an episode's first sighting; post when `claim` (the lead's pass) claimed its thread. Episodes no longer
 * overdue end (unless in `keep`: still a candidate under a larger --start-min); their threads wait in toClose.
 */
export async function recordOverdue(list, { now = Date.now(), claim = false, pid = process.pid, keep = [] } = {}) {
  return withGuard(GUARD, () => {
    mkdirSync(join(sharedStateDir(), 'idle'), { recursive: true });
    const s = readState();
    const items = [], ended = [], keys = new Set([...list.map((x) => x.key), ...keep]);
    for (const [key, ep] of Object.entries(s.episodes)) {
      if (keys.has(key)) continue;
      ended.push({ key, id: ep.id, thread: ep.thread || null });
      if (ep.thread && !(s.toClose ||= []).some((c) => c.thread === ep.thread)) s.toClose.push({ thread: ep.thread, id: ep.id, note: `${ep.id}: the revision is marked or posted, or the decision changed`, at: iso(now) });
      delete s.episodes[key];
    }
    for (const x of list) {
      let ep = s.episodes[x.key], news = false, post = false;
      if (!ep) { ep = s.episodes[x.key] = { id: x.id, by: x.by, reason: x.reason, alarmedAt: iso(now) }; news = true; }
      const claimLive = ep.claim && now - (Date.parse(ep.claim.at) || 0) < CLAIM_TTL_MS && ep.claim.pid !== pid;
      if (claim && !ep.thread && !claimLive) { ep.claim = { pid, at: iso(now) }; post = true; }
      items.push({ x, news, post, thread: ep.thread || null });
    }
    s.updatedAt = iso(now);
    writeJson(stateFile(), s);
    return { items, ended };
  });
}

/** Under the guard: the thread post for episode `key` succeeded (thread id) or failed (the claim is dropped). */
export async function settleOverdue(key, { thread = null, error = null, now = Date.now() } = {}) {
  return withGuard(GUARD, () => {
    const s = readState();
    const ep = s.episodes[key];
    if (!ep) return null;
    delete ep.claim;
    if (thread) Object.assign(ep, { thread, postedAt: iso(now) });
    if (error) ep.lastError = String(error).slice(0, 300);
    writeJson(stateFile(), s);
    return ep;
  });
}

/** Under the guard: take (and clear) the threads of ended episodes (the lead's pass closes them). */
export async function takeOverdueToClose() {
  return withGuard(GUARD, () => {
    const s = readState();
    const list = s.toClose || [];
    if (!list.length) return [];
    s.toClose = [];
    writeJson(stateFile(), s);
    return list;
  });
}

/**
 * One pass (tools/idle.mjs): find, record, print, and as the lead post / close threads. `quietOk`: print only news
 * (watch); `check` prints every overdue one. Returns {alarm, overdue}.
 */
export async function overduePass({ by, log, quietOk = false, now = Date.now(), min = START_MIN, items = listProposals() } = {}) {
  const list = overdueProposals(items, { now, startMin: min });
  const keep = overdueProposals(items, { now, startMin: 0 }).map((x) => x.key);
  const lead = by === 'lead';
  const { items: rec, ended } = await recordOverdue(list, { now, claim: lead, keep });
  for (const e of ended) log(`ENDED ${e.id}: its revision is no longer overdue${e.thread ? `; thread ${e.thread}` : ''}`);
  for (const it of rec) {
    if (it.news || !quietOk) log(`${overdueLine(it.x)}${it.thread ? ` [posted in ${it.thread}]` : ''}`);
    if (!it.post) {
      if (it.news && !lead) log(`NOT POSTED ${it.x.id}: posting needs --by lead (only the lead starts threads); the lead's watch posts it`);
      continue;
    }
    const { title, text } = overdueThread(it.x);
    try {
      const r = await createThread({ by, title, text, to: 'lead' });
      await settleOverdue(it.x.key, { thread: r.thread.id, now });
      log(`POSTED ${r.thread.id} ${it.x.id}: ${title} (to lead)`);
    } catch (e) {
      await settleOverdue(it.x.key, { error: e.message, now });
      log(`NOT POSTED ${it.x.id}: ${e.message}`);
    }
  }
  if (lead) {
    for (const c of await takeOverdueToClose()) {
      try { await setStatus(c.thread, { status: 'closed', by, note: c.note }); log(`CLOSED ${c.thread} (${c.note})`); } catch (e) { log(`NOT CLOSED ${c.thread}: ${e.message}`); }
    }
  }
  return { alarm: list.length > 0, overdue: list };
}

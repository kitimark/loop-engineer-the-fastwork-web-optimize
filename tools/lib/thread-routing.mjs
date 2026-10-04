// Thread routing (user T-050, 2026-10-03; design research/architecture/thread-routing.md §4-§5 and "Decisions"; T-051:
// the lead's topic -> owner map). A user message goes to someone who is listening, and the lead wakes only when needed:
//   - listening(agent): a live `console.mjs thread wait` of that agent in the waits registry (waits.mjs), or the agent
//     read (readsAt) or wrote in a thread within LISTEN_MIN (5) minutes. A live wait always listens; an agent whose run
//     ended with a hand-back (I-152 N9, transcripts.mjs) loses only the 5-min rule (a persistent Monitor listener
//     keeps a handed-back agent listening).
//   - routeOwner(t, ctx), pure: the first LISTENING candidate of (1) the comment anchor's owner (status row owner, step
//     author, proposal author), (2) the lead's topic map (thread topic set), (3) the topic's status-board owner, (4) the
//     desk; else null (nobody: the lead's triage wait wakes at once). The lead and the user are never candidates.
//   - the desk: threads/desk.json {agent, setBy, at}, set by the lead only; it counts only while it is listening
//     (otherwise the lead is the desk). The desk may assign a thread, only to a listening owner (console-threads assign).
//   - the topic map: threads/topics.json {<status id or topic tag>: {owner, setBy, at}}, set by the lead only.
// console-threads.mjs calls the router on every user message whose thread has no listening assignee; the lead's
// `thread wait --as lead --triage` (threadWaitCondition) uses listening() and TRIAGE_ESCALATE_MIN.
// Names only (agent ids, status ids); no user text is stored here.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { consoleDir } from './console.mjs';
import { listWaits } from './waits.mjs';
import { endedNow } from './transcripts.mjs';

export const LISTEN_MIN = 5;
export const TRIAGE_ESCALATE_MIN = 10;
export const WAIT_TOOL = 'console.mjs thread wait';
const LEAD = 'lead';
const USER = 'user';
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const GUARD = 'console-threads';

const dir = () => join(consoleDir(), 'threads');
export const deskFile = () => join(dir(), 'desk.json');
export const topicsFile = () => join(dir(), 'topics.json');

const agentName = (s, what) => {
  const v = String(s ?? '').trim();
  if (!AGENT.test(v)) throw new Error(`${what}: an agent name (letters, digits, _ . -), got "${v}"`);
  return v;
};
const needLead = (by, what) => {
  if (String(by ?? '').trim() !== LEAD) throw new Error(`only the lead ${what} (--by lead)`);
};

// ---- listening ----------------------------------------------------------------------------------------------

/** When each agent last read or wrote in any thread (ms), from readsAt marks and agents' messages. */
export function lastSeen(threads = []) {
  const seen = new Map();
  const put = (a, at) => { const ms = Date.parse(at); if (a && a !== USER && Number.isFinite(ms) && !(seen.get(a) >= ms)) seen.set(a, ms); };
  for (const t of threads) {
    for (const [a, at] of Object.entries(t.readsAt || {})) put(a, at);
    for (const m of t.messages || []) if (m.by !== USER) put(m.by, m.at);
  }
  return seen;
}

/**
 * A listening test for many agents at once: (agent) -> {listening, how} where how is "waiting" (a live thread wait),
 * "active <n> min ago" (read or wrote within LISTEN_MIN), or "" (not listening). opts: {now, waits (listWaits()
 * records), threads}.
 */
export function listeningState({ now = Date.now(), waits, threads = [], ended } = {}) {
  const ws = waits ?? listWaits({ now });
  // I-152 (PR-020 N9): an owner whose run ended with a hand-back is not listening by the 5-min read/write rule; a live
  // wait (pid alive: listWaits drops dead ones) still listens, ended or not: background agents hand back at the end of
  // every turn and keep a persistent `thread wait --monitor` that wakes them (the lead, 2026-10-04)
  let gone;
  try { gone = ended ?? new Set(endedNow({ now }).keys()); } catch { gone = new Set(); }
  const waiting = new Set(ws.filter((w) => w && w.tool === WAIT_TOOL).map((w) => w.owner));
  const seen = lastSeen(threads);
  return (agent) => {
    if (!agent || agent === USER) return { listening: false, how: '' };
    if (waiting.has(agent)) return { listening: true, how: 'waiting' };
    if (gone.has(agent)) return { listening: false, how: 'owner ended' };
    const at = seen.get(agent);
    if (at !== undefined && now - at <= LISTEN_MIN * 60000) return { listening: true, how: `active ${Math.max(0, Math.round((now - at) / 60000))} min ago` };
    return { listening: false, how: '' };
  };
}
/** (agent) -> boolean, see listeningState. */
export function listeningFn(opts) { const s = listeningState(opts); return (a) => s(a).listening; }

// ---- desk and topic map (lead only) --------------------------------------------------------------------------

/** The desk {agent, setBy, at}, or null. */
export function getDesk() {
  const d = readJson(deskFile());
  return d && AGENT.test(String(d.agent || '')) ? d : null;
}
/** Name the desk (agent) or clear it (agent null). Lead only. */
export async function setDesk({ agent, by }) {
  needLead(by, 'names the desk');
  const a = agent == null ? null : agentName(agent, 'the desk');
  if (a === LEAD) throw new Error('the lead is the desk already when none is set: use --clear');
  return withGuard(GUARD, () => {
    mkdirSync(dir(), { recursive: true });
    const d = a ? { agent: a, setBy: LEAD, at: iso() } : { agent: null, setBy: LEAD, at: iso() };
    writeJson(deskFile(), d);
    return a ? d : null;
  });
}

/** The lead's topic map {<tag>: {owner, setBy, at}}. */
export function getTopics() {
  const m = readJson(topicsFile());
  const out = {};
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m.topics || {})) if (TAG.test(k) && v && AGENT.test(String(v.owner || ''))) out[k] = v;
  return out;
}
/** Set (owner) or clear (owner null) who owns a topic's threads. Lead only. */
export async function setTopicOwner(tag, { owner, by }) {
  needLead(by, 'sets topic owners');
  const k = String(tag ?? '').trim();
  if (!TAG.test(k)) throw new Error(`bad topic "${k}" (a status id or tag: lowercase letters, digits, -)`);
  const o = owner == null ? null : agentName(owner, '--owner');
  if (o === LEAD || o === USER) throw new Error('the owner is an agent other than the lead (unowned topics reach the lead anyway)');
  return withGuard(GUARD, () => {
    mkdirSync(dir(), { recursive: true });
    const cur = readJson(topicsFile());
    const topics = { ...(cur && cur.topics) };
    if (o) topics[k] = { owner: o, setBy: LEAD, at: iso() };
    else delete topics[k];
    writeJson(topicsFile(), { schema: 'fw-thread-topics/1', topics });
    return o ? topics[k] : null;
  });
}

// ---- the router ----------------------------------------------------------------------------------------------

/** The owner a comment's anchor names: {owner, why} or null. ctx: {statusRows, steps, proposals} (arrays). */
export function anchorOwner(anchor, { statusRows = [], steps = [], proposals = [] } = {}) {
  if (!anchor || typeof anchor !== 'object') return null;
  const it = String(anchor.item ?? '');
  if (anchor.page === 'status' && it.startsWith('status:')) {
    const r = statusRows.find((x) => x.id === it.slice('status:'.length));
    return r?.owner ? { owner: r.owner, why: `owner of ${r.id}` } : null;
  }
  if ((anchor.page === 'progress' || anchor.page === 'build') && it.startsWith('progress:')) {
    const id = it.slice('progress:'.length);
    const r = statusRows.find((x) => x.progress === id) || statusRows.find((x) => x.id === id);
    return r?.owner ? { owner: r.owner, why: `owner of ${r.id}` } : null;
  }
  if (anchor.page === 'steps' && it.startsWith('step:')) {
    const s = steps.find((x) => x.id === it.slice('step:'.length));
    return s?.by ? { owner: s.by, why: `author of ${s.id}` } : null;
  }
  if (anchor.page === 'proposals' && /^PR-\d/.test(it)) {
    const id = it.split('/')[0];
    const p = proposals.find((x) => x.id === id);
    return p?.by ? { owner: p.by, why: `author of ${id}` } : null;
  }
  if (anchor.page === 'agents' && it.startsWith('agent:')) { // I-118: a comment on an agent's page is for that agent
    const n = it.slice('agent:'.length);
    return n && n !== USER ? { owner: n, why: `its agent page` } : null;
  }
  return null;
}

/**
 * Who answers thread `t` (pure): the first listening candidate of anchor owner, the lead's topic map, the topic's
 * status-board owner, the desk; {owner, why} or null. ctx: {statusRows, steps, proposals, topics, desk (agent name),
 * listening (agent) -> boolean}.
 */
export function routeOwner(t, { statusRows = [], steps = [], proposals = [], topics = {}, desk = null, listening = () => false } = {}) {
  const cands = [];
  const a = anchorOwner(t?.anchor, { statusRows, steps, proposals });
  if (a) cands.push(a);
  if (t?.topic) {
    const m = topics[t.topic];
    if (m?.owner) cands.push({ owner: m.owner, why: `topic ${t.topic}, set by the lead` });
    const r = statusRows.find((x) => x.id === t.topic);
    if (r?.owner) cands.push({ owner: r.owner, why: `owner of ${r.id}` });
  }
  if (desk) cands.push({ owner: desk, why: 'the desk' });
  for (const c of cands) if (AGENT.test(String(c.owner)) && c.owner !== LEAD && c.owner !== USER && listening(c.owner)) return c;
  return null;
}

/** What routeOwner needs, read from the stores (status board, steps, proposals, desk, topic map). Never throws. */
export async function routeContext() {
  const safe = async (f, d) => { try { return await f(); } catch { return d; } };
  const [statusRows, steps, proposals] = await Promise.all([
    safe(async () => (await import('./status.mjs')).list({ all: false }), []),
    safe(async () => (await import('./console.mjs')).list({ all: true }), []),
    safe(async () => (await import('./proposal.mjs')).listProposals({ all: true }), []),
  ]);
  return { statusRows, steps, proposals, topics: safe0(getTopics, {}), desk: safe0(() => getDesk()?.agent || null, null) };
}
function safe0(f, d) { try { return f(); } catch { return d; } }

/** `thread desk show`: who the desk is and whether it is listening, in plain words. */
export function deskText({ now = Date.now(), waits, threads = [] } = {}) {
  const d = getDesk();
  if (!d) return 'no desk set: the lead is the desk';
  const s = listeningState({ now, waits, threads })(d.agent);
  return s.listening ? `${d.agent}, listening (${s.how}); set by the lead at ${d.at}` : `${d.agent}, not listening: the lead is the desk until it arms \`thread wait --as ${d.agent}\``;
}

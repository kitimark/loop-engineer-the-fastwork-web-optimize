// Console threads (ts-console-threads, user request 2026-10-02: "do thread feature that i can ask you reply and catch
// up each topics that i'd like to ask"): one conversation per topic in the user console, so the user's questions don't
// drown in the lead chat. The user starts a thread on the page (/threads) or writes in one; the lead, or an agent the
// lead assigned, replies with `console.mjs thread reply`; `console.mjs thread wait --as <agent>` exits when the user
// wrote. Design: research/architecture/console-threads.md.
//
// Store: <git-common-dir>/fastwork-mirror/console/threads/T-001.json, one file per thread, atomic writes under the
// `console-threads` guard ($FW_STATE_DIR in tests). The store is local and gitignored: the user's text is kept as typed.
// Agent text (titles, replies, notes) is scrubbed BEFORE it is stored (scrubAgentText: progress.mjs sanitize +
// redact.mjs; http://localhost links survive), so no LAN address, e-mail, device id or home path an agent echoes ever
// reaches the page, the event feed or a notification (Hard rule 12).
//
// A thread: {id, title, topic?, status: open|closed, createdBy, createdAt, updatedAt, rev, assignees: [agent],
//   messages: [{n, at, by: 'user'|agent, text, ask?}], reads: {user: n, <agent>: n}, history: [{at, who, action, note?}]}
// Derived (never stored):
//   state   closed | waiting-on-you (last message: an agent's, with ask) | answered (last: an agent's) | open (last: the user's)
//   unread  for the user: agents' messages after reads.user; for an agent: the user's messages after reads[agent],
//           in the threads it sees (the lead: all; others: the ones assigned to it). Agents' messages never wake
//           agents; an assignment does (the new assignee has no read mark, so the user's messages are unread).
//           Each reader has its own mark: the lead's wait never moves an assignee's, nor the other way round.
// Who writes (lead decision 2026-10-02): the lead starts threads (`thread new`, optionally --to <agent>) and may
// always reply; other agents reply only in threads assigned to them ("ask the lead to assign you").
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, readAll, nextId, idParser, iso } from './store.mjs';
import { consoleDir, recipients } from './console.mjs';
import { PERSONAL, sanitize } from './progress.mjs';
import { redact } from './redact.mjs';

export const STATUSES = ['open', 'closed'];
export const STATES = ['open', 'waiting-on-you', 'answered', 'closed'];
export const LIMITS = Object.freeze({ title: 160, text: 8000, messages: 500, assignees: 8, note: 300 });
export const USER = 'user';
export const LEAD = 'lead';
const GUARD = 'console-threads';
const TOPIC = /^[a-z0-9][a-z0-9-]{0,40}$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export const TID = /^T-\d{1,6}$/;

export const threadsDir = () => join(consoleDir(), 'threads');
const fileOf = (id) => join(threadsDir(), `${id}.json`);

/** "3", "t-3", "T-003" -> "T-003". */
export const parseThreadId = idParser('T', 'thread');

// ---- text --------------------------------------------------------------------------------------------

/** Control characters out (tabs and line breaks stay); CRLF -> LF; trimmed. */
const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
/** One line: line breaks and control characters become spaces. */
export const oneLine = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();

/** A local console link an agent may keep (http://localhost:5559/progress), unless its path holds personal data. */
const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?(?:\/[\w\-./#?=&%~+:]*)?/gi;
const personalIn = (s) => PERSONAL.some(([name, re]) => name !== 'url' && name !== 'ip address' && (re.lastIndex = 0, re.test(s)));

/**
 * Agent text made safe to store and show: URLs (except localhost ones), IP addresses, .local/.lan hosts, e-mails,
 * device ids and home paths replaced (progress.mjs sanitize, which also runs redact.mjs). Returns {text, scrubbed: [kinds]}.
 */
export function scrubAgentText(s) {
  const kept = [];
  const raw = clean(s);
  let t = raw.replace(LOCAL_URL, (m) => {
    if (personalIn(m.replace(/^https?:\/\/[^/]+/i, ''))) return m; // scrubbed below like any URL
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });
  // the same steps as progress.mjs sanitize (a unit test holds them equal), one at a time to name what changed
  const scrubbed = new Set();
  for (const [name, re] of PERSONAL) {
    const n = t.replace(re, name === 'home path' ? '~' : name === 'url' ? '<link>' : `<${name}>`);
    if (n !== t) scrubbed.add(name);
    t = n;
  }
  const r = redact(t);
  if (r !== t) scrubbed.add('device id');
  t = r.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
  return { text: t, scrubbed: [...scrubbed] };
}

function needText(v, what, max) {
  const t = clean(v);
  if (!t) throw new Error(`${what} is empty`);
  if (t.length > max) throw new Error(`${what} is too long (${t.length} > ${max} chars)`);
  return t;
}
function needAgent(by, what = '--by <your agent name>') {
  const b = String(by ?? '').trim();
  if (!b) throw new Error(`${what} is required`);
  if (b.toLowerCase() === USER) throw new Error('"user" writes only from the console page; relay a chat message as --by lead');
  if (!AGENT.test(b)) throw new Error(`bad agent name "${b.slice(0, 70)}" (letters, digits, _ . -)`);
  return b;
}
function agentList(to, required) {
  const names = [...new Set(String(to ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => needAgent(n, '--to <agent>')))];
  if (required && !names.length) throw new Error('--to <agent>[,<agent>] is required');
  return names;
}
function normTopic(t) {
  if (t == null || t === '') return undefined;
  const s = String(t).trim().toLowerCase();
  if (!TOPIC.test(s)) throw new Error(`--topic must be a status / PROGRESS id like hero-exit (got ${String(t).slice(0, 50)})`);
  return s;
}

// ---- derived views -----------------------------------------------------------------------------------

const last = (t) => t.messages[t.messages.length - 1];
const isAgentMsg = (m) => m.by !== USER;

export function threadState(t) {
  if (t.status === 'closed') return 'closed';
  const m = last(t);
  if (!m || m.by === USER) return 'open';
  return m.ask ? 'waiting-on-you' : 'answered';
}

/** True when `reader` (an agent) follows the thread and may reply in it: the lead always; others when assigned. */
export function sees(t, reader) {
  return reader === LEAD || t.assignees.includes(reader);
}

/** Unread messages for `reader`: 'user' -> agents' messages; an agent -> the user's messages (in threads it sees). */
export function unreadFor(t, reader) {
  const mark = t.reads?.[reader] || 0;
  if (reader === USER) return t.messages.filter((m) => isAgentMsg(m) && m.n > mark);
  if (!sees(t, reader)) return [];
  return t.messages.filter((m) => m.by === USER && m.n > mark);
}

/** The list row the page and `thread list` show (no reads of agents, no history). */
export function summary(t, reader = USER) {
  const m = last(t);
  const agentMsgs = t.messages.filter(isAgentMsg);
  return {
    id: t.id, title: t.title, topic: t.topic, status: t.status, state: threadState(t), createdBy: t.createdBy,
    createdAt: t.createdAt, count: t.messages.length, unread: unreadFor(t, reader).length,
    lastAt: m ? m.at : t.createdAt, lastBy: m ? m.by : t.createdBy,
    lastAgentN: agentMsgs.length ? agentMsgs[agentMsgs.length - 1].n : 0,
    assignees: [...t.assignees],
    // I-084: who reads the user's reply: the lead always (it reads every thread), then the assignees
    to: recipients(LEAD, t.assignees || []),
  };
}

/** The full thread for the page: messages, the user's read mark; no agents' read marks or history. */
export function pageThread(t) {
  return { ...summary(t, USER), messages: t.messages.map((m) => ({ n: m.n, at: m.at, by: m.by, text: m.text, ...(m.ask && { ask: true }) })), readUser: t.reads?.user || 0, updatedAt: t.updatedAt };
}

/** Sort for the page: the user's unread or waiting-on-you first, then open before closed, then newest activity. */
export function pageOrder(a, b) {
  const pri = (s) => (s.status === 'closed' ? 2 : s.unread || s.state === 'waiting-on-you' ? 0 : 1);
  return pri(a) - pri(b) || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0);
}

const safeId = (id) => (TID.test(id) ? id : 'T-?');

/** The badge / notification model (`event: threads`, GET /api/threads?feed=1): ids, sanitized one-line titles, counts. */
export function feedView(threads = listThreads()) {
  const rows = threads.map((t) => summary(t, USER)).map((s) => ({
    id: safeId(s.id), title: oneLine(sanitize(s.title, 160)), state: s.state, unread: s.unread, lastAgentN: s.lastAgentN, lastAt: s.lastAt,
    lastBy: oneLine(sanitize(s.lastBy, 64)),
  }));
  // the badge: threads with unread replies or a question for the user (no reminders for threads)
  return { now: iso(), badge: rows.filter((r) => r.unread > 0 || r.state === 'waiting-on-you').length, unread: rows.filter((r) => r.unread > 0).length, yourTurn: rows.filter((r) => r.state === 'waiting-on-you').length, threads: rows };
}

/**
 * The new-reply rule, pure (the page runs the same rule: console-nav.js ConsoleNotify.diffThreads; one table of cases
 * in tests/unit/console-threads.test.mjs runs against both). state = {seeded, seen: {id: lastAgentN}}.
 * - The first call seeds silently.
 * - A thread with unread replies whose lastAgentN grew -> {kind: 'reply'}; a thread not seen before with unread
 *   replies (an agent started it) -> {kind: 'thread'}.
 * Never mutates its inputs.
 */
export function diffThreads(state, threads) {
  const seeded = !!(state && state.seeded);
  const prev = (state && state.seen) || {};
  const seen = {}, events = [];
  for (const t of threads) {
    seen[t.id] = t.lastAgentN;
    if (!seeded || !(t.unread > 0)) continue;
    if (!(t.id in prev)) events.push({ kind: 'thread', thread: t });
    else if (t.lastAgentN > prev[t.id]) events.push({ kind: 'reply', thread: t });
  }
  return { state: { seeded: true, seen }, events };
}

/** Notification title and body: the thread id and its sanitized title only (never the message text). */
export function threadNotificationText(t, kind = 'reply') {
  return { title: kind === 'thread' ? 'Console: new thread' : 'Console: new reply', body: `${safeId(t.id)}: ${oneLine(sanitize(t.title, 120)) || '(no title)'}` };
}

/** The server's tick for --notify: feed it feedView().threads; it calls notify(thread, kind) per event. */
export function threadWatcher({ notify }) {
  let state = null;
  return (threads) => {
    const r = diffThreads(state, threads);
    state = r.state;
    for (const e of r.events) notify(e.thread, e.kind);
    return r.events;
  };
}

// ---- store -------------------------------------------------------------------------------------------

/** Every thread, lowest id first. */
export function listThreads() { return readAll(threadsDir(), 'T'); }

export function getThread(id) {
  const tid = parseThreadId(id);
  const t = readJson(fileOf(tid));
  if (!t) throw new Error(`no thread ${tid} (node tools/console.mjs thread list)`);
  return t;
}

/** Read-modify-write one thread under the guard; `fn(t, now)` throws to refuse, returns extra fields for the result. */
async function change(id, fn) {
  const tid = parseThreadId(id);
  return withGuard(GUARD, () => {
    const t = getThread(tid);
    const now = iso();
    const extra = fn(t, now) || {};
    t.updatedAt = now;
    t.rev = (t.rev || 0) + 1;
    writeJson(fileOf(tid), t);
    return { thread: t, ...extra };
  });
}

function addMessage(t, by, text, now, ask) {
  if (t.messages.length >= LIMITS.messages) throw new Error(`${t.id} has ${LIMITS.messages} messages: start a new thread`);
  const n = (last(t)?.n || 0) + 1;
  t.messages.push({ n, at: now, by, text, ...(ask && { ask: true }) });
  t.reads[by] = n; // the writer has seen everything up to its own message
  return n;
}

/**
 * A new thread. From the page: {title, text, topic, fromPage: true} (the user's text as typed). From the lead:
 * {by: 'lead', title, text, topic, ask, to} (scrubbed; `to`: agents to assign at once). Returns {thread, scrubbed}.
 */
export async function createThread({ by, title, text, topic, ask, to, fromPage = false }) {
  const who = fromPage ? USER : needAgent(by);
  if (!fromPage && who !== LEAD) throw new Error(`only the lead starts threads (--by lead); ${who}: ask the lead to start one and assign you`);
  const assignees = fromPage ? [] : agentList(to, false);
  if (assignees.length > LIMITS.assignees) throw new Error(`at most ${LIMITS.assignees} assignees`);
  let ttl = needText(title, 'the title', LIMITS.title).replace(/\s+/g, ' ');
  let body = needText(text, 'the first message', LIMITS.text);
  const scrubbed = new Set();
  if (!fromPage) {
    const a = scrubAgentText(ttl), b = scrubAgentText(body);
    ttl = a.text; body = b.text;
    for (const k of [...a.scrubbed, ...b.scrubbed]) scrubbed.add(k);
  }
  const tp = normTopic(topic);
  return withGuard(GUARD, () => {
    mkdirSync(threadsDir(), { recursive: true });
    const now = iso();
    const t = {
      id: nextId(listThreads(), 'T'), title: ttl, ...(tp && { topic: tp }), status: 'open', createdBy: who,
      createdAt: now, updatedAt: now, rev: 1, assignees, messages: [], reads: {}, history: [],
    };
    if (assignees.length) t.history.push({ at: now, who, action: 'assign', note: assignees.join(',') });
    addMessage(t, who, body, now, !fromPage && !!ask);
    writeJson(fileOf(t.id), t);
    return { thread: t, scrubbed: [...scrubbed] };
  });
}

/** An agent's reply (scrubbed). `ask`: the reply asks the user something (state waiting-on-you). Refused on a closed thread. */
export async function replyAgent(id, { by, text, ask = false }) {
  const who = needAgent(by);
  const raw = needText(text, 'the reply', LIMITS.text);
  const { text: body, scrubbed } = scrubAgentText(raw);
  return change(id, (t, now) => {
    if (!sees(t, who)) throw new Error(`${who} is not assigned to ${t.id}${t.assignees.length ? ` (assigned: ${t.assignees.join(', ')})` : ''}: ask the lead to assign you (node tools/console.mjs thread assign ${t.id} --to ${who} --by lead)`);
    if (t.status === 'closed') throw new Error(`${t.id} is closed: node tools/console.mjs thread reopen ${t.id} --by ${who} first`);
    return { n: addMessage(t, who, body, now, !!ask), scrubbed };
  });
}

/** The user's message from the page (as typed); a closed thread opens again. */
export async function replyUser(id, { text }) {
  const body = needText(text, 'the message', LIMITS.text);
  return change(id, (t, now) => {
    if (t.status === 'closed') { t.status = 'open'; t.history.push({ at: now, who: USER, action: 'reopen' }); }
    return { n: addMessage(t, USER, body, now, false) };
  });
}

/** Move `reader`'s read mark to `n` (never backwards; at most the last message). */
export async function markRead(id, reader, n) {
  const r = reader === USER ? USER : needAgent(reader, '--as <agent>');
  return change(id, (t) => {
    const top = last(t)?.n || 0;
    const v = n === undefined ? top : Math.min(top, Math.max(0, Math.floor(Number(n)) || 0));
    t.reads[r] = Math.max(t.reads[r] || 0, v);
    return { read: t.reads[r] };
  });
}

/** Hand the thread to agents (their `thread wait --as <agent>` wakes on it), or take it back (remove). */
export async function assign(id, { to, by, remove = false }) {
  const who = needAgent(by);
  if (who !== LEAD) throw new Error(`only the lead assigns threads (--by lead), not ${who}`);
  const names = agentList(to, true);
  return change(id, (t, now) => {
    if (remove) t.assignees = t.assignees.filter((a) => !names.includes(a));
    else for (const n of names) if (!t.assignees.includes(n)) t.assignees.push(n);
    if (t.assignees.length > LIMITS.assignees) throw new Error(`at most ${LIMITS.assignees} assignees`);
    t.history.push({ at: now, who, action: remove ? 'unassign' : 'assign', note: names.join(',') });
  });
}

/** Close (done; still readable) or reopen: the user (page), the lead or an assignee. */
export async function setStatus(id, { status, by, note, fromPage = false }) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const who = fromPage ? USER : needAgent(by);
  const nt = note ? scrubAgentText(oneLine(note).slice(0, LIMITS.note)).text : undefined;
  return change(id, (t, now) => {
    if (!fromPage && !sees(t, who)) throw new Error(`${who} is not assigned to ${t.id}: ask the lead to assign you`);
    if (t.status === status) throw new Error(`${t.id} is already ${status}`);
    t.status = status;
    t.history.push({ at: now, who, action: status === 'closed' ? 'close' : 'reopen', ...(nt && { note: nt }) });
  });
}

// ---- waits -------------------------------------------------------------------------------------------

/**
 * A tools/lib/wait.mjs condition for `console.mjs thread wait --as <agent> [--thread T-3]`: met once the agent has an
 * unread user message in a thread it sees (with --thread: that thread, followed or not); never when that thread is
 * closed. detail: [{id, title, topic, messages: [{n, at, by, text}]}] (JSON). After MET the caller runs commitWait.
 */
export function threadWaitCondition({ as, thread } = {}) {
  const reader = needAgent(as, '--as <agent>');
  const tid = thread !== undefined ? parseThreadId(thread) : undefined;
  if (tid) getThread(tid); // exists?
  const what = `threads ${tid || 'all'} for ${reader}`;
  const check = () => {
    const ts = tid ? [getThread(tid)] : listThreads();
    const news = [];
    for (const t of ts) {
      const mark = t.reads?.[reader] || 0;
      const msgs = tid ? t.messages.filter((m) => m.by === USER && m.n > mark) : unreadFor(t, reader);
      if (msgs.length) news.push({ id: t.id, title: t.title, ...(t.topic && { topic: t.topic }), state: threadState(t), messages: msgs.map((m) => ({ n: m.n, at: m.at, by: m.by, text: m.text })) });
    }
    if (news.length) return { met: true, state: `${news.length} thread(s) with news`, detail: JSON.stringify(news) };
    if (tid && ts[0].status === 'closed') return { met: false, state: 'closed', never: `${tid} was closed` };
    return { met: false, state: tid ? `${tid} ${threadState(ts[0])}, nothing new` : `${ts.length} thread(s), nothing new` };
  };
  return { what, reader, check };
}

/** After a MET wait: move the reader's marks past what was printed (later messages stay unread). */
export async function commitWait(reader, news) {
  for (const t of news) await markRead(t.id, reader, Math.max(...t.messages.map((m) => m.n)));
}

/** The NEW block `thread wait` prints for one thread. */
export function newsText(t, reader) {
  const L = [];
  for (const m of t.messages) {
    L.push(`NEW ${t.id} "${oneLine(t.title)}"${t.topic ? ` [${t.topic}]` : ''} #${m.n} by ${m.by} at ${m.at}:`);
    for (const l of String(m.text).split('\n')) L.push(`  ${l}`);
  }
  L.push(`  reply: node tools/console.mjs thread reply ${t.id} --by ${reader} --text "…" [--ask]   (or --file <f>)`);
  return L.join('\n');
}

/** One line for `thread list`. */
export function threadLine(t, reader) {
  const s = summary(t, reader || USER);
  const unread = reader ? unreadFor(t, reader).length : 0;
  return `${t.id}  [${s.state}]  ${s.count} msg${unread ? `, ${unread} unread` : ''}  last ${s.lastAt.slice(0, 16)}Z by ${s.lastBy}${t.topic ? `  [${t.topic}]` : ''}${t.assignees.length ? `  -> ${t.assignees.join(',')}` : ''}: ${oneLine(t.title)}`;
}

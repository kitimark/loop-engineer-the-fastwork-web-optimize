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
// reaches the page, the event feed or a notification (Hard rule 12). I-119: a phone link written http://lan:<port>/<path>
// is kept as written too (the literal host "lan", never an address); pageThread resolves it for the page at view time.
//
// A thread: {id, title, topic?, status: open|closed, createdBy, createdAt, updatedAt, rev, assignees: [agent],
//   messages: [{n, at, by: 'user'|agent, text, ask?, images?}], reads: {user: n, <agent>: n}, history: [{at, who, action, note?}]}
//   T-050 adds readsAt: {<agent>: iso} (last read or write: listening), triaged: [n] (printed by a triage wake past the
//   lead's mark) and histSeen: {lead: i} (history index up to which the lead has seen escalations); forLead on a message.
// Images (I-089, user PR-009 note): a message may carry up to LIMITS.images pictures, `images: [{name, caption?, w?, h?,
//   bytes}]`, stored next to the thread as threads/T-003/m<n>-<i>.<ext> (n = the message, i = 1…). Agents attach them
//   with `thread new|reply --image <path> [--caption "…"]`, the user from the page. Each one is sniffed by its first
//   bytes (proposal.mjs sniffBytes: PNG, JPEG, GIF, WebP; never by name), held to LIMITS.imageBytes, and copied as is
//   (nothing stripped). The stored metadata holds only the generated name, the caption (an agent's scrubbed), size and
//   pixel size: no source path, host or device id. A message without images is stored and shown exactly as before.
// Comments (I-090, user T-043): a thread the user starts from the Comment box on any console page carries
//   `anchor: {page, item, quote?, label?}` (console-comments.mjs checks it: a known page, an allowlisted item id, caps).
//   Only the user's page sets one; the views add the link back (anchorView). A thread without one has no anchor key.
// Derived (never stored):
//   state   closed | waiting-on-you (last message: an agent's, with ask) | answered (last: an agent's) | open (last: the user's)
//   unread  for the user: agents' messages after reads.user; for an agent: the user's messages after reads[agent],
//           in the threads it sees (the lead: all; others: the ones assigned to it). Agents' messages never wake
//           agents; an assignment does (the new assignee has no read mark, so the user's messages are unread).
//           Each reader has its own mark: the lead's wait never moves an assignee's, nor the other way round.
// Merged and related threads (user T-024 #13, 2026-10-04: one topic, one thread; ts-threads). Optional fields, absent on
//   old threads (which read as before):
//   related: [{id, kind, at, by}], stored in BOTH threads: kind 'merged' (on the kept thread: <id> was merged here),
//            'merged-into' (on the duplicate: it was merged into <id>), 'related' (both ways: same area, not a duplicate).
//   merged:  {into, at, by, closed} on the duplicate (closed: the merge closed it, so unmerge reopens it).
//   via:     on a message: the user wrote it in the merged thread <via>; it is stored in the kept thread (see replyUser).
//   No chain is ever stored: --into a merged thread resolves to its final kept thread, and a kept thread merged on takes
//   its duplicates along (they point at the new kept thread). mergeThread / relateThreads / unmergeThread: the lead, the
//   desk, or an agent assigned to both threads. createThread checkSimilar (`thread new` without --force): an open thread
//   with the same topic or a close title (finding.mjs titleSimilar) is returned as {similar, why}, nothing stored.
// Who writes (lead decision 2026-10-02): the lead starts threads (`thread new`, optionally --to <agent>) and may
// always reply; other agents reply only in threads assigned to them ("ask the lead to assign you").
import { mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, readAll, nextId, idParser, iso } from './store.mjs';
import { consoleDir, recipients } from './console.mjs';
import { PERSONAL, sanitize } from './progress.mjs';
import { redact } from './redact.mjs';
import { lanAddress } from './lan.mjs';
import { sniffMedia, sniffBytes, MEDIA_TYPES, LIMITS as PROPOSAL_LIMITS } from './proposal.mjs';
import { normAnchor, anchorView, itemText as anchorItemText, plainLine } from './console-comments.mjs';
import { routeOwner, routeContext, listeningState, listeningFn, getDesk, LISTEN_MIN, TRIAGE_ESCALATE_MIN } from './thread-routing.mjs'; // T-050
import { titleSimilar } from './finding.mjs'; // T-024 #13: the same cheap word-overlap check as `finding.mjs post`

export const STATUSES = ['open', 'closed'];
export const STATES = ['open', 'waiting-on-you', 'answered', 'closed'];
// images: per message; imageBytes: per image (the proposals' screenshot limit); pageImageBytes: all images of one
// message sent from the page together (they travel base64 in the JSON body, see console-server.mjs)
export const LIMITS = Object.freeze({ title: 160, text: 8000, messages: 500, assignees: 8, note: 300, related: 60, images: 6, caption: 160, imageBytes: PROPOSAL_LIMITS.imageBytes, pageImageBytes: 20 * 1024 * 1024 });
export const USER = 'user';
export const LEAD = 'lead';
const GUARD = 'console-threads';
const TOPIC = /^[a-z0-9][a-z0-9-]{0,40}$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export const TID = /^T-\d{1,6}$/;

export const threadsDir = () => join(consoleDir(), 'threads');
const fileOf = (id) => join(threadsDir(), `${id}.json`);
/** A thread's images: threads/T-003/ next to threads/T-003.json (I-089). */
export const threadMediaDir = (id) => join(threadsDir(), id);
/** Stored image names: m<message>-<index>.<ext>; what the server may serve (no path, no traversal). */
export const IMAGE_NAME = /^m\d{1,3}-[1-9]\.(?:png|jpg|gif|webp)$/;

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

// I-119 (user T-076): a phone link names the placeholder host `lan` (http://lan:<port>/<path>, like console steps and
// iphone.mjs, lib/lan.mjs). It is stored exactly as written, never resolved before storing; the page resolves it to the
// current LAN address only when it shows the thread (pageThread -> lanLinks). Only the literal host "lan", a numeric
// port 1-65535 and a plain path (optional ?query and #fragment of URL-safe characters, nothing personal in it)
// qualify; any other form, and every raw IP or .local/.lan host, is scrubbed to <link> as before.
/** A candidate: `http(s)://lan` and the rest of its token (lanPlaceholder validates it). */
const LAN_CANDIDATE = /\bhttps?:\/\/lan\b\S*/gi;
const LAN_VALID = /^https?:\/\/lan:(\d{1,5})(?:\/[A-Za-z0-9\-._~%/]*)?(?:\?[A-Za-z0-9\-._~%/=&+]*)?(?:#[A-Za-z0-9\-._~%/=&+]*)?$/i;
/** Sentence punctuation after a link is not part of it. */
const TRAILING = /[.,;:!?)\]}'"]+$/;
const personalAnyIn = (s) => PERSONAL.some(([name, re]) => name !== 'url' && (re.lastIndex = 0, re.test(s)));
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** For a candidate token: {url, rest} when it is a valid phone-link placeholder (plus trailing punctuation), else null. */
function lanPlaceholder(token) {
  const url = token.replace(TRAILING, '');
  const m = LAN_VALID.exec(url);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 65535) return null;
  if (personalAnyIn(url.replace(/^https?:\/\/lan:\d+/i, ''))) return null;
  return { url, rest: token.slice(url.length) };
}

/**
 * I-119: the phone-link placeholders of a stored text, in order, each once: [{text, href}]. href is the placeholder
 * with the LAN address `resolve()` returns now (called at most once per text), or null when it can't be resolved
 * (resolve throws, or answers something that is not an IPv4 address). Default: lib/lan.mjs lanAddress().
 */
export function lanLinks(text, resolve = () => lanAddress()) {
  const found = [];
  for (const m of String(text ?? '').matchAll(LAN_CANDIDATE)) {
    const p = lanPlaceholder(m[0]);
    if (p && !found.includes(p.url)) found.push(p.url);
  }
  if (!found.length) return [];
  let addr = null;
  try { const a = resolve(); if (typeof a === 'string' && IPV4.test(a)) addr = a; } catch { /* not available: href null */ }
  return found.map((u) => ({ text: u, href: addr ? u.replace(/^(https?:\/\/)lan/i, `$1${addr}`) : null }));
}

/**
 * Agent text made safe to store and show: URLs (except localhost ones and http://lan:<port>/ phone links, I-119), IP
 * addresses, .local/.lan hosts, e-mails, device ids and home paths replaced (progress.mjs sanitize, which also runs
 * redact.mjs). Returns {text, scrubbed: [kinds]}.
 */
export function scrubAgentText(s) {
  const kept = [];
  const raw = clean(s);
  let t = raw.replace(LOCAL_URL, (m) => {
    if (personalIn(m.replace(/^https?:\/\/[^/]+/i, ''))) return m; // scrubbed below like any URL
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });
  t = t.replace(LAN_CANDIDATE, (m) => { // I-119: kept as written (the literal host "lan"); any other form scrubbed below
    const p = lanPlaceholder(m);
    if (!p) return m;
    kept.push(p.url);
    return `\u0000${kept.length - 1}\u0000${p.rest}`;
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

function needText(v, what, max, { optional = false } = {}) {
  const t = clean(v);
  if (!t && optional) return '';
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

// ---- images (I-089) ----------------------------------------------------------------------------------

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Check a message's images before anything is written: `list` = [{file, caption?}] (an agent, the CLI) or
 * [{data: base64 string, caption?}] (the user, the page). Sniffed by content (PNG, JPEG, GIF, WebP), at most
 * LIMITS.imageBytes each, LIMITS.images per message; from the page also LIMITS.pageImageBytes together.
 * `agent`: captions are scrubbed (scrubAgentText) and only files are accepted; the user's captions are kept as typed.
 * Returns {items: [{file?|bytes?, info, caption?}], scrubbed: [kinds]}. Throws with the reason; nothing is stored.
 */
export function prepareImages(list, { agent = true } = {}) {
  if (list == null) return { items: [], scrubbed: [] };
  if (!Array.isArray(list)) throw new Error('images must be a list');
  if (list.length > LIMITS.images) throw new Error(`at most ${LIMITS.images} images per message (got ${list.length})`);
  const scrubbed = new Set();
  let total = 0;
  const lim = { imageBytes: LIMITS.imageBytes, videoBytes: Infinity }; // a video is refused below, by kind
  const items = list.map((x, i) => {
    const label = `image ${i + 1}`;
    if (!x || typeof x !== 'object') throw new Error(`${label}: not an image`);
    let info, src;
    if (agent) {
      if (typeof x.file !== 'string' || !x.file) throw new Error(`${label}: --image <path> is required`);
      info = sniffMedia(x.file, lim);
      src = { file: x.file };
    } else {
      if (typeof x.data !== 'string' || !x.data || x.data.length % 4 === 1 || !B64.test(x.data)) throw new Error(`${label}: the image data is not base64`);
      const bytes = Buffer.from(x.data, 'base64');
      info = sniffBytes(bytes.subarray(0, 32), bytes.length, label, lim);
      total += bytes.length;
      src = { bytes };
    }
    if (info.kind !== 'image') throw new Error(`${label}${src.file ? ` (${src.file})` : ''}: a video; only PNG, JPEG, GIF or WebP images go into a thread`);
    let caption = x.caption == null ? '' : oneLine(clean(x.caption));
    if (caption.length > LIMITS.caption) throw new Error(`${label}: the caption is too long (${caption.length} > ${LIMITS.caption} chars)`);
    if (caption && agent) { const r = scrubAgentText(caption); caption = r.text; for (const k of r.scrubbed) scrubbed.add(k); }
    return { ...src, info, ...(caption && { caption }) };
  });
  if (!agent && total > LIMITS.pageImageBytes) throw new Error(`the images are ${(total / 1048576).toFixed(1)} MB together, over the ${LIMITS.pageImageBytes / 1048576} MB limit per message`);
  return { items, scrubbed: [...scrubbed] };
}

/**
 * `--image <path> [--caption "…"]`, repeated, from a CLI argv (`--image=<path>` and `--caption=<text>` too): a
 * --caption belongs to the --image right before it. Returns [{file, caption?}] in order. Throws on a --caption with no
 * image before it, a second --caption for one image, or a flag without its value.
 */
export function parseImageArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(image|caption)(?:=([\s\S]*))?$/.exec(argv[i]);
    if (!m) continue;
    let v = m[2];
    if (v === undefined) { v = argv[i + 1]; i++; }
    if (v === undefined || (m[2] === undefined && /^--/.test(v))) throw new Error(`--${m[1]} needs a value`);
    if (m[1] === 'image') { if (!v) throw new Error('--image needs a path'); out.push({ file: v }); continue; }
    const img = out.at(-1);
    if (!img) throw new Error('--caption belongs to the --image before it: give --image <path> first');
    if (img.caption !== undefined) throw new Error(`--image ${img.file} has two --caption flags`);
    img.caption = v;
  }
  return out;
}

/** Write prepared images for message `n` into threads/<id>/; returns their metadata (names only, no source path). */
function storeImages(id, n, items) {
  if (!items.length) return [];
  const dir = threadMediaDir(id);
  mkdirSync(dir, { recursive: true });
  const written = [];
  try {
    return items.map((x, i) => {
      const name = `m${n}-${i + 1}.${x.info.ext}`;
      const f = join(dir, name);
      written.push(f);
      if (x.bytes) writeFileSync(f, x.bytes); else copyFileSync(x.file, f);
      return { name, ...(x.caption && { caption: x.caption }), ...(x.info.width && { w: x.info.width, h: x.info.height }), bytes: x.info.size };
    });
  } catch (e) {
    for (const f of written) rmSync(f, { force: true });
    throw e;
  }
}

/** The stored file for GET /thread-media/<T-id>/<name>, or null (bad id or name, a name no message carries, missing). */
export function threadMediaFile(id, name) {
  if (!TID.test(String(id)) || !IMAGE_NAME.test(String(name))) return null;
  let t;
  try { t = getThread(id); } catch { return null; }
  if (t.id !== id || !t.messages.some((m) => (m.images || []).some((x) => x.name === name))) return null;
  const f = join(threadMediaDir(t.id), name);
  return existsSync(f) ? { file: f, type: MEDIA_TYPES[extname(name).slice(1)] } : null;
}

/** A message's images for the page: the URL it loads them from, caption, pixel size. */
const pageImages = (t, m) => m.images.map((x) => ({ url: `/thread-media/${t.id}/${x.name}`, name: x.name, ...(x.caption && { caption: x.caption }), ...(x.w && { w: x.w, h: x.h }) }));
/** A message's images for an agent's terminal (thread wait, thread show): the local file, to open with Read. */
const fileImages = (t, m) => m.images.map((x) => ({ file: join(threadMediaDir(t.id), x.name), ...(x.caption && { caption: x.caption }) }));
const imagesLine = (x, i) => `[image ${i + 1}: ${x.file}${x.caption ? ` "${x.caption}"` : ''}]`;
/** The image lines `thread show` prints under a message's text. */
export function imageLines(t, m) { return m.images?.length ? fileImages(t, m).map(imagesLine) : []; }

// ---- derived views -----------------------------------------------------------------------------------

const last = (t) => t.messages[t.messages.length - 1];
/** T-024 #13: a thread's links (old threads have none); only well-formed entries. */
const LINK_KINDS = ['merged', 'merged-into', 'related'];
export const relatedOf = (t) => (Array.isArray(t?.related) ? t.related.filter((r) => r && TID.test(String(r.id)) && LINK_KINDS.includes(r.kind)) : []);
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
export function summary(t, reader = USER, ls = null) {
  const m = last(t);
  const agentMsgs = t.messages.filter(isAgentMsg);
  const to = recipients(LEAD, t.assignees || []);
  return {
    // T-050: with a listening test (thread-routing.mjs listeningState), who of them is listening now, and the lead's
    // backstop: the page says "fix-x (listening); the lead if no answer in 10 min", or "the lead"
    ...(typeof ls === 'function' && { toState: to.map((n) => (n === LEAD ? { name: n, listening: true, how: 'lead' } : { name: n, ...ls(n) })), backstopMin: TRIAGE_ESCALATE_MIN }),
    id: t.id, title: t.title, topic: t.topic, status: t.status, state: threadState(t), createdBy: t.createdBy,
    createdAt: t.createdAt, count: t.messages.length, unread: unreadFor(t, reader).length,
    lastAt: m ? m.at : t.createdAt, lastBy: m ? m.by : t.createdBy,
    lastAgentN: agentMsgs.length ? agentMsgs[agentMsgs.length - 1].n : 0,
    assignees: [...t.assignees],
    // I-084: who reads the user's reply: the lead always (it reads every thread), then the assignees
    to,
    ...(t.anchor && { anchor: anchorView(t.anchor) }), // I-090: a comment's item, with the link back
    // T-024 #13: merged into another thread / the threads linked to this one (ids and kinds; pageThread adds titles)
    ...(t.merged && TID.test(String(t.merged.into)) && { mergedInto: t.merged.into }),
    ...(relatedOf(t).length && { related: relatedOf(t).map(({ id, kind }) => ({ id, kind })) }),
  };
}

/** The full thread for the page: messages, the user's read mark; no agents' read marks or history. */
export function pageThread(t, ls = null, { lan = () => lanAddress(), lookup = peekThread } = {}) {
  // I-119: phone links (http://lan:<port>/) resolved now, at view time, at most once per thread; `lan` for the tests.
  // The stored text keeps the placeholder; a message with such links gets lan: [{text, href|null}] (lanLinks).
  let got;
  const once = () => { got ??= (() => { try { return { a: lan() }; } catch (e) { return { e }; } })(); if (got.e) throw got.e; return got.a; };
  // T-024 #13: the linked threads with their titles and states (lookup: the store; a missing one says so)
  const view = (id) => { const o = lookup(id); return { id, title: o ? o.title : '(not found)', state: o ? threadState(o) : 'missing' }; };
  const s = summary(t, USER, ls);
  return { ...s, ...(s.related && { related: s.related.map((r) => { const v = view(r.id); return { id: r.id, kind: r.kind, title: v.title, state: v.state }; }) }),
    ...(s.mergedInto && { into: view(s.mergedInto) }),
    messages: t.messages.map((m) => {
      const links = lanLinks(m.text, once);
      return { n: m.n, at: m.at, by: m.by, text: m.text, ...(m.ask && { ask: true }), ...(m.images?.length && { images: pageImages(t, m) }), ...(links.length && { lan: links }), ...(TID.test(String(m.via)) && { via: m.via }) };
    }), readUser: t.reads?.user || 0, updatedAt: t.updatedAt };
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
  // the badge: OPEN threads with unread replies or a question for the user (no reminders for threads). T-089: a closed
  // thread never counts (an idle alarm the lead closed, a merged duplicate whose topic goes on in its kept thread, T-024
  // #13); its row stays in the feed, and the list shows its unread as a quiet dot.
  const live = rows.filter((r) => r.state !== 'closed');
  return { now: iso(), badge: live.filter((r) => r.unread > 0 || r.state === 'waiting-on-you').length, unread: live.filter((r) => r.unread > 0).length, yourTurn: live.filter((r) => r.state === 'waiting-on-you').length, threads: rows };
}

/**
 * The new-reply rule, pure (the page runs the same rule: console-nav.js ConsoleNotify.diffThreads; one table of cases
 * in tests/unit/console-threads.test.mjs runs against both). state = {seeded, seen: {id: lastAgentN}}.
 * - The first call seeds silently.
 * - T-089: a closed thread (state 'closed', merged ones too) never notifies; it is still marked seen.
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
    if (!seeded || !(t.unread > 0) || t.state === 'closed') continue; // T-089
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

/** A thread or null (missing, unreadable): for views that name other threads. */
export function peekThread(id) { try { return TID.test(String(id)) ? readJson(fileOf(id)) || null : null; } catch { return null; } }

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

function addMessage(t, by, text, now, ask, images = [], { forLead = false, via } = {}) {
  if (t.messages.length >= LIMITS.messages) throw new Error(`${t.id} has ${LIMITS.messages} messages: start a new thread`);
  const n = (last(t)?.n || 0) + 1;
  const stored = storeImages(t.id, n, images); // I-089: before the message, so a failed copy stores nothing
  t.messages.push({ n, at: now, by, text, ...(ask && { ask: true }), ...(stored.length && { images: stored }), ...(forLead && by === USER && { forLead: true }), ...(via && by === USER && { via }) });
  t.reads[by] = n; // the writer has seen everything up to its own message
  if (by !== USER) (t.readsAt ||= {})[by] = now; // T-050: an agent that writes is listening (thread-routing.mjs)
  if (by === LEAD) seenHistory(t, t.history.length); // the lead who writes has seen the escalations so far
  return n;
}

/** T-050: the lead's escalation mark, a history index (not a time: an escalation in the same ms as a read must count). */
function seenHistory(t, upTo) {
  const v = Math.min(t.history.length, Math.max(0, Math.floor(Number(upTo)) || 0));
  (t.histSeen ||= {})[LEAD] = Math.max(t.histSeen[LEAD] || 0, v);
}

// ---- T-050 routing (thread-routing.mjs): a user message goes to a listening owner --------------------------

/** The router's context with a listening test, read before taking the guard; null when it can't be read. */
async function routing() {
  try { return { ...(await routeContext()), listening: listeningFn({ threads: listThreads() }) }; } catch { return null; }
}
/**
 * When no assignee of `t` is listening: assign the first listening owner (routeOwner) and record it as
 * {who: 'router', action: 'assign', note: "<agent> (<why>)"}; former assignees stay. Nobody: the lead's triage wakes.
 */
function route(t, now, rc) {
  if (!rc) return null;
  try {
    if (t.assignees.some((a) => rc.listening(a))) return null;
    const r = routeOwner(t, rc);
    if (!r) return null;
    if (!t.assignees.includes(r.owner)) {
      if (t.assignees.length >= LIMITS.assignees) return null;
      t.assignees.push(r.owner);
    }
    t.history.push({ at: now, who: 'router', action: 'assign', note: scrubAgentText(oneLine(`${r.owner} (${r.why})`)).text.slice(0, LIMITS.note) });
    return r;
  } catch { return null; }
}

/**
 * A new thread. From the page: {title, text, topic, fromPage: true} (the user's text as typed). From the lead:
 * {by: 'lead', title, text, topic, ask, to} (scrubbed; `to`: agents to assign at once). `images` (I-089): see
 * prepareImages; with images the first message's text may be empty. `anchor` (I-090, the page's Comment box only):
 * see console-comments.mjs normAnchor. `routeTo` (T-048, the server only, never the request body): agents a user's
 * comment is handed to at once, e.g. a proposal's author (history: who "console", action assign, `routeNote`).
 * `checkSimilar` (T-024 #13, the CLI's `thread new` without --force; the page and the alarms never): an open thread with
 * the same topic or a close title is returned as {similar: thread, why, scrubbed} and nothing is stored.
 * Returns {thread, scrubbed}.
 */
export async function createThread({ by, title, text, topic, ask, to, images, anchor, routeTo, routeNote, forLead = false, fromPage = false, checkSimilar = false }) {
  if (anchor != null && !fromPage) throw new Error('only the user\'s comments carry an anchor (the Comment box on a console page)');
  if (routeTo != null && !fromPage) throw new Error('routeTo is for the user\'s comments; agents assign with --to');
  const who = fromPage ? USER : needAgent(by);
  if (!fromPage && who !== LEAD) throw new Error(`only the lead starts threads (--by lead); ${who}: ask the lead to start one and assign you`);
  const anc = anchor != null ? normAnchor(anchor) : null;
  const routed = fromPage && routeTo ? [...new Set(routeTo)].filter((n) => AGENT.test(String(n)) && n !== LEAD && n !== USER) : [];
  const assignees = fromPage ? routed.slice(0, LIMITS.assignees) : agentList(to, false);
  if (assignees.length > LIMITS.assignees) throw new Error(`at most ${LIMITS.assignees} assignees`);
  let ttl = needText(title, 'the title', LIMITS.title).replace(/\s+/g, ' ');
  const img = prepareImages(images, { agent: !fromPage });
  let body = needText(text, 'the first message', LIMITS.text, { optional: img.items.length > 0 });
  const scrubbed = new Set(img.scrubbed);
  if (!fromPage) {
    const a = scrubAgentText(ttl), b = scrubAgentText(body);
    ttl = a.text; body = b.text;
    for (const k of [...a.scrubbed, ...b.scrubbed]) scrubbed.add(k);
  }
  const tp = normTopic(topic);
  const rc = fromPage ? await routing() : null; // T-050
  return withGuard(GUARD, () => {
    mkdirSync(threadsDir(), { recursive: true });
    if (checkSimilar) { // T-024 #13 (`thread new` without --force): an open thread on this already? nothing stored
      const s = similarThread({ title: ttl, topic: tp }, listThreads());
      if (s) return { similar: s.thread, why: s.why, scrubbed: [...scrubbed] };
    }
    const now = iso();
    const t = {
      id: nextId(listThreads(), 'T'), title: ttl, ...(tp && { topic: tp }), ...(anc && { anchor: anc }), status: 'open', createdBy: who,
      createdAt: now, updatedAt: now, rev: 1, assignees, messages: [], reads: {}, history: [],
    };
    if (assignees.length) t.history.push({ at: now, who: fromPage ? 'console' : who, action: 'assign', note: fromPage && routeNote ? `${assignees.join(',')} (${oneLine(routeNote).slice(0, LIMITS.note)})` : assignees.join(',') });
    addMessage(t, who, body, now, !fromPage && !!ask, img.items, { forLead: fromPage && !!forLead });
    if (fromPage) route(t, now, rc); // T-050: no listening assignee -> the first listening owner
    writeJson(fileOf(t.id), t);
    return { thread: t, scrubbed: [...scrubbed] };
  });
}

/**
 * An agent's reply (scrubbed). `ask`: the reply asks the user something (state waiting-on-you). Refused on a closed
 * thread. `images` (I-089): [{file, caption?}]; with images the text may be empty.
 */
export async function replyAgent(id, { by, text, ask = false, images }) {
  const who = needAgent(by);
  const img = prepareImages(images, { agent: true });
  const raw = needText(text, 'the reply', LIMITS.text, { optional: img.items.length > 0 });
  const { text: body, scrubbed: sc } = scrubAgentText(raw);
  const scrubbed = [...new Set([...sc, ...img.scrubbed])];
  return change(id, (t, now) => {
    if (!sees(t, who)) throw new Error(`${who} is not assigned to ${t.id}${t.assignees.length ? ` (assigned: ${t.assignees.join(', ')})` : ''}: ask the lead to assign you (node tools/console.mjs thread assign ${t.id} --to ${who} --by lead)`);
    if (t.merged) throw new Error(`${t.id} is merged into ${t.merged.into}: reply there (node tools/console.mjs thread reply ${t.merged.into} --by ${who} …)`);
    if (t.status === 'closed') throw new Error(`${t.id} is closed: node tools/console.mjs thread reopen ${t.id} --by ${who} first`);
    return { n: addMessage(t, who, body, now, !!ask, img.items), scrubbed, images: img.items.length };
  });
}

/**
 * The user's message from the page (as typed); a closed thread opens again. `images`: [{data: base64, caption?}] (I-089).
 * T-024 #13: written in a merged thread, the message is stored in its kept thread instead, marked via: <the merged one>
 * (one copy, in the thread the topic now lives in): the kept thread's assignees' waits wake on it and the router
 * (T-050) routes it as a message on the kept thread; the merged thread stays closed and unchanged. A kept thread that
 * can't be read: the message stays where it was written. Returns {thread (where it was stored), n, via?}.
 */
export async function replyUser(id, { text, images, forLead = false }) {
  const img = prepareImages(images, { agent: false });
  const body = needText(text, 'the message', LIMITS.text, { optional: img.items.length > 0 });
  const rc = await routing(); // T-050
  return changeSet([id], ({ get, touch }, now) => {
    let t = get(id);
    let via;
    if (t.merged) {
      const k = (() => { try { return get(finalKeep(t, get)); } catch { return null; } })();
      if (k && !k.merged) { via = t.id; t = k; }
    }
    if (t.status === 'closed') { t.status = 'open'; t.history.push({ at: now, who: USER, action: 'reopen' }); }
    const n = addMessage(t, USER, body, now, false, img.items, { forLead: !!forLead, via });
    route(t, now, rc);
    touch(t);
    return { thread: t, n, ...(via && { via }) };
  });
}

/**
 * T-050: an owner (an assignee) or the desk hands a decision to the lead: history {action: 'escalate', note}
 * (scrubbed); the lead's `thread wait --as lead --triage` wakes on it once.
 */
export async function escalate(id, { by, note }) {
  const who = needAgent(by);
  if (who === LEAD) throw new Error('the lead decides: escalate is for a thread\'s owner or the desk');
  const { text, scrubbed } = scrubAgentText(oneLine(needText(note, 'the note (what the lead must decide)', LIMITS.note)));
  const desk = getDesk()?.agent;
  return change(id, (t, now) => {
    if (!sees(t, who) && who !== desk) throw new Error(`${who} is not assigned to ${t.id} and is not the desk: only its owner or the desk escalates`);
    t.history.push({ at: now, who, action: 'escalate', note: text });
    (t.readsAt ||= {})[who] = now; // an agent that escalates is listening
    return { scrubbed };
  });
}

/**
 * Move `reader`'s read mark to `n` (never backwards; at most the last message). For the lead also the escalation mark
 * (histSeen.lead): to `histTo` (a triage wake passes what it printed), else the whole history (the lead read the thread).
 */
export async function markRead(id, reader, n, { histTo } = {}) {
  const r = reader === USER ? USER : needAgent(reader, '--as <agent>');
  return change(id, (t, now) => {
    const top = last(t)?.n || 0;
    const v = n === undefined ? top : Math.min(top, Math.max(0, Math.floor(Number(n)) || 0));
    t.reads[r] = Math.max(t.reads[r] || 0, v);
    if (r !== USER) (t.readsAt ||= {})[r] = now; // T-050: a reader is listening
    if (r === LEAD) seenHistory(t, histTo ?? t.history.length);
    return { read: t.reads[r] };
  });
}

/** Hand the thread to agents (their `thread wait --as <agent>` wakes on it), or take it back (remove). */
export async function assign(id, { to, by, remove = false }) {
  const who = needAgent(by);
  const names = agentList(to, true);
  if (who !== LEAD) {
    // T-050 decision 2: the desk may hand a thread on, only to an owner who is listening
    const desk = getDesk()?.agent;
    if (who !== desk) throw new Error(`only the lead${desk ? ` or the desk (${desk})` : ''} assigns threads (--by lead), not ${who}`);
    if (remove) throw new Error('only the lead removes assignees');
    const ls = listeningFn({ threads: listThreads() });
    const deaf = names.filter((n) => !ls(n));
    if (deaf.length) throw new Error(`${deaf.join(', ')} ${deaf.length > 1 ? 'are' : 'is'} not listening (no thread wait armed, no read or reply in ${LISTEN_MIN} min): escalate to the lead instead (node tools/console.mjs thread escalate <id> --by ${who} --note "…")`);
  }
  return change(id, (t, now) => {
    if (remove) t.assignees = t.assignees.filter((a) => !names.includes(a));
    else for (const n of names) if (!t.assignees.includes(n)) t.assignees.push(n);
    if (t.assignees.length > LIMITS.assignees) throw new Error(`at most ${LIMITS.assignees} assignees`);
    t.history.push({ at: now, who, action: remove ? 'unassign' : 'assign', note: names.join(',') });
  });
}

/**
 * T-089 (lead, 2026-10-04): a closed thread leaves the user's badge, and a merged one also leaves the list by default,
 * so replies the user has not read there would sink out of view (ops' 07:55Z merge did that). `thread close` and
 * `thread merge` pass unreadCheck (the CLI, unless --force): refused while the user has unread agent replies in the
 * thread, naming each (m<n>, who, when, the first words). Not checked: the user's own close from the page, a reopen,
 * and the callers that pass no unreadCheck (the idle, step and disk alarms close their own threads when the condition
 * clears).
 */
function unreadGuard(t, doing) {
  const u = unreadFor(t, USER);
  if (!u.length) return;
  const one = u.length === 1;
  const lines = u.slice(0, 10).map((m) => `  m${m.n} by ${m.by} ${String(m.at || '').slice(0, 16)}Z: ${oneLine(m.text || (m.images?.length ? '(images)' : '')).slice(0, 80)}`);
  throw new Error(`${t.id} has ${u.length} ${one ? 'reply' : 'replies'} the user has not read; ${doing} would take ${one ? 'it' : 'them'} off the Threads badge (T-089):\n${lines.join('\n')}${u.length > 10 ? `\n  ... and ${u.length - 10} more` : ''}\nLet the user read ${one ? 'it' : 'them'} first, or pass --force.`);
}

/**
 * Close (done; still readable) or reopen: the user (page), the lead or an assignee. `unreadCheck` (the CLI's close
 * without --force): refuse to close while the user has unread replies there (unreadGuard, T-089).
 */
export async function setStatus(id, { status, by, note, fromPage = false, unreadCheck = false }) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const who = fromPage ? USER : needAgent(by);
  const nt = note ? scrubAgentText(oneLine(note).slice(0, LIMITS.note)).text : undefined;
  return change(id, (t, now) => {
    if (!fromPage && !sees(t, who)) throw new Error(`${who} is not assigned to ${t.id}: ask the lead to assign you`);
    if (t.status === status) throw new Error(`${t.id} is already ${status}`);
    if (t.merged && status === 'open') throw new Error(`${t.id} is merged into ${t.merged.into}: write there${fromPage ? '' : ` (or undo it: node tools/console.mjs thread unmerge ${t.id} --by ${who})`}`);
    if (unreadCheck && !fromPage && status === 'closed') unreadGuard(t, 'closing it');
    t.status = status;
    t.history.push({ at: now, who, action: status === 'closed' ? 'close' : 'reopen', ...(nt && { note: nt }) });
  });
}

// ---- merged and related threads (T-024 #13) -----------------------------------------------------------

/**
 * Read-modify-write several threads under ONE guard: `fn({get, touch}, now)` reads threads with get(id) (each read
 * once), marks the ones it changed with touch(t), and throws to refuse (nothing is written: every check comes before
 * the first write). Returns what fn returns.
 */
async function changeSet(ids, fn) {
  return withGuard(GUARD, () => {
    const map = new Map();
    const get = (id) => { const x = parseThreadId(id); if (!map.has(x)) map.set(x, getThread(x)); return map.get(x); };
    for (const id of ids) get(id);
    const touched = new Set();
    const now = iso();
    const out = fn({ get, touch: (t) => touched.add(t.id) }, now);
    for (const id of touched) { const t = map.get(id); t.updatedAt = now; t.rev = (t.rev || 0) + 1; writeJson(fileOf(id), t); }
    return out;
  });
}

/** The thread `t` finally lives in: follows merged.into (one hop in a store this module wrote); throws on a cycle. */
function finalKeep(t, get) {
  const seen = new Set([t.id]);
  let cur = t;
  while (cur.merged) {
    const next = parseThreadId(cur.merged.into);
    if (seen.has(next)) throw new Error(`a merge cycle through ${[...seen].join(', ')}`);
    seen.add(next);
    cur = get(next);
  }
  return cur.id;
}

/** Who may merge, relate and unmerge: the lead, the desk, or an agent assigned to every thread involved. */
function mayLink(who, threads, what) {
  if (who === LEAD) return;
  if (who === getDesk()?.agent) return;
  if (threads.every((t) => sees(t, who))) return;
  throw new Error(`${who} may not ${what} ${threads.map((t) => t.id).join(' and ')}: the lead, the desk or an agent assigned to ${threads.length > 1 ? 'both' : 'it'} does`);
}

const addLink = (t, id, kind, at, by) => {
  const rel = relatedOf(t).filter((r) => r.id !== id);
  if (rel.length >= LIMITS.related) throw new Error(`${t.id} has ${LIMITS.related} linked threads already`);
  t.related = [...rel, { id, kind, at, by }];
};
const dropLink = (t, id) => { t.related = relatedOf(t).filter((r) => r.id !== id); };
const noteOf = (note) => (note ? scrubAgentText(oneLine(note)).text.slice(0, LIMITS.note) : '');

/**
 * `thread merge <dup> --into <keep> --by <agent> [--note]`: <dup> is closed with a pointer (merged: {into}), both threads
 * list each other (keep: kind 'merged', dup: 'merged-into') and get a history entry. --into a merged thread resolves to
 * its final kept thread (result.resolved names the one given); a <dup> that is itself a kept thread takes its duplicates
 * along (result.moved: they now point at <keep>), so no chain is stored. Refused: a self-merge, an unknown id, a thread
 * already merged (unmerge it first), a cycle; with unreadCheck (the CLI, unless --force) a <dup> the user has unread
 * replies in (unreadGuard, T-089). Returns {thread: dup, into, resolved?, moved: [ids]}.
 */
export async function mergeThread(dupId, { into, by, note, unreadCheck = false } = {}) {
  const who = needAgent(by);
  if (into == null || into === '') throw new Error('--into <the thread to keep> is required');
  const d0 = parseThreadId(dupId), k0 = parseThreadId(into);
  if (d0 === k0) throw new Error(`a thread can't be merged into itself (${d0})`);
  const nt = noteOf(note);
  return changeSet([d0, k0], ({ get, touch }, now) => {
    const dup = get(d0);
    if (dup.merged) throw new Error(`${dup.id} is already merged into ${dup.merged.into}: thread unmerge ${dup.id} first`);
    const k = get(k0);
    let keepId;
    try { keepId = finalKeep(k, get); } catch (e) { throw new Error(`${k0}: ${e.message}`); }
    if (keepId === dup.id) throw new Error(`a cycle: ${k0} is merged into ${dup.id}, so ${dup.id} can't be merged into it`);
    const keep = get(keepId);
    mayLink(who, [dup, keep], 'merge');
    if (unreadCheck) unreadGuard(dup, `merging it into ${keep.id}`);
    const moved = relatedOf(dup).filter((r) => r.kind === 'merged').map((r) => r.id).filter((id) => id !== keep.id);
    const kids = moved.map((id) => { try { return get(id); } catch { return null; } }).filter((c) => c && c.merged?.into === dup.id);
    // the writes, after every check
    for (const c of kids) {
      c.merged = { ...c.merged, into: keep.id };
      dropLink(c, dup.id); addLink(c, keep.id, 'merged-into', now, who);
      c.history.push({ at: now, who, action: 'merge', note: `into ${keep.id} (moved from ${dup.id}, merged on into ${keep.id})` });
      dropLink(dup, c.id); addLink(keep, c.id, 'merged', now, who);
      touch(c);
    }
    const wasOpen = dup.status !== 'closed';
    dup.status = 'closed';
    dup.merged = { into: keep.id, at: now, by: who, closed: wasOpen };
    addLink(dup, keep.id, 'merged-into', now, who);
    addLink(keep, dup.id, 'merged', now, who);
    dup.history.push({ at: now, who, action: 'merge', note: `into ${keep.id}${nt ? `: ${nt}` : ''}`.slice(0, LIMITS.note) });
    keep.history.push({ at: now, who, action: 'merge', note: `${dup.id} merged here${kids.length ? ` with ${kids.map((c) => c.id).join(', ')}` : ''}${nt ? `: ${nt}` : ''}`.slice(0, LIMITS.note) });
    touch(dup); touch(keep);
    return { thread: dup, into: keep.id, ...(keep.id !== k0 && { resolved: k0 }), moved: kids.map((c) => c.id) };
  });
}

/** `thread unmerge <dup> --by`: drops the merge links on both threads; reopens <dup> when the merge closed it. */
export async function unmergeThread(dupId, { by } = {}) {
  const who = needAgent(by);
  return changeSet([dupId], ({ get, touch }, now) => {
    const dup = get(dupId);
    if (!dup.merged) throw new Error(`${dup.id} is not merged into another thread`);
    let keep = null;
    try { keep = get(dup.merged.into); } catch { /* gone: undo on the duplicate alone */ }
    mayLink(who, keep ? [dup, keep] : [dup], 'unmerge');
    const from = dup.merged.into;
    const reopen = dup.merged.closed === true && dup.status === 'closed';
    delete dup.merged;
    dropLink(dup, from);
    if (reopen) dup.status = 'open';
    dup.history.push({ at: now, who, action: 'unmerge', note: `from ${from}${reopen ? ', reopened' : ''}` });
    touch(dup);
    if (keep) { dropLink(keep, dup.id); keep.history.push({ at: now, who, action: 'unmerge', note: `${dup.id} taken out` }); touch(keep); }
    return { thread: dup, from, reopened: reopen };
  });
}

/** `thread relate <a> <b> --by [--remove]`: two threads on the same area that are not duplicates, linked both ways. */
export async function relateThreads(aId, bId, { by, remove = false } = {}) {
  const who = needAgent(by);
  const a0 = parseThreadId(aId), b0 = parseThreadId(bId);
  if (a0 === b0) throw new Error(`a thread can't be related to itself (${a0})`);
  return changeSet([a0, b0], ({ get, touch }, now) => {
    const a = get(a0), b = get(b0);
    mayLink(who, [a, b], 'relate');
    const link = relatedOf(a).find((r) => r.id === b.id) || relatedOf(b).find((r) => r.id === a.id);
    if (remove) {
      if (!link) throw new Error(`${a.id} and ${b.id} are not related`);
      if (link.kind !== 'related') { const d = a.merged ? a : b; throw new Error(`${a.id} and ${b.id} are linked because ${d.id} was merged: node tools/console.mjs thread unmerge ${d.id} undoes it`); }
      dropLink(a, b.id); dropLink(b, a.id);
    } else {
      if (link) throw new Error(`${a.id} and ${b.id} are already linked (${link.kind})`);
      addLink(a, b.id, 'related', now, who); addLink(b, a.id, 'related', now, who);
    }
    a.history.push({ at: now, who, action: remove ? 'unrelate' : 'relate', note: b.id });
    b.history.push({ at: now, who, action: remove ? 'unrelate' : 'relate', note: a.id });
    touch(a); touch(b);
    return { a: a.id, b: b.id };
  });
}

/**
 * `thread new` prevention (T-024 #13): the first OPEN thread (not merged) with the same topic, else one whose title is
 * close (finding.mjs titleSimilar: the same content words in any order, or one title's words inside the other's).
 * Returns {thread, why} or null.
 */
export function similarThread({ title, topic }, threads = listThreads()) {
  const open = threads.filter((t) => t.status !== 'closed' && !t.merged);
  if (topic) { const t = open.find((x) => x.topic === topic); if (t) return { thread: t, why: `same topic ${topic}` }; }
  const t = title ? open.find((x) => titleSimilar(x.title, title)) : null;
  return t ? { thread: t, why: 'similar title' } : null;
}

// ---- waits -------------------------------------------------------------------------------------------

/**
 * A tools/lib/wait.mjs condition for `console.mjs thread wait --as <agent> [--thread T-3]`: met once the agent has an
 * unread user message in a thread it sees (with --thread: that thread, followed or not); never when that thread is
 * closed. detail: [{id, title, topic, messages: [{n, at, by, text}]}] (JSON). After MET the caller runs commitWait.
 */
export function threadWaitCondition({ as, thread, triage = false, now } = {}) {
  const reader = needAgent(as, '--as <agent>');
  if (triage) {
    if (reader !== LEAD) throw new Error('--triage is the lead\'s wait (--as lead); an owner waits with thread wait --as <you>');
    if (thread !== undefined) throw new Error('--triage watches every thread: leave out --thread');
    return triageCondition(now);
  }
  const tid = thread !== undefined ? parseThreadId(thread) : undefined;
  if (tid) getThread(tid); // exists?
  const what = `threads ${tid || 'all'} for ${reader}`;
  const check = () => {
    const ts = tid ? [getThread(tid)] : listThreads();
    if (tid && ts[0].merged) return { met: false, state: 'merged', never: `${tid} was merged into ${ts[0].merged.into}: wait on that one (or without --thread)` };
    const news = [];
    for (const t of ts) {
      const mark = t.reads?.[reader] || 0;
      const msgs = tid ? t.messages.filter((m) => m.by === USER && m.n > mark) : unreadFor(t, reader);
      if (msgs.length) news.push({ id: t.id, title: t.title, ...(t.topic && { topic: t.topic }), ...(t.anchor && { anchor: anchorView(t.anchor) }), state: threadState(t), messages: msgs.map((m) => ({ n: m.n, at: m.at, by: m.by, text: m.text, ...(m.via && { via: m.via }), ...(m.images?.length && { images: fileImages(t, m) }) })) });
    }
    if (news.length) return { met: true, state: `${news.length} thread(s) with news`, detail: JSON.stringify(news) };
    if (tid && ts[0].status === 'closed') return { met: false, state: 'closed', never: `${tid} was closed` };
    return { met: false, state: tid ? `${tid} ${threadState(ts[0])}, nothing new` : `${ts.length} thread(s), nothing new` };
  };
  return { what, reader, check };
}

/**
 * T-050: `thread wait --as lead --triage`: met for a thread when, after the lead's read mark, (a) a user message has no
 * agent reply and no assignee is listening, (b) a user message is marked "for the lead" (forLead), (c) an escalation
 * comes after the lead's escalation mark (histSeen.lead, a history index), or (d) a user message is TRIAGE_ESCALATE_MIN old
 * with no agent reply after it while an owner listens. A news item adds `why` (one line per reason) and `markTo`: the
 * lead's mark moves past what was printed but stays before a message whose 10 min are still running; `printed` (the n of
 * each printed message) goes to t.triaged on commit, so a message printed past the mark wakes the lead only once;
 * `histTo` (the history length seen) moves the escalation mark, so an escalation made after the check still wakes.
 * `now`: () => ms, for tests.
 */
function triageCondition(nowFn) {
  const what = 'threads that need the lead (triage)';
  const check = () => {
    const now = nowFn ? nowFn() : Date.now();
    const ts = listThreads();
    const ls = listeningState({ now, threads: ts });
    const news = [];
    for (const t of ts) {
      const mark = t.reads?.[LEAD] || 0;
      const histSeen = t.histSeen?.[LEAD] || 0;
      const owners = t.assignees.filter((a) => ls(a).listening);
      const why = [], msgs = [];
      let pending = Infinity;
      const printed = new Set(t.triaged || []); // printed by an earlier triage wake while an older timer still ran
      for (const m of t.messages) {
        if (m.by !== USER || m.n <= mark || printed.has(m.n)) continue;
        const answered = t.messages.some((x) => x.n > m.n && x.by !== USER);
        let r = null;
        if (m.forLead) r = 'for the lead';
        else if (answered) continue;
        else if (!owners.length) r = t.assignees.length ? `nobody listening (assigned: ${t.assignees.join(', ')})` : 'nobody listening';
        else if (now - Date.parse(m.at) >= TRIAGE_ESCALATE_MIN * 60000) r = `unanswered ${TRIAGE_ESCALATE_MIN} min (owner: ${owners.join(', ')})`;
        if (!r) { pending = Math.min(pending, m.n); continue; }
        msgs.push(m);
        why.push(`#${m.n} ${r}`);
      }
      const hist = t.history || [];
      for (let i = histSeen; i < hist.length; i++) if (hist[i].action === 'escalate') why.push(`escalated by ${hist[i].who}: ${hist[i].note}`);
      if (!why.length) continue;
      const top = msgs.length ? Math.max(...msgs.map((m) => m.n)) : mark;
      news.push({
        id: t.id, title: t.title, ...(t.topic && { topic: t.topic }), ...(t.anchor && { anchor: anchorView(t.anchor) }), state: threadState(t), why,
        messages: msgs.map((m) => ({ n: m.n, at: m.at, by: m.by, text: m.text, ...(m.forLead && { forLead: true }), ...(m.via && { via: m.via }), ...(m.images?.length && { images: fileImages(t, m) }) })),
        markTo: Math.max(mark, Math.min(top, pending - 1)),
        printed: msgs.map((m) => m.n),
        histTo: hist.length,
      });
    }
    if (news.length) return { met: true, state: `${news.length} thread(s) need the lead`, detail: JSON.stringify(news) };
    return { met: false, state: `${ts.length} thread(s), nothing for the lead` };
  };
  return { what, reader: LEAD, check, triage: true };
}

/** After a MET wait: move the reader's marks past what was printed (later messages stay unread). */
export async function commitWait(reader, news) {
  for (const t of news) {
    await markRead(t.id, reader, t.markTo ?? (t.messages.length ? Math.max(...t.messages.map((m) => m.n)) : 0), { histTo: t.histTo });
    // T-050 triage: messages printed past the mark (a "for the lead" message after one whose 10 min still run) are
    // remembered in t.triaged until the lead's mark passes them, so each wakes the lead once
    if (reader === LEAD && Array.isArray(t.printed)) {
      await change(t.id, (x) => {
        const m = x.reads?.[LEAD] || 0;
        const keep = [...new Set([...(x.triaged || []), ...t.printed])].filter((n) => Number.isInteger(n) && n > m).sort((a, b) => a - b);
        if (keep.length) x.triaged = keep; else delete x.triaged;
      });
    }
  }
}

/** I-090: one line naming a comment's item: `(comment on PR-009 option both, shot 2 (/proposals#PR-009): "the quote")`. */
export function anchorLine(a) {
  const v = a.url ? a : anchorView(a);
  return `(comment on ${anchorItemText(v)}${v.url ? ` (${v.url})` : ''}${v.quote ? `: "${plainLine(v.quote)}"` : ''})`;
}

/** The NEW block `thread wait` prints for one thread. */
export function newsText(t, reader) {
  const L = [];
  if (t.why?.length) L.push(`TRIAGE ${t.id} "${oneLine(t.title)}"${t.topic ? ` [${t.topic}]` : ''}: ${t.why.map(oneLine).join('; ')}`); // T-050
  for (const m of t.messages) {
    L.push(`NEW ${t.id} "${oneLine(t.title)}"${t.topic ? ` [${t.topic}]` : ''} #${m.n} by ${m.by}${m.forLead ? ' (for the lead)' : ''}${m.via ? ` (written in ${m.via}, merged here)` : ''} at ${m.at}:`);
    if (m === t.messages[0] && t.anchor) L.push(`  ${anchorLine(t.anchor)}`); // I-090: what the comment is about
    if (m.text || !m.images?.length) for (const l of String(m.text).split('\n')) L.push(`  ${l}`);
    (m.images || []).forEach((x, i) => L.push(`  ${imagesLine(x, i)}`)); // I-089: the user's pictures, to open with Read
  }
  L.push(`  reply: node tools/console.mjs thread reply ${t.id} --by ${reader} --text "…" [--ask]   (or --file <f>; images: --image <png|jpg|gif|webp> [--caption "…"], up to ${LIMITS.images})`);
  return L.join('\n');
}

/**
 * I-147 (PR-020 N2): `thread wait --monitor` prints every wake as ONE line, `WAKE <kind> <id> <short text>`, so a
 * Claude Code Monitor streams it with no grep (a TRIAGE/NEW filter dropped the PR-019 decision). Kinds: new (a message
 * in a followed thread), triage (a message the lead's triage wait picked, with its reason), escalate, proposal, end
 * (the wait's own --timeout), never. The text is one line, cut to WAKE_TEXT_MAX; `thread show <id>` has the rest.
 */
export const WAKE_TEXT_MAX = 160;
export const wakeShort = (s, max = WAKE_TEXT_MAX) => { const t = oneLine(s); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
/** The WAKE lines of one thread news item (from `thread wait`): one per message, then one per escalation. */
export function wakeLines(t) {
  const reason = new Map(), esc = [];
  for (const w of t.why || []) {
    const m = String(w).match(/^#(\d+) (.*)$/s);
    if (m) reason.set(Number(m[1]), oneLine(m[2]));
    else esc.push(String(w).replace(/^escalated /, ''));
  }
  const kind = t.why?.length ? 'triage' : 'new';
  const L = (t.messages || []).map((m) => {
    const why = reason.get(m.n) || (m.forLead ? 'for the lead' : '');
    const imgs = m.images?.length ? `[${m.images.length} image${m.images.length > 1 ? 's' : ''}]` : '';
    const text = [oneLine(m.text), imgs].filter(Boolean).join(' ');
    return `WAKE ${kind} ${t.id} #${m.n} by ${oneLine(m.by)}${why ? ` (${why})` : ''}: ${wakeShort(text)}`;
  });
  for (const e of esc) L.push(`WAKE escalate ${t.id} ${wakeShort(e)}`);
  return L;
}
/** The last line of a --monitor wait that ran out of its --timeout. */
export const wakeEndLine = ({ reader, triage = false, waitedSec }) =>
  `WAKE end ${reader} timeout after ${waitedSec} s; re-arm: node tools/console.mjs thread wait --as ${reader}${triage ? ' --triage' : ''} --monitor`;
/** The last line of a --monitor wait that can never be met (its --thread was closed or merged). */
export const wakeNeverLine = ({ id, why }) => `WAKE never ${id || '-'} ${wakeShort(why)}`;

/** One line for `thread list`. */
export function threadLine(t, reader, ls = null) {
  const s = summary(t, reader || USER);
  const unread = reader ? unreadFor(t, reader).length : 0;
  // T-050 (`thread list`): each assignee's listening state
  const who = t.assignees.map((a) => (ls ? `${a} (${ls(a).listening ? 'listening' : 'not listening'})` : a)).join(',');
  return `${t.id}  [${s.state}]  ${s.count} msg${unread ? `, ${unread} unread` : ''}  last ${s.lastAt.slice(0, 16)}Z by ${s.lastBy}${t.topic ? `  [${t.topic}]` : ''}${t.assignees.length ? `  -> ${who}` : ''}${linksText(t)}: ${oneLine(t.title)}`;
}

/** T-024 #13: `  merged into T-024` or `  merged here: T-055,T-057; related: T-085` for `thread list`; '' without links. */
function linksText(t) {
  if (t.merged) return `  merged into ${t.merged.into}`;
  const ids = (k) => relatedOf(t).filter((r) => r.kind === k).map((r) => r.id);
  const parts = [['merged here', ids('merged')], ['related', ids('related')]].filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(',')}`);
  return parts.length ? `  ${parts.join('; ')}` : '';
}

/** T-024 #13: one line per linked thread for `thread show`: `merged here: T-055 [closed] <title>`. */
export function relatedLines(t, lookup = peekThread) {
  const label = { merged: 'merged here', 'merged-into': 'merged into', related: 'related' };
  const order = { 'merged-into': 0, merged: 1, related: 2 };
  return relatedOf(t).slice().sort((a, b) => order[a.kind] - order[b.kind] || (a.id < b.id ? -1 : 1)).map((r) => {
    const o = lookup(r.id);
    return `${label[r.kind]}: ${r.id} [${o ? threadState(o) : 'missing'}] ${o ? oneLine(o.title) : '(not found)'}`;
  });
}

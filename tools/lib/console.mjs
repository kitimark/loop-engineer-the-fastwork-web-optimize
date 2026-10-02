// User console store and state machine (ts-user-console, user request 2026-10-01): the steps agents need
// the user for (finger tests, blind swipe A/B, yes/no questions) go to a local page instead of the lead's
// chat. The user clicks Start when ready; the agent waits on that click (`console.mjs wait`) and starts
// its recorder before the user swipes, so a recording can no longer miss the swipe (the relay race).
//
// State lives next to the locks, incidents and findings in the shared git dir, so every worktree sees it:
//   <git-common-dir>/fastwork-mirror/console/C-001.json    one JSON file per step
//   <git-common-dir>/fastwork-mirror/console/server.json   the running page server {url, pid, port}
// ($FW_STATE_DIR replaces <git-common-dir>/fastwork-mirror in tests.) Posted URLs may name the LAN host:
// they stay in this gitignored store and are never sent anywhere.
//
// A step is a sequence of parts, then an answer:
//   status  pending -> active -> answered        (skipped: the user said "not now"; cancelled: the agent withdrew it)
//   part    waiting -> [loading -> ready] -> started -> [recording] -> done
//           loading/ready: the agent prepares the part (a "gated" part: Start stays disabled until ready);
//           started: the user clicked Start; recording: the agent's recorder runs ("recording… swipe now");
//           done: the user clicked Done (or the agent acked done, e.g. at its recording cap).
//   A runner-ended part (I-059; `ends: "runner"` in --parts, or --runner-ends N[,M]) is ended by the agent only
//   (`ack --part N --state done`): the page shows no Done button but "Running, please wait; this ends by itself",
//   and a Done from the page is refused (403), so the user can't finish a part while the phone still plays.
//   After the last part: the answer (buttons, yes/no or free text, with optional notes). A step with no
//   parts (a question) goes from Start straight to the answer; one with parts and no answer options
//   (an action) is answered "done" by the last part's Done.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, readAll, nextId, idParser, iso, clip } from './store.mjs';

export const KINDS = ['question', 'choice', 'action', 'swipe-pair'];
export const STATUSES = ['pending', 'active', 'answered', 'skipped', 'cancelled'];
export const OPEN = new Set(['pending', 'active']);
/** Part states in order; a wait for state S on a part is met once the part reached S or a later one. */
export const PART_STATES = ['waiting', 'loading', 'ready', 'started', 'recording', 'done'];
export const ACK_STATES = ['loading', 'ready', 'recording', 'done'];
export const WAIT_UNTIL = ['started', 'recording', 'done', 'answered'];
/** Who ends a part: the user (Done, the default) or the runner (`ack --state done` only; I-059). */
export const ENDS = ['user', 'runner'];
const GUARD = 'console-store';
const rank = (s) => PART_STATES.indexOf(s);

export const consoleDir = () => join(sharedStateDir(), 'console');
export const serverFile = () => join(consoleDir(), 'server.json');
const fileOf = (id) => join(consoleDir(), `${id}.json`);

/** "3", "c-3", "C-003" -> "C-003". */
export const parseId = idParser('C', 'console step');

const text = (s, n) => (s == null || s === '' ? undefined : clip(String(s), n));
function checkUrl(u, what = 'url') {
  if (u == null || u === '') return undefined;
  let p;
  try { p = new URL(String(u)); } catch { throw new Error(`bad ${what} "${u}" (a full http(s):// URL)`); }
  if (!/^https?:$/.test(p.protocol)) throw new Error(`bad ${what} "${u}" (http or https only)`);
  return String(u);
}

/** "1,2,same" or ['1','2','same'] -> ['1','2','same'] (trimmed, unique, at most 8). */
export function parseOptions(v) {
  if (v == null || v === '') return [];
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  const u = [...new Set(list)];
  if (u.length > 8) throw new Error('at most 8 answer options');
  for (const o of u) if (o.length > 40) throw new Error(`answer option too long (40 chars max): "${o.slice(0, 50)}"`);
  return u;
}

function normPart(p, i, defaults = {}) {
  if (!p || typeof p !== 'object') throw new Error(`part ${i + 1}: an object {label, url?, instructions?, record?, gate?, ends?}`);
  if (p.ends !== undefined && !ENDS.includes(p.ends)) throw new Error(`part ${i + 1}: ends must be "user" or "runner" (got ${JSON.stringify(p.ends)})`);
  return {
    label: text(p.label, 80) || `Part ${i + 1}`,
    url: checkUrl(p.url, `part ${i + 1} url`),
    instructions: text(p.instructions, 600),
    record: p.record ?? defaults.record ?? false,
    gate: p.gate ?? defaults.gate ?? false,
    ...(p.ends === 'runner' && { ends: 'runner' }), // absent = the user ends it (Done), as before I-059
    state: 'waiting',
    at: {},
  };
}

/**
 * --runner-ends "2" | "1,3" | "all" (1-based) -> the 0-based indexes of the parts the runner ends (I-059).
 * `n` = the number of parts; a part out of range is refused.
 */
export function parseRunnerEnds(v, n) {
  if (v == null || v === '' || v === false) return [];
  const raw = String(v).trim();
  if (raw === 'all') return Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (const x of raw.split(',').map((y) => y.trim()).filter(Boolean)) {
    if (!/^\d{1,2}$/.test(x) || Number(x) < 1 || Number(x) > n) throw new Error(`--runner-ends takes part numbers 1-${n} (comma-separated) or all, got ${v}`);
    if (!out.includes(Number(x) - 1)) out.push(Number(x) - 1);
  }
  if (!out.length) throw new Error(`--runner-ends takes part numbers 1-${n} (comma-separated) or all, got ${v}`);
  return out;
}

/** "1-5" -> {min: 1, max: 5, label}: an optional rating next to the pick (e.g. how different the pages felt). */
export function parseScale(v, label) {
  if (v == null || v === '' || v === false) return undefined;
  const m = String(v).trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const min = m && Number(m[1]), max = m && Number(m[2]);
  if (!m || min >= max || max - min > 10) throw new Error(`--scale must be like 1-5 (at most 11 steps), got ${v}`);
  return { min, max, label: text(label, 120) || `How sure / how different? (${min} = barely, ${max} = very)` };
}

/** Agent-private data kept with the step (e.g. a blind A/B key): never sent to the page; returned by show/wait. */
function normMeta(m) {
  if (m == null || m === '') return undefined;
  let v = m;
  if (typeof m === 'string') { try { v = JSON.parse(m); } catch { throw new Error('--meta must be JSON (e.g. \'{"key":"A=patched"}\')'); } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('--meta must be a JSON object');
  if (JSON.stringify(v).length > 8000) throw new Error('--meta is too large (8000 chars max)');
  return v;
}

/**
 * Build a new step from a post. {by, kind, title, instructions, url, url2, parts, options, yesno, text,
 * record, gate, showUrl}. Kind defaults:
 *   question    no parts; answer yes/no (or --options / --text)
 *   choice      no parts; answer buttons (--options required)
 *   action      one part (url optional); Done finishes it, or answer buttons when --options are given
 *   swipe-pair  two gated, recorded parts "Page 1" (url) and "Page 2" (url2); answer 1 / 2 / same; URLs hidden (blind)
 * `parts` (an array) replaces the kind's parts.
 */
export function buildStep(p) {
  if (!p.by) throw new Error('--by <your agent name> is required');
  if (!KINDS.includes(p.kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')} (got ${p.kind ?? 'nothing'})`);
  if (!p.title || !String(p.title).trim()) throw new Error('--title "<what you need, one line>" is required');
  const kind = p.kind;
  let options = parseOptions(p.options);
  let mode = p.text ? 'text' : options.length ? 'buttons' : 'none';
  if (p.text && options.length) throw new Error('give --options or --text, not both');
  if (p.yesno) { if (options.length || p.text) throw new Error('--yesno excludes --options and --text'); options = ['yes', 'no']; mode = 'buttons'; }
  let parts;
  const blindDefault = kind === 'swipe-pair';
  if (kind === 'question') { parts = []; if (mode === 'none') { options = ['yes', 'no']; mode = 'buttons'; } }
  else if (kind === 'choice') { parts = []; if (mode !== 'buttons') throw new Error('--kind choice needs --options a,b,c'); }
  else if (kind === 'action') parts = [{ label: 'Do it', url: p.url, record: !!p.record, gate: !!p.gate }];
  else {
    if (!p.parts && (!p.url || !p.url2)) throw new Error('--kind swipe-pair needs --url <page 1> and --url2 <page 2> (or --parts)');
    const d = { record: p.record ?? true, gate: p.gate ?? true };
    parts = [{ label: 'Page 1', url: p.url, ...d }, { label: 'Page 2', url: p.url2, ...d }];
    if (mode === 'none') { options = ['1', '2', 'same']; mode = 'buttons'; }
  }
  if (p.parts) {
    if (!Array.isArray(p.parts) || !p.parts.length || p.parts.length > 12) throw new Error('--parts must be a JSON array of 1-12 parts');
    parts = p.parts;
  }
  parts = parts.map((x, i) => normPart(x, i, kind === 'swipe-pair' ? { record: true, gate: true } : {}));
  for (const i of parseRunnerEnds(p.runnerEnds, parts.length)) parts[i].ends = 'runner';
  if (!parts.length && mode === 'none') throw new Error('a step without parts needs answer options');
  const scale = parseScale(p.scale, p.scaleLabel);
  if (scale && mode !== 'buttons') throw new Error('--scale goes with answer buttons (--options, --yesno or a swipe pair)');
  const now = iso();
  return {
    id: undefined,
    by: String(p.by).slice(0, 80),
    kind,
    title: text(p.title, 200),
    instructions: text(p.instructions, 1200),
    url: checkUrl(p.url),
    showUrl: p.showUrl ?? !blindDefault,
    meta: normMeta(p.meta),
    answer: { mode, options, ...(scale && { scale }) },
    status: 'pending',
    cur: 0,
    parts,
    result: undefined,
    createdAt: now,
    queuedAt: now,
    updatedAt: now,
    rev: 1,
    history: [{ at: now, who: String(p.by), action: 'posted' }],
  };
}

// ---- store ------------------------------------------------------------------------------------------

/** Every step, oldest in the queue first (queuedAt, then id). */
export function list({ all = true, pending = false } = {}) {
  let items = readAll(consoleDir(), 'C');
  if (pending) items = items.filter((s) => OPEN.has(s.status));
  else if (!all) items = items.filter((s) => s.status !== 'cancelled');
  return items.sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : a.id < b.id ? -1 : 1));
}

export function get(id) {
  const s = readJson(fileOf(parseId(id)));
  if (!s) throw new Error(`no console step ${parseId(id)} (node tools/console.mjs list)`);
  return s;
}

export async function post(p) {
  const step = buildStep(p);
  return withGuard(GUARD, () => {
    mkdirSync(consoleDir(), { recursive: true });
    step.id = nextId(readAll(consoleDir(), 'C'), 'C');
    writeJson(fileOf(step.id), step);
    return step;
  });
}

/** Read-modify-write one step under the store guard; `fn(step)` throws to refuse. */
async function change(id, who, action, fn) {
  const sid = parseId(id);
  return withGuard(GUARD, () => {
    const s = get(sid);
    const extra = fn(s) || {};
    const now = iso();
    s.updatedAt = now;
    s.rev = (s.rev || 0) + 1;
    s.history.push({ at: now, who, action, ...extra });
    writeJson(fileOf(sid), s);
    return s;
  });
}

/** The phase the page shows: pending | part | answer | answered | skipped | cancelled. */
export function phase(s) {
  if (s.status !== 'active') return s.status;
  return s.cur < s.parts.length ? 'part' : 'answer';
}

function needOpen(s) {
  if (!OPEN.has(s.status)) throw new Error(`${s.id} is ${s.status}`);
}
/** `part` is 1-based (as the CLI and page show it); undefined = the current part. */
function partIndex(s, part) {
  if (part === undefined || part === null || part === '') return s.cur;
  const n = Number(part);
  if (!Number.isInteger(n) || n < 1 || n > s.parts.length) throw new Error(`${s.id} has ${s.parts.length} part(s); --part ${part} is not one of them`);
  return n - 1;
}
function finishPart(s, i, now, notes) {
  s.parts[i].state = 'done';
  s.parts[i].at.done = now;
  s.cur = i + 1;
  if (s.cur >= s.parts.length && s.answer.mode === 'none') {
    s.status = 'answered';
    s.result = { value: 'done', notes: text(notes, 4000), at: now };
  }
}

/** The user clicked Start (on the step, or on the current part). `part` (1-based) guards against a stale page. */
export async function start(id, { part, who = 'user' } = {}) {
  return change(id, who, 'start', (s) => {
    needOpen(s);
    const now = iso();
    if (s.cur < s.parts.length) {
      const i = partIndex(s, part);
      if (i !== s.cur) throw new Error(`${s.id}: part ${i + 1} is not the current part (${s.cur + 1})`);
      const p = s.parts[i];
      if (rank(p.state) >= rank('started')) throw new Error(`${s.id} part ${i + 1} is already ${p.state}`);
      if (p.gate && p.state !== 'ready') throw new Error(`${s.id} part ${i + 1} is not ready yet (${s.by} is preparing it: ${p.state})`);
      p.state = 'started';
      p.at.started = now;
      p.message = undefined;
    } else if (s.status === 'active') throw new Error(`${s.id} is already started`);
    if (s.status === 'pending') { s.status = 'active'; s.startedAt = now; }
    return { part: s.cur < s.parts.length ? s.cur + 1 : undefined };
  });
}

/** The user clicked Done on the current part (notes: only kept when this Done also answers the step). */
export async function done(id, { part, notes, who = 'user' } = {}) {
  return change(id, who, 'done', (s) => {
    if (s.status !== 'active') throw new Error(`${s.id} is ${s.status}, not started`);
    const i = partIndex(s, part);
    if (i !== s.cur) throw new Error(`${s.id}: part ${i + 1} is not the current part (${s.cur + 1})`);
    const p = s.parts[i];
    if (rank(p.state) < rank('started')) throw new Error(`${s.id} part ${i + 1} is not started (${p.state})`);
    if (p.ends === 'runner') {
      const e = new Error(`${s.id} part ${i + 1} (${p.label}) ends by itself: ${s.by} marks it done when it has finished. Nothing to tap; the console will say when.`);
      e.status = 403; // the server's HTTP status (I-059); the runner ends it with: console.mjs ack <id> --part N --state done
      throw e;
    }
    finishPart(s, i, iso(), notes);
    return { part: i + 1 };
  });
}

/**
 * The agent reports its side of a part: loading / ready (before the user's Start, gated parts), recording
 * (after Start), done (stop at its own cap). `message`: a short line shown on the part ("the phone tab is
 * slow, wait"); a message alone (no state) is allowed.
 */
export async function ack(id, { state, part, message, by } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  if (state !== undefined && !ACK_STATES.includes(state)) throw new Error(`--state must be one of ${ACK_STATES.join(', ')} (got ${state})`);
  if (state === undefined && message === undefined) throw new Error('give --state and/or --message');
  return change(id, by, 'ack', (s) => {
    needOpen(s);
    if (s.cur >= s.parts.length) throw new Error(`${s.id} has no part left to ack (it is at the answer)`);
    const i = partIndex(s, part);
    if (i !== s.cur) throw new Error(`${s.id}: part ${i + 1} is not the current part (${s.cur + 1}); wait for part ${s.cur} done first`);
    const p = s.parts[i];
    const now = iso();
    if (state === 'loading' || state === 'ready') {
      if (rank(p.state) >= rank('started')) throw new Error(`${s.id} part ${i + 1} is already ${p.state}: ${state} only before the user's Start`);
      p.state = state;
      p.at[state] = now;
    } else if (state === 'recording') {
      if (rank(p.state) < rank('started')) throw new Error(`${s.id} part ${i + 1} is ${p.state}: the user has not clicked Start yet (console.mjs wait ${s.id} --until started --part ${i + 1})`);
      p.state = 'recording';
      p.at.recording = now;
    } else if (state === 'done') {
      if (rank(p.state) < rank('started')) throw new Error(`${s.id} part ${i + 1} is ${p.state}, not started`);
      finishPart(s, i, now);
    }
    if (message !== undefined) p.message = text(message, 300);
    else if (state) p.message = undefined;
    return { part: i + 1, state, note: text(message, 300) };
  });
}

/** The user's answer (after the last part). value: one of the options, or the text (mode text). */
export async function answer(id, { value, notes, scale, who = 'user' } = {}) {
  return change(id, who, 'answer', (s) => {
    if (s.status === 'pending' && s.parts.length === 0) { s.status = 'active'; s.startedAt = iso(); }
    if (s.status !== 'active') throw new Error(`${s.id} is ${s.status}`);
    if (s.cur < s.parts.length) throw new Error(`${s.id} is at part ${s.cur + 1} of ${s.parts.length}: answer after the last part`);
    const v = value == null ? '' : String(value).trim();
    if (s.answer.mode === 'buttons' && !s.answer.options.includes(v)) throw new Error(`${s.id}: answer one of ${s.answer.options.join(', ')} (got "${v}")`);
    if (s.answer.mode === 'text' && !v) throw new Error(`${s.id}: the answer is empty`);
    let rating;
    if (scale !== undefined && scale !== null && scale !== '') {
      const sc = s.answer.scale;
      if (!sc) throw new Error(`${s.id} has no rating scale`);
      rating = Number(scale);
      if (!Number.isInteger(rating) || rating < sc.min || rating > sc.max) throw new Error(`${s.id}: the rating must be ${sc.min}-${sc.max} (got ${scale})`);
    }
    s.status = 'answered';
    s.result = { value: clip(v, 4000), notes: text(notes, 4000), ...(rating !== undefined && { scale: rating }), at: iso() };
    return { value: clip(v, 200) };
  });
}

/** The user said "skip / not now": the step leaves the queue; the waiting agent gets NEVER. */
export async function skip(id, { who = 'user', notes } = {}) {
  return change(id, who, 'skip', (s) => {
    needOpen(s);
    s.status = 'skipped';
    s.skippedAt = iso();
    if (notes) s.result = { value: undefined, notes: text(notes, 4000), at: s.skippedAt };
  });
}

/**
 * Back into the queue (at its end), from the start: the user's "bring back" on a skipped step, or the
 * agent (any state but pending: after a skip, or to ask the whole step again).
 */
export async function reopen(id, { who = 'user', agent = false } = {}) {
  return change(id, who, 'reopen', (s) => {
    if (s.status === 'pending') throw new Error(`${s.id} is already pending`);
    if (!agent && s.status !== 'skipped') throw new Error(`${s.id} is ${s.status}: only a skipped step can be brought back`);
    s.status = 'pending';
    s.cur = 0;
    s.result = undefined;
    s.startedAt = undefined;
    s.queuedAt = iso();
    for (const p of s.parts) { p.state = 'waiting'; p.at = {}; p.message = undefined; }
  });
}

/**
 * The agent asks for part N again (e.g. the recording missed the swipe): parts N.. go back to waiting and
 * the step to part N (`message` is shown on it: why). The answer, if any, is cleared.
 */
export async function redo(id, { part, by, message } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  return change(id, by, 'redo', (s) => {
    if (!['active', 'answered'].includes(s.status)) throw new Error(`${s.id} is ${s.status}`);
    if (!s.parts.length) throw new Error(`${s.id} has no parts (reopen it instead)`);
    const i = part === undefined ? Math.min(s.cur, s.parts.length - 1) : partIndex(s, part);
    if (i > s.cur) throw new Error(`${s.id} is at part ${s.cur + 1}: part ${i + 1} was not reached`);
    for (let j = i; j < s.parts.length; j++) { s.parts[j].state = 'waiting'; s.parts[j].at = {}; s.parts[j].message = undefined; }
    s.parts[i].message = text(message, 300);
    s.cur = i;
    s.status = 'active';
    s.result = undefined;
    return { part: i + 1, note: text(message, 300) };
  });
}

/** The agent withdraws a step (no longer needed); it disappears from the page. */
export async function cancel(id, { by, note } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  return change(id, by, 'cancel', (s) => {
    if (!OPEN.has(s.status) && s.status !== 'skipped') throw new Error(`${s.id} is ${s.status}`);
    s.status = 'cancelled';
    return { note: text(note, 300) };
  });
}

// ---- waits ------------------------------------------------------------------------------------------

/**
 * A tools/lib/wait.mjs condition for `console.mjs wait <id> --until started|recording|done|answered [--part N]`.
 * Without --part: started waits for the part that is current when the wait starts (the step's Start for a
 * step without parts); recording and done wait for the last part the user started (or the current one).
 * Skipped or cancelled before the condition is met: never. Detail: the JSON printed on MET.
 */
export function waitCondition(id, { until = 'answered', part } = {}) {
  if (!WAIT_UNTIL.includes(until)) throw new Error(`--until must be one of ${WAIT_UNTIL.join(', ')} (got ${until})`);
  const sid = parseId(id);
  const s0 = get(sid);
  let idx = null; // 0-based part, or null = the step itself
  if (until !== 'answered' && s0.parts.length) {
    if (part !== undefined) idx = partIndex(s0, part);
    else if (until === 'started') idx = Math.min(s0.cur, s0.parts.length - 1);
    else { let last = -1; s0.parts.forEach((p, i) => { if (rank(p.state) >= rank('started')) last = i; }); idx = last >= 0 ? last : Math.min(s0.cur, s0.parts.length - 1); }
  } else if (until !== 'answered' && until !== 'started') throw new Error(`${sid} has no parts: wait --until started or answered`);
  const what = `console ${sid}${idx !== null ? ` part ${idx + 1}` : ''} ${until}`;
  const check = () => {
    const s = get(sid);
    const st = s.status;
    let met, detail;
    if (until === 'answered') {
      met = st === 'answered';
      detail = met ? { id: sid, by: s.by, title: s.title, value: s.result?.value, notes: s.result?.notes ?? null, ...(s.result?.scale !== undefined && { scale: s.result.scale }), at: s.result?.at, ...(s.meta && { meta: s.meta }) } : undefined;
    } else if (idx === null) {
      met = st === 'active' || st === 'answered';
      detail = met ? { id: sid, state: 'started', at: s.startedAt } : undefined;
    } else {
      const p = s.parts[idx];
      met = rank(p.state) >= rank(until);
      detail = met ? { id: sid, part: idx + 1, state: p.state, at: p.at[until] ?? p.at.done ?? null } : undefined;
    }
    const state = idx === null ? st : `${st}, part ${idx + 1} ${s.parts[idx].state}`;
    if (met) return { met: true, state, detail: JSON.stringify(detail) };
    if (st === 'skipped') return { met: false, state, never: `the user skipped it (not now)${s.result?.notes ? `: ${s.result.notes}` : ''}; node tools/console.mjs reopen ${sid} --by <you> to queue it again` };
    if (st === 'cancelled') return { met: false, state, never: 'it was cancelled' };
    if (st === 'answered') return { met: false, state, never: `it was answered before part ${idx + 1} reached ${until}` };
    return { met: false, state };
  };
  return { what, check };
}

// ---- page view --------------------------------------------------------------------------------------

/** What the page gets: no hidden (blind) URLs, no history. */
export function publicView(s) {
  const show = s.showUrl !== false;
  return {
    id: s.id, by: s.by, kind: s.kind, title: s.title, instructions: s.instructions,
    url: show ? s.url : undefined,
    status: s.status, phase: phase(s), cur: s.cur, rev: s.rev,
    answer: s.answer,
    parts: s.parts.map((p) => ({ label: p.label, url: show ? p.url : undefined, instructions: p.instructions, record: p.record, gate: p.gate, ends: p.ends, state: p.state, at: p.at, message: p.message })),
    result: s.result, createdAt: s.createdAt, queuedAt: s.queuedAt, startedAt: s.startedAt, updatedAt: s.updatedAt,
  };
}

/** One line for `list`. */
export function line(s) {
  const where = OPEN.has(s.status) && s.cur < s.parts.length ? ` part ${s.cur + 1}/${s.parts.length} ${s.parts[s.cur].state}` : phase(s) === 'answer' ? ' answer' : '';
  const res = s.status === 'answered' ? ` -> ${JSON.stringify(s.result?.value)}${s.result?.notes ? ` (notes: ${String(s.result.notes).split('\n')[0].slice(0, 120)})` : ''}` : '';
  return `${s.id}  [${s.status}${where}]  ${s.kind}  by ${s.by}: ${s.title}${res}`;
}

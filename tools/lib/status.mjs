// Status board (ts-status-board, user request 2026-10-02: "i'd like to know about each progress status like priority,
// state (researching, implementing, testing, waiting on something …)"). Design: research/architecture/status-board.md.
//
// One record per workstream (a fix topic, a toolsmith job, a research line, the phone blocks, a review, ops), written
// by the agent that owns it at every state change (`node tools/status.mjs set …`). Only the lead sets priority.
// State lives next to the locks, incidents, findings and console steps in the shared git dir, so every worktree sees
// a report the moment it is written:
//   <git-common-dir>/fastwork-mirror/status/<id>.json    ($FW_STATE_DIR/status/ in tests)
// Every read-modify-write runs inside the lock library's mkdir guard ("status-store").
//
// Derived waits (read at view time from progress.mjs gatherLive, never stored, never overwriting the self-report):
// the owner queued on chrome-measure / iphone ("#2 of 3 in line"), holding one ("using Chrome now"), a pending console
// step posted by the owner ("waiting on you"), an active blocking incident naming the owner. A self-reported wait on an
// incident or a workstream that is already over is flagged.
//
// Hard rule 12: every stored string is checked with progress.mjs findPersonal and refused (no URL, IP address, local
// host name, e-mail, device id or home path); every string shown is sanitize()d again, live ones included.
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { findPersonal, sanitize, gatherLive } from './progress.mjs';

export const SCHEMA = 'fw-status/1';
export const SEED_SCHEMA = 'fw-status-seed/1';
export const LEAD = 'lead';
const GUARD = 'status-store';
const HISTORY_MAX = 100;
export const DEFAULT_STALE_MIN = 120;
export const staleMin = () => {
  const v = Number(process.env.FW_STATUS_STALE_MIN);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STALE_MIN;
};

export const KINDS = { fix: 'Fix', tool: 'Tool', research: 'Research', phone: 'Phone', review: 'Review', ops: 'Ops' };

/** Groups in display order (the sort's second key). */
export const GROUPS = { working: 'Working', waiting: 'Waiting', queued: 'Not started', parked: 'Parked', finished: 'Finished' };
export const GROUP_ORDER = Object.keys(GROUPS);

/** States: their group and the plain words the user reads. */
export const STATES = {
  queued: { group: 'queued', plain: 'not started yet' },
  researching: { group: 'working', plain: 'finding out where and why it is slow' },
  designing: { group: 'working', plain: 'planning the change' },
  implementing: { group: 'working', plain: 'building the change' },
  testing: { group: 'working', plain: 'checking that it works (tests, mechanism checks)' },
  measuring: { group: 'working', plain: 'measuring it on Chrome or the phone' },
  reviewing: { group: 'working', plain: "reviewing someone else's work" },
  coordinating: { group: 'working', plain: 'keeping the work moving (queues, landing, the summary)' },
  waiting: { group: 'waiting', plain: 'stopped until something else happens' },
  'ready-to-land': { group: 'waiting', plain: 'finished; waiting for the lead to land it' },
  parked: { group: 'parked', plain: 'paused on purpose; may resume' },
  landed: { group: 'finished', plain: 'on main (done)' },
  done: { group: 'finished', plain: 'finished (nothing to land)' },
  dropped: { group: 'finished', plain: 'stopped; will not continue' },
};
export const STATE_NAMES = Object.keys(STATES);
export const isFinished = (state) => STATES[state]?.group === 'finished';

/** Self-reported wait kinds. target: required | optional | none. */
export const WAIT_KINDS = {
  chrome: { target: 'none', plain: () => 'the Chrome slot' },
  phone: { target: 'none', plain: () => 'the phone' },
  user: { target: 'none', plain: () => 'you' },
  lead: { target: 'none', plain: () => 'the lead' },
  agent: { target: 'required', plain: (t) => t },
  review: { target: 'optional', plain: (t) => (t ? `a review by ${t}` : 'a review') },
  incident: { target: 'required', plain: (t) => `incident ${t}` },
  item: { target: 'required', plain: (t) => `workstream ${t}` },
  other: { target: 'none', plain: () => '' },
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/;
const REF = /^[A-Z]{1,2}-?\d{1,4}[a-z]?$/;
const LIMITS = { title: 90, note: 200, next: 200, wait: 160 };

export const statusDir = () => join(sharedStateDir(), 'status');
const fileOf = (id) => join(statusDir(), `${id}.json`);

// ---- parsing and validation --------------------------------------------------------------------------

export function parseId(s) {
  const id = String(s ?? '').trim();
  if (!SLUG.test(id)) throw new Error(`bad status id "${s}" (a short slug: a-z, 0-9, -; e.g. style-recalc)`);
  return id;
}

function agentName(s, what) {
  const v = String(s ?? '').trim();
  if (!AGENT.test(v)) throw new Error(`bad ${what} "${s}" (an agent name like fix-nav-morph)`);
  return v;
}

/** A plain one-line text field: trimmed, length-checked, refused if it carries personal data (Hard rule 12). */
function plainText(v, what, max) {
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (s.length > max) throw new Error(`--${what} is too long (${s.length} > ${max} chars): one plain line`);
  const p = findPersonal(s);
  if (p) throw new Error(`--${what} contains a ${p.kind} ("${p.match.slice(0, 40)}"); nothing personal or network-identifying in the status board (Hard rule 12)`);
  return s;
}

/**
 * "lead:land request" -> {kind:'lead', text:'land request'}; "agent:fix-nav-morph:the y answer" ->
 * {kind:'agent', target:'fix-nav-morph', text:'the y answer'}; "none" / "" -> null.
 */
export function parseWaiting(s) {
  const raw = String(s ?? '').trim();
  if (!raw || /^none$/i.test(raw)) return null;
  const parts = raw.split(':');
  const kind = parts.shift().trim().toLowerCase();
  const def = WAIT_KINDS[kind];
  if (!def) throw new Error(`bad --waiting-on "${raw}" (kind one of ${Object.keys(WAIT_KINDS).join(', ')}, e.g. lead:"land request", agent:fix-nav-morph, incident:I-042)`);
  let target;
  if (def.target !== 'none') {
    const t = (parts[0] ?? '').trim();
    if (t || def.target === 'required') {
      parts.shift();
      if (!t) throw new Error(`--waiting-on ${kind} needs a target (${kind}:<${kind === 'incident' ? 'I-042' : kind === 'item' ? 'status id' : 'agent name'}>)`);
      if (kind === 'incident') {
        const m = t.match(/^(?:i-?)?0*(\d{1,6})$/i);
        if (!m) throw new Error(`bad incident "${t}" in --waiting-on (e.g. incident:I-042)`);
        target = `I-${m[1].padStart(3, '0')}`;
      } else if (kind === 'item') target = parseId(t);
      else target = agentName(t, `${kind} in --waiting-on`);
    }
  }
  const text = parts.join(':').trim();
  if (kind === 'other' && !text) throw new Error('--waiting-on other needs a text (other:"<what>")');
  const w = { kind };
  if (target) w.target = target;
  if (text) w.text = plainText(text, 'waiting-on', LIMITS.wait);
  return w;
}

/** A wait in plain words: "the lead: land request", "fix-nav-morph: the y answer". */
export function waitingPlain(w) {
  if (!w) return '';
  const def = WAIT_KINDS[w.kind];
  const head = def ? def.plain(w.target ? sanitize(w.target, 80) : undefined) : sanitize(w.kind, 40);
  const text = w.text ? sanitize(w.text, LIMITS.wait) : '';
  return head && text ? `${head}: ${text}` : head || text;
}

function parseRefs(v) {
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  for (const r of list) if (!REF.test(r)) throw new Error(`bad --refs entry "${r}" (ids like P-039, F-084, I-042, C-013)`);
  if (list.length > 12) throw new Error('at most 12 --refs');
  return [...new Set(list)];
}

function parseAliases(v) {
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (list.length > 8) throw new Error('at most 8 --alias names');
  return [...new Set(list.map((a) => agentName(a, '--alias')))];
}

export function parsePriority(v) {
  const s = String(v ?? '').trim();
  if (/^(none|-|clear)$/i.test(s)) return null;
  if (!/^\d{1,2}$/.test(s) || Number(s) < 1) throw new Error(`bad priority "${v}" (1..99, 1 = first; or none)`);
  return Number(s);
}

// ---- store -------------------------------------------------------------------------------------------

/** Every item, in id order. Unreadable files are skipped. */
export function list({ all = true, state, kind, owner } = {}) {
  let names = [];
  try { names = readdirSync(statusDir()).filter((f) => /^[a-z0-9][a-z0-9-]*\.json$/.test(f)); } catch {}
  let items = names.map((f) => readJson(join(statusDir(), f))).filter((x) => x && x.id);
  if (!all) items = items.filter((i) => !isFinished(i.state));
  if (state) items = items.filter((i) => i.state === state);
  if (kind) items = items.filter((i) => i.kind === kind);
  if (owner) items = items.filter((i) => i.owner === owner || (i.aliases || []).includes(owner));
  return items.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function get(id) {
  const sid = parseId(id);
  const it = readJson(fileOf(sid));
  if (!it) throw new Error(`no status item "${sid}" (node tools/status.mjs list --all)`);
  return it;
}

const exists = (id) => !!readJson(fileOf(id));

function pushHistory(it, entry) {
  it.history = [...(it.history || []), entry].slice(-HISTORY_MAX);
}

/**
 * An agent reports its workstream. Creates the item on first use when `kind` and `title` are given.
 * opts: {by, state, note, next, waitingOn (string; 'none' clears), kind, title, owner, progress, refs, aliases}
 * `state` given = a full transition report: the self-reported wait becomes what this call gives (cleared if none;
 * 'ready-to-land' defaults to lead:"land request"; 'waiting' needs one). Without `state`, unmentioned fields stay.
 * Returns {item, created, prevState}.
 */
export async function set(id, opts = {}) {
  const sid = parseId(id);
  const by = agentName(opts.by, '--by (your agent name)');
  const v = {};
  if (opts.state !== undefined) {
    if (!STATES[opts.state]) throw new Error(`bad --state "${opts.state}" (one of ${STATE_NAMES.join(', ')})`);
    v.state = opts.state;
  }
  if (opts.kind !== undefined) { if (!KINDS[opts.kind]) throw new Error(`bad --kind "${opts.kind}" (one of ${Object.keys(KINDS).join(', ')})`); v.kind = opts.kind; }
  if (opts.title !== undefined) { v.title = plainText(opts.title, 'title', LIMITS.title); if (!v.title) throw new Error('--title is empty'); }
  for (const k of ['note', 'next']) if (opts[k] !== undefined) v[k] = plainText(opts[k], k, LIMITS[k]);
  if (opts.owner !== undefined) v.owner = agentName(opts.owner, '--owner');
  if (opts.progress !== undefined) v.progress = opts.progress === '' || /^none$/i.test(opts.progress) ? null : parseId(opts.progress);
  if (opts.refs !== undefined) v.refs = parseRefs(opts.refs);
  if (opts.aliases !== undefined) v.aliases = parseAliases(opts.aliases);
  const waitGiven = opts.waitingOn !== undefined;
  const wait = waitGiven ? parseWaiting(opts.waitingOn) : undefined;

  return withGuard(GUARD, () => {
    mkdirSync(statusDir(), { recursive: true });
    const now = iso();
    let it = readJson(fileOf(sid));
    const created = !it;
    if (created) {
      if (!v.kind || !v.title) throw new Error(`no status item "${sid}" yet: give --kind (${Object.keys(KINDS).join('|')}) and --title "<plain name>" to create it`);
      it = { schema: SCHEMA, id: sid, title: v.title, kind: v.kind, owner: v.owner || by, priority: null, state: 'queued', stateSince: now, waitingOn: null, createdAt: now, createdBy: by, history: [] };
    }
    const prevState = created ? null : it.state;
    const changes = {};
    const put = (k, x) => { if (x === undefined) return; if (JSON.stringify(it[k] ?? null) !== JSON.stringify(x ?? null)) { changes[k] = x; } it[k] = x; };
    for (const k of ['title', 'kind', 'owner', 'note', 'next', 'progress', 'refs', 'aliases']) put(k, v[k]);
    const state = v.state ?? it.state;
    let newWait = it.waitingOn ?? null;
    if (v.state !== undefined) newWait = waitGiven ? wait : null;
    else if (waitGiven) newWait = wait;
    if (state === 'ready-to-land' && !newWait && (v.state !== undefined || !waitGiven)) newWait = { kind: 'lead', text: 'land request' };
    if (state === 'waiting' && !newWait) throw new Error('--state waiting needs --waiting-on <what> (chrome, phone, user, lead, agent:<name>, review:<name>, incident:I-0NN, item:<id>, other:"<text>")');
    if (v.state !== undefined && v.state !== it.state) { changes.state = v.state; it.state = v.state; it.stateSince = now; }
    put('waitingOn', newWait);
    if (!created && !Object.keys(changes).length) throw new Error('nothing changed (give --state, --note, --next, --waiting-on or another field)');
    it.updatedAt = now;
    it.updatedBy = by;
    pushHistory(it, { at: now, by, action: created ? 'created' : 'set', changes });
    writeJson(fileOf(sid), it);
    return { item: it, created, prevState };
  });
}

/** The lead ranks a workstream: 1 = first, null = unranked. Everyone else is refused. */
export async function setPriority(id, value, { by, note } = {}) {
  if (by !== LEAD) throw new Error('only the lead sets priority (--by lead); ask the lead (or mgmt-ops) to rank it');
  const sid = parseId(id);
  const p = parsePriority(value);
  const n = note === undefined ? undefined : plainText(note, 'note', LIMITS.note);
  return withGuard(GUARD, () => {
    const it = get(sid);
    const now = iso();
    const from = it.priority ?? null;
    it.priority = p;
    it.updatedAt = now;
    it.updatedBy = by;
    pushHistory(it, { at: now, by, action: 'priority', changes: { priority: p, from }, ...(n ? { note: n } : {}) });
    writeJson(fileOf(sid), it);
    return it;
  });
}

// ---- derived waits -----------------------------------------------------------------------------------

const LOCKS = [['chrome-measure', 'chrome', 'Chrome'], ['iphone', 'phone', 'the phone']];

/**
 * What the system knows about this workstream right now. live: progress.mjs gatherLive() shape
 * {locks: {iphone, 'chrome-measure'}: lock.status(), incidents: active list, steps: pending steps}.
 * Returns {derived: [{kind, plain, ref?, position?, of?}], flags: [plain], liveWait: bool}.
 */
export function derive(it, live = {}, byId = new Map()) {
  const names = new Set([it.owner, it.id, ...(it.aliases || [])].filter(Boolean));
  const derived = [];
  for (const [r, kind, label] of LOCKS) {
    const st = live.locks?.[r];
    if (!st) continue;
    const h = st.holder && !st.stale ? st.holder : null;
    if (h && names.has(h.owner)) derived.push({ kind: 'using', resource: kind, plain: kind === 'chrome' ? 'using Chrome now' : 'on the phone now' });
    const q = st.queue || [];
    const i = q.findIndex((w) => names.has(w.owner));
    if (i >= 0) derived.push({ kind, position: i + 1, of: q.length, plain: `in line for ${label}, #${i + 1} of ${q.length}` });
  }
  for (const s of live.steps || []) {
    if (names.has(s.by)) derived.push({ kind: 'user', ref: s.id, plain: `waiting on you: ${s.id} ${sanitize(s.title, 120)}` });
  }
  for (const inc of live.incidents || []) {
    if (!inc.blocking) continue;
    const hit = names.has(inc.reportedBy) || (inc.affected || []).some((a) => names.has(a.by) && a.blocking !== false);
    if (hit) derived.push({ kind: 'incident', ref: inc.id, plain: `blocked by ${inc.id}: ${sanitize(inc.title, 120)}` });
  }
  const flags = [];
  const w = it.waitingOn;
  if (w?.kind === 'incident' && live.incidents && !live.incidents.some((i) => i.id === w.target)) flags.push(`it waits on ${w.target}, which is no longer open: update?`);
  if (w?.kind === 'item') {
    const other = byId.get(w.target);
    if (!other) flags.push(`it waits on workstream ${w.target}, which is not on the board`);
    else if (isFinished(other.state)) flags.push(`it waits on ${w.target}, which is ${other.state}: update?`);
  }
  const liveWait = derived.some((d) => d.kind === 'chrome' || d.kind === 'phone' || d.kind === 'using' || d.kind === 'user');
  return { derived, flags, liveWait };
}

// ---- the view ----------------------------------------------------------------------------------------

const minutes = (from, now) => (from ? Math.max(0, Math.round((now - Date.parse(from)) / 60000)) : null);

export function itemView(it, { live = {}, byId = new Map(), now = Date.now(), staleAfterMin = staleMin() } = {}) {
  const st = STATES[it.state] || { group: 'working', plain: it.state };
  const { derived, flags, liveWait } = derive(it, live, byId);
  const ageMin = minutes(it.updatedAt || it.createdAt, now);
  const canStale = ['working', 'waiting', 'queued'].includes(st.group);
  const s = (x, n) => (x == null ? null : sanitize(x, n));
  const waiting = it.waitingOn ? { kind: it.waitingOn.kind, target: s(it.waitingOn.target, 80), text: s(it.waitingOn.text, LIMITS.wait), plain: waitingPlain(it.waitingOn) } : null;
  return {
    id: it.id, title: s(it.title, LIMITS.title), kind: it.kind, kindLabel: KINDS[it.kind] || it.kind,
    owner: s(it.owner, 80), aliases: (it.aliases || []).map((a) => s(a, 80)), progress: it.progress || null, refs: (it.refs || []).map((r) => s(r, 20)),
    priority: Number.isInteger(it.priority) ? it.priority : null,
    state: it.state, statePlain: st.plain, group: st.group, groupLabel: GROUPS[st.group] || st.group,
    stateSince: it.stateSince || null, stateForMin: minutes(it.stateSince, now),
    waiting, derived, flags, liveWait,
    waitingOnYou: waiting?.kind === 'user' || derived.some((d) => d.kind === 'user'),
    note: s(it.note, LIMITS.note), next: s(it.next, LIMITS.next),
    updatedAt: it.updatedAt || it.createdAt || null, updatedBy: s(it.updatedBy || it.createdBy, 80), ageMin,
    stale: canStale && !liveWait && ageMin !== null && ageMin > staleAfterMin,
  };
}

/** Priority ascending (unranked last), then group, then the most recently updated first. */
export function compareViews(a, b) {
  const pa = a.priority ?? Infinity, pb = b.priority ?? Infinity;
  if (pa !== pb) return pa - pb;
  const ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
  if (ga !== gb) return ga - gb;
  return (a.updatedAt || '') < (b.updatedAt || '') ? 1 : (a.updatedAt || '') > (b.updatedAt || '') ? -1 : a.id < b.id ? -1 : 1;
}

/** The board: pure, every input passed in. */
export function buildStatusView({ items = [], live = {}, now = Date.now(), staleAfterMin = staleMin() } = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const views = items.map((it) => itemView(it, { live, byId, now, staleAfterMin })).sort(compareViews);
  const counts = { total: views.length, stale: 0, waitingOnYou: 0 };
  for (const g of GROUP_ORDER) counts[g] = 0;
  for (const v of views) { counts[v.group] = (counts[v.group] || 0) + 1; if (v.stale) counts.stale++; if (v.waitingOnYou) counts.waitingOnYou++; }
  return {
    schema: SCHEMA, now: new Date(now).toISOString(), staleAfterMin, counts,
    groups: GROUP_ORDER.map((k) => ({ key: k, label: GROUPS[k] })),
    kinds: Object.entries(KINDS).map(([key, label]) => ({ key, label })),
    states: STATE_NAMES.map((k) => ({ key: k, group: STATES[k].group, plain: STATES[k].plain })),
    items: views,
    liveErrors: (live.errors || []).map((e) => sanitize(e, 200)),
  };
}

export async function currentStatusView({ now = Date.now(), live } = {}) {
  return buildStatusView({ items: list(), live: live || (await gatherLive()), now });
}

/** For /progress: progress item id -> a short live status of the workstream linked to it ({id, state, plain, waits}). */
export function progressLinks(view) {
  const m = new Map();
  for (const v of view.items) {
    if (!v.progress || m.has(v.progress)) continue;
    m.set(v.progress, {
      id: v.id, state: v.state, plain: v.statePlain, stale: v.stale,
      waits: [...(v.waiting ? [`waiting on ${v.waiting.plain}`] : []), ...v.derived.map((d) => d.plain)],
    });
  }
  return m;
}

// ---- text --------------------------------------------------------------------------------------------

const hhmm = (s) => (s ? `${s.slice(11, 16)}Z` : '?');
export const agoText = (min) => (min === null || min === undefined ? '' : min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`);
export const forText = (min) => (min === null || min === undefined ? '' : min < 1 ? 'under a minute' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

export function countsText(c) {
  const bits = [`${c.working} working`, `${c.waiting} waiting`];
  if (c.queued) bits.push(`${c.queued} not started`);
  if (c.parked) bits.push(`${c.parked} parked`);
  if (c.waitingOnYou) bits.push(`${c.waitingOnYou} waiting on you`);
  if (c.stale) bits.push(`${c.stale} not updated`);
  return bits.join(', ');
}

/** One item, a few lines. */
export function itemText(v) {
  const L = [];
  const pr = v.priority ? `#${v.priority}` : '–';
  L.push(`${pr.padEnd(4)}${v.id}  [${v.kindLabel}] ${v.title}`);
  L.push(`      ${v.state}${v.stateForMin !== null && v.group !== 'finished' ? ` for ${forText(v.stateForMin)}` : ''}: ${v.statePlain}; owner ${v.owner}; updated ${agoText(v.ageMin)}${v.updatedBy && v.updatedBy !== v.owner ? ` by ${v.updatedBy}` : ''}${v.stale ? '  (NOT UPDATED for a while)' : ''}`);
  if (v.waiting) L.push(`      waiting on: ${v.waiting.plain}`);
  for (const d of v.derived) L.push(`      now: ${d.plain}`);
  for (const f of v.flags) L.push(`      ! ${f}`);
  if (v.note) L.push(`      note: ${v.note}`);
  if (v.next) L.push(`      next: ${v.next}`);
  if (v.progress) L.push(`      progress item: ${v.progress}`);
  return L.join('\n');
}

/** The board as text (`status.mjs list`, `console.mjs status`). Finished items only with `all`. */
export function renderText(view, { all = false } = {}) {
  const L = [`STATUS BOARD  (live ${hhmm(view.now)}; ${countsText(view.counts)}; stale after ${forText(view.staleAfterMin)} without an update)`];
  for (const e of view.liveErrors) L.push(`  ! live source unavailable: ${e}`);
  const you = view.items.filter((v) => v.waitingOnYou && v.group !== 'finished');
  if (you.length) {
    L.push('', 'WAITING ON YOU');
    for (const v of you) {
      const what = [...(v.waiting?.kind === 'user' ? [v.waiting.plain] : []), ...v.derived.filter((d) => d.kind === 'user').map((d) => d.plain)];
      L.push(`  ${v.id}: ${what.join('; ')}`);
    }
  }
  const shown = view.items.filter((v) => all || v.group !== 'finished');
  L.push('');
  if (!shown.length) L.push(all ? 'no workstreams on the board' : 'no active workstreams (node tools/status.mjs list --all)');
  for (const v of shown) L.push(itemText(v));
  const hidden = view.items.length - shown.length;
  if (hidden) L.push('', `(${hidden} finished; --all shows them)`);
  return L.join('\n');
}

/** One item with its history (`status.mjs show`). */
export function showText(it, v) {
  const L = [itemText(v)];
  if (v.refs.length) L.push(`      refs: ${v.refs.join(', ')}`);
  if (v.aliases.length) L.push(`      also known on the locks/console as: ${v.aliases.join(', ')}`);
  L.push('  history:');
  for (const h of it.history || []) L.push(`    ${h.at} ${sanitize(h.by, 80)} ${h.action}${h.changes && Object.keys(h.changes).length ? ' ' + sanitize(JSON.stringify(h.changes), 400) : ''}${h.note ? `: ${sanitize(h.note, 200)}` : ''}`);
  return L.join('\n');
}

// ---- seed --------------------------------------------------------------------------------------------

const firstAgent = (s) => (String(s || '').match(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}/) || [])[0];

/** PROGRESS stage -> a first state for a seeded fix workstream. */
function seedState(p) {
  if (p.stage === 'V') return { state: 'waiting', waitingOn: 'review' };
  if (p.stage === 'F') return { state: 'measuring' };
  return { state: 'researching' };
}

/**
 * The seed plan: one fix workstream per PROGRESS item in state testing/diagnosing, then the seed file's entries
 * (which win for the same id). Each entry: {id, kind, title, owner, state, waitingOn?, note?, next?, progress?,
 * aliases?, refs?}. `priority` in a seed is refused: the lead ranks after seeding.
 */
export function seedPlan({ progress = null, seed = null } = {}) {
  const plan = new Map();
  for (const p of progress?.items || []) {
    if (!['testing', 'diagnosing'].includes(p.state)) continue;
    const owner = firstAgent(p.owner);
    if (!owner || !SLUG.test(p.id)) continue;
    plan.set(p.id, { id: p.id, kind: 'fix', title: String(p.title).slice(0, LIMITS.title), owner, progress: p.id, ...seedState(p), note: 'seeded from the progress summary; owner, please update' });
  }
  if (seed) {
    if (seed.schema !== SEED_SCHEMA) throw new Error(`seed file: schema must be "${SEED_SCHEMA}"`);
    if (!Array.isArray(seed.items)) throw new Error('seed file: items must be an array');
    seed.items.forEach((e, i) => {
      if (!e || typeof e !== 'object') throw new Error(`seed items[${i}]: must be an object`);
      if (e.priority !== undefined) throw new Error(`seed items[${i}] (${e.id}): no priority in a seed; the lead sets it (status.mjs priority)`);
      parseId(e.id);
      plan.set(e.id, { ...(plan.get(e.id) || {}), ...e });
    });
  }
  return [...plan.values()];
}

/** Apply (or with apply=false only check) a plan: existing ids are skipped. Returns [{id, action, error?}]. */
export async function applySeed(plan, { by, apply = false } = {}) {
  agentName(by, '--by (your agent name)');
  const out = [];
  for (const e of plan) {
    if (exists(e.id)) { out.push({ id: e.id, action: 'exists' }); continue; }
    const opts = { by, kind: e.kind, title: e.title, owner: e.owner, state: e.state, waitingOn: e.waitingOn, note: e.note, next: e.next, progress: e.progress, refs: e.refs, aliases: e.aliases };
    for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];
    try {
      // validate everything set() would, without writing (a dry run must catch the same errors)
      if (!KINDS[opts.kind]) throw new Error(`bad kind "${opts.kind}"`);
      if (!opts.title) throw new Error('title required');
      if (opts.state && !STATES[opts.state]) throw new Error(`bad state "${opts.state}"`);
      for (const k of ['title', 'note', 'next']) if (opts[k] !== undefined) plainText(opts[k], k, LIMITS[k]);
      if (opts.owner) agentName(opts.owner, 'owner');
      if (opts.waitingOn !== undefined) parseWaiting(opts.waitingOn);
      if (opts.refs) parseRefs(opts.refs);
      if (opts.aliases) parseAliases(opts.aliases);
      if (opts.state === 'waiting' && !opts.waitingOn) throw new Error('state waiting needs waitingOn');
      if (apply) await set(e.id, opts);
      out.push({ id: e.id, action: apply ? 'added' : 'would-add', entry: e });
    } catch (err) {
      out.push({ id: e.id, action: 'error', error: err.message });
    }
  }
  return out;
}


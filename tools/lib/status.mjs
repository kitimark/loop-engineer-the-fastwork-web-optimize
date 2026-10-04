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
// the owner queued on chrome-measure / iphone ("#2 of 3 in line"), holding one ("using Chrome now"; a reader of the
// chrome-measure shared group: "using Chrome now (shared)", I-048), a pending console
// step posted by the owner ("waiting on you"), an active blocking incident naming the owner (unless the owner dropped
// that link with `set --unlink I-0NN`, I-044: the incident is real but not what this workstream waits on). A
// self-reported wait on an incident or a workstream that is already over is flagged. A wait command the owner runs
// right now (tools/lib/waits.mjs live records, I-058: wait.mjs, lock.mjs wait, console/incident/finding waits):
// "waiting for <what> since 08:31Z (3 min, timeout 10 min)"; waits whose owner has no active row are listed under
// "other waits" (view.otherWaits).
// I-108 (user T-060 #3): a thread listener reads "listening for console messages", never as a wait on the user; an
// open proposal by the owner waits on the user like a pending step; and every live record goes to the owner's ONE
// active row (liveRouter: the hold's --for / --doing, else the newest working/waiting/not-started row), never to a
// parked or finished one.
//
// Hard rule 12: every stored string is checked with progress.mjs findPersonal and refused (no URL, IP address, local
// host name, e-mail, device id or home path); every string shown is sanitize()d again, live ones included.
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, iso } from './store.mjs';
import { findPersonal, sanitize, gatherLive, readProgress, toTry, buildShort, targetBuilds } from './progress.mjs';
import { waitPlain, isListener, listenPlain, ownerText } from './waits.mjs';

export const SCHEMA = 'fw-status/1';
export const SEED_SCHEMA = 'fw-status-seed/1';
export const LEAD = 'lead';
const GUARD = 'status-store';
const HISTORY_MAX = 100;
// I-108 (user T-060 #3): rows went hours out of date before the board said so; 45 min, was 120
export const DEFAULT_STALE_MIN = 45;
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
  // user T-044: a row names its reason in the same line (itemView: "waiting for: <the waiting-on text>"); this is the legend
  waiting: { group: 'waiting', plain: 'waiting for: what the owner names (or "reason not given")' },
  'ready-to-land': { group: 'waiting', plain: 'finished; waiting for the lead to land it' },
  parked: { group: 'parked', plain: 'paused; the row says why and what brings it back (--resume-on)' }, // T-135: never a generic "may resume"
  landed: { group: 'finished', plain: 'on main (done)' },
  done: { group: 'finished', plain: 'finished, no build to land' }, // user T-139 #3: a tool or review job
  // T-124 (user, lead decision): a topic closed without a fix is not "done"; done stays for landed or finished work
  'closed-no-fix': { group: 'finished', plain: 'closed without a fix (nothing landed)' },
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
  // I-145 (PR-020 N1): a wait on the user names what the user answers (a step, proposal or thread), so the event that
  // answers it (decided, answered, skipped, closed) can end it on the board without the owner writing again
  if (kind === 'user' && !(w.text || '').match(WAIT_REF)) {
    throw new Error(`--waiting-on user needs the id of what the user answers: a console step, proposal or thread, e.g. user:"decision on PR-019", user:C-045 or user:"yes/no in T-031" (the board then shows your row as answered the moment the user answers). Not a console item: other:"<what>"`);
  }
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

/** --unlink: "I-042", "incident:I-042" or a comma list of them; "none" clears. Returns [ids] or null (I-044). */
export function parseUnlink(v) {
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (list.length === 1 && /^none$/i.test(list[0])) return null;
  if (!list.length) throw new Error('--unlink needs an incident (incident:I-042) or none');
  return [...new Set(list.map((x) => {
    const m = /^(?:incident:)?I-?(\d{1,4})$/i.exec(x);
    if (!m) throw new Error(`bad --unlink "${x}" (a derived incident link to drop: incident:I-042; none restores all)`);
    return `I-${m[1].padStart(3, '0')}`;
  }))];
}

/**
 * T-125 #14: when a parked row comes back, so the board can say "ready to resume" by itself:
 * incident:I-NNN (resolved) | land:<topic|sha> (on main) | after:<ISO time> | decision:lead|user | build:<vN> (a
 * best build of that name) | never (done for good). Returns {kind, target?}.
 */
export const RESUME_KINDS = ['incident', 'land', 'after', 'decision', 'build', 'never'];
const RESUME_HELP = 'incident:I-NNN | land:<topic|sha> | after:<ISO time> | decision:lead|user | build:v8 | never';
export function parseResumeOn(v) {
  const raw = String(v ?? '').trim();
  const i = raw.indexOf(':');
  const kind = (i < 0 ? raw : raw.slice(0, i)).trim().toLowerCase();
  const t = i < 0 ? '' : raw.slice(i + 1).trim();
  const bad = (why) => new Error(`bad --resume-on "${raw}"${why ? ` (${why})` : ''}: one of ${RESUME_HELP}`);
  if (kind === 'never') { if (t) throw bad('never takes no target'); return { kind }; }
  if (!RESUME_KINDS.includes(kind) || !t) throw bad();
  if (kind === 'incident') {
    const m = t.match(/^(?:i-?)?0*(\d{1,6})$/i);
    if (!m) throw bad('an incident id like I-136');
    return { kind, target: `I-${m[1].padStart(3, '0')}` };
  }
  if (kind === 'land') {
    if (/^[0-9a-f]{7,40}$/.test(t)) return { kind, target: t };
    if (!SLUG.test(t)) throw bad('a topic slug or a commit sha');
    return { kind, target: t };
  }
  if (kind === 'after') {
    const ms = Date.parse(t);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(t) || !Number.isFinite(ms)) throw bad('an ISO time like 2026-10-04T16:00Z');
    return { kind, target: new Date(ms).toISOString() };
  }
  if (kind === 'decision') {
    if (!['lead', 'user'].includes(t.toLowerCase())) throw bad('decision:lead or decision:user');
    return { kind, target: t.toLowerCase() };
  }
  if (!/^v\d{1,3}[a-z0-9-]{0,30}$/i.test(t)) throw bad('a build name like v8');
  return { kind: 'build', target: t.toLowerCase() };
}

function parseAliases(v) {
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (list.length > 8) throw new Error('at most 8 --alias names');
  return [...new Set(list.map((a) => agentName(a, '--alias')))];
}

/** I-108: {name, ahead, head} from the owner's checkout -> {name, landHead?}; a bad name or sha is ignored (null). */
export function parseBranch(b) {
  const name = String(b?.name ?? '');
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(name) || name === 'HEAD' || name === 'main' || name.startsWith('baseline/')) return null;
  const head = String(b?.head ?? '');
  return { name, ...(Number(b?.ahead) > 0 && /^[0-9a-f]{40}$/.test(head) ? { landHead: head } : {}) };
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
 * opts: {by, state, note, next, waitingOn (string; 'none' clears), kind, title, owner, progress, refs, aliases,
 *   unlink ("I-042[,…]": blocking incidents the board stops deriving for this item, kept until 'none'; I-044)}
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
  const unlink = opts.unlink !== undefined ? parseUnlink(opts.unlink) : undefined;
  const resumeOn = opts.resumeOn !== undefined ? parseResumeOn(opts.resumeOn) : undefined;
  if (resumeOn && v.state !== undefined && v.state !== 'parked') throw new Error('--resume-on goes with --state parked');

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
    // T-125 #14 (a): a parked row names what brings it back (ts-testspeed sat parked 3 h after its incident resolved)
    if (resumeOn && state !== 'parked') throw new Error('--resume-on goes with --state parked');
    if (v.state === 'parked' && !resumeOn && !(it.state === 'parked' && it.resumeOn)) {
      throw new Error(`--state parked needs --resume-on <when>: ${RESUME_HELP} (never: done for good). The board then shows "ready to resume" when it happens`);
    }
    // T-125 #10 (c): a landed topic is not parked or researching (countdown-faces stayed "parked" after it landed);
    // T-135: parked until its build comes out (--resume-on build:v8, a part still to check there) is fine
    const waitsForBuild = v.state === 'parked' && (resumeOn || (it.state === 'parked' ? it.resumeOn : null))?.kind === 'build';
    if ((v.state === 'parked' && !waitsForBuild) || v.state === 'researching') {
      const lp = landedProgress({ ...it, ...(v.progress !== undefined && { progress: v.progress }), ...(v.aliases && { aliases: v.aliases }), ...(v.refs && { refs: v.refs }) }, opts.progressData);
      if (lp) throw new Error(`${sid} belongs to PROGRESS item ${lp.id}, whose work is done (${lp.label}): when your part is over use --state done (the board then shows "${lp.label}"); for follow-up work on it use designing, implementing, testing or measuring, or start a new row`);
    }
    if (v.state !== undefined && v.state !== it.state) { changes.state = v.state; it.state = v.state; it.stateSince = now; }
    put('waitingOn', newWait);
    put('resumeOn', state === 'parked' ? (resumeOn ?? it.resumeOn ?? null) : null);
    if (it.resumeOn === null) delete it.resumeOn;
    // unlinked incidents (I-044): --unlink adds, 'none' clears; a self-reported wait on one links it again
    let unl = unlink === undefined ? it.unlinked || [] : unlink === null ? [] : [...new Set([...(it.unlinked || []), ...unlink])];
    if (newWait?.kind === 'incident') unl = unl.filter((x) => x !== newWait.target);
    if (JSON.stringify(unl) !== JSON.stringify(it.unlinked || [])) changes.unlinked = unl;
    if (unl.length) it.unlinked = unl; else delete it.unlinked;
    if (!created && !Object.keys(changes).length) throw new Error('nothing changed (give --state, --note, --next, --waiting-on or another field)');
    // I-108: the owner's own branch (tools/status.mjs passes it from the checkout it runs in), never someone else's:
    // landHead = its tip while it has commits of its own, so the board can see that work reach main
    if (opts.branch && by === it.owner) { const b = parseBranch(opts.branch); if (b) it.branch = b; }
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
 * {locks: {iphone, 'chrome-measure'}: lock.status(), incidents: active list, steps: pending steps, waits: live wait records}.
 * Returns {derived: [{kind, plain, ref?, position?, of?}], flags: [plain], over: [plain] (overFlags), liveWait: bool}.
 */
export function derive(it, live = {}, byId = new Map(), now = Date.now(), route = null) {
  const names = itemNames(it);
  // I-108 (5): a live record (hold, queue place, step, proposal, wait) belongs to its owner's ONE active row
  const router = route || liveRouter(byId.has(it.id) ? [...byId.values()] : [...byId.values(), it]);
  const mine = (owner, job) => router(owner, job) === it.id;
  const derived = [];
  for (const [r, kind, label] of LOCKS) {
    const st = live.locks?.[r];
    if (!st) continue;
    const h = st.holder && !st.stale ? st.holder : null;
    // a shared group (the chrome-measure shared lane, I-048) holds for its readers: each one matching this row is
    // using Chrome now, beside the others; the group's own owner "(shared)" is nobody's
    const group = h && h.shared === true && Array.isArray(h.readers);
    if (group && h.readers.some((x) => mine(x.owner, x.meta?.job))) derived.push({ kind: 'using', resource: kind, shared: true, plain: kind === 'chrome' ? 'using Chrome now (shared)' : 'on the phone now (shared)' });
    else if (h && !group && mine(h.owner, h.meta?.job)) derived.push({ kind: 'using', resource: kind, plain: kind === 'chrome' ? 'using Chrome now' : 'on the phone now' });
    const q = st.queue || [];
    const i = q.findIndex((w) => mine(w.owner, w.meta?.job));
    if (i >= 0) derived.push({ kind, position: i + 1, of: q.length, plain: `in line for ${label}, #${i + 1} of ${q.length}` });
  }
  for (const s of live.steps || []) {
    if (mine(s.by, { text: s.title })) derived.push({ kind: 'user', ref: s.id, plain: `waiting on you: ${s.id} ${sanitize(s.title, 120)}` });
  }
  // I-108 (2): an open proposal (proposed, not held) waits on the user's decision
  for (const p of live.proposals || []) {
    if (p.state === 'proposed' && !p.hold && mine(p.by, { for: p.topic, text: p.title })) derived.push({ kind: 'user', ref: p.id, plain: `waiting on you: ${p.id} ${sanitize(p.title, 120)} (your decision)` });
  }
  for (const inc of live.incidents || []) {
    if (!inc.blocking || (it.unlinked || []).includes(inc.id)) continue;
    const hit = names.has(inc.reportedBy) || (inc.affected || []).some((a) => names.has(a.by) && a.blocking !== false);
    if (hit) derived.push({ kind: 'incident', ref: inc.id, plain: `blocked by ${inc.id}: ${sanitize(inc.title, 120)}` });
  }
  for (const x of live.waits || []) {
    if (!mine(x.owner, { text: x.reason })) continue;
    // I-108 (1): a thread listener waits on nobody: "listening …", never "waiting for a user reply"
    if (isListener(x)) derived.push({ kind: 'listen', tool: sanitize(x.tool, 40), since: x.since, plain: listenPlain(x) });
    else derived.push({ kind: 'wait', tool: sanitize(x.tool, 40), since: x.since, plain: waitPlain(x, now) });
  }
  const flags = [];
  const w = it.waitingOn;
  if (w?.kind === 'incident' && live.incidents && !live.incidents.some((i) => i.id === w.target)) flags.push(`it waits on ${w.target}, which is no longer open: update?`);
  if (w?.kind === 'item') {
    const other = byId.get(w.target);
    if (!other) flags.push(`it waits on workstream ${w.target}, which is not on the board`);
    else if (isFinished(other.state)) flags.push(`it waits on ${w.target}, which is ${other.state}: update?`);
  }
  // I-108 (3): what makes an active row look over (its work on main, its wait answered or decided)
  const over = LIVE_GROUPS.has((STATES[it.state] || { group: 'working' }).group) ? overFlags(it, live) : [];
  const liveWait = derived.some((d) => d.kind === 'chrome' || d.kind === 'phone' || d.kind === 'using' || d.kind === 'user' || d.kind === 'wait');
  return { derived, flags, over, liveWait };
}

/** The names a row answers to on the locks, the console and the wait records: owner, id, aliases. */
const itemNames = (it) => new Set([it.owner, it.id, ...(it.aliases || [])].filter(Boolean));

/** Rows that take live data: working, waiting, not started (never parked or finished; I-108 audit T-060 #6). */
const LIVE_GROUPS = new Set(['working', 'waiting', 'queued']);
const recency = (i) => i.updatedAt || i.createdAt || '';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * I-108 (5): which row a live record belongs to. An agent often has several rows (a fix, a parked try, a finished
 * review); its queue place, hold, wait or step showed on every one of them. Now `router(owner, job)` returns ONE row
 * id (or null: no active row, the record goes to OTHER WAITS), among the active rows that answer to `owner` (owner,
 * id or alias):
 *   1. the row the hold's --for names (job.for, an id or alias),
 *   2. else a row whose id or alias appears as a word in the hold's --doing text (job.text; ids of 3+ characters),
 *   3. else the row named by `owner` itself (a lock owner that is a topic id),
 *   4. else the owner's most recently updated active row.
 */
export function liveRouter(items = []) {
  const open = items.filter((i) => LIVE_GROUPS.has((STATES[i.state] || { group: 'working' }).group));
  const keys = (i) => [i.id, ...(i.aliases || [])];
  const newest = (rows) => rows.reduce((a, b) => (!a || recency(b) > recency(a) ? b : a), null);
  return (owner, job = null) => {
    if (!owner) return null;
    const mine = open.filter((i) => itemNames(i).has(owner));
    if (mine.length <= 1) return mine[0]?.id ?? null;
    const named = (x) => (x ? mine.filter((i) => keys(i).includes(x)) : []);
    const inText = job?.text ? mine.filter((i) => keys(i).some((k) => k.length >= 3 && new RegExp(`(^|[^A-Za-z0-9_-])${escRe(k)}($|[^A-Za-z0-9_-])`).test(job.text))) : [];
    for (const rows of [named(job?.for), inText, named(owner), mine]) if (rows.length) return newest(rows).id;
    return null;
  };
}

const WAIT_REF = /\b(?:C|PR|T)-\d{1,4}\b/g;
const asSet = (x) => (x instanceof Set ? x : new Set(Array.isArray(x) ? x : []));

/**
 * I-108 (4): when the row's current wait began: its last change of state or of what it waits on (history), not the
 * first time it started waiting. A row without history: its stateSince.
 */
export function waitSince(it) {
  let t = it.stateSince || null;
  for (const h of it.history || []) if (h?.changes && 'waitingOn' in h.changes && h.at && (!t || h.at > t)) t = h.at;
  return t;
}

/**
 * I-108 (3): what makes an active row look over, from the live sources (never guessed without them):
 * live.git {mainShas, merged}: the owner's branch work (landHead, recorded by set) is on main while the row says
 *   ready-to-land or reviewing (LANDING_STATES; a working or waiting row with landed commits is normal: fix owners
 *   land notes and tickets mid-work, the lead's I-108 follow-up);
 * live.refs {steps: {id: status}, proposals: {id: state}, threads: {id: {status, lastBy, lastAt}}}: the step,
 * proposal or thread its --waiting-on names is already answered, decided or closed.
 */
const LANDING_STATES = new Set(['ready-to-land', 'reviewing']);
export function overFlags(it, live = {}) {
  const out = [];
  const b = it.branch;
  if (LANDING_STATES.has(it.state) && b?.landHead && live.git && (asSet(live.git.mainShas).has(b.landHead) || asSet(live.git.merged).has(b.name))) {
    out.push(`its work is on main (branch ${sanitize(b.name, 120)}), but the row says ${it.state}: landed?`);
  }
  const w = it.waitingOn;
  const refs = live.refs;
  if (w && refs) {
    const since = waitSince(it);
    for (const id of new Set(`${w.target || ''} ${w.text || ''}`.match(WAIT_REF) || [])) {
      if (id.startsWith('C-')) {
        const st = refs.steps?.[id];
        if (st && st !== 'pending' && st !== 'active') out.push(`it waits on ${id}, which is already ${st}`);
      } else if (id.startsWith('PR-')) {
        const st = refs.proposals?.[id];
        if (st === 'withdrawn') out.push(`it waits on ${id}, which is withdrawn`);
        else if (st && st !== 'proposed' && st !== 'draft') out.push(`it waits on ${id}, which is already decided (${st})`);
      } else {
        const t = refs.threads?.[id];
        if (t?.status === 'closed') out.push(`it waits on ${id}, which is closed`);
        else if (t && t.lastBy === 'user' && since && t.lastAt > since) out.push(`it waits on ${id}, where the user has already answered`);
      }
    }
  }
  return out;
}

/**
 * I-145 (PR-020 N1, user T-122): the events that ended a row's self-reported wait on the user (kind user or other),
 * from live.refs (progress.mjs refsLive): every C-/PR-/T- id the wait names is answered, skipped, decided, withdrawn,
 * closed, or (a thread) the user wrote there after the wait began. Returns null while any of them is still open (or the
 * wait names none), else {refs, at (the latest event), plain: "you answered PR-019 at 13:09Z; fix-accent-ca has not
 * picked it up (16 min)"}. "has not picked it up": the row was not updated since that event. Read-time only.
 */
const ANSWERABLE = new Set(['user', 'other']);
const refAt = (refs, id) => (typeof refs.at?.[id] === 'string' ? refs.at[id] : null);
function refEnded(id, refs, since) {
  if (id.startsWith('C-')) {
    const st = refs.steps?.[id];
    if (!st || st === 'pending' || st === 'active') return null;
    const what = st === 'answered' ? `you answered ${id}` : st === 'skipped' ? `you skipped ${id}` : `${id} was ${st}`;
    return { id, what, at: refAt(refs, id) };
  }
  if (id.startsWith('PR-')) {
    const st = refs.proposals?.[id];
    if (!st || st === 'proposed' || st === 'draft') return null;
    return { id, what: st === 'withdrawn' ? `${id} was withdrawn` : `you decided ${id} (${st})`, at: refAt(refs, id) };
  }
  const t = refs.threads?.[id];
  if (t?.status === 'closed') return { id, what: `${id} was closed`, at: t.closedAt || null };
  if (t && t.lastBy === 'user' && since && t.lastAt > since) return { id, what: `you answered in ${id}`, at: t.lastAt };
  return null;
}
export function waitAnswered(it, live = {}, now = Date.now()) {
  const w = it.waitingOn;
  const refs = live.refs;
  if (!w || !refs || !ANSWERABLE.has(w.kind)) return null;
  const ids = [...new Set(`${w.target || ''} ${w.text || ''}`.match(WAIT_REF) || [])];
  if (!ids.length) return null;
  const since = waitSince(it);
  const ends = ids.map((id) => refEnded(id, refs, since));
  if (ends.some((e) => !e)) return null;
  const at = ends.map((e) => e.at).filter(Boolean).sort().at(-1) || null;
  const updated = it.updatedAt || it.createdAt || null;
  const owner = sanitize(it.owner || 'the owner', 80);
  const tail = !at || !updated || updated < at ? `; ${owner} has not picked it up${at ? ` (${forText(minutes(at, now))})` : ''}` : '';
  return { refs: ids, at, plain: `${ends.map((e) => `${e.what}${e.at ? ` at ${hhmm(e.at)}` : ''}`).join(', ')}${tail}` };
}

// ---- T-124/T-125/T-130: one plain label per item, derived from PROGRESS and the row -------------------------------

/**
 * The PROGRESS facts the labels need, from fixes/PROGRESS.json data (or a bare items array): items, the best build
 * (its short name "v7" and build.fixes), every item in a landed version (builds stack, so it is in the best build
 * too), the landed version ids, and the next build each item is meant for (T-133). null without items.
 */
export function progressContext(p) {
  const items = Array.isArray(p) ? p : Array.isArray(p?.items) ? p.items : null;
  if (!items) return null;
  const versions = Array.isArray(p?.versions) ? p.versions.filter((v) => v && typeof v === 'object') : [];
  const bestV = versions.find((v) => v.best === true) || null;
  const bestFixes = new Set(Array.isArray(p?.build?.fixes) ? p.build.fixes : []);
  const built = new Set(bestFixes);
  for (const v of versions) if (!toTry(v) && Array.isArray(v.fixes)) for (const f of v.fixes) built.add(f);
  const short = bestV ? buildShort(bestV.id) : null;
  const landedBuilds = versions.filter((v) => !toTry(v)).map((v) => String(v.id).toLowerCase());
  const groups = Array.isArray(p) ? [] : targetBuilds(p);
  const targetOf = new Map();
  for (const g of groups) for (const x of g.parts) if (!targetOf.has(x.id)) targetOf.set(x.id, g.build);
  return { items, byId: new Map(items.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x])), best: { short, fixes: bestFixes }, built, landedBuilds, groups, targetOf };
}
const ctxOf = (x) => (x && x.byId instanceof Map ? x : progressContext(x));

/** In the best build: in build.fixes or in any landed version (builds stack), or the base everything builds on. */
const inBest = (it, ctx) => it.state === 'base' || !!ctx?.built?.has(it.id);
/** Is this PROGRESS item's work done: in the best build, or its notes saved (stage L / state landed). */
export function progressLanded(it, ctx) {
  if (!it) return false;
  return inBest(it, ctx) || it.stage === 'L' || it.state === 'landed';
}

/**
 * user T-130 #6: the plain words of every label, shared by /status and /progress (their legends) and the text views.
 * "landed" is never shown alone: it only means the notes were saved on main.
 */
export const LABEL_LEGEND = [
  ['in best build (v7)', 'part of the best build the user tries today'],
  ['done, waits for build (v8)', 'the work is finished and saved; the next build will include it'],
  ['done, not in a build', 'finished and saved on main; no build includes it, and none is planned yet'],
  ['being tested (rev 2)', 'the owner is checking it now; rev = which version of the fix'],
  ['being built', 'the owner is writing the change'],
  ['being diagnosed', 'still finding out what makes it slow'],
  ['unfinished, paused until …', 'stopped for now; it starts again when the named thing happens'],
  ['standing by', 'a helper (ops, the desk, the phone runner) with nothing to do right now'],
  ['closed, no fix', 'looked at and closed without a change to the page'],
  ['not used', 'finished, but in no build; the reason follows'],
  ['dropped', 'tried and given up'],
  ['ready to resume', 'red: what a paused row waited for has happened'],
  ['does not match', 'red: the row and the progress list say different things; the lead fixes one'],
];

/** The Progress side, plain: "in best build (v7)", "done, waits for build v8", "dropped", "being tested". */
export function progressLabel(it, ctx) {
  if (inBest(it, ctx)) return `in best build${ctx?.best?.short ? ` (${ctx.best.short})` : ''}`;
  if (progressLanded(it, ctx)) {
    const t = ctx?.targetOf?.get(it.id);
    if (t) return `done, waits for build ${t}`; // T-133: a part of the next build
    if (it.whyNot) return 'not used'; // T-139 #3: done, kept on main, in no build (its whyNot says why)
    return 'done, not in a build'; // T-140: never "waits for build" without a build to wait for
  }
  if (it.state === 'dropped') return 'dropped';
  if (it.state === 'testing') return 'being tested';
  if (it.state === 'diagnosing') return 'being diagnosed';
  return String(it.state || 'unknown');
}

const REV = /\brev(?:ision)?\.?\s*(\d{1,3})\b/i;
const revOf = (...texts) => { for (const t of texts) { const m = String(t ?? '').match(REV); if (m) return Number(m[1]); } return null; };
/** What the owner is doing now, in plain words (an active row). */
const ACTIVITY = {
  queued: 'not started', researching: 'being diagnosed', designing: 'being designed', implementing: 'being built',
  testing: 'being tested', measuring: 'being tested', reviewing: 'in review', coordinating: 'being coordinated',
  waiting: 'waiting', 'ready-to-land': 'ready, waits for the lead',
};
function activity(row, p) {
  // a measurement while Progress still diagnoses it is part of the diagnosis (style-recalc: Timeline A/B)
  const a = p?.state === 'diagnosing' && ['researching', 'testing', 'measuring'].includes(row.state) ? 'being diagnosed' : ACTIVITY[row.state] || row.state;
  const rev = a === 'being tested' || a === 'being built' || a === 'in review' ? revOf(row.note, row.title, p?.next, p?.title) : null;
  return rev ? `${a} (rev ${rev})` : a;
}
/** The row's state in the words a mismatch line uses (never "landed" alone). */
const ROW_SAYS = { landed: 'done (on main)', done: 'done', 'closed-no-fix': 'closed, no fix', dropped: 'dropped', parked: 'paused', researching: 'being diagnosed' };

/** The row's strongest PROGRESS item (I-104 matches) with how it matched, or null. */
function progressMatch(row, ctx) {
  if (!ctx) return null;
  const m = progressMatches(row, ctx.items)[0];
  const p = m ? ctx.byId.get(m.id) : null;
  return p ? { p, how: m.how } : null;
}
const progressOf = (row, ctx) => progressMatch(row, ctx)?.p || null;

/** set(): the row's PROGRESS item when its work is done ({id, label}), else null. progressData: tests; default the file. */
function landedProgress(row, progressData) {
  let data = progressData;
  if (data === undefined) { try { data = readProgress().data; } catch { data = null; } }
  const ctx = progressContext(data);
  const p = progressOf(row, ctx);
  return p && progressLanded(p, ctx) ? { id: p.id, label: progressLabel(p, ctx) } : null;
}

const NOT_FIX_KINDS = new Set(['ops', 'phone']); // T-125: ops, the desk, the phone runner stand by, they don't finish
function resumePlain(r) {
  if (!r) return '';
  if (r.kind === 'incident') return `${r.target} is resolved`;
  if (r.kind === 'land') return `${r.target} is saved on main`;
  if (r.kind === 'after') return `${r.target.slice(0, 10)} ${hhmm(r.target)}`;
  if (r.kind === 'decision') return `the ${r.target} decides`;
  if (r.kind === 'build') return `build ${r.target} is out`;
  return r.kind;
}

/**
 * T-125 #14 (b): is a parked row's --resume-on condition met? From the live sources only (never guessed): an incident
 * resolved or parked (live.incidentStatus), a sha or a topic's fixes/<topic>/ commit on main after the row was parked
 * (or its PROGRESS item done), the time passed, a landed build of that name. Returns the plain why, or null.
 */
export function resumeReady(it, live = {}, ctx = null, now = Date.now()) {
  const r = it.resumeOn;
  if (!r || it.state !== 'parked') return null;
  if (r.kind === 'incident') {
    const st = live.incidentStatus?.[r.target]; // an id the store does not know is never "ready"
    if (st === 'resolved') return `${r.target} is resolved`;
    if (st === 'parked') return `${r.target} was parked (no fix coming now)`;
  }
  if (r.kind === 'after' && now >= Date.parse(r.target)) return `it is past ${hhmm(r.target)}`;
  if (r.kind === 'build' && ctx?.landedBuilds?.some((id) => id === r.target || id.startsWith(`${r.target}-`))) return `build ${r.target} is out`;
  if (r.kind === 'land') {
    const g = live.git;
    if (/^[0-9a-f]{7,40}$/.test(r.target)) { if (g && [...asSet(g.mainShas)].some((s) => s.startsWith(r.target))) return `${r.target} is on main`; }
    else {
      const t = g?.topics?.[r.target];
      if (t?.at && (!it.stateSince || t.at > it.stateSince)) return `${r.target} was saved on main (${String(t.sha).slice(0, 8)})`;
      const p = ctx?.byId?.get(r.target);
      if (p && progressLanded(p, ctx)) return `${r.target} is ${progressLabel(p, ctx)}`;
    }
  }
  return null;
}

/** The branch's work is on main (I-108 landHead, or the branch merged). */
const branchOnMain = (it, live) => !!(it.branch?.landHead && live.git && (asSet(live.git.mainShas).has(it.branch.landHead) || asSet(live.git.merged).has(it.branch.name)));

/**
 * T-124/T-125/T-130: the row's derived words. Returns {plain (statePlain override or null), label (the one plain
 * label, with the PROGRESS item, or null without one), mismatch: [..], progress: id|null, how (the match), resume:
 * {kind, target, plain, ready}|null, needsReview: plain|null}.
 */
export function deriveLabel(it, { live = {}, ctx = null, now = Date.now() } = {}) {
  const m = progressMatch(it, ctx);
  const p = m?.p || null;
  const landed = p ? progressLanded(p, ctx) : false;
  const P = p ? progressLabel(p, ctx) : null;
  const out = { plain: null, label: null, mismatch: [], progress: p?.id || null, how: m?.how || null, resume: null, needsReview: null };
  if (it.state === 'parked') {
    const r = it.resumeOn || null;
    const until = r && r.kind !== 'never' ? ` until ${resumePlain(r)}` : '';
    if (NOT_FIX_KINDS.has(it.kind)) out.plain = `standing by${until}`;
    else if (landed) out.plain = P;
    else if (r?.kind === 'build') out.plain = `done, waits for build ${r.target}`;
    else if (branchOnMain(it, live)) out.plain = 'done, not in a build';
    else if (r?.kind === 'never') out.plain = 'done, nothing more to do';
    else out.plain = `unfinished, paused${until}`;
    if (r) out.resume = { ...r, plain: resumePlain(r), ready: resumeReady(it, live, ctx, now) };
    // user T-135: never the generic "paused on purpose; may resume": the label (with its "until …") and the row's own
    // reason, e.g. "done, waits for build v8 · next: phone no-worse check in v8's block"
    const reason = it.next ? `next: ${sanitize(it.next, LIMITS.next)}` : it.note ? sanitize(it.note, LIMITS.note) : null;
    out.plain = [out.plain, reason].filter(Boolean).join(' · ');
    // T-125 #14 (c) / T-135: a parked row without a reason or a way back is red until the owner says
    const since = it.stateSince ? `; paused ${forText(minutes(it.stateSince, now))}` : '';
    if (!reason) out.needsReview = `needs review: no reason given${r ? '' : ' and nothing set to bring it back (--resume-on)'}${since}`;
    else if (!r) out.needsReview = `needs review: nothing set to bring it back (--resume-on)${since}`;
  }
  if (!p) return out;
  // diagnosing contradicts a finished row always (r4-v3: in v6, yet "diagnosing"); testing only while not built (an
  // item in a build is tested there)
  const active = p.state === 'diagnosing' || (p.state === 'testing' && !landed);
  const said = (x) => `Progress ${p.id}: ${x}; status row: ${ROW_SAYS[it.state] || it.state}`;
  if (active && ['landed', 'done', 'dropped', 'closed-no-fix'].includes(it.state)) out.mismatch.push(said(p.state === 'diagnosing' ? 'being diagnosed' : 'being tested'));
  if (landed && it.state === 'dropped') out.mismatch.push(said(P));
  if (!landed && p.state === 'dropped' && it.state === 'landed') out.mismatch.push(said('dropped'));
  if (landed && ((it.state === 'parked' && it.resumeOn?.kind !== 'build') || it.state === 'researching')) out.mismatch.push(`${said(P)} (status.mjs sync sets it done)`);
  if (it.state === 'done' || it.state === 'closed-no-fix') out.label = landed ? P : 'closed, no fix';
  else if (it.state === 'dropped') out.label = landed ? P : 'dropped';
  else if (it.state === 'landed') out.label = landed ? P : P === 'dropped' ? 'dropped' : activityLabelFor(p);
  else if (it.state === 'parked') out.label = out.plain.split(' · ')[0];
  else out.label = landed ? `${P}; ${activity(it, p)}` : activity(it, p);
  if (it.state === 'done') out.plain = landed ? P : 'closed, no fix';
  // user T-139 #3: a finished row says why its work is not used (Progress whyNot), not only "closed"
  const whyText = p.whyNot || (p.state === 'dropped' ? p.why : null); // a dropped item's own "why"
  const why = whyText ? sanitize(whyText, LIMITS.note) : null;
  if (why && FINISHED_ROW_STATES.has(it.state) && ['closed, no fix', 'dropped', 'not used'].includes(out.label)) out.plain = `${out.label}: ${why}`;
  return out;
}
const FINISHED_ROW_STATES = new Set(['done', 'closed-no-fix', 'dropped', 'landed']);
/** A row that says it is done while Progress still works on it: show Progress's words. */
const activityLabelFor = (p) => (p.state === 'diagnosing' ? 'being diagnosed' : p.state === 'testing' ? 'being tested' : String(p.state));

// ---- the view ----------------------------------------------------------------------------------------

const minutes = (from, now) => (from ? Math.max(0, Math.round((now - Date.parse(from)) / 60000)) : null);

/**
 * The plain words for a row's state (user T-044: "stopped until something else happens" said nothing): a waiting row
 * names its reason, "waiting for: <the waiting-on text>", or "waiting (reason not given)" without one; the board CLI,
 * the /status page and the progress "now" view all show this.
 */
export function statePlain(state, st = STATES[state] || { plain: state }, waiting = null) {
  if (state !== 'waiting') return st.plain;
  return waiting?.plain ? `waiting for: ${waiting.plain}` : 'waiting (reason not given)';
}

// ---- I-104 (user T-057: "hard to see which progress this row came from"): rows <-> Progress items --------------

const MATCH_RANK = ['linked by its owner', 'same id', 'same topic'];
/**
 * The Progress items (fixes/PROGRESS.json items) a status row belongs to, strongest reason first, one entry per item:
 * the row's own `progress` link ("linked by its owner"), an item with the row's id ("same id") or one of its aliases
 * ("same topic"), an item whose checks or best numbers name a P-id the row's refs name ("both name P-036"). Only items
 * that exist: no Progress data, or no match, gives no link. The owner alone is no match (one agent owns many items).
 */
export function progressMatches(row, progressItems) {
  if (!Array.isArray(progressItems)) return [];
  const byId = new Map(progressItems.filter((p) => p && typeof p.id === 'string').map((p) => [p.id, p]));
  const out = new Map();
  const put = (id, how) => { const p = byId.get(id); if (p && !out.has(id)) out.set(id, { id, title: sanitize(p.title || id, LIMITS.title), how }); };
  if (row.progress) put(row.progress, MATCH_RANK[0]);
  put(row.id, MATCH_RANK[1]);
  for (const a of row.aliases || []) put(a, MATCH_RANK[2]);
  const refs = (row.refs || []).filter((r) => /^P-\d{1,6}$/.test(r));
  if (refs.length) {
    for (const p of byId.values()) {
      const named = new Set([...(p.checks || []).map((c) => c && c.id), ...(p.best || []).map((b) => b && b.ref)]);
      const r = refs.find((x) => named.has(x));
      if (r) put(p.id, `both name ${r}`);
    }
  }
  return [...out.values()];
}
const matchRank = (how) => { const i = MATCH_RANK.indexOf(how); return i < 0 ? MATCH_RANK.length : i; };

export function itemView(it, { live = {}, byId = new Map(), now = Date.now(), staleAfterMin = staleMin(), route = null, progress = null } = {}) {
  const st = STATES[it.state] || { group: 'working', plain: it.state };
  const ctx = ctxOf(progress);
  const lab = deriveLabel(it, { live, ctx, now }); // T-124/T-125
  const { derived, flags, over, liveWait } = derive(it, live, byId, now, route);
  const ageMin = minutes(it.updatedAt || it.createdAt, now);
  const canStale = ['working', 'waiting', 'queued'].includes(st.group);
  const s = (x, n) => (x == null ? null : sanitize(x, n));
  const waiting = it.waitingOn ? { kind: it.waitingOn.kind, target: s(it.waitingOn.target, 80), text: s(it.waitingOn.text, LIMITS.wait), plain: waitingPlain(it.waitingOn) } : null;
  // I-145 (PR-020 N1): the event that ended the owner's wait (the user answered, decided, skipped; the thread closed)
  // overrides the older self-report at read time: the row leaves WAITING ON YOU and says what happened
  const ans = waiting && canStale ? waitAnswered(it, live, now) : null;
  if (ans) Object.assign(waiting, { reported: waiting.plain, answered: ans, plain: ans.plain });
  return {
    id: it.id, title: s(it.title, LIMITS.title), kind: it.kind, kindLabel: KINDS[it.kind] || it.kind,
    owner: s(it.owner, 80), aliases: (it.aliases || []).map((a) => s(a, 80)), progress: it.progress || null, refs: (it.refs || []).map((r) => s(r, 20)),
    progressItems: progressMatches(it, ctx ? ctx.items : progress), // I-104: links to /progress#<id>, only to items that exist
    priority: Number.isInteger(it.priority) ? it.priority : null,
    state: it.state, statePlain: lab.plain || statePlain(it.state, st, waiting), group: st.group, groupLabel: GROUPS[st.group] || st.group,
    // T-124/T-125: one label with the PROGRESS item ("in v7, owner testing", "closed, no fix"), what contradicts it, and
    // a parked row's way back (resumeOn, "ready to resume", "needs review"); alerts = the red lines on /status
    // T-130/T-135: the one line the pages show for the state: the label (a parked row: label · its reason · its way
    // back); null = the row's own state words
    stateText: lab.plain && (it.state === 'parked' || st.group === 'finished') ? lab.plain : lab.label,
    label: lab.label, labelOf: lab.progress, labelHow: lab.how, mismatch: lab.mismatch, resume: lab.resume, needsReview: lab.needsReview,
    alerts: [...lab.mismatch.map((m) => `does not match: ${m}`), ...(lab.resume?.ready ? [`ready to resume: ${lab.resume.ready}`] : []), ...(lab.needsReview ? [lab.needsReview] : [])],
    // I-108 (4): a waiting row counts from its last change of the wait (state or --waiting-on)
    stateSince: it.stateSince || null, stateForMin: minutes(st.group === 'waiting' ? waitSince(it) : it.stateSince, now),
    waiting, derived, flags, liveWait, unlinked: [...(it.unlinked || [])],
    waitingOnYou: (waiting?.kind === 'user' && !waiting.answered) || derived.some((d) => d.kind === 'user'),
    note: s(it.note, LIMITS.note), next: s(it.next, LIMITS.next),
    updatedAt: it.updatedAt || it.createdAt || null, updatedBy: s(it.updatedBy || it.createdBy, 80), ageMin,
    // I-108 (3): "may be out of date", with the reasons: no update for staleAfterMin (unless a live wait shows it is
    // current), or what it reports is over (its work is on main, its wait is answered or decided: overFlags)
    ...(() => {
      const why = canStale ? [...(!liveWait && ageMin !== null && ageMin > staleAfterMin ? [`not updated for ${forText(ageMin)}`] : []), ...over] : [];
      return { stale: why.length > 0, staleWhy: why };
    })(),
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
export function buildStatusView({ items = [], live = {}, now = Date.now(), staleAfterMin = staleMin(), progress = null } = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const route = liveRouter(items);
  const ctx = ctxOf(progress); // T-124: PROGRESS data (items, build, versions) or a bare items array
  const views = items.map((it) => itemView(it, { live, byId, now, staleAfterMin, route, progress: ctx })).sort(compareViews);
  // user T-130 #6: one line per Progress item. Fix rows that belong to the same item by a strong match (linked by the
  // owner, same id, same topic) fold under the newest one, which lists the others as "also" (morph-gpu had a stale
  // "testing" row and a newer parked one: one line). Folded rows stay in items (foldedInto) for check and the JSON.
  const STRONG = new Set(MATCH_RANK);
  const byItem = new Map();
  for (const v of views) if (v.labelOf && STRONG.has(v.labelHow) && v.kind === 'fix') { if (!byItem.has(v.labelOf)) byItem.set(v.labelOf, []); byItem.get(v.labelOf).push(v); }
  for (const vs of byItem.values()) {
    if (vs.length < 2) continue;
    const primary = [...vs].sort((a, b) => (a.ageMin ?? Infinity) - (b.ageMin ?? Infinity))[0];
    primary.also = vs.filter((x) => x !== primary).map((x) => ({ id: x.id, owner: x.owner, state: x.state, note: x.note || null, ageMin: x.ageMin }));
    for (const x of vs) if (x !== primary) x.foldedInto = primary.id;
  }
  const counts = { total: 0, stale: 0, waitingOnYou: 0, alerts: 0, folded: 0 };
  for (const g of GROUP_ORDER) counts[g] = 0;
  for (const v of views) {
    if (v.foldedInto) { counts.folded++; continue; }
    counts.total++;
    counts[v.group] = (counts[v.group] || 0) + 1; if (v.stale) counts.stale++; if (v.waitingOnYou) counts.waitingOnYou++; if (v.alerts.length) counts.alerts++;
  }
  // user T-133 #6: each build still to come (v8) with its parts and each part's one label; finished parts stay
  const buildGroups = (ctx?.groups || []).map((g) => ({
    build: g.build, name: sanitize(g.name, LIMITS.title),
    parts: g.parts.map((x) => {
      const it = ctx.byId.get(x.id) || null;
      const row = views.find((v) => !v.foldedInto && v.labelOf === x.id) || views.find((v) => !v.foldedInto && v.id === x.id) || null;
      const label = row?.label && row.labelOf === x.id ? row.label : it ? progressLabel(it, ctx) : row ? row.statePlain : 'not started yet';
      return {
        id: x.id, via: x.via, title: sanitize(it?.title || row?.title || x.id, LIMITS.title), label, inProgress: !!it,
        done: it ? progressLanded(it, ctx) : false, row: row?.id || null, owner: row?.owner || null, alerts: row?.alerts || [],
      };
    }),
  }));
  // I-058: live waits whose owner has no active row (the rows show their own owner's waits)
  // (I-108: the same router as the rows, so a wait shows exactly once: on its row, or here)
  const otherWaits = (live.waits || []).filter((x) => route(x.owner, { text: x.reason }) === null)
    .map((x) => ({ owner: sanitize(ownerText(x.owner), 80), tool: sanitize(x.tool, 40), since: x.since, plain: isListener(x) ? listenPlain(x) : waitPlain(x, now) }));
  return {
    schema: SCHEMA, now: new Date(now).toISOString(), staleAfterMin, counts,
    groups: GROUP_ORDER.map((k) => ({ key: k, label: GROUPS[k] })),
    kinds: Object.entries(KINDS).map(([key, label]) => ({ key, label })),
    states: STATE_NAMES.map((k) => ({ key: k, group: STATES[k].group, plain: STATES[k].plain })),
    items: views,
    buildGroups,
    labelLegend: LABEL_LEGEND.map(([label, plain]) => ({ label, plain })), // T-130: the same on /status and /progress
    otherWaits,
    liveErrors: (live.errors || []).map((e) => sanitize(e, 200)),
  };
}

/** The Progress items for the links (I-104), or null when PROGRESS.json can't be read (then no links). */
export function progressItems() {
  try { const { data } = readProgress(); return Array.isArray(data?.items) ? data.items : null; } catch { return null; }
}
/** T-124: the whole PROGRESS data (items, build, versions) for the labels, or null. */
export function progressData() {
  try { const { data } = readProgress(); return Array.isArray(data?.items) ? data : null; } catch { return null; }
}

export async function currentStatusView({ now = Date.now(), live } = {}) {
  return buildStatusView({ items: list(), live: live || (await gatherLive()), now, progress: progressData() });
}

/**
 * For /progress: progress item id -> a short live status of the workstream linked to it ({id, state, plain, waits},
 * plus `also: [{id, title}]` when more rows link to it). I-104: the rows' progressItems (the owner's link, the same id,
 * an alias, a shared P-id); the strongest reason wins, then the board's order.
 */
export function progressLinks(view) {
  const rows = new Map();
  for (const v of view.items) {
    // the owner's own link counts even when the board was built without the Progress items: /progress looks it up by
    // its own item ids, so it is never a link to nothing
    const links = [...(v.progressItems || [])];
    if (v.progress && !links.some((l) => l.id === v.progress)) links.unshift({ id: v.progress, how: MATCH_RANK[0] });
    for (const l of links) {
      if (!rows.has(l.id)) rows.set(l.id, []);
      rows.get(l.id).push({ v, rank: matchRank(l.how) });
    }
  }
  const m = new Map();
  for (const [id, list] of rows) {
    const [best, ...rest] = list.sort((a, b) => a.rank - b.rank || (a.v.foldedInto ? 1 : 0) - (b.v.foldedInto ? 1 : 0)); // stable: the board's order within a rank; a folded row (T-130) after its line
    const v = best.v;
    const link = {
      id: v.id, state: v.state, plain: v.statePlain, stale: v.stale, priority: v.priority ?? null, // T-112: /progress sorts by it
      ...(v.label && v.labelOf === id && { label: v.label }), ...(v.alerts?.length && { alerts: v.alerts }), // T-124
      waits: [...(v.waiting ? [v.waiting.answered ? v.waiting.plain : `waiting on ${v.waiting.plain}`] : []), ...v.derived.filter((d) => d.kind !== 'listen').map((d) => d.plain)], // I-108: a listener is no wait
    };
    if (rest.length) link.also = rest.map((r) => ({ id: r.v.id, title: r.v.title }));
    m.set(id, link);
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
  if (c.stale) bits.push(`${c.stale} may be out of date`);
  if (c.alerts) bits.push(`${c.alerts} to fix (status.mjs check)`);
  return bits.join(', ');
}

/** One item, a few lines. */
export function itemText(v) {
  const L = [];
  const pr = v.priority ? `#${v.priority}` : '–';
  L.push(`${pr.padEnd(4)}${v.id}  [${v.kindLabel}] ${v.title}`);
  // T-130: a derived label replaces the row's own state words (the owner's text stays as the note)
  const st = v.stateText || v.label ? `${v.stateText || v.label}${v.labelOf ? ` [progress ${v.labelOf}]` : ''}` : `${v.state}${v.stateForMin !== null && v.group !== 'finished' ? ` for ${forText(v.stateForMin)}` : ''}: ${v.statePlain}`;
  L.push(`      ${st}; owner ${v.owner}; updated ${agoText(v.ageMin)}${v.updatedBy && v.updatedBy !== v.owner ? ` by ${v.updatedBy}` : ''}${v.stale ? `  (MAY BE OUT OF DATE: ${v.staleWhy.join('; ')})` : ''}`);
  for (const a of v.also || []) L.push(`      also: row ${a.id} (owner ${a.owner}, updated ${agoText(a.ageMin)})${a.note ? `: ${a.note}` : ''}`); // T-130
  if (v.resume) L.push(`      resumes when: ${v.resume.plain}${v.resume.ready ? '' : ' (not yet)'}`); // T-125
  for (const a of v.alerts || []) L.push(`      !! ${a}`);
  if (v.waiting?.answered) L.push(`      wait over: ${v.waiting.plain} (the row says: waiting on ${v.waiting.reported})`); // I-145
  else if (v.waiting) L.push(`      waiting on: ${v.waiting.plain}`);
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
      const what = [...(v.waiting?.kind === 'user' && !v.waiting.answered ? [v.waiting.plain] : []), ...v.derived.filter((d) => d.kind === 'user').map((d) => d.plain)];
      L.push(`  ${v.id}: ${what.join('; ')}`);
    }
  }
  // T-133 #6: the next build(s) first, every part with its one label (finished parts too)
  for (const g of view.buildGroups || []) {
    L.push('', `NEXT BUILD ${g.build}: ${g.name}`);
    for (const x of g.parts) L.push(`  ${x.id}: ${x.label}${x.row && x.row !== x.id ? ` [row ${x.row}]` : ''}${x.alerts.length ? `  !! ${x.alerts.join('; ')}` : ''}`);
  }
  const shown = view.items.filter((v) => !v.foldedInto && (all || v.group !== 'finished'));
  L.push('');
  if (!shown.length) L.push(all ? 'no workstreams on the board' : 'no active workstreams (node tools/status.mjs list --all)');
  for (const v of shown) L.push(itemText(v));
  const hidden = view.items.filter((v) => !v.foldedInto).length - shown.length;
  if (hidden) L.push('', `(${hidden} finished; --all shows them)`);
  if (view.otherWaits?.length) {
    L.push('', 'OTHER WAITS (no active workstream row for their owner)');
    for (const x of view.otherWaits) L.push(`  ${x.owner}: ${x.plain}  [${x.tool}]`);
  }
  return L.join('\n');
}

/**
 * I-108 (3): the rows that may be out of date, each with why (`status.mjs stale`): what the lead and ops chase at a
 * check-in instead of reading the whole board.
 */
export function staleText(view) {
  const rows = view.items.filter((v) => v.stale);
  const tail = `(stale after ${forText(view.staleAfterMin)} without an update)`;
  if (!rows.length) return `no row looks out of date ${tail}`;
  const L = [`${rows.length} row${rows.length === 1 ? '' : 's'} may be out of date ${tail}:`];
  for (const v of rows) L.push(`  ${v.id}  owner ${v.owner}, ${v.state}, updated ${agoText(v.ageMin)}: ${v.staleWhy.join('; ')}`);
  return L.join('\n') + '\n';
}

/**
 * T-124/T-125: `status.mjs check`: every row whose label contradicts PROGRESS (MISMATCH), a parked row whose way back
 * happened (READY), a row parked > 4 h with none (REVIEW). Returns {lines, count}.
 */
export function checkLines(view) {
  const lines = [];
  for (const v of view.items) {
    for (const m of v.mismatch || []) lines.push(`MISMATCH ${v.id} (owner ${v.owner}): ${m}`);
    if (v.resume?.ready) lines.push(`READY ${v.id} (owner ${v.owner}): parked until ${v.resume.plain}; ${v.resume.ready}: ready to resume`);
    if (v.needsReview) lines.push(`REVIEW ${v.id} (owner ${v.owner}): ${v.needsReview}`);
  }
  return { lines, count: lines.length };
}

/** One item with its history (`status.mjs show`). */
export function showText(it, v) {
  const L = [itemText(v)];
  if (v.refs.length) L.push(`      refs: ${v.refs.join(', ')}`);
  if (v.aliases.length) L.push(`      also known on the locks/console as: ${v.aliases.join(', ')}`);
  if (v.unlinked?.length) L.push(`      incidents not shown here (unlinked by the owner): ${v.unlinked.join(', ')}`);
  L.push('  history:');
  for (const h of it.history || []) L.push(`    ${h.at} ${sanitize(h.by, 80)} ${h.action}${h.changes && Object.keys(h.changes).length ? ' ' + sanitize(JSON.stringify(h.changes), 400) : ''}${h.note ? `: ${sanitize(h.note, 200)}` : ''}`);
  return L.join('\n');
}

// ---- T-125 #10 (a): sync rows with main ------------------------------------------------------------------------

/**
 * `status.mjs sync` (the lead runs it after every landing): ties rows to landings, from main and PROGRESS only.
 * For every row whose PROGRESS item landed (stage L, landed, in a landed build) or whose branch work is on main:
 * records `landed: {at, sha, via}` (the newest main commit touching fixes/<item>/, or the branch tip), then
 *   ready-to-land / reviewing with its branch on main -> landed;  parked / researching / queued on a landed item -> done.
 * Rows working on a follow-up keep their state (the label says "landed, owner testing"). Returns [{id, from, to,
 * landed, changed}]. apply=false: nothing written.
 */
export async function sync({ by = 'status-sync', live = {}, progress = null, apply = true, now = Date.now() } = {}) {
  agentName(by, '--by');
  const ctx = ctxOf(progress);
  const out = [];
  for (const it of list()) {
    if (it.state === 'landed' || it.state === 'dropped' || it.state === 'closed-no-fix') continue;
    const p = progressOf(it, ctx);
    const pl = p ? progressLanded(p, ctx) : false;
    const br = branchOnMain(it, live);
    if (!pl && !br) continue;
    const topic = p ? live.git?.topics?.[p.id] : null;
    const landed = br && it.branch?.landHead
      ? { at: live.git?.shaAt?.[it.branch.landHead] || null, sha: it.branch.landHead, via: `branch ${it.branch.name}` }
      : topic ? { at: topic.at, sha: topic.sha, via: `fixes/${p.id}/ on main` } : { at: null, sha: null, via: `PROGRESS ${p.id}: ${progressLabel(p, ctx)}` };
    let to = it.state;
    if (br && LANDING_STATES.has(it.state)) to = 'landed';
    else if (pl && ['parked', 'researching', 'queued'].includes(it.state) && !(it.state === 'parked' && it.resumeOn?.kind === 'build')) to = 'done'; // T-135: a part waiting for its build stays
    const changed = to !== it.state || JSON.stringify(it.landed ?? null) !== JSON.stringify(landed);
    out.push({ id: it.id, owner: it.owner, from: it.state, to, landed, changed });
    if (!apply || !changed) continue;
    await withGuard(GUARD, () => {
      const cur = readJson(fileOf(it.id));
      if (!cur || cur.state !== it.state) return; // changed meanwhile: the next sync sees it
      const at = iso(now);
      const changes = { landed };
      cur.landed = landed;
      if (to !== cur.state) { changes.state = to; cur.state = to; cur.stateSince = at; delete cur.resumeOn; if (to === 'landed' || to === 'done') cur.waitingOn = null; }
      cur.updatedAt = at;
      cur.updatedBy = by;
      pushHistory(cur, { at, by, action: 'sync', changes });
      writeJson(fileOf(it.id), cur);
    });
  }
  return out;
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


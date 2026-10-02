// Fix progress for the user (ts-progress, user request 2026-10-01: "put the current fix progress on the console
// for me to catch up"): one plain-language page in the user console (`/progress`) and the same content as text
// (`node tools/console.mjs progress`). Read-only: nothing here writes anything.
//
// Two sources:
//   1. fixes/PROGRESS.json (committed, curated by mgmt-ops): the headline layer in plain words. Schema below;
//      `node tools/console.mjs progress --check` validates it, and tests/unit/progress.test.mjs validates the
//      committed file in every `npm run test:unit`.
//   2. Live state, read at request time: the iphone and chrome-measure holders and queues (owner names only, never
//      a holder's meta, checkout, pid or token; a chrome-measure shared group as its readers with weight and start
//      time, the weight in use against the cap, whether joins are closed, and the lane switch, I-048), open incidents (id, title, blocking), the console steps waiting for the user
//      (title only, never a URL or instructions), and the "in?" cell of fixes/PREDICTIONS.md for every check an item
//      names. A check whose ledger row has a result while PROGRESS.json still has none is flagged "new result, the
//      summary is not updated yet", so a stale summary shows on the page.
// Hard rule 12: the curated file must hold no URL, IP address, *.local host, e-mail, device id or home path
// (validateProgress refuses them); every live string is scrubbed (sanitize) before it is shown.
//
// PROGRESS.json, schema "fw-progress/1" (plain words for a non-specialist; jargon goes in `details`):
// {
//   "schema": "fw-progress/1",
//   "updatedAt": "2026-10-01T17:00:00Z", "updatedBy": "<agent>",
//   "howToUpdate": "<optional note for the next editor>",
//   "goal": "<one plain sentence>",
//   "complaints": [{ "area": "hero|middle|end|whole", "text": "<what the user said they feel>" }],
//   "changes": [{ "at": "<ISO>", "text": "<what changed, plain>" }],          // newest first; the page shows 5
//   "items": [{
//     "id": "<slug>", "title": "<plain name>", "area": "hero|middle|end|whole",
//     "state": "base|testing|diagnosing|landed|dropped",
//     "stage": "R|I|D|F|V|L",                                                // protocol v2; the page adds the meaning
//     "fixes": "<what it would change for the user>",
//     "best": [{ "what": "<metric, plain>", "before": "<control>", "after": "<this build>",
//                "tag": "OBSERVED|CONFIRMED|UNRESOLVED|REFUTED", "driver": "<scripted|robot finger|finger|…>",
//                "ref": "P-029", "note": "<e.g. threshold-sensitive>" }],
//     "felt": { "answer": "better|same|worse|not-yet", "text": "<plain>" },
//     "gate": "<what must pass before it can land>", "next": "<next step>", "owner": "<agent>",
//     "checks": [{ "id": "P-032", "what": "<plain>", "result": "<plain, or empty while it runs>" }],
//     "why": "<dropped only: why, plain>",
//     "details": ["<technical line>", …]
//   }],
//   "upcoming": [{ "title": "<a step that will come to the user console>", "when": "<plain>", "item": "<item id>" }]
// }
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './paths.mjs';
import { redact } from './redact.mjs';

export const SCHEMA = 'fw-progress/1';
export const progressFile = () => process.env.FW_PROGRESS_FILE || join(REPO, 'fixes', 'PROGRESS.json');
export const ledgerFile = () => process.env.FW_PREDICTIONS_FILE || join(REPO, 'fixes', 'PREDICTIONS.md');

/** Protocol v2 stages (fixes/LEAD.md "Stages and gates") in plain words. */
export const STAGES = {
  R: { name: 'research', plain: 'finding where it is slow' },
  I: { name: 'investigate', plain: 'finding what happens in the slow frame' },
  D: { name: 'distinguish', plain: 'proving the cause' },
  F: { name: 'fix', plain: 'building and testing a fix' },
  V: { name: 'review', plain: 'independent review' },
  L: { name: 'land', plain: 'done (landed)' },
};
export const STAGE_ORDER = Object.keys(STAGES);
export const AREAS = { hero: 'Top of the page (hero)', middle: 'Middle of the page', end: 'End of the page', whole: 'Whole page' };
export const STATES = ['base', 'testing', 'diagnosing', 'landed', 'dropped'];
export const TAGS = ['OBSERVED', 'CONFIRMED', 'UNRESOLVED', 'REFUTED'];
export const FELT = ['better', 'same', 'worse', 'not-yet'];
export const FELT_PLAIN = { better: 'you felt it smoother', same: 'you felt no difference', worse: 'you felt it worse', 'not-yet': 'not tried by you yet' };
export const STALE_HOURS = 3;
const CHANGES_SHOWN = 5;
const LEDGER_ID = /^P-\d{3}[a-z]?$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;

// ---- personal data -----------------------------------------------------------------------------------

/** Shapes that must never appear on the page or in the committed file: [name, regex]. */
export const PERSONAL = [
  ['url', /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi],
  ['ip address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  // IPv6: the full form, and the short forms of link-local (fe80::), unique-local (fc/fd) and global (2xxx/3xxx)
  // addresses; not "Class::method" or clock times like 16:21:39
  ['ip address', /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b|\b(?:fe80|f[cd][0-9a-f]{2}|[23][0-9a-f]{3}):[0-9a-f:]*:[0-9a-f]{1,4}\b/gi],
  ['local host name', /\b[\w-]+\.(?:local|lan)\b/gi],
  ['e-mail', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['device id', /\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b|\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b|\b[0-9a-fA-F]{40}\b/g],
  ['home path', /\/(?:Users|home)\/[^/\s]+/g],
];

/** The first personal-data shape found in `s`, or null. */
export function findPersonal(s) {
  if (typeof s !== 'string') return null;
  for (const [name, re] of PERSONAL) { re.lastIndex = 0; const m = re.exec(s); if (m) return { kind: name, match: m[0] }; }
  return null;
}

/** A live string made safe to show: ids redacted (./redact.mjs), then URLs, addresses, hosts and home paths replaced. */
export function sanitize(s, max = 300) {
  if (s == null) return '';
  let t = String(s);
  for (const [name, re] of PERSONAL) t = t.replace(re, name === 'home path' ? '~' : name === 'url' ? '<link>' : `<${name}>`);
  t = redact(t);
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// ---- validation --------------------------------------------------------------------------------------

const isIso = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z$/.test(v) && !Number.isNaN(Date.parse(v));

/** Every problem in a parsed PROGRESS.json, as "path: problem" strings (empty = valid). */
export function validateProgress(p) {
  const E = [];
  const str = (v, path, { max = 300, optional = false } = {}) => {
    if (v === undefined || v === null || v === '') { if (!optional) E.push(`${path}: required`); return; }
    if (typeof v !== 'string') { E.push(`${path}: must be a string`); return; }
    if (v.length > max) E.push(`${path}: too long (${v.length} > ${max} chars)`);
  };
  const oneOf = (v, list, path) => { if (!list.includes(v)) E.push(`${path}: must be one of ${list.join(', ')} (got ${JSON.stringify(v)})`); };
  const arr = (v, path, { optional = false, max = 50 } = {}) => {
    if (v === undefined && optional) return [];
    if (!Array.isArray(v)) { E.push(`${path}: must be an array`); return []; }
    if (v.length > max) E.push(`${path}: at most ${max} entries`);
    return v;
  };
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['top level: must be a JSON object'];
  if (p.schema !== SCHEMA) E.push(`schema: must be "${SCHEMA}"`);
  if (!isIso(p.updatedAt)) E.push('updatedAt: must be an ISO UTC time like 2026-10-01T17:00:00Z');
  str(p.updatedBy, 'updatedBy', { max: 80 });
  str(p.goal, 'goal', { max: 400 });
  arr(p.complaints, 'complaints').forEach((c, i) => { oneOf(c?.area, Object.keys(AREAS), `complaints[${i}].area`); str(c?.text, `complaints[${i}].text`); });
  arr(p.changes, 'changes', { optional: true, max: 30 }).forEach((c, i) => {
    if (!isIso(c?.at)) E.push(`changes[${i}].at: must be an ISO UTC time`);
    str(c?.text, `changes[${i}].text`);
  });
  const ids = new Set();
  arr(p.items, 'items', { max: 60 }).forEach((it, i) => {
    const at = `items[${i}]`;
    if (!it || typeof it !== 'object') { E.push(`${at}: must be an object`); return; }
    if (!SLUG.test(String(it.id))) E.push(`${at}.id: a short slug (a-z, 0-9, -)`);
    else if (ids.has(it.id)) E.push(`${at}.id: duplicate "${it.id}"`);
    ids.add(it.id);
    str(it.title, `${at}.title`, { max: 90 });
    oneOf(it.area, Object.keys(AREAS), `${at}.area`);
    oneOf(it.state, STATES, `${at}.state`);
    oneOf(it.stage, STAGE_ORDER, `${at}.stage`);
    str(it.fixes, `${at}.fixes`, { optional: true });
    arr(it.best, `${at}.best`, { optional: true, max: 6 }).forEach((b, j) => {
      const bt = `${at}.best[${j}]`;
      str(b?.what, `${bt}.what`, { max: 120 }); str(b?.before, `${bt}.before`, { max: 80 }); str(b?.after, `${bt}.after`, { max: 80 });
      oneOf(b?.tag, TAGS, `${bt}.tag`);
      str(b?.driver, `${bt}.driver`, { max: 60 });
      if (b?.ref !== undefined && !/^(P-\d{3}[a-z]?|F-\d{3}|C-\d{3}|I-\d{3})$/.test(String(b.ref))) E.push(`${bt}.ref: a ledger, finding, console or incident id (P-029, F-084, C-001, I-038)`);
      str(b?.note, `${bt}.note`, { optional: true, max: 160 });
    });
    if (it.felt !== undefined) { oneOf(it.felt?.answer, FELT, `${at}.felt.answer`); str(it.felt?.text, `${at}.felt.text`, { optional: true }); }
    str(it.gate, `${at}.gate`, { optional: true });
    str(it.next, `${at}.next`, { optional: ['dropped', 'landed', 'base'].includes(it.state) });
    str(it.owner, `${at}.owner`, { max: 80, optional: ['dropped', 'landed', 'base'].includes(it.state) });
    arr(it.checks, `${at}.checks`, { optional: true, max: 8 }).forEach((c, j) => {
      if (!LEDGER_ID.test(String(c?.id))) E.push(`${at}.checks[${j}].id: a PREDICTIONS.md row id like P-032`);
      str(c?.what, `${at}.checks[${j}].what`, { max: 160 });
      str(c?.result, `${at}.checks[${j}].result`, { optional: true });
    });
    if (it.state === 'dropped') str(it.why, `${at}.why`);
    else str(it.why, `${at}.why`, { optional: true });
    arr(it.details, `${at}.details`, { optional: true, max: 12 }).forEach((d, j) => str(d, `${at}.details[${j}]`, { max: 600 }));
  });
  arr(p.upcoming, 'upcoming', { optional: true, max: 20 }).forEach((u, i) => {
    str(u?.title, `upcoming[${i}].title`, { max: 160 }); str(u?.when, `upcoming[${i}].when`, { max: 160 });
    if (u?.item !== undefined && !ids.has(u.item)) E.push(`upcoming[${i}].item: no item "${u.item}"`);
  });
  // Hard rule 12: no personal data anywhere in the file
  const walk = (v, path) => {
    if (typeof v === 'string') { const f = findPersonal(v); if (f) E.push(`${path}: contains a ${f.kind} ("${f.match.slice(0, 40)}"); nothing personal or network-identifying in this file (Hard rule 12)`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(p, '');
  return E;
}

/** {data, errors, file}: the curated file read and validated (errors: missing, bad JSON, schema problems). */
export function readProgress(file = progressFile()) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return { data: null, errors: [`no progress file yet (${file.replace(REPO + '/', '')})`], file }; }
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { data: null, errors: [`not JSON: ${e.message}`], file }; }
  return { data, errors: validateProgress(data), file };
}

// ---- the predictions ledger --------------------------------------------------------------------------

/**
 * fixes/PREDICTIONS.md rows -> Map id -> {id, result}. `result` is the "in?" cell (bold marks stripped),
 * '' while the row has none. Columns: id · author · date · build · driver · metric · predicted · measured · in? ·
 * ratio · lesson; counted from the start (the free-text cells hold no " | ").
 */
export function parseLedger(text) {
  const rows = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\|\s*(P-\d{3}[a-z]?)\s*\|/);
    if (!m) continue;
    const cells = line.split(' | ');
    const inCell = (cells[8] ?? '').replace(/\*\*/g, '').trim();
    rows.set(m[1], { id: m[1], result: inCell });
  }
  return rows;
}

export function readLedger(file = ledgerFile()) {
  try { return parseLedger(readFileSync(file, 'utf8')); } catch { return new Map(); }
}

// ---- live state --------------------------------------------------------------------------------------

/**
 * A lock resource for the page: holder and queue by owner name only (no meta, no checkout, no pid, no token).
 * The chrome-measure shared lane (ts-lock-share; I-048): a shared group is not one holder but its readers, each as
 * {owner, weight, since}, with the weight in use against the lead's cap and whether joins are closed (an exclusive
 * waiter is queued: writer preference, lock.mjs readerAttempt). `st.sharedLane` is lock.sharedSwitch() (gatherLive
 * adds it for a gated resource); `lane` is null without it. A group in a format this code does not know shows as an
 * exclusive holder, as lock.mjs treats it.
 */
export function lockView(st, now = Date.now()) {
  if (!st) return null;
  const held = st.holder && !st.stale ? st.holder : null;
  const group = held && held.shared === true && held.format === 'rw1' && Array.isArray(held.readers) ? held : null;
  const h = group ? null : held;
  const sw = st.sharedLane || null;
  const queue = st.queue || [];
  let shared = null;
  if (group) {
    const readers = group.readers.map((x) => ({ owner: sanitize(x.owner, 60), weight: x.weight || 1, since: x.acquiredAt || null }));
    const writer = queue.find((w) => !w.shared);
    shared = { readers, used: readers.reduce((a, x) => a + x.weight, 0), cap: sw?.cap ?? null, joinsClosed: !!writer, closedBy: writer ? sanitize(writer.owner, 60) : null };
  }
  return {
    holder: h ? { owner: sanitize(h.owner, 60), since: h.acquiredAt || null, until: h.expiresAt || null, short: !!h.short } : null,
    shared,
    lane: sw ? { on: !!sw.enabled, cap: sw.cap } : null,
    queue: queue.map((w) => sanitize(w.owner, 60)),
    ...(st.handover && !held ? { handover: handoverView(st.handover) } : {}),
  };
}

/** I-051: lock.handoverInfo() for the page: whom a free lock is handing over to, and why that waiter has not taken it. */
function handoverView(ho) {
  const to = sanitize(ho.to, 60);
  const why = Array.isArray(ho.gated) ? `gated: ${ho.gated.map((x) => sanitize(x, 80)).join(', ')}`
    : Number.isFinite(ho.notSeenSec) ? `not seen for ${ho.notSeenSec} s` : Number.isFinite(ho.seenSec) ? `seen ${ho.seenSec} s ago` : '';
  return { to, text: `handing over to ${to}${why ? ` (${why})` : ''}` };
}

/** Live sources, each failure-tolerant (a broken source shows as unavailable, never breaks the page). */
export async function gatherLive() {
  const live = { locks: {}, incidents: null, steps: null, waits: null, errors: [] };
  try {
    const L = await import('./lock.mjs');
    for (const r of ['iphone', 'chrome-measure']) {
      const st = L.status(r);
      // a shared group: only its live readers (a dead process reader stays in the file until the next acquirer prunes
      // it), and the lead's switch (on/off, cap) for the lane line; both through lock.mjs accessors, never the files
      if (L.isGroup(st.holder) && Array.isArray(st.holder.readers)) st.holder = { ...st.holder, readers: L.liveReaders(st.holder) };
      if (L.GATED[r]) st.sharedLane = L.sharedSwitch(r);
      live.locks[r] = st;
    }
  } catch (e) { live.errors.push(`locks: ${e.message}`); }
  try { live.incidents = (await import('./incident.mjs')).list(); } catch (e) { live.errors.push(`incidents: ${e.message}`); }
  try { live.steps = (await import('./console.mjs')).list({ pending: true }); } catch (e) { live.errors.push(`console steps: ${e.message}`); }
  try { live.waits = (await import('./waits.mjs')).listWaits(); } catch (e) { live.errors.push(`waits: ${e.message}`); } // I-058
  return live;
}

// ---- the view ----------------------------------------------------------------------------------------

const stageView = (s) => ({ code: s, name: STAGES[s]?.name || s, plain: STAGES[s]?.plain || '', index: STAGE_ORDER.indexOf(s) });

function itemView(it, ledger, statusLinks = new Map()) {
  const checks = (it.checks || []).map((c) => {
    const row = ledger.get(c.id);
    const curated = (c.result || '').trim();
    const ledgerResult = row ? row.result : '';
    return {
      id: c.id, what: c.what, result: curated || null,
      ledger: row ? (ledgerResult || 'no result yet') : 'not in the ledger',
      newResult: !curated && !!ledgerResult, // the ledger moved on, the summary did not
    };
  });
  return {
    id: it.id, title: it.title, area: it.area, areaLabel: AREAS[it.area], state: it.state, stage: stageView(it.stage),
    fixes: it.fixes || null, best: it.best || [], felt: it.felt ? { ...it.felt, plain: FELT_PLAIN[it.felt.answer] || it.felt.answer } : null, gate: it.gate || null, next: it.next || null,
    owner: it.owner || null, checks, why: it.why || null, details: it.details || [],
    attention: checks.some((c) => c.newResult),
    status: statusLinks.get(it.id) || null, // the linked workstream's live state on the status board (status.mjs)
  };
}

/**
 * The page / CLI model from the curated data and the live sources. Pure: every input passed in.
 * {now, summary, goal, complaints, changes, live, sections: [{key, label, items}], upcoming, waiting}
 */
export function buildView({ progress, errors = [], ledger = new Map(), live = {}, now = Date.now(), statusLinks = new Map() } = {}) {
  const p = errors.length && !progress ? null : progress;
  const items = (p?.items || []).map((it) => itemView(it, ledger, statusLinks));
  const areaRank = (a) => Object.keys(AREAS).indexOf(a);
  const byArea = (a, b) => areaRank(a.area) - areaRank(b.area) || b.stage.index - a.stage.index;
  const pick = (states) => items.filter((i) => states.includes(i.state)).sort(byArea);
  const ageMin = p?.updatedAt ? Math.round((now - Date.parse(p.updatedAt)) / 60000) : null;
  const inc = (live.incidents || []).map((i) => ({ id: i.id, title: sanitize(i.title, 160), blocking: !!i.blocking }));
  return {
    now: new Date(now).toISOString(),
    summary: {
      updatedAt: p?.updatedAt || null, updatedBy: p?.updatedBy || null, ageMin,
      stale: ageMin !== null && ageMin > STALE_HOURS * 60,
      errors,
      newResults: items.reduce((n, i) => n + i.checks.filter((c) => c.newResult).length, 0),
    },
    goal: p?.goal || null,
    complaints: (p?.complaints || []).map((c) => ({ ...c, areaLabel: AREAS[c.area] })),
    changes: [...(p?.changes || [])].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, CHANGES_SHOWN),
    live: {
      phone: live.locks ? lockView(live.locks.iphone, now) : null,
      chrome: live.locks ? lockView(live.locks['chrome-measure'], now) : null,
      incidents: live.incidents ? { open: inc.length, blocking: inc.filter((i) => i.blocking), list: inc } : null,
      errors: (live.errors || []).map((e) => sanitize(e, 200)),
    },
    sections: [
      { key: 'testing', label: 'Fixes being tested', items: pick(['testing']) },
      { key: 'diagnosing', label: 'Being diagnosed', items: pick(['diagnosing']) },
      { key: 'landed', label: 'Landed / the base everything builds on', items: pick(['base', 'landed']) },
      { key: 'dropped', label: 'Dropped or not felt', items: pick(['dropped']) },
    ],
    upcoming: (p?.upcoming || []).map((u) => ({ ...u })),
    // console steps waiting for the user now: id and title only (a step's URL or instructions may name the LAN host)
    waiting: live.steps ? live.steps.map((s) => ({ id: s.id, title: sanitize(s.title, 160), status: s.status })) : null,
  };
}

/** Everything from the real sources, for the server and the CLI. */
export async function currentView({ now = Date.now() } = {}) {
  const { data, errors } = readProgress();
  const live = await gatherLive();
  let statusLinks = new Map();
  try { const S = await import('./status.mjs'); statusLinks = S.progressLinks(S.buildStatusView({ items: S.list(), live, now })); } catch (e) { live.errors.push(`status board: ${e.message}`); }
  return buildView({ progress: data, errors, ledger: readLedger(), live, now, statusLinks });
}

// ---- text --------------------------------------------------------------------------------------------

const hhmm = (iso) => (iso ? `${iso.slice(11, 16)}Z` : '?');
const agoText = (min) => (min === null ? '' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60} min ago`);

/** One shared reader: "fix-a (w2, since 21:40Z)". */
export const readerText = (x) => `${x.owner} (w${x.weight}, since ${hhmm(x.since)})`;
/**
 * A shared group, the readers first (user T-008), then the weight in use against the cap ('?' if unknown):
 * "a (w2, since 21:40Z), b (w1, since 21:41Z) (shared lane 3/3); joins closed (c waits for Chrome alone)".
 */
export function sharedText(l) {
  const s = l.shared;
  const off = l.lane && !l.lane.on ? '; switch off: no new reader joins' : '';
  return `${s.readers.map(readerText).join(', ') || 'no live reader'} (shared lane ${s.used}/${s.cap ?? '?'}${off})${s.joinsClosed ? `; joins closed (${s.closedBy} waits for Chrome alone)` : ''}`;
}

function holderText(l, what) {
  if (!l) return `${what}: unknown`;
  // with the lane's switch off and no group it reads as before the lane
  const lane = l.lane?.on ? `; shared lane on, cap ${l.lane.cap}` : '';
  const h = l.shared ? sharedText(l) : `${l.holder ? `${l.holder.owner} (since ${hhmm(l.holder.since)})` : l.handover ? `free, ${l.handover.text}` : 'free'}${lane}`;
  return `${what}: ${h}${l.queue.length ? `, ${l.queue.length} waiting (${l.queue.join(', ')})` : ''}`;
}

export function bestText(b) {
  return `${b.what}: ${b.before} -> ${b.after} (${b.tag}, ${b.driver}${b.ref ? `, ${b.ref}` : ''}${b.note ? `; ${b.note}` : ''})`;
}

/** The view as plain text (`console.mjs progress`); `details` adds the technical lines. */
export function renderText(v, { details = false } = {}) {
  const L = [];
  const s = v.summary;
  L.push(`FIX PROGRESS  (summary ${s.updatedAt ? `${hhmm(s.updatedAt)} ${s.updatedAt.slice(0, 10)} by ${s.updatedBy}, ${agoText(s.ageMin)}` : 'missing'}; live ${hhmm(v.now)})`);
  for (const e of s.errors) L.push(`  ! ${e}`);
  if (s.stale) L.push(`  ! the summary is older than ${STALE_HOURS} h: ask mgmt-ops to update fixes/PROGRESS.json`);
  if (s.newResults) L.push(`  ! ${s.newResults} new result(s) in the predictions ledger are not in the summary yet (marked NEW below)`);
  if (v.goal) L.push(`Goal: ${v.goal}`);
  if (v.complaints.length) L.push(`You flagged: ${v.complaints.map((c) => c.text).join('; ')}`);
  if (v.changes.length) { L.push('', 'WHAT CHANGED'); for (const c of v.changes) L.push(`  ${hhmm(c.at)}  ${c.text}`); }
  L.push('', 'NOW');
  L.push(`  ${holderText(v.live.phone, 'phone')}`);
  L.push(`  ${holderText(v.live.chrome, 'Chrome')}`);
  if (v.live.incidents) {
    const b = v.live.incidents.blocking;
    L.push(`  ${v.live.incidents.open} open tool problem(s)${b.length ? `, ${b.length} blocking: ${b.map((i) => `${i.id} ${i.title}`).join('; ')}` : ', none blocking'}`);
  }
  for (const e of v.live.errors) L.push(`  ! ${e}`);
  for (const sec of v.sections) {
    if (!sec.items.length) continue;
    L.push('', sec.label.toUpperCase());
    for (const it of sec.items) {
      const stage = it.state === 'dropped' ? `stopped at stage ${it.stage.code}` : `stage ${it.stage.code}: ${it.stage.plain}`;
      L.push(`  [${it.areaLabel}] ${it.title}  (${stage}${it.owner ? `; ${it.owner}` : ''})`);
      if (it.status) L.push(`    now: ${it.status.state} (${it.status.plain})${it.status.waits.length ? `; ${it.status.waits.join('; ')}` : ''}${it.status.stale ? '; not updated for a while' : ''} [status board: ${it.status.id}]`);
      if (it.fixes) L.push(`    what it fixes: ${it.fixes}`);
      for (const b of it.best) L.push(`    best: ${bestText(b)}`);
      if (it.felt) L.push(`    felt: ${FELT_PLAIN[it.felt.answer] || it.felt.answer}${it.felt.text ? ` (${it.felt.text})` : ''}`);
      if (it.why) L.push(`    why: ${it.why}`);
      if (it.gate) L.push(`    gate: ${it.gate}`);
      for (const c of it.checks) L.push(`    check ${c.id} ${c.what}: ${c.result || (c.newResult ? `NEW in the ledger: ${sanitize(c.ledger, 120)} (summary not updated yet)` : c.ledger)}`);
      if (it.next) L.push(`    next: ${it.next}`);
      if (details) for (const d of it.details) L.push(`      · ${d}`);
    }
  }
  L.push('', 'COMING UP FOR YOU');
  if (v.waiting) L.push(v.waiting.length ? `  waiting on the console now: ${v.waiting.map((w) => `${w.id} ${w.title}`).join('; ')}` : '  nothing waiting on the console now');
  for (const u of v.upcoming) L.push(`  later: ${u.title} (${u.when})`);
  if (!details && v.live.incidents?.list.length) {
    L.push('', `(details: node tools/console.mjs progress --details; open problems: ${v.live.incidents.list.map((i) => i.id).join(', ')})`);
  } else if (details && v.live.incidents?.list.length) {
    L.push('', 'OPEN TOOL PROBLEMS');
    for (const i of v.live.incidents.list) L.push(`  ${i.id}${i.blocking ? ' (blocking)' : ''} ${i.title}`);
  }
  return L.join('\n');
}

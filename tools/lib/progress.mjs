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
//     "details": ["<technical line>", …],
//     "inBuild": true|false,                     // optional (I-061): in today's best build; must agree with build.fixes
//     "whyNot": "<not applied: why, one plain line>",                        // optional (I-061): tried, not applied
//     "writeup": "fixes/<topic>/README.md"       // optional (I-061): its write-up (fixes/ or research/, a .md file)
//   }],
//   "upcoming": [{ "title": "<a step that will come to the user console>", "when": "<plain>", "item": "<item id>" }],
//   "build": {                                   // optional (I-061, user T-021): today's best build, the /build page
//     "name": "<plain name>", "since": "<ISO: when it became the best build>",
//     "summary": "<how it improves things, one plain sentence>",            // optional
//     "fixes": ["<item id>", …],                 // the fixes applied in it; each item's first best[] entry is its gain
//     "combined": [{ "what": "<metric, plain>", "before": "<the original page>", "after": "<this build>",
//                    "tag": "OBSERVED|…", "driver": "<scripted|robot finger|finger|…>", "when": "<ISO: measured>",
//                    "how": "<runs, block, phone, plain>", "ref": "P-062", "note": "<e.g. threshold-sensitive>" }]
//   }
// }
// The /build page (I-061): in the build (each fix, its own phone gain and tag), the whole build vs the original (with
// when and how it was measured), and "tried, not applied": every dropped item and every item with a whyNot, with
// its reason and a link to its write-up (served read-only by the console at /writeup/<path>).
import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
const REF = /^(P-\d{3}[a-z]?|F-\d{3}|C-\d{3}|I-\d{3})$/;
/** A write-up the console may serve (I-061): a .md file under fixes/ or research/, no '..', no hidden parts. */
export const WRITEUP = /^(fixes|research)(\/(?!\.)[A-Za-z0-9_][A-Za-z0-9._-]{0,80}){1,4}\.md$/;

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
  // I-061: today's best build, and per item inBuild / whyNot / writeup
  const inBuild = new Set();
  if (p.build !== undefined) {
    const b = p.build;
    if (!b || typeof b !== 'object' || Array.isArray(b)) E.push('build: must be an object');
    else {
      str(b.name, 'build.name', { max: 80 });
      if (!isIso(b.since)) E.push('build.since: must be an ISO UTC time (when it became the best build)');
      str(b.summary, 'build.summary', { optional: true });
      arr(b.fixes, 'build.fixes', { max: 30 }).forEach((id, i) => {
        if (!ids.has(id)) E.push(`build.fixes[${i}]: no item "${id}"`);
        else if (inBuild.has(id)) E.push(`build.fixes[${i}]: "${id}" twice`);
        inBuild.add(id);
      });
      arr(b.combined, 'build.combined', { optional: true, max: 8 }).forEach((c, j) => {
        const ct = `build.combined[${j}]`;
        str(c?.what, `${ct}.what`, { max: 120 }); str(c?.before, `${ct}.before`, { max: 80 }); str(c?.after, `${ct}.after`, { max: 80 });
        oneOf(c?.tag, TAGS, `${ct}.tag`);
        str(c?.driver, `${ct}.driver`, { max: 60 });
        if (!isIso(c?.when)) E.push(`${ct}.when: must be an ISO UTC time (when it was measured)`);
        str(c?.how, `${ct}.how`, { optional: true, max: 160 });
        if (c?.ref !== undefined && !REF.test(String(c.ref))) E.push(`${ct}.ref: a ledger, finding, console or incident id (P-029, F-084, C-001, I-038)`);
        str(c?.note, `${ct}.note`, { optional: true, max: 160 });
      });
    }
  }
  (Array.isArray(p.items) ? p.items : []).forEach((it, i) => {
    if (!it || typeof it !== 'object') return;
    const at = `items[${i}]`;
    if (it.inBuild !== undefined && typeof it.inBuild !== 'boolean') E.push(`${at}.inBuild: true or false`);
    else if (it.inBuild === true && p.build === undefined) E.push(`${at}.inBuild: true, but there is no top-level build`);
    else if (it.inBuild !== undefined && p.build !== undefined && it.inBuild !== inBuild.has(it.id)) E.push(`${at}.inBuild: ${it.inBuild}, but build.fixes ${inBuild.has(it.id) ? 'lists' : 'does not list'} "${it.id}"`);
    if (inBuild.has(it.id) && it.state === 'dropped') E.push(`${at}: a dropped item can't be in build.fixes`);
    if (inBuild.has(it.id) && it.whyNot !== undefined) E.push(`${at}.whyNot: "${it.id}" is in the build`);
    str(it.whyNot, `${at}.whyNot`, { optional: true, max: 200 });
    if (it.writeup !== undefined && !WRITEUP.test(String(it.writeup))) E.push(`${at}.writeup: a .md file under fixes/ or research/ (like fixes/<topic>/README.md)`);
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
 * ratio · lesson. A column separator is a pipe with whitespace, a row end or another pipe on both sides, so an empty
 * cell stays empty (I-116: a split on " | " read "| |" as "|") and `|V - S0|` or `\|` stay cell text (P-056a, P-069).
 * A row with more cells than the header has a stray " | " in a free-text cell (P-024, P-038, P-090): it is read from
 * its end (in? is the third cell from the end), so only a stray separator in the lesson can still shift it.
 */
export function parseLedger(text) {
  const rows = new Map();
  let ncols = 11, inAt = 8;
  for (const line of String(text || '').split('\n')) {
    const cells = ledgerCells(line);
    if (!cells?.length) continue;
    if (/^id$/i.test(cells[0]) && cells.some((c) => /^in\?$/i.test(c))) { ncols = cells.length; inAt = cells.findIndex((c) => /^in\?$/i.test(c)); continue; }
    const m = cells[0].match(/^(P-\d{3}[a-z]?)$/);
    if (!m) continue;
    const at = cells.length > ncols ? cells.length - (ncols - inAt) : inAt;
    rows.set(m[1], { id: m[1], result: (cells[at] ?? '').replace(/\*\*/g, '').trim() });
  }
  return rows;
}

/** The trimmed cells of a markdown table row (outer pipes dropped; a pipe touching text is text), or null. */
function ledgerCells(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const parts = t.split(/(?<=^|\s|\|)\|(?=\s|$|\|)/);
  if (parts[parts.length - 1].trim() === '') parts.pop();
  return parts.slice(1).map((c) => c.trim());
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

// ---- what each device is used for, and who does what (I-060, user T-020) ----------------------------------------

const pidRuns = (pid) => { if (!(pid > 0)) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const isoMs = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const durText = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

/** {min, text} for the time left until `endMs`: "about 20 min left" (an estimate) / "at most 5 min left" (a cap). */
export function leftView(endMs, now, { cap = false } = {}) {
  if (endMs === null || endMs === undefined) return null;
  const min = Math.round((endMs - now) / 60000);
  if (min < 0) return { min, text: cap ? 'past its planned end' : `${durText(-min)} past its estimate` };
  if (min < 1) return { min: 0, text: cap ? 'ends within a minute' : 'about to finish' };
  return { min, text: `${cap ? 'at most' : 'about'} ${durText(min)} left` };
}

/** The board rows of `owner` that are still open (not finished, not parked), the one using `resource` first. */
function ownerRows(owner, board, resource) {
  const rows = (board || []).filter((r) => (r.owner === owner || (r.aliases || []).includes(owner)) && !['finished', 'parked'].includes(r.group));
  const rank = (r) => [r.derived?.some((d) => d.kind === 'using' && d.resource === resource) ? 0 : 1, r.stale ? 1 : 0, ['working', 'waiting', 'queued'].indexOf(r.group)];
  return rows.map((r, i) => ({ r, i, k: rank(r) })).sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i).map((x) => x.r);
}

const rowText = (r) => `${sanitize(r.title, 90)}${r.note ? `: ${sanitize(r.note, 200)}` : ''}`;

/** One job on a device: the holder's (or a shared reader's) own description, else its board row; never a bare name. */
function jobView({ owner, meta, since, end }, { board, resource, now, alive }) {
  const by = sanitize(owner, 60);
  const j = meta && meta.job && typeof meta.job.text === 'string' ? meta.job : null;
  const rows = ownerRows(owner, board, resource);
  const cur = rows[0] || null;
  const what = j ? sanitize(j.text, 160) : cur ? rowText(cur) : null;
  const left = j?.etaAt ? leftView(isoMs(j.etaAt), now) : end ? leftView(end, now, { cap: true }) : null;
  const forWhom = j?.for ? sanitize(j.for, 60) : null;
  const start = j?.at && isoMs(j.at) !== null && (since === null || isoMs(j.at) >= isoMs(since)) ? j.at : since;
  const run = meta?.run && typeof meta.run.text === 'string' && alive(Number(meta.run.pid)) ? { text: sanitize(meta.run.text, 160), since: meta.run.since || null } : null;
  const next = [...(cur?.next ? [sanitize(cur.next, 200)] : []), ...rows.slice(1).map((x) => sanitize(x.title, 90))].slice(0, 4);
  return {
    by, what, forWhom, source: j ? 'described' : cur ? 'status board' : 'none', since: start || null, left, run, next,
    line: what ? `${what}${left ? `, ${left.text}` : ''}` : `${by} has not said what it runs (no job description, no status-board row)`,
    byLine: `Run by ${by}${forWhom ? ` for ${forWhom}` : ''}, since ${hhmm(start)}.`,
  };
}

/**
 * I-060: what a device (iphone / chrome-measure) is used for, from lock.status() and the status board's item views
 * ({free, jobs, waiting}): one job for an exclusive holder, one per live reader of a shared group. A job: the holder's
 * own words (meta.job from `lock.mjs --doing` / `lock.mjs doing`), else its open board row (title: note), else a
 * sentence saying it gave none; for whom; since; the time left (its estimate, or the planned end of a bounded hold:
 * a `run --max-seconds`, a short job, a shared reader; never a renewable lease's TTL); the phone run going on now
 * (meta.run, while its process runs); the holder's other open jobs as next. Never the meta's URL, checkout, token or pid.
 */
export function deviceView(st, { resource, board = [], now = Date.now(), alive = pidRuns } = {}) {
  if (!st) return null;
  const held = st.holder && !st.stale ? st.holder : null;
  const ctx = { board, resource, now, alive };
  const waiting = (st.queue || []).map((w) => sanitize(w.owner, 60));
  if (!held) return { free: true, jobs: [], waiting };
  const group = held.shared === true && held.format === 'rw1' && Array.isArray(held.readers);
  const jobs = group
    ? held.readers.map((x) => jobView({ owner: x.owner, meta: x.meta, since: x.acquiredAt || null, end: isoMs(x.deadline) }, ctx))
    : [jobView({
      owner: held.owner, meta: held.meta, since: held.acquiredAt || null,
      // a planned end only for a bounded hold: a `run` that declared its length, a short job; a lease's TTL is renewed
      end: held.meta?.expectSec && isoMs(held.acquiredAt) !== null ? isoMs(held.acquiredAt) + held.meta.expectSec * 1000 : held.short ? isoMs(held.expiresAt) : null,
    }, ctx)];
  return { free: false, jobs, waiting };
}

/**
 * I-060: who is doing what, from the status board's item views: one line per agent with a working or waiting row
 * that is up to date ({owner, id, doing, state, using, waits, also}; its main row first: working before waiting, in
 * board order), and the rest folded ({owner, id, title, why: parked | not started | not updated for …}).
 */
// I-108 (3): a row folded because what it reports looks over (not only its age) says why
const overWhy = (v) => { const w = (v.staleWhy || []).filter((x) => !/^not updated for /.test(x)); return w.length ? `may be out of date: ${sanitize(w.join('; '), 200)}` : ''; };

export function agentsView(items = []) {
  const open = items.filter((v) => v.group !== 'finished');
  const shown = open.filter((v) => (v.group === 'working' || v.group === 'waiting') && !v.stale);
  const order = [...shown.filter((v) => v.group === 'working'), ...shown.filter((v) => v.group === 'waiting')];
  const byOwner = new Map();
  for (const v of order) { if (!byOwner.has(v.owner)) byOwner.set(v.owner, []); byOwner.get(v.owner).push(v); }
  const waitsOf = (v) => [...(v.waiting ? [sanitize(v.waiting.plain, 200)] : []), ...(v.derived || []).filter((d) => d.kind !== 'using' && d.kind !== 'listen').map((d) => sanitize(d.plain, 200))]; // I-108: a listener is no wait
  const agents = [...byOwner.entries()].map(([owner, [m, ...rest]]) => ({
    owner: sanitize(owner, 60), id: m.id, doing: rowText(m), state: m.statePlain,
    using: (m.derived || []).filter((d) => d.kind === 'using').map((d) => sanitize(d.plain, 80)),
    waits: waitsOf(m),
    also: rest.map((v) => { const w = waitsOf(v); return `${sanitize(v.title, 90)}${w.length ? ` (waiting on ${w.join('; ')})` : ''}`; }),
  }));
  const folded = open.filter((v) => !shown.includes(v)).map((v) => ({
    owner: sanitize(v.owner, 60), id: v.id, title: sanitize(v.title, 90),
    why: v.group === 'parked' ? 'parked' : v.group === 'queued' ? 'not started' : overWhy(v) || `not updated for ${durText(v.ageMin ?? 0)}`,
  }));
  return { agents, folded };
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
  // I-108: an open proposal (proposed, not held) waits on the user's decision, like a pending step
  try { live.proposals = (await import('./proposal.mjs')).listProposals({ waiting: true }); } catch (e) { live.errors.push(`proposals: ${e.message}`); }
  // I-108 (3): what a row's wait or branch points at, to mark rows whose news is over ("may be out of date")
  try { live.refs = await refsLive(); } catch (e) { live.errors.push(`refs: ${e.message}`); }
  try { live.git = gitLive(); } catch (e) { live.errors.push(`git: ${e.message}`); }
  return live;
}

/**
 * I-108 (3): {steps: {C-id: status}, proposals: {PR-id: state}, threads: {T-id: {status, state, lastBy, lastAt}}}, every
 * step, proposal and thread (ids and states only, no text).
 */
export async function refsLive() {
  const steps = {}, proposals = {}, threads = {};
  for (const s of (await import('./console.mjs')).list({ all: true })) steps[s.id] = s.status;
  for (const p of (await import('./proposal.mjs')).listProposals({ all: true })) proposals[p.id] = p.state;
  const T = await import('./console-threads.mjs');
  for (const t of T.listThreads()) {
    const m = t.messages?.[t.messages.length - 1];
    threads[t.id] = { status: t.status, state: T.threadState(t), lastBy: m?.by ?? null, lastAt: m?.at ?? null };
  }
  return { steps, proposals, threads };
}

const MAIN_SHAS = 3000;
/**
 * I-108 (3): main as the board checks branches against it: {merged: branch names merged into main, mainShas: the last
 * 3000 commits on main}. Read-only; throws when the repository or main is not there (gatherLive reports it).
 */
const gitCache = new Map(); // cwd -> {at, value}: the pages poll; main moves at landings only
export function gitLive(cwd = REPO, { now = Date.now(), maxAgeMs = 20000 } = {}) {
  const c = gitCache.get(cwd);
  if (c && now - c.at < maxAgeMs) return c.value;
  const value = gitRead(cwd);
  gitCache.set(cwd, { at: now, value });
  return value;
}
function gitRead(cwd) {
  const run = (...a) => {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) throw new Error(`${a[0]} failed`);
    return r.stdout.split('\n').map((x) => x.trim()).filter(Boolean);
  };
  const mainShas = run('rev-list', '-n', String(MAIN_SHAS), 'main');
  const merged = run('branch', '--merged', 'main', '--format=%(refname:short)');
  return { mainShas, merged };
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

// ---- today's best build (I-061, user T-021) ---------------------------------------------------------------------

/** The root write-ups are served from: this checkout ($FW_WRITEUP_ROOT in tests). */
export const writeupRoot = () => process.env.FW_WRITEUP_ROOT || REPO;
/** Whether a write-up path is allowed (WRITEUP) and is a file inside the root (no symlink out of it). */
export function writeupExists(rel, root = writeupRoot()) {
  if (!WRITEUP.test(String(rel))) return false;
  try {
    const real = realpathSync(join(root, rel)), base = realpathSync(root);
    return real.startsWith(base + '/') && statSync(real).isFile();
  } catch { return false; }
}
const WRITEUP_MAX = 512 * 1024;
/** A write-up's text for the console's /writeup/<path> (read-only, scrubbed of personal data), or null. */
export function readWriteup(rel, root = writeupRoot()) {
  if (!writeupExists(rel, root)) return null;
  const real = realpathSync(join(root, rel));
  if (statSync(real).size > WRITEUP_MAX) return `(${rel} is larger than ${WRITEUP_MAX / 1024} KB; read it in the repository)`;
  return sanitize(readFileSync(real, 'utf8'), WRITEUP_MAX);
}

/**
 * The /build model: {name, since, summary, applied: [{id, title, fixes, gain, more, felt, writeup}], combined: [...],
 * tried: [{id, title, state, why, writeup}], open: [{id, title, state}]} or null without a curated build.
 * gain: the item's first best[] entry (its headline phone number), null if it has none yet. writeup: {path, url} when
 * the file exists here (an item's `writeup`, else fixes/<id>/README.md).
 */
export function bestBuildView(p, { exists = writeupExists } = {}) {
  const b = p?.build;
  if (!b || typeof b !== 'object' || !Array.isArray(b.fixes)) return null;
  const items = Array.isArray(p.items) ? p.items.filter((it) => it && typeof it === 'object') : [];
  const byId = new Map(items.map((it) => [it.id, it]));
  const link = (it) => {
    for (const w of [it.writeup, `fixes/${it.id}/README.md`]) if (w && exists(w)) return { path: w, url: `/writeup/${w}` };
    return null;
  };
  const inIt = new Set(b.fixes);
  const applied = b.fixes.filter((id) => byId.has(id)).map((id) => {
    const it = byId.get(id), best = Array.isArray(it.best) ? it.best : [];
    return {
      id, title: it.title, fixes: it.fixes || null, gain: best[0] || null, more: best.slice(1),
      felt: it.felt ? { ...it.felt, plain: FELT_PLAIN[it.felt.answer] || it.felt.answer } : null, writeup: link(it),
    };
  });
  const rest = items.filter((it) => !inIt.has(it.id) && it.state !== 'base' && it.state !== 'landed');
  const tried = rest.filter((it) => it.state === 'dropped' || it.whyNot).map((it) => ({
    id: it.id, title: it.title, state: it.state, why: it.whyNot || it.why || null, writeup: link(it),
  }));
  const open = rest.filter((it) => !(it.state === 'dropped' || it.whyNot)).map((it) => ({ id: it.id, title: it.title, state: it.state }));
  return {
    name: b.name, since: b.since, summary: b.summary || null, applied,
    combined: (Array.isArray(b.combined) ? b.combined : []).map((c) => ({ ...c })), tried, open,
  };
}

/**
 * The page / CLI model from the curated data and the live sources. Pure: every input passed in.
 * {now, summary, goal, complaints, changes, live, sections: [{key, label, items}], upcoming, waiting}
 */
export function buildView({ progress, errors = [], ledger = new Map(), live = {}, now = Date.now(), statusLinks = new Map(), board = null, writeups = writeupExists } = {}) {
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
    build: bestBuildView(p, { exists: writeups }), // I-061: today's best build (null without one)
    complaints: (p?.complaints || []).map((c) => ({ ...c, areaLabel: AREAS[c.area] })),
    changes: [...(p?.changes || [])].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, CHANGES_SHOWN),
    live: {
      phone: live.locks ? lockView(live.locks.iphone, now) : null,
      chrome: live.locks ? lockView(live.locks['chrome-measure'], now) : null,
      // I-060: what each device is used for (the job, for whom, since, time left, the run now, next)
      devices: live.locks ? {
        phone: deviceView(live.locks.iphone, { resource: 'phone', board: board || [], now }),
        chrome: deviceView(live.locks['chrome-measure'], { resource: 'chrome', board: board || [], now }),
      } : null,
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
    agents: board ? agentsView(board) : null, // I-060: one line per working agent; parked or stale rows folded
    // console steps waiting for the user now: id and title only (a step's URL or instructions may name the LAN host)
    waiting: live.steps ? live.steps.map((s) => ({ id: s.id, title: sanitize(s.title, 160), status: s.status })) : null,
  };
}

/** Everything from the real sources, for the server and the CLI. */
export async function currentView({ now = Date.now() } = {}) {
  const { data, errors } = readProgress();
  const live = await gatherLive();
  let statusLinks = new Map(), board = null;
  try {
    const S = await import('./status.mjs');
    const sv = S.buildStatusView({ items: S.list(), live, now, progress: data?.items || null }); // I-104: rows found by id, alias, P-id too
    statusLinks = S.progressLinks(sv);
    board = sv.items;
  } catch (e) { live.errors.push(`status board: ${e.message}`); }
  return buildView({ progress: data, errors, ledger: readLedger(), live, now, statusLinks, board });
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

/** I-060: a device's jobs under its holder line: "    doing: <job>. Run by <who> for <whom>, since <t>." + run now + next. */
function deviceLines(d) {
  if (!d) return [];
  const L = [];
  for (const j of d.jobs) {
    L.push(`    doing: ${j.line}. ${j.byLine}`);
    if (j.run) L.push(`    right now: ${j.run.text} (since ${hhmm(j.run.since)})`);
    for (const n of j.next) L.push(`    next: ${n}`);
  }
  return L;
}

export function bestText(b) {
  return `${b.what}: ${b.before} -> ${b.after} (${b.tag}, ${b.driver}${b.ref ? `, ${b.ref}` : ''}${b.note ? `; ${b.note}` : ''})`;
}

/** A whole-build number: "what: before -> after (tag, driver; measured 08:40Z 2026-10-02, how; ref; note)". */
export function combinedText(c) {
  return `${c.what}: ${c.before} -> ${c.after} (${c.tag}, ${c.driver}; measured ${hhmm(c.when)} ${String(c.when || '').slice(0, 10)}${c.how ? `, ${c.how}` : ''}${c.ref ? `; ${c.ref}` : ''}${c.note ? `; ${c.note}` : ''})`;
}

/** The best build as text lines (I-061; also the top of `console.mjs progress`). */
export function buildLines(b) {
  const L = [`TODAY'S BEST BUILD: ${b.name} (the best build since ${hhmm(b.since)} ${String(b.since).slice(0, 10)})`];
  if (b.summary) L.push(`  ${b.summary}`);
  L.push('  In it:');
  for (const a of b.applied) L.push(`    - ${a.title}: ${a.gain ? bestText(a.gain) : 'no measured phone gain yet'}${a.writeup ? `  [${a.writeup.path}]` : ''}`);
  if (!b.applied.length) L.push('    (no fixes listed)');
  if (b.combined.length) { L.push('  The whole build vs the original page:'); for (const c of b.combined) L.push(`    ${combinedText(c)}`); }
  if (b.tried.length) {
    L.push('  Tried, not applied:');
    for (const t of b.tried) L.push(`    - ${t.title}: ${t.why || 'no reason written yet'}${t.writeup ? `  [${t.writeup.path}]` : ''}`);
  }
  if (b.open.length) L.push(`  Still being worked on: ${b.open.map((o) => o.title).join('; ')}`);
  return L;
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
  if (v.build) L.push('', ...buildLines(v.build));
  L.push('', 'NOW');
  L.push(`  ${holderText(v.live.phone, 'phone')}`, ...deviceLines(v.live.devices?.phone));
  L.push(`  ${holderText(v.live.chrome, 'Chrome')}`, ...deviceLines(v.live.devices?.chrome));
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
      if (it.status) L.push(`    now: ${it.status.state} (${it.status.plain})${it.status.waits.length ? `; ${it.status.waits.join('; ')}` : ''}${it.status.stale ? '; may be out of date' : ''} [status board: ${it.status.id}]`);
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
  if (v.agents && (v.agents.agents.length || v.agents.folded.length)) {
    L.push('', 'WHO IS DOING WHAT');
    for (const a of v.agents.agents) {
      L.push(`  ${a.owner}: ${a.doing} (${[a.state, ...a.using].join('; ')})${a.waits.length ? `; waiting on: ${a.waits.join('; ')}` : ''}`);
      for (const x of a.also) L.push(`    also: ${x}`);
    }
    if (v.agents.folded.length) L.push(`  (${v.agents.folded.length} more paused, not started or not updated: ${v.agents.folded.map((f) => `${f.owner} ${f.title} (${f.why})`).join('; ')})`);
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

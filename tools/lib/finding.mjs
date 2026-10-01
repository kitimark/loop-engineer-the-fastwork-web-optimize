// Shared findings board (incident I-013): techniques that won, pitfalls, code couplings, measurement
// surprises and open questions that one agent found and others should know about now, not after the
// lead folds them into the committed playbook fixes/FINDINGS.md.
//
// State lives next to the locks and incidents in the shared git dir, so every worktree sees a post the
// moment it is written, without a commit:
//   <git-common-dir>/fastwork-mirror/findings/F-001.json     one JSON file per finding
// Every read-modify-write runs inside the lock library's mkdir guard ("finding-store"): concurrent posts
// get unique ids, and two agents posting the same idea at once end up with one finding (SIMILAR).
//
// Dedup: a post whose title is similar to an existing finding's (same content words in any order, or
// one title's words all inside the other's) is not posted unless forced; the poster acks the existing
// one instead. A finding records who posted it and from which branch/commit, never paths or host names.
//
// Platform-claim status (research/architecture/claims-audit.md §4), separate from the lifecycle `status`:
// `claim` ∈ CLAIMS says how well a finding's platform statement is supported, `refs` lists the references
// (URL + line/commit/milestone, or the raw-data path of the decisive check). A record without `claim` is
// "unknown", never "observed". Kind `limitation` ("X never/always happens in browser Y") defaults to observed.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sharedStateDir, REPO } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { writeJson, readJson, readAll, nextId, idParser, idNumber, iso, clip } from './store.mjs';

export const KINDS = ['technique', 'pitfall', 'coupling', 'measurement', 'question', 'limitation'];
export const STATUSES = ['open', 'folded', 'duplicate', 'rejected'];
export const CLAIMS = ['observed', 'confirmed', 'refuted', 'unresolved'];
const NEEDS_REF = ['confirmed', 'refuted'];
const GUARD = 'finding-store';
const LEAD = 'lead';

export const findingDir = () => join(sharedStateDir(), 'findings');
const fileOf = (id) => join(findingDir(), `${id}.json`);

/** "3", "f-3", "F-003" -> "F-003". Throws on anything else. */
export const parseId = idParser('F', 'finding');

function gitOut(args, cwd = REPO) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
  return r.status === 0 ? (r.stdout || '').trim() : undefined;
}

function checkKind(kind) {
  if (kind !== undefined && !KINDS.includes(kind)) throw new Error(`bad kind "${kind}" (one of: ${KINDS.join(', ')})`);
}

function checkClaim(claim, flagName = '--claim') {
  if (claim !== undefined && !CLAIMS.includes(claim)) throw new Error(`bad ${flagName} "${claim}" (one of: ${CLAIMS.join(', ')})`);
}

/** Refs: a string or an array; trimmed, empty ones dropped, duplicates dropped, each clipped to 500 chars. */
function normRefs(refs) {
  const list = (Array.isArray(refs) ? refs : refs === undefined ? [] : [refs]).map((r) => String(r ?? '').trim()).filter(Boolean);
  return [...new Set(list.map((r) => r.slice(0, 500)))];
}

function checkRefs(claim, refs) {
  if (NEEDS_REF.includes(claim) && !refs.length) throw new Error('a confirmed/refuted claim needs --ref "<url + line/commit/milestone>"');
}

/** "OBSERVED" / "CONFIRMED" / "REFUTED" / "UNRESOLVED", or "unknown" for a record without a claim. */
export const claimLabel = (f) => (f.claim ? String(f.claim).toUpperCase() : 'unknown');
/** "[OBSERVED] " before a title when the claim is set, "" otherwise. */
export const claimTag = (f) => (f.claim ? `[${claimLabel(f)}] ` : '');
/** "CLAIM F-059 observed -> refuted by ver-layerpainted" (a missing old claim reads "unknown"). */
export const claimChangeLine = (id, c) => `CLAIM ${id} ${c.from ?? 'unknown'} -> ${c.to} by ${c.by}`;

/** "a, b,a" -> ['a', 'b']; topic names are fixes/<topic> names or "all". */
export function parseTopics(s) {
  const t = [...new Set(String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean))];
  for (const x of t) if (!/^[a-z0-9][a-z0-9._-]{0,60}$/i.test(x)) throw new Error(`bad topic "${x}" (a fixes/<topic> name or "all")`);
  return t;
}

// ---- title similarity ---------------------------------------------------------------------------------
const STOP = new Set('a an and are as at be by does for from has have in is it its me my no not of on or our per so than that the their then this to was we were when with you your'.split(' '));

/** Content words of a title: lower case, punctuation dropped, stop words dropped, plural -s stripped. */
export function titleWords(title) {
  const out = new Set();
  for (let w of String(title ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

/** Same idea? Jaccard >= 0.6 on content words, or all words of a 3+-word title inside the other. */
export function titleSimilar(a, b) {
  const A = titleWords(a), B = titleWords(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  const jaccard = both / (A.size + B.size - both);
  const small = Math.min(A.size, B.size);
  return jaccard >= 0.6 || (small >= 3 && both / small >= 0.8);
}

// ---- reading -----------------------------------------------------------------------------------------
export function get(id) {
  const f = readJson(fileOf(parseId(id)));
  if (!f) throw new Error(`no finding ${parseId(id)} (node tools/finding.mjs list)`);
  return f;
}

/** `--since`: a finding id (F-007: strictly after it) or a time (ISO; posted strictly after it). */
function sinceFilter(since) {
  if (since === undefined || since === '') return () => true;
  if (/^(?:f-?)?\d+$/i.test(String(since).trim())) { const n = idNumber(parseId(since)); return (f) => idNumber(f.id) > n; }
  const t = Date.parse(since);
  if (Number.isNaN(t)) throw new Error(`bad --since "${since}" (a finding id like F-007 or an ISO time)`);
  return (f) => Date.parse(f.postedAt) > t;
}

const topicMatch = (topics) => (f) => !topics.length || f.topics.includes('all') || f.topics.some((t) => topics.includes(t));
export const isUnread = (f, agent) => f.by !== agent && !f.acks.some((a) => a.by === agent);

/**
 * Findings, oldest first (newest last). Filters: kind, topic ("a,b": any of them; a finding for "all"
 * matches every topic), since (id or time), unreadAs (not posted and not acked by that agent), open,
 * claim (one of CLAIMS; a record without a claim never matches: unknown is not observed).
 */
export function list({ kind, topic, since, unreadAs, open = false, claim } = {}) {
  checkKind(kind);
  checkClaim(claim);
  const topics = parseTopics(topic);
  const after = sinceFilter(since);
  return readAll(findingDir(), 'F').filter((f) => (!kind || f.kind === kind) && topicMatch(topics)(f) && after(f)
    && (!unreadAs || isUnread(f, unreadAs)) && (!open || f.status === 'open') && (!claim || f.claim === claim));
}

// ---- writing -----------------------------------------------------------------------------------------
/**
 * Post a finding. Returns {action: 'posted'|'similar', finding}. 'similar' = an existing finding with a
 * similar title (nothing written); `force` posts anyway. A posted limitation without a claim gets
 * claim 'observed' and the result carries `defaulted: true` (the CLI prints a NOTE).
 * report: {by, kind, topics ("a,b" or array), title, where, evidence, body, claim, refs, force}
 */
export async function post(report, { cwd = REPO } = {}) {
  const { by, kind, title } = report;
  if (!by) throw new Error('--by <your agent name> is required (e.g. fix-countdown-idle-raf)');
  if (!kind) throw new Error(`--kind is required (one of: ${KINDS.join(', ')})`);
  checkKind(kind);
  if (!title || !String(title).trim()) throw new Error('--title "<one line: the finding>" is required');
  const topics = parseTopics(Array.isArray(report.topics) ? report.topics.join(',') : report.topics);
  if (!topics.length) throw new Error('--topics a,b is required (the fixes/<topic> names it concerns, or "all")');
  checkClaim(report.claim);
  const refs = normRefs(report.refs);
  checkRefs(report.claim, refs);
  const defaulted = report.claim === undefined && kind === 'limitation';
  const claim = defaulted ? 'observed' : report.claim;
  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const head = gitOut(['rev-parse', '--short', 'HEAD'], cwd);
  return withGuard(GUARD, () => {
    mkdirSync(findingDir(), { recursive: true });
    const all = readAll(findingDir(), 'F');
    if (!report.force) {
      const same = all.find((f) => titleSimilar(f.title, title));
      if (same) return { action: 'similar', finding: same };
    }
    const now = iso();
    const f = {
      id: nextId(all, 'F'),
      kind,
      topics,
      title: String(title).trim().slice(0, 200),
      where: clip(report.where, 500),
      evidence: clip(report.evidence, 2000),
      body: clip(report.body, 4000),
      by,
      postedAt: now,
      branch,
      head,
      status: 'open',
      ...(claim !== undefined ? { claim } : {}),
      ...(claim !== undefined || refs.length ? { refs } : {}),
      acks: [],
      history: [{ at: now, by, action: 'posted' }],
    };
    writeJson(fileOf(f.id), f);
    return defaulted ? { action: 'posted', finding: f, defaulted } : { action: 'posted', finding: f };
  });
}

/**
 * Set or update a finding's platform-claim status (any agent: verifiers post to the board). Appends `refs`
 * (no duplicates) and a history entry {action: 'claim', changes: {claim: {from, to}}, refs, note}; `from` is
 * null for a record that had no claim. confirmed/refuted need at least one ref in this call.
 */
export async function claim(id, { by, status, refs, note } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  if (!status) throw new Error(`--status is required (one of: ${CLAIMS.join(', ')})`);
  checkClaim(status, '--status');
  const add = normRefs(refs);
  checkRefs(status, add);
  const fid = parseId(id);
  return withGuard(GUARD, () => {
    const f = get(fid);
    const at = iso();
    const from = f.claim ?? null;
    f.claim = status;
    f.refs = [...new Set([...(f.refs || []), ...add])];
    f.history.push({ at, by, action: 'claim', changes: { claim: { from, to: status } }, refs: add, note: clip(note, 2000) });
    writeJson(fileOf(fid), f);
    return f;
  });
}

/** Record that `by` read (and maybe used) a finding. One ack per agent; a re-ack updates it. */
export async function ack(id, { by, note } = {}) {
  if (!by) throw new Error('--by <your agent name> is required');
  const fid = parseId(id);
  return withGuard(GUARD, () => {
    const f = get(fid);
    const at = iso();
    const mine = f.acks.find((a) => a.by === by);
    if (mine) { mine.at = at; if (note !== undefined) mine.note = clip(note, 500); }
    else f.acks.push({ by, at, note: clip(note, 500) });
    f.history.push({ at, by, action: 'ack', note: clip(note, 500) });
    writeJson(fileOf(fid), f);
    return f;
  });
}

/** Parse `--folded`: T<n> | P<n> | lesson | duplicate:F-<n> | rejected. */
export function parseFolded(v) {
  const s = String(v ?? '').trim();
  let m;
  if ((m = s.match(/^([tp])(\d{1,4})$/i))) return { status: 'folded', folded: m[1].toUpperCase() + Number(m[2]) };
  if (/^lessons?$/i.test(s)) return { status: 'folded', folded: 'lesson' };
  if ((m = s.match(/^duplicate:(.+)$/i))) return { status: 'duplicate', duplicateOf: parseId(m[1]) };
  if (/^rejected$/i.test(s)) return { status: 'rejected' };
  throw new Error(`bad --folded "${v}" (T<n>, P<n>, lesson, duplicate:F-<n> or rejected)`);
}

/** The lead closes a finding: folded into FINDINGS.md as T<n>/P<n>/a lesson, a duplicate, or rejected. */
export async function resolve(id, { by, folded, note } = {}) {
  if (by !== LEAD) throw new Error('only the lead resolves findings (--by lead); everyone else acks');
  if (!folded) throw new Error('--folded T<n>|P<n>|lesson|duplicate:F-<n>|rejected is required');
  const r = parseFolded(folded);
  const fid = parseId(id);
  if (r.duplicateOf === fid) throw new Error(`${fid} can't be a duplicate of itself`);
  if (r.status === 'rejected' && !note) throw new Error('--folded rejected needs --note (why)');
  return withGuard(GUARD, () => {
    const f = get(fid);
    if (r.duplicateOf) get(r.duplicateOf);
    f.status = r.status;
    delete f.folded; delete f.duplicateOf;
    if (r.folded) f.folded = r.folded;
    if (r.duplicateOf) f.duplicateOf = r.duplicateOf;
    f.resolvedBy = by;
    f.resolvedAt = iso();
    if (note !== undefined) f.resolutionNote = clip(note, 2000);
    f.history.push({ at: f.resolvedAt, by, action: 'resolved', changes: { status: r.status, folded: r.folded, duplicateOf: r.duplicateOf }, note: clip(note, 2000) });
    writeJson(fileOf(fid), f);
    return f;
  });
}

/** One word for a finding's state: "open", "folded T10", "duplicate of F-003", "rejected". */
export function stateLabel(f) {
  if (f.status === 'folded') return `folded ${f.folded}`;
  if (f.status === 'duplicate') return `duplicate of ${f.duplicateOf}`;
  return f.status;
}

// ---- waiting -----------------------------------------------------------------------------------------
/**
 * Poll until news appears for `topic` (if given) and `kind` (if given): a finding newer than `since`
 * (default: the newest one when the wait starts) not posted by `as`, or a claim change by someone other
 * than `as` (also on `as`'s own findings) after the wait started, or after `since` when that is an ISO time.
 * Returns those findings, oldest first, or null on timeout; a finding with claim changes carries
 * `claimChanges: [{from, to, by, at, refs, note}]` (from = null: the record had no claim), plus
 * `newPost: true` when it is also newly posted.
 */
export async function waitFor({ as, topic, kind, since, timeoutSec = 3600, pollMs = 10000 } = {}) {
  if (!as) throw new Error('--as <your agent name> is required (your own posts do not wake you)');
  checkKind(kind);
  const topics = parseTopics(topic);
  const t0 = Date.now();
  const sinceIsTime = since !== undefined && since !== '' && !/^(?:f-?)?\d+$/i.test(String(since).trim());
  const base = since !== undefined ? 0 : readAll(findingDir(), 'F').reduce((m, f) => Math.max(m, idNumber(f.id)), 0);
  const isNew = since !== undefined ? sinceFilter(since) : (f) => idNumber(f.id) > base;
  const claimsAfter = sinceIsTime ? Date.parse(since) : t0;
  const claimNews = (f) => (f.history || []).filter((h) => h.action === 'claim' && h.by !== as && Date.parse(h.at) > claimsAfter)
    .map((h) => ({ from: h.changes?.claim?.from ?? null, to: h.changes?.claim?.to, by: h.by, at: h.at, refs: h.refs, note: h.note }));
  for (;;) {
    const fresh = [];
    for (const f of readAll(findingDir(), 'F')) {
      if ((kind && f.kind !== kind) || !topicMatch(topics)(f)) continue;
      const changes = claimNews(f);
      const posted = isNew(f) && f.by !== as;
      if (changes.length) fresh.push({ ...f, claimChanges: changes, ...(posted ? { newPost: true } : {}) });
      else if (posted) fresh.push(f);
    }
    if (fresh.length) return fresh;
    if (Date.now() - t0 >= timeoutSec * 1000) return null;
    await new Promise((r) => setTimeout(r, Math.max(50, Math.min(pollMs, timeoutSec * 1000 - (Date.now() - t0) + 10))));
  }
}

// ---- digest for fixes/FINDINGS.md ----------------------------------------------------------------------
const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
const bold = (t) => `**${cell(t)}${/[.?!]$/.test(String(t).trim()) ? '' : '.'}**`;
const withText = (head, text) => (text ? `${head} ${cell(text)}` : head);
const credit = (f) => `${f.id} by ${f.by}`;
const acksText = (f) => (f.acks.length ? 'acks: ' + f.acks.map((a) => (a.note ? `${a.by} (${cell(a.note)})` : a.by)).join(', ') : '');
const refsText = (f) => (f.refs?.length ? 'refs: ' + f.refs.map(cell).join(', ') : '');
const joinParts = (parts) => parts.filter(Boolean).join('; ');
const tagged = (f, text) => claimTag(f) + text;

/** Highest T<n> / P<n> number in FINDINGS.md rows and in findings already folded as T<n> / P<n>. */
function lastNumbers(findingsFile, all) {
  const max = { T: 0, P: 0 };
  let md = '';
  try { md = readFileSync(findingsFile, 'utf8'); } catch {}
  for (const m of md.matchAll(/^\|\s*([TP])(\d+)\s*\|/gm)) max[m[1]] = Math.max(max[m[1]], Number(m[2]));
  for (const f of all) { const m = /^([TP])(\d+)$/.exec(f.folded || ''); if (m) max[m[1]] = Math.max(max[m[1]], Number(m[2])); }
  return max;
}

const SECTIONS = [
  { kind: 'technique', head: 'Techniques that worked', table: '| # | technique | where it won | notes |', letter: 'T',
    row: (f) => [tagged(f, bold(f.title)) + (f.body ? ' ' + cell(f.body) : ''), f.topics.join(', ') + (f.evidence ? ': ' + cell(f.evidence) : ''), joinParts([cell(f.where), credit(f), refsText(f), acksText(f)])] },
  { kind: 'pitfall', head: 'Pitfalls', table: '| # | pitfall | source | how to avoid |', letter: 'P',
    row: (f) => [tagged(f, withText(bold(f.title), f.evidence)), joinParts([f.topics.join(', ') + (f.where ? ` (${cell(f.where)})` : ''), credit(f), refsText(f), acksText(f)]), cell(f.body)] },
  { kind: 'measurement', head: 'Measurement lessons' },
  { kind: 'coupling', head: 'Couplings (change one, check the others)' },
  { kind: 'question', head: 'Open questions (answer them, then fold or reject)' },
  { kind: 'limitation', head: 'Platform limitations (claim status per row)' },
];

/**
 * Markdown for the lead to paste into fixes/FINDINGS.md: open findings (after `since`), grouped by kind,
 * techniques and pitfalls as table rows numbered from the next free T<n> / P<n>, the rest as bullets.
 * Never writes FINDINGS.md.
 */
export function digest({ since, findingsFile = join(REPO, 'fixes', 'FINDINGS.md') } = {}) {
  const all = readAll(findingDir(), 'F');
  const after = sinceFilter(since);
  const open = all.filter((f) => f.status === 'open' && after(f));
  if (!open.length) return `<!-- finding.mjs digest: no open findings${since ? ` after ${parseId(since)}` : ''} -->\n`;
  const next = lastNumbers(findingsFile, all);
  const L = [`<!-- finding.mjs digest ${iso()}: ${open.length} open finding${open.length === 1 ? '' : 's'} (${open.map((f) => f.id).join(', ')}). ` +
    'Fold them into fixes/FINDINGS.md (edit freely), then per finding: node tools/finding.mjs resolve <id> --by lead --folded T<n>|P<n>|lesson|duplicate:F-<n>|rejected --note "..." -->'];
  for (const s of SECTIONS) {
    const items = open.filter((f) => f.kind === s.kind);
    if (!items.length) continue;
    L.push('');
    if (s.table) {
      L.push(`## ${s.head} (next: ${s.letter}${next[s.letter] + 1})`, '', s.table, '|---|---|---|---|');
      for (const f of items) L.push(`| ${s.letter}${++next[s.letter]} | ${s.row(f).join(' | ')} |`);
    } else {
      L.push(`## ${s.head}`, '');
      for (const f of items) L.push(`- ${tagged(f, withText(bold(f.title), f.body))} (${joinParts([cell(f.where), cell(f.evidence), f.topics.join(', '), credit(f), refsText(f), acksText(f)])})`);
    }
  }
  return L.join('\n') + '\n';
}

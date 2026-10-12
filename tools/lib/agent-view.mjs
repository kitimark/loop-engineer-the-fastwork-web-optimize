// One agent's work in one place (I-118, user T-074: "how do I trace the work of wi-stack? wi-gpu-bundle as well, I
// cannot track them"). An agent leaves traces in many stores: status rows (owned, or updated for another owner: wi-stack
// updates iphone-runner's "best-stack"), lock holds and queue places (often under a topic id: "cd-roll-ca" holds Chrome
// for fix-cd-roll-ca), wait commands, holds.log lines, console steps, threads, commits tagged "(<name>)" on main,
// fixes/*/README.md files that name it, incidents, findings and proposals. This module reads them all, read-only, and
// builds (1) one agent's view: "running now" or "finished", what it holds, waits for and works on now, and every trace
// newest first with a merged timeline; (2) the list of every agent seen anywhere, running first, with its last activity.
// I-265: an agent with none of these (a read-only helper, an agent-team teammate) still reads running from its Claude
// Code session (transcripts.mjs sessionsNow: "working (last step N min ago)", "idle between steps, waiting for
// messages", "deaf: in <cmd> for N min").
// Served by the console as /agent/<name> + /api/agent/<name> and /agents + /api/agents (console-server.mjs, the page is
// agents-page.html); on the command line `node tools/status.mjs agent <name>` / `agents`.
//
// Names: an agent name (AGENT); "user", "unknown" and a shared group's "(shared)" are no agents. A lock owner, a
// holds.log owner or a wait owner that is the id or an alias of a status row the agent owns counts as the agent ("aka"),
// unless that id is itself an agent's name (the owner or updater of some row). Every other source matches the name only.
//
// Bounded reads, so the page never slows the console: holds.log from its last 256 KB; `git log main -n 1500` with a 5 s
// timeout, cached 30 s; README files re-read only when their size or mtime changed; the whole set of sources cached
// 2 s per process. Every source is failure-tolerant: a broken one shows in `errors`, never breaks the view.
// Hard rule 12: every string shown goes through progress.mjs sanitize (no URL, IP address, local host, e-mail, device
// id or home path); never a step's URL or instructions, a lock's meta beyond its --doing text, or a message's text.
import { readFileSync, readdirSync, statSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { sanitize, writeupRoot, WRITEUP } from './progress.mjs';
import { STATES as ROW_STATES, staleMin, statePlain, waitingPlain, agoText } from './status.mjs';
import { waitPlain, isListener, listenPlain } from './waits.mjs';

export const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/;
export const NOT_AGENTS = new Set(['user', 'unknown']);
export const LIMITS = Object.freeze({ commits: 20, holds: 20, timeline: 60, writeups: 30, steps: 30, threads: 30, incidents: 30, findings: 30, proposals: 20, rows: 40 });
/** The locks an agent can hold, with the words the pages use. */
export const RESOURCES = Object.freeze([['chrome-measure', 'Chrome'], ['iphone', 'the phone'], ['simulator', 'the Simulator']]);
const LABEL = Object.fromEntries(RESOURCES);
const OPEN_STEP = new Set(['pending', 'active']);
const OPEN_INCIDENT = new Set(['open', 'triaged', 'fixing']);
const STEP_ID = /^C-\d{1,6}$/, THREAD_ID = /^T-\d{1,6}$/, PR_ID = /^PR-\d{1,6}$/, ROW_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
/** A commit tag counts as an agent of its own only in this shape (lower case, a hyphen): role-topic names. */
const COMMIT_AGENT = /^[a-z][a-z0-9]*(?:-[a-z0-9.]+)+$/;
const isAgent = (n) => typeof n === 'string' && AGENT.test(n) && !NOT_AGENTS.has(n);

/** The agent name from a page path or the command line; throws on anything else. */
export function parseAgent(s) {
  if (!isAgent(s)) throw new Error(`bad agent name ${JSON.stringify(String(s ?? '').slice(0, 40))} (an agent name: letters, digits, . _ -; not "user")`);
  return s;
}

// ---- small helpers -----------------------------------------------------------------------------------

const s = (x, n = 160) => (x == null || x === '' ? '' : sanitize(x, n));
const hhmm = (iso) => (iso ? `${String(iso).slice(11, 16)}Z` : '?');
const isoOk = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const newer = (a, b) => (isoOk(a) && (!isoOk(b) || a > b) ? a : b);
const byAtDesc = (a, b) => (a.at || '') < (b.at || '') ? 1 : (a.at || '') > (b.at || '') ? -1 : 0;
const openFirst = (a, b) => (a.open === b.open ? byAtDesc(a, b) : a.open ? -1 : 1);
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "50 s", "2 min 12 s", "10 min", "1 h 5 min". */
export function secText(sec) {
  const v = Number(sec);
  if (!Number.isFinite(v) || v < 0) return '?';
  if (v < 60) return `${Math.round(v)} s`;
  if (v < 3600) { const m = Math.floor(v / 60), r = Math.round(v % 60); return r ? `${m} min ${r} s` : `${m} min`; }
  const h = Math.floor(v / 3600), m = Math.round((v % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
const rowGroup = (state) => (ROW_STATES[state] || { group: 'working' }).group;
const rowFinished = (state) => rowGroup(state) === 'finished';
const rowLive = (state) => ['working', 'waiting'].includes(rowGroup(state));
/** I-265: last activity of an agent seen only in its Claude Code session (no other dated trace). */
const SESSION_WHAT = 'a step in its Claude Code session';

// ---- bounded readers ---------------------------------------------------------------------------------

/** The last `maxBytes` of holds.log as records (whole lines only; bad lines skipped). [] when there is none. */
export function readHoldsTail(file, maxBytes = 256 * 1024) {
  let fd;
  try { fd = openSync(file, 'r'); } catch { return []; }
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1); // the first line is cut
    const out = [];
    for (const l of text.split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); if (r && typeof r === 'object' && typeof r.owner === 'string') out.push(r); } catch {} }
    return out;
  } finally { closeSync(fd); }
}

const commitCache = new Map(); // `${cwd}\0${n}` -> {at, value}
const gitEnv = () => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^GIT_/.test(k)) delete e[k]; return e; }; // a hook's GIT_DIR must not redirect it
/**
 * The last `n` commits on main, newest first: [{sha, at, subject}]. One `git log`, 5 s timeout, cached `maxAgeMs`
 * (the pages poll; main moves only at landings). Rejects when git fails.
 */
export function readCommits({ cwd = writeupRoot(), n = 1500, maxAgeMs = 30000, timeoutMs = 5000, now = Date.now() } = {}) {
  const key = `${cwd}\0${n}`;
  const c = commitCache.get(key);
  if (c && now - c.at < maxAgeMs) return Promise.resolve(c.value);
  return new Promise((resolve, reject) => {
    execFile('git', ['log', 'main', '-n', String(n), '--format=%h%x1f%cI%x1f%s'], { cwd, env: gitEnv(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
      if (err) return reject(new Error(`git log main failed${err.killed ? ' (timed out)' : ''}`));
      // %cI carries the committer's offset (+07:00): as UTC, so it sorts and prints with every other time here
      const value = out.split('\n').filter(Boolean).map((l) => { const [sha, at, subject] = l.split('\x1f'); const t = Date.parse(at); return { sha, at: Number.isFinite(t) ? new Date(t).toISOString() : null, subject: subject ?? '' }; });
      commitCache.set(key, { at: now, value });
      resolve(value);
    });
  });
}
/** The agent a commit subject is tagged with: "… (<name>)" at its end, or null. */
export const commitTag = (subject) => { const m = String(subject || '').match(/\(([A-Za-z0-9][A-Za-z0-9_.-]{0,60})\)\s*$/); return m ? m[1] : null; };

const readmeCache = new Map(); // abs path -> {mtimeMs, size, text}
/** fixes/*\/README.md under `root`: [{path (relative), at (mtime), text}]; a file is re-read only when it changed. */
export function readWriteups(root = writeupRoot()) {
  let dirs = [];
  try { dirs = readdirSync(join(root, 'fixes'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    const rel = `fixes/${d.name}/README.md`;
    if (!WRITEUP.test(rel)) continue;
    const abs = join(root, rel);
    let st; try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 2 * 1024 * 1024) continue;
    let c = readmeCache.get(abs);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      try { c = { mtimeMs: st.mtimeMs, size: st.size, text: readFileSync(abs, 'utf8') }; readmeCache.set(abs, c); } catch { continue; }
    }
    out.push({ path: rel, at: new Date(st.mtimeMs).toISOString(), text: c.text });
  }
  return out;
}

/**
 * Every source, read once: {status, locks, holds, waits, steps, threads, proposals, incidents, findings, commits,
 * writeups (null unless asked: only one agent's view needs them), errors}. Never throws.
 */
export async function gatherAgentSources({ writeups = false, root = writeupRoot(), gitCwd = root } = {}) {
  const src = { status: [], locks: {}, holds: [], waits: [], sessions: [], steps: [], threads: [], proposals: [], incidents: [], findings: [], commits: [], writeups: null, errors: [] };
  const tryIt = async (what, fn) => { try { await fn(); } catch (e) { src.errors.push(`${what}: ${s(e.message, 160)}`); } };
  await tryIt('status', async () => { src.status = (await import('./status.mjs')).list(); });
  await tryIt('locks', async () => {
    const L = await import('./lock.mjs');
    for (const [r] of RESOURCES) {
      const st = L.status(r);
      if (L.isGroup(st.holder) && Array.isArray(st.holder.readers)) st.holder = { ...st.holder, readers: L.liveReaders(st.holder) };
      src.locks[r] = st;
    }
    src.holds = readHoldsTail(L.holdsLogFile());
  });
  await tryIt('waits', async () => { src.waits = (await import('./waits.mjs')).listWaits(); });
  // I-265: agents with no lock, wait or row (read-only helpers, team teammates) from Claude Code's own transcripts
  await tryIt('sessions', async () => { src.sessions = [...(await import('./transcripts.mjs')).sessionsNow()].map(([name, x]) => ({ name, ...x })); });
  await tryIt('console steps', async () => { src.steps = (await import('./console.mjs')).list({ all: true }); });
  await tryIt('threads', async () => { src.threads = (await import('./console-threads.mjs')).listThreads(); });
  await tryIt('proposals', async () => { src.proposals = (await import('./proposal.mjs')).listProposals({ all: true }); });
  await tryIt('incidents', async () => { src.incidents = (await import('./incident.mjs')).list({ all: true }); });
  await tryIt('findings', async () => { src.findings = (await import('./finding.mjs')).list({}); });
  await tryIt('commits', async () => { src.commits = await readCommits({ cwd: gitCwd }); });
  if (writeups) await tryIt('write-ups', async () => { src.writeups = readWriteups(root); });
  return src;
}

// ---- names -------------------------------------------------------------------------------------------

/** The agents that own or update status rows: their names are never taken as another agent's alias. */
function rowAgents(rows) {
  const set = new Set();
  for (const r of rows) for (const n of [r.owner, r.updatedBy, r.createdBy]) if (isAgent(n)) set.add(n);
  return set;
}
/** Row id / alias -> its owner, for lock, holds and wait owners that are topic ids (never an agent's own name). */
function aliasOwners(rows) {
  const agents = rowAgents(rows), m = new Map();
  for (const r of rows) {
    if (!isAgent(r.owner)) continue;
    for (const k of [r.id, ...(r.aliases || [])]) if (k && k !== r.owner && !agents.has(k) && !m.has(k)) m.set(k, r.owner);
  }
  return m;
}

// ---- live: holds, queue places, waits, rows ----------------------------------------------------------

/**
 * Who holds, waits for or works on what right now: Map(agent -> {holds, queue, waits, rows}), each entry with a plain
 * line. `who(rawName, viaAlias)` resolves a raw name to the agent it counts for (or null); viaAlias: the name comes
 * from a lock, holds.log, a wait or a commit tag, where a status row's id or alias stands for the row's owner.
 */
function liveOf(src, who, { now, staleAfterMin }) {
  const m = new Map();
  const of = (a) => { if (!m.has(a)) m.set(a, { holds: [], queue: [], waits: [], rows: [], sessions: [] }); return m.get(a); };
  for (const [r, label] of RESOURCES) {
    const st = src.locks?.[r];
    if (!st) continue;
    const h = st.holder && !st.stale ? st.holder : null;
    const group = h && h.shared === true && Array.isArray(h.readers);
    const holders = group ? h.readers.map((x) => ({ x, shared: true })) : h ? [{ x: h, shared: false }] : [];
    for (const { x, shared } of holders) {
      const a = who(x.owner, true);
      if (!a) continue;
      const doing = x.meta?.job && typeof x.meta.job.text === 'string' ? s(x.meta.job.text, 160) : '';
      const as = x.owner !== a ? x.owner : null;
      of(a).holds.push({
        resource: r, label, shared, since: x.acquiredAt || null, doing, as,
        plain: `using ${label} now${shared ? ' (shared)' : ''} since ${hhmm(x.acquiredAt)}${doing ? `: ${doing}` : ''}${as ? ` (as ${as})` : ''}`,
      });
    }
    const q = st.queue || [];
    q.forEach((w, i) => {
      const a = who(w.owner, true);
      if (a) of(a).queue.push({ resource: r, label, position: i + 1, of: q.length, as: w.owner !== a ? w.owner : null, plain: `in line for ${label}, #${i + 1} of ${q.length}` });
    });
  }
  for (const x of src.waits || []) {
    const a = who(x.owner, true);
    if (a) of(a).waits.push({ tool: s(x.tool, 40), since: x.since || null, listener: isListener(x), plain: isListener(x) ? listenPlain(x) : waitPlain(x, now) });
  }
  for (const r of src.status || []) {
    if (!rowLive(r.state)) continue;
    const age = (now - Date.parse(r.updatedAt || r.createdAt || '')) / 60000;
    if (!(age <= staleAfterMin)) continue;
    const plain = `row ${r.id} is ${r.state}: ${s(r.title, 90)}`;
    for (const a of new Set([who(r.owner, false), who(r.updatedBy, false)].filter(Boolean))) of(a).rows.push({ id: r.id, state: r.state, plain });
  }
  for (const x of src.sessions || []) {
    const a = who(x.name, false);
    if (a && isoOk(x.at)) of(a).sessions.push({ state: s(x.state, 20), at: x.at, plain: s(x.text, 160) });
  }
  return m;
}
const reasons = (l) => (l ? [...l.holds, ...l.queue, ...l.waits, ...l.rows, ...l.sessions].map((x) => x.plain) : []);

// ---- events: the merged timeline -----------------------------------------------------------------------

/** One event per trace: {who, at, kind, text, href?}. `who(rawName, viaAlias)` as in liveOf. */
function eventsOf(src, who) {
  const ev = [];
  const add = (raw, viaAlias, at, kind, text, href) => { const a = who(raw, viaAlias); if (a && isoOk(at)) ev.push({ who: a, at, kind, text, ...(href && { href }) }); };
  for (const r of src.status || []) {
    const href = ROW_ID.test(r.id) ? `/status#${r.id}` : undefined;
    const hist = Array.isArray(r.history) ? r.history : [];
    for (const h of hist) {
      const c = h.changes || {};
      const parts = [h.action === 'created' ? 'created' : '', typeof c.state === 'string' ? c.state : '', typeof c.note === 'string' ? s(c.note, 160) : ''].filter(Boolean);
      add(h.by, false, h.at, 'status', `status ${r.id}: ${parts.join(', ') || s(h.action, 30) || 'updated'}`, href);
    }
    if (!hist.length) add(r.updatedBy, false, r.updatedAt, 'status', `status ${r.id}: ${r.state}`, href);
  }
  for (const [r, label] of RESOURCES) {
    const st = src.locks?.[r];
    const h = st?.holder && !st.stale ? st.holder : null;
    if (!h) continue;
    const holders = h.shared === true && Array.isArray(h.readers) ? h.readers.map((x) => [x, true]) : [[h, false]];
    for (const [x, shared] of holders) add(x.owner, true, x.acquiredAt, 'hold', `using ${label} now${shared ? ' (shared)' : ''}${x.meta?.job?.text ? `: ${s(x.meta.job.text, 120)}` : ''}`);
  }
  for (const rec of src.holds || []) add(rec.owner, true, rec.endedAt || rec.end || rec.at, 'hold', `held ${holdPlain(rec)}`);
  for (const st of src.steps || []) add(st.by, false, st.createdAt, 'step', `posted step ${st.id}: ${s(st.title, 120)} (${s(st.status, 20)})`, STEP_ID.test(st.id) ? `/#${st.id}` : undefined);
  for (const t of src.threads || []) {
    const href = THREAD_ID.test(t.id) ? `/threads#${t.id}` : undefined;
    for (const msg of t.messages || []) if (msg.by !== 'user') add(msg.by, false, msg.at, 'thread', `wrote in ${t.id}: ${s(t.title, 120)}`, href);
  }
  for (const i of src.incidents || []) {
    add(i.reportedBy, false, i.openedAt, 'incident', `reported ${i.id}: ${s(i.title, 120)}`);
    for (const a of i.affected || []) add(a.by, false, a.at, 'incident', `joined ${i.id}: ${s(i.title, 120)}`);
    for (const h of i.history || []) if (h.action !== 'opened' && h.action !== 'joined') add(h.by, false, h.at, 'incident', `${s(h.action, 20)} ${i.id}${h.note ? `: ${s(h.note, 120)}` : ''}`);
  }
  for (const f of src.findings || []) add(f.by, false, f.postedAt, 'finding', `posted ${f.id}: ${s(f.title, 120)}`);
  for (const p of src.proposals || []) add(p.by, false, p.createdAt, 'proposal', `proposal ${p.id}: ${s(p.title, 120)} (${s(p.state, 20)})`, PR_ID.test(p.id) ? `/proposals#${p.id}` : undefined);
  for (const c of src.commits || []) { const tag = commitTag(c.subject); if (tag) add(tag, true, c.at, 'commit', `commit ${s(c.sha, 12)}: ${s(c.subject, 200)}`); }
  return ev.sort(byAtDesc);
}

function holdMode(rec) { return rec.mode === 'shared' ? 'shared' : rec.short ? 'short' : rec.noTiming ? 'no-timing' : ''; }
/** "Chrome (shared, w1) for 2 min 12 s, ok" / "the phone for 10 min, exit 124 (stopped at its time limit)". */
function holdPlain(rec) {
  const mode = holdMode(rec);
  const label = LABEL[rec.resource] || s(rec.resource, 40);
  const end = rec.code === 0 ? 'ok' : rec.code == null ? (rec.signal ? `ended by ${s(rec.signal, 20)}` : 'end unknown') : `exit ${rec.code}`;
  return `${label}${mode ? ` (${mode}${mode === 'shared' && rec.weight ? `, w${rec.weight}` : ''})` : ''} for ${secText(rec.durationSec)}, ${end}${rec.killed ? ' (stopped at its time limit)' : ''}`;
}

// ---- one agent ---------------------------------------------------------------------------------------

/**
 * One agent's view (pure; every input in `src`): {schema, now, name, aka, running, runningWhy, lastAt, lastWhat,
 * live: {holds, queue, waits}, rows, holds, steps, threads, commits, writeups, incidents, findings, proposals, timeline,
 * errors}. Lists are newest first, open ones before finished ones; links only to pages the console has.
 */
export function buildAgentView(name, src, { now = Date.now(), staleAfterMin = staleMin() } = {}) {
  parseAgent(name);
  const rows = src.status || [];
  const aliasOwner = aliasOwners(rows);
  const aka = [...aliasOwner.entries()].filter(([, o]) => o === name).map(([k]) => k).sort();
  const akaSet = new Set(aka);
  const who = (n, viaAlias) => (n === name || (viaAlias && akaSet.has(n)) ? name : null);
  const live = liveOf(src, who, { now, staleAfterMin }).get(name) || { holds: [], queue: [], waits: [], rows: [], sessions: [] };
  const runningWhy = reasons(live);

  const myRows = rows.map((r) => {
    const owns = r.owner === name || (r.aliases || []).includes(name);
    const touched = r.updatedBy === name || r.createdBy === name || (r.history || []).some((h) => h.by === name);
    if (!owns && !touched) return null;
    const group = rowGroup(r.state);
    const age = (now - Date.parse(r.updatedAt || r.createdAt || '')) / 60000;
    return {
      id: r.id, title: s(r.title, 90), state: r.state, statePlain: statePlain(r.state, ROW_STATES[r.state], r.waitingOn ? { plain: waitingPlain(r.waitingOn) } : null),
      group, open: !rowFinished(r.state), stale: rowLive(r.state) && !(age <= staleAfterMin),
      note: s(r.note, 200), next: s(r.next, 200), owner: s(r.owner, 80), updatedBy: s(r.updatedBy, 80), at: r.updatedAt || r.createdAt || null,
      how: owns ? 'owns it' : 'updated it', ...(ROW_ID.test(r.id) && { href: `/status#${r.id}` }),
    };
  }).filter(Boolean).sort(openFirst).slice(0, LIMITS.rows);

  const holds = (src.holds || []).filter((r) => r.owner === name || akaSet.has(r.owner)).map((r) => ({
    resource: s(r.resource, 40), mode: holdMode(r), weight: r.weight ?? null, start: r.acquiredAt || r.start || null, at: r.endedAt || r.end || r.at || null,
    durationSec: r.durationSec ?? null, code: r.code ?? null, killed: !!r.killed, as: r.owner !== name ? r.owner : null, plain: cap1(holdPlain(r)),
  })).sort(byAtDesc).slice(0, LIMITS.holds);

  const steps = (src.steps || []).filter((x) => x.by === name).map((x) => ({
    id: x.id, title: s(x.title, 120), status: s(x.status, 20), open: OPEN_STEP.has(x.status), at: x.updatedAt || x.createdAt || null, ...(STEP_ID.test(x.id) && { href: `/#${x.id}` }),
  })).sort(openFirst).slice(0, LIMITS.steps);

  const threads = (src.threads || []).map((t) => {
    const mine = (t.messages || []).filter((m) => m.by === name);
    const assigned = (t.assignees || []).includes(name), started = t.createdBy === name;
    if (!mine.length && !assigned && !started) return null;
    const how = [mine.length ? `wrote ${mine.length} message${mine.length === 1 ? '' : 's'}` : '', assigned ? 'assigned to it' : '', started ? 'started it' : ''].filter(Boolean).join(', ');
    return { id: t.id, title: s(t.title, 120), open: t.status !== 'closed', state: threadStateOf(t), how, at: mine.length ? mine[mine.length - 1].at : t.updatedAt || t.createdAt || null, ...(THREAD_ID.test(t.id) && { href: `/threads#${t.id}` }) };
  }).filter(Boolean).sort(openFirst).slice(0, LIMITS.threads);

  const commits = (src.commits || []).filter((c) => { const tag = commitTag(c.subject); return tag === name || akaSet.has(tag); }).slice(0, LIMITS.commits).map((c) => ({ sha: s(c.sha, 12), subject: s(c.subject, 200), at: c.at || null }));

  const wordRe = new RegExp(`(^|[^A-Za-z0-9_-])${escRe(name)}(?![A-Za-z0-9_-])`, 'g');
  const writeups = src.writeups ? src.writeups.map((w) => {
    const n = (String(w.text).match(wordRe) || []).length;
    if (!n || !WRITEUP.test(w.path)) return null;
    const line = String(w.text).split('\n').find((l) => (wordRe.lastIndex = 0, wordRe.test(l))) || '';
    return { path: w.path, mentions: n, line: s(line.trim(), 200), at: w.at, href: `/writeup/${w.path}` };
  }).filter(Boolean).sort(byAtDesc).slice(0, LIMITS.writeups) : null;

  const incidents = (src.incidents || []).map((i) => {
    const reported = i.reportedBy === name, assigned = i.assignee === name;
    const aff = (i.affected || []).filter((a) => a.by === name);
    const worked = (i.history || []).filter((h) => h.by === name && h.action !== 'opened' && h.action !== 'joined');
    if (!reported && !assigned && !aff.length && !worked.length) return null;
    let at = reported ? i.openedAt : null;
    for (const x of [...aff, ...worked]) at = newer(x.at, at);
    const how = [reported ? 'reported it' : '', assigned ? 'assigned to it' : '', aff.length ? 'affected' : '', worked.length ? 'worked on it' : ''].filter(Boolean).join(', ');
    return { id: i.id, title: s(i.title, 160), status: s(i.status, 20), open: OPEN_INCIDENT.has(i.status), how, at: at || i.openedAt || null };
  }).filter(Boolean).sort(openFirst).slice(0, LIMITS.incidents);

  const findings = (src.findings || []).filter((f) => f.by === name).map((f) => ({ id: f.id, title: s(f.title, 160), kind: s(f.kind, 20), status: s(f.status, 20), at: f.postedAt || null })).sort(byAtDesc).slice(0, LIMITS.findings);
  const proposals = (src.proposals || []).filter((p) => p.by === name).map((p) => ({ id: p.id, title: s(p.title, 160), state: s(p.state, 20), at: p.updatedAt || p.createdAt || null, ...(PR_ID.test(p.id) && { href: `/proposals#${p.id}` }) })).sort(byAtDesc).slice(0, LIMITS.proposals);

  const all = eventsOf(src, who).map(({ who: _w, ...e }) => e);
  return {
    schema: 'fw-agent/1', now: new Date(now).toISOString(), name, aka,
    // a topic id the locks and commits use for an agent (a row id or alias, "cd-roll-ca"): the agent it stands for
    aliasOf: aliasOwner.get(name) || null,
    running: runningWhy.length > 0, runningWhy,
    lastAt: all[0]?.at ?? live.sessions[0]?.at ?? null, lastWhat: all[0]?.text ?? (live.sessions[0] ? SESSION_WHAT : null),
    live: { holds: live.holds, queue: live.queue, waits: live.waits, sessions: live.sessions },
    rows: myRows, holds, steps, threads, commits, writeups, incidents, findings, proposals,
    timeline: all.slice(0, LIMITS.timeline),
    errors: (src.errors || []).map((e) => s(e, 200)),
  };
}
/** console-threads.mjs threadState without importing the store (pure). */
function threadStateOf(t) {
  if (t.status === 'closed') return 'closed';
  const m = (t.messages || [])[t.messages.length - 1];
  if (!m || m.by === 'user') return 'open';
  return m.ask ? 'waiting-on-you' : 'answered';
}

// ---- every agent -------------------------------------------------------------------------------------

/**
 * Every agent seen in any source: {schema, now, agents: [{name, running, now (the first running reason), lastAt,
 * lastWhat, href}], errors}; running first, then the latest activity first. Lock, holds and wait owners that are a
 * row's id or alias count for the row's owner.
 */
export function buildAgentsList(src, { now = Date.now(), staleAfterMin = staleMin() } = {}) {
  const aliasOwner = aliasOwners(src.status || []);
  const who = (n, viaAlias) => { const a = viaAlias && aliasOwner.has(n) ? aliasOwner.get(n) : n; return isAgent(a) ? a : null; };
  const live = liveOf(src, who, { now, staleAfterMin });
  const events = eventsOf(src, who);
  // a name seen only as a commit tag must look like an agent ("wi-stack", not "I-108", "T-055" or "uncontrolled")
  const known = new Set([...live.keys(), ...events.filter((e) => e.kind !== 'commit').map((e) => e.who)]);
  for (const r of src.status || []) { const a = who(r.owner, false); if (a) known.add(a); }
  const seen = new Map();
  for (const e of events) if (!seen.has(e.who) && (known.has(e.who) || COMMIT_AGENT.test(e.who))) seen.set(e.who, e); // newest first: the first is the latest
  const names = new Set([...seen.keys(), ...known]);
  const agents = [...names].map((n) => {
    const why = reasons(live.get(n));
    const e = seen.get(n), sess = live.get(n)?.sessions[0];
    return { name: n, running: why.length > 0, now: why[0] || '', lastAt: e?.at ?? sess?.at ?? null, lastWhat: e?.text ?? (sess ? SESSION_WHAT : null), href: `/agent/${n}` };
  });
  agents.sort((a, b) => (a.running !== b.running ? (a.running ? -1 : 1) : (a.lastAt || '') < (b.lastAt || '') ? 1 : (a.lastAt || '') > (b.lastAt || '') ? -1 : a.name < b.name ? -1 : 1));
  return { schema: 'fw-agents/1', now: new Date(now).toISOString(), agents, errors: (src.errors || []).map((e) => s(e, 200)) };
}

// ---- current (the console and the CLI) ----------------------------------------------------------------

const srcCache = new Map(); // writeups? -> {at, value}
async function sourcesNow({ writeups, maxAgeMs = 2000 } = {}) {
  const key = writeups ? 'w' : '-';
  const c = srcCache.get(key), t = Date.now();
  if (c && t - c.at < maxAgeMs) return c.value;
  const value = await gatherAgentSources({ writeups });
  srcCache.set(key, { at: t, value });
  return value;
}
export async function currentAgentView(name, opts = {}) { parseAgent(name); return buildAgentView(name, await sourcesNow({ writeups: true, ...opts })); }
export async function currentAgentsList(opts = {}) { return buildAgentsList(await sourcesNow({ writeups: false, ...opts })); }

// ---- text --------------------------------------------------------------------------------------------

const agoMin = (iso, now) => (isoOk(iso) ? Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60000)) : null);

/** One agent as plain text (`status.mjs agent <name>`). */
export function agentText(v) {
  const L = [];
  const ago = (iso) => agoText(agoMin(iso, v.now));
  L.push(v.running ? `${v.name}: RUNNING NOW${v.lastAt ? ` (last activity ${ago(v.lastAt)})` : ''}` : `${v.name}: finished (not running)${v.lastAt ? `, last seen ${ago(v.lastAt)}: ${v.lastWhat}` : ', no trace found'}`);
  for (const w of v.runningWhy) L.push(`  - ${w}`);
  if (v.aliasOf) L.push(`${v.name} is a status row id that ${v.aliasOf} uses on the locks and in commits: node tools/status.mjs agent ${v.aliasOf}`);
  if (v.aka.length) L.push(`also on the locks as: ${v.aka.join(', ')}`);
  const section = (title, items, line) => { if (!items || !items.length) return; L.push('', `${title}:`); for (const x of items) L.push(`  ${line(x)}`); };
  const flag = (x) => (x.open === false ? '[done] ' : '');
  section('status rows', v.rows, (r) => `${flag(r)}${r.id}  ${r.state}${r.stale ? ' (may be out of date)' : ''}  ${r.title} (${r.how}${r.how !== 'owns it' ? `; owner ${r.owner}` : ''}), ${ago(r.at)}${r.note ? `\n      now: ${r.note}` : ''}`);
  section('console steps', v.steps, (x) => `${flag(x)}${x.id}  ${x.status}  ${x.title}`);
  section('threads', v.threads, (x) => `${flag(x)}${x.id}  ${x.state}  ${x.title} (${x.how}), ${ago(x.at)}`);
  section('commits on main', v.commits, (c) => `${c.sha} ${c.subject}  (${hhmm(c.at)}, ${ago(c.at)})`);
  section(`holds (last ${LIMITS.holds}, from holds.log)`, v.holds, (h) => `${hhmm(h.start)}-${hhmm(h.at)}  ${h.plain}${h.as ? ` (as ${h.as})` : ''}`);
  section('write-ups', v.writeups, (w) => `${w.path} (${w.mentions} mention${w.mentions === 1 ? '' : 's'}): ${w.line}`);
  section('incidents', v.incidents, (i) => `${flag(i)}${i.id}  ${i.status}  ${i.title} (${i.how})`);
  section('findings', v.findings, (f) => `${f.id}  ${f.kind}  ${f.title}`);
  section('proposals', v.proposals, (p) => `${p.id}  ${p.state}  ${p.title}`);
  section('recent activity', v.timeline.slice(0, 15), (e) => `${hhmm(e.at)}  ${e.text}`);
  if (v.errors.length) L.push('', `unavailable: ${v.errors.join('; ')}`);
  return L.join('\n');
}

/** Every agent as plain text (`status.mjs agents`); finished ones only with `all` (else the 20 most recent). */
export function agentsText(l, { all = false } = {}) {
  const run = l.agents.filter((a) => a.running), done = l.agents.filter((a) => !a.running);
  const ago = (iso) => agoText(agoMin(iso, l.now));
  const L = [`RUNNING NOW (${run.length}):`];
  for (const a of run) L.push(`  ${a.name}  ${a.now}${a.lastAt ? `  (last activity ${ago(a.lastAt)})` : ''}`);
  if (!run.length) L.push('  nobody');
  const shown = all ? done : done.slice(0, 20);
  L.push(`FINISHED (${done.length}):`);
  for (const a of shown) L.push(`  ${a.name}  ${a.lastAt ? `last seen ${ago(a.lastAt)}: ${a.lastWhat}` : 'no dated trace'}`);
  if (shown.length < done.length) L.push(`  … ${done.length - shown.length} more (--all)`);
  L.push('one agent: node tools/status.mjs agent <name>  (console: /agent/<name>)');
  if (l.errors.length) L.push(`unavailable: ${l.errors.join('; ')}`);
  return L.join('\n');
}

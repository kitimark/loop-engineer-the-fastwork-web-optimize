// Shared incident log: unexpected problems that agents hit while working in parallel (a tool bug, a
// failing environment, a baseline problem, an open research question). Protocol: fixes/INCIDENTS.md.
//
// State lives next to the locks in the shared git dir, so every worktree sees a report the moment it
// is written (a committed file would reach other worktrees only after the lead lands it and they rebase):
//   <git-common-dir>/fastwork-mirror/incidents/I-001.json     one JSON file per incident
// Every read-modify-write runs inside the lock library's mkdir guard ("incident-store"), so two agents
// reporting the same failure at the same moment end up in one incident, not two.
//
// Dedup key (`sig`): the reporter's --sig if given, otherwise the first line of the error text with
// paths, URLs, hex ids and numbers replaced by placeholders. Same key as an active incident = join it.
// Same key as a *resolved* incident whose fix commit is not in the reporter's HEAD = "known, rebase".
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { sharedStateDir, REPO } from './paths.mjs';
import { withGuard } from './lock.mjs';

export const CLASSES = ['tool', 'env', 'baseline', 'research', 'fix', 'unknown'];
export const STATUSES = ['open', 'triaged', 'fixing', 'resolved', 'parked'];
export const ACTIVE = new Set(['open', 'triaged', 'fixing']);
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
export const RESOLUTIONS = ['fixed', 'workaround', 'answered', 'not-a-bug', 'duplicate'];
const GUARD = 'incident-store';
const MAX_TEXT = 8000;

export const incidentDir = () => join(sharedStateDir(), 'incidents');
const fileOf = (id) => join(incidentDir(), `${id}.json`);
const iso = (t = Date.now()) => new Date(t).toISOString();
const clip = (s, n = MAX_TEXT) => (s == null ? undefined : String(s).length > n ? '…' + String(s).slice(-n) : String(s));

function writeJson(f, v) {
  const t = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(t, JSON.stringify(v, null, 1));
  renameSync(t, f);
}

function git(args, cwd = REPO) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
  return { code: r.status, out: (r.stdout || '').trim() };
}

/** "3", "i-3", "I-003" -> "I-003". Throws on anything else. */
export function parseId(s) {
  const m = String(s ?? '').trim().match(/^(?:i-?)?0*(\d{1,6})$/i);
  if (!m) throw new Error(`bad incident id "${s}" (expected e.g. I-003)`);
  return `I-${m[1].padStart(3, '0')}`;
}

/** First non-empty line of an error, with volatile parts (paths, URLs, hex, numbers) replaced. */
export function normalizeError(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean);
  if (!line) return '';
  return line
    .toLowerCase()
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/g, '<url>')
    .replace(/(?:[a-z]:)?(?:\/[^\s:'"`,;()[\]]+)+/g, '<path>')
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{6,}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

/** Dedup key of a report: explicit sig wins; otherwise the normalized error line; '' = no dedup. */
export function signature({ sig, error } = {}) {
  if (sig && String(sig).trim()) return 'sig:' + String(sig).trim().toLowerCase();
  const n = normalizeError(error);
  return n ? 'err:' + n : '';
}

function readOne(f) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }

/** All incidents, oldest first; active ones only unless `all`. */
export function list({ all = false } = {}) {
  let names = [];
  try { names = readdirSync(incidentDir()).filter((f) => /^I-\d+\.json$/.test(f)); } catch {}
  const items = names.map((f) => readOne(join(incidentDir(), f))).filter(Boolean);
  items.sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  return all ? items : items.filter((i) => ACTIVE.has(i.status));
}

export function get(id) {
  const inc = readOne(fileOf(parseId(id)));
  if (!inc) throw new Error(`no incident ${parseId(id)} (node tools/incident.mjs list --all)`);
  return inc;
}

/** Is `commit` contained in HEAD of this checkout? true / false / null (unknown commit). */
export function inHead(commit, cwd = REPO) {
  const r = git(['merge-base', '--is-ancestor', commit, 'HEAD'], cwd);
  return r.code === 0 ? true : r.code === 1 ? false : null;
}

function checkoutInfo(cwd = REPO) {
  return {
    checkout: cwd,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).out || undefined,
    head: git(['rev-parse', '--short', 'HEAD'], cwd).out || undefined,
  };
}

function check(name, v, allowed) {
  if (v !== undefined && !allowed.includes(v)) throw new Error(`bad ${name} "${v}" (one of: ${allowed.join(', ')})`);
}

/**
 * Report a problem. Returns {action: 'opened'|'joined'|'known', incident}.
 * report: {by, title, error, cls, cmd, output, repro, env, suspect, blocking, workaround, sig, forceNew}
 */
export async function open(report, { cwd = REPO } = {}) {
  const { by, title } = report;
  if (!by) throw new Error('--by <your agent name> is required (e.g. fix-countdown-idle-raf)');
  if (!title) throw new Error('--title "<one line: what failed>" is required');
  check('class', report.cls, CLASSES);
  const sig = signature(report);
  const where = checkoutInfo(cwd);
  const blocking = report.blocking === undefined ? true : !!report.blocking;
  return withGuard(GUARD, () => {
    mkdirSync(incidentDir(), { recursive: true });
    const all = list({ all: true });
    const now = iso();
    let recurrenceOf;
    if (sig && !report.forceNew) {
      const active = all.find((i) => ACTIVE.has(i.status) && i.sig === sig);
      if (active) {
        if (!active.affected.some((a) => a.by === by)) active.affected.push({ by, at: now, blocking, ...where });
        active.history.push({ at: now, by, action: 'joined', note: clip(report.output || report.error, 2000) });
        writeJson(fileOf(active.id), active);
        return { action: 'joined', incident: active };
      }
      const fixed = all.filter((i) => i.status === 'resolved' && i.sig === sig && i.fix?.commit).at(-1);
      if (fixed) {
        const contained = inHead(fixed.fix.commit, cwd);
        if (contained === false) return { action: 'known', incident: fixed };
        recurrenceOf = fixed.id; // the fix is in this HEAD and it still fails: a regression
      }
    }
    const n = all.reduce((m, i) => Math.max(m, Number(i.id.slice(2)) || 0), 0) + 1;
    const inc = {
      id: `I-${String(n).padStart(3, '0')}`,
      title: String(title).slice(0, 200),
      status: 'open',
      class: report.cls || 'unknown',
      priority: undefined,
      sig,
      reportedBy: by,
      openedAt: now,
      blocking,
      error: clip(report.error, 2000),
      cmd: clip(report.cmd, 2000),
      output: clip(report.output),
      repro: clip(report.repro, 4000),
      env: {
        ...where,
        node: process.version, platform: `${process.platform} ${os.release()}`,
        loadavg1: Math.round(os.loadavg()[0] * 100) / 100,
        notes: clip(report.env, 2000),
      },
      suspect: clip(report.suspect, 500),
      workaround: clip(report.workaround, 2000),
      recurrenceOf,
      assignee: undefined,
      affected: [{ by, at: now, blocking, ...where }],
      history: [{ at: now, by, action: 'opened' }],
    };
    writeJson(fileOf(inc.id), inc);
    return { action: 'opened', incident: inc };
  });
}

/** Triage / progress fields (the lead, or the assignee for notes). */
export async function update(id, { by, status, cls, priority, assignee, workaround, note, affected } = {}) {
  if (!by) throw new Error('--by <name> is required');
  check('status', status, STATUSES.filter((s) => s !== 'resolved'));
  check('class', cls, CLASSES);
  check('priority', priority, PRIORITIES);
  const iid = parseId(id);
  return withGuard(GUARD, () => {
    const inc = get(iid);
    const changes = {};
    const set = (k, v) => { if (v !== undefined && inc[k] !== v) { changes[k] = v; inc[k] = v; } };
    set('status', status); set('class', cls); set('priority', priority); set('assignee', assignee);
    set('workaround', clip(workaround, 2000));
    if (status && status !== 'resolved') delete inc.resolution;
    if (affected && !inc.affected.some((a) => a.by === affected)) { inc.affected.push({ by: affected, at: iso() }); changes.affected = affected; }
    if (!Object.keys(changes).length && !note) throw new Error('nothing to update (give --status, --class, --priority, --assignee, --workaround, --affected or --note)');
    inc.history.push({ at: iso(), by, action: 'update', changes, note: clip(note, 4000) });
    writeJson(fileOf(iid), inc);
    return inc;
  });
}

/**
 * Close an incident. resolution 'fixed' needs `commit`, which must already be on `main` (landed)
 * unless allowUnlanded. Other resolutions need a note.
 */
export async function resolve(id, { by, resolution = 'fixed', commit, note, remeasure = false, allowUnlanded = false, cwd = REPO } = {}) {
  if (!by) throw new Error('--by <name> is required');
  check('resolution', resolution, RESOLUTIONS);
  let fix;
  if (resolution === 'fixed') {
    if (!commit) throw new Error('resolution "fixed" needs --commit <sha> (the landed fix on main)');
    const full = git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], cwd).out;
    if (!full) throw new Error(`unknown commit "${commit}"`);
    if (!allowUnlanded) {
      const onMain = git(['merge-base', '--is-ancestor', full, 'main'], cwd).code;
      if (onMain !== 0) throw new Error(`commit ${full.slice(0, 10)} is not on main yet: land it first (fixes/LEAD.md "Land a fix"), then resolve`);
    }
    fix = { commit: full, short: full.slice(0, 10), subject: git(['log', '-1', '--format=%s', full], cwd).out };
  } else if (!note) {
    throw new Error(`resolution "${resolution}" needs --note (what to do instead)`);
  }
  const iid = parseId(id);
  return withGuard(GUARD, () => {
    const inc = get(iid);
    inc.status = 'resolved';
    inc.resolution = resolution;
    inc.resolvedAt = iso();
    inc.resolvedBy = by;
    inc.remeasure = !!remeasure;
    if (fix) inc.fix = fix;
    if (note) inc.resolutionNote = clip(note, 4000);
    inc.history.push({ at: inc.resolvedAt, by, action: 'resolved', changes: { resolution, commit: fix?.short, remeasure: !!remeasure }, note: clip(note, 4000) });
    writeJson(fileOf(iid), inc);
    return inc;
  });
}

/** The message the lead sends to every affected agent (fixes/INCIDENTS.md "Announcement"). */
export function announcement(inc) {
  const who = inc.affected.map((a) => a.by).join(', ');
  const L = [];
  if (inc.status === 'resolved') {
    L.push(`[incident ${inc.id}] RESOLVED (${inc.resolution}): ${inc.title}`);
    if (inc.fix) {
      L.push(`Fix: ${inc.fix.short} on main: ${inc.fix.subject}`);
      L.push(`Action: in your worktree run \`git rebase main\` (check: \`git merge-base --is-ancestor ${inc.fix.short} HEAD\`), then continue${inc.cmd ? `; re-run: ${inc.cmd}` : ''}.`);
    }
    if (inc.remeasure) L.push(`Re-measure: the fix changed measurement code; A/B results measured before ${inc.fix?.short ?? 'it'} are not comparable, run fix.mjs ab again after rebasing.`);
    if (inc.resolutionNote) L.push(`Note: ${inc.resolutionNote}`);
  } else if (inc.status === 'parked') {
    L.push(`[incident ${inc.id}] PARKED: ${inc.title}`);
    L.push(`Action: continue without it${inc.workaround ? `; workaround: ${inc.workaround}` : ''}. The lead reopens it later.`);
  } else {
    L.push(`[incident ${inc.id}] ${inc.status.toUpperCase()}${inc.priority ? ` ${inc.priority}` : ''}${inc.assignee ? `, assigned to ${inc.assignee}` : ''}: ${inc.title}`);
    L.push(inc.workaround ? `Workaround meanwhile: ${inc.workaround}` : 'No workaround yet: do work that does not need it, or wait (node tools/incident.mjs wait ' + inc.id + ').');
  }
  if (inc.recurrenceOf) L.push(`Recurrence of ${inc.recurrenceOf}.`);
  L.push(`Affected: ${who || '(none)'}`);
  return L.join('\n');
}

/** Poll until the incident is resolved or parked. Returns it, or null on timeout. */
export async function waitFor(id, { timeoutSec = 3600, pollMs = 15000 } = {}) {
  const iid = parseId(id);
  const t0 = Date.now();
  for (;;) {
    const inc = get(iid);
    if (!ACTIVE.has(inc.status)) return inc;
    if (Date.now() - t0 >= timeoutSec * 1000) return null;
    await new Promise((r) => setTimeout(r, Math.max(50, Math.min(pollMs, timeoutSec * 1000 - (Date.now() - t0) + 10))));
  }
}

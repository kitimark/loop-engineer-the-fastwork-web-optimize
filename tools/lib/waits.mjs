// Live wait records (incident I-058, user T-016: "everyone should be able to see which agent is waiting for what").
// While a wait command runs (tools/wait.mjs, `lock.mjs wait`, `console.mjs wait|thread wait|proposal wait`,
// `incident.mjs wait`, `finding.mjs wait`), it registers itself here; the status board (tools/lib/status.mjs, through
// progress.mjs gatherLive) shows it on the owner's rows ("now: waiting for … since 08:31Z (3 min, timeout 10 min)"),
// and waits that match no row in a short "other waits" section. Nobody has to remember to report a wait.
//
//   <git-common-dir>/fastwork-mirror/waits/<pid>-<rand>.json     ($FW_STATE_DIR/waits/ in tests)
//   {schema, id, owner, tool, what, reason?, listener?, since, timeoutSec, until, pid}   (listener: I-108, isListener)
//
// Cheap by design: one write when the wait starts (plus a directory listing that drops records of dead processes,
// read from the file names only), one unlink when it exits ('exit' event). A wait that is killed leaves its record,
// but a record whose pid is dead (or that is 15 min past its own timeout: a reused pid) counts as gone.
// Never blocks or breaks a wait: every failure here is swallowed (the wait's MET/TIMEOUT line is what agents parse).
// Hard rule 12: `what` and `reason` are stored through lanSafeText (LAN hosts -> lan-host) and sanitize() (no URL
// scheme, address, home path, e-mail or device id), and sanitized again when shown.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sharedStateDir } from './paths.mjs';
import { writeJson, readJson } from './store.mjs';
import { sanitize } from './progress.mjs';
import { lanSafeText } from './iphone-url.mjs';

export const SCHEMA = 'fw-wait/1';
export const UNKNOWN = 'unknown';
/** A record this long past its own timeout is gone even if its pid runs (the pid was reused). */
export const GRACE_MS = 15 * 60 * 1000;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/;
const NAME = /^(\d+)-[0-9a-f]+\.json$/;
const LIMITS = { what: 160, reason: 160 };

export const waitsDir = () => join(sharedStateDir(), 'waits');

/** The waiting agent: the given name (--as / --owner / --by), else $FW_AGENT, else $FW_LOCK_OWNER, else "unknown". */
export function waitOwner(given, env = process.env) {
  for (const v of [given, env.FW_AGENT, env.FW_LOCK_OWNER]) {
    const s = String(v ?? '').trim();
    if (s && AGENT.test(s)) return s;
  }
  return UNKNOWN;
}

/** The process runs (signal 0; EPERM = it runs as someone else). */
export function pidRuns(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

const clean = (s, max) => sanitize(lanSafeText(String(s ?? '').replace(/\s+/g, ' ').trim()), max);

/** A URL for a wait's text: LAN host -> lan-host, and no scheme (a scheme would turn the whole URL into <link>). */
export function urlText(u) {
  return lanSafeText(String(u ?? '')).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

/**
 * Register a running wait. opts: {tool ("wait.mjs file", "lock.mjs wait", ...), owner (already resolved, or given:
 * waitOwner fills in), what (the plain condition), timeoutSec, reason?}. Returns {record, end()}; end() removes the
 * record (also run on process 'exit'). Never throws: on any failure it returns {record: null, end() {}}.
 */
export function startWait({ tool, owner, what, timeoutSec, reason, listener = false, pid = process.pid, now = Date.now(), onExit = true } = {}) {
  try {
    const dir = waitsDir();
    mkdirSync(dir, { recursive: true });
    for (const n of readdirSync(dir)) { // drop the records of waits that were killed (dead pid, from the name alone)
      const m = n.match(NAME);
      if (m && !pidRuns(Number(m[1]))) try { unlinkSync(join(dir, n)); } catch {}
    }
    const id = `${pid}-${randomBytes(3).toString('hex')}`;
    const t = Number(timeoutSec);
    const record = {
      schema: SCHEMA, id, owner: waitOwner(owner), tool: clean(tool, 40), what: clean(what, LIMITS.what),
      ...(reason ? { reason: clean(reason, LIMITS.reason) } : {}),
      ...(listener ? { listener: true } : {}),
      since: new Date(now).toISOString(), timeoutSec: Number.isFinite(t) && t >= 0 ? Math.round(t) : null,
      until: Number.isFinite(t) && t >= 0 ? new Date(now + t * 1000).toISOString() : null, pid,
    };
    const file = join(dir, `${id}.json`);
    writeJson(file, record);
    let done = false;
    const end = () => { if (done) return; done = true; try { unlinkSync(file); } catch {} };
    if (onExit) process.once('exit', end);
    return { record, end };
  } catch {
    return { record: null, end() {} };
  }
}

/**
 * I-108 (6): the one stderr line a wait prints when nobody owns it (no --owner, $FW_AGENT or $FW_LOCK_OWNER); the
 * wait still runs (a refusal would stall agents whose scripts predate the rule), and the board shows "owner unknown".
 */
export const NO_OWNER_NOTE = 'NOTE: pass --owner <you> so the board can show who waits (this wait shows as "owner unknown")';
/** How the board names a wait's owner: "owner unknown" for a wait nobody owns. */
export const ownerText = (o) => (!o || o === UNKNOWN ? 'owner unknown' : o);

/** The live waits, oldest first: records whose pid runs and that are not 15 min past their own timeout. */
export function listWaits({ now = Date.now(), alive = pidRuns } = {}) {
  let names = [];
  try { names = readdirSync(waitsDir()).filter((n) => NAME.test(n)); } catch { return []; }
  const out = [];
  for (const n of names) {
    const r = readJson(join(waitsDir(), n));
    if (!r || r.schema !== SCHEMA || !alive(Number(r.pid))) continue;
    if (r.until && Date.parse(r.until) + GRACE_MS < now) continue;
    out.push(r);
  }
  return out.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
}

const dur = (sec) => (sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h${Math.round((sec % 3600) / 60) ? ` ${Math.round((sec % 3600) / 60)} min` : ''}`);

// I-060 (the lead, from the board): a wait's own text can be a file path, a regex, a pid or a scrubbed placeholder
// ("a line of /private/tmp/…/<device id>/tasks/x.output to match /A1-sent-open .*(PASS|FAIL)/"), which the user can't
// read. Such a wait is shown by its --reason, else by a plain kind of wait from its tool, never the path or regex.
const TECHNICAL = /[/\\]|<[a-z][a-z ]*>|\bpid \d|\bprocess \d/;
const KIND_OF_WAIT = {
  'wait.mjs file': 'a background job to report back',
  'wait.mjs serve': 'a mirror server to start',
  'wait.mjs url': 'a server to answer',
  'wait.mjs pid': 'a background process to finish',
  'wait.mjs git': 'a commit to land on main',
};
/**
 * I-108 (user T-060 #3): a thread listener (`console.mjs thread wait` without --thread, kept armed by every owner)
 * waits on nobody; its old text "a user reply in a console thread" read as "waiting on the user". Marked
 * `listener: true` since I-108; records from before (no marker) are known by the tool and a what naming no thread.
 */
export const isListener = (w) => !!w && (w.listener === true || (w.tool === 'console.mjs thread wait' && !/\bT-\d+/.test(String(w.what || ''))));

/** "listening for console messages since 03:55Z (not waiting on anyone)". */
export function listenPlain(w) {
  const at = typeof w?.since === 'string' ? `${w.since.slice(11, 16)}Z` : '?';
  return `listening for console messages since ${at} (not waiting on anyone)`;
}

/** Whether a wait's text is technical (a path, regex, pid or placeholder) rather than plain words. */
export const technicalWait = (what) => TECHNICAL.test(sanitize(what, LIMITS.what));

/**
 * "waiting for <what> since 08:31Z (3 min, timeout 10 min); reason: <why>" (every part sanitized). A technical <what>
 * (technicalWait) is not shown: "waiting: <why> since …" with a reason, else "waiting for <a plain kind of wait> since …".
 */
export function waitPlain(w, now = Date.now()) {
  const since = Date.parse(w.since);
  const min = Number.isFinite(since) ? Math.max(0, Math.round((now - since) / 60000)) : null;
  const bits = [min === null ? null : min < 1 ? 'under a minute' : `${min} min`, Number.isFinite(w.timeoutSec) ? `timeout ${dur(w.timeoutSec)}` : null].filter(Boolean);
  const at = typeof w.since === 'string' ? `${w.since.slice(11, 16)}Z` : '?';
  const tail = ` since ${at}${bits.length ? ` (${bits.join(', ')})` : ''}`;
  const reason = w.reason ? sanitize(w.reason, LIMITS.reason) : '';
  if (technicalWait(w.what)) return reason ? `waiting: ${reason}${tail}` : `waiting for ${KIND_OF_WAIT[w.tool] || 'something to finish'}${tail}`;
  return `waiting for ${sanitize(w.what, LIMITS.what)}${tail}${reason ? `; reason: ${reason}` : ''}`;
}

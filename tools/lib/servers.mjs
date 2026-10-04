// Who runs which mirror server (user T-106 #11): every tools/serve.mjs, from any checkout, and the Try-it host record
// themselves here, so the console's Servers page and the idle alarm can say whose server it is, what for, and when it
// was last used. One JSON file per process in the shared state dir (seen by every worktree):
//   <git-common-dir>/fastwork-mirror/servers/<pid>.json   ($FW_STATE_DIR/servers/ in tests)
//   {pid, kind: serve|tryit-host, port, httpTwin, owner, doing, root, overlays, vendors, https, checkout, keep,
//    startedAt, lastRequestAt}
// owner: --owner, else $FW_AGENT, else "unknown". The entry goes on exit; entries whose pid is dead are pruned by every
// reader. lastRequestAt is kept in memory and flushed at most every FLUSH_MS (no file write per request). Recording is
// best-effort: a failure never stops or changes serving. Names and paths only, never an address (Hard rule 12).
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';

export const serversDir = () => join(sharedStateDir(), 'servers');
const fileOf = (pid) => join(serversDir(), `${pid}.json`);
export const FLUSH_MS = 30000;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** --owner, else $FW_AGENT, else "unknown" (an invalid name is "unknown" too). */
export function ownerOf(flag, env = process.env) {
  const n = flag || env.FW_AGENT || '';
  return NAME.test(n) ? n : 'unknown';
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function write(e) {
  mkdirSync(serversDir(), { recursive: true });
  const f = fileOf(e.pid), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(e));
  renameSync(tmp, f);
}

/**
 * Record this process: returns {entry, hit(), flush(), remove()}. hit() notes a request (memory only); a timer flushes
 * a changed lastRequestAt every flushMs (unref'd: it never keeps the process alive); remove() on exit.
 */
export function recordServer(fields, { flushMs = Number(process.env.FW_SERVERS_FLUSH_MS) || FLUSH_MS, now = Date.now, env = process.env } = {}) {
  // a test's server (tests/helpers.mjs sets FW_TEST_LIFELINE) records only into the test's own $FW_STATE_DIR, never
  // into the real registry
  if (env.FW_TEST_LIFELINE && !env.FW_STATE_DIR) { let last = null; return { entry: { ...fields }, hit: (t = now()) => { last = t; }, lastHit: () => last, flush() {}, remove() {}, off: true }; }
  const entry ={ pid: process.pid, kind: 'serve', owner: 'unknown', doing: null, keep: false, startedAt: new Date(now()).toISOString(), lastRequestAt: null, ...fields };
  let last = null, written = null, removed = false;
  const flush = () => {
    if (removed) return;
    if (last !== written) { written = last; entry.lastRequestAt = last ? new Date(last).toISOString() : null; }
    try { write(entry); } catch {}
  };
  const remove = () => { removed = true; clearInterval(timer); try { if (JSON.parse(readFileSync(fileOf(entry.pid), 'utf8')).pid === entry.pid) unlinkSync(fileOf(entry.pid)); } catch {} };
  flush();
  const timer = setInterval(() => { if (last !== written) flush(); }, flushMs);
  timer.unref?.();
  process.on('exit', remove);
  return { entry, hit: (t = now()) => { last = t; }, lastHit: () => last, flush, remove };
}

/** Every recorded server whose process lives (dead ones are pruned), oldest first. */
export function listServers({ prune = true, isAlive = pidAlive } = {}) {
  let files = [];
  try { files = readdirSync(serversDir()).filter((f) => /^\d+\.json$/.test(f)); } catch { return []; }
  const out = [];
  for (const f of files) {
    let e = null;
    try { e = JSON.parse(readFileSync(join(serversDir(), f), 'utf8')); } catch {}
    if (!e || !Number.isInteger(e.pid) || `${e.pid}.json` !== f) continue; // half-written or foreign: next read
    if (!isAlive(e.pid)) { if (prune) try { unlinkSync(join(serversDir(), f)); } catch {} continue; }
    out.push(e);
  }
  return out.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

/** The recorded server with this pid (alive), or null. */
export const getServer = (pid) => listServers().find((e) => e.pid === Number(pid)) || null;

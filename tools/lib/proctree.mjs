// I-163 (the lead's ruling, 2026-10-04): is a wait still attached to a Claude Code session? A wait whose parent chain
// no longer reaches a live Claude Code process is an "orphan wait": the shell or Monitor task that started it is gone
// (macOS reparents the surviving child to launchd, pid 1: OBSERVED, `sh -c 'node … &'` then sh exits, 2026-10-04), or it
// was started outside Claude Code (nohup, a terminal). Nobody reads what it prints, so the thread router does not count
// it as listening and the board flags it.
// Limit (OBSERVED in our setup): every subagent of a session runs inside ONE claude process, so a finished agent whose
// background shell still runs looks attached, exactly like an agent between turns waiting on its own background work;
// the transcript (transcripts.mjs) tells them apart and stays a board hint only (I-164's busy rule and the lead's
// 10-min triage backstop cover that case).
// I-248 (P-166, 2026-10-08 10:24Z): a phone block runner started detached (nohup, the I-221 workaround) runs its own
// `console.mjs wait` inside `lock.mjs run iphone --owner <o> -- sh block.sh`; its chain ends at launchd, yet the runner
// reads it. A wait whose chain passes the process of a live lock hold of ITS OWN owner (the hold's pid, or a shared
// reader's) is that owner's held work, not an orphan: the lock's own rules (OVERDUE, idle, STUCK) watch that hold.
// One `ps` read, cached PROC_CACHE_MS; tests inject the table, and a test state dir ($FW_STATE_DIR) turns the check off
// unless $FW_PROC_TREE=on ("off": always off), like transcripts.mjs: a test never reads the machine's processes.
// Only pids and booleans leave this module: no command lines.
import { execFileSync } from 'node:child_process';

export const PROC_CACHE_MS = 10000;
const MAX_DEPTH = 64;

/** A Claude Code process, from its command line: the native `claude` binary, or node running @anthropic-ai/claude-code. */
export function isClaudeArgs(args) {
  const a = String(args ?? '').trim();
  const first = a.split(/\s+/)[0] || '';
  return /(^|\/)claude$/.test(first) || /@anthropic-ai\/claude-code\//.test(a);
}

/** `ps -axww -o pid=,ppid=,args=` text -> Map pid -> {ppid, claude} (claude: isClaudeArgs). */
export function parsePs(text) {
  const out = new Map();
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s?(.*)$/);
    if (m) out.set(Number(m[1]), { ppid: Number(m[2]), claude: isClaudeArgs(m[3]) });
  }
  return out;
}

/** The process table now (Map pid -> {ppid, claude}), or null when ps fails. */
export function procTable({ run = () => execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,args='], { encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 * 1024 }) } = {}) {
  try { return parsePs(run()); } catch { return null; }
}

/** True when pid's parent chain (pid itself included) reaches a Claude Code process before pid 1 or a gap. */
export function attachedTo(pid, table) {
  let cur = Number(pid), n = 0;
  while (cur > 1 && n++ < MAX_DEPTH) {
    const p = table.get(cur);
    if (!p) return false;
    if (p.claude) return true;
    cur = p.ppid;
  }
  return false;
}

/** I-248: true when pid's parent chain (pid itself included) passes one of `pids` before pid 1 or a gap. */
export function chainHas(pid, table, pids) {
  let cur = Number(pid), n = 0;
  while (cur > 1 && n++ < MAX_DEPTH) {
    if (pids.has(cur)) return true;
    const p = table.get(cur);
    if (!p) return false;
    cur = p.ppid;
  }
  return false;
}

/**
 * I-248: Map owner -> Set of pids of live process holds, from lock statuses ({resource: lock.mjs status()}, as
 * progress.mjs gatherLive reads them): a process holder that is not stale, and a shared group's live process readers.
 */
export function holdPids(locks) {
  const out = new Map();
  const add = (owner, pid) => {
    if (typeof owner !== 'string' || !owner || !Number.isInteger(pid) || pid <= 1) return;
    if (!out.has(owner)) out.set(owner, new Set());
    out.get(owner).add(pid);
  };
  for (const st of Object.values(locks || {})) {
    const h = st?.holder;
    if (!h || typeof h !== 'object') continue;
    if (h.kind === 'process' && !st.stale) add(h.owner, Number(h.pid));
    if (Array.isArray(h.readers)) for (const r of h.readers) if (r?.kind === 'process') add(r.owner, Number(r.pid));
  }
  return out;
}

/** Whether the check runs: $FW_PROC_TREE on|off, else off in a test state dir ($FW_STATE_DIR), else on. */
export function procCheckOn(env = process.env) {
  if (env.FW_PROC_TREE === 'on') return true;
  if (env.FW_PROC_TREE === 'off') return false;
  return !env.FW_STATE_DIR;
}

let cache = null;
export const clearProcCache = () => { cache = null; };
/**
 * (pid, owner?) -> boolean "attached to a live Claude Code session", or null when the check is off or ps fails (then every
 * live wait counts as attached, as before I-163). table: inject a process table (tests). locks (I-248): lock statuses; a
 * wait whose chain passes a live hold process of its owner (holdPids) counts as attached too.
 */
export function attachedNow({ now = Date.now(), env = process.env, table = null, locks = null } = {}) {
  if (!table && !procCheckOn(env)) return null;
  let t = table;
  if (!t) {
    if (!cache || Math.abs(now - cache.at) >= PROC_CACHE_MS) cache = { at: now, table: procTable() };
    t = cache.table;
  }
  if (!t) return null;
  const holds = holdPids(locks);
  return (pid, owner) => attachedTo(pid, t) || (!!owner && holds.has(owner) && chainHas(pid, t, holds.get(owner)));
}

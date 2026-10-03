// Process-tree helpers for `lock.mjs run` (I-024, I-097, I-099): which processes of a command's tree still run, and
// a bounded wait, after the hard kill, until they are gone, so a bounded run never releases its lock beside a dying
// process (I-099: `run` exited 124 and released while its tree could still be in the process table).
import { execFileSync } from 'node:child_process';

/** [pid, ppid, pgid, stat] of every process (ps), or [] if ps fails. */
export function psTable() {
  try {
    return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8' }).trim().split('\n')
      .map((l) => l.trim().split(/\s+/)).map(([p, pp, g, s]) => [Number(p), Number(pp), Number(g), String(s || '')]);
  } catch { return []; }
}

/** [pid, pgid] of every descendant of root in the ps rows. */
export function descendants(rows, root) {
  const kids = new Map();
  for (const [p, pp, g] of rows) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push([p, g]); }
  const out = [], stack = [root];
  while (stack.length) for (const [p, g] of kids.get(stack.pop()) || []) { out.push([p, g]); stack.push(p); }
  return out;
}

/**
 * What is left of the tree of the command `root` (its current descendants, plus `seen`: pid -> pgid as the kill
 * collected them): `alive` runs (listed, not a zombie, same pgid, so a reused pid does not count); `dying` is a
 * zombie someone else still has to reap (an orphan's, launchd reaps it). A zombie whose parent is `self` (this
 * process) counts as gone: this process reaps it (libuv, or the exit).
 */
export function treeState(rows, root, seen = new Map(), self = process.pid) {
  const byPid = new Map(rows.map((r) => [r[0], r]));
  const targets = new Map(seen);
  if (byPid.has(root)) targets.set(root, byPid.get(root)[2]);
  for (const [p, g] of descendants(rows, root)) targets.set(p, g);
  const alive = [], dying = [];
  for (const [p, g] of targets) {
    const r = byPid.get(p);
    if (!r || r[2] !== g) continue; // gone, or the pid was reused
    if (!r[3].startsWith('Z')) alive.push(p);
    else if (r[1] !== self) dying.push(p);
  }
  return { alive, dying };
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Wait (synchronously: it also runs in a signal handler, before acquire()'s handler releases the lock and exits)
 * until `sample()` ({alive, dying} pid lists) shows nothing alive or dying, at most `boundMs`. `onPoll` runs before
 * each sample (lock.mjs: a deferred test kill, FW_LOCK_TEST_KILL_DELAY_MS). Returns {gone, alive, dying, waitedMs}:
 * at the bound, `alive` names what still runs (the caller reports it), `dying` the zombies not yet reaped.
 */
export function waitTreeGone(sample, { boundMs = 1500, pollMs = 25, now = Date.now, sleep = sleepSync, onPoll = () => {} } = {}) {
  const t0 = now();
  for (;;) {
    onPoll();
    const s = sample();
    const waitedMs = now() - t0;
    if (!s.alive.length && !s.dying.length) return { gone: true, alive: [], dying: [], waitedMs };
    if (waitedMs >= boundMs) return { gone: false, alive: s.alive, dying: s.dying, waitedMs };
    sleep(Math.min(pollMs, boundMs - waitedMs));
  }
}

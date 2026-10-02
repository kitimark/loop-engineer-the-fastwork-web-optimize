// The warm Simulator (incident I-063): a cold boot of fw-sim takes load1 to 60-95 for about a minute, and a shared hold
// (<= 300 s) can't keep a device booted across holds. So a functional `sim.mjs session` that ends normally leaves fw-sim
// booted (Safari quit, proxy and WDA-sim stopped) for the next session, recorded in <state>/sim/warm.json (mode 600),
// and starts a detached keeper (`sim.mjs keeper <id>`, pidfile sim/keeper.pid.json) that shuts it down
//   - after the idle timeout: FW_SIM_IDLE_SEC (default IDLE_SEC_DEFAULT) after the last session ended (0: no warm device,
//     every session shuts down at its end as before I-063);
//   - as soon as chrome-measure has a TIMING holder or waiter (timingDemand: a normal hold, not short, shared or
//     no-timing), so that waiter's host gate settles on a Mac without it;
//   - never while a session holds the `simulator` lock (it backs off and polls again); `sim.mjs shutdown` stops it now.
// The device belongs to the live session (sim/session.json) or to the keeper (warm.json), never both: the next session
// takes it over under the `simulator` lock (stops the keeper, removes warm.json, resets Safari: tools/lib/sim.mjs).
// This file only READS that state (no simctl, no lock.mjs import), so lib/lock.mjs (phone runs), verify.mjs, bench.mjs
// and lock.mjs status can show it cheaply. reapWarm() is the timed tools' backstop: `sim.mjs shutdown --warm-only`
// (under the simulator lock; never a live session's device) when a warm device is still booted at the start of a
// timing hold (its keeper dead or late).
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sharedStateDir } from './paths.mjs';

export const IDLE_SEC_DEFAULT = 600;
export const SIM_MJS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sim.mjs');
export const warmFile = () => join(sharedStateDir(), 'sim', 'warm.json');
export const keeperPidFile = () => join(sharedStateDir(), 'sim', 'keeper.pid.json');
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Seconds a warm fw-sim stays booted after a session (FW_SIM_IDLE_SEC; 0 = never warm). */
export function idleSec(env = process.env) {
  const v = env.FW_SIM_IDLE_SEC;
  if (v === undefined || v === '') return IDLE_SEC_DEFAULT;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`FW_SIM_IDLE_SEC must be a number of seconds >= 0 (got ${v})`);
  return Math.round(n);
}
/** A test process (node --test) without its own FW_STATE_DIR never reads (or acts on) the real warm device. */
export const realStateInTest = (env = process.env) => !!env.NODE_TEST_CONTEXT && !env.FW_STATE_DIR;
export const readWarm = () => (realStateInTest() ? null : readJson(warmFile()));
/** The keeper's pidfile record and whether its pid lives (not whether it is ours: tools/lib/sim.mjs isOurs). */
export function keeperInfo() { const k = readJson(keeperPidFile()); return k ? { ...k, alive: alive(k.pid) } : null; }
/** {warm, keeper} while warm.json exists, else null. */
export function warmState() { const warm = readWarm(); return warm ? { warm, keeper: keeperInfo() } : null; }

/**
 * Does chrome-measure (a lib/lock.mjs status snapshot) have a TIMING holder or waiter: a normal hold (verify.mjs,
 * fix.mjs ab, bench, a normal `lock.mjs run`, a lease taken without --short), not a short job, a shared reader (or the
 * switch-off stand-in, `functional`) or a no-timing hold? Returns a short text naming it, or null.
 */
export function timingDemand(st) {
  const h = st?.holder;
  const timing = (x) => x && !x.short && !x.shared && !x.functional && !x.noTiming && !Array.isArray(x.readers);
  if (h && !st.stale && timing(h)) return `chrome-measure is held by "${h.owner}" (a timing hold)`;
  const w = (st?.queue || []).find(timing);
  return w ? `"${w.owner}" waits for a timing hold of chrome-measure` : null;
}

/** One line on the warm device for `sim.mjs status` / `lock.mjs status` / NOTEs, or null. */
export function warmLine(s = warmState(), now = Date.now()) {
  if (!s) return null;
  const w = s.warm, k = s.keeper;
  const idle = w.lastSessionEndedAt ? Math.max(0, Math.round((now - Date.parse(w.lastSessionEndedAt)) / 1000)) : null;
  const keeper = k?.alive ? `keeper pid ${k.pid}` : `keeper ${k ? `pid ${k.pid} DEAD` : 'MISSING'}: node tools/sim.mjs shutdown`;
  return `warm: fw-sim booted, idle${idle != null ? ` ${idle} s` : ''} since the session of "${w.lastOwner ?? '?'}" (${w.sessions ?? '?'} session(s) on this boot since ${w.bootedAt ?? '?'}); shuts down by ${w.idleUntil ?? '?'} or when a timing hold is queued; ${keeper}`;
}
/** The record field timed tools keep (verify.json host.simWarm, a phone run's mac.simWarm): null when no warm device. */
export function warmSummary(s = warmState(), now = Date.now()) {
  if (!s) return null;
  const w = s.warm;
  return { bootedAt: w.bootedAt ?? null, lastSessionEndedAt: w.lastSessionEndedAt ?? null, idleUntil: w.idleUntil ?? null, sessions: w.sessions ?? null, keeperAlive: !!s.keeper?.alive, at: new Date(now).toISOString() };
}

const reapArgs = (reason, by) => [SIM_MJS, 'shutdown', '--warm-only', '--reason', reason, '--by', by];
const reapResult = (r, before) => {
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = r.status === 0;
  const done = ok && /^SIM_WARM_SHUTDOWN\b/m.test(out);
  return { ...before, action: done ? 'shut down' : ok ? 'gone before the shutdown (the keeper or a session took it)' : 'shutdown FAILED', ok, ...(ok ? {} : { error: out.trim().split('\n').slice(-2).join(' | ') }) };
};
/**
 * The timed tools' backstop (I-063): if a warm fw-sim is recorded, shut it down now (`sim.mjs shutdown --warm-only`:
 * waits for the simulator lock, never touches a live session's device). Returns null (no warm device) or
 * {...warmSummary, action, ok, error?}. `sync`: spawnSync (lib/lock.mjs phoneGuard is synchronous).
 */
export function reapWarmSync({ reason, by = 'timed run', env = process.env } = {}) {
  const before = warmSummary();
  if (!before) return null;
  return reapResult(spawnSync(process.execPath, reapArgs(reason, by), { encoding: 'utf8', env, timeout: 180000 }), before);
}
export function reapWarm({ reason, by = 'timed run', env = process.env } = {}) {
  const before = warmSummary();
  if (!before) return Promise.resolve(null);
  return new Promise((done) => execFile(process.execPath, reapArgs(reason, by), { encoding: 'utf8', env, timeout: 180000 }, (e, stdout, stderr) =>
    done(reapResult({ status: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout, stderr }, before))));
}
/** The NOTE a timed tool prints for reapWarm's result (null: nothing to say). */
export function reapNote(r, what = 'this timing hold') {
  if (!r) return null;
  return r.ok ? `NOTE: a warm Simulator (fw-sim, idle since ${r.lastSessionEndedAt ?? '?'}, keeper ${r.keeperAlive ? 'alive' : 'not running'}) was still booted at the start of ${what}: ${r.action} before the first run (I-063; recorded as simWarm)`
    : `NOTE: a warm Simulator (fw-sim) is booted beside ${what}, and its shutdown failed (${r.error || '?'}): runs may be contaminated; node tools/sim.mjs shutdown (I-063; recorded as simWarm)`;
}

// The warm Simulator (incident I-063): a cold boot of fw-sim takes load1 to 60-95 for about a minute, and a shared hold
// (<= 300 s) can't keep a device booted across holds. So a functional `sim.mjs session` that ends normally leaves fw-sim
// booted (Safari quit, proxy and WDA-sim stopped) for the next session, recorded in <state>/sim/warm.json (mode 600),
// and starts a detached keeper (`sim.mjs keeper <id>`, pidfile sim/keeper.pid.json) that shuts it down
//   - after the idle timeout: FW_SIM_IDLE_SEC (default IDLE_SEC_DEFAULT) after the last session ended (0: no warm device,
//     every session shuts down at its end as before I-063);
//   - as soon as chrome-measure has a TIMING holder or waiter (timingDemand: a normal hold, not short, shared or
//     no-timing), so that waiter's host gate settles on a Mac without it;
//   - never while a session holds the `simulator` lock (it backs off and polls again); `sim.mjs shutdown` stops it now.
// The device belongs to the live session (sim/session.json) or to the keeper (warm.json), never both: the next functional
// session takes it over under the `simulator` lock (stops the keeper, removes warm.json, resets Safari: tools/lib/sim.mjs);
// a timing session shuts it down there and cold-boots. A shutdown counts only once fw-sim reads Shutdown: a failed one
// keeps warm.json (marked shutdownFailed) and the keeper, and the timed tools refuse (WAIT) beside it.
// This file only READS that state (no simctl, no lock.mjs import), so lib/lock.mjs (phone runs), verify.mjs, bench.mjs
// and lock.mjs status can show it cheaply. reapWarm() is the timed tools' backstop: `sim.mjs shutdown --warm-only`
// (under the simulator lock; never a live session's device) when a warm device is still booted at the start of a
// timing hold (its keeper dead or late).
import os from 'node:os';
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
/** When the Mac last started (ms; os.uptime, no subprocess). */
export const macBootMs = (now = Date.now()) => now - os.uptime() * 1000;
/**
 * {warm, keeper, stale} while warm.json exists, else null. `stale` (review-i063 N3): the record is older than the Mac's
 * last start, so fw-sim has not been booted since it was written (a restart shuts every Simulator down). This file runs
 * no simctl; `sim.mjs status`, doctor and the reap read the real device state.
 */
export function warmState(now = Date.now()) {
  const warm = readWarm();
  if (!warm) return null;
  const at = Date.parse(warm.lastSessionEndedAt ?? warm.bootedAt ?? '');
  return { warm, keeper: keeperInfo(), stale: Number.isFinite(at) && at < macBootMs(now) - 5000 };
}

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

/**
 * One line on the warm device for `sim.mjs status` / `lock.mjs status` / NOTEs, or null. "booted" only when nothing
 * says otherwise (review-i063 N3): `devState` (the real state, when the caller read it) other than Booted, or a record
 * older than the Mac's last start, is a STALE record; with its keeper dead (and no devState) the state is unchecked.
 */
export function warmLine(s = warmState(), now = Date.now(), { devState } = {}) {
  if (!s) return null;
  const w = s.warm, k = s.keeper;
  const clear = 'node tools/sim.mjs shutdown clears it';
  if (devState !== undefined && devState !== 'Booted') return `warm: STALE record: fw-sim is ${devState ?? 'not found'} (the record of the session of "${w.lastOwner ?? '?'}" at ${w.lastSessionEndedAt ?? '?'}); ${clear}`;
  if (s.stale && devState === undefined) return `warm: STALE record: the Mac restarted at ${new Date(macBootMs(now)).toISOString()}, after the session of "${w.lastOwner ?? '?'}" at ${w.lastSessionEndedAt ?? '?'} (fw-sim not booted since); ${clear}`;
  const idle = w.lastSessionEndedAt ? Math.max(0, Math.round((now - Date.parse(w.lastSessionEndedAt)) / 1000)) : null;
  const keeper = k?.alive ? `keeper pid ${k.pid}` : `keeper ${k ? `pid ${k.pid} DEAD` : 'MISSING'}: node tools/sim.mjs shutdown`;
  const failed = w.shutdownFailed ? `; its last shutdown FAILED (${w.shutdownFailed.at}, by ${w.shutdownFailed.by}): node tools/sim.mjs doctor --fix` : '';
  return `warm: fw-sim ${devState === 'Booted' || k?.alive ? 'booted' : 'recorded as booted (state unchecked)'}, idle${idle != null ? ` ${idle} s` : ''} since the session of "${w.lastOwner ?? '?'}" (${w.sessions ?? '?'} session(s) on this boot since ${w.bootedAt ?? '?'}); shuts down by ${w.idleUntil ?? '?'} or when a timing hold is queued; ${keeper}${failed}`;
}
/** The record field timed tools keep (verify.json host.simWarm, a phone run's mac.simWarm): null when no warm device. */
export function warmSummary(s = warmState(), now = Date.now()) {
  if (!s) return null;
  const w = s.warm;
  return { bootedAt: w.bootedAt ?? null, lastSessionEndedAt: w.lastSessionEndedAt ?? null, idleUntil: w.idleUntil ?? null, sessions: w.sessions ?? null, keeperAlive: !!s.keeper?.alive, ...(s.stale ? { stale: true } : {}), ...(w.shutdownFailed ? { shutdownFailed: w.shutdownFailed } : {}), at: new Date(now).toISOString() };
}
/** Seconds a quiet phone run waits after a reap that shut fw-sim down (review-i063 N6; FW_SIM_SETTLE_SEC, default 20). */
export function settleSec(env = process.env) {
  const v = env.FW_SIM_SETTLE_SEC;
  if (v === undefined || v === '') return 20;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`FW_SIM_SETTLE_SEC must be a number of seconds >= 0 (got ${v})`);
  return n;
}

const reapArgs = (reason, by) => [SIM_MJS, 'shutdown', '--warm-only', '--reason', reason, '--by', by];
/**
 * `sim.mjs shutdown --warm-only`'s outcome (review-i063 B1/N3): ok only with exit 0 and no SIM_WARM_SHUTDOWN_FAILED.
 * action: 'shut down' (shutDown: the Mac needs to settle), 'already shut down (a stale record, removed)' (stale: nothing
 * was booted), 'gone before the shutdown (...)' (the keeper or a session took it), or 'shutdown FAILED' (ok false: the
 * device may still be booted, and the timed tools refuse).
 */
export const reapResult = (r, before) => {
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = r.status === 0 && !/^SIM_WARM_SHUTDOWN_FAILED\b/m.test(out);
  const done = ok && /^SIM_WARM_SHUTDOWN\b/m.test(out);
  const already = done && /^SIM_WARM_SHUTDOWN\b.*: fw-sim already shut down/m.test(out);
  const action = !ok ? 'shutdown FAILED' : already ? 'already shut down (a stale record, removed)' : done ? 'shut down' : 'gone before the shutdown (the keeper or a session took it)';
  return { ...before, action, ok, ...(done && !already ? { shutDown: true } : {}), ...(already ? { stale: true } : {}), ...(ok ? {} : { error: out.trim().split('\n').slice(-2).join(' | ') }) };
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
/**
 * The line a timed tool prints for reapWarm's result (null: nothing to say): a NOTE when ok, else the WAIT refusal
 * (review-i063 B2: verify.mjs, bench and quiet phone runs time nothing beside a device they could not shut down).
 */
export function reapNote(r, what = 'this timing hold') {
  if (!r) return null;
  if (!r.ok) return `WAIT: a warm Simulator (fw-sim) may still be booted and its shutdown failed (${r.error || '?'}): nothing is timed beside it, so ${what} stops here; node tools/sim.mjs doctor --fix (or shutdown), then retry (I-063)`;
  if (r.stale) return `NOTE: a stale warm Simulator record (fw-sim, session ended ${r.lastSessionEndedAt ?? '?'}) was found at the start of ${what}: fw-sim was not booted, the record was removed; nothing ran beside it (I-063; recorded as simWarm)`;
  return `NOTE: a warm Simulator (fw-sim, idle since ${r.lastSessionEndedAt ?? '?'}, keeper ${r.keeperAlive ? 'alive' : 'not running'}) was still booted at the start of ${what}: ${r.action} before the first run (I-063; recorded as simWarm)`;
}

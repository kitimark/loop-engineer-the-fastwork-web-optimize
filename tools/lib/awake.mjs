// Keep the Mac awake during MEASUREMENTS only (incident I-070, the user's answer to C-024: "Keep awake only during
// measurements"; it narrows I-026, which kept every chrome-measure hold and every queued waiter awake).
//
// What counts as a measurement (each gets one `caffeinate -i -s` assertion that ends with it):
//   - a timing hold of chrome-measure: a normal exclusive hold (not --short, not --shared, not --no-timing): verify.mjs,
//     fix.mjs ab, bench gain/calibrate/reconfirm taking the lock themselves, a normal `lock.mjs run` (-w <holder pid>), and
//     a normal lease (`lock.mjs acquire`, -t <seconds until it expires>, replaced on renew). Its holder record carries
//     `awake: true` (lib/lock.mjs tryAcquire, `awakeHold`);
//   - a `lock.mjs run --no-timing` hold whose command wraps a phone part (iphone.mjs scroll|record|run|gesture) or a
//     Simulator session (sim.mjs session): `wrapsMeasurement` on the command line (the hold covers the cooling waits
//     between a block's runs too);
//   - the measuring processes themselves, wherever they run (own hold, beside a shared group, inside any wrapper):
//     iphone.mjs scroll|record|run|gesture and sim.mjs session (functional included: its memory counts are measured)
//     call keepAwakeFor(), `caffeinate -i -s -w <own pid>`, recorded in locks/awake/<pid>.json.
// Never: --shared jobs (npm test, fix.mjs check, probes, bench mech), --short jobs, plain --no-timing holds (builds),
// queue waits and gate waits, wait.mjs, iphone/simulator leases. A --shared hold that wraps sim.mjs session needs nothing:
// the session's own assertion covers it.
//
// Why -s too (lead, I-070): -i (PreventUserIdleSystemSleep) "has no effect if the system is in Dark Wake" (Apple
// IOPMLib.h, kIOPMAssertPreventUserIdleSystemSleep; CONFIRMED). Once the Mac idle-slept between measurements, a hold that
// starts in a DarkWake is kept up only by -s (PreventSystemSleep, AC power only; OBSERVED 2026-10-02 20:11:40-20:12:29: a
// hold's caffeinate -i -s kept a DarkWake until it ended, Maintenance Sleep 9 s later). Both are assertions: no pmset
// setting changes, no -d (the display may sleep), no sudo.
//
// Lifetime: -w <pid> ends the assertion with that process, crash included; a lease's -t ends it at expiry; release
// (stopAwake) ends it at once. The hold assertion's pid is recorded in locks/<resource>.awake.json with the holder's
// token; a new assertion for the resource replaces the old one.
// Switches: FW_NO_CAFFEINATE=1 (or FW_CAFFEINATE=off) turns it off; $FW_CAFFEINATE picks the binary (tests:
// tests/fixtures/fake-caffeinate.mjs); without a binary, or off macOS, it is a silent no-op; a test process
// ($NODE_TEST_CONTEXT) without $FW_CAFFEINATE never starts the real one.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';

export const AWAKE_RESOURCES = new Set(['chrome-measure']);
/** The assertion flags: idle sleep (-i) and system sleep on AC (-s, holds a DarkWake); never -d, -u or settings. */
export const AWAKE_FLAGS = Object.freeze(['-i', '-s']);
const file = (r) => join(sharedStateDir(), 'locks', `${r}.awake.json`);
const procDir = () => join(sharedStateDir(), 'locks', 'awake');

/** The caffeinate binary to use, or null (switched off, a test without a fake, not macOS, missing). */
export function caffeinateBin(env = process.env, platform = process.platform) {
  const b = env.FW_CAFFEINATE;
  if (env.FW_NO_CAFFEINATE === '1' || b === 'off' || (b === undefined && env.NODE_TEST_CONTEXT)) return null;
  if (!b && platform !== 'darwin') return null;
  const p = b || '/usr/bin/caffeinate';
  return existsSync(p) ? p : null;
}

/** Spawn a detached caffeinate with `args`; its pid, or null. */
function spawnCaffeinate(args) {
  const b = caffeinateBin();
  if (!b) return null;
  let c;
  try { c = b.endsWith('.mjs') ? spawn(process.execPath, [b, ...args], { detached: true, stdio: 'ignore' }) : spawn(b, args, { detached: true, stdio: 'ignore' }); } catch { return null; }
  c.on('error', () => {});
  c.unref();
  return c.pid || null;
}

/** A hold qualifies by itself (a timing hold of an awake resource), unless `awake` says otherwise (lib/lock.mjs). */
export const awakeHold = (r, { short = false, shared = false, noTiming = false, awake } = {}) =>
  AWAKE_RESOURCES.has(r) && !short && !shared && (awake ?? !noTiming);

/** A command line (argv array or string) that runs a phone part or a Simulator session: a --no-timing hold around it measures. */
export function wrapsMeasurement(cmd) {
  const s = Array.isArray(cmd) ? cmd.join(' ') : String(cmd || '');
  return /\biphone\.mjs['"]?\s+(?:scroll|record|run|gesture)\b|\bsim\.mjs['"]?\s+session\b/.test(s);
}

/** Start the assertion for `holder` (replacing an earlier one) when it is a measurement hold (holder.awake). Returns its pid, or null. */
export function keepAwake(r, holder) {
  if (!AWAKE_RESOURCES.has(r) || !holder?.awake) return null;
  stopAwake(r);
  const left = holder.expiresAt ? (Date.parse(holder.expiresAt) - Date.now()) / 1000 : null;
  const args = [...AWAKE_FLAGS, ...(holder.kind === 'process' && holder.pid ? ['-w', String(holder.pid)] : ['-t', String(Math.max(1, Math.ceil(left ?? 600)))])];
  const pid = spawnCaffeinate(args);
  if (!pid) return null;
  try { mkdirSync(join(sharedStateDir(), 'locks'), { recursive: true }); writeFileSync(file(r), JSON.stringify({ token: holder.token, pid, args, since: new Date().toISOString() })); } catch {}
  return pid;
}

const isCaffeinate = (pid) => { try { return /caffeinate/.test(execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })); } catch { return false; } };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** End the recorded assertion (only the one for `token`, if given). Synchronous (used from 'exit' handlers). */
export function stopAwake(r, token) {
  let rec;
  try { rec = JSON.parse(readFileSync(file(r), 'utf8')); } catch { return false; }
  if (token && rec.token !== token) return false;
  try { unlinkSync(file(r)); } catch {}
  if (!isCaffeinate(rec.pid)) return false; // already gone, or the pid now belongs to another process
  try { process.kill(rec.pid, 'SIGTERM'); return true; } catch { return false; }
}

/** The live assertion of `holder`'s hold: {pid, args, since}, or null (none, another holder's, or gone). */
export function holdAwake(r, holder) {
  let rec;
  try { rec = JSON.parse(readFileSync(file(r), 'utf8')); } catch { return null; }
  return holder && rec.token === holder.token && pidAlive(rec.pid) ? rec : null;
}

/**
 * A measuring process (iphone.mjs scroll|record|run|gesture, sim.mjs session) keeps the Mac awake for its own lifetime:
 * `caffeinate -i -s -w <pid>`, ended by the process's exit (crash included). Once per process. Recorded in
 * locks/awake/<pid>.json ({what, pid, caffeinate, args, since}) for `lock.mjs status`. Returns the caffeinate pid, or null.
 */
const started = new Map();
export function keepAwakeFor(what, pid = process.pid) {
  if (started.has(pid)) return started.get(pid);
  const args = [...AWAKE_FLAGS, '-w', String(pid)];
  const c = spawnCaffeinate(args);
  started.set(pid, c);
  if (!c) return null;
  try { mkdirSync(procDir(), { recursive: true }); writeFileSync(join(procDir(), `${pid}.json`), JSON.stringify({ what, pid, caffeinate: c, args, since: new Date().toISOString() })); } catch {}
  return c;
}

/** The live per-process assertions (keepAwakeFor); records of ended processes are removed. */
export function awakeProcesses() {
  let names = [];
  try { names = readdirSync(procDir()).filter((n) => /^\d+\.json$/.test(n)); } catch { return []; }
  const out = [];
  for (const n of names) {
    const f = join(procDir(), n);
    let rec = null;
    try { rec = JSON.parse(readFileSync(f, 'utf8')); } catch {}
    if (rec && pidAlive(rec.pid) && pidAlive(rec.caffeinate)) out.push(rec);
    else { try { unlinkSync(f); } catch {} }
  }
  return out;
}

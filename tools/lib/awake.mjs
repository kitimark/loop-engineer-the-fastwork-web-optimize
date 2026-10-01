// Keep the Mac awake while chrome-measure is held (incident I-026). On AC power the Mac entered
// "Maintenance Sleep" for 472 s in the middle of a hold: every timer and --max-seconds fired ~8 min late
// and the measurement in flight was worthless. While the lock is held, a `caffeinate -i -s` assertion runs:
//   - a process hold (lock.mjs run, verify.mjs, fix.mjs ab): `-w <holder pid>`, so it ends with the holder
//     even on a crash;
//   - a lease (lock.mjs acquire): `-t <seconds until the lease expires>`, replaced on renew.
// release ends it. The assertion's pid is recorded in locks/<resource>.awake.json with the holder's
// token; a new assertion for the resource replaces the old one. $FW_CAFFEINATE picks the binary
// (tests: tests/fixtures/fake-caffeinate.mjs; "off" disables it); without a binary there is no assertion,
// and a test process ($NODE_TEST_CONTEXT) without $FW_CAFFEINATE never starts the real one.
//
// Reopened (I-026: Deep Idle sleep for 15 min while the lock was free and agents were queued): every
// attempt that leaves a waiter queued also calls keepAwakeQueued(), which keeps ONE shared assertion per
// resource, `caffeinate -i -s -t 600` (QUEUE_AWAKE_SEC, the normal queue-entry TTL), recorded in
// locks/<resource>.queue-awake.json and replaced only when less than half of it is left. So the Mac
// stays awake while anyone keeps polling, and at most ~10 min after the last poll.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';

export const AWAKE_RESOURCES = new Set(['chrome-measure']);
const file = (r) => join(sharedStateDir(), 'locks', `${r}.awake.json`);

function bin() {
  const b = process.env.FW_CAFFEINATE;
  if (b === 'off' || (b === undefined && process.env.NODE_TEST_CONTEXT)) return null;
  const p = b || '/usr/bin/caffeinate';
  return existsSync(p) ? p : null;
}

/** Start the assertion for `holder` (replacing an earlier one). Returns its pid, or null (no binary, other resource). */
export function keepAwake(r, holder) {
  if (!AWAKE_RESOURCES.has(r) || !holder) return null;
  stopAwake(r);
  const b = bin();
  if (!b) return null;
  const left = holder.expiresAt ? (Date.parse(holder.expiresAt) - Date.now()) / 1000 : null;
  const args = ['-i', '-s', ...(holder.kind === 'process' && holder.pid ? ['-w', String(holder.pid)] : ['-t', String(Math.max(1, Math.ceil(left ?? 600)))])];
  let c;
  try { c = b.endsWith('.mjs') ? spawn(process.execPath, [b, ...args], { detached: true, stdio: 'ignore' }) : spawn(b, args, { detached: true, stdio: 'ignore' }); } catch { return null; }
  c.on('error', () => {});
  c.unref();
  if (!c.pid) return null;
  try { mkdirSync(join(sharedStateDir(), 'locks'), { recursive: true }); writeFileSync(file(r), JSON.stringify({ token: holder.token, pid: c.pid, args })); } catch {}
  return c.pid;
}

/** End the recorded assertion (only the one for `token`, if given). Synchronous (used from 'exit' handlers). */
export function stopAwake(r, token) {
  let rec;
  try { rec = JSON.parse(readFileSync(file(r), 'utf8')); } catch { return false; }
  if (token && rec.token !== token) return false;
  try { unlinkSync(file(r)); } catch {}
  let cmd = '';
  try { cmd = execFileSync('ps', ['-o', 'command=', '-p', String(rec.pid)], { encoding: 'utf8' }); } catch {}
  if (!/caffeinate/.test(cmd)) return false; // already gone, or the pid now belongs to another process
  try { process.kill(rec.pid, 'SIGTERM'); return true; } catch { return false; }
}

export const QUEUE_AWAKE_SEC = 600;
const qfile = (r) => join(sharedStateDir(), 'locks', `${r}.queue-awake.json`);
const isCaffeinate = (pid) => { try { return /caffeinate/.test(execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })); } catch { return false; } };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * A waiter is queued for `r`: make sure the shared queue assertion has at least half of QUEUE_AWAKE_SEC
 * left (start or replace it). Cheap while it is fresh (a file read, no spawn). Returns its pid, or null.
 * Two waiters racing past a stale record may both start one; the extra one ends by itself within 10 min.
 */
export function keepAwakeQueued(r, now = Date.now()) {
  if (!AWAKE_RESOURCES.has(r)) return null;
  let rec = null;
  try { rec = JSON.parse(readFileSync(qfile(r), 'utf8')); } catch {}
  if (rec && rec.until - now > QUEUE_AWAKE_SEC * 500 && pidAlive(rec.pid)) return rec.pid;
  const b = bin();
  if (!b) return null;
  const args = ['-i', '-s', '-t', String(QUEUE_AWAKE_SEC)];
  let c;
  try { c = b.endsWith('.mjs') ? spawn(process.execPath, [b, ...args], { detached: true, stdio: 'ignore' }) : spawn(b, args, { detached: true, stdio: 'ignore' }); } catch { return null; }
  c.on('error', () => {});
  c.unref();
  if (!c.pid) return null;
  try { mkdirSync(join(sharedStateDir(), 'locks'), { recursive: true }); writeFileSync(qfile(r), JSON.stringify({ pid: c.pid, until: now + QUEUE_AWAKE_SEC * 1000, args })); } catch {}
  if (rec && rec.pid !== c.pid && isCaffeinate(rec.pid)) { try { process.kill(rec.pid, 'SIGTERM'); } catch {} }
  return c.pid;
}

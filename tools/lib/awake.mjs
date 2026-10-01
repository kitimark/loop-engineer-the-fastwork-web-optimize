// Keep the Mac awake while chrome-measure is held (incident I-026). On AC power the Mac entered
// "Maintenance Sleep" for 472 s in the middle of a hold: every timer and --max-seconds fired ~8 min late
// and the measurement in flight was worthless. While the lock is held, a `caffeinate -i -s` assertion runs:
//   - a process hold (lock.mjs run, verify.mjs, fix.mjs ab): `-w <holder pid>`, so it ends with the holder
//     even on a crash;
//   - a lease (lock.mjs acquire): `-t <seconds until the lease expires>`, replaced on renew.
// release ends it. The assertion's pid is recorded in locks/<resource>.awake.json with the holder's
// token; a new assertion for the resource replaces the old one. $FW_CAFFEINATE picks the binary
// (tests: tests/fixtures/fake-caffeinate.mjs; "off" disables it); without a binary there is no assertion.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';

export const AWAKE_RESOURCES = new Set(['chrome-measure']);
const file = (r) => join(sharedStateDir(), 'locks', `${r}.awake.json`);

function bin() {
  const b = process.env.FW_CAFFEINATE;
  if (b === 'off') return null;
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

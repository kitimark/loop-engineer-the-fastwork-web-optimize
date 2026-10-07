// Our own thermal condition's holder (incident I-199 tools/thermal.mjs; I-233): a running `thermal.mjs set` writes
// <state>/thermal/holder.json {pid, owner, group, profile, since, until} and removes it when it ends. A holder counts
// only while its pid lives and is a thermal.mjs process (a killed set leaves the file behind). Shared by thermal.mjs
// (set refuses beside a live one, clear stops it, status prints HOLDER) and the phone's thermal reads (lib/thermal-profile
// readThermal: who holds an induced condition, ours or another client such as Xcode).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { readJson } from './store.mjs';

export const holderFile = () => join(sharedStateDir(), 'thermal', 'holder.json');
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const psArgs = (pid) => { try { return execFileSync('ps', ['-o', 'args=', '-p', String(pid)]).toString(); } catch { return ''; } };

/** Our running `set` ({pid, owner, group, profile, since, until}), or null. Seams: alive(pid), argsOf(pid). */
export function liveHolder({ file = holderFile(), alive = pidAlive, argsOf = psArgs } = {}) {
  const h = readJson(file);
  if (!h?.pid || !alive(h.pid)) return null;
  return /thermal\.mjs/.test(argsOf(h.pid) || '') ? h : null;
}

// `node tools/iphone.mjs battery [--every 30] [--seconds N] [--out f.jsonl]` (incident I-075, de-heat's work-at-rest
// heat test, research/phone-heat): a read-only battery logger. One idevicediagnostics AppleSmartBattery read
// (tools/lib/iphone-run.mjs batteryInfo: the whitelisted BATTERY_KEYS only, never serials or ids, Hard rule 12) at
// the start and then every --every s until --seconds have passed (no --seconds: one read). Each read is one JSON line
// on stdout and, with --out, appended to that file; a failed read is a line with `error` and the logger goes on.
// Like `wait.mjs phone-temp` it needs no iphone lease and opens no page: it reads the battery over USB, nothing else.
// Exit 0 when at least one read succeeded, 1 when none did, 2 on a usage error. A summary line goes to stderr.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { batteryInfo } from './iphone-run.mjs';
import { REPO } from './paths.mjs';

export const BATTERY_USAGE = 'usage: node tools/iphone.mjs battery [--every 30] [--seconds N] [--out file.jsonl]   (no lease, no page; one read without --seconds)';
export const BATTERY_LIMITS = Object.freeze({ minEvery: 1, maxSeconds: 86400 });

/** argv options -> {everyMs, seconds, out}. Throws with the usage on bad input. Pure. */
export function parseBatteryArgs(opt) {
  const every = Number(opt('every', 30)), seconds = Number(opt('seconds', 0)), out = opt('out', null);
  if (!Number.isFinite(every) || every < BATTERY_LIMITS.minEvery) throw new Error(`--every must be a number of seconds >= ${BATTERY_LIMITS.minEvery} (got ${opt('every')})\n${BATTERY_USAGE}`);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > BATTERY_LIMITS.maxSeconds) throw new Error(`--seconds must be a number from 0 to ${BATTERY_LIMITS.maxSeconds} (got ${opt('seconds')})\n${BATTERY_USAGE}`);
  if (out !== null && (typeof out !== 'string' || !out || out.startsWith('--'))) throw new Error(`--out needs a file\n${BATTERY_USAGE}`);
  return { everyMs: every * 1000, seconds, out };
}

/**
 * Read at start, start + every, ... while the offset is <= seconds (drift-free: each read is scheduled from the start).
 * `read()` -> batteryInfo's shape; `write(line)` gets each JSON line. Returns {reads, ok, errors}.
 */
export async function batteryLog({ everyMs, seconds }, { read = batteryInfo, write = (l) => console.log(l), now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const t0 = now(), n = Math.floor((seconds * 1000) / everyMs) + 1;
  let ok = 0, errors = 0;
  for (let i = 0; i < n; i++) {
    const wait = t0 + i * everyMs - now();
    if (wait > 0) await sleep(wait);
    const r = read();
    const rec = { i, t: r?.t ?? new Date().toISOString(), ...r };
    if (r?.error) errors++; else ok++;
    write(JSON.stringify(rec));
  }
  return { reads: n, ok, errors };
}

export async function batteryCmd({ opt }) {
  let o;
  try { o = parseBatteryArgs(opt); } catch (e) { console.error(e.message); return 2; }
  const file = o.out ? resolve(REPO, o.out) : null;
  if (file) mkdirSync(dirname(file), { recursive: true });
  const write = (l) => { console.log(l); if (file) appendFileSync(file, l + '\n'); };
  const r = await batteryLog(o, { write });
  console.error(`BATTERY ${r.reads} read(s), ${r.ok} ok, ${r.errors} failed${file ? `; appended to ${file}` : ''}`);
  return r.ok > 0 ? 0 : 1;
}

// Free disk space thresholds (incident I-124: the Data volume filled again, 10 GB free at 06:24Z on 2026-10-04, after
// I-095's ~13 GB cleanup; the user cleaned ~19 GB by hand). Cheap: one statfs, no process spawned, no file walked.
// Imported by lib/lock.mjs (the timing-hold refusal) and lib/space-watch.mjs (the alarm), so it imports neither.
//
//   FW_TIMING_MIN_FREE_GB  below this, no NEW timing hold of chrome-measure is granted (default 8; 0 = off).
//                          Holds already running, re-entered holds, shared, short and --no-timing holds and phone runs
//                          (a `run` wrapping iphone.mjs scroll|record|run|gesture) are not affected (lead's ruling, I-124).
//   FW_SPACE_ALARM_GB      below this, the disk alarm (idle.mjs watch and check, lib/space-watch.mjs) posts one console thread to the
//                          lead and the desk (default 20; 0 = off).
//   FW_DISK_FREE_GB        tests only: pretend this many GB are free (a fake reading; never set it for a real run).
import { statfsSync } from 'node:fs';

export const GiB = 1024 ** 3;
export const DEFAULT_TIMING_MIN_GB = 8;
export const DEFAULT_ALARM_GB = 20;

const gbEnv = (env, name, def) => {
  const s = env[name];
  if (s === undefined || s === '') return def;
  const v = Number(s);
  return Number.isFinite(v) && v >= 0 ? v : def;
};
/** The timing-hold floor in GB ($FW_TIMING_MIN_FREE_GB, default 8; 0 = off). */
export const timingMinGb = (env = process.env) => gbEnv(env, 'FW_TIMING_MIN_FREE_GB', DEFAULT_TIMING_MIN_GB);
/** The alarm threshold in GB ($FW_SPACE_ALARM_GB, default 20; 0 = off). */
export const alarmGb = (env = process.env) => gbEnv(env, 'FW_SPACE_ALARM_GB', DEFAULT_ALARM_GB);

/** {freeBytes, totalBytes, fake} of the volume holding `path`; $FW_DISK_FREE_GB fakes freeBytes (tests). null on error. */
export function diskFree(path, env = process.env) {
  let s;
  try { s = statfsSync(path); } catch { return null; }
  const real = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize, fake: false };
  const f = env.FW_DISK_FREE_GB;
  if (f !== undefined && f !== '' && Number.isFinite(Number(f)) && Number(f) >= 0) return { ...real, freeBytes: Math.round(Number(f) * GiB), fake: true };
  return real;
}
/** Does a `lock.mjs run` command wrap a phone run (iphone.mjs scroll|record|run|gesture)? Those are never refused for disk. */
export function wrapsPhoneRun(cmd) {
  const s = Array.isArray(cmd) ? cmd.join(' ') : String(cmd || '');
  return /\biphone\.mjs['"]?\s+(?:scroll|record|run|gesture)\b/.test(s);
}
export const fmtGb = (bytes) => `${(bytes / GiB).toFixed(1)} GB`;

/**
 * Why a NEW timing hold may not start now, or null: the volume holding `path` (the lock state dir) has less than
 * timingMinGb() free. A measurement on a nearly full disk can die midway (Chrome profile, trace or screenshot writes
 * fail) or run slower (the OS purges and compresses under disk pressure), and its result would not compare.
 */
export function timingDiskRefusal(path, env = process.env) {
  const min = timingMinGb(env);
  if (!min) return null;
  const d = diskFree(path, env);
  if (!d || d.freeBytes >= min * GiB) return null;
  return `DISK-LOW: only ${fmtGb(d.freeBytes)} free on this disk (under ${min} GB): no new timing hold starts on a nearly full disk (I-124), a measurement could fail midway or slow down. Shared, short and --no-timing holds and phone runs still run. To free space: (1) see what auto-clean removes (leftover Chrome profiles, uncited full-frame images, rebuildable snapshot copies; never JSON, logs or records): node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools/space.mjs prune, then the same with prune --apply (removals logged in space/prune.log); (2) the biggest folders and their owners: node tools/space.mjs report (sections 5-6), and ask those owners; (3) tell the lead.`;
}

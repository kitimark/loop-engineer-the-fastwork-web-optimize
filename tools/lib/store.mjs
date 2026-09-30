// Small helpers for the JSON-file stores in the shared state dir (tools/lib/incident.mjs,
// tools/lib/finding.mjs): one pretty JSON file per record, named <PREFIX>-<nnn>.json, written
// atomically (temp file + rename) inside the lock library's mkdir guard (withGuard in ./lock.mjs).
import { readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const iso = (t = Date.now()) => new Date(t).toISOString();

/** Keep the tail of long text (the end of a log is the useful part). */
export const clip = (s, n = 8000) => (s == null ? undefined : String(s).length > n ? '…' + String(s).slice(-n) : String(s));

/** Atomic write: readers see the old file or the new one, never a partial one. */
export function writeJson(f, v) {
  const t = `${f}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(t, JSON.stringify(v, null, 1));
  renameSync(t, f);
}

export function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }

/** "3", "f-3", "F-003" -> "F-003" for prefix "F"; throws `bad <noun> id` on anything else. */
export function idParser(prefix, noun) {
  const re = new RegExp(`^(?:${prefix}-?)?0*(\\d{1,6})$`, 'i');
  return (s) => {
    const m = String(s ?? '').trim().match(re);
    if (!m) throw new Error(`bad ${noun} id "${s}" (expected e.g. ${prefix}-003)`);
    return `${prefix}-${m[1].padStart(3, '0')}`;
  };
}

export const idNumber = (id) => Number(String(id).replace(/^[A-Z]+-/, '')) || 0;

/** Every record in `dir` named <prefix>-<n>.json, oldest (lowest id) first. Unreadable files are skipped. */
export function readAll(dir, prefix) {
  let names = [];
  const re = new RegExp(`^${prefix}-\\d+\\.json$`);
  try { names = readdirSync(dir).filter((f) => re.test(f)); } catch {}
  const items = names.map((f) => readJson(join(dir, f))).filter(Boolean);
  return items.sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** The next free id after the highest one in `items`. */
export function nextId(items, prefix) {
  const n = items.reduce((m, i) => Math.max(m, idNumber(i.id)), 0) + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

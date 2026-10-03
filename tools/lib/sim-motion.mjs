// The Simulator's Reduce Motion switch (incident I-100): `sim.mjs session [--functional] --reduce-motion on|off -- <cmd>`
// sets it for the session and restores the value it found at the session's end, so PR-010's T2 rule ("reduced motion
// exact" in Chrome AND WebKit, memory/illusion-must-be-pixel-identical.md) has a WebKit leg. `simctl ui` has no reduce
// motion option (Xcode 26.6: appearance, increase_contrast, content_size only).
//
// Mechanism: `xcrun simctl spawn <udid> defaults write com.apple.Accessibility ReduceMotionEnabled -bool true|false`
// (`defaults delete` for "unset", the iOS default: off). The key and domain are OBSERVED (in our setup: Xcode 26.6,
// iOS 26.5 runtime, 2026-10-04; no Apple document names them): with it written, a page in the Simulator's Safari
// reports matchMedia('(prefers-reduced-motion: reduce)').matches true, also on a page already open (live), and false
// again after writing false. The session writes it after Safari is terminated and before it launches (bootDevice's
// beforeLaunch), so the first page already sees it either way.
// How WebKit reads it on iOS (CONFIRMED, WebKit main 10740b3a1fa50537a0fbea349eb9130ac609d852):
//   - Source/WebCore/css/query/MediaQueryFeatures.cpp:629-642: prefers-reduced-motion is `reduce` when
//     Theme::singleton().userPrefersReducedMotion() (unless a forced setting overrides it);
//   - Source/WebCore/platform/ios/ThemeIOS.mm:49-51: ThemeIOS::userPrefersReducedMotion() =
//     UIAccessibilityIsReduceMotionEnabled() (UIKit's accessibility setting, Settings > Accessibility > Motion);
//   - Source/WebKit/UIProcess/Cocoa/WebProcessPoolCocoa.mm:272, 1033: the UI process (Safari) reads
//     AXPreferenceHelpers::reduceMotionEnabled() and re-sends it to every web process on kAXSReduceMotionChangedNotification;
//     Source/WebKit/WebProcess/cocoa/WebProcessCocoa.mm:1217-1219 applies it there (_AXSSetReduceMotionEnabledApp).
// That the defaults key above is what UIAccessibilityIsReduceMotionEnabled / libAccessibility read is the OBSERVED part.
//
// Never left behind: a record <state>/sim/reduce-motion.json (mode 600: session, owner, device key, previous value, set
// value) is written BEFORE the change and removed after the restore. A session killed before its cleanup (SIGKILL), or
// whose restore failed, leaves it; the next session of that device restores it right after boot, before Safari
// launches (restorePending), and `sim.mjs status` / `doctor` show it (doctor --fix restores it on a booted device).
// Only one record at a time: sessions are serialized by the `simulator` lock.
import { readFileSync, rmSync } from 'node:fs';

export const RM_DOMAIN = 'com.apple.Accessibility';
export const RM_KEY = 'ReduceMotionEnabled';
export const RM_MODES = Object.freeze(['on', 'off']);

/** `--reduce-motion` value: 'on' | 'off' | null (not given). Anything else, or the flag without a value, throws. */
export function parseReduceMotion(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !RM_MODES.includes(v)) throw new Error(`--reduce-motion takes on or off (got ${typeof v === 'string' && v ? v : 'no value'})`);
  return v;
}
/** true / false / null (key absent: iOS's default, off). */
export const fmtRM = (v) => (v === true ? 'on' : v === false ? 'off' : 'unset (off)');
const failText = (r) => (r.error ? r.error.code || r.error.message : `exit ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ')}`);
const defaults = (udid, ...a) => ['spawn', udid, 'defaults', ...a];

/** The device's Reduce Motion setting: true, false, or null when the key is absent. The device must be booted. */
export function readReduceMotion(udid, { simctl }) {
  const r = simctl(defaults(udid, 'read', RM_DOMAIN, RM_KEY));
  if (r.status === 0) {
    const v = (r.stdout || '').trim();
    if (v === '1') return true;
    if (v === '0') return false;
    throw new Error(`defaults read ${RM_DOMAIN} ${RM_KEY} printed "${v.slice(0, 40)}", not 0 or 1`);
  }
  if (/does not exist/.test(`${r.stderr || ''}${r.stdout || ''}`)) return null;
  throw new Error(`could not read Reduce Motion (simctl spawn defaults read: ${failText(r)})`);
}
/** Set it (true / false; null deletes the key) and read it back; throws when the read-back differs. */
export function writeReduceMotion(udid, value, { simctl }) {
  const r = value === null ? simctl(defaults(udid, 'delete', RM_DOMAIN, RM_KEY)) : simctl(defaults(udid, 'write', RM_DOMAIN, RM_KEY, '-bool', value ? 'true' : 'false'));
  if (r.status !== 0 && !(value === null && /does not exist|not found/i.test(`${r.stderr || ''}${r.stdout || ''}`))) throw new Error(`could not set Reduce Motion on the Simulator to ${fmtRM(value)} (simctl spawn defaults: ${failText(r)})`);
  const now = readReduceMotion(udid, { simctl });
  if (now !== value) throw new Error(`Reduce Motion reads ${fmtRM(now)} after setting it ${fmtRM(value)}`);
  return now;
}

export function readPending(file) { try { const p = JSON.parse(readFileSync(file, 'utf8')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
/** One line about a record no session restored yet (status / doctor). */
export const pendingLine = (p) => `Reduce Motion left ${fmtRM(p.set)} by session ${p.session} (owner ${p.owner}, ${p.device}) at ${p.at}: the next ${p.device} session restores it to ${fmtRM(p.previous)} (I-100)`;

/** Set Reduce Motion for session `session`: record first (`writeFile(file, text)`, mode 600), then the change. */
export function applyReduceMotion({ file, udid, mode, session, owner, device, simctl, writeFile }) {
  const want = parseReduceMotion(mode) === 'on';
  const previous = readReduceMotion(udid, { simctl });
  writeFile(file, JSON.stringify({ session, owner, device, previous, set: want, at: new Date().toISOString() }, null, 1));
  const value = writeReduceMotion(udid, want, { simctl });
  return { requested: mode, previous, value };
}
/** At the session's end: back to the value this session found. null when this session set nothing (or it was done). */
export function restoreReduceMotion({ file, udid, session, simctl }) {
  const p = readPending(file);
  if (!p || p.session !== session) return null;
  const value = writeReduceMotion(udid, p.previous ?? null, { simctl });
  rmSync(file, { force: true });
  return { restored: p.previous ?? null, value };
}
/** At a session's start (booted, Safari not running, under the simulator lock): restore a record an earlier session of
 *  this device left (killed, or its restore failed). Another device's record stays for that device's next session. */
export function restorePending({ file, udid, device, simctl }) {
  const p = readPending(file);
  if (!p || p.device !== device) return null;
  writeReduceMotion(udid, p.previous ?? null, { simctl });
  rmSync(file, { force: true });
  return { session: p.session ?? null, owner: p.owner ?? null, previous: p.previous ?? null, set: p.set ?? null, at: p.at ?? null, restoredAt: new Date().toISOString() };
}

/** Runs in the page (over the session's proxy): what CSS sees. */
export const PAGE_MOTION_JS = `JSON.stringify({reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, noPreference: matchMedia('(prefers-reduced-motion: no-preference)').matches})`;
/** The page's answer against the session's --reduce-motion (null: not checked, only reported). */
export function pageVerdict(page, want) {
  const sane = !!page && typeof page.reduce === 'boolean' && page.reduce !== page.noPreference;
  const media = !sane ? `unreadable (${JSON.stringify(page)})` : page.reduce ? 'reduce' : 'no-preference';
  if (!want) return { ok: true, media, line: `REDUCE_MOTION page ${media} (session without --reduce-motion: not checked)` };
  const ok = sane && page.reduce === (want === 'on');
  return { ok, media, line: `REDUCE_MOTION page ${media} (session --reduce-motion ${want}): ${ok ? 'ok' : `MISMATCH: the page should report ${want === 'on' ? 'reduce' : 'no-preference'} (I-100)`}` };
}

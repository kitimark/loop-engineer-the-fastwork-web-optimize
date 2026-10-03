// Device rotation for the Simulator (incident I-087, user T-040): `sim.mjs orient portrait|landscape` turns the booted
// Simulator (fw-sim or an iPad) through WDA-sim (XCUIDevice orientation, WDA's POST /session/:id/orientation,
// FBOrientationCommands.m) and reads it back. The call goes out marked `simulator: true` to WDA-sim's port (8101 by
// default, never the phone's 8100): tools/lib/wda.mjs refuses orientation for anything else, so the physical iPhone is
// never rotated. No timing: a functional session may run it.
import { createSession, ORIENTATIONS, WdaError } from './wda.mjs';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Rotate to `want` ('portrait' | 'landscape') unless it already is, wait settleMs for Safari's relayout, and check WDA
 * reads it back. Returns {before, now} (lower case). Throws WdaError when WDA refuses, or when it reads another value.
 */
export async function orient(want, { base, settleMs = 1500, log = () => {}, sleep = pause } = {}) {
  const asked = want;
  want = String(want).toLowerCase();
  const v = Object.hasOwn(ORIENTATIONS, want) ? ORIENTATIONS[want] : null;
  if (!v) throw new WdaError(`orientation must be ${Object.keys(ORIENTATIONS).join(' or ')} (got ${asked})`);
  const s = await createSession({ base, simulator: true });
  try {
    const before = String(await s.orientation()).toUpperCase();
    if (before !== v) {
      await s.setOrientation(want);
      log(`rotated ${before.toLowerCase()} -> ${want} (WDA-sim)`);
    } else log(`already ${want}`);
    if (settleMs > 0) await sleep(settleMs);
    const now = String(await s.orientation()).toUpperCase();
    if (now !== v) throw new WdaError(`the Simulator reads ${now.toLowerCase()} after the rotation to ${want}`);
    return { before: before.toLowerCase(), now: now.toLowerCase() };
  } finally { await s.close(); }
}

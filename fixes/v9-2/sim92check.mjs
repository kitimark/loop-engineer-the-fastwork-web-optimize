// P-142 rev 1.4 (lead ruling after the part 1 read): the hard check on sim92's scroll window, shared by sim92.mjs (a load
// failing it is VOID) and part1read.mjs (a window failing it never counts). Pure; no I/O.
// Full-window estimate (written before any rev 1.4 data): the page at 430x775 has docH 6850 (geo92 / every part 1 load),
// so max scrollY = 6850 - 775 = 6075; at STEP 24 px a rAF the driver needs ceil(6075 / 24) = 254 scrollBy steps and
// returns after 255 rAF callbacks (~4.2 s at 60 Hz), and WebKit records at least one RenderingFrame per rAF callback.
// Floors, from the load's own max (so the check does not hard-code 6075):
//   steps = ceil(max / step); frames (the driver's rAF count) >= floor(0.95 * steps) (241 at max 6075);
//   renderingFrames >= floor(0.8 * steps) (203 at max 6075); reached: y >= max - 1; frames and y defined.
// Part 1 (53b0af35) fails every clause: frames undefined, y undefined, renderingFrames 31.
export const FRAC_FRAMES = 0.95, FRAC_RF = 0.8, EST_MAX = 6850 - 775;
export function scrollCheck(w) {
  const why = [];
  if (!w || w.kind !== 'scroll') return { ok: false, why: ['no scroll window'] };
  const step = w.step, max = w.max;
  if (!(step > 0)) why.push(`step ${step}`);
  if (!(max > 0)) why.push(`max ${max} (not defined)`);
  if (w.frames == null) why.push('frames undefined');
  if (w.y == null) why.push('y undefined');
  // with no max recorded (part 1's truncated windows) the floors still come from the written estimate, max 6075
  const steps = step > 0 ? Math.ceil((max > 0 ? max : EST_MAX) / step) : null;
  const floors = steps ? { frames: Math.floor(FRAC_FRAMES * steps), renderingFrames: Math.floor(FRAC_RF * steps) } : null;
  if (floors && w.frames != null && w.frames < floors.frames) why.push(`frames ${w.frames} < ${floors.frames}`);
  if (floors && !(w.renderingFrames >= floors.renderingFrames)) why.push(`renderingFrames ${w.renderingFrames} < ${floors.renderingFrames}`);
  if (max > 0 && w.y != null && w.y < max - 1) why.push(`max scrollY not reached (${w.y} < ${max - 1})`);
  if (w.timeout) why.push(`scroll timeout ${w.timeout} ms`);
  return { ok: why.length === 0, why, steps, floors };
}

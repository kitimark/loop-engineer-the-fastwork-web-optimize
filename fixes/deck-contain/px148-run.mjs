// P-148 triple procedure, shared by px148-chrome.mjs and px148-sim.mjs (same steps in both engines).
// One triple = base -> arm -> base again at one position and mode, under the motion hold (px148-gate.js) with every
// running Web Animation and SVG (SMIL) timeline paused. Steps:
//   1. release any earlier hold; position the page (rest: scrollTo + 700 ms; swipe: the 10-frame scripted step, P-143);
//   2. hold on (Web Animations paused, SMIL paused, page timers and frames held); 2 frames (original rAF);
//   3. settle: shots 250 ms apart until two consecutive shots are equal outside the masks (at most SETTLE_MAX shots);
//      the last one is the base; not equal by then = UNSETTLED (recorded, still judged);
//   4. arm style on, 2 frames, wait, re-pause, geometry, shot (arm); arm style off, 2 frames, wait, re-pause,
//      geometry, shot (base again); hold counters; hold off.
// Masks: the hero clock (+4 CSS px, P-143), and in the Simulator the screen outside the page viewport. A mask that
// meets the footprint F (deck border box + FOOT_PAD CSS px, clipped to the viewport) is dropped and recorded.
import { GEO, ARM, geoDiff } from './geo.mjs';
import { CLOCK, POS, STEP_TO, pngPixels } from './px.mjs';
import { judgeImages, sameImages, intersects, inflate } from './px148.mjs';

export const SETTLE_MAX = 8, SETTLE_MS = 250, FOOT_PAD = 24;
export { POS };
export const HOLD_ON = `(() => {
  const p = document.getAnimations().filter((a) => a.playState === 'running'); for (const a of p) { try { a.pause(); } catch {} }
  window.__dcPaused = (window.__dcPaused || []).concat(p);
  let smil = 0; for (const v of document.querySelectorAll('svg')) { if (v.pauseAnimations && !v.animationsPaused()) { v.pauseAnimations(); smil++; (window.__dcSvg ||= []).push(v); } }
  window.__dcHoldOn(); window.__dcStat(true);
  return { paused: p.length, smil, animateEls: document.querySelectorAll('animate,animateTransform,animateMotion,set').length };
})()`;
export const REPAUSE = `(() => { const p = document.getAnimations().filter((a) => a.playState === 'running'); for (const a of p) { try { a.pause(); } catch {} }
  window.__dcPaused = (window.__dcPaused || []).concat(p); return p.length; })()`;
export const HOLD_OFF = `(() => { if (!window.__dcHoldOff) return -1; const n = window.__dcHoldOff();
  for (const a of window.__dcPaused || []) { try { a.play(); } catch {} } window.__dcPaused = [];
  for (const v of window.__dcSvg || []) { try { v.unpauseAnimations(); } catch {} } window.__dcSvg = []; return n; })()`;
export const RAF2G = `new Promise((r) => window.__dcRAF(() => window.__dcRAF(() => r(1))))`;
export const STAT = `window.__dcStat(false)`;
// held callbacks since the last reset (per phase: settle, arm, back), then reset
export const STAT_RESET = `window.__dcStat(true)`;
export const GATE = `window.__dcGate || null`;
export const DECK = `(() => { const r = document.querySelector('.start-selling-profile-deck').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; })()`;

// footprint F in shot px: deck rect + pad, clipped to the page viewport; cal = { scale, ox, oy }
export function footRect(deck, cal, pad = FOOT_PAD) {
  const [l, t, r, b, iw, ih] = deck, f = inflate([l, t, r, b], pad);
  const c = [Math.max(0, f[0]), Math.max(0, f[1]), Math.min(iw, f[2]), Math.min(ih, f[3])];
  return [Math.floor(c[0] * cal.scale + cal.ox), Math.floor(c[1] * cal.scale + cal.oy), Math.ceil(c[2] * cal.scale + cal.ox) - 1, Math.ceil(c[3] * cal.scale + cal.oy) - 1];
}
// the screen outside the page viewport (Simulator), as up to four rects; cal = { ox, oy, scale, W, H }
export const outsideMasks = (cal, iw, ih) => {
  const v = [Math.round(cal.ox), Math.round(cal.oy), Math.round(cal.ox + iw * cal.scale) - 1, Math.round(cal.oy + ih * cal.scale) - 1], W = cal.W, H = cal.H;
  return [[0, 0, W - 1, v[1] - 1], [0, v[3] + 1, W - 1, H - 1], [0, v[1], v[0] - 1, v[3]], [v[2] + 1, v[1], W - 1, v[3]]]
    .filter((r) => r[2] >= r[0] && r[3] >= r[1]).map((r) => ({ kind: 'outside', r }));
};
// drop any in-page mask that meets F; outside-viewport masks (kind 'outside') never meet F (F is clipped to the viewport)
export function applyFoot(masks, foot) {
  const kept = [], dropped = [];
  for (const m of masks) (m.kind !== 'outside' && intersects(m.r, foot) ? dropped : kept).push(m);
  return { kept, dropped };
}

// io = { ev(expr) -> value (awaits promises), shot() -> png Buffer, sleep(ms), cal: {scale, ox, oy}, dpr, extraMasks: [] ,
//        armWait (ms after the arm toggle), save(tag, {b, a, b2}) }
export async function triple(io, { cfg, pos, y, mode, arm, css }) {
  const t0 = Date.now();
  await io.ev(HOLD_OFF);
  if (mode === 'rest') { await io.ev(`scrollTo({ top: ${y}, behavior: 'instant' })`); await io.sleep(700); } else await io.ev(STEP_TO(y));
  const hold = await io.ev(HOLD_ON); await io.ev(RAF2G);
  const clock = await io.ev(CLOCK), deck = await io.ev(DECK);
  const masks0 = [...(clock ? [{ kind: 'clock', r: clock.map((v, i) => Math.round(v * io.cal.scale + (i % 2 ? io.cal.oy : io.cal.ox))) }] : []), ...io.extraMasks];
  const foot = footRect(deck, io.cal), { kept, dropped } = applyFoot(masks0, foot), masks = kept.map((m) => m.r);
  let curBuf = await io.shot(), prev = pngPixels(curBuf), cur = prev, settled = false, shots = 1, repaused = 0;
  for (; shots < SETTLE_MAX; ) {
    await io.sleep(SETTLE_MS); repaused += await io.ev(REPAUSE);
    curBuf = await io.shot(); cur = pngPixels(curBuf); shots++;
    if (sameImages(prev, cur, masks)) { settled = true; break; }
    prev = cur;
  }
  const b = curBuf, g0 = await io.ev(GEO);
  const stat = { settle: await io.ev(STAT_RESET) };
  // rev 1.1 N3: re-paused animations per phase (an arm-started transition would be frozen mid-way: recorded)
  const rp = { settle: repaused };
  await io.ev(ARM(css, arm)); await io.ev(RAF2G); await io.sleep(io.armWait); rp.arm = await io.ev(REPAUSE); repaused += rp.arm;
  const g1 = await io.ev(GEO); const a = await io.shot();
  stat.arm = await io.ev(STAT_RESET);
  await io.ev(ARM(null)); await io.ev(RAF2G); await io.sleep(io.armWait); rp.back = await io.ev(REPAUSE); repaused += rp.back;
  const g2 = await io.ev(GEO); const b2 = await io.shot();
  stat.back = await io.ev(STAT_RESET); const flushed = await io.ev(HOLD_OFF);
  const j = judgeImages(cur, pngPixels(a), pngPixels(b2), masks, io.dpr, foot);
  const geoArm = geoDiff(g0, g1), geoAA = geoDiff(g0, g2);
  if (Math.abs(g0.sy - g1.sy) > 0.02) geoArm.push(`sy ${g0.sy} -> ${g1.sy}`);
  if (Math.abs(g0.sy - g2.sy) > 0.02) geoAA.push(`sy ${g0.sy} -> ${g2.sy}`);
  const rec = { cfg, pos, mode, arm, y: g0.sy, settled, settleShots: shots, hold, repaused, repausedPhase: rp, stat, flushed, masks, maskKinds: kept.map((m) => m.kind),
    maskDropped: dropped.map((m) => m.kind), foot, geoArm, geoAA, deckH: [g0.deck.h, g1.deck.h], docH: [g0.docH, g1.docH], judge: j, ms: Date.now() - t0 };
  if (j.tier !== 'T0' || !settled || j.aaAny) io.save(`${cfg}-${pos}-${mode}-${arm}`.replace(/[^\w.-]/g, '_'), { b, a, b2 });
  return rec;
}

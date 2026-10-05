// P-148 pixel judge (pure functions; no page, no device). Used by px148-chrome.mjs, px148-sim.mjs, score-p148.mjs and
// selftest-p148.mjs. Definitions follow research/pixel-tolerance/README.md §1 ("tolerance report") and the T2 numbers of
// memory/illusion-must-be-pixel-identical.md (PR-010 option "wide"):
// - a pixel's level = the largest per-channel difference (0-255);
// - A/A = base (b) vs base again (b2); arm difference = base (b) vs arm (a);
// - beyond A/A (T2 counting): arm level > 8 where the A/A level <= 8;
// - fill or edge: a pixel is fill when its 3x3 neighbourhood in b varies by 2 levels or less (per channel), else edge;
// - largest shade: the largest arm level at any pixel where the A/A level is 0 (beyond A/A at any level).
// Masks: [[x0, y0, x1, y1], ...] in shot px, inclusive; masked pixels are skipped everywhere.
import { pngPixels } from './px.mjs';

export const T2 = { FILL: 64, EDGE: 128, SHARE: 0.005, AREA_CSS: 2000, COUNT_LEVEL: 8, FLAT: 2 };

const inMask = (masks, x, y) => masks.some((m) => x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3]);
const level = (P, Q, i) => Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));

// is pixel (x, y) of image X flat (3x3 neighbourhood varies by <= FLAT levels in every channel)?
export function isFlat(X, x, y, flat = T2.FLAT) {
  for (let c = 0; c < 3; c++) {
    let lo = 255, hi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(X.w - 1, Math.max(0, x + dx)), yy = Math.min(X.h - 1, Math.max(0, y + dy));
      const v = X.px[(yy * X.w + xx) * X.bpp + c]; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (hi - lo > flat) return false;
  }
  return true;
}

// decoded-image form, so the self-test can feed synthetic images: { w, h, bpp, px }
export function judgeImages(B, A, C, masks = [], dpr = 1, foot = null) {
  if (A.w !== B.w || A.h !== B.h || C.w !== B.w || C.h !== B.h) return { tier: 'T3', sizeMismatch: true };
  let aaAny = 0, aa8 = 0, abAny = 0, abNotInAA = 0, beyond = 0, beyondFill = 0, beyondEdge = 0, fillMax = 0, edgeMax = 0, shade = 0, masked = 0;
  let outsideF = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    if (masks.length && inMask(masks, x, y)) { masked++; continue; }
    const i = (y * B.w + x) * B.bpp;
    const daa = level(B.px, C.px, i), dab = level(B.px, A.px, i);
    if (daa) aaAny++; if (daa > T2.COUNT_LEVEL) aa8++;
    if (dab) abAny++;
    if (dab && !daa) { abNotInAA++; if (dab > shade) shade = dab; }
    if (dab > T2.COUNT_LEVEL && daa <= T2.COUNT_LEVEL) {
      beyond++;
      if (foot && (x < foot[0] || x > foot[2] || y < foot[1] || y > foot[3])) outsideF++;
      if (isFlat(B, x, y)) { beyondFill++; if (dab > fillMax) fillMax = dab; } else { beyondEdge++; if (dab > edgeMax) edgeMax = dab; }
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  const frame = B.w * B.h, share = beyond / frame, areaCss = beyond / (dpr * dpr);
  let tier;
  if (!abAny) tier = 'T0';
  else if (!abNotInAA) tier = 'T1';
  else if (fillMax <= T2.FILL && edgeMax <= T2.EDGE && shade <= T2.EDGE && share <= T2.SHARE && areaCss <= T2.AREA_CSS) tier = 'T2';
  else tier = 'T3';
  return { tier, frame, masked, aaAny, aa8, abAny, abNotInAA, largestShade: shade, beyond, beyondFill, beyondEdge, fillMax, edgeMax,
    shareBeyond: +share.toFixed(7), areaCssPx: Math.round(areaCss), ...(foot ? { beyondOutsideF: outsideF } : {}), ...(beyond ? { bbox: [x0, y0, x1, y1] } : {}) };
}

export const judge148 = (b, a, b2, masks = [], dpr = 1, foot = null) => judgeImages(pngPixels(b), pngPixels(a), pngPixels(b2), masks, dpr, foot);

// are two shots equal outside the masks (the settle test)?
export function sameImages(P, Q, masks = []) {
  if (P.w !== Q.w || P.h !== Q.h) return false;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const i = (y * P.w + x) * P.bpp;
    if (P.px[i] !== Q.px[i] || P.px[i + 1] !== Q.px[i + 1] || P.px[i + 2] !== Q.px[i + 2]) { if (!(masks.length && inMask(masks, x, y))) return false; }
  }
  return true;
}

// ---- registered plan (P-148) ----
// Chrome configs = P-146's px-chrome set, unchanged: [name, w, h, kind, rm]
export const CHROME_CFG = [
  ['m430x775', 430, 775, 'mob'], ['m430x815', 430, 815, 'mob'], ['m430x932', 430, 932, 'mob'], ['m390x844', 390, 844, 'mob'],
  ['m375x667', 375, 667, 'mob'], ['m360x780', 360, 780, 'mob'], ['m640x900', 640, 900, 'mob'], ['m641x900', 641, 900, 'mob'],
  ['t768x1024', 768, 1024, 'mob'], ['t1024x1366', 1024, 1366, 'mob'], ['t1200x900', 1200, 900, 'mob'],
  ['d860x900', 860, 900, 'desk'], ['d1440x900', 1440, 900, 'desk'], ['m430x775-rm', 430, 775, 'mob', 'rm'],
];
export const SIM_STATES = ['expanded', 'collapsed', 'landscape'];
export const POSITIONS = ['top', 'enter', 'inview', 'leave'], MODES = ['rest', 'swipe'], ARMS148 = ['N0', 'R3'];
// arm order alternates by position index, so neither arm always goes first
export const armOrder = (posIndex) => (posIndex % 2 ? ['R3', 'N0'] : ['N0', 'R3']);
// slot groups (one shared slot each, --max-seconds 300) and the driver's per-config estimate in seconds (basis: P-146
// group wall times x 16/24 triples x 5/3 shots, rounded up; README "P-148" budget table)
export const GROUPS = {
  C1: ['m430x775', 'm430x815', 'm430x932'], C2: ['m390x844', 'm375x667', 'm360x780'], C3: ['m640x900', 'm641x900'],
  C4: ['t768x1024', 'm430x775-rm'], C5: ['t1024x1366'], C6: ['t1200x900', 'd860x900', 'd1440x900'],
  S1: ['expanded'], S2: ['collapsed'], S3: ['landscape'],
};
export const EST_S = { m430x775: 65, m430x815: 65, m430x932: 70, m390x844: 65, m375x667: 60, m360x780: 65, m640x900: 80, m641x900: 80,
  t768x1024: 110, t1024x1366: 150, t1200x900: 140, d860x900: 45, d1440x900: 50, 'm430x775-rm': 65, expanded: 150, collapsed: 175, landscape: 160 };
export const BUDGET_S = 270;
// the guard: start a config only when it fits; returns null (start) or the reason
export const budgetSkip = (elapsedS, cfg) => (elapsedS + EST_S[cfg] > BUDGET_S ? `budget: ${elapsedS.toFixed(0)} + ${EST_S[cfg]} > ${BUDGET_S}` : null);
// every registered triple key, per engine
export const registeredKeys = (engine) => (engine === 'chrome' ? CHROME_CFG.map((c) => c[0]) : SIM_STATES)
  .flatMap((cfg) => POSITIONS.flatMap((pos) => MODES.flatMap((mode) => ARMS148.map((arm) => `${cfg}|${pos}|${mode}|${arm}`))));

// rect helpers (CSS px -> shot px), and the footprint rule: no mask may intersect the R3 footprint
export const toShot = (r, scale, ox = 0, oy = 0) => [Math.floor(r[0] * scale + ox), Math.floor(r[1] * scale + oy), Math.ceil(r[2] * scale + ox) - 1, Math.ceil(r[3] * scale + oy) - 1];
export const intersects = (m, r) => !(m[2] < r[0] || m[0] > r[2] || m[3] < r[1] || m[1] > r[3]);
export const inflate = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

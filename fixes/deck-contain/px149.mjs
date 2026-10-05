// P-149 pixel judge with a multi-pair A/A envelope (pure functions; no page, no device). Builds on px148.mjs (levels,
// fill/edge, T2 numbers) and on fix-nav-morph's envelope proposal (fixes/nav-hit-cache/README.md "v9.3 prep": >= 3
// disjoint A/A pairs, envelope = max over the pairs, fail only beyond it). Rules (P149.md "Rules"):
// - Fresh A/A pairs of a stop: shots taken under the hold BEFORE any real arm (N4), each pair = a shot, then the null arm
//   N0 (empty style) on, then a shot: the same steps as the R3 pair. Pairs are disjoint: shots 1-2, 3-4, 5-6.
// - Envelope env(p) = the largest level at pixel p over the stop's fresh pairs. Blind pixels: env > 8 (R3 cannot be
//   counted there, as P-148's A/A > 8).
// - Stable stop: settled (P-148 G2), >= 3 pairs, blind pixels <= 0.01 % of the frame (P-148's G4 number, applied to
//   the blind set), no geometry move across the fresh shots (G6). Any-level A/A within the envelope is allowed: it can
//   only turn a T2 into a T1 label, never pass a pixel above 8 levels.
// - R3 pair (base B = the shot after N0 off, arm A = after R3 on), arm level L(p):
//   T0: no pixel differs; T1: L(p) <= env(p) everywhere; T2: the pixels above the envelope meet the T2 numbers (largest
//   shade above the envelope <= 128; "beyond" = L > 8 where env <= 8: fill <= 64, edge <= 128, share <= 0.5 % of the
//   frame, area <= 2,000 CSS px); T3 otherwise.
import { pngPixels } from './px.mjs';
import { T2, isFlat } from './px148.mjs';

export const STABLE = { BLIND_LEVEL: 8, BLIND_SHARE: 0.0001, MIN_PAIRS: 3 };
export const FRESH_SHOTS = 6;

const inMask = (masks, x, y) => masks.some((m) => x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3]);
const lv = (P, Q, i) => Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
const dec = (x) => (Buffer.isBuffer(x) ? pngPixels(x) : x);

// fresh shots (decoded or PNG) -> disjoint pairs (1-2, 3-4, 5-6), per-pair stats and the envelope
export function envelope(shots, masks = []) {
  const S = shots.map(dec), W = S[0].w, H = S[0].h, bpp = S[0].bpp;
  if (S.some((s) => s.w !== W || s.h !== H)) return { sizeMismatch: true, pairs: [], envStable: false };
  const env = new Uint8Array(W * H), pairs = [];
  for (let k = 0; k + 1 < S.length; k += 2) {
    const P = S[k], Q = S[k + 1]; let any = 0, over8 = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (masks.length && inMask(masks, x, y)) continue;
      const p = y * W + x, l = lv(P.px, Q.px, p * bpp);
      if (!l) continue;
      any++; if (l > T2.COUNT_LEVEL) over8++; if (l > max) max = l; if (l > env[p]) env[p] = l;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    pairs.push({ shots: [k + 1, k + 2], aaAny: any, aa8: over8, max, ...(any ? { bbox: [x0, y0, x1, y1] } : {}) });
  }
  const frame = W * H;
  let envPixels = 0, envBlind = 0; for (const v of env) { if (v) envPixels++; if (v > STABLE.BLIND_LEVEL) envBlind++; }
  return { frame, w: W, h: H, pairs, env, envPixels, envBlind, envMax: pairs.reduce((m, q) => Math.max(m, q.max), 0), envStable: envStable(pairs.length, envBlind, frame) };
}
export const envStable = (nPairs, envBlind, frame) => nPairs >= STABLE.MIN_PAIRS && envBlind / frame <= STABLE.BLIND_SHARE;
// a stop record (px149-run.mjs) is stable when it settled, its envelope is stable and no fresh shot moved geometry
export const stopStable = (s) => !!(s && s.settled && envStable((s.pairs || []).length, s.envBlind ?? Infinity, s.frame) && !(s.geoFresh || []).length);

// one arm pair against the stop's envelope
export function judgeEnv(B, A, env, masks = [], dpr = 1, foot = null) {
  B = dec(B); A = dec(A);
  if (A.w !== B.w || A.h !== B.h || env.length !== B.w * B.h) return { tier: 'T3', sizeMismatch: true };
  let abAny = 0, aboveEnv = 0, beyond = 0, beyondFill = 0, beyondEdge = 0, fillMax = 0, edgeMax = 0, shade = 0, shadeAboveEnv = 0, outsideF = 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    if (masks.length && inMask(masks, x, y)) continue;
    const p = y * B.w + x, l = lv(B.px, A.px, p * B.bpp), e = env[p];
    if (!l) continue;
    abAny++; if (l > shade) shade = l;
    if (l <= e) continue;
    aboveEnv++; if (l > shadeAboveEnv) shadeAboveEnv = l;
    if (l > T2.COUNT_LEVEL && e <= T2.COUNT_LEVEL) {
      beyond++;
      if (foot && (x < foot[0] || x > foot[2] || y < foot[1] || y > foot[3])) outsideF++;
      if (isFlat(B, x, y)) { beyondFill++; if (l > fillMax) fillMax = l; } else { beyondEdge++; if (l > edgeMax) edgeMax = l; }
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  const frame = B.w * B.h, share = beyond / frame, areaCss = beyond / (dpr * dpr);
  let tier;
  if (!abAny) tier = 'T0';
  else if (!aboveEnv) tier = 'T1';
  else if (fillMax <= T2.FILL && edgeMax <= T2.EDGE && shadeAboveEnv <= T2.EDGE && share <= T2.SHARE && areaCss <= T2.AREA_CSS) tier = 'T2';
  else tier = 'T3';
  return { tier, frame, abAny, aboveEnv, largestShade: shade, largestShadeAboveEnv: shadeAboveEnv, beyond, beyondFill, beyondEdge, fillMax, edgeMax,
    shareBeyond: +share.toFixed(7), areaCssPx: Math.round(areaCss), ...(foot ? { beyondOutsideF: outsideF } : {}), ...(beyond ? { bbox: [x0, y0, x1, y1] } : {}) };
}

// locator (descriptive): the envelope's pixels per 64x64 CSS px tile, the top n tiles by count, each with its
// strongest pixel in CSS px (the driver asks the page which element is there; no cause is drawn from it)
export function envTiles(env, w, cal, n = 5, tileCss = 64) {
  const t = tileCss * cal.scale, tiles = new Map();
  for (let p = 0; p < env.length; p++) {
    const v = env[p]; if (!v) continue;
    const x = p % w, y = (p - x) / w, k = `${Math.floor(x / t)},${Math.floor(y / t)}`;
    const e = tiles.get(k) || { tile: k, count: 0, max: 0, at: null }; e.count++;
    if (v > e.max) { e.max = v; e.at = [+((x - cal.ox) / cal.scale).toFixed(1), +((y - cal.oy) / cal.scale).toFixed(1)]; }
    tiles.set(k, e);
  }
  return [...tiles.values()].sort((a, b) => b.count - a.count || b.max - a.max).slice(0, n);
}

// ---- registered plan (P-149) ----
// The 2x2 at 430x932 (part L, rest only). kind 'mob' = P-148's mobile emulation bundle (mobile: true, touch, mobile UA,
// screen = viewport); 'desk' = P-148's desktop bundle (mobile: false, no touch, Chrome's UA, screen 1440x900).
// Listed in part R's priority order: DPR 3 before DPR 1, mobile before desktop.
export const CELLS = [
  { cell: 'mob3', dpr: 3, kind: 'mob' }, { cell: 'desk3', dpr: 3, kind: 'desk' },
  { cell: 'mob1', dpr: 1, kind: 'mob' }, { cell: 'desk1', dpr: 1, kind: 'desk' },
];
export const W = 430, H = 932;
export const POSITIONS = ['top', 'enter', 'inview', 'leave'], MODES = ['rest', 'swipe'];
export const SIM_GROUPS = { S1: ['expanded', 'landscape'], S2: ['collapsed'] };
// part L's stops of one cell: { cfg: 'L-<cell>', pos }
// a cell is stable when all 4 of its part-L rest stops exist and are stable
export function stableCells(stops) {
  return CELLS.map((c) => c.cell).filter((cell) => {
    const s = stops.filter((x) => x.cfg === `L-${cell}` && x.mode === 'rest');
    return POSITIONS.every((p) => s.some((x) => x.pos === p)) && s.every(stopStable);
  });
}
// part R's configs from the stable cells, in order: the first stable cell (primary, 4 positions x rest/swipe), reduced
// motion in the primary cell (rest), the second stable cell (4 x rest/swipe). None when no cell is stable.
export function rPlan(stable) {
  const cs = CELLS.filter((c) => stable.includes(c.cell)).slice(0, 2);
  if (!cs.length) return [];
  const [p, q] = cs, out = [{ cfg: `R-${p.cell}`, cell: p.cell, dpr: p.dpr, kind: p.kind, role: 'primary', modes: MODES },
    { cfg: `R-${p.cell}-rm`, cell: p.cell, dpr: p.dpr, kind: p.kind, rm: true, role: 'primary-rm', modes: ['rest'] }];
  if (q) out.push({ cfg: `R-${q.cell}`, cell: q.cell, dpr: q.dpr, kind: q.kind, role: 'second', modes: MODES });
  return out;
}
// driver estimates (s; basis in P149.md "Budget") and the 270 s guard of P-148
export const EST_S = { 'L-mob3': 55, 'L-desk3': 55, 'L-mob1': 25, 'L-desk1': 25,
  'R-mob3': 85, 'R-desk3': 85, 'R-mob1': 40, 'R-desk1': 40, 'R-mob3-rm': 45, 'R-desk3-rm': 45, 'R-mob1-rm': 22, 'R-desk1-rm': 22,
  expanded: 110, landscape: 85, collapsed: 140 };
export const BUDGET_S = 270;
export const budgetSkip = (elapsedS, cfg) => (elapsedS + (EST_S[cfg] ?? 120) > BUDGET_S ? `budget: ${elapsedS.toFixed(0)} + ${EST_S[cfg] ?? 120} > ${BUDGET_S}` : null);

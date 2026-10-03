#!/usr/bin/env node
// rest-script T2 scorer (P-089): the five numbers of PR-010 ("wide", memory/illusion-must-be-pixel-identical.md, lead's
// reading) for the frozen identity shots of rot.mjs (Chrome) and simrot.mjs (WebKit Simulator).
//
// Per shot label L, on the element crop (the #people avatar row and its pad, the same crop analyse.mjs scores):
//   X  = old: st6-rb2 replaying the fix's state of L       (--replay,   `replays[]`)
//   Y  = new: the fix's own shot of L                       (--run,      `shots[]`)
//   A/A = st6-rb2's own shot of L vs st6-rb2 replaying it   (--aarun `shots[]` vs --aareplay `replays[]`)
// d(p) = max over R,G,B of |X - Y|; aa(p) = the same for the A/A pair, at the same position in the crop.
// The five numbers:
//   1. largest shade: max d over EVERY pixel of the crop (no mask), split into fill and edge pixels;
//   2. share of the screen beyond the A/A: pixels with d > 8 where aa <= 8, divided by the whole viewport in device px;
//   3. area in CSS px: the same pixels / DPR^2 (per element: the crop holds one element, the avatar row);
//   4. edge or fill: a pixel is fill when its 3x3 neighbourhood in X varies by <= 2 levels on every channel, else edge
//      (research/pixel-tolerance §1); counts of fill and edge pixels among the counted ones;
//   5. static or moving: static when the shot's state has sliding 0 and no running animation, else moving.
// Tiers (numbers only; T2's other conditions are checked elsewhere): T0 d = 0 everywhere; T1 no pixel with d > aa;
// T2 fill max <= 64, edge max <= 128, share <= 0.5 %, area <= 2000 CSS px; else T3. VOID when the A/A crop is missing or
// of another size, or a crop is blank. A shot whose state differs between Y and X (replay error) is VOID as well.
// Crops: Chrome shots are already element clips (Page.captureScreenshot clip, scale 1), DPR from the run JSON, screen =
// w x vh x DPR^2. Simulator shots are full screenshots with a magenta viewport calibration: the crop and the DPR (viewport
// width in device px / innerWidth) come from it, exactly as analyse.mjs cropRow (pad 6 device px); screen = the
// calibrated viewport in device px.
// usage: node t2score.mjs --run fix.json --replay rep-fix.json --aarun st6.json --aareplay rep-st6.json
//          [--labels rest,intoview] [--out score.json]          |   node t2score.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const BAR = { fill: 64, edge: 128, sharePct: 0.5, areaCss: 2000, level: 8, flat: 2 };

export function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12] !== 0 || ![2, 6].includes(d[9])) throw new Error('unsupported PNG (need 8-bit RGB/RGBA, not interlaced)'); bpp = d[9] === 6 ? 4 : 3; }
    else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  // normalise to RGB
  if (bpp === 3) return { w, h, px };
  const rgb = Buffer.alloc(w * h * 3); for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
  return { w, h, px: rgb };
}
const load = (f) => pngPixels(readFileSync(f));
// Simulator: crop the element from a full screenshot by the magenta calibration (as analyse.mjs cropRow)
export function calCrop(file, cal, rect, pad = 6) {
  const C = load(cal); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const i = (y * C.w + x) * 3; if (C.px[i] > 245 && C.px[i + 1] < 10 && C.px[i + 2] > 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error('no calibration magenta in ' + cal);
  const sc = (x1 - x0 + 1) / rect.iw, A = load(file);
  const cx = Math.max(0, Math.round(x0 + rect.left * sc) - pad), cy = Math.max(0, Math.round(y0 + rect.top * sc) - pad), cw = Math.round(rect.w * sc) + 2 * pad, ch = Math.round(rect.h * sc) + 2 * pad;
  const px = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const si = ((cy + y) * A.w + cx + x) * 3, di = (y * cw + x) * 3; if (cy + y < A.h && cx + x < A.w) { px[di] = A.px[si]; px[di + 1] = A.px[si + 1]; px[di + 2] = A.px[si + 2]; } }
  return { w: cw, h: ch, px, dpr: sc, screen: (x1 - x0 + 1) * (y1 - y0 + 1), view: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], at: [cx, cy] };
}
const dmap = (A, B) => { const n = A.w * A.h, d = new Uint8Array(n); for (let p = 0; p < n; p++) { const i = p * 3; d[p] = Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2])); } return d; };
const blank = (A) => { const s = new Set(); for (let i = 0; i < A.px.length && s.size < 2; i += 3) s.add(A.px.readUIntBE(i, 3)); return s.size < 2; };
function flatAt(X, x, y) {
  for (let c = 0; c < 3; c++) { let lo = 255, hi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= X.w || yy >= X.h) continue; const v = X.px[(yy * X.w + xx) * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo > BAR.flat) return false; }
  return true;
}
// the core: X old, Y new, AA = [A, A2] (same size as X), dpr, screen (device px), moving flag
export function score(X, Y, AA, { dpr, screen, moving }) {
  if (X.w !== Y.w || X.h !== Y.h) return { void: `crop size X ${X.w}x${X.h} vs Y ${Y.w}x${Y.h}` };
  if (!AA) return { void: 'no A/A pair' };
  if (AA[0].w !== X.w || AA[0].h !== X.h || AA[1].w !== X.w || AA[1].h !== X.h) return { void: `A/A crop size ${AA[0].w}x${AA[0].h}/${AA[1].w}x${AA[1].h} vs ${X.w}x${X.h}` };
  if (blank(X) || blank(Y)) return { void: 'blank crop' };
  const d = dmap(X, Y), aa = dmap(AA[0], AA[1]);
  let diffAny = 0, maxAll = 0, maxFill = 0, maxEdge = 0, exceedAA = 0, counted = 0, cFill = 0, cEdge = 0, maxCounted = 0, aaMasked = 0, aaMax = 0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let y = 0; y < X.h; y++) for (let x = 0; x < X.w; x++) { const p = y * X.w + x, v = d[p];
    if (aa[p] > aaMax) aaMax = aa[p]; if (aa[p] > BAR.level) aaMasked++;
    if (!v) continue; diffAny++; if (v > aa[p]) exceedAA++;
    const flat = flatAt(X, x, y); if (v > maxAll) maxAll = v; if (flat) { if (v > maxFill) maxFill = v; } else if (v > maxEdge) maxEdge = v;
    if (v > BAR.level && aa[p] <= BAR.level) { counted++; flat ? cFill++ : cEdge++; if (v > maxCounted) maxCounted = v; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; } }
  const sharePct = (counted / screen) * 100, areaCss = counted / (dpr * dpr);
  const t2 = maxFill <= BAR.fill && maxEdge <= BAR.edge && sharePct <= BAR.sharePct && areaCss <= BAR.areaCss;
  const tier = diffAny === 0 ? 'T0' : exceedAA === 0 ? 'T1' : t2 ? 'T2' : 'T3';
  return {
    five: { largestShade: { all: maxAll, fill: maxFill, edge: maxEdge }, sharePct: +sharePct.toFixed(4), areaCss: +areaCss.toFixed(2), edgeFill: { edge: cEdge, fill: cFill }, motion: moving ? 'moving' : 'static' },
    tier, crop: [X.w, X.h], dpr: +dpr.toFixed(4), screenDevicePx: screen, diffAny, exceedAA, counted, maxCounted,
    bboxCss: counted ? [+(bx0 / dpr).toFixed(1), +(by0 / dpr).toFixed(1), +((bx1 - bx0 + 1) / dpr).toFixed(1), +((by1 - by0 + 1) / dpr).toFixed(1)] : null,
    aa: { max: aaMax, masked: aaMasked },
  };
}

function crop(rec, run) {
  if (rec.cal) return calCrop(rec.file, rec.cal, rec.rect);
  const A = load(rec.file); return { ...A, dpr: run.dpr, screen: run.w * run.vh * run.dpr * run.dpr };
}
function main() {
  const J = (k) => JSON.parse(readFileSync(arg(k), 'utf8'));
  const run = J('--run'), rep = J('--replay'), aarun = J('--aarun'), aarep = J('--aareplay');
  const want = arg('--labels') ? arg('--labels').split(',') : null, tail = (l) => l.replace(/^[a-z0-9]+-(?:sim-|\d+-)/, '');
  const out = { scorer: 't2score.mjs', bar: BAR, arm: run.arm, w: run.w, engine: run.engine || 'chrome', shots: [] };
  for (const s of run.shots) {
    const L = tail(s.label); if (want && !want.includes(L)) continue;
    const r = rep.replays.find((q) => q.label === s.label), as = aarun.shots.find((q) => tail(q.label) === L), ar = as && aarep.replays.find((q) => q.label === as.label);
    let res;
    if (!r || r.error) res = { void: 'no replay of the fix state: ' + (r?.error || 'missing') };
    else if (r.topDelta || r.leftDelta || r.clipSame === false) res = { void: `replay geometry differs (dy ${r.topDelta}, dx ${r.leftDelta}, clipSame ${r.clipSame})` };
    else {
      const Y = crop(s, run), X = crop(r, run);
      const AA = as && ar && !ar.error ? [crop(as, aarun), crop(ar, aarun)] : null;
      const moving = !!(s.rec && (s.rec[5] || (s.rec[7] && s.rec[7].length)));
      res = score(X, Y, AA, { dpr: Y.dpr, screen: Y.screen, moving });
    }
    out.shots.push({ label: L, ...res });
  }
  for (const s of out.shots) console.log(s.label.padEnd(14), s.void ? 'VOID ' + s.void : `${s.tier}  shade all/fill/edge ${s.five.largestShade.all}/${s.five.largestShade.fill}/${s.five.largestShade.edge}  share ${s.five.sharePct} %  area ${s.five.areaCss} css px (dpr ${s.dpr})  counted edge/fill ${s.five.edgeFill.edge}/${s.five.edgeFill.fill}  ${s.five.motion}  | any ${s.diffAny}, over A/A ${s.exceedAA}, A/A max ${s.aa.max} masked ${s.aa.masked}`);
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
}
function selftest() {
  const img = (w, h, f) => { const px = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); px.set(v, (y * w + x) * 3); } return { w, h, px }; };
  const base = (x, y) => (x < 10 ? [200, 200, 200] : [20, 20, 20]);            // an edge at x 10
  const X = img(20, 10, base), same = img(20, 10, base);
  const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } };
  let r = score(X, same, [X, same], { dpr: 2, screen: 1000, moving: false }); ok(r.tier === 'T0' && r.counted === 0, 'identical is T0');
  const Yfill = img(20, 10, (x, y) => (x === 3 && y === 4 ? [230, 200, 200] : base(x, y)));   // one fill pixel, 30 levels
  r = score(X, Yfill, [X, same], { dpr: 2, screen: 1000, moving: false });
  ok(r.tier === 'T2' && r.five.largestShade.fill === 30 && r.five.edgeFill.fill === 1 && r.five.areaCss === 0.25 && r.five.sharePct === 0.1, 'one fill px: T2, area 1/4, share 0.1 %');
  const Yedge = img(20, 10, (x, y) => (x === 10 && y === 4 ? [150, 20, 20] : base(x, y)));  // one edge pixel, 130 levels
  r = score(X, Yedge, [X, same], { dpr: 1, screen: 1e6, moving: false }); ok(r.tier === 'T3' && r.five.largestShade.edge === 130 && r.five.edgeFill.edge === 1, 'edge 130 > 128: T3');
  const AAnoisy = img(20, 10, (x, y) => (x === 10 && y === 4 ? [255, 255, 255] : base(x, y)));
  r = score(X, Yedge, [X, AAnoisy], { dpr: 1, screen: 1e6, moving: false }); ok(r.counted === 0 && r.five.largestShade.edge === 130 && r.tier === 'T1', 'masked by A/A: not counted, shade still reported, T1');
  const Ysmall = img(20, 10, (x, y) => (x === 3 && y === 4 ? [205, 200, 200] : base(x, y)));
  r = score(X, Ysmall, [X, same], { dpr: 1, screen: 1e6, moving: true }); ok(r.counted === 0 && r.tier === 'T2' && r.five.motion === 'moving', 'a 5-level change is not counted (<= 8)');
  const Ybig = img(20, 10, (x, y) => (x < 10 ? [240, 200, 200] : base(x, y)));
  r = score(X, Ybig, [X, same], { dpr: 1, screen: 10000, moving: false }); ok(r.tier === 'T3' && r.counted === 100 && r.five.sharePct === 1, 'share 1 % > 0.5 %: T3');
  r = score(X, img(19, 10, base), [X, same], { dpr: 1, screen: 1, moving: false }); ok(!!r.void, 'size mismatch is VOID');
  r = score(X, same, null, { dpr: 1, screen: 1, moving: false }); ok(!!r.void, 'no A/A is VOID');
  console.log(process.exitCode ? 'SELFTEST FAIL' : 'SELFTEST OK');
}
const direct = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (direct) { if (process.argv.includes('--selftest')) selftest(); else main(); }

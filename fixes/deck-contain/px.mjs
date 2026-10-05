// deck-contain pixel helpers. pngPixels is copied from fixes/cd-strip/pixels.mjs (fix-cd-strip, on main); diff adds
// mask rects (shot px) that are skipped. In-page parts: FREEZE pauses every Web Animation (CSS animations and
// transitions included) so toggling the arm style does not move animation time; POS lists the positions; CLOCK gives
// the hero clock's rect (the only mask, P-143).
import { inflateSync } from 'node:zlib';
export function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
// masks: [[x0, y0, x1, y1], ...] in shot px (inclusive)
export function pxDiff(a, b, masks = []) {
  const A = pngPixels(a), B = pngPixels(b);
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0, masked = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < A.px.length; i += A.bpp) { const p = i / A.bpp, x = p % A.w, y = (p - x) / A.w;
    if (masks.some((m) => x >= m[0] && x <= m[2] && y >= m[1] && y <= m[3])) { masked++; continue; }
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (d) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } max = Math.max(max, d); }
  return { w: A.w, h: A.h, diffPixels: n, maxChannelDelta: max, maskedPixels: masked, ...(n ? { bbox: [x0, y0, x1, y1] } : {}) };
}
export const FREEZE = `(() => { window.__dcPaused = document.getAnimations().filter((a) => a.playState === 'running'); for (const a of window.__dcPaused) { try { a.pause(); } catch {} } return window.__dcPaused.length; })()`;
// resume only what FREEZE paused (a finished animation is never replayed)
export const UNFREEZE = `(() => { for (const a of window.__dcPaused || []) { try { a.play(); } catch {} } window.__dcPaused = []; return 1; })()`;
export const CLOCK = `(() => { const t = document.querySelector('.hero-copy [role=timer]'); if (!t) return null; const r = t.getBoundingClientRect();
  return r.width && r.height ? [r.left - 4, r.top - 4, r.right + 4, r.bottom + 4] : null; })()`;
// positions (scrollY) for the shots: top, deck entering, deck in view, deck leaving
export const POS = `(() => { const d = document.querySelector('.start-selling-profile-deck'), r = d.getBoundingClientRect(), t = r.top + scrollY, b = r.bottom + scrollY, ih = innerHeight;
  return { top: 0, enter: Math.max(0, Math.round(t - ih + 200)), inview: Math.round(t - 60), leave: Math.round(b - 200) }; })()`;
// step the page to y over 10 rAF frames (scroll events fire), then return: the 'swipe' state
export const STEP_TO = (y) => `new Promise((res) => { const from = Math.max(0, ${y} - 100); let k = 0; scrollTo({ top: from, behavior: 'instant' });
  const st = () => { k++; scrollTo({ top: from + k * 10, behavior: 'instant' }); if (k < 10) requestAnimationFrame(st); else requestAnimationFrame(() => res(scrollY)); }; requestAnimationFrame(st); })`;
export const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;

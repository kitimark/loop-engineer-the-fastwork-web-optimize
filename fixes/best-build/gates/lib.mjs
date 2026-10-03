// platform-idle probe helpers (counts and pixels only, no timing). best-build copy of platform-idle's local
// out/platform-idle/lib.mjs (not committed there); only the WT path depth differs, plus serveArm() at the end.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cdpLib = await import(join(WT, 'tools/lib/cdp.mjs'));
export const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = cdpLib;

export function png(buf) {
  let o = 8, w, h, bpp, depth, inter; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; bpp = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; inter = d[12]; }
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (depth !== 8 || !bpp || inter) throw new Error(`PNG not handled: depth ${depth} bpp ${bpp} interlace ${inter}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

// RGB compare of two decoded images of equal size. Returns counts and a histogram of max channel diff.
export function compare(A, B) {
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let diff = 0, max = 0; const hist = {}; const where = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp, j = (y * B.w + x) * B.bpp;
    const d = Math.max(Math.abs(A.px[i] - B.px[j]), Math.abs(A.px[i + 1] - B.px[j + 1]), Math.abs(A.px[i + 2] - B.px[j + 2]));
    if (d) { diff++; hist[d] = (hist[d] || 0) + 1; if (d > max) max = d; if (x < where.x0) where.x0 = x; if (y < where.y0) where.y0 = y; if (x > where.x1) where.x1 = x; if (y > where.y1) where.y1 = y; }
  }
  return { px: A.w * A.h, diff, max, hist, where: diff ? where : null };
}

export async function openPage(cdp, { width, height, dpr, mobile, reduce = false }) {
  const page = await cdp.newIsolatedPage();
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return page;
}

export async function shot(page, clip) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

export const serveUrl = (f) => { const s = JSON.parse(readFileSync(f, 'utf8')); return s.url || `https://localhost:${s.port}/`; };

import { deflateSync } from 'node:zlib';
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function encodePng(w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A | B | diff (x gain), each scaled by s (nearest)
export function sideBySide(A, B, s = 4, gain = 20) {
  const W = A.w * 3 * s + 2 * s, H = A.h * s, out = Buffer.alloc(W * H * 3, 255);
  const put = (ox, x, y, r, g, b) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = ((y * s + dy) * W + ox + x * s + dx) * 3; out[i] = r; out[i + 1] = g; out[i + 2] = b; } };
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.bpp, j = (y * B.w + x) * B.bpp;
    put(0, x, y, A.px[i], A.px[i + 1], A.px[i + 2]); put(A.w * s + s, x, y, B.px[j], B.px[j + 1], B.px[j + 2]);
    const d = Math.max(Math.abs(A.px[i] - B.px[j]), Math.abs(A.px[i + 1] - B.px[j + 1]), Math.abs(A.px[i + 2] - B.px[j + 2]));
    const v = Math.min(255, d * gain); put(2 * A.w * s + 2 * s, x, y, v, d ? 0 : 0, d ? 0 : 0);
  }
  return encodePng(W, H, out);
}

// best-build: one server per arm (own origin), https, from ./arms.mjs; resolves {url, proc}
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
export async function serveArm(arm, def, base, dir, { https = true } = {}) {
  mkdirSync(dir, { recursive: true });
  const st = join(dir, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', base, '--port', '0', '--vendors=local', '--no-http-twin', '--quiet', '--state', st, ...(https ? ['--https'] : [])];
  if (def.dir) args.push('--overlay', def.dir);
  const proc = spawn(process.execPath, args, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s?.port) { s = null; await new Promise((r) => setTimeout(r, 100)); } }
  if (!s) { proc.kill(); throw new Error(arm + ': server did not start'); }
  return { proc, url: s.url || `${https ? 'https' : 'http'}://localhost:${s.port}/` };
}

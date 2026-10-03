// pool the Sim fade50 frozen-frame differences across all simpx sessions, by build (hash) and region:
// node fixes/cd-strip/pool.mjs   -> per session/arm rows + pooled rates (digit row y < LABELY in the clock crop, label row below)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
const ROOT = 'out/cd-strip/simpx', LABELY = 1490;
const BUILD = { '7bf7c4657d21': 'faces', '5e37af69bcc4': 'strip-rw', '56c075242353': 'strip-rb(final)', 'ab25aa01f469': 'strip-rb(copy)', '358cd8ae16b9': 'strip-cl/a' };
function png(buf) {
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
function diff(dir, fa, fb, box) {
  const A = png(readFileSync(join(dir, fa))), B = png(readFileSync(join(dir, fb)));
  const r = { digit: { n: 0, max: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1 }, label: { n: 0, max: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1 } };
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = (y * A.w + x) * A.bpp; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    if (!d) continue; const k = y < LABELY ? r.digit : r.label; k.n++; k.max = Math.max(k.max, d);
    k.x0 = Math.min(k.x0, x); k.x1 = Math.max(k.x1, x); k.y0 = Math.min(k.y0, y); k.y1 = Math.max(k.y1, y);
  }
  return r;
}
const pool = {};
const fmt = (k) => (k.n ? `${k.n}px d${k.max} x${k.x0}-${k.x1} y${k.y0}-${k.y1} (css x${Math.round(k.x0 / 3)}-${Math.round(k.x1 / 3)})` : '0');
for (const f of readdirSync(ROOT).filter((f) => /^simpx-.*\.json$/.test(f)).sort()) {
  const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
  const passes = (j.passes || []).filter((p) => /^fade50/.test(p)); if (!passes.length || !existsSync(j.dir)) continue;
  const files = readdirSync(j.dir);
  // arm labels as written to file names: first occurrence plain, a repeat gets "-again"
  const seen = new Set(); const arms = j.info.map(([a, h, inf]) => { const lab = seen.has(a) ? `${a}-again` : a; seen.add(a); return { lab, build: (h.js === '358cd8ae16b9' ? ({ ce6beca745a0: 'strip-first(b)', '305b8a705d8b': 'strip-first(a)', '757bc2e35c96': 'strip-cl' })[h.css] : BUILD[h.js]) || h.js + '/' + h.css, box: inf }; });
  const ref = arms[0];
  for (const pass of passes) {
    const pick = (lab) => files.filter((x) => x.includes(`-${lab}-${pass}-`) && new RegExp(`^\\d{4}-${lab.replace(/[-]/g, '\\-')}-${pass}-`).test(x));
    const A = pick(ref.lab);
    for (const arm of arms.slice(1)) {
      const box = arm.box?.[pass]?.box || ref.box?.[pass]?.box || { x: 69, y: 1247, w: 1152, h: 288 };
      const key = arm.build === ref.build ? 'A/A faces' : arm.build;
      const P = (pool[`${pass} ${key}`] ||= { shots: 0, digitShots: 0, labelShots: 0, sessions: new Set() });
      for (const a of A) {
        const tail = a.replace(new RegExp(`^\\d{4}-${ref.lab}-`), ''); const b = files.find((x) => new RegExp(`^\\d{4}-${arm.lab.replace(/[-]/g, '\\-')}-`).test(x) && x.endsWith(tail)); if (!b) continue;
        const d = diff(j.dir, a, b, box); P.shots++; P.sessions.add(f.slice(17, 25));
        if (d.digit.n) P.digitShots++; if (d.label.n) P.labelShots++;
        if (d.digit.n || d.label.n) console.log(f.slice(6, 25), key.padEnd(16), tail.padEnd(22), 'digit', fmt(d.digit).padEnd(58), 'label', fmt(d.label));
      }
    }
  }
}
console.log('\npooled (shots with a difference / shots compared):');
for (const [k, v] of Object.entries(pool)) console.log(k.padEnd(28), `digit ${v.digitShots}/${v.shots}`, `label ${v.labelShots}/${v.shots}`, 'sessions', [...v.sessions].join(' '));

// end-bg look check (fix-end-bg, T-197): does an optimized overlay look the same as the base build on a phone?
// Chrome headless, 430 x 775 DPR 3 mobile + touch. For each arm (name=overlay dir) a fresh load, the page walked once (lazy
// images), then frozen screenshots at fixed scroll positions (every --stepvh of a viewport, plus the menu-open end) with
// CSS animations and transitions paused at t=0 (Animation.setPlaybackRate 0 + a seek), the same in every arm.
// Every arm is compared with the FIRST arm (normally C), and arm 2 should be C again (the true A/A of this session).
// Per position: pixels differing by > 2 / > 8 / > 32 / > 64 / > 128 levels (max channel), max level, area % of the frame,
// and the bounding box of the > 8 pixels in CSS px. Pixels only, no timing.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-end-bg -- \
//     node fixes/end-bg/look-chrome.mjs --arms C=fixes/end-bg/overlay,C2=fixes/end-bg/overlay,A=out/end-bg/opt-A/overlay
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { mirrorHome } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', 'C=fixes/end-bg/overlay,C2=fixes/end-bg/overlay').split(',').map((a) => { const [name, dir] = a.split('='); return { name, dir: resolve(WT, dir) }; });
const STEPVH = Number(arg('--stepvh', '0.75'));
const H = Number(arg('--height', '775'));
const BASE = join(mirrorHome(), 'site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, `out/end-bg/look/${tag}`); mkdirSync(OUT, { recursive: true });

// minimal PNG decoder (8-bit, colour type 2 or 6, no interlace): what Chrome's captureScreenshot writes
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error('png: unsupported'); }
    else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break; p += 12 + len; }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('png colour type ' + ct); })();
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255; }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = cur[x * bpp + k];
    [prev, cur] = [cur, prev]; }
  return { w, h, px: out };
}
function diff(a, b, dpr) {
  if (a.w !== b.w || a.h !== b.h) return { sizeMismatch: `${a.w}x${a.h} vs ${b.w}x${b.h}` };
  const th = [2, 8, 32, 64, 128], n = th.map(() => 0); let max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0, j = 0; i < a.w * a.h; i++, j += 3) { const d = Math.max(Math.abs(a.px[j] - b.px[j]), Math.abs(a.px[j + 1] - b.px[j + 1]), Math.abs(a.px[j + 2] - b.px[j + 2]));
    if (!d) continue; if (d > max) max = d; for (let k = 0; k < th.length; k++) if (d > th[k]) n[k]++;
    if (d > 8) { const x = i % a.w, y = (i / a.w) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  const tot = a.w * a.h;
  return { max, gt: Object.fromEntries(th.map((t, k) => [t, n[k]])), areaPct8: +(100 * n[1] / tot).toFixed(3), areaPct64: +(100 * n[3] / tot).toFixed(3),
    box8: x1 < 0 ? null : { x: Math.round(x0 / dpr), y: Math.round(y0 / dpr), w: Math.round((x1 - x0 + 1) / dpr), h: Math.round((y1 - y0 + 1) / dpr) } };
}

async function serve(dir, name) {
  const st = join(OUT, `serve-${name}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(`server ${name} did not start`); }
  return { proc: p, url: s.url };
}

const servers = {}; for (const a of ARMS) servers[a.name] = await serve(a.dir, a.name);
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/end-bg/chrome'), 'look'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const shots = {}; let positions = null;
const res = { tool: 'fixes/end-bg/look-chrome.mjs', browser: chrome.browser, height: H, arms: ARMS, positions: null, compare: {} };
try {
  for (const arm of ARMS) {
    const page = await cdp.newIsolatedPage();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await page.send('Network.enable');
    await gotoAndSettle(page, servers[arm.name].url, { quietMs: 1500, maxMs: 45000 });
    await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 300; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 40) : setTimeout(res, 2500); }; step(); })`, { timeout: 90000 });
    if (!positions) { const g = await page.eval(`({ max: document.documentElement.scrollHeight - innerHeight, ih: innerHeight })`);
      positions = []; for (let y = 0; y < g.max; y += Math.round(g.ih * STEPVH)) positions.push(y); positions.push(g.max); res.positions = positions; }
    await page.send('Animation.enable');
    shots[arm.name] = [];
    for (const y of positions) {
      await page.eval(`new Promise((res) => { window.scrollTo({ top: ${y}, behavior: 'instant' }); setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => res(1))), 900); })`);
      // freeze CSS animations at their start, the same in every arm
      await page.eval(`(() => { for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} } return 1; })()`);
      await sleep(250);
      const s = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const f = join(OUT, `${arm.name}-y${y}.png`); writeFileSync(f, Buffer.from(s.data, 'base64')); shots[arm.name].push(f);
      await page.eval(`(() => { for (const a of document.getAnimations()) { try { a.play(); } catch {} } return 1; })()`);
    }
    await page.close();
    console.log(arm.name, positions.length, 'shots');
  }
  const ref = ARMS[0].name;
  for (const arm of ARMS.slice(1)) {
    res.compare[arm.name] = positions.map((y, i) => ({ y, ...diff(decodePng(readFileSync(shots[ref][i])), decodePng(readFileSync(shots[arm.name][i])), 3) }));
    const c = res.compare[arm.name];
    console.log(`${arm.name} vs ${ref}: positions with >8 px ${c.filter((x) => x.gt && x.gt[8]).length}/${c.length}, max level ${Math.max(...c.map((x) => x.max || 0))}, worst area>8 ${Math.max(...c.map((x) => x.areaPct8 || 0))} %, worst area>64 ${Math.max(...c.map((x) => x.areaPct64 || 0))} %`);
  }
} finally {
  writeFileSync(join(OUT, 'look.json'), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close(); for (const s of Object.values(servers)) s.proc.kill();
  console.log('wrote', join(OUT, 'look.json'));
}

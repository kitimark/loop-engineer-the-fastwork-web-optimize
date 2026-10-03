#!/usr/bin/env node
// cd-roll-ca: Chrome roll-end check (frozen frames, counts and pixels only, no timing). Review round 4 (strip-tc): when
// a roll finishes, __crStop cancels the cells' animations and cd-strip's inline rest transform (k - M)*c shows again;
// the last keyframe must be that same value, so the frame after the cancel must equal the frame before it.
// Per roll (natural 1 Hz ticks, and forced multi-digit rolls: Date.now offset + a synthetic visibilitychange, as in
// roll-probe.mjs), as soon as hero cells have animations:
//   1. numeric: every animated cell's last keyframe translateY vs its inline style.transform (px), and the shared
//      startTime / duration per digit;
//   2. A: every hero animation paused at currentTime = its duration (the fill-both end), two rAFs, screenshot of the
//      hero timer (DPR 3 pixels), cell rects; A2: the same again two rAFs later (noise floor, nothing changed);
//   3. B: finish() on every hero animation -> onfinish -> __crStop -> cancel(), two rAFs, screenshot, rects, the number
//      of animations left (0 expected).
// Reports per roll: kf-vs-inline max |px|, A vs B and A vs A2 differing pixels and max channel delta, rect max |dy|.
//   node fixes/cd-roll-ca/end-check.mjs --state <serve-state.json> [--out out/cd-roll-ca/end-check.json] [--rolls 8]
// Run inside a chrome-measure hold (shared lane: probe weight; nothing timed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../tools/lib/cdp.mjs';
import { READ } from './strip-read.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const statePath = arg('--state');
const outPath = arg('--out', 'out/cd-roll-ca/end-check.json');
const ROLLS = Number(arg('--rolls', '8'));
const headless = arg('--headless', '1') === '1';

// PNG reader (8-bit RGB/RGBA, not interlaced): fix-cd-strip's simpx.mjs, via fixes/cd-roll-ca/simpx.mjs
function png(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  let o = 8, w, h, bpp, depth, inter, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; bpp = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; inter = d[12]; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  if (depth !== 8 || !bpp || inter) throw new Error(`PNG format not handled: depth ${depth}, bpp ${bpp}, interlace ${inter}`);
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255; } }
  return { w, h, bpp, px };
}
const pxd = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return { sizeMismatch: [[a.w, a.h], [b.w, b.h]] };
  let n = 0, max = 0;
  for (let i = 0; i < a.w * a.h; i++) { const p = i * a.bpp, q = i * b.bpp; const d = Math.max(Math.abs(a.px[p] - b.px[q]), Math.abs(a.px[p + 1] - b.px[q + 1]), Math.abs(a.px[p + 2] - b.px[q + 2])); if (d) n++; if (d > max) max = d; }
  return { diffPixels: n, maxDelta: max };
};
const rectd = (ra, rb) => { let m = 0, un = 0; ra.forEach((A, j) => { const B = new Map((rb[j] || []).map(([q, v]) => [q, v])); for (const [q, v] of A) { if (B.has(q)) m = Math.max(m, Math.abs(v - B.get(q))); else un++; B.delete(q); } un += B.size; }); return { maxPx: +m.toFixed(5), unmatched: un }; };

const INJECT = `(() => { const realNow = Date.now.bind(Date); window.__crOff = 0; Date.now = () => realNow() + window.__crOff; })();`;
const HELP = `(() => { if (window.__ec) return 'again'; ${READ}
  const hero = () => [...document.querySelectorAll('.hero-copy [role=timer] .digit > .strip')];
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ec = {
    anims: () => hero().map((s) => cellsOf(s).flatMap((el) => el.getAnimations())),
    count: () => window.__ec.anims().reduce((m, A) => m + A.length, 0),
    rects: () => hero().map((s) => { const c = cell(s), d = s.parentElement.getBoundingClientRect().top;
      return cellsOf(s).map((el, k) => [k, el.getBoundingClientRect().top - d]).filter(([, y]) => Math.abs(y) < 1.5 * c); }),
    box: () => { const r = document.querySelector('.hero-copy [role=timer]').getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }; },
    // pause every hero animation at its own end; per digit: cells, shared start, duration, max |last keyframe - inline|
    prep: async () => { const per = window.__ec.anims().map((A) => { if (!A.length) return null;
        const d = A[0].effect.getTiming().duration, starts = [...new Set(A.map((a) => a.startTime))]; let kfInline = 0;
        for (const a of A) { const k = a.effect.getKeyframes(), last = pxOf(k[k.length - 1].transform), inl = pxOf(a.effect.target.style.transform);
          kfInline = Math.max(kfInline, Number.isFinite(last) && Number.isFinite(inl) ? Math.abs(last - inl) : Infinity); a.pause(); a.currentTime = d; }
        return { cells: A.length, starts: starts.length, d: +d.toFixed(3), kfInlineMaxPx: kfInline }; });
      await raf2(); return per; },
    settle: () => raf2().then(() => 0),
    finish: async () => { let n = 0; for (const A of window.__ec.anims()) for (const a of A) { try { a.finish(); n++; } catch {} } await new Promise((r) => setTimeout(r, 30)); await raf2(); return { finished: n, left: window.__ec.count() }; },
    waitRoll: (ms) => new Promise((r) => { const t0 = performance.now(); const f = () => { const n = window.__ec.count(); if (n || performance.now() - t0 > ms) r(n); else requestAnimationFrame(f); }; f(); }),
  };
  return 'ok'; })()`;

const state = JSON.parse(readFileSync(join(root, statePath), 'utf8'));
const url = state.url || `http://localhost:${state.port}/`;
const profileDir = tempProfileDir(join(root, 'out', 'cd-roll-ca', 'chrome'), 'cd-roll-ca-endcheck');
const chrome = await launchChrome({ port: 0, profileDir, headless, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
const out = { tool: 'fixes/cd-roll-ca/end-check.mjs', url, browser: chrome.browser, headless, rolls: [] };
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(2500);
  out.help = await page.eval(HELP);
  const servedHash = {};
  for (const f of ['/_app/immutable/nodes/2.DyWL8TcE.js', '/_app/immutable/assets/2.gBuqKVzi.css']) {
    try { servedHash[f] = createHash('sha256').update(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())).digest('hex').slice(0, 12); } catch { servedHash[f] = null; }
  }
  out.servedHash = servedHash;
  const shot = async () => { const clip = await page.eval('window.__ec.box()'); const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: false }); return png(Buffer.from(r.data, 'base64')); };
  let rnd = 11; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < ROLLS; i++) {
    const forced = i % 2 === 1;
    // let any previous roll end on its own first
    await page.eval('window.__ec.waitRoll(0)'); await sleep(50);
    for (let j = 0; j < 60 && (await page.eval('window.__ec.count()')); j++) await sleep(50);
    let fo = null;
    if (forced) { const off = Math.round(1 + rand() * 4000) * 1000 + Math.round(rand() * 900); fo = off; await page.eval(`(window.__crOff += ${off}, document.dispatchEvent(new Event('visibilitychange')), 0)`); }
    const n = await page.eval('window.__ec.waitRoll(1500)');
    if (!n) { out.rolls.push({ i, forced, off: fo, error: 'no roll seen' }); continue; }
    const per = await page.eval('window.__ec.prep()');
    const A = await shot(), rA = await page.eval('window.__ec.rects()');
    await page.eval('window.__ec.settle()');
    const A2 = await shot();
    const fin = await page.eval('window.__ec.finish()');
    const B = await shot(), rB = await page.eval('window.__ec.rects()');
    out.rolls.push({ i, forced, off: fo, digits: per.filter(Boolean), kfInlineMaxPx: Math.max(0, ...per.filter(Boolean).map((d) => d.kfInlineMaxPx)), sharedStart: per.filter(Boolean).every((d) => d.starts === 1),
      finish: fin, AB: pxd(A, B), AA: pxd(A, A2), rectAB: rectd(rA, rB) });
    await sleep(300);
  }
} finally {
  await page.close(); cdp.close(); await chrome.close();
}
const R = out.rolls.filter((r) => !r.error);
out.summary = { rolls: R.length, errors: out.rolls.length - R.length, digitRolls: R.reduce((m, r) => m + r.digits.length, 0),
  kfInlineMaxPx: Math.max(0, ...R.map((r) => r.kfInlineMaxPx)), allSharedStart: R.every((r) => r.sharedStart), animsLeftMax: Math.max(0, ...R.map((r) => r.finish.left)),
  abDiffer: R.filter((r) => r.AB.diffPixels || r.AB.sizeMismatch).length, abMaxDelta: Math.max(0, ...R.map((r) => r.AB.maxDelta || 0)),
  aaDiffer: R.filter((r) => r.AA.diffPixels || r.AA.sizeMismatch).length, aaMaxDelta: Math.max(0, ...R.map((r) => r.AA.maxDelta || 0)),
  rectABMaxPx: Math.max(0, ...R.map((r) => r.rectAB.maxPx)), rectABUnmatched: R.reduce((m, r) => m + r.rectAB.unmatched, 0) };
mkdirSync(dirname(join(root, outPath)), { recursive: true });
writeFileSync(join(root, outPath), JSON.stringify(out, null, 1));
console.log('ENDCHECK', JSON.stringify(out.servedHash), JSON.stringify(out.summary));
console.log('wrote', outPath);

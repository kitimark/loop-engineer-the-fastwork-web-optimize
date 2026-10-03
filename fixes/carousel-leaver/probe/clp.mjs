// carousel-leaver probe (Chrome headless, 430x932 DPR 3 mobile + touch). No timing claims: rAF samples of the
// avatar carousel, frozen mid-slide crops, the scene-paused round trip, and per-tick counts (trace + MutationObserver).
// node clp.mjs --arms A=serve-a.json,S=serve-s.json,E=serve-e.json --out dir [--modes series,counts,pixels,paused] [--target /path.jpg]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a468e571c76f341a1';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((s) => { const [k, f] = s.split('='); const st = JSON.parse(readFileSync(f, 'utf8')); return { k, url: st.url || `https://localhost:${st.port}/` }; });
const OUT = arg('--out'); mkdirSync(OUT, { recursive: true });
const MODES = arg('--modes', 'series,counts,pixels,paused').split(',');
let TARGET = arg('--target', null);
// --view WxHxDPR, optional trailing d = desktop (mobile false, no touch); default the phone setting all P-086 runs used
const VIEW = arg('--view', '430x932x3'), DESK = VIEW.endsWith('d'); const [VW, VH, VD] = VIEW.replace(/d$/, '').split('x').map(Number);
const TS = [0, 17, 33, 50, 67, 83, 100, 133, 167, 200, 220];

const HOLD = `(() => { const st = window.setTimeout.bind(window); window.__hold = false; window.__held = [];
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st(fn, ms, ...a);
    return st(() => { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); }; })()`;
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch { return ''; } }`;
const SAMPLER = (ms) => `new Promise((res) => { const S = []; const t0 = performance.now(); const P = ${PATH};
  const rec = () => { const c = ${CAR};
    if (c) { const sc = c.closest('[data-start-selling-scene]'); const cr = c.getBoundingClientRect();
      S.push({ t: performance.now() - t0, cls: c.className, scene: sc ? sc.getAttribute('data-start-selling-scene') : null, cx: +cr.left.toFixed(3),
        imgs: [...c.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
          return [+r.left.toFixed(3), +r.width.toFixed(3), +cs.opacity, cs.transform, cs.translate, cs.clipPath, i.className, P(i), cs.width, cs.marginRight, cs.borderLeftWidth, cs.animationName, cs.animationPlayState, i.complete && i.naturalWidth > 0 ? 1 : 0]; }) }); }
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(rec); else res(JSON.stringify(S)); };
  requestAnimationFrame(rec); })`;
const SLIDING = `((c) => !!(c && (c.querySelector('img.is-exit') || c.classList.contains('is-sliding'))))(${CAR})`;
const LEAD = `((c) => c && c.querySelector('img.is-exit, img.st5-lead'))(${CAR})`;
// wait for a slide start (first rAF where the slide is on) whose leaver has pathname target (or any); freeze it
const CATCH = (target, timeout, freeze) => `new Promise((res) => { const P = ${PATH}; const t0 = performance.now(); let was = ${SLIDING};
  const tick = () => { const on = ${SLIDING}; const lead = ${LEAD};
    if (on && !was && lead && (${JSON.stringify(target)} === null || P(lead) === ${JSON.stringify(target)})) {
      const c = ${CAR}; let n = 0;
      if (${freeze}) { window.__hold = true; window.__anims = [...c.querySelectorAll('img')].flatMap((i) => i.getAnimations()); window.__anims.forEach((a) => a.pause()); n = window.__anims.length; }
      return res({ ok: true, lead: P(lead), srcs: [...c.querySelectorAll('img')].map(P), cls: [...c.querySelectorAll('img')].map((i) => i.className), n, waited: Math.round(performance.now() - t0) }); }
    was = on; if (performance.now() - t0 > ${timeout}) return res({ ok: false }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;
const RAF2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;

function pngPixels(buf) {
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
export function cmp(fa, fb) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb)); if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let any = 0, n8 = 0, max = 0, lo = 255, hi = 0; const box = [1e9, 1e9, -1, -1];
  for (let i = 0, p = 0; i < A.px.length; i += A.bpp, p++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c]));
    lo = Math.min(lo, A.px[i]); hi = Math.max(hi, A.px[i]);
    if (d > 0) { any++; if (d > 8) n8++; if (d > max) max = d; const y = Math.floor(p / A.w), x = p % A.w; box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); } }
  return { w: A.w, h: A.h, any, n8, max, box: any ? box : null, blank: hi - lo < 16 };
}
if (!ARMS.length) process.exit(0);

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/carousel-leaver'), 'clp'), headless: true, windowSize: '1440,900', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { at: new Date().toISOString(), browser: chrome.browser, view: VIEW, arms: {} };
const save = () => writeFileSync(join(OUT, 'clp.json'), JSON.stringify(res, null, 1));
async function center(page, frac = 0.5) {
  // h4: the carousel itself at mid-view. Holds 1-3 used #future-heading at 0.5 vh, which left the carousel ~700 px BELOW
  // the viewport (its top at ~1634 CSS px of a 932 px view; found by hold 3's crop crash), not "in view" as registered.
  return page.eval(`(() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - ${frac} * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { y: scrollY, carTop: q.top, carBottom: q.bottom, vh: innerHeight, inView: q.top >= 0 && q.bottom <= innerHeight }; })()`);
}
// h3 (P-086 re-run after hold 2's blank crops): capture the whole viewport (no CDP clip) and crop in Node at the
// carousel's viewport rect x devicePixelRatio, rounded out to whole device px, ± 4 CSS px; the first shot per file
// prefix also keeps the full viewport (<file>.full.png) for inspection. Returns the rect and a non-blank flag.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return (b) => { let c = -1; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
function pngEncode(w, h, bpp, px) {
  const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(CRC(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = bpp === 4 ? 6 : 2;
  const raw = Buffer.alloc(h * (w * bpp + 1)); for (let y = 0; y < h; y++) px.copy(raw, y * (w * bpp + 1) + 1, y * w * bpp, (y + 1) * w * bpp);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const fullKept = new Set();
async function shot(page, file) {
  const r = JSON.parse(await page.eval(`JSON.stringify((() => { const r = ${CAR}.getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight }; })())`));
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64'); const P = pngPixels(buf); const k = P.w / r.vw;
  const x0 = Math.floor(r.x * k), y0 = Math.floor(r.y * k), x1 = Math.ceil((r.x + r.width) * k), y1 = Math.ceil((r.y + r.height) * k);
  if (x0 < 0 || y0 < 0 || x1 > P.w || y1 > P.h) throw new Error(`VOID: carousel crop ${[x0, y0, x1, y1]} outside the ${P.w}x${P.h} viewport capture (carousel not in view)`);
  const w = x1 - x0, h = y1 - y0, out = Buffer.alloc(w * h * P.bpp);
  for (let y = 0; y < h; y++) P.px.copy(out, y * w * P.bpp, ((y0 + y) * P.w + x0) * P.bpp, ((y0 + y) * P.w + x1) * P.bpp);
  writeFileSync(file, pngEncode(w, h, P.bpp, out));
  const pre = file.replace(/-[^-]*\.png$/, ''); if (!fullKept.has(pre)) { fullKept.add(pre); writeFileSync(file.replace(/\.png$/, '.full.png'), buf); }
  let lo = 255, hi = 0; for (let i = 0; i < out.length; i += P.bpp) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  return { ...r, k, crop: [x0, y0, w, h], blank: hi - lo < 16 };
}
try {
  for (const arm of ARMS) {
    const R = (res.arms[arm.k] = { url: arm.url });
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: VD, mobile: !DESK });
    if (!DESK) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
    await gotoAndSettle(page, arm.url, { quietMs: 1500, maxMs: 45000 }); await sleep(1000);
    R.pos = await center(page); await sleep(1500);
    if (MODES.includes('series')) {
      const s = await page.eval(SAMPLER(6500), { timeout: 20000 });
      writeFileSync(join(OUT, `series-${arm.k}.json`), s); R.seriesFrames = JSON.parse(s).length; console.log(arm.k, 'series', R.seriesFrames); save();
    }
    if (MODES.includes('counts')) {
      await page.eval(`(() => { const c = ${CAR}; window.__mo = { attr: {}, add: 0, rem: 0, slides: 0 }; let was = false;
        window.__mob = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') window.__mo.attr[m.attributeName] = (window.__mo.attr[m.attributeName] || 0) + 1; else { window.__mo.add += m.addedNodes.length; window.__mo.rem += m.removedNodes.length; } } });
        window.__mob.observe(c, { subtree: true, childList: true, attributes: true });
        const t = () => { const on = ${SLIDING}; if (on && !was) window.__mo.slides++; was = on; if (window.__mob) requestAnimationFrame(t); }; requestAnimationFrame(t); return 1; })()`);
      const evs = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') evs.push(...m.params.value); });
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 30000);
      await page.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
      await sleep(5100);
      await page.send('Tracing.end'); await done; off();
      R.mo = await page.eval(`(() => { window.__mob.disconnect(); window.__mob = null; return window.__mo; })()`);
      const main = evs.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && evs.some((x) => x.pid === e.pid && x.name === 'Layout'));
      const mine = evs.filter((e) => main && e.pid === main.pid && e.tid === main.tid && (e.ph === 'X' || e.ph === 'B'));
      const cnt = {}; for (const e of mine) cnt[e.name] = (cnt[e.name] || 0) + 1;
      const roots = {}; for (const e of mine.filter((e) => e.name === 'Layout')) { const q = e.args?.endData?.root; const k = q ? `${Math.round(q[2] - q[0])}x${Math.round(q[5] - q[1])}` : '?'; roots[k] = (roots[k] || 0) + 1; }
      // Layout events whose end event carries the root (ph B/E): pair them
      const ends = evs.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'E' && e.name === 'Layout');
      for (const e of ends) { const q = e.args?.endData?.root; const k = q ? `${Math.round(q[2] - q[0])}x${Math.round(q[5] - q[1])}` : '?'; roots['E:' + k] = (roots['E:' + k] || 0) + 1; }
      R.counts = { Layout: cnt.Layout || 0, UpdateLayoutTree: cnt.UpdateLayoutTree || 0, Paint: cnt.Paint || 0, PrePaint: cnt.PrePaint || 0, Layerize: cnt.Layerize || 0, RasterTask: 0, roots };
      console.log(arm.k, 'counts', JSON.stringify(R.counts), JSON.stringify(R.mo)); save();
    }
    if (MODES.includes('pixels')) {
      await center(page); await sleep(600);
      const c = await page.eval(CATCH(TARGET, 20000, true), { timeout: 30000 });
      R.pixCatch = c; console.log(arm.k, 'catch', JSON.stringify(c));
      if (c.ok) {
        if (TARGET === null) TARGET = c.lead;
        R.shots = {};
        for (const t of TS) {
          R.shots[t] = await page.eval(`(() => { window.__anims.forEach((a) => { a.currentTime = ${t}; }); return window.__anims.map((a) => a.animationName + ':' + Math.round(a.currentTime)).join(','); })()`);
          await page.eval(RAF2); R.shotRects = R.shotRects || {}; R.shotRects[t] = await shot(page, join(OUT, `px-${arm.k}-${t}.png`));
        }
        // the swap: release the held rotator timer (slide end -> rest with the next faces)
        await page.eval(`(() => { window.__anims.forEach((a) => { a.currentTime = 220; }); window.__hold = false; const h = window.__held.splice(0); h.forEach((f) => f()); return h.length; })()`);
        await page.eval(RAF2); await shot(page, join(OUT, `px-${arm.k}-post.png`));
        await sleep(300); await shot(page, join(OUT, `px-${arm.k}-post300.png`));
      }
      save();
    }
    if (MODES.includes('paused')) {
      // next slide (same faces in every arm after the pixel step): 3 frames in, scroll the section far away, back
      const c = await page.eval(CATCH(null, 5000, false), { timeout: 10000 });
      await page.eval(`new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
      const y0 = await page.eval('scrollY');
      await page.eval(`(() => { const s = document.querySelector('#people'); const r = s.getBoundingClientRect(); window.scrollTo({ top: scrollY + r.bottom + 1.6 * innerHeight, behavior: 'instant' }); return scrollY; })()`);
      await sleep(150);
      const away1 = JSON.parse(await page.eval(`(${SAMPLER(0)})`));
      await sleep(1300);
      const away2 = JSON.parse(await page.eval(`(${SAMPLER(0)})`));
      await page.eval(`window.scrollTo({ top: ${y0}, behavior: 'instant' }); 1`);
      const back = await page.eval(SAMPLER(2500), { timeout: 10000 });
      writeFileSync(join(OUT, `paused-${arm.k}.json`), JSON.stringify({ catch: c, y0, away1, away2, back: JSON.parse(back) }));
      const pzr = await shot(page, join(OUT, `pz-${arm.k}-back.png`));
      R.paused = { pz: pzr, catch: c, y0, away1Scene: away1[0]?.scene, away2Scene: away2[0]?.scene };
      console.log(arm.k, 'paused', JSON.stringify(R.paused)); save();
    }
    await page.close();
  }
} finally { save(); cdp.close(); await chrome.close(); }
// pixel compares of every pair at every t
const keys = ARMS.map((a) => a.k); res.cmp = {};
for (const t of [...TS, 'post', 'post300']) for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  try { res.cmp[`${t}:${keys[i]}~${keys[j]}`] = cmp(join(OUT, `px-${keys[i]}-${t}.png`), join(OUT, `px-${keys[j]}-${t}.png`)); } catch {}
}
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { try { res.cmp[`pz:${keys[i]}~${keys[j]}`] = cmp(join(OUT, `pz-${keys[i]}-back.png`), join(OUT, `pz-${keys[j]}-back.png`)); } catch {} }
save(); console.log('EXIT-OK');

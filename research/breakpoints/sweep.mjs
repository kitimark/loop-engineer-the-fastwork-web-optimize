// Breakpoint sweep (de-breakpoints, user thread T-034): baseline vs a fix stack across viewport widths, input modes and
// reduced motion. Functional only (no timing): console errors / 4xx, frozen-frame pixel identity at ~6 scroll stops,
// and a counts census (layouts, style recalcs, paints, layers) at rest and during a scripted scroll.
// Headless Chrome through tools/lib/cdp.mjs; run it inside a shared-lane chrome-measure hold.
//
// usage: node research/breakpoints/sweep.mjs <pix|pixr|census> <outdir> B=<baseline url> S=<fix url>
//   env CONFIGS=c375,c430,...   (default: all)   BUDGET=<s> (default 230; stops before a unit that would not fit and
//   prints PARTIAL; rerun the same command to resume)   ONLY=c375:pain,c900:end (pixr: the stops to recheck)
// Arms: B (baseline), S (fix), B2 (baseline again, the A/A noise floor), loaded in the order B S B2.
// pix:    one load per (config, arm); walks top -> end, at each stop settles 2 s (entrance transitions of 1.5-1.6 s end first), pauses every running animation at
//         currentTime 1000 ms, 2 rAFs, screenshot, then plays them again (timers keep running: countdown digits are
//         masked, avatar pixels counted apart). Fast tier; a stop whose A/B exceeds the A/A goes to pixr.
// pixr:   one load per (config, stop, arm), settle 3 s, the checka2 freeze (clear every timer, pause all animations at 1000 ms).
// census: one load per (config, arm): matchMedia truth table, 4 s rest at the top, rAF scroll to the end at vh/40 px
//         per frame, then a 1.5 s rest at the end and an elementFromPoint grid (F3 touch-target coverage).
// resize: one load per (sequence, stop, arm); resizes the live page through a width sequence crossing the JS-gated
//         breakpoints (D: desktop 1440>1000>860>600>430>1440; R: phone rotation 430x932>932x430>430x932), at each step
//         re-walks to the stop, settles 2 s, soft-freezes and screenshots; arms compare step by step.
// Output: <outdir>/sweep-<mode>.json (+ png/<config>/<arm>-<stop>.png, never committed).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA, enablePerformance, getMetrics } from '../../tools/lib/cdp.mjs';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [mode, outdir, ...targets] = process.argv.slice(2);
if (!['pix', 'pixr', 'census', 'resize'].includes(mode) || !outdir) { console.error('usage: sweep.mjs <pix|pixr|census> <outdir> B=<url> S=<url>'); process.exit(1); }
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
URLS.B2 = URLS.B;
const ARMS = ['B', 'S', 'B2'];

const DEFAULT_CFGS = Object.keys(CONFIGS).filter((k) => !CONFIGS[k].ge);
const cfgNames = (process.env.CONFIGS || DEFAULT_CFGS.join(',')).split(',').filter(Boolean);
const SETTLE = Number(process.env.SETTLE || 2000), SETTLE_R = Number(process.env.SETTLE || 3000);
const BUDGET = Number(process.env.BUDGET || 260) * 1000;
const T0 = Date.now();
const elapsed = () => Date.now() - T0;
mkdirSync(outdir, { recursive: true });
const stateFile = join(outdir, `sweep-${mode}.json`);
const res = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { mode, urls: URLS, units: {}, diffs: {} };
const save = () => writeFileSync(stateFile, JSON.stringify(res, null, 1));

const MQ = {
  'max-width:400': '(max-width: 400px)', 'max-width:600': '(max-width: 600px)', 'max-width:640': '(max-width: 640px)',
  'max-width:860': '(max-width: 860px)', 'min-width:861': '(min-width: 861px)', 'max-width:1000': '(max-width: 1000px)',
  'max-width:1030': '(max-width: 1030px)', 'max-width:1200': '(max-width: 1200px)', 'min-width:1280': '(min-width: 1280px)',
  'max-width:1511': '(max-width: 1511px)', 'hover:none': '(hover: none)', 'pointer:coarse': '(pointer: coarse)',
  'max-device-width:500': '(max-device-width: 500px)', 'reduce': '(prefers-reduced-motion: reduce)',
  'combo860': '(max-width: 860px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)',
  'combo1000': '(max-width: 1000px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)',
  'combo1030': '(max-width: 1030px), (max-device-width: 500px), (hover: none) and (pointer: coarse) and (max-width: 1200px)',
};
const STOPS = `(() => { const abs = (s, f = 0) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY + f * innerHeight) : null; };
  return { top: 0, hero: abs('.hero-track', 0.5), commission: abs('.commission'), pain: abs('.pain'), people: abs('#people', 0.5), end: 1e9 }; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 400; i++) { const max = document.documentElement.scrollHeight - innerHeight; const t = Math.min(${y}, max);
  if (Math.abs(scrollY - t) <= 1) break; const d = t - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(300, Math.abs(d)), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); }
  return Math.round(scrollY); })()`;
// masked from the diff: the countdown (clock phase), plus MASK=<css selectors> padded by 30 % of their height (e.g. the
// hero accent word, whose word and draw-in phase follow a 3 s timer: '.hero-title .script-accent')
const MASKSEL = process.env.MASK || '';
const RECTS = `[...document.querySelectorAll('.countdown')].map((e) => [e.getBoundingClientRect(), 0]).concat(${JSON.stringify(MASKSEL)} ? [...document.querySelectorAll(${JSON.stringify(MASKSEL)})].map((e) => [e.getBoundingClientRect(), 0.3]) : []).filter(([r]) => r.width && r.height).map(([r, p]) => ({ l: r.left - p * r.height, t: r.top - p * r.height, r: r.right + p * r.height, b: r.bottom + p * r.height }))`;
const AV = `[...document.querySelectorAll('.start-selling-avatars img')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }))`;
const ANIMS = `(() => { const vh = innerHeight, vw = innerWidth, m = new Map();
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (!t || !t.getBoundingClientRect) continue; const r = t.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw || !r.width || !r.height) continue;
    const k = (a.animationName || a.transitionProperty || a.id || 'js') + (a.effect.pseudoElement || '') + ':' + a.playState; m.set(k, (m.get(k) || 0) + 1); }
  return Object.fromEntries([...m.entries()].sort()); })()`;
const NAVWATCH = `(() => { const h = document.querySelector('header.start-selling-top-nav'); window.__bpNav = []; if (!h) return 0; const add = () => window.__bpNav.push([Math.round(scrollY), Math.round(performance.now()), h.className.replace(/svelte-[a-z0-9]+/g, '').replace(/\\s+/g, ' ').trim()]);
  add(); new MutationObserver(add).observe(h, { attributes: true, attributeFilter: ['class'] }); return 1; })()`;
const STATE = `(() => { const p = document.querySelector('#people'), sc = p && p.closest('[data-start-selling-scene]');
  return { y: Math.round(scrollY), sh: document.documentElement.scrollHeight, scene: sc ? sc.getAttribute('data-start-selling-scene') : null, dpr: devicePixelRatio,
    cd: ${RECTS}, av: ${AV}, anims: window.__bpAnims || null, nav: (window.__bpNav || []).slice(-3),
    hero: (() => { const t = document.querySelector('.hero-track'); return t ? [...t.classList].filter((c) => !c.startsWith('svelte-')).join(' ') : null; })() }; })()`;
const SOFT_FREEZE = `(async () => { window.__bpAnims = ${ANIMS}; window.__bpPaused = []; for (const a of document.getAnimations()) { if (a.playState !== 'running') continue;
  try { a.pause(); window.__bpPaused.push(a); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return ${STATE}; })()`;
const SOFT_THAW = `(() => { for (const a of window.__bpPaused || []) { try { a.play(); } catch (e) {} } window.__bpPaused = []; return 1; })()`;
const HARD_FREEZE = `(async () => { window.__bpAnims = ${ANIMS}; const hi = setTimeout(() => {}, 0); for (let i = 0; i <= hi + 1000; i++) { clearTimeout(i); clearInterval(i); }
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return ${STATE}; })()`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
let partial = false;

async function openPage(cfg) {
  const page = await cdp.newIsolatedPage();
  const errs = { exceptions: [], consoleErrors: [], http: [] };
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errs.exceptions.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0].slice(0, 200));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.consoleErrors.push(('log: ' + m.params.entry.text).slice(0, 200));
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errs.http.push(`${m.params.response.status} ${m.params.response.url.replace(/^https?:\/\/[^/]+/, '')}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
  await page.send('Emulation.setDeviceMetricsOverride', { width: cfg.width, height: cfg.height, deviceScaleFactor: cfg.dpr, mobile: !!cfg.touch,
    ...(cfg.screenWidth ? { screenWidth: cfg.screenWidth, screenHeight: cfg.screenHeight } : {}) });
  if (cfg.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cfg.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (cfg.ge) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!('GestureEvent' in window)) window.GestureEvent = function GestureEvent() {};` });
  return { page, errs };
}
const pngPath = (cname, arm, stop) => join(outdir, 'png', cname, `${arm}-${stop}.png`);
function fits(estS) { if (elapsed() + estS * 1000 > BUDGET) { partial = true; return false; } return true; }

let dp;
async function diff(fa, fb, mask, avr, dpr, outPng) {
  const a = readFileSync(fa).toString('base64'), b = readFileSync(fb).toString('base64');
  return dp.eval(`(async () => { const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
    const a = await load(${JSON.stringify(a)}), b = await load(${JSON.stringify(b)});
    const W = Math.min(a.width, b.width), H = Math.min(a.height, b.height); const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
    x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, W, H).data; x.clearRect(0, 0, W, H); x.drawImage(b, 0, 0); const db = x.getImageData(0, 0, W, H).data;
    const sc = (q) => [q.l * ${dpr} - 2, q.t * ${dpr} - 2, q.r * ${dpr} + 2, q.b * ${dpr} + 2];
    const M = ${JSON.stringify(mask)}.map(sc), A = ${JSON.stringify(avr)}.map(sc);
    const inR = (R, px, py) => R.some((q) => px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3]);
    const cell = 100 * ${dpr}, cells = new Map(); const heat = ${outPng ? 'new Uint8ClampedArray(da.length)' : 'null'}; let big = 0, maxd = 0;
    if (heat) for (let i = 0; i < da.length; i += 4) { const g = (da[i] + da[i+1] + da[i+2]) / 3 * 0.35 + 165; heat[i] = heat[i+1] = heat[i+2] = g; heat[i+3] = 255; }
    let n = 0, nav = 0, masked = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0, p = 0; i < da.length; i += 4, p++) if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i+1] - db[i+1]) > 8 || Math.abs(da[i+2] - db[i+2]) > 8) {
      const px = p % W, py = (p / W) | 0; if (inR(M, px, py)) { masked++; continue; } if (inR(A, px, py)) { nav++; if (heat) { heat[i] = 0; heat[i+1] = 90; heat[i+2] = 255; } continue; }
      const dd = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2])); if (dd > maxd) maxd = dd; if (dd > 48) big++;
      if (heat) { heat[i] = 255; heat[i+1] = dd > 48 ? 0 : 160; heat[i+2] = 0; }
      n++; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      const k = ((px / cell) | 0) + ',' + ((py / cell) | 0); cells.set(k, (cells.get(k) || 0) + 1); }
    let png = null; if (heat) { x.putImageData(new ImageData(heat, W, H), 0, 0); const bl = await c.convertToBlob({ type: 'image/png' }); const u8 = new Uint8Array(await bl.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); png = btoa(bin); }
    const top = [...cells.entries()].sort((u, v) => v[1] - u[1]).slice(0, 4).map(([k, v]) => k + ':' + v);
    return { pct: Number((100 * n / (W * H)).toFixed(3)), n, nav, masked, size: a.width === b.width && a.height === b.height ? null : [a.width, a.height, b.width, b.height],
      box: n ? [x0, y0, x1, y1].map((v) => Math.round(v / ${dpr})) : null, cells: top, big, maxd, png }; })()`).then((r) => { if (r.png && outPng) writeFileSync(outPng, Buffer.from(r.png, 'base64')); delete r.png; return r; });
}

async function pixUnit(cname, arm) {
  const key = `${cname}/${arm}`;
  if (res.units[key]?.done) return;
  if (!fits(35)) return;
  const cfg = CONFIGS[cname];
  const { page, errs } = await openPage(cfg);
  const t = Date.now();
  await gotoAndSettle(page, URLS[arm]); await sleep(2500);
  const stops = await page.eval(STOPS);
  await page.eval(NAVWATCH);
  const shots = {};
  const order = Object.entries(stops).filter(([, y]) => y != null).sort((p, q) => p[1] - q[1]);
  for (const [stop, y] of order) {
    await page.eval(walk(y)); await sleep(SETTLE);
    const st = await page.eval(SOFT_FREEZE);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    await page.eval(SOFT_THAW);
    mkdirSync(join(outdir, 'png', cname), { recursive: true });
    writeFileSync(pngPath(cname, arm, stop), Buffer.from(data, 'base64'));
    shots[stop] = { target: y, ...st };
  }
  await page.close();
  res.units[key] = { done: true, s: Math.round((Date.now() - t) / 1000), stops, shots, errs };
  save();
  console.log(`PIX ${key} ${res.units[key].s}s stops ${order.map(([s]) => `${s}@${shots[s].y}`).join(' ')}${CONFIGS[cname]?.ge ? ` hero[${order.map(([s]) => s + ":" + (shots[s].hero || "-")).join(" | ")}]` : ""} errs ${errs.exceptions.length}/${errs.consoleErrors.length}/${errs.http.length} @${Math.round(elapsed() / 1000)}s`);
}


const SEQS = {
  D: [{ width: 1440, height: 900 }, { width: 1000, height: 900 }, { width: 860, height: 900 }, { width: 600, height: 900 }, { width: 430, height: 900 }, { width: 1440, height: 900 }].map((m) => ({ ...m, dpr: 1, touch: false })),
  R: [{ width: 430, height: 932 }, { width: 932, height: 430 }, { width: 430, height: 932 }].map((m) => ({ ...m, dpr: 2, touch: true, screenWidth: 430, screenHeight: 932 })),
};
async function resizeUnit(seq, stop, arm) {
  const key = `${seq}/${stop}/${arm}`;
  if (res.units[key]?.done) return;
  if (!fits(50)) return;
  const steps = SEQS[seq];
  const { page, errs } = await openPage(steps[0]);
  await gotoAndSettle(page, URLS[arm]); await sleep(2500);
  await page.eval(NAVWATCH);
  const shots = {};
  for (let i = 0; i < steps.length; i++) {
    const m = steps[i];
    if (i) { await page.send('Emulation.setDeviceMetricsOverride', { width: m.width, height: m.height, deviceScaleFactor: m.dpr, mobile: !!m.touch, ...(m.screenWidth ? { screenWidth: m.screenWidth, screenHeight: m.screenHeight } : {}) }); await sleep(800); }
    const stops = await page.eval(STOPS);
    await page.eval(walk(stops[stop])); await sleep(SETTLE);
    const st = await page.eval(SOFT_FREEZE);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    await page.eval(SOFT_THAW);
    const tag = `${stop}-${i}w${m.width}`;
    mkdirSync(join(outdir, 'png', seq), { recursive: true });
    writeFileSync(pngPath(seq, arm, tag), Buffer.from(data, 'base64'));
    shots[tag] = { target: stops[stop], ...st };
  }
  await page.close();
  res.units[key] = { done: true, shots, errs };
  save();
  console.log(`RESIZE ${key} ${Object.entries(shots).map(([t, v]) => t + '@' + v.y).join(' ')} errs ${errs.exceptions.length}/${errs.consoleErrors.length}/${errs.http.length} @${Math.round(elapsed() / 1000)}s`);
}
async function resizeDiffs(seq, stop) {
  const u = (arm) => res.units[`${seq}/${stop}/${arm}`];
  if (!ARMS.every((a) => u(a)?.done)) return;
  for (const tag of Object.keys(u('B').shots)) {
    const dk = `${seq}/${tag}`;
    if (res.diffs[dk]) continue;
    const sh = (arm) => u(arm).shots[tag];
    const mask = ARMS.flatMap((a) => sh(a).cd), av = ARMS.flatMap((a) => sh(a).av), dpr = sh('B').dpr;
    const ab = await diff(pngPath(seq, 'B', tag), pngPath(seq, 'S', tag), mask, av, dpr, pngPath(seq, 'heatAB', tag));
    const aa = await diff(pngPath(seq, 'B', tag), pngPath(seq, 'B2', tag), mask, av, dpr);
    const s2b = await diff(pngPath(seq, 'S', tag), pngPath(seq, 'B2', tag), mask, av, dpr);
    res.diffs[dk] = { ys: ARMS.map((a) => sh(a).y), ab, aa, s2b, flag: Math.min(ab.pct, s2b.pct) > aa.pct + 0.05 };
    save();
    console.log(`DIFFZ ${dk} y ${res.diffs[dk].ys.join('/')} AB ${ab.pct}% (n ${ab.n} big ${ab.big} maxd ${ab.maxd} box ${JSON.stringify(ab.box)}) S~B2 ${s2b.pct}% AA ${aa.pct}%${res.diffs[dk].flag ? '  FLAG' : ''}`);
  }
}
async function pixrUnit(cname, stop, arm) {
  const key = `${cname}/${stop}/${arm}`;
  if (res.units[key]?.done) return;
  if (!fits(40)) return;
  const { page, errs } = await openPage(CONFIGS[cname]);
  await gotoAndSettle(page, URLS[arm]); await sleep(2500);
  const stops = await page.eval(STOPS);
  await page.eval(NAVWATCH);
  await page.eval(walk(stops[stop])); await sleep(SETTLE_R);
  const st = await page.eval(HARD_FREEZE);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(join(outdir, 'png', cname), { recursive: true });
  writeFileSync(pngPath(cname, arm, 'r-' + stop), Buffer.from(data, 'base64'));
  await page.close();
  res.units[key] = { done: true, shots: { ['r-' + stop]: { target: stops[stop], ...st } }, errs };
  save();
  console.log(`PIXR ${key} y${st.y} @${Math.round(elapsed() / 1000)}s`);
}

const CENSUS_TRACE = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', '__metadata'];
const COUNT = ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'Commit', 'FireAnimationFrame', 'TimerFire', 'ParseAuthorStyleSheet'];
async function censusUnit(cname, arm) {
  const key = `${cname}/${arm}`;
  if (res.units[key]?.done) return;
  if (!fits(75)) return;
  const cfg = CONFIGS[cname];
  const { page, errs } = await openPage(cfg);
  const t = Date.now();
  await gotoAndSettle(page, URLS[arm]); await sleep(2000);
  const mq = await page.eval(`(${JSON.stringify(MQ)} && Object.fromEntries(Object.entries(${JSON.stringify(MQ)}).map(([k, q]) => [k, matchMedia(q).matches])))`);
  await enablePerformance(page);
  let layers = 0, maxLayers = 0, layerSamples = 0;
  page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) { layers = m.params.layers.length; layerSamples++; if (layers > maxLayers) maxLayers = layers; } });
  await page.send('LayerTree.enable');
  const events = [];
  page.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  const traceDone = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', includedCategories: CENSUS_TRACE }, transferMode: 'ReportEvents' });
  const m0 = await getMetrics(page);
  await page.eval(`performance.mark('bp-rest0')`); await sleep(4000); await page.eval(`performance.mark('bp-rest1')`);
  const m1 = await getMetrics(page);
  const layersRest = layers; maxLayers = layers;
  const scroll = await page.eval(`(async () => { performance.mark('bp-scroll0'); const step = innerHeight / 40; let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { const max = document.documentElement.scrollHeight - innerHeight; if (scrollY >= max - 1 || performance.now() - t0 > 60000) return res();
      window.scrollBy({ top: step, behavior: 'instant' }); frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    performance.mark('bp-scroll1'); return { frames, ms: Math.round(performance.now() - t0), y: Math.round(scrollY), sh: document.documentElement.scrollHeight }; })()`);
  const m2 = await getMetrics(page);
  const layersMaxScroll = maxLayers;
  await sleep(1500);
  await page.eval(`performance.mark('bp-end1')`);
  const m3 = await getMetrics(page);
  const cover = await page.eval(`(() => { const vw = innerWidth, vh = innerHeight; let n = 0, plat = 0, nav = 0; const miss = new Map();
    for (let i = 0; i < 8; i++) for (let j = 0; j < 12; j++) { const x = (i + 0.5) * vw / 8, y = (j + 0.5) * vh / 12; const e = document.elementFromPoint(x, y); n++;
      if (e && e.closest('#platform')) plat++; else if (e && e.closest('header.start-selling-top-nav')) nav++;
      else { const k = e ? (e.closest('[id]')?.id || e.closest('section,footer,header')?.tagName || e.tagName) : 'none'; miss.set(k, (miss.get(k) || 0) + 1); } }
    const p = document.querySelector('#platform'), r = p && p.getBoundingClientRect();
    const vis = r ? Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh : 0;
    return { n, plat, nav, miss: Object.fromEntries(miss), platRect: r ? [Math.round(r.top), Math.round(r.bottom)] : null, platVis: Number(vis.toFixed(3)), O: !!r && vis >= 0.45 && r.bottom <= vh + 8 }; })()`);
  await page.send('Tracing.end');
  await traceDone;
  await page.send('LayerTree.disable').catch(() => {});
  const markTs = {};
  for (const e of events) if (e.name && e.name.startsWith('bp-') && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n' || e.ph === 'b')) markTs[e.name] ??= e.ts;
  const win = (a, b) => { const out = Object.fromEntries(COUNT.map((k) => [k, 0])); if (markTs[a] == null || markTs[b] == null) return null;
    for (const e of events) if (COUNT.includes(e.name) && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i') && e.ts >= markTs[a] && e.ts < markTs[b]) out[e.name]++;
    return out; };
  const dm = (x, y) => ({ layouts: y.LayoutCount - x.LayoutCount, recalcs: y.RecalcStyleCount - x.RecalcStyleCount });
  await page.close();
  res.units[key] = { done: true, s: Math.round((Date.now() - t) / 1000), mq, errs, scroll,
    rest: { ...dm(m0, m1), trace: win('bp-rest0', 'bp-rest1'), layers: layersRest },
    scrollCounts: { ...dm(m1, m2), trace: win('bp-scroll0', 'bp-scroll1'), maxLayers: layersMaxScroll },
    endRest: { ...dm(m2, m3), trace: win('bp-scroll1', 'bp-end1'), layers }, layerSamples, cover, marks: Object.keys(markTs).length };
  save();
  const u = res.units[key];
  console.log(`CENSUS ${key} ${u.s}s rest L${u.rest.layouts} R${u.rest.recalcs} P${u.rest.trace?.Paint} lay${u.rest.layers} | scroll L${u.scrollCounts.layouts} R${u.scrollCounts.recalcs} P${u.scrollCounts.trace?.Paint} maxlay${u.scrollCounts.maxLayers} frames ${scroll.frames} | cover plat ${cover.plat}/${cover.n} nav ${cover.nav} O ${cover.O} | errs ${errs.exceptions.length}/${errs.consoleErrors.length}/${errs.http.length} @${Math.round(elapsed() / 1000)}s`);
}

async function pixDiffs(cname, prefix = '') {
  const B = res.units[`${cname}/B`], S = res.units[`${cname}/S`], B2 = res.units[`${cname}/B2`];
  if (!B?.done || !S?.done || !B2?.done) return;
  for (const stop of Object.keys(B.shots)) {
    const dk = `${cname}/${stop}`;
    if (res.diffs[dk]) continue;
    if (!S.shots[stop] || !B2.shots[stop]) continue;
    const mask = [...B.shots[stop].cd, ...S.shots[stop].cd, ...B2.shots[stop].cd];
    const av = [...B.shots[stop].av, ...S.shots[stop].av, ...B2.shots[stop].av];
    const dpr = B.shots[stop].dpr;
    const ab = await diff(pngPath(cname, 'B', stop), pngPath(cname, 'S', stop), mask, av, dpr, pngPath(cname, 'heatAB', stop));
    const aa = await diff(pngPath(cname, 'B', stop), pngPath(cname, 'B2', stop), mask, av, dpr);
    const s2b = await diff(pngPath(cname, 'S', stop), pngPath(cname, 'B2', stop), mask, av, dpr);
    const ys = [B, S, B2].map((u) => u.shots[stop].y), shs = [B, S, B2].map((u) => u.shots[stop].sh), scenes = [B, S, B2].map((u) => u.shots[stop].scene);
    const an = [B, S, B2].map((u) => JSON.stringify(u.shots[stop].anims || null)), navs = [B, S, B2].map((u) => JSON.stringify((u.shots[stop].nav || []).map((e) => e[0] + ":" + e[2])));
    res.diffs[dk] = { ys, shs, scenes, ab, aa, s2b, flag: Math.min(ab.pct, s2b.pct) > aa.pct + 0.05, animsAB: an[0] === an[1], animsAA: an[0] === an[2], anims: an, navs };
    if (res.diffs[dk].flag || navs[0] !== navs[1]) console.log(`ANIMS ${dk} B ${an[0]} S ${an[1]} B2 ${an[2]} | nav B ${navs[0]} S ${navs[1]} B2 ${navs[2]}`);
    save();
    console.log(`DIFF ${dk} y ${ys.join('/')} AB ${ab.pct}% (n ${ab.n} big ${ab.big} maxd ${ab.maxd} av ${ab.nav} box ${JSON.stringify(ab.box)}) S~B2 ${s2b.pct}% AA ${aa.pct}% (n ${aa.n})${res.diffs[dk].flag ? '  FLAG' : ''}`);
  }
}
async function pixrDiffs(cname, stop) {
  const u = (arm) => res.units[`${cname}/${stop}/${arm}`];
  if (!ARMS.every((a) => u(a)?.done)) return;
  const dk = `${cname}/r-${stop}`;
  if (res.diffs[dk]) return;
  const sh = (arm) => u(arm).shots['r-' + stop];
  const mask = ARMS.flatMap((a) => sh(a).cd), av = ARMS.flatMap((a) => sh(a).av), dpr = sh('B').dpr;
  const ab = await diff(pngPath(cname, 'B', 'r-' + stop), pngPath(cname, 'S', 'r-' + stop), mask, av, dpr, pngPath(cname, 'heatAB', 'r-' + stop));
  const aa = await diff(pngPath(cname, 'B', 'r-' + stop), pngPath(cname, 'B2', 'r-' + stop), mask, av, dpr);
  const s2b = await diff(pngPath(cname, 'S', 'r-' + stop), pngPath(cname, 'B2', 'r-' + stop), mask, av, dpr);
  res.diffs[dk] = { ys: ARMS.map((a) => sh(a).y), scenes: ARMS.map((a) => sh(a).scene), ab, aa, s2b, flag: Math.min(ab.pct, s2b.pct) > aa.pct + 0.05 };
  save();
  console.log(`DIFFR ${dk} AB ${ab.pct}% (n ${ab.n} big ${ab.big} maxd ${ab.maxd} box ${JSON.stringify(ab.box)} cells ${ab.cells.join(' ')}) S~B2 ${s2b.pct}% AA ${aa.pct}%${res.diffs[dk].flag ? '  FLAG' : ''}`);
}

if (process.env.REDIFF) res.diffs = {};
try {
  dp = await cdp.newIsolatedPage();
  if (mode === 'pix') {
    for (const c of cfgNames) { for (const arm of ARMS) await pixUnit(c, arm); await pixDiffs(c); if (partial) break; }
  } else if (mode === 'resize') {
    for (const [seq, stop] of (process.env.RSTOPS || 'D:commission,D:people,R:commission,R:people').split(',').map((x) => x.split(':'))) { for (const arm of ARMS) await resizeUnit(seq, stop, arm); await resizeDiffs(seq, stop); if (partial) break; }
  } else if (mode === 'pixr') {
    const only = (process.env.ONLY || '').split(',').filter(Boolean).map((s) => s.split(':'));
    for (const [c, stop] of only) { for (const arm of ARMS) await pixrUnit(c, stop, arm); await pixrDiffs(c, stop); if (partial) break; }
  } else {
    for (const c of cfgNames) { for (const arm of ARMS) await censusUnit(c, arm); if (partial) break; }
  }
  await dp.close();
} finally { save(); cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
console.log(`${partial ? 'PARTIAL' : 'SWEEP DONE'} ${mode} ${Math.round(elapsed() / 1000)}s`);

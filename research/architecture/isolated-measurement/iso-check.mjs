#!/usr/bin/env node
// arch-isolated-measure feasibility check (T-029): Chrome counts only, no timing claim.
// At y 0, 4 s trace window per page load, CPU 1x, 430x932 DPR 3 mobile + touch, headless.
// For each build (URL) and each mode:
//   full        the page as served
//   freeze      F-155's freeze: every CSS animation paused (!important), Element.animate returns paused, SMIL paused
//   hide        everything outside the hero clock's ancestor chain display:none (the clock stays where layout puts it)
//   hidefreeze  both
// Counts per window: main frames, UpdateLayoutTree (+ elements), Layout, PrePaint, Paint, Layerize, Commit, IO,
// FireAnimationFrame, countdown FunctionCalls; main-thread ms per event kind (CPU 1x: descriptive, not a gain metric).
// Usage (inside a shared-lane hold, servers started in it): node research/architecture/isolated-measurement/iso-check.mjs --out <json> --build C=<url> --build V=<url> [--seconds 4]
import { writeFileSync } from 'node:fs';
const LIB = new URL('../../../tools/lib/cdp.mjs', import.meta.url).href;
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(LIB);
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const builds = argv.flatMap((a, i) => (a === '--build' ? [argv[i + 1]] : [])).map((s) => { const [k, ...u] = s.split('='); return { label: k, url: u.join('=') }; });
const seconds = Number(arg('--seconds', '4'));
const out = arg('--out');
const modes = (arg('--modes', 'full,freeze,hide,hidefreeze')).split(',');
const SCRATCH = new URL('../../../out/isolated-measure', import.meta.url).pathname;

const FREEZE = `(() => {
  const st = document.createElement('style'); st.textContent = '* { animation-play-state: paused !important; }'; document.head.append(st);
  const orig = Element.prototype.animate; Element.prototype.animate = function (...a) { const an = orig.apply(this, a); an.pause(); return an; };
  let n = 0; for (const a of document.getAnimations()) { a.pause(); n++; }
  let s = 0; for (const svg of document.querySelectorAll('svg')) if (svg.querySelector('animate, animateTransform, animateMotion, set')) { svg.pauseAnimations(); s++; }
  return { paused: n, smil: s }; })()`;
const PICK = `(() => {
  const all = [...document.querySelectorAll('[role=timer]')];
  const vis = all.map((t) => ({ t, r: t.getBoundingClientRect() })).filter((o) => o.r.width > 0 && o.r.bottom > 0 && o.r.top < innerHeight);
  const c = (vis.find((o) => o.t.closest('.hero')) || vis[0] || {}).t || null;
  window.__isoClock = c; return { timers: all.length, visible: vis.length, inHero: !!(c && c.closest('.hero')), rect: c ? JSON.stringify(c.getBoundingClientRect()) : null }; })()`;
const HIDE = `(() => {
  const c = window.__isoClock; if (!c) return { error: 'no clock' };
  let el = c, n = 0;
  while (el && el !== document.documentElement) { const p = el.parentElement; if (!p) break;
    for (const s of p.children) if (s !== el && !/^(SCRIPT|STYLE|LINK|META|TITLE|HEAD)$/.test(s.tagName)) { s.style.setProperty('display', 'none', 'important'); n++; }
    el = p; }
  return { hidden: n, rect: JSON.stringify(c.getBoundingClientRect()), docH: document.documentElement.scrollHeight, nodesShown: [...document.body.querySelectorAll('*')].filter((e) => e.getClientRects().length).length }; })()`;

const profileDir = tempProfileDir(SCRATCH + '/chrome', 'isolated-measure');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const results = [];
try {
  for (const b of builds) for (const mode of modes) {
    const page = await cdp.newIsolatedPage();
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, b.url, { quietMs: 1500, maxMs: 30000 });
      await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
      await sleep(2000);
      const src = await page.eval(`fetch('/_app/immutable/nodes/2.DyWL8TcE.js').then((r) => r.text())`);
      const lines = src.split('\n');
      const range = [lines.findIndex((l) => l.startsWith('var UE = { stiffness')), lines.findIndex((l) => l.startsWith('var lD = h('))];
      const pick = await page.eval(PICK);
      const frz = /freeze/.test(mode) ? await page.eval(FREEZE) : null;
      const hid = /hide/.test(mode) ? await page.eval(HIDE) : null;
      await sleep(1000);
      const events = [];
      page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
      await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 200 * 1024,
        includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', '__metadata', 'toplevel'] }, transferMode: 'ReportEvents' });
      await sleep(seconds * 1000);
      await page.send('Tracing.end');
      await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      // main renderer thread: the CrRendererMain with the most UpdateLayoutTree + FireAnimationFrame + BeginMainThreadFrame
      const names = new Map(events.filter((e) => e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name]));
      const score = new Map();
      for (const e of events) if (/^(UpdateLayoutTree|FireAnimationFrame|BeginMainThreadFrame|Paint)$/.test(e.name)) { const k = `${e.pid}:${e.tid}`; score.set(k, (score.get(k) || 0) + 1); }
      const main = [...score].filter(([k]) => names.get(k) === 'CrRendererMain').sort((a, b) => b[1] - a[1])[0]?.[0];
      const onMain = (e) => `${e.pid}:${e.tid}` === main;
      const M = events.filter(onMain);
      const cnt = (n) => M.filter((e) => e.name === n).length;
      const ms = (n) => +(M.filter((e) => e.name === n && e.ph === 'X').reduce((s, e) => s + (e.dur || 0), 0) / 1000).toFixed(1);
      const isCd = (e) => e.name === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(e.args?.data?.url || '') && range[0] >= 0 && e.args.data.lineNumber >= range[0] - 1 && e.args.data.lineNumber <= range[1] + 1;
      const frames = cnt('BeginMainThreadFrame');
      const r = {
        build: b.label, mode, pick, freeze: frz, hide: hid, countdownRange1Based: [range[0] + 1, range[1] + 1],
        counts: { mainFrames: frames, updateLayoutTree: cnt('UpdateLayoutTree'), styleElements: M.filter((e) => e.name === 'UpdateLayoutTree').reduce((n, e) => n + (e.args?.elementCount || e.args?.data?.elementCount || 0), 0),
          layout: cnt('Layout'), prePaint: cnt('PrePaint'), paint: cnt('Paint'), layerize: cnt('Layerize'), commit: cnt('Commit'),
          io: cnt('IntersectionObserverController::computeIntersections'), fireAnimationFrame: cnt('FireAnimationFrame'), countdownCalls: M.filter(isCd).length, timerFire: cnt('TimerFire') },
        ms: { updateLayoutTree: ms('UpdateLayoutTree'), layout: ms('Layout'), prePaint: ms('PrePaint'), paint: ms('Paint'), layerize: ms('Layerize'), commit: ms('Commit'),
          io: ms('IntersectionObserverController::computeIntersections'), functionCall: ms('FunctionCall') },
      };
      r.perFrame = Object.fromEntries(Object.entries(r.ms).map(([k, v]) => [k, frames ? +(v / frames).toFixed(3) : null]));
      results.push(r);
      console.log(JSON.stringify({ build: r.build, mode, counts: r.counts, hide: hid && { hidden: hid.hidden, nodesShown: hid.nodesShown }, pick: pick.inHero }));
    } finally { await page.close(); }
  }
} finally { cdp.close(); await chrome.close(); }
writeFileSync(out, JSON.stringify({ tool: 'scratch iso-check.mjs (arch-isolated-measure)', browser: chrome.browser, seconds, builds, results }, null, 1));

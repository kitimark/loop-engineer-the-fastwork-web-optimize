#!/usr/bin/env node
// T-029 countdown isolation pilot, Chrome part (arch-isolated-measure). Counts only, no timing claim.
// For each rep (round robin over builds) and each mode: fresh page load, y 0, 2 s settle, mode injection, 1 s, 4 s trace.
//   full    page as served
//   freeze  everything OUTSIDE the countdown subtree ([role=timer], marked data-iso-keep) frozen: CSS play-state paused,
//           Element.animate wrapped (paused unless the target is inside the keep subtree), running animations paused
//           (except keep), SMIL paused (except svgs inside keep)
// After the trace (outside the window): "countdown runs" check = 4 clipped screenshots of the clock 1.05 s apart,
// number of changed consecutive pairs (0 = countdown stopped).
// Usage: node pilot-chrome.mjs --out <json> --modes full|freeze[,..] --reps 3 --build C=<url> --build C2=<url> ...
import { writeFileSync } from 'node:fs';
const LIB = '<checkout>/tools/lib/cdp.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(LIB);
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const builds = argv.flatMap((a, i) => (a === '--build' ? [argv[i + 1]] : [])).map((s) => { const [k, ...u] = s.split('='); return { label: k, url: u.join('=') }; });
const seconds = Number(arg('--seconds', '4'));
const reps = Number(arg('--reps', '3'));
const out = arg('--out');
const modes = arg('--modes', 'full,freeze').split(',');
const SCRATCH = '<scratch>';

const PICK = `(() => {
  const all = [...document.querySelectorAll('[role=timer]')];
  const vis = all.map((t) => ({ t, r: t.getBoundingClientRect() })).filter((o) => o.r.width > 0 && o.r.bottom > 0 && o.r.top < innerHeight);
  const c = (vis.find((o) => o.t.closest('.hero')) || vis[0] || {}).t || null;
  if (c) c.setAttribute('data-iso-keep', '');
  window.__isoClock = c; const r = c && c.getBoundingClientRect();
  return { timers: all.length, visible: vis.length, inHero: !!(c && c.closest('.hero')), rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    keepNodes: c ? c.querySelectorAll('*').length : 0 }; })()`;
const FREEZE = `(() => {
  const inKeep = (el) => !!(el && el.closest && el.closest('[data-iso-keep]'));
  const st = document.createElement('style');
  st.textContent = '*:not([data-iso-keep], [data-iso-keep] *) { animation-play-state: paused !important; }';
  document.head.append(st);
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = orig.apply(this, a); if (!inKeep(this)) an.pause(); return an; };
  let n = 0, kept = 0;
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (inKeep(t)) { kept++; continue; } a.pause(); n++; }
  let s = 0; for (const svg of document.querySelectorAll('svg')) if (!inKeep(svg) && svg.querySelector('animate, animateTransform, animateMotion, set')) { svg.pauseAnimations(); s++; }
  return { paused: n, keptRunning: kept, smil: s }; })()`;

const profileDir = tempProfileDir(SCRATCH + '/chrome', 'isolated-measure-pilot');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const results = [];
const t0 = Date.now();
try {
  for (let rep = 1; rep <= reps; rep++) for (const b of builds) for (const mode of modes) {
    const page = await cdp.newIsolatedPage();
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, b.url, { quietMs: 1500, maxMs: 30000 });
      await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
      await sleep(1000);
      const src = await page.eval(`fetch('/_app/immutable/nodes/2.DyWL8TcE.js').then((r) => r.text())`);
      const lines = src.split('\n');
      const range = [lines.findIndex((l) => l.startsWith('var UE = { stiffness')), lines.findIndex((l) => l.startsWith('var lD = h('))];
      const pick = await page.eval(PICK);
      const frz = mode === 'freeze' ? await page.eval(FREEZE) : null;
      await sleep(1000);
      const events = [];
      const off = page.on ? page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); }) : null;
      await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 200 * 1024,
        includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', '__metadata', 'toplevel'] }, transferMode: 'ReportEvents' });
      await sleep(seconds * 1000);
      await page.send('Tracing.end');
      await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      // countdown-runs check, outside the window
      let changes = 0, prev = null;
      const r = pick.rect;
      for (let i = 0; i < 3 && r && mode === 'freeze'; i++) {
        const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
        if (prev !== null && shot.data !== prev) changes++;
        prev = shot.data;
        if (i < 2) await sleep(1050);
      }
      const names = new Map(events.filter((e) => e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name]));
      const score = new Map();
      for (const e of events) if (/^(UpdateLayoutTree|FireAnimationFrame|BeginMainThreadFrame|Paint)$/.test(e.name)) { const k = `${e.pid}:${e.tid}`; score.set(k, (score.get(k) || 0) + 1); }
      const main = [...score].filter(([k]) => names.get(k) === 'CrRendererMain').sort((a, b) => b[1] - a[1])[0]?.[0];
      const M = events.filter((e) => `${e.pid}:${e.tid}` === main);
      const cnt = (n) => M.filter((e) => e.name === n).length;
      const isCd = (e) => e.name === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(e.args?.data?.url || '') && range[0] >= 0 && range[1] >= 0 && e.args.data.lineNumber >= range[0] - 1 && e.args.data.lineNumber <= range[1] + 1;
      const rec = {
        rep, build: b.label, mode, pick, freeze: frz, countdownRange1Based: [range[0] + 1, range[1] + 1], countdownScreenChanges: changes,
        counts: { mainFrames: cnt('BeginMainThreadFrame'), updateLayoutTree: cnt('UpdateLayoutTree'),
          styleElements: M.filter((e) => e.name === 'UpdateLayoutTree').reduce((n, e) => n + (e.args?.elementCount || e.args?.data?.elementCount || 0), 0),
          layout: cnt('Layout'), prePaint: cnt('PrePaint'), paint: cnt('Paint'), layerize: cnt('Layerize'),
          io: cnt('IntersectionObserverController::computeIntersections'), fireAnimationFrame: cnt('FireAnimationFrame'),
          countdownCalls: M.filter(isCd).length, timerFire: cnt('TimerFire') },
      };
      results.push(rec);
      console.log(JSON.stringify({ rep, build: b.label, mode, c: rec.counts, scr: changes, frz, range: rec.countdownRange1Based, s: Math.round((Date.now() - t0) / 1000) }));
      if (typeof off === 'function') off();
    } finally { await page.close(); }
    writeFileSync(out, JSON.stringify({ tool: 'scratch pilot-chrome.mjs (arch-isolated-measure)', browser: chrome.browser, seconds, reps, modes, builds, results, partial: true }, null, 1));
  }
} finally { cdp.close(); await chrome.close(); }
writeFileSync(out, JSON.stringify({ tool: 'scratch pilot-chrome.mjs (arch-isolated-measure)', browser: chrome.browser, seconds, reps, modes, builds, results }, null, 1));

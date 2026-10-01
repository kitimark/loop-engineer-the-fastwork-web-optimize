#!/usr/bin/env node
// N11 vendor-scrollend: WHERE does the tag's scroll-depth long frame land? (timing: normal lock slot only)
//
//   node tools/lock.mjs run chrome-measure --owner fix-vendor-scrollend -- sh -c \
//     'node tools/fix.mjs ab vendor-scrollend --runs 5 [--on all-wave1] && node research/vendor-scrollend/phases.mjs [--on all-wave1] [--runs 2]'
//
// Baseline vs variant 02 (fixes/vendor-scrollend overlay), each on top of --on <topic>'s overlay if
// given, served like fix.mjs ab (--vendors=local --https --latency 150), mobile 430x932 DPR3, CPU 6x.
// It reproduces verify.mjs's scroll phase (smooth scrollBy 250 px every 300 ms to the bottom, +500 ms)
// and morph phase (4 touch scroll gestures past the end, +2 s), then adds a TAIL (default 10 s, no
// input) that verify.mjs does not measure. It records the time of every rAF gap >50 ms and every LoAF,
// labelled by phase, plus when gtm.scrollDepth is pushed (= when the tag's scroll-depth call ran).
// The question it answers: in 02, is the ~60 ms frame gone from scrolling, and where does it go?
// (scroll phase / morph phase / tail = after the A/B's measured window).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { launchChrome, CDP, gotoAndSettle, sleep } from '../../tools/lib/cdp.mjs';
import { REPO, resolveTree } from '../../tools/lib/paths.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const CPU = Number(opt('cpu', 6));
const RUNS = Number(opt('runs', 2));
const TAIL_S = Number(opt('tail', 10));
const ON = opt('on', null);
const OUT = resolve(REPO, opt('out', 'research/vendor-scrollend/data'));
mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const t0 = Date.now();
const log = (...a) => console.log(`[phases ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// Bounded steps: a hang must never keep the chrome-measure hold (this runs inside a normal, uncapped hold).
async function step(name, p, ms) {
  let to; try { return await Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`step "${name}" timed out after ${ms} ms`)), ms); })]); }
  finally { clearTimeout(to); }
}
const ov = (t) => join(REPO, 'fixes', t, 'overlay');
if (ON && !existsSync(ov(ON))) { console.error(`--on ${ON}: ${ov(ON)} missing`); process.exit(2); }
const VARIANTS = [
  { label: 'base', overlays: ON ? [ov(ON)] : [] },
  { label: '02-idle', overlays: [ov('vendor-scrollend'), ...(ON ? [ov(ON)] : [])] },
];

async function startServer(label, overlays) {
  const state = join(REPO, 'out', `phases-n11-${label}.json`);
  rmSync(state, { force: true });
  mkdirSync(join(REPO, 'out'), { recursive: true });
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', BASE, ...(overlays.length ? ['--overlay', overlays.join(',')] : []), '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'];
  const proc = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) {
    if (existsSync(state)) { try { return { proc, ...JSON.parse(readFileSync(state, 'utf8')) }; } catch {} }
    if (proc.exitCode !== null) throw new Error(`${label} server exited`);
    await sleep(100);
  }
  proc.kill(); throw new Error(`${label} server did not start`);
}

// Frame gaps >50 ms with their time, all LoAF entries with scripts, and dataLayer event times.
const HOOK = `(() => {
  const S = window.__n11p = { gaps: [], loaf: [], dl: [] };
  let last = 0;
  const tick = (t) => { if (last && t - last > 50) S.gaps.push({ t: Math.round(last), d: Math.round(t - last) }); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration),
    scripts: e.scripts.filter((s) => s.duration >= 5).map((s) => ({ src: String(s.sourceURL).replace(/^https?:[/][/][^/]+/, '').replace(/[?].*/, ''), inv: s.invoker, d: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration) })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { S.noLoaf = String(e); }
  let dl, depth = 0; const hookPush = (arr) => { if (!arr || arr.__n11) return; arr.__n11 = true; const wrap = (f) => function () {
      if (!depth) for (const m of arguments) { const ev = m && m.event; if (ev) S.dl.push({ ev: String(ev), t: Math.round(performance.now()) }); }
      depth++; try { return f.apply(this, arguments); } finally { depth--; } };
    let p = wrap(arr.push);
    Object.defineProperty(arr, 'push', { configurable: true, get() { return p; }, set(v) { p = v && v.__n11w ? v : wrap(v); p.__n11w = true; } }); };
  Object.defineProperty(window, 'dataLayer', { configurable: true, get() { return dl; }, set(v) { dl = v; hookPush(v); } });
})();`;

const SCROLL = `new Promise((res) => {
  let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res(ticks); }
    }, 280);
  }, 300);
})`;

async function run(cdp, v, url) {
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await page.send('Page.bringToFront');
  await page.send('Network.enable');
  await step('load', gotoAndSettle(page, url, { quietMs: 2000 }), 60000);
  await sleep(1500);
  const loc = await step('loc', page.eval('({ href: location.href, h: document.documentElement.scrollHeight })'), 15000);
  if (!/^https:\/\/localhost/.test(loc.href) || loc.h < 2000) throw new Error('page did not load: ' + JSON.stringify(loc));
  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await sleep(1000);
  const now = () => step('now', page.eval('Math.round(performance.now())'), 30000);
  const m = { scroll0: await now() };
  await step('scroll', page.eval(SCROLL, { timeout: 600000 }), 240000);
  await sleep(500);
  m.morph0 = await now();
  for (let i = 0; i < 4; i++) await step('gesture', page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 }), 60000);
  await sleep(2000);
  m.tail0 = await now();
  await sleep(TAIL_S * 1000);
  m.end = await now();
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const S = await step('collect', page.eval('JSON.parse(JSON.stringify(window.__n11p))'), 30000);
  await page.close();
  const phase = (t) => (t < m.scroll0 ? 'pre' : t < m.morph0 ? 'scroll' : t < m.tail0 ? 'morph' : t < m.end ? 'tail' : 'post');
  const isTag = (e) => e.scripts.some((s) => /googletagmanager/.test(s.src) && /scrollend/i.test(String(s.inv)));
  const isDeferred = (e) => e.scripts.some((s) => /\/analytics\.js$/.test(s.src) && !/scrollend/i.test(String(s.inv)) && s.d >= 30);
  const push = S.dl.find((e) => e.ev === 'gtm.scrollDepth');
  const loafIn = (p) => S.loaf.filter((e) => phase(e.t) === p && e.d > 50);
  const res = {
    variant: v.label, marks: m,
    scrollDepthPush: push ? { t: push.t, phase: phase(push.t), sAfterScrollPhaseEnd: Math.round((push.t - m.morph0) / 100) / 10 } : null,
    tagFrames: S.loaf.filter((e) => isTag(e) || isDeferred(e)).map((e) => ({ t: e.t, phase: phase(e.t), d: e.d, scripts: e.scripts })),
    gt50: Object.fromEntries(['scroll', 'morph', 'tail'].map((p) => [p, S.gaps.filter((g) => phase(g.t) === p).length])),
    loafGt50: Object.fromEntries(['scroll', 'morph', 'tail'].map((p) => [p, loafIn(p).length])),
    tailLoaf: loafIn('tail').map((e) => ({ t: e.t, d: e.d, scripts: e.scripts.slice(0, 4) })),
    noLoaf: S.noLoaf,
  };
  return res;
}

const host = { load1Before: os.loadavg()[0] };
const cpuT = () => os.cpus().reduce((a, x) => { for (const k in x.times) a[k] = (a[k] || 0) + x.times[k]; return a; }, {});
const c0 = cpuT();
const file = join(OUT, `phases-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const out = { tool: 'research/vendor-scrollend/phases.mjs', cpu: CPU, runs: RUNS, tailS: TAIL_S, on: ON, startedAt: new Date().toISOString(), host, results: [] };
const save = () => writeFileSync(file, JSON.stringify(out, null, 1));
const servers = {}; let chrome;
try {
  for (const v of VARIANTS) servers[v.label] = await startServer(v.label, v.overlays);
  chrome = await launchChrome({ port: 0, profileDir: join(REPO, 'out', 'chrome-phases-n11'), windowSize: '430,932' });
  const cdp = await CDP.connect(chrome.wsUrl);
  // allow the mirror's self-signed --https certificate (this dedicated Chrome only), as verify.mjs does
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true });
  for (let i = 0; i < RUNS; i++) {
    const order = i % 2 ? [...VARIANTS].reverse() : VARIANTS; // ABBA
    for (const v of order) {
      let r; try { r = await run(cdp, v, servers[v.label].url); } catch (e) { log(`${v.label} run ${i} FAILED: ${e.message}`); out.results.push({ variant: v.label, run: i, error: e.message }); save(); continue; } r.run = i;
      out.results.push(r); save();
      log(`${v.label} run ${i}: push ${JSON.stringify(r.scrollDepthPush)}; tag frames ${JSON.stringify(r.tagFrames.map((f) => `${f.phase} ${f.d}ms`))}; gt50 ${JSON.stringify(r.gt50)}; LoAF>50 ${JSON.stringify(r.loafGt50)}`);
    }
  }
  cdp.close();
} catch (e) { out.error = String(e && e.stack || e); console.error(e); }
finally {
  if (chrome) await chrome.close();
  for (const s of Object.values(servers)) try { s.proc.kill(); } catch {}
  const c1 = cpuT(); const tot = (t) => Object.values(t).reduce((a, b) => a + b, 0);
  host.load1After = os.loadavg()[0]; host.cpuIdlePct = Math.round((1000 * (c1.idle - c0.idle)) / (tot(c1) - tot(c0))) / 10;
  out.seconds = Math.round((Date.now() - t0) / 1000);
  save(); log('wrote', file, JSON.stringify(host));
}

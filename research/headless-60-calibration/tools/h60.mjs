#!/usr/bin/env node
// One-off research tool (cal-headless60, 2026-10-02): verify.mjs's timing sequence in HEADLESS Chrome (60 Hz here),
// pinned like tools/check.mjs (UA override, --screen-info DPR 2), mobile 430x932 DPR 3 + touch. No screenshots.
// verify.mjs / fix.mjs ab refuse headless on purpose; this tool exists only to calibrate that refusal (README.md).
// Run it ONLY inside an exclusive chrome-measure hold (lock.mjs run ... -- sh -c '...'): it takes no lock itself and
// refuses to start without FW_LOCK_HELD.
//
//   node h60.mjs <label>=<url>... [--cpu 6 | --cpus 4,6,8] [--runs 5] [--idle 6] [--headed] [--out file.json] [--tag t]
//
// Several targets alternate per run (A B, B A, ...). --cpus a,b,c: ONE target, the factors rotate per round
// (round r starts at factor r mod n), so drift hits every factor alike. One Chrome per process, a fresh isolated
// context per run (as verify.mjs). --headed: the same flow in a headed Chrome (tool parity reference).
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { LOGGER, RESET, COLLECT, COLLECT_AT } from '../../../tools/lib/perf-page.mjs';
import { snapshot, between, treeCpuSec, hostInfo } from '../../../tools/lib/host.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const targets = argv.filter((a) => /^[\w-]+=https?:\/\//.test(a)).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
if (!targets.length) { console.error('usage: node h60.mjs <label>=<url>... [--cpu 6|--cpus 4,6,8] [--runs 5] [--idle 6] [--headed] [--out f.json] [--tag t]'); process.exit(2); }
if (!process.env.FW_LOCK_HELD && !flag('dry')) { console.error('h60.mjs: run me inside `node tools/lock.mjs run chrome-measure --owner cal-headless60 -- ...` (no FW_LOCK_HELD)'); process.exit(2); }
const CPUS = String(opt('cpus', opt('cpu', '6'))).split(',').map(Number);
if (CPUS.some((x) => !(x >= 1 && x <= 30))) { console.error('bad --cpu/--cpus'); process.exit(2); }
if (CPUS.length > 1 && targets.length > 1) { console.error('--cpus with one target only'); process.exit(2); }
const RUNS = Number(opt('runs', 5));
const IDLE = Number(opt('idle', 6));
const HEADED = flag('headed');
const TAG = opt('tag', '');
const OUT = resolve(process.cwd(), opt('out', join(REPO, 'out', 'h60', `h60-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)));
const VP = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true };
const SCREEN = screenInfoArg();

// verify.mjs's SCROLL expression, verbatim
const SCROLL = `new Promise((res) => {
  const t0 = performance.now(); let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res({ ms: performance.now() - t0, ticks, y: scrollY, h: document.documentElement.scrollHeight }); }
    }, 280);
  }, 300);
})`;
// a fixed CPU loop (pure JS + a little DOM), timed in the page: shows the throttle applies and its effective factor
const SPIN = `(() => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 3e6; i++) x = (x + Math.sqrt(i) * 1.0001) % 1e9;
  const d = document.createElement('div'); for (let i = 0; i < 300; i++) { const s = document.createElement('span'); s.textContent = i; d.appendChild(s); } d.remove();
  return Math.round((performance.now() - t0) * 10) / 10; })()`;

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
function pctl(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }
/** Frame summary: verify.mjs's ms columns + the phone's twins + ticks at the observed cadence (60 Hz headless). */
function summarize(perf, periodMs) {
  const f = perf.frames, total = f.reduce((a, b) => a + b, 0), n = (t) => f.filter((x) => x > t).length;
  const k = f.map((dt) => Math.round(dt / periodMs));
  const hist = {}; for (const x of k) hist[x] = (hist[x] || 0) + 1;
  return {
    frames: f.length, seconds: r1(total / 1000), fps: r1(f.length / (total / 1000 || 1)),
    p50: r1(pctl(f, 50)), p95: r1(pctl(f, 95)), max: r1(Math.max(0, ...f)),
    gt20: n(20), gt30: n(30), gt34: n(34), gt38: n(38), gt46: n(46), gt50: n(50), gt54: n(54), gt100: n(100),
    near34: f.filter((x) => x > 30 && x <= 38).length, near50: f.filter((x) => x > 46 && x <= 54).length,
    k2: k.filter((x) => x >= 2).length, k3: k.filter((x) => x >= 3).length, k4: k.filter((x) => x >= 4).length, k5: k.filter((x) => x >= 5).length, k7: k.filter((x) => x >= 7).length,
    missed: k.reduce((a, x) => a + Math.max(0, x - 1), 0), kHist: hist,
    loafCount: perf.loaf.length, loafMs: Math.round(perf.loaf.reduce((a, e) => a + e.duration, 0)),
    loafScriptMs: Math.round(perf.loaf.reduce((a, e) => a + e.scripts.reduce((b, s) => b + s.dur, 0), 0)),
    forcedMs: Math.round(perf.loaf.reduce((a, e) => a + e.scripts.reduce((b, s) => b + (s.forced || 0), 0), 0)),
    frameList: f.map((x) => Math.round(x * 10) / 10),
  };
}

let ch, cdp;
async function open() {
  const profileDir = tempProfileDir(join(REPO, 'out', 'h60', 'profiles'), `h60${TAG ? '-' + TAG : ''}`);
  ch = await launchChrome({ port: 0, profileDir, headless: !HEADED, args: HEADED ? [] : [SCREEN] });
  process.on('exit', () => { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} });
  cdp = await CDP.connect(ch.wsUrl);
  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
  return profileDir;
}

async function measure(t, cpu, run) {
  const page = await cdp.newIsolatedPage();
  const errors = []; let reqs = 0;
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') reqs++;
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 160)}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (!HEADED) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
  await page.send('Emulation.setDeviceMetricsOverride', VP);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LOGGER });
  await page.send('Page.bringToFront');
  const runStart = await snapshot();
  await gotoAndSettle(page, t.url, { quietMs: 2000 });
  await sleep(1500);
  const state = await page.eval(`({ nav: document.querySelector('.start-selling-top-nav')?.className, h: document.documentElement.scrollHeight,
    hj: typeof hj, ua: navigator.userAgent.includes('Headless'), dpr: devicePixelRatio, w: innerWidth, ih: innerHeight })`);
  const spin1 = await page.eval(SPIN);
  await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await sleep(1000);
  let idlePerf = null, idleHost = null;
  if (IDLE > 0) {
    const h0 = await snapshot();
    await page.eval(RESET);
    await sleep(IDLE * 1000);
    idlePerf = await page.eval(COLLECT_AT);
    idleHost = between(h0, await snapshot());
  }
  const c0 = await treeCpuSec(ch.proc.pid), h0 = await snapshot();
  await page.eval(RESET);
  const scroll = await page.eval(SCROLL, { timeout: 600000 });
  await sleep(500);
  const scrollPerf = await page.eval(COLLECT);
  const h1 = await snapshot(), c1 = await treeCpuSec(ch.proc.pid);
  const scrollHost = between(h0, h1);
  scrollHost.chromeCpuPct = c0 != null && c1 != null && scrollHost.windowSec > 0 ? r1((100 * (c1 - c0)) / scrollHost.windowSec / (await hostInfo()).cpus) : null;
  await page.eval(RESET);
  for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  await sleep(2000);
  const morphPerf = await page.eval(COLLECT);
  const morphState = await page.eval(`document.querySelector('.start-selling-top-nav')?.className`);
  const spinT = await page.eval(SPIN);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  const runEnd = await snapshot();
  // cadence from the idle phase median (as iphone_analyze.mjs): > 12 ms -> 60 Hz, else 120 Hz
  const idleMed = idlePerf?.frames.length ? pctl(idlePerf.frames, 50) : pctl(scrollPerf.frames, 50);
  const period = idleMed > 12 ? 1000 / 60 : 1000 / 120;
  return {
    label: t.label, url: t.url, cpu, run, mode: HEADED ? 'headed' : 'headless', at: new Date(runStart.at).toISOString(), periodMs: r1(period), state, errors: [...new Set(errors)].slice(0, 10), requests: reqs,
    spin: { rate1Ms: spin1, rateMs: spinT, factor: r1(spinT / spin1) }, scroll, morphReached: /is-morphing|is-expanded/.test(morphState || ''), morphState,
    host: { load1Start: runStart.load1, load1End: runEnd.load1, freeMemMB: runStart.freeMemMB, idle: idleHost, scroll: scrollHost },
    idle: idlePerf ? summarize(idlePerf, period) : null, scrollSummary: summarize(scrollPerf, period), morph: summarize(morphPerf, period),
  };
}

async function main() {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));
  await open();
  const results = [];
  const plan = [];
  for (let run = 0; run < RUNS; run++) {
    if (CPUS.length > 1) for (let j = 0; j < CPUS.length; j++) plan.push({ t: targets[0], cpu: CPUS[(run + j) % CPUS.length], run });
    else for (const t of run % 2 ? [...targets].reverse() : targets) plan.push({ t, cpu: CPUS[0], run });
  }
  const t0 = Date.now();
  try {
    for (const p of plan) {
      process.stdout.write(`[${TAG || '-'} run ${p.run + 1}/${RUNS}] ${p.t.label} ${p.cpu}x ... `);
      const r = await measure(p.t, p.cpu, p.run);
      results.push(r);
      const s = r.scrollSummary;
      console.log(`scroll fps ${s.fps} >34 ${s.gt34} (30/38: ${s.gt30}/${s.gt38}) >50 ${s.gt50} (46/54: ${s.gt46}/${s.gt54}) >100 ${s.gt100} k>=3 ${s.k3} k>=4 ${s.k4} max ${s.max} LoAF ${s.loafMs} | idle >34 ${r.idle?.gt34} | ${r.scroll.ms | 0} ms | spin x${r.spin.factor} | period ${r.periodMs} | load1 ${r.host.load1Start} busy ${r.host.scroll.busyPct}% chrome ${r.host.scroll.chromeCpuPct}% | morph ${r.morphReached} | err ${r.errors.length} | h ${r.state.h} hj ${r.state.hj}`);
    }
  } finally { cdp?.close(); await ch?.close(); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ tool: 'research/headless-60-calibration/tools/h60.mjs', tag: TAG, mode: HEADED ? 'headed' : 'headless', browser: ch.browser, uaOverride: HEADED ? null : headedUA(ch.userAgent),
    screenInfo: HEADED ? null : SCREEN, viewport: VP, cpus: CPUS, idle: IDLE, runs: RUNS, targets, wallSec: Math.round((Date.now() - t0) / 1000), host: await hostInfo(), results }, null, 1));
  console.log('details: ' + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });

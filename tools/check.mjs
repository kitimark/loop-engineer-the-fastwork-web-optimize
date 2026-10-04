#!/usr/bin/env node
// Functional checks in headless Chrome: does a page (or a patched build) still work? No timing numbers.
// Design and the headed-vs-headless evidence: research/architecture/headless-functional.md (ts-headless, 2026-10-02).
//
//   node tools/check.mjs <label>=<url>... [--viewport mobile|desktop|both] [--no-screens] [--probe <name>=<js expr>]...
//        [--out out/check/<stamp>] [--result file.json] [--owner name] [--max-seconds 300] [--screen-dpr 2] [--keep-profile]
//   Its temp Chrome profile (out/chrome-fn/<owner>-<pid>-<hex>) is removed when the job ends, also on an error or a
//   signal (lib/cdp.mjs, I-095); --keep-profile (or FW_KEEP_PROFILE=1) keeps it for debugging.
//
// Per target and viewport, in a fresh isolated context of ONE headless Chrome (unthrottled):
//   load + settle, verify.mjs's state probe (the same expression), a DOM fingerprint (element count, tag.class tokens),
//   the --probe expressions, a stepped instant walk to the bottom, the morph gestures of verify.mjs (touch on mobile,
//   wheel on desktop) -> morphState / morphReached, then (unless --no-screens) top / middle / bottom screenshots from a
//   fresh load, walked like verify.mjs; console errors (exceptions + Log errors), first-party 4xx, failed requests and the
//   vendor shim's stats. With several targets: screenshot pixel diffs against the first, within this mode only.
//
// Headless, made to see the page a headed Chrome sees (both CONFIRMED / OBSERVED in the design doc):
//   - the UA is overridden per page (HeadlessChrome/ -> Chrome/): Hotjar's bootstrap skips /headless/i user agents;
//   - the virtual screen is pinned to this Mac's, 1512x982 at devicePixelRatio 2 (--screen-info; --screen-dpr to change):
//     headless defaults to 800x600 at DPR 1, which moved layout by 1 px and screenshots by ~3 % against headed.
// What headless can NOT tell: frame timing (60 Hz here, not 120), presentation, paint-rect scale, host load. Those stay
// with the headed, exclusive timing tools (verify.mjs, fix.mjs ab, bench gain), which refuse a headless browser.
//
// Lock: chrome-measure in the shared lane (ts-lock-share; weight "check" = 1, at most 300 s) where the lock library
// has it, else the short lane with the same budget; inside an outer hold (lock.mjs run, FW_LOCK_HELD / FW_LOCK_SHARED)
// it re-enters that hold. Stops itself 3 s before the budget (exit 124). Every job has its own profile dir
// (out/chrome-fn/<owner>-<pid>-<rand>, removed at exit) and DevTools port 0, so several run at once.
// Result (check.json): kind "functional", chromeMode "headless", uaOverride, screenInfo, lock {mode, weight, maxSec};
// no frame, fps, LoAF or duration field (job.seconds is the tool's own run time).
// Exit: 0 ok, 1 a functional failure (a page error, a target that did not scroll to the bottom, no nav in the state
// probe), 2 usage, 3 the baseline is not the pinned snapshot, 124 the lock budget ran out.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir, HEADLESS_SCREEN } from './lib/cdp.mjs';
import { REPO, checkoutId } from './lib/paths.mjs';
import { requireBaseline, baselineStatus, baselineMeta } from './lib/baseline.mjs';
import * as lockLib from './lib/lock.mjs';
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const argv = process.argv.slice(2);
const VALUED = ['--viewport', '--probe', '--out', '--result', '--owner', '--max-seconds', '--screen-dpr'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') && a.startsWith(`--${n}=`) ? a.slice(n.length + 3) : argv[i + 1]; };
const opts = (n) => argv.flatMap((a, i) => (a === `--${n}` ? [argv[i + 1]] : a.startsWith(`--${n}=`) ? [a.slice(n.length + 3)] : []));
const flag = (n) => argv.includes(`--${n}`);
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };
const USAGE = 'usage: node tools/check.mjs <label>=<url>... [--viewport mobile|desktop|both] [--no-screens] [--probe name=expr]... [--out dir] [--result file.json] [--owner name] [--max-seconds 300] [--screen-dpr 2] [--keep-profile]';

const targets = argv.filter((a, i) => /^[\w-]+=https?:\/\//.test(a) && !(i > 0 && VALUED.includes(argv[i - 1]))).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
if (!targets.length) die(USAGE);
if (new Set(targets.map((t) => t.label)).size !== targets.length) die('check.mjs: target labels must be unique');
const VIEWPORTS = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true } };
const vpSel = opt('viewport', 'mobile');
if (!['mobile', 'desktop', 'both'].includes(vpSel)) die('--viewport must be mobile, desktop or both');
const vpList = vpSel === 'both' ? ['mobile', 'desktop'] : [vpSel];
const SCREENS = !flag('no-screens');
const PROBES = opts('probe').map((p) => { const i = String(p).indexOf('='); if (i < 1) die(`--probe needs <name>=<js expression> (got "${p}")`); return { name: p.slice(0, i), expr: p.slice(i + 1) }; });
const MAX_SEC = Number(opt('max-seconds', 300));
if (!(Number.isInteger(MAX_SEC) && MAX_SEC >= 10 && MAX_SEC <= 300)) die('--max-seconds must be an integer 10-300 (a functional check is a bounded job in the shared or short lane)');
const DPR = Number(opt('screen-dpr', HEADLESS_SCREEN.dpr));
if (!(DPR > 0 && DPR <= 4)) die('--screen-dpr must be a number > 0 and <= 4');
const SCREEN = { width: HEADLESS_SCREEN.width, height: HEADLESS_SCREEN.height, dpr: DPR, arg: screenInfoArg({ dpr: DPR }) };
for (const f of ['cpu', 'idle', 'runs', 'trace-frames', 'paint-rects', 'cdp-metrics', 'frame-log']) if (flag(f) || opt(f) !== undefined) die(`check.mjs is functional only: --${f} is a timing option (use tools/verify.mjs or tools/fix.mjs ab)`);
const OWNER = opt('owner', process.env.FW_LOCK_OWNER || checkoutId());
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = resolve(REPO, opt('out', join('out', 'check', STAMP)));
// FW_CHECK_TEST_FAST=1 shortens the page waits for the fake-Chrome tests only; recorded in the result (timing: test-fast)
const FAST = process.env.FW_CHECK_TEST_FAST === '1';
const W = FAST ? { quiet: 100, settle: 0, morph: 0, shot: 0 } : { quiet: 2000, settle: 1500, morph: 2000, shot: 2500 };

// Local targets serve the baseline: it must be the pinned snapshot (as verify.mjs; exit 3 otherwise).
const LIVE = /^https?:\/\/([\w-]+\.)*fastwork\.com(:\d+)?(\/|$)/i;
const LOCAL = !targets.every((t) => LIVE.test(t.url));
const BASELINE = baselineMeta(LOCAL ? requireBaseline('check.mjs') : baselineStatus());

// ---- page-side expressions -----------------------------------------------------------------------------
// the same expression as tools/verify.mjs measure() (state): a check and an A/B describe the page alike
const STATE = `({
    kit: Object.keys(window).filter(k => k.startsWith('__sveltekit')),
    nav: document.querySelector('.start-selling-top-nav')?.className,
    hero: document.querySelector('.hero')?.className,
    h: document.documentElement.scrollHeight,
    shim: window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts.length } : null,
    vendors: { gtag: typeof gtag, amplitude: typeof amplitude, hj: typeof hj, dataLayer: (window.dataLayer||[]).length },
  })`;
// before emulation: the screen Chrome runs on (the pinned --screen-info), the UA the page sees
const PRE = `(() => { const __fwCheckPre = 1; return { dpr: devicePixelRatio, screen: [screen.width, screen.height], ua: navigator.userAgent }; })()`;
const DOM = `(() => { const __fwCheckDom = 1; const all = document.querySelectorAll('*'); const t = new Set();
  for (const e of all) { const tag = e.localName; if (!e.classList.length) t.add(tag); for (const c of e.classList) t.add(tag + '.' + c); }
  return { elements: all.length, tokens: [...t].sort().slice(0, 4000) }; })()`;
const walkTo = (y) => `new Promise(async (res) => { while (Math.abs(scrollY - ${y}) > 1) { const d = ${y} - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); if (scrollY + innerHeight >= document.documentElement.scrollHeight - 1 && d > 0) break; } res(); })`;
const WALK = `(async () => { const __fwCheckWalk = 1; let steps = 0; const maxY = () => document.documentElement.scrollHeight - innerHeight;
  while (scrollY < maxY() - 1 && steps < 400) { window.scrollBy({ top: 300, behavior: 'instant' }); steps++; await new Promise(r => setTimeout(r, 60)); }
  return { y: Math.round(scrollY), maxY: maxY(), h: document.documentElement.scrollHeight, steps }; })()`;
const NAV = `document.querySelector('.start-selling-top-nav')?.className`;
const SHIM = 'window.__mirrorVendorShim ? { scripts: window.__mirrorVendorShim.rewrittenScripts, neutered: window.__mirrorVendorShim.neutered } : null';

// ---- lock ----------------------------------------------------------------------------------------------
/** The shared lane where lib/lock.mjs has it (ts-lock-share), else the short lane; the request as recorded. */
function lockRequest(lib, maxSec) {
  const lane = lib.SHARED_LANE;
  return lane ? { shared: true, weight: lane.weights?.check ?? 1, maxSec } : { short: true, maxSec };
}

// ---- one target ------------------------------------------------------------------------------------------
const rel = (f) => relative(REPO, f).split('\\').join('/');
async function checkTarget(cdp, t, vpName, userAgent) {
  const vp = VIEWPORTS[vpName];
  const page = await cdp.newIsolatedPage();
  const requests = [], errors = [];
  page.on((m) => {
    if (m.method === 'Network.requestWillBeSent') requests.push({ id: m.params.requestId, url: m.params.request.url, type: m.params.type });
    if (m.method === 'Network.responseReceived') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.status = m.params.response.status; }
    if (m.method === 'Network.loadingFailed') { const r = requests.find((x) => x.id === m.params.requestId); if (r) r.failed = m.params.blockedReason || m.params.errorText; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.source}: ${String(m.params.entry.text).slice(0, 160)}`);
  });
  await page.send('Network.enable');
  await page.send('Log.enable');
  const pre = await page.eval(PRE).catch(() => null);
  if (userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent });
  await page.send('Emulation.setDeviceMetricsOverride', vp);
  if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await gotoAndSettle(page, t.url, { quietMs: W.quiet });
  await sleep(W.settle);
  const state = await page.eval(STATE).catch((e) => ({ error: e.message }));
  const dom = await page.eval(DOM).catch((e) => ({ error: e.message }));
  const probes = {};
  for (const p of PROBES) probes[p.name] = await page.eval(p.expr, { timeout: 30000 }).then((v) => (v === undefined ? null : v), (e) => ({ error: e.message }));
  const walk = await page.eval(WALK, { timeout: 60000 }).catch((e) => ({ error: e.message }));
  if (vp.mobile) {
    for (let i = 0; i < 4; i++) await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -500, speed: 1200, gestureSourceType: 'touch', repeatCount: 1 });
  } else {
    for (let i = 0; i < 25; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 }); await sleep(FAST ? 0 : 100); }
  }
  await sleep(W.morph);
  const morphState = await page.eval(NAV).catch(() => null);
  const shots = {};
  if (SCREENS) {
    await gotoAndSettle(page, t.url, { quietMs: W.quiet });
    await sleep(W.settle);
    const maxY = await page.eval('document.documentElement.scrollHeight - innerHeight');
    for (const [name, y] of [['top', 0], ['middle', Math.round((maxY || 0) * 0.45)], ['bottom', maxY || 0]]) {
      await page.eval(walkTo(y), { timeout: 60000 });
      await sleep(W.shot);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = join(OUT, `${vpName}-${t.label}-${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      shots[name] = rel(file);
    }
  }
  const shimStats = await page.eval(SHIM).catch(() => null);
  await page.close();
  const firstParty = requests.filter((r) => { try { return new URL(r.url).origin === new URL(t.url).origin; } catch { return false; } });
  const failures = [];
  const errs = [...new Set(errors)].slice(0, 30);
  if (errs.length) failures.push(`${errs.length} console error(s)`);
  if (!walk || walk.error || !(walk.y >= walk.maxY - 1)) failures.push(`did not scroll to the bottom (${walk?.error ?? `y ${walk?.y} of ${walk?.maxY}`})`);
  if (!state || state.error || !state.nav) failures.push(`no .start-selling-top-nav in the state probe${state?.error ? ` (${state.error})` : ''}`);
  return {
    label: t.label, url: t.url, viewport: vpName, preEmulation: pre, state, dom, probes, walk, morphState, morphReached: /is-morph/.test(morphState || ''), shots, shimStats,
    requests: requests.length,
    notFound: firstParty.filter((r) => r.status >= 400).map((r) => `${r.status} ${new URL(r.url).pathname}`),
    failed: requests.filter((r) => r.failed).map((r) => { try { const u = new URL(r.url); return `${r.failed} ${u.host}${u.pathname}`; } catch { return `${r.failed} ${r.url}`; } }).slice(0, 30),
    scripts: [...new Set(firstParty.filter((r) => r.type === 'Script').map((r) => new URL(r.url).pathname))].sort(),
    errors: errs, failures,
  };
}

// Pixel diff of two PNGs in the browser (canvas), as tools/verify.mjs diffImages: % of pixels whose RGB sum differs > 48.
async function diffImages(cdp, a, b) {
  const page = await cdp.newIsolatedPage();
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64');
  const db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  try {
    return await page.eval(`(async () => {
    const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let diff = 0;
    for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]) > 48) diff++;
    return { w, h, diffPct: Math.round(10000 * diff / (w * h)) / 100 };
  })()`);
  } finally { await page.close(); }
}

async function main() {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
  const t0 = Date.now();
  const req = lockRequest(lockLib, MAX_SEC);
  const lock = await lockLib.acquire('chrome-measure', { owner: OWNER, kind: 'process', ...req, meta: { cmd: 'check', chromeMode: 'headless', targets: targets.map((t) => t.label), viewport: vpSel } });
  const mode = lock.mode ?? (lock.reentrant ? 'reentrant' : req.shared ? 'shared' : 'short');
  if (!lock.reentrant) {
    // a bounded hold ends at MAX_SEC for everyone else: stop before that, never run past it
    setTimeout(() => { console.error(`check.mjs: the lock budget of ${MAX_SEC} s ran out: stopping (fewer targets, --viewport, or --no-screens)`); process.exit(124); }, Math.max(1, MAX_SEC - 3) * 1000).unref();
  }
  mkdirSync(OUT, { recursive: true });
  // its own temp profile: lib/cdp.mjs removes it at close, at exit and on a signal (I-095); --keep-profile keeps it
  const profileDir = tempProfileDir(join(REPO, 'out', 'chrome-fn'), OWNER);
  const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [SCREEN.arg], ...(flag('keep-profile') ? { keepProfile: true } : {}) });
  const userAgent = ch.userAgent ? headedUA(ch.userAgent) : null;
  const results = [], diffs = [];
  let cdp;
  try {
    cdp = await CDP.connect(ch.wsUrl);
    await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {}); // the mirror's --https cert
    for (const vpName of vpList) {
      for (const t of targets) {
        process.stdout.write(`[check ${vpName}] ${t.label} ${t.url} ... `);
        const r = await checkTarget(cdp, t, vpName, userAgent);
        results.push(r);
        console.log(`${r.failures.length ? 'FAIL: ' + r.failures.join('; ') : 'ok'}  (morph ${r.morphReached ? 'reached' : 'NOT reached'}, ${r.errors.length} errors, ${r.notFound.length} 4xx, ${r.dom?.elements ?? '?'} elements)`);
      }
      if (SCREENS && targets.length > 1) {
        const ref = targets[0];
        for (const t of targets.slice(1)) for (const name of ['top', 'middle', 'bottom']) {
          const d = await diffImages(cdp, join(OUT, `${vpName}-${ref.label}-${name}.png`), join(OUT, `${vpName}-${t.label}-${name}.png`)).catch((e) => ({ error: e.message }));
          diffs.push({ viewport: vpName, a: ref.label, b: t.label, shot: name, ...d, withinMode: 'headless' });
        }
      }
    }
  } finally { cdp?.close(); await ch.close(); lock.release(); }

  const failures = results.flatMap((r) => r.failures.map((f) => `${r.viewport} ${r.label}: ${f}`));
  const out = {
    kind: 'functional', tool: 'check.mjs', chromeMode: 'headless', createdAt: new Date().toISOString(),
    browser: ch.browser, uaOverride: userAgent, screenInfo: SCREEN, lock: { mode, ...(req.shared ? { weight: req.weight } : {}), maxSec: MAX_SEC },
    baselineSnapshot: BASELINE, viewports: vpList, targets, probes: PROBES.map((p) => p.name), ...(FAST ? { timing: 'test-fast' } : {}),
    note: 'functional only (headless): no timing; screenshot diffs compare within headless only (research/architecture/headless-functional.md)',
    job: { seconds: Math.round((Date.now() - t0) / 100) / 10 },
    results, diffs, failures,
  };
  const file = opt('result') ? resolve(process.cwd(), opt('result')) : join(OUT, 'check.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1));
  if (diffs.length) { console.log(`screenshot pixel diff vs ${targets[0].label} (% of pixels, headless vs headless):`); for (const d of diffs) console.log(`  ${d.viewport} ${d.b} ${d.shot}: ${d.diffPct ?? d.error}`); }
  console.log(`${failures.length ? `CHECK FAIL (${failures.length})` : 'CHECK OK'}: ${results.length} page(s), headless (UA override ${userAgent ? 'on' : 'off'}, screen ${SCREEN.width}x${SCREEN.height} DPR ${SCREEN.dpr}), lock ${mode}`);
  console.log('details: ' + file);
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });

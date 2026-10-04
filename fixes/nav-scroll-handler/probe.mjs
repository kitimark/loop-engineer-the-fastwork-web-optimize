// nav-scroll-handler (N12) probe: Tier A mechanism counts + nav-state parity, baseline overlay vs patched overlay.
// Run under: node tools/lock.mjs run chrome-measure --owner fix-nav-morph --short --max-seconds 180 -- node <this>
//   env BASE_OVERLAY (default fixes/wave1-partial/overlay), FIX_OVERLAY (default fixes/nav-scroll-handler/overlay)
// part "count": mobile, CPU 1x (counts only): scripted scroll top -> bottom, 24 px per frame; per scroll frame:
//   getBoundingClientRect / getComputedStyle / elementsFromPoint / elementFromPoint calls, total and from the nav
//   block (stack line inside the nav code region of the served file); LayoutCount / RecalcStyleCount per frame.
// part "parity": mobile + desktop, 39 evenly spaced scroll positions (plus 97 px steps), settle 3 frames, read the
//   nav header's state classes; compare baseline vs patched step by step.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// paths relative to this checkout (scrubbed 2026-10-04: no absolute paths in committed files)
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = resolveTree('site-pretty');
const HERE = dirname(new URL(import.meta.url).pathname);
const OUT = process.env.PROBE_OUT || join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ['count', 'parity'];
const BO = process.env.BASE_OVERLAY || join(WT, 'fixes/wave1-partial/overlay');
const FO = process.env.FIX_OVERLAY || join(WT, 'fixes/nav-scroll-handler/overlay');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js';

function navRegion(overlay) {
  const lines = readFileSync(join(overlay, JS), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.includes('perf(nav-hit-test): same answer'));
  const b = lines.findIndex((l) => l.includes('let ne = dE(L, { manageAnimations: !1 });'));
  if (a < 0 || b < 0) throw new Error('nav region markers not found in ' + overlay);
  return [a + 1, b + 1];
}
async function server(label, overlay) {
  const state = join(OUT, `serve-${label}.json`); rmSync(state, { force: true });
  const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(state)) { try { return { proc, ...JSON.parse(readFileSync(state, 'utf8')) }; } catch {} } await sleep(100); }
  throw new Error('server ' + label);
}
const VP = { mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } };
const COUNTER = (lo, hi) => `(() => {
  const C = window.__nc = { on: false, frames: 0, all: {}, nav: {} };
  const re = /2\\.DyWL8TcE\\.js:(\\d+):/g;
  const wrap = (obj, name, key) => { const f = obj[name]; obj[name] = function (...a) { if (C.on) { C.all[key] = (C.all[key] || 0) + 1; const s = new Error().stack || ''; let m, nav = false; re.lastIndex = 0; while ((m = re.exec(s))) { const ln = +m[1]; if (ln >= ${lo} && ln <= ${hi}) { nav = true; break; } } if (nav) C.nav[key] = (C.nav[key] || 0) + 1; } return f.apply(this, a); }; };
  wrap(Element.prototype, 'getBoundingClientRect', 'rect'); wrap(Element.prototype, 'getClientRects', 'rects');
  wrap(window, 'getComputedStyle', 'gcs'); wrap(Document.prototype, 'elementsFromPoint', 'efp'); wrap(Document.prototype, 'elementFromPoint', 'ef1');
  const tick = () => { if (C.on) C.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
})();`;
const NAVSTATE = `(() => { const h = document.querySelector('header.start-selling-top-nav'); if (!h) return 'no-nav';
  return ['is-on-dark', 'is-scroll-hidden', 'is-profile-sticky-hidden', 'is-hero-pill', 'is-morphing', 'is-expanded'].filter((c) => h.classList.contains(c)).join(' '); })()`;

async function openPage(cdp, url, vp, pre) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + JSON.stringify(m.params.args.map((a) => a.value)).slice(0, 140));
  });
  await page.send('Performance.enable');
  await page.send('Emulation.setDeviceMetricsOverride', VP[vp]);
  if (VP[vp].mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (pre) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: pre });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, url, { quietMs: 2000 });
  await sleep(1500);
  page.errors = errors;
  // fail fast on a blank page (cert error, wrong server): no nav or no scroll range means nothing to measure (F-014)
  const ok = await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`);
  if (!ok) throw new Error(`blank or unexpected page at ${url} (${vp}): no nav or no scroll range; check Security.setIgnoreCertificateErrors and the server`);
  return page;
}
const metrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

async function partCount(cdp, tg, vp = 'mobile') {
  const page = await openPage(cdp, tg.url, vp, COUNTER(tg.region[0], tg.region[1]));
  const m0 = await metrics(page);
  await page.eval('window.__nc.on = true');
  const scroll = await page.eval(`new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; let n = 0;
    const step = () => { if (scrollY >= max - 1 || n > 2000) return res({ y: scrollY, max, n }); window.scrollTo({ top: Math.min(max, scrollY + 24), behavior: 'instant' }); n++; requestAnimationFrame(step); }; requestAnimationFrame(step); })`, { timeout: 120000 });
  await sleep(300);
  const c = await page.eval('(() => { const C = window.__nc; C.on = false; return JSON.parse(JSON.stringify(C)); })()');
  const m1 = await metrics(page);
  const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / c.frames) * 100) / 100]));
  const r = { label: tg.label, vp, frames: c.frames, scroll, all: c.all, nav: c.nav, allPerFrame: per(c.all), navPerFrame: per(c.nav),
    layoutPerFrame: Math.round(((m1.LayoutCount - m0.LayoutCount) / c.frames) * 100) / 100, recalcPerFrame: Math.round(((m1.RecalcStyleCount - m0.RecalcStyleCount) / c.frames) * 100) / 100,
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), recalcMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    errors: page.errors.slice(0, 5) };
  console.log('count', JSON.stringify(r));
  await page.close();
  return r;
}

async function states(cdp, tg, vp, { rtl = false, shift = false } = {}) {
  const page = await openPage(cdp, tg.url, vp, rtl ? `document.addEventListener('DOMContentLoaded', () => { document.documentElement.dir = 'rtl'; });` : null);
  if (shift) {
    // a layout shift after the offsets were measured, without a resize: 300 px inserted above the theme sections
    await page.eval(`window.scrollTo({ top: Math.round(document.documentElement.scrollHeight / 2), behavior: 'instant' })`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await page.eval(`(() => { const c = document.querySelector('.commission') || document.querySelector('main > *:nth-child(2)'); const d = document.createElement('div'); d.style.height = '300px'; d.className = 'probe-shift'; c.parentNode.insertBefore(d, c); })()`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
  }
  const maxY = await page.eval('document.documentElement.scrollHeight - innerHeight');
  const ys = new Set(); for (let i = 0; i < 39; i++) ys.add(Math.round((maxY * i) / 38)); for (let y = 0; y < maxY; y += 97) ys.add(y);
  const list = [...ys].sort((a, b) => a - b);
  const out = [];
  for (const y of list) {
    await page.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
    out.push({ y, s: await page.eval(NAVSTATE) });
  }
  // and back up in 97 px steps (direction matters for the edge-crossing cache)
  for (let i = list.length - 1; i >= 0; i -= 3) {
    const y = list[i];
    await page.eval(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
    out.push({ y: -y, s: await page.eval(NAVSTATE) });
  }
  const errors = page.errors.slice(0, 5);
  await page.close();
  return { maxY, out, errors };
}
async function partParity(cdp, base, fix) {
  const res = {};
  const cases = [['mobile', {}], ['desktop', {}], ['mobile-shift', { shift: true }], ['desktop-rtl', { rtl: true }], ['mobile-rtl', { rtl: true }]];
  for (const [name, opt] of cases) {
    const vp = name.split('-')[0];
    const a = await states(cdp, base, vp, opt), b = await states(cdp, fix, vp, opt);
    const mism = a.out.map((r, i) => ({ y: r.y, base: r.s, fix: b.out[i]?.s })).filter((r) => r.base !== r.fix);
    const changes = a.out.filter((r, i) => i && r.s !== a.out[i - 1].s).length;
    res[name] = { steps: a.out.length, maxY: [a.maxY, b.maxY], mismatchCount: mism.length, mismatches: mism.slice(0, 20), baseStateChanges: changes, errors: { base: a.errors, fix: b.errors } };
    console.log('parity', name, JSON.stringify({ steps: a.out.length, mismatchCount: mism.length, baseStateChanges: changes, first: mism.slice(0, 5) }));
  }
  return res;
}

const servers = [];
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const T0 = Date.now(), P0 = performance.now();
const result = { date: new Date().toISOString(), baseOverlay: BO, fixOverlay: FO };
try {
  const b = await server('base', BO); servers.push(b);
  const f = await server('fix', FO); servers.push(f);
  const base = { label: 'base', url: b.url, region: navRegion(BO) }, fix = { label: 'fix', url: f.url, region: navRegion(FO) };
  result.regions = { base: base.region, fix: fix.region };
  if (parts.includes('count')) result.count = [await partCount(cdp, base), await partCount(cdp, fix), await partCount(cdp, base, 'desktop'), await partCount(cdp, fix, 'desktop')];
  if (parts.includes('parity')) result.parity = await partParity(cdp, base, fix);
} finally {
  result.wallMs = Date.now() - T0; result.monoMs = Math.round(performance.now() - P0); console.log('timing', JSON.stringify({ wallMs: result.wallMs, monoMs: result.monoMs }));
  writeFileSync(join(OUT, `probe-${Date.now()}.json`), JSON.stringify(result, null, 1));
  for (const s of servers) s.proc.kill();
  cdp.close(); await ch.close();
}

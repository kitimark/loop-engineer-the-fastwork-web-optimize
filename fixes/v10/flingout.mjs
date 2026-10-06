#!/usr/bin/env node
// v10 fling-out probe (int-v8; lead 2026-10-06: rev 7d and U2 share the morph-scroll machinery, so the parity checks
// include a rev 7d fling-out). Chrome, COUNTS AND STATES ONLY, nothing timed. Arms from fixes/nav-hit-cache/build.mjs
// base v10u2:
//   C  = 1b2eecc66011 + P1 (rev 7d, no F1/U2)
//   V  = v10 f5068db34a32 (the landing bytes)
//   VA = V + nav-hit-cache's DEBUG audit hook (every cached or U2-deferred frame is checked against the real hit test)
// Headless Chrome 430 x 775 DPR 3, mobile + touch, hover:none / pointer:coarse (the morph-scroll gate). Per arm and
// scenario a fresh load. The page is opened to the end screen (m = 1) and left to rest. Then a synthetic finger on
// window (the passive __msTouchEv listener reads touches / changedTouches / timeStamp), each step in a task after a
// frame (input order: the scroll lands before the engine's rAF callback):
//   fast  4 moves of 100 px per frame (about 6 px/ms, 400 px of travel): rev 7d leaves it to its momentum. Lift, then
//         a scripted momentum (100 px per frame, x0.97, at least 40) until 200 px past the end screen's top
//   slow  3 moves of 30 px per frame (about 1.8 px/ms, 90 px): rev 7d keeps the old rule, a smooth scroll to the closed
//         rest. Lift, then the page moves by itself
// then 1.5 s of rest. Recorded per frame (rAF): scrollY, the header's --morph, is-on-dark; at lift window.__msDbg (rev
// 7d's own inert log: [t, finger v, moves, fling dir, scrollY, travel]); at the end the state and (VA) the audit.
// Checks: fast ends above the end screen (y < endStart) with m 0, slow ends at the closed rest (|y - endStart| <= 2)
// with m 0; VA: 0 theme mismatches (cached and deferred) in the fling; is-on-dark at rest equal in C, V and VA.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 -- \
//     node fixes/v10/flingout.mjs [--out out/v10/flingout.json] [--h 775]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from '../nav-hit-cache/build.mjs';

const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const H = Number(arg('--h', '775'));
const OUTD = join(WT, 'out/v10'); mkdirSync(OUTD, { recursive: true });
const OUT = arg('--out', join(OUTD, `flingout-${Date.now()}.json`));
const ARMS = build({ quiet: true, base: 'v10u2' });
const INIT = 'window.__nhcAudit = { t: 0, n: 0, lag: 0, m: [], v: [], p: [] }';

async function server(arm) {
  const state = join(OUTD, `serve-fling-${arm}.json`); rmSync(state, { force: true });
  const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', ARMS[arm].dir, '--port', '0', '--quiet',
    '--no-cache', '--state', state, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(state)) { try { const s = JSON.parse(readFileSync(state, 'utf8')); return { proc, url: `http://localhost:${s.port}/` }; } catch {} } await sleep(100); }
  proc.kill(); throw new Error('server ' + arm);
}

const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
const STATE = `(() => { const h = document.querySelector('header.start-selling-top-nav'); return { y: Math.round(scrollY), m: h ? h.style.getPropertyValue('--morph') : null, onDark: h ? h.classList.contains('is-on-dark') : null }; })()`;
const REC = `(() => { window.__flRec = []; window.__flOn = true; const f = () => { if (!window.__flOn) return; const h = document.querySelector('header.start-selling-top-nav');
  window.__flRec.push([Math.round(scrollY), h ? h.style.getPropertyValue('--morph') : null, h ? h.classList.contains('is-on-dark') : null]); requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`;
// the synthetic finger (defined once per load) and one step: in a task after the next frame, scroll to y (if given) and
// fire the touch event (if given), both in that task
const FINGER = `(window.__flTouch = (type, y) => { const ev = new Event(type); const c = [{ clientX: 215, clientY: y, identifier: 1 }];
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : c }); Object.defineProperty(ev, 'changedTouches', { value: c }); window.dispatchEvent(ev); }, 1)`;
const STEP = (y, type, fy) => `new Promise((r) => requestAnimationFrame(() => setTimeout(() => { ${y == null ? '' : `scrollTo({ top: ${Math.round(y)}, behavior: 'instant' });`}
  ${type ? `window.__flTouch('${type}', ${fy});` : ''} r(1); }, 0)))`;
const SCEN = { fast: { px: 100, moves: 4, momentum: true }, slow: { px: 30, moves: 3, momentum: false } };

async function run(cdp, arm, url, name) {
  const S = SCEN[name];
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + JSON.stringify(m.params.args.map((a) => a.value)).slice(0, 140));
  });
  await page.send('Runtime.enable').catch(() => {});
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  if (arm === 'VA') await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT + ';' });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(1500);
  const served = await page.eval(`Promise.all([${JSON.stringify(JS)}, ${JSON.stringify(CSS)}].map((p) => fetch('/' + p, { cache: 'no-store' }).then((r) => r.arrayBuffer()).then((b) => crypto.subtle.digest('SHA-256', b)).then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12))))`);
  if (served.join() !== [ARMS[arm].js, ARMS[arm].css].join()) throw new Error(`arm ${arm} served ${served.join(' / ')}, pinned ${ARMS[arm].js} / ${ARMS[arm].css}`);
  // walk to the end screen in steps (lazy content), then open: rest at m = 1
  const g0 = await page.eval(GEO);
  if (!g0.t) throw new Error(`${arm}: no .fw-ms-end (morph-scroll off)`);
  await page.eval(`new Promise((res) => { let y = 0; const L = ${g0.endStart}; const step = () => { y = Math.min(L, y + 400); scrollTo({ top: y, behavior: 'instant' }); y < L ? setTimeout(step, 60) : setTimeout(() => res(1), 1500); }; step(); })`);
  let g = await page.eval(GEO);
  await page.eval(`(scrollTo({ top: ${g.max}, behavior: 'instant' }), 1)`); await sleep(2000);
  g = await page.eval(GEO);
  const open = await page.eval(STATE);
  await page.eval(`(window.__msDbg = [], ${arm === 'VA' ? INIT : '0'}, 1)`);
  await page.eval(REC);
  // the finger: touchstart, moves down (the page scrolls up by as much), lift
  let fy = 200, y = open.y;
  await page.eval(FINGER);
  await page.eval(STEP(null, 'touchstart', fy));
  for (let i = 0; i < S.moves; i++) { fy += S.px; y -= S.px; await page.eval(STEP(y, 'touchmove', fy)); }
  // lift in the frame after the last move (< 50 ms: the finger was still moving)
  await page.eval(STEP(null, 'touchend', fy));
  const lift = await page.eval('JSON.parse(JSON.stringify(window.__msDbg || []))');
  if (S.momentum) {
    let v = S.px;
    while (y > g.endStart - 200) { v = Math.max(40, v * 0.97); y = Math.max(0, y - v); await page.eval(STEP(y)); }
  }
  await sleep(1500);
  await page.eval('(window.__flOn = false, 1)');
  const end = await page.eval(STATE);
  const rec = await page.eval('window.__flRec');
  const A = arm === 'VA' ? await page.eval('JSON.parse(JSON.stringify(window.__nhcAudit))') : null;
  const flips = []; for (let i = 1; i < rec.length; i++) if (rec[i][2] !== rec[i - 1][2]) flips.push(rec[i]);
  const out = { arm, scenario: name, served, geo: g, open, lift, end, frames: rec.length, flips, minY: Math.min(...rec.map((r) => r[0])),
    audit: A && { tested: A.t, cached: A.n, deferred: A.d ?? 0, theme: A.m.length, deferredMismatches: A.m.filter((x) => x[4] === 'd').length, first: A.m.slice(0, 5) },
    errors: errors.slice(0, 5) };
  out.path = name === 'fast' ? (end.y < g.endStart && Number(end.m) === 0 ? 'ok: left the end screen, m 0' : 'FAIL: did not leave the end screen')
    : (Math.abs(end.y - g.endStart) <= 2 && Number(end.m) === 0 ? 'ok: closed rest, m 0' : `FAIL: ended at y - endStart = ${end.y - g.endStart}, m ${end.m}`);
  await page.close();
  console.log(`${arm} ${name}: ${out.path}; lift ${JSON.stringify(lift)}; end ${JSON.stringify(end)}; frames ${rec.length}; is-on-dark flips ${JSON.stringify(flips)}${out.audit ? '; audit ' + JSON.stringify(out.audit) : ''}; errors ${errors.length}`);
  return out;
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v10/chrome'), 'v10-fling'), headless: true, windowSize: `430,${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/v10/flingout.mjs (int-v8)', h: H, arms: Object.fromEntries(Object.entries(ARMS).map(([k, a]) => [k, [a.js, a.css]])), startedAt: new Date().toISOString(), runs: [] };
const servers = {};
try {
  for (const arm of ['C', 'V', 'VA']) servers[arm] = await server(arm);
  for (const name of Object.keys(SCEN)) for (const arm of ['C', 'V', 'VA']) res.runs.push(await run(cdp, arm, servers[arm].url, name));
  const bad = [];
  for (const r of res.runs) {
    if (!r.path.startsWith('ok')) bad.push(`${r.arm} ${r.scenario} path`);
    if (r.errors.length) bad.push(`${r.arm} ${r.scenario} errors`);
    if (r.audit && (r.audit.theme || r.audit.deferredMismatches)) bad.push(`${r.arm} ${r.scenario} audit mismatches`);
  }
  for (const name of Object.keys(SCEN)) {
    const d = new Set(res.runs.filter((r) => r.scenario === name).map((r) => r.end.onDark));
    if (d.size !== 1) bad.push(`${name}: is-on-dark at rest differs between arms`);
  }
  res.verdict = bad.length ? `FLINGOUT FAIL: ${bad.join('; ')}` : 'FLINGOUT PASS: rev 7d paths as designed in C, V and VA; 0 audit mismatches; is-on-dark at rest equal';
  console.log(res.verdict);
} finally {
  res.endedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(res, null, 1));
  for (const s of Object.values(servers)) s.proc.kill();
  cdp.close(); await chrome.close();
  console.log('wrote', OUT.replace(WT + '/', ''));
}

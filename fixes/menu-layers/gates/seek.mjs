// menu-layers: a copy of fixes/g0-box/gates/seek.mjs (fix-g0-box), only the out/ paths changed (out/menu-layers). Here
// A = f-B2 (fixes/menu-layers--base/overlay), V = f-B2 + the panel clock layer (fixes/menu-layers/overlay).
// Original header:
// g0-box (fix-g0-box), copied from fixes/g0-gpu/gates/seek.mjs (fix-g0-gpu) with --w (viewport width), focus and
// hit-target state, and out/g0box paths. Gate 1: seek parity of the end-of-page 680 ms tween, base overlay A (v0: an empty dir, or g0.0)
// against candidate V (g0.1), COUNTS/PIXELS ONLY, no timing. Scaffold from fixes/compositor-morph/gates/cm-px2.mjs
// (serve, engine adapters, PR-010 four loads A, V, A2, V2, scorer fixes/v9-best/gates/pxlib.mjs scoreStop).
//
// The page runs on a VIRTUAL CLOCK, identical in every arm:
//   - performance.now() returns the virtual time vt; window.requestAnimationFrame queues into a list the harness runs
//     with timestamp vt at each virtual frame (dt 10 ms), so the original's tween (ZM on rAF timestamps, o = now at the
//     trigger) is computed at exactly the chosen elapsed times;
//   - CSS transitions (the actions gap and Join restart theirs in every frame, CSS 11440-11496) are paused when they
//     start and set to currentTime = vt - (the virtual frame they started in) at every frame: what a real run at
//     100 Hz shows;
//   - g0's Web Animations (id 'g0') are paused at capture and set to currentTime = vt - their start o;
//   - every other document-timeline animation and SMIL is frozen at 4000 ms / 4 s; Date.now frozen (countdown).
// Trigger: a synthetic WheelEvent on window (the original's capture listener A, JS 13049): +100 opens, -100 closes.
// Scenarios in one load (one after the other): open (m 0 -> 1), close (1 -> 0), rev1 (open, reverse at 680/3 ms),
// rev2 (open, reverse at 2*680/3 ms). Captures at 0, 20, ..., 700 ms after the scenario's last trigger, each with the
// state (inline and computed --morph, nav classes, box, panel and #platform computed opacity/filter/transform,
// aria-hidden, tabindex, pointer-events, live g0 animations).
//   Chrome:    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-g0-gpu -- \
//                node fixes/g0-gpu/gates/seek.mjs --engine chrome --a <dir> --v <dir> --h 775 --arms A --outdir out/g0-gpu/seek-x
//   Simulator: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-gpu -- \
//                node tools/sim.mjs session --functional --owner fix-g0-gpu -- node fixes/g0-gpu/gates/seek.mjs --engine sim ...
//   Score (no browser): node fixes/g0-gpu/gates/seek.mjs --score --outdir <dir>
// Options: --scen open,close,rev1,rev2  --steps 0,20,...  --rm (Chrome: prefers-reduced-motion: reduce)  --frame 10
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n');
  process.exit(0);
}
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const ENGINE = arg('--engine', 'chrome');
const H = Number(arg('--h', '775'));
const WD = Number(arg('--w', '430'));
const MOBILE = WD <= 640 || has('--mobile');
const RM = has('--rm');
const FRAME = Number(arg('--frame', '10'));
const SCEN = arg('--scen', 'open,close,rev1,rev2').split(',');
const STEPS = arg('--steps', Array.from({ length: 36 }, (_, k) => k * 20).join(',')).split(',').map(Number);
const OUT = resolve(WT, arg('--outdir', `out/menu-layers/seek-${ENGINE}-${new Date().toISOString().replace(/[:.]/g, '-')}`));
mkdirSync(OUT, { recursive: true });
const ARMS = ['A', 'V', 'A2', 'V2'];
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(); const lg = (...a) => console.log(`[seek +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a); // stage log (iPad hang, 2026-10-08)
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const FF = Date.parse('2026-11-01T00:00:00Z') + 500;   // before the countdown's end (2026-11-02 05:00Z), after any run
const DATE_FIXED = !has('--date-past');   // --date-past: the old fixed past date, no warm-up (the v0 runs of 2026-10-07)

// ---- in-page library -------------------------------------------------------------------------------------------
const LIB = `(() => {
  if (window.__sk) return 'again';
  const P = performance, rnow = P.now.bind(P), rraf = window.requestAnimationFrame.bind(window);
  const sk = window.__sk = { vt: rnow(), q: new Map(), id: 1e6, tr: [], seen: new WeakSet(), err: [], t0: 0, busy: 0 };
  P.now = () => sk.vt;
  window.requestAnimationFrame = (cb) => { const k = ++sk.id; sk.q.set(k, cb); return k; };
  window.cancelAnimationFrame = (k) => { sk.q.delete(k); };
  addEventListener('error', (e) => sk.err.push(String(e.message)));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const nav = () => document.querySelector('header.start-selling-top-nav');
  sk.frame = async (dt) => {
    sk.vt += dt;
    for (const t of sk.tr) { try { if (t.a.playState !== 'idle') t.a.currentTime = sk.vt - t.t0; } catch (e) {} }
    const q = [...sk.q]; sk.q.clear();
    for (const [, cb] of q) { try { cb(sk.vt); } catch (e) { sk.err.push('raf ' + String(e && e.message || e)); } }
    await Promise.resolve(); await tick();
    void document.documentElement.offsetWidth;
    for (const a of document.getAnimations()) if (a instanceof CSSTransition && !sk.seen.has(a)) { sk.seen.add(a); try { a.pause(); a.currentTime = 0; } catch (e) {} sk.tr.push({ a, t0: sk.vt }); }
    sk.tr = sk.tr.filter((t) => t.a.playState !== 'idle');
  };
  sk.trig = (dy) => { const ev = new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }); window.dispatchEvent(ev); sk.t0 = sk.vt; return ev.defaultPrevented; };
  sk.freeze = () => {
    for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition || a.id === 'g0') continue; if (a.timeline && a.timeline !== document.timeline) continue; a.pause(); a.currentTime = 4000; } catch (e) {} }
    for (const s of document.querySelectorAll('svg')) { try { s.pauseAnimations && s.pauseAnimations(); s.setCurrentTime && s.setCurrentTime(4); } catch (e) {} }
  };
  sk.state = () => {
    const n = nav(), p = document.querySelector('.start-selling-morph-panel'), f = document.querySelector('.start-selling-platform');
    const cs = (e) => (e ? getComputedStyle(e) : null), N = cs(n), Pc = cs(p), Fc = cs(f);
    const g0 = document.getAnimations().filter((a) => a.id === 'g0');
    return { vt: +(sk.vt - sk.t0).toFixed(3), y: Math.round(scrollY), morph: n.style.getPropertyValue('--morph'), cmorph: N.getPropertyValue('--morph').trim(),
      cls: n.className.replace(/svelte-\\w+/g, '').trim().split(/\\s+/).sort().join(' '),
      box: [N.top, N.width, N.height, N.borderRadius, N.backgroundColor, N.backdropFilter || N.webkitBackdropFilter].join(' | '),
      panel: p ? { o: Pc.opacity, f: Pc.filter, t: Pc.transform, aria: p.getAttribute('aria-hidden'), scene: p.getAttribute('data-start-selling-scene'), pin: p.style.getPropertyValue('--morph') } : null,
      plat: f ? { o: Fc.opacity, f: Fc.filter, pe: Fc.pointerEvents, fade: f.style.getPropertyValue('--morph-fade') } : null,
      tab: [...n.querySelectorAll('[tabindex]')].map((e) => (e.getAttribute('class') || e.tagName).split(' ')[0] + '=' + e.getAttribute('tabindex')).join(','),
      ariaJoin: [...n.querySelectorAll('[aria-hidden]')].filter((e) => !e.closest('.start-selling-morph-panel') && !e.classList.contains('fw-bx-fill')).map((e) => e.getAttribute('aria-hidden')).join(','),
      rad: (N.clipPath && N.clipPath !== 'none') ? ((/round ([\\d.]+px)/.exec(N.clipPath) || [])[1] || N.clipPath) : N.borderRadius,
      geo: ['.start-selling-morph-center', '.start-selling-morph-title', '.start-selling-morph-footer', '.start-selling-morph-veil', '.start-selling-morph-backdrop', '.start-selling-morph-col', '.start-selling-top-nav-bar', '.start-selling-top-nav-logo', '.start-selling-top-nav-actions'].map((q) => { const e = document.querySelector(q); if (!e) return q + ' -'; const r = e.getBoundingClientRect(); return q.slice(15) + ' ' + [r.left, r.top, r.width, r.height].map((x) => x.toFixed(2)).join(','); }).join(' | '),
      focus: (document.activeElement && document.activeElement !== document.body) ? (document.activeElement.className || document.activeElement.tagName).toString().split(' ')[0] : '-',
      hit: (() => { const r = n.getBoundingClientRect(); const pts = [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9], [0.5, 0.3], [0.5, 0.7]]; return pts.map(([fx, fy]) => { const x = r.left + r.width * fx, y = r.top + r.height * fy; const e = document.elementFromPoint(x, y); return e ? (e.getAttribute('class') || e.tagName).toString().split(' ')[0] : '-'; }).join(','); })(),
      g0: g0.length, g0play: g0.map((a) => a.playState[0]).join(''), tr: sk.tr.length, q: sk.q.size, err: sk.err.slice(0, 3) };
  };
  sk.cap = async () => {
    sk.freeze();
    for (const a of document.getAnimations()) if (a.id === 'g0') { try { a.pause(); a.currentTime = sk.vt - a.__g0S; } catch (e) { sk.err.push('g0 ' + e.message); } }
    void document.documentElement.offsetWidth;
    await new Promise((r) => rraf(() => rraf(r))); await new Promise((r) => setTimeout(r, 30));
    return sk.state();
  };
  sk.geo = () => { const f = document.querySelector('.start-selling-platform'); const r = f.getBoundingClientRect(); const vh = window.visualViewport ? visualViewport.height : innerHeight; return { top: r.top, bottom: r.bottom, h: r.height, vh, ok: r.height >= vh * 0.45 && r.bottom <= vh + 8, max: document.documentElement.scrollHeight - innerHeight, y: scrollY }; };
  sk.start = async (plan, FR) => { const res = [];
    for (let j = 0; j < plan.length; j++) { const [dy, at] = plan[j];
      if (j > 0) { const base = sk.t0; while (sk.vt + FR <= base + at + 1e-9) await sk.frame(FR); sk.vt = base + at; }
      res.push([dy, sk.trig(dy)]); }
    await sk.frame(0); return res; };
  sk.to = async (t, FR) => { while (sk.vt - sk.t0 < t - 1e-9) await sk.frame(Math.min(FR, t - (sk.vt - sk.t0))); return sk.cap(); };
  sk.settle = async (FR) => { for (let k = 0; k < 30; k++) await sk.frame(FR); return sk.cap(); };
  return 'ok';
})()`;

// ---- engines ---------------------------------------------------------------------------------------------------
let sim = null, chrome = null, cdp = null, cfg = null;
async function boot() {
  // the session's device (FW_SIM_DEVICE, e.g. fw-ipad): without useDevice() readConfig() gave fw-sim's udid, so an iPad
  // session's screenshots targeted the shut-down iPhone Simulator (seek-ipad-1, -2a: no shots, 2026-10-08)
  if (ENGINE === 'sim') { sim = await import(join(WT, 'tools/lib/sim.mjs')); sim.useDevice(process.env.FW_SIM_DEVICE); cfg = sim.readConfig(); lg('sim device', process.env.FW_SIM_DEVICE || 'fw-sim'); return; }
  const C = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/menu-layers/chrome'), 'menulayersseek'), headless: true, windowSize: `${WD},${H}` });
  cdp = await C.CDP.connect(chrome.wsUrl); chrome.C = C;
}
async function open(url, port) {
  if (sim) {
    const { openTab, runAsync } = await import(join(WT, 'tools/lib/wip.mjs'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(1500);
    const c = await openTab(`localhost:${port}`);
    return { ev: (js) => c.evaluate(js), run: (js) => runAsync(c, js, { pollMs: 150, timeoutMs: 120000, key: '__skRes' }),
      shot: (f) => sim.simctl(['io', cfg.udid, 'screenshot', f]).status === 0, close: () => { try { c.close(); } catch {} } };
  }
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: WD, height: H, deviceScaleFactor: MOBILE ? 3 : 2, mobile: MOBILE, screenWidth: WD, screenHeight: MOBILE ? 932 : H });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: MOBILE, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [...(MOBILE ? [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] : []), ...(RM ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])] }).catch(() => {});
  await chrome.C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  return { ev: (js) => page.eval(js, { timeout: 90000 }), run: (js) => page.eval(js, { timeout: 120000 }),
    shot: async (f) => { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(data, 'base64')); return true; }, close: () => page.close() };
}

async function runArm(arm) {
  const d = resolve(WT, arg(`--${arm.replace(/\d+$/, '').toLowerCase()}`, ''));
  if (!existsSync(d)) throw new Error(`overlay dir missing for ${arm}: ${d}`);
  const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, dir: d, engine: ENGINE, h: sim ? null : H, w: sim ? null : WD, rm: RM, frame: FRAME, load1: loadavg()[0], caps: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/?g0=${Date.now()}`;
    const get = async (u) => { for (let i = 0; ; i++) { try { return Buffer.from(await (await fetch(u)).arrayBuffer()); } catch (e) { if (i >= 20) throw e; await sleep(250); } } };
    load.served = { js: sha(await get(new URL(NODE, url))), css: sha(await get(new URL(CSSF, url))) };
    lg(arm, "served", JSON.stringify(load.served)); c = await open(url, s.port); lg(arm, "tab open");
    for (let i = 0; i < 40 && (await c.ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    lg(arm, "readyState", await c.ev("document.readyState"), "w", await c.ev("innerWidth")); await sleep(2500);
    // walk the page (lazy content, the panel mount at 200 %), freeze the date, go to the bottom
    await c.ev(`(window.__wk = 0, (() => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => (window.__wk = 1), 2500); }; step(); })(), 1)`);
    for (let i = 0; i < 200 && !(await c.ev('window.__wk')); i++) await sleep(200);
    // Date.now frozen at a fixed FUTURE instant FF (DATE_FIXED; the past F before 2026-10-07 17:10Z): every countdown's
    // stored time is older, so once a live clock has ticked after the freeze (the warm-up below) it reads FF's second for
    // good, the same in every load. The past F made g0.0's countdown-faces read (max(stored, phase-aligned now)) jump
    // when the panel clock went live, on a real-time setTimeout racing the virtual frames (V/V2 digits mid-roll at
    // open@100-500); the real now (tried once) gave every load another second (A/A noise on the digits). v0 has no such
    // read (its interval writes F once and stays), so the v0 runs with F are unaffected.
    await c.ev(DATE_FIXED ? `(() => { const F = ${FF}; Date.now = () => F; return 1; })()` : `(() => { const F = ${F}; Date.now = () => F; return 1; })()`);
    await c.ev(`(window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 1)`); await sleep(1500);
    lg(arm, "walked"); if ((await c.ev(LIB)) !== 'ok') throw new Error('lib');
    load.geo = await c.ev('JSON.stringify(window.__sk.geo())').then(JSON.parse);
    if (!load.geo.ok) throw new Error('end-of-page condition O() false: ' + JSON.stringify(load.geo));
    lg(arm, "geo", JSON.stringify(load.geo).slice(0, 200));
    if (DATE_FIXED) {
      // warm-up open/close (not captured): the panel clock goes live, its next fire (<= 1 s real) stores the frozen time
      await c.run(`window.__sk.start([[100, 0]], ${FRAME})`); await c.run(`window.__sk.to(700, ${FRAME})`); await c.run(`window.__sk.settle(${FRAME})`);
      await sleep(1600);
      await c.run(`window.__sk.start([[-100, 0]], ${FRAME})`); await c.run(`window.__sk.to(700, ${FRAME})`); await c.run(`window.__sk.settle(${FRAME})`);
      load.warmup = true; lg(arm, "warm-up done");
    }
    for (const sc of SCEN) {
      // each scenario starts at rest: m 0 for open/rev, m 1 for close
      const plan = { open: [[+100, 0]], close: [[-100, 0]], rev1: [[+100, 0], [-100, 680 / 3]], rev2: [[+100, 0], [-100, 1360 / 3]] }[sc];
      const trig = await c.run(`window.__sk.start(${JSON.stringify(plan)}, ${FRAME})`);
      for (const t of STEPS) {
        const state = await c.run(`window.__sk.to(${t}, ${FRAME})`);
        const f = join(OUT, `${arm}-${sc}-${String(t).padStart(3, '0')}.png`);
        const ok = await c.shot(f);
        load.caps.push({ sc, t, ok, state });
      }
      const rest = await c.run(`window.__sk.settle(${FRAME})`);
      load.caps.push({ sc, t: 'rest', state: rest, trig });
      console.log(`${arm} ${sc}: trig ${JSON.stringify(trig)} rest ${JSON.stringify(rest)}`);
    }
    load.errors = await c.ev('JSON.stringify(window.__sk.err)').then(JSON.parse);
  } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
  finally { try { c && (await c.close()); } catch {} p.kill(); rmSync(st, { force: true }); }
  return load;
}

// ---- scoring ---------------------------------------------------------------------------------------------------
const num = (x) => Number.parseFloat(x);
const blur = (f) => { const m = /blur\(([-\d.e]+)px\)/.exec(f || ''); return m ? +m[1] : (f === 'none' ? 0 : NaN); };
const mat = (t) => { if (!t || t === 'none') return [1, 0, 0, 1, 0, 0]; const m = /matrix\(([^)]*)\)/.exec(t); return m ? m[1].split(',').map(Number) : [NaN]; };
function cmpState(a, v) {
  const d = [];
  // box: top | width | height | radius | background | backdrop; g0-box paints the radius by clip-path and the colour by
  // two fills, so radius and background compare through 'rad' (both arms) and the pixels; the rest must be equal
  const bx = (b) => String(b).split(' | ').filter((_, i) => i !== 3 && i !== 4).join(' | ');
  if (bx(a.box) !== bx(v.box)) d.push(`box: ${a.box} | ${v.box}`);
  if (a.rad !== undefined && v.rad !== undefined && a.rad !== v.rad) d.push(`rad: ${a.rad} | ${v.rad}`);
  if (a.geo && v.geo) { const ga = a.geo.split(' | '), gv = v.geo.split(' | '); ga.forEach((x, i) => { const pa = x.split(' ')[1]?.split(',').map(Number), pv = gv[i]?.split(' ')[1]?.split(',').map(Number); if (pa && pv && pa.some((q, j) => !(Math.abs(q - pv[j]) <= 0.05))) d.push(`geo ${x} | ${gv[i]}`); }); }
  for (const k of ['cls', 'tab', 'ariaJoin', 'y', 'focus', 'hit']) if (a[k] !== v[k]) d.push(`${k}: ${a[k]} | ${v[k]}`);
  // the inline --morph: equal to 1e-9 (the same ZM arithmetic on e - o gives last-digit differences, ~1e-15, when the
  // loads' absolute virtual times differ, e.g. after the warm-up); a string compare flagged those
  if (!(Math.abs(num(a.morph) - num(v.morph)) <= 1e-9) && a.morph !== v.morph) d.push(`morph: ${a.morph} | ${v.morph}`);
  if (Math.abs(num(a.cmorph) - num(v.cmorph)) > 1e-6) d.push(`cmorph ${a.cmorph} | ${v.cmorph}`);
  if (!!a.panel !== !!v.panel) d.push('panel presence');
  else if (a.panel) {
    if (Math.abs(num(a.panel.o) - num(v.panel.o)) > 1e-4) d.push(`panel.o ${a.panel.o} | ${v.panel.o}`);
    if (!(Math.abs(blur(a.panel.f) - blur(v.panel.f)) <= 1e-3)) d.push(`panel.f ${a.panel.f} | ${v.panel.f}`);
    const ma = mat(a.panel.t), mv = mat(v.panel.t); if (ma.length !== mv.length || ma.some((x, i) => !(Math.abs(x - mv[i]) <= 1e-5))) d.push(`panel.t ${a.panel.t} | ${v.panel.t}`);
    for (const k of ['aria', 'scene']) if (a.panel[k] !== v.panel[k]) d.push(`panel.${k} ${a.panel[k]} | ${v.panel[k]}`);
  }
  if (!!a.plat !== !!v.plat) d.push('plat presence');
  else if (a.plat) {
    if (Math.abs(num(a.plat.o) - num(v.plat.o)) > 1e-4) d.push(`plat.o ${a.plat.o} | ${v.plat.o}`);
    if (!(Math.abs(blur(a.plat.f) - blur(v.plat.f)) <= 1e-3)) d.push(`plat.f ${a.plat.f} | ${v.plat.f}`);
    if (a.plat.pe !== v.plat.pe) d.push(`plat.pe ${a.plat.pe} | ${v.plat.pe}`);
  }
  return d;
}
async function score() {
  const { scoreStop } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
  const L = Object.fromEntries(ARMS.filter((a) => existsSync(join(OUT, `${a}-load.json`))).map((a) => [a, JSON.parse(readFileSync(join(OUT, `${a}-load.json`), 'utf8'))]));
  const res = { tool: 'fixes/g0-gpu/gates/seek.mjs', out: OUT, loads: Object.fromEntries(Object.entries(L).map(([k, l]) => [k, { served: l.served, void: l.void || null, errors: l.errors, geo: l.geo, h: l.h, rm: l.rm }])), rows: [] };
  const key = (c) => `${c.sc}@${c.t}`;
  const idx = Object.fromEntries(Object.entries(L).map(([a, l]) => [a, Object.fromEntries(l.caps.map((c) => [key(c), c]))]));
  const keys = L.A ? L.A.caps.map(key) : [];
  let worstAV = 0, anyAV = 0, stateDiffs = 0, rows = 0;
  for (const k of keys) {
    const row = { k };
    const a = idx.A?.[k], v = idx.V?.[k];
    if (a && v) { row.stateAV = cmpState(a.state, v.state); stateDiffs += row.stateAV.length ? 1 : 0; }
    if (idx.A2?.[k] && a) row.stateAA = cmpState(a.state, idx.A2[k].state);
    if (a?.ok && v?.ok && !(idx.A2?.[k]?.ok && idx.V2?.[k]?.ok)) {
      const { pngPixels, delta, aa } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
      const P = (x) => pngPixels(readFileSync(join(OUT, `${x}-${a.sc}-${String(a.t).padStart(3, '0')}.png`)));
      const d = delta(P('A'), P('V')); let any = 0; for (const q of d) if (q) any++;
      row.px = { AVany: any, AVmax: aa(d).maxLevel, AVover8pct: aa(d).over8Pct };
      worstAV = Math.max(worstAV, row.px.AVmax); anyAV += any ? 1 : 0; rows++;
    } else if (a?.ok && ARMS.every((x) => idx[x]?.[k]?.ok)) {
      const files = Object.fromEntries(ARMS.map((x) => [x, join(OUT, `${x}-${a.sc}-${String(a.t).padStart(3, '0')}.png`)]));
      const s = scoreStop(files, { V: [], V2: [] }, ENGINE === 'sim' ? 3 : (MOBILE ? 3 : 2), 0);
      row.px = { AVany: s.AV.anyPx, AVmax: s.AV.maxLevel, AVbeyond: s.AV.beyondCssPx2, A2V2any: s.A2V2.anyPx, A2V2max: s.A2V2.maxLevel, consistent: s.consistent.beyondCssPx2, AAover8: s.AA.over8Pct, AAmax: s.AA.maxLevel, VVmax: s.VV.maxLevel, top: s.consistent.clusters[0] || s.AV.clusters[0] || null };
      worstAV = Math.max(worstAV, s.AV.maxLevel); anyAV += s.AV.anyPx ? 1 : 0; rows++;
    }
    res.rows.push(row);
    console.log(`${k.padEnd(12)} ${row.px && row.px.AVover8pct !== undefined ? `A~V any ${row.px.AVany} max ${row.px.AVmax} over8 ${row.px.AVover8pct} %` : row.px ? `A~V any ${row.px.AVany} max ${row.px.AVmax} beyond ${row.px.AVbeyond} | A2~V2 any ${row.px.A2V2any} max ${row.px.A2V2max} | consistent ${row.px.consistent} | A/A max ${row.px.AAmax} V/V max ${row.px.VVmax}` : '(no px)'} ${row.stateAV?.length ? 'STATE ' + row.stateAV.join('; ') : 'state ='}`);
  }
  res.summary = { stops: keys.length, pxStops: rows, stopsWithAnyAVpx: anyAV, worstAVmax: worstAV, stopsWithStateDiff: stateDiffs };
  console.log('SUMMARY', JSON.stringify(res.summary));
  writeFileSync(join(OUT, 'seek.json'), JSON.stringify(res, null, 1));
}

if (has('--score')) await score();
else {
  await boot();
  try {
    for (const arm of arg('--arms', ARMS.join(',')).split(',')) {
      const load = await runArm(arm);
      writeFileSync(join(OUT, `${arm}-load.json`), JSON.stringify(load));
      console.log(`load ${arm}: served ${JSON.stringify(load.served)} caps ${load.caps.length} void ${load.void || '-'} errors ${JSON.stringify(load.errors || [])}`);
    }
  } finally { try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {} }
  if (has('--and-score')) await score();
}

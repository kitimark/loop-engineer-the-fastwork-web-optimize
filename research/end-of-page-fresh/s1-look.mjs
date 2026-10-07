// S1 look gate (arch-end-fresh): a copy of fixes/compositor-morph/gates/c3b/pre-look.mjs (credit: arch-compositor-morph),
// changes: two more stop kinds, `top` (scrollY 0) and `mid` (half way to the end zone), because D1 keeps the CM tree
// built for the whole page, so the closed nav away from the end zone is part of its look too. Original header:
// c3b-K gate 1 + 4a (arch-compositor-morph): does the "pre" state (K: wrappers built while the morph is still closed,
// m in (-1, 0]) look like v13's closed pill, and do taps hit the same things? Frozen-frame pixels with the PR-010
// multi-pair A/A (fixes/v9-best/gates/pxlib.mjs scoreStop: loads A, V, A2, V2, each its own server/origin; "consistent" =
// over 8 in all four cross pairs while neither A/A pair is), COUNTS/PIXELS ONLY, no timing. Derived from
// fixes/compositor-morph/gates/cm-px2.mjs; differences: NO held touch (K turns pre on in the 200 ms rest timer, which a
// held touch would also allow, but a real visit rests without one), stops at m -1 .. 0 and back down to -1.1 (pre kept)
// and -1.5 (pre off), a state line with the pre markers, and an elementsFromPoint stack parity check at the nav's taps
// (logo, pill centre, each action button, the u3 corner area) per stop.
//   Chrome:    node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner arch-compositor-morph -- \
//                node fixes/compositor-morph/gates/c3b/pre-look.mjs --engine chrome --a out/cm/snap160/V --v out/cm/c3bk1 --h 775
//   Simulator: node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//                node tools/sim.mjs session --functional --owner arch-compositor-morph -- node fixes/compositor-morph/gates/c3b/pre-look.mjs --engine sim ...
//   --arms A,V then --arms A2,V2 with the same --outdir splits a run into two lock jobs; the scoring runs when all four exist.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { scoreStop, line } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chrome');
const DIR = { A: resolve(WT, arg('--a', 'out/cm/snap160/V')), V: resolve(WT, arg('--v', 'out/cm/c3bk1')) };
const H = Number(arg('--h', '775'));
const TOUCHED = argv.includes('--touch');
const STOPS = arg('--ms', 'far,-1,-0.75,-0.5,-0.25,-0.1,0,-0.5d,-1.1d,-1.5d').split(',').map((k) => ({ k, m: k === 'far' || k === 'top' || k === 'mid' ? null : parseFloat(k) }));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = arg('--outdir') ? resolve(WT, arg('--outdir')) : join(WT, 'out/s1', `look-${ENGINE}${ENGINE === 'sim' ? '' : H}-${tag}`); mkdirSync(OUT, { recursive: true });
const F = Date.parse('2026-10-04T12:00:00Z') + 500;
const FREEZE = `JSON.stringify((() => { let n = 0, s = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.timeline && a.timeline !== document.timeline) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} }
  for (const svg of document.querySelectorAll('svg')) { try { if (svg.animationsPaused && !svg.animationsPaused()) { svg.pauseAnimations(); svg.setCurrentTime(4); s++; } } catch {} } return { anims: n, smil: s }; })())`;
const RESUME = `(() => { for (const a of document.getAnimations()) { try { if (!(a instanceof CSSTransition) && a.playState === 'paused') a.play(); } catch {} } for (const svg of document.querySelectorAll('svg')) { try { svg.unpauseAnimations && svg.unpauseAnimations(); } catch {} } return 1; })()`;
const LAB = `const lab = (e) => { if (!e) return null; const c = (x) => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.replace(/svelte-\\w+/g, '').trim().split(/\\s+/).filter((k) => !/^fw-cm-|^is-morphing$/.test(k)).slice(0, 2).join('.') : ''); return c(e); };`;
const HITS = `JSON.stringify((() => { ${LAB} const out = []; for (let y = 20; y < innerHeight; y += 40) for (let x = 20; x < innerWidth; x += 40) out.push([x, y, lab(document.elementFromPoint(x, y))]); return out; })())`;
// taps: which element receives a tap (the topmost hit, CM wrappers and the pill glass skipped) at fixed points of the
// closed pill (phones: left 16, top 16, width innerWidth - 32, height 52, as today's nav at m 0; the header's own box is
// panel-sized under CM, so it can't place the points): the pill centre, its corners 6 px in, 10 px below it, and the
// centre of every visible a/button inside the header. Plus whether the receiving element is inside the header.
const TAPS = `JSON.stringify((() => { ${LAB} const h = document.querySelector('header.start-selling-top-nav'); if (!h) return null; const r = { left: 16, top: 16, right: innerWidth - 16, bottom: 68, width: innerWidth - 32, height: 52 }; const pts = [['pill', r.left + r.width / 2, r.top + r.height / 2], ['tl', r.left + 6, r.top + 6], ['tr', r.right - 6, r.top + 6], ['bl', r.left + 6, r.bottom - 6], ['br', r.right - 6, r.bottom - 6], ['below', r.left + r.width / 2, r.bottom + 10]];
  let i = 0; for (const t of h.querySelectorAll('a, button')) { const q = t.getBoundingClientRect(); if (q.width && q.height && q.bottom > 0) pts.push(['t' + i++ + ':' + lab(t), q.left + q.width / 2, q.top + q.height / 2]); }
  return pts.map(([k, x, y]) => { const top = document.elementsFromPoint(x, y).find((e) => !/fw-cm-[cuds]/.test(typeof e.className === 'string' ? e.className : '')); return [k, Math.round(x), Math.round(y), (top && h.contains(top) ? 'nav ' : 'page ') + lab(top)]; }); })())`;
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const STATE = `JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); const u3 = document.querySelector('[data-fw-cm="u3"]'); const r = h.getBoundingClientRect();
  return { y: Math.round(scrollY), html: document.documentElement.className.split(/\\s+/).filter((k) => /^fw-/.test(k)).join(' '), morphing: h.classList.contains('is-morphing'), pre: h.classList.contains('fw-cm-pre'), hidden: h.classList.contains('is-scroll-hidden'),
    m: h.style.getPropertyValue('--morph'), u3: u3 ? getComputedStyle(u3).display : null, nav: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','), inert: h.querySelector('[inert]') ? 1 : 0 }; })())`;

let sim = null, chrome = null, cdp = null, cfg = null;
if (ENGINE === 'sim') { sim = await import(join(WT, 'tools/lib/sim.mjs')); cfg = sim.readConfig(); }
else {
  const C = await import(join(WT, 'tools/lib/cdp.mjs'));
  chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmprelook'), headless: true, windowSize: `430,${H}` });
  cdp = await C.CDP.connect(chrome.wsUrl); chrome.C = C;
}
async function open(url, port) {
  if (sim) {
    const { execFileSync } = await import('node:child_process');
    const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${port}`);
    return { ev: (js) => c.evaluate(js), shot: (f) => sim.simctl(['io', cfg.udid, 'screenshot', f]).status === 0, close: () => { try { c.close(); } catch {} } };
  }
  const page = await cdp.newIsolatedPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
  await chrome.C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
  // screencast frame (the compositor's), as cm-px2 --capture screencast: captureScreenshot erased CM corners (pxEP4)
  return { ev: (js) => page.eval(js, { timeout: 90000 }), shot: async (f) => { const w = page.waitFor((m) => m.method === 'Page.screencastFrame', 8000); await page.send('Page.startScreencast', { format: 'png', maxWidth: 430 * 3, maxHeight: H * 3, everyNthFrame: 1 }); const m = await w; await page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); await page.send('Page.stopScreencast').catch(() => {}); writeFileSync(f, Buffer.from(m.params.data, 'base64')); return true; }, close: () => page.close() };
}

const ARMS = ['A', 'V', 'A2', 'V2'];
const RUN = arg('--arms', ARMS.join(',')).split(',');
const res = { tool: 'research/end-of-page-fresh/s1-look.mjs', engine: ENGINE, h: ENGINE === 'sim' ? null : H, touched: TOUCHED, dirs: DIR, startedAt: new Date().toISOString(), load1: loadavg()[0], F, loads: [], stops: [], taps: [] };
const shots = {};
try {
  for (const arm of RUN) {
    const d = DIR[arm.replace(/\d+$/, '')];
    const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const load = { arm, dir: d, stops: [] }; let c = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      const get = async (u) => { for (let i = 0; ; i++) { try { return Buffer.from(await (await fetch(u)).arrayBuffer()); } catch (e) { if (i >= 20) throw e; await sleep(250); } } };
      load.served = { js: sha(await get(new URL(NODE, url))), css: sha(await get(new URL(CSS, url))) };
      c = await open(url, s.port);
      for (let i = 0; i < 40 && (await c.ev('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      await c.ev(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__pxErr.push('rej ' + String(e.reason))); return 1; })()`);
      await c.ev(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      await c.ev(`(() => { const F = ${F}; Date.now = () => F; return 1; })()`);
      let g = JSON.parse(await c.ev(GEO));
      if (!g.t) throw new Error('no .fw-ms-end (7d off)');
      await c.ev(`(scrollTo({ top: ${g.endStart - 2 * g.t}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await c.ev(GEO)); load.geo = g;
      if (TOUCHED) await c.ev(TOUCH);
      for (const S of STOPS) {
        await c.ev(RESUME);
        const y = S.k === 'top' ? 0 : S.k === 'mid' ? Math.round(g.endStart / 2) : S.m == null ? Math.round(g.endStart - 2 * g.t) : Math.round(g.endStart + S.m * g.t);
        await c.ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(1300);
        const fr = JSON.parse(await c.ev(FREEZE)); await sleep(450);
        const state = JSON.parse(await c.ev(STATE));
        const f = join(OUT, `${arm}-${S.k}.png`); const ok = await c.shot(f);
        const hits = JSON.parse(await c.ev(HITS)); const taps = JSON.parse(await c.ev(TAPS));
        (shots[S.k] ||= {})[arm] = { file: f, hits, taps }; load.stops.push({ k: S.k, m: S.m, y, state, frozen: fr, ok });
      }
      load.errors = JSON.parse(await c.ev('JSON.stringify(window.__pxErr || [])'));
    } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
    finally { try { c && (await c.close()); } catch {} p.kill(); rmSync(st, { force: true }); res.loads.push(load);
      writeFileSync(join(OUT, `${arm}-load.json`), JSON.stringify({ load, hits: Object.fromEntries(Object.entries(shots).filter(([, v]) => v[arm]).map(([k, v]) => [k, v[arm].hits])), taps: Object.fromEntries(Object.entries(shots).filter(([, v]) => v[arm]).map(([k, v]) => [k, v[arm].taps])) })); }
    console.log(`load ${arm}: served ${JSON.stringify(load.served)} ${load.stops.length} stops, errors ${JSON.stringify(load.errors || [])}`);
    for (const x of load.stops) console.log(`  ${x.k.padEnd(6)} y ${x.y} ${JSON.stringify(x.state)}`);
  }
  for (const S of STOPS) {
    const Sx = (shots[S.k] ||= {});
    for (const a of ARMS) if (!Sx[a] && existsSync(join(OUT, `${a}-${S.k}.png`)) && existsSync(join(OUT, `${a}-load.json`))) { const L = JSON.parse(readFileSync(join(OUT, `${a}-load.json`), 'utf8')); Sx[a] = { file: join(OUT, `${a}-${S.k}.png`), hits: L.hits[S.k], taps: L.taps[S.k] }; }
    if (ARMS.some((a) => !Sx[a])) { res.stops.push({ k: S.k, void: 'missing arm' }); continue; }
    const row = { k: S.k, m: S.m, ...scoreStop(Object.fromEntries(ARMS.map((a) => [a, Sx[a].file])), { V: Sx.V.hits, V2: Sx.V2.hits }, 3, 0) };
    res.stops.push(row); console.log(line(S.k, row));
    // tap parity: A against V and A2 against V2, by point key (button keys carry the element label, so a missing button shows)
    const tmap = (t) => Object.fromEntries((t || []).map(([k, x, y, st]) => [k, `${x},${y} ${st}`]));
    for (const [a, v] of [['A', 'V'], ['A2', 'V2']]) {
      const ta = tmap(Sx[a].taps), tv = tmap(Sx[v].taps); const keys = [...new Set([...Object.keys(ta), ...Object.keys(tv)])];
      const diff = keys.filter((k) => ta[k] !== tv[k]).map((k) => ({ k, a: ta[k] || null, v: tv[k] || null }));
      res.taps.push({ k: S.k, pair: a + v, n: keys.length, diff });
      console.log(`  taps ${S.k} ${a}~${v}: ${keys.length} points, ${diff.length} differ${diff.length ? ' ' + JSON.stringify(diff.slice(0, 4)) : ''}`);
    }
  }
} finally {
  res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
  writeFileSync(join(OUT, `px-${RUN.join('')}.json`), JSON.stringify(res, null, 1));
  try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {}
  console.log('wrote', OUT);
  const bad = res.loads.filter((l) => l.void).map((l) => l.arm);
  if (bad.length) { console.log(`GATE VOID: load(s) ${bad.join(', ')} failed; re-run`); process.exitCode = 3; }
}

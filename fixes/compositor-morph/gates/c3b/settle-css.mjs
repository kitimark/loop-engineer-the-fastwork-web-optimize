// c3b gate (#5, #6; arch-compositor-morph): the settled look of the nav. At held m values (touch held, so the settle
// timer moves nothing) every element of the nav's subtree is read with getComputedStyle (every property, custom ones
// included, except --morph itself, whose inline copy #5 stops writing under CM), plus the classes and inline style of
// the header and #platform's section. Arms are compared state by state, element by element. Chrome 430xH DPR 3 touch,
// no throttling, or (--sim) iOS Simulator Safari through WIP. Functional: shared slot (weight probe; simulator in a
// sim.mjs session).
//   node fixes/compositor-morph/gates/c3b/settle-css.mjs --arms A=out/cm/snap160/V,B=out/cm/c3b [--h 775] [--sim] [--reduce]
// --reduce (Chrome only): prefers-reduced-motion: reduce emulated
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SIM = argv.includes('--sim'), REDUCE = argv.includes('--reduce');
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '775'));
const OUT = join(WT, 'out/cm/settlecss-' + (SIM ? 'sim-' : '') + (REDUCE ? 'reduce-' : '') + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MS = [-0.3, 0, 0.03, 0.08, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 0.5, 0.15, 0.05, 0, -0.3, -1.2];
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t, cm: document.documentElement.classList.contains('fw-cm') }; })())`;
const STATE = `JSON.stringify((() => { const nm = (e) => e.tagName.toLowerCase() + '.' + (e.getAttribute('data-fw-cm') || String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).trim().split(/\\s+/).slice(0, 3).join('.'));
  const root = document.querySelector('header.start-selling-top-nav'); const els = [root, ...root.querySelectorAll('*')]; const out = [];
  for (const e of els) { const cs = getComputedStyle(e); const parts = []; for (let i = 0; i < cs.length; i++) { const p = cs[i]; if (p === '--morph') continue; parts.push(p + ':' + cs.getPropertyValue(p)); } parts.sort(); out.push([nm(e), parts.join('\u0001')]); }
  const pf = document.getElementById('platform'); const pc = document.querySelector('.start-selling-platform-card');
  return { els: out, header: root.className, pf: pf ? pf.className + '|' + (pf.getAttribute('style') || '') : '', pc: pc ? pc.className + '|' + (pc.getAttribute('style') || '') : '', y: Math.round(scrollY) }; })())`;
async function runArm(evalFn, g) {
  const states = [];
  await evalFn(TOUCH);
  for (const m of MS) {
    await evalFn(`(scrollTo({ top: ${Math.round(g.endStart + m * g.t)}, behavior: 'instant' }), 1)`);
    await sleep(SIM ? 900 : 600);
    states.push({ m, ...JSON.parse(await evalFn(STATE)) });
  }
  return states;
}
const res = { h: H, sim: SIM, ms: MS, arms: {} };
let chrome = null, cdp = null, S = null, wip = null;
if (SIM) { wip = await import(join(WT, 'tools/lib/wip.mjs')); }
else { const C = await import(join(WT, 'tools/lib/cdp.mjs')); chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmsettle'), headless: true, windowSize: `430,${H}` }); cdp = await C.CDP.connect(chrome.wsUrl); res.C = C; }
const C = res.C; delete res.C;
try {
  for (const A of ARMS) {
    const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
    const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let page = null, tab = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      let ev;
      if (SIM) {
        execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
        await sleep(1500); tab = await wip.openTab(`localhost:${s.port}`);
        for (let i = 0; i < 40 && (await tab.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
        await sleep(2500); ev = (x) => tab.evaluate(x);
      } else {
        page = await cdp.newIsolatedPage();
        await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, ...(REDUCE ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])] }).catch(() => {});
        await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
        ev = (x) => page.eval(x);
      }
      // the walk to the bottom (lazy content), polled: WIP's evaluate does not await a promise
      await ev(`(window.__wd = 0, (() => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => (window.__wd = 1), 2500); }; step(); })(), 1)`);
      for (let i = 0; i < 120 && !(await ev('window.__wd')); i++) await sleep(500);
      let g = JSON.parse(await ev(GEO));
      await ev(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1500);
      g = JSON.parse(await ev(GEO));
      const states = await runArm(ev, g);
      res.arms[A.k] = { geo: g, states };
      console.log(`== ${A.k} cm ${g.cm} states ${states.length} elements ${states[0].els.length}`);
    } finally { try { page && (await page.close()); } catch {} try { tab && tab.close(); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
  const ks = Object.keys(res.arms);
  if (ks.length >= 2) {
    const [a, b] = ks.map((k) => res.arms[k].states);
    const diff = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const sa = a[i], sb = b[i];
      if (sa.header !== sb.header) diff.push({ m: sa.m, what: 'header class', a: sa.header, b: sb.header });
      if (sa.pf !== sb.pf) diff.push({ m: sa.m, what: '#platform', a: sa.pf, b: sb.pf });
      if (sa.pc !== sb.pc) diff.push({ m: sa.m, what: 'platform card', a: sa.pc, b: sb.pc });
      if (sa.els.length !== sb.els.length) { diff.push({ m: sa.m, what: 'element count', a: sa.els.length, b: sb.els.length }); continue; }
      for (let j = 0; j < sa.els.length; j++) {
        if (sa.els[j][1] === sb.els[j][1]) continue;
        const pa = new Map(sa.els[j][1].split('\u0001').map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
        const pb = new Map(sb.els[j][1].split('\u0001').map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
        const props = [...new Set([...pa.keys(), ...pb.keys()])].filter((p) => pa.get(p) !== pb.get(p));
        if (!props.length) continue;
        diff.push({ m: sa.m, what: `${j} ${sa.els[j][0]}`, props: props.slice(0, 6).map((p) => `${p}: ${String(pa.get(p)).slice(0, 60)} | ${String(pb.get(p)).slice(0, 60)}`) });
      }
    }
    res.diff = diff;
    console.log(`DIFF ${ks[0]} vs ${ks[1]}: ${diff.length} differences over ${a.length} states`);
    for (const d of diff.slice(0, 40)) console.log('  ' + JSON.stringify(d));
  }
} finally {
  writeFileSync(join(OUT, 'settle-css.json'), JSON.stringify(res));
  try { cdp && cdp.close(); chrome && (await chrome.close()); } catch {}
  console.log('wrote', join(OUT, 'settle-css.json'));
}

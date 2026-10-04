// nav-hit-cache flicker triage on the Simulator (WebKit), COUNTS AND STATE ONLY, no timing claim (F-084).
// fix-scroll-cb's task-driver check (26777ce0) saw two one-step flickers only in builds with nav-hit-cache: .pain
// is-pain-dark off/on/off at steps 964-966 on the way up (N1, N2, V1; not C1, C2, V2), and the nav's is-on-dark
// on/off/on at 412-414 (V2 only). This script asks: does the .pain flicker follow the arm (C = v8 vs N = v8 +
// nav-hit-cache, base v8 of build.mjs), and is it a layout shift or a pure scroll-position effect?
// Per load: its own server on a new port (own origin, F-115), plain http, `sim.mjs open`, settle, served hashes checked
// (mismatch = VOID). A MutationObserver (no layout read except at a flip) logs every .pain is-pain-dark and nav
// is-on-dark change with the scroll position, the .pain document offset, scrollHeight and the top-level sections'
// offsetTop/offsetHeight, then probe.mjs's task-mode scroll (10 px per step, scrollTo in a timer after the rAF, ordered
// like input) top -> bottom -> top.
// Run (a functional session, no gesture):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-hit-cache/flicker-sim.mjs <records.json> C:1 N:1 N:2 C:2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, build } from './build.mjs';

const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const [outPath, ...order] = process.argv.slice(2);
if (!outPath || !order.length) { console.error('usage: flicker-sim.mjs <records.json> C:1 N:1 ...'); process.exit(1); }
const B = build({ quiet: true, base: 'v8' });
const ARMS = { C: B.C, N: B.V };
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/nav-hit-cache/sim'); mkdirSync(D, { recursive: true });
const SCROLL = (to) => `new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; const goal = Math.max(0, Math.min(max, ${to}));
  let y = scrollY, n = 0; const dir = goal >= y ? 1 : -1;
  const step = () => { y = dir > 0 ? Math.min(goal, y + 10) : Math.max(goal, y - 10); scrollTo({ top: y, behavior: 'instant' }); n++; window.__nhcStep++;
    if (y !== goal && n < 5000) requestAnimationFrame(() => setTimeout(step, 0)); else requestAnimationFrame(() => requestAnimationFrame(() => res({ n, y: scrollY, max }))); };
  requestAnimationFrame(() => setTimeout(step, 0)); })`;
const LOGGER = `(window.__nhcMo && window.__nhcMo.disconnect(), window.__nhcFl = [], window.__nhcStep = 0, ((p, nv) => {
  const host = (document.querySelector('section.commission') || document.body.firstElementChild).parentElement;
  const geo = () => [...host.children].map((e) => e.offsetTop + '+' + e.offsetHeight).join(';');
  let lp = p && p.classList.contains('is-pain-dark'), ln = nv && nv.classList.contains('is-on-dark');
  window.__nhcMo = new MutationObserver(() => { const a = p && p.classList.contains('is-pain-dark'), b = nv && nv.classList.contains('is-on-dark');
    if (a !== lp || b !== ln) { const pr = p.getBoundingClientRect();
      window.__nhcFl.push([a !== lp ? 'pain' : 'nav', window.__nhcStep, scrollY, a !== lp ? (a ? 1 : 0) : (b ? 1 : 0),
        Math.round((pr.top + scrollY) * 100) / 100, document.documentElement.scrollHeight, geo()]); }
    lp = a; ln = b; });
  for (const e of [p, nv]) e && window.__nhcMo.observe(e, { attributes: true, attributeFilter: ['class'] }); })(document.querySelector('.pain'), document.querySelector('.start-selling-top-nav')), 0)`;

const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { tool: 'fixes/nav-hit-cache/flicker-sim.mjs', base: 'v8',
  arms: { C: { js: ARMS.C.js, css: ARMS.C.css }, N: { js: ARMS.N.js, css: ARMS.N.css } }, driver: 'task',
  note: 'Simulator: state only. flips: [kind, step, scrollY, on, painDocTop, scrollHeight, section offsetTop+offsetHeight]', loads: [] };
for (const item of order) {
  const [arm, rep] = item.split(':');
  if (!ARMS[arm]) throw new Error('arm ' + arm + ': C or N');
  const st = join(D, `serve-flicker-${process.pid}-${item.replace(':', '-')}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ARMS[arm].dir, '--port', '0', '--quiet', '--no-cache',
    '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), startedAt: new Date().toISOString() };
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== ARMS[arm].js || load.served.css !== ARMS[arm].css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMS[arm].js + ' / ' + ARMS[arm].css);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(4000);
    const c = await openTab(`localhost:${s.port}`);
    try {
      await c.evaluate(`(scrollTo({ top: 0, behavior: 'instant' }), window.__nhcS = null, 0)`);
      await sleep(1500);
      await c.evaluate(LOGGER);
      await c.evaluate(`(${SCROLL('1e9')}.then((d) => ${SCROLL('0')}.then((u) => { window.__nhcS = { down: d.n, n: d.n + u.n, y: u.y, max: d.max }; })), 0)`);
      let r = null;
      for (let j = 0; j < 150 && !r; j++) { await sleep(1000); r = await c.evaluate('window.__nhcS'); }
      if (!r) throw new Error('scroll did not finish');
      load.scroll = r;
      load.flips = JSON.parse(await c.evaluate('JSON.stringify(window.__nhcFl || [])'));
    } finally { c.close(); }
    const pain = load.flips.filter((f) => f[0] === 'pain'), nav = load.flips.filter((f) => f[0] === 'nav');
    // a flicker: a change undone within 2 steps
    const flick = (l) => l.filter((f, i) => i > 1 && f[1] - l[i - 2][1] <= 2).length;
    load.summary = { painFlips: pain.length, navFlips: nav.length, painFlicker: flick(pain), navFlicker: flick(nav) };
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { p.kill(); }
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  console.log('load', item, JSON.stringify(load.served || {}), load.void || '', JSON.stringify(load.summary || {}),
    JSON.stringify((load.flips || []).filter((f) => f[0] === 'pain').map((f) => f.slice(0, 6))));
}

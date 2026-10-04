#!/usr/bin/env node
// nav-earn (T-148): the WebKit leg of earn-probe.mjs pass 1, in the iOS Simulator (Safari), no timing claims.
// Arms A = v8 (fixes/v8-best/overlay), B = v8 + fix (fixes/nav-earn/overlay), each on its own server (port 0, plain
// http, --no-cache). Per arm: load, settle, instant scroll to the page end, per-rAF nav samples through the morph
// open (synthetic wheel deltaY +120 into the page's capture listener) and close (-120); `simctl io screenshot`
// before the open and at rest after the open (endpoint check).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-earn -- \
//     node tools/sim.mjs session --functional --owner fix-nav-earn -- node fixes/nav-earn/probe/sim-probe.mjs [A,B]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), B: join(WT, 'fixes/nav-earn/overlay') };
const ARMS = (process.argv[2] || 'A,B').split(',');
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `sim-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const SAMPLER = `(() => {
  const nav = document.querySelector('header.start-selling-top-nav'); if (!nav) return 'no nav';
  const q = (s) => nav.querySelector(s);
  const earn = q('.start-selling-top-nav-btn.is-earn'), lang = q('.start-selling-language-switch'), logo = q('.start-selling-top-nav-logo');
  window.__ep = []; window.__epOn = true; const r2 = (v) => Math.round(v * 100) / 100;
  const tick = () => { if (!window.__epOn) return;
    const n = nav.getBoundingClientRect(), e = earn.getBoundingClientRect(), l = lang.getBoundingClientRect(), g = logo.getBoundingClientRect(), cs = getComputedStyle(earn);
    window.__ep.push({ t: r2(performance.now()), morph: nav.style.getPropertyValue('--morph'), cls: nav.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(),
      earnW: r2(e.width), earnOp: cs.opacity, langRight: r2(n.right - l.right), logoLeft: r2(g.left - n.left), logoW: r2(g.width), navW: r2(n.width), navH: r2(n.height) });
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 'ok'; })()`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), performance.now())`;
const res = { tool: 'fixes/nav-earn/probe/sim-probe.mjs', engine: 'webkit-simulator', startedAt: new Date().toISOString(), runs: [] };
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    await c.evaluate(`(() => { window.__pxErr = []; addEventListener('error', (e) => window.__pxErr.push(String(e.message))); return 1; })()`);
    run.viewport = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, H: document.documentElement.scrollHeight })'));
    await c.evaluate('(scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }), 1)'); await sleep(2500);
    run.endY = await c.evaluate('Math.round(scrollY)');
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-before.png`)]);
    run.sampler = await c.evaluate(SAMPLER); await sleep(300);
    run.tOpen = await c.evaluate(WHEEL(120)); await sleep(1600);
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-open.png`)]);
    run.tClose = await c.evaluate(WHEEL(-120)); await sleep(1600);
    await c.evaluate('(window.__epOn = false, 1)');
    run.samples = JSON.parse(await c.evaluate('JSON.stringify(window.__ep)'));
    run.errors = JSON.parse(await c.evaluate('JSON.stringify(window.__pxErr || [])'));
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-closed.png`)]);
  } catch (e) { run.void = String(e.stack || e); console.log(arm, 'error', run.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.runs.push(run); }
  const Sx = run.samples || [], m = (x) => +x.morph || 0, isM = (x) => /is-morphing/.test(x.cls);
  const open = Sx.filter((x) => x.t >= run.tOpen && x.t < run.tClose);
  const f02 = open.find((x) => m(x) >= 0.2), w0 = open.find((x) => x.earnW <= 0.5), i = Sx.findIndex((x) => x.t >= run.tOpen && isM(x));
  const cl = Sx.filter((x) => x.t >= run.tClose), iL = cl.findLastIndex(isM);
  run.summary = { served: run.served, viewport: run.viewport, frames: Sx.length, earnGoneMs: w0 && Math.round(w0.t - run.tOpen), morph02Ms: f02 && Math.round(f02.t - run.tOpen),
    lagMs: f02 && w0 ? Math.round(w0.t - f02.t) : null, earnWAtMorph02: f02?.earnW, langRightAtMorph02: f02?.langRight, langRightBefore: Sx[0]?.langRight,
    firstMorphFrame: i > 0 ? { m: +m(Sx[i]).toFixed(3), logo: [Sx[i - 1].logoLeft, Sx[i].logoLeft] } : null,
    closeEnd: iL >= 0 && cl[iL + 1] ? { m: +m(cl[iL]).toFixed(4), logo: [cl[iL].logoLeft, cl[iL + 1].logoLeft], earnW: [cl[iL].earnW, cl[iL + 1].earnW] } : null, errors: run.errors };
  console.log(arm, JSON.stringify(run.summary));
}
writeFileSync(join(OUT, 'sim.json'), JSON.stringify(res, null, 1));
console.log('OUT', OUT);

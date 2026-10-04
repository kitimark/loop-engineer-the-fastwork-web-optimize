#!/usr/bin/env node
// nav-earn rev 2 (T-154): the WebKit leg of top-probe.mjs (glide pass) in the iOS Simulator (Safari), no timing claims.
// Arms A = v8 (fixes/v8-best/overlay), B = v8 + nav-earn (fixes/nav-earn/overlay), R1 = rev 1 (fixes/nav-earn-r1/overlay).
// Per arm: load, settle, scroll to hero progress 0.50, per-rAF samples of the Join button (width, opacity, mask
// position, classes, scrollY) through an in-page rAF scroll 0.50 -> 0.80 over 1 s, hold 1.6 s, back over 1 s, hold;
// then a stop at progress 0.65 (inside the band) for a `simctl io screenshot`, and one at 0.80 after 2 s (rest).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-earn -- \
//     node tools/sim.mjs session --functional --owner fix-nav-earn -- node fixes/nav-earn/probe/sim-top-probe.mjs [A,B]
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
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), B: join(WT, 'fixes/nav-earn/overlay'), R1: join(WT, 'fixes/nav-earn-r1/overlay') };
const ARMS = (process.argv[2] || 'A,B').split(',');
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `simtop-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const cfg = S.readConfig();
const SAMPLER = `(() => {
  const nav = document.querySelector('header.start-selling-top-nav'); if (!nav) return 'no nav';
  const q = (s) => nav.querySelector(s);
  const earn = q('.start-selling-top-nav-btn.is-earn'), lang = q('.start-selling-language-switch');
  window.__tp = []; window.__tpOn = true; const r2 = (v) => Math.round(v * 100) / 100;
  const tick = () => { if (!window.__tpOn) return;
    const n = nav.getBoundingClientRect(), e = earn.getBoundingClientRect(), l = lang.getBoundingClientRect(), cs = getComputedStyle(earn);
    window.__tp.push({ t: r2(performance.now()), y: Math.round(scrollY), cls: nav.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(),
      earnW: r2(e.width), earnOp: cs.opacity, mask: cs.webkitMaskPosition || cs.maskPosition, ei: earn.style.getPropertyValue('--earn-in'), langRight: r2(n.right - l.right) });
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 'ok'; })()`;
const Y_AT = (p) => `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return Math.round(r.top + scrollY + Math.max(1, r.height - innerHeight) * ${p}); })()`;
const res = { tool: 'fixes/nav-earn/probe/sim-top-probe.mjs', engine: 'webkit-simulator', startedAt: new Date().toISOString(), runs: [] };
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
    run.viewport = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })'));
    const yLo = await c.evaluate(Y_AT(0.5)), yHi = await c.evaluate(Y_AT(0.8)), yMid = await c.evaluate(Y_AT(0.65));
    run.y = { yLo, yHi, yMid };
    await c.evaluate(`(scrollTo({ top: ${yLo}, behavior: 'instant' }), 1)`); await sleep(2500);
    run.sampler = await c.evaluate(SAMPLER); await sleep(200);
    await c.evaluate(`(() => { const seg = (a, b, d, next) => { const s = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - s) / d); scrollTo({ top: Math.round(a + (b - a) * k), behavior: 'instant' }); k < 1 ? requestAnimationFrame(f) : next(); }; requestAnimationFrame(f); };
      window.__gl = null; seg(${yLo}, ${yHi}, 1000, () => setTimeout(() => seg(${yHi}, ${yLo}, 1000, () => setTimeout(() => { window.__gl = 'done'; }, 1600)), 1600)); return 1; })()`);
    for (let i = 0; i < 40 && (await c.evaluate('window.__gl')) !== 'done'; i++) await sleep(250);
    await c.evaluate('(window.__tpOn = false, 1)');
    run.samples = JSON.parse(await c.evaluate('JSON.stringify(window.__tp)'));
    await c.evaluate(`(scrollTo({ top: ${yMid}, behavior: 'instant' }), 1)`); await sleep(1500);
    run.mid = JSON.parse(await c.evaluate(`JSON.stringify((() => { const e = document.querySelector('.start-selling-top-nav-btn.is-earn'); const cs = getComputedStyle(e); return { w: e.getBoundingClientRect().width, op: cs.opacity, mask: cs.webkitMaskPosition, cls: e.closest('header').className }; })())`));
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-mid.png`)]);
    await c.evaluate(`(scrollTo({ top: ${yHi}, behavior: 'instant' }), 1)`); await sleep(2500);
    S.simctl(['io', cfg.udid, 'screenshot', join(OUT, `${arm}-bar.png`)]);
    run.errors = JSON.parse(await c.evaluate('JSON.stringify(window.__pxErr || [])'));
  } catch (e) { run.void = String(e.stack || e); console.log(arm, 'error', run.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.runs.push(run); }
  const G = run.samples || [], gf = G.findIndex((x) => !/is-hero-pill/.test(x.cls)), fullW = G.reduce((m, x) => Math.max(m, x.earnW), 0);
  const gFull = G.find((x) => x.earnW >= fullW - 0.5), gBack = G.findIndex((x, i) => gf >= 0 && i > gf && /is-hero-pill/.test(x.cls));
  run.summary = { served: run.served, viewport: run.viewport, frames: G.length, fullW, flipY: gf >= 0 ? G[gf].y : null, earnWAtFlip: gf > 0 ? [G[gf - 1].earnW, G[gf].earnW] : null,
    firstGrowY: G.find((x) => x.earnW > 0.5)?.y, fullY: gFull?.y, fullAfterFlipMs: gFull && gf >= 0 ? Math.round(gFull.t - G[gf].t) : null,
    maxStepPx: Math.max(0, ...G.slice(1).map((x, i) => Math.abs(x.earnW - G[i].earnW))),
    backFlipY: gBack >= 0 ? G[gBack].y : null, zeroAfterBackMs: gBack >= 0 ? (() => { const z = G.slice(gBack).find((x) => x.earnW <= 0.5); return z ? Math.round(z.t - G[gBack].t) : null; })() : null,
    mid: run.mid, errors: run.errors };
  console.log(arm, JSON.stringify(run.summary));
}
writeFileSync(join(OUT, 'sim.json'), JSON.stringify(res, null, 1));
console.log('OUT', OUT);
process.exit(0); // see top-probe.mjs: don't let open sockets hold the slot

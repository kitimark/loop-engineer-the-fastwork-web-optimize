#!/usr/bin/env node
// nav-earn rev 3 (PR-021 rev 3, T-158): the WebKit leg of r3-probe.mjs in the iOS Simulator (Safari): counts only.
// Simulator ms are Mac-CPU ms (F-084), so no times are reported, only WebKit Timeline record counts per window
// (RenderingFrame, Layout, RecalculateStyles, Paint, Composite; records nest, all levels counted), with Timeline
// restarted per window (Page.disable -> Page.enable -> Timeline.start, F-047). Arms A = v8, R3 = rev 3, B = rev 2.
// Windows: still at the bar; top appear (instant scroll hero progress 0.66 -> 0.78, 1.6 s); top hide (back, 0.8 s);
// glide down / up (in-page rAF scroll 0.50 <-> 0.80 over 1 s, then 0.8 s); end of the page still; morph open (wheel
// +120, 1.5 s); close (wheel -120, 1.5 s). Plus the running animations on the nav 300 ms into the top appear.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-earn -- \
//     node tools/sim.mjs session --functional --owner fix-nav-earn -- node fixes/nav-earn/probe/r3-sim.mjs [A,R3]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { openTab, sleep, TIMELINE_START } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const DIRS = { A: join(WT, 'fixes/v8-best/overlay'), R3: join(WT, 'fixes/nav-earn/overlay'), B: join(WT, 'fixes/nav-earn-r2/overlay') };
const ARMS = (process.argv[2] || 'A,R3').split(',');
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/nav-earn', `r3sim-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const Y_AT = (p) => `(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return Math.round(r.top + scrollY + Math.max(1, r.height - innerHeight) * ${p}); })()`;
const GO = (y) => `(scrollTo({ top: ${y}, behavior: 'instant' }), dispatchEvent(new Event('scroll')), 1)`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), 1)`;
const GLIDE = (a, b) => `(() => { const s = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - s) / 1000); scrollTo({ top: Math.round(${a} + (${b} - ${a}) * k), behavior: 'instant' }); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`;
const ANIMS = `(() => { const n = document.querySelector('header.start-selling-top-nav'); return { cls: n.className.replace(/svelte-\\S+|start-selling-top-nav/g, '').trim(), anims: n.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => a.transitionProperty || a.animationName || (a.effect && a.effect.getKeyframes()[0] ? Object.keys(a.effect.getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).join('+') : '?')) }; })()`;
const J = async (c, expr) => JSON.parse(await c.evaluate(`JSON.stringify(${expr})`));
const TYPES = ['RenderingFrame', 'Layout', 'RecalculateStyles', 'Paint', 'Composite'];
function count(recs) {
  const o = Object.fromEntries(TYPES.map((t) => [t, 0]));
  const walk = (r) => { if (o[r.type] !== undefined) o[r.type]++; for (const ch of r.children || []) walk(ch); };
  recs.forEach(walk);
  const f = o.RenderingFrame || 0;
  return { frames: f, layout: o.Layout, style: o.RecalculateStyles, paint: o.Paint, composite: o.Composite,
    layoutPerFrame: f ? +(o.Layout / f).toFixed(2) : null, stylePerFrame: f ? +(o.RecalculateStyles / f).toFixed(2) : null, paintPerFrame: f ? +(o.Paint / f).toFixed(2) : null };
}
const res = { tool: 'fixes/nav-earn/probe/r3-sim.mjs', engine: 'webkit-simulator', startedAt: new Date().toISOString(), runs: [] };
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', DIRS[arm], '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, windows: {} }; let c = null;
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
    run.viewport = await J(c, '({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
    const y = { pill: await c.evaluate(Y_AT(0.66)), bar: await c.evaluate(Y_AT(0.78)), lo: await c.evaluate(Y_AT(0.5)), hi: await c.evaluate(Y_AT(0.8)), end: await c.evaluate('document.documentElement.scrollHeight - innerHeight') };
    run.y = y;
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    const win = async (name, trigger, ms, mid) => {
      recs = [];
      for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
      await c.evaluate(trigger);
      if (mid) { await sleep(mid.at); run[mid.key] = await J(c, ANIMS); await sleep(ms - mid.at); } else await sleep(ms);
      await c.send('Timeline.stop'); await sleep(300);
      run.windows[name] = count(recs);
    };
    await c.evaluate(GO(y.bar)); await sleep(2500);
    await win('stillBar', '1', 1000);
    await c.evaluate(GO(y.pill)); await sleep(2500);
    await win('topIn', GO(y.bar), 1600, { at: 300, key: 'animsIn300' });
    await sleep(800);
    await win('topOut', GO(y.pill), 800, { at: 100, key: 'animsOut100' });
    await sleep(1500);
    await c.evaluate(GO(y.lo)); await sleep(2500);
    await win('glideDown', GLIDE(y.lo, y.hi), 1800);
    await sleep(1200);
    await win('glideUp', GLIDE(y.hi, y.lo), 1800);
    await sleep(1500);
    await c.evaluate(GO(y.end)); await sleep(3000);
    await win('stillEnd', '1', 1000);
    await win('endOpen', WHEEL(120), 1500, { at: 150, key: 'animsOpen150' });
    await win('endClose', WHEEL(-120), 1500, { at: 800, key: 'animsClose800' });
    await c.send('Timeline.disable').catch(() => {});
    run.errors = await J(c, 'window.__pxErr || []');
  } catch (e) { run.void = String(e.stack || e); console.log(arm, 'error', run.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.runs.push(run); }
  console.log(arm, JSON.stringify(run.served), JSON.stringify(run.viewport), JSON.stringify(run.windows), 'anims', JSON.stringify([run.animsIn300, run.animsOut100, run.animsOpen150, run.animsClose800]), 'errors', JSON.stringify(run.errors));
}
writeFileSync(join(OUT, 'sim.json'), JSON.stringify(res, null, 1));
console.log('OUT', OUT);
process.exit(0);

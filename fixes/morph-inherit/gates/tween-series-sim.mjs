// morph-inherit, mid-tween check (fix-nav-morph; review-morph-inherit's open+0.25 s sample: earn opacity 1 vs 0.786):
// a per-frame time series of the nav children through a user-path open and close tween, baseline (B) vs the fix (M),
// C (st6-rb2) for reference. Simulator, counts and geometry only (Simulator ms are never judged, F-084; the frame
// times here only place the samples on the tween). The page records on rAF from the wheel dispatch: the header's
// inline --morph and classes, and per child its computed --morph, x, width, opacity (earn also max-width). Each
// getComputedStyle read flushes style, the same in every arm. Open: 3 wheel events deltaY +120 on window (the same
// path a push past the end takes, see inherit-scroll-sim.mjs); close: deltaY -120. Snapshots: node fixes/morph-inherit/build.mjs.
// Run (functional session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/morph-inherit/gates/tween-series-sim.mjs B,M,C,B2,M2
// Then: node fixes/morph-inherit/gates/tween-series-read.mjs out/morph-inherit/series-<ts>/series.json
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMDEF = {
  B: { dir: null, js: sha(readFileSync(join(BASE, NODE))), css: sha(readFileSync(join(BASE, CSS))) },
  C: { dir: join(WT, 'out/snapshots/c-7bf7c4657d21'), js: '7bf7c4657d21', css: 'f523598b2a24' },
  M: { dir: join(WT, 'out/snapshots/mi-7c61fe7d0662'), js: '7c61fe7d0662', css: 'f523598b2a24' },
};
const ARMS = (process.argv[2] || 'B,M,C,B2,M2').split(',');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-inherit', `series-${tag}`); mkdirSync(OUT, { recursive: true });
// in-page recorder: window.__mi.start(dy, ms) dispatches the wheel events and records every rAF for ms
const REC = `(() => { if (window.__mi) return 1;
  const r1 = (v) => Math.round(v * 10) / 10;
  const SEL = { bar: '.start-selling-top-nav-bar', logo: '.start-selling-top-nav-logo', actions: '.start-selling-top-nav-actions', earn: '.start-selling-top-nav-btn.is-earn', panel: '.start-selling-morph-panel' };
  const read = (t0) => { const h = document.querySelector('.start-selling-top-nav'); const o = { t: r1(performance.now() - t0), m: h.style.getPropertyValue('--morph'),
      morphing: h.classList.contains('is-morphing'), expanded: h.classList.contains('is-expanded') };
    for (const [k, s] of Object.entries(SEL)) { const e = h.querySelector(s); if (!e) { o[k] = null; continue; } const c = getComputedStyle(e), b = e.getBoundingClientRect();
      o[k] = { km: c.getPropertyValue('--morph').trim(), x: r1(b.x), w: r1(b.width), op: c.opacity, ...(k === 'earn' ? { mw: c.maxWidth } : {}) }; }
    return o; };
  window.__mi = { series: {}, start(name, dy, ms) { const t0 = performance.now(), out = (this.series[name] = [read(t0)]);
      for (let i = 0; i < 3; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
      out.push(read(t0)); const f = () => { out.push(read(t0)); if (performance.now() - t0 < ms) requestAnimationFrame(f); else out.done = 1; }; requestAnimationFrame(f); return 1; } };
  return 1; })()`;
const res = { tool: 'fix-nav-morph tween-series-sim (morph-inherit mid-tween)', note: 'Simulator: geometry per frame; ms place samples only (F-084)', order: ARMS, runs: [] };
for (const arm of ARMS) {
  const def = ARMDEF[arm[0]]; const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(def.dir ? ['--overlay', def.dir] : []), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (run.served.js !== def.js || run.served.css !== def.css) { run.void = JSON.stringify(run.served); console.log('VOID', arm, run.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    for (let i = 0; i < 40; i++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); return scrollY >= H - 1; })()`); await sleep(120); if (done) break; }
    await sleep(2500);
    await c.evaluate(REC);
    await c.evaluate(`window.__mi.start('open', 120, 1600)`); await sleep(2600);
    await c.evaluate(`window.__mi.start('close', -120, 1600)`); await sleep(2600);
    run.series = JSON.parse(await c.evaluate(`JSON.stringify(window.__mi.series)`));
    console.log(arm, 'open', run.series.open.length, 'close', run.series.close.length);
  } catch (e) { run.error = String(e.stack || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); res.runs.push(run); writeFileSync(join(OUT, 'series.json'), JSON.stringify(res, null, 1)); }
}
console.log('wrote', join(OUT, 'series.json'));

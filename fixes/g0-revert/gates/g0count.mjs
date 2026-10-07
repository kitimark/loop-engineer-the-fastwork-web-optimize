// g0.0 Simulator (WebKit) counts at the end of the page, DESCRIPTIVE ONLY (no timing claim, gate 4): per arm, Timeline
// windows (Page.disable -> Page.enable -> Timeline.start, F-047) at the page end: rest before the open (2 s), the open
// (1.2 s from the gesture), open rest (2 s), the close (1.2 s), closed rest (2 s). Counted anywhere in the record tree:
// RenderingFrame, RecalculateStyles, Layout, Paint, Composite, FunctionCall, FireAnimationFrame; per open / close
// window also per rendering frame. The gesture: v0 and g0 get a synthetic wheel event (deltaY +-120: the original's jack,
// A -> D -> E, the 680 ms tween); v14 (touch Simulator: the morph follows the scroll, PR-018) gets a smooth scroll through
// its extra screen (scrollTo the end / back by the spacer's height), its own way of opening. Real clock, no stubs.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-revert -- \
//     node tools/sim.mjs session --functional --owner fix-g0-revert -- node fixes/g0-revert/gates/g0count.mjs out/g0/sim/counts.json v0 v14 g0
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const [outPath, ...arms] = process.argv.slice(2);
const BASE = resolveTree('site-pretty');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const DIRS = { v0: null, v14: join(WT, 'out/g0/v14'), g0: join(WT, 'out/g0', process.env.G0DIR || 'g00-a') };
const pin = (a) => [sha12(readFileSync(join(DIRS[a] || BASE, JS))), sha12(readFileSync(join(DIRS[a] || BASE, CSS)))].join('/');
const TYPES = { renderingFrames: 'RenderingFrame', styleRecalcs: 'RecalculateStyles', layouts: 'Layout', paints: 'Paint', composites: 'Composite', functionCalls: 'FunctionCall', rafs: 'FireAnimationFrame' };
mkdirSync(dirname(outPath), { recursive: true });
const STATE = `JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'); return { y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight, m: n.style.getPropertyValue('--morph'), cls: n.className.replace(/svelte-\\S+/g, '').replace(/\\s+/g, ' ').trim(), spacer: (document.querySelector('.fw-ms-end') || {}).offsetHeight || 0 }; })())`;
for (const arm of arms) {
  const st = join(dirname(outPath), `serve-count-${arm}.json`); rmSync(st, { force: true });
  const sargs = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'];
  if (DIRS[arm]) sargs.push('--overlay', DIRS[arm]);
  const p = spawn(process.execPath, sargs, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, engine: 'sim', tool: 'fixes/g0-revert/gates/g0count.mjs', startedAt: new Date().toISOString(), windows: [] };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = sha12(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())) + '/' + sha12(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (load.served !== pin(arm)) throw new Error(`VOID served ${load.served}, pinned ${pin(arm)}`);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(2000);
    for (let k = 0; k < 60; k++) { const done = await c.evaluate(`(() => { const H = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(H, scrollY + 400), behavior: 'instant' }); return scrollY >= H - 1; })()`); await sleep(120); if (done) break; }
    await sleep(2000);
    // v14: the closed rest is the page end minus the extra screen; v0 / g0: the page end
    const st0 = JSON.parse(await c.evaluate(STATE));
    if (st0.spacer) { await c.evaluate(`(window.scrollTo({ top: ${st0.max - st0.spacer}, behavior: 'instant' }), 1)`); await sleep(2500); }
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })');
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    const openJs = st0.spacer ? `(window.scrollTo({ top: ${st0.max}, behavior: 'smooth' }), 1)` : `(document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })), 1)`;
    const closeJs = st0.spacer ? `(window.scrollTo({ top: ${st0.max - st0.spacer}, behavior: 'smooth' }), 1)` : `(document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })), 1)`;
    for (const [name, js, ms] of [['rest-closed-before', null, 2000], ['open', openJs, 1200], ['rest-open', null, 2000], ['close', closeJs, 1200], ['rest-closed', null, 2000]]) {
      await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
      await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
      recs.length = 0;
      await c.send('Timeline.start', { maxCallStackDepth: 0 });
      if (js) await c.evaluate(js);
      await sleep(ms);
      await c.send('Timeline.stop'); await sleep(600);
      const n = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])); const rev = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
      const walk = (r) => { if (!r) return; if (rev[r.type]) n[rev[r.type]]++; for (const ch of r.children || []) walk(ch); };
      for (const r of recs) walk(r);
      const per = n.renderingFrames ? Object.fromEntries(['styleRecalcs', 'layouts', 'paints'].map((k) => [k + 'PerFrame', Math.round((100 * n[k]) / n.renderingFrames) / 100])) : {};
      const state = JSON.parse(await c.evaluate(STATE));
      load.windows.push({ stop: name, ms, records: recs.length, ...n, ...per, state });
      console.log(arm, name, `RF${n.renderingFrames} RS${n.styleRecalcs} L${n.layouts} P${n.paints} C${n.composites} FC${n.functionCalls} rAF${n.rafs}`, JSON.stringify(per), `m ${state.m} y ${state.y}/${state.max}`);
      if (!js) continue;
      await sleep(400);
    }
  } catch (e) { load.void = 'error: ' + String(e.message || e); console.log(arm, load.void); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
}
console.log('G0COUNT DONE', outPath);

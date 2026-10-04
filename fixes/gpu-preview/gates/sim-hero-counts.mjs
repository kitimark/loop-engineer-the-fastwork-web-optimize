// gpu-preview Simulator (WebKit) gate, COUNTS AND FROZEN FRAMES ONLY, no timing claim. Two modes:
//   frames <arms>  hero frozen frames at rest (as the hero owner's pxbr2): per arm, Date.now frozen at one value (the
//                  sim-frames F), then y 0 / 300 / 548: scrollTo, 1.6 s (the exit parks), every running non-transition
//                  animation paused at 4000 ms, `simctl io screenshot` -> <arm>-<k>-m<y>.png (reveal-diff.py names).
//                  Arms: H (hero alone on best = B-R2), G (bundle), H2 (H again, A/A).
//   counts <arms>  full-page work counts per window, from a Timeline record (Page.disable -> Page.enable ->
//                  Timeline.start, F-047): y0 idle 10 s (hero clock), hero scroll (scrollTo +12 px every 50 ms,
//                  0 -> 900), bottom idle 6 s, morph M driver (the build's own __fwMorphDrive, hold 1500, 1 cycle).
//                  Counted anywhere in the record tree: RenderingFrame, RecalculateStyles, Layout, Paint, Composite,
//                  FunctionCall, TimerFire, FireAnimationFrame. Arms: A (best build), G (bundle), A2, G2.
// Arms come from out/gpu-preview/snap (fixes/gpu-preview/snap.mjs), each on its own server and origin, plain http,
// hash-checked against HASHES.txt (a mismatch is VOID). Output out/gpu-preview/sim-<mode>-<ts>/.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wi-gpu-bundle -- \
//     node tools/sim.mjs session --functional --owner wi-gpu-bundle -- node fixes/gpu-preview/gates/sim-hero-counts.mjs frames H,G,H2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const S = await import(join(WT, 'tools/lib/sim.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const [MODE, armList] = process.argv.slice(2);
if (!['frames', 'counts'].includes(MODE) || !armList) { console.error('usage: sim-hero-counts.mjs frames|counts <arm,arm,...>'); process.exit(2); }
const GS = join(WT, 'out/gpu-preview/snap');
const HX = Object.fromEntries(readFileSync(join(GS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const dirOf = (arm) => arm.replace(/\d+$/, ''); // H2 -> H (a second load of the same build, own server)
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/gpu-preview', `sim-${MODE}-${tag}`); mkdirSync(OUT, { recursive: true });
const cfg = S.readConfig();
const FREEZE = `(() => { let n = 0; for (const a of document.getAnimations()) { try { if (a instanceof CSSTransition) continue; if (a.playState !== 'running') continue; a.pause(); a.currentTime = 4000; n++; } catch {} } return n; })()`;
const HERO = `JSON.stringify((() => { const t = document.querySelector('.hero-track'); return { y: Math.round(scrollY), vv: [innerWidth, innerHeight], heOn: !!t && t.classList.contains('he-on'), heCss: !!t && t.classList.contains('he-css'),
  rv: !!document.querySelector('[data-fw-rv]'), cellAnims: [...document.querySelectorAll('.hero-copy [role=timer] .cell')].reduce((n, c) => n + c.getAnimations().length, 0),
  timer: (document.querySelector('.hero-copy [role=timer]') || {}).textContent?.replace(/\\s+/g, ' ').slice(0, 80) }; })())`;
const TYPES = { renderingFrames: 'RenderingFrame', styleRecalcs: 'RecalculateStyles', layouts: 'Layout', paints: 'Paint', composites: 'Composite', functionCalls: 'FunctionCall', timerFires: 'TimerFire', rafs: 'FireAnimationFrame' };
const res = { tool: 'fixes/gpu-preview/gates/sim-hero-counts.mjs', mode: MODE, out: OUT, startedAt: new Date().toISOString(), loads: [] };

async function windowCounts(c, recs, ms, during) {
  await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
  await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  recs.length = 0;
  await c.send('Timeline.start', { maxCallStackDepth: 0 });
  if (during) await during(); else await sleep(ms);
  await c.send('Timeline.stop'); await sleep(800);
  const n = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])); const rev = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
  let t0 = Infinity, t1 = -Infinity;
  const walk = (r) => { if (!r) return; if (rev[r.type]) n[rev[r.type]]++; if (r.startTime != null) { t0 = Math.min(t0, r.startTime); t1 = Math.max(t1, r.endTime ?? r.startTime); } for (const ch of r.children || []) walk(ch); };
  for (const r of recs) walk(r);
  return { ...n, records: recs.length, recordSpanMs: Number.isFinite(t0) ? Math.round((t1 - t0) * 1000) : 0 };
}

for (const arm of armList.split(',')) {
  const d = dirOf(arm), def = { dir: join(GS, d), js: HX[`${d}/${NODE}`], css: HX[`${d}/${CSS}`] };
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, build: d, windows: [], frames: [] }; let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (!def.js || load.served.js !== def.js || load.served.css !== def.css) { load.void = 'served ' + JSON.stringify(load.served) + ', pinned ' + def.js + ' / ' + def.css; console.log('VOID', arm, load.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(2500);
    load.ua = await c.evaluate('navigator.userAgent');
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    await c.evaluate(`(() => { window.__gpErr = []; addEventListener('error', (e) => window.__gpErr.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__gpErr.push('rej ' + String(e.reason))); return 1; })()`);
    if (MODE === 'frames') {
      await c.evaluate(`(() => { const F = 1790985600500; Date.now = () => F; return 1; })()`);
      await sleep(2000);
      const YS = [0, 300, 548];
      for (let k = 0; k < YS.length; k++) {
        await c.evaluate(`(scrollTo({ top: ${YS[k]}, behavior: 'instant' }), 1)`); await sleep(1600);
        const before = JSON.parse(await c.evaluate(HERO));
        const n = await c.evaluate(FREEZE); await sleep(600);
        const f = join(OUT, `${arm}-${k}-m${YS[k]}.png`);
        const r = S.simctl(['io', cfg.udid, 'screenshot', f]);
        load.frames.push({ k, y: YS[k], paused: n, state: before, file: f, ok: r.status === 0 });
        console.log(arm, k, YS[k], n, JSON.stringify(before), r.status === 0 ? 'shot' : 'SHOT FAILED');
        await c.evaluate(`(document.getAnimations().forEach((a) => { try { if (a.playState === 'paused') a.play(); } catch {} }), 1)`);
      }
    } else {
      const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      await c.evaluate(`(scrollTo({ top: 0, behavior: 'instant' }), 1)`); await sleep(2500);
      load.windows.push({ kind: 'idle', stop: 'y0', ms: 10000, ...(await windowCounts(c, recs, 10000)), check: JSON.parse(await c.evaluate(HERO)) });
      let hs = null;
      load.windows.push({ kind: 'scroll', stop: 'hero 0->900 (+12 px / 50 ms)', ...(await windowCounts(c, recs, 0, async () => {
        await c.evaluate(`(() => { window.__gpS = 0; const id = setInterval(() => { const y = Math.min(900, scrollY + 12); scrollTo({ top: y, behavior: 'instant' }); window.__gpS++;
          if (!window.__gpLive && document.querySelector('.hero-track.he-css')) window.__gpLive = scrollY; if (y >= 900) { clearInterval(id); window.__gpDone = 1; } }, 50); return 1; })()`);
        for (let i = 0; i < 120 && !(await c.evaluate('window.__gpDone || 0')); i++) await sleep(100);
        hs = await c.evaluate('({ steps: window.__gpS, liveAt: window.__gpLive ?? null })'); await sleep(500);
      })), hero: hs });
      await c.evaluate(`(scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 1)`); await sleep(2500);
      load.windows.push({ kind: 'idle', stop: 'bottom', ms: 6000, ...(await windowCounts(c, recs, 6000)), check: JSON.parse(await c.evaluate(HERO)) });
      let md = null;
      load.windows.push({ kind: 'morph', stop: 'M driver hold 1500 x1', ...(await windowCounts(c, recs, 0, async () => {
        await c.evaluate(`(window.__fwMD = null, window.__fwMorphDrive({ hold: 1500, cycles: 1 }), 1)`);
        for (let i = 0; i < 100 && !(await c.evaluate('window.__fwMD ? 1 : 0')); i++) await sleep(100);
        md = await c.evaluate('(() => { const j = JSON.parse(window.__fwMD || "null"); return j && { all: j.all, moving: j.moving }; })()');
      })), driver: md, check: JSON.parse(await c.evaluate(HERO)) });
    }
    load.errors = await c.evaluate('window.__gpErr || []');
  } catch (e) { load.void = 'error: ' + String(e.stack || e); console.log(arm, 'error', load.void); }
  finally { try { c && c.close(); } catch {} p.kill(); res.loads.push(load); writeFileSync(join(OUT, `sim-${MODE}.json`), JSON.stringify(res, null, 1)); }
  if (MODE === 'counts') console.log(arm, JSON.stringify(load.served), load.void || '', load.windows.map((w) => `${w.stop}: RF${w.renderingFrames} RS${w.styleRecalcs} L${w.layouts} P${w.paints} C${w.composites} FC${w.functionCalls} T${w.timerFires} rAF${w.rafs}`).join(' | '), 'errors', JSON.stringify(load.errors || []));
}
console.log('wrote', join(OUT, `sim-${MODE}.json`));

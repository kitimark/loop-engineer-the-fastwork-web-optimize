// c3b-d (b) in motion, screenshot form (arch-compositor-morph; lead 13:0xZ): does the card's edge or corner wobble DURING
// a finger drag through the start of the open (m -0.1 -> ~0.3)? iOS Simulator only (no phone, no timing verdict). The
// video form (corner-motion.mjs) can't be read: frame exports from a recording are refused by the repo guard (I-062,
// T-018/T-019). Here a slow WDA-sim stroke (CM_DRAG_MS, default 10 s) runs while `simctl io screenshot` shots are taken
// back to back; each shot's host capture window is matched to the page's rAF scroll log (performance.timeOrigin + rAF
// stamp, the host clock), so each in-motion frame gets the scroll (m) drawn around it. Two strokes per load (r1, r2: the
// A/A of one build), one load per arm. Read by corner-read.py with --shots.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//     node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/compositor-morph/gates/c3b/corner-shots.mjs V14=out/cm/snap163/V C=out/cm/snap163/C'
// Output: out/cm/corner-shots/<label>-r<k>-<n>.png + run.json (geometry, stroke, rAF log, shot windows).
import { spawn, execFileSync, execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const WT = join(HERE, '../../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs')); const simlib = await import(join(WT, 'tools/lib/sim.mjs'));
const argv = process.argv.slice(2);
const arms = argv.filter((a) => a.includes('='));
const RUNS = Number(process.env.CM_RUNS || 2), DRAG_MS = Number(process.env.CM_DRAG_MS || 10000), DRAG_PX = Number(process.env.CM_DRAG_PX || 340);
const UDID = simlib.readConfig().udid; if (!UDID) throw new Error('no Simulator udid in the sim config');
const S = await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true });
// press, hold 300 ms, move up DRAG_PX at constant speed, hold 600 ms still (finger down), lift
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 300 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pause', duration: 600 }, { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, process.env.CM_OUT || 'out/cm/corner-shots'); mkdirSync(OUT, { recursive: true });
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : innerHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
const LOG = `(window.__ml = [], (() => { const f = (ts) => { window.__ml.push([Math.round(performance.timeOrigin + ts), Math.round(scrollY * 10) / 10]); if (window.__ml.length < 6000) requestAnimationFrame(f); }; requestAnimationFrame(f); })(), 1)`;
const shot = (f) => new Promise((ok) => execFile('xcrun', ['simctl', 'io', UDID, 'screenshot', f], () => ok()));
const res = { tool: 'fixes/compositor-morph/gates/c3b/corner-shots.mjs', drag: { ms: DRAG_MS, px: DRAG_PX }, arms: {} };
for (const a of arms) {
  const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
  const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let c = null; const row = { dir, runs: [] };
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(1500); c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(2500);
    const g0 = await c.evaluate(GEO);
    await c.evaluate(`(window.__ap = 0, (() => { let y = 0; const stop = ${g0.endStart - 2 * g0.t}; const step = () => { y = Math.min(y + 400, stop); window.scrollTo({ top: y, behavior: 'instant' }); y < stop ? setTimeout(step, 60) : setTimeout(() => (window.__ap = 1), 2000); }; step(); })(), 1)`);
    for (let i = 0; i < 100 && !(await c.evaluate('window.__ap')); i++) await sleep(200);
    for (let k = 1; k <= RUNS; k++) {
      const g = await c.evaluate(GEO); row.geo = g;
      const y0 = Math.round(g.endStart - 0.1 * g.t);
      await c.evaluate(`(window.scrollTo({ top: ${y0}, behavior: 'instant' }), 1)`); await sleep(1800);
      await c.evaluate(LOG);
      const shots = []; let going = true;
      const loop = (async () => { let n = 0; while (going) { const f = join(OUT, `${label}-r${k}-${String(++n).padStart(3, '0')}.png`); const t0 = Date.now(); await shot(f); shots.push({ f, t0, t1: Date.now() }); } })();
      const t0 = Date.now();
      await S.actions(stroke(700, 700 - DRAG_PX, DRAG_MS), { timeoutMs: DRAG_MS + 30000 });
      const t1 = Date.now(); going = false; await loop;
      const ml = await c.evaluate('JSON.stringify(window.__ml)').then(JSON.parse);
      const mOf = (y) => +((y - g.endStart) / g.t).toFixed(4);
      // each shot: the scroll values the page drew inside its capture window (rAF stamps from 20 ms before its start)
      for (const sh of shots) { const ys = [...new Set(ml.filter((x) => x[0] >= sh.t0 - 20 && x[0] <= sh.t1).map((x) => x[1]))]; sh.ys = ys; sh.mLo = ys.length ? mOf(Math.min(...ys)) : null; sh.mHi = ys.length ? mOf(Math.max(...ys)) : null; }
      const ys = ml.map((x) => x[1]);
      row.runs.push({ k, y0, strokeMs: t1 - t0, t0, t1, rafFrames: ml.length, mFrom: mOf(Math.min(...ys)), mTo: mOf(Math.max(...ys)), shots, ml });
      const inR = shots.filter((x) => x.mLo != null && x.mLo >= -0.02 && x.mHi <= 0.32);
      console.log(`${label} r${k}: stroke ${t1 - t0} ms | rAF frames ${ml.length} | m ${mOf(Math.min(...ys))} -> ${mOf(Math.max(...ys))} | shots ${shots.length}, ${inR.length} inside m 0..0.3, ${(shots.reduce((s2, x) => s2 + x.t1 - x.t0, 0) / Math.max(1, shots.length)).toFixed(0)} ms each`);
      // back to rest above the end, so the next stroke starts closed
      await c.evaluate(`(window.scrollTo({ top: ${g.endStart - g.t}, behavior: 'instant' }), 1)`); await sleep(1500);
    }
  } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', row.error); }
  finally { try { c && c.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms[label] = row;
}
try { await S.close?.(); } catch {}
writeFileSync(join(OUT, 'run.json'), JSON.stringify(res));
console.log('WROTE', join(OUT, 'run.json'));

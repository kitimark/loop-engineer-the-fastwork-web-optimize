// c3b-d (b) in motion (arch-compositor-morph; lead 13:0xZ): does the card's edge or corner wobble DURING a finger drag
// through the start of the open (m -0.1 -> ~0.3)? iOS Simulator only (no phone, no timing verdict): a WDA-sim finger
// stroke (slow, constant speed, held at the end), recorded with `simctl io recordVideo` (the Simulator's own screen),
// then decoded and read per frame by corner-motion-read.py. Two strokes per load (r1, r2: the A/A of one build), one
// load per arm. An rAF logger records scrollY per frame (counts only).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-compositor-morph -- \
//     node tools/sim.mjs session --functional --owner arch-compositor-morph -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/compositor-morph/gates/c3b/corner-motion.mjs V14=out/cm/snap163/V C=out/cm/snap163/C'
// Output: out/cm/corner-motion/<label>-r<k>.mov + run.json (geometry, stroke, rAF log).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const WT = join(HERE, '../../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs')); const simlib = await import(join(WT, 'tools/lib/sim.mjs'));
const argv = process.argv.slice(2);
const arms = argv.filter((a) => a.includes('='));
const RUNS = Number(process.env.CM_RUNS || 2), DRAG_MS = Number(process.env.CM_DRAG_MS || 2600), DRAG_PX = Number(process.env.CM_DRAG_PX || 340);
const UDID = simlib.readConfig().udid; if (!UDID) throw new Error('no Simulator udid in the sim config');
const S = await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true });
// press, hold 300 ms, move up DRAG_PX at constant speed, hold 600 ms still (finger down), lift
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 300 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pause', duration: 600 }, { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, 'out/cm/corner-motion'); mkdirSync(OUT, { recursive: true });
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : innerHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })()`;
const LOG = `(window.__ml = [], (() => { const f = (ts) => { window.__ml.push([+ts.toFixed(1), Math.round(scrollY * 10) / 10]); if (window.__ml.length < 4000) requestAnimationFrame(f); }; requestAnimationFrame(f); })(), 1)`;
const res = { tool: 'fixes/compositor-morph/gates/c3b/corner-motion.mjs', drag: { ms: DRAG_MS, px: DRAG_PX }, arms: {} };
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
      const vid = join(OUT, `${label}-r${k}.mov`); rmSync(vid, { force: true });
      const rec = spawn('xcrun', ['simctl', 'io', UDID, 'recordVideo', '--codec=h264', '--force', vid], { stdio: 'ignore' });
      await sleep(1500);
      await c.evaluate(LOG);
      const t0 = Date.now();
      await S.actions(stroke(700, 700 - DRAG_PX, DRAG_MS));
      const t1 = Date.now();
      await sleep(400);
      const ml = await c.evaluate('JSON.stringify(window.__ml)').then(JSON.parse);
      rec.kill('SIGINT'); await new Promise((ok) => { rec.on('exit', ok); setTimeout(ok, 8000); });
      const ys = ml.map((x) => x[1]); const mOf = (y) => +((y - g.endStart) / g.t).toFixed(3);
      row.runs.push({ k, vid, y0, strokeMs: t1 - t0, rafFrames: ml.length, mFrom: mOf(Math.min(...ys)), mTo: mOf(Math.max(...ys)), ml });
      console.log(`${label} r${k}: ${vid.slice(WT.length + 1)} | stroke ${t1 - t0} ms | rAF frames ${ml.length} | m ${mOf(Math.min(...ys))} -> ${mOf(Math.max(...ys))}`);
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

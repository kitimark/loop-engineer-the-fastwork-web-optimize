// P-149 pixels, WebKit (Simulator fw-sim): px149-run.mjs's stops (3 fresh N0 pairs, then R3) with real Simulator
// screenshots (`simctl io <udid> screenshot`). Groups (px149.mjs SIM_GROUPS): S1 = expanded (portrait, toolbar expanded),
// then landscape in the same session; S2 = collapsed (portrait after P-146's finger-drag collapse, collapse-v1.json,
// count-only). Every state: 4 positions x rest/swipe, R3 at every stop (the Simulator is judged per stop, P149.md).
// The page is P-148's instrument overlay (fixes/deck-contain--px148), served here by serve.mjs over plain http.
// Calibration and masks as P-148 (magenta marker; hero clock; the screen outside the page viewport).
// usage (inside: node tools/sim.mjs session --functional --owner fix-deck-contain -- ...):
//   node fixes/deck-contain/px149-sim.mjs <out.json> --group S1|S2
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { evalAsync } from './geo.mjs';
import { pngPixels } from './px.mjs';
import { POSITIONS, MODES, SIM_GROUPS, budgetSkip } from './px149.mjs';
import { POS, GATE, RAF2G, outsideMasks } from './px148-run.mjs';
import { stop, line } from './px149-run.mjs';
import { build } from './mk-px148-overlay.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const OUT = process.argv[2];
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const GROUP = opt('--group');
if (!OUT || !SIM_GROUPS[GROUP]) { console.error('usage: px149-sim.mjs <out.json> --group S1|S2'); process.exit(2); }
const HERE = dirname(new URL(import.meta.url).pathname);
const R3 = { name: 'R3', css: readFileSync(join(HERE, 'arms', 'r3-pad-only.css'), 'utf8') };
const UDID = process.env.FW_SIM_UDID; if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const OVL = join(WT, 'fixes/deck-contain--px148/overlay');
const DIR = join(WT, 'out/deck-contain/px149-sim-shots'); mkdirSync(DIR, { recursive: true });
const sim = (...a) => execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), ...a], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const shot = () => { const f = join(DIR, 'shot.png'); execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] }); return readFileSync(f); };
const res = { tool: 'deck-contain px149-sim', group: GROUP, states: SIM_GROUPS[GROUP], overlay: build({ check: true }), startedAt: new Date().toISOString(), configs: {}, notRun: [], stops: [] };
const st = join(DIR, `serve-${process.pid}.json`); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', OVL, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
let c = null;
const ev = async (e) => (e.trimStart().startsWith('new Promise') ? evalAsync(c, e, sleep) : c.evaluate(e));
const calibrate = async () => {
  await c.evaluate(`(() => { const m = document.createElement('div'); m.id = 'dc-mark'; m.style.cssText = 'position:fixed;left:10px;top:10px;width:6px;height:6px;background:#f0f;z-index:2147483647;pointer-events:none'; document.body.appendChild(m); return 1; })()`);
  await evalAsync(c, RAF2G, sleep); await sleep(200);
  const P = pngPixels(shot()); let x0 = 1e9, y0 = 1e9, x1 = -1;
  for (let i = 0; i < P.px.length; i += P.bpp) { if (P.px[i] > 240 && P.px[i + 1] < 20 && P.px[i + 2] > 240) { const q = i / P.bpp, x = q % P.w, y = (q - x) / P.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); } }
  await c.evaluate(`document.getElementById('dc-mark')?.remove()`); await evalAsync(c, RAF2G, sleep);
  if (x1 < 0) return null;
  const scale = (x1 - x0 + 1) / 6; return { ox: x0 - 10 * scale, oy: y0 - 10 * scale, scale, W: P.w, H: P.h };
};
const runState = async (STATE) => {
  const c0 = Date.now();
  const gate = await c.evaluate(GATE);
  if (gate !== 'px148-gate v1') throw new Error(`motion hold not loaded (${gate})`);
  const cal = await calibrate(); if (!cal) throw new Error('calibration marker not found');
  const vp = await c.evaluate('[innerWidth, innerHeight]');
  const io = { ev, shot: async () => shot(), sleep, cal, dpr: cal.scale, extraMasks: outsideMasks(cal, vp[0], vp[1]), armWait: 150,
    save: (tag, s) => { for (const [k, b] of Object.entries(s)) writeFileSync(join(DIR, `${tag}-${k}.png`), b); } };
  res.configs[STATE] = { gate, cal, viewport: vp, outside: io.extraMasks.map((m) => m.r) };
  console.log(`STATE ${STATE} cal ${JSON.stringify(cal)} viewport ${vp.join('x')}`);
  const pos = await c.evaluate(POS);
  for (const pk of POSITIONS) for (const mode of MODES) {
    const r = await stop(io, { cfg: STATE, pos: pk, y: pos[pk], mode, arm: R3 });
    res.stops.push(r); console.log(line(r));
  }
  res.configs[STATE].seconds = +((Date.now() - c0) / 1000).toFixed(1);
};
const t0 = Date.now();
try {
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  const url = `http://localhost:${s.port}/`;
  sim('open', url); await sleep(2500);
  c = await openTab(`localhost:${s.port}`);
  for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
  await sleep(4000);
  for (const STATE of SIM_GROUPS[GROUP]) {
    const skip = budgetSkip((Date.now() - t0) / 1000, STATE);
    if (skip) { res.notRun.push({ cfg: STATE, reason: skip }); console.log(STATE, 'NOT RUN', skip); continue; }
    try {
      if (STATE === 'collapsed') {
        await c.evaluate(`(() => { const d = document.querySelector('.start-selling-profile-deck'); scrollTo({ top: Math.max(0, d.getBoundingClientRect().top + scrollY - 700), behavior: 'instant' }); return 1; })()`);
        await sleep(800); c.close(); c = null;
        sim('wda', 'start'); res.gesture = sim('gesture', join(HERE, 'collapse-v1.json'), '--count-only', '--label', 'deck-px149-collapse').split('\n').filter((l) => /COUNT_ONLY/.test(l)).join(' ').slice(0, 800);
        await sleep(1500); c = await openTab(`localhost:${s.port}`);
      }
      if (STATE === 'landscape') { c.close(); c = null; sim('wda', 'start'); sim('orient', 'landscape'); await sleep(2000); c = await openTab(`localhost:${s.port}`); }
      await runState(STATE);
    } catch (e) { res.configs[STATE] = { ...(res.configs[STATE] || {}), error: String(e.stack || e.message || e) }; console.log(STATE, 'ERROR', e.message || e); process.exitCode = 1; }
    if (STATE === 'landscape') { try { c?.close(); } catch {} c = null; sim('orient', 'portrait'); await sleep(1500); }
  }
} catch (e) { res.error = String(e.stack || e.message || e); console.log('ERROR', e.message || e); process.exitCode = 1; }
finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
res.endedAt = new Date().toISOString(); res.seconds = +((Date.now() - t0) / 1000).toFixed(1); res.complete = true;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT, 'stops', res.stops.length, 'notRun', res.notRun.length, 'seconds', res.seconds);

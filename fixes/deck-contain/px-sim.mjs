// P-143 pixels, WebKit (Simulator fw-sim): px-chrome.mjs's in-place T0 test with real Simulator screenshots
// (`simctl io <udid> screenshot`, the composited screen, as fixes/cd-strip/simpx.mjs does). States: portrait with the
// toolbar expanded, portrait after a finger-drag collapse (collapse-v1.json, WDA-sim, count-only), landscape. The hero
// clock mask is placed with a 6x6 magenta marker at CSS (10,10) that calibrates the screen offset per state.
// usage (inside: node tools/sim.mjs session --functional --owner fix-deck-contain -- ...):
//   node fixes/deck-contain/px-sim.mjs <out.json> [--arms A3,A4] [--states expanded,collapsed,landscape]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { ARM, GEO, evalAsync } from './geo.mjs';
import { pngPixels, pxDiff, judge, FREEZE, UNFREEZE, CLOCK, POS, STEP_TO, RAF2 } from './px.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const OUT = process.argv[2];
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ARMS = (opt('--arms') || 'A3').split(','), STATES = (opt('--states') || 'expanded,collapsed,landscape').split(',');
const HERE = dirname(new URL(import.meta.url).pathname);
const FILES = { A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css' };
const UDID = process.env.FW_SIM_UDID; if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const OVL = join(WT, 'fixes/deck-contain--base/overlay');
const DIR = join(WT, 'out/deck-contain/px-sim'); mkdirSync(DIR, { recursive: true });
const sim = (...a) => execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), ...a], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const shot = () => { const f = join(DIR, 'shot.png'); execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] }); return readFileSync(f); };
const res = { tool: 'deck-contain px-sim', arms: ARMS, startedAt: new Date().toISOString(), pairs: [], states: {} };
const st = join(DIR, `serve-${process.pid}.json`); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', OVL, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
let c = null;
const calibrate = async () => {
  await c.evaluate(`(() => { const m = document.createElement('div'); m.id = 'dc-mark'; m.style.cssText = 'position:fixed;left:10px;top:10px;width:6px;height:6px;background:#f0f;z-index:2147483647;pointer-events:none'; document.body.appendChild(m); return 1; })()`);
  await evalAsync(c, RAF2, sleep); await sleep(200);
  const P = pngPixels(shot()); let x0 = 1e9, y0 = 1e9, x1 = -1;
  for (let i = 0; i < P.px.length; i += P.bpp) { if (P.px[i] > 240 && P.px[i + 1] < 20 && P.px[i + 2] > 240) { const q = i / P.bpp, x = q % P.w, y = (q - x) / P.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); } }
  await c.evaluate(`document.getElementById('dc-mark')?.remove()`); await evalAsync(c, RAF2, sleep);
  if (x1 < 0) return null;
  const scale = (x1 - x0 + 1) / 6; return { ox: x0 - 10 * scale, oy: y0 - 10 * scale, scale };
};
const runState = async (state) => {
  const cal = await calibrate(); res.states[state] = { cal, geo: await c.evaluate(GEO) };
  console.log(`STATE ${state} cal ${JSON.stringify(cal)} ih ${res.states[state].geo.ih} iw ${res.states[state].geo.iw}`);
  const pos = await c.evaluate(POS);
  for (const [pk, y] of Object.entries(pos)) for (const mode of ['rest', 'swipe']) for (const arm of ARMS) {
    const css = readFileSync(join(HERE, 'arms', FILES[arm]), 'utf8');
    let pair = null, j;
    for (let attempt = 1; attempt <= 2 && (!pair || pair.state === 'T1'); attempt++) {
      await c.evaluate(UNFREEZE);
      if (mode === 'rest') { await c.evaluate(`scrollTo({ top: ${y}, behavior: 'instant' })`); await sleep(700); } else await evalAsync(c, STEP_TO(y), sleep);
      const frozen = await c.evaluate(FREEZE); await evalAsync(c, RAF2, sleep);
      const clock = await c.evaluate(CLOCK);
      const masks = clock && cal ? [[clock[0] * cal.scale + cal.ox, clock[1] * cal.scale + cal.oy, clock[2] * cal.scale + cal.ox, clock[3] * cal.scale + cal.oy].map(Math.round)] : [];
      const g0 = await c.evaluate(GEO); const b = shot();
      await c.evaluate(ARM(css, arm)); await evalAsync(c, RAF2, sleep); await sleep(150);
      const g1 = await c.evaluate(GEO); const a = shot();
      await c.evaluate(ARM(null)); await evalAsync(c, RAF2, sleep); await sleep(150);
      const b2 = shot();
      const aa = pxDiff(b, b2, masks), ab = pxDiff(b, a, masks);
      pair = { state: (j = judge(b, a, b2, masks, cal?.scale || 3)).state, judge: j, view: state, pos: pk, mode, arm, attempt, y: g0.sy, ih: g0.ih, frozen, masks, aa, ab, deckH: [g0.deck.h, g1.deck.h], docH: [g0.docH, g1.docH] };
      if (pair.state === 'FAIL') { writeFileSync(join(DIR, `fail-${state}-${pk}-${mode}-${arm}-base.png`), b); writeFileSync(join(DIR, `fail-${state}-${pk}-${mode}-${arm}-arm.png`), a); }
    }
    res.pairs.push(pair);
    console.log(`${state.padEnd(10)} ${pk.padEnd(6)} ${mode.padEnd(5)} ${arm} ${pair.state.padEnd(8)} y ${pair.y} ih ${pair.ih} A/A ${pair.aa.diffPixels} arm ${pair.ab.diffPixels}${pair.ab.bbox ? ' bbox ' + pair.ab.bbox.join(',') : ''} max ${pair.ab.maxChannelDelta} masked ${pair.ab.maskedPixels} deckH ${pair.deckH.join('/')} (try ${pair.attempt})`);
  }
  await c.evaluate(UNFREEZE);
};
try {
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  const url = `http://localhost:${s.port}/`;
  sim('open', url); await sleep(2500);
  c = await openTab(`localhost:${s.port}`);
  for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
  await sleep(4000);
  if (STATES.includes('expanded')) await runState('expanded');
  if (STATES.includes('collapsed')) {
    await c.evaluate(`(() => { const d = document.querySelector('.start-selling-profile-deck'); scrollTo({ top: Math.max(0, d.getBoundingClientRect().top + scrollY - 700), behavior: 'instant' }); return 1; })()`);
    await sleep(800); c.close(); c = null;
    sim('wda', 'start'); res.gesture = sim('gesture', join(HERE, 'collapse-v1.json'), '--count-only', '--label', 'deck-px-collapse').split('\n').filter((l) => /COUNT_ONLY/.test(l)).join(' ').slice(0, 800);
    await sleep(1500); c = await openTab(`localhost:${s.port}`);
    await runState('collapsed');
  }
  if (STATES.includes('landscape')) {
    c?.close(); c = null; if (!STATES.includes('collapsed')) sim('wda', 'start');
    sim('orient', 'landscape'); await sleep(2000); c = await openTab(`localhost:${s.port}`);
    await runState('landscape');
    c.close(); c = null; sim('orient', 'portrait'); await sleep(1500);
  }
} catch (e) { res.error = String(e.stack || e.message || e); console.log('ERROR', res.error); process.exitCode = 1; }
finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
const by = (x) => res.pairs.filter((q) => q.state === x).length;
res.summary = { pairs: res.pairs.length, T0: by('T0'), FAIL: by('FAIL'), T1: by('T1') };
console.log('SUMMARY', JSON.stringify(res.summary));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

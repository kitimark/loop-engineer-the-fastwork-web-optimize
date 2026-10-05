// deck-contain step 2, WebKit side: the profile deck's height on the base in the Simulator (fw-sim, iPhone 15 Pro Max
// stand-in) with Safari's toolbar expanded, after a finger-drag collapse (WDA-sim, collapse-v1.json, count-only), in
// landscape (a resize: 932 wide, still the touch branch) and back in portrait; at each state the same reads with each
// arm's CSS put in the page. Geometry only, no timing (functional session, shared slot). Server start, open and tab
// handling copied from fixes/morph-scroll/t194/swipe-sim.mjs (fix-hero-exit-threaded, db8dc091 on fix/settle-cache).
// usage (inside: node tools/sim.mjs session --functional --owner fix-deck-contain -- ...):
//   node fixes/deck-contain/probe-sim.mjs <out.json> <abs overlay dir>
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
import { GEO, ARM, TO_DECK, geoDiff, evalAsync } from './geo.mjs';
import { TABS } from './tabs.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const [OUT, OVL] = process.argv.slice(2);
if (!OUT || !OVL) throw new Error('usage: probe-sim.mjs <out.json> <abs overlay dir> [--arms A,B,...] [--tabs A3,A4] [--states collapse,landscape]');
const optv = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const HERE = dirname(new URL(import.meta.url).pathname);
const ALL = { A: 'a-size-layout.css', B: 'b-strict.css', R: 'r-ratio-only.css', A2: 'a2-stretch.css', A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css' };
const ARMS = Object.fromEntries((optv('--arms')?.split(',') || Object.keys(ALL)).map((k) => [k, ALL[k]]));
const TABARMS = optv('--tabs')?.split(',') || Object.keys(ARMS);
const STATES = optv('--states')?.split(',') || ['collapse', 'landscape'];
const CSS = Object.fromEntries(Object.entries(ARMS).map(([k, f]) => [k, readFileSync(join(HERE, 'arms', f), 'utf8')]));
const sim = (...a) => execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), ...a], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const res = { tool: 'deck-contain probe-sim', startedAt: new Date().toISOString(), overlay: OVL, states: {} };
const st = join(WT, 'out/deck-contain', `serve-sim-${process.pid}.json`); mkdirSync(dirname(st), { recursive: true }); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', OVL, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
let c = null;
const readAll = async (label) => {
  const s = res.states[label] = { reads: {}, diffs: {} };
  s.reads.base = await c.evaluate(GEO);
  for (const k of Object.keys(CSS)) { await c.evaluate(ARM(CSS[k], k)); await sleep(300); s.reads[k] = await c.evaluate(GEO); s.diffs[k] = geoDiff(s.reads.base, s.reads[k]); }
  await c.evaluate(ARM(null)); await sleep(300);
  s.reads.base2 = await c.evaluate(GEO); s.diffs.base2 = geoDiff(s.reads.base, s.reads.base2);
  const b = s.reads.base;
  console.log(`${label.padEnd(16)} ${b.iw}x${b.ih} vvh ${b.vvh} sy ${b.sy} mq ${JSON.stringify(b.mq)} deck ${b.deck.w}x${b.deck.h} parentW ${b.parentW} predH ${b.predH} shellMaxH ${b.shellMaxH} docH ${b.docH}`
    + ' | ' + Object.keys(CSS).map((k) => `${k} ${s.reads[k].deck.w}x${s.reads[k].deck.h} '${s.reads[k].deck.contain}' diffs ${s.diffs[k].length}`).join(' | ') + ` | base2 diffs ${s.diffs.base2.length}`);
  for (const k of [...Object.keys(CSS), 'base2']) if (s.diffs[k].length) console.log(`   diff ${k}: ${s.diffs[k].slice(0, 12).join('; ')}`);
};
try {
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  const url = `http://localhost:${s.port}/`;
  sim('open', url); await sleep(2500);
  c = await openTab(`localhost:${s.port}`);
  for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
  await sleep(4000);
  await c.evaluate(TO_DECK()); await sleep(800);
  await readAll('portrait-expanded');
  // the deck's scroll code (tabs.mjs): base, each arm, base again, in the same page
  res.tabs = {};
  for (const arm of ['base', ...TABARMS, 'base2']) {
    await c.evaluate(ARM(CSS[arm] ?? null, arm)); await sleep(300);
    await c.evaluate(TO_DECK()); await sleep(600);
    const r = res.tabs[arm] = await evalAsync(c, TABS, sleep);
    if (!r || r.error) { console.log(`TABS ${arm} error ${JSON.stringify(r)}`); continue; }
    console.log(`TABS ${arm.padEnd(5)} offsetParent ${r.offsetParent} ol ${r.ol.join(',')}`);
    for (const k of r.cases) console.log(`   k ${k.k} -> tab ${k.j}: before sl ${k.before.sl} act ${k.before.act} | after sl ${k.after.sl} act ${k.after.act} tab ${k.after.tab}`);
  }
  await c.evaluate(ARM(null));
  if (STATES.includes('collapse')) {
  // toolbar collapse: scroll to ~600 px above the deck, then two finger drags (the page moves down ~600 px)
  await c.evaluate(`(() => { const d = document.querySelector('.start-selling-profile-deck'); scrollTo({ top: Math.max(0, d.getBoundingClientRect().top + scrollY - 700), behavior: 'instant' }); return scrollY; })()`);
  await sleep(800);
  c.close(); c = null;
  res.wda = sim('wda', 'start').trim().split('\n').slice(-1)[0];
  res.gesture = sim('gesture', join(HERE, 'collapse-v1.json'), '--count-only', '--label', 'deck-collapse').trim().split('\n').filter((l) => /COUNT_ONLY|error/i.test(l)).join(' | ').slice(0, 1500);
  console.log('GESTURE', res.gesture);
  await sleep(1500);
  c = await openTab(`localhost:${s.port}`);
  await readAll('portrait-collapsed');
  }
  if (STATES.includes('landscape')) {
  c.close(); c = null;
  if (!STATES.includes('collapse')) res.wda = sim('wda', 'start').trim().split('\n').slice(-1)[0];
  res.orientL = sim('orient', 'landscape').trim().split('\n').slice(-1)[0]; console.log(res.orientL);
  await sleep(2000);
  c = await openTab(`localhost:${s.port}`);
  await c.evaluate(TO_DECK()); await sleep(800);
  await readAll('landscape');
  c.close(); c = null;
  res.orientP = sim('orient', 'portrait').trim().split('\n').slice(-1)[0]; console.log(res.orientP);
  await sleep(2000);
  c = await openTab(`localhost:${s.port}`);
  await c.evaluate(TO_DECK()); await sleep(800);
  await readAll('portrait-again');
  }
} catch (e) { res.error = String(e.stack || e.message || e); console.log('ERROR', res.error); process.exitCode = 1; }
finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

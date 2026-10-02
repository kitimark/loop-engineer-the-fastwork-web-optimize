// countdown-faces: WebKit (iOS Simulator, Mobile Safari) render COUNTS per window, base vs PoC. No timing verdicts:
// Simulator times never count (F-084); this counts Timeline records (RecalculateStyles, Layout, Paint, Composite,
// FireAnimationFrame, RenderingFrame) in a 4 s window at three positions (top, heroExit, pastHero).
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- \
//     node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/sim-counts.mjs [arms=base,poc]
// Output: out/countdown-faces/sim-counts-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const ARMS = (process.argv[2] || 'base,poc').split(',');
const OUT = join(WT, 'out/countdown-faces');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const DIRS = JSON.parse(readFileSync(join(OUT, 'arms/arms.json'), 'utf8'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const WIN = 4000;

function cdRange(arm) {
  const f = arm === 'base' ? join(BASE, NODE) : join(DIRS[arm], NODE);
  const lines = readFileSync(f, 'utf8').split('\n');
  return [lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1, lines.findIndex((l) => l.startsWith('var lD = h('))];
}
async function server(arm) {
  const st = join(OUT, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const ov = arm === 'base' ? [] : ['--overlay', DIRS[arm]];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
function count(records, range) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, FireAnimationFrame: 0, countdownRaf: 0, FunctionCall: 0 };
  const isCd = (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
  const walk = (r) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'FireAnimationFrame' && (r.children || []).some(isCd)) c.countdownRaf++;
    for (const ch of r.children || []) walk(ch);
  };
  records.forEach(walk);
  return c;
}
const POS = `(() => { const vh = innerHeight, t = document.querySelector('.hero-track');
  const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh; return { top: 0, heroExit: Math.round(vh), pastHero: Math.round(tb + 1.2 * vh) }; })()`;

const res = { tool: 'sim-counts', windowMs: WIN, startedAt: new Date().toISOString(), arms: {} };
for (const arm of ARMS) {
  const s = await server(arm);
  const url = `http://localhost:${s.port}/`;
  try {
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    const pos = await c.evaluate(POS);
    const range = cdRange(arm);
    res.arms[arm] = { range, positions: {} };
    for (const [name, y] of Object.entries(pos)) {
      await c.evaluate(`(window.scrollTo(0, ${y}), 0)`); await sleep(2000);
      const census = await c.evaluate(`[...document.querySelectorAll('[role=timer]')].map((t) => { const r = t.getBoundingClientRect(); return { inViewport: r.bottom > 0 && r.top < innerHeight, faces: t.querySelectorAll('.face.svelte-1quva9c').length }; })`);
      recs = [];
      await c.send('Timeline.start', { maxCallStackDepth: 1 });
      await sleep(WIN);
      await c.send('Timeline.stop');
      await sleep(1500);
      res.arms[arm].positions[name] = { y, census, counts: count(recs, range), records: recs.length };
      console.log(arm, name, JSON.stringify(res.arms[arm].positions[name].counts));
    }
    await c.send('Timeline.disable').catch(() => {});
    c.close();
  } finally { s.p.kill(); }
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-counts-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

// cd-roll-ca: WebKit (iOS Simulator, Mobile Safari) COUNTS per window, base (cd-strip on st6-rb2) vs build. No timing
// (Simulator times never count, F-084). Adapted from fixes/countdown-faces/sim-counts.mjs (de-countdown).
// Per arm, at the top of the page (hero clock in view), a WIN ms Timeline window: RenderingFrame, RecalculateStyles,
// Layout, Paint, Composite, FireAnimationFrame and countdownRaf (a rAF whose callback runs countdown code), plus
// document.getAnimations() on the digit strips sampled 30 times across the window (how many digits roll as a Web
// Animation, and in which play state).
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-roll-ca -- \
//     node tools/sim.mjs session --functional --owner cd-roll-ca -- node fixes/cd-roll-ca/sim-counts.mjs [base,build] [reps]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const ARMS = (process.argv[2] || 'base,build').split(',');
const REPS = Number(process.argv[3] || 2);
// argv[4] 'freeze': before the window, pause every other animation and keep it paused (CSS animation-play-state on
// everything but the strips; Element.animate() on any other element returns a paused animation), as comp-check.mjs
const FREEZE = process.argv[4] === 'freeze';
const FREEZE_JS = `(() => { const st = document.createElement('style'); st.textContent = '*:not(.strip) { animation-play-state: paused !important; }'; document.head.append(st);
  const orig = Element.prototype.animate; Element.prototype.animate = function (...a) { const an = orig.apply(this, a); if (!this.closest('.strip')) an.pause(); return an; };
  let n = 0; for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.closest && t.closest('.strip')) continue; a.pause(); n++; } return n; })()`;
const OUT = join(WT, 'out/cd-roll-ca');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const OV = { base: ['cd-strip', 'st6-rb2'], build: ['cd-roll-ca', 'cd-strip', 'st6-rb2'] };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const WIN = 4000;
const ovDirs = (arm) => OV[arm].map((t) => join(WT, 'fixes', t, 'overlay'));
function cdRange(arm) {
  const f = ovDirs(arm).map((d) => join(d, NODE)).find((p) => existsSync(p));
  const lines = readFileSync(f, 'utf8').split('\n');
  return [lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1, lines.findIndex((l) => l.startsWith('var lD = h('))];
}
async function server(arm) {
  const st = join(OUT, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', ovDirs(arm).join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
function count(records, range) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, FireAnimationFrame: 0, countdownRaf: 0 };
  const isCd = (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
  const walk = (r) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'FireAnimationFrame' && (r.children || []).some(isCd)) c.countdownRaf++;
    for (const ch of r.children || []) walk(ch);
  };
  records.forEach(walk);
  return c;
}
// the hero clock: the timer without the panel's .inverse class
const ANIMS = `(() => { const ss = [...document.querySelector('[role=timer]:not(.inverse)')?.querySelectorAll('.digit > .strip') || []];
  let running = 0, total = 0; for (const s of ss) for (const a of s.getAnimations()) { total++; if (a.playState === 'running') running++; }
  return { strips: ss.length, running, total }; })()`;

const res = { tool: 'fixes/cd-roll-ca/sim-counts.mjs', freeze: FREEZE, windowMs: WIN, reps: REPS, startedAt: new Date().toISOString(), arms: {} };
for (let rep = 0; rep < REPS; rep++) for (const arm of rep % 2 ? [...ARMS].reverse() : ARMS) {
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
    const range = cdRange(arm);
    await c.evaluate('(window.scrollTo(0, 0), 0)'); await sleep(2000);
    const frozen = FREEZE ? await c.evaluate(FREEZE_JS) : null; if (FREEZE) await sleep(500);
    const census = await c.evaluate(`[...document.querySelectorAll('[role=timer]')].map((t) => { const r = t.getBoundingClientRect(); return { inViewport: r.bottom > 0 && r.top < innerHeight, strips: t.querySelectorAll('.strip').length, faces: t.querySelectorAll('.face.svelte-1quva9c').length }; })`);
    recs = [];
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    const samples = []; const t0 = Date.now();
    while (Date.now() - t0 < WIN) { samples.push(await c.evaluate(ANIMS)); await sleep(WIN / 30); }
    await c.send('Timeline.stop');
    await sleep(1500);
    const maxRunning = Math.max(0, ...samples.map((x) => x.running));
    const withAnim = samples.filter((x) => x.running > 0).length;
    const row = { rep, frozen, census, counts: count(recs, range), records: recs.length, animSamples: { n: samples.length, withRunning: withAnim, maxRunning, strips: samples[0]?.strips } };
    (res.arms[arm] ||= []).push(row);
    console.log(arm, rep, JSON.stringify(row.counts), JSON.stringify(row.animSamples));
    await c.send('Timeline.disable').catch(() => {});
    c.close();
  } finally { s.p.kill(); }
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-counts-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

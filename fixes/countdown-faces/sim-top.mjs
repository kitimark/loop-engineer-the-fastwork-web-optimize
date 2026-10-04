// countdown-faces (b) on the C stack (de-countdown): a copy of fix-cd-roll-ca's fixes/cd-roll-ca/sim-counts.mjs, used with
// credit; arms from out/countdown-faces/snap (C, V), output to out/countdown-faces/. The top window: V must equal C.
//   ... -- node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/sim-top.mjs C,V 2
// cd-roll-ca: WebKit (iOS Simulator, Mobile Safari) COUNTS per window, base (cd-strip on st6-rb2) vs build. No timing
// (Simulator times never count, F-084). Adapted from fixes/countdown-faces/sim-counts.mjs (de-countdown).
// Per arm, at the top of the page (hero clock in view), a WIN ms Timeline window: RenderingFrame, RecalculateStyles,
// Layout, Paint, Composite, FireAnimationFrame and countdownRaf (a rAF whose callback runs countdown code), plus
// document.getAnimations() on the digit strips sampled 30 times across the window (how many digits roll as a Web
// Animation, and in which play state).
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-roll-ca -- \
//     node tools/sim.mjs session --functional --owner cd-roll-ca -- node fixes/cd-roll-ca/sim-counts.mjs [base,build] [reps]
// Arms named after a snapshot copy in out/cd-roll-ca/snap (C4, V5, ...) are served from it, hash-checked against
// HASHES.txt (a mismatch is VOID, exit 3); base/build serve the live overlays as before. SIMCOUNTS_WIN=<ms> sets the
// window (default 4000; 10500 includes the ones digit's 0 -> 9 long roll). Per window also: rendering frames with a
// RecalculateStyles / a countdown rAF / a clock-sized Paint, digit rolls (hero digits whose value changed, from a
// MutationObserver on the hero numbers' data-value), and after the window a LayerTree census of the hero clock at rest
// and ~150 ms into a roll (layers, backing MB, layers holding a backing; LayerTree read as in fix-cd-strip's sim.mjs).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
const OUT = join(WT, 'out/countdown-faces');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const OV = { base: ['cd-strip', 'st6-rb2'], build: ['cd-roll-ca', 'cd-strip', 'st6-rb2'] };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const WIN = Number(process.env.SIMCOUNTS_WIN || 4000);
const SNAPS = join(WT, 'out/countdown-faces/snap');
const HASHES = existsSync(join(SNAPS, 'HASHES.txt')) ? Object.fromEntries(readFileSync(join(SNAPS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h])) : {};
const isSnap = (arm) => !OV[arm] && existsSync(join(SNAPS, arm, NODE));
const ovDirs = (arm) => OV[arm].map((t) => join(WT, 'fixes', t, 'overlay'));
function cdRange(arm) {
  const f = isSnap(arm) ? join(SNAPS, arm, NODE) : ovDirs(arm).map((d) => join(d, NODE)).find((p) => existsSync(p));
  const lines = readFileSync(f, 'utf8').split('\n');
  return [lines.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1, lines.findIndex((l) => l.startsWith('var lD = h('))];
}
async function server(arm) {
  const st = join(OUT, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', isSnap(arm) ? join(SNAPS, arm) : ovDirs(arm).join(','), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const QB = (q) => (q && q.length >= 8 ? { w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);
function count(records, range, g) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, FireAnimationFrame: 0, countdownRaf: 0, clockPaint: 0,
    framesWithRecalc: 0, framesWithCountdownRaf: 0, framesWithClockPaint: 0 };
  const isCd = (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
  // clock-sized Paint: digit width (<= 1.5 x), up to 12 digit heights (a cell, or a strip)
  const isClock = (r) => { const q = QB(r.data?.clip); return !!q && !!g && q.w <= 1.5 * g.dw && q.h <= 12 * g.dh; };
  const walk = (r, F) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'FireAnimationFrame' && (r.children || []).some(isCd)) { c.countdownRaf++; if (F) F.cd = true; }
    if (r.type === 'RecalculateStyles' && F) F.recalc = true;
    if (r.type === 'Paint' && isClock(r)) { c.clockPaint++; if (F) F.paint = true; }
    for (const ch of r.children || []) walk(ch, F);
  };
  for (const r of records) { const F = r.type === 'RenderingFrame' ? {} : null; walk(r, F); if (F) { c.framesWithRecalc += F.recalc ? 1 : 0; c.framesWithCountdownRaf += F.cd ? 1 : 0; c.framesWithClockPaint += F.paint ? 1 : 0; } }
  return c;
}
// hero digit rolls: per change of a hero .number's data-value, how many of its digits changed
const INSTALL = `(() => { if (window.__sc) return 'again'; const X = window.__sc = { rolls: 0, ticks: 0, last: 0, long: 0, lastLong: 0 };
  const hero = document.querySelector('[role=timer]:not(.inverse)');
  new MutationObserver((ms) => { for (const m of ms) { const a = String(m.oldValue ?? ''), b = String(m.target.getAttribute('data-value') ?? ''); const n = Math.max(a.length, b.length);
    const A = a.padStart(n, '0'), B = b.padStart(n, '0'); for (let i = 0; i < n; i++) if (A[i] !== B[i]) { X.rolls++; if (Math.abs(+A[i] - +B[i]) >= 5) { X.long++; X.lastLong = performance.now(); } }
    X.ticks++; X.last = performance.now(); } }).observe(hero, { subtree: true, attributes: true, attributeFilter: ['data-value'], attributeOldValue: true });
  const d = hero.querySelector('.digit').getBoundingClientRect(); X.g = { dw: d.width * devicePixelRatio, dh: d.height * devicePixelRatio, cssW: d.width, cssH: d.height };
  return 'ok'; })()`;
async function heroLayers(c) {
  try {
    await c.send('LayerTree.enable');
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const ids = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: '[role=timer]:not(.inverse) .digit > .strip, [role=timer]:not(.inverse) .digit > .strip .cdwrap, [role=timer]:not(.inverse) .digit > .strip .cell' })).nodeIds);
    const L = ((await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []).filter((l) => ids.has(l.nodeId));
    return { layers: L.length, backed: L.filter((l) => l.memory > 0).length, MB: +(L.reduce((a, l) => a + (l.memory || 0), 0) / 1048576).toFixed(3), paints: L.reduce((a, l) => a + (l.paintCount || 0), 0) };
  } catch (e) { return { error: String(e.message || e) }; } finally { await c.send('LayerTree.disable').catch(() => {}); }
}
// the hero clock: the timer without the panel's .inverse class
const ANIMS = `(() => { const ss = [...document.querySelector('[role=timer]:not(.inverse)')?.querySelectorAll('.digit > .strip') || []];
  // per strip (a digit), not per animation: the build on strip-rb runs several cell animations per rolling digit
  let running = 0, total = 0; for (const s of ss) { const an = s.getAnimations({ subtree: true }); total += an.length; if (an.some((a) => a.playState === 'running')) running++; }
  return { strips: ss.length, running, total }; })()`;

const res = { tool: 'fixes/countdown-faces/sim-top.mjs', freeze: FREEZE, windowMs: WIN, reps: REPS, startedAt: new Date().toISOString(), arms: {} };
for (let rep = 0; rep < REPS; rep++) for (const arm of rep % 2 ? [...ARMS].reverse() : ARMS) {
  const s = await server(arm);
  const url = `http://localhost:${s.port}/`;
  try {
    if (isSnap(arm)) { const sha = (b) => createHash('sha256').update(b).digest('hex');
      const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
      if (js !== HASHES[`${arm}/${NODE}`] || css !== HASHES[`${arm}/${CSS}`]) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; continue; }
      (res.served ||= {})[arm] = { js: js.slice(0, 12), css: css.slice(0, 12) }; }
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
    await c.evaluate(INSTALL); const g = await c.evaluate('window.__sc.g');
    const census = await c.evaluate(`[...document.querySelectorAll('[role=timer]')].map((t) => { const r = t.getBoundingClientRect(); return { inViewport: r.bottom > 0 && r.top < innerHeight, strips: t.querySelectorAll('.strip').length, faces: t.querySelectorAll('.face.svelte-1quva9c').length }; })`);
    recs = []; const k0 = await c.evaluate('[window.__sc.rolls, window.__sc.ticks, window.__sc.long]');
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    const samples = []; const t0 = Date.now();
    while (Date.now() - t0 < WIN) { samples.push(await c.evaluate(ANIMS)); await sleep(WIN / 30); }
    await c.send('Timeline.stop');
    const k1 = await c.evaluate('[window.__sc.rolls, window.__sc.ticks, window.__sc.long]');
    await sleep(1500);
    // LayerTree census: at rest (~800 ms after a tick) and ~150 ms into a roll (after the next tick), Timeline off
    const waitTick = async (key) => { const a = await c.evaluate(`window.__sc.${key}`); const t = Date.now(); while ((await c.evaluate(`window.__sc.${key}`)) === a && Date.now() - t < 11000) await sleep(30); return Date.now() - t < 11000; };
    await waitTick('ticks'); await sleep(800); const ltRest = await heroLayers(c);
    await waitTick('ticks'); await sleep(150); const ltMid = await heroLayers(c);
    const longOk = await waitTick('lastLong'); await sleep(150); const ltLongMid = longOk ? await heroLayers(c) : null;
    const maxRunning = Math.max(0, ...samples.map((x) => x.running));
    const withAnim = samples.filter((x) => x.running > 0).length;
    const row = { rep, frozen, census, counts: count(recs, range, g), records: recs.length, animSamples: { n: samples.length, withRunning: withAnim, maxRunning, strips: samples[0]?.strips },
      digitRolls: k1[0] - k0[0], ticks: k1[1] - k0[1], longRolls: k1[2] - k0[2], layerTree: { rest: ltRest, mid: ltMid, longMid: ltLongMid } };
    row.perRoll = row.digitRolls ? { clockPaint: +(row.counts.clockPaint / row.digitRolls).toFixed(2), framesWithRecalc: +(row.counts.framesWithRecalc / row.digitRolls).toFixed(2), countdownRaf: +(row.counts.countdownRaf / row.digitRolls).toFixed(2) } : null;
    (res.arms[arm] ||= []).push(row);
    console.log(arm, rep, JSON.stringify(row.counts), JSON.stringify(row.animSamples), 'rolls', row.digitRolls, 'long', row.longRolls, JSON.stringify(row.perRoll), JSON.stringify(row.layerTree));
    await c.send('Timeline.disable').catch(() => {});
    c.close();
  } finally { s.p.kill(); }
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-top-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

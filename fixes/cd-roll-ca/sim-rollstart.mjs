// cd-roll-ca, T-096 / lead task "trace the P-093 V frames > 50 ms": what WebKit does at the START of a hero digit roll,
// C8 (cd-strip strip-tc) vs V9 (C8 + cd-roll-ca), at the top of the page, iOS Simulator, Timeline on. COUNTS and record
// structure only: Simulator times never count (F-084); durations are printed as descriptive.
// Per hero tick (a MutationObserver on the hero numbers' data-value marks it with console.timeStamp, so the Timeline
// holds the tick's own task), the tick's top-level task (type, children: RecalculateStyles / Layout / FunctionCall),
// then the next FRAMES RenderingFrame records after it: per frame Paint count (and how many are cell-sized),
// RecalculateStyles, Layout, Composite, FireAnimationFrame. Ticks are classed: "long" (a digit changes by >= 5, the
// ones digit's 0 -> 9 wrap at every carry), "multi" (2+ digits, no long one), "one". About 120 ms after each tick the
// page also samples the hero's Web Animations (count, cells, keyframes per animation, max and total). LayerTree
// layerTreeDidChange events are counted per tick interval (assigned by arrival order after the tick's task).
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner cd-roll-ca -- \
//     node tools/sim.mjs session --functional --owner cd-roll-ca -- node fixes/cd-roll-ca/sim-rollstart.mjs [C8,V9] [reps]
// Arms are immutable snapshot copies in out/cd-roll-ca/snap/<arm>, hash-checked against HASHES.txt (mismatch: VOID,
// exit 3). Each arm gets a fresh server on an OS-assigned port (I-131: never a port that served another build), no-cache.
// ROLLSTART_WIN=<ms> sets the Timeline window (default 21000: at least two carries of the seconds).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const ARMS = (process.argv[2] || 'C8,V9').split(',');
const REPS = Number(process.argv[3] || 2);
const WIN = Number(process.env.ROLLSTART_WIN || 21000);
const FRAMES = 4;
const OUT = join(WT, 'out/cd-roll-ca/rollstart');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAPS = join(WT, 'out/cd-roll-ca/snap');
const HASHES = Object.fromEntries(readFileSync(join(SNAPS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function server(arm) {
  if (!existsSync(join(SNAPS, arm, NODE))) throw new Error(`no snapshot copy ${arm}`);
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAPS, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

// hero digits: per data-value change, digits changed and the largest change; a timeStamp marks the task in the Timeline
const INSTALL = `(() => { if (window.__rs) return 'again'; const X = window.__rs = { ticks: [] };
  const hero = document.querySelector('[role=timer]:not(.inverse)');
  const cellH = hero.querySelector('.digit').getBoundingClientRect().height * devicePixelRatio, cellW = hero.querySelector('.digit').getBoundingClientRect().width * devicePixelRatio;
  X.g = { cellW, cellH };
  const sample = (T) => { const an = hero.getAnimations({ subtree: true }); const cells = new Set(an.map((a) => a.effect && a.effect.target));
    const kf = an.map((a) => (a.effect && a.effect.getKeyframes ? a.effect.getKeyframes().length : 0));
    T.anim = { n: an.length, cells: cells.size, kfMax: Math.max(0, ...kf), kfTotal: kf.reduce((s, x) => s + x, 0), running: an.filter((a) => a.playState === 'running').length }; };
  new MutationObserver((ms) => { let n = 0, big = 0;
    for (const m of ms) { const a = String(m.oldValue ?? ''), b = String(m.target.getAttribute('data-value') ?? ''); const L = Math.max(a.length, b.length);
      const A = a.padStart(L, '0'), B = b.padStart(L, '0'); for (let i = 0; i < L; i++) if (A[i] !== B[i]) { n++; big = Math.max(big, Math.abs(+A[i] - +B[i])); } }
    if (!n) return; const T = { i: X.ticks.length, t: performance.now(), n, big }; X.ticks.push(T);
    console.timeStamp('crt ' + T.i); setTimeout(() => sample(T), 120); })
    .observe(hero, { subtree: true, attributes: true, attributeFilter: ['data-value'], attributeOldValue: true });
  return 'ok'; })()`;

const QB = (q) => (q && q.length >= 8 ? { w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);
const TYPES = ['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FireAnimationFrame', 'FunctionCall', 'TimerFire', 'EventDispatch'];
function tally(r, g, c = Object.fromEntries([...TYPES.map((t) => [t, 0]), ['cellPaint', 0], ['paintPx', 0]])) {
  if (r.type in c) c[r.type]++;
  if (r.type === 'Paint') { const q = QB(r.data?.clip); if (q) { c.paintPx += Math.round(q.w * q.h); if (g && q.w <= 1.5 * g.cellW && q.h <= 1.5 * g.cellH) c.cellPaint++; } }
  for (const ch of r.children || []) tally(ch, g, c);
  return c;
}
const findStamp = (r) => { if (r.type === 'TimeStamp' && /^crt \d+/.test(r.data?.message || '')) return Number(r.data.message.slice(4)); for (const ch of r.children || []) { const v = findStamp(ch); if (v !== null) return v; } return null; };
const ms = (r) => (typeof r.endTime == 'number' && typeof r.startTime == 'number' ? +((r.endTime - r.startTime) * 1000).toFixed(2) : null);

const res = { tool: 'fixes/cd-roll-ca/sim-rollstart.mjs', windowMs: WIN, frames: FRAMES, reps: REPS, startedAt: new Date().toISOString(), served: {}, arms: {} };
for (let rep = 0; rep < REPS; rep++) for (const arm of rep % 2 ? [...ARMS].reverse() : ARMS) {
  const s = await server(arm);
  const url = `http://localhost:${s.port}/`;
  try {
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (js !== HASHES[`${arm}/${NODE}`] || css !== HASHES[`${arm}/${CSS}`]) { console.error(`VOID ${arm}: serves ${js.slice(0, 12)} / ${css.slice(0, 12)}`); process.exitCode = 3; continue; }
    res.served[arm] = { js: js.slice(0, 12), css: css.slice(0, 12), port: s.port };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(3000);
    // message log in arrival order: Timeline records and layer tree changes
    let log = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') log.push({ k: 'rec', r: m.params.record }); else if (m.method === 'LayerTree.layerTreeDidChange') log.push({ k: 'lt' }); });
    await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    await c.evaluate('(window.scrollTo(0, 0), 0)'); await sleep(2000);
    await c.evaluate(INSTALL); const g = await c.evaluate('window.__rs.g');
    await c.send('LayerTree.enable').catch(() => {});
    log = [];
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    await sleep(WIN);
    await c.send('Timeline.stop');
    await sleep(300);
    await c.send('LayerTree.disable').catch(() => {});
    const ticks = await c.evaluate('JSON.stringify(window.__rs.ticks)').then(JSON.parse);
    // walk the log: tick tasks, the FRAMES rendering frames after each, layer tree changes per tick interval
    const rows = []; let cur = null;
    for (const e of log) {
      if (e.k === 'lt') { if (cur) cur.layerTreeChanges++; continue; }
      const r = e.r; const id = findStamp(r);
      if (id !== null) { const T = ticks[id] || {}; cur = { id, n: T.n, big: T.big, cls: T.big >= 5 ? 'long' : T.n >= 2 ? 'multi' : 'one', anim: T.anim || null,
        task: { type: r.type, ms: ms(r), ...tally(r, g) }, frames: [], layerTreeChanges: 0 }; rows.push(cur); continue; }
      if (cur && r.type === 'RenderingFrame' && cur.frames.length < FRAMES) cur.frames.push({ ms: ms(r), ...tally(r, g) });
    }
    const allFrames = log.filter((e) => e.k === 'rec' && e.r.type === 'RenderingFrame').length;
    const row = { rep, port: s.port, ticks: ticks.length, stamped: rows.length, renderingFrames: allFrames, layerTreeChanges: log.filter((e) => e.k === 'lt').length, rows };
    (res.arms[arm] ||= []).push(row);
    for (const x of rows) console.log(arm, rep, `tick ${x.id} ${x.cls} n${x.n} big${x.big}`, 'anim', JSON.stringify(x.anim), 'task', x.task.type, x.task.ms, `rs${x.task.RecalculateStyles} lay${x.task.Layout}`,
      '| f1', JSON.stringify(x.frames[0] && { ms: x.frames[0].ms, paint: x.frames[0].Paint, cell: x.frames[0].cellPaint, px: x.frames[0].paintPx, rs: x.frames[0].RecalculateStyles, comp: x.frames[0].Composite }), 'lt', x.layerTreeChanges);
    await c.send('Timeline.disable').catch(() => {});
    c.close();
  } finally { s.p.kill(); }
}
// summary per arm and class: medians of first-frame counts and the tick task's style recalcs
const med = (a) => { const s = a.filter((x) => typeof x == 'number').sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
res.summary = {};
for (const [arm, reps] of Object.entries(res.arms)) for (const cls of ['long', 'multi', 'one']) {
  const R = reps.flatMap((r) => r.rows).filter((x) => x.cls === cls); if (!R.length) continue;
  const f = (k, i = 0) => med(R.map((x) => x.frames[i]?.[k]));
  res.summary[`${arm} ${cls}`] = { n: R.length, animCells: med(R.map((x) => x.anim?.cells)), kfMax: med(R.map((x) => x.anim?.kfMax)), kfTotal: med(R.map((x) => x.anim?.kfTotal)),
    taskRecalc: med(R.map((x) => x.task.RecalculateStyles)), taskMsDescr: med(R.map((x) => x.task.ms)),
    f1: { paint: f('Paint'), cellPaint: f('cellPaint'), paintPx: f('paintPx'), recalc: f('RecalculateStyles'), layout: f('Layout'), composite: f('Composite'), msDescr: f('ms') },
    f2: { paint: f('Paint', 1), cellPaint: f('cellPaint', 1), paintPx: f('paintPx', 1), msDescr: f('ms', 1) },
    layerTreeChanges: med(R.map((x) => x.layerTreeChanges)) };
}
console.log(JSON.stringify(res.summary, null, 1));
res.endedAt = new Date().toISOString();
const f = join(OUT, `rollstart-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

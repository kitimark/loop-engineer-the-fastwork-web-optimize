// morph-gpu rev 2 mechanism check in WebKit (fix-morph-gpu; adapted from fixes/morph-gpu/gates/paint-sim.mjs): per
// tween start, the Timeline work in the frame that switches the reveal on. Simulator only, counts only (Simulator ms are
// never judged, F-084; durations are kept for reading). Arms: M = best-build, R1 = rev 1 (rv-372b99478871),
// A = rev 2 without pre-promotion (newest rv2a-*), B = rev 2 (newest rv2b-*). Driver M (__fwMorphDrive, 3 cycles,
// hold 2 s), as P-092. Windows on the page clock, cut by the driver's rAF stamps as in tween-start-chrome.mjs: 'start' =
// [t(k-1), t(k)) where frame k is the first logged m > 0.001 (open) or < 0.999 (close); 'pre' and 'next' around it.
// Counted per window (RenderingFrame records that start in it, all nesting): RecalculateStyles and Layout (forced =
// nested in FunctionCall / FireAnimationFrame / TimerFire), Paint (+ area from the clip quad), Composite. Layers:
// LayerTree snapshots before the driver, in the first m = 1 hold, and in the m = 0 hold before O3 (count, memory,
// paintCount sum).
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-morph-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-morph-gpu -- node fixes/morph-gpu/rev2/tween-start-sim.mjs M,R1,A,B
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/morph-gpu/rev2'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const newest = (re) => readdirSync(SNAP).filter((d) => re.test(d)).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const dirs = { M: join(SNAP, 'best-65052c4a3902'), R1: join(SNAP, 'rv-372b99478871'), A: process.env.RV2A || newest(/^rv2a-[0-9a-f]{12}$/), B: process.env.RV2B || newest(/^rv2b-[0-9a-f]{12}$/) };
const ARMDEF = Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, { dir: d, js: hashOf(d, NODE), css: hashOf(d, CSS) }]));
const argv = process.argv.slice(2);
const ARMS = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'M,R1,A,B').split(',');
const HOLD = 2000, CYCLES = 3;
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const startedAt = new Date().toISOString(), tag = startedAt.replace(/[:.]/g, '-');
const JSREC = new Set(['FunctionCall', 'FireAnimationFrame', 'TimerFire', 'EventDispatch', 'ObserverCallback']);
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));

async function layerSnap(c, label) {
  const root = (await c.send('DOM.getDocument')).root.nodeId;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
  return { label, n: L.length, memory: L.reduce((s, l) => s + (l.memory || 0), 0), paintCount: L.reduce((s, l) => s + (l.paintCount || 0), 0) };
}
function windowCounts(recs, a, b) {
  const o = { frames: 0, styles: 0, forcedStyles: 0, layouts: 0, forcedLayouts: 0, paints: 0, paintKpx: 0, composites: 0, durMs: {} };
  const walk = (r, inJs) => {
    const d = r.endTime != null ? (r.endTime - r.startTime) * 1000 : 0;
    if (['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall', 'FireAnimationFrame'].includes(r.type)) o.durMs[r.type] = +((o.durMs[r.type] || 0) + d).toFixed(2);
    if (r.type === 'RecalculateStyles') { o.styles++; inJs && o.forcedStyles++; }
    if (r.type === 'Layout') { o.layouts++; inJs && o.forcedLayouts++; }
    if (r.type === 'Paint') { o.paints++; if (r.data?.clip) o.paintKpx += area(r.data.clip) / 1e3; }
    if (r.type === 'Composite') o.composites++;
    for (const ch of r.children || []) walk(ch, inJs || JSREC.has(r.type));
  };
  for (const r of recs) { const t = r.startTime * 1000; if (t < a || t >= b) continue; if (r.type === 'RenderingFrame') o.frames++; walk(r, false); }
  o.paintKpx = Math.round(o.paintKpx);
  return o;
}

const res = { tool: 'fix-morph-gpu rev2 tween-start-sim', builds: ARMDEF, note: 'Simulator: counts only, ms never judged (F-084)', startedAt, order: ARMS, hold: HOLD, cycles: CYCLES, runs: [] };
const f = join(OUT, `tween-start-sim-${tag}.json`);
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-sim-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    run.served = { js, css };
    if (js !== def.js || css !== def.css) { run.void = `serves ${js} / ${css}`; console.log(`VOID ${arm}: ${run.void}`); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await c.evaluate(`window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }); 'ok'`);
    await sleep(3500);
    run.navAttrs = JSON.parse(await c.evaluate(`JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'); return { rvp: n.hasAttribute('data-fw-rvp'), rv: n.hasAttribute('data-fw-rv'), dark: !!n.querySelector(':scope > .fw-rv-dark'), glass: !!document.querySelector('.fw-rv-glass'), vw: innerWidth, vh: innerHeight }; })())`));
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('rv2-sync'));
    const snaps = [await layerSnap(c, 'pre')];
    const t0 = await c.evaluate(`(() => { window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} }); return performance.now(); })()`);
    for (const [at, label] of [[1100 + 1500, 'm1-hold-0'], [1100 + 2 * HOLD + 0 - 500 + 2 * HOLD * 0 + 0, 'm0-before-O3']]) {
      const now = await c.evaluate('performance.now()');
      if (at - (now - t0) > 0) await sleep(at - (now - t0));
      snaps.push(await layerSnap(c, label));
    }
    let md = null; for (let i = 0; i < 80 && !md; i++) { md = await c.evaluate('window.__fwMD || null'); if (!md) await sleep(500); }
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await c.send('LayerTree.disable').catch(() => {});
    const syncTL = findTimeStamp(recs, 'rv2-sync');
    const offsetMs = syncTL != null ? syncTL * 1000 - syncT : null;
    run.timeline = { n: recs.length, offsetMs };
    run.snaps = snaps;
    if (!md || offsetMs == null) throw new Error(`no driver result (${!!md}) or no sync (${offsetMs})`);
    const d = JSON.parse(md), fr = d.frames;
    run.driver = { moving: d.moving, atZero: d.atZero, atOne: d.atOne };
    run.tweens = [];
    const tl = (pageMs) => pageMs + offsetMs;
    let k = 0;
    for (let q = 2; q + 1 < fr.length; q++) {
      const pm = fr[q - 1][3], m = fr[q][3];
      const kind = pm <= 0.001 && m > 0.001 ? 'open' : pm >= 0.999 && m < 0.999 ? 'close' : null;
      if (!kind) continue;
      k++;
      const w = (x, y) => windowCounts(recs, tl(fr[x][0]), tl(fr[y][0]));
      run.tweens.push({ id: (kind === 'open' ? 'O' : 'C') + k, kind, m, dt: fr[q][1], pre: w(q - 2, q - 1), start: w(q - 1, q), next: w(q, q + 1) });
    }
    writeFileSync(join(OUT, `tl-${arm}-${tag}.json`), JSON.stringify({ offsetMs, recs }));
    for (const t of run.tweens) console.log(arm, t.id, 'start', JSON.stringify({ fr: t.start.frames, s: t.start.styles, fS: t.start.forcedStyles, l: t.start.layouts, fL: t.start.forcedLayouts, p: t.start.paints, kpx: t.start.paintKpx, c: t.start.composites }), 'next', JSON.stringify({ s: t.next.styles, l: t.next.layouts, p: t.next.paints, kpx: t.next.paintKpx }));
    console.log(arm, 'layers', JSON.stringify(snaps), 'attrs', JSON.stringify(run.navAttrs));
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); res.runs.push(run); writeFileSync(f, JSON.stringify(res, null, 1)); }
}
console.log('wrote', f);

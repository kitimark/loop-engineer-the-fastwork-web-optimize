// platform-idle: what does each arm do at SCROLL START (first ~100-500 px)? Simulator (WebKit), COUNTS ONLY, no timing.
// Lead's question after the P-077 phone no-worse block (V1 worst frame 64 ms at y 43). Exploratory, not pre-registered.
// Mimics the S driver (tools/iphone.mjs PROBE): load, settle 8 s, 3 s idle, then scrollBy({top:250, behavior:'smooth'}) every
// 300 ms. Timeline runs from 1 s before the first scrollBy to 600 ms after it; segments by console.timeStamp markers:
//   pre = the last 1 s of idle, s1 = first 300 ms of scroll (0 -> ~250 px, holds the y 0-100 frames), s2 = next 300 ms.
// Also: MutationObserver over the document (childList / attribute names, per segment), animation events, getAnimations
// state at the top, and LayerTree for the whole document at the top (before the Timeline window, 3 s gap).
// Run inside a functional sim session:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner platform-idle -- \
//     node tools/sim.mjs session --functional --owner platform-idle -- node fixes/platform-idle/tools/startcount-sim.mjs <out.json> C:1 V:1 V:2 C:2
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const [outPath, ...order] = process.argv.slice(2);
const OV = { C: 'fixes/st6-rb2/overlay', V: 'fixes/platform-idle/overlay', B: null };
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const TYPES = ['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall', 'TimerFire', 'EventDispatch', 'ObserverCallback', 'FireAnimationFrame', 'ScheduleStyleRecalculation', 'InvalidateLayout'];
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/platform-idle/start'); mkdirSync(D, { recursive: true });
const STATE = `(() => { const A = document.getAnimations();
  const cls = (a) => { const t = a.effect && a.effect.target; return t ? String(t.className && t.className.baseVal != null ? t.className.baseVal : t.className).split(' ')[0] : '?'; };
  const by = {}; for (const a of A) { const k = (a.animationName || a.transitionProperty || a.constructor.name) + (a.effect && a.effect.pseudoElement || '') + ' ' + a.playState + ' @' + cls(a); by[k] = (by[k] || 0) + 1; }
  return { y: scrollY, vh: innerHeight, anims: A.length, running: A.filter((a) => a.playState === 'running').length, by,
    platformChildren: (document.querySelector('.start-selling-platform') || { querySelectorAll: () => [] }).querySelectorAll('*').length,
    glintSpans: document.querySelectorAll('.start-selling-platform-secure-network-dash-glint').length,
    sweepPaused: document.querySelectorAll('[data-sweep-paused]').length,
    platformCV: (() => { const s = document.querySelector('#platform, .start-selling-platform'); return s ? getComputedStyle(s).contentVisibility : null; })() }; })()`;
const ARM = `(() => { const w = window.__pis = { mut: [], anim: [] }; const seg = () => w.seg || 'pre0';
  new MutationObserver((ms) => { for (const m of ms) { const t = m.target; const c = t.nodeType === 1 ? String(t.className && t.className.baseVal != null ? t.className.baseVal : t.className).split(' ')[0] : '#text';
    w.mut.push([seg(), m.type, m.attributeName || (m.addedNodes.length + '+/' + m.removedNodes.length + '-'), c]); } })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const ev of ['animationstart', 'animationiteration', 'animationend', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend'])
    document.addEventListener(ev, (e) => w.anim.push([seg(), ev, e.animationName || e.propertyName || '', String(e.target.className && e.target.className.baseVal != null ? e.target.className.baseVal : e.target.className).split(' ')[0] + (e.pseudoElement || '')]), true);
  return 'armed'; })()`;
const RUN = `(async () => { const w = window.__pis, sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const ys = [];
  let on = true; const loop = () => { ys.push([Math.round(performance.now()), Math.round(scrollY), w.seg]); if (on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  w.seg = 'pre'; console.timeStamp('pi-pre'); await sleep(1000);
  w.seg = 's1'; console.timeStamp('pi-s1'); window.scrollBy({ top: 250, behavior: 'smooth' }); await sleep(300);
  w.seg = 's2'; console.timeStamp('pi-s2'); window.scrollBy({ top: 250, behavior: 'smooth' }); await sleep(300);
  w.seg = 'post'; console.timeStamp('pi-end'); on = false; await sleep(50);
  const firstOver100 = ys.find((r) => r[1] > 100);
  w.res = { ys: ys.filter((r) => r[2] !== 'pre'), firstOver100, y: scrollY }; })(), 'started'`;
for (const L of order) {
  const [arm, rep] = L.split(':');
  const st = join(D, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const sargs = [join(WT, 'tools/serve.mjs'), '--root', 'site-pretty', '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'];
  if (OV[arm]) sargs.push('--overlay', join(WT, OV[arm]));
  const p = spawn(process.execPath, sargs, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), engine: 'sim', tool: 'fixes/platform-idle/tools/startcount-sim.mjs', startedAt: new Date().toISOString() };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await c.evaluate('scrollTo(0, 0)');
    await sleep(5000); // settle part 1 (the S driver settles 8 s; LayerTree below, then 3 s more)
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    load.top = await c.evaluate(STATE);
    try {
      await c.send('LayerTree.enable');
      const doc = await c.send('DOM.getDocument', { depth: 1 });
      const body = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'body' });
      const Ls = (await c.send('LayerTree.layersForNode', { nodeId: body.nodeId })).layers || [];
      const plat = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.start-selling-platform' });
      const Lp = plat.nodeId ? ((await c.send('LayerTree.layersForNode', { nodeId: plat.nodeId })).layers || []) : [];
      load.layersTop = { doc: Ls.length, docMemory: Ls.reduce((a, l) => a + (l.memory || 0), 0), platform: Lp.length, platformMemory: Lp.reduce((a, l) => a + (l.memory || 0), 0),
        platformLayers: Lp.map((l) => ({ w: l.bounds && l.bounds.width, h: l.bounds && l.bounds.height, mem: l.memory, paintCount: l.paintCount, composited: l.compositedBounds ? 1 : 0 })) };
      await c.send('LayerTree.disable').catch(() => {});
    } catch (e) { load.layersTop = { error: String(e.message || e) }; }
    await c.evaluate(ARM);
    await sleep(2000); // settle part 2: 5 + 2 + 1 (pre) = 8 s before the first scrollBy, as the S driver's 8 + 3
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    await c.send('Timeline.start', { maxCallStackDepth: 0 });
    await c.evaluate(RUN); // WebKit ignores awaitPromise (tools/lib/wip.mjs): the page stores its result
    await sleep(2000);
    load.scroll = await c.evaluate('window.__pis.res || null');
    await c.send('Timeline.stop'); await sleep(1000);
    // segment records by the TimeStamp markers
    const flat = []; const walk = (r, d) => { if (!r) return; flat.push([r, d]); for (const ch of r.children || []) walk(ch, d + 1); };
    for (const r of recs) walk(r, 0);
    const marks = {}; for (const [r] of flat) if (r.type === 'TimeStamp' && r.data && /^pi-/.test(r.data.message || '')) marks[r.data.message] = r.startTime;
    load.marks = marks;
    const edges = [['pre', 'pi-pre', 'pi-s1'], ['s1', 'pi-s1', 'pi-s2'], ['s2', 'pi-s2', 'pi-end']];
    load.segments = {};
    for (const [name, a, b] of edges) {
      const t0 = marks[a], t1 = marks[b];
      const n = Object.fromEntries(TYPES.map((k) => [k, 0])); const paints = [];
      if (t0 != null && t1 != null) for (const [r] of flat) if (r.startTime >= t0 && r.startTime < t1 && n[r.type] != null) {
        n[r.type]++;
        if (r.type === 'Paint' && r.data) paints.push(r.data.clip ? r.data.clip : [r.data.x, r.data.y, r.data.width, r.data.height]);
      }
      load.segments[name] = { ms: t0 != null && t1 != null ? Math.round((t1 - t0) * 1000) : null, ...n, paints: paints.slice(0, 40) };
    }
    const w = await c.evaluate('({ mut: window.__pis.mut, anim: window.__pis.anim })');
    const agg = (rows) => { const o = {}; for (const r of rows) { const k = r.join(' | '); o[k] = (o[k] || 0) + 1; } return o; };
    load.mutations = agg(w.mut.filter((r) => r[0] !== 'pre0')); load.animEvents = agg(w.anim.filter((r) => r[0] !== 'pre0'));
    load.after = await c.evaluate(STATE);
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  const S = load.segments || {};
  console.log(arm, rep, JSON.stringify(load.served), load.void || '', Object.entries(S).map(([k, v]) => `${k}(${v.ms}ms) RF${v.RenderingFrame} RS${v.RecalculateStyles} L${v.Layout} P${v.Paint} C${v.Composite} FC${v.FunctionCall} TF${v.TimerFire} ED${v.EventDispatch} OC${v.ObserverCallback}`).join(' | '),
    'layersTop', JSON.stringify(load.layersTop && { doc: load.layersTop.doc, platform: load.layersTop.platform }), 'mut', Object.values(load.mutations || {}).reduce((a, b) => a + b, 0), 'animEv', Object.values(load.animEvents || {}).reduce((a, b) => a + b, 0));
}

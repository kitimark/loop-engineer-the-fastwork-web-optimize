// end-morph step A (fix-end-morph; lead GO 2026-10-05): which layers do Safari toolbar steps repaint in the end zone,
// Simulator (WebKit), COUNTS ONLY (no timing number is read or kept). Per arm (overlay dir[@css]) and position (closed:
// above the zone, #platform in view; open: the page end, m = 1):
//   1. place the page (instant scroll, wait), LayerTree paintCount per composited layer, the viewport heights;
//   2. disconnect, run the toolbar strokes with `sim.mjs gesture fixes/end-morph/gestures/em-steps-v1.json --count-only`
//      (WDA-sim touches: Safari's toolbar shows/hides; its COUNT_ONLY line gives the toolbar transitions), reconnect,
//      paintCount again;
//   3. control: the same scroll distances by rAF-stepped scrollTo (no touch, so no toolbar change), paintCount again.
// Output: per layer the paintCount delta in the stroke run and in the control; the difference is what the toolbar steps
// (and touch scrolling) add. Run inside a functional Simulator session, one arm per shared slot:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-end-morph -- \
//     node tools/sim.mjs session --functional --owner fix-end-morph -- node fixes/end-morph/em-step-sim.mjs --arm <dir>[@css] [--pos closed,open]
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [DIR, CSSF] = (arg('--arm') || '').split('@');
if (!DIR) throw new Error('--arm <abs overlay dir>[@css]');
const POS = arg('--pos', 'closed,open').split(',');
const GESTURE = join(WT, 'fixes/end-morph/gestures/em-steps-v1.json');
const OUT = join(WT, 'out/end-morph'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARM = basename(DIR.replace(/\/overlay\/?$/, '')) + (CSSF ? '@' + basename(CSSF) : '');
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  const p = document.querySelector('.start-selling-platform'); const h = document.querySelector('header.start-selling-top-nav');
  return { t, max, ih: innerHeight, vvh: window.visualViewport ? Math.round(visualViewport.height * 100) / 100 : null, y: Math.round(scrollY), endStart: max - t,
    msH: p ? p.style.getPropertyValue('--fw-ms-h') : null, pTop: p ? Math.round(p.getBoundingClientRect().top * 1000) / 1000 : null, m: h ? h.style.getPropertyValue('--morph') : null,
    pVis: p ? getComputedStyle(p).visibility : null }; })())`;
const CTRL = (dy) => `(() => { const y0 = scrollY, n = 23; let k = 0; window.__esDone = 0; const f = () => { k++; window.scrollTo({ top: Math.round(y0 + ${dy} * k / n), behavior: 'instant' }); k < n ? requestAnimationFrame(f) : (window.__esDone = 1); }; requestAnimationFrame(f); return 1; })()`;

const res = { tool: 'fixes/end-morph/em-step-sim.mjs (fix-end-morph)', arm: ARM, gesture: GESTURE, startedAt: new Date().toISOString(), positions: {} };
const wda = spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'wda', 'start'], { encoding: 'utf8' });
res.wdaStart = { status: wda.status, tail: (wda.stdout + wda.stderr).trim().split('\n').slice(-2) };
console.log('wda start', JSON.stringify(res.wdaStart));
const st = join(OUT, `serve-ess-${process.pid}.json`); rmSync(st, { force: true });
const srv = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', DIR, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
let c = null;
try {
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  const url = `http://localhost:${s.port}/`;
  res.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
  spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(2500);
  const connect = async () => { c = await openTab(`localhost:${s.port}`); await c.send('LayerTree.enable'); return c; };
  await connect();
  for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
  await sleep(2000);
  if (CSSF) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'em-arm'; s.textContent = ${JSON.stringify(readFileSync(CSSF, 'utf8'))}; document.head.appendChild(s); return 1; })()`);
  for (const f of [0.2, 0.4, 0.6, 0.8, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
  const names = new Map();
  const nameOf = async (l) => {
    if (l.pseudoElement) return `::${l.pseudoElement}`;
    if (l.isAnonymous) return '(anon)';
    if (!l.nodeId) return '(none)';
    let n = '?';
    try {
      const o = (await c.send('DOM.resolveNode', { nodeId: l.nodeId })).object;
      n = (await c.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: `function () { const k = typeof this.className === 'string' ? this.className : (this.className && this.className.baseVal) || ''; return (this.nodeName || '').toLowerCase() + (this.id ? '#' + this.id : '') + (k ? '.' + k.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : ''); }`, returnByValue: true })).result.value;
    } catch {}
    return n;
  };
  const layers = async () => {
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
    const out = new Map();
    for (const l of L) out.set(l.layerId, { name: await nameOf(l), pc: l.paintCount || 0, w: Math.round(l.bounds?.width || 0), h: Math.round(l.bounds?.height || 0) });
    return out;
  };
  // LayerTree layer ids are per inspector session (a reconnect gives every layer a new id) while paintCount is the
  // layer's lifetime count. So match by id first, then by node name + size, then by a unique node name; only a layer
  // with no match is new (its d is its lifetime count). (Fixes the first version, whose stroke counts were lifetime
  // counts: F-299 refuted.)
  const diff = (a, b) => {
    const out = [], used = new Set();
    const key = (l) => `${l.name}|${l.w}x${l.h}`;
    const byKey = new Map(), byName = new Map();
    for (const [id, l] of a) { if (!byKey.has(key(l))) byKey.set(key(l), []); byKey.get(key(l)).push(id); if (!byName.has(l.name)) byName.set(l.name, []); byName.get(l.name).push(id); }
    let viaId = 0, viaKey = 0, viaName = 0;
    const take = (ids) => { const id = (ids || []).find((x) => !used.has(x)); if (id !== undefined) used.add(id); return id; };
    const pending = [];
    for (const [id, l] of b) if (a.has(id) && !used.has(id)) { used.add(id); viaId++; pending.push([l, a.get(id)]); } else pending.push([l, null]);
    for (const p of pending) if (!p[1]) { const id = take(byKey.get(key(p[0]))); if (id !== undefined) { p[1] = a.get(id); viaKey++; } }
    for (const p of pending) if (!p[1]) { const ids = byName.get(p[0].name) || []; if (ids.length === 1) { const id = take(ids); if (id !== undefined) { p[1] = a.get(id); viaName++; } } }
    for (const [l, m] of pending) { const d = l.pc - (m?.pc || 0); if (d > 0 || !m) out.push({ layer: l.name, d, isNew: !m, w: l.w, h: l.h }); }
    let gone = 0; for (const id of a.keys()) if (!used.has(id)) gone++;
    return { nBefore: a.size, nAfter: b.size, match: { viaId, viaKey, viaName }, gone, total: out.reduce((x, y) => x + y.d, 0), painted: out.sort((x, y) => y.d - x.d).slice(0, 16) };
  };
  let g = JSON.parse(await c.evaluate(GEO));
  if (!g.t) throw new Error('no .fw-ms-end (7d off)');
  res.geo0 = g;
  for (const pos of POS) {
    const r = (res.positions[pos] = {});
    const y = pos === 'open' ? g.max : g.endStart - Math.round(0.3 * g.ih);
    await c.evaluate(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(pos === 'open' ? 2500 : 1500);
    r.before = JSON.parse(await c.evaluate(GEO));
    const A0 = await layers();
    // self-check of the cross-session matching: reconnect with no gesture; r.reconnect should be ~0 paints, 0 new
    try { c.close(); } catch {} c = null;
    await sleep(800); await connect(); await sleep(1500);
    const A = await layers();
    r.reconnect = diff(A0, A);
    try { c.close(); } catch {} c = null;
    const gr = spawnSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'gesture', GESTURE, '--count-only', '--label', `em-${ARM}-${pos}`], { encoding: 'utf8', timeout: 150000 });
    const line = (gr.stdout || '').split('\n').find((x) => x.startsWith('COUNT_ONLY '));
    r.gesture = { status: gr.status, counts: line ? JSON.parse(line.slice(11)) : null, tail: line ? undefined : ((gr.stdout || '') + (gr.stderr || '')).trim().split('\n').slice(-4) };
    await sleep(800);
    await connect(); await sleep(1500);
    r.afterGesture = JSON.parse(await c.evaluate(GEO));
    const B = await layers();
    r.strokes = diff(A, B);
    // control: the same scroll distances without touch (no toolbar change); start where the page was placed
    await c.evaluate(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(pos === 'open' ? 2500 : 1500);
    const B2 = await layers();
    r.placeAgain = diff(B, B2);
    for (let k = 0; k < 4; k++) for (const dy of [-90, 90]) {
      await c.evaluate(CTRL(dy));
      for (let q = 0; q < 40 && !(await c.evaluate('window.__esDone || 0')); q++) await sleep(50);
      await sleep(1100);
    }
    r.afterControl = JSON.parse(await c.evaluate(GEO));
    const C = await layers();
    r.control = diff(B2, C);
    const show = (d) => JSON.stringify(d.painted.slice(0, 8).map((x) => `${x.layer}${x.isNew ? '*' : ''}:${x.d} ${x.w}x${x.h}`));
    console.log(ARM, pos, 'toolbar transitions', r.gesture.counts?.toolbar?.transitions ?? JSON.stringify(r.gesture.tail), '| vvh', r.before.vvh, '->', r.afterGesture.vvh, '| msH', r.before.msH, 'pTop', r.before.pTop, '->', r.afterGesture.pTop);
    console.log('  reconnect check total', r.reconnect.total, 'match', JSON.stringify(r.reconnect.match), 'gone', r.reconnect.gone, show(r.reconnect));
    console.log('  strokes total', r.strokes.total, 'match', JSON.stringify(r.strokes.match), 'gone', r.strokes.gone, show(r.strokes));
    console.log('  control total', r.control.total, show(r.control));
  }
} catch (e) { res.error = String(e.stack || e.message || e); console.log(ARM, 'error', res.error); }
finally { try { c?.close(); } catch {} srv.kill(); rmSync(st, { force: true }); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `em-step-sim-${ARM}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

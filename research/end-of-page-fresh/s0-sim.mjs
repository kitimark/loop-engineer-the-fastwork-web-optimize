// S0 (arch-end-fresh, research/end-of-page-fresh/README.md §4): does keeping the CM layer tree built stop the per-open
// layer build, without rest or page-wide cost? iOS Simulator Safari, WDA finger strokes, counts only (Simulator ms are
// never judged, F-084). Arms are overlay dirs (frozen builds in this worktree's out/s0/). Per arm, one page load:
//   1. census pass: the page brought to endStart - 250 without passing the end zone, at rest 1.5 s; then 4 open/close
//      WDA strokes. LayerTree.layersForNode(document) at rest before the first open (L0), held open after each open
//      (O1..O4, 1.6 s after the stroke) and closed after each close (C1..C4). Per open k: layers new against the state
//      before it (L0 or C(k-1)), and layers gone at the close. Layer ids are per inspector session (F-300): one session.
//   2. segment pass (same page, after the cycles, so A0's tree is built and c3b-a's is torn down): Timeline with
//      per-segment marks: S-0.5 (3 s rest at m -0.5), S0 (3 s rest at m 0), Trest (2 s rest at y 600, top of the page),
//      T (60 rAF scroll steps y 600 -> 3000). Per segment: frames, RecalculateStyles / Layout in the rendering step and
//      forced in script, Paint, Composite (n, Simulator ms as rank only).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner arch-end-fresh -- \
//     node tools/sim.mjs session --functional --owner arch-end-fresh -- sh -c 'node tools/sim.mjs wda start && node research/end-of-page-fresh/s0-sim.mjs A0=out/s0/a0 BA=out/s0/c3ba'
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const WT = join(HERE, '../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const wda = await import(join(WT, 'tools/lib/wda.mjs')); const simlib = await import(join(WT, 'tools/lib/sim.mjs'));
const arms = process.argv.slice(2).filter((a) => a.includes('='));
const S = await wda.createSession({ base: `http://127.0.0.1:${simlib.ports().wda}`, simulator: true });
const stroke = (y0, y1, ms) => ({ actions: [{ type: 'pointer', id: 'f1', parameters: { pointerType: 'touch' }, actions: [
  { type: 'pointerMove', duration: 0, x: 215, y: y0 }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 30 },
  { type: 'pointerMove', duration: ms, x: 215, y: y1 }, { type: 'pointerUp', button: 0 }] }] });
const OUT = join(WT, 'out/s0/runs'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const isJs = (t) => /^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|ObserverCallback|EvaluateScript)$/.test(t);
const ms = (x) => (((x.endTime ?? x.startTime) - x.startTime) * 1000);
const marks = (r) => { const out = []; const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message) out.push(x.data.message); st.push(...(x.children || [])); } return out; };
const zero = () => ({ frames: 0, Composite: 0, nComposite: 0, Layout: 0, nLayout: 0, StyleR: 0, nStyleR: 0, StyleJ: 0, nStyleJ: 0, LayoutJ: 0, nLayoutJ: 0, Paint: 0, nPaint: 0 });
function cost(r, o) {
  o.frames++;
  const walk = (x, js) => {
    const d = ms(x);
    if (x.type === 'Composite') { o.Composite += d; o.nComposite++; }
    if (x.type === 'Paint') { o.Paint += d; o.nPaint++; }
    if (x.type === 'Layout') { if (js) { o.LayoutJ += d; o.nLayoutJ++; } else { o.Layout += d; o.nLayout++; } }
    if (x.type === 'RecalculateStyles') { if (js) { o.StyleJ += d; o.nStyleJ++; } else { o.StyleR += d; o.nStyleR++; } }
    for (const ch of x.children || []) walk(ch, js || isJs(x.type));
  };
  walk(r, false);
}
const fmt = (o) => `frames ${o.frames} | style ${o.nStyleR} (${o.StyleR.toFixed(1)}) forced ${o.nStyleJ} | layout ${o.nLayout} (${o.Layout.toFixed(1)}) forced ${o.nLayoutJ} | paint ${o.nPaint} (${o.Paint.toFixed(1)}) | composite ${o.nComposite} (${o.Composite.toFixed(1)})`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : innerHeight; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t, cm: document.documentElement.classList.contains('fw-cm'), keep: document.documentElement.classList.contains('fw-cm-keep') }; })()`;
const STATE = `(() => { const h = document.querySelector('header.start-selling-top-nav'); const e = document.querySelector('.fw-ms-end'); const t = e.offsetHeight, max = document.documentElement.scrollHeight - innerHeight; return { m: +((scrollY - (max - t)) / t).toFixed(3), morph: h.classList.contains('is-morphing'), keep: document.documentElement.classList.contains('fw-cm-keep'), c0: getComputedStyle(document.querySelector('[data-fw-cm="c0"]') || document.body).display }; })()`;
async function approach(c, stop) {
  await c.evaluate(`(window.__ap = 0, (() => { let y = 0; const stop = ${stop}; const step = () => { y = Math.min(y + 400, stop); window.scrollTo({ top: y, behavior: 'instant' }); y < stop ? setTimeout(step, 60) : setTimeout(() => (window.__ap = 1), 2000); }; step(); })(), 1)`);
  for (let i = 0; i < 100 && !(await c.evaluate('window.__ap')); i++) await sleep(200);
}
const res = { tool: 'research/end-of-page-fresh/s0-sim.mjs', stamp: STAMP, arms: {} };
try {
  for (const a of arms) {
    const [label, dir] = [a.slice(0, a.indexOf('=')), resolve(WT, a.slice(a.indexOf('=') + 1))];
    const st = join(OUT, `serve-${label}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = null; const row = { dir };
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await sleep(500);
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', `http://localhost:${s.port}/?r=${Date.now()}`], { stdio: ['ignore', 'ignore', 'inherit'] });
      await sleep(1500);
      c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
      await sleep(2500);
      const g0 = await c.evaluate(GEO);
      await approach(c, g0.endStart - 2 * g0.t);
      const g = await c.evaluate(GEO);
      await c.evaluate(`(window.scrollTo({ top: ${g.endStart - 250}, behavior: 'instant' }), 1)`); await sleep(1500);
      row.geo = g; row.before = await c.evaluate(STATE);
      // 1. census
      await c.send('LayerTree.enable').catch(() => {});
      const docId = (await c.send('DOM.getDocument', {})).root.nodeId;
      const census = async () => { const ls = (await c.send('LayerTree.layersForNode', { nodeId: docId })).layers || []; return { ls, ids: new Set(ls.map((l) => l.layerId)), n: ls.length, mb: +(ls.reduce((x, l) => x + (l.memory || 0), 0) / 1e6).toFixed(1) }; };
      const L0 = await census(); row.L0 = { n: L0.n, mb: L0.mb };
      row.cycles = []; let prevClosed = L0;
      for (let k = 1; k <= 4; k++) {
        await S.actions(stroke(650, 300, 500)); await sleep(1600);
        const O = await census(); const so = await c.evaluate(STATE);
        await S.actions(stroke(300, 650, 500)); await sleep(1800);
        const C = await census(); const sc = await c.evaluate(STATE);
        const made = [...O.ids].filter((x) => !prevClosed.ids.has(x)).length, gone = [...O.ids].filter((x) => !C.ids.has(x)).length;
        const madeL = O.ls.filter((l) => !prevClosed.ids.has(l.layerId)); const desc = [];
        if (k <= 2) for (const l of madeL) { let cls = '?'; try { if (l.nodeId) { const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId }); const v = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { return this.nodeType === 1 ? (this.tagName.toLowerCase() + "." + String(this.className && this.className.baseVal !== undefined ? this.className.baseVal : this.className).trim().split(/\\s+/).slice(0, 2).join(".") + (this.dataset && this.dataset.fwCm ? "[" + this.dataset.fwCm + "]" : "")) : this.nodeName; }', returnByValue: true }); cls = v.result?.value ?? '?'; } } catch {} desc.push(`${cls}${l.pseudoElement ? '::' + l.pseudoElement : ''} ${Math.round(l.bounds?.width ?? 0)}x${Math.round(l.bounds?.height ?? 0)} ${((l.memory || 0) / 1e6).toFixed(2)} MB`); }
        desc.length && console.log(`${label} cycle ${k} made at open: ${desc.join(' | ')}`);
        row.cycles.push({ k, madeDesc: desc, open: { n: O.n, mb: O.mb, ...so }, closed: { n: C.n, mb: C.mb, ...sc }, madeAtOpen: made, goneAtClose: gone });
        console.log(`${label} cycle ${k}: open m ${so.m} morph ${so.morph} keep ${so.keep} c0 ${so.c0} | ${O.n} layers ${O.mb} MB | made at open ${made} | closed m ${sc.m} ${C.n} layers ${C.mb} MB | gone at close ${gone}`);
        prevClosed = C;
      }
      await c.send('LayerTree.disable').catch(() => {});
      // 2. segments
      const Y = (m) => Math.round(g.endStart + m * g.t);
      const plan = [['J', Y(-0.5)], ['S-0.5', 3000], ['J', Y(0)], ['S0', 3000], ['J', 600], ['Trest', 2000], ['T', 600, 3000, 60]];
      const recs = []; const h = (m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); }; c.on(h);
      for (const [k2, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(k2, prm);
      await c.evaluate(`(window.__sd = 0, (async () => { const raf = () => new Promise((r) => requestAnimationFrame(r)); const wait = (t) => new Promise((r) => setTimeout(r, t));
        for (const s of ${JSON.stringify(plan)}) { await raf(); if (s[0] === 'J') { window.scrollTo({ top: s[1], behavior: 'instant' }); await raf(); await raf(); await wait(300); continue; }
          performance.mark('seg:' + s[0]); if (s.length === 4) { for (let i = 1; i <= s[3]; i++) { window.scrollTo({ top: Math.round(s[1] + (s[2] - s[1]) * i / s[3]), behavior: 'instant' }); await raf(); } } else await wait(s[1]); performance.mark('seg:x'); }
        window.__sd = 1; })(), 1)`);
      for (let i = 0; i < 240 && !(await c.evaluate('window.__sd')); i++) await sleep(250);
      row.after = await c.evaluate(STATE);
      await sleep(2500); await c.send('Timeline.stop').catch(() => {}); await sleep(1000);
      recs.sort((x, y) => x.startTime - y.startTime);
      const seg = {}; let cur = 'x';
      for (const r of recs) { const mk = marks(r).filter((x) => x.startsWith('seg:')); if (mk.length) cur = mk[mk.length - 1].slice(4); if (r.type === 'RenderingFrame' && cur !== 'x') cost(r, (seg[cur] ||= zero())); }
      row.seg = seg;
      for (const [k2, o] of Object.entries(seg)) console.log(`${label} ${k2.padEnd(6)} ${fmt(o)}`);
      console.log(`${label} after: ${JSON.stringify(row.after)}`);
    } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
    finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms[label] = row;
  }
} finally { try { S && (await S.close()); } catch {} }
const f = join(OUT, `s0-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);

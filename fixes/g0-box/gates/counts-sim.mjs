// g0-box (fix-g0-box): copied from fixes/g0-gpu/gates/counts-sim.mjs (fix-g0-gpu), plus 'new vs the previous census'
// (layers built per open/close) and out/g0box paths. g0-gpu gates 2 and 3 on the iOS Simulator: per-frame work of the end-of-page 680 ms tween and at rest,
// base A (v0) against candidate V (g0.1), COUNTS ONLY (Simulator ms are a rank, never judged, F-084). Scaffold from
// research/end-of-page-fresh/s0-sim.mjs (arch-end-fresh): Timeline records per RenderingFrame, LayerTree census.
// Per arm, one page load at the page's end (the original's hold condition true), then:
//   1. Timeline pass, real time, real rAF: segments rest0 (1.5 s at m 0), open (a synthetic wheel +100 on window, the
//      original's capture listener; 900 ms), rest1 (1.5 s at m 1), close (wheel -100, 900 ms), rest2 (1.5 s at m 0).
//      Per segment: frames, RecalculateStyles / Layout in the rendering step and forced in script, Paint (n and the
//      painted rects), Composite. The first three frames after each trigger are listed one by one (K8: work moved
//      into the first frame, F-324 / F-326).
//   2. Census pass: LayerTree.layersForNode(document) at rest m 0 (L0), mid-open (250 ms after the trigger), open at
//      rest, mid-close, closed; layers new against L0 (named) and the g0 animations still alive at rest (gate 3).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-g0-gpu -- node fixes/g0-gpu/gates/counts-sim.mjs A=out/g0-gpu/empty V=fixes/g0-gpu/overlay
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n');
  process.exit(0);
}
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const arms = process.argv.slice(2).filter((a) => a.includes('='));
const OUT = join(WT, 'out/g0box/counts'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const isJs = (t) => /^(FunctionCall|EventDispatch|TimerFire|FireAnimationFrame|ObserverCallback|EvaluateScript)$/.test(t);
const ms = (x) => (((x.endTime ?? x.startTime) - x.startTime) * 1000);
const marks = (r) => { const out = []; const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message) out.push(x.data.message); st.push(...(x.children || [])); } return out; };
const zero = () => ({ frames: 0, Composite: 0, nComposite: 0, Layout: 0, nLayout: 0, StyleR: 0, nStyleR: 0, StyleJ: 0, nStyleJ: 0, LayoutJ: 0, nLayoutJ: 0, Paint: 0, nPaint: 0, paintPx: 0, rects: {} });
const rectOf = (x) => { const c = x.data?.clip; if (Array.isArray(c) && c.length >= 8) { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))]; } if (x.data && 'width' in x.data) return [Math.round(x.data.width), Math.round(x.data.height)]; return null; };
function cost(r, o) {
  o.frames++;
  const walk = (x, js) => {
    const d = ms(x);
    if (x.type === 'Composite') { o.Composite += d; o.nComposite++; }
    if (x.type === 'Paint') { o.Paint += d; o.nPaint++; const rc = rectOf(x); if (rc) { o.paintPx += rc[0] * rc[1]; const k = rc.join('x'); o.rects[k] = (o.rects[k] || 0) + 1; } }
    if (x.type === 'Layout') { if (js) { o.LayoutJ += d; o.nLayoutJ++; } else { o.Layout += d; o.nLayout++; } }
    if (x.type === 'RecalculateStyles') { if (js) { o.StyleJ += d; o.nStyleJ++; } else { o.StyleR += d; o.nStyleR++; } }
    for (const ch of x.children || []) walk(ch, js || isJs(x.type));
  };
  walk(r, false);
  return o;
}
const top = (rects) => Object.entries(rects).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}x${n}`).join(' ');
const fmt = (o) => `frames ${o.frames} | style ${o.nStyleR} (${o.StyleR.toFixed(1)}) forced ${o.nStyleJ} | layout ${o.nLayout} (${o.Layout.toFixed(1)}) forced ${o.nLayoutJ} | paint ${o.nPaint} (${o.Paint.toFixed(1)}) ${(o.paintPx / 1e6).toFixed(2)} Mpx [${top(o.rects)}] | composite ${o.nComposite} (${o.Composite.toFixed(1)})`;
const TRIG = (dy) => `(() => { const ev = new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true }); window.dispatchEvent(ev); return ev.defaultPrevented; })()`;
const STATE = `(() => { const h = document.querySelector('header.start-selling-top-nav'); return { morph: h.style.getPropertyValue('--morph'), cls: h.className.replace(/svelte-\\w+/g, '').trim(), g0: document.getAnimations().filter((a) => a.id === 'g0').length, anims: document.getAnimations().length, y: Math.round(scrollY) }; })()`;
const res = { tool: 'fixes/g0-gpu/gates/counts-sim.mjs', stamp: STAMP, arms: {} };
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
    await c.evaluate(`(window.__wk = 0, (() => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => (window.__wk = 1), 2500); }; step(); })(), 1)`);
    for (let i = 0; i < 200 && !(await c.evaluate('window.__wk')); i++) await sleep(200);
    await c.evaluate(`(window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 1)`); await sleep(2000);
    row.before = await c.evaluate(STATE);
    // 1. Timeline pass
    const recs = []; const h = (m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); }; c.on(h);
    for (const [k2, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(k2, prm);
    await c.evaluate(`(window.__sd = 0, (async () => { const raf = () => new Promise((r) => requestAnimationFrame(r)); const wait = (t) => new Promise((r) => setTimeout(r, t));
      const plan = [['rest0', 0, 1500], ...[1, 2, 3].flatMap((c) => [['open', 100, 900], ['rest1', 0, 1200], ['close', -100, 900], ['rest2', 0, 1200]])];
      for (const [k, dy, t] of plan) { await raf(); performance.mark('seg:' + k); if (dy) { const ev = new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }); window.dispatchEvent(ev); window.__pv = (window.__pv || '') + (ev.defaultPrevented ? 'P' : 'n'); } await wait(t); }
      performance.mark('seg:x'); window.__sd = 1; })(), 1)`);
    for (let i = 0; i < 120 && !(await c.evaluate('window.__sd')); i++) await sleep(250);
    row.prevented = await c.evaluate('window.__pv');
    await sleep(1000); await c.send('Timeline.stop').catch(() => {}); await sleep(1000);
    recs.sort((x, y) => x.startTime - y.startTime);
    const seg = {}, firsts = {}, tw = {}; let cur = 'x';
    for (const r of recs) {
      const mk = marks(r).filter((x) => x.startsWith('seg:')); if (mk.length) { cur = mk[mk.length - 1].slice(4); if (cur === 'open' || cur === 'close') { tw[cur] = (tw[cur] || 0) + 1; firsts[cur + tw[cur]] = []; } }
      if (r.type === 'RenderingFrame' && cur !== 'x') { cost(r, (seg[cur] ||= zero())); if (cur === 'open' || cur === 'close') { const L = (firsts[cur + tw[cur]] ||= []); if (L.length < 3) L.push(fmt(cost(r, zero()))); } }
    }
    row.seg = seg; row.firsts = firsts; row.tweens = tw; row.after = await c.evaluate(STATE);
    for (const [k2, o] of Object.entries(seg)) console.log(`${label} ${k2.padEnd(6)} ${fmt(o)}`);
    for (const [k2, L] of Object.entries(firsts)) L.forEach((x, i) => console.log(`${label} ${k2} frame ${i + 1}: ${x}`));
    console.log(`${label} prevented ${row.prevented} after ${JSON.stringify(row.after)}`);
    // 2. Census pass
    await c.send('LayerTree.enable').catch(() => {});
    const docId = (await c.send('DOM.getDocument', {})).root.nodeId;
    const census = async () => { const ls = (await c.send('LayerTree.layersForNode', { nodeId: docId })).layers || []; return { ls, ids: new Set(ls.map((l) => l.layerId)), n: ls.length, mb: +(ls.reduce((x, l) => x + (l.memory || 0), 0) / 1e6).toFixed(1) }; };
    const name = async (l) => { let cls = '?'; try { if (l.nodeId) { const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId }); const v = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { return this.nodeType === 1 ? (this.tagName.toLowerCase() + "." + String(this.className && this.className.baseVal !== undefined ? this.className.baseVal : this.className).trim().split(/\\s+/).slice(0, 2).join(".")) : this.nodeName; }', returnByValue: true }); cls = v.result?.value ?? '?'; } } catch {} return `${cls}${l.pseudoElement ? '::' + l.pseudoElement : ''} ${Math.round(l.bounds?.width ?? 0)}x${Math.round(l.bounds?.height ?? 0)} ${((l.memory || 0) / 1e6).toFixed(2)}MB`; };
    const inPlat = async (ls) => { const out = []; for (const l of ls) { if (!l.nodeId) continue; try { const o = await c.send('DOM.resolveNode', { nodeId: l.nodeId }); const v = await c.send('Runtime.callFunctionOn', { objectId: o.object.objectId, functionDeclaration: 'function () { const e = this.nodeType === 1 ? this : this.parentElement; return !!(e && e.closest(".start-selling-platform")); }', returnByValue: true }); if (v.result?.value) { let rs = ''; try { const rr = await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId }); rs = Object.keys(rr.compositingReasons || {}).filter((k) => rr.compositingReasons[k]).join(','); } catch (e) {} out.push(`${await name(l)} {${rs}}`); } } catch (e) {} } return out; };
    let prev = null; const L0 = await census(); prev = L0; row.census = { L0: { n: L0.n, mb: L0.mb, plat: await inPlat(L0.ls) } };
    console.log(`${label} census L0: ${L0.n} layers ${L0.mb} MB | in #platform: ${row.census.L0.plat.join(' | ')}`);
    for (const [k2, dy, wait] of [['midOpen', 100, 250], ['open', 0, 1100], ['midClose', -100, 250], ['closed', 0, 1500], ['midOpen2', 100, 250], ['open2', 0, 1100], ['closed2', -100, 1500]]) {
      if (dy) await c.evaluate(TRIG(dy));
      await sleep(wait);
      const C = await census(); const made = C.ls.filter((l) => !L0.ids.has(l.layerId)); const desc = [];
      const grp = {}; for (const l of made) { let nm = await name(l); if (!/span\.face/.test(nm)) { try { const rr = await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId }); nm += ' {' + Object.keys(rr.compositingReasons || {}).filter((k) => rr.compositingReasons[k]).join(',') + '}'; } catch (e) { nm += ' {?}'; } } const k = nm.replace(/ \d+x\d+ [\d.]+MB( \{.*\})?$/, ''); (grp[k] ||= { n: 0, mb: 0, ex: nm }).n++; grp[k].mb += (l.memory || 0) / 1e6; } for (const [k, g] of Object.entries(grp)) desc.push(`${g.n}x ${g.ex} (${g.mb.toFixed(2)} MB)`);
      const madePrev = C.ls.filter((l) => !prev.ids.has(l.layerId)); const descPrev = []; for (const l of madePrev) descPrev.push(await name(l)); prev = C;
      row.census[k2] = { n: C.n, mb: C.mb, newVsPrev: madePrev.length, descPrev, newVsL0: made.length, madeMB: +(made.reduce((x, l) => x + (l.memory || 0), 0) / 1e6).toFixed(2), desc, state: await c.evaluate(STATE) };
      if (/closed/.test(k2)) { row.census[k2].plat = await inPlat(C.ls); console.log(`${label} census ${k2} in #platform: ${row.census[k2].plat.join(' | ')}`); }
      console.log(`${label} census ${k2}: ${C.n} layers ${C.mb} MB | new vs prev ${madePrev.length} [${descPrev.join(' ; ')}] | new vs L0 ${made.length} (${row.census[k2].madeMB} MB) ${desc.join(' | ')} | ${JSON.stringify(row.census[k2].state)}`);
    }
    await c.send('LayerTree.disable').catch(() => {});
  } catch (e) { row.error = String(e.stack || e); console.log(label, 'error', String(e.message || e)); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms[label] = row;
}
const f = join(OUT, `counts-sim-${STAMP}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('WROTE', f);

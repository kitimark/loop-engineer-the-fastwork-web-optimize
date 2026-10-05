// T-193 #5 items 3/4 split (fix-hero-exit-threaded, lead ruling 2026-10-05): a copy of fixes/morph-gpu/close/close-cause-sim.mjs
// (fix-morph-gpu) with one added step, glideopen (p 0 -> 1 over 20 rAF scrollTo, the open half of glide), output in
// out/morph-scroll/ablate. Arms are CSS ablations (dir@file.css) on v9-final + 7d: which share of the per-frame repaint during
// a finger-like open/close is the panel's relayout (fixed-size panel) vs the blur re-raster (filters off). Counts only.
// Original header follows.
// morph-gpu, PR-018's closing frame (fix-morph-gpu, lead ruling 2026-10-05; user T-146/C-049, F-241). Simulator only, counts
// only (no ms judged). Question: under PR-018 (morph-scroll: #platform sticky, the morph follows the scroll) the frame that
// closes the morph repaints ~31 rects / 2.3 Mpx even with morph-gpu rev 3's opacity cap. What repaints, and what triggers it?
// Per arm (snapshot dir), after a scroll to the end and one warm-up open/close, with WebKit Timeline and LayerTree on:
//   close     jump to p 1 (instant scrollTo, y = max - t + p*t, t = .fw-ms-end height), 1.5 s, then jump to p 0
//   open      jump to p 1 from p 0
//   setclose  at p 0 (page still): window.__navMorphSet(1), 1.5 s, then __navMorphSet(0): the morph close without a scroll
//   setopen   the same, the open half
//   toggles at m = 0 (k on, 450 ms, k off): cls (header is-morphing), dark (header is-on-dark), exp (header is-expanded),
//             scene (panel data-start-selling-scene active), fade (#platform --morph-fade 0.99), mvar (header --morph 0.001)
// Per step: paints in [change - 17 ms, change + 1200 ms] (sum; the frame with the most paints, with its paint rects), and the
// per-layer paintCount diff (LayerTree.layersForNode before/after; layers named by element class) plus the layer count.
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-morph-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-morph-gpu -- node fixes/morph-gpu/close/close-cause-sim.mjs \
//     --snap <abs dir>[@<css file>][,<abs dir>[@<css file>]] [--steps close,open,close,setclose,setopen,setclose,cls,dark,scene,fade]
// An arm "dir@file.css" injects that CSS (a <style id="cc-arm"> at the end of <head>) after load: a candidate rule tried
// without a build. glide = a gradual close: from p 1, one scrollTo per rAF over 20 frames down to p 0 (a finger-like close;
// the instant jumps of close/open are the gpu-cross-sim pattern). fade0 = #platform --morph-fade 0 -> 1 (paint on unhide?).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--snap') || '').split(',').filter(Boolean).map((x) => { const [dir, css] = x.split('@'); return { dir, css }; });
const SNAPS = ARMS.map((a) => a.dir);
if (!SNAPS.length) throw new Error('--snap <abs snapshot dir>[,<abs dir>]');
const STEPS = arg('--steps', 'close,open,close,setopen,setclose,setopen,setclose,cls,dark,scene,fade').split(',');
const OUT = join(WT, 'out/morph-scroll/ablate'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...xs) - x), h: Math.round(Math.max(...ys) - y) }; };
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  const h = document.querySelector('header.start-selling-top-nav');
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null, fade: getComputedStyle(document.querySelector('.start-selling-platform')).opacity, hdr: h ? h.className.replace(/svelte-\\w+/g, '').trim() : null }; })()`;
const HDR = `document.querySelector('header.start-selling-top-nav')`;
const PLAT = `document.querySelector('.start-selling-platform')`;
const SCENE = `document.querySelector('[data-start-selling-scene]')`;
const TOG = {
  cls: [`${HDR}.classList.add('is-morphing')`, `${HDR}.classList.remove('is-morphing')`],
  dark: [`${HDR}.classList.toggle('is-on-dark')`, `${HDR}.classList.toggle('is-on-dark')`],
  exp: [`${HDR}.classList.add('is-expanded')`, `${HDR}.classList.remove('is-expanded')`],
  scene: [`${SCENE}.setAttribute('data-start-selling-scene', 'active')`, `${SCENE}.setAttribute('data-start-selling-scene', 'paused')`],
  fade0: [`${PLAT}.style.setProperty('--morph-fade', '0')`, `${PLAT}.style.setProperty('--morph-fade', '1')`],
  fade: [`${PLAT}.style.setProperty('--morph-fade', '0.99')`, `${PLAT}.style.setProperty('--morph-fade', '1')`],
  mvar: [`(window.__ccV = [${HDR}, ...${HDR}.querySelectorAll('[style*="--morph"]')].map((e) => [e, e.style.getPropertyValue('--morph')]), window.__ccV.forEach(([e]) => e.style.setProperty('--morph', '0.001')))`,
         `window.__ccV.forEach(([e, v]) => (v === '' ? e.style.removeProperty('--morph') : e.style.setProperty('--morph', v)))`],
};

function frameStats(recs, a, b) {
  const frames = [];
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const t = r.startTime * 1000; if (t < a || t >= b) continue;
    const o = { at: +(t - a).toFixed(1), paints: 0, kpx: 0, layouts: 0, styles: 0, rects: [] };
    const walk = (x) => {
      if (x.type === 'Paint') { o.paints++; if (x.data?.clip) { const q = box(x.data.clip); o.kpx += (q.w * q.h) / 1e3; o.rects.push(q); } }
      if (x.type === 'Layout') o.layouts++;
      if (x.type === 'RecalculateStyles') o.styles++;
      for (const ch of x.children || []) walk(ch);
    };
    walk(r); o.kpx = Math.round(o.kpx); frames.push(o);
  }
  const max = frames.reduce((m, f) => (!m || f.paints > m.paints ? f : m), null);
  for (const f of frames) if (f !== max) delete f.rects;
  return { max, frames: frames.filter((f) => f.paints > 0), nFrames: frames.length, paints: frames.reduce((s, f) => s + f.paints, 0), kpx: frames.reduce((s, f) => s + f.kpx, 0), layouts: frames.reduce((s, f) => s + f.layouts, 0) };
}

const res = { tool: 'morph-scroll ablate split-sim (fix-hero-exit-threaded, from close-cause-sim)', startedAt: new Date().toISOString(), steps: STEPS, arms: [] };
for (const [i, snap] of SNAPS.entries()) {
  const armCss = ARMS[i].css ? readFileSync(ARMS[i].css, 'utf8') : null;
  const st = join(OUT, `serve-cc-${i}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', snap, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { snap: basename(snap) + (ARMS[i].css ? '@' + basename(ARMS[i].css) : ''), css: armCss, steps: [] };
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    run.files = { js: sha(readFileSync(join(snap, NODE))), css: sha(readFileSync(join(snap, CSS))) };
    if (run.served.js !== run.files.js || run.served.css !== run.files.css) throw new Error('VOID: served files differ from the snapshot');
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2000);
    if (armCss) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'cc-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
    run.armCssOn = await c.evaluate(`!!document.getElementById('cc-arm')`);
    for (const f of [0.25, 0.5, 0.75, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
    const g = await c.evaluate(GEO);
    if (!g.t) throw new Error('no .fw-ms-end: PR-018 mode is off in this build or device');
    const yAt = (q) => Math.round(g.max - g.t + q * g.t);
    const jump = async (q) => c.evaluate(`(() => { window.scrollTo({ top: ${yAt(q)}, behavior: 'instant' }); return performance.now(); })()`);
    const ev = async (expr) => c.evaluate(`(() => { ${expr}; return performance.now(); })()`);
    await jump(0); await sleep(1500);
    await jump(1); await sleep(1500); await jump(0); await sleep(1500);
    run.rest0 = await c.evaluate(GEO);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('cc-sync'));
    const names = new Map();
    const nameOf = async (l) => {
      if (l.pseudoElement) return `::${l.pseudoElement}`;
      if (l.isAnonymous) return '(anon)';
      if (!l.nodeId) return '(none)';
      if (names.has(l.nodeId)) return names.get(l.nodeId);
      let n = '?';
      try {
        const o = (await c.send('DOM.resolveNode', { nodeId: l.nodeId })).object;
        n = (await c.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: `function () { const k = typeof this.className === 'string' ? this.className : (this.className && this.className.baseVal) || ''; return (this.nodeName || '').toLowerCase() + (k ? '.' + k.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x)).slice(0, 2).join('.') : ''); }`, returnByValue: true })).result.value;
      } catch {}
      names.set(l.nodeId, n); return n;
    };
    const layers = async () => {
      const root = (await c.send('DOM.getDocument')).root.nodeId;
      const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
      return new Map(L.map((l) => [l.layerId, l]));
    };
    const diff = async (a, b) => {
      const out = [];
      for (const [id, l] of b) { const d = (l.paintCount || 0) - (a.get(id)?.paintCount || 0); if (d > 0 || !a.has(id)) out.push({ layer: await nameOf(l), d, isNew: !a.has(id), w: Math.round(l.bounds?.width || 0), h: Math.round(l.bounds?.height || 0), x: Math.round(l.bounds?.x || 0), y: Math.round(l.bounds?.y || 0) }); }
      const gone = []; for (const [id, l] of a) if (!b.has(id)) gone.push(await nameOf(l));
      return { nBefore: a.size, nAfter: b.size, painted: out.sort((x, y) => y.d - x.d), gone };
    };
    const measure = async (k, dir, expr) => {
      const a = await layers(); await sleep(150);
      const tg = await ev(expr);
      await sleep(1200);
      const b = await layers();
      run.steps.push({ k, dir, tg, after: await c.evaluate(GEO), layers: await diff(a, b) });
      await sleep(300);
    };
    for (const k of STEPS) {
      if (k === 'close') { await jump(1); await sleep(1500); await measure(k, 'close', `window.scrollTo({ top: ${yAt(0)}, behavior: 'instant' })`); }
      else if (k === 'open') { await measure(k, 'open', `window.scrollTo({ top: ${yAt(1)}, behavior: 'instant' })`); await jump(0); await sleep(1500); }
      else if (k === 'shot') { const fp = join(OUT, `shots-${STAMP}`, `${i}-${String(run.steps.length).padStart(2, '0')}-${run.steps.at(-1)?.k || 'start'}.png`); mkdirSync(join(OUT, `shots-${STAMP}`), { recursive: true }); execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', fp], { stdio: 'ignore' }); run.shots = [...(run.shots || []), { at: run.steps.length, file: fp, geo: await c.evaluate(GEO) }]; }
      else if (k === 'glide') { await jump(1); await sleep(1500); await measure(k, 'close', `(() => { const a = ${yAt(1)}, b = ${yAt(0)}; let n = 0; const st = () => { n++; window.scrollTo({ top: Math.round(a + (b - a) * Math.min(1, n / 20)), behavior: 'instant' }); if (n < 20) requestAnimationFrame(st); }; requestAnimationFrame(st); })()`); }
      else if (k === 'glideopen') { await jump(0); await sleep(1500); await measure(k, 'open', `(() => { const a = ${yAt(0)}, b = ${yAt(1)}; let n = 0; const st = () => { n++; window.scrollTo({ top: Math.round(a + (b - a) * Math.min(1, n / 20)), behavior: 'instant' }); if (n < 20) requestAnimationFrame(st); }; requestAnimationFrame(st); })()`); }
      else if (k === 'setopen') await measure(k, 'open', `window.__navMorphSet(1)`);
      else if (k === 'setclose') await measure(k, 'close', `window.__navMorphSet(0)`);
      else if (TOG[k]) { await measure(k, 'on', TOG[k][0]); await measure(k, 'off', TOG[k][1]); }
      else throw new Error('unknown step ' + k);
    }
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await c.send('LayerTree.disable').catch(() => {});
    const syncTL = findTimeStamp(recs, 'cc-sync');
    if (syncTL == null) throw new Error('no sync');
    const off = syncTL * 1000 - syncT;
    for (const sp of run.steps) sp.tl = frameStats(recs, sp.tg + off - 17, sp.tg + off + 1200);
    writeFileSync(join(OUT, `tl-cc-${i}-${STAMP}.json`), JSON.stringify({ offsetMs: off, recs }));
    for (const sp of run.steps) {
      const m = sp.tl.max;
      console.log(run.snap, sp.k.padEnd(8), sp.dir.padEnd(5), 'p', sp.after.p, '| sum', sp.tl.paints, sp.tl.kpx, 'lay', sp.tl.layouts, '| max', m ? `${m.paints}/${m.kpx} @${m.at} lay ${m.layouts}` : '-',
        '| layers', sp.layers.nBefore, '->', sp.layers.nAfter, JSON.stringify(sp.layers.painted.slice(0, 8).map((x) => `${x.layer}${x.isNew ? '*' : ''}:${x.d} ${x.w}x${x.h}`)), 'gone', JSON.stringify(sp.layers.gone.slice(0, 4)));
    }
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(run.snap, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  res.arms.push(run);
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `close-cause-sim-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

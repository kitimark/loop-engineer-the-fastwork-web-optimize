// morph-gpu: what repaints at the open start in WebKit (fix-morph-gpu, after P-098). Simulator only, counts only (ms never
// judged, F-084). Question: the first open frame repaints ~30 rects (~1.6 Mpx) in every build and on every open, warm ones
// included (tween-start-sim.mjs data). Which of the two things that change in that frame triggers it?
//   cls = the header's `is-morphing` class flip (s(E) in the template, JS ~13790)
//   var = the first --morph value above 0 (header + the __mkW targets, i.e. every element in the header with an inline --morph)
//   rv  = rev 2's data-fw-rv attribute (only builds that have it)
// Each is applied alone at m = 0 (page pinned at the end, after a driver warm-up), from a plain task (not a rAF), held 450 ms,
// then reverted; twice each. Per step: paints in the first RenderingFrame after the change and in 400 ms, and the
// per-layer paintCount diff (LayerTree.layersForNode before/after, layers named by their element class) plus the layer count.
// Controls: driver M (__fwMorphDrive) open frames before and after the toggles.
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-morph-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-morph-gpu -- node fixes/morph-gpu/rev2/open-cause-sim.mjs M,A
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/morph-gpu/rev2'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const dirs = { M: join(SNAP, 'best-65052c4a3902'), A: join(SNAP, 'rv2a-ef9d1c9d5fca'), R: join(SNAP, 'fd-e4c80db5e0a8') };
const ARMDEF = Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, { dir: d, js: hashOf(d, NODE), css: hashOf(d, CSS) }]));
const ARMS = (process.argv[2] || 'M,A').split(',');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const startedAt = new Date().toISOString(), tag = startedAt.replace(/[:.]/g, '-');
const area = (c) => (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]));

const HDR = `document.querySelector('header.start-selling-top-nav')`;
const PLAT = `document.querySelector('.start-selling-platform')`;
const STEPS = {
  cls: [`${HDR}.classList.add('is-morphing')`, `${HDR}.classList.remove('is-morphing')`],
  var: [`(window.__ocV = [${HDR}, ...${HDR}.querySelectorAll('[style*="--morph"]')].map((e) => [e, e.style.getPropertyValue('--morph')]), window.__ocV.forEach(([e]) => e.style.setProperty('--morph', '0.001')))`,
        `window.__ocV.forEach(([e, v]) => (v === '' ? e.style.removeProperty('--morph') : e.style.setProperty('--morph', v)))`],
  rv: [`${HDR}.setAttribute('data-fw-rv', '')`, `${HDR}.removeAttribute('data-fw-rv')`],
  // run 2: the two other writes of the open's first frame, S() and __osb() (JS 13272-13285): --morph-fade on #platform
  // (its filter: blur((1 - fade) * 12px) and opacity: fade; QM(m) = 1 - m / 0.55, so m = 0.0055 gives 0.99) and the root's
  // overscroll-behavior-y
  fade: [`document.querySelector('.start-selling-platform').style.setProperty('--morph-fade', '0.99')`, `document.querySelector('.start-selling-platform').style.setProperty('--morph-fade', '1')`],
  osb: [`document.documentElement.style.overscrollBehaviorY = 'none'`, `document.documentElement.style.overscrollBehaviorY = ''`],
  // run 3 (design of the fade fix): which half of the fade repaints, and whether a state set ahead of the push avoids it.
  // A token `k+` applies only the first half (stays on), `k-` only the second.
  op: [`${PLAT}.style.opacity = '0.99'`, `${PLAT}.style.opacity = ''`],
  blur: [`${PLAT}.style.filter = 'blur(0.12px)'`, `${PLAT}.style.filter = ''`],
  wc: [`${PLAT}.style.willChange = 'filter, opacity'`, `${PLAT}.style.willChange = ''`],
  pre: [`${PLAT}.style.setProperty('--morph-fade', '0.9999')`, `${PLAT}.style.setProperty('--morph-fade', '1')`],
  fadeP: [`${PLAT}.style.setProperty('--morph-fade', '0.99')`, `${PLAT}.style.setProperty('--morph-fade', '0.9999')`],
};
const ORDER = process.argv[3] ? process.argv[3].split(',') : null;

function frameStats(recs, aTL, bTL) {
  const frames = [];
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const t = r.startTime * 1000; if (t < aTL || t >= bTL) continue;
    const o = { at: +(t - aTL).toFixed(1), dur: +((r.endTime - r.startTime) * 1000).toFixed(0), paints: 0, kpx: 0, styles: 0, layouts: 0, composites: 0 };
    const walk = (x) => {
      if (x.type === 'Paint') { o.paints++; if (x.data?.clip) o.kpx += area(x.data.clip) / 1e3; }
      if (x.type === 'RecalculateStyles') o.styles++;
      if (x.type === 'Layout') o.layouts++;
      if (x.type === 'Composite') o.composites++;
      for (const ch of x.children || []) walk(ch);
    };
    walk(r); o.kpx = Math.round(o.kpx); frames.push(o);
  }
  return { first: frames[0] || null, max: frames.reduce((m, f) => (!m || f.paints > m.paints ? f : m), null), nFrames: frames.length, paints: frames.reduce((s, f) => s + f.paints, 0), kpx: frames.reduce((s, f) => s + f.kpx, 0) };
}

for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-oc-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, build: def, steps: [] };
  let c = null;
  const f = join(OUT, `open-cause-sim-${arm}-${tag}.json`);
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    run.served = { js, css };
    if (js !== def.js || css !== def.css) throw new Error(`VOID: serves ${js} / ${css}`);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await c.evaluate(`window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }); 'ok'`);
    await sleep(3500);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await c.send('LayerTree.enable');
    const syncT = await c.evaluate(timelineSyncJs('oc-sync'));
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
      for (const [id, l] of b) { const d = (l.paintCount || 0) - (a.get(id)?.paintCount || 0); if (d > 0 || !a.has(id)) out.push({ layer: await nameOf(l), d, isNew: !a.has(id), w: Math.round(l.bounds?.width || 0), h: Math.round(l.bounds?.height || 0) }); }
      const gone = []; for (const [id, l] of a) if (!b.has(id)) gone.push(await nameOf(l));
      return { nBefore: a.size, nAfter: b.size, painted: out.sort((x, y) => y.d - x.d), gone };
    };
    const drive = async (cycles, label) => {
      const t0 = await c.evaluate(`(() => { window.__fwMorphDrive({ hold: 1500, cycles: ${cycles} }); return performance.now(); })()`);
      let md = null; for (let i = 0; i < 60 && !md; i++) { await sleep(500); md = await c.evaluate('window.__fwMD || null'); }
      if (!md) throw new Error('no driver result ' + label);
      const fr = JSON.parse(md).frames, opens = [];
      for (let q = 1; q < fr.length; q++) if (fr[q - 1][3] <= 0.001 && fr[q][3] > 0.001) opens.push({ prevT: fr[q - 1][0], t: fr[q][0], dt: fr[q][1] });
      return { label, t0, opens };
    };
    run.drives = [await drive(1, 'warm-up')];
    await sleep(800);
    const order = ORDER || ['cls', 'var', 'cls', 'var', ...(await c.evaluate(`!!document.querySelector('.fw-rv-glass') || /data-fw-rv/.test([...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join(''); } catch { return ''; } }).join(''))`) ? ['rv', 'rv'] : [])];
    for (const tok of order) {
      const k = tok.replace(/[+-]$/, ''), half = tok.slice(k.length);
      const parts = [['on', STEPS[k][0]], ['off', STEPS[k][1]]].filter(([d]) => !half || (half === '+' ? d === 'on' : d === 'off'));
      for (const [dir, expr] of parts) {
        const a = await layers();
        await sleep(150);
        const tg = await c.evaluate(`(() => { ${expr}; return performance.now(); })()`);
        await sleep(450);
        const b = await layers();
        run.steps.push({ k, dir, tg, layers: await diff(a, b) });
        await sleep(300);
      }
    }
    run.drives.push(await drive(2, 'after'));
    await sleep(500);
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await c.send('LayerTree.disable').catch(() => {});
    const syncTL = findTimeStamp(recs, 'oc-sync');
    if (syncTL == null) throw new Error('no sync');
    const off = syncTL * 1000 - syncT, tl = (x) => x + off;
    for (const sp of run.steps) sp.tl = frameStats(recs, tl(sp.tg) - 17, tl(sp.tg + 400));
    for (const d of run.drives) for (const o of d.opens) o.tl = frameStats(recs, tl(o.prevT) - 17, tl(o.t + 200));
    writeFileSync(join(OUT, `tl-oc-${arm}-${tag}.json`), JSON.stringify({ offsetMs: off, recs }));
    for (const d of run.drives) for (const o of d.opens) console.log(arm, 'drive', d.label, 'open dt', o.dt, 'first', JSON.stringify(o.tl.first), 'max', JSON.stringify(o.tl.max), 'sum', o.tl.paints, o.tl.kpx);
    for (const sp of run.steps) console.log(arm, sp.k, sp.dir, "max", JSON.stringify(sp.tl.max), 'sum', sp.tl.paints, sp.tl.kpx, 'layers', sp.layers.nBefore, '->', sp.layers.nAfter, 'painted', sp.layers.painted.length, JSON.stringify(sp.layers.painted.slice(0, 8).map((x) => `${x.layer}${x.isNew ? '*' : ''}:${x.d}`)), 'gone', JSON.stringify(sp.layers.gone.slice(0, 5)));
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); writeFileSync(f, JSON.stringify(run, null, 1)); console.log('wrote', f); }
}

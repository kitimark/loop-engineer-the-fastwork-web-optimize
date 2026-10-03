// carousel-leaver Simulator probe (P-086 (1) Sim half and (4)); counts and attribution only, Simulator ms never count.
// Per arm: serve the snapshot (immutable copy) with --no-cache, check the served hashes, open it in the Simulator's Safari,
// scroll so the avatar carousel sits mid-view, settle, then
//   window T (WIN ms): WebKit Timeline (F-047 order) + a MutationObserver on the carousel. Every Layout record with its
//     root size; "view-rooted" = root >= 400 px wide and >= innerHeight - 2 tall (pill-swap simprobe rule) or no root;
//     "carousel-rooted" = root 104x32. Slides = .is-sliding adds (st5 builds) or img.is-exit inserts (baseline).
//   window S (6500 ms, after T): the clp.mjs rAF sampler (no Timeline), written as a series file for score.mjs.
// Usage (shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-carousel-leaver -- \
//     node tools/sim.mjs session --functional --owner fix-carousel-leaver -- node fixes/carousel-leaver/probe/simclp.mjs <out> base,S=<dir>,E=<dir>,...
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const ARMS = process.argv[3].split(',').map((s) => { const [k, d] = s.split('='); return { k, dir: d || null }; });
const WIN = Number(process.env.CL_WIN || 6000);
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileOf = (arm, f) => (arm.dir && existsSync(join(arm.dir, f)) ? join(arm.dir, f) : join(BASE, f));
const CAR = `document.querySelector('#people .start-selling-avatars.is-carousel')`;
const PATH = `(i) => { try { return new URL(i.currentSrc || i.src).pathname; } catch (e) { return ''; } }`;
const SAMPLER = (ms) => `new Promise((res) => { const S = []; const t0 = performance.now(); const P = ${PATH};
  const rec = () => { const c = ${CAR};
    if (c) { const sc = c.closest('[data-start-selling-scene]'); const cr = c.getBoundingClientRect();
      S.push({ t: performance.now() - t0, cls: c.className, scene: sc ? sc.getAttribute('data-start-selling-scene') : null, cx: +cr.left.toFixed(3),
        imgs: [...c.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
          return [+r.left.toFixed(3), +r.width.toFixed(3), +cs.opacity, cs.transform, cs.translate, cs.clipPath, i.className, P(i), cs.width, cs.marginRight, cs.borderLeftWidth, cs.animationName, cs.animationPlayState, i.complete && i.naturalWidth > 0 ? 1 : 0]; }) }); }
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(rec); else res(JSON.stringify(S)); };
  requestAnimationFrame(rec); })`;
const MO_START = `(() => { const c = ${CAR}; const S = window.__clMo = { attr: {}, add: 0, rem: 0, slides: 0, t: [] }; if (!c) return 0; const t0 = performance.now();
  S.mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') { S.attr[m.attributeName] = (S.attr[m.attributeName] || 0) + 1;
      if (m.attributeName === 'class' && m.target === c && c.classList.contains('is-sliding')) S.slides++; }
    else { S.add += m.addedNodes.length; S.rem += m.removedNodes.length; for (const n of m.addedNodes) if (n.classList && n.classList.contains('is-exit')) S.slides++; }
    S.t.push(Math.round(performance.now() - t0)); } });
  S.mo.observe(c, { subtree: true, attributes: true, childList: true }); return 1; })()`;
const MO_STOP = `(() => { const S = window.__clMo; if (!S) return null; S.mo && S.mo.disconnect(); return { attr: S.attr, add: S.add, rem: S.rem, slides: S.slides, batches: [...new Set(S.t)].length }; })()`;
const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
const QW = (q) => (q && q.length >= 8 ? { w: Math.round(Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6])), h: Math.round(Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7])) } : null);
function analyze(records, vh) {
  const L = []; let fi = -1; const counts = {};
  const walk = (r, parents) => {
    if (r.type === 'RenderingFrame') fi++;
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (r.type === 'Layout') { const root = QW(r.data?.root); L.push({ frame: fi, ms: Math.round(ms(r) * 10) / 10, root: root ? `${root.w}x${root.h}` : '?', view: !root || (root.w >= 400 && root.h >= vh - 2), car: !!root && root.w === 104 && root.h === 32 }); }
    for (const ch of r.children || []) walk(ch, parents.concat([r]));
  };
  for (const r of records) walk(r, []);
  const byRoot = L.reduce((o, l) => ((o[l.root] = (o[l.root] || 0) + 1), o), {});
  return { frames: fi + 1, layouts: L.length, view: L.filter((l) => l.view).length, viewGe10: L.filter((l) => l.view && l.ms >= 10).length, car: L.filter((l) => l.car).length, byRoot,
    recalcStyles: counts.RecalculateStyles || 0, paints: counts.Paint || 0, composites: counts.Composite || 0, viewList: L.filter((l) => l.view).map((l) => ({ f: l.frame, ms: l.ms, root: l.root })) };
}
const res = { tool: 'carousel-leaver simclp', note: 'Simulator: counts only, ms never count (F-084)', startedAt: new Date().toISOString(), win: WIN, arms: {} };
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm.k}.json`); rmSync(st, { force: true });
  const ov = arm.dir ? ['--overlay', arm.dir] : [];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm.k} server did not start`);
    const url = `http://localhost:${s.port}/`;
    const served = {};
    for (const f of [NODE, CSS]) {
      const got = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())), want = sha(readFileSync(fileOf(arm, f)));
      if (got !== want) throw new Error(`VOID: ${arm.k} serves ${f} ${got.slice(0, 12)}, expected ${want.slice(0, 12)}`);
      served[f.split('/').pop()] = got.slice(0, 12);
    }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    // run 3: the carousel itself at mid-view (runs 1-2 put #future-heading there, which left the carousel below the view)
    const geo = JSON.parse(await ev(`JSON.stringify((() => { const c = ${CAR}; const r = c.getBoundingClientRect(); window.scrollBy({ top: r.top + r.height / 2 - 0.5 * innerHeight, behavior: 'instant' }); const q = c.getBoundingClientRect(); return { vh: innerHeight, y: scrollY, carTop: q.top, inView: q.top >= 0 && q.bottom <= innerHeight }; })())`));
    await sleep(2500);
    // sim run 1 (15:2xZ): the 2nd arm's Timeline.start timed out (15 s) and killed the run. Now a Timeline failure is
    // recorded (timelineError), the tab is re-opened once and Timeline retried; the series window runs either way.
    let recs = [], mo = null, a = { frames: 0, layouts: 0, view: 0, viewGe10: 0, car: 0, byRoot: {}, recalcStyles: 0, paints: 0, composites: 0, viewList: [] }, tlErr = null, c2 = c;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt) { try { c2.close(); } catch {} c2 = await openTab(`localhost:${s.port}`); }
        c2.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
        await c2.evaluate(MO_START);
        await c2.send('Page.disable'); await c2.send('Page.enable');
        await c2.send('Timeline.enable'); await c2.send('Timeline.setInstruments', { instruments: ['Timeline'] });
        recs = [];
        await c2.send('Timeline.start', { maxCallStackDepth: 1 });
        await sleep(WIN);
        await c2.send('Timeline.stop'); await c2.send('Timeline.disable').catch(() => {});
        mo = await c2.evaluate(MO_STOP);
        a = analyze(recs, geo.vh); tlErr = null; break;
      } catch (e) { tlErr = String(e.message || e).slice(0, 160); console.log(`${arm.k} timeline attempt ${attempt + 1} failed: ${tlErr}`); try { await c2.evaluate(MO_STOP); } catch {} }
    }
    if (tlErr) { try { c2.close(); } catch {} c2 = await openTab(`localhost:${s.port}`); }
    const ev2 = (e) => c2.evaluate(e);
    await sleep(500);
    // series: wip evaluate has no awaitPromise; park the result on window and poll
    await ev2(`(window.__clS = null, (${SAMPLER(6500)}).then((s) => { window.__clS = s; }), 1)`);
    let ser = null; for (let i = 0; i < 40 && !ser; i++) { await sleep(500); ser = await ev2('window.__clS'); }
    if (ser) writeFileSync(join(OUT, `series-sim-${arm.k}.json`), ser);
    res.arms[arm.k] = { served, geo, timelineError: tlErr, mutations: mo, perSlide: mo && mo.slides ? { layouts: +(a.layouts / mo.slides).toFixed(2), view: +(a.view / mo.slides).toFixed(2), car: +(a.car / mo.slides).toFixed(2), recalcStyles: +(a.recalcStyles / mo.slides).toFixed(2), paints: +(a.paints / mo.slides).toFixed(2) } : null, ...a, seriesFrames: ser ? JSON.parse(ser).length : 0 };
    console.log(`${arm.k} served ${JSON.stringify(served)} y ${geo.y} | mo ${JSON.stringify(mo)} | frames ${a.frames} L ${a.layouts} view ${a.view} (>=10ms ${a.viewGe10}) car ${a.car} RS ${a.recalcStyles} P ${a.paints} | roots ${JSON.stringify(a.byRoot)} | series ${res.arms[arm.k].seriesFrames}`);
    try { c2.close(); } catch {} try { c.close(); } catch {}
  } finally { p.kill(); }
  writeFileSync(join(OUT, 'simclp.json'), JSON.stringify(res, null, 1));
}
console.log('EXIT-OK');

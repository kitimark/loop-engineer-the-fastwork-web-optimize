// people-gpu (fix-people-gpu, user T-224): WebKit (iOS Simulator, Mobile Safari) COUNTS for the #people title's "o"
// widening and the card reveal. Simulator ms are never a gain (F-084); Composite ms of the frame after the reveal are
// reported as structure only (the frame2 method of fixes/blur-cubic-v8).
// Arms (CSS injected after load, same build; X = a second overlay as served):
//   V as served   N the O's transitions off   B the card's blur off   P every CSS animation outside #people paused
//   PN P + N      X --snap2 as served
// Phases per arm (Timeline on, rAF-stepped scroll, one step per rAF):
//   reveal  park 80 px above the is-visible threshold (O open), step 8 px/frame across it (20 frames), rest 1.6 s.
//           Windows: before (the steps before +is-visible), f1 (the RenderingFrame holding +is-visible), f2 (the next),
//           rev1s (frames in the first 1 s after +is-visible), after (the rest)
//   still   at the title, O open, 2 s (F-227's background layout)
//   grow    jump the heading off screen (O resets), 2 s, jump back, 3.6 s. Windows: wait (before is-stack), stack
//           (is-stack .. is-expanded), grow (is-expanded + 1.5 s), rest
//   close   step 12 px/frame down until the O resets, then 1.2 s. Windows: scroll (before the reset), collapse
// Per window: RenderingFrames, Paint n + kpx, Layout n (+ frames with one, roots), RecalculateStyles, Composite n + ms.
// Run (functional Simulator session, shared lane):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-people-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-people-gpu -- node fixes/people-gpu/gates/pg-sim.mjs \
//     --snap <abs overlay dir> [--snap2 <abs dir>] [--arms V,P] [--label v10cm]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = arg('--snap'), SNAP2 = arg('--snap2', null);
if (!SNAP) throw new Error('--snap <abs overlay dir>');
const ARMS = arg('--arms', 'V,P').split(',');
const PHASES = arg('--phases', 'reveal,still,grow,close').split(',');
const LABEL = arg('--label', 'v10cm');
const OUT = join(WT, 'out/people-gpu'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CSS = {
  N: `.start-selling-future-people-o, .start-selling-future-people-o * { transition: none !important; }`,
  B: `.start-selling-future > .start-selling-future-card { filter: none !important; }`,
  P: `html *:not(#people, #people *), html *:not(#people, #people *)::before, html *:not(#people, #people *)::after { animation-play-state: paused !important; }`,
};
CSS.PN = CSS.P + '\n' + CSS.N;
CSS.PB = CSS.P + '\n' + CSS.B;
const HOOK = `(() => { window.__pg = []; const o = document.querySelector('.start-selling-future-people-o'), s = document.querySelector('section.start-selling-future');
  const st = () => (s.classList.contains('is-visible') ? 'V' : 'h') + (o.classList.contains('is-stack') ? 'S' : '') + (o.classList.contains('is-expanded') ? 'E' : '');
  const note = () => { const x = st(); const l = window.__pg[window.__pg.length - 1]; if (l && l.s === x) return; window.__pg.push({ s: x, t: performance.now(), y: Math.round(scrollY) }); };
  const mo = new MutationObserver(note); mo.observe(o, { attributes: true, attributeFilter: ['class'] }); mo.observe(s, { attributes: true, attributeFilter: ['class'] }); note(); return st(); })()`;
const GEO = `(() => { const h = document.getElementById('future-heading'); const r = h.getBoundingClientRect();
  return { y: Math.round(scrollY), ih: innerHeight, titleTop: Math.round(r.top + scrollY), titleH: Math.round(r.height), safari: navigator.userAgent.replace(/.*Version\\/([\\d.]+).*/, '$1') }; })()`;
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * (i + 1) / n));
const RUN = (ys, stopJs = 'false') => `(() => { const ys = ${JSON.stringify(ys)}; let k = 0; window.__pgDone = 0;
  const f = () => { window.scrollTo({ top: ys[k], behavior: 'instant' }); k++; if (k < ys.length && !(${stopJs})) requestAnimationFrame(f); else window.__pgDone = performance.now(); };
  requestAnimationFrame(f); return performance.now(); })()`;
const box = (c) => { const xs = [c[0], c[2], c[4], c[6]], ys = [c[1], c[3], c[5], c[7]]; const x = Math.min(...xs), y = Math.min(...ys); return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(...xs) - x), h: Math.round(Math.max(...ys) - y) }; };
const wh = (q) => (q ? `${Math.round(Math.abs(q[2] - q[0]))}x${Math.round(Math.abs(q[5] - q[1]))}` : '?');

function frames(recs) {
  const out = [];
  for (const r of recs) {
    if (r.type !== 'RenderingFrame') continue;
    const o = { t: r.startTime * 1000, end: (r.endTime ?? r.startTime) * 1000, paints: 0, kpx: 0, layouts: 0, styles: 0, composite: 0, compMs: 0, roots: {}, rects: {} };
    const walk = (x) => {
      if (x.type === 'Paint') { o.paints++; if (x.data?.clip) { const q = box(x.data.clip); o.kpx += (q.w * q.h) / 1e3; const k = `${q.w}x${q.h}`; o.rects[k] = (o.rects[k] || 0) + 1; } }
      else if (x.type === 'Layout') { o.layouts++; const k = wh(x.data?.root); o.roots[k] = (o.roots[k] || 0) + 1; }
      else if (x.type === 'RecalculateStyles') o.styles++;
      else if (x.type === 'Composite') { o.composite++; o.compMs += ((x.endTime ?? x.startTime) - x.startTime) * 1000; }
      for (const ch of x.children || []) walk(ch);
    };
    walk(r); out.push(o);
  }
  return out.sort((a, b) => a.t - b.t);
}
function stats(fr) {
  const sum = (k) => fr.reduce((s, f) => s + f[k], 0);
  const merge = (k) => { const o = {}; for (const f of fr) for (const [x, v] of Object.entries(f[k])) o[x] = (o[x] || 0) + v; return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6)); };
  return { frames: fr.length, paints: sum('paints'), kpx: Math.round(sum('kpx')), layouts: sum('layouts'), framesWithLayout: fr.filter((f) => f.layouts).length, styles: sum('styles'),
    composite: sum('composite'), compMs: +sum('compMs').toFixed(1), roots: merge('roots'), rects: merge('rects') };
}

const servers = [];
async function serve(dir, name) {
  const st = join(OUT, `serve-pgs-${name}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  servers.push(p);
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) throw new Error('server did not start');
  return `http://localhost:${s.port}/`;
}

const res = { tool: 'fixes/people-gpu/gates/pg-sim.mjs', label: LABEL, startedAt: new Date().toISOString(), snap: SNAP, snap2: SNAP2, arms: {} };
try {
  const urls = { V: await serve(SNAP, 'V') }; if (SNAP2) urls.X = await serve(SNAP2, 'X');
  for (const arm of ARMS) {
    const base = arm.startsWith('X') ? urls.X : urls.V; const armCss = CSS[arm.startsWith('X') ? arm.slice(1) : arm];
    const url = `${base}?arm=${arm}&t=${Date.now()}`;
    const r = res.arms[arm] = { css: armCss || null, windows: {} };
    let c = null;
    try {
      r.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, base))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSSF, base))).arrayBuffer())) };
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      await sleep(2000);
      c = await openTab(new URL(base).host);
      for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
      await sleep(2000);
      await c.evaluate('(window.scrollTo(0, 0), 0)'); await sleep(300);
      if (armCss) await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'pg-arm'; s.textContent = ${JSON.stringify(armCss)}; document.head.appendChild(s); return 1; })()`);
      r.hook = await c.evaluate(HOOK);
      let g = await c.evaluate(GEO); r.geo = g;
      // find the is-visible threshold: step down 12 px per rAF until the section shows (then warm the title area)
      const t0w = await c.evaluate(RUN(lin(0, g.titleTop + g.ih, Math.round((g.titleTop + g.ih) / 12)), `document.querySelector('section.start-selling-future').classList.contains('is-visible')`));
      for (let k = 0; k < 150 && !(await c.evaluate('window.__pgDone || 0')); k++) await sleep(100);
      const log0 = await c.evaluate('window.__pg.slice()'); const v0 = log0.find((x) => x.s.startsWith('V'));
      const yV = v0 ? v0.y : Math.round(g.titleTop - g.ih / 2);
      const yTitle = Math.max(yV + 40, Math.round(g.titleTop + g.titleH / 2 - g.ih / 2));
      r.thresholds = { visibleY: yV, yTitle, t0w };
      // warm: the title area and 2 screens below (images decode), then park for the reveal
      await c.evaluate(`(window.scrollTo(0, ${yTitle + 2 * g.ih}), 0)`); await sleep(1200);
      await c.evaluate(`(window.scrollTo(0, ${yTitle}), 0)`); await sleep(1500);
      await c.evaluate(`(window.scrollTo(0, ${Math.max(0, yV - 80)}), 0)`); await sleep(1500);
      // the section hides again above the threshold (fade-out 0.7 s, visibility at 1.6 s); the O stays open (heading in view)
      await c.evaluate('(window.scrollTo(0, 0), 0)'); await sleep(2500);
      await c.evaluate(`(window.scrollTo(0, ${Math.max(0, yV - 80)}), 0)`); await sleep(3500);
      console.log(arm, 'served', JSON.stringify(r.served), 'safari', g.safari, 'ih', g.ih, 'visibleY', yV, 'yTitle', yTitle, 'state', JSON.stringify((await c.evaluate('window.__pg.slice(-1)'))));
      const recs = [];
      c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
      const syncT = await c.evaluate(timelineSyncJs('pg-sync'));
      const marks = {};
      const waitDone = async () => { for (let k = 0; k < 150; k++) { const d = await c.evaluate('window.__pgDone || 0'); if (d) return d; await sleep(100); } return null; };
      const now = () => c.evaluate('performance.now()');
      if (PHASES.includes('reveal')) {
        marks.reveal0 = await c.evaluate(RUN(lin(Math.max(0, yV - 80), yV + 80, 20)));
        await waitDone(); await sleep(1600); marks.reveal1 = await now();
      }
      if (PHASES.includes('still')) {
        await c.evaluate(`(window.scrollTo(0, ${yTitle}), 0)`); await sleep(2200);
        marks.still0 = await now(); await sleep(2000); marks.still1 = await now();
      }
      if (PHASES.includes('grow')) {
        await c.evaluate(`(window.scrollTo(0, ${g.titleTop + g.titleH + 40}), 0)`); await sleep(2000);
        marks.grow0 = await c.evaluate(RUN([yTitle])); await sleep(3600); marks.grow1 = await now();
      }
      if (PHASES.includes('close')) {
        marks.close0 = await c.evaluate(RUN(lin(yTitle, yTitle + g.ih, Math.round(g.ih / 12)), `!document.querySelector('.start-selling-future-people-o').classList.contains('is-stack')`));
        await waitDone(); await sleep(1200); marks.close1 = await now();
      }
      await c.send('Timeline.stop').catch(() => {});
      await sleep(1500);
      const syncTL = findTimeStamp(recs, 'pg-sync');
      if (syncTL == null) throw new Error('no sync record');
      const off = syncTL * 1000 - syncT;
      const log = await c.evaluate('window.__pg.slice()');
      r.classLog = log;
      const fr = frames(recs);
      const within = (a, b) => fr.filter((f) => f.t >= a + off && f.t < b + off);
      const first = (pred, after) => log.find((x) => x.t >= after && pred(x.s));
      const W = r.windows;
      if (marks.reveal0) {
        const v = first((s) => s.startsWith('V'), marks.reveal0);
        if (v) {
          const tv = v.t + off; const i1 = fr.findIndex((f) => f.end >= tv); const f1 = fr[i1], f2 = fr[i1 + 1];
          W.before = stats(within(marks.reveal0, v.t)); W.f1 = f1 ? stats([f1]) : null; W.f2 = f2 ? stats([f2]) : null;
          W.rev1s = stats(within(v.t, v.t + 1000)); W.after = stats(within(v.t + 1000, marks.reveal1));
          W.f2.at = f2 ? +(f2.t - tv).toFixed(1) : null;
        } else W.revealError = 'no +is-visible seen';
      }
      if (marks.still0) W.still = stats(within(marks.still0, marks.still1));
      if (marks.grow0) {
        const s = first((x) => x.endsWith('S'), marks.grow0), e = first((x) => x.endsWith('SE'), marks.grow0);
        W.wait = stats(within(marks.grow0, s ? s.t : marks.grow1));
        if (s) W.stack = stats(within(s.t, e ? e.t : marks.grow1));
        if (e) { W.grow = stats(within(e.t, Math.min(e.t + 1500, marks.grow1))); W.growRest = stats(within(e.t + 1500, marks.grow1)); }
      }
      if (marks.close0) {
        const z = first((x) => !x.includes('S'), marks.close0);
        W.closeScroll = stats(within(marks.close0, z ? z.t : marks.close1));
        if (z) W.collapse = stats(within(z.t, marks.close1));
      }
      for (const [k, s] of Object.entries(W)) if (s && typeof s === 'object') console.log(arm, k.padEnd(11), 'frames', String(s.frames).padStart(3), 'paints', String(s.paints).padStart(4), 'kpx', String(s.kpx).padStart(6), 'layouts', String(s.layouts).padStart(3), `(${s.framesWithLayout} fr)`, 'styles', String(s.styles).padStart(3), 'comp', s.composite, `${s.compMs} ms`, 'roots', JSON.stringify(s.roots), 'rects', JSON.stringify(s.rects), s.at != null ? `at +${s.at}` : '');
      writeFileSync(join(OUT, `tl-pgs-${LABEL}-${arm}-${STAMP}.json`), JSON.stringify({ off, marks, recs }));
    } catch (e) { r.error = String(e.stack || e); console.log(arm, 'ERROR', r.error); }
    finally { try { await c?.send('Timeline.stop'); } catch {} try { c?.close(); } catch {} }
  }
} finally { for (const p of servers) p.kill(); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `pgs-${LABEL}-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
process.exit(0);

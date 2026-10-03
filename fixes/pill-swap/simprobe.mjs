// pill-swap Simulator probe (counts and attribution only; Simulator ms never count, F-084).
// Question: on an arm (baseline or an overlay snapshot), which WebKit Layout records does the community-pill avatar
// rotator (JS mM, the `_` loop + the avatars block) cause, at rest, at several scroll positions?
// Per arm, one page load; per position: scroll there (instant), settle 2 s, then one window of WIN ms with
//   - an in-page MutationObserver on .start-selling-avatars.is-carousel (attribute / childList counts),
//   - a WebKit Timeline (maxCallStackDepth 8; Page.disable -> Page.enable -> Timeline.start, F-047): every Layout with its
//     root size, duration (Simulator ms: indicative only) and the invalidation records (with JS top frames) that precede
//     it in the same RenderingFrame; a Layout counts as "rotator" when one of those invalidations has a JS frame inside
//     the mM component (lines from `function mM(` to `var ve = V(me, 2)` in the arm's served node file).
// Usage (shared lane, weight simulator):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner pill-swap -- \
//     node tools/sim.mjs session --functional --owner pill-swap -- node fixes/pill-swap/simprobe.mjs base,st6 [positions]
// Arms: out/pill-swap/snap/<arm> (immutable copies); `base` = the committed baseline (no overlay).
// Output: out/pill-swap/sim/simprobe-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/pill-swap/sim');
const ARMS = (process.argv[2] || 'base,st6').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const WIN = Number(process.env.PS_WIN || 4000);
const BASE = resolveTree('site-pretty');
const dirOf = (arm) => (arm === 'base' ? BASE : join(WT, 'out/pill-swap/snap', arm));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileOf = (arm, f) => (arm !== 'base' && existsSync(join(dirOf(arm), f)) ? join(dirOf(arm), f) : join(BASE, f));
function mmRange(arm) {
  const lines = readFileSync(fileOf(arm, NODE), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('function mM(')) + 1;
  const b = lines.findIndex((l, i) => i > a && /var ve = V\(me, 2\)/.test(l)) + 1;
  if (a < 1 || b <= a) throw new Error('mM range not found for ' + arm);
  return [a, b];
}

const POS = `(() => { const vh = innerHeight, t = document.querySelector('.hero-track'), av = document.querySelector('.start-selling-avatars.is-carousel');
  const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh; const at = av ? Math.round(av.getBoundingClientRect().top + scrollY) : null;
  return { vh, heroTrackBottom: Math.round(tb), avatarsTop: at, pos: { top: 0, y300: 300, y600: 600, y900: 900, pastHero: Math.round(tb + 1.2 * vh), pill: at == null ? null : Math.max(0, at - Math.round(vh / 2)) } }; })()`;
const STATE = `(() => { const av = document.querySelector('.start-selling-avatars.is-carousel'); if (!av) return null; const r = av.getBoundingClientRect();
  const sec = document.getElementById('people'); return { scrollY: Math.round(scrollY), avTop: Math.round(r.top), avInView: r.bottom > 0 && r.top < innerHeight, imgs: av.querySelectorAll('img').length,
  scene: sec?.closest('[data-start-selling-scene]')?.getAttribute('data-start-selling-scene') ?? sec?.getAttribute('data-start-selling-scene') ?? null, render: sec?.getAttribute('data-start-selling-render') ?? null }; })()`;
const MO_START = `(() => { const av = document.querySelector('.start-selling-avatars.is-carousel'); const S = window.__psMo = { attr: {}, child: 0, t: [] };
  if (!av) return 0; const t0 = performance.now();
  S.mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') S.attr[m.attributeName] = (S.attr[m.attributeName] || 0) + 1; else S.child += m.addedNodes.length + m.removedNodes.length; S.t.push(Math.round(performance.now() - t0)); } });
  S.mo.observe(av, { subtree: true, attributes: true, childList: true }); return 1; })()`;
const MO_STOP = `(() => { const S = window.__psMo; if (!S) return null; S.mo && S.mo.disconnect(); const ts = [...new Set(S.t)]; return { attr: S.attr, child: S.child, batches: ts.length, at: ts.slice(0, 40) }; })()`;

const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
const QW = (q) => (q && q.length >= 8 ? { w: Math.round(Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6])), h: Math.round(Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7])) } : null);
const frames = (st) => (Array.isArray(st) ? st : st?.callFrames || []);
const top = (st, k = 3) => frames(st).slice(0, k).map((f) => `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber}`).join(' <- ');

function analyze(records, range, vh) {
  const inMM = (st) => frames(st).some((f) => /nodes\/2\.DyWL8TcE\.js/.test(f.url || '') && f.lineNumber >= range[0] && f.lineNumber <= range[1]);
  // each Layout is attributed to the invalidations recorded since the previous Layout (timer JS runs outside a frame)
  const layouts = [];
  let fi = -1, pending = [];
  const walk = (r, parents) => {
    if (r.type === 'RenderingFrame') fi++;
    if (/^(InvalidateLayout|ScheduleStyleRecalculation|InvalidateStyles)$/.test(r.type)) pending.push({ type: r.type, mm: inMM(r.stackTrace), top: top(r.stackTrace, 2) || `(no JS: ${parents.map((p) => p.type).join('>')})` });
    if (r.type === 'Layout') {
      const root = QW(r.data?.root);
      layouts.push({ frame: fi, ms: Math.round(ms(r) * 10) / 10, root: root ? `${root.w}x${root.h}` : '?', view: !!root && root.w >= 400 && root.h >= vh - 2,
        in: parents.map((p) => p.type).join('>'), rotator: pending.some((p) => p.mm), inv: pending.slice(-4).map((p) => `${p.type[0]}${p.type[1]} ${p.top}`) });
      pending = [];
    }
    for (const ch of r.children || []) walk(ch, parents.concat([r]));
  };
  for (const r of records) walk(r, []);
  const by = (xs) => xs.reduce((o, l) => ((o[l.root] = (o[l.root] || 0) + 1), o), {});
  const heavy = layouts.filter((l) => l.ms > 3);
  return {
    frames: fi + 1, layouts: layouts.length, byRoot: by(layouts), view: layouts.filter((l) => l.view).length,
    heavy: heavy.length, heavyByRoot: by(heavy), rotatorLayouts: layouts.filter((l) => l.rotator).length, rotatorView: layouts.filter((l) => l.rotator && l.view).length,
    heavyList: heavy.map((l) => ({ ms: l.ms, root: l.root, in: l.in, rotator: l.rotator, inv: l.inv })),
    rotatorList: layouts.filter((l) => l.rotator).map((l) => ({ ms: l.ms, root: l.root, in: l.in, inv: l.inv })),
  };
}

mkdirSync(OUT, { recursive: true });
const res = { tool: 'pill-swap simprobe', note: 'Simulator: counts and attribution only, ms never count (F-084)', startedAt: new Date().toISOString(), win: WIN, arms: {} };
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const ov = arm === 'base' ? [] : ['--overlay', dirOf(arm)];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm} server did not start`);
    const url = `http://localhost:${s.port}/`;
    const served = {};
    for (const f of [NODE, CSS]) {
      const got = sha(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer()));
      const want = sha(readFileSync(fileOf(arm, f)));
      if (got !== want) throw new Error(`VOID: ${arm} serves ${f} ${got.slice(0, 12)}, expected ${want.slice(0, 12)}`);
      served[f.split('/').pop()] = got.slice(0, 12);
    }
    const range = mmRange(arm);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    const geo = await ev(POS);
    // warm the page once through the whole range (mount deferred sections the same way in every arm)
    await ev(`(scrollTo({ top: ${geo.pos.pastHero}, behavior: 'instant' }), 0)`); await sleep(1500);
    await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(1500);
    const out = { served, mmRange: range, geo, positions: {} };
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [name, y] of Object.entries(geo.pos)) {
      if (y == null || (ONLY && !ONLY.includes(name))) continue;
      await ev(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(2000);
      const s0 = await ev(STATE);
      await ev(MO_START);
      await c.send('Page.disable'); await c.send('Page.enable');
      await c.send('Timeline.enable');
      await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
      recs = [];
      await c.send('Timeline.start', { maxCallStackDepth: 8 });
      await sleep(WIN);
      await c.send('Timeline.stop');
      await c.send('Timeline.disable').catch(() => {});
      const mo = await ev(MO_STOP);
      const s1 = await ev(STATE);
      const a = analyze(recs, range, geo.vh);
      out.positions[name] = { y, state: s0, stateAfter: s1, mutations: mo, records: recs.length, ...a };
      console.log(`${arm} ${name} y ${s0?.scrollY} avTop ${s0?.avTop} inView ${s0?.avInView} scene ${s0?.scene} | mo ${JSON.stringify(mo?.attr)} child ${mo?.child} | frames ${a.frames} L ${a.layouts} view ${a.view} heavy ${a.heavy} ${JSON.stringify(a.heavyByRoot)} rotatorL ${a.rotatorLayouts} rotatorView ${a.rotatorView}`);
      for (const h of a.heavyList.slice(0, 8)) console.log(`    heavy ${h.ms} ${h.root} rot ${h.rotator} in ${h.in} | ${h.inv.join(' ; ')}`);
    }
    res.arms[arm] = out;
    c.close();
  } finally { p.kill(); }
}
const f = join(OUT, `simprobe-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('wrote', f);

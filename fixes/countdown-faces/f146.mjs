// countdown-faces F-146 probe (Simulator, counts and attribution only; Simulator ms never count, F-084).
// Question: at pastHero (both clocks hidden, page at rest) the phone showed a ~1/s Layout burst in both arms, bigger and
// spread over 2-3 frames in V (PoC). Which writes and which invalidations drive it, C vs V?
// Per arm, one page load, at pastHero:
//   1. mutation pass (4 s, no Timeline): a MutationObserver on the document; per target (short selector chain) the
//      count of attribute / characterData / childList mutations and the attribute names;
//   2. Timeline pass (5 s, maxCallStackDepth 8; Page.disable -> Page.enable -> Timeline.start, F-047): every
//      InvalidateLayout / ScheduleStyleRecalculation / InvalidateStyles record with its top JS frames, every Layout with
//      its root size and the record it sits in, and per RenderingFrame the Layout count.
// Usage (shared lane, weight simulator):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner countdown-faces -- \
//     node tools/sim.mjs session --functional --owner countdown-faces -- node fixes/countdown-faces/f146.mjs base,poc
// Output: out/countdown-faces/f146/f146-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const HASH = { base: '4606120cf3925f872ebb1a7a5e7731ad74d4d190781ee7952cf4440ed18acff5', poc: '638b8e03e81ce0f9732b346eeb5aa4e3d804158a7609d1cd918b6f5f222401ad' };
// (b) on the C stack: arms C and V from out/countdown-faces/snap/<arm> (hashes.json; JS checked as before)
const SNAPS = join(WT, 'out/countdown-faces/snap');
if (existsSync(join(SNAPS, 'hashes.json'))) for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(SNAPS, 'hashes.json'), 'utf8')))) HASH[k] = v.js;
const OUT = join(WT, 'out/countdown-faces/f146');
const ARMS = (process.argv[2] || 'base,poc').split(',');
const sha = (b) => createHash('sha256').update(b).digest('hex');

const YS = `(() => { const vh = innerHeight, t = document.querySelector('.hero-track'); const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh;
  return { vh, pastHero: Math.round(tb + 1.2 * vh) }; })()`;
const MUT = (ms) => `new Promise((res) => {
  const desc = (n) => { const p = []; let e = n.nodeType === 1 ? n : n.parentElement; for (let i = 0; e && i < 4; i++, e = e.parentElement) p.push(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].filter((c) => !/^svelte-/.test(c)).slice(0, 2).join('.') : '')); return p.join(' < '); };
  const agg = {}; let n = 0; const t0 = performance.now(); const secs = {};
  const mo = new MutationObserver((ms) => { for (const m of ms) { n++; const k = m.type + ' ' + (m.attributeName || '') + ' @ ' + desc(m.target); agg[k] = (agg[k] || 0) + 1; const s = Math.floor((performance.now() - t0) / 250); secs[s] = (secs[s] || 0) + 1; } });
  mo.observe(document, { subtree: true, attributes: true, characterData: true, childList: true });
  setTimeout(() => { mo.disconnect(); res({ total: n, byTarget: Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 40), per250ms: secs, cdLive: window.__cdLive ?? null }); }, ${ms});
})`;

const ms = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
const QW = (q) => (q && q.length >= 8 ? { w: Math.round(Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6])), h: Math.round(Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7])) } : null);
const top = (st, k = 3) => (Array.isArray(st) ? st : st?.callFrames || []).slice(0, k).map((f) => `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber}`).join(' <- ');

function analyze(records, t0) {
  const inval = {}; const layouts = []; const frames = []; const timeline = [];
  const walk = (r, parents, frameIdx) => {
    const t = Math.round(r.startTime * 1000 - t0);
    if (/^(InvalidateLayout|ScheduleStyleRecalculation|InvalidateStyles)$/.test(r.type)) {
      const k = `${r.type} ${top(r.stackTrace) || '(no JS: ' + parents.map((p) => p.type).join('>') + ')'}`;
      inval[k] = (inval[k] || 0) + 1; timeline.push([t, r.type[0] + r.type[1], top(r.stackTrace, 1)]);
    }
    if (r.type === 'Layout') {
      const root = QW(r.data?.root);
      layouts.push({ t, ms: Math.round(ms(r) * 10) / 10, root, in: parents.map((p) => p.type).join('>'), frame: frameIdx, stack: top(r.stackTrace) });
      timeline.push([t, 'L', root ? `${root.w}x${root.h}` : '?', Math.round(ms(r) * 10) / 10]);
    }
    for (const ch of r.children || []) walk(ch, parents.concat([r]), frameIdx);
  };
  for (const r of records) {
    let fi = null;
    if (r.type === 'RenderingFrame') { fi = frames.length; frames.push({ t: Math.round(r.startTime * 1000 - t0), ms: Math.round(ms(r) * 10) / 10 }); }
    walk(r, [], fi);
  }
  for (const f of frames) f.layouts = layouts.filter((l) => l.frame === frames.indexOf(f)).length;
  timeline.sort((a, b) => a[0] - b[0]);
  return { invalidations: Object.entries(inval).sort((a, b) => b[1] - a[1]), layouts, framesWithLayout: frames.filter((f) => f.layouts), frameCount: frames.length, timeline };
}

mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const SNAP = { poc: join(WT, 'out/countdown-faces/snap-x1/poc'), C: join(SNAPS, 'C'), V: join(SNAPS, 'V') };
const res = { tool: 'f146', note: 'Simulator: counts and attribution only, ms never count (F-084)', startedAt: new Date().toISOString(), arms: {} };
for (const arm of ARMS) {
  const st = join(OUT, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const ov = arm === 'base' ? [] : ['--overlay', SNAP[arm]];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    let s = null;
    for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(`${arm} server did not start`);
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer()));
    if (js !== HASH[arm]) { console.error(`VOID: ${arm} serves js ${js.slice(0, 12)}`); process.exitCode = 3; continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    const ev = (e) => c.evaluate(e);
    for (let i = 0; i < 40 && (await ev('document.readyState')) !== 'complete'; i++) await sleep(500);
    await sleep(4000);
    const ys = await ev(YS);
    await ev(`(scrollTo({ top: ${ys.pastHero}, behavior: 'instant' }), 0)`); await sleep(2000);
    await ev("(scrollTo({ top: 0, behavior: 'instant' }), 0)"); await sleep(3000);
    await ev(`(scrollTo({ top: ${ys.pastHero}, behavior: 'instant' }), 0)`); await sleep(3000);
    const evA = async (expr, key, tmo) => { await ev(`window.${key} = undefined; ${expr}.then((v) => { window.${key} = JSON.stringify(v); }); 0`); const t = Date.now(); for (;;) { await sleep(300); const v = await ev(`window.${key} || null`); if (v) return JSON.parse(v); if (Date.now() - t > tmo) throw new Error('timeout ' + key); } };
    const mut = await evA(MUT(4000), '__f146m', 15000);
    let recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    await c.send('Page.disable'); await c.send('Page.enable');
    await c.send('Timeline.enable');
    await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
    recs = [];
    await c.send('Timeline.start', { maxCallStackDepth: 8 });
    await sleep(5000);
    await c.send('Timeline.stop');
    await c.send('Timeline.disable').catch(() => {});
    const t0 = recs.length ? Math.min(...recs.map((r) => r.startTime * 1000)) : 0;
    const a = analyze(recs, t0);
    res.arms[arm] = { served: js.slice(0, 12), y: ys.pastHero, scrollY: await ev('scrollY'), mutations: mut, records: recs.length, ...a };
    console.log(`== ${arm} y ${ys.pastHero} records ${recs.length} frames ${a.frameCount} layouts ${a.layouts.length} mutations ${mut.total} cdLive ${mut.cdLive}`);
    console.log(' top mutation targets:'); for (const [k, n] of mut.byTarget.slice(0, 12)) console.log(`  ${n}\t${k}`);
    console.log(' invalidations:'); for (const [k, n] of a.invalidations.slice(0, 15)) console.log(`  ${n}\t${k}`);
    console.log(' layouts:'); for (const l of a.layouts) console.log(`  t ${l.t} ${l.root ? l.root.w + 'x' + l.root.h : '?'} in ${l.in} ${l.stack || ''}`);
    c.close();
  } finally { p.kill(); }
}
const f = join(OUT, `f146-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('wrote', f);

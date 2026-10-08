#!/usr/bin/env node
// P-168 (lead 14:5xZ): Simulator Timeline Composite count, windows A and B, COUNTS ONLY (Simulator ms are compared
// only within this run, never as phone ms). Arms (p168-serve.sh): f = g0.0f, fB = g0.0f + de-offscreen KO B
// (paused-scene col-track animations off), fC = g0.0f + KO C (paused-scene row-title sweeps off), g = g0.0g; >= 3
// fresh loads per arm, arms interleaved per load index. Per load: 6 s idle at y 0; Timeline on; window A = W-like
// steps 0 -> 1000 (scrollBy 250 smooth every 300 ms, then 2 s); scrollTo 4000, 3 s; window B = steps 4000 -> 5000,
// then 2 s; Timeline off. Per window: RenderingFrames, Composite records (count, sum, max, median), Layout records
// >= 1 ms (count, sum), the largest RenderingFrame, and the frame with the largest Composite (its y).
// Run (one shared Simulator session, <= 300 s; existing loads are skipped, so the next session resumes):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p168-comp.mjs <loads> [arm ...]
// Output: $P168_COMPDIR (default out/p168/comp)/comp-<arm>-<n>.json; one COMPLINE per load on stdout.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.P168_COMPDIR || 'out/p168/comp'); mkdirSync(D, { recursive: true });
const errText = (e) => e?.message || JSON.stringify(e);
const LOG = `(() => { const L = window.__p168c = { f: [], marks: {} }; const loop = () => { L.f.push([performance.now(), scrollY]); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return 'ok'; })()`;
const STEPS = (to) => `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const L = window.__p168c;
  L.marks['s' + ${to}] = performance.now(); let n = 0; while (scrollY < ${to} && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(2000); L.marks['e' + ${to}] = performance.now(); return { steps: n, y: scrollY }; })()`;
const JUMP = `(async () => { scrollTo(0, 4000); await new Promise((r) => setTimeout(r, 3000)); return { y: scrollY }; })()`;
const flatten = (recs, out = []) => { for (const r of recs || []) { out.push(r); flatten(r.children, out); } return out; };
const ms = (r) => ((r.endTime ?? r.startTime) - r.startTime) * 1000;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function runLoad(c) {
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.evaluate(LOG);
  await sleep(6000);
  for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 1 }]]) await c.send(m, p);
  const syncT = await c.evaluate(timelineSyncJs('p168comp'));
  const pa = await runAsync(c, STEPS(1000), { pollMs: 500, timeoutMs: 40000, key: '__p168ca' });
  const pj = await runAsync(c, JUMP, { pollMs: 500, timeoutMs: 20000, key: '__p168cj' });
  const pb = await runAsync(c, STEPS(5000), { pollMs: 500, timeoutMs: 40000, key: '__p168cb' });
  await sleep(300);
  await c.send('Timeline.stop').catch(() => {});
  await sleep(500);
  const L = JSON.parse(await c.evaluate('JSON.stringify(window.__p168c)'));
  const syncTL = findTimeStamp(recs, 'p168comp'); if (syncTL == null) throw new Error('no Timeline sync mark');
  const off = syncTL * 1000 - syncT;
  const yAt = (pm) => { let y = null; for (const [t, v] of L.f) { if (t > pm) break; y = v; } return y; };
  const frames = recs.filter((r) => r.type === 'RenderingFrame').map((r) => ({ pm: r.startTime * 1000 - off, dur: ms(r), comp: flatten(r.children).filter((x) => x.type === 'Composite').map(ms), lay: flatten(r.children).filter((x) => x.type === 'Layout').map(ms).filter((v) => v >= 1) }));
  const win = (a, b) => {
    const F = frames.filter((f) => f.pm >= a && f.pm < b); const C = F.flatMap((f) => f.comp); const Ly = F.flatMap((f) => f.lay);
    const top = F.reduce((m, f) => (f.comp.reduce((s, v) => s + v, 0) > (m ? m.comp.reduce((s, v) => s + v, 0) : -1) ? f : m), null);
    const big = F.reduce((m, f) => (!m || f.dur > m.dur ? f : m), null);
    return { frames: F.length, comp: { n: C.length, sum: Math.round(C.reduce((s, v) => s + v, 0)), max: Math.round(Math.max(0, ...C) * 10) / 10, med: Math.round(med(C) * 10) / 10 },
      layout: { n: Ly.length, sum: Math.round(Ly.reduce((s, v) => s + v, 0)) },
      maxFrame: big && { ms: Math.round(big.dur * 10) / 10, y: Math.round(yAt(big.pm) ?? -1) }, maxCompFrame: top && { ms: Math.round(top.comp.reduce((s, v) => s + v, 0) * 10) / 10, y: Math.round(yAt(top.pm) ?? -1) } };
  };
  return { pages: { A: pa, jump: pj, B: pb }, A: win(L.marks.s1000, L.marks.e1000), B: win(L.marks.s5000, L.marks.e5000) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const loads = Number(process.argv[2] || 3); const arms = process.argv.slice(3).length ? process.argv.slice(3) : ['f', 'fB', 'fC', 'g'];
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 235) * 1000;
  outer: for (let n = 1; n <= loads; n++) for (const arm of arms) {
    const file = join(D, `comp-${arm}-${n}.json`);
    if (existsSync(file)) { console.log(`exists ${arm}-${n}`); continue; }
    if (budget - (Date.now() - t0) < 55000) { console.log(`STOP budget before ${arm}-${n}`); break outer; }
    const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p168c=${arm}-${n}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}-${n}: ${errText(e)}`); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm}-${n} (open ${o.status})`); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    let r; try { r = await runLoad(c); } catch (e) { console.log(`ERR ${arm}-${n}: ${errText(e)}`); c.close(); continue; }
    c.close(); r.arm = arm; r.n = n; r.url = url; r.ready = ready;
    writeFileSync(file, JSON.stringify(r, null, 1));
    const w = (x) => `frames ${x.frames} comp n ${x.comp.n} sum ${x.comp.sum} max ${x.comp.max} med ${x.comp.med} | layout n ${x.layout.n} sum ${x.layout.sum} | max frame ${x.maxFrame?.ms}@y${x.maxFrame?.y} | max comp frame ${x.maxCompFrame?.ms}@y${x.maxCompFrame?.y}`;
    console.log(`COMPLINE ${arm}-${n}: A ${w(r.A)} || B ${w(r.B)}`);
  }
}

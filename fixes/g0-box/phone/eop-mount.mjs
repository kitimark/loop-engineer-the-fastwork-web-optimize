#!/usr/bin/env node
// Candidate 1 mount-cost probe (fix-g0-box, lead's D condition 2, 2026-10-09). ws moves the wheel listener's full style
// rebuild out of the te crossing and into the effect's mount (hydration). Is the load any worse? Per load: open a
// pre-page, set a bootstrap script (Page.setBootstrapScript: rAF scrollY logger, passive touch logger, window touch/wheel
// listener add/remove log, MutationObserver from DOMContentLoaded; the same logger as eop-sim.mjs) and Timeline auto
// capture (Timeline.setAutoCaptureEnabled, so recording starts with the next page load), then navigate to a fresh URL
// of the arm. 7 s after the navigation (hydration, the idle mount), 3 real WDA-sim approach drags (the first scroll),
// 1.5 s, Timeline off. Reports the load phase (every frame before the first touch): frames, > 34 / > 50, the longest, max
// and sum Layout+style, and the frame holding the window wheel add; and the first-scroll phase: > 34 / > 50, max L+S.
// COUNTS ONLY (Simulator ms never compare with the phone). One functional Simulator session.
// Usage (inside the session, WDA-sim started): node fixes/g0-box/phone/eop-mount.mjs <loads> <arm>...
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';
import { createSession } from '../../../tools/lib/wda.mjs';
import { compileScript } from '../../../tools/lib/gesture.mjs';
import { frames, approachProgram } from './eop-sim.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.EOP_MOUNTDIR || 'out/eopp/mount'); mkdirSync(D, { recursive: true });
const BOOT = `(() => { const L = window.__eops = { f: [], t: [], m: [] }; const loop = () => { L.f.push([performance.now(), scrollY]); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  for (const k of ['touchstart', 'touchend', 'touchcancel']) addEventListener(k, (e) => L.t.push([performance.now(), k[5]]), { passive: true, capture: true });
  for (const [p, tag] of [['addEventListener', 'listen+'], ['removeEventListener', 'listen-']]) { const f0 = EventTarget.prototype[p];
    EventTarget.prototype[p] = function (k, f, o) { if (this === window && /^(touch|wheel)/.test(k) && f && !String(f).includes('L.t.push')) L.m.push([performance.now(), scrollY, 'window', tag + k + (o && typeof o === 'object' && o.passive === false ? ':active' : '')]); return f0.call(this, k, f, o); }; }
  document.addEventListener('DOMContentLoaded', () => { L.m.push([performance.now(), scrollY, 'document', 'DOMContentLoaded']); });
  addEventListener('load', () => { L.m.push([performance.now(), scrollY, 'window', 'load']); });
})();`;
const r1 = (x) => Math.round(x * 10) / 10;
const ls = (x) => x.lay + x.sty;

async function freshTab(port, key) {
  for (let i = 0; i < 12; i++) {
    let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch { await sleep(1000); continue; }
    const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
    if (String(nav).includes(key)) return t; t.close(); await sleep(1000);
  }
  throw new Error(`no tab with ${key}`);
}

const loads = Number(process.argv[2] || 3); const arms = process.argv.slice(3);
const prog = compileScript(approachProgram(3));
const wda = await createSession({ base: process.env.EOP_WDA || 'http://127.0.0.1:8101', simulator: true });
const t0 = Date.now(), budget = Number(process.env.EOP_BUDGET_S || 270) * 1000;
try {
  outer: for (let n = 1; n <= loads; n++) for (const arm of arms) {
    const file = join(D, `mount-${arm}-${n}.json`);
    if (existsSync(file)) { console.log(`exists ${arm}-${n}`); continue; }
    if (budget - (Date.now() - t0) < 30000) { console.log(`STOP budget before ${arm}-${n}`); break outer; }
    const port = JSON.parse(readFileSync(join(WT, `out/eopp/serve-${arm}.json`), 'utf8')).port;
    const ts = Date.now(), pre = `eopmpre=${arm}-${n}-${ts}`, key = `eopm=${arm}-${n}-${ts}`;
    spawnSync('node', ['tools/sim.mjs', 'open', `http://localhost:${port}/?${pre}`], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    const c = await freshTab(port, pre); await sleep(1500);
    const recs = []; let auto = false;
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); if (m.method === 'Timeline.autoCaptureStarted') auto = true; });
    for (const [m, p] of [['Page.enable', {}], ['Page.setBootstrapScript', { source: BOOT }], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.setAutoCaptureEnabled', { enabled: true }]]) await c.send(m, p);
    await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(`http://localhost:${port}/?${key}`)}; }, 50), 1`);
    await sleep(7000);
    const nav = await c.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch((e) => `ERR ${e?.message}`);
    if (!String(nav).includes(key)) { console.log(`ERR ${arm}-${n}: not on the fresh URL (${String(nav).slice(0, 80)}); the connection did not follow the navigation`); c.close(); continue; }
    const syncT = await c.evaluate(timelineSyncJs('eopmount'));
    for (const op of prog.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); }
    await sleep(1500);
    await c.send('Timeline.stop').catch(() => {}); await c.send('Timeline.setAutoCaptureEnabled', { enabled: false }).catch(() => {});
    await c.send('Page.setBootstrapScript', {}).catch(() => {});
    await sleep(500);
    const L = JSON.parse(await c.evaluate('JSON.stringify(window.__eops || null)'));
    c.close();
    const syncTL = findTimeStamp(recs, 'eopmount');
    if (!L || syncTL == null || !recs.length) { console.log(`ERR ${arm}-${n}: auto capture ${auto}, records ${recs.length}, bootstrap log ${!!L}, sync ${syncTL}`); continue; }
    const F = frames(recs, syncTL * 1000 - syncT, L.f, L.t);
    const firstTouch = L.t.find((x) => x[1] === 's')?.[0] ?? Infinity;
    const LP = F.filter((x) => x.pm < firstTouch), SP = F.filter((x) => x.pm >= firstTouch);
    const wheel = L.m.find((m) => /^listen\+wheel/.test(m[3]));
    const wf = wheel ? F.find((x) => x.pm <= wheel[0] && wheel[0] <= x.pm + x.dur) || F.find((x) => x.pm >= wheel[0]) : null;
    const top = (A) => [...A].sort((a, b) => b.dur - a.dur)[0];
    const sum = (A) => ({ frames: A.length, gt34: A.filter((x) => x.dur > 34).length, gt50: A.filter((x) => x.dur > 50).length, longest: top(A) ? { dur: top(A).dur, ls: r1(ls(top(A))), js: top(A).js } : null, maxLS: r1(Math.max(0, ...A.map(ls))), sumLS: r1(A.reduce((a, x) => a + ls(x), 0)) });
    const r = { arm, n, auto, firstFramePm: F[0]?.pm ?? null, dcl: L.m.find((m) => m[3] === 'DOMContentLoaded')?.[0] ?? null, load: L.m.find((m) => m[3] === 'load')?.[0] ?? null,
      wheelAdd: wheel ? { pm: r1(wheel[0]), y: wheel[1], frame: wf ? { pm: wf.pm, dur: wf.dur, ls: r1(ls(wf)), js: wf.js } : null } : null,
      loadPhase: sum(LP), scrollPhase: sum(SP), listeners: L.m.filter((m) => m[2] === 'window' && /^listen/.test(m[3])), frames: F };
    writeFileSync(file, JSON.stringify(r, null, 1));
    const a = r.loadPhase, s = r.scrollPhase;
    console.log(`MOUNTLINE ${arm}-${n}: auto ${auto} | load phase (to first touch): frames ${a.frames}, >34 ${a.gt34}, >50 ${a.gt50}, longest ${a.longest?.dur} ms (L+S ${a.longest?.ls}), max L+S ${a.maxLS}, sum L+S ${a.sumLS} | wheel add ${wheel ? `@${r1(wheel[0])} ms y${wheel[1]} in a ${wf?.dur} ms frame (L+S ${wf ? r1(ls(wf)) : '-'})` : 'none before the drags'} | first scroll (3 drags): >34 ${s.gt34}, >50 ${s.gt50}, max L+S ${s.maxLS}`);
  }
} finally { await wda.close(); }

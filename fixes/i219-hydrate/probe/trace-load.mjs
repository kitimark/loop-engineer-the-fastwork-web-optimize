#!/usr/bin/env node
// i219-hydrate: offline analysis of hydrate-probe.mjs cost traces (no Chrome, no lock). Per <k>-<n>-trace.json in a
// cost-<stamp> folder: the page's navigationStart (the main-frame one for the served URL) as t0, the renderer main
// thread (the tid with the most Layout events), and from t0: counts and summed ms of Layout / UpdateLayoutTree / Paint /
// PrePaint / RunTask in [0, 1 s], [0, 2 s], [0, DCL], [DCL - 1 s, DCL + 1 s] and the whole trace; the task that holds the
// first big removal (the re-mount, from probe.json `big`), with the Layouts, style recalcs and FunctionCall time inside it;
// and the hydration task in a hydrated load (the longest task within 300 ms before DCL).
//   node fixes/i219-hydrate/probe/trace-load.mjs out/i219/cost-<stamp>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const probe = JSON.parse(readFileSync(join(dir, 'probe.json'), 'utf8'));
const NAMES = ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'RunTask', 'FunctionCall', 'EvaluateScript', 'v8.compile'];
const out = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('-trace.json')).sort()) {
  const [k, n] = f.split('-');
  const load = probe.loads[Number(n)];
  const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const navs = t.traceEvents.filter((e) => e.name === 'navigationStart' && /^http:\/\/localhost/.test(e.args?.data?.documentLoaderURL || '') && e.args?.data?.isLoadingMainFrame);
  const nav = navs.sort((a, b) => a.ts - b.ts)[0];
  if (!nav) { out.push({ f, void: 'no navigationStart' }); continue; }
  const t0 = nav.ts;
  const X = t.traceEvents.filter((e) => e.ph === 'X' && e.pid === nav.pid && e.ts >= t0);
  const c = {}; for (const e of X) if (e.name === 'Layout' || e.name === 'UpdateLayoutTree') c[e.tid] = (c[e.tid] || 0) + 1;
  const tid = Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]);
  const M = X.filter((e) => e.tid === tid);
  const rel = (e) => (e.ts - t0) / 1000;
  const dcl = load.end.dcl;
  const win = (a, b) => Object.fromEntries(NAMES.map((nm) => { const L = M.filter((e) => e.name === nm && rel(e) >= a && rel(e) <= b); return [nm, { n: L.length, ms: Math.round(L.reduce((s, e) => s + (e.dur || 0), 0) / 1000) }]; }));
  const inside = (h) => Object.fromEntries(NAMES.filter((nm) => nm !== 'RunTask').map((nm) => { const L = M.filter((e) => e.name === nm && e.ts >= h.ts && e.ts + (e.dur || 0) <= h.ts + h.dur); return [nm, { n: L.length, ms: Math.round(L.reduce((s, e) => s + (e.dur || 0), 0) / 1000) }]; }));
  const big = (load.end.big || []).find((b) => b.removed > 500);
  let remount = null;
  if (big) { const T = t0 + big.t * 1000; const h = M.filter((e) => e.name === 'RunTask' && e.ts <= T + 2000 && e.ts + e.dur >= T - 2000).sort((a, b) => b.dur - a.dur)[0]; if (h) remount = { atMs: Math.round(rel(h)), ms: Math.round(h.dur / 1000), inside: inside(h) }; }
  const hyd = M.filter((e) => e.name === 'RunTask' && rel(e) >= dcl - 1500 && rel(e) <= dcl + 50).sort((a, b) => b.dur - a.dur).slice(0, 3).map((h) => ({ atMs: Math.round(rel(h)), ms: Math.round(h.dur / 1000), inside: inside(h) }));
  const end = Math.max(...M.map((e) => rel(e) + (e.dur || 0) / 1000));
  const r = { f, k, dcl, loadEnd: load.end.loadEnd, traceEndMs: Math.round(end), bigMutation: big || null, remountTask: remount, longestTasksBeforeDcl: hyd,
    windows: { s1: win(0, 1000), s2: win(0, 2000), toDcl: win(0, dcl), dclPm1s: win(dcl - 1000, dcl + 1000), all: win(0, 1e9) } };
  out.push(r);
  const fmt = (w) => ['Layout', 'UpdateLayoutTree', 'Paint', 'RunTask', 'FunctionCall'].map((nm) => `${nm} ${w[nm].n}/${w[nm].ms}`).join('  ');
  console.log(`${k} (load ${n}): DCL ${dcl} ms, load ${load.end.loadEnd} ms, trace to ${Math.round(end)} ms`);
  for (const w of ['s1', 's2', 'toDcl', 'dclPm1s', 'all']) console.log(`  ${w.padEnd(8)} ${fmt(r.windows[w])}`);
  console.log(`  remount task ${JSON.stringify(remount)}`);
  console.log(`  longest tasks in [DCL-1.5 s, DCL] ${JSON.stringify(hyd.map((h) => ({ atMs: h.atMs, ms: h.ms, layouts: h.inside.Layout.n, recalcs: h.inside.UpdateLayoutTree.n, fn: h.inside.FunctionCall.ms })))}`);
}
process.stdout.write('');
export default out;

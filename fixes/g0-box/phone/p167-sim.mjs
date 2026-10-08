#!/usr/bin/env node
// P-167 pre-stage gate (lead 12:3xZ): Simulator COUNTS ONLY, no timing, a mechanism check, not a verdict. Per arm (v0, e,
// ko1, ko2, ko3, ko123; servers from p167-serve.sh) ONE fresh load, then the two P-166 windows with the W step pattern
// (scrollBy 250 px smooth every 300 ms, then 1 s): spot A 0 -> 750 and spot B 4000 -> 5000 (after scrollTo 4000 and 3 s).
// Around each window a WebKit layer census (LayerTree.layersForNode on <html>: layer count, memory sum, layers in the
// viewport band), and during each window the number of LayerTree.layerTreeDidChange events (layer churn).
// Run (one shared Simulator session, <= 300 s; existing results are skipped, so a second session resumes):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p167-sim.mjs [arm ...]
// Output: out/p167/sim/census-<arm>.json; one SIMLINE per arm on stdout; out/p167/sim/runs.jsonl.
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, 'out/p167/sim'); mkdirSync(D, { recursive: true });
export const ARMS = ['v0', 'e', 'ko1', 'ko2', 'ko3', 'ko123'];
const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const errText = (e) => e?.message || JSON.stringify(e);
const STEPS = (to) => `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0; while (scrollY < ${to} && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(1000); return { steps: n, y: scrollY, he: !!document.querySelector('.hero-track.he-css'), wc: document.querySelectorAll('[data-fw-wc]').length,
    wc0: document.querySelectorAll('[data-fw-wc="0"]').length, deferred: document.querySelectorAll('[data-start-selling-render="deferred"]').length }; })()`;
const JUMP = (y) => `(async () => { scrollTo(0, ${y}); await new Promise((r) => setTimeout(r, 3000)); return { y: scrollY,
  wc: document.querySelectorAll('[data-fw-wc]').length, wc0: document.querySelectorAll('[data-fw-wc="0"]').length,
  deferred: document.querySelectorAll('[data-start-selling-render="deferred"]').length }; })()`;

/** census of the layer list: count, memory (MB), layers whose bounds meet the viewport band [y, y + vh) */
export function census(layers, y = 0, vh = 0) {
  const mem = layers.reduce((s, l) => s + (l.memory || 0), 0);
  const inView = layers.filter((l) => l.bounds && l.bounds.y < y + vh && l.bounds.y + l.bounds.height > y);
  const big = [...layers].sort((a, b) => (b.memory || 0) - (a.memory || 0)).slice(0, 6)
    .map((l) => ({ id: l.layerId, node: l.nodeId, mb: Math.round((l.memory || 0) / 1e5) / 10, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height].map(Math.round), paints: l.paintCount }));
  return { n: layers.length, mb: Math.round(mem / 1e5) / 10, inView: inView.length, inViewMb: Math.round(inView.reduce((s, l) => s + (l.memory || 0), 0) / 1e5) / 10, big };
}

async function layers(c) {
  const doc = await c.send('DOM.getDocument', { depth: 1 });
  const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  return (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
}

async function runArm(c, arm) {
  const ev = { n: 0, live: true }; const errors = [];
  c.on((m) => { if (ev.live && m.method === 'LayerTree.layerTreeDidChange') ev.n++; });
  await c.send('DOM.enable').catch(() => {});
  await c.send('LayerTree.enable');
  const vh = await c.evaluate('innerHeight');
  const out = { arm, vh, windows: {} };
  const step = async (name, expr, y) => {
    ev.n = 0; let page = null;
    try { page = await runAsync(c, expr, { pollMs: 500, timeoutMs: 30000, key: `__p167${name}` }); } catch (e) { errors.push(`${name}: ${errText(e)}`); }
    const churn = ev.n; let cs = null;
    try { cs = census(await layers(c), page?.y ?? y, vh); } catch (e) { errors.push(`${name} census: ${errText(e)}`); }
    out.windows[name] = { page, churn, census: cs };
  };
  await sleep(2000);
  try { out.windows.A0 = { census: census(await layers(c), 0, vh) }; } catch (e) { errors.push(`A0 census: ${errText(e)}`); }
  await step('A', STEPS(750), 750);
  await step('jumpB', JUMP(4000), 4000);
  await step('B', STEPS(5000), 5000);
  ev.live = false; out.errors = errors;
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const only = process.argv.slice(2);
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 235) * 1000;
  for (const arm of ARMS) {
    if (only.length && !only.includes(arm)) continue;
    if (existsSync(join(D, `census-${arm}.json`))) { console.log(`exists ${arm}`); continue; }
    // an arm took ~65-70 s in the first session (12:4xZ, killed at the 300 s cap after 3 arms): start one only with 80 s left
    if (budget - (Date.now() - t0) < 80000) { console.log(`STOP budget before ${arm}`); log({ arm, stop: 'budget' }); break; }
    const port = JSON.parse(readFileSync(join(WT, `out/p167/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p167=${arm}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}: ${errText(e)}`); log({ arm, stop: 'tab', open: o.status }); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm}`); log({ arm, stop: 'nav', open: o.status }); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    const r = await runArm(c, arm); c.close();
    r.url = url; r.ready = ready;
    writeFileSync(join(D, `census-${arm}.json`), JSON.stringify(r, null, 1));
    const w = r.windows; const f = (x) => (x?.census ? `${x.census.n}L ${x.census.mb}MB view ${x.census.inView}L/${x.census.inViewMb}MB` : 'n/a');
    const line = `SIMLINE ${arm}: A0 ${f(w.A0)} | A churn ${w.A?.churn} -> ${f(w.A)} he ${w.A?.page?.he} wc ${w.A?.page?.wc}/${w.A?.page?.wc0} def ${w.A?.page?.deferred} | jump churn ${w.jumpB?.churn} -> ${f(w.jumpB)} | B churn ${w.B?.churn} -> ${f(w.B)} wc ${w.B?.page?.wc}/${w.B?.page?.wc0} def ${w.B?.page?.deferred}${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`;
    console.log(line); log({ arm, line });
  }
}

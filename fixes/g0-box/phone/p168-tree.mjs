#!/usr/bin/env node
// P-168 (c) (lead 14:2xZ): does the phone's costlier Layout at y 250-555 (g0.0e/g0.0f 15-17 ms vs v0 12.4 ms median)
// scale with the size of the layout tree? Simulator, COUNTS ONLY (no timing claim; Simulator ms are reported only as a
// within-session comparison, never as phone ms), >= 3 fresh loads per arm (v0 / f = g0.0f / fko25 = g0.0f + ko2 + ko5),
// servers from p168-serve.sh, arms interleaved per load index. Per load, after load + 6 s idle at y 0, and again after
// the W-like steps 0 -> 1000 (scrollBy 250 smooth every 300 ms, then 2 s), the tree census (no layout forced: DOM
// queries and computed content-visibility only):
//   all      elements in the document
//   skipped  elements inside a [data-start-selling-render="deferred"] section (content-visibility: auto; skipped while
//            off screen, so outside every layout); rendered = all - skipped
//   panel    elements inside .start-selling-morph-panel (0 before the morph panel mounts)
// and, from the Timeline during the steps: Layout records >= 1 ms (count, sum, median) and frames with 2+ Layouts >= 5 ms.
// Run (one shared Simulator session, <= 300 s; existing loads are skipped, so a second session resumes):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p168-tree.mjs <loads> [arm ...]
// v2 (lead 14:3xZ): arm fcv25 (g0.0f + ko2 + the idle-mounted panel under content-visibility: hidden until its trigger;
// its hidden subtree counts as skipped), and the layer census at the top (LayerTree on <html>) before the Timeline.
// Output: $P168_TREEDIR (default out/p168/tree)/tree-<arm>-<n>.json; one TREELINE per load on stdout.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.P168_TREEDIR || 'out/p168/tree'); mkdirSync(D, { recursive: true });
const errText = (e) => e?.message || JSON.stringify(e);
const CENSUS = `JSON.stringify((() => { const all = document.querySelectorAll('*').length;
  let skipped = 0; for (const s of document.querySelectorAll('[data-start-selling-render="deferred"]')) skipped += s.querySelectorAll('*').length + 1;
  let panel = 0, panelHidden = 0; for (const p of document.querySelectorAll('.start-selling-morph-panel')) { const k = p.querySelectorAll('*').length; panel += k + 1; if (getComputedStyle(p).contentVisibility === 'hidden') panelHidden += k; }
  const sections = [...document.querySelectorAll('[data-start-selling-render]')].map((s) => s.getAttribute('data-start-selling-render'));
  return { y: Math.round(scrollY), all, skipped: skipped + panelHidden, rendered: all - skipped - panelHidden, panel, panelHidden, sections }; })())`;
const STEPS = `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0; while (scrollY < 1000 && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(2000); return { steps: n, y: scrollY }; })()`;
const flatten = (recs, out = []) => { for (const r of recs || []) { out.push(r); flatten(r.children, out); } return out; };
const ms = (r) => ((r.endTime ?? r.startTime) - r.startTime) * 1000;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function runLoad(c) {
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await sleep(6000);
  const before = JSON.parse(await c.evaluate(CENSUS));
  // v2 (lead 14:3xZ): the layer census at the top too (LayerTree on <html>: count and memory), before the Timeline starts
  try { await c.send('DOM.enable').catch(() => {}); await c.send('LayerTree.enable'); const doc = await c.send('DOM.getDocument', { depth: 1 });
    const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root; const L = (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
    before.layers = L.length; before.layerMB = Math.round(L.reduce((t, l) => t + (l.memory || 0), 0) / 1e5) / 10; await c.send('LayerTree.disable').catch(() => {}); } catch (e) { before.layerErr = errText(e); }
  for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 1 }]]) await c.send(m, p);
  const syncT = await c.evaluate(timelineSyncJs('p168tree'));
  const page = await runAsync(c, STEPS, { pollMs: 500, timeoutMs: 40000, key: '__p168t' });
  await sleep(300);
  await c.send('Timeline.stop').catch(() => {});
  await sleep(500);
  const after = JSON.parse(await c.evaluate(CENSUS));
  const syncTL = findTimeStamp(recs, 'p168tree'); if (syncTL == null) throw new Error('no Timeline sync mark');
  const off = syncTL * 1000 - syncT;
  const frames = recs.filter((r) => r.type === 'RenderingFrame' && r.startTime * 1000 - off >= syncT);
  const lay = frames.flatMap((f) => flatten(f.children).filter((x) => x.type === 'Layout').map(ms)).filter((v) => v >= 1);
  const pairs = frames.filter((f) => flatten(f.children).filter((x) => x.type === 'Layout' && ms(x) >= 5).length >= 2).length;
  return { page, before, after, layout: { n: lay.length, sum: Math.round(lay.reduce((s, v) => s + v, 0)), med: Math.round(med(lay) * 10) / 10, n5: lay.filter((v) => v >= 5).length, pairs } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const loads = Number(process.argv[2] || 3); const arms = process.argv.slice(3).length ? process.argv.slice(3) : ['v0', 'f', 'fko25', 'fcv25'];
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 235) * 1000;
  outer: for (let n = 1; n <= loads; n++) for (const arm of arms) {
    const file = join(D, `tree-${arm}-${n}.json`);
    if (existsSync(file)) { console.log(`exists ${arm}-${n}`); continue; }
    if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${arm}-${n}`); break outer; }
    const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p168t=${arm}-${n}-${Date.now()}`;
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
    const b = r.before, a = r.after, L = r.layout;
    console.log(`TREELINE ${arm}-${n}: y0 layers ${b.layers} ${b.layerMB}MB all ${b.all} rendered ${b.rendered} (skipped ${b.skipped}, panel ${b.panel} hidden ${b.panelHidden}, sections ${b.sections.join('/')}) | after y${a.y} all ${a.all} rendered ${a.rendered} (skipped ${a.skipped}, panel ${a.panel}) | Layouts >=1 ms ${L.n} sum ${L.sum} med ${L.med}, >=5 ms ${L.n5}, pairs ${L.pairs}`);
  }
}

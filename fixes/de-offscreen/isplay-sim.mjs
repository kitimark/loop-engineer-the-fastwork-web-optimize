#!/usr/bin/env node
// de-offscreen step 2 (lead, after P-168): which layers are created, destroyed, resized, repainted or change memory
// at the spot-B `+is-play` toggle? Simulator (WebKit), COUNTS ONLY, no timing. Arms: v0, f (g0.0f), f+B (g0.0f +
// knock-out B injected as a <style> after load). One fresh load per (arm, run):
//   settle 6 s (+ KO CSS, 1.5 s), MutationObserver on the two `is-play` owners (secure network, invoice), jump to 4000,
//   3 s, scrollTo START (4460), 1.5 s (if is-play is already on: back to 3600 and return, up to 2 times); then steps of
//   STEP px (instant scrollTo; poll the MO record every 15 ms for up to 400 ms) until a `+is-play` lands (max END 4640).
//   Before every step: census (LayerTree.layersForNode(<html>), one DOM.getDocument per load so node ids stay valid).
//   "before" = the census of the step before the toggle. After the toggle: back-to-back censuses for SAMPLE_MS (1.6 s)
//   at the same scroll position, each stamped tRel = ms after the MO record (page clock); "after" = the first,
//   "after1s" = the last. Timeline (Page.disable/enable, Timeline.start) runs over the toggle step and the sampling:
//   Paint records (clip quads), Composite, Layout, RecalculateStyles, RenderingFrame (type, tRel, ms).
//   Owners (DOM.resolveNode + OWNER_INFO_FN) and reasons for every layer that differs from "before" in any sample.
//   The Simulator's ms are not used for claims (counts only); back-to-back censuses add a few paints (README §1).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-offscreen -- \
//     node tools/sim.mjs session --functional --owner de-offscreen -- node fixes/de-offscreen/isplay-sim.mjs [v0:1 f:1 f+B:1 ...]
// Output out/de-offscreen/isplay/<arm>-<run>.json (existing files are skipped); one IPLINE per load.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WT, ARMS, KO, serveArm, checkServed, OWNER_INFO_FN, sleep } from './common.mjs';
const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));

const OUT = join(WT, 'out/de-offscreen/isplay'); mkdirSync(OUT, { recursive: true });
const STEP = Number(process.env.IP_STEP || 8), START = Number(process.env.IP_START || 4460), END = Number(process.env.IP_END || 4640), SAMPLE_MS = Number(process.env.IP_SAMPLE_MS || 1600);
const jobs = (process.argv.slice(2).length ? process.argv.slice(2) : ['v0:1', 'f:1', 'f+B:1']).map((s) => { const [arm, run] = s.split(':'); return { arm, run: run || '1' }; });
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 270) * 1000;
const errText = (e) => e?.message || JSON.stringify(e);

const MO = `(() => { window.__ip = []; const q = ['.start-selling-platform-secure.is-network', '.start-selling-platform-invoice-i'];
  for (const sel of q) for (const el of document.querySelectorAll(sel)) { let had = el.classList.contains('is-play');
    new MutationObserver(() => { const has = el.classList.contains('is-play'); if (has !== had) { had = has; window.__ip.push({ sel, on: has, y: scrollY, t: Math.round(performance.now()) }); } }).observe(el, { attributes: true, attributeFilter: ['class'] }); }
  return document.querySelectorAll(q.join(',')).length; })()`;

function flat(records) { const out = []; const walk = (r) => { out.push({ type: r.type, start: r.startTime * 1000, end: (r.endTime ?? r.startTime) * 1000, data: r.data }); for (const ch of r.children || []) walk(ch); }; for (const r of records) walk(r); return out; }

async function runLoad(c, arm) {
  const errors = []; const res = { arm, steps: [] };
  await c.send('DOM.enable').catch(() => {});
  await c.send('LayerTree.enable');
  const doc = await c.send('DOM.getDocument');
  const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  const census = async () => { const y = await c.evaluate('scrollY'); const L = (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
    return { y, at: Date.now(), layers: L.map((l) => ({ id: l.layerId, node: l.nodeId, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height], cb: l.compositedBounds && [l.compositedBounds.x, l.compositedBounds.y, l.compositedBounds.width, l.compositedBounds.height], mem: l.memory || 0, paints: l.paintCount || 0, pseudo: l.pseudoElement || null })) }; };
  res.mo = await c.evaluate(MO);
  res.page = await c.evaluate('({ ih: innerHeight, iw: innerWidth, dpr: devicePixelRatio })');
  const PLAYING = `!!document.querySelector('.start-selling-platform-secure.is-network.is-play')`;
  await c.evaluate('(scrollTo({ top: 4000, behavior: "instant" }), 1)'); await sleep(3000);
  await c.evaluate(`(scrollTo({ top: ${START}, behavior: "instant" }), 1)`); await sleep(1500);
  res.preToggles = JSON.parse(await c.evaluate('JSON.stringify(window.__ip)'));
  // guard (session 1, f+B: no toggle before the 300 s cap): if the network already plays at START, go back up and wait
  // for it to stop (is-play = in view && !static), then come back
  for (let i = 0; i < 2 && (await c.evaluate(PLAYING)); i++) { res.retried = (res.retried || 0) + 1; await c.evaluate('(scrollTo({ top: 3600, behavior: "instant" }), 1)'); await sleep(2500); await c.evaluate(`(scrollTo({ top: ${START - 60}, behavior: "instant" }), 1)`); await sleep(1500); }
  res.playingAtStart = await c.evaluate(PLAYING);
  let recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  let prev = await census(); let y = prev.y; let hit = null;
  while (y < END && !hit && !res.playingAtStart) {
    const n0 = JSON.parse(await c.evaluate('JSON.stringify(window.__ip)')).length;
    recs = [];
    await c.send('Page.disable').catch(() => {}); await c.send('Page.enable').catch(() => {});
    await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] }).catch(() => {});
    await c.send('Timeline.start', { maxCallStackDepth: 1 });
    y += STEP;
    const tStep = await c.evaluate(`(console.timeStamp('ip:step'), scrollTo({ top: ${y}, behavior: 'instant' }), performance.now())`);
    // poll for the toggle (MutationObserver records performance.now()); then census back-to-back for SAMPLE_MS
    let fresh = []; const tp = Date.now();
    while (Date.now() - tp < 400 && !fresh.length) { await sleep(15); fresh = JSON.parse(await c.evaluate('JSON.stringify(window.__ip)')).slice(n0).filter((e) => e.on); }
    if (fresh.length) {
      const samples = [];
      const ts0 = Date.now();
      while (Date.now() - ts0 < SAMPLE_MS) { const pt = await c.evaluate('performance.now()'); const s = await census(); s.tRel = Math.round(pt - fresh[0].t); samples.push(s); }
      await c.send('Timeline.stop'); await c.send('Timeline.disable').catch(() => {});
      const f = flat(recs); const ts = f.find((r) => r.type === 'TimeStamp' && r.data?.message === 'ip:step')?.start ?? 0;
      // Timeline time -> toggle time: the step stamp is page time tStep, the toggle page time fresh[0].t
      const rel = (r) => Math.round(r.start - ts - (fresh[0].t - tStep));
      const cnt = {}; for (const r of f) if (r.start >= ts) cnt[r.type] = (cnt[r.type] || 0) + 1;
      hit = { y, toggles: fresh, toggleAfterStepMs: Math.round(fresh[0].t - tStep), before: prev, samples, after: samples[0], after1s: samples[samples.length - 1], timeline: { counts: cnt,
        records: f.filter((r) => r.start >= ts && ['Paint', 'Composite', 'Layout', 'RecalculateStyles', 'RenderingFrame'].includes(r.type)).map((r) => [r.type[0] + r.type[1], rel(r), Math.round((r.end - r.start) * 10) / 10]),
        paints: f.filter((r) => r.type === 'Paint' && r.start >= ts).map((r) => ({ t: rel(r), ms: Math.round((r.end - r.start) * 10) / 10, clip: r.data?.clip || null })),
        composites: f.filter((r) => r.type === 'Composite' && r.start >= ts).map((r) => [rel(r), Math.round((r.end - r.start) * 10) / 10]) } };
    } else {
      await sleep(150);
      await c.send('Timeline.stop'); await c.send('Timeline.disable').catch(() => {});
      res.steps.push({ y, n: prev.layers.length }); prev = await census();
    }
  }
  if (!hit) { errors.push(res.playingAtStart ? 'is-play already on at the start position' : `no +is-play toggle up to y ${END}`); res.errors = errors; return res; }
  // owners of every layer that differs (created, destroyed, resized, memory or paint change) across before -> samples
  const ids = new Set(); const key = (C) => new Map(C.layers.map((l) => [l.id, l]));
  const B = key(hit.before);
  for (const S of hit.samples) for (const [id, l] of key(S)) { const p = B.get(id); if (!p || p.mem !== l.mem || p.paints !== l.paints || String(p.cb) !== String(l.cb) || String(p.b) !== String(l.b)) ids.add(id); }
  for (const id of B.keys()) if (hit.samples.some((S) => !S.layers.some((l) => l.id === id))) ids.add(id);
  const nodeOf = new Map(); for (const C of [hit.before, ...hit.samples]) for (const l of C.layers) nodeOf.set(l.id, l.node);
  hit.owners = {};
  for (const id of ids) {
    const rec = {};
    try { const r = await c.send('LayerTree.reasonsForCompositingLayer', { layerId: id }); rec.reasons = Object.entries(r.compositingReasons || {}).filter(([, v]) => v).map(([k]) => k); } catch (e) { rec.reasons = ['ERR ' + errText(e).slice(0, 50)]; }
    try { const { object } = await c.send('DOM.resolveNode', { nodeId: nodeOf.get(id) }); const r = await c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true }); rec.owner = r.result?.value || null; await c.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {}); }
    catch (e) { rec.owner = { sel: '?', err: errText(e).slice(0, 60) }; }
    hit.owners[id] = rec;
  }
  res.hit = hit; res.errors = errors;
  return res;
}

for (const { arm, run } of jobs) {
  const [base, ...kos] = arm.split('+');
  if (!ARMS[base] || !kos.every((k) => KO[k])) { console.log(`skip bad arm ${arm}`); continue; }
  const file = join(OUT, `${arm}-${run}.json`);
  if (existsSync(file)) { console.log(`exists ${arm}:${run}`); continue; }
  if (budget - (Date.now() - t0) < 70000) { console.log(`STOP budget before ${arm}:${run}`); break; }
  const srv = await serveArm(base, join(OUT, `serve-${base}.json`));
  try {
    const served = await checkServed(base, srv.port);
    if (!served.ok) { console.log(`VOID ${arm} served ${JSON.stringify(served)}`); continue; }
    const url = `http://localhost:${srv.port}/?ip=${arm}-${run}-${Date.now()}`;
    spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${srv.port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${srv.port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}: ${errText(e)}`); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm}`); process.exit(3); }
    for (let i = 0; i < 60 && (await c.evaluate("document.readyState")) !== 'complete'; i++) await sleep(250);
    await sleep(6000);
    if (kos.length) { await c.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(kos.map((k) => KO[k]).join('\n'))}; document.head.appendChild(s); return 1; })()`); await sleep(1500); }
    const ta = Date.now();
    const r = await runLoad(c, arm); c.close();
    Object.assign(r, { tool: 'fixes/de-offscreen/isplay-sim.mjs', engine: 'webkit-simulator', run, base, ko: kos, served, step: STEP, ms: Date.now() - ta });
    writeFileSync(file, JSON.stringify(r));
    const h = r.hit; const MB = (C) => Math.round(C.layers.reduce((s, l) => s + l.mem, 0) / 1e5) / 10;
    console.log(h ? `IPLINE ${arm}:${run} toggle ${h.toggles.map((t) => t.sel.split('.').pop() + '@' + t.y).join(',')} step y ${h.y} | before ${h.before.layers.length}L ${MB(h.before)}MB -> after ${h.after.layers.length}L ${MB(h.after)}MB -> +1s ${h.after1s.layers.length}L ${MB(h.after1s)}MB | tl ${JSON.stringify(h.timeline.counts)} | ${r.ms} ms`
      : `IPLINE ${arm}:${run} NO TOGGLE ${r.errors.join('; ')} pre ${JSON.stringify(r.preToggles)}`);
  } finally { srv.proc.kill(); }
}

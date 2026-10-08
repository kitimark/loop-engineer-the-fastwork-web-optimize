#!/usr/bin/env node
// de-offscreen (T-228 #87/#89), Simulator (WebKit, Mobile Safari): per composited layer at y 0 and at spot B (y 4600), its
// owner element, its bounds against the viewport, memory, compositing reasons, paints over a 3 s idle + a short scroll,
// and the animations / will-change on it. COUNTS ONLY, no timing judged (a functional session).
// Per arm (v0, e = g0.0e, f = g0.0f; own server each, plain http, --vendors=local --latency 150): one fresh load, settle
// 6 s, then per position P (top: y 0; B: jump 4000, 3 s, smooth to 4600, 1.5 s):
//   census C0 and at once C0b (LayerTree.layersForNode(<html>); C0b - C0 per layer = what a census itself adds to
//   paintCount, the known census artefact, research/gpu-props/README.md section 4);
//   Timeline (Page.disable/enable, Timeline.start): TimeStamp 'do:idle0', 3 s, 'do:idle1', scrollBy +250 +250 smooth,
//   0.7 s, back to P smooth, 1.2 s, 'do:end'; Paint records (clip quads) and Composite / Layout / RecalculateStyles counts
//   per window [idle0, idle1) and [idle1, end);
//   census C1 and C1b; owners of C1's layers (DOM.resolveNode + OWNER_INFO_FN), LayerTree.reasonsForCompositingLayer.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-offscreen -- \
//     node tools/sim.mjs session --functional --owner de-offscreen -- node fixes/de-offscreen/layers-sim.mjs [v0 e f]
// Existing out/de-offscreen/sim-<arm>.json are skipped (a second session resumes). One SIMLINE per arm.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WT, ARMS, serveArm, checkServed, OWNER_INFO_FN, sleep } from './common.mjs';
const { openTab, runAsync } = await import(join(WT, 'tools/lib/wip.mjs'));

const OUT = join(WT, 'out/de-offscreen'); mkdirSync(OUT, { recursive: true });
// knock-outs (diagnostic only, never a candidate build): one CSS rule each, injected as a <style> after the load settles,
// arm name <base>+<KO>[+<KO>...], e.g. e+A. Layer census only; the injection happens after load, so mount-time effects
// are not tested (fix-g0-box's ko5 covers the idle mount itself).
export const KO = {
  A: '.start-selling-top-nav.is-hero-pill:not(.is-expanded) .start-selling-morph-panel { display: none !important; }',
  B: '.start-selling [data-start-selling-scene="paused"] .start-selling-morph-col-track { animation: none !important; }',
  C: '.start-selling [data-start-selling-scene="paused"] .start-selling-platform-row [class*="start-selling-platform-row-title-"]::after { animation: none !important; }',
  D: '.start-selling [data-start-selling-scene="paused"] .zero-frame { animation: none !important; }',
  E: '.start-selling [data-start-selling-scene="paused"] .start-selling-avatars.is-carousel img { will-change: auto !important; }',
};
const only = process.argv.slice(2).filter((a) => ARMS[a.split('+')[0]] && a.split('+').slice(1).every((k) => KO[k]));
const arms = only.length ? only : Object.keys(ARMS);
const POS = { top: 0, B: 4600 };
const errText = (e) => e?.message || JSON.stringify(e);
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 270) * 1000;

function flat(records) { const out = []; const walk = (r) => { out.push({ type: r.type, start: r.startTime * 1000, end: (r.endTime ?? r.startTime) * 1000, data: r.data }); for (const ch of r.children || []) walk(ch); }; for (const r of records) walk(r); return out; }

async function layers(c) {
  const doc = await c.send('DOM.getDocument');
  const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
  return L.map((l) => ({ id: l.layerId, node: l.nodeId, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height], cb: l.compositedBounds && [l.compositedBounds.x, l.compositedBounds.y, l.compositedBounds.width, l.compositedBounds.height],
    mem: l.memory || 0, paints: l.paintCount || 0, pseudo: l.pseudoElement || null, gen: !!l.isGeneratedContent, anon: !!l.isAnonymous, refl: !!l.isReflection }));
}
async function census(c) { const y = await c.evaluate('scrollY'); return { at: Date.now(), y, layers: await layers(c) }; }

async function owners(c, L0) {
  // every DOM.getDocument resets the inspector's node ids (first session 13:58Z: "Missing node for given nodeId" for
  // every C1 layer after C1b's getDocument), so resolve the nodes of a fresh list; layer ids are stable across lists
  const fresh = new Map((await layers(c)).map((l) => [l.id, l]));
  const out = {};
  for (const l0 of L0) {
    const l = fresh.get(l0.id) || { ...l0, node: null };
    const rec = {};
    try { const r = await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.id }); rec.reasons = Object.entries(r.compositingReasons || {}).filter(([, v]) => v).map(([k]) => k); } catch (e) { rec.reasons = ['ERR ' + errText(e).slice(0, 60)]; }
    if (l.node) {
      try {
        const { object } = await c.send('DOM.resolveNode', { nodeId: l.node });
        const r = await c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true });
        rec.owner = r.result?.value || null;
        await c.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
      } catch (e) { rec.owner = { sel: '?', err: errText(e).slice(0, 80) }; }
    }
    out[l.id] = rec;
  }
  return out;
}

const RUNNING = `JSON.stringify(document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const e = a.effect, t = e && e.target; const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
  const c = t ? String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).slice(0, 2).join('.') : '';
  let it = null; try { it = e.getComputedTiming().iterations; } catch (x) {}
  return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', target: t ? t.localName + (c ? '.' + c : '') + (e.pseudoElement || '') : '?', timeline: !a.timeline ? 'none' : a.timeline === document.timeline ? 'doc' : a.timeline.constructor.name, inf: it === Infinity, rect: r ? [r.x, r.y, r.width, r.height].map(Math.round) : null }; }))`;
const WINDOW = (y) => `(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
  console.timeStamp('do:idle0'); await s(3000); console.timeStamp('do:idle1');
  scrollBy({ top: 250, behavior: 'smooth' }); await s(300); scrollBy({ top: 250, behavior: 'smooth' }); await s(700);
  scrollTo({ top: ${y}, behavior: 'smooth' }); await s(1200); console.timeStamp('do:end'); return scrollY; })()`;

async function runArm(c, arm) {
  const errors = []; const out = { arm, positions: {} };
  await c.send('DOM.enable').catch(() => {});
  await c.send('LayerTree.enable');
  out.page = await c.evaluate('({ ih: innerHeight, iw: innerWidth, dpr: devicePixelRatio, sh: document.documentElement.scrollHeight, ua: /iPhone/.test(navigator.userAgent) })');
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  for (const [pos, y] of Object.entries(POS)) {
    const P = {};
    try {
      if (y > 0) { await c.evaluate(`(scrollTo({ top: ${y - 600}, behavior: 'instant' }), 1)`); await sleep(3000); await c.evaluate(`(scrollTo({ top: ${y}, behavior: 'smooth' }), 1)`); await sleep(1500); }
      else { await c.evaluate('(scrollTo({ top: 0, behavior: "instant" }), 1)'); await sleep(1000); }
      P.C0 = await census(c); P.C0b = await census(c);
      recs = [];
      await c.send('Page.disable').catch(() => {}); await c.send('Page.enable').catch(() => {});
      await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] }).catch(() => {});
      await c.send('Timeline.start', { maxCallStackDepth: 1 });
      try { P.endY = await runAsync(c, WINDOW(y), { pollMs: 500, timeoutMs: 20000, key: `__do${pos}` }); } catch (e) { errors.push(`${pos} window: ${errText(e)}`); }
      await sleep(300); await c.send('Timeline.stop'); await c.send('Timeline.disable').catch(() => {});
      const f = flat(recs); const ts = (n) => f.find((r) => r.type === 'TimeStamp' && r.data?.message === n)?.start;
      const a = ts('do:idle0'), b = ts('do:idle1'), e = ts('do:end');
      const pick = (lo, hi) => f.filter((r) => r.start >= lo && r.start < hi);
      const sum = (rs) => { const o = {}; for (const r of rs) o[r.type] = (o[r.type] || 0) + 1; return o; };
      P.timeline = a == null || b == null || e == null ? { error: 'missing TimeStamps', types: sum(f) } : {
        idleMs: Math.round(b - a), scrollMs: Math.round(e - b), idle: sum(pick(a, b)), scroll: sum(pick(b, e)),
        paints: f.filter((r) => r.type === 'Paint' && r.start >= a && r.start < e).map((r) => ({ w: r.start < b ? 'idle' : 'scroll', t: Math.round(r.start - a), ms: Math.round((r.end - r.start) * 10) / 10, clip: r.data?.clip || null })),
        composites: f.filter((r) => r.type === 'Composite' && r.start >= a && r.start < e).map((r) => [Math.round(r.start - a), Math.round((r.end - r.start) * 10) / 10]) };
      P.C1 = await census(c); P.C1b = await census(c);
      P.running = JSON.parse(await c.evaluate(RUNNING));
      P.owners = await owners(c, P.C1.layers);
    } catch (e2) { errors.push(`${pos}: ${errText(e2)}`); }
    out.positions[pos] = P;
  }
  out.errors = errors;
  return out;
}

for (const arm of arms) {
  const [base, ...kos] = arm.split('+');
  const file = join(OUT, `sim-${arm}.json`);
  if (existsSync(file)) { console.log(`exists ${arm}`); continue; }
  if (budget - (Date.now() - t0) < 90000) { console.log(`STOP budget before ${arm}`); break; }
  const srv = await serveArm(base, join(OUT, `serve-sim-${base}.json`));
  try {
    const served = await checkServed(base, srv.port);
    if (!served.ok) { console.log(`VOID ${arm} served ${JSON.stringify(served)}`); continue; }
    const url = `http://localhost:${srv.port}/?do=${arm}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${srv.port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${srv.port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}: ${errText(e)} (open ${o.status})`); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm}`); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    await sleep(6000);
    if (kos.length) {
      const css = kos.map((k) => KO[k]).join('\n');
      await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'de-ko'; s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return 1; })()`);
      await sleep(1500);
    }
    const ta = Date.now();
    const r = await runArm(c, arm); c.close();
    Object.assign(r, { tool: 'fixes/de-offscreen/layers-sim.mjs', engine: 'webkit-simulator', base, ko: kos.map((k) => ({ k, css: KO[k] })), served, ready, ms: Date.now() - ta });
    writeFileSync(file, JSON.stringify(r));
    const s = (p) => { const P = r.positions[p] || {}; const L = P.C1?.layers || []; return `${p} y ${P.C1?.y} ${L.length}L ${Math.round(L.reduce((x, l) => x + l.mem, 0) / 1e5) / 10}MB paints idle ${P.timeline?.idle?.Paint ?? '?'} scroll ${P.timeline?.scroll?.Paint ?? '?'}`; };
    console.log(`SIMLINE ${arm}: ${s('top')} | ${s('B')} | ${r.ms} ms${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`);
  } finally { srv.proc.kill(); }
}

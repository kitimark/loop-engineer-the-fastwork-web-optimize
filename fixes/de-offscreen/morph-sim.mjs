#!/usr/bin/env node
// de-offscreen (T-228 #110), Simulator (WebKit, Mobile Safari): the nav / end-of-page layer tree per morph state, v0 and
// g0.0f. COUNTS ONLY (layers, bounds, backing memory, paintCount, compositing reasons, owners), no timing judged.
// Per arm (own server each, plain http, --vendors=local --latency 150, as layers-sim.mjs): one fresh load, settle 6 s, then
//   a  mid-page with the nav pill (y 2400; jump to 1800, 2 s, smooth to 2400, 1.5 s): census + owners
//   b  the end, m = 0 (scroll to the bottom, 3 s): census + owners, then 2 null steps (the census/idle paint control)
//   open, stepped: the tween's own rAF callback (T, the one whose source calls ZM) is held by a rAF shim and fed
//      virtual timestamps o + dt, dt = 16 33 50 67 100 140 200 280 380 500 680 ms (m = 0.07 .. 1); every other rAF
//      callback runs normally. Per step: Cf ~60 ms after the step (CSS transitions still running), Cs at ~450 ms;
//      owners of every layer new at that step; full owners at the steps nearest m 0.2 and 0.5 (state c)
//   d  m = 1, 1.5 s after the last step: census + owners, then 2 null steps
//   close, stepped the same way (m = 0.93 .. 0)
//   e  1.5 s after the close: census + owners
// The tween starts from a synthetic wheel event (deltaY +-120) on window, the original's jack listener A; CSS
// transitions are not held (they run in real time between steps), so a frozen step shows them settled at Cs.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner de-offscreen -- \
//     node tools/sim.mjs session --functional --owner de-offscreen -- node fixes/de-offscreen/morph-sim.mjs [v0 f]
// Arm "v0:noclock" (diagnostic knock-out, never a candidate) hides the panel countdown after load; MD_SUFFIX names a re-run.
// Existing out/de-offscreen/morph-<arm>.json are skipped (a second session resumes). One SIMLINE per arm.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { WT, ARMS, serveArm, checkServed, OWNER_INFO_FN, sleep } from './common.mjs';
const { openTab } = await import(join(WT, 'tools/lib/wip.mjs'));

const OUT = join(WT, 'out/de-offscreen'); mkdirSync(OUT, { recursive: true });
const KO_CSS = { noclock: '.start-selling-morph-center .waitlist-closing-countdown { display: none !important; }' };
const only = process.argv.slice(2).filter((a) => ARMS[a.split(':')[0]] && (!a.split(':')[1] || KO_CSS[a.split(':')[1]]));
const arms = only.length ? only : ['v0', 'f'];
const MID = 2400;
const DTS = [16, 33, 50, 67, 100, 140, 200, 280, 380, 500, 680];
const errText = (e) => e?.message || JSON.stringify(e);
const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 280) * 1000;

async function layers(c) {
  const doc = await c.send('DOM.getDocument');
  const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
  return L.map((l) => ({ id: l.layerId, node: l.nodeId, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height],
    mem: l.memory || 0, paints: l.paintCount || 0, pseudo: l.pseudoElement || null, gen: !!l.isGeneratedContent, anon: !!l.isAnonymous }));
}
const STATE = `JSON.stringify((() => { const h = document.querySelector('.start-selling-top-nav'); const p = document.querySelector('.start-selling-platform');
  const cls = (e) => e ? String(e.className).split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).join('.') : null;
  return { y: Math.round(scrollY), ih: innerHeight, sh: document.documentElement.scrollHeight, m: h ? h.style.getPropertyValue('--morph') : null, nav: cls(h),
    navStyle: h ? (h.getAttribute('style') || '').slice(0, 300) : null, fade: p ? p.style.getPropertyValue('--morph-fade') : null,
    held: (window.__mdHeld && window.__mdHeld.size) || 0,
    faces: document.querySelectorAll('.start-selling-morph-center .face').length, facesAll: document.querySelectorAll('.face').length,
    pfPaused: p ? p.hasAttribute('data-fw-pf-paused') : null,
    cd: (() => { const n = document.querySelector('.start-selling-morph-center [data-testid="sliding-number"]'); return n ? n.getAttribute('data-value') : null; })() }; })())`;
async function census(c) { const s = JSON.parse(await c.evaluate(STATE)); return { at: Date.now(), ...s, layers: await layers(c) }; }

async function owners(c, ids) {
  const fresh = new Map((await layers(c)).map((l) => [l.id, l]));
  const out = {};
  for (const id of ids) {
    const l = fresh.get(id); if (!l) { out[id] = { gone: true }; continue; }
    const rec = {};
    try { const r = await c.send('LayerTree.reasonsForCompositingLayer', { layerId: id }); rec.reasons = Object.entries(r.compositingReasons || {}).filter(([, v]) => v).map(([k]) => k); } catch (e) { rec.reasons = ['ERR ' + errText(e).slice(0, 60)]; }
    if (l.node) {
      try {
        const { object } = await c.send('DOM.resolveNode', { nodeId: l.node });
        const r = await c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true });
        rec.owner = r.result?.value || null;
        await c.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
      } catch (e) { rec.owner = { sel: '?', err: errText(e).slice(0, 80) }; }
    }
    out[id] = rec;
  }
  return out;
}
const RUNNING = `JSON.stringify(document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const e = a.effect, t = e && e.target;
  const c = t ? String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).slice(0, 2).join('.') : '';
  return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', target: t ? t.localName + (c ? '.' + c : '') + (e.pseudoElement || '') : '?' }; }))`;
// rAF shim: holds only the morph tween's callback (its source calls ZM) while __mdHold is on
const SHIM = `(() => { if (window.__mdShim) return 'again'; window.__mdShim = 1; const R = window.requestAnimationFrame.bind(window), X = window.cancelAnimationFrame.bind(window);
  const H = window.__mdHeld = new Map(); let k = -1; window.__mdHold = false; window.__mdSeen = 0;
  window.requestAnimationFrame = (cb) => { if (window.__mdHold && typeof cb === 'function' && /ZM\\(/.test(String(cb))) { const id = k--; H.set(id, cb); window.__mdSeen++; return id; } return R(cb); };
  window.cancelAnimationFrame = (id) => { if (id < 0) H.delete(id); else X(id); };
  window.__mdStep = (vt) => { const cbs = [...H.values()]; H.clear(); for (const cb of cbs) cb(vt); return { ran: cbs.length, held: H.size }; };
  window.__mdTrigger = (dy) => { window.__mdHold = true; const t1 = performance.now(); const ev = new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }); window.dispatchEvent(ev); window.__mdO = t1; return { t1, prevented: ev.defaultPrevented, held: H.size }; };
  return 'ok'; })()`;

async function stepped(c, P, dir, errors) {
  const trig = JSON.parse(await c.evaluate(`JSON.stringify(window.__mdTrigger(${dir > 0 ? 120 : -120}))`));
  P.trigger = trig;
  if (!trig.held) { errors.push(`${dir > 0 ? 'open' : 'close'}: trigger held no tween callback ${JSON.stringify(trig)}`); return []; }
  const steps = [];
  let prevIds = new Set((P.base?.layers || []).map((l) => l.id));
  for (const dt of DTS) {
    const S = { dt };
    S.ran = JSON.parse(await c.evaluate(`JSON.stringify(window.__mdStep(window.__mdO + ${dt}))`));
    await sleep(60); S.Cf = await census(c);
    await sleep(Math.max(0, 450 - 60 - (Date.now() - S.Cf.at)));
    S.Cs = await census(c);
    const ids = new Set([...S.Cf.layers, ...S.Cs.layers].map((l) => l.id));
    const fresh = S.Cs.layers.map((l) => l.id).filter((id) => !prevIds.has(id));
    const m = Number(S.Cs.m);
    const full = (dir > 0 && (dt === 50 || dt === 140)) || (dir < 0 && (dt === 140 || dt === 380));
    S.owners = await owners(c, full ? S.Cs.layers.map((l) => l.id) : fresh);
    S.full = full; S.mNum = m;
    if (full) S.running = JSON.parse(await c.evaluate(RUNNING));
    prevIds = ids;
    steps.push(S);
  }
  await c.evaluate('(window.__mdHold = false, 1)');
  return steps;
}
async function nullSteps(c, n) { const out = []; for (let i = 0; i < n; i++) { await sleep(60); const Cf = await census(c); await sleep(Math.max(0, 390 - (Date.now() - Cf.at))); out.push({ Cf, Cs: await census(c) }); } return out; }
async function state(c, settleMs) { await sleep(settleMs); const C = await census(c); const Cb = await census(c); const own = await owners(c, Cb.layers.map((l) => l.id)); return { C, Cb, owners: own, running: JSON.parse(await c.evaluate(RUNNING)) }; }

async function runArm(c, arm) {
  const errors = []; const out = { arm, states: {} };
  await c.send('DOM.enable').catch(() => {});
  await c.send('LayerTree.enable');
  out.page = await c.evaluate('({ ih: innerHeight, iw: innerWidth, dpr: devicePixelRatio, sh: document.documentElement.scrollHeight, rm: matchMedia("(prefers-reduced-motion: reduce)").matches })');
  try {
    await c.evaluate(`(scrollTo({ top: ${MID - 600}, behavior: 'instant' }), 1)`); await sleep(2000);
    await c.evaluate(`(scrollTo({ top: ${MID}, behavior: 'smooth' }), 1)`);
    out.states.a = await state(c, 1500);
  } catch (e) { errors.push(`a: ${errText(e)}`); }
  try {
    out.shim = await c.evaluate(SHIM);
    await c.evaluate('(scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }), 1)');
    out.states.b = await state(c, 3000);
    out.states.b.nul = await nullSteps(c, 2);
  } catch (e) { errors.push(`b: ${errText(e)}`); }
  try { const P = { base: out.states.b?.Cb }; P.steps = await stepped(c, P, +1, errors); delete P.base; out.open = P; } catch (e) { errors.push(`open: ${errText(e)}`); }
  try { out.states.d = await state(c, 1500); out.states.d.nul = await nullSteps(c, 2); } catch (e) { errors.push(`d: ${errText(e)}`); }
  try { const P = { base: out.states.d?.Cb }; P.steps = await stepped(c, P, -1, errors); delete P.base; out.close = P; } catch (e) { errors.push(`close: ${errText(e)}`); }
  try { out.states.e = await state(c, 1500); } catch (e) { errors.push(`e: ${errText(e)}`); }
  out.errors = errors;
  return out;
}

for (const spec of arms) {
  const [arm, ko] = spec.split(':');
  const file = join(OUT, `morph-${arm}${ko ? '-' + ko : ''}${process.env.MD_SUFFIX || ''}.json`);
  if (existsSync(file)) { console.log(`exists ${arm}`); continue; }
  if (budget - (Date.now() - t0) < 110000) { console.log(`STOP budget before ${arm}`); break; }
  const srv = await serveArm(arm, join(OUT, `serve-morph-${arm}.json`));
  try {
    const served = await checkServed(arm, srv.port);
    if (!served.ok) { console.log(`VOID ${arm} served ${JSON.stringify(served)}`); continue; }
    const url = `http://localhost:${srv.port}/?do=morph-${arm}-${Date.now()}`;
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
    // diagnostic knock-out (never a candidate): arm "<arm>:<ko>" injects KO_CSS[ko] after the load settles
    if (ko) { await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'de-ko'; s.textContent = ${JSON.stringify(KO_CSS[ko])}; document.head.appendChild(s); return 1; })()`); await sleep(1500); }
    const ta = Date.now();
    const r = await runArm(c, arm); c.close();
    Object.assign(r, { tool: 'fixes/de-offscreen/morph-sim.mjs', engine: 'webkit-simulator', served, ready, ko: ko ? { ko, css: KO_CSS[ko] } : null, ms: Date.now() - ta });
    writeFileSync(file, JSON.stringify(r));
    const s = (k) => { const P = r.states[k]; const L = P?.Cb?.layers || []; return `${k} y ${P?.Cb?.y} m ${P?.Cb?.m || 0} ${L.length}L ${Math.round(L.reduce((x, l) => x + l.mem, 0) / 1e5) / 10}MB`; };
    const st = (P) => (P?.steps || []).map((S) => `${S.Cs.m || 0}:${S.Cs.layers.length}`).join(' ');
    console.log(`SIMLINE ${spec}: ${['a', 'b', 'd', 'e'].map(s).join(' | ')} | open ${st(r.open)} | close ${st(r.close)} | ${r.ms} ms${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`);
  } finally { srv.proc.kill(); }
}

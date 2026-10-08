#!/usr/bin/env node
// P-167 follow-up (lead 13:4xZ, question b): what invalidates layout at y 280-555 on g0.0e but not on v0? On the phone
// (P-167 window A) g0.0e and e-ko2 run two whole-viewport Layout records (~21-24 + 15-16 ms) inside one frame, twice per
// run, with NO DOM mutation and NO crossing in that frame or the one before, and InvalidateLayout without a JS stack.
// Simulator, COUNTS ONLY (no timing claim; Simulator ms are not phone ms): per arm one fresh load, 6 s idle, Timeline on
// (maxCallStackDepth 5), then the W-like steps 0 -> 1000 (scrollBy 250 smooth every 300 ms, then 2 s). Logged in the page:
// every rAF's scrollY, every resource `load` event (capture, so <img> loads too), every `error`, and decode-completes
// of <img> with loading=lazy. From the Timeline: each Layout record (root, ms), the InvalidateLayout records before it
// (with stack if any), and the RenderingFrame they are in; each is placed at the page y of its frame.
// Run (one shared Simulator session, <= 300 s):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p167-layout.mjs [arm ...]
// Output: out/p167/layout/layout-<arm>.json; one LAYOUTLINE per arm on stdout.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.P167_LAYOUTDIR || 'out/p167/layout'); mkdirSync(D, { recursive: true });
const ARMS = ['v0', 'e', 'ko2', 'ko3', 'ko4', 'ko5', 'ko245'];   // ko3 = no data-fw-wc will-change windows (fwWC no-op)
const errText = (e) => e?.message || JSON.stringify(e);

const PAGE_LOG = `(() => { const L = window.__p167L = { f: [], ev: [] };
  const loop = () => { L.f.push([performance.now(), scrollY]); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  const name = (t) => { if (!t || !t.tagName) return String(t && t.nodeName); const s = t.currentSrc || t.src || t.href || ''; const c = typeof t.className === 'string' ? t.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x))[0] || '' : '';
    let r = t.getBoundingClientRect(); return t.tagName.toLowerCase() + (c ? '.' + c : '') + (s ? ' ' + s.split('/').pop().slice(0, 40) : '') + ' @' + Math.round(r.top + scrollY) + 'x' + Math.round(r.height); };
  for (const k of ['load', 'error']) document.addEventListener(k, (e) => L.ev.push([performance.now(), scrollY, k, name(e.target)]), true);
  if (window.ResizeObserver) { const ro = new ResizeObserver((es) => { for (const x of es) L.ev.push([performance.now(), scrollY, 'resize', name(x.target)]); });
    for (const s of document.querySelectorAll('section, [data-start-selling-render], main > *')) ro.observe(s); }
  return 'ok'; })()`;
const STEPS = `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0; while (scrollY < 1000 && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(2000); return { steps: n, y: scrollY, deferred: document.querySelectorAll('[data-start-selling-render="deferred"]').length }; })()`;

function flatten(recs, out = [], parent = null) {
  for (const r of recs || []) { out.push({ r, parent }); flatten(r.children, out, r); }
  return out;
}

async function runArm(c, arm) {
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.evaluate(PAGE_LOG);
  await sleep(6000);
  for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 5 }]]) await c.send(m, p);
  const syncT = await c.evaluate(timelineSyncJs('p167sync'));
  const page = await runAsync(c, STEPS, { pollMs: 500, timeoutMs: 40000, key: '__p167L1' });
  await sleep(300);
  await c.send('Timeline.stop').catch(() => {});
  await sleep(500);
  const L = JSON.parse(await c.evaluate('JSON.stringify(window.__p167L)'));
  const syncTL = findTimeStamp(recs, 'p167sync');
  const off = syncTL == null ? null : syncTL * 1000 - syncT;   // Timeline ms = page ms + off
  const yAt = (pageMs) => { let y = null; for (const [t, v] of L.f) { if (t > pageMs) break; y = v; } return y; };
  const all = flatten(recs);
  const frames = all.filter((x) => x.r.type === 'RenderingFrame');
  const layouts = [];
  const obs = (fr) => flatten(fr.r.children).filter((x) => x.r.type === 'ObserverCallback').map((x) => (x.r.data?.type || '').replace('Observer', 'O') + (x.r.children || []).map((k) => k.data?.scriptLine ? '@' + k.data.scriptLine : '').join('') + (JSON.stringify(x.r).includes('setAttribute') ? '(setAttr)' : ''));
  frames.forEach((fr, fi) => {
    const kids = flatten(fr.r.children);
    const lay = kids.filter((x) => x.r.type === 'Layout');
    if (!lay.length) return;
    const pm = off == null ? null : fr.r.startTime * 1000 - off;
    const inv = kids.filter((x) => x.r.type === 'InvalidateLayout').map((x) => ({ under: x.parent?.type, stack: (x.r.stackTrace?.callFrames || []).slice(0, 3).map((f) => `${f.functionName}@${String(f.url).split('/').pop()}:${f.lineNumber}`).join(' < ') }));
    layouts.push({ pageMs: pm && Math.round(pm), y: pm == null ? null : yAt(pm), n: lay.length, ms: lay.map((x) => Math.round(((x.r.endTime ?? x.r.startTime) - x.r.startTime) * 10000) / 10),
      roots: lay.map((x) => (x.r.data?.root || []).join(',')), under: lay.map((x) => x.parent?.type), inv,
      prevObs: frames.slice(Math.max(0, fi - 3), fi).map(obs).flat(), obs: obs(fr) });
  });
  // layouts not inside a RenderingFrame (forced by script)
  const forced = all.filter((x) => x.r.type === 'Layout' && !frames.some((fr) => flatten(fr.r.children).some((k) => k.r === x.r)))
    .map((x) => ({ y: off == null ? null : yAt(x.r.startTime * 1000 - off), under: x.parent?.type, stack: (x.r.stackTrace?.callFrames || []).slice(0, 3).map((f) => `${f.functionName}@${String(f.url).split('/').pop()}:${f.lineNumber}`).join(' < ') }));
  const ev = L.ev.filter(([t]) => t >= syncT).map(([t, y, k, n]) => ({ y: Math.round(y), k, n }));
  return { arm, page, off, nRecs: recs.length, layouts, forced, ev };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const only = process.argv.slice(2);
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 235) * 1000;
  for (const arm of ARMS) {
    if (only.length && !only.includes(arm)) continue;
    if (existsSync(join(D, `layout-${arm}.json`))) { console.log(`exists ${arm}`); continue; }
    if (budget - (Date.now() - t0) < 50000) { console.log(`STOP budget before ${arm}`); break; }
    const port = JSON.parse(readFileSync(join(WT, `out/p167/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p167l=${arm}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}: ${errText(e)}`); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm} (open ${o.status})`); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    let r; try { r = await runArm(c, arm); } catch (e) { console.log(`ERR ${arm}: ${errText(e)}`); c.close(); continue; }
    c.close(); r.url = url; r.ready = ready;
    writeFileSync(join(D, `layout-${arm}.json`), JSON.stringify(r, null, 1));
    const band = r.layouts.filter((l) => l.y != null && l.y >= 200 && l.y <= 650);
    console.log(`LAYOUTLINE ${arm}: frames with Layout ${r.layouts.length} (2+ layouts: ${r.layouts.filter((l) => l.n > 1).length}), forced ${r.forced.length}; y 200-650: ${band.map((l) => `y${l.y} n${l.n} [${l.ms.join('+')}] prev:${l.prevObs.filter((o) => o.includes('setAttr')).join('|') || '-'}`).join('; ') || 'none'}; loads/resizes in window ${r.ev.length}`);
  }
}

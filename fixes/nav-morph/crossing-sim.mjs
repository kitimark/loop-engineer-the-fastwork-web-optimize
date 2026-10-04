// P-096 (F3 crossing-frame count check, fixes/nav-morph/README.md "Draft ticket P-096"), Simulator part (fix-nav-morph).
// Counts only; Simulator ms are never judged (F-084). The Simulator decides only mechanism M (the census); record counts
// per frame are descriptive. One rep per call (one shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-morph/crossing-sim.mjs --rep 1 [--order C,V,C2] [--dry]
// Per load (cold: a new server on a new port; Safari navigates to it): the same server flags as crossing-chrome.mjs, the
// plain-http twin; served hashes checked first. Rest 6 s at the top; the same census and panel poll as crossing-chrome.mjs
// (identical in-page code); WebKit Timeline on (tools/lib/wip.mjs TIMELINE_START, maxCallStackDepth 1) with a mark sync;
// the same scroll (0 -> 3000 at 16 px per rAF, 1 s rest; Safari's evaluate cannot await, so it is polled at ~0.7 Hz).
// Saves out/nav-morph/p096/sim-r<rep>-<arm>.json: {meta, served, sync: {syncT, syncTL}, scroll, census, recs}.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { openTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp, runAsync } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REP = Number(arg('--rep', '0'));
const ORDERS = { 1: 'C,V,C2', 2: 'V,C2,C', 3: 'C2,C,V' };
const ORDER = arg('--order', ORDERS[REP] || 'C').split(',');
const DRY = argv.includes('--dry');
const OUT = join(WT, 'out/nav-morph/p096'); mkdirSync(OUT, { recursive: true });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const BASE = resolveTree('site-pretty');
const V_SNAP = join(WT, 'out/snapshots/best-65052c4a3902');
const ARMS = {
  C: { overlay: null, js: '4606120cf392', css: '27776f3d4138', cb: [13083, 13] },
  C2: { overlay: null, js: '4606120cf392', css: '27776f3d4138', cb: [13083, 13] },
  V: { overlay: V_SNAP, js: '65052c4a3902', css: 'e0f92804c521', cb: [13378, 13] },
};
const REST_MS = 6000, TO_Y = 3000, STEP = 16;
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const CENSUS_JS = `(() => {
  const P = '.start-selling-morph-panel', rec = window.__p096 = { muts: [], panelFirst: null, panelAtStart: !!document.querySelector(P) };
  const desc = (n) => { if (!n || n.nodeType !== 1) return n ? n.nodeName : null; const c = [...n.classList].filter((x) => !x.startsWith('svelte-')).slice(0, 2).join('.'); return n.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const inPanel = (n) => !!(n && n.nodeType === 1 && n.closest && n.closest(P));
  new MutationObserver((list) => { const t = performance.now(); for (const m of list) rec.muts.push([Math.round(t * 10) / 10, m.type, m.attributeName || null, desc(m.target), inPanel(m.target) ? 1 : 0,
    m.type === 'attributes' ? String(m.oldValue ?? '').slice(0, 40) : m.addedNodes.length, m.type === 'attributes' && m.target.getAttribute ? String(m.target.getAttribute(m.attributeName) ?? '').slice(0, 40) : m.removedNodes.length,
    m.attributeName === 'inert' || (m.type === 'attributes' && m.target === document.querySelector(P)) ? (m.target.querySelectorAll ? m.target.querySelectorAll('*').length : 0) : null]); })
    .observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true, subtree: true });
  const poll = (t) => { if (rec.panelFirst == null && document.querySelector(P)) rec.panelFirst = Math.round(t * 10) / 10; if (!rec.stop) requestAnimationFrame(poll); };
  requestAnimationFrame(poll); return rec.panelAtStart; })()`;
const SCROLL_JS = `new Promise((res) => { const t0 = performance.now(); const ts = []; let y = 0;
  const step = (t) => { ts.push([Math.round(t * 10) / 10, Math.round(scrollY)]); if (y < ${TO_Y}) { y = Math.min(${TO_Y}, y + ${STEP}); window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(step); } else setTimeout(() => { window.__p096.stop = true; res(JSON.stringify({ t0, ts })); }, 1000); };
  requestAnimationFrame(step); })`;

async function serve(arm, i) {
  const st = join(OUT, `serve-sim-${process.pid}-${arm}${i}.json`); rmSync(st, { force: true });
  const a = ARMS[arm];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(a.overlay ? ['--overlay', a.overlay] : []), '--port', '0', '--https', '--vendors=local', '--latency', '150', '--no-cache', '--quiet', '--state', st], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s?.httpTwin) { p.kill(); throw new Error(arm + ': server did not start (or no http twin)'); }
  rmSync(st, { force: true });
  return { proc: p, port: s.httpTwin, url: `http://localhost:${s.httpTwin}/` };
}

console.log(`P096 sim rep ${REP}${DRY ? ' (DRY, uncounted)' : ''} order ${ORDER.join(',')}`);
for (let i = 0; i < ORDER.length; i++) {
  const arm = ORDER[i]; const a = ARMS[arm];
  const R = { meta: { ticket: 'P-096', tool: 'crossing-sim.mjs', rep: REP, dry: DRY, arm, slot: i, order: ORDER, at: new Date().toISOString(), restMs: REST_MS, toY: TO_Y, step: STEP, cb: a.cb, device: 'simulator' } };
  const f = join(OUT, `sim-${DRY ? 'dry' : 'r' + REP}-${arm}.json`);
  let srv = null, c = null;
  try {
    srv = await serve(arm, i);
    R.served = {
      js: sha(Buffer.from(await (await fetch(new URL(NODE, srv.url))).arrayBuffer())),
      css: sha(Buffer.from(await (await fetch(new URL(CSS, srv.url))).arrayBuffer())),
    };
    if (R.served.js !== a.js || R.served.css !== a.css) { R.void = `served ${R.served.js}/${R.served.css}`; console.log('VOID', arm, R.void); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', srv.url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${srv.port}`);
    for (let k = 0; k < 60; k++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    R.viewport = JSON.parse(await c.evaluate('JSON.stringify([innerWidth, innerHeight, devicePixelRatio])'));
    await c.evaluate('window.scrollTo({ top: 0, behavior: "instant" }), 1');
    await sleep(REST_MS);
    R.panelAtStart = await c.evaluate(CENSUS_JS);
    const recs = [];
    c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of TIMELINE_START) await c.send(m, prm);
    await sleep(300);
    const syncT = await c.evaluate(timelineSyncJs('fw-p096-sync'));
    R.scroll = JSON.parse(await runAsync(c, SCROLL_JS, { pollMs: 1500, timeoutMs: 120000, key: '__p096res' }));
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    R.census = JSON.parse(await c.evaluate('JSON.stringify(window.__p096)'));
    const syncTL = findTimeStamp(recs, 'fw-p096-sync');
    R.sync = { syncT, syncTL };
    R.recs = recs;
    R.summary = { recs: recs.length, sync: syncTL != null, frames: R.scroll.ts.length, muts: R.census.muts.length, panelAtStart: R.panelAtStart, panelFirst: R.census.panelFirst, viewport: R.viewport };
    console.log(arm, JSON.stringify(R.summary));
  } catch (e) { R.error = String(e.stack || e.message || e); console.log(arm, 'error', R.error.split('\n')[0]); }
  finally { try { c?.close(); } catch {} srv?.proc.kill(); writeFileSync(f, JSON.stringify(R)); console.log('wrote', f.replace(WT + '/', '')); }
}

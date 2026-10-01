// WebKit work-count probe (de-counts-sim, 2026-10-02). Research one-off, NOT tooling: counts only, no timing verdict.
// Runs against the Safari tab the WIP proxy lists on $FW_IPHONE_PORT (inside `tools/sim.mjs session` that is the
// Simulator's :9232; it must never be pointed at the phone, see work-counts-webkit.md). One inspector client per page
// (I-038): nothing else may be attached while it runs.
//
// Sequence (shared scroll points with de-counts-chrome, research/design-engineering/work-counts.md):
//   reload, 8 s settle, then Page.disable/enable (stopwatch, F-047), DOM.getDocument, LayerTree.enable,
//   Animation.startTracking, Timeline.start(depth TLDEPTH, instruments [Timeline]);
//   idle-top: IDLE_MS (6000) at y 0, marked in two halves (idle-a, idle-b = the last 3 s);
//   walk: instant scrollTo every STEP (250) px to the end, DWELL (700) ms per window;
//   after each window: mark c<i>, LayerTree census, then page reads (getAnimations, MO bucket); records between
//   c<i> and the next window's mark are excluded (the reads may force style).
// Window boundaries are performance.mark() TimeStamp records inside the Timeline stream, so no clock sync is needed.
// usage: node wkcounts.mjs <out.json> <label> <url>     navigates the one Safari tab to <url> (location.href; no new
//        node wkcounts.mjs --warm <url>                 tabs, so the tab match never turns ambiguous), or warms it up
import { writeFileSync } from 'node:fs';
import { openTab, sleep } from './simtab.mjs';

const WARM = process.argv[2] === '--warm';
const [out, label, url] = WARM ? [null, null, process.argv[3]] : process.argv.slice(2);
if (!url) { console.error('usage: node wkcounts.mjs <out.json> <label> <url> | --warm <url>'); process.exit(1); }
const TLDEPTH = Number(process.env.TLDEPTH || 8);
const IDLE_MS = Number(process.env.IDLE_MS || 6000);
const STEP = Number(process.env.STEP || 250);
const DWELL = Number(process.env.DWELL || 700);
const host = new URL(url).host;

let c = await openTab((u) => u.startsWith('http'));
await c.evaluate(`scrollTo({top: 0, behavior: 'instant'}); setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 300); 'ok'`);
c.close();
await sleep(2500);
c = await openTab(host);
for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
if (WARM) { await sleep(5000); c.close(); console.log(`warm ${host} ok`); process.exit(0); }
await sleep(8000);

// page-side counters (engine-neutral; the same JS runs in Chrome):
// (1) de-counts-chrome's MO_INSTALL, verbatim (research/design-engineering/work-counts/probe.mjs): __wcTake() returns the
//     counts since the last call and resets; no style/layout reads;
// (2) ours: the subtree size of every element whose attribute really changed (the upper bound of a descendant-
//     invalidation scope), bucketed by window.
const MO_INSTALL = `(() => {
  const sel = (e) => e.id ? '#' + e.id : (e.tagName || '?').toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.') : '');
  let c = null;
  const reset = () => { c = { add: 0, rem: 0, attr: 0, attrNoop: 0, text: 0, keys: new Map() }; };
  reset();
  const eat = (ms) => { for (const m of ms) {
    if (m.type === 'childList') { c.add += m.addedNodes.length; c.rem += m.removedNodes.length; continue; }
    if (m.type === 'characterData') { c.text++; continue; }
    const v = m.target.getAttribute(m.attributeName);
    if (v === m.oldValue) { c.attrNoop++; continue; }
    c.attr++; const k = sel(m.target) + ' @' + m.attributeName; c.keys.set(k, (c.keys.get(k) || 0) + 1);
  } };
  const mo = new MutationObserver(eat);
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  window.__wcTake = () => { eat(mo.takeRecords()); const r = { add: c.add, rem: c.rem, attr: c.attr, attrNoop: c.attrNoop, text: c.text, top: [...c.keys].sort((a, b) => b[1] - a[1]).slice(0, 4) }; reset(); return r; };
  return true;
})()`;
await c.evaluate(MO_INSTALL);
await c.evaluate(`(() => {
  const W = window.__wk = { win: 'pre', sub: {} };
  const desc = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList && el.classList.length ? '.' + [...el.classList].filter((x) => !x.startsWith('svelte-')).slice(0, 2).join('.') : '');
  const mo = new MutationObserver((list) => {
    const b = W.sub[W.win] || (W.sub[W.win] = { n: 0, subtree: 0, top: {} });
    for (const m of list) {
      if (m.type !== 'attributes' || m.target.getAttribute(m.attributeName) === m.oldValue) continue;
      const n = m.target.getElementsByTagName('*').length + 1;
      b.n++; b.subtree += n;
      const k = desc(m.target) + ' @' + m.attributeName + ' ' + n;
      b.top[k] = (b.top[k] || 0) + 1;
    }
  });
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true });
  W.mo_ = mo;
  return 'ok';
})()`);
await c.evaluate('window.__wcTake(); "ok"');

const tlRecs = [];
const anim = [];
c.on((m) => {
  if (m.method === 'Timeline.eventRecorded') tlRecs.push(m.params.record);
  else if (m.method === 'Animation.trackingUpdate') anim.push({ t: m.params.timestamp, ...m.params.event });
});
const doc = await c.send('DOM.getDocument', { depth: 0 });
const rootId = doc.root.nodeId;
// the <html> element's renderer is the RenderView's child; layersForNode needs an element/document with a renderer
for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['LayerTree.enable', {}], ['Animation.startTracking', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: TLDEPTH }]]) {
  try { await c.send(m, p); } catch (e) { console.error(m, JSON.stringify(e.message || e)); }
}
const census = async () => {
  try {
    const r = await c.send('LayerTree.layersForNode', { nodeId: rootId });
    const L = {};
    let mem = 0;
    for (const l of r.layers) { L[l.layerId] = [l.paintCount, l.memory, l.nodeId]; mem += l.memory; }
    return { n: r.layers.length, mem, L };
  } catch (e) { return { err: String(e.message || JSON.stringify(e)) }; }
};
// window end: take the MO counts first (no style read), then the subtree bucket, then getAnimations (flushes style;
// excluded from the window by the c:<k> mark that precedes it)
const take = () => c.evaluate('JSON.stringify(window.__wcTake())').then(JSON.parse);
const pageRead = (w) => c.evaluate(`JSON.stringify((() => { const W = window.__wk; const a = document.getAnimations();
  return { y: Math.round(scrollY), anims: a.length, running: a.filter((x) => x.playState === 'running').length, sub: W.sub[${JSON.stringify(w)}] || null }; })())`).then(JSON.parse);
const mark = (k) => c.evaluate(`performance.mark(${JSON.stringify('wk:' + k)}); window.__wk.win = ${JSON.stringify(k)}; 'ok'`);

const windows = [];
// IDLE_Y (default 0): run the idle phase at this scroll position instead of the top (e.g. 1500: carousel on screen);
// WALK=0 skips the step walk (idle-only runs)
const IDLE_Y = Number(process.env.IDLE_Y || 0);
if (IDLE_Y) { await c.evaluate(`scrollTo({top: ${IDLE_Y}, behavior: 'instant'}); 'ok'`); await sleep(2000); }
const L0 = await census();
await take();
await mark('idle-a'); await sleep(IDLE_MS / 2);
const moA = await take();
await mark('idle-b'); await sleep(IDLE_MS / 2);
const moB = await take();
await mark('c:idle');
let L = await census();
windows.push({ k: 'idle', y: IDLE_Y, layers: L, mo: moB, moA, page: await pageRead('idle-b'), pageA: await pageRead('idle-a') });
const geo = JSON.parse(await c.evaluate('JSON.stringify({maxY: document.documentElement.scrollHeight - innerHeight, docH: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent})'));
// Y_FROM / Y_TO (defaults STEP / maxY): walk only that range (e.g. Y_FROM=2500 Y_TO=3050 STEP=30 for a crossing hunt)
const Y_FROM = Number(process.env.Y_FROM || STEP), Y_TO = Math.min(Number(process.env.Y_TO || geo.maxY), geo.maxY);
if (process.env.Y_FROM) { await c.evaluate(`scrollTo({top: ${Y_FROM - STEP}, behavior: 'instant'}); 'ok'`); await sleep(DWELL); }
for (let y = Y_FROM, i = 0; process.env.WALK !== '0'; y += STEP, i++) {
  const ty = Math.min(y, Y_TO);
  const k = `w${i}`;
  await take(); // the census/read gap's mutations: discarded
  await c.evaluate(`performance.mark('wk:${k}'); window.__wk.win = '${k}'; scrollTo({top: ${ty}, behavior: 'instant'}); 'ok'`);
  await sleep(DWELL);
  const mo = await take();
  await mark(`c:${k}`);
  L = await census();
  windows.push({ k, y: ty, layers: L, mo, page: await pageRead(k) });
  if (ty >= Y_TO) break;
}
await mark('end');
try { await c.send('Timeline.stop'); } catch (e) {}
try { await c.send('Animation.stopTracking'); } catch (e) {}
await sleep(4000);
try { await c.send('LayerTree.disable'); } catch (e) {}
try { await c.send('Page.disable'); } catch (e) {}
await c.evaluate('window.__wk && window.__wk.mo_ && window.__wk.mo_.disconnect(); "ok"').catch(() => {});
c.close();

const res = { meta: { label, date: new Date().toISOString(), device: process.env.FW_SIM_SESSION ? 'simulator' : 'unknown', tldepth: TLDEPTH, idleMs: IDLE_MS, idleY: IDLE_Y, walk: process.env.WALK !== '0', step: STEP, dwell: DWELL, host: host.replace(/^[^:]+/, 'localhost') }, geo, L0, windows, anim, nRecs: tlRecs.length };
writeFileSync(out, JSON.stringify(res));
writeFileSync(out.replace(/\.json$/, '.tl.json'), JSON.stringify(tlRecs));
console.log(`${label}: ${windows.length} windows, ${tlRecs.length} top records, ${anim.length} animation events, layers ${L0.n}→${L.n}, docH ${geo.docH}, vp ${geo.iw}x${geo.ih}`);
process.exit(0);

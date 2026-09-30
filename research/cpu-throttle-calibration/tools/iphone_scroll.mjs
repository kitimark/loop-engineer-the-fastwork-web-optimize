// Scripted smooth-scroll jank probe on iPhone Safari — same in-page semantics as the Chrome probe
// (scratchpad chrome_scroll.mjs): reload, wait 8s, rAF frame logger [t, dt, scrollY], 3s idle,
// scrollBy({top:250, behavior:'smooth'}) every 300ms until bottom (cap 45s), 3s at bottom.
// WebKit has no long-animation-frame, so only the rAF logger runs in-page.
// Optional --timeline: also record WebKit Timeline in ~1s chunks (Timeline.start/stop) for event counts
// (instrumentation overhead => do not use those runs for frame timing).
// Usage: node iphone_scroll.mjs <out.json> [--timeline]
import fs from 'node:fs';
import {openTab, sleep} from './iphone_wip.mjs';

const OUT = process.argv[2] || 'iphone_scroll.json';
const TIMELINE = process.argv.includes('--timeline');

let c = await openTab(u => u.includes('fastwork.com') || u === 'about:blank');
const href = await c.evaluate('location.href');
await c.evaluate(`scrollTo(0, 0); setTimeout(() => { ${href.startsWith('https://fastwork.com/') ? 'location.reload()' : "location.href = 'https://fastwork.com/'"}; }, 400); 'ok'`);
c.close();
await sleep(2500);
c = await openTab('fastwork.com');
for (let i = 0; i < 60; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
const tLoaded = Date.now();
await sleep(8000);

const PROBE = `(async () => {
  const fp = window.__fp = {frames: []};
  let last = performance.now();
  const loop = t => { fp.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const marks = {}; const vh0 = innerHeight, startY = Math.round(scrollY);
  marks.idle = [performance.now()]; await sleep(3000); marks.idle.push(performance.now());
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  while (scrollY < maxY - 5 && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: 250, behavior: 'smooth'}); await sleep(300); }
  marks.scroll.push(performance.now());
  marks.bottom = [performance.now()]; await sleep(3000); marks.bottom.push(performance.now());
  const secs = [...document.querySelectorAll('section, footer')].filter(e => e.offsetHeight > 100).map(e => {
    const r = e.getBoundingClientRect(); return {id: e.id, cls: String(e.className).replace(/svelte-\\w+/g, '').trim().slice(0, 40), top: Math.round(r.top + scrollY), h: Math.round(r.height)}; });
  return {marks, startY, maxY, finalY: Math.round(scrollY), docH: document.documentElement.scrollHeight, vw: innerWidth, vh0, vh: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, secs, frames: fp.frames};
})()`;

// Timeline chunk summariser (same approach as scratchpad record.mjs)
function summarize(records) {
  const s = {layout: 0, style: 0, paint: 0, paintArea: 0, composite: 0, raf: 0, timer: 0, events: {}, scripts: {}};
  const quadArea = q => q && q.length === 8 ? Math.abs((q[2] - q[0]) * (q[5] - q[3])) : 0;
  const walk = r => {
    const d = r.data || {};
    switch (r.type) {
      case 'Layout': s.layout++; break;
      case 'RecalculateStyles': s.style++; break;
      case 'Paint': s.paint++; s.paintArea += quadArea(d.clip); break;
      case 'Composite': s.composite++; break;
      case 'FireAnimationFrame': s.raf++; break;
      case 'TimerFire': s.timer++; break;
      case 'EventDispatch': s.events[d.type] = (s.events[d.type] || 0) + 1; break;
      case 'FunctionCall': { const k = (d.scriptName || '(inline)').replace(/^https?:\/\/[^/]+/, '').slice(-60) + ':' + d.scriptLine + ':' + d.scriptColumn; s.scripts[k] = (s.scripts[k] || 0) + 1; break; }
    }
    (r.children || []).forEach(walk);
  };
  records.forEach(walk);
  s.paintArea = Math.round(s.paintArea);
  return s;
}

let records = [];
if (TIMELINE) {
  c.on(m => { if (m.method === 'Timeline.eventRecorded') records.push(m.params.record); });
  await c.send('Timeline.setInstruments', {instruments: ['Timeline']});
}
await c.evaluate(`window.__iphRes = undefined; ${PROBE}.then(v => { window.__iphRes = JSON.stringify(v); }, e => { window.__iphRes = JSON.stringify({err: String(e)}); }); 'started'`);
const tStart = Date.now();
const chunks = [];
let res = null;
while (!res && Date.now() - tStart < 90000) {
  if (TIMELINE) {
    const pre = JSON.parse(await c.evaluate('JSON.stringify([performance.now(), scrollY])'));
    records = [];
    await c.send('Timeline.start', {maxCallStackDepth: 4});
    await sleep(1000);
    await c.send('Timeline.stop', {});
    const post = JSON.parse(await c.evaluate('JSON.stringify([performance.now(), scrollY])'));
    const t0 = Date.now(); while (!records.length && Date.now() - t0 < 1500) await sleep(30);
    chunks.push({t: [pre[0], post[0]].map(Math.round), y: [pre[1], post[1]].map(Math.round), ...summarize(records)});
  } else await sleep(1500);
  const v = await c.evaluate('window.__iphRes || null');
  if (v) res = JSON.parse(v);
}
if (!res) throw new Error('probe did not finish in 90s');
if (res.err) throw new Error(res.err);
res.meta = {device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', date: new Date().toISOString(), timeline: TIMELINE, settleMs: Date.now() - tLoaded - (Date.now() - tStart)};
if (TIMELINE) res.chunks = chunks;
fs.writeFileSync(OUT, JSON.stringify(res));
console.log(`saved ${OUT}: frames=${res.frames.length} maxY=${res.maxY} finalY=${res.finalY} vh0=${res.vh0} vh=${res.vh} scroll=${Math.round(res.marks.scroll[1] - res.marks.scroll[0])}ms chunks=${chunks.length}`);
c.close();
process.exit(0);

// Record iPhone Safari rendering work while the user scrolls.
// iOS 26 Timeline timestamps are all 0 over this proxy, so we record in ~1s chunks
// (Timeline.start/stop flushes one record tree per chunk) and correlate each chunk with
// an in-page rAF frame log (performance.now, frame interval, scrollY).
// Usage: node record.mjs out.json [--idle 10] [--max 180] [--wait 240] [--chunk 1000]
import {connect} from './wip.mjs';
import fs from 'node:fs';

const out = process.argv[2] || 'rec.json';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const IDLE = arg('--idle', 10), MAX = arg('--max', 180), WAIT = arg('--wait', 240), CHUNK = arg('--chunk', 1000);

const pages = await (await fetch('http://localhost:9222/json')).json();
const page = pages.find(p => p.url.includes('fastwork.com'));
if (!page) { console.error('no fastwork tab'); process.exit(1); }
const c = await connect(page.webSocketDebuggerUrl);

let pendingRecords = [], cpuBuf = [];
c.on((m) => {
  if (m.method === 'Timeline.eventRecorded') pendingRecords.push(m.params.record);
  else if (m.method === 'CPUProfiler.trackingUpdate') cpuBuf.push(m.params.event);
});

const INJECT = `(() => {
  const fp = window.__fp = window.__fp || {};
  fp.frames = [];
  if (!fp.running) {
    fp.running = true;
    let last = performance.now();
    const loop = t => { fp.frames.push([Math.round(t*10)/10, Math.round((t-last)*10)/10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  const secs = [...document.querySelectorAll('section, footer')].filter(e => e.offsetHeight > 100);
  fp.sections = secs.map(e => { const r = e.getBoundingClientRect();
    return {id: e.id, cls: String(e.className).replace(/svelte-\\w+/g,'').trim().slice(0,60), top: Math.round(r.top+scrollY), h: Math.round(r.height)}; });
  return 'ok';
})()`;
await c.evaluate(INJECT, 'page');
await c.send('Timeline.setInstruments', {instruments: ['Timeline', 'CPU']}, 'page');

// summarise one chunk's record tree
function summarize(records) {
  const s = {layout: 0, layoutArea: 0, style: 0, paint: 0, paintArea: 0, composite: 0, raf: 0, timer: 0, observer: {}, scripts: {}, paints: {}, events: {}};
  const quadArea = q => q && q.length === 8 ? Math.abs((q[2] - q[0]) * (q[5] - q[3])) : 0;
  const walk = (r) => {
    const d = r.data || {};
    switch (r.type) {
      case 'Layout': s.layout++; s.layoutArea += quadArea(d.root); break;
      case 'RecalculateStyles': s.style++; break;
      case 'Paint': { s.paint++; const a = quadArea(d.clip); s.paintArea += a;
        const k = d.clip ? d.clip.filter((_, i) => i === 0 || i === 1 || i === 4 || i === 5).map(v => Math.round(v / 10) * 10).join(',') : '?';
        s.paints[k] = (s.paints[k] || 0) + 1; break; }
      case 'Composite': s.composite++; break;
      case 'FireAnimationFrame': s.raf++; break;
      case 'TimerFire': s.timer++; break;
      case 'ObserverCallback': s.observer[d.type] = (s.observer[d.type] || 0) + 1; break;
      case 'EventDispatch': s.events[d.type] = (s.events[d.type] || 0) + 1; break;
      case 'FunctionCall': { const k = (d.scriptName || '(inline)').replace(/^https?:\/\/[^/]+/, '').slice(-60) + ':' + d.scriptLine + ':' + d.scriptColumn;
        s.scripts[k] = (s.scripts[k] || 0) + 1; break; }
    }
    (r.children || []).forEach(walk);
  };
  records.forEach(walk);
  return s;
}

const chunks = [];
const tStart = Date.now();
let scrolled = false, lastY = null, lastMove = Date.now(), began = null;
console.log('READY: waiting for scroll (max wait', WAIT, 's)');
while (true) {
  const pre = JSON.parse(await c.evaluate('JSON.stringify([performance.now(), scrollY])', 'page'));
  pendingRecords = []; cpuBuf = [];
  await c.send('Timeline.start', {maxCallStackDepth: 4}, 'page');
  await new Promise(r => setTimeout(r, CHUNK));
  await c.send('Timeline.stop', {}, 'page');
  const post = JSON.parse(await c.evaluate('JSON.stringify([performance.now(), scrollY])', 'page'));
  const t0 = Date.now(); while (!pendingRecords.length && Date.now() - t0 < 1500) await new Promise(r => setTimeout(r, 30));
  const y = post[1];
  if (lastY !== null && (y !== lastY || pre[1] !== lastY)) { if (!scrolled) { began = chunks.length; console.log('scroll detected'); } scrolled = true; lastMove = Date.now(); }
  lastY = y;
  const mainCpu = cpuBuf.map(e => (e.threads || []).find(t => t.type === 'main')?.usage).filter(v => v != null);
  chunks.push({t: [pre[0], post[0]], y: [pre[1], post[1]], cpuMain: mainCpu, cpuTotal: cpuBuf.map(e => e.usage), ...summarize(pendingRecords)});
  if (!scrolled && Date.now() - tStart > WAIT * 1000) break;
  if (scrolled && Date.now() - lastMove > IDLE * 1000) break;
  if (scrolled && Date.now() - tStart > MAX * 1000 + WAIT * 1000) break;
  if (!scrolled && chunks.length > 5) chunks.shift();   // keep only a few idle chunks before scrolling starts
}
const pg = JSON.parse(await c.evaluate('JSON.stringify({frames: __fp.frames, sections: __fp.sections, docH: document.documentElement.scrollHeight, vh: innerHeight})', 'page'));
fs.writeFileSync(out, JSON.stringify({chunks, page: pg}));
console.log(`saved ${out}: chunks=${chunks.length} frames=${pg.frames.length} scrolled=${scrolled}`);
process.exit(0);

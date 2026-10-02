// PR-001 rev 3 (P-058) attribution runs, after the block's end sentinel (iPhone or Simulator; no timing claims, counts only): WebKit Timeline record COUNTS per accent draw at scrollY 0.
// The page cycles untouched for S seconds with Timeline on (Page.disable -> Page.enable -> Timeline.start, F-047). A
// MutationObserver on the accent marks each draw class change with console.timeStamp('fwd:<dir>|<word>|<on canvas>'), and the
// records between a draw mark and the next mark are that draw's (record stream order; Timeline timestamps are not used).
// Counted per draw: RecalculateStyles, Layout, Paint, Composite, RenderingFrame (records anywhere in the tree). No durations.
// usage: node tlcounts.mjs <out.json> <url> [seconds=46]   (phone: FW_IPHONE_PORT 9222 default; Sim: the session's tab port)
import { writeFileSync } from 'node:fs';
import { connect, sleep } from '../../../tools/lib/wip.mjs';
const [out, url, S = '46'] = process.argv.slice(2);
const PORT = Number(process.env.FW_IPHONE_PORT || 9222);
async function tab(match) {
  for (let i = 0; i < 10; i++) {
    const pages = (await (await fetch(`http://localhost:${PORT}/json`)).json()).filter((p) => p.webSocketDebuggerUrl && String(p.url).startsWith('http') && (!match || String(p.url).includes(match)));
    for (const p of pages) { try { const c = await connect(p.webSocketDebuggerUrl, { timeoutMs: 4000 }); if ((await c.evaluate('document.visibilityState', 'page', 3000)) === 'visible') return c; c.close(); } catch {} }
    await sleep(1000);
  }
  throw new Error('no visible tab');
}
let c = await tab();
await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 200); 'ok'`);
c.close(); await sleep(2500);
c = await tab(new URL(url).host);
for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
await c.evaluate(`scrollTo(0, 0); 'ok'`);
await sleep(4000);
const recs = [];
c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
await c.send('Page.disable'); await c.send('Page.enable');
await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
await c.evaluate(`(() => { const e = document.querySelector('em.script-accent'); let last = '';
  new MutationObserver(() => { const d = e.classList.contains('is-drawing-out') ? 'out' : e.classList.contains('is-drawing-in') ? 'in' : '';
    if (d === last) return; last = d; const A = window.__fwAccentCanvas, s = A ? A.stats() : null;
    console.timeStamp('fwd:' + (d || 'end') + '|' + (e.getAttribute('aria-label') || '') + '|' + (e.classList.contains('is-canvas') ? 'canvas' : 'svg') + '|' + (s ? s.canvas + '/' + (s.back.miss + s.back.scroll + (s.back.drift || 0) + (s.back.play || 0)) : '-'));
  }).observe(e, { attributes: true, attributeFilter: ['class'] }); return 'ok'; })()`);
const s0 = JSON.parse(await c.evaluate(`JSON.stringify(window.__fwAccentCanvas ? window.__fwAccentCanvas.stats() : null)`));
await c.send('Timeline.start', { maxCallStackDepth: 0 });
await sleep(Number(S) * 1000);
await c.send('Timeline.stop');
await sleep(1500);
const TYPES = ['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'RenderingFrame', 'TimerFire', 'FireAnimationFrame'];
// flatten in stream order; a TimeStamp record opens a new window
const wins = []; let cur = null; const idle = {};
const visit = (r) => {
  if (r.type === 'TimeStamp' && r.data && /^fwd:/.test(r.data.message || '')) { const [d, word, eng, st] = r.data.message.slice(4).split('|'); cur = d === 'end' ? null : { d, word, eng, st, n: {}, all: {}, rfMax: 0 }; if (cur) wins.push(cur); }
  else {
    if (TYPES.includes(r.type)) { const t = cur ? cur.n : idle; t[r.type] = (t[r.type] || 0) + 1; }
    if (cur) { cur.all[r.type] = (cur.all[r.type] || 0) + 1; if (r.type === 'RenderingFrame' && r.endTime != null) cur.rfMax = Math.max(cur.rfMax, +(1000 * (r.endTime - r.startTime)).toFixed(1)); }
  }
  for (const ch of r.children || []) visit(ch);
};
for (const r of recs) visit(r);
// the last window may be cut by the stop: drop it
const done = wins.slice(0, -1);
// a canvas draw that handed back (miss/scroll counters grew before the next mark) counts as 'canvas-handback'
const bk = (w) => { const p = String(w.st).split('/').map(Number); return p[1] || 0; };
done.forEach((w, i) => { if (w.eng === 'canvas' && bk(wins[i + 1]) > bk(w)) w.eng = 'canvas-handback'; });
const agg = {}; for (const w of done) { const k = `${w.eng}:${w.word === 'you' ? 'you' : 'other'}`; const a = (agg[k] ||= { draws: 0 }); a.draws++; for (const [t, v] of Object.entries(w.n)) a[t] = (a[t] || 0) + v; }
for (const a of Object.values(agg)) for (const t of TYPES) if (a[t] != null) a[t + 'PerDraw'] = +(a[t] / a.draws).toFixed(1);
const r = JSON.parse(await c.evaluate(`JSON.stringify({ stats: window.__fwAccentCanvas && window.__fwAccentCanvas.stats(), gate: window.__fwAccentCanvas && window.__fwAccentCanvas.gate || null, coi: self.crossOriginIsolated, tl: document.timeline.currentTime, sy: scrollY })`));
const res = { url: url.replace(/\/\/[^/:]+:/, '//host:'), seconds: Number(S), records: recs.length, windows: done.map((w) => ({ d: w.d, word: w.word, eng: w.eng, st: w.st, rfMaxMs: w.rfMax, all: w.all, ...w.n })), perEngine: agg, idle, before: s0, ...r };
writeFileSync(out, JSON.stringify(res, null, 1));
const fc = done.findIndex((w) => w.eng.startsWith('canvas')); res.firstCanvas = fc < 0 ? null : { index: fc, canvasBefore: s0 && s0.canvas, rfMaxMs: done[fc].rfMax, all: done[fc].all, rfMaxOtherCanvasMs: Math.max(0, ...done.filter((w, i) => i !== fc && w.eng.startsWith('canvas')).map((w) => w.rfMax)), rfMaxSvgMs: Math.max(0, ...done.filter((w) => w.eng === 'svg').map((w) => w.rfMax)) };
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ firstCanvas: res.firstCanvas, records: res.records, perEngine: agg, gate: r.gate, coi: r.coi, stats: r.stats }).slice(0, 1500));
c.close();
console.log('EXIT simcounts');
process.exit(0);

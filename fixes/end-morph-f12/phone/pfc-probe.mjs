// T-204 #32 / T-215 option (c) phone mechanism proof (T-204 #35: free iPhone, no ticket, no card, no gain claim).
// Runs inside the caller's phone hold. For the page already open in Safari (iphone.mjs open <url> first): walk down to the
// page end, scroll to the bottom (m 1 on touch phones: html.fw-ms, the morph follows the scroll), settle, then
//   1. in-page state: m, --morph-fade, the pause attribute, running animations (all, and under #platform);
//   2. a WebKit Timeline over SECS s held at m 1 (Page.disable/enable + Timeline.start, F-047): RenderingFrame count and
//      Composite / Paint / Layout / RecalculateStyles counts and ms; Composite ms per RenderingFrame;
//   3. after the Timeline (never during it): LayerTree.layersForNode on the document and on #platform (layer counts).
// usage: node fixes/end-morph-f12/phone/pfc-probe.mjs --match <host:port> --label <arm> --out <file.json> [--secs 6]
import { writeFileSync } from 'node:fs';
import { openTab, sleep, TIMELINE_START } from '../../../tools/lib/wip.mjs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MATCH = arg('--match'), LABEL = arg('--label', 'x'), OUT = arg('--out'), SECS = Number(arg('--secs', 6));
if (!MATCH || !OUT) { console.error('usage: --match <host:port> --label <arm> --out <file.json> [--secs 6]'); process.exit(2); }
const c = await openTab((u) => String(u).includes(MATCH));
const res = { label: LABEL, secs: SECS, at: new Date().toISOString() };
try {
  await c.evaluate(`(async () => { const H = () => document.documentElement.scrollHeight - innerHeight; for (let y = 0; y < H(); y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } scrollTo(0, H() + 2000); return 1; })(); 'walking'`);
  await sleep(9000);
  await c.evaluate(`scrollTo(0, document.documentElement.scrollHeight); 'end'`);
  await sleep(3000);
  const STATE = `JSON.stringify((() => { const p = document.getElementById('platform'); const ih = innerHeight, docH = document.documentElement.scrollHeight;
    const run = document.getAnimations().filter((a) => a.playState === 'running'); const inP = run.filter((a) => a.effect && a.effect.target && p && p.contains(a.effect.target));
    return { scrollY: Math.round(scrollY), m: Math.round(((scrollY - (docH - 2 * ih)) / ih) * 1000) / 1000, fwMs: document.documentElement.classList.contains('fw-ms'),
      fade: p && p.style.getPropertyValue('--morph-fade'), paused: !!(p && p.hasAttribute('data-fw-pf-paused')), opacity: p && getComputedStyle(p).opacity,
      running: run.length, runningInPlatform: inP.length, names: run.map((a) => (a.animationName || a.constructor.name) + (a.effect && a.effect.pseudoElement ? a.effect.pseudoElement : '')) }; })())`;
  res.before = JSON.parse(await c.evaluate(STATE));
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded' && m.params && m.params.record) recs.push(m.params.record); });
  for (const [mth, p] of TIMELINE_START) await c.send(mth, p);
  await sleep(SECS * 1000);
  await c.send('Timeline.stop', {});
  await sleep(500);
  const agg = {};
  const walk = (r) => { if (!r) return; const d = typeof r.endTime === 'number' && typeof r.startTime === 'number' ? (r.endTime - r.startTime) * 1000 : 0;
    const a = (agg[r.type] ||= { n: 0, ms: 0 }); a.n++; a.ms += d; for (const ch of r.children || []) walk(ch); };
  for (const r of recs) walk(r);
  for (const k of Object.keys(agg)) agg[k].ms = Math.round(agg[k].ms * 100) / 100;
  const rf = agg.RenderingFrame ? agg.RenderingFrame.n : 0;
  res.timeline = { records: recs.length, byType: agg, renderingFrames: rf,
    compositePerFrameMs: rf ? Math.round(((agg.Composite && agg.Composite.ms) || 0) / rf * 1000) / 1000 : null,
    paintPerFrameMs: rf ? Math.round(((agg.Paint && agg.Paint.ms) || 0) / rf * 1000) / 1000 : null };
  res.after = JSON.parse(await c.evaluate(STATE));
  try {
    await c.send('DOM.enable', {}); await c.send('LayerTree.enable', {});
    const { root } = await c.send('DOM.getDocument', {});
    const all = await c.send('LayerTree.layersForNode', { nodeId: root.nodeId });
    const { nodeId: pid } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#platform' });
    const pl = pid ? await c.send('LayerTree.layersForNode', { nodeId: pid }) : { layers: [] };
    const mem = (ls) => Math.round(ls.reduce((s, l) => s + (l.memory || 0), 0) / 1048576 * 100) / 100;
    res.layers = { all: (all.layers || []).length, allMB: mem(all.layers || []), platform: (pl.layers || []).length, platformMB: mem(pl.layers || []) };
    await c.send('LayerTree.disable', {});
  } catch (e) { res.layers = { error: String(e && e.message || e) }; }
} finally { writeFileSync(OUT, JSON.stringify(res, null, 1)); c.close(); }
const t = res.timeline || {}, b = t.byType || {};
console.log(`PFC ${LABEL} m ${res.before && res.before.m} fade ${res.before && res.before.fade} paused ${res.before && res.before.paused} running ${res.before && res.before.running} (platform ${res.before && res.before.runningInPlatform}) | frames ${t.renderingFrames} Composite ${b.Composite ? b.Composite.n + ' / ' + b.Composite.ms + ' ms' : '-'} per frame ${t.compositePerFrameMs} | Paint ${b.Paint ? b.Paint.n + ' / ' + b.Paint.ms + ' ms' : '-'} | layers ${JSON.stringify(res.layers)}`);

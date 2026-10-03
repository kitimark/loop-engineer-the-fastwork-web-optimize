// best-build copy of fixes/platform-idle/tools/simcount.mjs: same stops, windows and counts; arms from ./arms.mjs (C, V, N,
// ...) and a load whose served hashes differ from the pin is void. Output dir out/best-build/sim/. Run:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner wi-best-build -- \
//     node tools/sim.mjs session --functional --owner wi-best-build -- node fixes/best-build/gates/simcount.mjs out/best-build/sim/records.json V:1 N:1
// Original header:
// platform-idle (P-077) Simulator counter (WebKit), COUNTS ONLY, no timing claim. Run inside a functional sim session:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner platform-idle -- \
//     node tools/sim.mjs session --functional --owner platform-idle -- node fixes/platform-idle/tools/simcount.mjs <records.json> C:1 V:1
// Arms: C = st6-rb2 overlay, V = platform-idle overlay, B = baseline. Each load: its own server on a new port (own origin,
// F-115), plain http, `sim.mjs open`, settle. Stops: scrollY 4660 (top-aligned, as Chrome's census) and the page bottom
// (Chrome's last census stop, 5346 there). Per stop: settle 3 s, then a 20 s Timeline window (Page.disable -> Page.enable ->
// Timeline.start, F-047) = 5 sweep cycles = 4 glint cycles. Counted anywhere in the record tree: RenderingFrame,
// RecalculateStyles, Layout, Paint, Composite, FunctionCall, TimerFire, FireAnimationFrame. Then LayerTree.layersForNode on
// the platform section: per layer paintCount growth over 5 s, memory, compositing reasons.
// The per-window check also reads the platform section's inline --morph-fade, opacity and visibility (F-182 coupling).
// Appends to <records.json> ({loads: [...]}, the ts-costcard (I-083) pre-cut shape, engine 'sim', windows kind 'idle').
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const [outPath, ...order] = process.argv.slice(2);
const { ARMDEF, NODE: JS, CSS, BASE, makeSnapshots } = await import('./arms.mjs');
makeSnapshots({ quiet: true });
const SETTLE = 3000, WIN = 20000;
const TYPES = { renderingFrames: 'RenderingFrame', styleRecalcs: 'RecalculateStyles', layouts: 'Layout', paints: 'Paint', composites: 'Composite', functionCalls: 'FunctionCall', timerFires: 'TimerFire', rafs: 'FireAnimationFrame' };
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/best-build/sim'); mkdirSync(D, { recursive: true });
const CHECK = `(() => { const vh = innerHeight, inView = (t) => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.width > 0; };
  const run = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && inView(a.effect.target));
  const dash = [...document.querySelectorAll('.start-selling-platform-secure-network-dash')];
  return { y: scrollY, vh, running: run.map((a) => (a.animationName || a.transitionProperty || '?') + (a.effect.pseudoElement || '')),
    glintActive: document.querySelectorAll('.start-selling-platform-secure-network-dash-glint.is-active').length,
    smilAnimate: dash.reduce((n, d) => n + d.querySelectorAll('animate').length, 0), dashInView: dash.filter(inView).length,
    sweepTitlesInView: [...document.querySelectorAll('.start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized')].filter(inView).length,
    sweepPaused: document.querySelectorAll('.start-selling-platform [data-sweep-paused]').length,
    morphFade: (() => { const s = document.querySelector('.start-selling-platform'); return s ? { inline: s.style.getPropertyValue('--morph-fade'), opacity: getComputedStyle(s).opacity, visibility: getComputedStyle(s).visibility } : null; })() }; })()`;
for (const L of order) {
  const [arm, rep] = L.split(':');
  const st = join(D, `serve-sim-${arm}.json`); rmSync(st, { force: true });
  const sargs = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'];
  if (ARMDEF[arm].dir) sargs.push('--overlay', ARMDEF[arm].dir);
  const p = spawn(process.execPath, sargs, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), mode: 'full', engine: 'sim', tool: 'fixes/best-build/gates/simcount.mjs (copy of fixes/platform-idle/tools/simcount.mjs)', startedAt: new Date().toISOString(), windows: [] };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== ARMDEF[arm].js || load.served.css !== ARMDEF[arm].css) throw new Error('served ' + JSON.stringify(load.served) + ', pinned ' + ARMDEF[arm].js + ' / ' + ARMDEF[arm].css);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(2500);
    load.ua = await c.evaluate('navigator.userAgent');
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [name, js] of [['y4660', 'scrollTo({ top: 4660, behavior: "instant" })'], ['bottom', 'scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })']]) {
      await c.evaluate(`(${js}, 0)`); await sleep(SETTLE);
      await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {});
      await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
      recs.length = 0;
      await c.send('Timeline.start', { maxCallStackDepth: 0 });
      await sleep(WIN);
      await c.send('Timeline.stop'); await sleep(1000);
      const n = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])); const rev = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
      let t0 = Infinity, t1 = -Infinity;
      const walk = (r) => { if (!r) return; if (rev[r.type]) n[rev[r.type]]++; if (r.startTime != null) { t0 = Math.min(t0, r.startTime); t1 = Math.max(t1, r.endTime ?? r.startTime); } for (const ch of r.children || []) walk(ch); };
      for (const r of recs) walk(r);
      load.windows.push({ kind: 'idle', stop: name, ms: WIN, recordSpanMs: Number.isFinite(t0) ? Math.round((t1 - t0) * 1000) : 0, records: recs.length, sweepCycles: 5, glintCycles: 4, ...n, check: await c.evaluate(CHECK) });
    }
    // layers of the platform section at the bottom stop: paintCount growth over 5 s, memory, reasons
    try {
      await c.send('LayerTree.enable');
      const doc = await c.send('DOM.getDocument', { depth: 1 });
      const sec = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.start-selling-platform' });
      const L0 = (await c.send('LayerTree.layersForNode', { nodeId: sec.nodeId })).layers || [];
      await sleep(5000);
      const L1 = (await c.send('LayerTree.layersForNode', { nodeId: sec.nodeId })).layers || [];
      const p0 = Object.fromEntries(L0.map((l) => [l.layerId, l.paintCount]));
      const reasons = {};
      for (const l of L1) { try { const r = (await c.send('LayerTree.reasonsForCompositingLayer', { layerId: l.layerId })).compositingReasons; reasons[l.layerId] = Object.keys(r).filter((k) => r[k]); } catch {} }
      load.census = { layers: { platform: L1.map((l) => ({ ...l, paintCountDelta5s: l.paintCount - (p0[l.layerId] ?? 0) })) }, reasons };
    } catch (e) { load.census = { error: String(e.message || e) }; }
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  const lay = load.census && load.census.layers ? load.census.layers.platform : [];
  console.log(arm, rep, JSON.stringify(load.served), load.void || '', load.windows.map((w) => `${w.stop} RF${w.renderingFrames} RS${w.styleRecalcs} L${w.layouts} P${w.paints} C${w.composites} FC${w.functionCalls} glint${w.check.glintActive} smil${w.check.smilAnimate} sweep${w.check.sweepTitlesInView}`).join(' | '), 'layers', lay.length, 'repainting', lay.filter((l) => l.paintCountDelta5s > 0).length);
}

#!/usr/bin/env node
// P-142 (v9.2) Simulator whole-page census (int-v8): WebKit Timeline record COUNTS per window, no timing claim.
// Based on fixes/best-build/gates/simcount.mjs (same load path: own server per load, plain http, `sim.mjs open`, served-hash
// check, Timeline via Page.disable -> Page.enable -> Timeline.start, F-047), with P-142's windows:
//   idle stops rest-0 / rest-1400 / rest-2796 / rest-3800 / rest-end (y = max scroll), the Chrome census stops: settle
//   3 s, then a 6 s window;
//   scroll: a scripted page-driven scroll top -> end, scrollBy STEP px per rAF (no WDA, no touch), Timeline on for the
//   whole pass; per frame = count / RenderingFrame records.
// Counted anywhere in the record tree: RenderingFrame, RecalculateStyles, Layout, Paint, Composite, FireAnimationFrame.
// Arms are folders of the v9.2 snapshot (F = v9-final, V = v9.2, B = v9.1d, X, Mpw, Mnhc, ...); a load whose served
// hashes differ from HASHES.txt is VOID. Appends to <records.json> ({loads: [...]}).
// Run (shared lane, functional session; counts only):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner int-v8 -- \
//     node tools/sim.mjs session --functional --owner int-v8 -- node fixes/v9-2/sim92.mjs <records.json> F:1 V:1 F:2
// SNAP: env P142_SNAP (default out/v92/snap-30f6371751f4).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const [outPath, ...order] = process.argv.slice(2);
if (!outPath || !order.length) { console.error('usage: sim92.mjs <records.json> ARM:rep ...'); process.exit(2); }
const SNAP = join(WT, process.env.P142_SNAP || 'out/v92/snap-30f6371751f4');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const SETTLE = 3000, WIN = 6000, STEP = 24;
const TYPES = { renderingFrames: 'RenderingFrame', styleRecalcs: 'RecalculateStyles', layouts: 'Layout', paints: 'Paint', composites: 'Composite', rafs: 'FireAnimationFrame' };
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const D = join(WT, 'out/v92/sim'); mkdirSync(D, { recursive: true });
const STOPS = [['rest-0', '0'], ['rest-1400', '1400'], ['rest-2796', '2796'], ['rest-3800', '3800'], ['rest-end', 'document.documentElement.scrollHeight']];
const SCROLL = `new Promise((res) => { const max = document.documentElement.scrollHeight - innerHeight; let n = 0;
  const f = () => { n++; if (scrollY >= max - 1 || n > 2000) return res({ frames: n, y: scrollY, max }); scrollBy(0, ${STEP}); requestAnimationFrame(f); };
  requestAnimationFrame(f); })`;
const count = (recs) => {
  const n = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0])); const rev = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
  const walk = (r) => { if (!r) return; if (rev[r.type]) n[rev[r.type]]++; for (const ch of r.children || []) walk(ch); };
  for (const r of recs) walk(r);
  const pf = (k) => (n.renderingFrames ? +(n[k] / n.renderingFrames).toFixed(3) : null);
  return { ...n, perFrame: { styleRecalcs: pf('styleRecalcs'), layouts: pf('layouts'), paints: pf('paints') } };
};
for (const L of order) {
  const [arm, rep] = L.split(':');
  const st = join(D, `serve-sim-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  const load = { arm, rep: Number(rep), engine: 'sim', tool: 'fixes/v9-2/sim92.mjs', startedAt: new Date().toISOString(), windows: [] };
  let c = null;
  try {
    let s = null; for (let i = 0; i < 100 && !s; i++) { await sleep(200); if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    load.served = { js: sha(Buffer.from(await (await fetch(new URL(JS, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    if (load.served.js !== HX[`${arm}/${JS}`] || load.served.css !== HX[`${arm}/${CSS}`]) throw new Error(`served ${JSON.stringify(load.served)}, pinned ${HX[`${arm}/${JS}`]} / ${HX[`${arm}/${CSS}`]}`);
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let j = 0; j < 40 && (await c.evaluate('document.readyState')) !== 'complete'; j++) await sleep(500);
    await sleep(2500);
    load.viewport = await c.evaluate('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight })');
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    const start = async () => { await c.send('Page.disable'); await c.send('Page.enable'); await c.send('Timeline.enable').catch(() => {}); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] }); recs.length = 0; await c.send('Timeline.start', { maxCallStackDepth: 0 }); };
    const stop = async () => { await c.send('Timeline.stop'); await sleep(1000); return count(recs); };
    for (const [name, y] of STOPS) {
      await c.evaluate(`(scrollTo({ top: ${y}, behavior: "instant" }), 0)`); await sleep(SETTLE);
      await start(); await sleep(WIN);
      load.windows.push({ kind: 'idle', stop: name, ms: WIN, y: await c.evaluate('scrollY'), ...(await stop()) });
    }
    await c.evaluate('(scrollTo({ top: 0, behavior: "instant" }), 0)'); await sleep(SETTLE);
    await start();
    const sc = await c.evaluate(SCROLL);
    await sleep(500);
    load.windows.push({ kind: 'scroll', stop: 'top->end', step: STEP, ...sc, ...(await stop()) });
  } catch (e) { load.void = 'error: ' + String(e.message || e); }
  finally { try { c && c.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
  const rec = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { loads: [] };
  rec.loads.push(load); writeFileSync(outPath, JSON.stringify(rec, null, 1));
  console.log(arm, rep, JSON.stringify(load.served || {}), load.void || '', load.windows.map((w) => `${w.stop} RF${w.renderingFrames} RS${w.styleRecalcs} L${w.layouts} P${w.paints}${w.kind === 'scroll' ? ` perFrame ${JSON.stringify(w.perFrame)} frames ${w.frames}` : ''}`).join(' | '));
}

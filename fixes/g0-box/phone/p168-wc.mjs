#!/usr/bin/env node
// P-168 gate 2 (lead 14:0xZ): does the data-fw-wc flip still return Layout? Simulator, COUNTS ONLY (no timing claim),
// >= 3 fresh loads per arm (f = g0.0f, g = g0.0g, fko3 = g0.0f with fwWC a no-op; v0 optional), servers from
// p168-serve.sh. Per load: 6 s idle, Timeline on (maxCallStackDepth 5), then the W-like steps 0 -> 1000 (scrollBy 250
// smooth every 300 ms, then 2 s). In the page: every rAF's scrollY, and a MutationObserver on data-fw-wc only (flips:
// time, y, element, value). From the Timeline: every Layout record >= 1 ms with its RenderingFrame, and for each flip
// the Layout records in the next 2 RenderingFrames after the flip's frame. At the end, for every [data-fw-wc] element,
// its computed transform / isolation / position / z-index / will-change (what decides whether the flip can change the
// used z-index).
// Run (one shared Simulator session, <= 300 s; existing loads are skipped, so a second session resumes):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- node fixes/g0-box/phone/p168-wc.mjs <loads> [arm ...]
// Output: out/p168/wc/wc-<arm>-<n>.json; one WCLINE per load on stdout.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, runAsync, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.P168_WCDIR || 'out/p168/wc'); mkdirSync(D, { recursive: true });
const errText = (e) => e?.message || JSON.stringify(e);

const PAGE_LOG = `(() => { const L = window.__p168 = { f: [], flips: [] };
  const loop = () => { L.f.push([performance.now(), scrollY]); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  const name = (t) => { const c = typeof t.className === 'string' ? t.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x))[0] || '' : ''; return t.tagName.toLowerCase() + (c ? '.' + c : ''); };
  new MutationObserver((ms) => { for (const m of ms) L.flips.push([performance.now(), scrollY, name(m.target), m.target.getAttribute('data-fw-wc'), m.oldValue]); })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-fw-wc'], attributeOldValue: true });
  return 'ok'; })()`;
const STEPS = `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0; while (scrollY < 1000 && n < 40) { scrollBy({ top: 250, behavior: 'smooth' }); n++; await sleep(300); }
  await sleep(2000); return { steps: n, y: scrollY }; })()`;
const PROPS = `JSON.stringify([...document.querySelectorAll('[data-fw-wc]')].map((e) => { const s = getComputedStyle(e);
  const c = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).filter((x) => !/^svelte-/.test(x))[0] || '' : '';
  const r = e.getBoundingClientRect();
  return { el: e.tagName.toLowerCase() + (c ? '.' + c : ''), wc: e.getAttribute('data-fw-wc'), top: Math.round(r.top + scrollY), h: Math.round(r.height),
    transform: s.transform, isolation: s.isolation, position: s.position, z: s.zIndex, willChange: s.willChange, opacity: s.opacity, filter: s.filter, contain: s.contain }; }))`;

const flatten = (recs, out = []) => { for (const r of recs || []) { out.push(r); flatten(r.children, out); } return out; };
const ms = (r) => ((r.endTime ?? r.startTime) - r.startTime) * 1000;

async function runLoad(c) {
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.evaluate(PAGE_LOG);
  await sleep(6000);
  for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 5 }]]) await c.send(m, p);
  const syncT = await c.evaluate(timelineSyncJs('p168sync'));
  const page = await runAsync(c, STEPS, { pollMs: 500, timeoutMs: 40000, key: '__p168r' });
  await sleep(300);
  await c.send('Timeline.stop').catch(() => {});
  await sleep(500);
  const L = JSON.parse(await c.evaluate('JSON.stringify(window.__p168)'));
  const props = JSON.parse(await c.evaluate(PROPS));
  const syncTL = findTimeStamp(recs, 'p168sync');
  if (syncTL == null) throw new Error('no Timeline sync mark');
  const off = syncTL * 1000 - syncT;
  const yAt = (pm) => { let y = null; for (const [t, v] of L.f) { if (t > pm) break; y = v; } return y; };
  const frames = recs.filter((r) => r.type === 'RenderingFrame').sort((a, b) => a.startTime - b.startTime)
    .map((r) => { const lay = flatten(r.children).filter((x) => x.type === 'Layout').map(ms).filter((v) => v >= 1);
      return { pm: r.startTime * 1000 - off, end: (r.endTime ?? r.startTime) * 1000 - off, lay }; });
  const move = frames.filter((f) => f.pm >= syncT);
  const flips = L.flips.filter(([t]) => t >= syncT).map(([t, y, el, v, o]) => {
    const fi = frames.findIndex((f) => f.pm <= t && t <= f.end + 1);   // the frame the flip happened in (IO runs late in the update)
    const next = fi < 0 ? frames.filter((f) => f.pm > t).slice(0, 2) : frames.slice(fi + 1, fi + 3);
    const lay = next.flatMap((f) => f.lay);
    return { y: Math.round(y), el, v, o, layNext2: lay.map((v2) => Math.round(v2 * 10) / 10), big: lay.filter((v2) => v2 >= 5).length };
  });
  const bigL = move.flatMap((f) => f.lay).filter((v) => v >= 5);
  return { page, off: Math.round(off), flips, props,
    sum: { frames: move.length, layouts5: bigL.length, layoutSum: Math.round(bigL.reduce((s, v) => s + v, 0)), pairs: move.filter((f) => f.lay.filter((v) => v >= 5).length >= 2).length,
      flips: flips.length, flipsFollowedByLayout: flips.filter((f) => f.big > 0).length } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const loads = Number(process.argv[2] || 3); const arms = process.argv.slice(3).length ? process.argv.slice(3) : ['f', 'g', 'fko3'];
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 235) * 1000;
  // interleave arms per load index (f g fko3, f g fko3, ...) so a session cut keeps the arms balanced
  outer: for (let n = 1; n <= loads; n++) for (const arm of arms) {
    const file = join(D, `wc-${arm}-${n}.json`);
    if (existsSync(file)) { console.log(`exists ${arm}-${n}`); continue; }
    if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${arm}-${n}`); break outer; }
    const port = JSON.parse(readFileSync(join(WT, `out/p168/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?p168=${arm}-${n}-${Date.now()}`;
    const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    const key = url.split('?')[1]; let c = null;
    for (let i = 0; i < 8 && !c; i++) {
      let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch (e) { if (i === 7) { console.log(`STOP no tab for ${arm}-${n}: ${errText(e)}`); process.exit(3); } await sleep(1000); continue; }
      const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => '');
      if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); }
    }
    if (!c) { console.log(`STOP no fresh load for ${arm}-${n} (open ${o.status})`); process.exit(3); }
    let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete'")) === true; if (!ready) await sleep(250); }
    let r; try { r = await runLoad(c); } catch (e) { console.log(`ERR ${arm}-${n}: ${errText(e)}`); c.close(); continue; }
    c.close(); r.arm = arm; r.n = n; r.url = url; r.ready = ready;
    writeFileSync(file, JSON.stringify(r, null, 1));
    const s = r.sum;
    console.log(`WCLINE ${arm}-${n}: end y ${r.page?.y} | flips ${s.flips}, followed by a Layout >= 5 ms within 2 frames ${s.flipsFollowedByLayout} | Layouts >= 5 ms ${s.layouts5} (sum ${s.layoutSum}), frames with 2+ ${s.pairs} | flips: ${r.flips.map((f) => `y${f.y} ${f.el}=${f.v}${f.big ? ' L' + f.layNext2.filter((v) => v >= 5).join('+') : ''}`).join(', ')}`);
  }
}

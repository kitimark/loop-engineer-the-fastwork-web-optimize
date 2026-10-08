#!/usr/bin/env node
// End-of-page Simulator count harness (fix-g0-box, lead 2026-10-09; user T-228 #101: first priority = the approach drags,
// y 0 -> ~4600, finger down). COUNTS ONLY: Simulator ms are compared only between arms inside one session, never as phone
// ms and never as a verdict (F-084). Modeled on p168-comp.mjs (own inspector connection, Timeline on) with real touch
// drags: the approach strokes of the g0 G program (g-fastshort-g0.json: 520 px up in 1200 ms, profile drag, x 215, 300 ms
// pause), compiled by tools/lib/gesture.mjs and played through WDA-sim (:8101) on the same connection's page, so no
// second inspector client is attached (one remote inspector per page, wip.mjs INSPECTOR_HINT).
// Per load: a fresh URL, 4 s idle, Timeline on, N drags (default 10: y 0 -> ~5100, before the pin's jack at ~5213),
// 1.5 s, Timeline off. A passive touch logger marks finger-down; a rAF logger gives scrollY per frame.
// Per RenderingFrame: start (page ms), duration, scrollY, finger down or not, ms since the touchstart, and the time in
// Layout, RecalculateStyles, Composite and script (FireAnimationFrame/EventDispatch/TimerFire/ObserverCallback) records
// (union per kind; "forced" = Layout/RecalculateStyles nested inside a script record). Summary per load: frames, frames with Layout+style >= 20 ms (count, ys), the 8 longest frames (y,
// what), the touch-end frames (longest frame in [touchend - 120, + 20] ms), and the y clusters of de-offscreen's P-164 read (0-300, 560-700, 850-1050, 1450-1550, 1700-1800, 1950-2050,
// 2950-3100, 3450-3550, 4450-4650): per cluster the largest Layout+style and Composite seen, and the class /
// attribute flips logged by a MutationObserver (class, inert, src, hidden, data-start-selling-scene; de-offscreen's suggestion).
// Run (one functional Simulator session, shared lane, <= 300 s; existing loads are skipped, so a next session resumes):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-g0-box -- \
//     node tools/sim.mjs session --functional --owner fix-g0-box -- sh -c 'node tools/sim.mjs wda start && node fixes/g0-box/phone/eop-sim.mjs <loads> <arm>...'
// Arms: eop-serve.sh's C (g0.0e), V (g0.0f), K (the candidate in eop-k.env); servers from out/eopp/serve-<arm>.json.
// Output: $EOP_SIMDIR (default out/eopp/sim)/sim-<arm>-<n>.json; one SIMLINE per load.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep, timelineSyncJs, findTimeStamp } from '../../../tools/lib/wip.mjs';
import { createSession } from '../../../tools/lib/wda.mjs';
import { compileScript } from '../../../tools/lib/gesture.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const D = join(WT, process.env.EOP_SIMDIR || 'out/eopp/sim'); mkdirSync(D, { recursive: true });
const NDRAG = Number(process.env.EOP_DRAGS || 10);
const errText = (e) => e?.message || JSON.stringify(e);
const r1 = (x) => Math.round(x * 10) / 10;
export const CLUSTERS = [[0, 300], [560, 700], [850, 1050], [1450, 1550], [1700, 1800], [1950, 2050], [2950, 3100], [3450, 3550], [4450, 4650]];

export function approachProgram(n) {
  const steps = [];
  for (let i = 0; i < n; i++) steps.push({ type: 'stroke', dir: 'up', px: 520, ms: 1200, profile: 'drag' }, { type: 'pause', ms: 300 });
  return { name: 'eop-approach-sim', version: 1, screen: [430, 932], params: { x: 215 }, steps };
}
const LOG = `(() => { const L = window.__eops = { f: [], t: [] }; const loop = () => { L.f.push([performance.now(), scrollY]); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  for (const k of ['touchstart', 'touchend', 'touchcancel']) addEventListener(k, (e) => L.t.push([performance.now(), k[5]]), { passive: true, capture: true });
  L.m = []; const nm = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
  new MutationObserver((ms) => { const t = performance.now(), y = scrollY; for (const m of ms) { if (L.m.length >= 4000) return; const el = m.target;
    let d = m.attributeName; if (d === 'class') { const o = new Set(String(m.oldValue || '').split(/\\s+/).filter(Boolean)), n = new Set(String(el.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
      d = [...n].filter((c) => !o.has(c)).map((c) => '+' + c).concat([...o].filter((c) => !n.has(c)).map((c) => '-' + c)).join(' '); if (!d) continue; }
    L.m.push([t, y, nm(el), d]); } }).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'inert', 'src', 'hidden', 'data-start-selling-scene'] });
  return 'ok'; })()`;
const SCRIPT = new Set(['FireAnimationFrame', 'EventDispatch', 'TimerFire', 'ObserverCallback', 'EvaluateScript', 'FunctionCall']);
const union = (iv) => { if (!iv.length) return 0; iv.sort((p, q) => p[0] - q[0]); let s = 0, [a, b] = iv[0]; for (const [x, y] of iv.slice(1)) { if (x > b) { s += b - a; a = x; b = y; } else b = Math.max(b, y); } return s + b - a; };

/** frames from Timeline records (startTime s) with page-clock offset `off` (ms), the rAF log f and touch log t */
export function frames(recs, off, f, t) {
  const yAt = (pm) => { let y = null; for (const [ts, v] of f) { if (ts > pm) break; y = v; } return y; };
  const downAt = (pm) => { let s = null; for (const [ts, k] of t) { if (ts > pm) break; s = k === 's' ? ts : null; } return s; };
  return recs.filter((r) => r.type === 'RenderingFrame').map((r) => {
    const by = { Layout: [], RecalculateStyles: [], Composite: [], script: [], forced: [] };
    const walk = (x, inS) => { const a = x.startTime * 1000, b = (x.endTime ?? x.startTime) * 1000;
      if (by[x.type]) by[x.type].push([a, b]); if (inS && (x.type === 'Layout' || x.type === 'RecalculateStyles')) by.forced.push([a, b]); const s = !inS && SCRIPT.has(x.type); if (s) by.script.push([a, b]); for (const c of x.children || []) walk(c, inS || s); };
    for (const c of r.children || []) walk(c, false);
    const pm = r.startTime * 1000 - off, d = downAt(pm);
    return { pm: r1(pm), dur: r1(((r.endTime ?? r.startTime) - r.startTime) * 1000), y: yAt(pm), down: d != null, since: d != null ? r1(pm - d) : null,
      lay: r1(union(by.Layout)), sty: r1(union(by.RecalculateStyles)), comp: r1(union(by.Composite)), js: r1(union(by.script)), forced: r1(union(by.forced)) };
  });
}
export function summarize(F) {
  const heavy = F.filter((x) => x.lay + x.sty >= 20);
  const top = [...F].sort((a, b) => b.dur - a.dur).slice(0, 8).map((x) => ({ y: x.y, dur: x.dur, down: x.down, lay: x.lay, sty: x.sty, comp: x.comp, js: x.js, forced: x.forced }));
  const cl = CLUSTERS.map(([a, b]) => { const G = F.filter((x) => x.y != null && x.y >= a && x.y <= b);
    return { y: `${a}-${b}`, frames: G.length, maxLS: r1(Math.max(0, ...G.map((x) => x.lay + x.sty))), maxComp: r1(Math.max(0, ...G.map((x) => x.comp))), maxDur: r1(Math.max(0, ...G.map((x) => x.dur))) }; });
  return { frames: F.length, forcedLS: { n: F.filter((x) => x.forced >= 5).length, sum: r1(F.reduce((a, x) => a + x.forced, 0)) }, downFrames: F.filter((x) => x.down).length, heavyLS: { n: heavy.length, ys: heavy.map((x) => Math.round(x.y)) }, top, clusters: cl };
}

async function runLoad(c, wda, prog) {
  const recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.evaluate(LOG);
  await sleep(4000);
  for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 1 }]]) await c.send(m, p);
  const syncT = await c.evaluate(timelineSyncJs('eopsim'));
  let sent = 0;
  for (const op of prog.ops) {
    if (op.op === 'stroke') { await wda.actions(op.actions); sent++; }
    else if (op.op === 'pause') await sleep(op.ms);
  }
  await sleep(1500);
  await c.send('Timeline.stop').catch(() => {});
  await sleep(500);
  const L = JSON.parse(await c.evaluate('JSON.stringify(window.__eops)'));
  // first-open readiness (after Timeline off, at the approach's end y, before any open): panel images with a src, loaded
  const imgs = JSON.parse(await c.evaluate("JSON.stringify((() => { const a = [...document.querySelectorAll('.start-selling-morph-col img')]; return { n: a.length, src: a.filter((i) => i.getAttribute('src')).length, loaded: a.filter((i) => i.complete && i.naturalWidth > 0).length }; })())"));
  const syncTL = findTimeStamp(recs, 'eopsim'); if (syncTL == null) throw new Error('no Timeline sync mark');
  const F = frames(recs, syncTL * 1000 - syncT, L.f, L.t);
  const S = summarize(F);
  // class/attribute flips per cluster (de-offscreen's suggestion): which elements change in the clusters' frames
  S.clusters.forEach((c, i) => { const [a, b] = CLUSTERS[i]; const ms = L.m.filter((m) => m[1] >= a - 50 && m[1] <= b + 50);
    c.mutations = ms.length; c.flips = [...new Set(ms.filter((m) => m[3] !== 'src').map((m) => `${m[2]} ${m[3]}`))].slice(0, 12); c.src = ms.filter((m) => m[3] === 'src').length; });
  // touch-end class (de-offscreen: a 24-29 ms frame ~50 ms before lift-off, no page script): per touchend the longest frame in [te - 120, te + 20]
  const te = L.t.filter((x) => x[1] === 'e').map((x) => x[0]);
  S.touchEnd = te.map((t) => { const w = F.filter((x) => x.pm >= t - 120 && x.pm <= t + 20); const m = w.reduce((p, x) => (!p || x.dur > p.dur ? x : p), null);
    return m && { y: Math.round(m.y), dur: m.dur, before: r1(t - m.pm), lay: m.lay, sty: m.sty, js: m.js }; }).filter(Boolean);
  return { strokes: sent, yEnd: L.f.at(-1)?.[1] ?? null, touches: L.t.length, imgs, mutations: L.m, summary: S, frames: F };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const p = compileScript(approachProgram(3)); const st = (p.ops || []).filter((o) => o.op === 'stroke');
  ok(st.length === 3 && st[0].actions?.actions?.[0]?.parameters?.pointerType === 'touch', `program ${st.length}`);
  const recs = [{ type: 'RenderingFrame', startTime: 1.0, endTime: 1.06, children: [{ type: 'RecalculateStyles', startTime: 1.0, endTime: 1.02, children: [{ type: 'Layout', startTime: 1.01, endTime: 1.015 }] }, { type: 'Layout', startTime: 1.02, endTime: 1.04 }, { type: 'Composite', startTime: 1.04, endTime: 1.06 }] },
    { type: 'RenderingFrame', startTime: 2.0, endTime: 2.016, children: [] }];
  const F = frames(recs, 0, [[900, 0], [1000, 640], [1990, 700]], [[950, 's'], [1500, 'e']]);
  ok(F[0].y === 640 && F[0].down && F[0].since === 50 && F[0].lay === 25 && F[0].sty === 20 && F[0].comp === 20, `f0 ${JSON.stringify(F[0])}`);
  ok(F[1].y === 700 && !F[1].down, `f1 ${JSON.stringify(F[1])}`);
  const S = summarize(F); ok(S.heavyLS.n === 1 && S.heavyLS.ys[0] === 640 && S.clusters[1].maxLS === 45, `sum ${JSON.stringify(S.clusters[1])}`);
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (approach program compiles to touch strokes, frame split by kind, finger-down, clusters)');
  return bad.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const loads = Number(process.argv[2] || 3); const arms = process.argv.slice(3).length ? process.argv.slice(3) : ['C', 'V'];
  const prog = compileScript(approachProgram(NDRAG));
  const wda = await createSession({ base: process.env.EOP_WDA || 'http://127.0.0.1:8101', simulator: true });
  const t0 = Date.now(), budget = Number(process.env.EOP_BUDGET_S || 270) * 1000, per = (NDRAG * 1.6 + 12) * 1000;
  try {
    outer: for (let n = 1; n <= loads; n++) for (const arm of arms) {
      const file = join(D, `sim-${arm}-${n}.json`);
      if (existsSync(file)) { console.log(`exists ${arm}-${n}`); continue; }
      if (budget - (Date.now() - t0) < per + 10000) { console.log(`STOP budget before ${arm}-${n}`); break outer; }
      const port = JSON.parse(readFileSync(join(WT, `out/eopp/serve-${arm}.json`), 'utf8')).port;
      const url = `http://localhost:${port}/?eops=${arm}-${n}-${Date.now()}`;
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
      let r; try { r = await runLoad(c, wda, prog); } catch (e) { console.log(`ERR ${arm}-${n}: ${errText(e)}`); c.close(); continue; }
      c.close(); r.arm = arm; r.n = n; r.url = url; r.ready = ready;
      writeFileSync(file, JSON.stringify(r, null, 1));
      const s = r.summary;
      console.log(`SIMLINE ${arm}-${n}: strokes ${r.strokes} yEnd ${Math.round(r.yEnd)} frames ${s.frames} (down ${s.downFrames}) | forced L/S >= 5: ${s.forcedLS.n} (sum ${s.forcedLS.sum}) | Layout+style >= 20: ${s.heavyLS.n} at ${s.heavyLS.ys.join(',')} | clusters ${s.clusters.map((x) => `${x.y}:LS${x.maxLS}/C${x.maxComp}/m${x.mutations}`).join(' ')} | touch-end max ${Math.max(0, ...s.touchEnd.map((x) => x.dur))} | panel imgs src/loaded ${r.imgs ? `${r.imgs.src}/${r.imgs.loaded} of ${r.imgs.n}` : 'n/a'}`);
    }
  } finally { await wda.close(); }
}

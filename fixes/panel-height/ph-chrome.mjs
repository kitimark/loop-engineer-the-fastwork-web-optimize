#!/usr/bin/env node
// panel-height (fix-panel-height): Chrome COUNTS only (no timing; durations are not read), the lead's stand-in for the
// iOS toolbar until the Simulator is free: the toolbar's show/hide is emulated as viewport-height steps 775 <-> 815
// (Emulation.setDeviceMetricsOverride, 430 wide, DPR 3, mobile, touch), one step per two rAFs, 8 steps each way.
// In Chrome's emulation every viewport unit (vh, svh, lvh, dvh) follows the emulated viewport (checked per load: the
// `units` line), so Chrome cannot show "vh stays, dvh moves". The arms therefore model the two behaviours directly:
//   D     out/ph/D (dvh): the panel height follows every step (in Chrome A and S do the same; on iOS only dvh does)
//   Dfix  out/ph/D plus a style that pins --panel-h to calc(815px - 24px) in the same two rules (top-nav <= 640 px,
//         P1's .fw-rv-glass[data-fw-rv]): the panel height never follows a step, which is what vh (A) and svh (S) do
//         on iOS. The delta D - Dfix is the work the panel itself adds per toolbar step with dvh.
// Per phase: Performance.getMetrics LayoutCount / RecalcStyleCount deltas, ResizeObserver callbacks and entries by
// target (window.ResizeObserver wrapped before the page loads), the nav's inline-style mutation records and how many of
// them changed its clip-path (P1's reveal re-applies), distinct nav heights. A held synthetic touch keeps 7d's settle
// off (as em-p1-px.mjs). Phases (start height 775):
//   end      scrollY = max (m = 1, panel open), 775 -> 815 -> 775
//   endPin   the same, re-scrolling to the new max after each step (m stays 1)
//   morph    scrollY = endStart + t/2 (m ~0.5, P1's reveal on), 775 -> 815 -> 775
//   mid      scrollY 2400 (m = 0, pill), 775 -> 815 -> 775
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 120 --owner fix-panel-height -- \
//     node fixes/panel-height/ph-chrome.mjs [--arms D,Dfix] [--label x]
// Output: out/ph/chrome-<label>-<stamp>.json (gitignored).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = (arg('--arms') || 'D,Dfix').split(',');
const LABEL = arg('--label', ARMS.join(''));
const STEPS = 8, H0 = 775, H1 = 815;
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(WT, 'out/ph'); mkdirSync(OUT, { recursive: true });
const FIX_CSS = `@media (width<=640px) { .start-selling-top-nav.svelte-1dcozpm { --panel-h: calc(${H1}px - 24px); } .fw-rv-glass[data-fw-rv] { --panel-h: calc(${H1}px - 24px); } }`;
const RO_WRAP = `(() => { const R = window.ResizeObserver; if (!R || R.__ph) return; const S = window.__phRO = { calls: 0, entries: {} };
  const name = (t) => (t && t.className && typeof t.className === 'string' ? t.className.split(/\\s+/).filter((x) => !/^svelte-/.test(x))[0] : t && t.nodeName) || '?';
  class W extends R { constructor(cb) { super((es, o) => { S.calls++; for (const e of es) { const k = name(e.target); S.entries[k] = (S.entries[k] || 0) + 1; } return cb(es, o); }); } }
  W.__ph = true; window.ResizeObserver = W; })()`;
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const mk = (u) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;height:100' + u; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h; };
  const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; const h = document.querySelector('header.start-selling-top-nav');
  return { ih: innerHeight, y: scrollY, max, t, endStart: max - t, m: h ? h.style.getPropertyValue('--morph') : null, rv: h ? h.hasAttribute('data-fw-rv') : null, navH: h ? h.getBoundingClientRect().height : null,
    units: { vh: mk('vh'), svh: mk('svh'), lvh: mk('lvh'), dvh: mk('dvh') }, probe: !!document.querySelector('.fw-rv-size'), glass: !!document.querySelector('.fw-rv-glass'), panelH: h ? getComputedStyle(h).getPropertyValue('--panel-h').trim() : null }; })())`;
// counters around a phase: MO on the nav's style (records, clip-path changes), RO wrap counters reset, nav heights via RO
const ARM_COUNTERS = `(() => { const h = document.querySelector('header.start-selling-top-nav'); const P = window.__phP = { mo: 0, clip: 0, heights: [] };
  const clipOf = (s) => { const m = /clip-path:\\s*([^;]*)/.exec(s || ''); return m ? m[1] : ''; };
  P.o = new MutationObserver((rs) => { for (const r of rs) { P.mo++; if (clipOf(r.oldValue) !== clipOf(h.getAttribute('style'))) P.clip++; } }); P.o.observe(h, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  window.__phRO.calls = 0; window.__phRO.entries = {}; return 1; })()`;
const READ_COUNTERS = `JSON.stringify((() => { const P = window.__phP; P.o.disconnect(); return { mo: P.mo, clip: P.clip, ro: window.__phRO.calls, roEntries: window.__phRO.entries }; })())`;

// trace counts (no durations): Layout dirtyObjects, UpdateLayoutTree elementCount, Paint count and area (css px of the
// paint clip quad, x DPR not undone), big paints (>= 100k px) by size
function traceStats(ev) {
  const o = { layouts: 0, dirtyObjects: 0, styles: 0, styleElements: 0, paints: 0, kpx: 0, big: {} };
  for (const e of ev) {
    if (e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B')) { o.layouts++; o.dirtyObjects += e.args?.beginData?.dirtyObjects || 0; }
    else if (e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'E' || e.ph === 'B')) { const n = e.args?.elementCount ?? e.args?.data?.elementCount ?? e.args?.endData?.elementCount; if (e.ph !== 'E') o.styles++; if (n) o.styleElements += n; }
    else if (e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B')) { o.paints++; const q = e.args?.data?.clip; if (q && q.length >= 8) { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); o.kpx += (w * h) / 1e3; if (w * h >= 100000) { const k = `${Math.round(w)}x${Math.round(h)}`; o.big[k] = (o.big[k] || 0) + 1; } } }
  }
  o.kpx = Math.round(o.kpx); return o;
}
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/ph/chrome'), 'ph'), headless: true, windowSize: `430,${H0}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/panel-height/ph-chrome.mjs', label: LABEL, startedAt: new Date().toISOString(), load1: loadavg()[0], steps: STEPS, h: [H0, H1], arms: [] };
try {
  for (const arm of ARMS) {
    const dir = join(WT, 'out/ph', arm.replace(/fix$/, ''));
    const st = join(OUT, `serve-chrome-${arm}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const run = { arm, dir, phases: {} }; let page = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const url = `http://localhost:${s.port}/`;
      run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      page = await cdp.newIsolatedPage();
      const metrics = async (h) => page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await metrics(H0);
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RO_WRAP });
      await page.send('Performance.enable', {});
      await C.gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
      await sleep(1500);
      if (arm.endsWith('fix')) await page.eval(`(() => { const s = document.createElement('style'); s.id = 'ph-fix'; s.textContent = ${JSON.stringify(FIX_CSS)}; document.head.appendChild(s); return 1; })()`);
      let g = JSON.parse(await page.eval(GEO));
      if (!g.t) throw new Error('no .fw-ms-end (7c off)');
      await page.eval(`new Promise((res) => { let y = 0; const L = ${g.endStart - g.ih}; const step = () => { y = Math.min(L, y + 500); scrollTo({ top: y, behavior: 'instant' }); y < L ? setTimeout(step, 50) : setTimeout(() => res(1), 1500); }; step(); })`);
      await page.eval(TOUCH);
      g = JSON.parse(await page.eval(GEO)); run.geo0 = g;
      const raf2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`;
      const m = async () => Object.fromEntries((await page.send('Performance.getMetrics', {})).metrics.filter((x) => /^(LayoutCount|RecalcStyleCount)$/.test(x.name)).map((x) => [x.name, x.value]));
      const phase = async (name, y, { pin = false } = {}) => {
        await metrics(H0); await page.eval(`(scrollTo({ top: ${y === 'max' ? 'document.documentElement.scrollHeight' : y}, behavior: 'instant' }), 1)`); await sleep(1200);
        const before = JSON.parse(await page.eval(GEO));
        const ev = []; const off = page.on((x) => { if (x.method === 'Tracing.dataCollected') ev.push(...x.params.value); });
        await page.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
        await page.eval(ARM_COUNTERS); const m0 = await m(); const navH = new Set(); const ms = new Set();
        const hs = [...Array.from({ length: STEPS }, (_, i) => Math.round(H0 + (H1 - H0) * (i + 1) / STEPS)), ...Array.from({ length: STEPS }, (_, i) => Math.round(H1 - (H1 - H0) * (i + 1) / STEPS))];
        for (const h of hs) {
          await metrics(h);
          if (pin) await page.eval(`(scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }), 1)`);
          await page.eval(raf2);
          const q = JSON.parse(await page.eval(`JSON.stringify((() => { const h = document.querySelector('header.start-selling-top-nav'); return [h.style.getPropertyValue('--morph'), h.offsetHeight]; })())`));
          ms.add(q[0]); navH.add(q[1]);
        }
        // the per-step reads above (offsetHeight) force a layout only when one is pending; they are the same in both arms
        const m1 = await m(); const cnt = JSON.parse(await page.eval(READ_COUNTERS));
        const done = page.waitFor((x) => x.method === 'Tracing.tracingComplete', 20000); await page.send('Tracing.end', {}); await done; off();
        const tr = traceStats(ev);
        const after = JSON.parse(await page.eval(GEO));
        run.phases[name] = { y, pin, before: { y: before.y, m: before.m, navH: before.navH, ih: before.ih }, after: { y: after.y, m: after.m, navH: after.navH }, layouts: m1.LayoutCount - m0.LayoutCount, styles: m1.RecalcStyleCount - m0.RecalcStyleCount, trace: tr, ...cnt, navHeights: [...navH], ms: [...ms].slice(0, 20) };
        const r = run.phases[name];
        console.log(arm.padEnd(5), name.padEnd(7), `m ${r.before.m}->${r.after.m} navH ${r.before.navH}`, `| layouts ${r.layouts} styles ${r.styles} | trace: layout dirty objs ${tr.dirtyObjects} (${tr.layouts} layouts) restyled elems ${tr.styleElements} (${tr.styles}) paints ${tr.paints} kpx ${tr.kpx} big ${JSON.stringify(tr.big)} | RO calls ${r.ro} ${JSON.stringify(r.roEntries)} navStyleMut ${r.mo} clipChanges ${r.clip} | navHeights ${JSON.stringify(r.navHeights)} m-values ${r.ms.length}`);
      };
      run.units775 = g.units; await metrics(H1); await page.eval(raf2); run.units815 = JSON.parse(await page.eval(GEO)).units; await metrics(H0); await page.eval(raf2);
      console.log(arm, 'served', JSON.stringify(run.served), 'units@775', JSON.stringify(run.units775), 'units@815', JSON.stringify(run.units815), 'probe', g.probe, 'panelH', g.panelH);
      g = JSON.parse(await page.eval(GEO));
      await phase('end', 'max');
      await phase('endPin', 'max', { pin: true });
      await phase('morph', Math.round(g.endStart + g.t / 2));
      await phase('mid', 2400);
    } catch (e) { run.error = String(e.stack || e.message || e); console.log(arm, 'error', run.error); }
    finally { try { await page?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
    res.arms.push(run);
  }
} finally { try { cdp.close(); } catch {} try { await chrome.close(); } catch {} }
res.endedAt = new Date().toISOString(); res.load1End = loadavg()[0];
const f = join(OUT, `chrome-${LABEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
process.exit(0);

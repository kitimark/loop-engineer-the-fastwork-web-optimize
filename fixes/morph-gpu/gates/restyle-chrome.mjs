// morph-gpu work counts in Chrome (fix-morph-gpu; adapted from fixes/morph-inherit/restyle-chrome.mjs): restyle, layout and
// paint counts of the morph tween, M = best-build vs R = this fix (newest out/snapshots/rv-*, or RV=<dir>).
// Headless Chrome 430x932 DPR 3 mobile, no CPU throttle (counts only, no timing is judged). Per load: scroll to the end,
// Tracing on (devtools.timeline), the build's own M driver __fwMorphDrive({hold, cycles}), Tracing off. Counts:
// UpdateLayoutTree events and their elementCount (elements restyled), Layout events, plus Performance.getMetrics deltas
// (RecalcStyleCount, LayoutCount), Paint events, and the driver's frame counts (moving / atOne / atZero). Builds alternate M, R, M, R.
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-morph-gpu \
//   -- node fixes/morph-gpu/gates/restyle-chrome.mjs [--order M,R,M,R] [--hold 1500] [--cycles 2]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const { readdirSync, statSync } = await import('node:fs');
const rvDir = process.env.RV || readdirSync(SNAP).filter((d) => /^rv-[0-9a-f]{12}$/.test(d)).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const BUILDS = {
  M: { dir: join(SNAP, 'best-65052c4a3902'), js: '65052c4a3902', css: 'e0f92804c521' }, // best-build (main 60df1cf)
  R: { dir: rvDir, js: hashOf(rvDir, NODE), css: hashOf(rvDir, CSS) },
};
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--order', 'M,R,M,R').split(',');
const HOLD = Number(arg('--hold', '1500')), CYCLES = Number(arg('--cycles', '2'));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-gpu'); mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'].join(',');

async function serve(label, i) {
  const st = join(OUT, `serve-${tag}-${label}${i}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url };
}
const metrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const profileDir = tempProfileDir(join(WT, 'out/morph-gpu/chrome'), 'rv');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-morph-gpu restyle-chrome', rvDir, browser: chrome.browser, hold: HOLD, cycles: CYCLES, runs: [] };
try {
  for (let i = 0; i < ORDER.length; i++) {
    const b = ORDER[i]; const srv = await serve(b, i); const page = await cdp.newIsolatedPage();
    const R = { build: b, i };
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Performance.enable');
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      R.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (R.served.js !== BUILDS[b].js || R.served.css !== BUILDS[b].css) { R.void = JSON.stringify(R.served); console.log('VOID', b, R.void); continue; }
      await page.eval(`new Promise((res) => { let y = 0; const H = document.documentElement.scrollHeight; const step = () => { y += 200; window.scrollTo({ top: y, behavior: 'instant' }); y < H ? requestAnimationFrame(step) : setTimeout(res, 2500); }; requestAnimationFrame(step); })`, { timeout: 60000 });
      const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      const m0 = await metrics(page);
      const syncT = await page.eval(`performance.mark('rv-sync').startTime`);
      await page.eval(`(window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} }), 1)`);
      let md = null; for (let k = 0; k < 200 && !md; k++) { await sleep(100); md = await page.eval('window.__fwMD'); }
      const m1 = await metrics(page);
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      await page.send('Tracing.end'); await done; off();
      const d = JSON.parse(md);
      const ult = ev.filter((e) => e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'E' || e.ph === 'B'));
      const elems = ult.reduce((s, e) => s + (e.args?.elementCount ?? e.args?.endData?.elementCount ?? 0), 0);
      const lay = ev.filter((e) => e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B'));
      const paint = ev.filter((e) => e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B'));
      const big = paint.filter((e) => { const q = e.args?.data?.clip; if (!q) return false; const w = Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h = Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]); return w * h > 100 * 100; });
      R.counts = { updateLayoutTree: ult.filter((e) => e.ph !== 'E').length, elementsRestyled: elems, layouts: lay.length, paints: paint.length, paintsOver100x100: big.length,
        recalcStyleCount: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutCount: m1.LayoutCount - m0.LayoutCount };
      R.frames = { all: d.all.frames, moving: d.moving.frames, atOne: d.atOne.frames, atZero: d.atZero.frames };
      // per phase: trace events cut by the driver's rAF frames (frame i = [t_i, t_i+1) on the page clock, via the rv-sync mark)
      const mk = ev.find((e) => e.name === 'rv-sync');
      if (mk) {
        const off = mk.ts / 1000 - syncT, fr = d.frames, ph = {};
        const phase = (i) => { const m = fr[i][3], mp = i ? fr[i - 1][3] : m; return m !== mp || (m > 0.001 && m < 0.999) ? 'moving' : m >= 0.999 ? 'atOne' : 'atZero'; };
        const begins = ev.filter((e) => e.ph === 'X' || e.ph === 'B').map((e) => ({ e, t: e.ts / 1000 - off })).sort((a, b) => a.t - b.t);
        let j = 0;
        for (let i = 1; i + 1 < fr.length; i++) {
          const a = fr[i][0], b = fr[i + 1][0], k = phase(i), P = (ph[k] ||= { frames: 0, styles: 0, elems: 0, layouts: 0, dirty: 0, paints: 0, paintArea: 0 });
          P.frames++;
          while (j < begins.length && begins[j].t < a) j++;
          for (let q = j; q < begins.length && begins[q].t < b; q++) {
            const e = begins[q].e;
            if (e.name === 'UpdateLayoutTree') { P.styles++; P.elems += e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0; }
            if (e.name === 'Layout') { P.layouts++; P.dirty += e.args?.beginData?.dirtyObjects ?? 0; }
            if (e.name === 'Paint') { P.paints++; const c = e.args?.data?.clip; if (c) P.paintArea += (Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6])) * (Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7])); }
          }
        }
        R.phases = Object.fromEntries(Object.entries(ph).map(([k, P]) => [k, { frames: P.frames, perFrame: { styles: +(P.styles / P.frames).toFixed(2), elems: +(P.elems / P.frames).toFixed(1), layouts: +(P.layouts / P.frames).toFixed(2), dirtyObjects: +(P.dirty / P.frames).toFixed(1), paints: +(P.paints / P.frames).toFixed(2), paintMpx: +(P.paintArea / P.frames / 1e6).toFixed(3) } }]));
        console.log(b, i, 'phases', JSON.stringify(R.phases));
      } else console.log(b, i, 'no rv-sync mark in the trace');
      R.perFrame = { elementsRestyled: Math.round(elems / Math.max(1, d.all.frames) * 10) / 10, layouts: Math.round(lay.length / Math.max(1, d.all.frames) * 100) / 100, paints: Math.round(paint.length / Math.max(1, d.all.frames) * 100) / 100 };
      console.log(b, i, JSON.stringify(R.counts), JSON.stringify(R.frames), JSON.stringify(R.perFrame));
    } finally { await page.close(); srv.proc.kill(); res.runs.push(R); }
  }
} finally {
  writeFileSync(join(OUT, `restyle-chrome-${tag}.json`), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', join(OUT, `restyle-chrome-${tag}.json`));
}

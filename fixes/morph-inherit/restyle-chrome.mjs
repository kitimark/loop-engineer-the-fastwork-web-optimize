// morph-inherit gates (b)/(c) in Chrome (fix-nav-morph): restyle and layout counts of the morph tween, old C vs fixed C.
// Headless Chrome 430x932 DPR 3 mobile, no CPU throttle (counts only, no timing is judged). Per load: scroll to the end,
// Tracing on (devtools.timeline), the build's own M driver __fwMorphDrive({hold, cycles}), Tracing off. Counts:
// UpdateLayoutTree events and their elementCount (elements restyled), Layout events, plus Performance.getMetrics deltas
// (RecalcStyleCount, LayoutCount), and the driver's frame counts (moving / atOne / atZero). Builds alternate C, M, C, M.
// Run (shared lane): node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph \
//   -- node fixes/morph-inherit/restyle-chrome.mjs [--order C,M,C,M] [--hold 1500] [--cycles 2]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const BUILDS = {
  C: { dir: join(SNAP, 'f3a-st6rb2'), js: '7bf7c4657d21', css: 'f523598b2a24' },
  M: { dir: join(SNAP, 'mi-7c61fe7d0662'), js: '7c61fe7d0662', css: 'f523598b2a24' },
};
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ORDER = arg('--order', 'C,M,C,M').split(',');
const HOLD = Number(arg('--hold', '1500')), CYCLES = Number(arg('--cycles', '2'));
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/morph-inherit'); mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline'].join(',');

async function serve(label, i) {
  const st = join(OUT, `serve-${tag}-${label}${i}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', BUILDS[label].dir, '--port', '0', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s) { p.kill(); throw new Error(label + ': server did not start'); }
  return { proc: p, url: s.url };
}
const metrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const profileDir = tempProfileDir(join(WT, 'out/morph-inherit/chrome'), 'mi');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fix-nav-morph morph-inherit restyle-chrome', browser: chrome.browser, hold: HOLD, cycles: CYCLES, runs: [] };
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
      await page.eval(`(window.__fwMorphDrive({ hold: ${HOLD}, cycles: ${CYCLES} }), 1)`);
      let md = null; for (let k = 0; k < 200 && !md; k++) { await sleep(100); md = await page.eval('window.__fwMD'); }
      const m1 = await metrics(page);
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
      await page.send('Tracing.end'); await done; off();
      const d = JSON.parse(md);
      const ult = ev.filter((e) => e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'E' || e.ph === 'B'));
      const elems = ult.reduce((s, e) => s + (e.args?.elementCount ?? e.args?.endData?.elementCount ?? 0), 0);
      const lay = ev.filter((e) => e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B'));
      R.counts = { updateLayoutTree: ult.filter((e) => e.ph !== 'E').length, elementsRestyled: elems, layouts: lay.length,
        recalcStyleCount: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutCount: m1.LayoutCount - m0.LayoutCount };
      R.frames = { all: d.all.frames, moving: d.moving.frames, atOne: d.atOne.frames, atZero: d.atZero.frames };
      R.perMovingFrame = { elementsRestyled: Math.round(elems / Math.max(1, d.all.frames) * 10) / 10 };
      console.log(b, i, JSON.stringify(R.counts), JSON.stringify(R.frames));
    } finally { await page.close(); srv.proc.kill(); res.runs.push(R); }
  }
} finally {
  writeFileSync(join(OUT, `restyle-chrome-${tag}.json`), JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', join(OUT, `restyle-chrome-${tag}.json`));
}

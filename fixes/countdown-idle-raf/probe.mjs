// countdown-idle-raf mechanism probe (counts only): base vs variant 03 (fixes/countdown-idle-raf/overlay) vs
// variant 05 (fixes/countdown-idle-raf--layers/overlay). Mobile 430x932 DPR3, CPU 6x, ABC/CBA, fresh isolated
// context per page. Per target: compositing layers (LayerTree), will-change elements in the timers, digit parity,
// and two 6 s idle windows ("top", "mid" after a smooth scrollTo) with face style writes (MutationObserver) and
// CDP Performance.getMetrics deltas. Rebuild the overlays first (fix.mjs apply countdown-idle-raf; variants/05.diff
// into countdown-idle-raf--layers). Run ONLY inside a chrome-measure hold:
//   node tools/lock.mjs run chrome-measure --owner countdown-idle-raf --short --max-seconds 300 -- node fixes/countdown-idle-raf/probe.mjs 2
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const BASE = resolveTree('site-pretty');
const OUT = join(WT, 'out/countdown-probe');
mkdirSync(OUT, { recursive: true });
const RUNS = Number(process.argv[2] || 3), WIN = 6000;

async function server(label, extra) {
  const st = join(OUT, `serve-${label}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...extra, '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(label + ' server did not start');
}
const INJECT = `(() => {
  const S = window.__cd = { writes: 0, frames: [], on: false };
  new MutationObserver((l) => { if (S.on) for (const m of l) if (m.target.classList && m.target.classList.contains('svelte-1quva9c')) S.writes++; })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
  let last = 0; const tick = (t) => { if (S.on && last) S.frames.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
})();`;
const KEYS = ['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'RecalcStyleCount', 'LayoutCount', 'LayoutDuration'];
const metrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => KEYS.includes(m.name)).map((m) => [m.name, m.value]));

async function window_(page) {
  await page.eval(`(window.__cd.writes = 0, window.__cd.frames = [], window.__cd.on = true)`);
  const a = await metrics(page); await sleep(WIN); const b = await metrics(page);
  const s = await page.eval(`(window.__cd.on = false, { writes: window.__cd.writes, frames: window.__cd.frames })`);
  const d = {}; for (const k of KEYS) d[k] = /Duration/.test(k) ? Math.round((b[k] - a[k]) * 1000) : b[k] - a[k];
  return { faceWrites: s.writes, frames: s.frames.length, gt20: s.frames.filter((x) => x > 20).length, ...d };
}

// compositing layers (CDP LayerTree) and countdown will-change elements
async function layerCount(page) {
  const got = page.waitFor((m) => m.method === 'LayerTree.layerTreeDidChange' && m.params.layers, 5000).catch(() => null);
  await page.send('LayerTree.enable');
  const m = await got;
  const dom = await page.eval(`(() => { const t = [...document.querySelectorAll('[role=timer]')]; const els = t.flatMap((x) => [...x.querySelectorAll('*')]);
    return { timers: t.length, faces: els.filter((e) => e.classList.contains('face') && e.classList.contains('svelte-1quva9c')).length,
      willChangeTransform: els.filter((e) => getComputedStyle(e).willChange.includes('transform')).length }; })()`);
  await page.send('LayerTree.disable');
  return { total: m ? m.params.layers.length : null, ...dom };
}
// visible digit (face whose top is within 1px of its cell's top) vs the number's data-value, 12 samples 150 ms apart
const PARITY = `new Promise((res) => { let ok = 0, n = 0, bad = [];
  const one = () => { for (const num of document.querySelectorAll('[data-testid=sliding-number]')) { n++;
      const shown = [...num.querySelectorAll('.digit')].map((d) => { const top = d.getBoundingClientRect().top;
        const f = [...d.querySelectorAll('.face')].find((f) => Math.abs(f.getBoundingClientRect().top - top) < 1); return f ? f.textContent.trim() : '?'; }).join('');
      if (shown === num.dataset.value) ok++; else if (bad.length < 4) bad.push(shown + '!=' + num.dataset.value); } };
  let k = 0; const id = setInterval(() => { one(); if (++k >= 12) { clearInterval(id); res({ ok, n, bad }); } }, 150); })`;

async function run(cdp, label, url) {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
  await page.send('Performance.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
  const layers = await layerCount(page);
  const parity = await page.eval(PARITY);
  const top = await window_(page);
  const y = await page.eval(`(scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)), scrollY)`);
  await sleep(2000);
  const inView = await page.eval(`[...document.querySelectorAll('[role=timer]')].map((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })`);
  const mid = await window_(page);
  await page.close();
  return { label, errors, layers, parity, top, mid, midY: y, timersInViewMid: inView };
}

const base = await server('base', []);
const fix = await server('fix', ['--overlay', join(WT, 'fixes/countdown-idle-raf/overlay')]);
const lay = await server('layers', ['--overlay', join(WT, 'fixes/countdown-idle-raf--layers/overlay')]);
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const T = [['base', base.url], ['fix', fix.url], ['layers', lay.url]];
    const order = i % 2 ? [...T].reverse() : T;
    for (const [l, u] of order) { const r = await run(cdp, l, u); r.run = i; r.load1 = (await import('node:os')).loadavg()[0]; res.push(r); console.log(JSON.stringify(r)); }
  }
} finally { cdp.close(); await ch.close(); base.p.kill(); fix.p.kill(); lay.p.kill(); }
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const summary = {};
for (const l of ['base', 'fix', 'layers']) for (const w of ['top', 'mid']) for (const k of ['faceWrites', 'gt20', 'TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'RecalcStyleCount', 'LayoutCount']) {
  const xs = res.filter((r) => r.label === l).map((r) => r[w][k]);
  summary[`${w}.${k}`] ??= {}; summary[`${w}.${k}`][l] = `${med(xs)} [${Math.min(...xs)}-${Math.max(...xs)}]`;
}
for (const l of ['base', 'fix', 'layers']) { const rs = res.filter((r) => r.label === l);
  summary[`layers.total`] ??= {}; summary[`layers.total`][l] = rs.map((r) => r.layers.total).join(',');
  summary[`layers.willChangeInTimers`] ??= {}; summary[`layers.willChangeInTimers`][l] = rs.map((r) => r.layers.willChangeTransform).join(',');
  summary[`parity ok/n`] ??= {}; summary[`parity ok/n`][l] = rs.map((r) => `${r.parity.ok}/${r.parity.n}`).join(','); }
console.table(summary);
writeFileSync(join(OUT, 'probe.json'), JSON.stringify({ runs: RUNS, windowMs: WIN, res, summary }, null, 1));
console.log('wrote', join(OUT, 'probe.json'));

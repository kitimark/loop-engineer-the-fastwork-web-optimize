// Read-only instrumentation for fix pain-offscreen-notes: counts (not timings) of the pain section's
// per-frame work and DOM mutations, baseline vs patched, mobile + desktop, CPU 6x.
// Run under the lock:  node tools/lock.mjs run chrome-measure --owner <you> -- node fixes/pain-offscreen-notes/probe/pain-counts.mjs
// Env: RUNS (default 2), CPU (6), QUICK=1 (skip the full scroll), OFFS (idle offsets in viewports from
// .pain top, default 1.2), IDLE (ms per idle window, 15000), VPS (mobile,desktop), ONLY=base, OUT (output dir).
// Known limits: pain reads are attributed by stack line 4720-4739 of the served pretty 2.DyWL8TcE.js
// (only valid for this baseline/overlay); the .pain-notes-stage mutation counter is blind (notes
// render in .pain-canvas) - use extraNotes instead.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const SP = resolve(process.env.OUT || join(WT, 'out', 'probe-pain-offscreen-notes'));
mkdirSync(SP, { recursive: true });
const BASE = resolveTree('site-pretty');
const OVERLAY = join(WT, 'fixes/pain-offscreen-notes/overlay');
const RUNS = Number(process.env.RUNS || 2);
const CPU = Number(process.env.CPU || 6);

async function startServer(label, extra) {
  const state = join(SP, `serve-${label}.json`);
  rmSync(state, { force: true });
  const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...extra, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(state)) { try { return { proc, ...JSON.parse(readFileSync(state, 'utf8')) }; } catch {} } await sleep(100); }
  throw new Error('server did not start ' + label);
}

const INSTR = `(() => {
  const C = window.__pc = { on: false, qs: 0, rect: 0, rectPain: 0, rectPainMs: 0, intervalsStarted: 0, intervalsCleared: 0, ticks3s: 0, mut: 0, mutPain: 0, mutStage: 0 };
  const qs = Document.prototype.querySelector;
  Document.prototype.querySelector = function (s) { if (C.on && s === '.commission-card') C.qs++; return qs.call(this, s); };
  const gbcr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (!C.on || !this.classList || !this.classList.contains('commission-card')) return gbcr.call(this);
    C.rect++;
    const st = new Error().stack || '';
    const pain = /2\\.DyWL8TcE\\.js:47[23]\\d:/.test(st);
    const t0 = performance.now(); const r = gbcr.call(this); const dt = performance.now() - t0;
    if (pain) { C.rectPain++; C.rectPainMs += dt; }
    return r;
  };
  const si = window.setInterval, ci = window.clearInterval, ids = new Set();
  window.setInterval = function (fn, ms, ...a) {
    if (ms === 3e3 && typeof fn === 'function') { C.intervalsStarted++; (C.stacks ||= []).push(((new Error().stack)||'').split(String.fromCharCode(10)).slice(2,4).join(' | ').split(location.origin).join('')); const id = si.call(window, function () { if (C.on) C.ticks3s++; return fn.apply(this, arguments); }, ms, ...a); ids.add(id); return id; }
    return si.call(window, fn, ms, ...a);
  };
  window.clearInterval = function (id) { if (ids.has(id)) { ids.delete(id); C.intervalsCleared++; } return ci.call(window, id); };
  C.live = () => ids.size;
  new MutationObserver((recs) => {
    if (!C.on) return;
    for (const r of recs) {
      C.mut++;
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (el && el.closest('.pain')) { C.mutPain++; if (el.closest('.pain-notes-stage')) C.mutStage++; }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();`;

const SCROLL = `new Promise((res) => {
  const t0 = performance.now(); let still = 0, ticks = 0;
  const id = setInterval(() => {
    const y = scrollY; ticks++;
    window.scrollBy({ top: 250, behavior: 'smooth' });
    setTimeout(() => { if (scrollY === y) still++; else still = 0;
      if (still >= 4 || ticks > 400) { clearInterval(id); res({ ms: Math.round(performance.now() - t0), ticks, y: scrollY }); } }, 280);
  }, 300);
})`;
const RESET = `(() => { const C = window.__pc; for (const k of ['qs','rect','rectPain','rectPainMs','ticks3s','mut','mutPain','mutStage']) C[k] = 0; C.on = true; })()`;
const READ = `(() => { const C = window.__pc; C.on = false; const n = document.querySelectorAll('.pain-note'); return { qs: C.qs, rect: C.rect, rectPain: C.rectPain, rectPainMs: Math.round(C.rectPainMs*10)/10, intervalsStarted: C.intervalsStarted, intervalsCleared: C.intervalsCleared, liveIntervals: C.live(), ticks3s: C.ticks3s, mut: C.mut, mutPain: C.mutPain, mutStage: C.mutStage, notes: n.length, extraNotes: document.querySelectorAll('.pain-note.extra').length, stacks: C.stacks || [], notesRect: (() => { const r = document.querySelector('.pain-notes').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(), commTop: Math.round(document.querySelector('.commission-card')?.getBoundingClientRect().top), vh: innerHeight, notesDisplay: getComputedStyle(document.querySelector('.pain-notes')).display }; })()`;
const VPS = { mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } };

async function measure(cdp, url, vpName) {
  const vp = VPS[vpName];
  const page = await cdp.newIsolatedPage();
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', vp);
  if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, url, { quietMs: 2000 });
  await sleep(1500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await sleep(1000);
  const out = {};
  await page.eval(RESET); await sleep(6000); out.idleTop = await page.eval(READ);
  if (!process.env.QUICK) { await page.eval(RESET); out.scrollInfo = await page.eval(SCROLL, { timeout: 600000 }); await sleep(500); out.scroll = await page.eval(READ); }
  // idle inside the pain section at several offsets (desktop: notes visible -> interval runs)
  for (const off of (process.env.OFFS || '1.2').split(',').map(Number)) {
    await page.eval(`(() => { const p = document.querySelector('.pain'); const y = p.getBoundingClientRect().top + scrollY + innerHeight * ${off}; window.scrollTo({ top: y, behavior: 'instant' }); })()`);
    await sleep(1500);
    await page.eval(RESET); await sleep(Number(process.env.IDLE || 15000)); out['idlePain' + (off === 1.2 ? '' : '@' + off)] = await page.eval(READ);
  }
  // then scroll slowly down through the rest of pain -> commission (clears notes on desktop)
  await page.eval(RESET);
  await page.eval(`new Promise(async (res) => { for (let i = 0; i < 16; i++) { window.scrollBy({ top: 150, behavior: 'smooth' }); await new Promise(r => setTimeout(r, 300)); } res(); })`, { timeout: 120000 });
  await sleep(500); out.painToCommission = await page.eval(READ);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  return out;
}

const base = await startServer('base', []);
const fix = await startServer('fix', ['--overlay', OVERLAY]);
const kill = () => { for (const p of [base.proc, fix.proc]) try { p.kill(); } catch {} };
process.on('exit', kill);
const ch = await launchChrome({ port: 0, profileDir: join(SP, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const results = [];
try {
  for (const vpName of (process.env.VPS || 'mobile,desktop').split(',')) for (let run = 0; run < RUNS; run++) {
    const order = process.env.ONLY === 'base' ? [['base', base.url]] : run % 2 ? [['fix', fix.url], ['base', base.url]] : [['base', base.url], ['fix', fix.url]];
    for (const [label, url] of order) {
      const r = await measure(cdp, url, vpName);
      results.push({ vp: vpName, run, label, ...r });
      console.log(JSON.stringify({ vp: vpName, run, label, ...r }));
    }
  }
} finally { cdp.close(); await ch.close(); kill(); }
mkdirSync(SP, { recursive: true });
writeFileSync(join(SP, `pain-counts-${Date.now()}.json`), JSON.stringify(results, null, 1));

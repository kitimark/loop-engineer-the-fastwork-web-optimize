#!/usr/bin/env node
// sticky-walk gate 2 (fix-scrollcb-g0, 2026-10-09), Chrome, functional, no timing. Do the IntersectionObserver callbacks
// fire at the same scroll positions in C (g0.0h) and V (g0.0h + fixcq)? The lead asks for the observers that watch
// .hero / .pain-sticky; every observer is logged (and those two are reported first).
// IntersectionObserver is wrapped before the page's scripts run (Page.addScriptToEvaluateOnNewDocument). Each callback
// entry is logged as [y, target label, isIntersecting, ratio rounded to 0.01, observer rootMargin]. y is the last
// scrollY the driver set. Drive: settle 4 s at the top, then instant scrolls in 25 px steps to the page end and back to
// 0, waiting two rAFs + 40 ms per step.
// Loads: C, V, C2, V2 (own server, origin and isolated context each; HASHES.txt checked; mismatch = VOID); viewport 430x775
// DPR 3 touch (--vp desktop: 1440x900).
// Compare: per target and direction, the list of the y at which isIntersecting flips. C~V must equal C~C2's agreement.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node fixes/sticky-walk/gates/io-chrome.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/sticky-walk/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const argv = process.argv.slice(2);
const VPK = argv.includes('--vp') ? argv[argv.indexOf('--vp') + 1] : 'mobile';
const vp = { mobile: { width: 430, height: 775, dpr: 3, mobile: true }, desktop: { width: 1440, height: 900, dpr: 1, mobile: false } }[VPK];
const ARMS = [['C', 'C'], ['V', 'V'], ['C2', 'C'], ['V2', 'V']];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/sticky-walk/io', `${VPK}-${tag}`); mkdirSync(OUT, { recursive: true });

const WRAP = `(() => { if (window.__swIO) return; const L = window.__swIO = { y: 0, log: [] }; const O = window.IntersectionObserver;
  const lab = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).filter((c) => !/^svelte-|^is-|^has-/.test(c)).slice(0, 2).join('.') : '');
  window.IntersectionObserver = function (cb, opts) { const rm = (opts && opts.rootMargin) || '0px';
    const w = (entries, obs) => { for (const en of entries) L.log.push([L.y, lab(en.target), en.isIntersecting ? 1 : 0, Math.round(en.intersectionRatio * 100) / 100, rm]); return cb(entries, obs); };
    return new O(w, opts); };
  window.IntersectionObserver.prototype = O.prototype; })();`;
const DRIVE = `(async () => { const L = window.__swIO; const end = document.documentElement.scrollHeight - innerHeight; const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const go = async (y) => { L.y = y; scrollTo({ top: y, behavior: 'instant' }); await raf(); await new Promise((r) => setTimeout(r, 40)); };
  for (let y = 0; y <= end; y += 25) await go(y); await go(end); for (let y = end; y >= 0; y -= 25) await go(y); await go(0);
  window.__swDone = { end }; })(), 1`;

async function server(arm, d) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const res = { tool: 'fixes/sticky-walk/gates/io-chrome.mjs', vp: VPK, ...vp, startedAt: new Date().toISOString(), loads: [], compare: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/sticky-walk/chrome'), 'io'), headless: true, windowSize: `${vp.width},${vp.height}` });
const cdp = await CDP.connect(chrome.wsUrl);
const flips = {};
try {
  for (const [arm, d] of ARMS) {
    const s = await server(arm, d); const load = { arm, errors: [] }; res.loads.push(load);
    try {
      const url = `http://localhost:${s.port}/`;
      load.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (load.served.js !== HX[`${d}/${NODE}`] || load.served.css !== HX[`${d}/${CSS}`]) { load.void = 'served'; console.log('VOID', arm); continue; }
      const page = await cdp.newIsolatedPage();
      page.on((m) => { if (m.method === 'Runtime.exceptionThrown') load.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200)); });
      await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
      if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.enable'); await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(4000);
      await page.eval(DRIVE, { awaitPromise: false });
      let done = null; for (let i = 0; i < 240 && !done; i++) { await sleep(500); done = await page.eval('window.__swDone || null'); }
      if (!done) { load.void = 'drive did not finish'; await page.close(); continue; }
      const log = JSON.parse(await page.eval('JSON.stringify(window.__swIO.log)'));
      load.entries = log.length; load.end = done.end; writeFileSync(join(OUT, `${arm}.json`), JSON.stringify(log));
      // flips: per target+rootMargin, the y list where isIntersecting changes (after the first entry)
      const f = {}; const last = {};
      for (const [y, t, on, , rm] of log) { const k = t + ' @' + rm; if (last[k] === undefined) { last[k] = on; (f[k] ||= []).push('init' + on + '@' + y); continue; } if (on !== last[k]) { last[k] = on; (f[k] ||= []).push((on ? '+' : '-') + y); } }
      flips[arm] = f; load.targets = Object.keys(f).length;
      await page.close();
      console.log(`load ${arm}: ${log.length} entries, ${Object.keys(f).length} targets, end ${done.end}, errors ${load.errors.length}`);
    } finally { s.p.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
const cmp = (a, b) => { const A = flips[a] || {}, B = flips[b] || {}; const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])]; const diff = keys.filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])); return { targets: keys.length, differ: diff.map((k) => [k, A[k], B[k]]) }; };
res.compare = { 'C~V': cmp('C', 'V'), 'C~C2': cmp('C', 'C2'), 'V~V2': cmp('V', 'V2'), 'C2~V2': cmp('C2', 'V2') };
res.watched = Object.fromEntries(Object.entries(flips.C || {}).filter(([k]) => /\.hero|pain-sticky|pain\b|hero-track/.test(k)));
res.endedAt = new Date().toISOString();
writeFileSync(join(OUT, 'io.json'), JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res.compare)) console.log(k, 'targets', v.targets, 'differ', v.differ.length, JSON.stringify(v.differ.slice(0, 4)).slice(0, 600));
console.log('hero/pain watchers (C):', JSON.stringify(res.watched).slice(0, 800));
console.log('wrote', join(OUT, 'io.json'));

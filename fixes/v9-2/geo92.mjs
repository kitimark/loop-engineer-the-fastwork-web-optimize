#!/usr/bin/env node
// P-142 (v9.2) pre-data geometry probe (int-v8): the scrollY of nav-fade's two flips at the phone's scripted geometry
// (430x775 DPR 3, mobile + touch; CLAUDE.md "Phone geometry for attribution"), so P-142's NF windows are pinned before any
// phone data. Counts only, no timing. Headless Chrome, one load per arm, stepped instant scroll (STEP px, 2 rAFs a step):
//   down from 0 to 2000, then up to 0: the y where `.start-selling-top-nav` loses / regains is-hero-pill (the Join reveal
//   trigger, hero progress 0.72);
//   from 1000 px above the morph end into the end and back: the y where it gains / loses is-earn-hidden (the Join hide)
//   and is-on-dark, as a fraction of the morph end band too (p = (y - (max - t)) / t, t = .fw-ms-end height).
// Arms: folders of the v9.2 snapshot (default F,V: the classes and their y must agree; nav-fade changes no trigger).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 -- node fixes/v9-2/geo92.mjs [F,V]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const SNAP = join(WT, process.env.P142_SNAP || 'out/v92/snap-941aa13e5bdf');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const OUT = join(WT, 'out/v92/geo'); mkdirSync(OUT, { recursive: true });
const ARMS = (process.argv[2] || 'F,V').split(',');
const STEP = 4;
// walks y over [a..b] by STEP, returns the y values where each watched class flips
const WALK = (a, b) => `new Promise((res) => { const h = document.querySelector('.start-selling-top-nav');
  const W = ['is-hero-pill', 'is-earn-hidden', 'is-on-dark', 'is-morphing']; const st = Object.fromEntries(W.map((c) => [c, h.classList.contains(c)]));
  const flips = []; let y = ${a}; const dir = ${b} > ${a} ? 1 : -1;
  const step = () => { scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const c of W) { const v = h.classList.contains(c); if (v !== st[c]) { flips.push({ cls: c, on: v, y: Math.round(scrollY) }); st[c] = v; } }
    if ((dir > 0 && y >= ${b}) || (dir < 0 && y <= ${b})) return res({ flips, start: ${a}, end: ${b} });
    y = dir > 0 ? Math.min(${b}, y + ${STEP}) : Math.max(${b}, y - ${STEP}); step(); })); };
  step(); })`;
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; return { t, max: document.documentElement.scrollHeight - innerHeight, vh: innerHeight, docH: document.documentElement.scrollHeight }; })()`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v92/chrome'), 'geo92'), headless: true, windowSize: '430,775' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/v9-2/geo92.mjs (int-v8, P-142)', browser: chrome.browser, startedAt: new Date().toISOString(), viewport: '430x775 DPR 3 mobile touch', step: STEP, arms: {} };
try {
  for (const arm of ARMS) {
    const st = join(OUT, `serve-${arm}-${process.pid}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const page = await cdp.newIsolatedPage(); const L = (res.arms[arm] = {});
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, s.url, { quietMs: 1500, maxMs: 45000 });
      L.served = { js: sha(Buffer.from(await page.eval(`fetch('/${NODE}').then((r) => r.text())`))), css: sha(Buffer.from(await page.eval(`fetch('/${CSS}').then((r) => r.text())`))) };
      if (L.served.js !== HX[`${arm}/${NODE}`] || L.served.css !== HX[`${arm}/${CSS}`]) throw new Error(`VOID: ${arm} serves ${L.served.js} / ${L.served.css}`);
      const g = (L.geo = await page.eval(GEO));
      await sleep(1000);
      L.heroDown = await page.eval(WALK(0, 2000));
      L.heroUp = await page.eval(WALK(2000, 0));
      const e0 = Math.max(0, g.max - g.t - 1000);
      await page.eval(`(scrollTo({ top: ${e0}, behavior: 'instant' }), 1)`); await sleep(1500);
      L.endIn = await page.eval(WALK(e0, g.max));
      await sleep(1500);
      L.endOut = await page.eval(WALK(g.max, e0));
      const pOf = (y) => (g.t ? +((y - (g.max - g.t)) / g.t).toFixed(3) : null);
      for (const k of ['endIn', 'endOut']) for (const f of L[k].flips) f.p = pOf(f.y);
      const brief = (w) => w.flips.map((f) => `${f.on ? '+' : '-'}${f.cls}@${f.y}${f.p != null ? ` (p ${f.p})` : ''}`).join(' ');
      console.log(`${arm} geo ${JSON.stringify(g)}\n  hero down: ${brief(L.heroDown)}\n  hero up:   ${brief(L.heroUp)}\n  end in:    ${brief(L.endIn)}\n  end out:   ${brief(L.endOut)}`);
    } catch (e) { L.error = String(e.stack || e.message || e); console.log(arm, 'error', L.error); process.exitCode = 3; }
    finally { await page.close().catch(() => {}); p.kill(); rmSync(st, { force: true }); }
  }
} finally {
  res.endedAt = new Date().toISOString();
  const f = join(OUT, `geo92-${res.startedAt.replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log(`WROTE ${f}`);
}

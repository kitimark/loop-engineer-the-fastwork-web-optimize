#!/usr/bin/env node
// v8-double-drive (T-154): generic "double drive" DOM probe, no timing claims.
// A double drive = an element whose style follows a scroll/gesture-driven value every frame AND carries its own
// time-based CSS transition on that property, so every frame retargets the transition and the element trails the
// driver by up to the transition's duration (PR-021: .is-earn max-width .68s under --morph).
// Signature caught here: the same (element, property) pair gets transitionrun again and again while the driver moves
// (each retarget cancels the running transition and starts a new one from the current value).
// Per arm overlay and viewport: load, settle, then a scripted scroll top -> bottom in one-viewport segments (constant
// speed via scrollTo per rAF, then a hold), then (phone/desktop) a morph open/close with synthetic wheel at the end
// (positive control: nav-earn's .is-earn). Records every transitionrun/cancel/end with scrollY and phase, and per-rAF
// samples of each watched pair: computed value vs the running CSSTransition's end keyframe (= the driven target).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner de-v8-double-drive -- \
//     node research/v8-double-drive/probe/dd-probe.mjs [phone,desktop] [overlayDir] [speedPxPerS]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTR } from './instr.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const VPS = {
  phone: { width: 430, height: 775, dpr: 3, mobile: true },
  tall: { width: 430, height: 932, dpr: 3, mobile: true },
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false },
};
const vpNames = (process.argv[2] || 'phone,desktop').split(',');
const OVL = resolve(process.argv[3] || join(WT, 'fixes/v8-double-drive/overlay'));
const SPEED = +(process.argv[4] || 1200); // px/s while moving
const HOLD = +(process.env.DD_HOLD || 1400); // ms hold after each segment
const BASE = resolveTree('site-pretty');
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/v8-double-drive', `probe-${tag}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

// installed before any page script (instr.mjs): transition event log, per-rAF watcher, geometry watch

const SCROLL = (from, to, speed) => `new Promise((res) => {
  const D = window.__dd, raf = requestAnimationFrame.bind(window); const t0 = performance.now(); const dist = ${to} - ${from};
  const dur = Math.abs(dist) / ${speed} * 1000;
  const step = (t) => { const k = Math.min(1, (performance.now() - t0) / dur); scrollTo({ top: ${from} + dist * k, behavior: 'instant' });
    if (k < 1) raf(step); else res(performance.now()); };
  raf(step);
})`;
const WHEEL = (dy) => `(window.dispatchEvent(new WheelEvent('wheel', { deltaY: ${dy}, cancelable: true, bubbles: true })), 1)`;

async function server() {
  const st = join(OUT, 'serve.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', OVL, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error('server did not start');
}

const res = { tool: 'research/v8-double-drive/probe/dd-probe.mjs', startedAt: new Date().toISOString(), load1: loadavg()[0], overlay: OVL, speed: SPEED, hold: HOLD, runs: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v8-double-drive/chrome'), 'probe'), headless: true, windowSize: '1440,982' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
const s = await server();
try {
  for (const vn of vpNames) {
    const vp = VPS[vn]; const run = { vp: vn, ...vp, errors: [], http4xx: [], segs: [] }; res.runs.push(run);
    const url = `http://localhost:${s.port}/`;
    run.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
    const page = await cdp.newIsolatedPage();
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') run.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200));
      if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) run.http4xx.push(m.params.response.status + ' ' + m.params.response.url.replace(url, '/'));
    });
    await page.send('Runtime.enable'); await page.send('Network.enable'); await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
    if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
    await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(3000);
    const end = await page.eval('document.documentElement.scrollHeight - innerHeight'); run.end = end;
    await page.eval('(window.__dd.sampleOn = true, window.__dd.phase = "idle", 1)'); await sleep(800);
    const segLen = vp.height;
    for (let y = 0, k = 0; y < end; y += segLen, k++) {
      const to = Math.min(end, y + segLen);
      const t0 = await page.eval(`(window.__dd.phase = 'move', window.__dd.seg = ${k}, performance.now())`);
      const tStop = await page.eval(SCROLL(y, to, SPEED));
      await page.eval(`(window.__dd.phase = 'hold', 1)`);
      run.segs.push({ k, from: y, to, t0, tStop });
      await sleep(HOLD);
    }
    // positive control at the end: morph open / close (wheel into the page's capture listener)
    const tOpen = await page.eval(`(window.__dd.phase = 'morph-open', window.__dd.seg = 1000, ${WHEEL(120)}, performance.now())`); await sleep(1600);
    const tClose = await page.eval(`(window.__dd.phase = 'morph-close', window.__dd.seg = 1001, ${WHEEL(-120)}, performance.now())`); await sleep(1600);
    run.morph = { tOpen, tClose };
    // and back to the top in one long scroll (reverse direction)
    const tUp0 = await page.eval(`(window.__dd.phase = 'up', window.__dd.seg = 2000, performance.now())`);
    const tUp = await page.eval(SCROLL(end, 0, SPEED * 3)); await page.eval(`(window.__dd.phase = 'hold-up', 1)`); await sleep(HOLD);
    run.up = { t0: tUp0, tStop: tUp };
    await page.eval('(window.__dd.sampleOn = false, 1)');
    run.pairs = await page.eval('window.__dd.durOf()');
    run.ev = await page.eval('window.__dd.ev');
    run.samples = await page.eval('window.__dd.samples');
    run.geo = await page.eval('window.__dd.geo');
    await page.close();
    writeFileSync(join(OUT, `raw-${vn}.json`), JSON.stringify(run));
    console.log(`${vn} served ${run.served.js}/${run.served.css} end ${end} segs ${run.segs.length} ev ${run.ev.length} samples ${run.samples.length} pairs ${Object.keys(run.pairs).length} errors ${run.errors.length} http4xx ${run.http4xx.length}`);
  }
} finally { s.p.kill(); cdp.close(); await chrome.close(); }
res.load1End = loadavg()[0];
writeFileSync(join(OUT, 'probe.json'), JSON.stringify({ ...res, runs: res.runs.map((r) => ({ vp: r.vp, served: r.served, end: r.end, segs: r.segs.length, errors: r.errors, http4xx: r.http4xx })) }, null, 1));
console.log('OUT', OUT);

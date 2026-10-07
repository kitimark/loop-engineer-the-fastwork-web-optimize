// PR-032 rev 3 frame check (arch-compositor-morph): what does the Join button do, frame by frame, when the menu crosses
// m 0.2 (hide) and m 0 (show), and on small back-and-forth moves around 0.2 (hysteresis)? Chrome 430xH DPR 3 touch, no
// throttling. Per arm: an in-page rAF sampler (computed opacity / filter / translate of the button and the language
// switch, the nav's classes) plus every compositor frame (Page.startScreencast) scored over the button + switch region.
// Functional (no timing claims): run in a shared slot (--weight probe).
//   node out/cm/fadeframes.mjs --arms A=<dir>,B=<dir>[,C=<dir>] [--h 815]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { pngPixels } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const C = await import(join(WT, 'tools/lib/cdp.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARMS = arg('--arms', '').split(',').filter(Boolean).map((x) => { const [k, d] = x.split('='); return { k, d: resolve(WT, d) }; });
const H = Number(arg('--h', '815'));
const OUT = join(WT, 'out/cm/fadeframes-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH = `(() => { const ev = new Event('touchstart'); const t = [{ clientX: 215, clientY: 400, identifier: 1 }]; Object.defineProperty(ev, 'touches', { value: t }); Object.defineProperty(ev, 'changedTouches', { value: t }); window.dispatchEvent(ev); return 1; })()`;
const GEO = `JSON.stringify((() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight; return { t, max, ih: innerHeight, endStart: max - t }; })())`;
const SAMPLER = `(() => { window.__ff = []; window.__ffRun = true;
  const btn = document.querySelector('.start-selling-top-nav-btn.is-earn'), wr = document.querySelector('.start-selling-top-nav-actions > .start-selling-language-switch-wrap'), nav = document.querySelector('header.start-selling-top-nav');
  const f = (t) => { const a = getComputedStyle(btn), b = getComputedStyle(wr), r = btn.getBoundingClientRect(), q = wr.getBoundingClientRect();
    __ff.push({ t: +t.toFixed(1), op: +a.opacity, filt: a.filter, bt: a.translate, wt: b.translate, wx: b.transform, hid: nav.classList.contains('is-earn-hidden') ? 1 : 0, mor: nav.classList.contains('is-morphing') ? 1 : 0, y: Math.round(scrollY), br: [r.left, r.top, r.width, r.height].map(Math.round), wl: Math.round(q.left) });
    if (__ffRun) requestAnimationFrame(f); };
  requestAnimationFrame(f); return 1; })()`;
// region (css px): the right part of the nav bar at m ~0.2, the button and the language switch
const RX0 = 200, RX1 = 425, RY0 = 60, RY1 = 140;
function lum(buf) {
  const p = pngPixels(buf); const s = p.w / 430; let n = 0, L = 0;
  for (let y = Math.round(RY0 * s); y < Math.round(RY1 * s); y += 2) for (let x = Math.round(RX0 * s); x < Math.round(RX1 * s); x += 2) {
    const i = (y * p.w + x) * p.bpp; L += 0.2126 * p.px[i] + 0.7152 * p.px[i + 1] + 0.0722 * p.px[i + 2]; n++;
  }
  return +(L / n).toFixed(2);
}
// reversals: a frame that goes against the overall direction of the series by more than tol
function reversals(xs, tol) {
  if (xs.length < 3) return { dir: 0, n: 0, max: 0 };
  const dir = Math.sign(xs.at(-1) - xs[0]); let n = 0, max = 0;
  for (let i = 1; i < xs.length; i++) { const d = (xs[i] - xs[i - 1]) * dir; if (d < -tol) { n++; max = Math.max(max, -d); } }
  return { dir, n, max: +max.toFixed(3) };
}
const blurPx = (f) => { const m = /blur\(([\d.]+)px\)/.exec(f || ''); return m ? +m[1] : 0; };
const txPx = (t) => (t && t !== 'none' ? parseFloat(t) : 0);
const chrome = await C.launchChrome({ port: 0, profileDir: C.tempProfileDir(join(WT, 'out/compositor-morph/chrome'), 'cmfade'), headless: true, windowSize: `430,${H}` });
const cdp = await C.CDP.connect(chrome.wsUrl);
const res = { h: H, region: [RX0, RY0, RX1, RY1], arms: {} };
try {
  for (const A of ARMS) {
    const st = join(OUT, `serve-${A.k}.json`); rmSync(st, { force: true });
    const sp = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', A.d, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let page = null;
    try {
      let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
      await C.gotoAndSettle(page, `http://localhost:${s.port}/`, { quietMs: 1500, maxMs: 45000 });
      await page.eval(`new Promise((res) => { let y = 0; const step = () => { y += 400; window.scrollTo({ top: y, behavior: 'instant' }); y < document.documentElement.scrollHeight ? setTimeout(step, 60) : setTimeout(() => res(1), 2500); }; step(); })`);
      let g = JSON.parse(await page.eval(GEO));
      await page.eval(`(scrollTo({ top: ${g.endStart - g.ih}, behavior: 'instant' }), 1)`); await sleep(1200);
      g = JSON.parse(await page.eval(GEO));
      await page.eval(TOUCH);
      const yAt = (m) => Math.round(g.endStart + m * g.t);
      await page.eval(`(scrollTo({ top: ${yAt(0.15)}, behavior: 'instant' }), 1)`); await sleep(1500);
      const frames = [];
      const off = page.on((m) => { if (m.method === 'Page.screencastFrame') { frames.push({ at: Date.now(), ts: m.params.metadata?.timestamp, data: m.params.data }); page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {}); } });
      await page.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
      await sleep(500);
      // phases: hide (0.15 -> 0.24), hold, back to 0.15 (hysteresis: stays hidden), show (-> m 0), wiggle around 0.2
      const plan = [['hide', 0.24, 1300], ['back', 0.15, 900], ['show', -0.05, 1300], ['up2', 0.22, 120], ['dn2', 0.18, 120], ['up3', 0.22, 120], ['dn3', 0.18, 120], ['up4', 0.22, 1300]];
      const phases = [];
      for (const [name, m, wait] of plan) {
        await page.eval(SAMPLER);
        const at = Date.now();
        await page.eval(`(scrollTo({ top: ${yAt(m)}, behavior: 'instant' }), 1)`);
        await sleep(wait);
        const ff = JSON.parse(await page.eval(`(window.__ffRun = false, JSON.stringify(window.__ff))`));
        phases.push({ name, m, at, wait, ff });
      }
      await page.send('Page.stopScreencast'); off();
      const rows = [];
      for (let k = 0; k < phases.length; k++) {
        const P = phases[k], a = P.at, b = k + 1 < phases.length ? phases[k + 1].at : Infinity;
        const fs = frames.filter((f) => f.at >= a && f.at < b);
        const L = fs.map((f) => lum(Buffer.from(f.data, 'base64')));
        const ts = fs.map((f) => f.ts).filter((x) => x != null);
        const op = P.ff.map((r) => r.op), bl = P.ff.map((r) => blurPx(r.filt)), wt = P.ff.map((r) => txPx(r.wt));
        // the scroll jump itself is frame 0-1; score the fade from the first frame after it
        rows.push({ name: P.name, m: P.m, nFrames: fs.length, nRaf: P.ff.length, lum: L, lumRev: reversals(L.slice(2), 0.5),
          opFirst: op[0], opLast: op.at(-1), opRev: reversals(op, 0.001), blurFirst: bl[0], blurLast: bl.at(-1), blurRev: reversals(bl, 0.01),
          wtFirst: wt[0], wtLast: wt.at(-1), wtRev: reversals(wt, 0.01), hid: [...new Set(P.ff.map((r) => r.hid))], mor: [...new Set(P.ff.map((r) => r.mor))],
          opChangeMs: (() => { const i = op.findIndex((v) => Math.abs(v - op[0]) > 0.001), j = op.length - 1 - [...op].reverse().findIndex((v) => Math.abs(v - op.at(-1)) > 0.001); return i < 0 ? null : [+(P.ff[i].t - P.ff[0].t).toFixed(0), +(P.ff[Math.min(j + 1, op.length - 1)].t - P.ff[0].t).toFixed(0)]; })(),
          dtMs: ts.length > 1 ? ts.slice(1).map((t, i) => +((t - ts[i]) * 1000).toFixed(1)) : [] });
        if (fs.length) { writeFileSync(join(OUT, `${A.k}-${P.name}-first.png`), Buffer.from(fs[0].data, 'base64')); writeFileSync(join(OUT, `${A.k}-${P.name}-mid.png`), Buffer.from(fs[Math.floor(fs.length / 2)].data, 'base64')); writeFileSync(join(OUT, `${A.k}-${P.name}-last.png`), Buffer.from(fs.at(-1).data, 'base64')); }
      }
      res.arms[A.k] = { geo: g, phases, rows };
      console.log(`== ${A.k} frames ${frames.length}`);
      for (const r of rows) console.log(`  ${r.name.padEnd(5)} m ${r.m} frames ${r.nFrames} raf ${r.nRaf} hid ${r.hid} mor ${r.mor} | op ${r.opFirst}->${r.opLast} change ${JSON.stringify(r.opChangeMs)} rev ${r.opRev.n} | blur ${r.blurFirst}->${r.blurLast} rev ${r.blurRev.n} | EN ${r.wtFirst}->${r.wtLast} rev ${r.wtRev.n} | lum ${r.lum[0]}->${r.lum.at(-1)} rev ${r.lumRev.n} (max ${r.lumRev.max})`);
    } finally { try { page && (await page.close()); } catch {} sp.kill(); rmSync(st, { force: true }); }
  }
} finally {
  writeFileSync(join(OUT, 'fadeframes.json'), JSON.stringify(res, null, 1));
  try { cdp.close(); await chrome.close(); } catch {}
  console.log('wrote', join(OUT, 'fadeframes.json'));
}

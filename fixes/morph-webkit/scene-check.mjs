// review-cdwc B1 + B4 (+ non-blocking 3): mechanism / parity only, no timing claim. Chrome, short lane.
// B1, scroll phase: is the cdwc rule inert there? aw1-10e vs mw10e-cdwc at 430x932 DPR 3 mobile, calibrated serve args.
//   At each 250 px step from 0 to the end: the panel's data-start-selling-scene, the panel faces with computed will-change
//   'transform', --morph (m), the LayerTree layer count. Pass: every step below the end is paused / 0 / m=0 on both builds and
//   the layer counts are equal.
// B4, frozen-frame parity: Date frozen before load (addScriptToEvaluateOnNewDocument), wheel push past the end -> m=1 hold,
//   2.5 s for the digit springs to settle, CSS/WAAPI animations paused, clip screenshot of the panel countdown rect at DPR 3.
//   Same page on aw1-10e: A, rule injected, A again; plus the mw10e-cdwc build's crop. Diffs as % of pixels: any channel
//   difference (>0) and the summed-channel >48 used elsewhere.
// Desktop (non-blocking 3): 1440x900 DPR 1, layers at the hold and the same crop parity.
// node tools/lock.mjs run chrome-measure --owner mw10e-cdwc --short --max-seconds 180 -- node fixes/morph-webkit/scene-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = process.env.OUT || join(WT, 'out/scene-check');
mkdirSync(OUT, { recursive: true });
const ov = (b) => join(WT, 'fixes', b, 'overlay');
const BASEOV = ov('aw1-10e');
const BUILDS = ['aw1-10e', 'mw10e-cdwc'];
const VIEWPORTS = (process.env.VIEWPORTS || 'mobile,desktop').split(',');
const VP = { mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } };
const RULE = '.start-selling-morph-panel .waitlist-closing-countdown .face.svelte-1quva9c { will-change: auto; }';
const FREEZE = `(() => { const T = 1790000000000, D = Date; class FD extends D { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } } window.Date = FD; })();`;
const M = `+document.querySelector('header.start-selling-top-nav').style.getPropertyValue('--morph') || 0`;
const STATE = `(() => { const p = document.querySelector('.start-selling-morph-panel'); const f = [...document.querySelectorAll('.start-selling-morph-panel .waitlist-closing-countdown .face')];
  return { y: Math.round(scrollY), scene: p?.getAttribute('data-start-selling-scene') ?? null, panelFaces: f.length,
    wcTransform: f.filter((e) => getComputedStyle(e).willChange === 'transform').length, m: ${M} }; })()`;
const RECT = `(() => { const e = document.querySelector('.start-selling-morph-panel .waitlist-closing-countdown'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`;
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { steps: {}, hold: {}, crops: {} };
const raf2 = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
const pngDiff = async (page, a, b) => {
  const da = 'data:image/png;base64,' + readFileSync(a).toString('base64'), db = 'data:image/png;base64,' + readFileSync(b).toString('base64');
  return page.eval(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = s; });
    const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]); const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    let any = 0, big = 0; for (let i = 0; i < pa.length; i += 4) { const s = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]); if (s > 0) any++; if (s > 48) big++; }
    return { size: [A.width, A.height, B.width, B.height], anyPct: Math.round(10000 * any / (w * h)) / 100, gt48Pct: Math.round(10000 * big / (w * h)) / 100 }; })()`);
};
try {
  for (const vp of VIEWPORTS) {
    for (const b of BUILDS) {
      const key = `${vp}:${b}`;
      const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
      const chain = b === 'aw1-10e' ? BASEOV : `${ov(b)},${BASEOV}`;
      const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', chain, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
      try {
        let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
        const page = await cdp.newIsolatedPage();
        const errors = []; let layers = 0;
        page.on((m) => {
          if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
          if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) layers = m.params.layers.length;
        });
        await page.send('Emulation.setDeviceMetricsOverride', VP[vp]);
        if (VP[vp].mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
        await page.send('Page.enable').catch(() => {});
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE });
        await page.send('Page.bringToFront');
        await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
        if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + key);
        await page.send('LayerTree.enable'); await sleep(800);
        // B1 scroll steps (mobile only: the A/B's viewport)
        if (vp === 'mobile') {
          const end = await page.eval('document.documentElement.scrollHeight - innerHeight');
          const ys = []; for (let y = 0; y < end; y += 250) ys.push(y); ys.push(end);
          // STEP_REPS sweeps per build (default 1): repeated sweeps show the within-build spread of the layer count
          const reps = +(process.env.STEP_REPS || 1), sweeps = [];
          for (let r = 0; r < reps; r++) {
            const steps = [];
            for (const y of ys) {
              await page.eval(`(window.scrollTo(0, ${y}), 1)`); await page.eval(raf2); await sleep(250);
              steps.push({ ...(await page.eval(STATE)), layers });
            }
            sweeps.push(steps);
            await page.eval('(window.scrollTo(0, 0), 1)'); await sleep(600);
          }
          res.steps[b] = { end, steps: sweeps[0], sweeps };
        }
        // B4 hold: scroll to the end, push past it
        await page.eval(`(window.scrollTo(0, document.documentElement.scrollHeight), 1)`); await sleep(1500);
        for (let i = 0; i < 3; i++) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: VP[vp].width / 2, y: VP[vp].height / 2, deltaX: 0, deltaY: 120 }); await sleep(120); }
        const t0 = Date.now(); let m = 0; while (Date.now() - t0 < 8000 && m < 0.999) { m = await page.eval(M); await sleep(50); }
        await sleep(2500);
        await page.eval(`(document.getAnimations().forEach((a) => a.pause()), 1)`); await page.eval(raf2); await sleep(300);
        res.hold[key] = { m: await page.eval(M), state: await page.eval(STATE), layers };
        const rect = await page.eval(RECT);
        const shot = async (n) => {
          await page.eval(raf2); await sleep(200);
          const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
          const p = join(OUT, `${vp}-${n}.png`); writeFileSync(p, Buffer.from(data, 'base64')); return p;
        };
        if (rect) {
          if (b === 'aw1-10e') {
            res.crops[`${vp}:aw`] = await shot('aw');
            await page.eval(`(() => { const s = document.createElement('style'); s.id = '__cd'; s.textContent = ${JSON.stringify(RULE)}; document.head.append(s); return 1; })()`);
            await page.eval(raf2); await sleep(300);
            res.hold[`${vp}:aw1-10e+rule`] = { state: await page.eval(STATE), layers };
            res.crops[`${vp}:injected`] = await shot('injected');
            await page.eval(`(document.getElementById('__cd').remove(), 1)`); await page.eval(raf2); await sleep(300);
            res.crops[`${vp}:aw-again`] = await shot('aw-again');
          } else res.crops[`${vp}:cdwc`] = await shot('cdwc');
        }
        res.hold[key].rect = rect; res.hold[key].errors = errors.slice(0, 3);
        console.log(key, JSON.stringify(res.hold[key]));
        await page.send('LayerTree.disable');
        await page.close();
      } finally { proc.kill(); }
    }
  }
  const page = await cdp.newIsolatedPage();
  res.diff = {};
  for (const vp of VIEWPORTS) {
    const c = (n) => res.crops[`${vp}:${n}`];
    if (!c('aw')) continue;
    res.diff[vp] = { awAgain: await pngDiff(page, c('aw'), c('aw-again')), injected: await pngDiff(page, c('aw'), c('injected')), ...(c('cdwc') ? { cdwcBuild: await pngDiff(page, c('aw'), c('cdwc')) } : {}) };
  }
  await page.close();
  // B1 verdict
  const S = res.steps;
  if (S['aw1-10e'] && S['mw10e-cdwc']) {
    const a = S['aw1-10e'].steps, c = S['mw10e-cdwc'].steps, end = S['aw1-10e'].end;
    const bad = (s) => s.y < end && (s.scene !== 'paused' || s.wcTransform !== 0 || s.m !== 0);
    res.b1 = { badBase: a.filter(bad), badCdwc: c.filter(bad), layerMismatch: a.map((s, i) => [s.y, s.layers, c[i]?.layers]).filter((x) => x[1] !== x[2]),
      table: a.map((s, i) => [s.y, s.scene, s.wcTransform, s.m, s.layers, c[i]?.scene, c[i]?.wcTransform, c[i]?.m, c[i]?.layers]) };
    res.b1.pass = !res.b1.badBase.length && !res.b1.badCdwc.length && !res.b1.layerMismatch.length;
    console.log('B1 steps [y, base scene, base wcT, base m, base layers, cdwc scene, cdwc wcT, cdwc m, cdwc layers]:');
    for (const r of res.b1.table) console.log(JSON.stringify(r));
    console.log('B1', res.b1.pass ? 'PASS' : 'FAIL', JSON.stringify({ badBase: res.b1.badBase.length, badCdwc: res.b1.badCdwc.length, layerMismatch: res.b1.layerMismatch }));
    // all sweeps: bad states anywhere, and per step the layer counts of every sweep (base | cdwc)
    const allA = S['aw1-10e'].sweeps, allC = S['mw10e-cdwc'].sweeps;
    res.b1.badAnySweep = [...allA.flat(), ...allC.flat()].filter(bad).length;
    res.b1.layersBySweep = a.map((s, i) => [s.y, allA.map((sw) => sw[i]?.layers), allC.map((sw) => sw[i]?.layers)]);
    console.log('B1 all sweeps: bad states', res.b1.badAnySweep, '| per step [y, base layers per sweep, cdwc layers per sweep]:');
    for (const r of res.b1.layersBySweep) if (new Set([...r[1], ...r[2]]).size > 1) console.log(JSON.stringify(r));
  }
  console.log('B4 crop diffs:', JSON.stringify(res.diff));
  writeFileSync(join(OUT, `scene-check-${Date.now()}.json`), JSON.stringify(res, null, 1));
} finally { cdp.close(); await ch.close(); }

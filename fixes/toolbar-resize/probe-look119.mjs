// toolbar-resize P-119 look pre-check (Chrome only; the Simulator/WebKit pixel check stays with F, PR-010 rule):
// headless Chrome 430x775 DPR 3 (the iPhone's scripted geometry), the v8 server, P-119's in-page arms applied with
// p119-inject.mjs exactly as in the Simulator. Arms none, none2 (A/A), cct, cva. Per arm: the inject's structural look
// probe (look gate), then 3 scroll stops where the showcase is in view (its document top - 0.6 ih, - 0.2 ih, + 0.3 ih),
// all CSS/Web animations paused at currentTime 0, a viewport screenshot. Pairs none vs none2 / cct / cva are compared
// in-page (canvas): pixels with any channel difference > 8, over the frame and inside the showcase's visible rect, and
// the largest channel difference. Counts only, no timing. Run in a shared-lane hold (weight probe):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-toolbar-resize -- \
//     sh -c 'node tools/fix.mjs serve v8-best & SP=$!; node tools/wait.mjs serve out/serve-v8-best.json --pid $SP --owner fix-toolbar-resize --timeout 60; node fixes/toolbar-resize/probe-look119.mjs; kill $SP'
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const WT = new URL('../..', import.meta.url).pathname;
const st = JSON.parse(readFileSync(join(WT, 'out/serve-v8-best.json'), 'utf8'));
const URL0 = `http://localhost:${st.httpTwin}/`;
const OUTD = join(WT, 'out/toolbar-resize/look119'); mkdirSync(OUTD, { recursive: true });
const ARMS = [['none', 'none'], ['none2', 'none'], ['cct', 'cct'], ['cva', 'cva']];
const injFor = async (arm) => { process.env.P110_ARM = arm; return import(pathToFileURL(join(WT, 'fixes/toolbar-resize/p119-inject.mjs')).href + `?arm=${arm}`); };
const prof = tempProfileDir(join(WT, 'out', 'chrome-fn'), 'toolbar-resize-look119');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { url: URL0, h: 775, arms: {}, pairs: {} };
const shots = {};
try {
  let stops = null;
  for (const [label, arm] of ARMS) {
    const inj = await injFor(arm);
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, URL0); await sleep(7000);
    await page.eval(inj.install());
    const rec = JSON.parse(await page.eval(inj.read()));
    res.arms[label] = { arm, applied: rec.applied, cs: rec.cs, measured: rec.measured, look: rec.look, docH: [rec.docH0, rec.docH1] };
    console.log(`== ${label} applied ${rec.applied} cs ${JSON.stringify(rec.cs)} docH ${rec.docH0}->${rec.docH1} measured ${JSON.stringify(rec.measured)}`);
    console.log(`   look ${JSON.stringify(rec.look)}`);
    if (!stops) { const t = rec.measured.showcaseTop0, ih = rec.measured.ih0; stops = [Math.round(t - 0.6 * ih), Math.round(t - 0.2 * ih), Math.round(t + 0.3 * ih)]; res.stops = stops; }
    shots[label] = [];
    for (const y of stops) {
      await page.eval(`window.scrollTo(0, ${y})`); await sleep(900);
      const rect = await page.eval(`(() => { document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = 0; } catch {} }); const r = document.querySelector('#people .start-selling-future-card > .start-selling-future-showcase').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, sy: scrollY }; })()`);
      await sleep(400);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      shots[label].push({ y, rect, data });
      writeFileSync(join(OUTD, `${label}-y${y}.png`), Buffer.from(data, 'base64'));
    }
    await page.close();
  }
  const cmp = await cdp.newIsolatedPage();
  const CMP = (a, b, rect) => `(async () => {
    const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
    const w = A.width, h = A.height, c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, w, h).data;
    const R = ${JSON.stringify(rect)}, k = w / 430; const y0 = Math.max(0, Math.floor(R.top * k)), y1 = Math.min(h, Math.ceil(R.bottom * k)), x0 = Math.max(0, Math.floor(R.left * k)), x1 = Math.min(w, Math.ceil(R.right * k));
    let all = 0, inR = 0, max = 0, maxIn = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const i = (yy * w + xx) * 4; const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > max) max = d; const ins = yy >= y0 && yy < y1 && xx >= x0 && xx < x1; if (ins && d > maxIn) maxIn = d; if (d > 8) { all++; if (ins) inR++; } }
    return { w, h, over8: all, over8Pct: Math.round(all / (w * h) * 1e5) / 1e3, inShowcase: inR, maxLevel: max, maxLevelInShowcase: maxIn, showcaseDevPx: Math.max(0, y1 - y0) * Math.max(0, x1 - x0) };
  })()`;
  for (const other of ['none2', 'cct', 'cva']) {
    res.pairs[`none~${other}`] = [];
    for (let i = 0; i < shots.none.length; i++) {
      const r = await cmp.eval(CMP(shots.none[i].data, shots[other][i].data, shots.none[i].rect), { timeout: 60000 });
      const rectMoved = ['top', 'bottom', 'left', 'right'].some((k) => Math.abs(shots.none[i].rect[k] - shots[other][i].rect[k]) > 0.5);
      res.pairs[`none~${other}`].push({ y: shots.none[i].y, rectMoved, ...r });
      console.log(`none~${other} y ${shots.none[i].y}: over8 ${r.over8} (${r.over8Pct} %) in showcase ${r.inShowcase} max ${r.maxLevel} (in showcase ${r.maxLevelInShowcase}) rectMoved ${rectMoved}`);
    }
  }
  await cmp.close();
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
writeFileSync(join(OUTD, 'chrome.json'), JSON.stringify(res, null, 1) + '\n');
console.log(`LOOK119 written ${join(OUTD, 'chrome.json')}`);

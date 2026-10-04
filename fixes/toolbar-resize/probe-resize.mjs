// toolbar-resize I card, Chrome side: what reacts to a 775 -> 815 viewport-height change, and how much
// style/layout work each step costs (COUNTS ONLY, no timing verdicts; headless, shared lane).
// usage: node fixes/toolbar-resize/probe-resize.mjs <out.json> [--webkit] [--live] [--ys 0,380,...] NAME=<url> ...
//   --webkit  defines window.GestureEvent before the page runs, so v7's hero takes its WebKit CSS mode
//             (.he-on / .he-css with the --hero-exit view timeline), as on the iPhone (mechanism only)
//   --live    holds a touch down and nudges the scroll by 1 px before the steps, so the hero is live (.he-css)
//             as during a fling (heSc/heUp; heRest does not park while a finger is down)
// Per position: computed-style snapshot at 775 and at 815 (diff = the elements and properties that react), then
// 10 steps 775 -> 815 (4 px each, 3 rAFs per step) inside a trace: Layout events (dirtyObjects, totalObjects,
// partialLayout) and UpdateLayoutTree (elementCount) per step, against a control with the same rAF waits and no
// resize. Chrome resizes the ICB, so vh/svh/dvh all change here; on iOS Safari only dvh, the fixed-position rect,
// innerHeight and the scrollport change (F-145): the diff lists units per property so the WebKit set can be read off.
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const OUT = args[0];
const has = (f) => args.includes(f);
const optv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const URLS = Object.fromEntries(args.filter((a) => /^[A-Za-z0-9_-]+=/.test(a)).map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const YS = optv('--ys', '0,380,800,1070,1600,1850,2400,3300,3550,end-900,end').split(',');
const H0 = 775, H1 = 815, STEPS = 10;

const SNAP = `(() => {
  const P = ['height','min-height','max-height','width','top','bottom','translate','transform','opacity','filter','font-size','scale','position','display','content-visibility'];
  const d = (t) => t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + [...t.classList].filter((c) => !c.startsWith('svelte-') && c.length < 40).slice(0, 3).map((c) => '.' + c).join('');
  const out = {}; const seen = {};
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    let k = d(e); const p = e.parentElement ? d(e.parentElement) : ''; k = p + ' > ' + k; seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '#' + seen[k];
    const cs = getComputedStyle(e); const v = {}; for (const q of P) v[q] = cs.getPropertyValue(q);
    v.ow = e.offsetWidth; v.oh = e.offsetHeight; out[k] = v;
  }
  return out; })()`;
const STOPS = `(() => ({ max: document.documentElement.scrollHeight - innerHeight }))()`;
const RAF3 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))))`;

function diff(a, b) {
  const rows = [];
  for (const k of Object.keys(a)) { if (!b[k]) continue; const ch = [];
    for (const q of Object.keys(a[k])) if (a[k][q] !== b[k][q]) ch.push(`${q}: ${String(a[k][q]).slice(0, 50)} -> ${String(b[k][q]).slice(0, 50)}`);
    if (ch.length) rows.push(`${k} | ${ch.join('; ')}`); }
  return rows;
}

async function traced(page, cdp, body) {
  const evs = [];
  const off = cdp.on((m) => { if (m.method === 'Tracing.dataCollected' && m.sessionId === page.sessionId) evs.push(...m.params.value); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await body();
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 30000);
  await page.send('Tracing.end'); await done; off();
  return evs;
}
function count(evs) {
  const r = { layouts: 0, fullLayouts: 0, dirtyObjects: 0, recalcs: 0, recalcElements: 0, resizeEvents: 0, rafs: 0 };
  for (const e of evs) {
    if (e.name === 'Layout' && (e.ph === 'X' || e.ph === 'B')) { r.layouts++; const b = e.args?.beginData || {}; r.dirtyObjects += b.dirtyObjects || 0; if (b.partialLayout === false) r.fullLayouts++; }
    if (e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'B')) r.recalcs++;
    if (e.name === 'UpdateLayoutTree' && (e.ph === 'X' || e.ph === 'E')) r.recalcElements += e.args?.elementCount || e.args?.data?.elementCount || 0;
    if (e.name === 'EventDispatch' && e.args?.data?.type === 'resize') r.resizeEvents++;
    if (e.name === 'FireAnimationFrame') r.rafs++;
  }
  return r;
}

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'toolbar-resize');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const result = { webkit: has('--webkit'), live: has('--live'), H0, H1, STEPS, arms: {} };
try {
  for (const arm of Object.keys(URLS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    const metrics = (h) => page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await metrics(H0);
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (has('--webkit')) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.GestureEvent = function GestureEvent() {};' });
    await gotoAndSettle(page, URLS[arm]); await sleep(7000); // past fwUnskip (idle un-skip of deferred sections)
    const { max } = await page.eval(STOPS);
    const res = result.arms[arm] = { max, heCss: await page.eval(`!!document.querySelector('.hero-track.he-on')`), pos: [] };
    for (const ys of YS) {
      const y = ys === 'end' ? max : ys.startsWith('end-') ? max - Number(ys.slice(4)) : Number(ys);
      await page.eval(`window.scrollTo(0, ${y})`); await sleep(900);
      if (has('--live')) {
        await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 215, y: 400 }] });
        await page.eval(`window.scrollBy(0, 1)`); await page.eval(RAF3);
      }
      const live = await page.eval(`!!document.querySelector('.hero-track.he-css')`);
      const s0 = await page.eval(SNAP);
      const ctl = count(await traced(page, cdp, async () => { for (let i = 0; i < STEPS; i++) await page.eval(RAF3); }));
      const stepEv = count(await traced(page, cdp, async () => { for (let i = 1; i <= STEPS; i++) { await metrics(H0 + (i * (H1 - H0)) / STEPS); await page.eval(RAF3); } }));
      const s1 = await page.eval(SNAP);
      const changed = diff(s0, s1);
      const ih = await page.eval('innerHeight');
      if (has('--live')) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await metrics(H0); await page.eval(RAF3);
      const row = { ys, y: Math.round(await page.eval('scrollY')), live, innerHeightAfter: ih, perStep: Object.fromEntries(Object.entries(stepEv).map(([k, v]) => [k, +(v / STEPS).toFixed(2)])), control: Object.fromEntries(Object.entries(ctl).map(([k, v]) => [k, +(v / STEPS).toFixed(2)])), changedCount: changed.length, changed };
      res.pos.push(row);
      console.log(`${arm} ${ys} y${row.y} live=${live} | per step: layouts ${row.perStep.layouts} (full ${row.perStep.fullLayouts}) dirtyObj ${row.perStep.dirtyObjects} recalcs ${row.perStep.recalcs} elems ${row.perStep.recalcElements} resize ${row.perStep.resizeEvents} | control: layouts ${row.control.layouts} dirtyObj ${row.control.dirtyObjects} recalcs ${row.control.recalcs} elems ${row.control.recalcElements} | ${changed.length} elements changed`);
    }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`wrote ${OUT}`);

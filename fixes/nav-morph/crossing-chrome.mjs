// P-096 (F3 crossing-frame count check, fixes/nav-morph/README.md "Draft ticket P-096"), Chrome part (fix-nav-morph).
// Counts only: no ms is judged. One rep per call (one shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-nav-morph -- \
//     node fixes/nav-morph/crossing-chrome.mjs --rep 1 [--order C,V,C2] [--dry]
// Per load (cold: a new server on a new port, a new isolated browser context):
//   serve.mjs --root site-pretty [--overlay out/snapshots/best-65052c4a3902] --port 0 --https --vendors=local
//   --latency 150 --no-cache; the page loads the plain-http twin; served JS/CSS hashes checked first (void on mismatch).
//   430x775 DPR 3 mobile + touch, no CPU throttle; rest 6 s at the top; the census (MutationObserver: attributes with
//   old values, childList, subtree; each record with performance.now()) and a rAF poll for the panel are installed;
//   one performance.mark sync; Tracing on; scroll 0 -> 3000 at 16 px per rAF (scrollTo inside rAF), 1 s rest; off.
// Saves out/nav-morph/p096/chrome-r<rep>-<arm>.json: {meta, served, sync, panel, census, events} where events are the
// renderer main-thread trace events the reader needs (BeginMainThreadFrame, FunctionCall, UpdateLayoutTree, Layout,
// *InvalidationTracking, the sync mark), unmodified. crossing-read.mjs does every count.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REP = Number(arg('--rep', '0'));
const ORDERS = { 1: 'C,V,C2', 2: 'V,C2,C', 3: 'C2,C,V' };
const ORDER = arg('--order', ORDERS[REP] || 'C').split(',');
const DRY = argv.includes('--dry');
const OUT = join(WT, 'out/nav-morph/p096'); mkdirSync(OUT, { recursive: true });
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const BASE = resolveTree('site-pretty');
const V_SNAP = join(WT, 'out/snapshots/best-65052c4a3902');
const ARMS = {
  C: { overlay: null, js: '4606120cf392', css: '27776f3d4138', cb: [13083, 13] },
  C2: { overlay: null, js: '4606120cf392', css: '27776f3d4138', cb: [13083, 13] },
  V: { overlay: V_SNAP, js: '65052c4a3902', css: 'e0f92804c521', cb: [13378, 13] },
};
const W = 430, H = 775, DPR = 3, REST_MS = 6000, TO_Y = 3000, STEP = 16;
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking',
  'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'].join(',');
const KEEP = /^(BeginMainThreadFrame|FunctionCall|UpdateLayoutTree|Layout|ScheduleStyleRecalculation|InvalidateLayout|[A-Za-z]*InvalidationTracking|fw-p096-sync|TracingStartedInBrowser|thread_name)$/;
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

// census + panel poll, installed after the rest (the WebKit side cannot run a document-start script; same in both engines)
const CENSUS_JS = `(() => {
  const P = '.start-selling-morph-panel', rec = window.__p096 = { muts: [], panelFirst: null, panelAtStart: !!document.querySelector(P) };
  const desc = (n) => { if (!n || n.nodeType !== 1) return n ? n.nodeName : null; const c = [...n.classList].filter((x) => !x.startsWith('svelte-')).slice(0, 2).join('.'); return n.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const inPanel = (n) => !!(n && n.nodeType === 1 && n.closest && n.closest(P));
  new MutationObserver((list) => { const t = performance.now(); for (const m of list) rec.muts.push([Math.round(t * 10) / 10, m.type, m.attributeName || null, desc(m.target), inPanel(m.target) ? 1 : 0,
    m.type === 'attributes' ? String(m.oldValue ?? '').slice(0, 40) : m.addedNodes.length, m.type === 'attributes' && m.target.getAttribute ? String(m.target.getAttribute(m.attributeName) ?? '').slice(0, 40) : m.removedNodes.length,
    m.attributeName === 'inert' || (m.type === 'attributes' && m.target === document.querySelector(P)) ? (m.target.querySelectorAll ? m.target.querySelectorAll('*').length : 0) : null]); })
    .observe(document.documentElement, { attributes: true, attributeOldValue: true, childList: true, subtree: true });
  const poll = (t) => { if (rec.panelFirst == null && document.querySelector(P)) rec.panelFirst = Math.round(t * 10) / 10; if (!rec.stop) requestAnimationFrame(poll); };
  requestAnimationFrame(poll); return rec.panelAtStart; })()`;
const SCROLL_JS = `new Promise((res) => { const t0 = performance.now(); const ts = []; let y = 0;
  const step = (t) => { ts.push([Math.round(t * 10) / 10, Math.round(scrollY)]); if (y < ${TO_Y}) { y = Math.min(${TO_Y}, y + ${STEP}); window.scrollTo({ top: y, behavior: 'instant' }); requestAnimationFrame(step); } else setTimeout(() => { window.__p096.stop = true; res(JSON.stringify({ t0, ts })); }, 1000); };
  requestAnimationFrame(step); })`;

async function serve(arm, i) {
  const st = join(OUT, `serve-chrome-${process.pid}-${arm}${i}.json`); rmSync(st, { force: true });
  const a = ARMS[arm];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(a.overlay ? ['--overlay', a.overlay] : []), '--port', '0', '--https', '--vendors=local', '--latency', '150', '--no-cache', '--quiet', '--state', st], { stdio: ['ignore', 'ignore', 'inherit'] });
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  if (!s?.httpTwin) { p.kill(); throw new Error(arm + ': server did not start (or no http twin)'); }
  rmSync(st, { force: true });
  return { proc: p, url: `http://127.0.0.1:${s.httpTwin}/` };
}

const profileDir = tempProfileDir(join(WT, 'out/nav-morph/p096/chrome'), 'p096');
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: `${W},${H}` });
const cdp = await CDP.connect(chrome.wsUrl);
console.log(`P096 chrome rep ${REP}${DRY ? ' (DRY, uncounted)' : ''} order ${ORDER.join(',')} browser ${chrome.browser}`);
try {
  for (let i = 0; i < ORDER.length; i++) {
    const arm = ORDER[i]; const a = ARMS[arm];
    const R = { meta: { ticket: 'P-096', tool: 'crossing-chrome.mjs', rep: REP, dry: DRY, arm, slot: i, order: ORDER, browser: chrome.browser, at: new Date().toISOString(), viewport: [W, H, DPR], restMs: REST_MS, toY: TO_Y, step: STEP, cb: a.cb, cats: CATS } };
    const f = join(OUT, `chrome-${DRY ? 'dry' : 'r' + REP}-${arm}.json`);
    let srv = null, page = null;
    try {
      srv = await serve(arm, i); page = await cdp.newIsolatedPage();
      R.served = {
        js: sha(Buffer.from(await (await fetch(new URL(NODE, srv.url))).arrayBuffer())),
        css: sha(Buffer.from(await (await fetch(new URL(CSS, srv.url))).arrayBuffer())),
      };
      if (R.served.js !== a.js || R.served.css !== a.css) { R.void = `served ${R.served.js}/${R.served.css}`; console.log('VOID', arm, R.void); continue; }
      await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
      await page.eval('window.scrollTo({ top: 0, behavior: "instant" }), 1');
      await sleep(REST_MS);
      R.panelAtStart = await page.eval(CENSUS_JS);
      const ev = []; const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) if (KEEP.test(e.name) || (e.cat || '').includes('user_timing')) ev.push(e); });
      await page.send('Tracing.start', { categories: CATS, transferMode: 'ReportEvents' });
      await sleep(300);
      R.sync = { pageMs: await page.eval('(performance.mark("fw-p096-sync"), performance.getEntriesByName("fw-p096-sync").pop().startTime)') };
      R.scroll = JSON.parse(await page.eval(SCROLL_JS, { timeout: 120000 }));
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
      await page.send('Tracing.end'); await done; off();
      const cen = await page.eval('JSON.stringify(window.__p096)');
      R.census = JSON.parse(cen);
      const mark = ev.find((e) => e.name === 'fw-p096-sync');
      R.sync.traceUs = mark ? mark.ts : null;
      R.events = ev;
      const n = (re) => ev.filter((e) => re.test(e.name)).length;
      R.summary = { events: ev.length, frames: n(/^BeginMainThreadFrame$/), functionCalls: n(/^FunctionCall$/), ult: n(/^UpdateLayoutTree$/), layout: n(/^Layout$/), invalidation: n(/InvalidationTracking$/), muts: R.census.muts.length, sync: R.sync.traceUs != null, panelAtStart: R.panelAtStart, panelFirst: R.census.panelFirst };
      console.log(arm, JSON.stringify(R.summary));
    } catch (e) { R.error = String(e.stack || e.message || e); console.log(arm, 'error', R.error.split('\n')[0]); }
    finally { try { await page?.close(); } catch {} srv?.proc.kill(); writeFileSync(f, JSON.stringify(R)); console.log('wrote', f.replace(WT + '/', '')); }
  }
} finally { cdp.close(); await chrome.close(); }

// all-wave1 countdown `active` gate probe (counts only, no timing). One page load of the all-wave1 overlay,
// mobile 430x932 DPR3 touch, CPU 6x after load, scrollY 0. Waits for #13's idle pre-mount of the morph panel
// (.start-selling-morph-panel in the DOM), checks the morph is inactive (panel data-start-selling-scene=paused,
// i.e. E false), then counts face style writes (MutationObserver on .svelte-1quva9c style attributes) for 6 s:
// inside the panel (expected 0: countdown-idle-raf honours `active`) and in the page countdown (control).
// Run ONLY inside a chrome-measure hold, capped:  timeout 60 node fixes/all-wave1/probe-countdown-active.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadavg } from 'node:os';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const BASE = resolveTree('site-pretty');
const OUT = join(WT, 'out/all-wave1-probe');
mkdirSync(OUT, { recursive: true });
const WIN = 6000, MOUNT_MAX = 20000;

async function server() {
  const st = join(OUT, 'serve.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(WT, 'fixes/all-wave1/overlay'),
    '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error('server did not start');
}
const INJECT = `(() => {
  const S = window.__cdp = { panel: 0, page: 0, on: false };
  new MutationObserver((l) => { if (!S.on) return; for (const m of l) { const t = m.target;
      if (!t.classList || !t.classList.contains('svelte-1quva9c')) continue;
      if (t.closest('.start-selling-morph-panel')) S.panel++; else S.page++; } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
})();`;
const STATE = `(() => { const p = document.querySelector('.start-selling-morph-panel');
  return { scrollY, mounted: !!p, scene: p?.getAttribute('data-start-selling-scene') ?? null, inert: p ? p.inert : null,
    panelFaces: p ? p.querySelectorAll('.face.svelte-1quva9c').length : 0,
    pageFaces: [...document.querySelectorAll('.face.svelte-1quva9c')].filter((f) => !f.closest('.start-selling-morph-panel')).length }; })()`;

const srv = await server();
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
let out;
try {
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await page.send('Page.bringToFront');
  await gotoAndSettle(page, srv.url, { quietMs: 2000 });
  await page.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const t0 = Date.now(); let st = await page.eval(STATE);
  while (!st.mounted && Date.now() - t0 < MOUNT_MAX) { await sleep(250); st = await page.eval(STATE); }
  const mountWaitMs = Date.now() - t0;
  await sleep(500);
  const before = await page.eval(STATE);
  await page.eval(`(window.__cdp.panel = 0, window.__cdp.page = 0, window.__cdp.on = true)`);
  await sleep(WIN);
  const counts = await page.eval(`(window.__cdp.on = false, { panel: window.__cdp.panel, page: window.__cdp.page })`);
  const after = await page.eval(STATE);
  await page.close();
  out = { url: srv.url, windowMs: WIN, mountWaitMs, before, after, panelFaceWrites: counts.panel, pageFaceWrites: counts.page,
    eFalseThroughout: before.scene === 'paused' && after.scene === 'paused', errors, load1: loadavg()[0],
    pass: before.mounted && before.scene === 'paused' && after.scene === 'paused' && before.scrollY === 0 && counts.panel === 0 };
} finally { cdp.close(); await ch.close(); srv.p.kill(); }
console.log(JSON.stringify(out));
writeFileSync(join(OUT, 'probe.json'), JSON.stringify(out, null, 1));
console.log(`PROBE ${out.pass ? 'PASS' : 'FAIL'}: panel face writes ${out.panelFaceWrites} (expect 0), page face writes ${out.pageFaceWrites} (control), mounted ${out.before.mounted} after ${out.mountWaitMs} ms, scene ${out.before.scene}->${out.after.scene}`);

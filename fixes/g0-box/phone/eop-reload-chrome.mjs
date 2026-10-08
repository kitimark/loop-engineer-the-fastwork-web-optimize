#!/usr/bin/env node
// Candidate 1 jack parity (1b) in headless Chrome, phone emulation (fix-g0-box, 2026-10-09; the Simulator probe
// eop-reload.mjs could not find its keyed tab after Safari's reload, see README). Functional, no timing. Per arm: a fresh
// isolated page at 430x932 DPR 3 with touch emulation; scroll so that #platform's bottom sits 100 px above the viewport's
// bottom (inside g0's hold, O() true); Page.reload (SvelteKit restores the position itself); 3 s; a passive window
// touchmove logger (bubble phase, after the page's capture listeners); one finger-up drag through Input.dispatchTouchEvent
// (y 700 -> 300 in 12 moves); then: scrollY before / after the reload, moves cancelable / defaultPrevented, the panel's
// opacity 1.2 s later. Held = prevented moves > 0 and the panel opens (opacity > 0.5), as on g0.0h.
// Run: node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 200 --owner fix-g0-box -- \
//        node fixes/g0-box/phone/eop-reload-chrome.mjs <label>=<url>...
import { join } from 'node:path';
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';

const REPO = new URL('../../..', import.meta.url).pathname;
const targets = process.argv.slice(2).map((a) => { const i = a.indexOf('='); return { label: a.slice(0, i), url: a.slice(i + 1) }; });
const LOG = `(() => { const L = window.__eopr = []; addEventListener('touchmove', (e) => L.push([e.cancelable ? 1 : 0, e.defaultPrevented ? 1 : 0]), { passive: true }); return 1; })()`;
const PANEL = "(() => { const p = document.querySelector('.start-selling-morph-panel'); return p ? +getComputedStyle(p).opacity : null; })()";
const ch = await launchChrome({ port: 0, profileDir: tempProfileDir(join(REPO, 'out', 'chrome-fn'), 'fix-g0-box'), headless: true, args: [screenInfoArg()] });
const ua = ch.userAgent ? headedUA(ch.userAgent) : null;
let cdp;
try {
  cdp = await CDP.connect(ch.wsUrl);
  for (const t of targets) for (const reload of [false, true]) {
    const page = await cdp.newIsolatedPage();
    if (ua) await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, t.url, { quietMs: 1500 }); await sleep(2000);
    await page.eval("(() => { const p = document.querySelector('.start-selling-platform'); const b = p.getBoundingClientRect().bottom + scrollY; scrollTo(0, Math.round(b - innerHeight + 100)); return 1; })()");
    await sleep(1500);
    const yBefore = await page.eval('Math.round(scrollY)');
    if (reload) {
      const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 30000).catch(() => null);
      await page.send('Page.reload', {}); await loaded; await sleep(3000);
    }
    const yAt = await page.eval('Math.round(scrollY)');
    await page.eval(LOG);
    const pt = (y) => [{ x: 215, y, id: 1 }];
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(700) });
    for (let i = 1; i <= 12; i++) { await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(700 - i * 33) }); await sleep(16); }
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1200);
    const L = await page.eval('window.__eopr'); const op = await page.eval(PANEL); const yEnd = await page.eval('Math.round(scrollY)');
    await page.close();
    const prev = L.filter((x) => x[1]).length;
    console.log(`RELOADCH ${t.label} ${reload ? 'after reload' : 'no reload  '}: y ${yBefore} -> ${yAt} | moves ${L.length}, cancelable ${L.filter((x) => x[0]).length}, prevented ${prev} | panel opacity ${op} | y after ${yEnd} -> ${prev > 0 && op > 0.5 ? 'HELD (opens)' : 'NOT held'}`);
  }
} finally { cdp?.close(); await ch.close(); }

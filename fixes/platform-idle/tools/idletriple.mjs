// Idle triple (protocol v2 §3.5, fixes/README.md item 13; headless, functional, counts only, no timing). Copied from the
// scene-scope probe (out/scene-scope/idletriple.mjs) for the platform-idle review: import path fixed, served-hash read
// added, spots fixed to y 0, parked 2620 and the pin 5345. Per arm, 430x932 DPR 3, CPU 1x:
// spots top (y=0), mid (walk down in 250 px steps to MIDY and park), end (walk on to ENDY, the morph pin).
// At each spot: 2 s settle, then WIN ms with no input. Counted by a document-start shim (the page's own work only):
//   rAF callbacks, timer callbacks (setTimeout/setInterval), observer callbacks (IO/RO/MO/PerformanceObserver),
//   events dispatched (scroll, animation*, transition*, resize; window capture), attribute mutation records
//   (= writes; split style / class / other), childList nodes added+removed, characterData records.
// usage: node fixes/platform-idle/tools/idletriple.mjs <out.json> <label>=<url>...   env WIN=5000 MIDY=2620 ENDY=5345 ROUNDS=2
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [out, ...targets] = process.argv.slice(2);
const E = (k, d) => Number(process.env[k] || d);
const WIN = E('WIN', 5000), MIDY = E('MIDY', 2620), ENDY = E('ENDY', 5345), ROUNDS = E('ROUNDS', 2);
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SHIM = `(() => {
  const C = window.__it = { raf: 0, timer: 0, obs: 0, ev: 0, wStyle: 0, wClass: 0, wOther: 0, nodes: 0, chars: 0, on: false };
  const MO0 = window.MutationObserver;
  const R = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { return R(function (t) { if (C.on) C.raf++; return cb(t); }); };
  for (const k of ['setTimeout', 'setInterval']) { const T = window[k]; window[k] = function (cb, ...a) { if (typeof cb === 'function') { const f = cb; cb = function (...x) { if (C.on) C.timer++; return f.apply(this, x); }; } return T.call(window, cb, ...a); }; }
  for (const K of ['IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'PerformanceObserver']) { const O = window[K]; if (!O) continue;
    window[K] = class extends O { constructor(cb, o) { super(function (...x) { if (C.on) C.obs++; return cb.apply(this, x); }, o); } }; }
  for (const t of ['scroll', 'animationstart', 'animationend', 'animationiteration', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'resize'])
    window.addEventListener(t, () => { if (C.on) C.ev++; }, { capture: true, passive: true });
  new MO0((rs) => { if (!C.on) return; for (const r of rs) { if (r.type === 'attributes') { if (r.attributeName === 'style') C.wStyle++; else if (r.attributeName === 'class') C.wClass++; else C.wOther++; }
    else if (r.type === 'childList') C.nodes += r.addedNodes.length + r.removedNodes.length; else C.chars++; } })
    .observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
})();`;
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return { js: await h(${JSON.stringify(JS)}), css: await h(${JSON.stringify(CSS)}) }; })()`;
const profileDir = tempProfileDir(join(root, 'out', 'platform-idle', 'chrome'), 'pi-idletriple');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg(), '--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const rows = [];
const walkTo = (page, y) => page.eval(`new Promise(async (res) => { const ty = Math.min(${y}, document.documentElement.scrollHeight - innerHeight); for (let i = 0; i < 400 && Math.abs(scrollY - ty) > 1; i++) { const d = ty - scrollY; scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 250), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); } res(Math.round(scrollY)); })`, { timeout: 90000 });
try {
  for (let round = 0; round < ROUNDS; round++) for (const t of (round % 2 ? [...targets].reverse() : targets)) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
    await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
    const served = await page.eval(HASH);
    for (const [spot, y] of [['top', 0], ['mid', MIDY], ['end', ENDY]]) {
      const sy = await walkTo(page, y);
      await sleep(2000);
      await page.eval(`Object.assign(window.__it, { raf: 0, timer: 0, obs: 0, ev: 0, wStyle: 0, wClass: 0, wOther: 0, nodes: 0, chars: 0, on: true }); 0`);
      await sleep(WIN);
      // one microtask first, so pending MutationObserver records (queued earlier) are delivered while counting is on
      const c = await page.eval(`(async () => { await Promise.resolve(); const c = window.__it; c.on = false; return JSON.parse(JSON.stringify(c)); })()`);
      const s = WIN / 1000, per = (v) => Math.round((v / s) * 10) / 10;
      const row = { label, round, spot, y: sy, served, perSec: { callbacks: per(c.raf + c.timer + c.obs), raf: per(c.raf), timer: per(c.timer), obs: per(c.obs), events: per(c.ev),
        writes: per(c.wStyle + c.wClass + c.wOther), wStyle: per(c.wStyle), wClass: per(c.wClass), wOther: per(c.wOther), nodes: per(c.nodes), chars: per(c.chars) } };
      rows.push(row); console.log(JSON.stringify(row));
    }
    await page.close();
  }
} finally {
  writeFileSync(out, JSON.stringify(rows, null, 1));
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

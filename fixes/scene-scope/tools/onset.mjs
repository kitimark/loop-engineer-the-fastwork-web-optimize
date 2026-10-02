// P-056a (c2): row-title sweep phase and onset, headless, real clock, no per-frame getAnimations before a title is
// visible (a forced style would hide the content-visibility race, q40ti vs q40ti2). Per load an init script logs:
// the load event, every data-start-selling-scene / -render write on #platform, data-sweep-paused writes on the titles,
// #platform contentvisibilityautostatechange; its own IntersectionObserver (threshold 0) on each title as it is created;
// from the first intersecting callback on, one getAnimations() read per rAF on that title only (samples: rAF time,
// currentTime, playState, data-sweep-paused) for up to 40 frames.
// Scenarios (env SCEN): S = load, +2.5 s after the load event jump to (doc title top - innerHeight - 400), then
// scrollBy 40 px per rAF until the organized title's top is at mid-viewport; H = navigate to <url>#platform, no input;
// J (info, not on the card) = scrollIntoView the doc title in the first task after it is created (earliest on-screen).
// usage: node onset.mjs <outdir> <tag> <label>=<url>...   env VW VH DPR SCEN=S|H CAP=14
import { launchChrome, CDP, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [outdir, tag, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const E = (k, d) => Number(process.env[k] || d);
const VW = E('VW', 430), VH = E('VH', 932), DPR = E('DPR', 3), CAP = E('CAP', 14);
const SCEN = process.env.SCEN || 'S';
const INIT = `(() => {
  const O = (window.__on = { ev: [], titles: {}, done: false, scen: ${JSON.stringify(SCEN)} });
  const T = () => Math.round(performance.now() * 10) / 10;
  const NAMES = ['doc', 'earn', 'secure', 'organized'];
  const nameOf = (el) => { const m = String(el.className || '').match(/start-selling-platform-row-title-(doc|earn|secure|organized)/); return m ? m[1] : null; };
  const sweep = (el) => el.getAnimations().find((a) => a.animationName === 'start-selling-platform-i-doc-sweep');
  addEventListener('load', () => { O.load = T(); if (O.scen === 'S') setTimeout(drive, 2500); });
  const sample = (n, el) => { const r = O.titles[n]; let k = 0;
    const tick = (ts) => { const a = sweep(el); r.samples.push([Math.round(ts * 10) / 10, a ? Math.round(a.currentTime * 10) / 10 : null, a ? a.playState : 'none', el.hasAttribute('data-sweep-paused') ? 1 : 0]);
      if (++k < 40) requestAnimationFrame(tick); else r.end = T(); };
    requestAnimationFrame(tick); };
  const io = new IntersectionObserver((es) => { for (const e of es) { const n = nameOf(e.target); if (!n || !e.isIntersecting || O.titles[n].vis != null) continue;
    O.titles[n].vis = T(); O.titles[n].entryTime = Math.round(e.time * 10) / 10; sample(n, e.target); } });
  const seen = new Set();
  const mo = new MutationObserver((ms) => { for (const m of ms) {
    if (m.type === 'childList') { for (const x of m.addedNodes) if (x.nodeType === 1) for (const el of [x, ...x.querySelectorAll('[class*="start-selling-platform-row-title-"]')]) {
      const n = nameOf(el); if (n && !seen.has(el)) { seen.add(el); O.titles[n] = { created: T(), vis: null, samples: [] }; io.observe(el);
        if (n === 'doc' && O.scen === 'J') setTimeout(() => { O.jump = T(); el.scrollIntoView({ block: 'center', behavior: 'instant' }); }, 0); } } continue; }
    const el = m.target, v = el.getAttribute(m.attributeName);
    if (m.attributeName === 'data-sweep-paused') { const n = nameOf(el); if (n) O.ev.push([T(), 'sp', n, v === null ? 0 : 1]); }
    else if (el.id === 'platform') O.ev.push([T(), m.attributeName.replace('data-start-selling-', ''), v]);
  } });
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-sweep-paused', 'data-start-selling-render', 'data-start-selling-scene'] });
  document.addEventListener('contentvisibilityautostatechange', (e) => { if (e.target.id === 'platform') O.ev.push([T(), 'cv', e.skipped ? 'skipped' : 'unskipped']); }, true);
  const top = (n) => { const el = document.querySelector('.start-selling-platform-row-title-' + n); return el ? el.getBoundingClientRect().top + scrollY : null; };
  function drive() { const d = top('doc'), o = top('organized'); O.drive = { t: T(), docTop: d, orgTop: o };
    scrollTo({ top: Math.max(0, d - innerHeight - 400), behavior: 'instant' });
    const stop = o - innerHeight / 2; let last = -1; const step = () => { if (scrollY >= stop || scrollY === last) { O.driveEnd = T(); return; } last = scrollY; scrollBy({ top: 40, behavior: 'instant' }); requestAnimationFrame(step); };
    requestAnimationFrame(step); }
})();`;
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'scene-scope-onset');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
const index = {};
try {
  for (const t of targets) {
    const [label, url0] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const url = SCEN === 'H' ? url0.replace(/#.*$/, '') + '#platform' : url0;
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: VW < 800 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: VW < 800, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    await page.send('Page.navigate', { url });
    const t0 = Date.now();
    let d = null;
    while (Date.now() - t0 < CAP * 1000) {
      await sleep(250);
      try {
        d = await page.eval(`(() => { const O = window.__on; if (!O || O.load == null) return null;
          const ts = Object.values(O.titles); const vis = ts.filter((r) => r.vis != null);
          const fin = vis.length && vis.every((r) => r.end != null);
          const ok = O.scen === 'S' ? (O.driveEnd != null && fin && vis.length === 4) : (fin && performance.now() - O.load > 1500);
          return ok ? 1 : 0; })()`);
      } catch { d = null; }
      if (d === 1) break;
    }
    const O = await page.eval(`window.__on`);
    const sy = await page.eval(`scrollY`);
    index[label] = { url, vw: VW, scen: SCEN, capped: d !== 1, scrollY: sy, ...O };
    const brief = Object.entries(O.titles || {}).map(([n, r]) => `${n}:${r.vis == null ? '-' : 'vis' + r.vis + ' ct0=' + (r.samples[0] ? r.samples[0][1] : '?')}`).join(' ');
    console.log(`${label} ${SCEN} ${VW}: load ${O.load} capped ${d !== 1} y ${sy} ${brief}`);
    await page.close();
  }
} finally {
  writeFileSync(join(outdir, `onset-${tag}.json`), JSON.stringify(index, null, 1));
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

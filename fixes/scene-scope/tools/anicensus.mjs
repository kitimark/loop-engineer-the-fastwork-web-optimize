// P-056c (a): per-animation census through #platform, headless, real clock, functional (no timing claim).
// Per load: an init script logs every data-start-selling-scene write on #platform (document timeline time). After the
// start (S: load, +2.5 s; H: <url>#platform, +2.5 s) the probe walks y0 -> y1 -> y0 in STEP px instant scrolls, one
// every DWELL ms (real), y0 = #platform top - 1.5 viewports, y1 = #platform bottom (clamped to the page). At each step,
// after 2 rAFs: every animation in document.getAnimations() (CSS animations, transitions, WAAPI) with its target,
// name, playState, iteration duration, currentTime, phase = (currentTime - delay) mod duration, and startTime relative
// to the last scene=active write (running animations only). Targets inside #platform are listed per animation; outside
// #platform only the count per playState. The getAnimations() read forces a style update at every step, in every arm.
// 'outx' (per outside animation: name|tag.class, playState, absolute startTime, currentTime) was added for the post-hoc
// Sx430 run; the first census files (S/H at 430 and 1440) have only the 'outside' counts.
// usage: node anicensus.mjs <outdir> <tag> <label>=<url>...   env VW VH DPR SCEN=S|H STEP=150 DWELL=150
import { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const [outdir, tag, ...targets] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const E = (k, d) => Number(process.env[k] || d);
const VW = E('VW', 430), VH = E('VH', 932), DPR = E('DPR', 3), STEP = E('STEP', 150), DWELL = E('DWELL', 150);
const SCEN = process.env.SCEN || 'S';
const INIT = `(() => {
  const O = (window.__ac = { ev: [] });
  const mo = new MutationObserver((ms) => { for (const m of ms) { const el = m.target; if (el.id !== 'platform') continue;
    O.ev.push([Math.round(document.timeline.currentTime * 10) / 10, m.attributeName.replace('data-start-selling-', ''), el.getAttribute(m.attributeName)]); } });
  mo.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-start-selling-scene', 'data-start-selling-render'] });
})();`;
const READ = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const P = document.getElementById('platform'); const ev = window.__ac.ev;
  let tAct = null; for (const e of ev) if (e[1] === 'scene' && e[2] === 'active') tAct = e[0];
  const path = (el) => { const out = []; let e = el; while (e && e !== P && out.length < 6) { const c = String(e.getAttribute && e.getAttribute('class') || '').split(/\\s+/).filter((k) => k && !k.startsWith('svelte-')).slice(0, 2).join('.');
      const sib = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [e]; out.unshift(e.tagName.toLowerCase() + (c ? '.' + c : '') + (sib.length > 1 ? ':' + sib.indexOf(e) : '')); e = e.parentElement; }
    return out.join('>'); };
  const plat = [], outside = {}, outx = [];
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target; const pe = a.effect && a.effect.pseudoElement ? a.effect.pseudoElement : '';
    const inP = t instanceof Element && (t === P || P.contains(t));
    const name = a.animationName || (a.transitionProperty ? 'transition:' + a.transitionProperty : 'waapi');
    if (!inP) { const k = name + ':' + a.playState; outside[k] = (outside[k] || 0) + 1;
      const tc = t instanceof Element ? t.tagName.toLowerCase() + '.' + String(t.getAttribute('class') || '').split(/\\s+/).filter((c) => c && !c.startsWith('svelte-')).slice(0, 2).join('.') : '?';
      outx.push({ k: name + '|' + tc + pe, ps: a.playState, st: a.startTime == null ? null : Math.round(a.startTime * 10) / 10, ct: a.currentTime == null ? null : Math.round(Number(a.currentTime) * 10) / 10 }); continue; }
    const tm = a.effect.getComputedTiming(); const delay = a.effect.getTiming().delay || 0; const dur = Number(tm.duration) || 0;
    const ct = a.currentTime == null ? null : Number(a.currentTime);
    const ph = ct == null || !(dur > 0) ? null : Math.round((((ct - delay) % dur) + dur) % dur * 10) / 10;
    const r = t.getBoundingClientRect();
    plat.push({ k: name + '|' + path(t) + pe, ps: a.playState, dur, it: tm.iterations === Infinity ? 'inf' : tm.iterations, ct: ct == null ? null : Math.round(ct * 10) / 10, ph,
      st: a.startTime == null || tAct == null ? null : Math.round((a.startTime - tAct) * 10) / 10, vis: r.bottom > 0 && r.top < innerHeight && r.width > 0 ? 1 : 0 });
  }
  return { y: Math.round(scrollY), t: Math.round(document.timeline.currentTime), scene: P.getAttribute('data-start-selling-scene'), render: P.getAttribute('data-start-selling-render'), tAct, plat, outside, outx };
})()`;
const profileDir = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'scene-scope-census');
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
    await gotoAndSettle(page, url, { quietMs: 1500 }); await sleep(2500);
    if (/^W\d/.test(label)) { console.log(`${label}: warm-up load only`); await page.close(); continue; }
    const geo = await page.eval(`(() => { const r = document.getElementById('platform').getBoundingClientRect(); return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), max: document.documentElement.scrollHeight - innerHeight, y: Math.round(scrollY) }; })()`);
    const y0 = Math.max(0, geo.top - Math.round(1.5 * VH)), y1 = Math.min(geo.max, geo.bottom);
    const ys = []; for (let y = y0; y <= y1; y += STEP) ys.push(y);
    const walk = [...ys.map((y) => ['d', y]), ...ys.slice(0, -1).reverse().map((y) => ['u', y])];
    const steps = [];
    const first = await page.eval(READ); first.dir = 'start'; steps.push(first);
    for (const [dir, y] of walk) {
      const t0 = Date.now();
      await page.eval(`scrollTo({ top: ${y}, behavior: 'instant' })`);
      const s = await page.eval(READ); s.dir = dir; s.target = y; steps.push(s);
      const left = DWELL - (Date.now() - t0); if (left > 0) await sleep(left);
    }
    const ev = await page.eval(`window.__ac.ev`);
    index[label] = { url, vw: VW, scen: SCEN, geo, y0, y1, step: STEP, dwell: DWELL, ev, steps };
    console.log(`${label} ${SCEN} ${VW}: platform ${geo.top}-${geo.bottom} walk ${y0}-${y1} steps ${steps.length} anims/step max ${Math.max(...steps.map((s) => s.plat.length))}`);
    await page.close();
  }
} finally {
  writeFileSync(join(outdir, `census-${tag}.json`), JSON.stringify(index));
  cdp.close(); await ch.close(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

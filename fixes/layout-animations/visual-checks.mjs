// Frozen-frame visual checks of the animated elements (base vs fix). Called from idle-probe.mjs.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SETTLE = `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`;

// Page.captureScreenshot's clip is in document coordinates: add scrollX/scrollY to the viewport rect.
// (v1 used the viewport rect only: every shot taken after scrolling was a blank strip of the page top,
// so the carousel and fee checks compared blank with blank and reported 0 %.)
async function shot(page, sel, pad, file, fullWidth = false) {
  const r = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const b = e.getBoundingClientRect(); return ${fullWidth} ? { x: scrollX, y: scrollY + Math.round(b.top) - ${pad}, width: innerWidth, height: Math.round(b.height) + ${2 * pad} } : { x: scrollX + b.left - ${pad}, y: scrollY + b.top - ${pad}, width: b.width + ${2 * pad}, height: b.height + ${2 * pad} }; })()`);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

async function scrollTo(page, sel) {
  const y = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return Math.max(0, Math.round(scrollY + r.top + r.height / 2 - innerHeight / 2)); })()`);
  await page.eval(`new Promise(async (res) => { for (let i = 0; i < 200 && Math.abs(scrollY - ${y}) > 1; i++) { const d = ${y} - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 300), behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); } res(); })`, { timeout: 60000 });
}

// wait until `cond` is true, then pause every animation under `scope` and seek to t ms
const FREEZE = (scope, cond, t) => `new Promise((res) => { const t0 = performance.now(); const tick = () => {
  if (${cond}) { const root = document.querySelector(${JSON.stringify(scope)}); const as = document.getAnimations().filter(a => a.effect && a.effect.target && root.contains(a.effect.target));
    for (const a of as) { a.pause(); a.currentTime = ${t}; } res(as.map(a => (a.animationName || a.transitionProperty || 'waapi') + ':' + a.effect.target.tagName)); return; }
  if (performance.now() - t0 > 15000) { res('timeout'); return; } requestAnimationFrame(tick); }; tick(); })`;

export async function visualChecks(cdp, targets, outDir, { gotoAndSettle, sleep }) {
  mkdirSync(outDir, { recursive: true });
  const files = {};
  for (const t of targets) {
    const page = await cdp.newIsolatedPage();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Page.bringToFront');
    const f = (files[t.label] = {});
    try {
      // 1. hero accent: freeze the draw-in at 300 / 600 ms
      for (const ms of [150, 300, 600, 850]) {
        await gotoAndSettle(page, t.url, { quietMs: 1500 });
        const r = await page.eval(FREEZE('.hero-title', `document.querySelector('.script-accent.is-drawing-in')`, ms), { timeout: 30000 });
        await page.eval(SETTLE);
        f[`accent-${ms}`] = await shot(page, 'h1', 12, join(outDir, `${t.label}-accent-${ms}.png`), true);
        console.log(t.label, 'accent', ms, JSON.stringify(r));
      }
      // 1b. hero accent under html[dir=rtl] (the RTL hero title is row-reverse): 300 and 600 ms
      for (const ms of [300, 600]) {
        await gotoAndSettle(page, t.url, { quietMs: 1500 });
        await page.eval(`document.documentElement.setAttribute('dir', 'rtl')`);
        const r = await page.eval(FREEZE('.hero-title', `document.querySelector('.script-accent.is-drawing-in')`, ms), { timeout: 30000 });
        await page.eval(SETTLE);
        f[`accent-rtl-${ms}`] = await shot(page, 'h1', 12, join(outDir, `${t.label}-accent-rtl-${ms}.png`), true);
        console.log(t.label, 'accent-rtl', ms, JSON.stringify(r));
      }
      // 2. avatar carousel: freeze the exit at 20 / 60 / 110 / 180 ms
      for (const ms of [20, 60, 110, 180]) {
        await gotoAndSettle(page, t.url, { quietMs: 1500 });
        await scrollTo(page, '.start-selling-avatars');
        await sleep(800);
        const r = await page.eval(FREEZE('.start-selling-avatars', `document.querySelector('.start-selling-avatars img.is-exit')`, ms), { timeout: 30000 });
        await page.eval(SETTLE);
        f[`avatars-${ms}`] = await shot(page, '.start-selling-avatars', 6, join(outDir, `${t.label}-avatars-${ms}.png`));
        console.log(t.label, 'avatars', ms, JSON.stringify(r));
      }
      // 3. fee progress: static clones at fixed progress values, rendered the way each side renders them
      await page.eval(`(() => {
        const src = document.querySelector('.fee-progress'); const fix = getComputedStyle(src.firstElementChild).clipPath !== 'none';
        const box = document.createElement('div'); box.id = '__feebox';
        box.style.cssText = 'position:fixed;left:20px;top:80px;width:320px;padding:10px;background:#fff;z-index:2147483647;display:flex;flex-direction:column;gap:10px';
        for (const p of [0, 0.01, 0.03, 0.1, 0.37, 0.77, 1]) { const c = src.cloneNode(true); const s = c.firstElementChild; s.removeAttribute('style');
          if (fix) s.style.setProperty('--fee-progress', String(p)); else s.style.width = (p * 100) + '%'; box.appendChild(c); }
        document.body.appendChild(box); return fix; })()`);
      await page.eval(SETTLE);
      f.fee = await shot(page, '#__feebox', 0, join(outDir, `${t.label}-fee.png`));
    } catch (e) { console.log('visual check error', t.label, e.message); }
    await page.close();
  }
  // pixel diff (same threshold as verify.mjs)
  const [a, b] = targets.map((t) => files[t.label]);
  const page = await cdp.newIsolatedPage();
  for (const k of Object.keys(a || {})) {
    if (!b?.[k]) continue;
    const da = 'data:image/png;base64,' + readFileSync(a[k]).toString('base64');
    const db = 'data:image/png;base64,' + readFileSync(b[k]).toString('base64');
    const res = await page.eval(`(async () => {
      const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
      const [A, B] = await Promise.all([load(${JSON.stringify(da)}), load(${JSON.stringify(db)})]);
      const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
      x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
      x.clearRect(0, 0, w, h); x.drawImage(B, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
      let diff = 0, maxd = 0;
      for (let i = 0; i < pa.length; i += 4) { const d = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]); if (d > 48) diff++; if (d > maxd) maxd = d; }
      // blank guard: a shot whose pixels span almost no colour range can't prove equivalence
      const span = (p) => { let lo = 765, hi = 0; for (let i = 0; i < p.length; i += 4) { const v = p[i] + p[i+1] + p[i+2]; if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; };
      const blank = span(pa) < 60 || span(pb) < 60;
      return { size: [A.width, A.height, B.width, B.height].join('x'), diffPct: Math.round(10000 * diff / (w * h)) / 100, maxd, blank };
    })()`);
    console.log(res.blank ? 'VISUAL-BLANK' : 'VISUAL', k, JSON.stringify(res));
  }
  await page.close();
}

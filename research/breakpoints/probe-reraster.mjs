// rm1440 decisive check (de-breakpoints, T-034; README §3.2): do the baseline and st6-rb2 still differ after each arm's
// hero cards are forced to re-raster once? Functional, headless, shared lane (no timing).
// usage: node research/breakpoints/probe-reraster.mjs <config> <outdir> B=<url> S=<url>   (B2 = B again: the true A/A)
// Per arm and stop (top, hero): walk + settle, freeze -> "pre" shot; inline `will-change: auto !important` on every
// .orbit-card, 2 rAF + 300 ms, remove it, 2 rAF + 500 ms, freeze -> "post" shot (one re-raster of the card layers);
// then the same toggle on every in-view element with a non-auto will-change (nav included) -> "all" shot.
// Report per pair X (B) vs Y, with the A/A pair B vs B2 of the same phase, the tolerance report of
// research/pixel-tolerance/README.md §1: max level, area beyond A/A (> 8 levels where A/A <= 8; % of frame and CSS px2,
// per element), edge or fill (flat = 3x3 neighbourhood in X varies by <= 2 levels), static (rects equal in every arm).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cname, outdir, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
URLS.B2 = URLS.B;
const ARMS = ['B', 'S', 'B2'];
const CFG = CONFIGS[cname];
const SETTLE = Number(process.env.SETTLE || 2000);
mkdirSync(join(outdir, 'png'), { recursive: true });

const STOPS = `(() => { const abs = (s, f = 0) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY + f * innerHeight) : null; };
  return { top: 0, hero: abs('.hero-track', 0.5) }; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 400; i++) { const t = Math.min(${y}, document.documentElement.scrollHeight - innerHeight);
  if (Math.abs(scrollY - t) <= 1) break; const d = t - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(300, Math.abs(d)), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); }
  return Math.round(scrollY); })()`;
const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const vis = (r) => r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
// elements the area is attributed to (first match wins, in this order); the countdown is masked (live clock)
const STATE = `(() => { const vis = ${vis.toString()}, R = ${R.toString()}, els = [];
  document.querySelectorAll('.orbit-card').forEach((e, i) => { const r = e.getBoundingClientRect(); if (vis(r)) { const im = e.querySelector('img');
    els.push({ name: 'card' + i, ...R(r), wc: getComputedStyle(e).willChange, fwwc: e.getAttribute('data-fw-wc'), img: im ? (im.currentSrc || im.src).replace(/^https?:\\/\\/[^/]+/, '') + ' ' + im.naturalWidth + 'x' + im.naturalHeight : null }); } });
  for (const [n, s] of [['nav', 'header.start-selling-top-nav'], ['heroCopy', '.hero-copy']]) { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); if (vis(r)) els.push({ name: n, ...R(r), wc: getComputedStyle(e).willChange, fwwc: e.getAttribute('data-fw-wc') }); } }
  const sc = document.querySelector('[data-start-selling-scene]');
  return { y: Math.round(scrollY), dpr: devicePixelRatio, scene: sc ? sc.getAttribute('data-start-selling-scene') : null,
    cd: [...document.querySelectorAll('.countdown')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map(R), els,
    anims: document.getAnimations().filter((a) => a.playState === 'running').length }; })()`;
const FREEZE = `(async () => { window.__rrPaused = []; for (const a of document.getAnimations()) { if (a.playState !== 'running') continue;
  try { a.pause(); window.__rrPaused.push(a); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return ${STATE}; })()`;
const THAW = `(() => { for (const a of window.__rrPaused || []) { try { a.play(); } catch (e) {} } window.__rrPaused = []; return 1; })()`;
const raf2 = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
// which: 'cards' = every .orbit-card; 'all' = every in-view element whose computed will-change is not auto
const TOGGLE = (which) => `(async () => { const vis = ${vis.toString()};
  const els = ${which === 'cards' ? `[...document.querySelectorAll('.orbit-card')]` : `[...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).willChange !== 'auto' && vis(e.getBoundingClientRect()))`};
  for (const e of els) e.style.setProperty('will-change', 'auto', 'important');
  await ${raf2}; await new Promise((r) => setTimeout(r, 300));
  const off = els.filter((e) => getComputedStyle(e).willChange === 'auto').length;
  for (const e of els) e.style.removeProperty('will-change');
  await ${raf2}; await new Promise((r) => setTimeout(r, 500));
  return { n: els.length, offApplied: off, back: els.filter((e) => getComputedStyle(e).willChange !== 'auto').length }; })()`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-rr');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { config: cname, cfg: CFG, urls: URLS, arms: {}, diffs: {} };
const png = (arm, stop, phase) => join(outdir, 'png', `${arm}-${stop}-${phase}.png`);
const PHASES = ['pre', 'post', 'all'];
try {
  for (const arm of ARMS) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch });
    if (CFG.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const t0 = Date.now();
    await gotoAndSettle(page, URLS[arm]); await sleep(2500);
    const stops = await page.eval(STOPS);
    res.arms[arm] = { stops, shots: {} };
    for (const stop of ['top', 'hero']) {
      if (stops[stop] == null) continue;
      await page.eval(walk(stops[stop])); await sleep(SETTLE);
      for (const phase of PHASES) {
        let tog = null;
        if (phase !== 'pre') tog = await page.eval(TOGGLE(phase === 'post' ? 'cards' : 'all'));
        const st = await page.eval(FREEZE);
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        await page.eval(THAW);
        writeFileSync(png(arm, stop, phase), Buffer.from(data, 'base64'));
        res.arms[arm].shots[`${stop}-${phase}`] = { ...st, tog };
      }
      const s = res.arms[arm].shots;
      console.log(`SHOT ${arm} ${stop} y${s[stop + '-pre'].y} scene=${s[stop + '-pre'].scene} cards ${s[stop + '-pre'].els.filter((e) => e.name.startsWith('card')).length} toggles cards ${JSON.stringify(s[stop + '-post'].tog)} all ${JSON.stringify(s[stop + '-all'].tog)}`);
    }
    console.log(`ARM ${arm} ${Math.round((Date.now() - t0) / 1000)}s cards@top ${JSON.stringify(res.arms[arm].shots['top-pre']?.els.filter((e) => e.name.startsWith('card')).map((e) => e.name + ' wc=' + e.wc + ' fwwc=' + e.fwwc + ' ' + e.img))}`);
    await page.close();
  }
  writeFileSync(join(outdir, 'reraster.json'), JSON.stringify(res, null, 1));

  // ---- diffs, in a blank page (OffscreenCanvas decode) ----
  const dp = await cdp.newIsolatedPage();
  await dp.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  const report = async (fx, fy, fx2, mask, els, dpr) => {
    const b64 = (f) => JSON.stringify(readFileSync(f).toString('base64'));
    return dp.eval(`(async () => { const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
      const ims = [await load(${b64(fx)}), await load(${b64(fy)}), await load(${b64(fx2)})];
      const W = Math.min(...ims.map((i) => i.width)), H = Math.min(...ims.map((i) => i.height)); const c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
      const px = ims.map((im) => { x.clearRect(0, 0, W, H); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H).data; }); const [X, Y, X2] = px;
      const dpr = ${dpr}, sc = (q, pad) => [q.l * dpr - pad, q.t * dpr - pad, q.r * dpr + pad, q.b * dpr + pad];
      const M = ${JSON.stringify(mask)}.map((q) => sc(q, 2)), E = ${JSON.stringify(els)}.map((e) => ({ name: e.name, q: sc(e, 0) }));
      const inR = (q, a, b) => a >= q[0] && a <= q[2] && b >= q[1] && b <= q[3];
      const d3 = (P, Q, i) => Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i+1] - Q[i+1]), Math.abs(P[i+2] - Q[i+2]));
      const flat = (i, a, b) => { for (let ch = 0; ch < 3; ch++) { let lo = 255, hi = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const u = Math.min(W - 1, Math.max(0, a + dx)), v = Math.min(H - 1, Math.max(0, b + dy)), k = (v * W + u) * 4 + ch; if (X[k] < lo) lo = X[k]; if (X[k] > hi) hi = X[k]; } if (hi - lo > 2) return false; } return true; };
      let maxAll = 0, maxAA = 0, any = 0, beyond = 0, beyondFlat = 0, maxEdge = 0, maxFlat = 0, over48 = 0, masked = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const per = {}; const hist = [0, 0, 0, 0, 0];
      for (let i = 0, p = 0; i < X.length; i += 4, p++) { const a = p % W, b = (p / W) | 0; const d = d3(X, Y, i), aa = d3(X, X2, i);
        if (d === 0 && aa === 0) continue; if (M.some((q) => inR(q, a, b))) { if (d > 8) masked++; continue; }
        if (d > maxAll) maxAll = d; if (aa > maxAA) maxAA = aa; if (d > 0) any++;
        if (d > 8 && aa <= 8) { beyond++; if (d > 48) over48++; const f = flat(i, a, b); if (f) { beyondFlat++; if (d > maxFlat) maxFlat = d; } else if (d > maxEdge) maxEdge = d;
          hist[d <= 16 ? 0 : d <= 32 ? 1 : d <= 64 ? 2 : d <= 128 ? 3 : 4]++;
          const el = E.find((e) => inR(e.q, a, b)); const k = el ? el.name : 'other'; per[k] = (per[k] || 0) + 1;
          if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; } }
      const css = (n) => Math.round(n / (dpr * dpr));
      return { maxLevel: maxAll, aaMaxLevel: maxAA, anyLevelPct: +(100 * any / (W * H)).toFixed(3), beyondPct: +(100 * beyond / (W * H)).toFixed(3), beyondCssPx2: css(beyond),
        perElementCssPx2: Object.fromEntries(Object.entries(per).sort((u, v) => v[1] - u[1]).map(([k, v]) => [k, css(v)])), flatPct: beyond ? +(100 * beyondFlat / beyond).toFixed(1) : 0,
        maxEdgeBeyond: maxEdge, maxFlatBeyond: maxFlat, over48, hist9_16_32_64_128_255: hist, maskedOver8: masked, bboxCss: beyond ? [x0, y0, x1, y1].map((v) => Math.round(v / dpr)) : null }; })()`);
  };
  const same = (a, b) => JSON.stringify(a.map((e) => [e.name, e.l, e.t, e.r, e.b].map((v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v))) === JSON.stringify(b.map((e) => [e.name, e.l, e.t, e.r, e.b].map((v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  for (const stop of ['top', 'hero']) {
    const sh = (arm, ph) => res.arms[arm].shots[`${stop}-${ph}`];
    if (!sh('B', 'pre')) continue;
    for (const ph of PHASES) {
      const mask = ARMS.flatMap((a) => sh(a, ph).cd), els = sh('B', ph).els, dpr = sh('B', ph).dpr;
      const geomStatic = ARMS.every((a) => same(sh(a, ph).els, els)) && same(sh('B', 'pre').els, els);
      const sb = await report(png('B', stop, ph), png('S', stop, ph), png('B2', stop, ph), mask, els, dpr);
      const aa = await report(png('B', stop, ph), png('B2', stop, ph), png('B2', stop, ph), mask, els, dpr);
      const k = `${stop}/${ph}`;
      res.diffs[k] = { ys: ARMS.map((a) => sh(a, ph).y), geomStatic, SvsB: sb, AA: aa };
      console.log(`DIFF ${k} y ${res.diffs[k].ys.join('/')} static=${geomStatic} S~B max ${sb.maxLevel} (A/A max ${sb.aaMaxLevel}) beyond ${sb.beyondPct}% = ${sb.beyondCssPx2} px2 flat ${sb.flatPct}% edgeMax ${sb.maxEdgeBeyond} flatMax ${sb.maxFlatBeyond} >48 ${sb.over48} per ${JSON.stringify(sb.perElementCssPx2)} any ${sb.anyLevelPct}% | B~B2 beyond ${aa.maxLevel} max, ${aa.anyLevelPct}% any`);
    }
    // did the re-raster change an arm against its own pre shot? (B pre as X, A/A = B2 pre)
    for (const arm of ['B', 'S']) for (const ph of ['post', 'all']) {
      const mask = ARMS.flatMap((a) => [...sh(a, 'pre').cd, ...sh(a, ph).cd]);
      const r = await report(png(arm, stop, 'pre'), png(arm, stop, ph), png(arm, stop, 'pre'), mask, sh(arm, 'pre').els, sh(arm, 'pre').dpr);
      res.diffs[`${stop}/${arm}:pre~${ph}`] = r;
      console.log(`SELF ${stop} ${arm} pre~${ph} max ${r.maxLevel} >8 ${r.beyondPct}% = ${r.beyondCssPx2} px2 per ${JSON.stringify(r.perElementCssPx2)}`);
    }
    // and is S pre the same picture as B post (B made sharp by the toggle)?
    { const mask = ARMS.flatMap((a) => [...sh(a, 'pre').cd, ...sh(a, 'post').cd]);
      const r = await report(png('B', stop, 'post'), png('S', stop, 'pre'), png('B2', stop, 'post'), mask, sh('B', 'post').els, sh('B', 'post').dpr);
      res.diffs[`${stop}/Spre~Bpost`] = r;
      console.log(`CROSS ${stop} S-pre~B-post max ${r.maxLevel} beyond ${r.beyondPct}% = ${r.beyondCssPx2} px2 per ${JSON.stringify(r.perElementCssPx2)}`); }
  }
  writeFileSync(join(outdir, 'reraster.json'), JSON.stringify(res, null, 1));
  await dp.close();
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

// rm1440 follow-up (de-breakpoints, T-034): is the "sharper hero photos" difference a property of the build or of the
// page load? Loads the arms in ORDER (default B,S,B,S,B,S,B,S), each in a fresh tab of one headless Chrome, frozen shots
// at top and hero; then groups the shots into classes (two shots are in one class when no pixel outside the countdown
// differs by more than 8 levels) and reports a sharpness score per shot (mean |Laplacian| of luminance over the
// visible .orbit-card rects). Functional, shared lane (no timing).
// usage: [ORDER=B,S,..] [IMGDELAY=ms] [NOCACHE=1] [MASK=<selectors>] [REPAINT=1] node research/breakpoints/probe-loads.mjs <config> <outdir> B=<url> S=<url>
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cname, outdir, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const ORDER = (process.env.ORDER || 'B,S,B,S,B,S,B,S').split(',');
const CFG = CONFIGS[cname];
const SETTLE = Number(process.env.SETTLE || 2000);
const IMGDELAY = Number(process.env.IMGDELAY || 0); // ms; 0 = off
const MASKSEL = process.env.MASK || ''; // extra masked selectors, padded by 30 % of their height (as sweep.mjs)
const NOCACHE = process.env.NOCACHE === '1'; // Network.setCacheDisabled in every tab (no memory or HTTP cache hit)
// REPAINT=1: stops top and top-rp; before top-rp, an invisible paint invalidation of every card photo (inline
// box-shadow 0 0 0 0 transparent on `.orbit-card .profile-cover` and its img): does a repaint turn a soft load sharp?
const STOPLIST = process.env.REPAINT === '1' ? ['top', 'top-rp'] : ['top', 'hero'];
const REPAINT_JS = `(async () => { const els = [...document.querySelectorAll('.orbit-card .profile-cover, .orbit-card img')];
  for (const e of els) e.style.boxShadow = '0 0 0 0 rgba(0, 0, 0, 0)';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return els.length; })()`;
mkdirSync(join(outdir, 'png'), { recursive: true });
const STOPS = `(() => { const abs = (s, f = 0) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY + f * innerHeight) : null; };
  return { top: 0, hero: abs('.hero-track', 0.5) }; })()`;
const walk = (y) => `(async () => { for (let i = 0; i < 400; i++) { const t = Math.min(${y}, document.documentElement.scrollHeight - innerHeight);
  if (Math.abs(scrollY - t) <= 1) break; const d = t - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(300, Math.abs(d)), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); }
  return Math.round(scrollY); })()`;
const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const STATE = `(() => { const R = ${R.toString()}, vis = (r) => r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  return { y: Math.round(scrollY), dpr: devicePixelRatio, cd: [...document.querySelectorAll('.countdown')].map((e) => [e.getBoundingClientRect(), 0]).concat(${JSON.stringify(MASKSEL)} ? [...document.querySelectorAll(${JSON.stringify(MASKSEL)})].map((e) => [e.getBoundingClientRect(), 0.3]) : []).filter(([r]) => r.width && r.height).map(([r, p]) => ({ l: r.left - p * r.height, t: r.top - p * r.height, r: r.right + p * r.height, b: r.bottom + p * r.height })),
    cards: [...document.querySelectorAll('.orbit-card')].map((e) => e.getBoundingClientRect()).filter(vis).map(R),
    imgs: [...document.querySelectorAll('.orbit-card img')].map((i) => { const t = performance.getEntriesByName(i.currentSrc)[0]; return t ? Math.round(t.responseEnd) : null; }),
    load: Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0), vis: document.visibilityState, focus: document.hasFocus() }; })()`;
const FREEZE = `(async () => { window.__p = []; for (const a of document.getAnimations()) { if (a.playState !== 'running') continue; try { a.pause(); window.__p.push(a); a.currentTime = 1000; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return ${STATE}; })()`;
const THAW = `(() => { for (const a of window.__p || []) { try { a.play(); } catch (e) {} } return 1; })()`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-loads');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { config: cname, order: ORDER, shots: [] };
const png = (i, stop) => join(outdir, 'png', `${i}-${ORDER[i]}-${stop}.png`);
try {
  for (let i = 0; i < ORDER.length; i++) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (NOCACHE) { await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true }); }
    if (IMGDELAY) { // hold every hero photo request IMGDELAY ms, so the images arrive after the first raster (as on a cold load)
      page.on((m) => { if (m.method === 'Fetch.requestPaused') setTimeout(() => page.send('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => {}), IMGDELAY); });
      await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/selling/hero/*', requestStage: 'Request' }] });
    }
    await gotoAndSettle(page, URLS[ORDER[i]]); await sleep(2500);
    const stops = await page.eval(STOPS);
    for (const stop of STOPLIST) {
      if (stop === 'top-rp') await page.eval(REPAINT_JS);
      await page.eval(walk(stops[stop === 'top-rp' ? 'top' : stop])); await sleep(SETTLE);
      const st = await page.eval(FREEZE);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      await page.eval(THAW);
      writeFileSync(png(i, stop), Buffer.from(data, 'base64'));
      res.shots.push({ i, arm: ORDER[i], stop, ...st });
    }
    await page.close();
    console.log(`LOAD ${i} ${ORDER[i]} load@${res.shots.at(-1).load}ms imgs ${JSON.stringify(res.shots.at(-1).imgs)} vis=${res.shots.at(-1).vis}`);
  }
  const dp = await cdp.newIsolatedPage();
  await dp.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  const b64 = (f) => JSON.stringify(readFileSync(f).toString('base64'));
  // in-page: sharpness of one shot over card rects; pair diff (count > 8 outside the mask, max level)
  for (const stop of STOPLIST) {
    const sh = res.shots.filter((s) => s.stop === stop);
    const mask = sh.flatMap((s) => s.cd), cards = sh[0].cards, dpr = sh[0].dpr;
    const out = await dp.eval(`(async () => { const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
      const ims = []; for (const s of [${sh.map((s) => b64(png(s.i, stop))).join(',')}]) ims.push(await load(s));
      const W = ims[0].width, H = ims[0].height, c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
      const px = ims.map((im) => { x.clearRect(0, 0, W, H); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H).data; });
      const dpr = ${dpr}, M = ${JSON.stringify(mask)}.map((q) => [q.l * dpr - 2, q.t * dpr - 2, q.r * dpr + 2, q.b * dpr + 2]), C = ${JSON.stringify(cards)}.map((q) => [q.l * dpr, q.t * dpr, q.r * dpr, q.b * dpr]);
      const inR = (q, a, b) => a >= q[0] && a <= q[2] && b >= q[1] && b <= q[3];
      const keep = new Uint8Array(W * H), inCard = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) { const a = p % W, b = (p / W) | 0; keep[p] = M.some((q) => inR(q, a, b)) ? 0 : 1; inCard[p] = C.some((q) => inR(q, a, b)) ? 1 : 0; }
      const lum = (P, p) => 0.299 * P[p * 4] + 0.587 * P[p * 4 + 1] + 0.114 * P[p * 4 + 2];
      const sharp = px.map((P) => { let s = 0, n = 0; for (let b = 1; b < H - 1; b++) for (let a = 1; a < W - 1; a++) { const p = b * W + a; if (!inCard[p]) continue;
        s += Math.abs(4 * lum(P, p) - lum(P, p - 1) - lum(P, p + 1) - lum(P, p - W) - lum(P, p + W)); n++; } return n ? +(s / n).toFixed(3) : null; });
      const pair = (P, Q) => { let n = 0, mx = 0; for (let p = 0, i = 0; p < W * H; p++, i += 4) { if (!keep[p]) continue; const d = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i+1] - Q[i+1]), Math.abs(P[i+2] - Q[i+2])); if (d > mx) mx = d; if (d > 8) n++; } return [n, mx]; };
      const cls = [], label = []; for (let k = 0; k < px.length; k++) { let found = -1; for (let j = 0; j < cls.length; j++) { const [n] = pair(px[cls[j]], px[k]); if (n === 0) { found = j; break; } } if (found < 0) { cls.push(k); found = cls.length - 1; } label.push(found); }
      const reps = cls.map((k, j) => cls.map((m) => pair(px[k], px[m])));
      return { sharp, label, reps, frame: W * H }; })()`);
    res[stop] = out;
    console.log(`CLASSES ${stop}: ` + sh.map((s, k) => `${s.i}${s.arm}=c${out.label[k]} (sharp ${out.sharp[k]})`).join('  '));
    console.log(`   class reps vs each other [n>8, max]: ${JSON.stringify(out.reps)} of ${out.frame} px`);
  }
  writeFileSync(join(outdir, 'loads.json'), JSON.stringify(res, null, 1));
  await dp.close();
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

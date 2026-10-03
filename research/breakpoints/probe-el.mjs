// What is drawn at one point of a frozen-frame diff, per arm (de-breakpoints, T-034). Functional, headless, shared lane.
// usage: node research/breakpoints/probe-el.mjs <config> <stop|y> <x,y> <settleMs> B=<url> S=<url>
// Walks to the stop like sweep.mjs, waits, then reports the element at (x,y) (CSS px): image source and decoded size,
// and every ancestor that can change how it rasterizes (transform, scale, will-change, filter, opacity < 1,
// content-visibility, running or paused animations).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cname, stopArg, ptArg, settleArg, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const CFG = CONFIGS[cname];
const [PX, PY] = ptArg.split(',').map(Number);
const SETTLE = Number(settleArg || 2000);
const STOPY = `(() => { const vh = innerHeight, at = (s, f = 0) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY + f * vh) : null; };
  return { top: 0, hero: at('.hero-track', 0.5), commission: at('.commission'), pain: at('.pain'), people: at('#people', 0.5), end: 1e9 }; })()`;
const PROBE = `(() => { const el = document.elementFromPoint(${PX}, ${PY}); if (!el) return null;
  const d = (t) => t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + [...t.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 3).map((c) => '.' + c).join('');
  const img = el.closest('img') || el.querySelector?.('img');
  const out = { el: d(el), img: img ? { src: (img.currentSrc || img.src).replace(/^https?:\\/\\/[^/]+/, '').slice(0, 90), nw: img.naturalWidth, nh: img.naturalHeight, w: img.width, h: img.height, decoding: img.decoding, loading: img.loading, complete: img.complete } : null, chain: [] };
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e);
    const an = e.getAnimations().map((a) => (a.animationName || a.transitionProperty || 'js') + ':' + a.playState);
    const f = { t: cs.transform !== 'none' ? cs.transform.slice(0, 60) : '', sc: cs.scale !== 'none' ? cs.scale : '', wc: cs.willChange !== 'auto' ? cs.willChange : '', fi: cs.filter !== 'none' ? cs.filter : '', op: cs.opacity !== '1' ? cs.opacity : '', cv: cs.contentVisibility !== 'visible' ? cs.contentVisibility : '', an: an.join(' '), scene: e.getAttribute('data-start-selling-scene') || '', fwwc: e.getAttribute('data-fw-wc') || '' };
    if (Object.values(f).some(Boolean)) out.chain.push(d(e) + ' ' + Object.entries(f).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join(' ')); }
  return out; })()`;
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-el');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const arm of Object.keys(URLS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch, ...(CFG.screenWidth ? { screenWidth: CFG.screenWidth, screenHeight: CFG.screenHeight } : {}) });
    if (CFG.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await gotoAndSettle(page, URLS[arm]); await sleep(2500);
    const stops = await page.eval(STOPY);
    const Y = Number.isFinite(Number(stopArg)) ? Number(stopArg) : stops[stopArg];
    await page.eval(`(async () => { for (let i = 0; i < 400; i++) { const t = Math.min(${Y}, document.documentElement.scrollHeight - innerHeight); if (Math.abs(scrollY - t) <= 1) break;
      const d = t - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(300, Math.abs(d)), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); } })()`);
    await sleep(SETTLE);
    const r = await page.eval(PROBE);
    console.log(`== ${arm} ${cname} y${Math.round(await page.eval('scrollY'))} at ${PX},${PY}: ${r && r.el}`);
    if (r) { console.log('   img ' + JSON.stringify(r.img)); for (const c of r.chain) console.log('   ' + c); }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

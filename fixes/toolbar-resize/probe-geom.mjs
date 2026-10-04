// toolbar-resize: where the viewport-sensitive boxes are (crossing table input). Headless Chrome 430x775 (the
// iPhone's scripted geometry), counts/positions only. Lists every sticky / fixed box (with its scroll range: the
// parent's document top..bottom), every size container (container-type), every content-visibility:auto box, every
// element with a scroll-driven animation, and the section tops.
// usage: node fixes/toolbar-resize/probe-geom.mjs <out.json> [--webkit] [--h 775] NAME=<url>
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
const args = process.argv.slice(2);
const OUT = args[0];
const has = (f) => args.includes(f);
const optv = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const URLS = Object.fromEntries(args.filter((a) => /^[A-Za-z0-9_-]+=/.test(a)).map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const H = Number(optv('--h', 775));
const GEOM = `(() => {
  const d = (t) => t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + [...t.classList].filter((c) => !c.startsWith('svelte-') && c.length < 40).slice(0, 3).map((c) => '.' + c).join('');
  const top = (e) => Math.round(e.getBoundingClientRect().top + scrollY), bot = (e) => Math.round(e.getBoundingClientRect().bottom + scrollY);
  const out = { sticky: [], fixed: [], containers: [], cv: [], scrollAnims: [], sections: [], docH: document.documentElement.scrollHeight, innerHeight };
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.position === 'sticky') out.sticky.push({ el: d(e), top: top(e), h: e.offsetHeight, range: e.parentElement ? [top(e.parentElement), bot(e.parentElement)] : null, desc: e.querySelectorAll('*').length });
    if (cs.position === 'fixed' && cs.display !== 'none') out.fixed.push({ el: d(e), h: e.offsetHeight, desc: e.querySelectorAll('*').length });
    if (cs.containerType && cs.containerType !== 'normal') out.containers.push({ el: d(e), type: cs.containerType, top: top(e), w: e.offsetWidth, h: e.offsetHeight, desc: e.querySelectorAll('*').length, display: cs.display });
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') out.cv.push({ el: d(e), cv: cs.contentVisibility, top: top(e), h: e.offsetHeight, desc: e.querySelectorAll('*').length });
    if (cs.animationTimeline && cs.animationTimeline !== 'auto') out.scrollAnims.push({ el: d(e), tl: cs.animationTimeline, top: top(e) });
  }
  for (const e of document.querySelectorAll('main > section, main > div, footer, .start-selling > *')) out.sections.push({ el: d(e), top: top(e), bottom: bot(e), desc: e.querySelectorAll('*').length });
  return out; })()`;
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'toolbar-resize-geom');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const result = { h: H, arms: {} };
try {
  for (const arm of Object.keys(URLS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (has('--webkit')) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.GestureEvent = function GestureEvent() {};' });
    await gotoAndSettle(page, URLS[arm]); await sleep(7000);
    const g = result.arms[arm] = await page.eval(GEOM);
    console.log(`== ${arm} @430x${H}: docH ${g.docH}`);
    for (const k of ['sections', 'sticky', 'fixed', 'containers', 'cv', 'scrollAnims']) { console.log(` ${k}:`); for (const r of g[k]) console.log('   ' + JSON.stringify(r)); }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));

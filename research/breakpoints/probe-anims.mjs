// Which animations/transitions run at a scroll stop, per arm (de-breakpoints). Functional, headless, shared lane.
// usage: node research/breakpoints/probe-anims.mjs <config> <y> <settleMs> B=<url> S=<url>   (config names as in sweep.mjs)
// Walks to y like sweep.mjs, then lists every animation whose target is in the viewport: name, playState, currentTime,
// duration, the target (tag#id.classes), and for transitions/animations of filter/opacity/transform the keyframe values;
// also samples the walk: every 100 ms step logs the running filter/opacity transitions (y, target, from -> to).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const [cname, yArg, settleArg, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const CFG = {
  c375: { width: 375, height: 812, dpr: 3, touch: true }, c430: { width: 430, height: 932, dpr: 3, touch: true },
  c600: { width: 600, height: 960, dpr: 1 }, c900: { width: 900, height: 900, dpr: 1 }, c1440: { width: 1440, height: 900, dpr: 1 },
  rm430: { width: 430, height: 932, dpr: 3, touch: true, reduce: true }, rm1440: { width: 1440, height: 900, dpr: 1, reduce: true },
}[cname];
const Y = Number(yArg), SETTLE = Number(settleArg || 1200);
const LIST = `(() => { const vh = innerHeight, vw = innerWidth, out = [];
  const d = (t) => !t ? '-' : (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + [...t.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 4).map((c) => '.' + c).join(''));
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (!t) continue; const r = t.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    let kf = ''; try { const k = a.effect.getKeyframes(); kf = k.map((f) => ['filter', 'opacity', 'transform', 'translate', 'scale'].filter((p) => f[p] != null).map((p) => p + '=' + String(f[p]).slice(0, 40)).join(' ')).join(' -> '); } catch (e) {}
    const tm = a.effect.getComputedTiming();
    out.push({ n: a.animationName || (a.transitionProperty ? 'T:' + a.transitionProperty : 'js'), ps: a.playState, ct: Math.round(Number(a.currentTime) || 0), dur: Math.round(Number(tm.duration) || 0), pr: tm.progress == null ? null : Number(tm.progress.toFixed(3)), tgt: d(t) + (a.effect.pseudoElement || ''), kf }); }
  return out; })()`;
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-probe');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const arm of Object.keys(URLS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch });
    if (CFG.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await gotoAndSettle(page, URLS[arm]); await sleep(2500);
    const log = await page.eval(`(async () => { const log = []; for (let i = 0; i < 400; i++) { const max = document.documentElement.scrollHeight - innerHeight; const t = Math.min(${Y}, max);
      if (Math.abs(scrollY - t) <= 1) break; const d = t - scrollY; window.scrollBy({ top: Math.sign(d) * Math.min(300, Math.abs(d)), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100));
      const l = ${LIST}.filter((a) => a.ps === 'running' && /filter|opacity/.test(a.n + a.kf)); if (l.length) log.push({ y: Math.round(scrollY), l: l.map((a) => a.n + ' ' + a.tgt + ' ' + a.kf + ' p' + a.pr) }); }
      return log; })()`);
    await sleep(SETTLE);
    const list = await page.eval(LIST);
    const st = await page.eval(`(() => { const e = document.querySelector('#profile-showcase'); const out = {}; for (const s of ['#profile-showcase', '#people', '.pain', '.start-selling-future-card']) { const el = document.querySelector(s); if (el) { const cs = getComputedStyle(el); out[s] = { f: cs.filter, o: cs.opacity, wc: cs.willChange, t: cs.transform.slice(0, 60) }; } } return out; })()`);
    console.log(`== ${arm} ${cname} y${Y} settle ${SETTLE}`);
    for (const e of log) console.log(`  walk y${e.y}: ${e.l.join(' | ')}`);
    for (const a of list) console.log(`  ${a.ps.padEnd(8)} ${a.n} ct${a.ct}/${a.dur} p${a.pr} ${a.tgt} ${a.kf}`);
    console.log('  styles ' + JSON.stringify(st));
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

// P-143 pixels, Chrome (headless): T0 parity of arm A3 (and A4) against the base, in place. Per width config and
// position (top, enter, inview, leave; each at rest and at the end of a 10-frame scripted step, 'swipe'): every Web
// Animation paused, then shots base -> arm -> base2 with the arm's <style> toggled between them (2 rAF after each
// toggle). A pair is valid when base2 equals base; else the triple is shot once more; still unequal = UNSTABLE.
// Mask: the hero clock's rect only (+4 CSS px). T0 = 0 differing pixels. Geometry is read at each shot too.
// usage: node fixes/deck-contain/px-chrome.mjs <out.json> <base url> [--arms A3,A4] [--only cfg,...]
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ARM, GEO } from './geo.mjs';
import { pxDiff, FREEZE, UNFREEZE, CLOCK, POS, STEP_TO, RAF2 } from './px.mjs';
const [OUT, URL0] = process.argv.slice(2);
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ARMS = (opt('--arms') || 'A3').split(','), ONLY = opt('--only')?.split(',');
const HERE = dirname(new URL(import.meta.url).pathname);
const FILES = { A3: 'a3-pad.css', A4: 'a4-cq.css' };
const PX_CFG = [
  ['m430x775', 430, 775, 'mob'], ['m430x815', 430, 815, 'mob'], ['m430x932', 430, 932, 'mob'], ['m390x844', 390, 844, 'mob'],
  ['m375x667', 375, 667, 'mob'], ['m360x780', 360, 780, 'mob'], ['m640x900', 640, 900, 'mob'], ['m641x900', 641, 900, 'mob'],
  ['t768x1024', 768, 1024, 'mob'], ['t1024x1366', 1024, 1366, 'mob'], ['t1200x900', 1200, 900, 'mob'],
  ['d860x900', 860, 900, 'desk'], ['d1440x900', 1440, 900, 'desk'], ['m430x775-rm', 430, 775, 'mob', 'rm'],
];
const CFG = PX_CFG.filter((c) => !ONLY || ONLY.includes(c[0]));
const metrics = (w, h, kind) => kind === 'mob'
  ? { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: w, screenHeight: Math.max(h, 932) }
  : { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: Math.max(w, 1440), screenHeight: Math.max(h, 900) };
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-px');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { tool: 'deck-contain px-chrome', url: URL0, arms: ARMS, startedAt: new Date().toISOString(), pairs: [] };
const shot = async (page) => Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
try {
  for (const [name, w, h, kind, rm] of CFG) {
    const page = await cdp.newIsolatedPage();
    try {
      if (ch.userAgent && kind === 'mob') await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', metrics(w, h, kind));
      if (kind === 'mob') await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (rm) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await gotoAndSettle(page, URL0); await sleep(2500);
      const dpr = kind === 'mob' ? 3 : 1;
      const pos = await page.eval(POS);
      for (const [pk, y] of Object.entries(pos)) for (const mode of ['rest', 'swipe']) for (const arm of ARMS) {
        const css = readFileSync(join(HERE, 'arms', FILES[arm]), 'utf8');
        let pair = null;
        for (let attempt = 1; attempt <= 2 && (!pair || pair.state === 'UNSTABLE'); attempt++) {
          await page.eval(UNFREEZE);
          if (mode === 'rest') { await page.eval(`scrollTo({ top: ${y}, behavior: 'instant' })`); await sleep(700); } else await page.eval(STEP_TO(y));
          const frozen = await page.eval(FREEZE); await page.eval(RAF2);
          const clock = await page.eval(CLOCK); const masks = clock ? [clock.map((v) => Math.round(v * dpr))] : [];
          const g0 = await page.eval(GEO); const b = await shot(page);
          await page.eval(ARM(css, arm)); await page.eval(RAF2); await sleep(50);
          const g1 = await page.eval(GEO); const a = await shot(page);
          await page.eval(ARM(null)); await page.eval(RAF2); await sleep(50);
          const b2 = await shot(page);
          const aa = pxDiff(b, b2, masks), ab = pxDiff(b, a, masks);
          pair = { cfg: name, pos: pk, mode, arm, attempt, y: g0.sy, frozen, masks, aa, ab, deckH: [g0.deck.h, g1.deck.h], docH: [g0.docH, g1.docH],
            state: aa.diffPixels ? 'UNSTABLE' : ab.diffPixels ? 'FAIL' : 'T0' };
        }
        res.pairs.push(pair);
        console.log(`${name.padEnd(12)} ${pk.padEnd(6)} ${mode.padEnd(5)} ${arm} ${pair.state.padEnd(8)} y ${pair.y} A/A ${pair.aa.diffPixels} arm ${pair.ab.diffPixels}${pair.ab.bbox ? ' bbox ' + pair.ab.bbox.join(',') : ''} max ${pair.ab.maxChannelDelta} masked ${pair.ab.maskedPixels} deckH ${pair.deckH.join('/')} (try ${pair.attempt})`);
      }
    } catch (e) { res.pairs.push({ cfg: name, error: String(e.message || e) }); console.log(name, 'ERROR', e.message || e); }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
const by = (s) => res.pairs.filter((p) => p.state === s).length;
res.summary = { pairs: res.pairs.length, T0: by('T0'), FAIL: by('FAIL'), UNSTABLE: by('UNSTABLE'), ERROR: res.pairs.filter((p) => p.error).length };
console.log('SUMMARY', JSON.stringify(res.summary));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

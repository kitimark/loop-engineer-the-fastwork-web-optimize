// deck-contain step 2 (lead's brief): the profile deck's height on the base at each listed width, on resize and on a
// viewport-height step (Chrome's model of the toolbar collapse), and the same reads with each arm's CSS put in the
// page. Headless Chrome, geometry only (no timing, no counts): a design input, run in a shared slot (weight probe).
// usage: node fixes/deck-contain/probe-chrome.mjs <out.json> <base url> [--only n1,n2]
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { GEO, ARM, TO_DECK, geoDiff } from './geo.mjs';
const [OUT, URL0] = process.argv.slice(2);
if (!OUT || !URL0) throw new Error('usage: probe-chrome.mjs <out.json> <base url> [--only a,b]');
const oi = process.argv.indexOf('--only'); const ONLY = oi > 0 ? process.argv[oi + 1].split(',') : null;
const HERE = dirname(new URL(import.meta.url).pathname);
const ARMS = { A: 'a-size-layout.css', A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css' };
const CSS = Object.fromEntries(Object.entries(ARMS).map(([k, f]) => [k, readFileSync(join(HERE, 'arms', f), 'utf8')]));
// mob: Chrome mobile emulation with touch (DPR 3, phone screen); desk: plain desktop (DPR 1, no touch)
const CFG = [
  ['m430x775', 430, 775, 'mob'], ['m430x815', 430, 815, 'mob'], ['m430x932', 430, 932, 'mob'], ['m390x844', 390, 844, 'mob'],
  ['m375x667', 375, 667, 'mob'], ['m360x780', 360, 780, 'mob'], ['m640x900', 640, 900, 'mob'], ['m641x900', 641, 900, 'mob'],
  ['t768x1024', 768, 1024, 'mob'], ['t1024x1366', 1024, 1366, 'mob'], ['t1200x900', 1200, 900, 'mob'], ['t1201x900', 1201, 900, 'mob'],
  ['d860x900', 860, 900, 'desk'], ['d861x900', 861, 900, 'desk'], ['d1440x900', 1440, 900, 'desk'],
  ['m430x775-rm', 430, 775, 'mob', 'rm'], ['d1440x900-rm', 1440, 900, 'desk', 'rm'],
].filter((c) => !ONLY || ONLY.includes(c[0]));
const metrics = (w, h, kind) => kind === 'mob'
  ? { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: w, screenHeight: Math.max(h, 932) }
  : { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: Math.max(w, 1440), screenHeight: Math.max(h, 900) };
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-geo');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { tool: 'deck-contain probe-chrome', url: URL0, startedAt: new Date().toISOString(), configs: {} };
// one rAF-stepped scroll through the deck band: the deck's height on every frame (min/max), base or arm
const SWEEP = `(async () => { const d = document.querySelector('.start-selling-profile-deck'); const y0 = d.getBoundingClientRect().top + scrollY;
  const from = Math.max(0, y0 - innerHeight), to = y0 + d.offsetHeight; const hs = [];
  for (let y = from; y <= to; y += 20) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(r)); hs.push(d.getBoundingClientRect().height); }
  return { frames: hs.length, min: Math.min(...hs), max: Math.max(...hs) }; })()`;
const page2 = async (kind, w, h, rm) => {
  const page = await cdp.newIsolatedPage();
  if (ch.userAgent && kind === 'mob') await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
  await page.send('Emulation.setDeviceMetricsOverride', metrics(w, h, kind));
  if (kind === 'mob') await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (rm) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return page;
};
try {
  for (const [name, w, h, kind, rm] of CFG) {
    const page = await page2(kind, w, h, rm);
    const c = res.configs[name] = { w, h, kind, rm: !!rm, reads: {}, diffs: {} };
    try {
      await gotoAndSettle(page, URL0); await sleep(2500);
      await page.eval(TO_DECK()); await sleep(600);
      c.reads.base = await page.eval(GEO);
      for (const k of Object.keys(CSS)) { await page.eval(ARM(CSS[k], k)); await sleep(250); c.reads[k] = await page.eval(GEO); c.diffs[k] = geoDiff(c.reads.base, c.reads[k]); }
      await page.eval(ARM(null)); await sleep(250);
      c.reads.base2 = await page.eval(GEO); c.diffs.base2 = geoDiff(c.reads.base, c.reads.base2);
      // the deck's height while the page scrolls through it (base, then A)
      c.sweep = { base: await page.eval(SWEEP) };
      await page.eval(ARM(CSS.A3, 'A3')); await sleep(250); c.sweep.A3 = await page.eval(SWEEP); await page.eval(ARM(null));
      // resize and viewport-height steps on the same page (from the 430x775 page only)
      if (name === 'm430x775') {
        c.resize = [];
        for (const [rw, rh] of [[430, 815], [430, 932], [390, 844], [375, 667], [430, 775]]) {
          await page.send('Emulation.setDeviceMetricsOverride', metrics(rw, rh, 'mob')); await sleep(700);
          await page.eval(TO_DECK()); await sleep(300);
          const base = await page.eval(GEO); await page.eval(ARM(CSS.A3, 'A3')); await sleep(250); const A = await page.eval(GEO); await page.eval(ARM(null));
          c.resize.push({ to: `${rw}x${rh}`, base, A, diffA: geoDiff(base, A) });
        }
      }
      const b = c.reads.base;
      console.log(`${name.padEnd(13)} mq ${JSON.stringify(b.mq)} deck ${b.deck.w}x${b.deck.h} parentW ${b.parentW} predH ${b.predH} shellW ${b.shellW} shellMaxH ${b.shellMaxH} docH ${b.docH}`
        + ' | ' + Object.keys(CSS).map((k) => `${k} h ${c.reads[k].deck.h} diffs ${c.diffs[k].filter((x) => !/^(deck\.y|sec\.y|shell\d\.ol)/.test(x)).length}`).join(' | ') + ` | base2 ${c.diffs.base2.length}`
        + ` | sweep base ${c.sweep.base.min}-${c.sweep.base.max} A3 ${c.sweep.A3.min}-${c.sweep.A3.max}`);
      for (const k of [...Object.keys(CSS), 'base2']) if (c.diffs[k].length) console.log(`   diff ${k}: ${c.diffs[k].slice(0, 12).join('; ')}`);
      for (const r of c.resize || []) console.log(`   resize -> ${r.to}: base deck ${r.base.deck.w}x${r.base.deck.h} (pred ${r.base.predH}) A3 ${r.A.deck.w}x${r.A.deck.h} diffs ${r.diffA.length}${r.diffA.length ? ' ' + r.diffA.slice(0, 8).join('; ') : ''}`);
    } catch (e) { c.error = String(e.message || e); console.log(name, 'ERROR', c.error); }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

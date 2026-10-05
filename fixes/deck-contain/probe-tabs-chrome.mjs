// deck-contain: tabs.mjs's behaviour check in headless Chrome (430x775 and 430x932 mobile + touch), base then each
// arm's CSS put in the same page, then the base again (A/A). Functional, no timing; shared slot (weight probe).
// usage: node fixes/deck-contain/probe-tabs-chrome.mjs <out.json> <base url>
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ARM, TO_DECK } from './geo.mjs';
import { TABS } from './tabs.mjs';
const [OUT, URL0] = process.argv.slice(2);
const HERE = dirname(new URL(import.meta.url).pathname);
const CSS = { A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css' };
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-tabs');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { tool: 'deck-contain probe-tabs-chrome', url: URL0, startedAt: new Date().toISOString(), runs: {} };
try {
  for (const h of [775, 932]) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, URL0); await sleep(2500);
    for (const arm of ['base', 'A3', 'A4', 'R3', 'base2']) {
      await page.eval(ARM(CSS[arm] ? readFileSync(join(HERE, 'arms', CSS[arm]), 'utf8') : null, arm)); await sleep(300);
      await page.eval(TO_DECK()); await sleep(600);
      const r = res.runs[`430x${h}-${arm}`] = await page.eval(TABS);
      console.log(`430x${h} ${arm.padEnd(5)} offsetParent ${r.offsetParent} ol ${r.ol.join(',')}`);
      for (const c of r.cases) console.log(`   k ${c.k} -> tab ${c.j}: before sl ${c.before.sl} act ${c.before.act} | after sl ${c.after.sl} act ${c.after.act} tab ${c.after.tab}`);
    }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

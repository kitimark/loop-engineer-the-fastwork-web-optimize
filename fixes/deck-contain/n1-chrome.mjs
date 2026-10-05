// deck-contain P-143 rev 1.1 (N1, P15/P16): the pinned behaviour checks in headless Chrome, 430xH mobile + touch, DPR 3.
// In one page: base, each arm's CSS, base again (A/A). Per arm: tabs.mjs (resting states after tab clicks, P15) and
// sweep.mjs (the active shell/tab switch points while the deck's scrollLeft is stepped, P16). Functional, no timing;
// one shared probe slot per viewport height (each about 3 min).
// usage: node fixes/deck-contain/n1-chrome.mjs <out.json> <base url> --h 775|932 [--arms A3,A4,R3]
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ARM, TO_DECK } from './geo.mjs';
import { TABS } from './tabs.mjs';
import { SWEEP, sweepDiff } from './sweep.mjs';
const [OUT, URL0] = process.argv.slice(2);
const optv = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const H = Number(optv('--h') || 775);
const FILES = { A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css' };
const ARMS = optv('--arms')?.split(',') || Object.keys(FILES);
if (!OUT || !URL0 || ARMS.some((a) => !FILES[a])) throw new Error('usage: n1-chrome.mjs <out.json> <base url> --h 775|932 [--arms A3,A4,R3]');
const HERE = dirname(new URL(import.meta.url).pathname);
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-n1');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { tool: 'deck-contain n1-chrome', url: URL0, h: H, startedAt: new Date().toISOString(), tabs: {}, sweep: {} };
try {
  const page = await cdp.newIsolatedPage();
  if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: H, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await gotoAndSettle(page, URL0); await sleep(2500);
  for (const arm of ['base', ...ARMS, 'base2']) {
    await page.eval(ARM(FILES[arm] ? readFileSync(join(HERE, 'arms', FILES[arm]), 'utf8') : null, arm)); await sleep(300);
    await page.eval(TO_DECK()); await sleep(600);
    const t = res.tabs[arm] = await page.eval(TABS);
    console.log(`TABS ${arm.padEnd(5)} offsetParent ${t.offsetParent} ol ${t.ol.join(',')}`);
    for (const c of t.cases) console.log(`   k ${c.k} -> tab ${c.j}: before sl ${c.before.sl} act ${c.before.act} | after sl ${c.after.sl} act ${c.after.act} tab ${c.after.tab}`);
    await page.eval(TO_DECK()); await sleep(400);
    const w = res.sweep[arm] = await page.eval(SWEEP());
    const dd = arm === 'base' ? null : sweepDiff(res.sweep.base, w);
    if (dd) w.vsBase = dd;
    console.log(`SWEEP ${arm.padEnd(5)} shell ${w.shellSw.map((x) => x.sl).join(',')} tab ${w.tabSw.map((x) => x.sl).join(',')}${dd ? ` | vs base shellEqual ${dd.shellEqual} tabEqual ${dd.tabEqual} shift ${dd.shellShift}` : ''}`);
  }
  await page.close();
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT);

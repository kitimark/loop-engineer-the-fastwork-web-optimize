// P-148 pixels, Chrome (headless): instrument A/A gate (null arm N0) and R3, one registered group per shared slot.
// Per config (P-146's set) and position (top, enter, inview, leave) x mode (rest, swipe): two triples, N0 and R3, in
// the order armOrder(position index); each triple is px148-run.mjs's procedure under the motion hold. The page is the
// instrument overlay (fixes/deck-contain--px148, built by mk-px148-overlay.mjs), served by
// `node tools/fix.mjs serve deck-contain--px148 -- --vendors=local --https`.
// The budget guard starts a config only when it fits (px148.mjs budgetSkip); the output file is written once, at the
// end, with complete: true, so a killed slot leaves no file.
// usage: node fixes/deck-contain/px148-chrome.mjs <out.json> <url> --group C1 [--only cfg,...]
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { CHROME_CFG, GROUPS, POSITIONS, MODES, armOrder, budgetSkip } from './px148.mjs';
import { triple, POS, GATE } from './px148-run.mjs';
import { build } from './mk-px148-overlay.mjs';
const [OUT, URL0] = process.argv.slice(2);
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const GROUP = opt('--group'), ONLY = opt('--only')?.split(',');
if (!OUT || !URL0 || !GROUPS[GROUP] || GROUP[0] !== 'C') { console.error('usage: px148-chrome.mjs <out.json> <url> --group C1..C6 [--only cfg,...]'); process.exit(2); }
const HERE = dirname(new URL(import.meta.url).pathname);
const CSS = { N0: '/* P-148 null arm: an empty style element, toggled like an arm */', R3: readFileSync(join(HERE, 'arms', 'r3-pad-only.css'), 'utf8') };
const CFG = CHROME_CFG.filter((c) => GROUPS[GROUP].includes(c[0]) && (!ONLY || ONLY.includes(c[0])));
const metrics = (w, h, kind) => kind === 'mob'
  ? { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenWidth: w, screenHeight: Math.max(h, 932) }
  : { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: Math.max(w, 1440), screenHeight: Math.max(h, 900) };
const FAILDIR = join(dirname(OUT), 'px148-shots'); mkdirSync(FAILDIR, { recursive: true });
const res = { tool: 'deck-contain px148-chrome', group: GROUP, url: URL0, overlay: build({ check: true }), startedAt: new Date().toISOString(), configs: {}, notRun: [], triples: [] };
const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-px148');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const t0 = Date.now();
try {
  for (const [name, w, h, kind, rm] of CFG) {
    const skip = budgetSkip((Date.now() - t0) / 1000, name);
    if (skip) { res.notRun.push({ cfg: name, reason: skip }); console.log(name, 'NOT RUN', skip); continue; }
    const c0 = Date.now(), page = await cdp.newIsolatedPage();
    try {
      if (ch.userAgent && kind === 'mob') await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', metrics(w, h, kind));
      if (kind === 'mob') await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      if (rm) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await gotoAndSettle(page, URL0); await sleep(2500);
      const gate = await page.eval(GATE);
      if (gate !== 'px148-gate v1') throw new Error(`motion hold not loaded (${gate})`);
      const dpr = kind === 'mob' ? 3 : 1;
      const io = { ev: (e) => page.eval(e), shot: async () => Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
        sleep, cal: { scale: dpr, ox: 0, oy: 0 }, dpr, extraMasks: [], armWait: 50,
        save: (tag, s) => { for (const [k, b] of Object.entries(s)) writeFileSync(join(FAILDIR, `${tag}-${k}.png`), b); } };
      const pos = await page.eval(POS);
      for (const [pi, pk] of POSITIONS.entries()) for (const mode of MODES) for (const arm of armOrder(pi)) {
        const r = await triple(io, { cfg: name, pos: pk, y: pos[pk], mode, arm, css: CSS[arm] });
        res.triples.push(r);
        const j = r.judge;
        console.log(`${name.padEnd(12)} ${pk.padEnd(6)} ${mode.padEnd(5)} ${arm} ${j.tier} settled ${r.settled ? 'y' : 'N'}(${r.settleShots}) aaAny ${j.aaAny} aa8 ${j.aa8} ab ${j.abAny} beyond ${j.beyond} shade ${j.largestShade} outF ${j.beyondOutsideF} geo ${r.geoArm.length}/${r.geoAA.length} held arm ${r.stat.arm.raf + r.stat.arm.timeout} back ${r.stat.back.raf + r.stat.back.timeout}${r.maskDropped.length ? ' DROPPED ' + r.maskDropped.join(',') : ''}`);
      }
      res.configs[name] = { gate, seconds: +((Date.now() - c0) / 1000).toFixed(1) };
    } catch (e) { res.configs[name] = { error: String(e.message || e) }; console.log(name, 'ERROR', e.message || e); }
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
res.endedAt = new Date().toISOString(); res.seconds = +((Date.now() - t0) / 1000).toFixed(1); res.complete = true;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT, 'triples', res.triples.length, 'notRun', res.notRun.length, 'seconds', res.seconds);

// P-149 pixels, Chrome (headless), one registered part per shared slot.
// Part L (locator): the 2x2 at 430x932, DPR {3,1} x mobile emulation {on,off} (px149.mjs CELLS), rest only, 4 positions,
//   A/A only: each stop gives 3 fresh N0 pairs (px149-run.mjs). No R3 style is ever applied in part L.
// Part R: R3 in the stable cells only (px149.mjs rPlan over part L's stable cells, read from --from <L file(s)>):
//   primary cell (4 positions x rest/swipe), reduced motion in the primary cell (rest), second stable cell.
//   No stable cell: the driver writes a file with configs: {} and reason, and opens no page.
// The page is the P-148 instrument overlay (fixes/deck-contain--px148, unchanged, hashes re-checked and recorded), served by
// `node tools/fix.mjs serve deck-contain--px148 -- --vendors=local --https`. Budget guard and write-once as P-148.
// usage: node fixes/deck-contain/px149-chrome.mjs <out.json> <url> --part L|R [--from L.json[,Lb.json]] [--only cfg,...]
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { CELLS, W, H, POSITIONS, stableCells, rPlan, budgetSkip } from './px149.mjs';
import { stop, line } from './px149-run.mjs';
import { POS, GATE } from './px148-run.mjs';
import { build } from './mk-px148-overlay.mjs';
const [OUT, URL0] = process.argv.slice(2);
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PART = opt('--part'), ONLY = opt('--only')?.split(','), FROM = opt('--from')?.split(',');
if (!OUT || !URL0 || !['L', 'R'].includes(PART) || (PART === 'R' && !FROM)) { console.error('usage: px149-chrome.mjs <out.json> <url> --part L|R [--from L.json] [--only cfg,...]'); process.exit(2); }
const HERE = dirname(new URL(import.meta.url).pathname);
const R3 = { name: 'R3', css: readFileSync(join(HERE, 'arms', 'r3-pad-only.css'), 'utf8') };
const metrics = (dpr, kind) => kind === 'mob'
  ? { width: W, height: H, deviceScaleFactor: dpr, mobile: true, screenWidth: W, screenHeight: H }
  : { width: W, height: H, deviceScaleFactor: dpr, mobile: false, screenWidth: 1440, screenHeight: 900 };
let plan, stableFrom = null;
if (PART === 'L') plan = CELLS.map((c) => ({ cfg: `L-${c.cell}`, cell: c.cell, dpr: c.dpr, kind: c.kind, modes: ['rest'], arm: null }));
else {
  // part L's stops from every complete L file given (rule 1b: a config with an error does not count)
  const stops = FROM.flatMap((f) => { const j = JSON.parse(readFileSync(f, 'utf8')); return j.complete ? j.stops.filter((s) => !j.configs?.[s.cfg]?.error) : []; });
  stableFrom = stableCells(stops);
  plan = rPlan(stableFrom).map((c) => ({ ...c, arm: R3 }));
}
plan = plan.filter((c) => !ONLY || ONLY.includes(c.cfg));
const FAILDIR = join(dirname(OUT), 'px149-shots'); mkdirSync(FAILDIR, { recursive: true });
const res = { tool: 'deck-contain px149-chrome', part: PART, url: URL0, overlay: build({ check: true }), startedAt: new Date().toISOString(),
  ...(PART === 'R' ? { from: FROM, stableCells: stableFrom, plan: plan.map((c) => c.cfg) } : {}), configs: {}, notRun: [], stops: [] };
const t0 = Date.now();
if (!plan.length) res.reason = PART === 'R' ? 'no stable cell in part L: R3 is not judged in Chrome' : 'empty plan';
else {
  const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'deck-contain-px149');
  const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
  const cdp = await CDP.connect(ch.wsUrl);
  try {
    for (const c of plan) {
      const skip = budgetSkip((Date.now() - t0) / 1000, c.cfg);
      if (skip) { res.notRun.push({ cfg: c.cfg, reason: skip }); console.log(c.cfg, 'NOT RUN', skip); continue; }
      const c0 = Date.now(), page = await cdp.newIsolatedPage();
      try {
        if (ch.userAgent && c.kind === 'mob') await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
        await page.send('Emulation.setDeviceMetricsOverride', metrics(c.dpr, c.kind));
        if (c.kind === 'mob') await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        if (c.rm) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await gotoAndSettle(page, URL0); await sleep(2500);
        const gate = await page.eval(GATE);
        if (gate !== 'px148-gate v1') throw new Error(`motion hold not loaded (${gate})`);
        const env = await page.eval('({ dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight, touch: matchMedia("(hover: none) and (pointer: coarse)").matches, rm: matchMedia("(prefers-reduced-motion: reduce)").matches })');
        const io = { ev: (e) => page.eval(e), shot: async () => Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
          sleep, cal: { scale: c.dpr, ox: 0, oy: 0 }, dpr: c.dpr, extraMasks: [], armWait: 50,
          save: (tag, s) => { for (const [k, b] of Object.entries(s)) writeFileSync(join(FAILDIR, `${tag}-${k}.png`), b); } };
        const pos = await page.eval(POS);
        for (const pk of POSITIONS) for (const mode of c.modes) {
          const r = await stop(io, { cfg: c.cfg, pos: pk, y: pos[pk], mode, arm: c.arm });
          res.stops.push(r); console.log(line(r));
        }
        res.configs[c.cfg] = { cell: c.cell, dpr: c.dpr, kind: c.kind, rm: !!c.rm, role: c.role ?? 'locator', gate, page: env, seconds: +((Date.now() - c0) / 1000).toFixed(1) };
      } catch (e) { res.configs[c.cfg] = { error: String(e.message || e) }; console.log(c.cfg, 'ERROR', e.message || e); }
      await page.close();
    }
  } finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
}
res.endedAt = new Date().toISOString(); res.seconds = +((Date.now() - t0) / 1000).toFixed(1); res.complete = true;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('WROTE', OUT, 'stops', res.stops.length, 'notRun', res.notRun.length, 'seconds', res.seconds, res.reason ?? '');

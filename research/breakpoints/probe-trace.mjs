// rm1440 cause (de-breakpoints, T-034 §3.2.2): a Chrome trace with the image-decode categories over the load of each arm,
// cold (the server's first response) and fast (a reload), to see at what size / scale / filter quality the hero photos
// are decoded. Functional, headless, shared lane (no timing; the trace durations are not used).
// usage: [ORDER=B,B,S,S] [TRACED=1,3] [CATS=layers] node research/breakpoints/probe-trace.mjs <config> <outdir> B=<url> S=<url>
// Writes <outdir>/trace-<i>-<arm>.json (raw events, gitignored) and a frozen top shot per load (png/<i>-<arm>-top.png).
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cname, outdir, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const ORDER = (process.env.ORDER || 'B,B,S,S').split(',');
const TRACED = process.env.TRACED ? process.env.TRACED.split(',').map(Number) : null; // load indices to trace (default all)
const CFG = CONFIGS[cname];
// CATS=layers: layer snapshots (PictureLayerImpl raster scales) + a detailed memory-infra dump (decoded image sizes)
const CATS = process.env.CATS === 'layers' ? ['cc', 'disabled-by-default-cc.debug', 'disabled-by-default-devtools.timeline.layers', 'disabled-by-default-devtools.timeline.picture',
  'disabled-by-default-viz.quads', 'disabled-by-default-cc.debug.quads', 'disabled-by-default-memory-infra'] : ['cc', 'disabled-by-default-cc.debug', 'disabled-by-default-cc.debug.scheduler', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'blink', 'blink.image_decoding', 'disabled-by-default-skia', 'gpu', 'viz', 'loading'];
mkdirSync(join(outdir, 'png'), { recursive: true });
const sharpOf = `(() => { const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  return { cards: [...document.querySelectorAll('.orbit-card')].map((e) => { const r = e.getBoundingClientRect(), im = e.querySelector('img');
    return { ...R(r), src: im ? (im.currentSrc || im.src).replace(/^https?:\\/\\/[^/]+/, '') : null, nw: im?.naturalWidth, w: im?.width, h: im?.height, t: getComputedStyle(e).transform, sc: getComputedStyle(e).scale, fit: getComputedStyle(e).getPropertyValue('--orbit-fit-scale').trim() }; }) }; })()`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-trace');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (let i = 0; i < ORDER.length; i++) {
    const arm = ORDER[i];
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const events = [];
    page.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
    const tr = !TRACED || TRACED.includes(i);
    const done = tr ? page.waitFor((m) => m.method === 'Tracing.tracingComplete', 90000) : null;
    if (tr) await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', includedCategories: CATS, ...(process.env.CATS === 'layers' ? { memoryDumpConfig: { triggers: [] } } : {}) }, transferMode: 'ReportEvents' });
    await gotoAndSettle(page, URLS[arm]); await sleep(2500);
    const info = await page.eval(sharpOf);
    let dump = null;
    if (tr && process.env.CATS === 'layers') dump = await page.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' }).catch((e) => ({ error: String(e) }));
    if (tr) { await page.send('Tracing.end'); await done; writeFileSync(join(outdir, `trace-${i}-${arm}.json`), JSON.stringify({ arm, i, info, dump, events })); }
    await page.eval(`(async () => { for (const a of document.getAnimations()) { if (a.playState === 'running') { try { a.pause(); a.currentTime = 1000; } catch (e) {} } } await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outdir, 'png', `${i}-${arm}-top.png`), Buffer.from(data, 'base64'));
    console.log(`TRACE ${i} ${arm} ${tr ? events.length : 'untraced'} events; dump ${JSON.stringify(dump)}; card0 ${JSON.stringify(info.cards[0])}`);
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

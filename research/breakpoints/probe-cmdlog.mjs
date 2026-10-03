// rm1440 cause (de-breakpoints, T-034 §3.2.2): the Skia command log of every painted layer after the load
// (CDP LayerTree.makeSnapshot + snapshotCommandLog), to read the sampling / filter quality that Blink recorded for
// each hero photo, cold vs fast, B vs S. Functional, headless, shared lane (nothing timed).
// usage: [ORDER=B,B,S,S] node research/breakpoints/probe-cmdlog.mjs <config> <outdir> B=<url> S=<url>
// Writes <outdir>/cmdlog-<i>-<arm>.json (image draw commands per layer, gitignored) and png/<i>-<arm>-top.png.
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGS } from './configs.mjs';

const [cname, outdir, ...targets] = process.argv.slice(2);
const URLS = Object.fromEntries(targets.map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
const ORDER = (process.env.ORDER || 'B,B,S,S').split(',');
const CFG = CONFIGS[cname];
mkdirSync(join(outdir, 'png'), { recursive: true });
const cardsOf = `[...document.querySelectorAll('.orbit-card')].map((e) => { const r = e.getBoundingClientRect(), im = e.querySelector('img');
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, src: im ? (im.currentSrc || im.src).replace(/^https?:\\/\\/[^/]+/, '') : null, nw: im?.naturalWidth, w: im?.width, h: im?.height }; })`;

const prof = tempProfileDir(join(process.cwd(), 'out', 'chrome-fn'), 'de-breakpoints-cmdlog');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1200', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (let i = 0; i < ORDER.length; i++) {
    const arm = ORDER[i];
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: CFG.width, height: CFG.height, deviceScaleFactor: CFG.dpr, mobile: !!CFG.touch });
    if (CFG.reduce) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    let layers = null;
    page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) layers = m.params.layers; });
    await gotoAndSettle(page, URLS[arm]); await sleep(2500);
    const cards = await page.eval(cardsOf);
    await page.send('LayerTree.enable');
    await sleep(800);
    const out = [];
    for (const L of (layers || []).filter((x) => x.drawsContent && x.width > 0 && x.height > 0)) {
      try {
        const { snapshotId } = await page.send('LayerTree.makeSnapshot', { layerId: L.layerId });
        const { commandLog } = await page.send('LayerTree.snapshotCommandLog', { snapshotId });
        await page.send('LayerTree.releaseSnapshot', { snapshotId }).catch(() => {});
        const img = commandLog.filter((c) => /image/i.test(c.method || c.command || JSON.stringify(c).slice(0, 80)));
        out.push({ layerId: L.layerId, name: L.name || '', x: L.offsetX, y: L.offsetY, w: L.width, h: L.height, transform: L.transform || null, nCmds: commandLog.length, images: img });
      } catch (e) { out.push({ layerId: L.layerId, error: String(e).slice(0, 200) }); }
    }
    await page.send('LayerTree.disable').catch(() => {});
    writeFileSync(join(outdir, `cmdlog-${i}-${arm}.json`), JSON.stringify({ arm, i, cards, layers: out }));
    await page.eval(`(async () => { for (const a of document.getAnimations()) { if (a.playState === 'running') { try { a.pause(); a.currentTime = 1000; } catch (e) {} } } await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outdir, 'png', `${i}-${arm}-top.png`), Buffer.from(data, 'base64'));
    const nImg = out.reduce((s, l) => s + (l.images?.length || 0), 0);
    console.log(`CMDLOG ${i} ${arm} layers ${out.length} image cmds ${nImg} e.g. ${JSON.stringify(out.find((l) => l.images?.length)?.images[0] || null).slice(0, 400)}`);
    await page.close();
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }

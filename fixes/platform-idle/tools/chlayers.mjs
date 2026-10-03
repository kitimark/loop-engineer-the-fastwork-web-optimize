// platform-idle Chrome LayerTree read (review item 2; headless, functional, counts only, no timing).
// Per arm: 430x932 DPR 3 mobile+touch, load, park at Y (default 5346, the pin), settle 3 s, take the last
// LayerTree.layerTreeDidChange snapshot. Counts all layers and the layers owned by a node inside the
// .start-selling-platform subtree (backendNodeId, pseudo-elements included), with their size, drawsContent,
// paintCount and compositing reasons. Backing estimate: width x height x 4 bytes x DPR^2 per drawsContent layer
// (an estimate from layer bounds, not Chrome's real tile memory). A second snapshot DELTA ms later gives each platform
// layer's paintCount delta over that idle window (paintCount is cumulative since the layer was created), and the
// four sweep titles' state (in view, data-sweep-paused, running sweep animations).
// usage: node fixes/platform-idle/tools/chlayers.mjs <out.json> <label>=<url>...   env Y=5346
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../../tools/lib/cdp.mjs';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [out, ...targets] = process.argv.slice(2);
const Y = Number(process.env.Y || 5346), DPR = 3, DELTA = Number(process.env.DELTA || 5000);
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const HASH = `(async () => { const h = async (p) => { const b = await (await fetch('/' + p, { cache: 'no-store' })).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }; return { js: await h(${JSON.stringify(JS)}), css: await h(${JSON.stringify(CSS)}) }; })()`;
const ch = await launchChrome({ port: 0, profileDir: tempProfileDir(join(root, 'out', 'platform-idle', 'chrome'), 'pi-chlayers'), headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
const res = { tool: 'fixes/platform-idle/tools/chlayers.mjs', browser: ch.browser, y: Y, arms: {} };
const walk = (n, acc, inPi) => {
  const cls = (n.attributes || []).reduce((s, v, i, a) => (i % 2 === 0 && v === 'class' ? a[i + 1] : s), '');
  const pi = inPi || /(^|\s)start-selling-platform(\s|$)/.test(cls);
  if (pi && n.backendNodeId) acc.set(n.backendNodeId, (n.nodeName || '').toLowerCase() + (cls ? '.' + cls.split(/\s+/).filter((c) => !/^svelte-/.test(c)).slice(0, 2).join('.') : '') + (n.pseudoType ? '::' + n.pseudoType : ''));
  for (const c of [...(n.children || []), ...(n.pseudoElements || []), ...(n.shadowRoots || [])]) walk(c, acc, pi);
  if (n.contentDocument) walk(n.contentDocument, acc, pi);
};
try {
  for (const t of targets) {
    const [label, url] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const page = await cdp.newIsolatedPage();
    await page.send('Network.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: DPR, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 }); await sleep(2000);
    const served = await page.eval(HASH);
    let last = null, nEv = 0; const off = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) { last = m.params.layers; nEv++; } });
    await page.send('DOM.enable'); await page.send('LayerTree.enable');
    await page.eval(`window.scrollTo({ top: ${Y}, behavior: 'instant' })`);
    await sleep(3000);
    const snap1 = new Map((last || []).map((l) => [l.layerId, l.paintCount])); const ev1 = nEv;
    await sleep(DELTA);
    off();
    const titles = await page.eval(`[...document.querySelectorAll('.start-selling-platform-row-title-doc, .start-selling-platform-row-title-earn, .start-selling-platform-row-title-secure, .start-selling-platform-row-title-organized')].map((e) => { const b = e.getBoundingClientRect(); return { cls: e.className.split(' ')[0].replace('start-selling-platform-row-title-', ''), inView: b.bottom > 0 && b.top < innerHeight, paused: e.hasAttribute('data-sweep-paused'), running: document.getAnimations().filter((a) => a.effect && a.effect.target === e && a.playState === 'running').map((a) => a.animationName + (a.effect.pseudoElement || '')) }; })`);
    const sy = await page.eval('Math.round(scrollY)');
    const { root: doc } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
    const pi = new Map(); walk(doc, pi, false);
    const layers = last || [];
    const est = (l) => (l.drawsContent ? l.width * l.height * 4 * DPR * DPR : 0);
    const mine = [];
    for (const l of layers) if (l.backendNodeId && pi.has(l.backendNodeId)) {
      let reasons = null; try { reasons = (await page.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds; } catch {}
      mine.push({ node: pi.get(l.backendNodeId), w: Math.round(l.width), h: Math.round(l.height), x: Math.round(l.offsetX), y: Math.round(l.offsetY), draws: l.drawsContent, paintCount: l.paintCount, paintDelta: snap1.has(l.layerId) ? l.paintCount - snap1.get(l.layerId) : null, invisible: !!l.invisible, reasons, estMB: Math.round(est(l) / 1048576 * 100) / 100 });
    }
    const sum = (a) => Math.round(a.reduce((s, l) => s + est(l), 0) / 1048576 * 100) / 100;
    const r = { url, served, scrollY: sy, deltaMs: DELTA, treeEventsInDelta: nEv - ev1, titles, layers: layers.length, drawsContent: layers.filter((l) => l.drawsContent).length, estMBAll: sum(layers),
      platform: { layers: mine.length, drawsContent: mine.filter((l) => l.draws).length, estMB: Math.round(mine.reduce((s, l) => s + l.estMB, 0) * 100) / 100, list: mine },
      noNode: layers.filter((l) => !l.backendNodeId).length };
    res.arms[label] = r;
    console.log(label, JSON.stringify({ treeEventsInDelta: r.treeEventsInDelta, served, scrollY: sy, layers: r.layers, drawsContent: r.drawsContent, estMBAll: r.estMBAll, platform: { layers: r.platform.layers, draws: r.platform.drawsContent, estMB: r.platform.estMB }, noNode: r.noNode, titles }));
    for (const l of mine) console.log('  ', label, l.node, `${l.w}x${l.h}`, l.draws ? 'draws' : '-', 'pc', l.paintCount, 'dpc', l.paintDelta, (l.reasons || []).join(','));
    await page.send('LayerTree.disable'); await page.close();
  }
} finally { writeFileSync(out, JSON.stringify(res, null, 1)); cdp.close(); await ch.close(); }

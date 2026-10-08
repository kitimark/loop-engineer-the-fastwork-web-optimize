#!/usr/bin/env node
// de-offscreen (T-228 #87/#89), Chrome: which composited layers exist at y 0 and at spot B (y 4600), who owns them,
// where they sit against the viewport, do they paint over a 3 s idle and a short scroll, why are they composited, and
// does a running animation / scroll timeline / will-change sit on them. COUNTS ONLY, no timing judged. Chrome layers are
// NOT WebKit layers: this is the cheap first look; layers-sim.mjs is the engine that matters.
// Headless Chrome, 430 x 775 DPR 3, mobile + touch, hover:none / pointer:coarse, no CPU throttle. One fresh load per arm.
// Per position P: scroll to P (top: 0; B: jump 4000, 3 s, smooth to 4600, 1.5 s), census C0, 3 s idle, C1, short scroll
// (+250 +250 smooth, 0.7 s, back to P smooth, 1.2 s), C2. A census = LayerTree.disable/enable and the first
// layerTreeDidChange after it (raw layer list kept). paintCount deltas: idle C1-C0, scroll C2-C1. Owners (C1 layers):
// DOM.resolveNode(backendNodeId) + OWNER_INFO_FN; compositing reasons: LayerTree.compositingReasons.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner de-offscreen -- \
//     node fixes/de-offscreen/layers-chrome.mjs [v0 e f]
// Output: out/de-offscreen/chrome-<arm>.json (raw); summarize with fixes/de-offscreen/summarize.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, ARMS, serveArm, checkServed, OWNER_INFO_FN, sleep } from './common.mjs';
const { launchChrome, CDP, gotoAndSettle, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));

const OUT = join(WT, 'out/de-offscreen'); mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2).filter((a) => ARMS[a]);
const arms = only.length ? only : Object.keys(ARMS);
const W = 430, H = 775, DPR = 3;
const POS = { top: 0, B: 4600 };

async function census(page, state) {
  state.fresh = null;
  await page.send('LayerTree.disable').catch(() => {});
  const got = page.waitFor((m) => m.method === 'LayerTree.layerTreeDidChange' && m.params.layers, 3000).then((m) => m.params.layers).catch(() => null);
  await page.send('LayerTree.enable');
  let L = await got;
  const fresh = !!L;
  if (!L) { await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))'); L = state.last; }
  const y = await page.eval('scrollY');
  return { at: Date.now(), y, fresh, layers: L || [] };
}

async function owners(page, layers) {
  const out = {};
  for (const l of layers) {
    const rec = {};
    try { rec.reasons = (await page.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasonIds || []; } catch (e) { rec.reasons = ['ERR ' + String(e.message || e).slice(0, 60)]; }
    if (l.backendNodeId) {
      try {
        const { object } = await page.send('DOM.resolveNode', { backendNodeId: l.backendNodeId });
        const r = await page.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true });
        rec.owner = r.result?.value || null;
        await page.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
      } catch (e) {
        try { const { node } = await page.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); rec.owner = { sel: `${node.localName || node.nodeName}${node.pseudoType ? '::' + node.pseudoType : ''}`, described: true }; }
        catch { rec.owner = { sel: '?', err: String(e.message || e).slice(0, 60) }; }
      }
    }
    out[l.layerId] = rec;
  }
  return out;
}

const RUNNING = `document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const e = a.effect, t = e && e.target; const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
  const c = t ? String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).slice(0, 2).join('.') : '';
  let it = null; try { it = e.getComputedTiming().iterations; } catch (x) {}
  return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', target: t ? t.localName + (c ? '.' + c : '') + (e.pseudoElement || '') : '?', timeline: !a.timeline ? 'none' : a.timeline === document.timeline ? 'doc' : a.timeline.constructor.name, inf: it === Infinity, rect: r ? [r.x, r.y, r.width, r.height].map(Math.round) : null }; })`;

for (const arm of arms) {
  const srv = await serveArm(arm, join(OUT, `serve-chrome-${arm}.json`));
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), 'de-offscreen'), headless: true, windowSize: `${W},${H}` });
  const cdp = await CDP.connect(chrome.wsUrl);
  const res = { tool: 'fixes/de-offscreen/layers-chrome.mjs', engine: 'chrome', browser: chrome.browser, headless: chrome.headless, arm, viewport: { w: W, h: H, dpr: DPR }, positions: {}, errors: [] };
  const t0 = Date.now();
  try {
    res.served = await checkServed(arm, srv.port);
    if (!res.served.ok) throw new Error(`VOID served ${JSON.stringify(res.served)}`);
    const page = await cdp.newIsolatedPage();
    const state = { last: null, events: 0 };
    page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange') { state.events++; if (m.params.layers) state.last = m.params.layers; } });
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenWidth: W, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await page.send('Network.enable');
    await page.send('DOM.enable');
    await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
    await sleep(2500);
    await page.send('DOM.getDocument', { depth: 0 });
    res.page = await page.eval('({ ih: innerHeight, iw: innerWidth, dpr: devicePixelRatio, sh: document.documentElement.scrollHeight })');
    // warm-up census: the first LayerTree.enable turns layer debug info on (paintCount starts at 0) and repaints every
    // layer once (first run, 13:52Z: C0 all 0, C1 +1 on every static layer); later enables do not. Out of the deltas.
    res.warm = (await census(page, state)).layers.length; await sleep(1000);
    for (const [pos, y] of Object.entries(POS)) {
      const P = {};
      if (y > 0) { await page.eval(`(scrollTo({ top: ${y - 600}, behavior: 'instant' }), 1)`); await sleep(3000); await page.eval(`(scrollTo({ top: ${y}, behavior: 'smooth' }), 1)`); await sleep(1500); }
      else { await page.eval('(scrollTo({ top: 0, behavior: "instant" }), 1)'); await sleep(1000); }
      P.C0 = await census(page, state);
      state.events = 0; await sleep(3000); P.idleEvents = state.events;
      P.C1 = await census(page, state);
      P.running = await page.eval(RUNNING);
      P.owners = await owners(page, P.C1.layers);
      state.events = 0;
      await page.eval(`new Promise(async (res) => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
        scrollBy({ top: 250, behavior: 'smooth' }); await s(300); scrollBy({ top: 250, behavior: 'smooth' }); await s(700);
        scrollTo({ top: ${y}, behavior: 'smooth' }); await s(1200); res(scrollY); })`);
      P.scrollEvents = state.events;
      P.C2 = await census(page, state);
      res.positions[pos] = P;
      console.log(`${arm} ${pos}: y ${P.C1.y} layers ${P.C0.layers.length}/${P.C1.layers.length}/${P.C2.layers.length} fresh ${P.C0.fresh}/${P.C1.fresh}/${P.C2.fresh} events idle ${P.idleEvents} scroll ${P.scrollEvents} running ${P.running.length}`);
    }
    await page.close();
  } catch (e) { res.errors.push(String(e.message || e)); console.log(`${arm} ERROR ${e.message || e}`); }
  finally {
    res.ms = Date.now() - t0;
    writeFileSync(join(OUT, `chrome-${arm}.json`), JSON.stringify(res));
    cdp.close(); await chrome.close(); srv.proc.kill();
  }
}

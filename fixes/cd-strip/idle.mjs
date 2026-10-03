// cd-strip idle triple (protocol v2 §3.5; headless, functional, counts only, no timing). Adapted from scene-scope's
// out/scene-scope/idletriple.mjs (credit scene-scope); this copy starts its own servers per arm (as pixels.mjs does).
// Per arm, 430x932 DPR 3, CPU 1x: spots top (y=0), mid (walk down in 250 px steps to MIDY and park), end (walk on to the
// page end, the morph pin). At each spot: 2 s settle, then WIN ms with no input. A document-start shim counts the page's
// own work: rAF, timer and observer callbacks, events (scroll, animation*, transition*, resize; window capture),
// attribute mutation records (= writes; style / class / other), childList nodes added+removed, characterData records,
// and Chrome's LayoutCount / RecalcStyleCount over the window (Performance.getMetrics; counts only, no durations).
// obsBy: observer callbacks per observer class over the window, plus PerformanceObserver entries per entryType.
//   node fixes/cd-strip/idle.mjs [arms=st6rb2,strip]     env WIN=5000 MIDY=2620 ROUNDS=2 SPOTS=top,mid,end
// Run in a shared slot: node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-strip -- node fixes/cd-strip/idle.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep, screenInfoArg, headedUA, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));

const ARMS = (process.argv[2] || 'st6rb2,strip').split(',');
const E = (k, d) => Number(process.env[k] || d);
const WIN = E('WIN', 5000), MIDY = E('MIDY', 2620), ROUNDS = E('ROUNDS', 2), SPOTS = (process.env.SPOTS || 'top,mid,end').split(',');
const OUT = join(WT, 'out/cd-strip'); mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const DIRS = { orig: null, st6rb2: join(WT, 'fixes/st6-rb2/overlay'), strip: join(WT, 'fixes/cd-strip/overlay'), 'strip-rbf': join(WT, 'out/cd-strip/arm-rbf'), 'strip-tw': join(WT, 'out/cd-strip/snap/strip-tw'), 'strip-tc': join(WT, 'out/cd-strip/snap/strip-tc') };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const fileOf = (arm, f) => (DIRS[arm] && existsSync(join(DIRS[arm], f)) ? join(DIRS[arm], f) : join(BASE, f));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
async function server(label, overlay) {
  const st = join(OUT, `serve-idle-${label}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(overlay ? ['--overlay', overlay] : []), '--port', '0', '--quiet', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin', '--no-cache'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(label + ' server did not start');
}
const SHIM = `(() => {
  const C = window.__it = { raf: 0, timer: 0, obs: 0, ev: 0, wStyle: 0, wClass: 0, wOther: 0, nodes: 0, chars: 0, obsBy: {}, on: false };
  const MO0 = window.MutationObserver, PO0 = window.PerformanceObserver;
  const R = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { return R(function (t) { if (C.on) C.raf++; return cb(t); }); };
  for (const k of ['setTimeout', 'setInterval']) { const T = window[k]; window[k] = function (cb, ...a) { if (typeof cb === 'function') { const f = cb; cb = function (...x) { if (C.on) C.timer++; return f.apply(this, x); }; } return T.call(window, cb, ...a); }; }
  for (const K of ['IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'PerformanceObserver']) { const O = window[K]; if (!O) continue;
    window[K] = class extends O { constructor(cb, o) { super(function (...x) { if (C.on) { C.obs++; C.obsBy[K] = (C.obsBy[K] || 0) + 1;
      // review r2: which observer fires; for PerformanceObserver also the entry types it delivers (entries, not callbacks)
      if (K === 'PerformanceObserver' && x[0] && x[0].getEntries) for (const e of x[0].getEntries()) { const t = 'PO entries ' + e.entryType; C.obsBy[t] = (C.obsBy[t] || 0) + 1; } }
      return cb.apply(this, x); }, o); } }; }
  // the harness's own layout-shift observer (the original class, so it is not counted as a page callback): entries,
  // score sum without recent input (as CLS counts it) and the shifted sources by tag.class
  try { new PO0((l) => { if (!C.on) return; for (const e of l.getEntries()) { C.obsBy['ls entries'] = (C.obsBy['ls entries'] || 0) + 1;
    if (!e.hadRecentInput) C.obsBy['ls score x1e6'] = (C.obsBy['ls score x1e6'] || 0) + Math.round(e.value * 1e6);
    const set = [];
    for (const s of e.sources || []) { const nd = s.node, k = 'ls src ' + (nd ? (nd.nodeType === 1 ? nd.tagName.toLowerCase() + '.' + String(nd.className).split(' ')[0] : '#text') : 'null'); C.obsBy[k] = (C.obsBy[k] || 0) + 1; set.push(k.slice(7)); }
    // review r2 (4): an entry's score is not split per source by the API, so the score is summed per source SET
    if (!e.hadRecentInput) { const k = 'ls score x1e6 by [' + [...new Set(set)].sort().join(' + ') + ']'; C.obsBy[k] = (C.obsBy[k] || 0) + Math.round(e.value * 1e6); } } })
    .observe({ type: 'layout-shift' }); } catch {}
  for (const t of ['scroll', 'animationstart', 'animationend', 'animationiteration', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'resize'])
    window.addEventListener(t, () => { if (C.on) C.ev++; }, { capture: true, passive: true });
  new MO0((rs) => { if (!C.on) return; for (const r of rs) { if (r.type === 'attributes') { if (r.attributeName === 'style') C.wStyle++; else if (r.attributeName === 'class') C.wClass++; else C.wOther++; }
    else if (r.type === 'childList') C.nodes += r.addedNodes.length + r.removedNodes.length; else C.chars++; } })
    .observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
})();`;
const servers = {}, served = {};
for (const arm of ARMS) { servers[arm] = await server(arm, DIRS[arm]); served[arm] = { js: sha(fileOf(arm, NODE)), css: sha(fileOf(arm, CSS)) }; }
const profileDir = tempProfileDir(join(OUT, 'chrome-fn'), 'cd-strip-idle');
const ch = await launchChrome({ port: 0, profileDir, headless: true, args: [screenInfoArg()] });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { tool: 'cd-strip idle triple', arms: ARMS, served, WIN, MIDY, ROUNDS, startedAt: new Date().toISOString(), load1: [loadavg()[0]], rows: [] };
// review r2 (lead b): Chrome's composited layers after the window (LayerTree, not during it): total, and how many belong to
// faces / strips / wrappers / cells (layer backendNodeId pushed to the front end and matched against the class's nodes)
const SELS = [['face', '.face.svelte-1quva9c'], ['strip', '.strip.svelte-1quva9c'], ['cdwrap', '.cdwrap.svelte-1quva9c'], ['cell', '.cell.svelte-1quva9c']];
async function layerCensus(page) {
  let got = null; const off = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) got = m.params.layers; });
  try {
    await page.send('DOM.enable', {}); await page.send('LayerTree.enable', {});
    for (let i = 0; i < 30 && !got; i++) await sleep(100);
    if (!got) return null;
    const root = (await page.send('DOM.getDocument', { depth: 0 })).root.nodeId;
    const ids = [...new Set(got.filter((l) => l.backendNodeId).map((l) => l.backendNodeId))];
    const pushed = ids.length ? (await page.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: ids })).nodeIds : [];
    const byB = new Map(ids.map((b, i) => [b, pushed[i]]));
    const out = { layers: got.length, drawn: got.filter((l) => l.drawsContent).length };
    for (const [k, sel] of SELS) { const set = new Set((await page.send('DOM.querySelectorAll', { nodeId: root, selector: sel })).nodeIds); out[k] = got.filter((l) => l.backendNodeId && set.has(byB.get(l.backendNodeId))).length; out[k + 'Nodes'] = set.size; }
    return out;
  } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
  finally { off(); await page.send('LayerTree.disable', {}).catch(() => {}); }
}
const walkTo = (page, y) => page.eval(`new Promise(async (res) => { const ty = Math.min(${y}, document.documentElement.scrollHeight - innerHeight); for (let i = 0; i < 400 && Math.abs(scrollY - ty) > 1; i++) { const d = ty - scrollY; scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 250), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); } res(Math.round(scrollY)); })`, { timeout: 90000 });
try {
  for (let round = 0; round < ROUNDS; round++) for (const arm of (round % 2 ? [...ARMS].reverse() : ARMS)) {
    const page = await cdp.newIsolatedPage();
    if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
    await page.send('Performance.enable', {});
    await gotoAndSettle(page, servers[arm].url, { quietMs: 2000 }); await sleep(1500);
    for (const [spot, y] of [['top', 0], ['mid', MIDY], ['end', 1e6]].filter(([k]) => SPOTS.includes(k))) {
      const sy = await walkTo(page, y);
      await sleep(2000);
      // Chrome's own Layout and style-recalc counters (Performance.getMetrics, cumulative counts; durations not used)
      const met = async () => Object.fromEntries((await page.send('Performance.getMetrics', {})).metrics.map((m) => [m.name, m.value]));
      const m0 = await met();
      await page.eval(`Object.assign(window.__it, { raf: 0, timer: 0, obs: 0, ev: 0, wStyle: 0, wClass: 0, wOther: 0, nodes: 0, chars: 0, obsBy: {}, on: true }); 0`);
      await sleep(WIN);
      const m1 = await met();
      // one microtask first, so pending MutationObserver records (queued earlier) are delivered while counting is on
      const c = await page.eval(`(async () => { await Promise.resolve(); const c = window.__it; c.on = false; return JSON.parse(JSON.stringify(c)); })()`);
      const s = WIN / 1000, per = (v) => Math.round((v / s) * 10) / 10;
      const row = { arm, round, spot, y: sy, perSec: { callbacks: per(c.raf + c.timer + c.obs), raf: per(c.raf), timer: per(c.timer), obs: per(c.obs), events: per(c.ev),
        writes: per(c.wStyle + c.wClass + c.wOther), wStyle: per(c.wStyle), wClass: per(c.wClass), wOther: per(c.wOther), nodes: per(c.nodes), chars: per(c.chars), layout: per(m1.LayoutCount - m0.LayoutCount), recalc: per(m1.RecalcStyleCount - m0.RecalcStyleCount) }, obsBy: c.obsBy,
        layers: process.env.LAYERS === '0' ? undefined : await layerCensus(page) };
      res.rows.push(row); console.log(JSON.stringify(row));
    }
    await page.close(); res.load1.push(loadavg()[0]);
  }
} finally {
  res.endedAt = new Date().toISOString();
  const f = join(OUT, `idle-${res.startedAt.replace(/[:.]/g, '-')}.json`); writeFileSync(f, JSON.stringify(res, null, 1)); console.log('wrote', f, 'served', JSON.stringify(served));
  cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

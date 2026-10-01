// de-counts-chrome work-count probe (research tool, not shared tooling; run only inside a chrome-measure hold).
//
// One page load per (build, mode): 430x932 DPR 3 mobile + touch, CPU throttle N (default 6), 6 s idle at the top,
// then a step walk top -> bottom: every `step` px one scrollTo (instant or smooth), then `dwell` ms. Each step is a
// window delimited by performance.mark('w:<k>:<y>'). Per window, from one trace (devtools.timeline +
// invalidationTracking + user_timing, main frame only) and from CDP:
//   ult    UpdateLayoutTree: count, sum/max elementCount, ms
//   lay    Layout: count, sum/max dirtyObjects, max totalObjects, layout roots, "view roots" (root quad >= 60 % of
//          the viewport area), ms
//   inv    StyleInvalidatorInvalidationTracking (count, "subtree" count, top subtree nodes+selectorPart),
//          StyleRecalcInvalidationTracking by reason (Animation vs other, distinct non-animation nodes),
//          LayoutInvalidationTracking count
//   paint  Paint count, PaintImage count, ms; RasterTask count (any thread, informational)
//   frames PrePaint count (main-frame updates in the window)
//   pm     Performance.getMetrics deltas (RecalcStyleCount, LayoutCount, ...) and absolutes (Nodes, LayoutObjects)
//   lt     LayerTree (optional): layers at the window end, max, paintCount rises
//
// usage: node probe.mjs --plan plan.json --out DIR      (plan: {runs:[{label, overlays:[dir...], headless, cpu, mode}]})
//        Starts one tools/serve.mjs per run (--port auto --https --vendors=local --latency 150), probes, stops it.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDP, chromePath, killTree, gotoAndSettle, sleep } from '../../../tools/lib/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PLAN = JSON.parse(readFileSync(arg('plan'), 'utf8'));
const OUT = resolve(arg('out', join(ROOT, 'out/de-counts-chrome')));
mkdirSync(OUT, { recursive: true });

const SCREEN_INFO = '--screen-info={0,0 1512x982 devicePixelRatio=2}';
async function launch({ headless, profileDir }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const args = ['--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=600,1000', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
    ...(headless ? ['--headless=new', SCREEN_INFO] : []), 'about:blank'];
  const proc = spawn(chromePath(), args, { stdio: 'ignore' });
  const kill = () => killTree(proc.pid);
  process.on('exit', kill);
  let ver;
  for (let i = 0; i < 150 && !ver; i++) {
    try { const p = Number(readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (p) ver = await (await fetch(`http://127.0.0.1:${p}/json/version`)).json(); } catch {}
    if (!ver) await sleep(100);
  }
  if (!ver) { kill(); throw new Error('no DevTools port'); }
  return { ver, close: async () => { try { proc.kill('SIGTERM'); } catch {} await sleep(800); kill(); process.off('exit', kill); } };
}

async function serve(overlays, label) {
  const state = join(OUT, `serve-${label}.json`);
  rmSync(state, { force: true });
  const a = ['tools/serve.mjs', '--root', 'site-pretty', '--port', 'auto', '--https', '--vendors=local', '--latency', '150', '--state', state];
  if (overlays?.length) a.push('--overlay', overlays.join(','));
  const proc = spawn('node', a, { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 200; i++) { try { const s = JSON.parse(readFileSync(state, 'utf8')); return { url: s.url, proc }; } catch {} await sleep(100); }
  proc.kill(); throw new Error('serve did not start');
}

// Page-side mutation counter (engine-neutral; the same JS runs on WebKit): childList adds/removes, attribute
// writes that really changed the value (attributeOldValue, F-020) and no-op writes, the top keys. Read and reset
// by window.__wcTake() (takeRecords first, so nothing queued is lost). No layout or style reads.
export const MO_INSTALL = String.raw`(() => {
  const sel = (e) => e.id ? '#' + e.id : (e.tagName || '?').toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.') : '');
  let c = null;
  const reset = () => { c = { add: 0, rem: 0, attr: 0, attrNoop: 0, text: 0, keys: new Map() }; };
  reset();
  const eat = (ms) => { for (const m of ms) {
    if (m.type === 'childList') { c.add += m.addedNodes.length; c.rem += m.removedNodes.length; continue; }
    if (m.type === 'characterData') { c.text++; continue; }
    const v = m.target.getAttribute(m.attributeName);
    if (v === m.oldValue) { c.attrNoop++; continue; }
    c.attr++; const k = sel(m.target) + ' @' + m.attributeName; c.keys.set(k, (c.keys.get(k) || 0) + 1);
  } };
  const mo = new MutationObserver(eat);
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  window.__wcTake = () => { eat(mo.takeRecords()); const r = { add: c.add, rem: c.rem, attr: c.attr, attrNoop: c.attrNoop, text: c.text, top: [...c.keys].sort((a, b) => b[1] - a[1]).slice(0, 4) }; reset(); return r; };
  return true;
})()`;
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking', 'blink.user_timing'];
const PM = ['RecalcStyleCount', 'LayoutCount', 'RecalcStyleDuration', 'LayoutDuration', 'ScriptDuration', 'TaskDuration', 'Nodes', 'LayoutObjects', 'JSEventListeners'];

async function probeOnce(run, url) {
  const profileDir = join(OUT, 'profiles', run.label);
  const ch = await launch({ headless: !!run.headless, profileDir });
  const cdp = await CDP.connect(ch.ver.webSocketDebuggerUrl);
  const rec = { label: run.label, overlays: run.overlays || [], headless: !!run.headless, cpu: run.cpu ?? 6, mode: run.mode || 'instant', step: run.step ?? 250, dwell: run.dwell ?? 700, layers: run.layers !== false, browser: ch.ver.Browser, ua: null, at: new Date().toISOString() };
  try {
    await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
    const page = await cdp.newIsolatedPage();
    if (run.headless) { const ua = ch.ver['User-Agent'].replace('HeadlessChrome/', 'Chrome/'); await page.send('Emulation.setUserAgentOverride', { userAgent: ua }); }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Performance.enable', { timeDomain: 'timeTicks' });
    await gotoAndSettle(page, url);
    rec.ua = await page.eval('navigator.userAgent');
    const frameId = (await page.send('Page.getFrameTree')).frameTree.frame.id;
    await page.send('Emulation.setCPUThrottlingRate', { rate: rec.cpu });
    await sleep(3000);
    const events = [];
    const offT = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
    let win = -1; const lt = [];
    const offL = page.on((m) => { if (m.method === 'LayerTree.layerTreeDidChange' && Array.isArray(m.params?.layers)) lt.push({ win, layers: m.params.layers.map((l) => ({ id: l.layerId, pc: l.paintCount ?? null, draws: !!l.drawsContent })) }); });
    if (rec.layers) await page.send('LayerTree.enable');
    await page.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: CATS, recordMode: 'recordContinuously' } });
    await page.eval(MO_INSTALL);
    const pm = [], mo = [];
    const pmGet = async () => { mo.push(await page.eval('window.__wcTake()')); return Object.fromEntries((await page.send('Performance.getMetrics')).metrics.filter((m) => PM.includes(m.name)).map((m) => [m.name, m.value])); };
    const H = await page.eval('document.documentElement.scrollHeight - innerHeight');
    const ys = []; for (let y = rec.step; y < H; y += rec.step) ys.push(y); ys.push(H);
    const wins = [{ k: 'idle', y: 0 }, ...ys.map((y, i) => ({ k: 's' + (i + 1), y }))];
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      pm.push(await pmGet()); win = i;
      await page.eval(`performance.mark('w:${i}:${w.k}:${w.y}')`);
      if (w.k === 'idle') await sleep(3000);
      else { await page.eval(`window.scrollTo({ top: ${w.y}, behavior: '${rec.mode === 'smooth' ? 'smooth' : 'instant'}' })`); await sleep(rec.dwell); }
    }
    pm.push(await pmGet()); win = wins.length;
    await page.eval(`performance.mark('w:end')`);
    await sleep(200);
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 180000);
    await page.send('Tracing.end'); await done; offT(); offL();
    if (rec.layers) await page.send('LayerTree.disable').catch(() => {});
    rec.finalY = await page.eval('scrollY');
    rec.docH = await page.eval('document.documentElement.scrollHeight');
    rec.windows = analyze(events, frameId, wins, pm, lt);
    // mo[i] is read at the START of window i (it holds window i-1's mutations); mo[i+1] belongs to window i
    rec.windows.forEach((w, i) => { w.mo = mo[i + 1] || null; });
    if (run.saveTrace) writeFileSync(join(OUT, `${run.label}-trace.json`), JSON.stringify({ traceEvents: events }));
    await page.close();
  } finally { cdp.close(); await ch.close(); }
  return rec;
}

function analyze(events, frameId, wins, pm, lt) {
  const marks = events.filter((e) => e.cat?.includes('user_timing') && /^w:/.test(e.name)).sort((a, b) => a.ts - b.ts);
  const bounds = [];
  for (let i = 0; i < wins.length; i++) {
    const s = marks.find((m) => m.name.startsWith(`w:${i}:`)); const e = marks.find((m) => m.name.startsWith(`w:${i + 1}:`)) || marks.find((m) => m.name === 'w:end');
    bounds.push([s?.ts ?? Infinity, e?.ts ?? Infinity]);
  }
  const fr = (e) => e.args?.beginData?.frame ?? e.args?.data?.frame;
  const mainPidTid = (() => { const c = new Map(); for (const e of events) if (e.name === 'UpdateLayoutTree' && fr(e) === frameId) { const k = e.pid + ':' + e.tid; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  const onMain = (e) => e.pid + ':' + e.tid === mainPidTid;
  const out = wins.map((w, i) => ({ k: w.k, y: w.y, ult: { n: 0, el: 0, maxEl: 0, ms: 0 }, lay: { n: 0, dirty: 0, maxDirty: 0, maxTotal: 0, roots: 0, viewRoots: 0, ms: 0 }, inv: { sInv: 0, sInvSubtree: 0, sInvTop: {}, recalcAnim: 0, recalcOther: 0, recalcReasons: {}, recalcNodes: 0, layInv: 0 }, paint: { n: 0, img: 0, ms: 0, raster: 0 }, frames: 0 }));
  const recalcNodes = out.map(() => new Set());
  const VIEW = 430 * 932 * 9; // device px area
  const idx = (ts) => { for (let i = 0; i < bounds.length; i++) if (ts >= bounds[i][0] && ts < bounds[i][1]) return i; return -1; };
  for (const e of events) {
    const i = idx(e.ts); if (i < 0) continue; const o = out[i];
    if (e.name === 'RasterTask') { o.paint.raster++; continue; }
    if (!onMain(e)) continue;
    const d = (e.dur || 0) / 1000;
    switch (e.name) {
      case 'UpdateLayoutTree': { const n = Number(e.args?.elementCount ?? 0); o.ult.n++; o.ult.el += n; o.ult.maxEl = Math.max(o.ult.maxEl, n); o.ult.ms += d; break; }
      case 'Layout': { const b = e.args?.beginData || {}; o.lay.n++; o.lay.dirty += b.dirtyObjects || 0; o.lay.maxDirty = Math.max(o.lay.maxDirty, b.dirtyObjects || 0); o.lay.maxTotal = Math.max(o.lay.maxTotal, b.totalObjects || 0); o.lay.ms += d;
        for (const r of e.args?.endData?.layoutRoots || []) { o.lay.roots++; const q = r.quads?.[0]; if (q) { const a = Math.abs((q[2] - q[0]) * (q[5] - q[3])); if (a >= 0.6 * VIEW) o.lay.viewRoots++; } } break; }
      case 'StyleInvalidatorInvalidationTracking': { o.inv.sInv++; const dd = e.args?.data || {}; if (/subtree/i.test(dd.reason || '')) { o.inv.sInvSubtree++; const key = `${(dd.nodeName || '').slice(0, 60)} | ${dd.selectorPart || ''}`; o.inv.sInvTop[key] = (o.inv.sInvTop[key] || 0) + 1; } break; }
      case 'StyleRecalcInvalidationTracking': { const dd = e.args?.data || {}; const r = dd.reason || '?'; o.inv.recalcReasons[r] = (o.inv.recalcReasons[r] || 0) + 1; if (r === 'Animation') o.inv.recalcAnim++; else { o.inv.recalcOther++; recalcNodes[i].add(dd.nodeId); } break; }
      case 'LayoutInvalidationTracking': o.inv.layInv++; break;
      case 'Paint': o.paint.n++; o.paint.ms += d; break;
      case 'PaintImage': o.paint.img++; break;
      case 'PrePaint': o.frames++; break;
    }
  }
  out.forEach((o, i) => {
    o.inv.recalcNodes = recalcNodes[i].size;
    o.inv.sInvTop = Object.entries(o.inv.sInvTop).sort((a, b) => b[1] - a[1]).slice(0, 3);
    o.ult.ms = +o.ult.ms.toFixed(2); o.lay.ms = +o.lay.ms.toFixed(2); o.paint.ms = +o.paint.ms.toFixed(2);
    const a = pm[i], b = pm[i + 1];
    if (a && b) o.pm = { styleN: b.RecalcStyleCount - a.RecalcStyleCount, layoutN: b.LayoutCount - a.LayoutCount, styleMs: +((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000).toFixed(2), layoutMs: +((b.LayoutDuration - a.LayoutDuration) * 1000).toFixed(2), nodes: b.Nodes, layoutObjects: b.LayoutObjects, listeners: b.JSEventListeners };
    const lists = lt.filter((l) => l.win === i);
    if (lists.length) {
      const prev = lt.filter((l) => l.win < i).at(-1);
      const pc = new Map((prev?.layers || []).map((l) => [l.id, l.pc]));
      let rises = 0, maxN = 0;
      for (const l of lists) { maxN = Math.max(maxN, l.layers.length); for (const x of l.layers) { if (x.pc == null) continue; const was = pc.get(x.id); if (was !== undefined && x.pc > was) rises += x.pc - was; pc.set(x.id, x.pc); } }
      o.lt = { end: lists.at(-1).layers.length, max: maxN, paints: rises, lists: lists.length };
    } else { const prev = lt.filter((l) => l.win < i).at(-1); if (prev) o.lt = { end: prev.layers.length, max: prev.layers.length, paints: 0, lists: 0 }; }
  });
  return out;
}

import { existsSync } from 'node:fs';
const T_START = Date.now(), BUDGET = Number(arg('budget', 0)) * 1000; // --budget S: start no run after S seconds (short-lane chunks)
for (const run of PLAN.runs) {
  if (existsSync(join(OUT, `${run.label}.json`))) continue; // resumable across short holds
  if (BUDGET && Date.now() - T_START > BUDGET) { console.log(`budget reached, next ${run.label}`); break; }
  const t0 = Date.now();
  const srv = await serve(run.overlays, run.label);
  try {
    const rec = await probeOnce(run, srv.url);
    rec.seconds = Math.round((Date.now() - t0) / 1000);
    writeFileSync(join(OUT, `${run.label}.json`), JSON.stringify(rec, null, 1));
    const tot = rec.windows.reduce((s, w) => ({ el: s.el + w.ult.el, lay: s.lay + w.lay.n, sub: s.sub + w.inv.sInvSubtree, p: s.p + w.paint.n }), { el: 0, lay: 0, sub: 0, p: 0 });
    const top = [...rec.windows].sort((a, b) => b.ult.maxEl - a.ult.maxEl).slice(0, 3).map((w) => `${w.k}@${w.y}:${w.ult.maxEl}`).join(' ');
    console.log(`${run.label} ${rec.seconds}s h=${rec.docH} styleEl=${tot.el} layouts=${tot.lay} subtreeInv=${tot.sub} paints=${tot.p} topULT ${top}`);
  } catch (e) { console.log(`${run.label} FAILED ${e.stack}`); }
  finally { try { killTree(srv.proc.pid); } catch {} }
}
console.log('EXIT probe');

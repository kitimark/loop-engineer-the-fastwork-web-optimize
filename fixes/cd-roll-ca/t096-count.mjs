#!/usr/bin/env node
// T-096 step 2 (research card T-096 in fixes/cd-roll-ca/README.md): Chrome per-frame work counts, arm A (C8) vs B (V9),
// with A2 (a second server on the A copy) for the spread. COUNTS only (memory "defer timing"): no duration is judged.
// Per load (fresh Chrome, headless, 430x932 DPR 3 mobile + touch, CPU 1x, the headless 60 Hz frame clock):
//   window R = 8 s at y 0 (the clock rolling), window S = a touch scroll through the hero (Input.synthesizeScrollGesture,
//   the hero's height in 3 s), both in one trace (devtools.timeline, timeline.frame, blink.animations, cc, viz,
//   benchmark, blink.user_timing); window L = 4 s back at y 0 without a trace, LayerTree domain on: layers added and
//   removed per roll (by layer id, from layerTreeDidChange between one tick's console marker and the next).
// Per trace window: PipelineReporter frames by state, and those with / without a main-thread stage
//   (SendBeginMainFrameToCommit child: H1's compositor-only frames); BeginFrame, DrawFrame, BeginMainThreadFrame,
//   DroppedFrame; FireAnimationFrame (all, and the countdown's: a FunctionCall in the countdown's lines of
//   nodes/2.DyWL8TcE.js inside it); countdown FunctionCalls; UpdateLayoutTree, Layout, Paint, Commit, Layerize/
//   UpdateLayer; per roll (ticks marked by console.timeStamp from a MutationObserver on the hero's data-value):
//   the roll-start frame = from the tick to the second BeginMainThreadFrame after it: its main-thread event names
//   (top-level on the renderer main thread) with counts, Commit and Layerize counts, Paint count and distinct painted
//   layer ids.
// Arms: immutable copies out/cd-roll-ca/snap/<copy>, hash-checked against HASHES.txt (mismatch: exit 3); each arm its
// own fresh server (port 0, --no-cache, I-131), served JS/CSS hashes recorded and checked.
//   node fixes/cd-roll-ca/t096-count.mjs [--arms A:C8,B:V9,A2:C8] [--orders "A B A2,B A2 A,A2 A B"] [--out <dir>] [--smoke B]
// --smoke <copy>: one load of one copy (a tool check on a non-arm build), written under <out>/smoke.
// Run inside a shared probe slot:
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-roll-ca -- node fixes/cd-roll-ca/t096-count.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../tools/lib/cdp.mjs';
import { resolveTree } from '../../tools/lib/paths.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const SMOKE = opt('--smoke', null);
const ARMS = Object.fromEntries((SMOKE ? `X:${SMOKE}` : opt('--arms', 'A:C8,B:V9,A2:C8')).split(',').map((s) => s.split(':')));
const ORDERS = SMOKE ? [['X']] : opt('--orders', 'A B A2,B A2 A,A2 A B').split(',').map((o) => o.trim().split(/\s+/));
const OUT = join(WT, opt('--out', 'out/cd-roll-ca/t096'), SMOKE ? 'smoke' : '');
mkdirSync(OUT, { recursive: true });
const SNAPS = join(WT, 'out/cd-roll-ca/snap'), BASE = resolveTree('site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const HASHES = Object.fromEntries(readFileSync(join(SNAPS, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h]));
const R_MS = 8000, S_MS = 3000, L_MS = 4000;

for (const copy of new Set(Object.values(ARMS))) for (const f of [NODE, CSS]) {
  const p = join(SNAPS, copy, f);
  if (!existsSync(p)) { if (copy === 'B' || SMOKE) continue; console.log(`T096 VOID no ${copy}/${f}`); process.exit(3); }
  if (HASHES[`${copy}/${f}`] !== sha(readFileSync(p))) { console.log(`T096 VOID snapshot ${copy}/${f} changed`); process.exit(3); }
}

async function server(arm, copy) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const ov = existsSync(join(SNAPS, copy, NODE)) ? ['--overlay', join(SNAPS, copy)] : [];
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, ...ov, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(`${arm} server did not start`);
}

const INSTALL = `(() => { if (window.__t096) return 'again'; const X = window.__t096 = { ticks: [], log: false };
  const hero = document.querySelector('[role=timer]:not(.inverse)');
  new MutationObserver((ms) => { let n = 0;
    for (const m of ms) if (String(m.oldValue ?? '') !== String(m.target.getAttribute('data-value') ?? '')) n++;
    if (!n) return; const i = X.ticks.length; X.ticks.push(performance.now()); console.timeStamp('crt ' + i); if (X.log) console.debug('crt ' + i); })
    .observe(hero, { subtree: true, attributes: true, attributeFilter: ['data-value'], attributeOldValue: true });
  const s = hero.closest('section') || hero.parentElement; const r = s.getBoundingClientRect();
  return { heroBottom: Math.round(r.bottom + scrollY), y: scrollY }; })()`;

const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.animations', 'blink.user_timing', 'cc', 'viz', 'benchmark', '__metadata'];

function count(events, range, win) {
  const [w0, w1] = win, inW = (e) => e.ts >= w0 && e.ts < w1;
  const main = (() => { const c = {}; for (const e of events) if (e.name === 'UpdateLayoutTree' || e.name === 'FireAnimationFrame') { const k = `${e.pid}:${e.tid}`; c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0]; })();
  const onMain = (e) => `${e.pid}:${e.tid}` === main;
  const rPid = Number(main?.split(':')[0]);
  const tl = (e) => /devtools\.timeline/.test(e.cat || '');
  // frame events (BeginFrame, DrawFrame, ...): the renderer process; main-thread work (smoke 2: Commit also on the
  // compositor thread): the renderer main thread only
  const n = (name) => events.filter((e) => e.name === name && inW(e) && tl(e) && e.pid === rPid && e.ph !== 'E' && e.ph !== 'e').length;
  const nm = (name) => events.filter((e) => e.name === name && inW(e) && tl(e) && onMain(e) && e.ph !== 'E' && e.ph !== 'e').length;
  const isCd = (e) => e.name === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(e.args?.data?.url || '') && e.args.data.lineNumber >= range[0] - 1 && e.args.data.lineNumber <= range[1] + 1;
  const fafs = events.filter((e) => e.name === 'FireAnimationFrame' && e.ph === 'X' && inW(e));
  const cdCalls = events.filter((e) => isCd(e) && inW(e));
  const inSpan = (c, f) => c.pid === f.pid && c.tid === f.tid && c.ts >= f.ts && c.ts <= f.ts + (f.dur || 0);
  // PipelineReporter (renderer process only): async b/e; local ids are reused (smoke 2: every reporter 0x1), so a
  // reporter is the span from its 'b' to its 'e' on one (pid, tid, id), in ts order, and a SendBeginMainFrameToCommit
  // stage opened inside it marks a main-thread part. State: args.frame_reporter.state.
  const rank = (e) => (e.name === 'PipelineReporter' ? (e.ph === 'b' ? 0 : 3) : e.ph === 'b' ? 1 : 2);
  const asy = events.filter((e) => e.pid === rPid && (e.ph === 'b' || e.ph === 'e') && (e.name === 'PipelineReporter' || e.name === 'SendBeginMainFrameToCommit'))
    .sort((x, y) => x.ts - y.ts || rank(x) - rank(y));
  const open = new Map(), done = [];
  for (const e of asy) {
    const k = `${e.tid}:${e.id2?.local ?? e.id2?.global ?? e.id}`;
    if (e.name === 'PipelineReporter') {
      if (e.ph === 'b') open.set(k, { ts: e.ts, state: e.args?.frame_reporter?.state ?? e.args?.chrome_frame_reporter?.state ?? null, main: false });
      else { const r = open.get(k); if (r) { done.push(r); open.delete(k); } }
    } else if (e.ph === 'b') { const r = open.get(k); if (r) r.main = true; }
  }
  const frames = done.filter((r) => r.ts >= w0 && r.ts < w1);
  const byState = frames.reduce((m, r) => ((m[r.state ?? 'unknown'] = (m[r.state ?? 'unknown'] || 0) + 1), m), {});
  const presented = frames.filter((r) => /PRESENTED/.test(r.state || ''));
  const out = {
    pipeline: { frames: frames.length, byState, presentedWithMain: presented.filter((r) => r.main).length, presentedCompositorOnly: presented.filter((r) => !r.main).length,
      compositorOnlyByState: presented.filter((r) => !r.main).reduce((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {}) },
    beginFrame: n('BeginFrame'), drawFrame: n('DrawFrame'), beginMainThreadFrame: n('BeginMainThreadFrame'), droppedFrame: n('DroppedFrame'),
    fireAnimationFrame: fafs.length, countdownRaf: fafs.filter((f) => cdCalls.some((c) => inSpan(c, f))).length, countdownFunctionCalls: cdCalls.length,
    updateLayoutTree: nm('UpdateLayoutTree'), layout: nm('Layout'), paint: nm('Paint'), commit: nm('Commit'), layerize: nm('Layerize'), updateLayer: nm('UpdateLayer'),
  };
  out.countdownCallsPerDrawFrame = out.drawFrame ? +(out.countdownFunctionCalls / out.drawFrame).toFixed(3) : null;
  // roll starts (H4)
  const ticks = events.filter((e) => e.name === 'TimeStamp' && /^crt \d+/.test(e.args?.data?.message || '') && inW(e)).sort((x, y) => x.ts - y.ts);
  const bmf = events.filter((e) => e.name === 'BeginMainThreadFrame').map((e) => e.ts).sort((x, y) => x - y);
  out.rollStarts = ticks.map((t) => {
    const after = bmf.filter((x) => x > t.ts), end = after[1] ?? t.ts + 50e3;
    const fr = events.filter((e) => e.ts >= t.ts && e.ts < end && onMain(e));
    const top = {};
    for (const e of fr) if (onMain(e) && tl(e) && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i') && e.name !== 'RunTask') top[e.name] = (top[e.name] || 0) + 1;
    const paints = fr.filter((e) => e.name === 'Paint' && tl(e) && e.ph !== 'E');
    return { tick: Number(t.args.data.message.slice(4)), mainEvents: top, commit: fr.filter((e) => e.name === 'Commit' && tl(e) && e.ph !== 'E').length,
      layerize: fr.filter((e) => e.name === 'Layerize' && tl(e)).length, updateLayer: fr.filter((e) => e.name === 'UpdateLayer').length, paint: paints.length,
      paintedLayers: new Set(paints.map((e) => e.args?.data?.layerId).filter((x) => x != null)).size,
      updateLayoutTree: fr.filter((e) => e.name === 'UpdateLayoutTree' && e.ph !== 'E').length, layout: fr.filter((e) => e.name === 'Layout' && e.ph !== 'E').length };
  });
  return out;
}

async function load(arm, s, idx) {
  const url = `http://localhost:${s.port}/`;
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out', 'cd-roll-ca', 'chrome'), `cd-roll-ca-t096-${arm}`), headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
  const cdp = await CDP.connect(chrome.wsUrl);
  const page = await cdp.newIsolatedPage();
  const rec = { arm, copy: ARMS[arm], load: idx, url: url.replace(/:\d+\//, ':<port>/'), browser: chrome.browser };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
    await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    const src = await page.eval(`fetch('/${NODE}', { cache: 'no-store' }).then((r) => r.text())`);
    const css = await page.eval(`fetch('/${CSS}', { cache: 'no-store' }).then((r) => r.text())`);
    rec.served = { js: sha(Buffer.from(src)), css: sha(Buffer.from(css)) };
    const want = HASHES[`${ARMS[arm]}/${NODE}`];
    if (want && rec.served.js !== want) throw new Error(`served JS ${rec.served.js.slice(0, 12)} is not ${ARMS[arm]}'s ${want.slice(0, 12)}`);
    const lines = src.split('\n');
    const range = [lines.findIndex((l) => l.startsWith('var UE = { stiffness')), lines.findIndex((l) => l.startsWith('var lD = h('))];
    rec.countdownRange1Based = [range[0] + 1, range[1] + 1];
    rec.install = await page.eval(INSTALL);
    // smoke 1/2 scrolled twice the distance: CDP repeatCount is the number of EXTRA repeats (1 = the gesture twice);
    // now omitted (one gesture). gestureScale = endY / distance, recorded per load as a check.
    await sleep(2500);
    const events = [];
    const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
    await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 300 * 1024, includedCategories: CATS }, transferMode: 'ReportEvents' });
    await sleep(300);
    await page.eval(`performance.mark('t096 R0')`); await sleep(R_MS); await page.eval(`performance.mark('t096 R1')`);
    const dist = Math.max(400, Math.min(3000, rec.install.heroBottom || 932));
    await page.eval(`performance.mark('t096 S0')`);
    await page.send('Input.synthesizeScrollGesture', { x: 215, y: 700, yDistance: -dist, speed: Math.round(dist / (S_MS / 1000)), gestureSourceType: 'touch' });
    await page.eval(`performance.mark('t096 S1')`);
    rec.scroll = { distance: dist, endY: await page.eval('scrollY') };
    rec.gestureScale = +(rec.scroll.endY / dist).toFixed(3);
    await sleep(300);
    await page.send('Tracing.end');
    await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
    off();
    const mark = (nm) => events.find((e) => e.name === nm && e.cat?.includes('blink.user_timing'))?.ts;
    const W = { R: [mark('t096 R0'), mark('t096 R1')], S: [mark('t096 S0'), mark('t096 S1')] };
    rec.windows = {};
    for (const [k, w] of Object.entries(W)) rec.windows[k] = w[0] != null && w[1] != null ? { us: w[1] - w[0], ...count(events, range, w) } : { error: 'no marks' };
    rec.traceEvents = events.length;
    if (SMOKE) rec.samples = Object.fromEntries(['PipelineReporter', 'SendBeginMainFrameToCommit', 'Commit', 'TimeStamp'].map((nm) => [nm, events.filter((e) => e.name === nm).slice(0, 4)]));
    rec.eventNames = [...new Set(events.map((e) => e.name))].filter((x) => /Pipeline|SendBeginMainFrame|Commit|Layerize|UpdateLayer|DrawFrame|BeginFrame|DroppedFrame/.test(x)).sort();
    // window L: layers added / removed per roll (no trace)
    await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await sleep(1500);
    const seq = [];
    const off2 = page.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'debug' && /^crt \d+/.test(m.params.args?.[0]?.value || '')) seq.push({ tick: Number(m.params.args[0].value.slice(4)) });
      else if (m.method === 'LayerTree.layerTreeDidChange' && m.params.layers) seq.push({ ids: m.params.layers.map((l) => l.layerId) });
    });
    await page.send('Runtime.enable');
    await page.send('LayerTree.enable');
    await page.eval('window.__t096.log = true');
    await sleep(L_MS);
    await page.eval('window.__t096.log = false');
    await page.send('LayerTree.disable');
    off2();
    let prev = null, cur = null; const per = [];
    for (const x of seq) {
      if ('tick' in x) { cur = { tick: x.tick, changes: 0, added: 0, removed: 0, layersMin: null, layersMax: null }; per.push(cur); continue; }
      if (prev && cur) { const P = new Set(prev); const N = new Set(x.ids); cur.changes++; cur.added += x.ids.filter((i) => !P.has(i)).length; cur.removed += prev.filter((i) => !N.has(i)).length;
        cur.layersMin = Math.min(cur.layersMin ?? Infinity, x.ids.length); cur.layersMax = Math.max(cur.layersMax ?? 0, x.ids.length); }
      prev = x.ids;
    }
    rec.layers = { rolls: per.length, perRoll: per, treeChanges: seq.filter((x) => x.ids).length };
  } catch (e) { rec.error = String(e.message || e); }
  finally { await page.close().catch(() => {}); cdp.close(); await chrome.close(); }
  return rec;
}

const self = sha(readFileSync(fileURLToPath(import.meta.url)));
const res = { tool: 'fixes/cd-roll-ca/t096-count.mjs', sha256: self, arms: ARMS, orders: ORDERS, windowsMs: { R: R_MS, S: S_MS, L: L_MS }, startedAt: new Date().toISOString(), loads: [] };
const servers = {};
try {
  for (const arm of Object.keys(ARMS)) servers[arm] = await server(arm, ARMS[arm]);
  let i = 0;
  for (const order of ORDERS) for (const arm of order) {
    const r = await load(arm, servers[arm], i++);
    res.loads.push(r);
    const w = r.windows || {};
    console.log(`T096 ${arm} load ${r.load}: ${r.error ? 'ERROR ' + r.error : ['R', 'S'].map((k) => `${k} bmf ${w[k]?.beginMainThreadFrame} draw ${w[k]?.drawFrame} compOnly ${w[k]?.pipeline?.presentedCompositorOnly} cdRaf ${w[k]?.countdownRaf} rolls ${w[k]?.rollStarts?.length}`).join(' | ') + ` | L rolls ${r.layers?.rolls}`}`);
  }
} finally { for (const s of Object.values(servers)) s.p.kill(); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `t096-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log(`T096 wrote ${f.slice(WT.length + 1)} sha256 ${self.slice(0, 12)}`);
process.exit(res.loads.some((r) => r.error) ? 1 : 0);

#!/usr/bin/env node
// P-097 rev 4.1/4.2 Simulator loads (iOS Simulator, Mobile Safari; counts and pixels only, no timing: Simulator times
// never count, F-084). Run as the command of a FUNCTIONAL Simulator session in the shared lane. One invocation = the
// given Latin-square positions of one rep (positions 1..3 of orderOf(rep): C V C2 / V C2 C / C2 C V), each arm on its
// own plain-http server on the snapshot copy (served hashes checked; VOID exit 3), opened by `sim.mjs open`.
//
// --mode count (steps 1-3): per load
//   1. load at the top, settle 2 s; morph-scroll mode must be on (html.fw-ms), else the load is invalid.
//   2. pass, WebKit Timeline on (maxCallStackDepth 1), logger on (p097-lib.mjs LOGGER, the same text as Chrome; its
//      console.timeStamp('p097-cal') pairs the logger's performance.now with the Timeline clock: off = the TimeStamp
//      record's startTime x 1000 - L.cal). Scroll-in 10 px per frame from max - spacer - vh/2 to the end, held at the
//      first logged frame with m >= 0.5 (the logger's holdM) for the M3 LayerTree read of the panel clock (strips and
//      cells: layer count, backing MB, per cell [digit, k, bytes]), then resumed; at the end arm the pull (round(0.3 x
//      spacer) px up at the first tick), let the page settle (scroll still 1 s, max 6 s), logger off, Timeline off.
//      Q3: running panel-cell animations in the logged 0 < m < 1 rows; countdown rAF (a FireAnimationFrame record with
//      a FunctionCall child in the countdown range, M4's range) in the mid segments (per segment: (the read before its
//      first mid row, its last mid row's read], on the Timeline clock). Q4: Paint records (any depth) / RenderingFrame
//      records starting in the mid segments. Q6: passFacts(L).handoff.
//   3. scroll to the end (instant), settle 32 s, read m (S1), Timeline on, 3 x 4 s windows (console.timeStamp p097-w0
//      .. w3), Timeline off, read m again: per window RenderingFrame, FireAnimationFrame, countdown rAF,
//      RecalculateStyles, Paint (descriptive), and the m check (both reads exactly '1').
// --mode shot (step 4a) / --mode rm (step 4b, needs `sim.mjs session --reduce-motion on`; the page must match): the
//   frozen-clock shim (p097-lib freezeJs, WebKit stack lines 1-3) installed after load; scroll to the end (rm: the
//   page's own writer window.__navMorphSet(1) opens the panel, every arm alike); m must read '1' (else the load is VOID);
//   virtual settle at R0 (60 frames), every other page animation paused at 0, the change to R1 at G + FR/3; shots
//   'mid' at frame MID (not under rm; V's panel cell animations paused at currentTime = frame time - startTime) and
//   'rest' at frame REST; m read before each shot (VOID if not '1'). A shot = `xcrun simctl io <udid> screenshot`,
//   cropped to the panel timer rect + 4 CSS px through a magenta-marker calibration (simpx.mjs), saved as PNG.
// Output: out/p097/sim/rep<k>-<mode>-<arm>-<stamp>.json (+ <...>-<shot>.png for shot/rm).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-cd-roll-ca-r4 -- \
//     node tools/sim.mjs session --functional --owner fix-cd-roll-ca-r4 [--reduce-motion on] -- \
//     node fixes/cd-roll-ca/p097-sim.mjs --rep 1 --pos 1 --mode count
//   --arms X[,Y] (instead of --pos: tests only, marks test: true)   --settle <ms> (tests only)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, OUT, SNAP, orderOf, rangeOf, server, LOGGER, passFacts, MREAD, PTIMER, shimRange, freezeJs, nowFor, R0, R1, FR, MID, REST, STATE, PAUSE_AT, FREEZE_OTHERS, FINISH_ALL, png, crop, pngRGB, toolShas } from './p097-lib.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REP = Number(arg('--rep', '0')), MODE = arg('--mode', 'count');
const POS = arg('--pos') ? arg('--pos').split(',').map(Number) : null;
const B = process.argv.includes('--b'); // tool smoke on the plain baseline (test only, ops 2026-10-05)
const ARMS = B ? ['B'] : arg('--arms') ? arg('--arms').split(',') : REP >= 1 && REP <= 6 && POS && POS.every((p) => p >= 1 && p <= 3) ? POS.map((p) => orderOf(REP)[p - 1]) : null;
if (!ARMS || !['count', 'shot', 'rm'].includes(MODE)) { console.error('usage: p097-sim.mjs --rep 1..6 --pos 1[,2,3] --mode count|shot|rm'); process.exit(2); }
const SETTLE = Number(arg('--settle', '32000')), WIN = 4000, NWIN = 3;
const TEST = B || !!arg('--arms') || !!arg('--settle');
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const DIR = join(OUT, 'sim'); mkdirSync(DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

// ---- Timeline records ----
const walk = (r, f, depth = 0) => { f(r, depth); for (const ch of r.children || []) walk(ch, f, depth + 1); };
const isCdFc = (range) => (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
// counts of records whose startTime (s, Timeline clock) lies in [a, b) ms
function tlCount(recs, range, a, b) {
  const n = { RenderingFrame: 0, FireAnimationFrame: 0, countdownRaf: 0, RecalculateStyles: 0, Layout: 0, Paint: 0 };
  const cd = isCdFc(range);
  for (const top of recs) walk(top, (r) => { const t = r.startTime * 1000; if (!(t >= a && t < b)) return;
    if (r.type in n) n[r.type]++; if (r.type === 'FireAnimationFrame' && (r.children || []).some(cd)) n.countdownRaf++; });
  return n;
}
const stamps = (recs) => { const m = {}; for (const top of recs) walk(top, (r) => { if (r.type === 'TimeStamp' && /^p097-/.test(r.data?.message || '')) m[r.data.message] = r.startTime * 1000; }); return m; };

// M3: the panel clock's layers (strips, cdwrap, cells): count, backing MB, per cell [digit, k, bytes]
async function panelLayers(c) {
  try {
    await c.send('LayerTree.enable');
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const P = '.start-selling-morph-panel [role=timer] .digit > .strip';
    const strips = (await c.send('DOM.querySelectorAll', { nodeId: root, selector: `${P}, ${P} > .cdwrap` })).nodeIds;
    const cellIds = (await c.send('DOM.querySelectorAll', { nodeId: root, selector: `${P} .cell` })).nodeIds;
    const where = new Map(cellIds.map((id, j) => [id, [Math.floor(j / 11), j % 11]]));
    const ids = new Set([...strips, ...cellIds]);
    const L = ((await c.send('LayerTree.layersForNode', { nodeId: root })).layers || []).filter((l) => ids.has(l.nodeId));
    return { n: L.length, memoryMB: +(L.reduce((a, l) => a + (l.memory || 0), 0) / 1048576).toFixed(3), backed: L.filter((l) => l.memory > 0).length,
      cells: L.filter((l) => where.has(l.nodeId)).map((l) => [...where.get(l.nodeId), l.memory || 0]), stripLayers: L.filter((l) => !where.has(l.nodeId)).length };
  } catch (e) { return { error: String(e.message || e) }; } finally { await c.send('LayerTree.disable').catch(() => {}); }
}

async function countLoad(c, arm, res) {
  const ev = (e) => c.evaluate(e);
  const range = rangeOf(arm); res.range = range;
  let recs = [], tlOn = false; c.on((m) => { if (tlOn && m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.send('Page.enable'); await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  await sleep(2000);
  res.fwMs = await ev(`document.documentElement.classList.contains('fw-ms')`);
  const geo = res.geo = await ev(`(() => { const e = document.querySelector('.fw-ms-end'); const max = document.documentElement.scrollHeight - innerHeight; return { spacer: e ? e.offsetHeight : null, max, vh: innerHeight }; })()`);
  if (B && !(geo.spacer > 0)) geo.spacer = geo.vh; // B has no spacer: the pass mechanics run over one viewport
  else if (!res.fwMs || !(geo.spacer > 0)) throw new Error('morph-scroll mode off (no html.fw-ms / .fw-ms-end): load invalid');
  // step 2: pass
  recs = []; tlOn = true; await c.send('Timeline.start', { maxCallStackDepth: 1 });
  const lg = await ev(LOGGER); if (lg !== 'ok' && !B) throw new Error('logger: ' + lg);
  if (lg !== 'ok') { res.pass = { skipped: 'B smoke: logger ' + lg }; res.layersMid = await panelLayers(c); await c.send('Timeline.stop'); await sleep(500); tlOn = false; } else {
  const y1 = geo.max, y0 = Math.max(0, Math.round(geo.max - geo.spacer - geo.vh / 2));
  await ev(`(window.__p097.holdM = 0.5, window.__p097.scrollIn(${y0}, ${y1}))`);
  let t = Date.now(); while (!(await ev('window.__p097.held')) && !(await ev('window.__p097.scrollDone')) && Date.now() - t < 20000) await sleep(50);
  res.hold = { held: await ev('window.__p097.held'), m: await ev(MREAD), row: await ev('window.__p097.heldAt ?? null') };
  if (res.hold.held) { res.layersMid = await panelLayers(c); await ev('window.__p097.resume()'); }
  t = Date.now(); while (!(await ev('window.__p097.scrollDone')) && Date.now() - t < 20000) await sleep(100);
  res.passScrollInDone = await ev('window.__p097.scrollDone');
  await sleep(300);
  res.mAtEndBeforePull = await ev(MREAD);
  const P = Math.round(0.3 * geo.spacer);
  res.pull = { px: P, label0: await ev(`window.__p097.armPull(${P})`) };
  t = Date.now(); while (!(await ev('window.__p097.pullDone')) && Date.now() - t < 4000) await sleep(20);
  res.pull.done = await ev('window.__p097.pullDone');
  t = Date.now(); let lastY = null, still = Date.now();
  while (Date.now() - t < 6000) { const y = await ev('scrollY'); if (y !== lastY) { lastY = y; still = Date.now(); } else if (Date.now() - still >= 1000) break; await sleep(100); }
  await ev(`(window.__p097.on = false, 0)`);
  await c.send('Timeline.stop'); await sleep(500); tlOn = false;
  const L = await ev('({ rows: window.__p097.rows, rolls: window.__p097.rolls, pullFrom: window.__p097.pullFrom, cal: window.__p097.cal })');
  res.pass = { settledAt: { y: lastY, m: await ev(MREAD) }, log: L, records: recs.length };
  res.passFacts = passFacts(L);
  const st = stamps(recs);
  if (st['p097-cal'] === undefined) res.passAlign = { error: 'no p097-cal TimeStamp record' };
  else {
    const off = st['p097-cal'] - L.cal;
    const segs = res.passFacts.segments.filter((g) => g.prevTr !== null).map((g) => [off + g.prevTr, off + g.lastTr]);
    const sum = segs.map(([a, b]) => tlCount(recs, range, a, b)).reduce((s, n) => { for (const k in n) s[k] = (s[k] || 0) + n[k]; return s; }, {});
    res.passAlign = { offMs: +off.toFixed(3), segments: segs.length };
    res.passMid = { ...sum, paintPerFrame: sum.RenderingFrame ? +(sum.Paint / sum.RenderingFrame).toFixed(4) : null };
  }
  } // end of the pass (skipped only in a B smoke without the panel timer)
  recs = [];
  // step 3: rest at the end
  await ev(`(scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' }), 0)`);
  await sleep(SETTLE);
  res.m1 = await ev(MREAD);
  tlOn = true; await c.send('Timeline.start', { maxCallStackDepth: 1 });
  for (let k = 0; k <= NWIN; k++) { await ev(`(console.timeStamp('p097-w${k}'), 0)`); if (k < NWIN) await sleep(WIN); }
  await sleep(300); await c.send('Timeline.stop'); await sleep(500); tlOn = false;
  res.m2 = await ev(MREAD);
  res.mCheck = res.m1 === '1' && res.m2 === '1';
  res.restY = await ev('scrollY');
  const sr = stamps(recs);
  res.rest = [];
  for (let k = 0; k < NWIN; k++) { const a = sr[`p097-w${k}`], b = sr[`p097-w${k + 1}`]; if (a === undefined || b === undefined) { res.rest.push({ label: `rest${k}`, error: 'no TimeStamp' }); continue; }
    const n = tlCount(recs, range, a, b), per = 1000 / (b - a);
    res.rest.push({ label: `rest${k}`, ms: Math.round(b - a), perS: Object.fromEntries(Object.entries(n).map(([q, v]) => [q, +(v * per).toFixed(2)])) }); }
  await c.send('Timeline.disable').catch(() => {});
}

const MARK = 40;
function screenshot(tag) {
  const f = join(DIR, `${tag}.full.png`);
  execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] });
  return png(readFileSync(f));
}
async function calibrate(ev, tag) {
  await ev(`(() => { const d = document.createElement('div'); d.id = '__cdmark'; d.style.cssText = 'position:fixed;left:${MARK}px;top:${MARK}px;width:${MARK}px;height:${MARK}px;background:#ff00ff;z-index:2147483647;pointer-events:none'; document.body.appendChild(d); return 0; })()`);
  await sleep(250);
  const img = screenshot('cal-' + tag);
  await ev(`(document.getElementById('__cdmark')?.remove(), 0)`); await sleep(200);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * img.bpp; if (img.px[i] > 200 && img.px[i + 1] < 90 && img.px[i + 2] > 200) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  if (x1 < 0) throw new Error('marker not found in ' + tag);
  const s = (x1 - x0 + 1) / MARK, sy = (y1 - y0 + 1) / MARK;
  return { ox: x0 - MARK * s, oy: y0 - MARK * sy, s, sy, screen: [img.w, img.h] };
}

async function shotLoad(c, arm, res, rm) {
  const ev = (e) => c.evaluate(e);
  const range = shimRange(arm); res.shimRange = range;
  res.freeze = await ev(freezeJs(range, 1, 4));
  res.reducedMotion = await ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  if (res.reducedMotion !== rm) throw new Error(`prefers-reduced-motion is ${res.reducedMotion}, mode wants ${rm}`);
  await ev(`(scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' }), 0)`);
  await sleep(2500);
  if (rm) { res.opened = await ev(`(typeof window.__navMorphSet === 'function' && (window.__navMorphSet(1), true))`); await sleep(1500); }
  let t = Date.now(); while ((await ev(MREAD)) !== '1' && Date.now() - t < 5000) await sleep(100);
  res.mAtStart = await ev(MREAD);
  await sleep(1000);
  const step = (x) => ev(`(window.__step(${x}), 0)`);
  const tick = async (x, r) => { await ev(`(window.__vt = ${x}, window.__vd = ${nowFor(r)}, document.dispatchEvent(new Event('visibilitychange')), 0)`); await sleep(40); };
  const T = 6e6; await tick(T, R0); for (let k = 1; k <= 60; k++) await step(T + k * FR); await sleep(300);
  res.frozen = await ev(FREEZE_OTHERS); await sleep(300);
  const cal = res.cal = await calibrate(ev, `${STAMP}-${arm}-${MODE}`);
  const G = T + 1e5; await tick(G + FR / 3, R1);
  const shot = async (name, k) => {
    const paused = await ev(PAUSE_AT(G + k * FR));
    await sleep(150);
    const m = await ev(MREAD);
    const r = await ev(`(() => { const r = ${PTIMER}.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
    const box = { x: Math.floor(cal.ox + (r[0] - 4) * cal.s), y: Math.floor(cal.oy + (r[1] - 4) * cal.sy), w: Math.ceil((r[2] + 8) * cal.s), h: Math.ceil((r[3] + 8) * cal.sy) };
    if (box.x < 0 || box.y < 0 || box.x + box.w > cal.screen[0] || box.y + box.h > cal.screen[1]) throw new Error(`${name}: panel clock off screen (${JSON.stringify(box)})`);
    const f = `rep${REP}-${MODE}-${arm}-${STAMP}-${name}.png`;
    writeFileSync(join(DIR, f), pngRGB(crop(screenshot(`${STAMP}-${arm}-${name}`), box)));
    res.shots[name] = { file: f, frame: k, m, void: m !== '1', rect: r, box, state: await ev(STATE), paused };
  };
  for (let k = 1; k <= REST; k++) { await step(G + k * FR); if (k === MID && !rm) await shot('mid', k); }
  await shot('rest', REST);
  await ev(FINISH_ALL);
  res.cdHits = await ev('window.__cdHits');
}

const out = { tool: 'fixes/cd-roll-ca/p097-sim.mjs', rep: REP, mode: MODE, pos: POS, arms: ARMS, test: TEST, snap: SNAP.slice(WT.length + 1), tools: toolShas(), startedAt: new Date().toISOString(), loads: [] };
let code = 0;
for (const arm of ARMS) {
  const res = { tool: 'fixes/cd-roll-ca/p097-sim.mjs', rep: REP, test: TEST, arm, mode: MODE, tools: toolShas(), shots: {}, startedAt: new Date().toISOString() };
  let s;
  try { s = await server(arm, { https: false, tag: '-sim' }); } catch (e) { console.error(String(e.message || e)); if (e.code === 3) process.exit(3); throw e; }
  res.served = s.served;
  let c = null;
  try {
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', s.url], { stdio: ['ignore', 'ignore', 'inherit'] });
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    if (MODE === 'count') await countLoad(c, arm, res); else { await sleep(2500); await shotLoad(c, arm, res, MODE === 'rm'); }
  } catch (e) { res.fatal = String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); code = 1; }
  finally { if (c) c.close(); s.p.kill(); }
  res.endedAt = new Date().toISOString();
  const f = join(DIR, `rep${REP}-${MODE}-${arm}-${STAMP}.json`); writeFileSync(f, JSON.stringify(res));
  out.loads.push({ arm, file: f.slice(WT.length + 1), fatal: res.fatal || null });
  if (MODE === 'count') {
    console.log(`rep${REP} ${arm} serves ${res.served.js}/${res.served.css} fwMs ${res.fwMs} m ${res.m1}/${res.m2} check ${res.mCheck}${res.fatal ? ' FATAL ' + res.fatal : ''}`);
    if (res.passFacts) console.log(`  pass: mid ${res.passFacts.midRows} midRunning ${res.passFacts.midRunning} hold ${JSON.stringify(res.hold)} layers ${JSON.stringify(res.layersMid && { n: res.layersMid.n, MB: res.layersMid.memoryMB, backed: res.layersMid.backed })} mid ${JSON.stringify(res.passMid)} handoff ${JSON.stringify(res.passFacts.handoff && { met: res.passFacts.handoff.met, max: res.passFacts.handoff.maxJumpPx })}`);
    for (const w of res.rest || []) console.log(`  ${w.label} ${JSON.stringify(w.perS || w.error)}`);
  } else console.log(`rep${REP} ${MODE} ${arm} serves ${res.served.js}/${res.served.css} m ${res.mAtStart} frozen ${res.frozen} cdHits ${res.cdHits}${res.fatal ? ' FATAL ' + res.fatal : ''} ` + Object.entries(res.shots).map(([k, v]) => `${k}: m ${v.m}${v.void ? ' VOID' : ''} state ${v.state} paused ${JSON.stringify(v.paused)}`).join(' ; '));
}
out.endedAt = new Date().toISOString();
writeFileSync(join(DIR, `rep${REP}-${MODE}-${STAMP}.json`), JSON.stringify(out, null, 1));
process.exitCode = code || (out.loads.some((l) => l.fatal) ? 1 : 0);

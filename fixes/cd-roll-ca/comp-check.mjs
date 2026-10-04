#!/usr/bin/env node
// cd-roll-ca: Chrome counts at y 0 (no timing). Is the digit roll composited, and how many main-thread style
// recalcs does the countdown still cause? One window of --seconds at the top of the page, trace categories
// devtools.timeline + blink.animations. Counts per window: UpdateLayoutTree, Layout, Paint, main frames
// (BeginMainThreadFrame), FireAnimationFrame, and FireAnimationFrame callbacks that run countdown code (a FunctionCall
// in nodes/2.DyWL8TcE.js between `var UE = { stiffness` and `var lD = h(` of the served file). Per strip Web Animation
// instance (trace 'Animation' async events, split at each begin, never merged by the reused id): its compositeFailed
// mask(s) and unsupportedProperties (Chrome CompositorAnimations::FailureReasons).
//   --pause-others 1 : first pause every document animation not on a digit strip and every SMIL svg (ablation:
//                      what is left is the countdown plus script-driven work).
// Run inside a shared-lane hold:
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-roll-ca -- sh -c '...'
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../tools/lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const statePath = arg('--state');
const label = arg('--label', 'arm');
const outPath = arg('--out', `out/cd-roll-ca/comp-check-${label}.json`);
const seconds = Number(arg('--seconds', '4'));
const pauseOthers = arg('--pause-others', '0') !== '0';
const cpu = Number(arg('--cpu', '1'));

const state = JSON.parse(readFileSync(join(root, statePath), 'utf8'));
const url = state.url || `https://localhost:${state.port}/`;
const profileDir = tempProfileDir(join(root, 'out', 'cd-roll-ca', 'chrome'), `cd-roll-ca-comp-${label}`);
const chrome = await launchChrome({ port: 0, profileDir, headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
let out;
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await page.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(2500);
  const src = await page.eval(`fetch('/_app/immutable/nodes/2.DyWL8TcE.js').then((r) => r.text())`);
  const lines = src.split('\n');
  const range = [lines.findIndex((l) => l.startsWith('var UE = { stiffness')), lines.findIndex((l) => l.startsWith('var lD = h('))];
  // --pause-others 2 (freeze): also keep them paused: CSS animation-play-state paused on everything but the strips,
  // and Element.animate() on any other element returns a paused animation (the hero accent cycle restarts its own
  // animations from script; paused, it waits for a finish that never comes)
  if (arg('--pause-others', '0') === '2') await page.eval(`(() => {
    const st = document.createElement('style'); st.textContent = '*:not(.strip) { animation-play-state: paused !important; }'; document.head.append(st);
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...a) { const an = orig.apply(this, a); if (!this.closest('.strip')) an.pause(); return an; };
    return 1; })()`);
  const paused = pauseOthers ? await page.eval(`(() => { let n = 0;
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.closest && t.closest('.strip')) continue; a.pause(); n++; }
    let s = 0; for (const svg of document.querySelectorAll('svg')) if (svg.querySelector('animate, animateTransform, animateMotion, set')) { svg.pauseAnimations(); s++; }
    return { animations: n, smil: s }; })()`) : null;
  await sleep(500);
  const events = [];
  page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 200 * 1024,
    includedCategories: ['devtools.timeline', 'blink.animations', 'disabled-by-default-devtools.timeline.frame', '__metadata'] }, transferMode: 'ReportEvents' });
  const t0 = await page.eval('performance.now()');
  await sleep(seconds * 1000);
  const strips = await page.eval(`[...document.querySelectorAll('[role=timer]')].map((t) => ({ inverse: t.classList.contains('inverse'), anims: [...t.querySelectorAll('.strip')].reduce((n, s) => n + s.getAnimations({ subtree: true }).length, 0) }))`);
  const running = await page.eval(`document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target;
    return { type: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '', target: t ? t.tagName.toLowerCase() + '.' + String(t.className?.baseVal ?? t.className).split(' ').slice(0, 2).join('.') : null }; })`);
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  // main renderer thread = the thread with the most UpdateLayoutTree/FireAnimationFrame events
  const cnt = (n) => events.filter((e) => e.name === n).length;
  const isCd = (e) => e.name === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(e.args?.data?.url || '') && e.args.data.lineNumber >= range[0] - 1 && e.args.data.lineNumber <= range[1] + 1;
  // countdown rAF: FunctionCall inside a FireAnimationFrame span on the same thread
  const fafs = events.filter((e) => e.name === 'FireAnimationFrame' && e.ph === 'X');
  const cdCalls = events.filter(isCd);
  const cdRaf = fafs.filter((f) => cdCalls.some((c) => c.tid === f.tid && c.ts >= f.ts && c.ts <= f.ts + (f.dur || 0))).length;
  // strip Web Animation instances
  const inst = []; const open = new Map();
  for (const e of events.filter((x) => x.name === 'Animation').sort((a, b) => a.ts - b.ts)) {
    const id = e.id2?.local || e.id; const d = e.args?.data || {};
    if (e.ph === 'b') { const r = { node: d.nodeName || null, name: d.name ?? null, ts: e.ts, cf: [], unsupported: [] }; open.set(id, r); inst.push(r); }
    const r = open.get(id); if (!r) continue;
    if (d.nodeName && !r.node) r.node = d.nodeName;
    if (d.compositeFailed !== undefined) r.cf.push(d.compositeFailed);
    if (d.unsupportedProperties) r.unsupported.push(...d.unsupportedProperties);
    if (e.ph === 'e') open.delete(id);
  }
  // the build on strip-rb animates the cells of a strip (several per roll, one start time): match both
  const stripInst = inst.filter((r) => /\b(strip|cell)\b/.test(r.node || ''));
  // main frames per 400 ms inside roll windows (first 400 ms after a strip animation begins) vs outside them
  const bmf = events.filter((e) => e.name === 'BeginMainThreadFrame').map((e) => e.ts).sort((a, b) => a - b);
  const rollTs = stripInst.map((r) => r.ts).sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 20e3); // one start per roll
  // base arm has no strip animations: use countdown rAF starts (first FireAnimationFrame running countdown code after a gap)
  const cdFafTs = fafs.filter((f) => cdCalls.some((c) => c.tid === f.tid && c.ts >= f.ts && c.ts <= f.ts + (f.dur || 0))).map((f) => f.ts).sort((a, b) => a - b);
  const rollStarts = rollTs.length ? rollTs : cdFafTs.filter((t, i) => i === 0 || t - cdFafTs[i - 1] > 200e3);
  const inRoll = (t) => rollStarts.some((s) => t >= s && t < s + 400e3);
  const span = bmf.length ? bmf[bmf.length - 1] - bmf[0] : 0;
  const rollMs = rollStarts.length * 400;
  const nIn = bmf.filter(inRoll).length;
  const frameSplit = { rollStarts: rollStarts.length, mainFramesPer400msInRoll: rollStarts.length ? +(nIn / rollStarts.length).toFixed(1) : null,
    mainFramesPer400msOutside: span / 1e3 - rollMs > 0 ? +((bmf.length - nIn) / ((span / 1e3 - rollMs) / 400)).toFixed(1) : null };
  out = {
    tool: 'fixes/cd-roll-ca/comp-check.mjs', label, url, browser: chrome.browser, seconds, cpu, pauseOthers, paused, countdownRange1Based: [range[0] + 1, range[1] + 1],
    counts: { updateLayoutTree: cnt('UpdateLayoutTree'), layout: cnt('Layout'), paint: cnt('Paint'), beginMainThreadFrame: cnt('BeginMainThreadFrame'),
      beginFrame: cnt('BeginFrame'), drawFrame: cnt('DrawFrame'), fireAnimationFrame: fafs.length, countdownRaf: cdRaf, countdownFunctionCalls: cdCalls.length },
    stripAnimations: { instances: stripInst.length, composited: stripInst.filter((r) => r.cf.length && r.cf.every((x) => x === 0)).length,
      failed: stripInst.filter((r) => r.cf.some((x) => x !== 0)).map((r) => ({ cf: [...new Set(r.cf)], unsupported: [...new Set(r.unsupported)] })),
      noDecision: stripInst.filter((r) => !r.cf.length).length },
    frameSplit, otherAnimationInstances: inst.length - stripInst.length, clocksAtEnd: strips, runningAtEnd: running, traceEvents: events.length, t0,
    timerFire: cnt('TimerFire'), styleElements: events.filter((e) => e.name === 'UpdateLayoutTree').reduce((n, e) => n + (e.args?.elementCount || e.args?.data?.elementCount || 0), 0),
    otherAnimNodes: Object.entries(inst.filter((r) => !/\b(strip|cell)\b/.test(r.node || '')).reduce((m, r) => ((m[r.node || '?'] = (m[r.node || '?'] || 0) + 1), m), {})),
    // the countdown's 1 s ticks (review round 4 B3, cost card event): countdown-code FunctionCalls outside any
    // FireAnimationFrame (the setInterval / visibilitychange callbacks), one per 50 ms cluster; trace µs
    tickTimes: cdCalls.filter((c) => !fafs.some((f) => f.tid === c.tid && c.ts >= f.ts && c.ts <= f.ts + (f.dur || 0))).map((c) => c.ts).sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 50e3),
  };
  // --save-trace <path>: the raw events as {traceEvents} (tools/costcard.mjs input)
  if (arg('--save-trace')) { const p = join(root, arg('--save-trace')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify({ traceEvents: events })); out.trace = arg('--save-trace'); }
} finally {
  await page.close(); cdp.close(); await chrome.close();
}
mkdirSync(dirname(join(root, outPath)), { recursive: true });
writeFileSync(join(root, outPath), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ label, pauseOthers, counts: out.counts, frameSplit: out.frameSplit, stripAnimations: { ...out.stripAnimations, failed: out.stripAnimations.failed.slice(0, 4) }, paused: out.paused, clocks: out.clocksAtEnd, running: out.runningAtEnd, timerFire: out.timerFire, styleElements: out.styleElements, otherAnimNodes: out.otherAnimNodes }));

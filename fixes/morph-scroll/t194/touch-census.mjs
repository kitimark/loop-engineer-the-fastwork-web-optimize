#!/usr/bin/env node
// T-194 follow-up (lead): Chrome layout census + call list along a touch swipe, counts only (no timing claim; ms are
// descriptive, unthrottled). One headless Chrome at the iPhone's scripted geometry 430x775 DPR 3, mobile + touch. After
// load + idle, touch strokes (Input.synthesizeScrollGesture, gestureSourceType touch) walk the page down to --to px.
// A rAF logger records scrollY per frame (the same read as the phone logger, P-023 neutral). The trace carries
// devtools.timeline + invalidationTracking + stacks, so per scrollY bin we get: UpdateLayoutTree count and elements
// restyled, Layout count, dirty/total objects, layout roots; who scheduled style (top JS frame or none = engine:
// animation, transition, viewport); StyleRecalcInvalidationTracking and LayoutInvalidationTracking by reason + node; and
// every FunctionCall into the page bundle by line:col + name with its self time.
// Also writes the section map (top/height of every top-level block and [id] element) at 430x775.
// usage (inside `lock.mjs run chrome-measure --shared --weight probe`):
//   node fixes/morph-scroll/t194/touch-census.mjs --url <u> --arm <name> --out <json> [--to 6200] [--stroke 420]
//     [--speed 900] [--bin 100] [--idle 5000]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const WT = process.cwd();
const { launchChrome, CDP, gotoAndSettle, tempProfileDir } = await import(WT + '/tools/lib/cdp.mjs');
const { setTimeout: sleep } = await import('node:timers/promises');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('--url'), ARM = arg('--arm', 'v9'), OUT = arg('--out');
if (!URL_ || !OUT) { console.error('usage: --url <u> --arm <name> --out <json>'); process.exit(1); }
const W = 430, VH = 775, DPR = 3;
const TO = +arg('--to', '6200'), STROKE = +arg('--stroke', '420'), SPEED = +arg('--speed', '900'), BIN = +arg('--bin', '100');
const IDLE = +arg('--idle', '5000');
mkdirSync(dirname(OUT), { recursive: true });

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(WT + '/out/t194-census/chrome', 'tc-' + ARM), headless: true, windowSize: `${W},${VH}`, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
const res = { arm: ARM, url: URL_, w: W, vh: VH, dpr: DPR, to: TO, stroke: STROKE, speed: SPEED, bin: BIN, browser: chrome.browser };
const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 110);
try {
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: VH, deviceScaleFactor: DPR, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  // --webkit-path: define window.GestureEvent before the page's scripts run, so the WebKit-only branches (the hero
  // exit's CSS mode heCss, and any other `GestureEvent` in window check) take the path the iPhone takes. Blink then
  // runs those scroll-driven animations its own way: element counts are indicative, not WebKit's.
  res.webkitPath = process.argv.includes('--webkit-path');
  if (res.webkitPath) { await page.send('Page.enable'); await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.GestureEvent = window.GestureEvent || function GestureEvent() {};` }); }
  await gotoAndSettle(page, URL_, { quietMs: 2000, maxMs: 45000 });
  await sleep(IDLE);
  res.docHeight = await page.eval(`document.documentElement.scrollHeight`);
  res.coarse = await page.eval(`matchMedia('(hover: none) and (pointer: coarse)').matches`);
  res.heOn = await page.eval(`!!document.querySelector('.hero-track.he-on')`);
  res.sections = await page.eval(`(() => { const out = []; const seen = new Set();
    const add = (el, why) => { if (seen.has(el)) return; seen.add(el); const r = el.getBoundingClientRect(); if (r.height < 40) return;
      out.push({ top: Math.round(r.top + scrollY), h: Math.round(r.height), tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 80), why }); };
    const main = document.querySelector('main') || document.body;
    for (const el of main.children) add(el, 'child');
    for (const el of main.querySelectorAll('section, [id]')) if (el.closest('svg') === null) add(el, 'id/section');
    return out.sort((a, b) => a.top - b.top); })()`);
  // --anims: also log the hero's live CSS mode (.he-css) per frame and, once per new 250 px bin, the running
  // animations (name | target class | in viewport | scroll-driven); getAnimations() costs, so this arm is for counts only.
  res.anims = process.argv.includes('--anims');
  await page.eval(`(() => { window.__ys = []; window.__an = {}; const ht = document.querySelector('.hero-track'); const A = ${res.anims};
    const snap = (k) => { const o = {}; for (const a of document.getAnimations()) { if (a.playState !== 'running' && a.playState !== 'finished') continue; const t = a.effect && a.effect.target; if (!t) continue;
      const r = t.getBoundingClientRect(); const vis = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      const nm = (a.animationName || a.transitionProperty || a.constructor.name) + ' | ' + (t.tagName + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ').slice(0, 2).join('.')) + ' | ' + (vis ? 'in' : 'off') + ' | ' + (a.timeline && a.timeline !== document.timeline ? 'scroll' : 'time') + ' | ' + a.playState;
      o[nm] = (o[nm] || 0) + 1; } __an[k] = o; };
    const f = () => { const y = scrollY; __ys.push([performance.now(), y, innerHeight, ht && ht.classList.contains('he-css') ? 1 : 0]); if (A) { const k = Math.floor(y / 250) * 250; if (!__an[k]) snap(k); } requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e); });
  await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 600 * 1024,
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-devtools.timeline.invalidationTracking', 'disabled-by-default-devtools.timeline.stack', 'blink.user_timing', '__metadata'] }, transferMode: 'ReportEvents' });
  await sleep(300);
  const syncNow = await page.eval(`(() => { const t = performance.now(); performance.mark('tc-sync'); return t; })()`);
  let strokes = 0, y = 0;
  while (y < TO && strokes < 80) {
    await page.send('Input.synthesizeScrollGesture', { x: 215, y: 620, yDistance: -STROKE, speed: SPEED, gestureSourceType: 'touch', preventFling: false });
    await sleep(250);
    y = await page.eval(`scrollY`); strokes++;
    const max = await page.eval(`document.documentElement.scrollHeight - innerHeight`);
    if (y >= max - 2) break;
  }
  res.strokes = strokes; res.endY = y;
  await sleep(800);
  const ys = await page.eval(`__ys`);
  if (res.anims) res.animSnaps = await page.eval(`__an`);
  // .he-css live share per 100 px bin of the frame's scrollY (rAF samples)
  { const H = {}; for (const s of ys) { const k = Math.floor(s[1] / 100) * 100; const o = (H[k] ||= [0, 0]); o[0]++; o[1] += s[3] || 0; } res.heLive = H; }
  await page.send('Tracing.end');
  await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 180000);
  off();
  const syncEv = events.find((e) => e.name === 'tc-sync');
  if (!syncEv) throw new Error('sync mark missing in trace');
  const toNow = (ts) => syncNow + (ts - syncEv.ts) / 1000;
  // scrollY at a perf.now time: the last rAF sample at or before it
  const yAt = (t) => { let lo = 0, hi = ys.length - 1, f = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ys[m][0] <= t) { f = m; lo = m + 1; } else hi = m - 1; } return f < 0 ? null : ys[f]; };
  // moving = y differs from the previous sample; per bin count frames (rAF samples) that moved
  const binOf = (yy) => Math.floor(yy / BIN) * BIN;
  const B = {};
  const b = (k) => (B[k] ||= { frames: 0, ult: 0, elems: 0, layout: 0, dirty: 0, total: 0, ultMs: 0, layMs: 0, sched: {}, sri: {}, lit: {}, fc: {}, roots: {} });
  for (let i = 1; i < ys.length; i++) if (ys[i][1] !== ys[i - 1][1]) b(binOf(ys[i][1])).frames++;
  const mainTid = (() => { const c = {}; for (const e of events) if (e.name === 'UpdateLayoutTree' || e.name === 'Layout') c[e.pid + ':' + e.tid] = (c[e.pid + ':' + e.tid] || 0) + 1; return Object.entries(c).sort((x, z) => z[1] - x[1])[0]?.[0]; })();
  const topFrame = (st) => { const f = (st || []).find((c) => c.url && !/^\s*$/.test(c.url)); return f ? `${(f.functionName || '?')}@${f.url.split('/').pop()}:${f.lineNumber + 1}` : st && st.length ? (st[0].functionName || 'native') : 'engine'; };
  const fcs = events.filter((e) => e.name === 'FunctionCall' && e.ph === 'X' && e.pid + ':' + e.tid === mainTid).sort((p, q) => p.ts - q.ts);
  for (const e of events) {
    if (e.pid + ':' + e.tid !== mainTid && !/InvalidationTracking/.test(e.name)) continue;
    const s = yAt(toNow(e.ts)); if (!s) continue;
    // only while moving: the sample at the event and the one before differ
    const k = binOf(s[1]); const o = b(k);
    const d = e.args?.data || {};
    switch (e.name) {
      case 'UpdateLayoutTree': if (e.ph === 'X') { o.ult++; o.elems += e.args?.elementCount || 0; o.ultMs += (e.dur || 0) / 1000; } break;
      case 'Layout': if (e.ph === 'X') { o.layout++; o.dirty += e.args?.beginData?.dirtyObjects || 0; o.total += e.args?.beginData?.totalObjects || 0; o.layMs += (e.dur || 0) / 1000; const r = e.args?.endData?.layoutRoots || []; for (const x of r) { const q = x.quads?.[0] || []; const key = `${Math.round((q[2] ?? 0) - (q[0] ?? 0))}x${Math.round((q[5] ?? 0) - (q[1] ?? 0))}`; o.roots[key] = (o.roots[key] || 0) + 1; } } break;
      case 'ScheduleStyleRecalculation': { const k2 = topFrame(d.stackTrace || e.args?.beginData?.stackTrace); o.sched[k2] = (o.sched[k2] || 0) + 1; break; }
      case 'StyleRecalcInvalidationTracking': { const k2 = `${d.reason || '?'} | ${short(d.nodeName)}${d.extraData ? ' | ' + short(d.extraData) : ''} | ${topFrame(d.stackTrace)}`; o.sri[k2] = (o.sri[k2] || 0) + 1; break; }
      case 'LayoutInvalidationTracking': { const k2 = `${d.reason || '?'} | ${short(d.nodeName)} | ${topFrame(d.stackTrace)}`; o.lit[k2] = (o.lit[k2] || 0) + 1; break; }
      case 'FunctionCall': if (e.ph === 'X' && /2\.DyWL8TcE\.js/.test(d.url || '')) { const k2 = `${d.lineNumber + 1}:${d.columnNumber + 1} ${d.functionName || '?'}`; const f = (o.fc[k2] ||= { n: 0, ms: 0 }); f.n++; f.ms += (e.dur || 0) / 1000; } break;
    }
  }
  const top = (m, n = 8) => Object.entries(m).sort((x, z) => (z[1].n ?? z[1]) - (x[1].n ?? x[1])).slice(0, n);
  res.bins = Object.fromEntries(Object.entries(B).sort((x, z) => +x[0] - +z[0]).map(([k, o]) => [k, { ...o, sched: top(o.sched, 6), sri: top(o.sri, 10), lit: top(o.lit, 10), fc: top(o.fc, 10).map(([kk, v]) => [kk, v.n, +v.ms.toFixed(2)]), roots: top(o.roots, 4), ultMs: +o.ultMs.toFixed(1), layMs: +o.layMs.toFixed(1) }]));
  res.traceEvents = events.length; res.samples = ys.length;
} catch (e) {
  res.fatal = String(e && e.stack || e);
} finally {
  writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(`touch-census ${ARM}: docHeight ${res.docHeight} coarse ${res.coarse} webkitPath ${res.webkitPath} heOn ${res.heOn} strokes ${res.strokes} endY ${res.endY} events ${res.traceEvents}${res.fatal ? ' FATAL ' + res.fatal.split('\n')[0] : ''}`);
  for (const [k, o] of Object.entries(res.bins || {})) if (o.frames) console.log(`  y ${k.padStart(5)} frames ${String(o.frames).padStart(3)} | ULT ${(o.ult / o.frames).toFixed(2)}/f elems ${(o.elems / o.frames).toFixed(0)}/f ${(o.ultMs / o.frames).toFixed(2)}ms/f | Layout ${(o.layout / o.frames).toFixed(2)}/f dirty ${(o.dirty / o.frames).toFixed(0)}/f ${(o.layMs / o.frames).toFixed(2)}ms/f`);
  cdp.close(); await chrome.close();
}

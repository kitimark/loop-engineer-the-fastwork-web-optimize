#!/usr/bin/env node
// P-097 rev 4.1/4.2 Chrome count loads (steps 1-3 and 5; counts only, no timing claim). One rep = the rep's Latin-square
// row of arms (C, V, C2), one count load per arm, each in a fresh headless Chrome (fresh temp profile) against its own
// server on the snapshot copy (C2 = the C directory on a second server), served hashes checked (VOID: exit 3).
// Conditions as research/design-engineering/frame-audit/census.mjs (int-v8's census): 430x932 DPR 3 mobile + touch,
// no CPU throttle, same trace categories; PrePaint = a main frame.
// Per load:
//   1. load at the top (gotoAndSettle, quiet 2 s), settle 2 s; record whether the morph-scroll mode is on (html.fw-ms).
//   2. pass, logger on (p097-lib.mjs LOGGER: rAF posts a MessageChannel message, the read runs in that task): jump to
//      half a viewport above the start of rev 7c's spacer (scrollY = max - spacer - vh/2, m = 0), scroll 10 px per
//      frame to the page end (m 0 -> 1); at rest, arm the pull: at the first read whose timer aria-label changed (a
//      tick = a roll start), a pull of round(0.3 x spacer) px up at 10 px per frame starts in the next frame; then let
//      the page's settle finish (scroll still for 1 s, max 6 s after the pull); logger off. Tracing runs through the
//      pass; the logger's read times map to trace time by one performance.mark (p097-cal).
//   3. scroll to the page end (instant), settle 32 s, read m (S1), 3 consecutive 4 s windows (marks only; no logger,
//      no Animation domain), read m again. m check: both reads exactly '1', else the load is invalid for Q1/Q2.
//   5. tracing off, then (descriptive) one 4 s window with the CDP Animation domain on (animationStarted by name /
//      target) and a document.getAnimations() census.
// Output: out/p097/census/rep<k>-<arm>-<stamp>.json (+ .trace.json.gz: the page main thread's events and every
// PrePaint / UpdateLayoutTree / Paint / marks / metadata, so the M4 attribution can be re-run by p097-score.mjs).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-cd-roll-ca-r4 -- \
//     node fixes/cd-roll-ca/p097-census.mjs --rep 1
//   --arms C,V (override the square row; tests only, never for a counted rep)   --settle <ms> (tests only)
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { loadavg } from 'node:os';
import { WT, OUT, SNAP, orderOf, rangeOf, anchorsOf, server, LOGGER, attribute, rollClassify, passFacts, pageMain, toolShas } from './p097-lib.mjs';
const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REP = Number(arg('--rep', '0'));
const B = process.argv.includes('--b'); // tool smoke on the plain baseline (test only, ops 2026-10-05)
const ARMS = B ? ['B'] : arg('--arms') ? arg('--arms').split(',') : REP >= 1 && REP <= 6 ? orderOf(REP) : null;
if (!ARMS) { console.error('usage: p097-census.mjs --rep 1..6'); process.exit(2); }
const SETTLE = Number(arg('--settle', '32000')), WIN = 4000, NWIN = 3;
const TEST = B || !!arg('--arms') || !!arg('--settle');
const DIR = join(OUT, 'census'); mkdirSync(DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const W = 430, VH = 932, DPR = 3;
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', '__metadata'];
const MREAD = `(() => { const p = document.querySelector('.start-selling-morph-panel'); return p ? p.style.getPropertyValue('--morph') : null; })()`;

async function load(arm) {
  const range = rangeOf(arm), anchors = anchorsOf(arm);
  const s = await server(arm, { tag: '-census' });
  const res = { tool: 'fixes/cd-roll-ca/p097-census.mjs', rep: REP, arm, test: TEST, snap: SNAP.slice(WT.length + 1), served: s.served, range, settleMs: SETTLE, tools: toolShas(), startedAt: new Date().toISOString(), load1: [loadavg()[0]] };
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), `p097-${arm}`), headless: true, windowSize: `${W},${VH}`, args: ['--ignore-certificate-errors'] });
  const cdp = await CDP.connect(chrome.wsUrl);
  const page = await cdp.newIsolatedPage();
  res.browser = chrome.browser;
  const errors = []; let events = [];
  page.on((m) => {
    if (m.method === 'Tracing.dataCollected') for (const e of m.params.value) events.push(e);
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
  });
  try {
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: VH, deviceScaleFactor: DPR, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // step 1
    await gotoAndSettle(page, s.url, { quietMs: 2000, maxMs: 45000 });
    await sleep(2000);
    res.fwMs = await page.eval(`document.documentElement.classList.contains('fw-ms')`);
    const geo = await page.eval(`(() => { const e = document.querySelector('.fw-ms-end'); const max = document.documentElement.scrollHeight - innerHeight; return { spacer: e ? e.offsetHeight : null, max, vh: innerHeight }; })()`);
    res.geo = geo;
    if (B && !(geo.spacer > 0)) geo.spacer = geo.vh; // B has no spacer: the pass mechanics run over one viewport
    else if (!res.fwMs || !(geo.spacer > 0)) throw new Error('morph-scroll mode off (no html.fw-ms / .fw-ms-end): load invalid');
    await page.send('Tracing.start', { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 400 * 1024, includedCategories: CATS }, transferMode: 'ReportEvents' });
    // step 2: pass
    const y1 = geo.max, y0 = Math.max(0, Math.round(geo.max - geo.spacer - geo.vh / 2));
    const lg = await page.eval(LOGGER); if (lg !== 'ok' && !B) throw new Error('logger: ' + lg);
    if (lg !== 'ok') { res.pass = { skipped: 'B smoke: logger ' + lg }; await page.eval("(performance.mark('p097-pass-end'), 0)"); } else {
    // the logger's read times (performance.now) map to trace time through this mark's own startTime
    await page.eval(`(window.__p097.cal = performance.mark('p097-cal').startTime, 0)`);
    await page.eval(`(performance.mark('p097-pass-start'), window.__p097.scrollIn(${y0}, ${y1}))`);
    let t = Date.now(); while (!(await page.eval('window.__p097.scrollDone')) && Date.now() - t < 20000) await sleep(100);
    res.passScrollInDone = await page.eval('window.__p097.scrollDone');
    await sleep(300);
    res.mAtEndBeforePull = await page.eval(MREAD);
    const P = Math.round(0.3 * geo.spacer);
    res.pull = { px: P, label0: await page.eval(`window.__p097.armPull(${P})`) };
    t = Date.now(); while (!(await page.eval('window.__p097.pullDone')) && Date.now() - t < 4000) await sleep(20);
    res.pull.done = await page.eval('window.__p097.pullDone');
    // the page's settle: scroll still for 1 s (max 6 s)
    t = Date.now(); let lastY = null, still = Date.now();
    while (Date.now() - t < 6000) { const y = await page.eval('scrollY'); if (y !== lastY) { lastY = y; still = Date.now(); } else if (Date.now() - still >= 1000) break; await sleep(100); }
    await page.eval(`(window.__p097.on = false, performance.mark('p097-pass-end'))`);
    const L = await page.eval('({ rows: window.__p097.rows, rolls: window.__p097.rolls, pullFrom: window.__p097.pullFrom, cal: window.__p097.cal })');
    res.pass = { settledAt: { y: lastY, m: await page.eval(MREAD) }, log: L };
    } // end of the pass (skipped only in a B smoke without the panel timer)
    // step 3: rest at the end
    await page.eval(`scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' })`);
    await sleep(SETTLE);
    res.m1 = await page.eval(MREAD);
    for (let k = 0; k < NWIN; k++) { await page.eval(`performance.mark('p097-w${k}')`); await sleep(WIN); }
    await page.eval(`performance.mark('p097-w${NWIN}')`);
    res.m2 = await page.eval(MREAD);
    res.mCheck = res.m1 === '1' && res.m2 === '1';
    res.restY = await page.eval('scrollY');
    await page.send('Tracing.end');
    await page.waitFor((m) => m.method === 'Tracing.tracingComplete', 120000);
    res.load1.push(loadavg()[0]);
    // step 5 (descriptive): Animation domain for 4 s, then a getAnimations census
    const started = {}; const off = page.on((m) => { if (m.method === 'Animation.animationStarted') { const a = m.params.animation; const k = `${a.type} ${a.name || a.cssId || ''}`; started[k] = (started[k] || 0) + 1; } });
    await page.send('Animation.enable'); await sleep(4000); await page.send('Animation.disable').catch(() => {}); off();
    res.step5 = { animationStarted4s: started, census: await page.eval(`(() => { const m = {}; for (const x of document.getAnimations()) { const t = x.effect && x.effect.target; const k = [x.constructor.name, x.animationName || x.transitionProperty || '', t ? (t.tagName + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(' ').slice(0, 2).join('.')) : '-', x.playState].join(' '); m[k] = (m[k] || 0) + 1; } return m; })()`) };
  } catch (e) {
    res.fatal = String(e && e.stack || e).split('\n').slice(0, 3).join(' | ');
  } finally {
    res.errors = errors;
    await page.close().catch(() => {}); cdp.close(); await chrome.close(); s.p.kill();
  }
  // analysis
  const marks = new Map(); for (const e of events) if (/^p097-/.test(e.name) && e.cat && /user_timing/.test(e.cat)) marks.set(e.name, e.ts);
  res.marks = Object.fromEntries(marks);
  if (!res.fatal) {
    if (!res.pass?.log) res.pass = { ...res.pass, log: { rows: [], rolls: [], pullFrom: -1, cal: null } }; // B smoke only
    const wins = []; for (let k = 0; k < NWIN; k++) { const a = marks.get(`p097-w${k}`), b = marks.get(`p097-w${k + 1}`); if (a !== undefined && b !== undefined) wins.push({ label: `rest${k}`, a, b }); }
    res.rest = attribute(events, range, wins);
    // rev 4.2 Q2b′: the roll-window split, walked from the pass end (so a roll running into w0 is seen from its start)
    res.restRoll = rollClassify(events, range, anchors, wins, marks.get('p097-pass-end'));
    res.passFacts = passFacts(res.pass.log);
    // Q3 pass countdown rAF: per mid segment, (the read before its first mid frame, its last mid frame's read], in trace us
    const cal = marks.get('p097-cal'), off = cal !== undefined ? cal - res.pass.log.cal * 1000 : null;
    if (off !== null) {
      const segWins = res.passFacts.segments.filter((g) => g.prevTr !== null).map((g, j) => ({ label: `mid${j}`, a: off + g.prevTr * 1000 + 1, b: off + g.lastTr * 1000 + 1 }));
      res.passMid = attribute(events, range, segWins);
      res.passMidCountdownRaf = res.passMid.windows.reduce((a, w) => a + w.countdownRaf, 0);
    } else res.passMidCountdownRaf = null;
  }
  // keep the page main thread + census-rule events for re-scoring
  const pm = pageMain(events); const keep = new Set(['PrePaint', 'UpdateLayoutTree', 'Paint', 'FireAnimationFrame', 'TimerFire']);
  const kept = events.filter((e) => e.ph === 'M' || (e.cat && /user_timing/.test(e.cat)) || keep.has(e.name) || (pm && `${e.pid}:${e.tid}` === pm.key && (e.name === 'FunctionCall' || e.name === 'FireIdleCallback')));
  const f = join(DIR, `rep${REP}-${arm}-${STAMP}`);
  writeFileSync(f + '.trace.json.gz', gzipSync(JSON.stringify(kept)));
  res.traceEvents = events.length; res.traceKept = kept.length; events = null;
  res.endedAt = new Date().toISOString();
  writeFileSync(f + '.json', JSON.stringify(res));
  const r = res.rest?.windows || [];
  console.log(`rep${REP} ${arm} serves ${res.served.js}/${res.served.css} fwMs ${res.fwMs} m ${res.m1}/${res.m2} check ${res.mCheck}${res.fatal ? ' FATAL ' + res.fatal : ''}`);
  for (const w of r) console.log(`  ${w.label} ${w.ms}ms cdRaf/4s ${w.countdownRafPer4s} frames/s page ${w.page.mainFrames} (cd ${w.page.countdownFrames}, other ${w.page.otherFrames}) census ${w.census.mainFrames} recalc ${w.census.styleRecalc} paint ${w.census.paint} unframed ${w.unframed}`);
  if (res.restRoll) console.log(`  rev 4.2 roll split: leak ${res.restRoll.leak} orphan ${res.restRoll.orphan} ` + res.restRoll.windows.map((w) => `${w.label} cd ${w.countdown} roll ${w.roll} other' ${w.otherPrime}`).join(' | '));
  if (res.passFacts) console.log(`  pass: rows ${res.passFacts.rows} mid ${res.passFacts.midRows} midRunning ${res.passFacts.midRunning} rolls ${res.passFacts.rolls} midCdRaf ${res.passMidCountdownRaf} handoff ${JSON.stringify(res.passFacts.handoff && { met: res.passFacts.handoff.met, max: res.passFacts.handoff.maxJumpPx, why: res.passFacts.handoff.why })} settled m ${res.pass.settledAt?.m}`);
  console.log(`  wrote ${f}.json`);
  return res;
}

let bad = 0;
for (const arm of ARMS) { try { const r = await load(arm); if (r.fatal) bad++; } catch (e) { console.error(String(e.message || e)); if (e.code === 3) process.exit(3); bad++; } }
process.exitCode = bad ? 1 : 0;

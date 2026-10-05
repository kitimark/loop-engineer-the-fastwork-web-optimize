#!/usr/bin/env node
// P-097 rev 4.1 step 4, Chrome shot loads (pixels only, no timing). One rep = the rep's Latin-square row of arms, one
// shot load per arm in a fresh headless Chrome (430x932 DPR 3 mobile + touch), each arm on its own server on the
// snapshot copy (served hashes checked; VOID exit 3).
// Clock shim (fix-cd-strip's / pixels.mjs's, credit there): Date.now, performance.now, document.timeline.currentTime
// and rAF calls from the countdown's lines (var UE .. var lD, the roll helpers included) are virtual; the countdown's
// rAF frames are stepped by hand at 60 Hz, a tick lands at frame + FR/3; V's Web Animations start at the virtual change
// time and are paused before every shot at currentTime = the last stepped frame - their startTime (at or past the end:
// the last keyframe = the inline rest place), as pixels.mjs MOTION does.
// (a) motion load: page end (m = 1 by rev 7c's spacer; wait until the panel's --morph reads '1'), virtual clock on and
//     settled at 3d 04h 12m 40s, every other page animation paused at 0, then the change to ...39 (ones 0 -> 9, tens
//     4 -> 3) and 90 stepped frames: shot 'mid' at frame 8 (descriptive in Chrome) and 'rest' at frame 90.
// (b) --rm: prefers-reduced-motion emulated from load; reduced motion keeps the jack (no scroll-linked morph), so the
//     panel is opened by the page's own writer window.__navMorphSet(1) after the scroll to the end (every arm alike);
//     the same virtual instants; shot 'rest' at frame 90.
// Before every shot m is read on the panel (exactly '1', else the shot is VOID: ops addendum item), and the shot keeps
// the M-bg mask: the panel's background inside the clip (the timer rect + 4 px) minus the digit-card rects (.unit,
// getBoundingClientRect, grown by 0 px), in CSS px relative to the clip.
// Output: out/p097/px/rep<k>[-rm]-<stamp>/<arm>-<shot>.png + px.json.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-cd-roll-ca-r4 -- \
//     node fixes/cd-roll-ca/p097-px.mjs --rep 1 [--rm]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, OUT, SNAP, orderOf, server, MREAD, PTIMER as TIMER, shimRange, freezeJs, nowFor, R0, R1, FR, MID, REST, STATE, PAUSE_AT, FREEZE_OTHERS, FINISH_ALL, toolShas } from './p097-lib.mjs';
const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REP = Number(arg('--rep', '0')), RM = process.argv.includes('--rm');
const B = process.argv.includes('--b'); // tool smoke on the plain baseline (test only, ops 2026-10-05)
const ARMS = B ? ['B'] : arg('--arms') ? arg('--arms').split(',') : REP >= 1 && REP <= 6 ? orderOf(REP) : null;
if (!ARMS) { console.error('usage: p097-px.mjs --rep 1..6 [--rm]'); process.exit(2); }
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = join(OUT, 'px', `rep${REP}${RM ? '-rm' : ''}-${STAMP}`); mkdirSync(DIR, { recursive: true });

async function shotLoad(arm) {
  const range = shimRange(arm);
  const s = await server(arm, { tag: '-px' });
  const res = { arm, served: s.served, shimRange: range, rm: RM, shots: {} };
  const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(OUT, 'chrome'), `p097-px-${arm}`), headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
  const cdp = await CDP.connect(chrome.wsUrl); const page = await cdp.newIsolatedPage(); res.browser = chrome.browser;
  const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); });
  try {
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (RM) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: freezeJs(range, 2, 4) });
    await gotoAndSettle(page, s.url, { quietMs: 2000, maxMs: 45000 }); await sleep(2500);
    res.reducedMotion = await page.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
    if (res.reducedMotion !== RM) throw new Error('prefers-reduced-motion is not as asked');
    const twoFrames = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))))';
    await page.eval(`(scrollTo({ top: document.documentElement.scrollHeight - innerHeight, behavior: 'instant' }), ${twoFrames})`);
    await sleep(2500);
    if (RM) { res.opened = await page.eval(`(typeof window.__navMorphSet === 'function' && (window.__navMorphSet(1), true))`); await sleep(1500); }
    let t = Date.now(); while ((await page.eval(MREAD)) !== '1' && Date.now() - t < 5000) await sleep(100);
    res.mAtStart = await page.eval(MREAD);
    await sleep(1000);
    const step = (x) => page.eval(`(window.__step(${x}), 0)`);
    const tick = (x, r) => page.eval(`(window.__vt = ${x}, window.__vd = ${nowFor(r)}, document.dispatchEvent(new Event('visibilitychange')), new Promise((r) => setTimeout(r, 30)))`);
    let T = 6e6; await tick(T, R0); for (let k = 1; k <= 60; k++) await step(T + k * FR); await sleep(300);
    // every other page animation (col-tracks, ...) paused at 0, in every arm
    res.frozen = await page.eval(FREEZE_OTHERS);
    await sleep(300);
    const G = T + 1e5; await tick(G + FR / 3, R1);
    const clipOf = () => page.eval(`(() => { const r = ${TIMER}.getBoundingClientRect(); return { x: r.left + scrollX - 4, y: r.top + scrollY - 4, width: r.width + 8, height: r.height + 8, scale: 1 }; })()`);
    const shot = async (name, k) => {
      const ft = G + k * FR;
      const paused = await page.eval(PAUSE_AT(ft));
      await page.eval(twoFrames);
      const m = await page.eval(MREAD);
      const clip = await clipOf();
      const cards = await page.eval(`[...${TIMER}.querySelectorAll('.unit')].map((u) => { const r = u.getBoundingClientRect(); return [r.left + scrollX - ${clip.x}, r.top + scrollY - ${clip.y}, r.width, r.height]; })`);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
      const f = `${arm}-${name}.png`; writeFileSync(join(DIR, f), Buffer.from(data, 'base64'));
      res.shots[name] = { file: f, frame: k, m, void: m !== '1', clip, cards, state: await page.eval(STATE), paused };
    };
    for (let k = 1; k <= REST; k++) { await step(G + k * FR); if (k === MID && !RM) await shot('mid', k); }
    await shot('rest', REST);
    // after the shots: hand the paused rolls back (finish) so nothing stays paused (not shot)
    await page.eval(FINISH_ALL);
  } catch (e) { res.fatal = String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
  finally { res.errors = errors; await page.close().catch(() => {}); cdp.close(); await chrome.close(); s.p.kill(); }
  console.log(`rep${REP}${RM ? ' rm' : ''} ${arm} serves ${res.served.js}/${res.served.css} m ${res.mAtStart} frozen ${res.frozen}${res.fatal ? ' FATAL ' + res.fatal : ''} ` +
    Object.entries(res.shots).map(([k, v]) => `${k}: m ${v.m}${v.void ? ' VOID' : ''} cards ${v.cards.length} state ${v.state} paused ${JSON.stringify(v.paused)}`).join(' ; '));
  return res;
}
const out = { tool: 'fixes/cd-roll-ca/p097-px.mjs', rep: REP, rm: RM, order: ARMS, test: B || !!arg('--arms'), snap: SNAP.slice(WT.length + 1), tools: toolShas(), startedAt: new Date().toISOString(), loads: [] };
for (const arm of ARMS) { try { out.loads.push(await shotLoad(arm)); } catch (e) { console.error(String(e.message || e)); if (e.code === 3) process.exit(3); out.loads.push({ arm, fatal: String(e.message || e) }); } }
out.endedAt = new Date().toISOString();
writeFileSync(join(DIR, 'px.json'), JSON.stringify(out, null, 1));
console.log('wrote', join(DIR, 'px.json'));
process.exitCode = out.loads.some((l) => l.fatal || Object.values(l.shots || {}).some((s) => s.void)) ? 1 : 0;

#!/usr/bin/env node
// rot2.mjs (P-089) = the v4 rot.mjs (sha 327ac6201edb) plus one change: capture() also records each avatar slot's
// border box and computed opacity / transform / clip-path / image-rendering (`parts`, for t2aux.mjs parts). Nothing
// else differs: same recorder, logpoints, trials, clips, replays.
// rest-script item 1 identity harness (Chrome; functional, no timing claim).
// One arm, one viewport. Logpoints (Debugger.setBreakpointByUrl, conditions that return false: the shipped code is not
// changed) on the rotator's slide start / slide abort / slide end lines record the schedule. A recorder installed at
// document start reads, in a ResizeObserver callback of every frame (after style/layout, before paint), the state that
// frame paints: is the avatar row visible, .is-sliding, the 5 slot srcs, every row animation's currentTime, delay and
// progress. analyse.mjs checks every visible frame of both arms against the ORIGINAL's rule (x from the event log;
// sliding iff a slide started and has not ended; effective time = stamp - stamp of the first frame after the slide start).
// Frozen shots: at the first visible frame of chosen trials the row is frozen in that RO callback (animations paused,
// timers held) and captured; a row mutation between the freeze and the capture voids the shot. --replay <json> reproduces
// each saved shot's state on this arm (same srcs, same sliding, same effective time, same scroll y) and captures the clip.
// usage: node rot.mjs --state <serve.json> --arm st6|fix --out <json> [--w 430] [--reduced] [--replay shots.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633';
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(WT + '/tools/lib/cdp.mjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const state = JSON.parse(readFileSync(arg('--state'), 'utf8'));
const url = state.url || `https://localhost:${state.port}/`;
const ARM = arg('--arm');
const W = Number(arg('--w', '430'));
const VH = { 375: 667, 430: 932, 768: 1024, 1024: 768, 1440: 900 }[W];
const MOBILE = W <= 768, DPR = MOBILE ? 3 : 2;
const OUT = arg('--out');
const SHOTDIR = OUT.replace(/\.json$/, '-shots');
mkdirSync(SHOTDIR, { recursive: true });
const KINDS = arg('--kinds', 'smooth,jump,far,outin').split(',');
const PHASES = arg('--phases', '-120,0,40,100,160,215,260').split(',').map(Number);
const REPLAY = arg('--replay', null);
const REDUCED = process.argv.includes('--reduced');
const t0run = Date.now();

const SNIP = ARM === 'fix'
  ? { start: 'if ((fwSetS(!0), await f(220), a)) return;', end: '(fwSetX((fwX + 1) % d.length), fwSetS(!1));', abort: 'fwSetS(!1);', x: 'fwX' }
  : { start: 'if ((z(S, !0), await f(220), a)) return;', end: '(z(x, (s(x) + 1) % d.length), z(S, !1));', abort: 'z(S, !1);', x: 's(x)' };

// injected at document start: timer hold, event log, per-frame recorder
const INJECT = `(() => {
  const ST = window.setTimeout; window.__held = []; window.__hold = false;
  window.setTimeout = function (fn, ms, ...a) { return ST.call(window, function () { if (window.__hold) window.__held.push(() => fn(...a)); else fn(...a); }, ms); };
  window.__release = () => { window.__hold = false; const h = window.__held.splice(0); for (const f of h) f(); return h.length; };
  window.__ev = []; window.__d = null;
  window.__rl = (k, x, d) => { window.__ev.push([k, performance.now(), x]); if (d && !window.__d) window.__d = d.slice(); if (k === 'start' && window.__onStart) window.__onStart(performance.now()); };
  const R = window.__rec = { f: [], mut: [], gate: [], frz: [] };
  let row = null, sec = null, probe = null, T = 0, tn = 0, k = 0;
  const attach = () => {
    row = document.querySelector('#people .start-selling-avatars'); sec = document.querySelector('#people');
    if (!row || !sec) return false;
    new MutationObserver((ms) => { const t = performance.now(); for (const m of ms) R.mut.push([+t.toFixed(2), m.type, m.attributeName || '']); if (window.__frozen) window.__frozen.mutAfter = (window.__frozen.mutAfter || 0) + ms.length; })
      .observe(row, { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'src', 'style'] });
    new MutationObserver(() => R.gate.push([performance.now(), sec.getAttribute('data-start-selling-scene')])).observe(sec, { attributes: true, attributeFilter: ['data-start-selling-scene'] });
    R.gate.push([performance.now(), sec.getAttribute('data-start-selling-scene')]);
    probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;height:1px;width:1px;pointer-events:none;visibility:hidden;contain:strict';
    document.documentElement.appendChild(probe);
    new ResizeObserver(() => {
      if (!T) return; const t = T; T = 0;
      const r = row.getBoundingClientRect(); const vis = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      const rec = [t, +tn.toFixed(2), +performance.now().toFixed(2), vis ? 1 : 0, Math.round(scrollY)];
      if (vis) {
        rec.push(row.classList.contains('is-sliding') ? 1 : 0, [...row.children].map((i) => (i.getAttribute('src') ? new URL(i.getAttribute('src'), location.href).pathname : '')),
          row.getAnimations({ subtree: true }).map((a) => { const tm = a.effect.getComputedTiming(); return [a.animationName, a.currentTime === null ? null : +(+a.currentTime).toFixed(3), +(+a.effect.getTiming().delay).toFixed(3), tm.progress === null ? null : +tm.progress.toFixed(5), a.playState]; }),
          +r.top.toFixed(2));
        if (window.__shotNext) {
          window.__shotNext = false; window.__hold = true;
          for (const a of row.getAnimations({ subtree: true })) a.pause();
          window.__frozen = { rec, top: r.top, left: r.left, w: r.width, h: r.height, y: scrollY, mutAfter: 0 }; R.frz.push([t, null]);
        }
      }
      R.f.push(rec);
    }).observe(probe);
    return true;
  };
  const loop = (t) => { if (!probe) attach(); if (probe) { T = t; tn = performance.now(); probe.style.width = (++k % 2 ? 2 : 1) + 'px'; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})()`;

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(WT + '/out/rest-script/chrome', 'rest-rot-' + ARM), headless: true, windowSize: `${W},${VH}`, args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
const errors = [];
page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]); });
const result = { arm: ARM, w: W, vh: VH, dpr: DPR, mobile: MOBILE, reduced: REDUCED, browser: chrome.browser, trials: [], shots: [], replays: [], docs: [] };
const pullDoc = async (label) => {
  const rec = await page.eval('window.__rec');
  result.docs.push({ label, frames: rec.f, mut: rec.mut, gate: rec.gate, frz: rec.frz, events: await page.eval('window.__ev'), d: await page.eval('window.__d') });
};
try {
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: VH, deviceScaleFactor: DPR, mobile: MOBILE });
  if (MOBILE) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (REDUCED) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  // logpoints by URL + line (they survive the reload); line numbers from the overlay file served to this arm
  const ov = ARM === 'fix' ? 'rest-script' : 'st6-rb2';
  const src = readFileSync(join(WT, 'fixes', ov, 'overlay/_app/immutable/nodes/2.DyWL8TcE.js'), 'utf8').split('\n');
  const find = (s, after = 0) => { const i = src.findIndex((l, j) => j >= after && l.trim() === s.trim()); if (i < 0) throw new Error('snippet not found: ' + s); return i; };
  const startL = find(SNIP.start), abortL = find(SNIP.abort, startL), endL = find(SNIP.end, startL);
  if (!(abortL < endL && endL - startL < 8)) throw new Error('logpoint line order');
  await page.send('Debugger.enable');
  const bp = async (line, cond) => (await page.send('Debugger.setBreakpointByUrl', { urlRegex: '2\\.DyWL8TcE\\.js', lineNumber: line, columnNumber: 0, condition: cond })).breakpointId;
  result.logpoints = { start: startL + 1, abort: abortL + 1, end: endL + 1 };
  await bp(startL, `(window.__rl('start', ${SNIP.x}), false)`);
  await bp(abortL, `(window.__rl('abort', ${SNIP.x}), false)`);
  await bp(endL, `(window.__rl('end', ${SNIP.x}, d), false)`);
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  const geo = await page.eval(`(() => { const r = document.querySelector('#people .start-selling-avatars').getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, docH: document.documentElement.scrollHeight }; })()`);
  result.geo = geo;
  const enterY = Math.max(0, Math.round(geo.top - VH));                 // the row's top edge at the viewport bottom
  const farY = Math.max(0, Math.round(enterY - VH * 0.5 - 250));        // outside the fix's 50 % margin, gate active
  const pausedY = Math.round(geo.docH - VH);                            // gate paused
  const midY = Math.round(geo.top - VH / 2);                            // row mid-viewport
  result.ys = { enterY, farY, pausedY, midY };
  const waitStart = (ms = 4000) => page.eval(`new Promise((res) => { window.__onStart = (t) => { window.__onStart = null; res(t); }; setTimeout(() => res(null), ${ms}); })`);
  const unfreeze = () => page.eval(`(() => { window.__frozen = null; const fz = window.__rec.frz.at(-1); if (fz && fz[1] === null) fz[1] = performance.now(); const row = document.querySelector('#people .start-selling-avatars'); for (const a of row.getAnimations({ subtree: true })) a.play(); return window.__release(); })()`);
  // capture the row where it is now (after the page's own scroll-linked motion settled): clip in document coordinates
  const capture = async (file) => {
    const r = await page.eval(`(() => { const row = document.querySelector('#people .start-selling-avatars'), r = row.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, y: scrollY,
      parts: [...row.children].map((i) => { const b = i.getBoundingClientRect(), cs = getComputedStyle(i); return [+b.left.toFixed(3), +b.top.toFixed(3), +b.width.toFixed(3), +b.height.toFixed(3), cs.opacity, cs.transform, cs.clipPath, cs.imageRendering]; }) }; })()`);
    const pad = 6;
    const clip = { x: Math.max(0, Math.floor(r.left) - pad), y: Math.floor(r.top + r.y) - pad, width: Math.ceil(r.w) + 2 * pad, height: Math.ceil(r.h) + 2 * pad, scale: 1 };
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return { clip, parts: r.parts, capTop: +r.top.toFixed(2), capLeft: +r.left.toFixed(2), yCap: Math.round(r.y) };
  };
  const SETTLE = 1200;
  const freezeShot = async (label, extra) => {
    let fz = null;
    for (let i = 0; i < 150 && !fz; i++) { fz = await page.eval('window.__frozen'); if (!fz) await sleep(20); }
    if (!fz) return null;
    await sleep(SETTLE);
    const file = join(SHOTDIR, `${label}.png`);
    const s = { label, file, rec: fz.rec, y: fz.y, top: fz.top, ...extra, ...(await capture(file)) };
    s.mutAfter = await page.eval('window.__frozen.mutAfter');      // row mutations between the freeze and the capture
    result.shots.push(s);
    await unfreeze();
    return s;
  };

  if (!REPLAY) {
    await page.eval(`scrollTo({ top: ${farY}, behavior: 'instant' })`);
    await sleep(2000);
    // A. at rest with the row visible (rest frames are checked like every other visible frame)
    await page.eval(`scrollTo({ top: ${midY}, behavior: 'instant' })`);
    await sleep(3500);
    // a rest shot: a frame between two slides
    if (!REDUCED) { await waitStart(); await sleep(400); }
    await page.eval('window.__shotNext = true');
    await freezeShot(`${ARM}-${W}-rest`, { kind: 'rest' });
    for (const kind of (REDUCED ? ['jump', 'far'] : KINDS)) {
      // far: the gate is paused there, the rotator is stalled (no phase to aim at): one trial
      for (const ph of (REDUCED || kind === 'far' ? [0] : kind === 'outin' ? [20, 60] : PHASES)) {
        const from = kind === 'far' ? pausedY : kind === 'outin' ? midY : farY;
        await page.eval(`scrollTo({ top: ${from}, behavior: 'instant' })`);
        await sleep(kind === 'far' ? 2200 : 1200);
        const t0 = REDUCED || kind === 'far' ? (await page.eval('performance.now()')) - 1020 : await waitStart();
        if (t0 == null) { result.trials.push({ kind, ph, error: 'no slide start seen' }); continue; }
        let fire;
        if (kind === 'smooth') {
          const step = 50, n = Math.ceil((enterY + 2 - farY) / step);
          fire = t0 + 1020 + ph - n * 16.67;
          await page.eval(`new Promise((res) => setTimeout(() => {
            let k = 0; window.__shotNext = true;
            const go = () => { scrollBy({ top: ${step}, behavior: 'instant' }); if (++k < ${n + 8}) requestAnimationFrame(go); else res(); };
            requestAnimationFrame(go);
          }, Math.max(0, ${fire} - performance.now())))`);
        } else if (kind === 'outin') {
          // the row is in view when the slide starts; ph ms into it the page jumps away (outside the 50 % margin), and
          // 80 ms later back: the return frame and every frame after it are checked against the original
          fire = t0 + 1020 + ph;
          await page.eval(`new Promise((res) => setTimeout(() => { scrollTo({ top: ${farY}, behavior: 'instant' });
            setTimeout(() => { window.__shotNext = true; scrollTo({ top: ${midY}, behavior: 'instant' }); res(); }, 80); }, Math.max(0, ${fire} - performance.now())))`);
        } else {
          fire = t0 + 1020 + ph;
          await page.eval(`new Promise((res) => setTimeout(() => { window.__shotNext = true; scrollTo({ top: ${midY}, behavior: 'instant' }); res(); }, Math.max(0, ${fire} - performance.now())))`);
        }
        const s = await freezeShot(`${ARM}-${W}-${kind}-${ph}`, { kind, ph });
        await sleep(500);
        result.trials.push({ kind, ph, t0, fire, shot: s && s.label });
      }
    }
    // anchor-like jump: scrollIntoView of the row from the gate-paused region (same scroll path as an anchor jump)
    await page.eval(`scrollTo({ top: ${pausedY}, behavior: 'instant' })`); await sleep(2200);
    await page.eval(`(() => { window.__shotNext = true; document.querySelector('#people .start-selling-avatars').scrollIntoView({ block: 'center', behavior: 'instant' }); })()`);
    await freezeShot(`${ARM}-${W}-intoview`, { kind: 'intoview' });
    await sleep(1500);
    // a real fragment navigation onto the row's section (#people) from the gate-paused region
    if (!KINDS.includes('nohist')) {
      await page.eval(`scrollTo({ top: ${pausedY}, behavior: 'instant' })`); await sleep(2200);
      await page.eval(`(() => { window.__shotNext = true; location.hash = 'people'; })()`);
      const sh = await freezeShot(`${ARM}-${W}-hash`, { kind: 'hash' });
      result.trials.push({ kind: 'hash', shot: sh && sh.label, y: await page.eval('scrollY') });
      await sleep(1500);
    }
    await pullDoc('main');
    // reload with the row in view (scroll restoration): every frame of the new document is recorded from its start
    await page.eval(`scrollTo({ top: ${midY}, behavior: 'instant' })`); await sleep(800);
    const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 45000).catch(() => null);
    await page.send('Page.reload', {});
    await loaded; await sleep(4500);
    result.reloadY = await page.eval('scrollY');
    await pullDoc('reload');
    // back/forward: row in view, navigate to another same-origin document, then history.back() (bfcache restore or a
    // new document with scroll restoration); every frame of the document shown after the traversal is recorded
    if (!KINDS.includes('nohist')) {
      await page.eval(`scrollTo({ top: ${midY}, behavior: 'instant' })`); await sleep(1500);
      let ld = page.waitFor((m) => m.method === 'Page.loadEventFired', 45000).catch(() => null);
      await page.eval(`location.href = '/_app/version.json'`); await ld; await sleep(1200);
      ld = page.waitFor((m) => m.method === 'Page.frameNavigated' || m.method === 'Page.loadEventFired', 45000).catch(() => null);
      await page.eval('history.back()').catch(() => null); await ld; await sleep(4500);
      result.back = await page.eval(`({ y: scrollY, nav: performance.getEntriesByType('navigation')[0]?.type, frames: window.__rec.f.length })`);
      await pullDoc('back');
    }
  } else {
    // replay saved shots, grouped by state (slot srcs + sliding): wait for a group's state, freeze, then for each shot of
    // the group set the same effective time and scroll y and capture the same clip
    const shots = [];
    for (const f of REPLAY.split(',')) shots.push(...JSON.parse(readFileSync(f, 'utf8')).shots);
    const groups = new Map();
    for (const sh of shots) { const k = JSON.stringify([sh.rec[6], sh.rec[5]]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sh); }
    // the same warm-up as the recording run (the section's one-time reveal, image decode)
    await page.eval(`scrollTo({ top: ${farY}, behavior: 'instant' })`); await sleep(2000);
    await page.eval(`scrollTo({ top: ${midY}, behavior: 'instant' })`); await sleep(3500);
    while (groups.size && Date.now() - t0run < 250e3) {
      const want = [...groups.keys()].map((k) => JSON.parse(k));
      const got = await page.eval(`new Promise((res) => {
        const row = document.querySelector('#people .start-selling-avatars'); const want = ${JSON.stringify(want)};
        const t0 = performance.now();
        const chk = () => {
          const cur = [...row.children].map((i) => (i.getAttribute('src') ? new URL(i.getAttribute('src'), location.href).pathname : '')); const sl = row.classList.contains('is-sliding') ? 1 : 0;
          const an = row.getAnimations({ subtree: true });
          const j = want.findIndex(([s, w]) => w === sl && s.length === cur.length && s.every((c, i) => c === cur[i]));
          if (j >= 0 && (!sl || (an.length && an.every((a) => a.currentTime !== null)))) { window.__hold = true; for (const a of an) a.pause(); return res(j); }
          if (performance.now() - t0 > 25000) return res(-1);
          requestAnimationFrame(chk);
        };
        chk();
      })`, { timeout: 30000 });
      if (got < 0) break;
      const key = JSON.stringify(want[got]);
      for (const sh of groups.get(key)) {
        const anims = sh.rec[7];
        const eff = anims.length ? anims[0][1] - anims[0][2] : null;   // currentTime - delay
        await page.eval(`(() => { const row = document.querySelector('#people .start-selling-avatars');
          ${eff === null ? '' : `for (const a of row.getAnimations({ subtree: true })) a.currentTime = ${eff} + (+a.effect.getTiming().delay);`}
          scrollTo({ top: ${sh.yCap}, behavior: 'instant' }); })()`);
        await sleep(SETTLE);
        const anNow = await page.eval(`(() => document.querySelector('#people .start-selling-avatars').getAnimations({ subtree: true }).map((a) => [a.animationName, a.currentTime, +a.effect.getTiming().delay, a.effect.getComputedTiming().progress]))()`);
        const file = join(SHOTDIR, `replay-${ARM}-${sh.label}.png`);
        const c = await capture(file);
        result.replays.push({ label: sh.label, file, anNow, eff, ...c, topDelta: +(c.capTop - sh.capTop).toFixed(2), leftDelta: +(c.capLeft - sh.capLeft).toFixed(2), clipSame: JSON.stringify(c.clip) === JSON.stringify(sh.clip) });
      }
      groups.delete(key);
      await unfreeze();
    }
    for (const g of groups.values()) for (const sh of g) result.replays.push({ label: sh.label, error: 'state not reached' });
  }
} catch (e) {
  result.fatal = String(e && e.stack || e);
} finally {
  result.errors = errors;
  writeFileSync(OUT, JSON.stringify(result));
  const nf = result.docs.reduce((a, d) => a + d.frames.length, 0), ne = result.docs.reduce((a, d) => a + d.events.length, 0);
  console.log(`${ARM} w${W}${REDUCED ? ' reduced' : ''}: docs ${result.docs.length} frames ${nf} events ${ne} shots ${result.shots.length} replays ${result.replays.length} errors ${errors.length} ${((Date.now() - t0run) / 1000).toFixed(0)} s${result.fatal ? ' FATAL ' + result.fatal.split('\n')[0] : ''}`);
  cdp.close(); await chrome.close();
}

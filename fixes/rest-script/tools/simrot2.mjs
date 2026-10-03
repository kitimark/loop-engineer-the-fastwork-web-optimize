#!/usr/bin/env node
// rest-script P-089 Simulator identity harness (functional; no timing claim). Successor of the v4 simrot.mjs with four
// changes, all written and hashed before any run (fixes/rest-script/README.md "P-089 registration"):
//   1. Slide events without the Debugger. The v4 logpoints (Debugger.setBreakpointByUrl) fired 0 times in WebKit, so
//      every v4 Sim trial that waited for a slide start timed out. The rotator's timer helper `f(e)` reads
//      window.setTimeout at call time (overlay line 11707 fix / 11575 st6-rb2, `let r = window.setTimeout(() => {`),
//      and a slide is `S = true; await f(220); x += 1; S = false`. The injected setTimeout wrapper logs 'start' when it
//      is called with 220 ms and the first `2.DyWL8TcE.js:<line>:` frame of its stack is that line (or up to 4 lines
//      below: the call spans 11707-11710; any other 220 ms caller is counted in hook.other220), and 'fire' when that timer's
//      callback runs (the slide's last frame: x advances and S clears in the continuation). No other caller of the
//      helper uses 220 ms (f(800) is the only other call). A run with no 'start' is VOID (`hook.starts === 0`).
//   2. Parts. Every frozen shot and every replay records each avatar slot's border box (getBoundingClientRect), and
//      computed opacity, transform and clip-path, read in the same frame as the freeze (moving check: t2aux.mjs parts).
//   3. Quiet rest (F-200). After the v4 rest shot: wait for a slide's 'fire', freeze the row at the next frame (timers
//      held: no slide can start), then no screenshot and no scroll for QUIET ms (2500), then the screenshot. The record
//      keeps the gap from the last slide's 'fire' and from the previous screenshot to this shot; < 1500 ms is VOID.
//      Replays of a quiet shot settle QUIET ms instead of SETTLE.
//   4. --pin optimizeQuality|optimizeSpeed (F-200 diagnostic arms): a style rule
//      `#people .start-selling-avatars img { image-rendering: <pin> !important }` added before the first scroll; the
//      computed imageRendering of the slots is recorded (a pin that did not take is VOID).
//   5. --reduced (the session sets the mode: sim.mjs session --reduce-motion on, I-100, 0b082d16; this flag sets
//      nothing). Every run, in both modes, logs matchMedia('(prefers-reduced-motion: reduce)') as reducedMatches; a
//      value that does not match the leg (reduce in a normal leg, no-preference in a reduced one) is VOID. --reduced records the hook's slide starts (the rotator
//      does not run under reduced motion in either arm), and takes rest, quiet, jump-0, far-0 and intoview without
//      waiting for a slide.
// Runs inside `tools/sim.mjs [--device fw-sim|fw-ipad] session --functional` (FW_IPHONE_PORT, FW_SIM_UDID).
// usage: node simrot2.mjs --url <http url> --arm st6|fix --out <json> [--replay a.json] [--labels rest,quiet,...]
//          [--pin optimizeQuality|optimizeSpeed] [--kinds smooth,jump,outin] [--phases 0,40,100,160,215] [--only rest,quiet]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a326003adcb764633';
const { openTab, sleep } = await import(WT + '/fixes/fwreskip/tools/simtab.mjs');
const { runAsync } = await import(WT + '/tools/lib/wip.mjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL0 = arg('--url'), ARM = arg('--arm'), OUT = arg('--out');
const SHOTDIR = OUT.replace(/\.json$/, '-shots'); mkdirSync(SHOTDIR, { recursive: true });
const KINDS = arg('--kinds', 'smooth,jump,outin').split(',').filter(Boolean);
const PHASES = arg('--phases', '0,40,100,160,215').split(',').map(Number);
const ONLY = arg('--only', null) ? arg('--only').split(',') : null;          // run mode: rest,quiet only (pin arms)
const LABELS = arg('--labels', null) ? arg('--labels').split(',') : null;    // replay mode: label tails to replay
const REPLAY = arg('--replay', null);
const PIN = arg('--pin', null);
const REDUCED = process.argv.includes('--reduced');   // the session sets the mode (sim.mjs --reduce-motion on); this adapts the trials and the check
if (PIN && !['optimizeQuality', 'optimizeSpeed'].includes(PIN)) throw new Error('--pin optimizeQuality|optimizeSpeed');
const UDID = process.env.FW_SIM_UDID;
const SETTLE = 1200, QUIET = 2500, QUIET_MIN = 1500;
const t0run = Date.now();
const tail = (l) => l.replace(/^[a-z0-9]+-(?:sim-|\d+-)/, '');

// the helper's setTimeout line in the overlay served to this arm (1-based, as WebKit stacks print it)
const ov = ARM === 'fix' ? 'rest-script' : 'st6-rb2';
const src = readFileSync(join(WT, 'fixes', ov, 'overlay/_app/immutable/nodes/2.DyWL8TcE.js'), 'utf8').split('\n');
const START = ARM === 'fix' ? 'if ((fwSetS(!0), await f(220), a)) return;' : 'if ((z(S, !0), await f(220), a)) return;';
const startL = src.findIndex((l) => l.trim() === START);
if (startL < 0) throw new Error('slide start line not found in ' + ov);
let helperL = -1;
for (let j = startL; j >= 0 && j > startL - 120; j--) if (src[j].trim() === 'let r = window.setTimeout(() => {') { helperL = j + 1; break; }
if (helperL < 0) throw new Error('timer helper line not found in ' + ov);

// injected after load (and as the bootstrap of a reload): timer hold + slide hook, event log, per-frame recorder
const INJECT = `(() => {
  if (window.__rec) return;
  const ST = window.setTimeout, L0 = ${helperL}; window.__held = []; window.__hold = false; window.__hook = { starts: 0, fires: 0, stack: null, other220: 0 };
  window.setTimeout = function (fn, ms, ...a) {
    let slide = false;
    if (ms === 220) { const st = String(new Error().stack || ''), m = st.match(/2\\.DyWL8TcE\\.js:(\\d+):/), ln = m ? +m[1] : -1; if (!(ln >= L0 && ln <= L0 + 4)) window.__hook.other220++; else { slide = true; window.__hook.starts++; if (!window.__hook.stack) window.__hook.stack = st.split('\\n').slice(0, 3).join(' | '); window.__rl('start'); } }
    return ST.call(window, function () { if (window.__hold) window.__held.push(() => { if (slide) { window.__hook.fires++; window.__rl('fire'); } fn(...a); }); else { if (slide) { window.__hook.fires++; window.__rl('fire'); } fn(...a); } }, ms);
  };
  window.__release = () => { window.__hold = false; const h = window.__held.splice(0); for (const f of h) f(); return h.length; };
  window.__ev = []; window.__d = null;
  window.__rl = (k) => { const t = performance.now(); window.__ev.push([k, +t.toFixed(2)]); if (k === 'start' && window.__onStart) window.__onStart(t); if (k === 'fire' && window.__onFire) window.__onFire(t); };
  const R = window.__rec = { f: [], mut: [], gate: [], frz: [] };
  window.__parts = (row) => [...row.children].map((i) => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i); return [+r.left.toFixed(3), +r.top.toFixed(3), +r.width.toFixed(3), +r.height.toFixed(3), cs.opacity, cs.transform, cs.clipPath, cs.imageRendering]; });
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
          window.__frozen = { rec, top: r.top, left: r.left, w: r.width, h: r.height, y: scrollY, mutAfter: 0, at: performance.now(), parts: window.__parts(row) }; R.frz.push([t, null]);
        }
      }
      R.f.push(rec);
    }).observe(probe);
    return true;
  };
  const loop = (t) => { if (!probe) attach(); if (probe) { T = t; tn = performance.now(); probe.style.width = (++k % 2 ? 2 : 1) + 'px'; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})()`;
if (process.argv.includes('--print-inject')) { console.log(INJECT); process.exit(0); }   // desk check: no Sim, no page
const PINCSS = PIN ? `(() => { const s = document.createElement('style'); s.id = '__fwpin'; s.textContent = '#people .start-selling-avatars img { image-rendering: ${PIN} !important }'; document.head.append(s); return 1; })()` : null;

let c = null;
const errors = [];
async function go(url) {
  const host = new URL(url).host;
  if (!c) c = await openTab((u) => u.startsWith('http'));
  await c.evaluate(`setTimeout(() => { location.href = ${JSON.stringify(url)}; }, 50); 'ok'`).catch(() => {});
  try { c.close(); } catch {}
  await sleep(2500);
  c = await openTab(host);
  for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
}
const ev = (expr) => c.evaluate(expr, 'page', 20000);
const evA = (expr, ms = 60000) => runAsync(c, expr, { timeoutMs: ms, pollMs: 60 });
const result = { harness: 'simrot2.mjs', arm: ARM, pin: PIN, url: URL0.replace(/\/\/[^/]+/, '//localhost'), engine: 'webkit-sim', helperLine: helperL, settle: SETTLE, quiet: QUIET, trials: [], shots: [], replays: [], docs: [] };
const pullDoc = async (label) => { const rec = JSON.parse(await ev('JSON.stringify(window.__rec)')); result.docs.push({ label, frames: rec.f, mut: rec.mut, gate: rec.gate, frz: rec.frz, events: JSON.parse(await ev('JSON.stringify(window.__ev)')), hook: JSON.parse(await ev('JSON.stringify(window.__hook)')) }); };

let lastShotAt = 0;   // Date.now() of the last simctl screenshot (shot or calibration)
const screenshot = (f) => { execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', f], { stdio: 'ignore' }); lastShotAt = Date.now(); };
const capture = async (file) => {
  const r = await ev(`(() => { const row = document.querySelector('#people .start-selling-avatars'), r = row.getBoundingClientRect(); return JSON.stringify({ left: r.left, top: r.top, w: r.width, h: r.height, y: scrollY, iw: innerWidth, ih: innerHeight, parts: window.__parts(row) }); })()`).then(JSON.parse);
  const before = lastShotAt; const tShot = Date.now();
  screenshot(file);
  await ev(`(() => { const m = document.createElement('div'); m.id = '__fwcal'; m.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ff00ff'; document.documentElement.append(m); return 1; })()`);
  await sleep(350);
  const cal = file.replace(/\.png$/, '-cal.png'); screenshot(cal);
  await ev(`(document.getElementById('__fwcal').remove(), 1)`);
  const parts = r.parts; delete r.parts;
  return { rect: r, cal, parts, capTop: +r.top.toFixed(2), capLeft: +r.left.toFixed(2), yCap: Math.round(r.y), sincePrevShotMs: before ? tShot - before : null };
};
const freezeShot = async (label, extra, settle = SETTLE) => {
  let fz = null;
  for (let i = 0; i < 150 && !fz; i++) { fz = JSON.parse(await ev('JSON.stringify(window.__frozen || null)')); if (!fz) await sleep(20); }
  if (!fz) return null;
  await sleep(settle);
  const file = join(SHOTDIR, `${label}.png`);
  const s = { label, file, rec: fz.rec, y: fz.y, top: fz.top, frozenParts: fz.parts, frozenAt: fz.at, ...extra, ...(await capture(file)) };
  s.mutAfter = await ev('window.__frozen.mutAfter');
  result.shots.push(s);
  await ev(`(() => { window.__frozen = null; const fz = window.__rec.frz[window.__rec.frz.length - 1]; if (fz && fz[1] === null) fz[1] = performance.now(); for (const a of document.querySelector('#people .start-selling-avatars').getAnimations({ subtree: true })) a.play(); return window.__release(); })()`);
  return s;
};

try {
  if (!UDID) throw new Error('needs FW_SIM_UDID (inside sim.mjs session)');
  await go(URL0);
  c.on((m) => { if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Console.messageAdded' && m.params.message.level === 'error')) errors.push(JSON.stringify(m.params).slice(0, 200)); });
  try { await c.send('Page.setBootstrapScript', { source: INJECT }); result.bootstrap = true; } catch (e) { result.bootstrap = String(e.message || JSON.stringify(e)); }
  await ev(`${INJECT}; 1`);
  if (PINCSS) { await ev(PINCSS); }
  await sleep(4000);
  const geo = JSON.parse(await ev(`(() => { const r = document.querySelector('#people .start-selling-avatars').getBoundingClientRect(); return JSON.stringify({ top: r.top + scrollY, h: r.height, docH: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent.replace(/\\(.*?\\)/, '()'), imgRendering: [...document.querySelectorAll('#people .start-selling-avatars img')].map((i) => getComputedStyle(i).imageRendering) }); })()`));
  result.geo = geo; const VH = geo.ih; result.w = geo.iw; result.vh = VH;
  if (PIN && !geo.imgRendering.every((v) => v.toLowerCase() === PIN.toLowerCase())) result.void = `pin did not take: ${geo.imgRendering.join(',')}`;
  const enterY = Math.max(0, Math.round(geo.top - VH)), farY = Math.max(0, Math.round(enterY - VH * 0.5 - 250)), pausedY = Math.round(geo.docH - VH), midY = Math.round(geo.top - VH / 2);
  result.ys = { enterY, farY, pausedY, midY };
  const waitEv = (k, ms = 4000) => evA(`new Promise((res) => { const key = '__on' + ${JSON.stringify(k)}; window[key] = (t) => { window[key] = null; res(t); }; setTimeout(() => res(null), ${ms}); })`, ms + 3000);
  const waitStart = (ms) => waitEv('Start', ms), waitFire = (ms) => waitEv('Fire', ms);
  // every run, both modes: the page's reduced-motion state must match the leg (I-100 session flag --reduce-motion)
  result.reducedMatches = await ev("matchMedia('(prefers-reduced-motion: reduce)').matches");
  if (result.reducedMatches !== REDUCED) result.void = (result.void ? result.void + '; ' : '') + `prefers-reduced-motion ${result.reducedMatches ? 'reduce' : 'no-preference'} in a ${REDUCED ? 'reduced' : 'normal'} leg`;
  if (!REPLAY) {
    await ev(`scrollTo({ top: ${farY}, behavior: 'instant' })`); await sleep(2000);
    await ev(`scrollTo({ top: ${midY}, behavior: 'instant' })`); await sleep(3500);
    result.hookCheck = JSON.parse(await ev('JSON.stringify(window.__hook)'));
    if (REDUCED) result.reducedSlides = result.hookCheck.starts;
    else if (!result.hookCheck.starts) result.void = (result.void ? result.void + '; ' : '') + 'no slide start seen by the setTimeout hook (mechanism check failed)';
    // rest (the v4 shot, kept for continuity): 400 ms after a slide start, i.e. ~180 ms after its last frame
    if (!REDUCED) { await waitStart(); await sleep(400); }
    await ev('window.__shotNext = true');
    await freezeShot(`${ARM}-sim-rest`, { kind: 'rest' });
    await sleep(400);
    // quiet rest (F-200): freeze right after a slide's last frame, then QUIET ms with no screenshot, scroll or slide
    const tf = REDUCED ? null : await waitFire(4000);
    await ev('window.__shotNext = true');
    const q = await freezeShot(`${ARM}-sim-quiet`, { kind: 'quiet', lastFire: tf }, QUIET);
    if (q) {
      q.sinceFireMs = tf == null ? null : +(q.frozenAt - tf).toFixed(1) + QUIET;   // freeze-to-shot is >= QUIET (settle)
      q.void = tf == null && !REDUCED ? 'no slide fire seen before the quiet shot' : (q.sincePrevShotMs != null && q.sincePrevShotMs < QUIET_MIN) ? `previous screenshot ${q.sincePrevShotMs} ms before` : null;
    }
    if (!ONLY) {
      for (const kind of (REDUCED ? ['jump'] : KINDS)) for (const ph of (REDUCED ? [0] : kind === 'outin' ? [20, 60] : PHASES)) {
        await ev(`scrollTo({ top: ${kind === 'outin' ? midY : farY}, behavior: 'instant' })`); await sleep(1200);
        const t0 = REDUCED ? (await ev('performance.now()')) - 1020 : await waitStart();
        if (t0 == null) { result.trials.push({ kind, ph, error: 'no slide start seen' }); continue; }
        if (kind === 'smooth') {
          const step = 50, n = Math.ceil((enterY + 2 - farY) / step);
          await evA(`new Promise((res) => setTimeout(() => { let k = 0; window.__shotNext = true; const go = () => { scrollBy({ top: ${step}, behavior: 'instant' }); if (++k < ${n + 8}) requestAnimationFrame(go); else res(1); }; requestAnimationFrame(go); }, Math.max(0, ${t0 + 1020 + ph - n * 16.67} - performance.now())))`);
        } else if (kind === 'outin') {
          await evA(`new Promise((res) => setTimeout(() => { scrollTo({ top: ${farY}, behavior: 'instant' }); setTimeout(() => { window.__shotNext = true; scrollTo({ top: ${midY}, behavior: 'instant' }); res(1); }, 80); }, Math.max(0, ${t0 + 1020 + ph} - performance.now())))`);
        } else {
          await evA(`new Promise((res) => setTimeout(() => { window.__shotNext = true; scrollTo({ top: ${midY}, behavior: 'instant' }); res(1); }, Math.max(0, ${t0 + 1020 + ph} - performance.now())))`);
        }
        const s = await freezeShot(`${ARM}-sim-${kind}-${ph}`, { kind, ph });
        await sleep(400);
        result.trials.push({ kind, ph, t0, shot: s && s.label });
      }
      await ev(`scrollTo({ top: ${pausedY}, behavior: 'instant' })`); await sleep(2200);
      await ev(`(() => { window.__shotNext = true; scrollTo({ top: ${midY}, behavior: 'instant' }); return 1; })()`);
      await freezeShot(`${ARM}-sim-far-0`, { kind: 'far', ph: 0 }); await sleep(800);
      await ev(`scrollTo({ top: ${pausedY}, behavior: 'instant' })`); await sleep(2200);
      await ev(`(() => { window.__shotNext = true; document.querySelector('#people .start-selling-avatars').scrollIntoView({ block: 'center', behavior: 'instant' }); return 1; })()`);
      await freezeShot(`${ARM}-sim-intoview`, { kind: 'intoview' }); await sleep(800);
    }
    await pullDoc('main');
  } else {
    const shots = [];
    for (const f of REPLAY.split(',')) shots.push(...JSON.parse(readFileSync(f, 'utf8')).shots.filter((s) => !LABELS || LABELS.includes(tail(s.label))));
    const groups = new Map();
    for (const sh of shots) { const k = JSON.stringify([sh.rec[6], sh.rec[5]]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sh); }
    await ev(`scrollTo({ top: ${farY}, behavior: 'instant' })`); await sleep(2000);
    await ev(`scrollTo({ top: ${midY}, behavior: 'instant' })`); await sleep(3500);
    result.hookCheck = JSON.parse(await ev('JSON.stringify(window.__hook)'));
    while (groups.size && Date.now() - t0run < 200e3) {
      const want = [...groups.keys()].map((k) => JSON.parse(k));
      const got = await evA(`new Promise((res) => {
        const row = document.querySelector('#people .start-selling-avatars'); const want = ${JSON.stringify(want)}; const t0 = performance.now();
        const chk = () => {
          const cur = [...row.children].map((i) => (i.getAttribute('src') ? new URL(i.getAttribute('src'), location.href).pathname : '')); const sl = row.classList.contains('is-sliding') ? 1 : 0;
          const an = row.getAnimations({ subtree: true });
          const j = want.findIndex(([s, w]) => w === sl && s.length === cur.length && s.every((c, i) => c === cur[i]));
          if (j >= 0 && (!sl || (an.length && an.every((a) => a.currentTime !== null)))) { window.__hold = true; for (const a of an) a.pause(); return res(j); }
          if (performance.now() - t0 > 25000) return res(-1);
          requestAnimationFrame(chk);
        };
        chk();
      })`, 32000);
      if (got < 0) break;
      const key = JSON.stringify(want[got]);
      for (const sh of groups.get(key)) {
        const anims = sh.rec[7]; const eff = anims.length ? anims[0][1] - anims[0][2] : null;
        await ev(`(() => { const row = document.querySelector('#people .start-selling-avatars');
          ${eff === null ? '' : `for (const a of row.getAnimations({ subtree: true })) a.currentTime = ${eff} + (+a.effect.getTiming().delay);`}
          scrollTo({ top: ${sh.yCap}, behavior: 'instant' }); return 1; })()`);
        await sleep(sh.kind === 'quiet' ? QUIET : SETTLE);
        const file = join(SHOTDIR, `replay-${ARM}${PIN ? '-' + PIN : ''}-${sh.label}.png`);
        const cp = await capture(file);
        result.replays.push({ label: sh.label, kind: sh.kind, file, eff, ...cp, topDelta: +(cp.capTop - sh.capTop).toFixed(2), leftDelta: +(cp.capLeft - sh.capLeft).toFixed(2) });
      }
      groups.delete(key);
      await ev(`(() => { for (const a of document.querySelector('#people .start-selling-avatars').getAnimations({ subtree: true })) a.play(); return window.__release(); })()`);
    }
    for (const g of groups.values()) for (const sh of g) result.replays.push({ label: sh.label, error: 'state not reached' });
  }
} catch (e) {
  result.fatal = String(e && e.stack || e);
} finally {
  result.errors = errors;
  try { await c.send('Page.setBootstrapScript', {}); } catch {}
  writeFileSync(OUT, JSON.stringify(result));
  const nf = result.docs.reduce((a, d) => a + d.frames.length, 0), ne = result.docs.reduce((a, d) => a + d.events.length, 0);
  console.log(`SIM2 ${ARM}${PIN ? ' pin ' + PIN : ''}${REDUCED ? ' reduced' : ''}: prefers-reduced-motion ${result.reducedMatches ? 'reduce' : result.reducedMatches === false ? 'no-preference' : '?'} hook starts ${result.hookCheck?.starts ?? '?'} fires ${result.hookCheck?.fires ?? '?'} docs ${result.docs.length} frames ${nf} events ${ne} shots ${result.shots.length} replays ${result.replays.length} errors ${errors.length} ${result.void ? 'VOID ' + result.void : ''} ${((Date.now() - t0run) / 1000).toFixed(0)} s${result.fatal ? ' FATAL ' + result.fatal.split('\n')[0] : ''}`);
  try { c.close(); } catch {}
}

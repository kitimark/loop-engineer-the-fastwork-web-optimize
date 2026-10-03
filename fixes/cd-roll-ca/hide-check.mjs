#!/usr/bin/env node
// cd-roll-ca hidden-tab check (functional, times nothing; review-cd-roll-ca round 1, B1).
//
// Headed Chrome hides the page for real (a second tab is activated in the same window for --hide-ms, then the page's
// tab is activated again), --cycles times at different tick phases. Logged in the page (script injected before the
// bundle): document.hidden, the number of pending requestAnimationFrame callbacks (window.requestAnimationFrame and
// cancelAnimationFrame are wrapped; the logger's own rAF is not counted), each hero digit strip's computed translateY
// per frame, and every Web Animation the build starts on a hero strip (time, hidden, first/last keyframe px, startTime).
// Reports per cycle: pending callbacks before the hide, max while hidden, after the show; the rolls started while
// hidden and their start value vs the value the strip showed at the last frame before the hide (the original's spring
// holds that value: no frames run while hidden); the first frame after the show vs the original's spring
// (GE(held -> target, firstFrame - t0) in one call, as its rAF callback does after a gap).
//
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-cd-roll-ca -- \
//     node fixes/cd-roll-ca/hide-check.mjs --state out/serve-x.json --arm V --out out/cd-roll-ca/hide-V.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../tools/lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const statePath = arg('--state');
const arm = arg('--arm', 'V');
const outPath = arg('--out', `out/cd-roll-ca/hide-${arm}.json`);
const cycles = Number(arg('--cycles', '4'));
const hideMs = Number(arg('--hide-ms', '3000'));
const showMs = Number(arg('--show-ms', '2250'));

const UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16;
function GE(e, t, n, r = UE) { let { value: i, velocity: a } = e, o = Math.max(0, n); for (; o > 0;) { let e = Math.min(o, WE) / 1e3; o -= WE; let n = (-r.stiffness * (i - t) - r.damping * a) / r.mass; a += n * e; i += a * e; }
  return Math.abs(a) < 0.01 && Math.abs(i - t) < 0.001 ? { state: { value: t, velocity: 0 }, done: true } : { state: { value: i, velocity: a }, done: false }; }

const INJECT = `(() => {
  const P = new Set(), rq = window.requestAnimationFrame.bind(window), cq = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { let id; id = rq(function (t) { P.delete(id); return cb.call(this, t); }); P.add(id); return id; };
  window.cancelAnimationFrame = function (id) { P.delete(id); return cq(id); };
  const L = window.__hc = { frames: [], vis: [], samples: [], anims: [], rec: false };
  const hero = () => [...document.querySelectorAll('[role=timer]:not(.inverse) .digit > .strip')];
  const tyOf = (s) => { const m = getComputedStyle(s).transform; if (!m || m === 'none') return 0; const v = m.match(/matrix(3d)?\\(([^)]+)\\)/); if (!v) return NaN; const p = v[2].split(',').map(Number); return v[1] ? p[13] : p[5]; };
  const pxOf = (t) => { const m = /translateY\\((-?[\\d.e+-]+)px\\)/.exec(t || ''); return m ? Number(m[1]) : NaN; };
  const cell = (s) => parseFloat(s.children[1]?.style.top) || 0;
  const ani = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    const a = ani.call(this, k, o);
    if (L.rec && this.matches?.('[role=timer]:not(.inverse) .digit > .strip')) {
      const i = hero().indexOf(this);
      const rec = { i, now: performance.now(), hidden: document.hidden, from: pxOf(k[0]?.transform), to: pxOf(k[k.length - 1]?.transform), c: cell(this), n: k.length, dur: o?.duration };
      L.anims.push(rec);
      queueMicrotask(() => { rec.startTime = a.startTime; });
    }
    return a;
  };
  document.addEventListener('visibilitychange', () => {
    if (!L.rec) return;
    L.vis.push({ now: performance.now(), hidden: document.hidden, tl: document.timeline.currentTime, pending: P.size, ty: hero().map(tyOf) });
  });
  setInterval(() => { if (L.rec) L.samples.push({ now: performance.now(), hidden: document.hidden, pending: P.size }); }, 100);
  const step = (t) => {
    if (L.rec) { const ss = hero(); L.frames.push({ t, cb: performance.now(), hidden: document.hidden, pending: P.size, ty: ss.map(tyOf), c: ss.map(cell) }); }
    rq(step);
  };
  rq(step);
})();`;

// --analyze <hide-x.json>: re-run the analysis below on a saved file (no Chrome)
const analyzeFile = arg('--analyze');
let log, meta, url, browser, errors = [], served = {}, servedHash = {}, cyc = [];
if (analyzeFile) {
  const old = JSON.parse(readFileSync(join(root, analyzeFile), 'utf8'));
  ({ log, meta, url, served, errors } = old);
  browser = old.browser; servedHash = old.servedHash || {};
  cyc = old.cyc || old.per.map((p) => ({ k: p.k, mid: { hidden: p.hiddenConfirmed, vs: p.visibilityState } }));
} else {
const state = JSON.parse(readFileSync(join(root, statePath), 'utf8'));
url = state.url || `https://localhost:${state.port}/`;
const profileDir = tempProfileDir(join(root, 'out', 'cd-roll-ca', 'chrome'), `cd-roll-ca-hide-${arm}`);
const chrome = await launchChrome({ port: 0, profileDir, headless: false, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
browser = chrome.browser;
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await page.send('Network.enable');
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args?.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Network.responseReceived' && /nodes\/2\.DyWL8TcE\.js|assets\/2\.gBuqKVzi\.css/.test(m.params.response.url)) {
      const h = m.params.response.headers; served[m.params.response.url.replace(/^.*\/_app/, '/_app')] = h['x-mirror-source'] || h['X-Mirror-Source'] || null;
    }
  });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  await sleep(2500);
  await page.eval('window.__hc.rec = true');
  await sleep(1500);
  for (let k = 0; k < cycles; k++) {
    // shift the hide phase against the 1 s tick by ~250 ms per cycle
    await sleep(250 * k);
    const before = await page.eval('({ now: performance.now(), hidden: document.hidden })');
    const { targetId: other } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: page.browserContextId });
    await cdp.send('Target.activateTarget', { targetId: other });
    await sleep(300);
    const mid = await page.eval('({ now: performance.now(), hidden: document.hidden, vs: document.visibilityState })');
    await sleep(Math.max(0, hideMs - 300));
    await cdp.send('Target.activateTarget', { targetId: page.targetId });
    await sleep(150);
    const after = await page.eval('({ now: performance.now(), hidden: document.hidden })');
    try { await cdp.send('Target.closeTarget', { targetId: other }); } catch {}
    cyc.push({ k, before, mid, after });
    await sleep(showMs);
  }
  await page.eval('window.__hc.rec = false');
  log = await page.eval('window.__hc');
  meta = await page.eval('({ ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight })');
} finally {
  await page.close(); cdp.close(); await chrome.close();
}
for (const f of ['/_app/immutable/nodes/2.DyWL8TcE.js', '/_app/immutable/assets/2.gBuqKVzi.css']) {
  try { servedHash[f] = createHash('sha256').update(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())).digest('hex'); } catch { servedHash[f] = null; }
}
}

// ---- analysis ----
const r3 = (x) => (x == null || Number.isNaN(x) ? x : Math.round(x * 1000) / 1000);
const F = log.frames, S = log.samples, V = log.vis;
const hides = V.filter((v) => v.hidden), shows = V.filter((v) => !v.hidden);
const per = cyc.map((c, k) => {
  const h = c.before ? hides.find((v) => v.now >= c.before.now - 5 && v.now <= c.mid.now + 5) : hides[k];
  const s = h && shows.find((v) => v.now > h.now);
  if (!h || !s) return { k, hiddenConfirmed: !!c.mid.hidden, error: 'no visibilitychange pair' };
  const preF = [...F].reverse().find((f) => f.t <= h.now && !f.hidden) || [...F].reverse().find((f) => f.cb <= h.now);
  const postF = F.find((f) => f.cb > s.now && !f.hidden);
  const framesWhileHidden = F.filter((f) => f.cb > h.now && f.cb < s.now).length;
  const pendBefore = S.filter((x) => x.now < h.now).slice(-1)[0]?.pending;
  const pendHidden = S.filter((x) => x.now > h.now && x.now < s.now).map((x) => x.pending);
  const pendAfter = S.filter((x) => x.now > s.now + 1000)[0]?.pending;
  const hiddenRolls = log.anims.filter((a) => a.now > h.now && a.now < s.now);
  // every roll started after the hide and before the first frame after the show (hidden ticks, and the tick cD runs on
  // the show's visibilitychange): no frame ran since the hide, so the original starts each of them from the value of
  // the last frame before the hide (its spring state `a` is frozen there)
  const gapRolls = log.anims.filter((a) => a.now > h.now && (!postF || a.now <= postF.cb));
  const startErr = gapRolls.map((a) => ({ i: a.i, now: r3(a.now), hidden: a.hidden, from: r3(a.from), held: r3(preF?.ty[a.i]), err: r3(Math.abs(a.from - (preF?.ty[a.i] ?? NaN))) }));
  // first frame after the show vs the original's spring: from the held value to the latest target, one GE call over
  // (first frame - change time), as its rAF callback does after the gap (a frame stamp before the change steps nothing)
  const first = [];
  if (postF && preF) {
    for (let i = 0; i < postF.ty.length; i++) {
      const last = gapRolls.filter((a) => a.i === i).slice(-1)[0];
      if (!last) continue;
      const c = last.c, held = -preF.ty[i] / c, to = -last.to / c, t0 = last.startTime ?? last.now;
      const o = GE({ value: held, velocity: 0 }, to, postF.t - t0);
      const exp = -(((o.state.value % 10) + 10) % 10) * c;
      first.push({ i, rollAt: last.hidden ? 'hidden tick' : 'show tick', dtMs: r3(postF.t - t0), build: r3(postF.ty[i]), originalModel: r3(exp), errPx: r3(Math.abs(postF.ty[i] - exp)) });
    }
  }
  return {
    k, hiddenConfirmed: !!c.mid.hidden, visibilityState: c.mid.vs, hiddenMs: r3(s.now - h.now), framesWhileHidden,
    rollingAtHide: preF ? preF.ty.some((y, i) => Math.abs(y / (preF.c[i] || 1) - Math.round(y / (preF.c[i] || 1))) > 1e-3) : null,
    pending: { beforeHide: pendBefore, atHide: h.pending, maxWhileHidden: pendHidden.length ? Math.max(...pendHidden) : null, atShow: s.pending, after1s: pendAfter },
    hiddenRolls: hiddenRolls.length, gapRolls: gapRolls.length, startValueVsHeld: startErr, firstFrameAfterShow: first,
  };
});
const out = {
  tool: 'fixes/cd-roll-ca/hide-check.mjs', arm, url, browser, headless: false, meta, served, servedHash, errors,
  cycles: cyc.length, hideMs, showMs, cyc, per,
  summary: {
    hiddenConfirmed: per.every((p) => p.hiddenConfirmed),
    framesWhileHidden: per.reduce((a, p) => a + (p.framesWhileHidden || 0), 0),
    maxPendingWhileHidden: Math.max(...per.map((p) => p.pending?.maxWhileHidden ?? 0)),
    maxPendingAtShow: Math.max(...per.map((p) => p.pending?.atShow ?? 0)),
    hiddenRolls: per.reduce((a, p) => a + (p.hiddenRolls || 0), 0),
    maxStartErrPx: Math.max(0, ...per.flatMap((p) => (p.startValueVsHeld || []).map((x) => x.err))),
    maxFirstFrameErrPx: Math.max(0, ...per.flatMap((p) => (p.firstFrameAfterShow || []).map((x) => x.errPx))),
    errors: errors.length,
  },
  log,
};
writeFileSync(join(root, analyzeFile && !process.argv.includes('--out') ? analyzeFile : outPath), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ arm, served, ...out.summary, per: per.map(({ k, hiddenConfirmed, hiddenMs, framesWhileHidden, rollingAtHide, pending, hiddenRolls }) => ({ k, hiddenConfirmed, hiddenMs, framesWhileHidden, rollingAtHide, pending, hiddenRolls })) }));

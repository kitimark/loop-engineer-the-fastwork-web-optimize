// cd-roll-ca: WebKit (iOS Simulator, Mobile Safari) hidden-page check, functional, COUNTS only (F-084: Simulator
// times never count). The WebKit twin of hide-check.mjs (Chrome).
// Per arm (snapshot copies out/cd-roll-ca/snap/C and /V), at the top of the page: after load, the logger below is
// installed by Runtime.evaluate (requestAnimationFrame / cancelAnimationFrame / Element.prototype.animate wrapped from
// then on: callbacks requested before it are not counted), then --cycles times Safari is sent to the background by
// launching Settings (`simctl launch <udid> com.apple.Preferences`) for --hide-ms and brought back
// (`simctl launch <udid> com.apple.mobilesafari`). Logged in the page: visibilitychange (hidden, visibilityState),
// pending rAF callbacks (100 ms interval while timers run), hero strip translateY per frame, every Web Animation
// started on a hero strip, errors. Same analysis as hide-check.mjs.
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-cd-roll-ca -- \
//     node tools/sim.mjs session --functional --owner fix-cd-roll-ca -- node fixes/cd-roll-ca/sim-hide.mjs [C,V] [cycles] [hideMs]
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const ARMS = (process.argv[2] || 'C,V').split(',');
const CYCLES = Number(process.argv[3] || 3);
const HIDE_MS = Number(process.argv[4] || 10000);
const SHOW_MS = 3000;
const UDID = process.env.FW_SIM_UDID;
const ANALYZE = process.argv[2] === '--analyze' ? process.argv[3] : null;
if (!UDID && !ANALYZE) { console.error('FW_SIM_UDID not set: run inside `sim.mjs session`'); process.exit(1); }
const OUT = join(WT, 'out/cd-roll-ca');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const SNAP = join(OUT, 'snap');

const UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16;
function GE(e, t, n, r = UE) { let { value: i, velocity: a } = e, o = Math.max(0, n); for (; o > 0;) { let e = Math.min(o, WE) / 1e3; o -= WE; let n = (-r.stiffness * (i - t) - r.damping * a) / r.mass; a += n * e; i += a * e; }
  return Math.abs(a) < 0.01 && Math.abs(i - t) < 0.001 ? { state: { value: t, velocity: 0 }, done: true } : { state: { value: i, velocity: a }, done: false }; }

const INJECT = `(() => {
  if (window.__hc) return 'again';
  const P = new Set(), rq = window.requestAnimationFrame.bind(window), cq = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) { let id; id = rq(function (t) { P.delete(id); return cb.call(this, t); }); P.add(id); return id; };
  window.cancelAnimationFrame = function (id) { P.delete(id); return cq(id); };
  const L = window.__hc = { frames: [], vis: [], samples: [], anims: [], errors: [], rec: false };
  addEventListener('error', (e) => L.errors.push(String(e.message || e)));
  addEventListener('unhandledrejection', (e) => L.errors.push('rejection: ' + String(e.reason)));
  const hero = () => [...document.querySelectorAll('[role=timer]:not(.inverse) .digit > .strip')];
  const tyOf = (s) => { const m = getComputedStyle(s).transform; if (!m || m === 'none') return 0; const v = m.match(/matrix(3d)?\\(([^)]+)\\)/); if (!v) return NaN; const p = v[2].split(',').map(Number); return v[1] ? p[13] : p[5]; };
  const pxOf = (t) => { const m = /translateY\\((-?[\\d.e+-]+)px\\)/.exec(t || ''); return m ? Number(m[1]) : NaN; };
  const cell = (s) => parseFloat(s.children[1]?.style.top) || 0;
  const ani = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    const a = ani.call(this, k, o);
    if (L.rec && this.matches?.('[role=timer]:not(.inverse) .digit > .strip')) {
      const rec = { i: hero().indexOf(this), now: performance.now(), hidden: document.hidden, from: pxOf(k[0]?.transform), to: pxOf(k[k.length - 1]?.transform), c: cell(this), n: k.length, dur: o?.duration };
      L.anims.push(rec);
      queueMicrotask(() => { rec.startTime = a.startTime; });
    }
    return a;
  };
  // round 3: every change of a hero strip's inline transform = a target change (the build writes the target there;
  // snaps included); used by the full-chain model of the original (chain() below). In C it also changes per frame.
  L.inl = [];
  new MutationObserver((ms) => {
    if (!L.rec) return;
    const now = performance.now(), hs = hero();
    for (const m of ms) { const i = hs.indexOf(m.target); if (i >= 0) L.inl.push({ i, now, hidden: document.hidden, px: pxOf(m.target.style.transform), c: cell(m.target) }); }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  document.addEventListener('visibilitychange', () => {
    if (!L.rec) return;
    L.vis.push({ now: performance.now(), hidden: document.hidden, vs: document.visibilityState, tl: document.timeline.currentTime, pending: P.size, ty: hero().map(tyOf) });
  });
  setInterval(() => { if (L.rec) L.samples.push({ now: performance.now(), hidden: document.hidden, pending: P.size }); }, 100);
  const step = (t) => {
    if (L.rec) { const ss = hero(); L.frames.push({ t, cb: performance.now(), hidden: document.hidden, pending: P.size, ty: ss.map(tyOf), c: ss.map(cell) }); }
    rq(step);
  };
  rq(step);
  return 'ok';
})()`;

async function server(arm) {
  const st = join(OUT, `serve-simhide-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, arm), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}
const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).toString().trim();
const r3 = (x) => (x == null || Number.isNaN(x) ? x : Math.round(x * 1000) / 1000);

function analyze(log) {
  const F = log.frames, S = log.samples, V = log.vis;
  const hides = V.filter((v) => v.hidden), shows = V.filter((v) => !v.hidden);
  return hides.map((h, k) => {
    const s = shows.find((v) => v.now > h.now);
    if (!s) return { k, error: 'no show event' };
    const preF = [...F].reverse().find((f) => f.t <= h.now && !f.hidden) || [...F].reverse().find((f) => f.cb <= h.now);
    const postF = F.find((f) => f.cb > s.now && !f.hidden);
    const pendHidden = S.filter((x) => x.now > h.now && x.now < s.now).map((x) => x.pending);
    const hiddenRolls = log.anims.filter((a) => a.now > h.now && a.now < s.now);
    const gapRolls = log.anims.filter((a) => a.now > h.now && (!postF || a.now <= postF.cb));
    const startErr = gapRolls.map((a) => ({ i: a.i, now: r3(a.now), hidden: a.hidden, from: r3(a.from), held: r3(preF?.ty[a.i]), err: r3(Math.abs(a.from - (preF?.ty[a.i] ?? NaN))) }));
    const first = [];
    if (postF && preF) for (let i = 0; i < postF.ty.length; i++) {
      const last = gapRolls.filter((a) => a.i === i).slice(-1)[0];
      if (!last) continue;
      const c = last.c, held = -preF.ty[i] / c, to = -last.to / c, t0 = last.startTime ?? last.now;
      const o = GE({ value: held, velocity: 0 }, to, postF.t - t0);
      const exp = -(((o.state.value % 10) + 10) % 10) * c;
      first.push({ i, rollAt: last.hidden ? 'hidden tick' : 'show tick', dtMs: r3(postF.t - t0), build: r3(postF.ty[i]), originalModel: r3(exp), errPx: r3(Math.abs(postF.ty[i] - exp)) });
    }
    return {
      k, hiddenVs: h.vs, hiddenMs: r3(s.now - h.now), framesWhileHidden: F.filter((f) => f.cb > h.now && f.cb < s.now).length,
      rollingAtHide: preF ? preF.ty.some((y, i) => Math.abs(y / (preF.c[i] || 1) - Math.round(y / (preF.c[i] || 1))) > 1e-3) : null,
      timerSamplesWhileHidden: pendHidden.length,
      pending: { beforeHide: S.filter((x) => x.now < h.now).slice(-1)[0]?.pending, atHide: h.pending, maxWhileHidden: pendHidden.length ? Math.max(...pendHidden) : null, atShow: s.pending, after1s: S.filter((x) => x.now > s.now + 1000)[0]?.pending },
      hiddenRolls: hiddenRolls.length, gapRolls: gapRolls.length, startValueVsHeld: startErr, firstFrameAfterShow: first,
    };
  });
}

// round 3: the original's full chain per digit over the logged events (the roll-probe method): every target change
// (inline transform, snaps included) restarts its spring from its current value with velocity 0 at that time, and every
// logged frame (all frames: the logger's own rAF runs each one, hidden or not) steps it GE(stamp - n). The build's
// computed translateY is compared with it at every frame. Only for arms whose inline transform holds the target
// (V, V3), not for C (its inline transform is the spring value).
function chain(log) {
  if (!log.inl) return null;
  // start at the first frame where every hero digit is at rest on a whole cell (the model needs no spring state there)
  const settled = (f) => f.ty.every((ty, i) => { const v = -ty / (f.c[i] || 1); return Math.abs(v - Math.round(v)) < 1e-3; });
  const F = log.frames.slice(Math.max(0, log.frames.findIndex(settled))), V = log.vis, n0 = F[0];
  if (!n0) return null;
  const st = n0.ty.map((ty, i) => ({ value: -ty / (n0.c[i] || 1), velocity: 0, n: 0, target: -ty / (n0.c[i] || 1), active: false }));
  const ev = [...F.map((f) => ({ at: f.cb, f })), ...log.inl.filter((x) => x.now >= n0.cb).map((x) => ({ at: x.now, x }))].sort((a, b) => a.at - b.at);
  const shows = V.filter((v) => !v.hidden).map((v) => v.now), hides = V.filter((v) => v.hidden).map((v) => v.now);
  const rows = [], starts = [];
  const phaseAt = (at) => {
    const lastShow = shows.filter((x) => x <= at).pop(), lastHide = hides.filter((x) => x <= at).pop();
    if (lastHide !== undefined && (lastShow === undefined || lastShow < lastHide)) return 'hidden';
    if (lastShow !== undefined && at - lastShow < 50) return 'show tick';
    return lastShow !== undefined && at - lastShow < 1000 ? 'first 1 s after show' : 'visible';
  };
  for (const e of ev) {
    if (e.x) {
      const s = st[e.x.i], c = e.x.c || 1, to = -e.x.px / c;
      if (!s || !Number.isFinite(to) || Math.abs(to - s.target) < 1e-9) continue;
      // start value: what the original shows at this tick (its a) vs the build's first keyframe (or a snap: then the
      // original must already be at the target, else it rolls and the build doesn't). Independent of when WebKit
      // samples the animation (getComputedStyle runs about one frame ahead of the rAF stamp in the Simulator).
      // the MutationObserver runs after all digits' effects of a tick: the roll is the latest animate() of this digit
      // in the 30 ms before the inline change
      const a = (log.anims || []).filter((r) => r.i === e.x.i && r.now <= e.x.now + 0.5 && r.now > e.x.now - 30).pop();
      const mPx = -((((s.value % 10) + 10) % 10) * c);
      const ref = a ? a.from : e.x.px;
      let err = Math.abs(ref - mPx); err = Math.min(err, Math.abs(err - 10 * c));
      starts.push({ i: e.x.i, now: Math.round(e.x.now * 10) / 10, phase: phaseAt(e.x.now), kind: a ? 'roll' : 'snap', originalPx: Math.round(mPx * 1000) / 1000, buildPx: Math.round(ref * 1000) / 1000, errPx: Math.round(err * 1000) / 1000 });
      s.target = to; s.velocity = 0; s.n = e.x.now; s.active = true;
      continue;
    }
    const f = e.f;
    f.ty.forEach((ty, i) => {
      const s = st[i]; if (!s) return;
      if (s.active) { const o = GE({ value: s.value, velocity: s.velocity }, s.target, f.t - s.n); s.n = f.t; s.value = o.state.value; s.velocity = o.state.velocity; s.active = !o.done; }
      const c = f.c[i] || 1, model = -((((s.value % 10) + 10) % 10) * c);
      let err = Math.abs(ty - model); err = Math.min(err, Math.abs(err - 10 * c));
      const ph = phaseAt(f.cb), phase = ph === 'show tick' ? 'first 1 s after show' : ph;
      rows.push({ i, t: f.t, phase, build: Math.round(ty * 1000) / 1000, model: Math.round(model * 1000) / 1000, err });
    });
  }
  const by = (p) => rows.filter((r) => r.phase === p);
  const mx = (a) => (a.length ? Math.round(Math.max(...a.map((r) => r.err)) * 1000) / 1000 : null);
  const worst = (a) => [...a].sort((x, y) => y.err - x.err).slice(0, 5).map((r) => ({ ...r, err: Math.round(r.err * 1000) / 1000 }));
  const sm = (p) => mx(starts.filter((r) => r.phase === p).map((r) => ({ err: r.errPx })));
  return {
    startValue: { note: 'per target change: the original\'s value at the tick vs the build\'s roll start (or, for a snap, the target)', maxErrPx: { visible: sm('visible'), hidden: sm('hidden'), showTick: sm('show tick'), firstSecondAfterShow: sm('first 1 s after show') }, snaps: starts.filter((r) => r.kind === 'snap').length, missedRolls: starts.filter((r) => r.kind === 'snap' && r.errPx > 0.01).length, notVisible: starts.filter((r) => r.phase !== 'visible') },
    frames: F.length, targetChanges: log.inl.length, maxErrPx: { visible: mx(by('visible')), firstSecondAfterShow: mx(by('first 1 s after show')), hidden: mx(by('hidden')) }, worstAfterShow: worst(by('first 1 s after show')), worstVisible: worst(by('visible')) };
}

// --analyze <file>: recompute per/summary/chain from a saved run (the raw log is kept verbatim), rewrite the file
if (ANALYZE) {
  const d = JSON.parse(readFileSync(ANALYZE, 'utf8'));
  for (const [arm, r] of Object.entries(d.arms)) {
    r.per = analyze(r.log);
    r.chain = arm === 'C' ? null : chain(r.log);
    console.log(arm, 'chain', JSON.stringify(r.chain && { startValue: { ...r.chain.startValue, notVisible: undefined }, maxErrPx: r.chain.maxErrPx }));
  }
  d.reanalyzedAt = new Date().toISOString();
  writeFileSync(ANALYZE, JSON.stringify(d, null, 1));
  process.exit(0);
}

const res = { tool: 'fixes/cd-roll-ca/sim-hide.mjs', cycles: CYCLES, hideMs: HIDE_MS, showMs: SHOW_MS, how: 'Safari to the background by launching Settings, back by launching Safari (simctl launch)', startedAt: new Date().toISOString(), arms: {} };
for (const arm of ARMS) {
  const s = await server(arm);
  const url = `http://localhost:${s.port}/`;
  try {
    const servedHash = {};
    for (const f of ['/_app/immutable/nodes/2.DyWL8TcE.js', '/_app/immutable/assets/2.gBuqKVzi.css']) {
      try { servedHash[f] = createHash('sha256').update(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())).digest('hex'); } catch { servedHash[f] = null; }
    }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    let c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
    await c.evaluate('(window.scrollTo(0, 0), 0)');
    await sleep(3000);
    const inj = await c.evaluate(INJECT);
    await c.evaluate('(window.__hc.rec = true, 0)');
    await sleep(1500);
    const steps = [];
    for (let k = 0; k < CYCLES; k++) {
      await sleep(330 * k); // shift the phase against the 1 s tick
      steps.push({ k, hide: simctl('launch', UDID, 'com.apple.Preferences') ? 'launched' : 'launched' });
      await sleep(HIDE_MS);
      simctl('launch', UDID, 'com.apple.mobilesafari');
      await sleep(SHOW_MS);
    }
    let log;
    try { await c.evaluate('(window.__hc.rec = false, 0)'); log = await c.evaluate('window.__hc'); }
    catch (e) { // the inspector connection may not survive the app switch: reconnect to the same page
      try { c.close(); } catch {}
      c = await openTab(`localhost:${s.port}`);
      await c.evaluate('(window.__hc.rec = false, 0)'); log = await c.evaluate('window.__hc');
    }
    const ua = await c.evaluate('navigator.userAgent');
    const per = analyze(log);
    const summary = {
      hideEvents: log.vis.filter((v) => v.hidden).length, showEvents: log.vis.filter((v) => !v.hidden).length,
      framesWhileHidden: per.reduce((a, p) => a + (p.framesWhileHidden || 0), 0),
      timerSamplesWhileHidden: per.reduce((a, p) => a + (p.timerSamplesWhileHidden || 0), 0),
      maxPendingWhileHidden: Math.max(0, ...per.map((p) => p.pending?.maxWhileHidden ?? 0)),
      maxPendingAtShow: Math.max(0, ...per.map((p) => p.pending?.atShow ?? 0)),
      hiddenRolls: per.reduce((a, p) => a + (p.hiddenRolls || 0), 0), gapRolls: per.reduce((a, p) => a + (p.gapRolls || 0), 0),
      maxStartErrPx: Math.max(0, ...per.flatMap((p) => (p.startValueVsHeld || []).map((x) => x.err))),
      maxFirstFrameErrPx: Math.max(0, ...per.flatMap((p) => (p.firstFrameAfterShow || []).map((x) => x.errPx))),
      errors: log.errors.length,
    };
    const fullChain = arm === 'C' ? null : chain(log);
    res.arms[arm] = { url, servedHash, inject: inj, ua, steps, summary, per, chain: fullChain, log };
    console.log(arm, JSON.stringify(servedHash['/_app/immutable/nodes/2.DyWL8TcE.js']?.slice(0, 12)), JSON.stringify(summary));
    if (fullChain) console.log(arm, 'chain', JSON.stringify(fullChain));
    console.log(arm, 'per', JSON.stringify(per.map(({ k, hiddenVs, hiddenMs, framesWhileHidden, rollingAtHide, timerSamplesWhileHidden, pending, hiddenRolls, gapRolls, firstFrameAfterShow }) => ({ k, hiddenVs, hiddenMs, framesWhileHidden, rollingAtHide, timerSamplesWhileHidden, pending, hiddenRolls, gapRolls, firstFrameAfterShow }))));
    c.close();
  } finally { s.p.kill(); }
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-hide-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);

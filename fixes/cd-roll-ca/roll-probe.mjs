#!/usr/bin/env node
// cd-roll-ca position-error harness (counts/positions only, no timing claim).
//
// Loads a mirror page in Chrome (mobile 430x932 DPR 3), and on every rAF records, per countdown digit strip, the
// translateY Chrome computes for it (getComputedStyle: for a Web Animation this is the animation's value at the
// frame time, the same time the compositor samples), plus every roll's Animation (startTime = the target change
// t0, first/last keyframe = from/to). Offline it runs the ORIGINAL's rAF spring (GE, literal copy) over the very
// same frame stamps from the same t0/from/to and reports |B - A| per frame in px.
//   --mode build : B = this build's Web Animations; A = the original's chain on the same frames.
//   --mode base  : the original itself (cd-strip / st6-rb2): checks that the offline chain reproduces the page's
//                  own per-frame values (fits t0 from the first moving frame), i.e. validates the model.
// Optional forced target changes (--jumps N): Date.now is offset by a random number of seconds at random times and a
// synthetic visibilitychange makes the countdown tick at once (random phase, often mid-roll, multi-digit rolls).
//
// Run inside a shared-lane hold (functional, times nothing):
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner cd-roll-ca -- sh -c '...'
import { READ } from './strip-read.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../tools/lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const statePath = arg('--state');
const outPath = arg('--out', 'out/cd-roll-ca/probe.json');
const mode = arg('--mode', 'build');
const seconds = Number(arg('--seconds', '20'));
const jumps = Number(arg('--jumps', '0'));
const headless = arg('--headless', '1') === '1';
const cpu = Number(arg('--cpu', '1'));
const seed0 = Number(arg('--seed', '7'));

// ---- the original's spring (JS 3791-3803 baseline), literal ----
const UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16;
function GE(e, t, n, r = UE) { let { value: i, velocity: a } = e, o = Math.max(0, n); for (; o > 0;) { let e = Math.min(o, WE) / 1e3; o -= WE; let n = (-r.stiffness * (i - t) - r.damping * a) / r.mass; a += n * e; i += a * e; }
  return Math.abs(a) < 0.01 && Math.abs(i - t) < 0.001 ? { state: { value: t, velocity: 0 }, done: true } : { state: { value: i, velocity: a }, done: false }; }

const INJECT = `(() => {
  const realNow = Date.now.bind(Date); window.__crOff = 0; Date.now = () => realNow() + window.__crOff;
  const L = window.__crLog = { frames: [], rolls: [], strips: 0, rec: false };
  const seen = new WeakMap();
${READ}
  const step = (t) => {
    if (L.rec) {
      const cb = performance.now(), ss = [...document.querySelectorAll('.digit > .strip')];
      const row = { t, cb, tl: document.timeline.currentTime, d: [] };
      ss.forEach((s, i) => {
        const clock = s.closest('[role=timer]'); const ci = [...document.querySelectorAll('[role=timer]')].indexOf(clock);
        const c = cell(s); const inline = inlOf(s);
        row.d.push([i, ci, c, tyOf(s), inline]);
        // strip-rb build: a roll is one Animation per moved cell (same keyframe offsets, same startTime); record it
        // once, its values as the strip-equivalent offset (cell k's keyframe minus k*c)
        let rec = null;
        cellsOf(s).forEach((el, j) => { for (const a of el.getAnimations()) {
          if (seen.has(a)) continue; seen.set(a, 1);
          if (rec && rec.t0 === a.startTime) { rec.cells++; continue; }
          const k = a.effect.getKeyframes();
          rec = { i, ci, c, t0: a.startTime, from: pxOf(k[0].transform) - j * c, to: pxOf(k[k.length - 1].transform) - j * c, n: k.length, dur: a.effect.getTiming().duration, seenAt: t, seenCb: cb, cells: 1 };
          L.rolls.push(rec);
        } });
      });
      L.frames.push(row);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();`;

// --analyze <probe.json>: re-run the offline analysis on a saved probe file (no Chrome)
const analyze = arg('--analyze');
let out;
if (analyze) out = JSON.parse(readFileSync(join(root, analyze), 'utf8'));
else {
const state = JSON.parse(readFileSync(join(root, statePath), 'utf8'));
const url = state.url || `https://localhost:${state.port}/`;
const profileDir = tempProfileDir(join(root, 'out', 'cd-roll-ca', 'chrome'), 'cd-roll-ca-probe');
const chrome = await launchChrome({ port: 0, profileDir, headless, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
const page = await cdp.newIsolatedPage();
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await page.send('Network.enable');
  const served = {};
  page.on((m) => { if (m.method === 'Network.responseReceived' && /nodes\/2\.DyWL8TcE\.js|assets\/2\.gBuqKVzi\.css/.test(m.params.response.url)) { const h = m.params.response.headers; served[m.params.response.url.replace(/^.*\/_app/, '/_app')] = h['x-mirror-source'] || h['X-Mirror-Source'] || null; } });
  await gotoAndSettle(page, url, { quietMs: 2000, maxMs: 45000 });
  console.error('served', JSON.stringify(served));
  await sleep(2500);
  await page.eval('window.__crLog.rec = true');
  // forced ticks at random times (seeded): Date jumps by 1..4000 s, then a synthetic visibilitychange (cD ticks on it)
  let rnd = seed0; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const t0 = Date.now(); const jumpLog = [];
  for (let j = 0; j < jumps; j++) {
    const at = t0 + ((j + rand()) / jumps) * seconds * 1000;
    while (Date.now() < at) await sleep(Math.min(50, at - Date.now()));
    const off = Math.round(1 + rand() * 4000) * 1000 * (rand() < 0.5 ? 1 : 0) + Math.round(rand() * 900);
    jumpLog.push(await page.eval(`(() => { window.__crOff += ${off}; const n = performance.now(); document.dispatchEvent(new Event('visibilitychange')); return { at: n, off: ${off}, tl: document.timeline.currentTime }; })()`));
  }
  while (Date.now() < t0 + seconds * 1000) await sleep(100);
  await page.eval('window.__crLog.rec = false');
  const log = await page.eval('window.__crLog');
  const meta = await page.eval(`({ ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight })`);
  // sha256 of the served JS/CSS bodies (plain http snapshot servers; null when the fetch fails, e.g. self-signed https)
  const servedHash = {};
  for (const f of ['/_app/immutable/nodes/2.DyWL8TcE.js', '/_app/immutable/assets/2.gBuqKVzi.css']) {
    try { servedHash[f] = createHash('sha256').update(Buffer.from(await (await fetch(new URL(f, url))).arrayBuffer())).digest('hex'); } catch { servedHash[f] = null; }
  }
  console.error('servedHash', JSON.stringify(servedHash));
  out = { tool: 'fixes/cd-roll-ca/roll-probe.mjs', mode, url, browser: chrome.browser, headless, cpu, seconds, jumps, seed: seed0, meta, served, servedHash, jumpLog, log };
} finally {
  await page.close(); cdp.close(); await chrome.close();
}
}

// ---- analysis ----
const F = out.log.frames;
const dts = F.slice(1).map((f, k) => f.t - F[k].t).sort((a, b) => a - b);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r4 = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);
const summary = { frames: F.length, frameDtMedianMs: r4(pct(dts, 0.5)), frameDtP95Ms: r4(pct(dts, 0.95)) };
const byStrip = new Map(); // key i -> per-frame [t, cb, ty, inline, c, ci]
for (const f of F) for (const [i, ci, c, ty, inline] of f.d) { if (!byStrip.has(i)) byStrip.set(i, []); byStrip.get(i).push({ t: f.t, cb: f.cb, ty, inline, c, ci }); }

if (mode === 'build') {
  // A: original chain over the same frames. A's roll i starts at t0 with from = A's own value at the last frame before
  // t0 (the original reads its state a), to = the roll's target. B's from (its own estimate) is reported separately.
  const errs = { tick: [], forced: [] }, fromDiff = [], perRoll = [];
  // jitter: the original's own variation, A on these stamps vs A' on ideal 60 Hz stamps (first stamp + k * 16.667 ms)
  const errsJit = { tick: [], forced: [] }, errsIdeal = { tick: [], forced: [] };
  const rollsBy = new Map(); for (const r of out.log.rolls) { if (!rollsBy.has(r.i)) rollsBy.set(r.i, []); rollsBy.get(r.i).push(r); }
  const jumpAts = out.jumpLog.map((j) => j.at);
  for (const [i, rows] of byStrip) {
    const rolls = (rollsBy.get(i) || []).sort((a, b) => a.t0 - b.t0);
    let aVal = null; // A's displayed value (cells)
    let ri = -1, st = null, n = 0, done = true, cur = null;
    for (const row of rows) {
      const c = row.c; if (!(c > 0)) continue;
      // a new roll whose t0 is before this frame's callback time starts now (A's effect ran at t0)
      while (ri + 1 < rolls.length && rolls[ri + 1].t0 < row.cb) {
        ri++; cur = rolls[ri];
        const fromB = -cur.from / c, to = -cur.to / c;
        const fromA = aVal ?? fromB;
        fromDiff.push({ i, t0: r4(cur.t0), px: r4(Math.abs(fromA - fromB) * c), forced: jumpAts.some((a) => Math.abs(a - cur.t0) < 30) });
        st = { value: fromA, velocity: 0 }; n = cur.t0; done = false; cur.to_ = to; cur.forced = fromDiff.at(-1).forced; cur.maxPx = 0;
        cur.ist = { value: fromA, velocity: 0 }; cur.in = cur.t0; cur.idone = false; cur.k0 = null;
        perRoll.push(cur);
      }
      if (cur && !done) { const s = GE(st, cur.to_, row.t - n); n = row.t; st = s.state; done = s.done; }
      let aIdeal = null;
      if (cur) {
        if (cur.k0 === null) cur.k0 = row.t;
        const ti = cur.k0 + Math.round((row.t - cur.k0) / (1000 / 60)) * (1000 / 60);
        if (!cur.idone) { const s = GE(cur.ist, cur.to_, ti - cur.in); cur.in = ti; cur.ist = s.state; cur.idone = s.done; }
        aIdeal = cur.ist.value;
      }
      if (cur) aVal = st.value; else aVal = -row.ty / c;
      const tyA = -((((aVal % 10) + 10) % 10) * c);
      const e = Math.abs(row.ty - tyA);
      if (cur && (row.t - cur.t0) < cur.dur + 50) {
        (cur.forced ? errs.forced : errs.tick).push(e); cur.maxPx = Math.max(cur.maxPx, e);
        const tyI = -((((aIdeal % 10) + 10) % 10) * c);
        (cur.forced ? errsJit.forced : errsJit.tick).push(Math.abs(tyA - tyI));
        (cur.forced ? errsIdeal.forced : errsIdeal.tick).push(Math.abs(row.ty - tyI));
      }
    }
  }
  const sum = (a) => ({ n: a.length, maxPx: r4(a.length ? Math.max(...a) : null), p95Px: r4(pct(a, 0.95)), p99Px: r4(pct(a, 0.99)) });
  summary.rolls = out.log.rolls.length;
  summary.keyframesMax = Math.max(0, ...out.log.rolls.map((r) => r.n));
  summary.errTickRolls = sum(errs.tick);
  summary.errForcedRolls = sum(errs.forced);
  summary.startValueDiffPx = sum(fromDiff.map((d) => d.px));
  summary.origJitterTickPx = sum(errsJit.tick); summary.origJitterForcedPx = sum(errsJit.forced);
  summary.errVsIdeal60TickPx = sum(errsIdeal.tick); summary.errVsIdeal60ForcedPx = sum(errsIdeal.forced);
  summary.startValueDiffForcedPx = sum(fromDiff.filter((d) => d.forced).map((d) => d.px));
  summary.worstRolls = perRoll.sort((a, b) => b.maxPx - a.maxPx).slice(0, 5).map((r) => ({ i: r.i, from: r4(-r.from / r.c), to: r.to_, forced: r.forced, maxPx: r4(r.maxPx) }));
} else {
  // base: per strip, segment the inline values into rolls (value changes), fit t0 on the first moving frame from the
  // single-substep formula, then predict the rest with the chain and report the max deviation.
  // the probe's rAF callback runs before the spring's in every frame (it re-requests first), so the inline value it
  // reads in frame k is the one the spring wrote in frame k-1: pair it with frame k-1's stamp
  const dev = []; let rollsN = 0;
  for (const [, raw] of byStrip) {
    const rows = raw.slice(1).map((r, k) => ({ ...r, t: raw[k].t }));
    for (let k = 1; k < rows.length; k++) {
      const c = rows[k].c; if (!(c > 0)) continue;
      const v0 = -rows[k - 1].inline / c, v1 = -rows[k].inline / c;
      if (Math.abs(v1 - v0) < 1e-9 || rows[k - 1].moving) continue;
      // a roll starts between rows k-1 and k; the target is the value it settles at
      let e = k; while (e + 1 < rows.length && Math.abs(rows[e + 1].inline - rows[e].inline) > 1e-9) e++;
      const to = Math.round(-rows[e].inline / c); const from = v0;
      const acc = (UE.stiffness * (to - from)) / UE.mass; // first substep: v1 - from = acc * h^2
      const h = Math.sqrt(Math.max(0, (v1 - from) / acc)) * 1000; // ms, valid when <= 16
      if (!(h > 0 && h <= 16)) { for (let j = k; j <= e; j++) rows[j].moving = true; continue; }
      let st = { value: from, velocity: 0 }, n = rows[k].t - h, d = false; rollsN++;
      for (let j = k; j <= Math.min(e + 1, rows.length - 1); j++) {
        if (!d) { const s = GE(st, to, rows[j].t - n); n = rows[j].t; st = s.state; d = s.done; }
        dev.push(Math.abs(-((((st.value % 10) + 10) % 10) * c) - rows[j].inline)); rows[j].moving = true;
      }
    }
  }
  summary.rollsFitted = rollsN;
  summary.modelDeviationPx = { n: dev.length, maxPx: r4(dev.length ? Math.max(...dev) : null), p95Px: r4(pct(dev, 0.95)) };
}
out.summary = summary;
mkdirSync(dirname(join(root, outPath)), { recursive: true });
writeFileSync(join(root, outPath), JSON.stringify(out));
console.log(JSON.stringify({ mode, headless, cpu, browser: out.browser, ...summary }));

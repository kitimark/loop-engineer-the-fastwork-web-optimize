// Node side of the benchmark scenarios (tools/bench.mjs), driving one page over CDP:
//   Tier A: stepped scroll with quiescence, spots, parity snapshots, in-page counters (bench-probes.mjs)
//           plus the CDP-side probes (perfMetrics, layoutsPerFrame, listeners). Unthrottled, counts only.
//   Tier B: the same segments/spots at a CPU throttle, without any probe installed, measuring
//           Performance.getMetrics deltas and the rAF frame logger of verify.mjs (perf-page.mjs).
import { gotoAndSettle, sleep, enablePerformance, getMetrics, eventListeners } from './cdp.mjs';
import { installSource, RESET, READ, QUIESCE, SCROLL_TO, SNAPSHOT, GEOMETRY, SETTLE, ERRORS } from './bench-probes.mjs';
import { LOGGER, RESET as PERF_RESET, COLLECT as PERF_COLLECT } from './perf-page.mjs';
import { hostClock } from './host.mjs';

// The clock of the scenario's own waits (quiet period, settle, warm-up, spot wait/window; incident I-027 C).
// A real host: Date.now + setTimeout, exactly as before. A stubbed host ($FW_TEST_HOST, tests only; every
// bench result records the stubbed host): the stub's fake clock, so a fake-Chrome bench run costs no wall
// time on these waits. In-page waits (SETTLE, QUIESCE, rAF frames) and CDP timeouts stay on real time.
const REAL_CLOCK = { now: () => Date.now(), sleep };
let clockP;
export function scenarioClock() {
  return (clockP ||= hostClock().then((c) => (c.stub ? { now: () => c.mono(), sleep: (ms) => c.sleep(ms), stub: c.stub } : REAL_CLOCK)));
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
};
export const CDP_KINDS = ['perfMetrics', 'layoutsPerFrame', 'listeners'];
// Page settle times. FW_BENCH_TEST_FAST=1 shortens them for the fake-Chrome tests only; it is recorded in
// every result (bench.mjs: timing / setting "test-fast"), so such a result never passes for a measured one.
export const TEST_FAST = process.env.FW_BENCH_TEST_FAST === '1';
export const TIMING = TEST_FAST ? { quietA: 100, quietB: 100, settleB: 0, warmB: 0 } : { quietA: 1500, quietB: 2000, settleB: 1500, warmB: 1000 };
const QUIET_FRAMES = 2, QUIET_CAP = 40;

/** A fresh isolated page with the viewport, optional probe source and Performance domain. */
export async function openPage(cdp, { viewport, source, perf = false, timeDomain = 'timeTicks' }) {
  const vp = VIEWPORTS[viewport];
  if (!vp) throw new Error(`unknown viewport ${viewport}`);
  const page = await cdp.newIsolatedPage();
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  });
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', vp);
  if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (source) await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
  if (perf) await enablePerformance(page, timeDomain);
  page.errors = errors;
  return page;
}

/** Union of parity snapshot specs. */
function snapSpec(entries) {
  const s = { classes: [], props: [], attrs: [] };
  const seen = new Set();
  for (const e of entries) {
    for (const c of e.classes || []) if (!seen.has('c' + c)) { seen.add('c' + c); s.classes.push(c); }
    for (const p of e.props || []) if (!seen.has('p' + p[0] + ' ' + p[1])) { seen.add('p' + p[0] + ' ' + p[1]); s.props.push([p[0], p[1]]); }
    for (const a of e.attrs || []) if (!seen.has('a' + a.join(' '))) { seen.add('a' + a.join(' ')); s.attrs.push(a); }
  }
  return s;
}
const listenerCount = (ls, p) => ls.filter((l) => l.type === p.type && (p.passive === undefined || l.passive === p.passive)).length;

/**
 * One Tier A page session. `plan`: {viewport, probes: {id: probe}, windows: [{label, segment|spot, parity: [entries]}],
 * segments: {label: def}, spots: {label: def}}. Returns {geometry, windows: {label: {counts, frames, metrics,
 * listeners, steps, capped}}, parity: {label: [{y, snap}]}, errors, capped, steps}.
 */
export async function tierASession(cdp, url, plan, { settleMs = 10000, log = () => {} } = {}) {
  const pageProbes = {}, cdpProbes = {};
  for (const [id, p] of Object.entries(plan.probes)) (CDP_KINDS.includes(p.kind) ? cdpProbes : pageProbes)[id] = p;
  const perf = Object.values(cdpProbes).some((p) => p.kind !== 'listeners');
  const T = await scenarioClock();
  const page = await openPage(cdp, { viewport: plan.viewport, source: installSource({ probes: pageProbes }), perf });
  try {
    await gotoAndSettle(page, url, { quietMs: TIMING.quietA, clock: T });
    await page.eval(SETTLE(settleMs), { timeout: settleMs + 5000 });
    await page.eval(SCROLL_TO(0));
    await page.eval(QUIESCE(QUIET_FRAMES, QUIET_CAP));
    const geometry = await page.eval(GEOMETRY({ segments: plan.segments, spots: plan.spots }));
    const out = { geometry, windows: {}, parity: {}, errors: [], capped: 0, steps: 0 };
    for (const w of plan.windows) {
      const spec = snapSpec(w.parity || []);
      const wantSnap = spec.classes.length + spec.props.length + spec.attrs.length > 0;
      const listenerProbes = Object.entries(cdpProbes).filter(([, p]) => p.kind === 'listeners');
      const lmax = {};
      const listenersNow = async () => {
        if (!listenerProbes.length) return;
        const cache = {};
        for (const [id, p] of listenerProbes) {
          cache[p.target] ||= await eventListeners(page, p.target);
          lmax[id] = Math.max(lmax[id] ?? 0, listenerCount(cache[p.target], p));
        }
      };
      const snaps = [];
      const snap = async (y) => { if (wantSnap) snaps.push({ y, snap: await page.eval(SNAPSHOT(spec)) }); await listenersNow(); };
      let steps = 0, capped = 0;
      const settle = async () => { const q = await page.eval(QUIESCE(QUIET_FRAMES, QUIET_CAP), { timeout: 30000 }); steps++; if (q.capped) capped++; };
      let m0 = null;
      if (w.segment) {
        const g = geometry.segments[w.label];
        if (!g || g.error) { out.errors.push(`${w.label}: ${g ? g.error : 'no geometry'}`); continue; }
        const def = plan.segments[w.label];
        await page.eval(SCROLL_TO(g.start));
        await page.eval(QUIESCE(QUIET_FRAMES, QUIET_CAP), { timeout: 30000 });
        if (perf) m0 = await getMetrics(page);
        await page.eval(RESET(w.label));
        await snap(g.start);
        for (let y = g.start + def.step; ; y += def.step) {
          const yy = Math.min(y, g.end);
          await page.eval(SCROLL_TO(yy));
          await settle();
          await snap(yy);
          if (yy >= g.end) break;
        }
      } else {
        const g = geometry.spots[w.label];
        if (!g || g.error) { out.errors.push(`${w.label}: ${g ? g.error : 'no geometry'}`); continue; }
        const def = plan.spots[w.label];
        await page.eval(SCROLL_TO(g.y));
        await settle();
        await T.sleep((def.wait ?? 1) * 1000);
        if (perf) m0 = await getMetrics(page);
        await page.eval(RESET(w.label));
        await T.sleep(def.window * 1000);
        await snap(g.y);
      }
      const r = await page.eval(READ(w.label));
      const m1 = perf ? await getMetrics(page) : null;
      const counts = { ...r.counts };
      for (const [id, p] of Object.entries(cdpProbes)) {
        if (p.kind === 'listeners') counts[id] = lmax[id] ?? 0;
        else {
          const d = (m1[p.metric] ?? NaN) - (m0[p.metric] ?? NaN);
          counts[id] = p.kind === 'perfMetrics' ? d : (r.frames > 0 ? d / r.frames : NaN);
        }
      }
      out.windows[w.label] = { counts, frames: r.frames, steps, capped };
      if (wantSnap) out.parity[w.label] = snaps;
      out.steps += steps; out.capped += capped;
      const short = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
      log(`  ${w.label}: ${steps} steps${capped ? ` (${capped} at the quiescence cap)` : ''}, ${r.frames} frames; ${Object.entries(counts).map(([k, v]) => `${k.slice(k.indexOf(':') + 1)} ${short(v)}`).join(', ')}`);
    }
    out.errors.push(...(await page.eval(ERRORS)), ...page.errors.map((e) => 'page ' + e));
    return out;
  } finally {
    await page.close();
  }
}

const TIER_B_METRICS = ['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount'];
/** Per-scenario Tier B metrics from getMetrics deltas (durations in ms) and the frame logger. */
export function gainMetrics(m0, m1, frames) {
  const d = (k) => (m1[k] ?? 0) - (m0[k] ?? 0);
  const ms = (x) => Math.round(1e6 * x) / 1000; // seconds -> ms, rounded to 1 us
  const s = [...frames].sort((a, b) => a - b);
  return {
    styleLayoutMs: ms(d('RecalcStyleDuration') + d('LayoutDuration')),
    layoutMs: ms(d('LayoutDuration')), recalcStyleMs: ms(d('RecalcStyleDuration')),
    scriptMs: ms(d('ScriptDuration')), taskMs: ms(d('TaskDuration')),
    layoutCount: d('LayoutCount'), recalcStyleCount: d('RecalcStyleCount'),
    gt20: frames.filter((f) => f > 20).length, p95: s.length ? s[Math.min(s.length - 1, Math.floor(0.95 * s.length))] : 0,
    frames: frames.length,
  };
}
export { TIER_B_METRICS };

/**
 * One Tier B run: a fresh page (no probes), load, settle, throttle, then every scenario in order
 * (top of page and a short idle between them). `scenarios`: [{key, segment|spot def, kind}].
 * Returns {scenarios: {key: metrics}}.
 */
export async function tierBRun(cdp, url, { viewport, cpu, timeDomain = 'timeTicks', scenarios, dwellFrames = 20, settleMs = TIMING.settleB, beforeScenario = async () => {}, afterScenario = async () => {} }) {
  const T = await scenarioClock();
  const page = await openPage(cdp, { viewport, perf: true, timeDomain });
  try {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: LOGGER });
    await page.send('Page.bringToFront').catch(() => {});
    await gotoAndSettle(page, url, { quietMs: TIMING.quietB, clock: T });
    await T.sleep(settleMs);
    await page.eval(SETTLE(10000), { timeout: 15000 });
    const geometry = await page.eval(GEOMETRY({ segments: Object.fromEntries(scenarios.filter((s) => s.segment).map((s) => [s.key, s.segment])), spots: Object.fromEntries(scenarios.filter((s) => s.spot).map((s) => [s.key, s.spot])) }));
    await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await T.sleep(TIMING.warmB);
    const out = { scenarios: {} };
    const frames = (n) => `new Promise((r) => { let i = 0; const f = () => (++i >= ${Number(n)} ? r(i) : requestAnimationFrame(f)); requestAnimationFrame(f); })`;
    for (const s of scenarios) {
      const g = s.segment ? geometry.segments[s.key] : geometry.spots[s.key];
      if (!g || g.error) { out.scenarios[s.key] = { error: g ? g.error : 'no geometry' }; continue; }
      await page.eval(SCROLL_TO(s.segment ? g.start : g.y));
      await page.eval(frames(s.dwellFrames ?? dwellFrames), { timeout: 60000 });
      if (s.spot) await T.sleep((s.spot.wait ?? 1) * 1000);
      await beforeScenario(s);
      const m0 = await getMetrics(page);
      await page.eval(PERF_RESET);
      if (s.segment) {
        for (let y = g.start + s.segment.step; ; y += s.segment.step) {
          const yy = Math.min(y, g.end);
          await page.eval(SCROLL_TO(yy));
          await page.eval(frames(s.dwellFrames ?? dwellFrames), { timeout: 60000 });
          if (yy >= g.end) break;
        }
      } else await T.sleep(s.spot.window * 1000);
      const perf = await page.eval(PERF_COLLECT);
      const m1 = await getMetrics(page);
      out.scenarios[s.key] = { ...gainMetrics(m0, m1, perf.frames || []), host: await afterScenario(s) };
      await page.eval(SCROLL_TO(0));
    }
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return out;
  } finally {
    await page.close();
  }
}

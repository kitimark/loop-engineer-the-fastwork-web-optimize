// `sim.mjs scroll` and `sim.mjs record`: the same code paths as `iphone.mjs scroll` / `record` on the Simulator's
// tabs port (research/simulator/README.md §7). NEW MEASUREMENT CODE for the Simulator; the PHONE's code is not
// touched: PROBE, summarize() and the record logger below are byte-identical copies of tools/iphone.mjs's blocks,
// pinned equal to them (and to the phone pins) by tests/unit/iphone-unchanged.test.mjs. The orchestration is the
// phone's (reload from the top, 2.5 s, readyState, 8 s settle, probe, 1.5 s polls) with the session gate instead
// of the iphone lease, no battery read, the :9231 SIMULATOR check right before the timed part, and the record
// written to out/sim/<owner>-<label>-<ts>.json with meta.device "simulator" and meta.sim. runTarget(): the
// Simulator target that `sim.mjs run` passes to iphone.mjs run's runCmd (tools/lib/iphone-run.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { openTab, pickTab, sleep } from './wip.mjs';
import { REPO } from './paths.mjs';
import { CERT_WARNING_TITLE } from './iphone-url.mjs';
import { sample as hostSample } from './host.mjs';
import { ports, proxyCheck, readConfig, SIM_DEVICE } from './sim.mjs';
import { TOOL_FILES } from './iphone-run.mjs';
import { TOOL_FILES as GESTURE_TOOL_FILES } from './gesture-run.mjs';

const PROBE = `(async () => {
  const fp = window.__fp = {frames: []};
  let last = performance.now();
  const loop = t => { fp.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const marks = {}; const vh0 = innerHeight;
  marks.idle = [performance.now()]; await sleep(3000); marks.idle.push(performance.now());
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  while (scrollY < maxY - 5 && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: 250, behavior: 'smooth'}); await sleep(300); }
  marks.scroll.push(performance.now());
  marks.bottom = [performance.now()]; await sleep(3000); marks.bottom.push(performance.now());
  return {marks, maxY, finalY: Math.round(scrollY), docH: document.documentElement.scrollHeight, vw: innerWidth, vh0, vh: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, href: location.href, frames: fp.frames};
})()`;

function summarize(res) {
  const out = {};
  for (const phase of ['idle', 'scroll', 'bottom']) {
    const [a, b] = res.marks[phase];
    const f = res.frames.filter(([t]) => t >= a && t <= b).map(([, dt]) => dt);
    const total = f.reduce((x, y) => x + y, 0);
    out[phase] = { frames: f.length, fps: Math.round((10 * f.length) / (total / 1000 || 1)) / 10, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) };
  }
  return out;
}

/** The finger-test frame logger of `iphone.mjs record`, its expression verbatim. */
const RECORD_JS = `(() => { const r = window.__fr = {frames: [], href: location.href, vw: innerWidth, vh0: innerHeight}; let last = performance.now();
      const loop = (t) => { r.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), innerHeight]); last = t; if (!r.stop) requestAnimationFrame(loop); };
      requestAnimationFrame(loop); return 'ok'; })()`;
const RECORD_STOP_JS = '(() => { window.__fr.stop = true; return JSON.stringify(window.__fr); })()';
function recordSummary(res) {
  const moving = res.frames.filter((f, i) => i > 0 && f[2] !== res.frames[i - 1][2]).map((f) => f[1]);
  const all = res.frames.map((f) => f[1]);
  const sum = (f) => ({ frames: f.length, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) });
  return { all: sum(all), whileScrollYChanges: sum(moving), innerHeightChanges: new Set(res.frames.map((f) => f[3])).size - 1 };
}

export { PROBE, summarize, RECORD_JS, RECORD_STOP_JS, recordSummary };

/** Settings a Simulator does not have: recorded as 'n/a' (no battery, no Low Power Mode). */
export const SIM_SETTINGS = Object.freeze({ lowPowerMode: 'n/a', batteryPct: 'n/a', charging: 'n/a' });
/** meta.sim of every Simulator record (README §7 "Record schema"). */
export function simMeta(session, { hostStart = null, hostEnd = null } = {}) {
  const c = readConfig();
  return { runtime: c.runtime ?? null, runtimeBuild: c.runtimeBuild ?? null, deviceType: c.deviceType ?? null, xcode: c.xcode ?? null, window: session?.window ?? null, tipDismissed: session?.tipDismissed ?? null,
    lockdownMode: 'not read (Simulator default: off)', hostLoad: { start: hostStart, end: hostEnd }, proxyPorts: session?.proxyPorts ?? null,
    safariCache: session?.safariCache ?? null, // I-052: Safari's HTTP cache emptied at boot ({cleared, removedMB})
    boot: session?.boot ?? null, // I-063: {mode: cold | warm (a booted fw-sim reused), bootedAt, sessionsOnBoot}
    background: session?.background?.settle ?? null }; // I-082: the Sim's own background CPU when the command started
}
const hostLoad = () => hostSample({ windowSec: 3 }).catch((e) => ({ error: e.message }));
const outPath = (o, owner, label) => resolve(REPO, o.out || join('out', 'sim', `${owner}-${label}-${Date.now()}.json`));

async function firstTab(port) {
  const list = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  let tab; // never a blank web view of another app, never the first of several (I-037)
  try { tab = pickTab(list); } catch (e) { if (!e.ambiguous) e.message = `no Safari tab in the Simulator (node tools/sim.mjs open <url> first): ${e.message}`; throw e; }
  if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}: open the plain-http URL (node tools/sim.mjs open http://localhost:<port>/)`);
  return tab;
}

/** `sim.mjs scroll`: the calibrated scripted scroll (iphone.mjs scroll's sequence) on the Simulator. */
export async function scrollCmd({ session, owner, label = 'run', out, log = console.log }) {
  const port = ports().tabs;
  await firstTab(port);
  await proxyCheck();
  const hostStart = await hostLoad();
  let c = await openTab(() => true, { port });
  const host = new URL(await c.evaluate('location.href')).host;
  await c.evaluate(`scrollTo(0, 0); setTimeout(() => location.reload(), 400); 'ok'`);
  c.close();
  await sleep(2500);
  c = await openTab(host, { port });
  for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
  await sleep(8000);
  await proxyCheck();
  await c.evaluate(`window.__iphRes = undefined; ${PROBE}.then(v => { window.__iphRes = JSON.stringify(v); }, e => { window.__iphRes = JSON.stringify({err: String(e)}); }); 'started'`);
  let res = null;
  const t0 = Date.now();
  while (!res && Date.now() - t0 < 90000) { await sleep(1500); const v = await c.evaluate('window.__iphRes || null'); if (v) res = JSON.parse(v); }
  c.close();
  if (!res) throw new Error('probe did not finish in 90 s');
  if (res.err) throw new Error(res.err);
  res.summary = summarize(res);
  res.meta = { device: SIM_DEVICE, owner, label, date: new Date().toISOString(), settings: { ...SIM_SETTINGS }, sim: simMeta(session, { hostStart, hostEnd: await hostLoad() }) };
  const file = outPath({ out }, owner, label);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(res));
  log(JSON.stringify(res.summary, null, 1));
  log(`saved ${file}`);
  return file;
}

export const SIM_TOOL_FILES = ['tools/sim.mjs', 'tools/lib/sim.mjs', 'tools/lib/sim-scroll.mjs', 'tools/lib/sim-warm.mjs'];
/**
 * `sim.mjs run`: iphone.mjs run's target for the Simulator (tools/lib/iphone-run.mjs runCmd): the session and its
 * normal hold instead of the iphone lease and measureGuard, the :9231 SIMULATOR check before the settle and again
 * before the timed part, no battery, host load around the run, meta.device "simulator" + meta.sim, out/sim/.
 * `requireSession` / `holdEnd` come from tools/lib/sim.mjs (passed in, for the tests).
 */
export function runTarget(session, { requireSession, holdEndsAt, cleanupMs = 40000, now = () => Date.now() }) {
  let hostStart = null, hostEnd = null;
  return {
    device: SIM_DEVICE, settings: { ...SIM_SETTINGS }, outDir: 'sim', toolFiles: [...SIM_TOOL_FILES, ...TOOL_FILES],
    guard: async () => { requireSession(); await proxyCheck(); },
    renew: async (needMs) => {
      const left = holdEndsAt() - now() - cleanupMs;
      if (left < needMs) throw new Error(`this run needs about ${Math.ceil(needMs / 1000)} s, but your chrome-measure hold leaves ${Math.max(0, Math.floor(left / 1000))} s before the Simulator must shut down: run it in a new hold (--max-seconds 420)`);
    },
    start: async () => { hostStart = await hostLoad(); },
    end: async () => { hostEnd = await hostLoad(); },
    extra: () => ({ sim: simMeta(session, { hostStart, hostEnd }) }),
  };
}

/** `sim.mjs record`: iphone.mjs record's frame logger for --seconds while something else scrolls (WDA gesture). */
export async function recordCmd({ session, owner, label = 'finger', seconds = 25, out, log = console.log }) {
  const port = ports().tabs;
  await firstTab(port);
  await proxyCheck();
  const hostStart = await hostLoad();
  const c = await openTab(() => true, { port });
  await c.evaluate(RECORD_JS);
  log(`RECORDING ${seconds} s on ${await c.evaluate('location.href')}`);
  await sleep(seconds * 1000);
  const res = JSON.parse(await c.evaluate(RECORD_STOP_JS));
  c.close();
  res.summary = recordSummary(res);
  res.meta = { device: SIM_DEVICE, owner, label, seconds, date: new Date().toISOString(), settings: { ...SIM_SETTINGS }, sim: simMeta(session, { hostStart, hostEnd: await hostLoad() }) };
  const file = outPath({ out }, owner, label);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(res));
  log(JSON.stringify(res.summary, null, 1));
  log(`saved ${file}`);
  return file;
}

/**
 * `sim.mjs gesture`: iphone.mjs gesture's target for the Simulator (tools/lib/gesture-run.mjs): the session and its
 * normal hold instead of the iphone lease (checked before every op, and the hold must outlast the run plus the
 * Simulator's shutdown), strokes to WDA-sim on the session's WDA port, the :9231 SIMULATOR check before the run, host
 * load around it, meta.device "simulator" + meta.sim, out/sim/. Simulator gesture numbers are mechanism checks only
 * (touchmove counts, dp per stroke), never timing verdicts (F-084): stats.mjs keeps meta.device "simulator" apart.
 */
export function gestureTarget(session, { requireSession, holdEndsAt, cleanupMs = 40000, now = () => Date.now(), check = proxyCheck, load = hostLoad }) {
  let hostStart = null;
  const left = () => holdEndsAt() - now() - cleanupMs;
  return {
    device: SIM_DEVICE, outDir: 'sim', wdaBase: `http://127.0.0.1:${ports().wda}`, toolFiles: [...SIM_TOOL_FILES, ...GESTURE_TOOL_FILES],
    wdaHint: 'node tools/sim.mjs wda start (inside your session)', openHint: (u) => `node tools/sim.mjs open ${u}`,
    async preflight(estMs) {
      requireSession();
      const need = estMs * 1.5 + 30000;
      if (left() < need) throw new Error(`this gesture run needs about ${Math.ceil(need / 1000)} s, but your chrome-measure hold leaves ${Math.max(0, Math.floor(left() / 1000))} s before the Simulator must shut down: run it in a new hold (--max-seconds 420)`);
      await check();
      hostStart = await load();
      return { pageUrl: null, pageSource: null };
    },
    lost() {
      try { requireSession(); } catch (e) { return `lost the Simulator session: ${e.message}`; }
      return left() > 0 ? null : 'your chrome-measure hold is ending: stopped between strokes so the Simulator can shut down in time';
    },
    extra: async () => ({ settings: { ...SIM_SETTINGS }, sim: simMeta(session, { hostStart, hostEnd: await load() }) }),
  };
}

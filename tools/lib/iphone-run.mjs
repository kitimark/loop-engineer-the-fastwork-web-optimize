// `node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <o>`: one scripted iPhone run with the
// standard probe (measurement protocol v2 T1a; research/architecture/measurement-protocol-v2.md §5.4-5.5). The
// in-page code and the pure post-processing live in tools/lib/iphone-probe.mjs; this file is the WIP orchestration.
//
// Sequence (every driver): lease check, then the lease is renewed to outlast the run (lock.mjs renew); no timed
// run while a NORMAL chrome-measure hold runs (`WAIT`, checked again after the settle; short-lane holds pass;
// --allow-during-measure for diagnostics); Safari not on the certificate warning; scrollTo(0, instant) + reload;
// the probe options (--y-source raf|raf-legacy|scroll|none) and a load-frame logger (`early`) from the reconnect; readyState
// complete; the battery (idevicediagnostics AppleSmartBattery: temperature, charging, capacity; --no-battery);
// settle (--settle, default 8 s); then ONE in-page expression: page facts, stateAtStart (+ --state), --tops, the
// std probe, the driver, stop, Resource Timing. The page is polled at <= 1 Hz (1.5 s) and the result read back in
// chunks; then the battery again, and the same-origin scripts/stylesheets the page loaded are fetched again from
// the Mac and hashed (meta.served).
//   S scroll : the `iphone.mjs scroll` stimulus: idle (--idle 3 s), scrollBy 250 px smooth every 300 ms to the
//              bottom, bottom hold (--bottom 3 s). Phases idle, scroll, bottom.
//   W window : [--from Y0: instant jump, 1 s] idle (--idle 3 s), the same steps until y >= --to Y, hold (--hold 2 s),
//              then the sentinel (§5.2): instant jump to the bottom and hold (--sentinel 3 s; 0 = none).
//              Phases idle, scroll, hold, sentinel.
//   M morph  : the build's window.__fwMorphDrive({hold: --hold 2000 ms, cycles: --cycles 3}); its own summaries
//              (moving / atOne / atZero) are kept as driverResult. Phase drive.
// Output: out/iphone/<owner>-run-<label>-<ts>.json (or --out), schema fw-iphone-run/1: meta (driver, labels, block
// fields for T2/T3, wall clock + page clock mapping (U7), settings fingerprint with 'unknown' for what a page
// cannot read (U9), served hashes, tool hashes), fields, frames, marks, mutations, crossings, tops, summary, driverResult, pre, post.
// A run that failed in the page (driver error) is still written, with meta.error, and exits 1.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openTab, sleep } from './wip.mjs';
import { status as lockStatus } from './lock.mjs';
import { REPO } from './paths.mjs';
import { iphoneTarget, mirrorInfo, CERT_WARNING_TITLE } from './iphone-url.mjs';
import { SCHEMA, DRIVERS, DRIVER_JS, PROBE_STD_JS, PRE_JS, STATE_START_JS, EARLY_JS, RESOURCES_JS, RESOURCE_TIMING_JS, Y_SOURCES, Y_READS, optsJs, startJs, STATE_JS, RESULT_LEN_JS, CHUNK, resultChunkJs, buildDoc } from './iphone-probe.mjs';

export const DEVICE = 'iPhone 15 Pro Max, iOS 26.6.1 Safari';
/** Files whose code shapes a run's stimulus and numbers: recorded per run (meta.tool), like `gesture`'s. */
export const TOOL_FILES = ['tools/iphone.mjs', 'tools/lib/iphone-run.mjs', 'tools/lib/iphone-probe.mjs', 'tools/lib/wip.mjs'];
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export function toolVersion(driver, root = REPO) {
  const git = (...a) => { const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout.trim() : null; };
  const files = {};
  for (const f of TOOL_FILES) { try { files[f] = sha16(readFileSync(join(root, f))); } catch { files[f] = null; } }
  const st = git('status', '--porcelain', '--', ...TOOL_FILES);
  return { gitHead: git('rev-parse', 'HEAD'), dirty: st === null ? null : st.length > 0, files, probe: sha16(PROBE_STD_JS + PRE_JS + STATE_START_JS + EARLY_JS + RESOURCE_TIMING_JS + startJs.toString()), driver: sha16(DRIVER_JS[driver]) };
}

export const USAGE = `usage: node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <topic> [--label l] [--out file]
    [--build <name>] [--run <id>] [--block <id>] [--arm C|V|A|B] [--pos n] [--warmup]
    [--settle 8] [--idle 3] [--bottom 3]                    scroll (S)
    --to <y> [--from 0] [--idle 3] [--hold 2] [--sentinel 3] window (W)
    [--hold 2000] [--cycles 3]                              morph (M; --hold in ms, as __fwMorphDrive takes it)
    [--tops id=selector,...]                                document tops before/after the timed window
    [--state <file.js>]                                     an expression whose value joins stateAtStart.custom
    [--y-source raf|raf-legacy|scroll|none]                 where the probe's y comes from (default raf; raf-legacy = probe v1)
    [--no-battery]                                          skip the idevicediagnostics battery read at start and end
    [--allow-during-measure]                                run although a normal chrome-measure hold is running`;

/** Device settings that a page cannot read (U9, research/architecture/unknowns-validity.md): recorded as 'unknown'
 *  rather than left out, until a device-side reader (T2: WDA / lockdown) fills them in. */
export const UNREADABLE_SETTINGS = ['lowPowerMode', 'limitFrameRate', 'batteryPct', 'charging', 'case', 'brightness', 'autoBrightness', 'contentBlockers', 'safariFeatureFlags'];
export function deviceSettings(page, battery = null) {
  const s = { ...Object.fromEntries(UNREADABLE_SETTINGS.map((k) => [k, 'unknown'])), ...(page || {}) };
  if (battery && !battery.error) {
    if (typeof battery.CurrentCapacity === 'number') s.batteryPct = battery.CurrentCapacity;
    if (typeof battery.IsCharging === 'boolean') s.charging = battery.IsCharging;
  }
  return s;
}

/** The AppleSmartBattery keys kept from `idevicediagnostics ioregentry AppleSmartBattery` (a plist): only these,
 *  never serials or other ids (Hard rule 12). Temperature is in 1/100 degC. */
export const BATTERY_KEYS = ['Temperature', 'IsCharging', 'ExternalConnected', 'FullyCharged', 'CurrentCapacity', 'MaxCapacity'];
export function parseBattery(xml) {
  const out = {};
  for (const k of BATTERY_KEYS) {
    const m = xml.match(new RegExp(`<key>${k}</key>\\s*<(integer|real|true|false)\\s*/?>(?:([^<]*)</\\1>)?`));
    if (!m) continue;
    out[k] = m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[2]);
  }
  if (!Object.keys(out).length) return { error: 'no AppleSmartBattery values in the output' };
  if (typeof out.Temperature === 'number') out.temperatureC = out.Temperature / 100;
  return out;
}
/** One battery read through libimobiledevice ($FW_IDEVICEDIAGNOSTICS names the executable, for tests). */
export function batteryInfo() {
  const bin = process.env.FW_IDEVICEDIAGNOSTICS || 'idevicediagnostics';
  const r = spawnSync(bin, ['ioregentry', 'AppleSmartBattery'], { encoding: 'utf8', timeout: 15000 });
  if (r.error) return { error: `idevicediagnostics: ${r.error.code || 'failed'}` };
  if (r.status !== 0) return { error: `idevicediagnostics exit ${r.status}` }; // no stderr: it may name the device
  return { t: new Date().toISOString(), ...parseBattery(r.stdout) };
}

const num = (v, name, { min = 0 } = {}) => { const n = Number(v); if (!Number.isFinite(n) || n < min) throw new Error(`--${name} must be a number >= ${min} (got ${v})\n${USAGE}`); return n; };

/** argv (after `run`) -> validated options. Throws with the usage on bad input. Pure. */
export function parseRunArgs(argv) {
  const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
  const flag = (n) => argv.includes(`--${n}`);
  if (flag('help') || flag('h')) return { help: true };
  const driver = opt('driver');
  if (!DRIVERS[driver]) throw new Error(`--driver must be one of ${Object.keys(DRIVERS).join(', ')}${driver ? ` (got ${driver})` : ''}\n${USAGE}`);
  const probe = opt('probe', 'std');
  if (probe !== 'std') throw new Error(`--probe must be std (got ${probe})\n${USAGE}`);
  const o = { driver, probe, label: opt('label', 'run'), out: opt('out'), settleMs: 1000 * num(opt('settle', 8), 'settle') };
  o.labels = { build: opt('build', null), run: opt('run', null), block: opt('block', null), arm: opt('arm', null), pos: opt('pos') === undefined ? null : num(opt('pos'), 'pos'), warmup: flag('warmup') };
  if (o.labels.arm !== null && !/^[A-Z]$/.test(o.labels.arm)) throw new Error(`--arm is one letter (C, V, A, B, ...), got ${o.labels.arm}`);
  o.stateFile = opt('state') ?? null;
  o.allowDuringMeasure = flag('allow-during-measure');
  o.battery = !flag('no-battery');
  const ySource = opt('y-source', 'raf');
  if (!Y_SOURCES.includes(ySource)) throw new Error(`--y-source must be one of ${Y_SOURCES.join(', ')} (got ${ySource})\n${USAGE}`);
  const tops = opt('tops');
  o.tops = tops ? tops.split(',').map((s) => { const i = s.indexOf('='); if (i < 1) throw new Error(`--tops wants id=selector[,id=selector...] (got ${s})`); return [s.slice(0, i), s.slice(i + 1)]; }) : [];
  const p = { tops: o.tops, ySource };
  if (driver === 'scroll') Object.assign(p, { idleMs: 1000 * num(opt('idle', 3), 'idle'), bottomMs: 1000 * num(opt('bottom', 3), 'bottom'), maxScrollMs: 45000 });
  if (driver === 'window') {
    if (opt('to') === undefined) throw new Error(`--driver window needs --to <y>\n${USAGE}`);
    Object.assign(p, { from: num(opt('from', 0), 'from'), to: num(opt('to'), 'to', { min: 1 }), settleAtMs: 1000, idleMs: 1000 * num(opt('idle', 3), 'idle'), holdMs: 1000 * num(opt('hold', 2), 'hold'), sentinelMs: 1000 * num(opt('sentinel', 3), 'sentinel'), maxScrollMs: 45000 });
  }
  if (driver === 'morph') Object.assign(p, { holdMs: num(opt('hold', 2000), 'hold'), cycles: num(opt('cycles', 3), 'cycles', { min: 1 }), maxDriveMs: 0 });
  if (driver === 'morph') p.maxDriveMs = 2 * p.cycles * p.holdMs + 30000;
  o.params = p;
  return o;
}

/** Upper bound of the in-page part (ms), for the poll timeout and the lease check. */
export function estimateMs(o) {
  const p = o.params;
  if (o.driver === 'scroll') return p.idleMs + p.maxScrollMs + p.bottomMs;
  if (o.driver === 'window') return (p.from > 0 ? p.settleAtMs : 0) + p.idleMs + p.maxScrollMs + p.holdMs + p.sentinelMs;
  return p.maxDriveMs;
}

export async function runCmd({ argv, requireLease, port }) {
  const o = parseRunArgs(argv.slice(argv.indexOf('run') + 1));
  if (o.help) { console.log(USAGE); return; }
  const owner = requireLease();
  const customStateJs = o.stateFile ? readFileSync(resolve(o.stateFile), 'utf8').trim().replace(/;\s*$/, '') : null;
  measureGuard(o);
  // renew the lease to cover this run (iphone-runner did it before every run), through lock.mjs, which also
  // keeps the Mac awake until the new expiry
  const need = o.settleMs + estimateMs(o) + 30000 + 2500;
  const ttl = Math.max(900, Math.ceil(need / 1000) + 60);
  const rn = spawnSync(process.execPath, [join(REPO, 'tools', 'lock.mjs'), 'renew', 'iphone', '--owner', owner, '--ttl', String(ttl)], { encoding: 'utf8', timeout: 30000 });
  if (rn.status !== 0) throw new Error(`could not renew the iphone lease: ${(rn.stderr || rn.stdout || '').trim()}`);
  const tabs = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  const tab = tabs[0];
  if (!tab) throw new Error('no Safari tab (unlock the iPhone, bring Safari to the front)');
  if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: node tools/iphone.mjs open <url> --owner ${owner} (incident I-003)`);
  const holder = lockStatus('iphone').holder;
  let leaseUrl = holder?.meta?.url;
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} }
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, your lease says ${holder.meta.url} (run: node tools/iphone.mjs open ${holder.meta.url} --owner ${owner})`);

  let c = await openTab(() => true, { port });
  const host = new URL(await c.evaluate('location.href')).host;
  await c.evaluate(`scrollTo({ top: 0, behavior: 'instant' }); setTimeout(() => location.reload(), 400); 'ok'`); // instant: html{scroll-behavior:smooth} (F-021)
  c.close();
  await sleep(2500);
  c = await openTab(host, { port });
  try {
    await c.evaluate(optsJs(o.params)).catch(() => {});
    await c.evaluate(EARLY_JS).catch(() => {});
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    const batteryStart = o.battery ? batteryInfo() : null; // before the settle: the USB query is not in the timed part
    await sleep(o.settleMs);
    requireLease(); // still ours after the settle
    measureGuard(o);
    const macStartMs = Date.now();
    const started = await c.evaluate(startJs(o.driver, o.params, { customStateJs }));
    if (started !== 'started') throw new Error(`the run did not start in the page (${JSON.stringify(started)})`);
    const t0 = Date.now(), limit = estimateMs(o) + 30000;
    let state = null;
    while (Date.now() - t0 < limit) {
      await sleep(1500); // <= ~1 Hz Runtime.evaluate during a timed run (protocol §5.5)
      state = await c.evaluate(STATE_JS);
      if (state === 'done' || state === 'error') break;
    }
    if (state !== 'done' && state !== 'error') throw new Error(`the run did not finish in ${Math.round(limit / 1000)} s (state ${state})`);
    const len = await c.evaluate(RESULT_LEN_JS);
    let s = '';
    for (let i = 0; i < len; i += CHUNK) s += await c.evaluate(resultChunkJs(i));
    if (s.length !== len) throw new Error(`read ${s.length} of ${len} result chars`);
    const raw = JSON.parse(s);
    raw.macStartMs = macStartMs;
    raw.battery = o.battery ? { start: batteryStart, end: batteryInfo() } : null;
    raw.served = await servedHashes(await c.evaluate(RESOURCES_JS).catch(() => []));
    return finish(o, owner, raw);
  } finally { c.close(); }
}

/** iphone-runner's interim rule (one.sh): no timed phone run while a NORMAL chrome-measure hold runs (a goal A/B);
 *  short-lane holds (npm test, bench mech) pass. --allow-during-measure for diagnostics. */
export function measureGuard(o, st = lockStatus('chrome-measure')) {
  if (o.allowDuringMeasure || !st.holder || st.stale || st.holder.short) return;
  throw new Error(`WAIT: chrome-measure is held by "${st.holder.owner}" (a normal hold, e.g. a goal A/B): no timed iPhone runs meanwhile. Retry after it ends, or pass --allow-during-measure for a diagnostic run`);
}

/** sha256/16 of each same-origin script/stylesheet the page loaded, fetched again from the Mac after the run. */
export async function servedHashes(urls) {
  const out = {};
  for (const u of urls || []) {
    let key = u;
    try { key = new URL(u).pathname; const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); out[key] = r.ok ? sha16(Buffer.from(await r.arrayBuffer())) : `HTTP ${r.status}`; } catch { out[key] = null; }
  }
  return out;
}

/** Raw page result -> run JSON on disk + console summary. Exported for tests. */
export function finish(o, owner, raw, { now = new Date() } = {}) {
  const doc = buildDoc(raw);
  const meta = {
    schema: SCHEMA, kind: 'run', driver: DRIVERS[o.driver], driverName: o.driver, probe: o.probe, label: o.label,
    build: o.labels.build, run: o.labels.run ?? o.label, block: o.labels.block, arm: o.labels.arm, pos: o.labels.pos, warmup: o.labels.warmup,
    owner, date: now.toISOString(), device: DEVICE, href: raw.pre?.href, ua: raw.pre?.ua, vw: raw.pre?.vw, vh0: raw.pre?.vh0, dpr: raw.pre?.dpr,
    params: { settleMs: o.settleMs, ...o.params },
    wallStartMs: raw.macStartMs ?? null, clock: raw.pre?.clock ?? null, probeVersion: raw.probeVersion ?? 1, ySource: raw.ySource ?? o.params.ySource ?? 'raf', yReads: Y_READS[raw.ySource ?? o.params.ySource ?? 'raf'] ?? null, yReadCounts: raw.yReads ?? null, settings: deviceSettings(raw.pre?.settings, raw.battery?.start), battery: raw.battery ?? null, served: raw.served || null, tool: toolVersion(o.driver), error: raw.err || null,
  };
  const out = resolve(REPO, o.out || join('out', 'iphone', `${owner}-run-${o.label}-${now.getTime()}.json`));
  const json = { meta, ...doc, tops: raw.tops, topsPost: raw.topsPost, stateAtStart: raw.stateAtStart, early: raw.early, driverResult: raw.driverResult, pre: raw.pre, post: raw.post };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json));
  const sm = doc.summary;
  const ph = Object.entries(sm.phases).map(([k, v]) => `${k} ${v.frames}fr ${v.fps} fps k>=5 ${v.k5} k>=7 ${v.k7} max ${v.max}@${v.maxY}`).join(' | ');
  console.log(`${o.label} [${meta.driver}]: ${ph}`);
  for (const f of sm.slow) console.log(`  ${f.dt} ms (${f.ticks} ticks) @y${f.yStart}->${f.yEnd} ${f.phase || '-'} rafJs ${f.rafJsMs} mut ${JSON.stringify(f.mut)} prev ${JSON.stringify(f.mutPrev)}${f.crossings.length ? ' | ' + f.crossings.join('; ') : ''}`);
  if (sm.early) console.log(`  early (load, from ${sm.early.t0nav} ms): ${sm.early.frames}fr k>=5 ${sm.early.k5} k>=7 ${sm.early.k7} max ${sm.early.max}${sm.early.slow.length ? ' [' + sm.early.slow.join(' ') + ']' : ''}`);
  if (raw.stateAtStart) console.log(`  at start: ${JSON.stringify(raw.stateAtStart)}; animations ${JSON.stringify(raw.pre?.anims)}`);
  for (const t of sm.tweens || []) console.log(`  tween from m=${t.from}: first dts ${t.dts.join(' ')}`);
  console.log(`  mutations ${JSON.stringify(sm.mutationTotals)}; crossings ${sm.crossings}; probe max ${sm.probeMsMax} ms, frames with probe > 1 ms: ${sm.framesProbeOver1ms}`);
  if (raw.driverResult?.driver) { const d = raw.driverResult.driver; const f = (s) => (s ? `${s.frames}fr p50 ${s.p50} p95 ${s.p95} >50 ${s.gt50} max ${s.max}` : '-'); console.log(`  morph: moving ${f(d.moving)} | atOne ${f(d.atOne)} | atZero ${f(d.atZero)}`); }
  console.log(`saved ${out}`);
  if (raw.err) throw new Error(`driver failed in the page: ${raw.err} (partial run saved: ${out})`);
  return out;
}

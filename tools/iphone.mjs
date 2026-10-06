#!/usr/bin/env node
// Drive the ONE shared iPhone (iOS Safari over ios_webkit_debug_proxy, :9221 device list, :9222 tabs).
// The phone shows one page at a time, so every command that touches it requires the caller to hold
// the "iphone" lease (tools/lock.mjs); read-only `status` does not.
//
//   node tools/lock.mjs acquire iphone --owner <topic> --ttl 900 --url https://lan:<port>/
//   node tools/iphone.mjs status                                  # device + open tab (no lease needed)
//   node tools/iphone.mjs open  https://lan:<port>/ --owner <topic>   # navigate Safari (location.href)
//        # also after a park (I-077): only blank views listed -> the URL loads in Safari's parked tab (the visible blank
//        # view of the app the last park recorded), else open restarts Safari (safari-restart) and loads it; --no-restart
//        # refuses instead
//        # host `lan` (or `lan-host`): this Mac's LAN address, resolved at run time (lib/lan.mjs, `node tools/lan.mjs`
//        # prints it; it changes on a Wi-Fi reconnect, I-073); also in the lease's --url and safari-restart --url
//   node tools/iphone.mjs scroll --owner <topic> [--out out/iphone/<topic>-<label>.json] [--label patched]
//   node tools/iphone.mjs record --owner <topic> [--seconds 25] [--label finger-patched]   # human scrolls meanwhile
//        # in the background with output to a log; `node tools/wait.mjs file <log> --match '^RECORDING' --pid <pid>`
//        # exits the moment it records (tell the lead then), NEVER (exit 4) if record failed first
//        # I-141 (C-045/C-046: a 45 s recording lost whole when its one final read timed out): [--poll 5] copies the new
//        # frames every 5 s (0.2 Hz; 1-60, 0 = no polls) and rewrites the file each time as `partial: true` (in progress);
//        # the final read is unchanged and authoritative. A failed read records `diag` (error, proxy close, Target
//        # events, the tab list LAN-safe) and reconnects ONCE to the recording's host (location.href, visibilityState,
//        # logger still there?); logger there: it goes on (`recovered`); else it writes the frames so far with
//        # `partial: true, reason` and prints `PARTIAL saved <file>: <reason>`, exit 6. MEASUREMENT CODE: the polls are
//        # new in-page work (lib/iphone-record.mjs); --poll 0 reproduces the old sequence. FW_RECORD_READ_MS: read timeout.
//        # I-218 [--touches]: also log the finger (touchstart/move/end: time, clientX/Y, scrollY) into the record's `touches`
//        # (lib/iphone-record.mjs RECORD_TOUCHES_JS, passive listeners) for `node tools/gesture-from-record.mjs <record>`,
//        # which turns them into a gesture script; capture runs only, never a compared run (in-page work: measurement-adjacent)
//   node tools/iphone.mjs park --owner <topic>                    # Safari to about:blank: after every block (I-047)
//   node tools/iphone.mjs battery [--every 30] [--seconds N] [--out f.jsonl]   # battery log (I-075; no lease, no page):
//        # one JSON line per idevicediagnostics read (BATTERY_KEYS only), every --every s for --seconds (lib/iphone-battery.mjs)
//   node tools/lock.mjs release iphone --owner <topic>
//   I-123: every command that needs the lease (open, scroll, record, gesture, run, park, safari-restart, wda build|start)
//   also refuses (exit 1, "WAIT: the user's step C-… by <agent> … is on the iPhone") while another owner's console step
//   is on the phone (begun, not answered, skipped or cancelled): wait for it (console.mjs wait <id> --until answered).
//   --ignore-step C-NNN passes one named step (only one its owner really left behind).
//
// Simulated finger (real OS-level touches through WebDriverAgent over USB, research/architecture/
// finger-simulation.md; NEW MEASUREMENT CODE, gesture numbers compare only with the same script hash):
//   node tools/iphone.mjs wda status | check | build --owner <topic> | start --owner <topic> | stop   # tools/lib/wda-runner.mjs
//        # wda check: exit 0 WDA READY / 3 WDA NOT READY, no lease; block runners run it before the start gate (I-112)
//        # gesture --dry-run prints GESTURE_BUDGET_S: plan that per G run (whole run, not only the strokes; I-112)
//   node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner <topic> [--label l]
//        [--variant asPerformed|slow] [--param k=v]... [--inject <logger.mjs> | --morph-log <morph-log.mjs>]
//        [--timeline <out.json>] [--idle-after-reload <ms>] [--dry-run]   # tools/lib/gesture-run.mjs; --inject runs an in-page logger on the run's
//        # own connection (I-038); --timeline records a WebKit Timeline there too, re-armed per page load (Page.disable,
//        # Page.enable, Timeline.start; F-047), one {syncT, syncTL, recs} file per segment (I-079): attribution runs or
//        # Timeline blocks only, never mixed with Timeline-off counted runs (protocol v2 §5.2, §5.5)
//        # --idle-after-reload <ms> (0-60000, default 0; I-203): idle after the script's first reload is ready (readyPageMs),
//        # before its next step; not in GESTURE_HASH; run.idleAfterReloadMs, added to GESTURE_BUDGET_S; exit 2 unless the
//        # script starts with a reload
//   node tools/iphone.mjs safari-restart --owner <topic> [--url U] [--via auto|wda|devicectl] [--timeout 30]
//        # quit + relaunch Safari (WDA apps endpoints, else devicectl --terminate-existing), open U if given, wait
//        # until the proxy lists a page that answers Runtime.evaluate; prints SAFARI_RESTARTED (tools/lib/safari-restart.mjs)
//
// `scroll` is the calibrated scripted scroll (research/cpu-throttle-calibration/tools/iphone_scroll.mjs):
// reload, settle 8 s, rAF frame logger, 3 s idle, scrollBy({top:250, behavior:'smooth'}) every 300 ms to
// the bottom, 3 s at the bottom. It does NOT exercise the touch-only paths (non-passive touchmove
// scroll-jack, toolbar-collapse resize); those need a human finger (ask the lead / user).
// Self-signed https (incident I-003): iOS Safari stops at its certificate warning for the mirror's
// self-signed cert on every new port, and nothing here can click through it. `serve.mjs --https` (and
// `fix.mjs serve`) therefore also serve a plain-http twin port; `open <https mirror URL>` switches to
// it (--keep-https opts out, for a phone that trusts the cert) and after navigating fails loudly if
// Safari is not on the mirror page (certificate warning), instead of leaving it there to be measured.
//
// Mac quiet (I-056): scroll, record, run and gesture (on the phone) refuse with WAIT (exit 1) while someone else's normal
// chrome-measure hold holds it; an exclusive short-lane job passes, and so does the runner's own hold (its owner, or the
// hold `lock.mjs run` exports in FW_LOCK_HELD), a --no-timing one included: the phone stamps its own frames, so a phone
// part that wants a quiet Mac runs inside `node tools/lock.mjs run chrome-measure --owner <o> --no-timing --max-seconds
// 600 -- sh -c '<part>'`, which waits its turn and keeps every other job off the Mac. Shared jobs (npm test, a Simulator
// session) do not stop a phone run (Mac-quiet is preferred, not required: the lead, 08:33Z; user T-017): it prints a NOTE
// and its record keeps the Mac state (`mac`: shared jobs, load1 at start and end); --require-quiet or
// FW_PHONE_REQUIRE_QUIET=1 makes it WAIT for them instead. --allow-during-measure: diagnostics only.
// I-176: `scroll`, `run` and `gesture` take --warmup (also FW_PHONE_WARMUP=1; `record` refuses it, exit 2): an uncounted
// warm-up run may run beside ANOTHER agent's --no-timing hold (a build: the phone stamps its own frames, and a warm-up's
// numbers are not counted), with a NOTE and mac.warmup / mac.beside {owner, kind} in the record. A normal (timing) hold
// still WAITs it, and a counted run or a sentinel/control run must not take --warmup (it would pass a gate it must keep).
//
// Protocol v2 runs (T1a, research/architecture/measurement-protocol-v2.md §5.4-5.5; tools/lib/iphone-run.mjs):
//   node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <topic> [--label l] ...   (run --help)
// one reload + settle + driver run with the standard probe (per-frame log, uncapped mutation counts by type,
// crossing log, tool hashes) -> out/iphone/<owner>-run-<label>-<ts>.json (schema fw-iphone-run/1).
//
// Thermal test profile (I-186; user T-162 #3/#5; tools/lib/thermal-profile.mjs): run, scroll, record and gesture take
// --profile serious|fair (default serious; there is no "none"):
//   serious = Xcode's Device Conditions > Thermal State "Serious" (Is Induced = Yes), no heat pre-warm (gate xcode-serious)
//   fair    = Nominal or Fair, not induced (gate real-fair)
// The ceiling (Critical, or battery >= 44 C) holds in both. The hold (your `lock.mjs run chrome-measure` hold when the run
// is inside one, else your iphone lease) is checked at its START (one xctrace Thermal State read, ~25 s, made by the
// hold's first run before Safari is touched and reused by its later runs; a read is never in the timed part) and at its
// END (`lock.mjs run` makes it when its command ends; outside a run hold: `iphone.mjs profile --end`). On a misfit at the
// start the run REFUSES, exit 8, and prints what to switch, e.g. "phone is Nominal; set Xcode > Window > Devices and
// Simulators > the phone > Device Conditions > Thermal State > Serious > Start (leave it on)"; when an Xcode action fixes
// it, it also posts ONE console action step for the tester (by the run's owner, de-duplicated per owner and profile while
// it is open, and for 30 min after the user answered one unless the condition read changed, I-201) and prints its id
// (STEP C-…); it does not wait for it. The refusal line ends "(gate <gate> code <n>, reason <reason>, I-186)": reason
// phone-above-condition (I-201) = Xcode's condition IS Serious and the phone itself is Critical above it: battery < 38 C,
// stop the condition, wait ~2 min for a re-read below Critical, start Serious again (step restart-condition, at most once
// per 30 min); else wait for it to cool, no step (reason codes: lib/thermal-profile.mjs refusalText). A misfit at the end keeps the data
// and marks every run record of the hold meta.profileDrift: true. Every record carries meta.profile {name, gate, hold,
// start, end, drift} (start/end: state, induced, condition (the Xcode condition's own level, I-201), battC, gate code).
// No CLI can set the Xcode condition (devicectl has none,
// research/thermal-condition-cli). A Simulator session reads nothing (meta.profile.skipped).
//   node tools/iphone.mjs profile --owner <topic> [--profile serious|fair]   # one read now (your lease): exit 0 fits,
//        # 8 misfit (+ the step); inside your hold it is the hold's start read, so the first run reads nothing more.
//        # Before a finger test (record) run it first, so a misfit never meets the user's Start.
//   node tools/iphone.mjs profile --owner <topic> --end                      # the hold's end read now; exit 8 on drift
// Exit codes: 0 ok, 1 error or WAIT, 2 refused in a shared slot, 3 WDA NOT READY (wda check), 6 PARTIAL (record),
// 8 PROFILE (the phone's thermal state does not fit --profile).
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { openTab, navigate, safariTab, sleep, parkSafari, connect, findParkedTab } from './lib/wip.mjs';
import { status as lockStatus, timedInSlotRefusal, phoneGuard, phoneMacRecord, describeHold, phoneHolder } from './lib/lock.mjs';
import { keepAwakeFor } from './lib/awake.mjs';
import { runnerRefusal } from './lib/phone-step.mjs';
import { parseJob, phoneRunText } from './lib/hold-job.mjs';
import { basename, extname } from 'node:path';
import { REPO } from './lib/paths.mjs';
import { mirrorInfo, iphoneTarget, LANDED_JS, landedProblem, CERT_WARNING_TITLE, lanSafeRecord, lanSafeText } from './lib/iphone-url.mjs';
import { resolveLanUrl, tryResolveLanUrl } from './lib/lan.mjs';
import { RECORD_JS, RECORD_TOUCHES_JS, TOUCH_FIELDS, recordSummary, recordRun, parsePoll, EXIT_PARTIAL } from './lib/iphone-record.mjs';
import { exitOnHelp } from './lib/help.mjs';
import { startGate, closeHold, currentHold, parseProfile, PROFILES, EXIT_PROFILE } from './lib/thermal-profile.mjs';

exitOnHelp(import.meta.url, { unless: (a) => a[0] === 'run' }); // I-152 N10: --help prints the header above and exits before anything runs
let exitCode = 0; // I-141: record exits 6 PARTIAL when it saved only part of a run

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const VALUED = ['--ignore-step', '--owner', '--out', '--label', '--seconds', '--variant', '--param', '--morph-log', '--inject', '--timeline', '--ref', '--team', '--udid', '--bundle-id', '--timeout', '--url', '--via', '--doing', '--every', '--poll', '--profile'];
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const PORT = Number(process.env.FW_IPHONE_PORT || 9222);
const DEVICE_PORT = Number(process.env.FW_IPHONE_DEVICE_PORT || 9221);

function requireLease() {
  // I-168: the phone's holder: inside `lock.mjs run iphone` its token ($FW_LOCK_HELD) names it (no --owner needed), else
  // --owner must hold it; the refusal names the run form
  const owner = phoneHolder({ owner: opt('owner', process.env.FW_LOCK_OWNER), st: lockStatus('iphone') });
  // I-123: never touch the phone under another owner's console step that is on it (begun, not over); the Simulator is
  // not the phone. --ignore-step C-NNN: a step its owner left behind, named on purpose.
  const busy = process.env.FW_SIM_SESSION ? null : runnerRefusal({ owner, ignore: opt('ignore-step') });
  if (busy) throw new Error(busy);
  return owner;
}

// I-060: a phone run (scroll|record|run|gesture) marks the lease with what it runs (meta.run {text, since, pid}; the
// progress page's "Right now"), from --doing "<plain line>" or its own flags (lib/hold-job.mjs phoneRunText), and
// clears it when it ends (a killed run leaves a marker whose pid is gone: the page ignores it). Best effort: a marker
// that cannot be written never stops a run.
let runMark = null;
function runText() {
  if (opt('doing') !== undefined) return parseJob({ text: opt('doing') }).text;
  if (cmd === 'run') {
    try { const o = parseRunArgsSync(argv.slice(argv.indexOf('run') + 1)); return phoneRunText('run', { label: o.label, driver: o.driver, labels: o.labels }); } catch { return phoneRunText('run', {}); }
  }
  const label = opt('label') ?? (cmd === 'gesture' && arg ? basename(arg, extname(arg)) : cmd === 'record' ? 'finger' : undefined);
  return phoneRunText(cmd, { label });
}
let parseRunArgsSync = () => ({});
function leaseAndMark() {
  const owner = requireLease();
  keepAwakeFor(`iphone.mjs ${cmd} (${owner})`); // I-070: a phone run is a measurement: caffeinate -i -s -w <this pid>
  if (!runMark) {
    const text = runText();
    runMark = { owner, done: describeHold('iphone', { owner, run: { text, since: new Date().toISOString(), pid: process.pid } }).catch(() => null) };
  }
  return owner;
}
async function clearMark() {
  if (!runMark) return;
  try { await runMark.done; await describeHold('iphone', { owner: runMark.owner, run: null }); } catch {}
}

/** I-056: scroll and record refuse (WAIT, exit 1) like `run` and `gesture` beside someone else's normal chrome-measure
 *  hold; the runner's own hold passes; shared jobs pass with a NOTE and the Mac state in the record (`mac`) unless
 *  --require-quiet or FW_PHONE_REQUIRE_QUIET=1 (lib/lock.mjs phoneGuard). --allow-during-measure: diagnostics. */
function measureGuard(owner) {
  return phoneGuard({ owner, allow: flag('allow-during-measure'), requireQuiet: flag('require-quiet'), warmup: cmd === 'scroll' && flag('warmup') }); // I-176: only an uncounted warm-up scroll
}

/** I-186: the phone's thermal state against the run's --profile (serious, the default, or fair) at its hold's start: one
 *  read per hold (lib/thermal-profile.mjs startGate; the hold's later runs reuse it), before Safari is touched. A misfit
 *  throws (exit EXIT_PROFILE, 8) after posting the tester's console step. Returns {record(), saved(file)}: the record's
 *  meta.profile, and the file's registration for the hold's end read (profileDrift). A Simulator session reads nothing. */
async function profileGate(owner, profile = opt('profile')) {
  const name = parseProfile(profile);
  if (process.env.FW_SIM_SESSION) return { record: () => ({ name, gate: PROFILES[name].gate, skipped: 'simulator session' }), saved: async () => {} };
  return startGate({ profile: name, owner, hold: currentHold() });
}

async function tabs() {
  return (await (await fetch(`http://localhost:${PORT}/json`, { signal: AbortSignal.timeout(4000) })).json());
}

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

/** safari-restart (tools/lib/safari-restart.mjs): quit + relaunch Safari (WDA, else devicectl), load `url` if given. */
async function restartSafari(url) {
  const { safariRestart, wdaDriver, devicectlDriver } = await import('./lib/safari-restart.mjs');
  const { readConfig } = await import('./lib/wda-runner.mjs');
  const { WDA_URL } = await import('./lib/wda.mjs');
  const known = readConfig();
  return safariRestart({ drivers: [wdaDriver({ base: WDA_URL() }), devicectlDriver({ udid: known.udid })], via: opt('via', 'auto'), url, port: PORT,
    timeoutMs: 1000 * Number(opt('timeout', 30)), known, keepHttps: flag('keep-https') });
}

/** Incident I-077: after a park (I-047, `run` parks by default) the proxy lists only blank views, which openTab never
 *  picks (I-037), so `open` failed with BLOCKED. When no web page is listed: load the URL in Safari's parked tab (the one
 *  visible blank view of the app the last park recorded, lib/wip.mjs findParkedTab), else restart Safari and load it
 *  there (safari-restart; --no-restart refuses instead; a Simulator session points to sim.mjs safari-restart). Returns
 *  false when Safari shows a web page: open goes on as before. */
async function openParked(url, target, info) {
  const p = await findParkedTab({ port: PORT });
  if (p.notParked) return false;
  let why = p.why;
  if (p.tab) {
    console.log(`Safari is parked (only blank views listed, I-047): loading the URL in Safari's parked tab (${p.appId}, I-077)`);
    let c2;
    try { c2 = await navigate(await connect(p.tab.webSocketDebuggerUrl, { timeoutMs: 8000 }), target.url, new URL(target.url).host); } catch (e) {
      if (target.url.startsWith('https:')) e.message += ` (Safari never listed ${target.url}; if it shows "This Connection Is Not Private", that is the certificate warning: open the http:// URL instead, incident I-003)`;
      why = `the parked tab did not load it (${e.message})`;
    }
    if (c2) {
      const landed = await c2.evaluate(LANDED_JS);
      c2.close();
      const problem = landedProblem(landed, target.url, info);
      if (problem) throw new Error(problem);
      console.log(`Safari now on ${landed.href}`);
      return true;
    }
  }
  const owner = opt('owner', process.env.FW_LOCK_OWNER);
  const head = `Safari is parked (only blank views listed, I-047) and open can't use its tab: ${why}`;
  if (process.env.FW_SIM_SESSION) throw new Error(`${head}; in a Simulator session: node tools/sim.mjs safari-restart --url <url>`);
  if (flag('no-restart')) throw new Error(`${head}; without --no-restart, open restarts Safari and loads the URL (iphone.mjs safari-restart --owner ${owner} --url <url>)`);
  console.log(`${head}; restarting Safari to load the URL (I-077)`);
  const r = await restartSafari(url);
  console.log(`Safari now on ${r.href}`);
  return true;
}

/** `iphone.mjs profile --owner <o> [--profile serious|fair] [--end]` (I-186). Without --end: one fresh read now, checked
 *  against the profile; it counts as the start read of your hold (your lock.mjs run hold, else your iphone lease), so the
 *  hold's first run reads nothing more; a misfit posts the tester's step and exits 8. --end: the end read of your hold
 *  now (closeHold): every run record of the hold gets profile.end / profileDrift; exit 8 on drift. */
async function profileCmd() {
  const owner = requireLease(); // the read is a phone access (Hard rule 9): your lease, like a run
  measureGuard(owner); // and, like a run, never beside someone else's normal chrome-measure hold (I-056)
  const hold = currentHold(); // your lock.mjs run hold, else your lease
  if (flag('end')) {
    const s = await closeHold({ ...hold });
    if (!s.length) console.log(`PROFILE nothing to close: no phone run of this hold (${hold.resource}) is waiting for an end read`);
    if (s.some((x) => x.drift)) exitCode = EXIT_PROFILE;
    return;
  }
  await startGate({ profile: parseProfile(opt('profile')), owner, hold, force: true });
}

async function main() {
  // review-lock-share N5: a timing command never runs inside a functional slot (FW_LOCK_SHARED from `lock.mjs run
  // --shared`, in either switch state) or a functional Simulator session (FW_SIM_FUNCTIONAL, also via FW_IPHONE_PORT)
  const refusal = ['scroll', 'record', 'run', 'gesture'].includes(cmd) && !flag('help') ? timedInSlotRefusal(`iphone.mjs ${cmd}`) : null;
  if (refusal) { console.error(refusal); process.exit(2); }
  if (['scroll', 'record', 'run', 'gesture'].includes(cmd) && !flag('help') && opt('doing') !== undefined) parseJob({ text: opt('doing') }); // I-060: a bad --doing fails before the phone is touched
  // I-176: --warmup (an uncounted warm-up run may run beside another agent's --no-timing hold) is for scroll, run and
  // gesture; a finger-test record is never a warm-up
  if (cmd === 'record' && flag('warmup') && !flag('help')) { console.error('usage: --warmup is not for record (a finger test is never an uncounted warm-up); it is for scroll, run and gesture (I-176)'); process.exit(2); }
  if (['scroll', 'record', 'run', 'gesture', 'profile'].includes(cmd) && !flag('help') && !flag('h')) parseProfile(argv.includes('--profile') && opt('profile') === undefined ? '' : opt('profile')); // I-186: a bad --profile fails before the phone is touched
  if (cmd === 'run') parseRunArgsSync = (await import('./lib/iphone-run.mjs')).parseRunArgs;
  if (cmd === 'status') {
    const dev = await fetch(`http://localhost:${DEVICE_PORT}/json`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch((e) => ({ error: `proxy not reachable on :${DEVICE_PORT} (${e.cause?.code || e.message})` }));
    console.log('device:', JSON.stringify(dev));
    console.log('tabs:', JSON.stringify((await tabs().catch((e) => [{ error: `proxy not reachable on :${PORT} (${e.cause?.code || e.message})` }])).map((t) => ({ url: t.url, title: t.title, appId: t.appId, error: t.error }))));
    const s = lockStatus('iphone');
    console.log('lease:', s.holder ? `${s.holder.owner}${s.stale ? ' (stale: ' + s.stale + ')' : ''} until ${s.holder.expiresAt}` : 'free', s.queue.length ? `queue: ${s.queue.map((w) => w.owner).join(', ')}` : '');
    return;
  }
  if (cmd === 'battery') { // I-075: read-only battery logger (lib/iphone-battery.mjs); no lease, no page, like wait.mjs phone-temp
    const code = await (await import('./lib/iphone-battery.mjs')).batteryCmd({ opt });
    if (code) process.exit(code);
    return;
  }
  if (cmd === 'open') {
    requireLease();
    if (!/^https?:\/\//.test(arg || '')) throw new Error('usage: node tools/iphone.mjs open <url> --owner <topic>');
    const url = resolveLanUrl(arg); // http://lan:<port>/ -> this Mac's LAN address now (I-073)
    const info = await mirrorInfo(url);
    const target = iphoneTarget(url, info, { keepHttps: flag('keep-https') });
    if (target.note) console.log(target.note);
    if (await openParked(url, target, info)) return; // Safari parked (I-047): its parked tab, or a Safari restart (I-077)
    const c = await openTab(() => true);
    let c2;
    try { c2 = await navigate(c, target.url, new URL(target.url).host); } catch (e) {
      if (target.url.startsWith('https:')) e.message += ` (Safari never listed ${target.url}; if it shows "This Connection Is Not Private", that is the certificate warning: open the http:// URL instead, incident I-003)`;
      throw e;
    }
    const landed = await c2.evaluate(LANDED_JS);
    c2.close();
    const problem = landedProblem(landed, target.url, info);
    if (problem) throw new Error(problem);
    console.log(`Safari now on ${landed.href}`);
    return;
  }
  if (cmd === 'scroll') {
    const owner = leaseAndMark();
    const mac = measureGuard(owner);
    const prof = await profileGate(owner); // I-186: the thermal profile at the hold's start (one read per hold; refuses, exit 8)
    const holder = lockStatus('iphone').holder;
    const list = await tabs();
    const tab = safariTab(list); // never a blank web view of another app, never the first of several (I-037)
    if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: node tools/iphone.mjs open <url> --owner ${owner} (it opens a self-signed https mirror over its plain-http twin, incident I-003)`);
    let leaseUrl = tryResolveLanUrl(holder.meta?.url); // a `lan` placeholder lease URL (I-073)
    if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} } // https lease URL, Safari on its http twin
    if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, your lease says ${holder.meta.url} (run: node tools/iphone.mjs open ${holder.meta.url} --owner ${owner})`);
    let c = await openTab(() => true);
    const host = new URL(await c.evaluate('location.href')).host;
    await c.evaluate(`scrollTo(0, 0); setTimeout(() => location.reload(), 400); 'ok'`);
    c.close();
    await sleep(2500);
    c = await openTab(host);
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    await sleep(8000);
    await c.evaluate(`window.__iphRes = undefined; ${PROBE}.then(v => { window.__iphRes = JSON.stringify(v); }, e => { window.__iphRes = JSON.stringify({err: String(e)}); }); 'started'`);
    let res = null;
    const t0 = Date.now();
    while (!res && Date.now() - t0 < 90000) { await sleep(1500); const v = await c.evaluate('window.__iphRes || null'); if (v) res = JSON.parse(v); }
    c.close();
    if (!res) throw new Error('probe did not finish in 90 s');
    if (res.err) throw new Error(res.err);
    res.summary = summarize(res);
    res.meta = { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', owner, label: opt('label', ''), date: new Date().toISOString() };
    res.mac = phoneMacRecord(mac); // I-056: shared jobs and load1 on the Mac at start and end
    res.meta.profile = prof.record(); // I-186: profile, the hold's start read (the end read stamps end/drift)
    const out = resolve(REPO, opt('out', join('out', 'iphone', `${owner}-${opt('label', 'run')}-${Date.now()}.json`)));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(lanSafeRecord(res))); // no LAN address in the file (Hard rule 12)
    await prof.saved(out); // I-186: listed for the hold's end read
    console.log(JSON.stringify(res.summary, null, 1));
    console.log(`saved ${out}`);
    return;
  }
  if (cmd === 'record') {
    // Finger test: log rAF frames + scrollY while a human scrolls (touch-only paths: non-passive
    // touchmove scroll-jack, toolbar-collapse resize). The lead asks the user to scroll; see CLAUDE.md.
    const owner = leaseAndMark();
    const mac = measureGuard(owner);
    const prof = await profileGate(owner); // I-186: the thermal profile at the hold's start (one read per hold; refuses, exit 8)
    const secs = Number(opt('seconds', 25));
    const pollSec = parsePoll(opt('poll')); // I-141: save as it goes (lib/iphone-record.mjs); 0 = the old single final read
    const touches = flag('touches'); // I-218: also log the finger's touches (RECORD_TOUCHES_JS) for gesture-from-record.mjs
    const out = resolve(REPO, opt('out', join('out', 'iphone', `${owner}-${opt('label', 'finger')}-${Date.now()}.json`)));
    mkdirSync(dirname(out), { recursive: true });
    const save = async (res) => { // the record as the old code built it; atomic, so a reader never sees half a file
      res.summary = recordSummary(res);
      res.meta = { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', owner, label: opt('label', 'finger'), seconds: secs, date: new Date().toISOString() };
      if (touches) res.meta.touches = { fields: TOUCH_FIELDS, note: 'I-218 capture run: passive touch listeners in the page; never a compared run' };
      res.mac = phoneMacRecord(mac); // I-056: shared jobs and load1 on the Mac at start and end
      res.meta.profile = prof.record(); // I-186: profile, the hold's start read (the end read stamps end/drift)
      writeFileSync(`${out}.${process.pid}.tmp`, JSON.stringify(lanSafeRecord(res))); // no LAN address in the file (Hard rule 12)
      renameSync(`${out}.${process.pid}.tmp`, out);
    };
    const c = await openTab(() => true);
    await c.evaluate(RECORD_JS);
    if (touches && (await c.evaluate(RECORD_TOUCHES_JS)) !== 'installed') throw new Error('record --touches: the touch logger did not install (no frame logger in the page)');
    const href = await c.evaluate('location.href');
    console.log(`RECORDING ${secs} s on ${href} - the human should scroll now (top to bottom, then push past the end)`);
    const readMs = Number(process.env.FW_RECORD_READ_MS || 15000);
    const r = await recordRun({ c, seconds: secs, href, pollSec, readMs, save, sleep, listTabs: tabs, reconnect: (host) => openTab(host, { tries: 2 }), touches });
    await save(r.rec);
    await prof.saved(out); // I-186: listed for the hold's end read
    console.log(JSON.stringify(r.rec.summary, null, 1));
    if (touches) console.log(`TOUCHES ${(r.rec.touches || []).length} events (${(r.rec.touches || []).filter((e) => e[1] === 's').length} touchstarts): node tools/gesture-from-record.mjs ${out}`);
    if (r.partial) { exitCode = EXIT_PARTIAL; console.log(`PARTIAL saved ${out}: ${lanSafeText(r.reason)} (${r.rec.frames.length} frames; diag in the file; incident I-141)`); return; }
    console.log(`saved ${out}`);
    return;
  }
  if (cmd === 'park') {
    // incident I-047: a test page left open between blocks keeps animating and heats the phone; park Safari on
    // about:blank (the lease holder's tab, pickTab rules, I-037). `iphone.mjs open <url>` brings a page back.
    requireLease();
    const r = await parkSafari({ port: PORT });
    console.log(r.already ? 'PARKED already: Safari shows no web page' : `PARKED Safari on about:blank (was ${r.from})`);
    return;
  }
  if (cmd === 'gesture') return (await import('./lib/gesture-run.mjs')).gestureCmd({ argv, arg, opt, flag, requireLease: leaseAndMark, port: PORT, profileGate });
  if (cmd === 'wda') {
    const c = await (await import('./lib/wda-runner.mjs')).wdaCmd({ sub: arg, opt, requireLease });
    if (arg === 'check' && c) { await clearMark(); process.exit(c); } // I-112: 3 = WDA NOT READY (other subcommands keep exit 0)
    return c;
  }
  if (cmd === 'safari-restart') {
    requireLease();
    await restartSafari(opt('url', null));
    return;
  }
  if (cmd === 'run') return (await import('./lib/iphone-run.mjs')).runCmd({ argv, requireLease: leaseAndMark, port: PORT, profileGate });
  if (cmd === 'profile') return profileCmd();
  console.log('usage: node tools/iphone.mjs status | open <url> --owner <topic> [--keep-https] [--no-restart] | scroll --owner <topic> [--label x] [--out file] [--warmup] [--require-quiet] [--allow-during-measure] | park --owner <topic> | record --owner <topic> [--seconds 25] [--poll 5] [--touches] [--require-quiet] [--allow-during-measure] | gesture <script.json> --owner <topic> [--dry-run] [--idle-after-reload <ms>] [--warmup] [--require-quiet] [--allow-during-measure] | wda status|check|build|start|stop | safari-restart --owner <topic> [--url U] [--via auto|wda|devicectl] [--timeout 30] | battery [--every 30] [--seconds N] [--out f.jsonl] | run --driver scroll|window|morph --probe std --owner <topic> (run --help)');
}
main().then(async () => { await clearMark(); process.exit(exitCode); },async (e) => { console.error(e.message || e); await clearMark(); process.exit(e?.exitCode || 1); }); // I-186: a profile misfit exits 8

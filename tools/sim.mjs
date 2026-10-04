#!/usr/bin/env node
// Drive the Xcode iOS Simulator (`fw-sim 15 Pro Max`, Mobile Safari) the way tools/iphone.mjs drives the phone,
// with the same probes, so a Simulator record has the phone record's schema plus meta.device "simulator" and
// meta.sim (research/simulator/README.md §7; NEW MEASUREMENT CODE: Simulator numbers never pool with phone or
// Chrome numbers, tools/lib/stats.mjs refuses that). Library: tools/lib/sim.mjs (privacy and phone-safety rules
// in its header: phone UDIDs only in a mode-600 config file, the proxy never attaches to or navigates the phone).
//
//   node tools/sim.mjs setup [--device k] [--runtime <iOS 26.5|id>]   create the device if absent, store config (no boot)
//   --device fw-sim | fw-ipad | fw-ipad-a16 | fw-ipad-mini (I-087, user T-040): the Simulator a command drives. Default
//        fw-sim (the iPhone 15 Pro Max stand-in; config.json; every caller unchanged); the iPads (fw-ipad: iPad Pro 13-inch
//        M5, fw-ipad-a16: iPad A16, fw-ipad-mini: iPad mini A17 Pro) are the real tablet case, for pixel / layout checks
//        (no timing). An iPad is created on demand (setup --device k, or its first session) from a device type and iOS
//        runtime Xcode already has; nothing is downloaded (none installed: refused). One Simulator at a time: a session
//        shuts a warm device of another key down first (I-063 warm reuse stays per device). Inside a session every
//        command drives the session's device (FW_SIM_DEVICE in <cmd>'s env); status / doctor / shutdown without
//        --device look at the live session's, else a booted configured device, else the warm one, else fw-sim.
//   node tools/sim.mjs status                                 device, session, proxy, WDA-sim (UDIDs masked)
//   node tools/sim.mjs doctor [--fix]                         a booted fw-sim without a live session = leak
//   # the normal entry point: inside YOUR OWN NORMAL chrome-measure hold (≤ ~7 min; the Simulator loads the host)
//   node tools/lock.mjs run chrome-measure --owner <o> --max-seconds 420 -- \
//     node tools/sim.mjs session --owner <o> [--window shown|hidden] -- <cmd> [args]
//        boots, starts the proxy (:9231 list, :9232 tabs), runs <cmd> with FW_IPHONE_PORT=FW_SIM_PORT=9232,
//        FW_SIM_SESSION and FW_SIM_UDID set, then ALWAYS stops the proxy and shuts the Simulator down
//        (window shown, the default: Simulator.app shows the device; arch-sim's pilot: headless had stray >34 ms gaps)
//   # a FUNCTIONAL session (no timing: does a page load, does a tool work): a shared-lane reader of weight 3 (ts-lock-share,
//   # research/architecture/lock-shared-lane.md §3; while the lead's switch is off it runs as an exclusive short job):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <o> -- \
//     node tools/sim.mjs session --functional --owner <o> [--window shown|hidden] -- <cmd> [args]
//        open and wda start work inside it; scroll, record and run (timing) are refused. Every session (functional or
//        not) holds the exclusive `simulator` process lock: one fw-sim, one session at a time.
//        I-078: a fw-sim still in transition (Shutting Down / Booting, e.g. the last session's after Simulator.app quit)
//        is waited out under that lock (FW_SIM_TRANSITION_SEC, default 60, within the hold's time), never shut down;
//        then the rules below apply. A session's cleanup likewise waits for a shutdown in progress (within its hold's
//        time) before it hands the lock on. doctor reports a transition (not a leak); doctor --fix waits for it.
//        I-063: a functional session that ran its <cmd> (no signal) does NOT shut fw-sim down: it quits Safari, records
//        sim/warm.json and starts a keeper (`sim.mjs keeper <id>`, pidfile sim/keeper.pid.json; `status` shows both)
//        that shuts it down FW_SIM_IDLE_SEC (default 600; 0 = shut down at the end as before) after the session, or
//        as soon as chrome-measure has a timing holder or waiter, never while a session holds the simulator lock.
//        The next functional session takes the warm device over (same device, type and runtime; else refused): no
//        boot; Safari quit, its HTTP cache emptied, relaunched, proxy restarted. A timing session never starts warm: it
//        shuts the warm device down and cold-boots (meta.sim boot.afterWarm), and always shuts down at its end.
//        I-082: before <cmd>, every session waits (at most FW_SIM_SETTLE_SEC, default 45, and a quarter of the time its
//        command has) until the Simulator's own background CPU (its launchd_sim tree minus Safari / WebKit / WDA) is at or
//        below FW_SIM_BG_LIMIT_PCT (default 60 % of one core), and prints SIM_QUIET settled|NOT settled (never fails);
//        during <cmd> it reads that background every FW_SIM_BG_EVERY_SEC (10; 0 = off) and prints SIM_BACKGROUND (mean,
//        max, busy windows, busiest processes) at the end. Every reading goes to <state>/sim/background.jsonl (one line
//        per settle / window / summary, with the session id; $FW_SIM_BACKGROUND_LOG names it for <cmd>), and the settle
//        reading to meta.sim.background of scroll / record / run / gesture records. Read-only: nothing in the Simulator
//        is stopped (tools/lib/sim-background.mjs).
//   --reduce-motion on|off (I-100, any session): sets the Simulator's Reduce Motion (Settings > Accessibility > Motion) after
//        Safari is terminated and before it launches, and restores the value it found at the session's end (also after a
//        failed <cmd> or a signal; a session killed with SIGKILL leaves <state>/sim/reduce-motion.json, and the next
//        session of that device restores it at boot; status / doctor show it, doctor --fix restores it on a booted
//        device). Recorded in the session record and meta.sim.reduceMotion. Every `open` in such a session checks that
//        the page's prefers-reduced-motion agrees (REDUCE_MOTION page reduce|no-preference ...: ok, else it fails).
//        Mechanism (simctl spawn defaults com.apple.Accessibility ReduceMotionEnabled): tools/lib/sim-motion.mjs.
//   node tools/sim.mjs reduce-motion                          inside a session: the setting and the last open's page's
//        prefers-reduced-motion; exit 0 when both match the session's --reduce-motion (or it set none), 3 when not
//   node tools/sim.mjs background [--seconds 3]               one reading of the Simulator's background CPU now (read-only)
//   node tools/sim.mjs shutdown [--warm-only --reason r --by b]  now (--warm-only: only a warm device, under the
//        simulator lock: verify.mjs / bench gain / quiet phone runs call it before timing, I-063)
//   # inside a session (its <cmd>, e.g. sh -c '...'):
//   node tools/sim.mjs open <url> [--out f.png]                simctl openurl, wait until Safari lists it, screenshot to out/sim/;
//        and records its server's host: the session's later scroll / record / run / gesture / safari-restart pick only tabs
//        on it (FW_TAB_HOST), so a tab Safari restored from an earlier session is never a candidate (I-050)
//   node tools/sim.mjs fetched <url or path part> [--log <server log>]   did the last open's page get it over the network
//        (Resource Timing transferSize > 0; plus the server log's GETs)? exit 0 yes, 3 cache / unknown / no GET, 1 no
//        such resource (I-052; every session also empties Safari's HTTP cache before Safari launches, so a port an
//        earlier session used serves this session's files; within a session Safari still caches immutable assets)
//   node tools/sim.mjs scroll [--label l] [--out f]            iphone.mjs scroll's probe and sequence -> out/sim/<owner>-<label>-<ts>.json
//   node tools/sim.mjs record [--seconds 25] [--label l]       iphone.mjs record's frame logger
//   node tools/sim.mjs run --driver scroll|window|morph ...    iphone.mjs run (std probe, fw-iphone-run/1) -> out/sim/<owner>-run-<label>-<ts>.json
//   node tools/sim.mjs wda start                               WDA-sim on :8101 (the session stops it); `wda stop`
//   node tools/sim.mjs orient portrait|landscape [--settle-ms 1500]   rotate the Simulator through WDA-sim (start it first)
//        and read it back (I-087; lib/wda.mjs sends orientation only to a Simulator WDA, never the phone's :8100); allowed
//        in a functional session (no timing). Prints ORIENTATION <portrait|landscape>
//   node tools/sim.mjs safari-restart [--url U] [--via auto|wda|simctl] [--timeout 30]   quit + relaunch Safari (WDA-sim if up,
//        else simctl), open U, wait until it answers (tools/lib/safari-restart.mjs; iphone.mjs safari-restart on the phone)
//   node tools/sim.mjs gesture <script.json> [--label l] [--variant v] [--param k=v]... [--morph-log f] [--dry-run]
//        iphone.mjs gesture on the Simulator: strokes to WDA-sim (start it first), page over the session's proxy
//        -> out/sim/<owner>-gesture-<label>-<ts>.json, meta.device simulator + meta.sim. For mechanism checks (touch
//        counts, prevented moves, dp per stroke); Simulator timing is never a verdict (F-084). --dry-run needs no session.
//        Timed like record: refused in a functional session and in a --no-timing hold, unless
//   node tools/sim.mjs gesture <script.json> --count-only [--label l] ...   (I-184) counts only, no timing number: runs in
//        any session, so also in a functional one (shared slot of weight simulator) or a --no-timing hold (no host gate):
//          node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner <o> -- \
//            node tools/sim.mjs session --functional --owner <o> -- sh -c 'node tools/sim.mjs open <url> && node tools/sim.mjs gesture <s> --count-only'
//        The record (meta.countOnly {incident, lock, note}) keeps no frame log (segments get frameCount), no morph frames
//        and a counts-only summary (frames, touchmoves, prevented, toolbar transitions, pin, overscroll px, flings); it
//        prints COUNT_ONLY {json} instead of the summary. Refuses --timeline and --morph-log. --inject loggers still
//        run: report counts from them, never times. iphone.mjs gesture refuses --count-only.
//   # WDA for the Simulator, unsigned (no Apple ID), built once in your own normal hold (minutes of CPU):
//   node tools/lock.mjs run chrome-measure --owner <o> --max-seconds 600 -- node tools/sim.mjs wda build --owner <o>
//   # debugging parts of `session` (boot: in your own normal hold; shutdown / proxy stop: always allowed)
//   node tools/sim.mjs boot --owner <o> | shutdown [--force] | proxy start --owner <o> | proxy stop
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { REPO } from './lib/paths.mjs';
import * as S from './lib/sim.mjs';
import { keepAwakeFor } from './lib/awake.mjs';
import { readWarm, warmFile } from './lib/sim-warm.mjs';
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const all = process.argv.slice(2);
const dd = all.indexOf('--');
const argv = dd >= 0 ? all.slice(0, dd) : all;
const rest = dd >= 0 ? all.slice(dd + 1) : [];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const VALUED = ['--device', '--settle-ms', '--owner', '--out', '--label', '--seconds', '--window', '--runtime', '--timeout', '--url', '--via', '--variant', '--param', '--morph-log', '--log', '--reason', '--by', '--reduce-motion'];
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const log = (s) => console.log(S.scrub(String(s)));
const err = (s) => console.error(S.scrub(String(s)));
const USAGE = 'usage: node tools/sim.mjs [--device fw-sim|fw-ipad|fw-ipad-a16|fw-ipad-mini] setup [--runtime r] | orient portrait|landscape | status | doctor [--fix] | background [--seconds 3] | session [--functional] --owner <o> [--window shown|hidden] [--reduce-motion on|off] -- <cmd> | open <url> | reduce-motion | fetched <part> [--log f] | safari-restart [--url U] [--via auto|wda|simctl] | gesture <script.json> [--count-only] [--dry-run] | scroll [--label l] | record [--seconds 25] | run --driver d ... | wda build --owner <o> | wda start | wda stop | boot --owner <o> | shutdown [--force | --warm-only] | proxy start --owner <o> | proxy stop  (header of tools/sim.mjs)';

async function main() {
  // I-087: which Simulator: --device, else FW_SIM_DEVICE (a session's <cmd>), else (status / doctor / plain shutdown) the
  // live session's or a booted / warm one, else fw-sim
  const named = opt('device', null) ?? (process.env.FW_SIM_DEVICE || null);
  if (named !== null) S.useDevice(named);
  else if (['status', 'doctor'].includes(cmd) || (cmd === 'shutdown' && !flag('warm-only'))) S.useDevice(S.activeDevice());
  if (cmd === 'setup') { S.setup({ runtime: opt('runtime', null), log }); return 0; }
  if (cmd === 'status') { for (const l of await S.statusLines()) log(l); return 0; }
  if (cmd === 'doctor') return S.doctor({ fix: flag('fix'), log });
  if (cmd === 'session') keepAwakeFor(`sim.mjs session${flag('functional') ? ' --functional' : ''} (${opt('owner', process.env.FW_LOCK_OWNER)})`); // I-070: a Sim session measures (memory counts too): caffeinate -i -s -w <this pid>
  if (cmd === 'session') {
    // I-100: --reduce-motion on|off (given without a value, or with an empty one: refused by S.session before any boot)
    const rmGiven = argv.some((a) => a === '--reduce-motion' || a.startsWith('--reduce-motion='));
    return S.session({ owner: opt('owner', process.env.FW_LOCK_OWNER), window: opt('window', 'shown'), cmd: rest[0], args: rest.slice(1), log, err, functional: flag('functional'), reduceMotion: rmGiven ? (opt('reduce-motion') ?? '') : null });
  }
  if (cmd === 'background') {
    // I-082: read-only, any time (one ps per end of the window)
    const BG = await import('./lib/sim-background.mjs');
    const a = BG.psSnapshot();
    if (!a) { err('could not read the process table (ps)'); return 1; }
    await new Promise((r) => setTimeout(r, 1000 * Number(opt('seconds', 3))));
    const w = BG.between(a, BG.psSnapshot(), { n: 5 });
    if (!w?.sims) { log('SIM_BACKGROUND no Simulator runs (no launchd_sim)'); return 0; }
    log(`SIM_BACKGROUND ${BG.describe(w, (await import('node:os')).default.loadavg()[0])}; host-side Simulator services ${Math.round(w.hostSimPct)} %${w.sims > 1 ? `; ${w.sims} Simulators run` : ''}`);
    return 0;
  }
  if (cmd === 'keeper') return S.keeper({ id: arg, log }); // I-063: started detached by a session that kept fw-sim booted
  if (cmd === 'shutdown' && flag('warm-only')) {
    // I-063: only the warm device (warm.json), under the simulator lock, never a live session's: the timed tools' backstop
    if (!readWarm()) { log('SIM_WARM none: no warm Simulator recorded'); return 0; }
    const r = await S.shutdownWarm({ reason: opt('reason', 'sim.mjs shutdown --warm-only'), by: opt('by', 'sim'), log });
    if (r.done) return 0;
    if (!readWarm()) { log(`SIM_WARM gone: ${r.why}`); return 0; }
    if (r.busy) log(`SIM_WARM_BUSY: ${r.why}`); // the lock or a session holds it: lib/sim-warm.mjs reapResult tells it apart
    err(`the warm Simulator was not shut down: ${r.why}`);
    return 3;
  }
  if (cmd === 'shutdown') {
    const live = S.liveSession();
    if (live && !flag('force') && process.env.FW_SIM_SESSION !== live.id) throw new Error(`a live Simulator session runs (pid ${live.pid}, owner "${live.owner}"); it shuts the Simulator down itself. --force to shut down anyway`);
    // review-i063 N4: under the simulator lock when no session lives (a keeper mid-shutdown, a session about to start);
    // a live session holds that lock itself (its own command, or --force over it, goes without)
    let lk = null;
    if (!live) {
      try { lk = await S.takeSimLock('sim-shutdown', { waitSec: 60, meta: { cmd: 'sim shutdown' }, log: () => {}, pollMs: 500 }); } catch (e) { err(`${e.message}; retry after it ends`); return 3; }
    }
    try {
      const now = S.liveSession();
      if (!live && now) throw new Error(`a Simulator session started (pid ${now.pid}, owner "${now.owner}"); it shuts the Simulator down itself`);
      await S.stopOne('keeper', log); await S.stopOne('wda', log); await S.stopOne('proxy', log); // I-063: the warm device's keeper too
      const cfg = S.readConfig();
      if (!cfg.udid) { rmSync(warmFile(), { force: true }); log('no Simulator configured'); return 0; }
      log(await S.shutdownDevice(cfg.udid, { log }));
      // the warm record goes only once the device is shut down (review-i063 B1): after a failed shutdown it stays, so
      // status / doctor / the timed tools' reap still see the booted device
      let st = null;
      try { st = S.deviceState(cfg.udid); } catch (e) { st = `unknown (${e.message})`; }
      if (st !== null && st !== 'Shutdown') { err(`${S.device().key} is still ${st} after the shutdown${readWarm() ? ' (the warm record stays)' : ''}: node tools/sim.mjs doctor`); return 3; }
      rmSync(warmFile(), { force: true });
      return 0;
    } finally { await lk?.release(); }
  }
  if (cmd === 'proxy' && arg === 'stop') { if (!(await S.stopOne('proxy', log))) log('proxy was not running (no pidfile)'); return 0; }
  if (cmd === 'boot' || (cmd === 'proxy' && arg === 'start')) {
    const owner = opt('owner', process.env.FW_LOCK_OWNER);
    if (!owner) throw new Error('--owner <you> is required');
    const g = S.holdGate(undefined, undefined, { owner, what: `sim ${cmd}` });
    if (!g.ok) throw new Error(`refusing sim ${cmd}: ${g.reason}`);
    const cfg = S.readConfig();
    if (!cfg.udid) throw new Error(`no Simulator configured: node tools/sim.mjs setup --device ${S.device().key}`);
    if (cmd === 'boot') {
      if (S.deviceState(cfg.udid) !== 'Shutdown') throw new Error(`refusing: ${S.device().name} is already ${S.deviceState(cfg.udid)}`);
      await S.bootDevice(cfg.udid, { log });
      log('BOOTED (debugging: nothing shuts it down for you; node tools/sim.mjs shutdown)');
      return 0;
    }
    await S.startProxy({ owner, log });
    log('PROXY_READY (debugging: node tools/sim.mjs proxy stop)');
    return 0;
  }
  if (cmd === 'wda' && arg === 'stop') { if (!(await S.stopOne('wda', log))) log('WDA-sim was not running (no pidfile)'); return 0; }
  if (cmd === 'wda' && arg === 'build') {
    const owner = opt('owner', process.env.FW_LOCK_OWNER);
    if (!owner) throw new Error('--owner <you> is required');
    return S.wdaBuild({ owner, log });
  }
  if (cmd === 'wda' && arg === 'start') return S.wdaStart({ session: S.requireSession({ owner: opt('owner') }), log, timeoutMs: 1000 * Number(opt('timeout', 120)) });
  if (cmd === 'orient') {
    // I-087: device rotation, Simulator only (lib/wda.mjs refuses it for the phone); no timing, so a functional session may
    if (!['portrait', 'landscape'].includes(arg)) throw new Error('usage: node tools/sim.mjs orient portrait|landscape (inside a session, after node tools/sim.mjs wda start)');
    S.requireSession({ owner: opt('owner') });
    const { orient } = await import('./lib/sim-orient.mjs');
    const r = await orient(arg, { base: `http://127.0.0.1:${S.ports().wda}`, settleMs: Number(opt('settle-ms', 1500)), log });
    log(`ORIENTATION ${r.now}`);
    return 0;
  }
  if (cmd === 'wda') throw new Error('usage: node tools/sim.mjs wda build --owner <o> (in your own normal hold) | start (inside a session) | stop');
  if (cmd === 'gesture') {
    // the phone's gesture runner (tools/lib/gesture-run.mjs) with the Simulator as its target: strokes to WDA-sim,
    // the page over the session's proxy; the session (inside your own normal hold) stands in for the iphone lease.
    // Timed like record (it saves frame timing): refused in a functional session and in a no-timing hold. I-184:
    // --count-only saves and prints counts only (no frame log, no ms), so it also runs there (no host gate)
    const { gestureCmd } = await import('./lib/gesture-run.mjs');
    const { gestureTarget } = await import('./lib/sim-scroll.mjs');
    const dry = flag('dry-run');
    const countOnly = flag('count-only');
    const hint = (e) => { throw new Error(countOnly || !/^refusing:/.test(e.message) ? e.message : `${e.message}\n(a gesture that needs counts only, no timing number, runs there as: node tools/sim.mjs gesture <script.json> --count-only (I-184))`); };
    let session = null;
    if (!dry) { try { session = S.requireSession({ owner: opt('owner'), timed: !countOnly }); } catch (e) { hint(e); } }
    if (session) S.scopeTabs(session); // only tabs on the server of this session's open (I-050)
    const requireSession = () => S.requireSession({ owner: session.owner, timed: !countOnly });
    const holdEndsAt = () => S.holdGate(undefined, undefined, { owner: session.owner, functional: !!session.functional }).endsAt ?? 0;
    const { status: lockStatus } = await import('./lib/lock.mjs');
    const lockKind = () => (session.functional ? `functional session (${session.lock?.mode ?? '?'})` : lockStatus('chrome-measure').holder?.noTiming ? 'no-timing hold' : 'normal hold');
    return gestureCmd({ argv, arg, opt, flag, port: S.ports().tabs, requireLease: () => { requireSession(); return session.owner; },
      countOnly: countOnly ? { incident: 'I-184', lock: dry ? null : lockKind(), note: 'counts only: run without a host gate, so no frame log and no timing number (never a timing verdict)' } : false,
      target: dry ? null : gestureTarget(session, { requireSession, holdEndsAt }), usage: 'node tools/sim.mjs gesture <script.json> [--count-only] [--label l] [--variant v] [--param k=v]... [--morph-log <morph-log.mjs>] [--out file] [--dry-run] (inside a session)' });
  }
  if (cmd === 'reduce-motion') {
    // I-100: the Simulator's Reduce Motion setting and what the last open's page reports for prefers-reduced-motion;
    // exit 0 when both match the session's --reduce-motion (or the session set none), 3 when not (read-only)
    const session = S.requireSession({ owner: opt('owner') });
    const M = await import('./lib/sim-motion.mjs');
    const setting = M.readReduceMotion(S.readConfig().udid, { simctl: S.simctl });
    const page = await pageEval(session, M.PAGE_MOTION_JS);
    const want = session.reduceMotion?.requested ?? null;
    const v = M.pageVerdict(page, want);
    const settingOk = !want || setting === (want === 'on');
    const why = !settingOk ? `MISMATCH: the setting should be ${want} (I-100)` : !v.ok ? `MISMATCH: the page should report ${want === 'on' ? 'reduce' : 'no-preference'} (I-100)` : 'ok';
    log(`REDUCE_MOTION setting ${M.fmtRM(setting)}, page ${v.media} (${want ? `session --reduce-motion ${want}): ${why}` : 'session without --reduce-motion: not checked)'}`);
    return settingOk && v.ok ? 0 : 3;
  }
  if (cmd === 'fetched') {
    // I-052: did the page in Safari fetch <part> over the network, or take it from the cache? (no navigation, no timing)
    if (!arg) throw new Error('usage: node tools/sim.mjs fetched <url or path part> [--log <server log>] (inside a session, after open)');
    const session = S.requireSession({ owner: opt('owner') });
    const host = S.scopeTabs(session);
    const { openTab } = await import('./lib/wip.mjs');
    const tabs = S.ports().tabs;
    let list = [];
    try { list = await (await fetch(`http://localhost:${tabs}/json`, { signal: AbortSignal.timeout(4000) })).json(); } catch {}
    const c = await openTab(S.pageMatcher(list, S.openedUrl(session), host), { port: tabs }); // the last open's page (I-052)
    let page;
    try { page = JSON.parse(await c.evaluate(S.RESOURCES_JS)); } finally { c.close(); }
    const logText = opt('log') ? readFileSync(resolve(opt('log')), 'utf8') : null;
    const rep = S.fetchReport(page, arg, { logText });
    for (const l of rep.lines) log(l);
    log(`FETCHED ${rep.code === 0 ? 'network' : rep.code === 1 ? 'none' : 'NOT-NETWORK'}: ${arg}`);
    return rep.code;
  }
  if (['open', 'scroll', 'record', 'run', 'safari-restart'].includes(cmd)) {
    const session = S.requireSession({ owner: opt('owner'), timed: !['open', 'safari-restart'].includes(cmd) });
    if (cmd !== 'open' && !(cmd === 'safari-restart' && opt('url'))) S.scopeTabs(session); // only tabs on the server of this session's open (I-050)
    const owner = session.owner;
    if (cmd === 'open') return openCmd(session, owner);
    if (cmd === 'safari-restart') {
      const { safariRestart, wdaDriver, simctlDriver } = await import('./lib/safari-restart.mjs');
      const p = S.ports();
      await safariRestart({ drivers: [wdaDriver({ base: `http://127.0.0.1:${p.wda}` }), simctlDriver({ udid: S.readConfig().udid })], via: opt('via', 'auto'), url: opt('url', null),
        port: p.tabs, timeoutMs: 1000 * Number(opt('timeout', 30)), log });
      return 0;
    }
    if (cmd === 'run') {
      const { runCmd } = await import('./lib/iphone-run.mjs');
      const { runTarget } = await import('./lib/sim-scroll.mjs');
      const requireSession = () => S.requireSession({ owner, timed: true });
      const holdEndsAt = () => S.holdGate(undefined, undefined, { owner }).endsAt ?? 0;
      await runCmd({ argv, requireLease: () => { requireSession(); return owner; }, port: S.ports().tabs, target: runTarget(session, { requireSession, holdEndsAt }) });
      return 0;
    }
    const { scrollCmd, recordCmd } = await import('./lib/sim-scroll.mjs');
    if (cmd === 'scroll') await scrollCmd({ session, owner, label: opt('label', 'run'), out: opt('out'), log });
    else await recordCmd({ session, owner, label: opt('label', 'finger'), seconds: Number(opt('seconds', 25)), out: opt('out'), log });
    return 0;
  }
  console.log(USAGE);
  return cmd ? 1 : 0;
}

/** Evaluate `js` (returning JSON text) in the last open's page of this session (any page when none was opened). */
async function pageEval(session, js) {
  const host = S.scopeTabs(session);
  const { openTab } = await import('./lib/wip.mjs');
  const tabs = S.ports().tabs;
  let list = [];
  try { list = await (await fetch(`http://localhost:${tabs}/json`, { signal: AbortSignal.timeout(4000) })).json(); } catch {}
  const c = await openTab(S.pageMatcher(list, S.openedUrl(session), host), { port: tabs });
  try { return JSON.parse(await c.evaluate(js)); } catch { return null; } finally { c.close(); }
}

async function openCmd(session, owner) {
  if (!/^https?:\/\//.test(arg || '')) throw new Error('usage: node tools/sim.mjs open <url> (inside a session)');
  const { openTab, urlHost, isBlankUrl, sleep } = await import('./lib/wip.mjs');
  const { mirrorInfo, iphoneTarget, LANDED_JS, landedProblem, lanSafeText } = await import('./lib/iphone-url.mjs');
  const info = await mirrorInfo(arg);
  const target = iphoneTarget(arg, info);
  if (target.note) log(target.note);
  const cfg = S.readConfig();
  const p = S.ports();
  const listTabs = async () => { try { return await (await fetch(`http://localhost:${p.tabs}/json`, { signal: AbortSignal.timeout(4000) })).json(); } catch { return []; } };
  const before = await listTabs(); // tells the opened tab from one Safari restored on the same url (I-050)
  const r = S.simctl(['openurl', cfg.udid, target.url]);
  if (r.status !== 0) throw new Error(`simctl openurl failed (exit ${r.status})`);
  const want = new URL(target.url);
  let tab = null;
  for (let i = 0; i < 60 && !tab; i++) {
    await sleep(500);
    tab = S.openedTab(await listTabs(), target.url, before);
  }
  if (!tab) throw new Error(`Safari in the Simulator never listed ${target.url}, or listed it in several tabs and none of them new (30 s; I-037: not picking one)`);
  // Safari may list tabs restored from an earlier session next to it (I-050): only pages on this server's host
  // and of those the opened tab's own url while listed, so an earlier open's tab on the same host is no rival (I-052)
  const c = await openTab(S.pageMatcher(await listTabs(), tab.url, want.host), { port: p.tabs });
  try {
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    const landed = await c.evaluate(LANDED_JS);
    const problem = landedProblem(landed, target.url, info);
    if (problem) throw new Error(problem.replace('from the iPhone (same Wi-Fi, LAN URL, not localhost)', 'from the Simulator (it shares the Mac\'s network: http://localhost:<port>/ works)'));
    const shot = resolve(REPO, opt('out', join('out', 'sim', `${owner}-open-${Date.now()}.png`)));
    mkdirSync(dirname(shot), { recursive: true });
    const s = S.simctl(['io', cfg.udid, 'screenshot', shot]);
    log(`Safari (Simulator) now on ${landed.href}${s.status === 0 ? `; screenshot ${shot}` : '; screenshot failed'}`);
    S.writeOpened(session, target.url, landed.href); // later commands pick only tabs on this host (I-050); fetched: this page (I-052)
    if (session.reduceMotion?.requested) {
      // I-100: a session that set Reduce Motion proves it on every page it opens: prefers-reduced-motion must agree
      const { PAGE_MOTION_JS, pageVerdict } = await import('./lib/sim-motion.mjs');
      let page = null;
      try { page = JSON.parse(await c.evaluate(PAGE_MOTION_JS)); } catch {}
      const v = pageVerdict(page, session.reduceMotion.requested);
      if (!v.ok) throw new Error(v.line);
      log(v.line);
    }
    const others = (await listTabs()).filter((t) => t && t.webSocketDebuggerUrl && !isBlankUrl(t.url) && urlHost(t.url) !== want.host).length;
    if (others) log(`Safari also lists ${others} page${others > 1 ? 's' : ''} of another server (restored from an earlier session?): this session's scroll / record / run / gesture pick only tabs on ${lanSafeText(want.host)} (I-050)`);
  } finally { c.close(); }
  return 0;
}

main().then((code) => process.exit(code ?? 0), (e) => { err(e?.message ?? e); process.exit(1); });

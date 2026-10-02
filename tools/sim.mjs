#!/usr/bin/env node
// Drive the Xcode iOS Simulator (`fw-sim 15 Pro Max`, Mobile Safari) the way tools/iphone.mjs drives the phone,
// with the same probes, so a Simulator record has the phone record's schema plus meta.device "simulator" and
// meta.sim (research/simulator/README.md §7; NEW MEASUREMENT CODE: Simulator numbers never pool with phone or
// Chrome numbers, tools/lib/stats.mjs refuses that). Library: tools/lib/sim.mjs (privacy and phone-safety rules
// in its header: phone UDIDs only in a mode-600 config file, the proxy never attaches to or navigates the phone).
//
//   node tools/sim.mjs setup [--runtime <iOS 26.5|id>]        create fw-sim if absent, store config (no boot)
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
//   node tools/sim.mjs safari-restart [--url U] [--via auto|wda|simctl] [--timeout 30]   quit + relaunch Safari (WDA-sim if up,
//        else simctl), open U, wait until it answers (tools/lib/safari-restart.mjs; iphone.mjs safari-restart on the phone)
//   node tools/sim.mjs gesture <script.json> [--label l] [--variant v] [--param k=v]... [--morph-log f] [--dry-run]
//        iphone.mjs gesture on the Simulator: strokes to WDA-sim (start it first), page over the session's proxy
//        -> out/sim/<owner>-gesture-<label>-<ts>.json, meta.device simulator + meta.sim. For mechanism checks (touch
//        counts, prevented moves, dp per stroke); Simulator timing is never a verdict (F-084). --dry-run needs no session.
//   # WDA for the Simulator, unsigned (no Apple ID), built once in your own normal hold (minutes of CPU):
//   node tools/lock.mjs run chrome-measure --owner <o> --max-seconds 600 -- node tools/sim.mjs wda build --owner <o>
//   # debugging parts of `session` (boot: in your own normal hold; shutdown / proxy stop: always allowed)
//   node tools/sim.mjs boot --owner <o> | shutdown [--force] | proxy start --owner <o> | proxy stop
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { REPO } from './lib/paths.mjs';
import * as S from './lib/sim.mjs';
import { keepAwakeFor } from './lib/awake.mjs';

const all = process.argv.slice(2);
const dd = all.indexOf('--');
const argv = dd >= 0 ? all.slice(0, dd) : all;
const rest = dd >= 0 ? all.slice(dd + 1) : [];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const VALUED = ['--owner', '--out', '--label', '--seconds', '--window', '--runtime', '--timeout', '--url', '--via', '--variant', '--param', '--morph-log', '--log'];
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const log = (s) => console.log(S.scrub(String(s)));
const err = (s) => console.error(S.scrub(String(s)));
const USAGE = 'usage: node tools/sim.mjs setup [--runtime r] | status | doctor [--fix] | session [--functional] --owner <o> [--window shown|hidden] -- <cmd> | open <url> | fetched <part> [--log f] | safari-restart [--url U] [--via auto|wda|simctl] | gesture <script.json> [--dry-run] | scroll [--label l] | record [--seconds 25] | run --driver d ... | wda build --owner <o> | wda start | wda stop | boot --owner <o> | shutdown [--force] | proxy start --owner <o> | proxy stop  (header of tools/sim.mjs)';

async function main() {
  if (cmd === 'setup') { S.setup({ runtime: opt('runtime', null), log }); return 0; }
  if (cmd === 'status') { for (const l of await S.statusLines()) log(l); return 0; }
  if (cmd === 'doctor') return S.doctor({ fix: flag('fix'), log });
  if (cmd === 'session') keepAwakeFor(`sim.mjs session${flag('functional') ? ' --functional' : ''} (${opt('owner', process.env.FW_LOCK_OWNER)})`); // I-070: a Sim session measures (memory counts too): caffeinate -i -s -w <this pid>
  if (cmd === 'session') return S.session({ owner: opt('owner', process.env.FW_LOCK_OWNER), window: opt('window', 'shown'), cmd: rest[0], args: rest.slice(1), log, err, functional: flag('functional') });
  if (cmd === 'shutdown') {
    const live = S.liveSession();
    if (live && !flag('force') && process.env.FW_SIM_SESSION !== live.id) throw new Error(`a live Simulator session runs (pid ${live.pid}, owner "${live.owner}"); it shuts the Simulator down itself. --force to shut down anyway`);
    await S.stopOne('wda', log); await S.stopOne('proxy', log);
    const cfg = S.readConfig();
    if (!cfg.udid) { log('no Simulator configured'); return 0; }
    log(await S.shutdownDevice(cfg.udid, { log }));
    return 0;
  }
  if (cmd === 'proxy' && arg === 'stop') { if (!(await S.stopOne('proxy', log))) log('proxy was not running (no pidfile)'); return 0; }
  if (cmd === 'boot' || (cmd === 'proxy' && arg === 'start')) {
    const owner = opt('owner', process.env.FW_LOCK_OWNER);
    if (!owner) throw new Error('--owner <you> is required');
    const g = S.holdGate(undefined, undefined, { owner, what: `sim ${cmd}` });
    if (!g.ok) throw new Error(`refusing sim ${cmd}: ${g.reason}`);
    const cfg = S.readConfig();
    if (!cfg.udid) throw new Error('no Simulator configured: node tools/sim.mjs setup');
    if (cmd === 'boot') {
      if (S.deviceState(cfg.udid) !== 'Shutdown') throw new Error(`refusing: ${S.SIM_NAME} is already ${S.deviceState(cfg.udid)}`);
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
  if (cmd === 'wda') throw new Error('usage: node tools/sim.mjs wda build --owner <o> (in your own normal hold) | start (inside a session) | stop');
  if (cmd === 'gesture') {
    // the phone's gesture runner (tools/lib/gesture-run.mjs) with the Simulator as its target: strokes to WDA-sim,
    // the page over the session's proxy; the session (inside your own normal hold) stands in for the iphone lease.
    // Timed like record (it saves frame timing): refused in a functional session
    const { gestureCmd } = await import('./lib/gesture-run.mjs');
    const { gestureTarget } = await import('./lib/sim-scroll.mjs');
    const dry = flag('dry-run');
    const session = dry ? null : S.requireSession({ owner: opt('owner'), timed: true });
    if (session) S.scopeTabs(session); // only tabs on the server of this session's open (I-050)
    const requireSession = () => S.requireSession({ owner: session.owner, timed: true });
    const holdEndsAt = () => S.holdGate(undefined, undefined, { owner: session.owner }).endsAt ?? 0;
    return gestureCmd({ argv, arg, opt, flag, port: S.ports().tabs, requireLease: () => { requireSession(); return session.owner; },
      target: dry ? null : gestureTarget(session, { requireSession, holdEndsAt }), usage: 'node tools/sim.mjs gesture <script.json> [--label l] [--variant v] [--param k=v]... [--morph-log <morph-log.mjs>] [--out file] [--dry-run] (inside a session)' });
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
    const others = (await listTabs()).filter((t) => t && t.webSocketDebuggerUrl && !isBlankUrl(t.url) && urlHost(t.url) !== want.host).length;
    if (others) log(`Safari also lists ${others} page${others > 1 ? 's' : ''} of another server (restored from an earlier session?): this session's scroll / record / run / gesture pick only tabs on ${lanSafeText(want.host)} (I-050)`);
  } finally { c.close(); }
  return 0;
}

main().then((code) => process.exit(code ?? 0), (e) => { err(e?.message ?? e); process.exit(1); });

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
//   node tools/sim.mjs open <url> [--out f.png]                simctl openurl, wait until Safari lists it, screenshot to out/sim/
//   node tools/sim.mjs scroll [--label l] [--out f]            iphone.mjs scroll's probe and sequence -> out/sim/<owner>-<label>-<ts>.json
//   node tools/sim.mjs record [--seconds 25] [--label l]       iphone.mjs record's frame logger
//   node tools/sim.mjs run --driver scroll|window|morph ...    iphone.mjs run (std probe, fw-iphone-run/1) -> out/sim/<owner>-run-<label>-<ts>.json
//   node tools/sim.mjs wda start                               WDA-sim on :8101 (the session stops it); `wda stop`
//   # WDA for the Simulator, unsigned (no Apple ID), built once in your own normal hold (minutes of CPU):
//   node tools/lock.mjs run chrome-measure --owner <o> --max-seconds 600 -- node tools/sim.mjs wda build --owner <o>
//   # debugging parts of `session` (boot: in your own normal hold; shutdown / proxy stop: always allowed)
//   node tools/sim.mjs boot --owner <o> | shutdown [--force] | proxy start --owner <o> | proxy stop
import { mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { REPO } from './lib/paths.mjs';
import * as S from './lib/sim.mjs';

const all = process.argv.slice(2);
const dd = all.indexOf('--');
const argv = dd >= 0 ? all.slice(0, dd) : all;
const rest = dd >= 0 ? all.slice(dd + 1) : [];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const VALUED = ['--owner', '--out', '--label', '--seconds', '--window', '--runtime', '--timeout'];
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const log = (s) => console.log(S.scrub(String(s)));
const err = (s) => console.error(S.scrub(String(s)));
const USAGE = 'usage: node tools/sim.mjs setup [--runtime r] | status | doctor [--fix] | session [--functional] --owner <o> [--window shown|hidden] -- <cmd> | open <url> | scroll [--label l] | record [--seconds 25] | run --driver d ... | wda build --owner <o> | wda start | wda stop | boot --owner <o> | shutdown [--force] | proxy start --owner <o> | proxy stop  (header of tools/sim.mjs)';

async function main() {
  if (cmd === 'setup') { S.setup({ runtime: opt('runtime', null), log }); return 0; }
  if (cmd === 'status') { for (const l of await S.statusLines()) log(l); return 0; }
  if (cmd === 'doctor') return S.doctor({ fix: flag('fix'), log });
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
  if (['open', 'scroll', 'record', 'run'].includes(cmd)) {
    const session = S.requireSession({ owner: opt('owner'), timed: cmd !== 'open' });
    const owner = session.owner;
    if (cmd === 'open') return openCmd(session, owner);
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
  const { openTab, sleep } = await import('./lib/wip.mjs');
  const { mirrorInfo, iphoneTarget, LANDED_JS, landedProblem } = await import('./lib/iphone-url.mjs');
  const info = await mirrorInfo(arg);
  const target = iphoneTarget(arg, info);
  if (target.note) log(target.note);
  const cfg = S.readConfig();
  const p = S.ports();
  const r = S.simctl(['openurl', cfg.udid, target.url]);
  if (r.status !== 0) throw new Error(`simctl openurl failed (exit ${r.status})`);
  const want = new URL(target.url);
  let tab = null;
  for (let i = 0; i < 60 && !tab; i++) {
    await sleep(500);
    const list = await (await fetch(`http://localhost:${p.tabs}/json`, { signal: AbortSignal.timeout(4000) })).json().catch(() => []);
    tab = list.find((t) => { try { const u = new URL(t.url); return u.host === want.host && u.pathname === want.pathname; } catch { return false; } }) || null;
  }
  if (!tab) throw new Error(`Safari in the Simulator never listed ${target.url} (30 s)`);
  const c = await openTab(want.host, { port: p.tabs });
  try {
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    const landed = await c.evaluate(LANDED_JS);
    const problem = landedProblem(landed, target.url, info);
    if (problem) throw new Error(problem.replace('from the iPhone (same Wi-Fi, LAN URL, not localhost)', 'from the Simulator (it shares the Mac\'s network: http://localhost:<port>/ works)'));
    const shot = resolve(REPO, opt('out', join('out', 'sim', `${owner}-open-${Date.now()}.png`)));
    mkdirSync(dirname(shot), { recursive: true });
    const s = S.simctl(['io', cfg.udid, 'screenshot', shot]);
    log(`Safari (Simulator) now on ${landed.href}${s.status === 0 ? `; screenshot ${shot}` : '; screenshot failed'}`);
  } finally { c.close(); }
  return 0;
}

main().then((code) => process.exit(code ?? 0), (e) => { err(e?.message ?? e); process.exit(1); });

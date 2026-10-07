#!/usr/bin/env node
// The iPhone's USB link (incident I-222; the drops of I-173, I-216, I-235, I-239): is the phone reachable for our tools,
// and if not, which part of the chain broke? Read-only except `proxy start|stop|restart` (only the proxy this tool
// started) and the watch's optional repair and re-plug step. Library and rules: tools/lib/usblink.mjs. No device ids,
// names or addresses are printed or stored (Hard rule 12).
//
//   node tools/usblink.mjs status [--stale-after 30] [--json]
//        # one plain line, `USBLINK <state>: <what and what to do>`, and an exit code per state:
//        #   0 ok           the iPhone is on USB (usbmux) and the proxy :9221 lists it
//        #   3 unplugged    no iPhone on the Mac's USB bus (IOUSB) nor on usbmux: plug the cable in
//        #   4 usb-lost     IOUSB still has the iPhone, usbmux does not (the 2026-10-06/07 drops): re-plug the cable
//        #   5 proxy-stale  usbmux has it, the proxy has listed no device for more than --stale-after s: proxy restart
//        #   6 proxy-down   usbmux has it, nothing answers on :9221: proxy start
//        #   7 unknown      usbmuxd gave no device list, or IOUSB unreadable while usbmux lacks the phone
//        #   2 usage
//        # While the proxy list is empty for less than --stale-after s (it re-attaches by itself after a re-plug, I-239)
//        # status re-reads every 2 s until it settles (at most --stale-after s).
//   node tools/usblink.mjs watch [--every 10] [--stale-after 30] [--repair] [--post-step [--step-after 60]] [--by <you>] [--seconds N]
//        # long-running (the lead starts it detached: nohup node tools/usblink.mjs watch --by lead --repair --post-step
//        # > out/usblink-watch.log 2>&1 &). One line per change of state (`<time>Z USBLINK <state>: …`), each change
//        # also one JSON line in <state dir>/usblink/audit.log with the IOUSB configuration, speed code and usbmux attach
//        # number (the evidence for the next drop), and the current state in <state dir>/usblink/state.json.
//        # --repair (needs --by): on proxy-stale, restart the proxy that `usblink.mjs proxy start` started (at most once
//        #   per 120 s, 3 tries per episode); never another proxy (a hand-started one, a Simulator proxy `-s unix:`):
//        #   that is one `REPAIR SKIPPED` line per episode.
//        # --post-step (needs --by; the lead's): usb-lost or unplugged for more than --step-after s (60) posts ONE console action step
//        #   "Re-plug the iPhone's USB cable" (never a second while ours is open; after the user's Done, the next only
//        #   after another 60 s of loss), cancelled by itself once the link is ok.
//        # One watch at a time (a second refuses, exit 2). Exit 0 on SIGINT/SIGTERM or after --seconds.
//   node tools/usblink.mjs proxy start|stop|restart|show --by <you> [--reason "<why>"]
//        # start: `ios_webkit_debug_proxy -c null:9221,:9222-9322` detached ($FW_IWDP_PHONE), its pid, -c argument and
//        # start time recorded in <state dir>/usblink/proxy.json; refused when anything answers on :9221 already.
//        # Loopback only (I-241): iwdp has no bind option and listens on every interface, so start loads
//        # tools/lib/bind-localhost.c (built once with cc, $FW_CC; into <state dir>/usblink/) via DYLD_INSERT_LIBRARIES, then
//        # checks the listeners with lsof: anything but 127.0.0.1 / ::1 and the proxy is stopped and the start refused.
//        # stop / restart: only that recorded process (same -c argument, no -s unix:, same start time); anything else is
//        # refused with nothing killed. show: the record, whether it is still ours, and where it listens now. Each action
//        # is audited. exit 0 done, 1 refused or failed, 2 usage.
// Ports: $FW_IPHONE_DEVICE_PORT (9221, the device list) and $FW_IPHONE_PORT (9222, the first tab port), as iphone.mjs.
import { LINK_EXIT, LINK_DEFAULTS, sample, evaluate, sampleFacts, readLinkState, writeLinkState, audit, startProxy, stopProxy, restartProxy, readProxyRecord, isOurProxy, replugStepPass, proxyPorts, listenAddrs, isLoopback } from './lib/usblink.mjs';
import { pidAlive } from './lib/wait.mjs';
import { runMain } from './lib/exit.mjs';
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url);
const argv = process.argv.slice(2);
const VALUED = ['--every', '--stale-after', '--step-after', '--by', '--seconds', '--reason'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const USAGE = 'usage: node tools/usblink.mjs status [--stale-after 30] [--json] | watch [--every 10] [--stale-after 30] [--repair] [--post-step [--step-after 60]] [--by <you>] [--seconds N] | proxy start|stop|restart|show --by <you> [--reason "…"] (see the header of tools/usblink.mjs)';
class Usage extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString().slice(0, 19) + 'Z';

function secOpt(name, def, min) {
  const v = opt(name);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw new Usage(`--${name} must be a number of seconds >= ${min} (got "${v}")`);
  return n;
}
function byOpt(required) {
  const by = opt('by');
  if (by === undefined || by === true || String(by).startsWith('--')) { if (required) throw new Usage(`${required} needs --by <your agent name>`); return null; }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(by)) throw new Usage(`bad --by "${by}" (an agent name, e.g. lead)`);
  return by;
}

async function status() {
  const staleAfterMs = secOpt('stale-after', LINK_DEFAULTS.staleAfterSec, 0) * 1000;
  const list = proxyPorts().list;
  const w = readLinkState();
  // a running watch's start of the same state ("since 04:44Z") when its record is fresh
  let prev = w && w.watch && pidAlive(w.pid) && Date.now() - Date.parse(w.at) < Math.max(60, 3 * (w.every || 10)) * 1000 ? { state: w.state, since: w.since, emptySince: w.emptySince ?? null } : {};
  let s, e;
  for (;;) {
    s = await sample();
    e = evaluate(s, prev, { staleAfterMs, list });
    if (e.state !== 'attaching') break;
    prev = e;
    await sleep(Math.min(2000, Math.max(100, e.emptySince + staleAfterMs - Date.now())));
  }
  if (flag('json')) console.log(JSON.stringify({ state: e.state, line: e.line, since: new Date(e.since).toISOString(), ...sampleFacts(s) }));
  else console.log(`USBLINK ${e.state}: ${e.line}`);
  return LINK_EXIT[e.state] ?? LINK_EXIT.unknown;
}

async function watch() {
  const every = secOpt('every', LINK_DEFAULTS.everySec, LINK_DEFAULTS.minEverySec);
  const staleAfterMs = secOpt('stale-after', LINK_DEFAULTS.staleAfterSec, 0) * 1000;
  const seconds = opt('seconds') === undefined ? null : secOpt('seconds', null, 0);
  const repair = flag('repair'), postStep = flag('post-step');
  const stepAfterSec = secOpt('step-after', LINK_DEFAULTS.replugStepSec, 0);
  const by = byOpt(repair ? '--repair' : postStep ? '--post-step' : null);
  const old = readLinkState();
  if (old?.watch && old.pid !== process.pid && pidAlive(old.pid)) { console.error(`another usblink watch runs (pid ${old.pid}, since ${old.startedAt}): one at a time`); return LINK_EXIT.usage; }
  const con = postStep ? await import('./lib/console.mjs') : null;
  const consoleApi = con && { post: con.post, get: con.get, cancel: con.cancel, open: (s) => con.OPEN.has(s.status) };
  const list = proxyPorts().list;
  const log = (l) => console.log(`${iso()} ${l}`);
  log(`WATCH usblink every ${every} s (proxy-stale after ${staleAfterMs / 1000} s)${repair ? `; repair: restart our proxy as ${by}` : ''}${postStep ? `; re-plug step after ${stepAfterSec} s, posted by ${by}` : ''}`);
  const startedAt = new Date().toISOString();
  let st = { state: null, since: null, emptySince: null, step: old?.step ?? null, stepClosedAt: old?.stepClosedAt ?? null };
  let repairs = 0, lastRepair = 0, skipped = false;
  let stop = false, wake = null;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop = true; if (wake) wake(); });
  const end = seconds === null ? Infinity : Date.now() + seconds * 1000;
  while (!stop) {
    let s, e;
    try {
      s = await sample();
      e = evaluate(s, st, { staleAfterMs, list });
      if (e.state !== st.state) {
        log(`USBLINK ${e.state}: ${e.line}`);
        audit({ event: 'state', from: st.state, to: e.state, ...sampleFacts(s) });
        if (e.state !== 'proxy-stale' && e.state !== 'attaching') { repairs = 0; skipped = false; } // a new episode (a restart passes through attaching)
      }
      st = { ...st, state: e.state, since: e.since, emptySince: e.emptySince };
      if (repair && e.state === 'proxy-stale' && Date.now() - lastRepair >= LINK_DEFAULTS.repairGapSec * 1000) {
        const rec = readProxyRecord(), o = isOurProxy(rec);
        if (!o.ours && !o.dead) {
          if (!skipped) { log(`REPAIR SKIPPED: ${o.why}; restart the proxy by hand (it was not started by usblink.mjs proxy start)`); audit({ event: 'repair-skipped', by, why: o.why }); skipped = true; }
        } else if (repairs < LINK_DEFAULTS.maxRepairs) {
          repairs++; lastRepair = Date.now();
          const r = await restartProxy({ by, reason: `usblink watch: proxy-stale (${e.line.slice(0, 120)})` });
          log(r.ok ? `REPAIR ${r.why} (try ${repairs} of ${LINK_DEFAULTS.maxRepairs})` : `REPAIR FAILED: ${r.why}`);
          st.emptySince = null; // the new proxy gets its own grace
        } else if (!skipped) { log(`REPAIR GIVEN UP after ${repairs} restarts: the proxy still lists nothing; look by hand`); skipped = true; }
      }
      if (consoleApi) {
        const r = await replugStepPass(st, { by, now: Date.now(), afterMs: stepAfterSec * 1000, console: consoleApi });
        if (r.posted) log(`POSTED ${r.posted}: Re-plug the iPhone's USB cable (${st.state})`);
        if (r.closed) log(`CLOSED ${r.closed}: the USB link is back`);
        if (r.error) log(`STEP ERROR ${r.error}`);
        st.step = r.step; st.stepClosedAt = r.stepClosedAt;
      }
      writeLinkState({ watch: true, pid: process.pid, startedAt, every, at: new Date().toISOString(), state: st.state, since: st.since, emptySince: st.emptySince, line: e.line, step: st.step, stepClosedAt: st.stepClosedAt });
    } catch (err) { log(`ERROR ${err.message || err}`); }
    if (stop || Date.now() >= end) break;
    await new Promise((res) => { const t = setTimeout(res, Math.max(0, Math.min(every * 1000, end - Date.now()))); wake = () => { clearTimeout(t); res(); }; });
    if (Date.now() >= end) stop = true;
  }
  const cur = readLinkState();
  if (cur?.pid === process.pid) writeLinkState({ ...cur, watch: false, stoppedAt: new Date().toISOString() });
  log('STOPPED');
  return 0;
}

async function proxy() {
  const sub = pos[1];
  if (!['start', 'stop', 'restart', 'show'].includes(sub)) throw new Usage(USAGE);
  if (sub === 'show') {
    const rec = readProxyRecord(), o = isOurProxy(rec);
    const addrs = o.ours ? listenAddrs(rec.pid) : null; // I-241: where it listens now (tab ports open when the phone attaches)
    const where = addrs ? `; listening on ${addrs.length ? addrs.join(', ') : 'nothing'}${addrs.every(isLoopback) ? '' : ' (NOT loopback only)'}` : '';
    console.log(rec ? `PROXY ${o.ours ? 'ours' : 'not ours'}: ${o.why}; -c ${rec.match?.replace(/^-c /, '')}, ports ${rec.ports?.list}/${rec.ports?.tabs}-${rec.ports?.last}${where}` : `PROXY none: ${o.why}`);
    return o.ours ? 0 : 1;
  }
  const by = byOpt(`proxy ${sub}`);
  const reason = opt('reason') ?? null;
  const r = sub === 'start' ? await startProxy({ by, reason }) : sub === 'stop' ? await stopProxy({ by, reason }) : await restartProxy({ by, reason });
  console.log(`PROXY ${sub.toUpperCase()} ${r.ok ? 'OK' : 'REFUSED'}: ${r.why}`);
  return r.ok ? 0 : 1;
}

async function main() {
  try {
    if (pos[0] === 'status') return await status();
    if (pos[0] === 'watch') return await watch();
    if (pos[0] === 'proxy') return await proxy();
    throw new Usage(USAGE);
  } catch (e) {
    if (e instanceof Usage) { console.error(e.message); return LINK_EXIT.usage; }
    throw e;
  }
}

runMain(main, { errCode: 1 });

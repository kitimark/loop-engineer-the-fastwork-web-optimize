#!/usr/bin/env node
// iPhone thermal condition (Xcode's Device Conditions > Thermal State) from the command line (incident I-199, user
// T-179 #16): the Instruments ConditionInducer service on the phone's DTServiceHub, reached over macOS's own CoreDevice
// tunnel: we find the phone's RemoteServiceDiscovery (RSD) through remoted's existing connection, ask RSD for the
// DTServiceHub port and open plain TCP to it (no root, no tunnel of ours, no remotepairingd/remoted changes, no
// install, zero npm dependencies; RSD/XPC/DTX/NSKeyedArchiver/bplist ported from appium-ios and go-ios, tools/NOTICE).
// Every command touches the phone, so it runs inside your phone hold (Hard rule 9):
//   node tools/lock.mjs run iphone --owner <you> -- node tools/thermal.mjs <command>
//
//   probe                    RSD service list + DTX capabilities handshake only, no condition call; prints PROBE ok
//   list [--json]            condition groups and their profiles; ACTIVE marks the one that is on
//   status [--json]          ACTIVE <group> <profile> | NONE, plus HOLDER when a `set` of ours holds it
//   set <profile> [--hold-seconds N]
//                            profile: fair | serious | critical (the thermal group's profile) or an exact identifier
//                            from `list`. Prints SET <group> <profile> once the device confirms, then STAYS RUNNING:
//                            the device ends a condition when the connection that set it closes (go-ios
//                            devicestate.go; UNRESOLVED on our phone until the stage-3 check). After N s, on
//                            SIGINT/SIGTERM/SIGHUP or `thermal.mjs clear`, it disables the condition and prints
//                            CLEARED. Killed hard, the kernel closes its TCP connection, so the device should drop
//                            the condition by itself.
//                            Use it in the background: `node tools/thermal.mjs set serious > <log> &`, then
//                            `node tools/wait.mjs file <log> --match '^SET' --pid $!`, measure, `kill $!`.
//   clear                    stops our running `set` (SIGTERM), then disableActiveCondition on a new connection and a
//                            re-read of the list: CLEARED, or NONE when nothing is active. I-233: a condition another
//                            client holds (Xcode) survived disableActiveCondition (the device answered an error, OBSERVED
//                            10-07); clear then prints `ACTIVE <group> <profile> held by another client …`, takes it
//                            over (enables the same profile on its own connection, which replaces it) and disables that:
//                            CLEARED … (taken over …), or still ACTIVE: exit 4
// Options: --owner <you> (outside `lock.mjs run iphone`), --timeout S (per call; set's enable waits up to 120 s).
// Exit: 0 ok; 1 error or refusal (no phone hold, no tunnel, RSD refused, device error); 2 usage; 3 set lost its
// connection while holding (the condition ended early); 4 clear left a condition another client holds ACTIVE (I-233). The tunnel address, ports and device ids are never printed,
// logged or stored (messages say <tunnel>); errors are redacted.
// Seams (tests): $FW_NETSTAT + $FW_THERMAL_LOOPBACK=1 (tests/fixtures/fake-coredevice.mjs), $FW_STATE_DIR (holder
// file thermal/holder.json).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exitOnHelp } from './lib/help.mjs';
import { sharedStateDir } from './lib/paths.mjs';
import { readJson } from './lib/store.mjs';
import { status as lockStatus, phoneHolder } from './lib/lock.mjs';
import { connectService } from './lib/rsd.mjs';
import { DtxConnection } from './lib/dtx.mjs';
import { ConditionInducer, SERVICE, activeOf, resolveProfile, ENABLE_TIMEOUT_MS } from './lib/condition-inducer.mjs';
import { redact } from './lib/redact.mjs';
import { holderFile, liveHolder } from './lib/thermal-holder.mjs'; // I-233: shared with the phone's thermal reads

exitOnHelp(import.meta.url);

const argv = process.argv.slice(2);
const VALUED = ['--owner', '--hold-seconds', '--timeout'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const env = process.env;
const dropHolder = () => { if (readJson(holderFile())?.pid === process.pid) rmSync(holderFile(), { force: true }); };

class Usage extends Error {}
const say = (s) => process.stdout.write(`${s}\n`);
const num = (n, v) => { const x = Number(v); if (!Number.isFinite(x) || x <= 0) throw new Usage(`--${n} must be a positive number of seconds (got ${v})`); return x; };
const callMs = () => (opt('timeout') !== undefined ? num('timeout', opt('timeout')) * 1000 : 30000);

const DTSERVICEHUB = 'com.apple.instruments.dtservicehub';

async function session() {
  const { socket, services } = await connectService({ service: DTSERVICEHUB, env, timeoutMs: Math.min(callMs(), 15000) });
  const conn = new DtxConnection(socket);
  const close = async () => { conn.close(); };
  try {
    const caps = await conn.handshake({ timeoutMs: callMs() });
    return { conn, caps, services, close };
  } catch (e) { await close(); throw e; }
}

const groupLine = (g) => `${g.identifier}${g.name && g.name !== g.identifier ? ` (${g.name})` : ''}${g.isActive ? `  ACTIVE ${g.activeProfile ?? '?'}` : ''}`;

async function main() {
  if (!cmd || !['probe', 'list', 'status', 'set', 'clear'].includes(cmd)) throw new Usage(`usage: node tools/thermal.mjs probe|list|status|set <profile> [--hold-seconds N]|clear (got ${cmd ?? 'nothing'}); --help for more`);
  if (cmd === 'set' && !arg) throw new Usage('set needs a profile: fair, serious, critical or an exact identifier from `list`');
  const holdSec = cmd === 'set' && opt('hold-seconds') !== undefined ? num('hold-seconds', opt('hold-seconds')) : null;
  callMs();
  const owner = phoneHolder({ owner: opt('owner', env.FW_LOCK_OWNER), st: lockStatus('iphone') });

  if (cmd === 'set') {
    const h = liveHolder();
    if (h) throw new Error(`a thermal.mjs set (pid ${h.pid}, ${h.owner}) already holds ${h.group}/${h.profile} since ${h.since}: run node tools/thermal.mjs clear first`);
  }
  if (cmd === 'clear') {
    const h = liveHolder();
    if (h) {
      process.kill(h.pid, 'SIGTERM');
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) { try { process.kill(h.pid, 0); } catch { break; } await new Promise((r) => setTimeout(r, 200)); }
      say(`STOPPED thermal.mjs set pid ${h.pid} (${h.owner}, ${h.group}/${h.profile})`);
    }
  }

  const s = await session();
  try {
    if (cmd === 'probe') {
      const keys = Object.keys(s.caps || {});
      say(`PROBE ok: RSD listed ${s.services} services; DTServiceHub answered the capabilities handshake (${keys.length} capabilities; ConditionInducer offered: ${keys.includes(SERVICE) ? 'yes' : 'no'})`);
      return 0;
    }
    const ci = new ConditionInducer(s.conn);
    if (cmd === 'list' || cmd === 'status') {
      const groups = await ci.list({ timeoutMs: callMs() });
      const act = activeOf(groups);
      const h = liveHolder();
      if (flag('json')) { say(JSON.stringify(cmd === 'list' ? { groups, active: act, holder: h } : { active: act, holder: h })); return 0; }
      if (cmd === 'list') for (const g of groups) { say(groupLine(g)); for (const p of g.profiles) say(`  ${p.identifier}${p.name ? `  ${p.name}` : ''}${p.description ? `  ${p.description}` : ''}`); }
      else say(act ? `ACTIVE ${act.group} ${act.profile}` : 'NONE');
      if (h) say(`HOLDER thermal.mjs set pid ${h.pid} (${h.owner}) ${h.group}/${h.profile} since ${h.since}${h.until ? ` until ${h.until}` : ''}`);
      return 0;
    }
    if (cmd === 'clear') {
      const r = await ci.disable({ timeoutMs: callMs() });
      // I-233: disableActiveCondition answered an NSError (NONE) while status showed Xcode's condition ACTIVE (10-07 03:09Z,
      // OBSERVED): the device seems to disable only a condition this connection set. So re-read the list: still active =
      // held by another client; take it over (enable the same profile on our connection: a set replaces the other client's
      // condition, I-199 stage 3) and disable ours (ending ours leaves none, stage 3), then check again.
      const still = activeOf(await ci.list({ timeoutMs: callMs() }));
      if (!still) { say(r === 'cleared' ? 'CLEARED the active condition' : 'NONE no active condition'); return 0; }
      say(`ACTIVE ${still.group} ${still.profile} held by another client (e.g. Xcode): disableActiveCondition ${r === 'cleared' ? 'answered true' : `answered an error (${redact(ci.noneWhy || 'no text')})`} and it is still on; taking it over to end it (I-233)`);
      try {
        await ci.enable(still, { timeoutMs: opt('timeout') !== undefined ? callMs() : ENABLE_TIMEOUT_MS });
        await ci.disable({ timeoutMs: callMs() });
      } catch (e) { say(`TAKEOVER-FAILED ${redact(e.message)}`); }
      const left = activeOf(await ci.list({ timeoutMs: callMs() }));
      if (!left) { say(`CLEARED ${still.group} ${still.profile} (taken over from another client, then disabled)`); return 0; }
      say(`ACTIVE ${left.group} ${left.profile} held by another client: clear could not end it; stop it where it was started (Xcode > Devices and Simulators > Device Conditions > Stop)`);
      return 4;
    }
    // set
    const groups = await ci.list({ timeoutMs: callMs() });
    const want = resolveProfile(groups, arg);
    const before = activeOf(groups);
    if (before) say(`NOTE ${before.group}/${before.profile} was already active (another client, e.g. Xcode); enabling ${want.profile}`);
    await ci.enable(want, { timeoutMs: opt('timeout') !== undefined ? callMs() : ENABLE_TIMEOUT_MS });
    const since = new Date();
    const until = holdSec ? new Date(since.getTime() + holdSec * 1000) : null;
    mkdirSync(join(sharedStateDir(), 'thermal'), { recursive: true });
    writeFileSync(holderFile(), JSON.stringify({ pid: process.pid, owner, ...want, since: since.toISOString(), until: until?.toISOString() ?? null }));
    say(`SET ${want.group} ${want.profile} (holding${until ? ` until ${until.toISOString()}` : ''}; SIGINT/SIGTERM or node tools/thermal.mjs clear ends it)`);
    const end = await new Promise((resolve) => {
      const timer = holdSec ? setTimeout(() => resolve({ why: `${holdSec} s elapsed` }), holdSec * 1000) : null;
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { if (timer) clearTimeout(timer); resolve({ why: sig }); });
      s.conn.once('close', (e) => { if (timer) clearTimeout(timer); resolve({ lost: e }); });
    });
    dropHolder();
    if (end.lost) { say(`LOST ${redact(end.lost.message)}: the connection that set ${want.profile} closed, so the device ends the condition`); return 3; }
    try {
      const r = await ci.disable({ timeoutMs: 15000 });
      say(`CLEARED ${want.group} ${want.profile} (${end.why}${r === 'none' ? '; the device reported nothing active' : ''})`);
      return 0;
    } catch (e) {
      say(`CLEAR-FAILED ${redact(e.message)}; closing the connection (the device ends the condition with it)`);
      return 1;
    }
  } finally {
    await s.close();
  }
}

main().then((code) => process.exit(code), (e) => {
  if (e instanceof Usage || e.usage) { process.stderr.write(`${e.message}\n`); process.exit(2); }
  dropHolder();
  process.stderr.write(`thermal.mjs ${cmd ?? ''}: ${redact(e.message)}\n`);
  process.exit(1);
});

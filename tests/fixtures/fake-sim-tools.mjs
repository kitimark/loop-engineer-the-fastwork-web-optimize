#!/usr/bin/env node
// Small stand-ins for the tools/sim.mjs tests, picked by the first argument (the tests write a one-line wrapper per
// tool and point $FW_LSOF / $FW_IDEVICE_ID / $FW_OPEN / $FW_OSASCRIPT at it):
//   lsof       `lsof -aUc launchd_sim -Fn`: one webinspectord_sim socket while a device in $FAKE_SIMCTL_STATE is
//              booted with Safari launched ($FAKE_LSOF_SOCKETS=2: two, as with two booted Simulators); exit 1 if none.
//   idevice_id `idevice_id -l` (USB): the comma list $FAKE_IDEVICE_IDS one per line; `-n` (network): $FAKE_IDEVICE_NET_IDS;
//              $FAKE_IDEVICE_ID_FAIL=1 (both) / -l / -n: that call exits 1.
//   open       `open -a Simulator --args ...`: Simulator.app runs ($FAKE_MACAPP_STATE).
//   osascript  `application "Simulator" is running` -> true/false; `quit app "Simulator"` (I-078: with
//              $FAKE_SIMAPP_QUIT_SHUTDOWN_MS=N every Booted device in $FAKE_SIMCTL_STATE goes "Shutting Down" and reaches
//              Shutdown N ms later, as when Simulator.app shuts its devices down on quit, after the quit returns).
//   ps         `ps -A -o pid=,ppid=,time=,comm=` (I-082, $FW_PS): the processes of $FAKE_PS_TABLE ({t0: epoch ms, rows:
//              [{pid, ppid, command, pct}]}), each with CPU time pct % of one core since t0, comm a full path like the
//              real one's (the tools take its basename).
// Every call appends {tool, argv} to $FAKE_SIMTOOLS_LOG. All ids are made up.
import { readFileSync, writeFileSync, appendFileSync, existsSync, renameSync } from 'node:fs';

const [tool, ...a] = process.argv.slice(2);
if (process.env.FAKE_SIMTOOLS_LOG) appendFileSync(process.env.FAKE_SIMTOOLS_LOG, JSON.stringify({ tool, argv: a }) + '\n');
const app = process.env.FAKE_MACAPP_STATE;
if (tool === 'lsof') {
  const st = JSON.parse(readFileSync(process.env.FAKE_SIMCTL_STATE, 'utf8'));
  if (!st.devices.some((d) => d.state === 'Booted' && d.safari)) process.exit(1);
  const n = Number(process.env.FAKE_LSOF_SOCKETS || 1);
  for (let i = 0; i < n; i++) console.log(`p${4000 + i}\nf7\nn/private/var/tmp/com.apple.launchd.FAKE${i}/com.apple.webinspectord_sim.socket\nf8\nn/private/var/tmp/other.socket`);
} else if (tool === 'idevice_id') {
  // -l: USB devices ($FAKE_IDEVICE_IDS), -n: network devices ($FAKE_IDEVICE_NET_IDS: a phone paired over Wi-Fi)
  const flag = a[0];
  if (flag !== '-l' && flag !== '-n') { console.error(`fake idevice_id: unexpected ${a.join(' ')}`); process.exit(2); }
  const fail = process.env.FAKE_IDEVICE_ID_FAIL;
  if (fail === '1' || fail === flag) { console.error('ERROR: Unable to retrieve device list!'); process.exit(1); }
  for (const id of String(process.env[flag === '-l' ? 'FAKE_IDEVICE_IDS' : 'FAKE_IDEVICE_NET_IDS'] || '').split(',').filter(Boolean)) console.log(id);
} else if (tool === 'open') {
  writeFileSync(app, 'true');
} else if (tool === 'osascript') {
  const e = a[a.indexOf('-e') + 1] || '';
  if (/is running/.test(e)) console.log(existsSync(app) && readFileSync(app, 'utf8') === 'true' ? 'true' : 'false');
  else if (/^quit app/.test(e)) {
    writeFileSync(app, 'false');
    const ms = process.env.FAKE_SIMAPP_QUIT_SHUTDOWN_MS;
    if (ms) {
      const st = JSON.parse(readFileSync(process.env.FAKE_SIMCTL_STATE, 'utf8'));
      for (const d of st.devices) if (d.state === 'Booted') Object.assign(d, { state: 'Shutting Down', safari: false, settleAt: Date.now() + Number(ms), settleTo: 'Shutdown' });
      const tmp = `${process.env.FAKE_SIMCTL_STATE}.${process.pid}.tmp`; // I-238: replaced whole, like fake-simctl's save
      writeFileSync(tmp, JSON.stringify(st, null, 1)); renameSync(tmp, process.env.FAKE_SIMCTL_STATE);
    }
  }
} else if (tool === 'ps') {
  const t = JSON.parse(readFileSync(process.env.FAKE_PS_TABLE, 'utf8'));
  const el = Math.max(0, (Date.now() - t.t0) / 1000);
  const time = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
  for (const r of t.rows) console.log(`${String(r.pid).padStart(5)} ${String(r.ppid).padStart(5)} ${time((r.pct / 100) * el).padStart(10)} /Library/Developer/CoreSimulator/Volumes/iOS_23F77/Runtimes/iOS 26.5.simruntime/Contents/Resources/RuntimeRoot/usr/libexec/${r.command}`);
} else { console.error(`fake-sim-tools: unknown tool ${tool}`); process.exit(2); }

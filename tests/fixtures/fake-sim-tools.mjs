#!/usr/bin/env node
// Small stand-ins for the tools/sim.mjs tests, picked by the first argument (the tests write a one-line wrapper per
// tool and point $FW_LSOF / $FW_IDEVICE_ID / $FW_OPEN / $FW_OSASCRIPT at it):
//   lsof       `lsof -aUc launchd_sim -Fn`: one webinspectord_sim socket while a device in $FAKE_SIMCTL_STATE is
//              booted with Safari launched ($FAKE_LSOF_SOCKETS=2: two, as with two booted Simulators); exit 1 if none.
//   idevice_id `idevice_id -l`: the comma list $FAKE_IDEVICE_IDS one per line; $FAKE_IDEVICE_ID_FAIL=1: exit 1.
//   open       `open -a Simulator --args ...`: Simulator.app runs ($FAKE_MACAPP_STATE).
//   osascript  `application "Simulator" is running` -> true/false; `quit app "Simulator"`.
// Every call appends {tool, argv} to $FAKE_SIMTOOLS_LOG. All ids are made up.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const [tool, ...a] = process.argv.slice(2);
if (process.env.FAKE_SIMTOOLS_LOG) appendFileSync(process.env.FAKE_SIMTOOLS_LOG, JSON.stringify({ tool, argv: a }) + '\n');
const app = process.env.FAKE_MACAPP_STATE;
if (tool === 'lsof') {
  const st = JSON.parse(readFileSync(process.env.FAKE_SIMCTL_STATE, 'utf8'));
  if (!st.devices.some((d) => d.state === 'Booted' && d.safari)) process.exit(1);
  const n = Number(process.env.FAKE_LSOF_SOCKETS || 1);
  for (let i = 0; i < n; i++) console.log(`p${4000 + i}\nf7\nn/private/var/tmp/com.apple.launchd.FAKE${i}/com.apple.webinspectord_sim.socket\nf8\nn/private/var/tmp/other.socket`);
} else if (tool === 'idevice_id') {
  if (process.env.FAKE_IDEVICE_ID_FAIL) { console.error('ERROR: Unable to retrieve device list!'); process.exit(1); }
  for (const id of String(process.env.FAKE_IDEVICE_IDS || '').split(',').filter(Boolean)) { console.log(id); console.log(id); } // listed twice (USB + network)
} else if (tool === 'open') {
  writeFileSync(app, 'true');
} else if (tool === 'osascript') {
  const e = a[a.indexOf('-e') + 1] || '';
  if (/is running/.test(e)) console.log(existsSync(app) && readFileSync(app, 'utf8') === 'true' ? 'true' : 'false');
  else if (/^quit app/.test(e)) writeFileSync(app, 'false');
} else { console.error(`fake-sim-tools: unknown tool ${tool}`); process.exit(2); }

#!/usr/bin/env node
// Stand-in for `xcrun simctl` in the tools/sim.mjs tests ($FW_SIMCTL: takes simctl's own arguments). State in the
// JSON file $FAKE_SIMCTL_STATE: {runtimes: [...], devices: [{udid, name, state, deviceTypeIdentifier, runtimeId,
// safari}]}; one JSON line of argv per call in $FAKE_SIMCTL_LOG. Like the real one, error messages name the UDID
// (the tools must scrub them). Env: FAKE_SIMCTL_BOOT_MS (bootstatus delay), FAKE_SIMCTL_BOOT_FAIL=1.
// All ids are made up.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const a = process.argv.slice(2);
const F = process.env.FAKE_SIMCTL_STATE;
if (process.env.FAKE_SIMCTL_LOG) appendFileSync(process.env.FAKE_SIMCTL_LOG, JSON.stringify(a) + '\n');
const st = JSON.parse(readFileSync(F, 'utf8'));
const save = () => writeFileSync(F, JSON.stringify(st, null, 1));
const dev = (u) => st.devices.find((d) => d.udid === u);
const fail = (msg, code = 149) => { console.error(msg); process.exit(code); };
const [c, ...r] = a;

if (c === 'list' && r[0] === '-j' && r[1] === 'devices') {
  const out = {};
  for (const d of st.devices) (out[d.runtimeId] ||= []).push({ udid: d.udid, name: d.name, state: d.state, deviceTypeIdentifier: d.deviceTypeIdentifier, isAvailable: true, dataPath: `/Users/x/Library/Developer/CoreSimulator/Devices/${d.udid}/data` });
  console.log(JSON.stringify({ devices: out }));
} else if (c === 'list' && r[0] === '-j' && r[1] === 'runtimes') {
  console.log(JSON.stringify({ runtimes: st.runtimes }));
} else if (c === 'create') {
  const [name, type, rt] = r;
  if (!st.runtimes.some((x) => x.identifier === rt)) fail(`Invalid runtime: ${rt}`);
  const udid = randomUUID().toUpperCase();
  st.devices.push({ udid, name, state: 'Shutdown', deviceTypeIdentifier: type, runtimeId: rt });
  save();
  console.log(udid);
} else if (c === 'boot') {
  const d = dev(r[0]);
  if (!d) fail(`Invalid device: ${r[0]}`);
  if (process.env.FAKE_SIMCTL_BOOT_FAIL) fail(`An error was encountered processing the command (domain=com.apple.CoreSimulator.SimError, code=405):\nUnable to boot device ${r[0]} because it is broken`);
  if (d.state === 'Booted') fail(`Unable to boot device in current state: Booted (${r[0]})`);
  d.state = 'Booted'; save();
} else if (c === 'bootstatus') {
  const d = dev(r[0]);
  if (!d || d.state !== 'Booted') fail(`Device ${r[0]} is not booted`);
  await new Promise((res) => setTimeout(res, Number(process.env.FAKE_SIMCTL_BOOT_MS || 50)));
  console.log(`Device ${r[0]} booted.`);
} else if (c === 'launch') {
  const d = dev(r[0]);
  if (!d || d.state !== 'Booted') fail(`Unable to lookup in current state: ${d?.state} (${r[0]})`);
  d.safari = true; save();
  console.log(`${r[1]}: 4242`);
} else if (c === 'openurl') {
  const d = dev(r[0]);
  if (!d || d.state !== 'Booted') fail(`Unable to openurl in current state: ${d?.state} (${r[0]})`);
  d.lastUrl = r[1]; save();
} else if (c === 'io' && r[1] === 'screenshot') {
  writeFileSync(r[2], Buffer.from('89504e470d0a1a0a', 'hex'));
  console.error(`Wrote screenshot to: ${r[2]}`);
} else if (c === 'shutdown') {
  const d = dev(r[0]);
  if (!d) fail(`Invalid device: ${r[0]}`);
  if (d.state === 'Shutdown') fail(`Unable to shutdown device in current state: Shutdown (${r[0]})`);
  d.state = 'Shutdown'; d.safari = false; save();
} else fail(`fake simctl: unexpected ${a.join(' ')}`, 2);

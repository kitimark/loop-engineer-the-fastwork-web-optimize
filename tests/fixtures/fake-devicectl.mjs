#!/usr/bin/env node
// Stand-in for `xcrun devicectl` ($FW_DEVICECTL) and, for safari-restart's simctl driver, `xcrun simctl` ($FW_SIMCTL)
// in the safari-restart tests: it takes the arguments after `xcrun devicectl` / `xcrun simctl`, appends them as one
// JSON line to $FAKE_APPCTL_LOG, and tells the fake Safari (tests/fixtures/fake-webkit-proxy.mjs, base URL in
// $FAKE_APPCTL_PROXY) what happened through GET /__fake/app?kind=terminate|launch|url&url=U:
//   devicectl device process launch [--terminate-existing] [--payload-url U] --device <id> <bundle id>
//   simctl terminate|launch <udid> <bundle id>; simctl openurl <udid> <url>
// $FAKE_APPCTL_FAIL=1: fails like the real devicectl, naming the device's UDID and its user-chosen name (the tool
// must scrub both). All ids are made up.
import { appendFileSync } from 'node:fs';

const a = process.argv.slice(2);
if (process.env.FAKE_APPCTL_LOG) appendFileSync(process.env.FAKE_APPCTL_LOG, JSON.stringify(a) + '\n');
const tell = async (kind, url = null) => {
  const base = process.env.FAKE_APPCTL_PROXY;
  if (base) await fetch(`${base}/__fake/app?kind=${kind}${url ? `&url=${encodeURIComponent(url)}` : ''}`);
};
const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
if (process.env.FAKE_APPCTL_FAIL === '1') {
  console.error(`ERROR: The operation couldn't be completed. (com.apple.dt.CoreDeviceError error 4.) Device: ${val('--device') || a[1]} (Test Person's iPhone) at 192.168.0.7`);
  process.exit(1);
}
if (a[0] === 'device' && a[1] === 'process' && a[2] === 'launch') {
  if (!val('--device')) { console.error('Error: Missing expected argument --device'); process.exit(64); }
  if (a.includes('--terminate-existing')) await tell('terminate');
  const u = val('--payload-url');
  await tell(u ? 'url' : 'launch', u);
  console.log(`Launched application with ${a[a.length - 1]} bundle identifier.`);
} else if (a[0] === 'terminate') {
  await tell('terminate');
} else if (a[0] === 'launch') {
  await tell('launch'); console.log(`${a[2]}: 4242`);
} else if (a[0] === 'openurl') {
  await tell('url', a[2]);
} else {
  console.error(`fake devicectl/simctl: unexpected arguments ${JSON.stringify(a)}`);
  process.exit(64);
}

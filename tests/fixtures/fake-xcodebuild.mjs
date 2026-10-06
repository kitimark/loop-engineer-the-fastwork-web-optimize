#!/usr/bin/env node
// Stand-in for xcodebuild in the `iphone.mjs wda build|start` tests ($FW_XCODEBUILD). build-for-testing leaves
// an .xctestrun (and a runner .app) in -derivedDataPath; test-without-building runs a fake WebDriverAgent
// (tests/fixtures/fake-wda.mjs) on the port of $FW_WDA_URL until killed, like the real runner behind iproxy.
// Env: FAKE_XCODEBUILD_LOG (one JSON line of argv per call), FAKE_XCODEBUILD_FAIL=1 (build: signing failure),
// FAKE_XCODEBUILD_RUN_FAIL=1 (test-without-building: the runner fails to launch), FAKE_XCODEBUILD_SLOW=<dir>
// (build: runs until killed, with a SIGTERM-ignoring helper in its group; pids in <dir>), FAKE_WDA_LOG (passed to the
// fake WDA). I-220: FAKE_XCODEBUILD_RUN_MODES=automation,ok (one mode per test-without-building call, counted in
// $FAKE_XCODEBUILD_LOG.runs; the last mode repeats): `automation` prints XCTest's "Timed out while enabling automation
// mode" after FAKE_AUTOMATION_MS (default 200) and then hangs like the real runner; FAKE_RUNNER_PORT makes the runner
// listen there instead of on $FW_WDA_URL's port, so the fake iproxy forwards to it (tests/fixtures/fake-iproxy.mjs).
// Every test-without-building prints the real runner's harmless "Supported platforms ... is empty" line. Both failures print what real xcodebuild prints there: the device's UDID and name, the team id,
// the runner's bundle id, the Apple Account e-mail and the signing identity's person name (review-gesture 2:
// the tools must scrub all of them before printing a log tail). All of these ids are made up.
import './lifeline.mjs'; // I-072: registered for the test's teardown; ends with the test process
import { appendFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2);
if (process.env.FAKE_XCODEBUILD_LOG) appendFileSync(process.env.FAKE_XCODEBUILD_LOG, JSON.stringify(a) + '\n');
const dest = (a[a.indexOf('-destination') + 1] || '').replace(/^id=/, '');
const team = (a.find((x) => x.startsWith('DEVELOPMENT_TEAM=')) || 'DEVELOPMENT_TEAM=ABCDE12345').split('=')[1];
const bundle = (a.find((x) => x.startsWith('PRODUCT_BUNDLE_IDENTIFIER=')) || `PRODUCT_BUNDLE_IDENTIFIER=fw.wda.${team.toLowerCase()}.WebDriverAgentRunner`).split('=')[1];
const leaky = () => {
  console.log('xcodebuild: error: Unable to find a destination matching the provided destination specifier:');
  console.log(`\t\t{ id:${dest} }`);
  console.log('\tAvailable destinations for the "WebDriverAgentRunner" scheme:');
  console.log(`\t\t{ platform:iOS, arch:arm64e, id:${dest}, name:Kitchen Phone 7 }`);
  console.log(`\t\t{ platform:iOS, arch:arm64e, id:00008110-00AABBCCDDEEFF00, name:Test Person’s iPhone }`);
  console.log('"Kitchen Phone 7" is busy: Preparing the device for development (CoreDevice 1A2B3C4D-1111-2222-3333-444455556666)');
  console.log(`error: No Account for Team "${team}". Add a new account in Accounts settings (test.person@example.com).`);
  console.log(`error: No profiles for '${bundle}.xctrunner' were found (in target 'WebDriverAgentRunner')`);
  console.log(`Signing Identity: "Apple Development: Test Person (${team})"`);
  console.log(`legacy device ${'0123456789abcdef0123456789abcdef01234567'}`);
};
if (a.includes('build-for-testing')) {
  if (process.env.FAKE_XCODEBUILD_SLOW) {
    // a build that runs until killed, with a helper process in its group that ignores SIGTERM (like the
    // compilers/signing tools xcodebuild starts): writes xb.pid and helper.pid into the given directory
    const dir = process.env.FAKE_XCODEBUILD_SLOW;
    const h = spawn(process.execPath, ['--import', new URL('./lifeline.mjs', import.meta.url).href, '-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1 << 30)"], { stdio: 'ignore' });
    writeFileSync(join(dir, 'helper.pid'), String(h.pid));
    writeFileSync(join(dir, 'xb.pid'), String(process.pid));
    console.log('Building... (slow fake)');
    setInterval(() => {}, 1 << 30);
    await new Promise(() => {}); // never finishes by itself
  }
  if (process.env.FAKE_XCODEBUILD_FAIL) { leaky(); console.log('error: Signing for "WebDriverAgentRunner" requires a development team.'); process.exit(65); }
  const dd = a[a.indexOf('-derivedDataPath') + 1];
  const p = join(dd, 'Build', 'Products');
  mkdirSync(join(p, 'Debug-iphoneos', 'WebDriverAgentRunner-Runner.app'), { recursive: true });
  writeFileSync(join(p, 'WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun'), '<plist/>');
  console.log('** TEST BUILD SUCCEEDED **');
  process.exit(0);
}
if (a.includes('test-without-building')) {
  console.log('2026-10-06 16:47:51.308 xcodebuild[1:2] [MT] IDERunDestination: Supported platforms for the buildables in the current scheme is empty.');
  let mode = 'ok';
  if (process.env.FAKE_XCODEBUILD_RUN_MODES && process.env.FAKE_XCODEBUILD_LOG) {
    const f = `${process.env.FAKE_XCODEBUILD_LOG}.runs`;
    appendFileSync(f, 'x');
    const n = readFileSync(f, 'utf8').length;
    const modes = process.env.FAKE_XCODEBUILD_RUN_MODES.split(',');
    mode = modes[Math.min(n, modes.length) - 1];
  }
  if (mode === 'automation') {
    console.log('2026-10-06 16:48:00.409247+0700 WebDriverAgentRunner-Runner[23050:3494038] [Default] Running tests...');
    await new Promise((r) => setTimeout(r, Number(process.env.FAKE_AUTOMATION_MS) || 200));
    console.log('2026-10-06 16:49:00.499953+0700 WebDriverAgentRunner-Runner[23050:3494038] [Default] Failed to initialize for UI testing: Error Domain=com.apple.dt.XCTest.XCTFuture Code=1000 "Timed out while enabling automation mode." UserInfo={NSLocalizedDescription=Timed out while enabling automation mode.}');
    setInterval(() => {}, 1 << 30); // the real xcodebuild stays up until it is stopped
    await new Promise(() => {});
  }
  if (process.env.FAKE_XCODEBUILD_RUN_FAIL) { leaky(); console.log('** TEST EXECUTE FAILED **'); process.exit(65); }
  const { startFakeWda } = await import(join(dirname(fileURLToPath(import.meta.url)), 'fake-wda.mjs'));
  // the real runner listens on USE_PORT, which xcodebuild passes from TEST_RUNNER_USE_PORT (WDA-sim, tools/lib/sim.mjs);
  // the phone's runner keeps 8100 behind iproxy, which these tests stand in for with $FW_WDA_URL's port
  const port = process.env.TEST_RUNNER_USE_PORT ? Number(process.env.TEST_RUNNER_USE_PORT) : process.env.FAKE_RUNNER_PORT ? Number(process.env.FAKE_RUNNER_PORT) : Number(new URL(process.env.FW_WDA_URL).port);
  await startFakeWda({ port, foreground: 'com.example.WebDriverAgentRunner.xctrunner', log: process.env.FAKE_WDA_LOG });
  console.log(`ServerURLHere->http://127.0.0.1:${port}<-ServerURLHere`);
  setInterval(() => {}, 1 << 30);
} else {
  console.error(`fake xcodebuild: unexpected ${a.join(' ')}`);
  process.exit(2);
}

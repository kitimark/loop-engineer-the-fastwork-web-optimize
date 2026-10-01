#!/usr/bin/env node
// Stand-in for xcodebuild in the `iphone.mjs wda build|start` tests ($FW_XCODEBUILD). build-for-testing leaves
// an .xctestrun (and a runner .app) in -derivedDataPath; test-without-building runs a fake WebDriverAgent
// (tests/fixtures/fake-wda.mjs) on the port of $FW_WDA_URL until killed, like the real runner behind iproxy.
// Env: FAKE_XCODEBUILD_LOG (one JSON line of argv per call), FAKE_XCODEBUILD_FAIL=1 (signing failure),
// FAKE_WDA_LOG (passed to the fake WDA).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2);
if (process.env.FAKE_XCODEBUILD_LOG) appendFileSync(process.env.FAKE_XCODEBUILD_LOG, JSON.stringify(a) + '\n');
if (a.includes('build-for-testing')) {
  if (process.env.FAKE_XCODEBUILD_FAIL) { console.log('error: Signing for "WebDriverAgentRunner" requires a development team.'); process.exit(65); }
  const dd = a[a.indexOf('-derivedDataPath') + 1];
  const p = join(dd, 'Build', 'Products');
  mkdirSync(join(p, 'Debug-iphoneos', 'WebDriverAgentRunner-Runner.app'), { recursive: true });
  writeFileSync(join(p, 'WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun'), '<plist/>');
  console.log('** TEST BUILD SUCCEEDED **');
  process.exit(0);
}
if (a.includes('test-without-building')) {
  const { startFakeWda } = await import(join(dirname(fileURLToPath(import.meta.url)), 'fake-wda.mjs'));
  const port = Number(new URL(process.env.FW_WDA_URL).port);
  await startFakeWda({ port, foreground: 'com.example.WebDriverAgentRunner.xctrunner', log: process.env.FAKE_WDA_LOG });
  console.log(`ServerURLHere->http://127.0.0.1:${port}<-ServerURLHere`);
  setInterval(() => {}, 1 << 30);
} else {
  console.error(`fake xcodebuild: unexpected ${a.join(' ')}`);
  process.exit(2);
}

// tools/lib/redact.mjs (review-gesture 2, Hard rule 12): what `iphone.mjs wda` and `gesture` print or save never
// carries the user's team id, device UDID, runner bundle id, device name, Apple Account e-mail or signing-identity
// person name, neither the values we know (config.json) nor id-shaped strings in xcodebuild / WDA output.
// All ids here are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../../tools/lib/redact.mjs';

const KNOWN = { team: 'ABCDE12345', udid: '00008130-0011223344556677', bundleId: 'fw.wda.abcde12345.WebDriverAgentRunner', deviceName: 'Kitchen Phone 7' };
const SECRETS = [/ABCDE12345/i, /0011223344556677/, /00008130-/, /Kitchen Phone/, /Test Person/, /example\.com/, /00AABBCCDDEEFF00/, /1A2B3C4D-1111/, /0123456789abcdef0123/];

const XCODEBUILD = `xcodebuild: error: Unable to find a destination matching the provided destination specifier:
\t\t{ id:00008130-0011223344556677 }
\t\t{ platform:iOS, arch:arm64e, id:00008130-0011223344556677, name:Kitchen Phone 7 }
\t\t{ platform:iOS, arch:arm64e, id:00008110-00AABBCCDDEEFF00, name:Test Person’s iPhone }
"Kitchen Phone 7" is busy: Preparing the device for development (CoreDevice 1A2B3C4D-1111-2222-3333-444455556666)
error: No Account for Team "ABCDE12345". Add a new account in Accounts settings (test.person@example.com).
error: No profiles for 'fw.wda.abcde12345.WebDriverAgentRunner.xctrunner' were found (in target 'WebDriverAgentRunner')
Signing Identity: "Apple Development: Test Person (ABCDE12345)"
legacy device 0123456789abcdef0123456789abcdef01234567
error: Signing for "WebDriverAgentRunner" requires a development team.`;

test('redact: known ids and id-shaped strings are replaced; the rest of an xcodebuild log stays readable', () => {
  for (const known of [KNOWN, {}]) {
    const r = redact(XCODEBUILD, known);
    // a free-form device name has no id shape: only the known value (config.json, stored before xcodebuild runs) catches it
    for (const s of known.team ? SECRETS : SECRETS.filter((x) => !String(x).includes('Kitchen'))) assert.doesNotMatch(r, s, `${s} with ${known.team ? 'known ids' : 'patterns only'}:\n${r}`);
    assert.match(r, /requires a development team/);
    assert.match(r, /Available destinations|platform:iOS, arch:arm64e, id:<udid>, name:<device>/);
    assert.match(r, /No Account for Team "<team>"/);
    assert.match(r, /No profiles for '<runner-bundle-id>\.xctrunner' were found \(in target 'WebDriverAgentRunner'\)/, 'the scheme/target name itself stays');
    assert.match(r, /Apple Development: <name> \(<team>\)/);
    assert.match(r, /<email>/);
  }
  // a device name that has no id shape is only caught as a known value
  assert.match(redact('"Kitchen Phone 7" is busy', KNOWN), /^"<device-name>" is busy$/);
  assert.equal(redact('"Kitchen Phone 7" is busy', {}), '"Kitchen Phone 7" is busy');
  // the WDA runner in front instead of Safari, and a UDID without its dash
  assert.equal(redact('fw.wda.abcde12345.WebDriverAgentRunner.xctrunner is in front'), '<runner-bundle-id>.xctrunner is in front');
  assert.equal(redact('device 000081300011223344556677', KNOWN), 'device <udid>');
});

test('redact leaves the tools\' own output alone: paths, URLs, hashes, ids of the study, numbers', () => {
  const keep = [
    'WDA_BUILT /Users/x/.cache/fw-wda/DerivedData/Build/Products/WebDriverAgentRunner_iphoneos26.6-arm64.xctestrun',
    'GESTURE finger-protocol-v1 v1 hash 03aade25b820 params {"variant":"asPerformed"}: 22 strokes, ~52 s on http://192.168.0.55:5441/',
    `GESTURE_HASH ${'03aade25b820b5d39163e9c112c6d0aae801ad9f8ad8b8f87f3d58f2be8e5097'}`,
    'com.apple.mobilesafari is in front',
    'pull-to-refresh guard: s12 (down 120 px) needs scrollY >= 300, the page is at 0; nothing was sent',
    'WDA_READY http://127.0.0.1:8100 (Safari in front)',
  ];
  for (const s of keep) assert.equal(redact(s, KNOWN), s);
  assert.equal(redact(undefined), undefined);
  assert.equal(redact(42), 42);
});

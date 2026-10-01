// tools/lib/wda-runner.mjs and tools/lib/gesture-run.mjs pure helpers: when `wda build` may run (Hard rule 7),
// the provisioning-profile expiry, the xcodebuild/iproxy arguments (everything outside the repo), id masking,
// and the gesture CLI's --param/--variant parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGate, parseExpiry, mask, buildArgs, runnerArgs, iproxyArgs, cloneCommand, WDA_REF, wdaHome } from '../../tools/lib/wda-runner.mjs';
import { cliParams } from '../../tools/lib/gesture-run.mjs';
import { REPO } from '../helpers.mjs';

const holder = (o) => ({ resource: 'chrome-measure', owner: 'x', kind: 'lease', token: 'aaaaaaaaaaaa', expiresAt: new Date(Date.now() + 60000).toISOString(), ...o });

test('buildGate: free, stale or short-lane holder -> go; a normal holder blocks unless we run inside its hold', () => {
  assert.equal(buildGate({ holder: null, stale: null }, ''), null);
  assert.equal(buildGate({ holder: holder({ expiresAt: new Date(Date.now() - 1000).toISOString() }), stale: 'expired' }, ''), null);
  assert.equal(buildGate({ holder: holder({ short: true, maxSec: 300 }), stale: null }, ''), null);
  assert.match(buildGate({ holder: holder({ owner: 'fix-a' }), stale: null }, ''), /held by "fix-a" \(a normal hold: someone is measuring\).*--short --max-seconds 300 -- node tools\/iphone\.mjs wda build/);
  assert.equal(buildGate({ holder: holder(), stale: null }, 'chrome-measure:aaaaaaaaaaaa'), null, 'inside our own lock.mjs run hold');
  assert.notEqual(buildGate({ holder: holder(), stale: null }, 'chrome-measure:bbbbbbbbbbbb'), null);
});

test('parseExpiry reads ExpirationDate from a decoded provisioning profile', () => {
  const plist = '<plist><dict><key>CreationDate</key>\n<date>2026-10-01T09:00:00Z</date>\n<key>ExpirationDate</key>\n\t<date>2026-10-08T09:00:00Z</date></dict></plist>';
  assert.equal(parseExpiry(plist), '2026-10-08T09:00:00.000Z');
  assert.equal(parseExpiry('<plist/>'), null);
  assert.equal(parseExpiry(undefined), null);
});

test('xcodebuild / iproxy arguments: sources and DerivedData outside the repo, team and bundle id passed, port 8100', () => {
  const a = buildArgs({ udid: 'U', team: 'T', bundleId: 'fw.wda.t.WebDriverAgentRunner' });
  assert.equal(a.at(-1), 'build-for-testing');
  for (const x of ['-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=T', 'PRODUCT_BUNDLE_IDENTIFIER=fw.wda.t.WebDriverAgentRunner', 'id=U', 'WebDriverAgentRunner']) assert.ok(a.includes(x), x);
  for (const p of a.filter((x) => x.startsWith('/'))) assert.ok(!p.startsWith(REPO), `${p} is outside the repo`);
  assert.ok(!wdaHome().startsWith(REPO));
  assert.deepEqual(runnerArgs({ xctestrun: '/x.xctestrun', udid: 'U' }), ['test-without-building', '-xctestrun', '/x.xctestrun', '-destination', 'id=U']);
  assert.deepEqual(iproxyArgs({ udid: 'U' }), ['8100:8100', '-u', 'U']);
  assert.match(cloneCommand(), new RegExp(`^git clone --depth 1 --branch ${WDA_REF.replace(/\./g, '\\.')} https://github\\.com/appium/WebDriverAgent /`));
  assert.equal(mask('00008130-0011223344556677'), '0000...');
  assert.equal(mask(undefined), '(unset)');
});

test('cliParams: repeatable --param k=v (both spellings) and --variant', () => {
  assert.deepEqual(cliParams(['gesture', 's.json', '--param', 'pushes=4', '--param=x=200', '--variant', 'slow']), { pushes: '4', x: '200', variant: 'slow' });
  assert.deepEqual(cliParams(['--variant=asPerformed']), { variant: 'asPerformed' });
  assert.deepEqual(cliParams(['--param', 'a=b=c']), { a: 'b=c' });
  assert.throws(() => cliParams(['--param', 'nope']), /--param wants k=v/);
});

// tools/lib/wda-runner.mjs and tools/lib/gesture-run.mjs pure helpers: when `wda build` may run (Hard rule 7: only in our own hold),
// the provisioning-profile expiry, the xcodebuild/iproxy arguments (everything outside the repo), id masking,
// and the gesture CLI's --param/--variant parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGate, BUILD_MAX_SEC, parseExpiry, mask, buildArgs, runnerArgs, iproxyArgs, cloneCommand, WDA_REF, wdaHome } from '../../tools/lib/wda-runner.mjs';
import { cliParams } from '../../tools/lib/gesture-run.mjs';
import { REPO } from '../helpers.mjs';

const holder = (o) => ({ resource: 'chrome-measure', owner: 'x', kind: 'lease', token: 'aaaaaaaaaaaa', expiresAt: new Date(Date.now() + 60000).toISOString(), ...o });

test('buildGate: only inside our own chrome-measure hold (review-gesture 1: a free lock or a short holder is not enough)', () => {
  const HOLD = /node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 600 -- node tools\/iphone\.mjs wda build --owner me/;
  const no = (s, held) => { const g = buildGate(s, held, { owner: 'me' }); assert.equal(g.ok, false, JSON.stringify(g)); assert.match(g.reason, HOLD); return g.reason; };
  // free or stale: someone's A/B could be granted the lock mid-build
  assert.match(no({ holder: null, stale: null }, ''), /chrome-measure is free, but this process does not hold it/);
  assert.match(no({ holder: holder({ expiresAt: new Date(Date.now() - 1000).toISOString() }), stale: 'expired' }, 'chrome-measure:aaaaaaaaaaaa'), /is free/);
  // someone else's short-lane job (npm test): their hold ends in <= 300 s and the next A/B starts mid-build
  assert.match(no({ holder: holder({ owner: 'npm-test', short: true, maxSec: 300 }), stale: null }, ''), /held by "npm-test" \(a short-lane job\), not by this process/);
  assert.match(no({ holder: holder({ owner: 'fix-a' }), stale: null }, ''), /held by "fix-a", not by this process/);
  assert.match(no({ holder: holder(), stale: null }, 'chrome-measure:bbbbbbbbbbbb'), /not by this process/);
  // ours (lock.mjs run set FW_LOCK_HELD): go, with xcodebuild capped before the hold ends
  const now = Date.now();
  let g = buildGate({ holder: holder({ expiresAt: undefined }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: BUILD_MAX_SEC * 1000 }, 'a normal hold (no expiry): the normal-hold cap');
  g = buildGate({ holder: holder({ short: true, maxSec: 300, expiresAt: new Date(now + 305000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: 290000 }, 'our short hold: stop 15 s before it expires');
  g = buildGate({ holder: holder({ expiresAt: new Date(now + 40000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now, owner: 'me' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /your chrome-measure hold ends in 40 s: too little for a build/);
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

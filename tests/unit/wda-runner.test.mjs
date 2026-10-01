// tools/lib/wda-runner.mjs and tools/lib/gesture-run.mjs pure helpers: when `wda build` may run (Hard rule 7: only in our own hold),
// the provisioning-profile expiry, the xcodebuild/iproxy arguments (everything outside the repo), id masking,
// and the gesture CLI's --param/--variant parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildGate, BUILD_MAX_SEC, parseExpiry, mask, buildArgs, runnerArgs, iproxyArgs, cloneCommand, WDA_REF, wdaHome, runGroup } from '../../tools/lib/wda-runner.mjs';
import { pidAlive } from '../../tools/lib/lock.mjs';
import { cliParams } from '../../tools/lib/gesture-run.mjs';
import { REPO, tempDir, sleep } from '../helpers.mjs';

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
  const run = (o) => holder({ kind: 'process', pid: process.pid, expiresAt: undefined, acquiredAt: new Date(now).toISOString(), ...o });
  let g = buildGate({ holder: run(), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: BUILD_MAX_SEC * 1000 }, 'a normal hold that declared no length: the normal-hold cap');
  g = buildGate({ holder: run({ meta: { expectSec: 600 } }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: BUILD_MAX_SEC * 1000 }, 'a fresh `run --max-seconds 600`: 540 s (< 600 - 15)');
  // review-gesture-2: the cap is min(540 s, what is left of the declared hold - 15 s): time already spent counts
  g = buildGate({ holder: run({ meta: { expectSec: 600 }, acquiredAt: new Date(now - 300000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: 285000 }, '300 s into a 600 s hold: 300 - 15 s');
  g = buildGate({ holder: run({ meta: { expectSec: 400 } }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now });
  assert.deepEqual(g, { ok: true, timeoutMs: 385000 }, '--max-seconds 400');
  g = buildGate({ holder: run({ meta: { expectSec: 600 }, acquiredAt: new Date(now - 550000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now, owner: 'me' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /your chrome-measure hold ends in 50 s: too little for a build/);
  // a lease's expiry counts the same way
  g = buildGate({ holder: holder({ expiresAt: new Date(now + 40000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now, owner: 'me' });
  assert.match(g.reason, /your chrome-measure hold ends in 40 s: too little for a build/);
  // our own short-lane hold is refused too (lead's policy: the short lane is for bounded jobs <= 300 s)
  g = buildGate({ holder: holder({ short: true, maxSec: 300, expiresAt: new Date(now + 305000).toISOString() }), stale: null }, 'chrome-measure:aaaaaaaaaaaa', { now, owner: 'me' });
  assert.equal(g.ok, false);
  assert.match(g.reason, /your chrome-measure hold is a short-lane job \(max 300 s\).*Run it in a normal hold:\n  node tools\/lock\.mjs run chrome-measure --owner me --max-seconds 600 -- /s);
});

test('runGroup: the timeout stops the child\'s whole process group (SIGKILL after the grace for a member ignoring SIGTERM); a normal exit passes through (review-gesture-2 B2)', async () => {
  const dir = tempDir('fw-rungroup-');
  // a parent that starts a SIGTERM-ignoring helper in its group, like xcodebuild's tools
  const js = `const { spawn } = require('child_process'); const fs = require('fs');
    const h = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1e9)"], { stdio: 'ignore' });
    fs.writeFileSync(${JSON.stringify(join(dir, 'pids'))}, process.pid + ' ' + h.pid); setInterval(() => {}, 1e9);`;
  const t0 = Date.now();
  const r = await runGroup(process.execPath, ['-e', js], { timeoutMs: 800, graceMs: 300 });
  assert.equal(r.timedOut, true);
  assert.equal(r.interrupted, null);
  assert.equal(r.signal, 'SIGTERM');
  assert.ok(Date.now() - t0 < 5000);
  const [parent, helper] = readFileSync(join(dir, 'pids'), 'utf8').split(' ').map(Number);
  const t1 = Date.now();
  while ((pidAlive(parent) || pidAlive(helper)) && Date.now() - t1 < 3000) await sleep(25);
  assert.ok(!pidAlive(parent) && !pidAlive(helper), 'nothing of the group survives');
  // a child that finishes on its own: its status, nothing flagged
  assert.deepEqual(await runGroup(process.execPath, ['-e', 'process.exit(3)'], { timeoutMs: 10000 }), { status: 3, signal: null, timedOut: false, interrupted: null, error: null });
  const bad = await runGroup(join(dir, 'no-such-exe'), [], { timeoutMs: 1000 });
  assert.equal(bad.status, null);
  assert.ok(bad.error && !existsSync(join(dir, 'no-such-exe')));
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
  assert.equal(mask('00008130-0011223344556677'), 'set', 'no prefix of an id either');
  assert.equal(mask(undefined), '(unset)');
});

test('cliParams: repeatable --param k=v (both spellings) and --variant', () => {
  assert.deepEqual(cliParams(['gesture', 's.json', '--param', 'pushes=4', '--param=x=200', '--variant', 'slow']), { pushes: '4', x: '200', variant: 'slow' });
  assert.deepEqual(cliParams(['--variant=asPerformed']), { variant: 'asPerformed' });
  assert.deepEqual(cliParams(['--param', 'a=b=c']), { a: 'b=c' });
  assert.throws(() => cliParams(['--param', 'nope']), /--param wants k=v/);
});

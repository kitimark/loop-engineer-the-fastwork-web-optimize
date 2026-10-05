// tools/ioscap.mjs (incident I-062) without the app, the phone or any device: $FW_IOSCAP_ROOT points the
// recorder's out/ at a temp checkout, $FW_IOSCAP_OPEN at tests/fixtures/fake-ioscap-open.mjs (it acts like the app
// behind `open -n -W`), FW_STATE_DIR at a temp lock dir, and $FW_SWIFTC / $FW_SECURITY / $FW_CODESIGN at fakes
// for `build`. Covers: the iphone lease, the shared-hold refusal, the 600 s cap, output only in out/iphone-screen/,
// the --first-run gate, numbers-only output, and the build's hold and signing choice.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, TESTS } from '../helpers.mjs';

const IOSCAP = tool('ioscap.mjs'), LOCK = tool('lock.mjs');
const FAKE_OPEN = join(TESTS, 'fixtures', 'fake-ioscap-open.mjs');
let env, root, openLog;
beforeEach(() => {
  root = tempDir('fw-ioscap-root-');
  openLog = join(root, 'open.log');
  env = { FW_STATE_DIR: tempDir('fw-ioscap-state-'), FW_IOSCAP_ROOT: root, FW_IOSCAP_OPEN: FAKE_OPEN, FAKE_IOSCAP_LOG: openLog, FW_LOCK_LOAD1: '4.5' };
});
const ioscap = (args, extra = {}) => node(IOSCAP, args, { env: { ...env, ...extra }, timeout: 30000 });
const lock = (...a) => node(LOCK, a, { env });
const fakeApp = () => { const d = join(root, 'out', 'ioscap', 'ioscap.app', 'Contents', 'MacOS'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'ioscap'), ''); };
const opened = () => (existsSync(openLog) ? readFileSync(openLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

test('record refuses without the iphone lease (no --owner, nobody holds it, someone else holds it); nothing is started', () => {
  fakeApp();
  let r = ioscap(['record']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--owner <topic> is required/);
  r = ioscap(['record', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /you \("me"\) don't hold the iphone lease\. Run: node tools\/lock\.mjs run iphone --owner me -- /);
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'someone-else');
  r = ioscap(['record', '--owner', 'me']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /\(holder: "someone-else"\)/);
  assert.deepEqual(opened(), []);
});

test('record refuses inside a --shared (functional) hold, before anything else', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  let r = ioscap(['record', '--owner', 'me'], { FW_LOCK_SHARED: 'chrome-measure:abcdef012345' });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /refusing: ioscap\.mjs record is a timing run, and this process runs inside a shared \(functional\) slot/);
  r = node(LOCK, ['run', 'chrome-measure', '--shared', '--weight', '1', '--max-seconds', '30', '--owner', 'fn', '--', process.execPath, IOSCAP, 'record', '--owner', 'me'], { env, timeout: 60000 });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /refusing: ioscap\.mjs record is a timing run/);
  assert.deepEqual(opened(), []);
});

test('record: --seconds is capped at 600 and must be positive', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  for (const s of ['601', '3600', '0', '-1', 'x']) {
    const r = ioscap(['record', '--owner', 'me', '--seconds', s]);
    assert.equal(r.code, 2, s);
    assert.match(r.stderr, /--seconds must be/);
  }
  assert.deepEqual(opened(), []);
});

test('record: output only directly inside out/iphone-screen/ as .mov', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  for (const o of ['/tmp/x.mov', join(root, 'x.mov'), 'out/iphone-screen/../x.mov', 'out/iphone-screen/sub/x.mov', 'out/iphone-screen/x.mp4', `${process.env.HOME}/Movies/x.mov`]) {
    const r = ioscap(['record', '--owner', 'me', '--seconds', '2', '--out', o]);
    assert.equal(r.code, 2, o);
    assert.match(r.stderr, /--out (must|file name)/, o);
  }
  assert.deepEqual(opened(), []);
});

test('record: refuses when the app is not built', () => {
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  const r = ioscap(['record', '--owner', 'me', '--seconds', '2']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /the recorder app is not built: node tools\/lock\.mjs run chrome-measure --owner me --no-timing --max-seconds 600 -- node tools\/ioscap\.mjs build/);
});

test('record: starts the app through LaunchServices, prints paths and numbers only, writes the summary', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  const r = ioscap(['record', '--owner', 'me', '--seconds', '2', '--label', 'look']);
  assert.equal(r.code, 0, r.out);
  const [a] = opened();
  assert.deepEqual(a.slice(0, 2), ['-n', '-W']);
  assert.equal(a[a.indexOf('--args') - 1], join(root, 'out', 'ioscap', 'ioscap.app'));
  assert.ok(!a.includes('--first-run'));
  const mov = r.stdout.match(/^IOSCAP_MOV=(.+)$/m)[1];
  assert.match(mov, new RegExp(`^${join(root, 'out', 'iphone-screen')}/me-look-\\d+\\.mov$`));
  assert.match(r.stdout, /^IOSCAP_FRAMES=.+\.frames\.json$/m);
  const sum = JSON.parse(readFileSync(r.stdout.match(/^IOSCAP_SUMMARY=(.+)$/m)[1], 'utf8'));
  assert.equal(sum.schema, 'fw-ioscap/1');
  assert.equal(sum.summary.frames, 31);
  assert.equal(sum.summary.distinct, 11);
  assert.equal(sum.result.exit, 0);
  assert.equal(sum.owner, 'me');
  assert.match(r.stdout, /^frames 31 over 0\.5 s \(60 fps delivered\), distinct 11 /m);
  assert.match(r.stdout, /camera permission authorized: recording saved/);
  // everything it wrote is in out/iphone-screen/
  assert.deepEqual(readdirSync(join(root, 'out')).sort(), ['ioscap', 'iphone-screen']);
});

test('record: never asked -> the app ends without opening anything unless --first-run; --first-run passes the flag', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  let r = ioscap(['record', '--owner', 'me', '--seconds', '2'], { FAKE_IOSCAP_TCC: 'notDetermined' });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /never asked/);
  assert.doesNotMatch(r.stdout, /IOSCAP_MOV=/);
  r = ioscap(['record', '--owner', 'me', '--seconds', '2', '--first-run'], { FAKE_IOSCAP_TCC: 'notDetermined' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /FIRST RUN: macOS may now show the Camera prompt for "ioscap"/);
  assert.equal(opened().at(-1).at(-1), '--first-run');
  r = ioscap(['record', '--owner', 'me', '--seconds', '2', '--first-run'], { FAKE_IOSCAP_TCC: 'notDetermined', FAKE_IOSCAP_ANSWER: 'deny' });
  assert.equal(r.code, 3);
  assert.match(r.stdout, /not granted/);
  r = ioscap(['record', '--owner', 'me', '--seconds', '2'], { FAKE_IOSCAP_TCC: 'denied' });
  assert.equal(r.code, 3);
});

test('record: no iPhone screen -> exit 1, no fallback, nothing recorded', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  const r = ioscap(['record', '--owner', 'me', '--seconds', '2'], { FAKE_IOSCAP_DEVICE: 'none' });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /no iPhone screen appeared/);
  assert.doesNotMatch(r.stdout, /IOSCAP_MOV=/);
});

test('record: beside someone else\'s normal chrome-measure hold it waits (phoneGuard, I-056)', () => {
  fakeApp();
  lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'me');
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab-run', '--ttl', '60').code, 0);
  const r = ioscap(['record', '--owner', 'me', '--seconds', '2']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^WAIT: chrome-measure is held by "ab-run"/m);
  assert.deepEqual(opened(), []);
});

// ---- build / selftest: CPU work, only inside a hold; signing type only ---------------------------------------
function fakeBin(name, body) {
  const p = join(root, name);
  writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}
function buildFakes() {
  const calls = join(root, 'calls.log');
  const rec = `require('node:fs').appendFileSync(${JSON.stringify(calls)}, JSON.stringify([require('node:path').basename(process.argv[1]), ...process.argv.slice(2)]) + '\\n');`;
  const swiftc = fakeBin('swiftc.cjs', `${rec}
const a = process.argv.slice(2); const fs = require('node:fs');
if (a[0] === '--version') process.exit(0);
const out = a[a.indexOf('-o') + 1];
fs.writeFileSync(out, a.some((x) => x.endsWith('selftest/main.swift')) ? '#!/bin/sh\\necho "SELFTEST ok 29/29"\\n' : 'app');
fs.chmodSync(out, 0o755);`);
  const security = fakeBin('security.cjs', `${rec}
console.log('  1) ${'C'.repeat(40)} "Apple Development: Test Person (ABCDE12345)"');
console.log('     1 valid identities found');`);
  const codesign = fakeBin('codesign.cjs', `${rec}
if (process.argv.includes('-dvv')) { console.error('Authority=Apple Development: Test Person (ABCDE12345)'); process.exit(0); }
process.exit(process.env.FAKE_CODESIGN_FAIL && process.argv.includes('${'C'.repeat(40)}') ? 1 : 0);`);
  return { calls, swiftc, security, codesign, env: { FW_SWIFTC: swiftc, FW_SECURITY: security, FW_CODESIGN: codesign } };
}
const callsOf = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

test('build and selftest refuse outside a chrome-measure hold (Swift compiles are CPU work)', () => {
  const f = buildFakes();
  let r = ioscap(['build'], f.env);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing: building the app is Swift compile work: it runs only inside your own normal \(--no-timing\) chrome-measure hold:\n {2}node tools\/lock\.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools\/ioscap\.mjs build/);
  r = ioscap(['selftest'], f.env);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /refusing: compiling Swift is CPU work/);
  // a shared slot is fine for the self-test, not for the build
  r = node(LOCK, ['run', 'chrome-measure', '--shared', '--weight', '1', '--max-seconds', '30', '--owner', 'fn', '--', process.execPath, IOSCAP, 'build'], { env: { ...env, ...f.env }, timeout: 60000 });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /refusing: this is a shared hold/);
  assert.deepEqual(callsOf(f.calls), []);
  r = node(LOCK, ['run', 'chrome-measure', '--shared', '--weight', '1', '--max-seconds', '30', '--owner', 'fn', '--', process.execPath, IOSCAP, 'selftest'], { env: { ...env, ...f.env }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /SELFTEST ok/);
  const [sw] = callsOf(f.calls);
  assert.ok(!sw.includes('-framework'), 'the self-test links no framework');
});

test('build in a --no-timing hold: self-test first, app bundle, Apple Development signing (type printed, never the name); ad hoc fallback', () => {
  const f = buildFakes();
  let r = node(LOCK, ['run', 'chrome-measure', '--no-timing', '--max-seconds', '60', '--owner', 'me', '--', process.execPath, IOSCAP, 'build'], { env: { ...env, ...f.env }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /SELFTEST ok/);
  assert.match(r.stdout, /^IOSCAP_BUILT .*\/out\/ioscap\/ioscap\.app$/m);
  assert.match(r.stdout, /^signed: Apple Development \(stable/m);
  assert.doesNotMatch(r.out, /Test Person|ABCDE12345|CCCCCCCC/);
  const app = join(root, 'out', 'ioscap', 'ioscap.app', 'Contents');
  assert.ok(existsSync(join(app, 'MacOS', 'ioscap')));
  assert.match(readFileSync(join(app, 'Info.plist'), 'utf8'), /NSCameraUsageDescription/);
  const calls = callsOf(f.calls);
  assert.deepEqual(calls.map((c) => c[0]), ['swiftc.cjs', 'swiftc.cjs', 'security.cjs', 'codesign.cjs']);
  const sign = calls[3];
  assert.deepEqual(sign.slice(1, 6), ['--force', '--options', 'runtime', '--timestamp=none', '--entitlements']);
  assert.equal(sign[sign.indexOf('-s') + 1], 'C'.repeat(40));
  assert.ok(calls[2].includes('find-identity'));
  // status: the signature type only
  r = ioscap(['status'], f.env);
  assert.match(r.stdout, /^signature: Apple Development$/m);
  assert.doesNotMatch(r.out, /Test Person|ABCDE12345/);
  // codesign with the identity fails (e.g. a keychain prompt): ad hoc, said plainly
  r = node(LOCK, ['run', 'chrome-measure', '--no-timing', '--max-seconds', '60', '--owner', 'me', '--', process.execPath, IOSCAP, 'build'], { env: { ...env, ...f.env, FAKE_CODESIGN_FAIL: '1' }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^signed: ad hoc/m);
  assert.match(r.stdout, /NOTE: signing with the Apple Development identity failed/);
  // --adhoc: no keychain lookup
  r = node(LOCK, ['run', 'chrome-measure', '--no-timing', '--max-seconds', '60', '--owner', 'me', '--', process.execPath, IOSCAP, 'build', '--adhoc'], { env: { ...env, ...f.env }, timeout: 60000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(callsOf(f.calls).at(-1)[callsOf(f.calls).at(-1).indexOf('-s') + 1], '-');
});

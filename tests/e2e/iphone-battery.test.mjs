// I-075: `node tools/iphone.mjs battery` end to end with tests/fixtures/fake-idevicediagnostics.mjs
// ($FW_IDEVICEDIAGNOSTICS) and a temp lock dir ($FW_STATE_DIR): no phone, no proxy, no real lease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, TESTS } from '../helpers.mjs';

const IPHONE = tool('iphone.mjs'), LOCK = tool('lock.mjs');
const FAKE_IDD = join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs');

function setup() {
  const dir = tempDir('fw-iphone-battery-');
  return { dir, env: { FW_STATE_DIR: join(dir, 'state'), FW_IDEVICEDIAGNOSTICS: FAKE_IDD, FAKE_IDD_LOG: join(dir, 'idd.jsonl'), FW_IPHONE_PORT: '9', FW_IPHONE_DEVICE_PORT: '9' } };
}
const calls = (env) => (existsSync(env.FAKE_IDD_LOG) ? readFileSync(env.FAKE_IDD_LOG, 'utf8').trim().split('\n').length : 0);

test('iphone.mjs battery: one read without --seconds; every --every s for --seconds; JSON lines on stdout and appended to --out; no lease, no page', async () => {
  const { dir, env } = setup();
  let r = await nodeAsync(IPHONE, ['battery'], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  const one = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(one.length, 1);
  assert.deepEqual(one[0], { i: 0, t: one[0].t, Temperature: 3050, IsCharging: false, ExternalConnected: true, CurrentCapacity: 80, temperatureC: 30.5 });
  assert.match(r.stderr, /^BATTERY 1 read\(s\), 1 ok, 0 failed$/m);
  assert.ok(!r.out.includes('FAKESERIAL'), 'no battery serial');

  const out = join(dir, 'logs', 'b.jsonl');
  const t0 = Date.now();
  r = await nodeAsync(IPHONE, ['battery', '--every', '1', '--seconds', '2', '--out', out], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  const ms = Date.now() - t0;
  const lines = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.i, l.CurrentCapacity]), [[0, 79], [1, 78], [2, 77]], '3 reads: at 0, 1 and 2 s');
  assert.deepEqual(r.stdout.trim().split('\n').map((l) => JSON.parse(l)), lines, 'the same lines on stdout');
  assert.ok(ms >= 2000, `took ${ms} ms`);
  const dt = Date.parse(lines[2].t) - Date.parse(lines[0].t);
  assert.ok(dt >= 1800 && dt < 4000, `reads 2 s apart in all (${dt} ms)`);
  assert.match(r.stderr, new RegExp(`^BATTERY 3 read\\(s\\), 3 ok, 0 failed; appended to ${out.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'));
  assert.equal(calls(env), 4);
  const st = JSON.parse(node(LOCK, ['status', 'iphone', '--json'], { env }).stdout)[0];
  assert.equal(st.holder, null, 'no lease was taken');

  r = await nodeAsync(IPHONE, ['battery', '--seconds', '1', '--every', '1', '--out', out], { env, timeout: 30000 });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(out, 'utf8').trim().split('\n').length, 5, '--out appends');
});

test('iphone.mjs battery: usage errors exit 2 before any read; no libimobiledevice exits 1 with error lines', async () => {
  const { dir, env } = setup();
  let r = await nodeAsync(IPHONE, ['battery', '--every', '0'], { env, timeout: 30000 });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /--every must be a number of seconds >= 1 \(got 0\)\nusage: node tools\/iphone\.mjs battery/);
  r = await nodeAsync(IPHONE, ['battery', '--seconds', 'x'], { env, timeout: 30000 });
  assert.equal(r.code, 2, r.out);
  assert.equal(calls(env), 0, 'usage errors read no battery');
  r = await nodeAsync(IPHONE, ['battery'], { env: { ...env, FW_IDEVICEDIAGNOSTICS: join(dir, 'missing') }, timeout: 30000 });
  assert.equal(r.code, 1, r.out);
  assert.equal(JSON.parse(r.stdout.trim()).error, 'idevicediagnostics: ENOENT');
  assert.match(r.stderr, /^BATTERY 1 read\(s\), 0 ok, 1 failed$/m);
});

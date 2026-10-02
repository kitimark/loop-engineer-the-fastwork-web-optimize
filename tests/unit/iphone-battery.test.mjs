// I-075: tools/lib/iphone-battery.mjs, the read-only battery logger behind `iphone.mjs battery` (de-heat's work-at-rest
// heat test). Pure parts with a fake read, clock and sleep: no phone, no idevicediagnostics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatteryArgs, batteryLog, BATTERY_LIMITS } from '../../tools/lib/iphone-battery.mjs';

const optOf = (o) => (n, d) => (n in o ? o[n] : d);

test('parseBatteryArgs: defaults (every 30 s, one read), units, and refusals', () => {
  assert.deepEqual(parseBatteryArgs(optOf({})), { everyMs: 30000, seconds: 0, out: null });
  assert.deepEqual(parseBatteryArgs(optOf({ every: '10', seconds: '600', out: 'out/b.jsonl' })), { everyMs: 10000, seconds: 600, out: 'out/b.jsonl' });
  assert.throws(() => parseBatteryArgs(optOf({ every: '0.5' })), /--every must be a number of seconds >= 1 \(got 0\.5\)\nusage: node tools\/iphone\.mjs battery/);
  assert.throws(() => parseBatteryArgs(optOf({ every: undefined })), /--every must be/);
  assert.throws(() => parseBatteryArgs(optOf({ seconds: '-1' })), /--seconds must be a number from 0 to 86400/);
  assert.throws(() => parseBatteryArgs(optOf({ seconds: String(BATTERY_LIMITS.maxSeconds + 1) })), /--seconds must be/);
  assert.throws(() => parseBatteryArgs(optOf({ out: undefined })), /--out needs a file/);
  assert.throws(() => parseBatteryArgs(optOf({ out: '--every' })), /--out needs a file/);
});

test('batteryLog: reads at start + k*every while k*every <= seconds, scheduled from the start (no drift), one JSON line each; failed reads are logged and counted', async () => {
  let t = 1000;
  const sleeps = [], lines = [];
  let k = 0;
  const read = () => { k++; t += 700; return k === 2 ? { error: 'idevicediagnostics exit 1' } : { t: `T${k}`, Temperature: 3700 + k, temperatureC: (3700 + k) / 100 }; }; // each read takes 0.7 s
  const r = await batteryLog({ everyMs: 30000, seconds: 90 }, { read, write: (l) => lines.push(JSON.parse(l)), now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  assert.deepEqual(r, { reads: 4, ok: 3, errors: 1 });
  assert.deepEqual(sleeps, [29300, 29300, 29300], 'the next read is due at start + k*30 s, whatever a read took');
  assert.deepEqual(lines.map((l) => l.i), [0, 1, 2, 3]);
  assert.deepEqual(lines[0], { i: 0, t: 'T1', Temperature: 3701, temperatureC: 37.01 });
  assert.equal(lines[1].error, 'idevicediagnostics exit 1');
  assert.match(lines[1].t, /^\d{4}-\d\d-\d\dT/, 'a failed read still gets a time stamp');

  const one = [];
  assert.deepEqual(await batteryLog({ everyMs: 30000, seconds: 0 }, { read: () => ({ error: 'x' }), write: (l) => one.push(l), sleep: async () => assert.fail('no sleep for one read') }), { reads: 1, ok: 0, errors: 1 });
  assert.equal((await batteryLog({ everyMs: 30000, seconds: 59 }, { read: () => ({}), write: () => {}, sleep: async () => {} })).reads, 2, '59 s at 30 s: reads at 0 and 30');
});

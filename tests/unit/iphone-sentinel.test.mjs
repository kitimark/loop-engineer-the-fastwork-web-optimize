// Incident I-047: `iphone.mjs run` records the heat sentinel's verdict (protocol v2 §5.2, CLAUDE.md "Phone blocks")
// in meta.sentinel {driver, criterion, value, pass}, next to meta.battery, for control runs (--arm C, not --warmup) and
// --heat-sentinel runs; `wait.mjs phone-temp --below auto` reads it back. And the run parks Safari unless --no-park.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish, parseRunArgs, sentinelVerdict, SENTINEL } from '../../tools/lib/iphone-run.mjs';
import { makeRaw } from '../fixtures/run-raw.mjs';
import { tempDir } from '../helpers.mjs';

const ph = (fps, frames = 100) => ({ frames, fps });

test('sentinelVerdict S / W: bottom >= 58 fps and scroll >= 44 fps (W: its sentinel phase is the bottom)', () => {
  assert.deepEqual(SENTINEL, { bottomFps: 58, scrollFps: 44, heldP95Ms: 18 });
  assert.deepEqual(sentinelVerdict('scroll', { phases: { idle: ph(60), scroll: ph(56.2), bottom: ph(59.8) } }),
    { driver: 'S', criterion: 'bottom >= 58 fps and scroll >= 44 fps', value: { bottom: 59.8, scroll: 56.2 }, pass: true });
  assert.equal(sentinelVerdict('scroll', { phases: { scroll: ph(56.2), bottom: ph(57.9) } }).pass, false, 'bottom 57.9 < 58');
  assert.equal(sentinelVerdict('scroll', { phases: { scroll: ph(43.9), bottom: ph(60) } }).pass, false, 'scroll 43.9 < 44');
  assert.equal(sentinelVerdict('scroll', { phases: { scroll: ph(44), bottom: ph(58) } }).pass, true, 'at the limits passes');
  const w = sentinelVerdict('window', { phases: { idle: ph(60), scroll: ph(50), hold: ph(30), sentinel: ph(59) } });
  assert.deepEqual(w, { driver: 'W', criterion: 'bottom >= 58 fps and scroll >= 44 fps (bottom: the sentinel phase)', value: { bottom: 59, scroll: 50 }, pass: true }, 'the hold phase does not count');
  assert.deepEqual(sentinelVerdict('window', { phases: { idle: ph(60), scroll: ph(50), hold: ph(60) } }),
    { driver: 'W', criterion: 'bottom >= 58 fps and scroll >= 44 fps (bottom: the sentinel phase)', value: { bottom: null, scroll: 50 }, pass: null, note: 'no sentinel frames' }, '--sentinel 0: not judged');
  assert.equal(sentinelVerdict('scroll', { phases: { scroll: ph(null, 0), bottom: ph(60) } }).pass, null, 'a phase without frames is not judged');
});

test('sentinelVerdict M: the build\'s held m=1 p95 <= 18 ms; no __fwMorphDrive summary: not judged', () => {
  const dr = (p95) => ({ driver: { atOne: { frames: 120, p50: 16.7, p95, max: 40 } } });
  assert.deepEqual(sentinelVerdict('morph', { phases: {} }, dr(17.9)), { driver: 'M', criterion: 'held m=1 p95 <= 18 ms', value: 17.9, pass: true });
  assert.equal(sentinelVerdict('morph', { phases: {} }, dr(18)).pass, true);
  assert.equal(sentinelVerdict('morph', { phases: {} }, dr(18.1)).pass, false);
  assert.deepEqual(sentinelVerdict('morph', { phases: {} }, null), { driver: 'M', criterion: 'held m=1 p95 <= 18 ms', value: null, pass: null, note: 'no held m=1 frames (driverResult.driver.atOne)' });
});

test('parseRunArgs: a control run (--arm C, not a warm-up) or --heat-sentinel is the sentinel; Safari parks unless --no-park', () => {
  const p = (...a) => parseRunArgs(['--driver', 'scroll', ...a]);
  assert.deepEqual([p().sentinel, p().park], [false, true], 'default: not a sentinel; park after the run');
  assert.equal(p('--arm', 'C').sentinel, true);
  assert.equal(p('--arm', 'C', '--warmup').sentinel, false, 'the uncounted warm-up is not the sentinel');
  assert.equal(p('--arm', 'V').sentinel, false);
  assert.equal(p('--arm', 'V', '--heat-sentinel').sentinel, true);
  assert.equal(p('--warmup', '--heat-sentinel').sentinel, true, 'explicit wins');
  assert.equal(p('--no-park').park, false);
  assert.equal(p('--park').park, true);
  const w = parseRunArgs(['--driver', 'window', '--to', '1800', '--sentinel', '3', '--arm', 'C']);
  assert.deepEqual([w.params.sentinelMs, w.sentinel], [3000, true], 'W\'s --sentinel <s> stays the bottom-hold length');
});

function runFinish(args, raw = makeRaw()) {
  const out = join(tempDir('fw-run-sentinel-'), 'o.json');
  const o = parseRunArgs(['--driver', 'scroll', '--probe', 'std', '--label', 'snt', '--out', out, ...args]);
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { finish(o, 'me', raw, { now: new Date('2026-10-02T12:00:00.000Z') }); } finally { console.log = orig; }
  return { j: JSON.parse(readFileSync(out, 'utf8')), logs };
}

test('finish: meta.sentinel right after meta.battery, one console line with the verdict and the end battery temperature; null for other runs', () => {
  const raw = makeRaw();
  raw.battery = { start: { t: 'a', Temperature: 3710, temperatureC: 37.1 }, end: { t: 'b', Temperature: 3860, temperatureC: 38.6 } };
  const { j, logs } = runFinish(['--arm', 'C', '--block', 'k1'], raw);
  const keys = Object.keys(j.meta);
  assert.equal(keys.indexOf('sentinel'), keys.indexOf('battery') + 1, 'next to meta.battery');
  assert.deepEqual(Object.keys(j.meta.sentinel), ['driver', 'criterion', 'value', 'pass']);
  assert.equal(j.meta.sentinel.driver, 'S');
  assert.equal(typeof j.meta.sentinel.pass, 'boolean');
  const line = logs.filter((l) => l.startsWith('  heat sentinel [S]: '));
  assert.equal(line.length, 1, logs.join('\n'));
  assert.match(line[0], /^ {2}heat sentinel \[S\]: (PASS|FAIL) \{"bottom":[\d.]+,"scroll":[\d.]+\} \(bottom >= 58 fps and scroll >= 44 fps\); battery 38\.6 °C at the end$/);
  for (const args of [['--arm', 'V'], ['--arm', 'C', '--warmup'], []]) {
    const r = runFinish(args);
    assert.equal(r.j.meta.sentinel, null, args.join(' '));
    assert.ok(!r.logs.some((l) => l.includes('heat sentinel')), args.join(' '));
  }
});

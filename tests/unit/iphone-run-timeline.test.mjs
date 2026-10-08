// I-247: `iphone.mjs run --timeline <out.json>` records a WebKit Timeline on the run's own inspector connection with the
// gesture path's recorder (tools/lib/gesture-run.mjs timelineRecorder, I-079), for W window attribution runs (P-166).
// MEASUREMENT CODE. Here: the option, the record's meta.timeline and console line (finish), and the recorder's kind.
// Without --timeline the run record stays byte for byte as pinned (tests/unit/iphone-run-device.test.mjs, unchanged)
// and has no timeline key. End to end (order against the reload, settle, probe and result read; the fake proxy's
// stopwatch): tests/e2e/iphone-run.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish, parseRunArgs, timelineMeta, TOOL_FILES, TIMELINE_TOOL_FILE, USAGE } from '../../tools/lib/iphone-run.mjs';
import { timelineRecorder } from '../../tools/lib/gesture-run.mjs';
import { TIMELINE_START } from '../../tools/lib/wip.mjs';
import { makeRaw } from '../fixtures/run-raw.mjs';
import { tempDir } from '../helpers.mjs';
import { REPO } from '../../tools/lib/paths.mjs';

test('I-247 parseRunArgs --timeline: a file for every driver; no key without it; a missing file is refused', () => {
  for (const drv of [['--driver', 'scroll'], ['--driver', 'window', '--to', '1800'], ['--driver', 'morph']]) {
    assert.ok(!('timeline' in parseRunArgs(drv)), `${drv[1]}: no timeline key without --timeline`);
    assert.equal(parseRunArgs([...drv, '--timeline', 'out/tl.json']).timeline, 'out/tl.json');
    assert.equal(parseRunArgs([...drv, '--timeline=out/x.json']).timeline, 'out/x.json');
  }
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--timeline']), /--timeline wants a file: --timeline <out\.json>/);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--timeline', '--label', 'x']), /--timeline wants a file/);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--timeline=']), /--timeline wants a file/);
  assert.match(USAGE, /\[--timeline <out\.json>\]/);
});

test('I-247 timelineMeta: file (repo-relative), records, the sync pair, stopped, errors (LAN-safe), protocol', () => {
  const t = { seg: 0, file: join(REPO, 'out', 'iphone', 'tl.json'), records: 42, syncT: 500, syncTL: 1.7345, offsetMs: 1234.5, end: { syncT: 900, syncTL: 2.1345, offsetMs: 1234.5 }, epochs: 1, stopped: true, errors: ['Timeline.enable: on http://192.168.1.20:5300/ failed'] };
  const m = timelineMeta(t);
  assert.deepEqual(Object.keys(m), ['file', 'records', 'sync', 'stopped', 'errors', 'protocol']);
  assert.equal(m.file, 'out/iphone/tl.json');
  assert.equal(m.records, 42);
  assert.deepEqual(Object.keys(m.sync), ['syncT', 'syncTL', 'offsetMs', 'end', 'clock']);
  assert.deepEqual([m.sync.syncT, m.sync.syncTL, m.sync.offsetMs, m.sync.end], [500, 1.7345, 1234.5, t.end]);
  assert.match(m.sync.clock, /Timeline ms = page ms \+ offsetMs/);
  assert.match(m.sync.clock, /frames\[\]\.t/);
  assert.equal(m.stopped, true);
  assert.ok(!m.errors[0].includes('192.168.1.20'), 'no LAN address in the record');
  assert.deepEqual(m.protocol, TIMELINE_START);
  assert.equal(timelineMeta({ ...t, file: '/elsewhere/tl.json' }).file, '/elsewhere/tl.json');
});

function runFinish(args, raw) {
  const out = join(tempDir('fw-run-tl-'), 'o.json');
  const o = parseRunArgs([...args, '--probe', 'std', '--label', 'tl', '--out', out]);
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { finish(o, 'me', raw, { now: new Date('2026-10-08T09:00:00.000Z') }); } finally { console.log = orig; }
  return { j: JSON.parse(readFileSync(out, 'utf8')), logs: logs.join('\n').replaceAll(out, '<out>') };
}

test('I-247 finish: raw.timeline -> meta.timeline after the profile fields, gesture-run.mjs in the tool hashes, one console line; none without it', () => {
  const t = { seg: 0, file: join(REPO, 'out', 'iphone', 'me-tl.json'), records: 300, syncT: 812.4, syncTL: 3.5, offsetMs: 2687.6, end: { syncT: 9000, syncTL: 11.6876, offsetMs: 2687.6 }, epochs: 1, stopped: true, errors: [] };
  const raw = makeRaw();
  raw.timeline = timelineMeta(t);
  const { j, logs } = runFinish(['--driver', 'window', '--to', '1800', '--timeline', t.file], raw);
  assert.deepEqual(j.meta.timeline, JSON.parse(JSON.stringify(raw.timeline)));
  assert.deepEqual(Object.keys(j.meta.tool.files), [...TOOL_FILES, TIMELINE_TOOL_FILE]);
  assert.equal(TIMELINE_TOOL_FILE, 'tools/lib/gesture-run.mjs');
  assert.match(j.meta.tool.files[TIMELINE_TOOL_FILE], /^[0-9a-f]{16}$/);
  assert.match(logs, /^ {2}timeline: 300 records, offset 2687\.600 ms -> out\/iphone\/me-tl\.json$/m);
  assert.ok(logs.indexOf('  timeline:') < logs.indexOf('saved <out>'));
  // errors and an unknown offset are said on that line
  const raw2 = makeRaw();
  raw2.timeline = timelineMeta({ ...t, syncTL: null, offsetMs: null, errors: ['no Timeline records'] });
  assert.match(runFinish(['--driver', 'scroll', '--timeline', t.file], raw2).logs, /^ {2}timeline: 300 records, offset UNKNOWN, 1 error \(no Timeline records\) -> out\/iphone\/me-tl\.json$/m);
  // without --timeline: no key, the tool files as before, no line
  const plain = runFinish(['--driver', 'window', '--to', '1800'], makeRaw());
  assert.ok(!('timeline' in plain.j.meta));
  assert.deepEqual(Object.keys(plain.j.meta.tool.files), TOOL_FILES);
  assert.doesNotMatch(plain.logs, /timeline/);
});

test('I-247 timelineRecorder kind / clock: the gesture default is unchanged; run passes its own', async () => {
  const dir = tempDir('fw-run-tl-');
  const g = timelineRecorder({ file: join(dir, 'g.json'), stopWaitMs: 10, drainMs: 0, log: () => {} });
  await g.begin(0);
  await g.finish();
  const gd = JSON.parse(readFileSync(join(dir, 'g.json'), 'utf8'));
  assert.equal(gd.kind, 'gesture-timeline');
  assert.match(gd.clock, /the gesture recorder's clock/);
  const r = timelineRecorder({ file: join(dir, 'r.json'), kind: 'run-timeline', clock: 'C', stopWaitMs: 10, drainMs: 0, log: () => {} });
  await r.begin(0);
  await r.finish();
  const rd = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  assert.deepEqual([rd.kind, rd.clock], ['run-timeline', 'C']);
});

// I-079: `iphone.mjs gesture --timeline <out.json>` records a WebKit Timeline on the run's own inspector connection
// (tools/lib/gesture-run.mjs timelineRecorder, tools/lib/wip.mjs TIMELINE_START / timelineSyncJs / findTimeStamp). Pure
// parts and the recorder against fake connections here; end to end (reloads, the fake proxy's stopwatch) in
// tests/e2e/iphone-gesture.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { timelineRecorder, runProgram } from '../../tools/lib/gesture-run.mjs';
import { TIMELINE_START, timelineSyncJs, findTimeStamp } from '../../tools/lib/wip.mjs';
import { tempDir } from '../helpers.mjs';

const START = TIMELINE_START.map(([m]) => m);

/** A fake inspector connection: page clock `clock.t` (ms), stopwatch = page ms + offsetMs while Page.enable was sent
 *  (0 before, like WebKit's never-started stopwatch); TimeStamp records for performance.mark while recording. */
function fakeConn(clock, { offsetMs = 1000, marks = true, fail = {} } = {}) {
  const ls = [], sent = [];
  let recording = false, enabled = false;
  const sw = (t) => (enabled ? (t + offsetMs) / 1000 : 0);
  const c = {
    closed: null, sent,
    on: (fn) => ls.push(fn),
    emit: (m) => ls.forEach((l) => l(m)),
    async send(method) {
      sent.push(method);
      if (fail[method]) throw { code: -32601, message: `'${method}' was not found` }; // WebKit's error object, not an Error
      if (method === 'Page.enable') enabled = true;
      if (method === 'Timeline.start') recording = true;
      if (method === 'Timeline.stop') { recording = false; setTimeout(() => c.emit({ method: 'Timeline.recordingStopped', params: {} }), 5); }
      return {};
    },
    async evaluate(expr) {
      const m = expr.match(/performance\.mark\("([^"]+)"\)/);
      const t = clock.t;
      if (m && recording && marks) c.emit({ method: 'Timeline.eventRecorded', params: { record: { type: 'EvaluateScript', startTime: sw(t), endTime: sw(t), children: [{ type: 'TimeStamp', startTime: sw(t), data: { message: m[1] } }] } } });
      return t;
    },
    frame() { clock.t += 16; if (recording) c.emit({ method: 'Timeline.eventRecorded', params: { record: { type: 'RenderingFrame', startTime: sw(clock.t), endTime: sw(clock.t + 2), children: [] } } }); },
  };
  return c;
}

test('I-079 wip: TIMELINE_START is F-047\'s sequence; the sync mark returns the mark\'s own startTime; findTimeStamp searches nested records', () => {
  assert.deepEqual(START, ['Page.disable', 'Page.enable', 'Timeline.enable', 'Timeline.setInstruments', 'Timeline.start']);
  assert.deepEqual(TIMELINE_START[3][1], { instruments: ['Timeline'] });
  assert.deepEqual(TIMELINE_START[4][1], { maxCallStackDepth: 1 });
  const marks = [];
  const win = { performance: { now: () => 7.5, mark: (n) => { marks.push(n); return { name: n, startTime: 7.25 }; } } };
  assert.equal(vm.runInNewContext(timelineSyncJs('fwtl-s0-e0'), win), 7.25);
  assert.deepEqual(marks, ['fwtl-s0-e0']);
  // an engine whose performance.mark returns nothing: the performance.now() taken right before it
  assert.equal(vm.runInNewContext(timelineSyncJs('x"y'), { performance: { now: () => 3, mark: () => undefined } }), 3);
  const recs = [{ type: 'RenderingFrame', startTime: 1, children: [{ type: 'EvaluateScript', startTime: 2, children: [{ type: 'TimeStamp', startTime: 2.5, data: { message: 'a' } }] }] }, { type: 'TimeStamp', startTime: 9, data: { message: 'b' } }];
  assert.equal(findTimeStamp(recs, 'a'), 2.5);
  assert.equal(findTimeStamp(recs, 'b'), 9);
  assert.equal(findTimeStamp(recs, 'c'), null);
  assert.equal(findTimeStamp(undefined, 'a'), null);
});

test('I-079 timelineRecorder: one segment -> {syncT, syncTL, recs} at --timeline, offset from the sync mark, end mark, stop', async () => {
  const dir = tempDir('fw-tl-');
  const clock = { t: 500 };
  const a = fakeConn(clock, { offsetMs: 1234.5 });
  const logs = [];
  const tl = timelineRecorder({ file: join(dir, 'tl.json'), stopWaitMs: 500, drainMs: 0, log: (s) => logs.push(s) });
  await tl.onConnection(a); // the first connect: no segment open yet, nothing sent
  assert.deepEqual(a.sent, []);
  await tl.begin(0);
  assert.deepEqual(a.sent, START);
  for (let i = 0; i < 5; i++) a.frame();
  const s = await tl.finish();
  assert.deepEqual(a.sent, [...START, 'Timeline.stop']);
  assert.deepEqual(s, { seg: 0, file: join(dir, 'tl.json'), records: 7, syncT: 500, syncTL: 1.7345, offsetMs: s.offsetMs, end: s.end, epochs: 1, stopped: true, errors: [] });
  assert.ok(Math.abs(s.offsetMs - 1234.5) < 1e-6);
  assert.equal(s.end.syncT, 580);
  assert.ok(Math.abs(s.end.offsetMs - 1234.5) < 1e-6);
  const doc = JSON.parse(readFileSync(join(dir, 'tl.json'), 'utf8'));
  assert.equal(doc.kind, 'gesture-timeline');
  assert.deepEqual([doc.seg, doc.syncT, doc.syncTL, doc.recs.length, doc.stopped], [0, 500, 1.7345, 7, true]);
  assert.deepEqual(doc.protocol, TIMELINE_START.map(([m, p]) => [m, p]));
  assert.ok(!('epochs' in doc));
  // the existing readers' alignment: Timeline ms = page ms + (syncTL * 1000 - syncT)
  const off = doc.syncTL * 1000 - doc.syncT;
  const pageMs = doc.recs.filter((r) => r.type === 'RenderingFrame').map((r) => Math.round(r.startTime * 1000 - off));
  assert.deepEqual(pageMs, [516, 532, 548, 564, 580]);
  assert.equal(await tl.finish(), null, 'no open segment: nothing');
  assert.deepEqual(logs, []);
});

test('I-079 timelineRecorder: a new connection mid-segment (I-038 reconnect) gets the start again as a new epoch; its records stay on their own base in epochs[]', async () => {
  const dir = tempDir('fw-tl-');
  const clock = { t: 100 };
  const a = fakeConn(clock, { offsetMs: 50 }), b = fakeConn(clock, { offsetMs: 9000 });
  const logs = [];
  const tl = timelineRecorder({ file: join(dir, 'run-tl.json'), stopWaitMs: 500, drainMs: 0, log: (s) => logs.push(s) });
  await tl.onConnection(a);
  await tl.begin(2);
  a.frame(); a.frame();
  await tl.onConnection(b); // the proxy gave the run a new connection
  assert.deepEqual(b.sent, START, 'the whole sequence re-sent on the new connection');
  assert.match(logs[0], /timeline: a new inspector connection in segment 2: Timeline start re-sent on it \(epoch 1, a new time base\)/);
  b.frame(); b.frame(); b.frame();
  const s = await tl.finish();
  assert.deepEqual(a.sent, START, 'the old connection is not stopped');
  assert.deepEqual(b.sent, [...START, 'Timeline.stop']);
  assert.equal(s.file, join(dir, 'run-tl-seg2.json'), 'segment i >= 1: <base>-seg<i>.json');
  assert.equal(s.epochs, 2);
  assert.deepEqual(s.errors, []);
  const doc = JSON.parse(readFileSync(s.file, 'utf8'));
  assert.ok(Math.abs(doc.offsetMs - 50) < 1e-6);
  assert.equal(doc.recs.length, 3, 'epoch 0 only: its sync mark and 2 frames');
  assert.equal(doc.epochs.length, 1);
  assert.ok(Math.abs(doc.epochs[0].offsetMs - 9000) < 1e-6);
  assert.equal(doc.epochs[0].recs.length, 5, 'its sync mark, 3 frames, the end mark');
  assert.equal(doc.epochs[0].syncT, 132);
  assert.ok(Math.abs(doc.end.offsetMs - 9000) < 1e-6, 'the end mark is on the last epoch\'s base');
  assert.match(logs[1], /segment 2 has 2 epochs \(reconnects\)/);
});

test('I-079 timelineRecorder: failed commands and a missing sync record are errors, the file is still written', async () => {
  const dir = tempDir('fw-tl-');
  const clock = { t: 0 };
  const a = fakeConn(clock, { marks: false, fail: { 'Timeline.enable': true } });
  const tl = timelineRecorder({ file: join(dir, 'x'), stopWaitMs: 200, drainMs: 0, log: () => {} });
  await tl.onConnection(a);
  await tl.begin(1);
  a.frame();
  const s = await tl.finish();
  assert.equal(s.file, join(dir, 'x-seg1.json'));
  assert.ok(existsSync(s.file));
  assert.deepEqual(s.errors, [
    "Timeline.enable: 'Timeline.enable' was not found",
    'the sync mark\'s TimeStamp record was not recorded: these records can\'t be aligned to the page clock',
    'the end mark\'s TimeStamp record was not recorded',
  ]);
  assert.equal(s.syncTL, null);
  assert.equal(s.offsetMs, null);
  // no connection at all
  const tl2 = timelineRecorder({ file: join(dir, 'y.json'), stopWaitMs: 10, drainMs: 0, log: () => {} });
  await tl2.begin(0);
  assert.deepEqual((await tl2.finish()).errors, ['no inspector connection to record on']);
});

test('I-079 runProgram --timeline: started after the segment\'s installs, stopped before the recorder read; summaries in run.timeline', async () => {
  const dir = tempDir('fw-tl-');
  const clock = { t: 10 };
  const conn = fakeConn(clock);
  const calls = [];
  const origSend = conn.send;
  conn.send = async (m, p) => { calls.push(m); return origSend(m, p); };
  const page = {
    install: async () => { calls.push('recorder install'); },
    state: async () => ({ y: 0, maxY: 1000, ih: 775, pageT: clock.t, vis: 'visible', iw: 430, macBefore: 0, macAfter: 0 }),
    read: async () => { calls.push('recorder read'); return { frames: [], touches: [], marks: [] }; },
    evaluate: async (e) => { calls.push(`evaluate ${e}`); return 'ok'; },
  };
  const tl = timelineRecorder({ file: join(dir, 'p.json'), stopWaitMs: 200, drainMs: 0, log: () => {} });
  await tl.onConnection(conn);
  const inject = { name: 'n', morph: false, install: () => 'INSTALL', read: () => 'READ' };
  const res = await runProgram({ ops: [] }, { wda: {}, page, inject, timeline: tl, log: () => {} });
  assert.deepEqual(calls, ['recorder install', 'evaluate INSTALL', ...START, 'Timeline.stop', 'recorder read', 'evaluate READ']);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.timeline.map((t) => [t.seg, t.file, t.epochs]), [[0, join(dir, 'p.json'), 1]]);
  const plain = await runProgram({ ops: [] }, { wda: {}, page, log: () => {} });
  assert.ok(!('timeline' in plain), 'without --timeline the run record has no timeline key (unchanged)');
});

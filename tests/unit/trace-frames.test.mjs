// tools/lib/trace-frames.mjs (incident I-018): frames > 20 ms from the page's rAF timestamps, mapped onto
// the trace clock through the sync mark, and the renderer main thread's self time in each frame by kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeFrames, selfSegments, kindOf, presentation, ticksOf, LAYER_EVENTS, SYNC_MARK, TRACE_CATEGORIES, TRACE_START, TRACE_BUFFER_KB, BUCKETS, BUCKET_LABELS } from '../../tools/lib/trace-frames.mjs';
import { TRACE_TS, TRACE_EVENTS, TRACE_SYNC, TRACE_WINDOW } from '../fixtures/trace-fixture.mjs';

const WIN = { from: TRACE_WINDOW.t0, to: TRACE_WINDOW.lastOn };
const opts = (o = {}) => ({ frameTs: TRACE_TS, syncStartTime: TRACE_SYNC, window: WIN, ...o });
const parts = (f) => BUCKETS.reduce((s, k) => s + f[k + 'Ms'], 0);

test('each frame > 20 ms gets script / style / layout / paint / other / offMain ms by self time, style elements, top events', () => {
  const r = attributeFrames(TRACE_EVENTS, opts({ dataLossOccurred: false }));
  assert.equal(r.error, undefined);
  const pick = (f) => ({ t: f.t, dur: f.dur, script: f.scriptMs, style: f.styleMs, layout: f.layoutMs, paint: f.paintMs, other: f.otherMs, offMain: f.offMainMs, el: f.styleElements, lo: f.layoutObjects, dom: f.dominant });
  assert.deepEqual(r.frames.map(pick), [
    // FunctionCall 12 ms minus its forced Layout 4 ms; UpdateLayoutTree 6 ms (120 elements); Paint 3 ms; 9 ms without main-thread work
    { t: 1016, dur: 30, script: 8, style: 6, layout: 4, paint: 3, other: 0, offMain: 9, el: 120, lo: 40, dom: 'offMain' },
    // RunTask 20 ms: UpdateLayoutTree 15 ms (900 elements) + a B/E Layout 2 ms, 3 ms of the task itself; 8 ms off the main thread
    { t: 1062, dur: 28, script: 0, style: 15, layout: 2, paint: 0, other: 3, offMain: 8, el: 900, lo: 0, dom: 'style' },
  ]);
  for (const f of r.frames) assert.equal(parts(f), f.dur, 'the parts of a frame sum to its duration');
  assert.deepEqual(r.frames[1].top, [['UpdateLayoutTree', 15], ['RunTask', 3], ['Layout', 2]]);
  // I-032: layer work is a sub-split of paint (Layerize 1 ms inside the 3 ms Paint), Paint event count, 120 Hz ticks,
  // and the presentation states of each frame (frame 1: partial, placed at its BeginFrame; frame 2: dropped)
  assert.deepEqual(r.frames.map((f) => [f.ticks, f.layerMs, f.paintEvents, f.dropped, f.partial]), [[4, 1, 1, 0, 1], [3, 0, 0, 1, 0]]);
  const z = { script: 0, style: 0, layout: 0, paint: 0, other: 0, offMain: 0 };
  const band = (frames, withDropped = 0, withPartial = 0) => ({ frames, withDropped, withPartial });
  assert.deepEqual(r.summary, {
    frames: 2, minMs: 20, scriptMs: 8, styleMs: 21, layoutMs: 6, paintMs: 3, otherMs: 3, offMainMs: 17, layerMs: 1, paintEvents: 1, styleElements: 1020, styleElementsMedian: 510,
    dominant: { ...z, style: 1, offMain: 1 },
    gt34: { frames: 0, dominant: z, ms: z }, gt50: { frames: 0, dominant: z, ms: z },
    windowFrames: 4, window: WIN, mainThreadEvents: 10,
    presentation: {
      dropped: 1, partial: 1, beginFrames: 2, drawFrames: 1, placedAtBegin: 2, byLayerTree: { 1: 2 },
      // the window's four rAF gaps: 30 (k4, partial), 16 (k2), 28 (k3, dropped), 16 (k2)
      byGap: { 'k<=2': band(2), 'k3-4': band(2, 1, 1), 'k5-6': band(0), 'k>=7': band(0) },
      byGapMs: { le20: band(2), '20-34': band(2, 1, 1), '34-50': band(0), gt50: band(0) },
    },
    lastEventCoversLastFrame: true, dataLossOccurred: false, partial: false,
  });
  assert.match(BUCKET_LABELS.offMain, /compositor\/raster\/GPU\/vsync; GPU not separated/);
});

test('window: only the logger window\'s intervals count (the 24 ms before the reset and the 44 ms after COLLECT do not)', () => {
  const all = attributeFrames(TRACE_EVENTS, opts({ window: null }));
  assert.deepEqual(all.frames.map((f) => [f.t, f.dur]), [[992, 24], [1016, 30], [1062, 28], [1106, 44]], 'unclipped: every interval');
  assert.equal(all.summary.windowFrames, 6);
  const r = attributeFrames(TRACE_EVENTS, opts());
  assert.deepEqual(r.frames.map((f) => [f.t, f.dur]), [[1016, 30], [1062, 28]]);
  assert.equal(r.summary.windowFrames, 4);
});

test('per-class counts for frames > 34 and > 50 ms: frames per dominant class and ms per class', () => {
  const ts = [1000, 1040, 1100, 1120]; // frames of 40, 60 and 20 ms
  const ev = [
    { ph: 'I', name: SYNC_MARK, pid: 1, tid: 7, ts: 0 },
    { ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: 1000000, dur: 30000 }, // frame 1000-1040: style 30
    { ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: 1040000, dur: 50000 }, // frame 1040-1100: script 50
    { ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: 1100000, dur: 25000 }, // reaches past the last frame
  ];
  const r = attributeFrames(ev, { frameTs: ts, syncStartTime: 0 });
  const z = { script: 0, style: 0, layout: 0, paint: 0, other: 0, offMain: 0 };
  assert.deepEqual(r.summary.gt34, { frames: 2, dominant: { ...z, style: 1, script: 1 }, ms: { ...z, style: 30, script: 50, offMain: 20 } });
  assert.deepEqual(r.summary.gt50, { frames: 1, dominant: { ...z, script: 1 }, ms: { ...z, script: 50, offMain: 10 } });
});

test('completeness: dataLossOccurred and a trace that ends before the last frame mark the result partial', () => {
  const lost = attributeFrames(TRACE_EVENTS, opts({ dataLossOccurred: true }));
  assert.equal(lost.summary.partial, true);
  assert.deepEqual(lost.summary.partialReasons, ['trace data loss (buffer full)']);
  // the main thread's events stop at 1083 ms (RunTask) but the window's last frame ends at 1106 ms
  const short = attributeFrames(TRACE_EVENTS.filter((e) => !(e.name === 'FunctionCall' && e.ts === 5107000)), opts({ dataLossOccurred: false }));
  assert.equal(short.summary.partial, true);
  assert.equal(short.summary.lastEventCoversLastFrame, false);
  assert.deepEqual(short.summary.partialReasons, ["the main thread's last event ends 23 ms before the last frame"]);
  assert.equal(attributeFrames(TRACE_EVENTS, opts()).summary.partial, false);
});

test('selfSegments: overlapping, non-nested siblings are never counted twice; parts still sum to the frame', () => {
  // A FunctionCall 10-50 ms, a Paint 40-80 ms that overlaps it without nesting, an UpdateLayoutTree 45-48 ms inside both
  const ivs = [
    { name: 'FunctionCall', start: 10000, end: 50000 },
    { name: 'Paint', start: 40000, end: 80000 },
    { name: 'UpdateLayoutTree', start: 45000, end: 48000 },
  ];
  const segs = selfSegments(ivs);
  assert.deepEqual(segs.map((s) => [s.start / 1000, s.end / 1000, s.kind]), [[10, 40, 'script'], [40, 45, 'paint'], [45, 48, 'style'], [48, 80, 'paint']]);
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i].start >= segs[i - 1].end, 'no overlap');
  assert.equal(segs.reduce((s, x) => s + x.end - x.start, 0), 70000, 'exactly the union 10-80 ms');
  // the same through attributeFrames: one 100 ms frame
  const ev = [{ ph: 'I', name: SYNC_MARK, pid: 1, tid: 7, ts: 0 }, ...ivs.map((iv) => ({ ph: 'X', name: iv.name, pid: 1, tid: 7, ts: iv.start, dur: iv.end - iv.start })),
    { ph: 'X', name: 'RunTask', pid: 1, tid: 7, ts: 99000, dur: 2000 }];
  const f = attributeFrames(ev, { frameTs: [0, 100], syncStartTime: 0 }).frames[0];
  assert.deepEqual([f.scriptMs, f.paintMs, f.styleMs, f.otherMs, f.offMainMs], [30, 37, 3, 1, 29]);
  assert.equal(parts(f), 100);
  // properly nested events keep their usual self time
  const nested = selfSegments([{ name: 'RunTask', start: 0, end: 100 }, { name: 'FunctionCall', start: 10, end: 60 }, { name: 'Layout', start: 20, end: 30 }, { name: 'Paint', start: 70, end: 80 }]);
  assert.deepEqual(nested.map((s) => [s.start, s.end, s.kind]), [[0, 10, 'other'], [10, 20, 'script'], [20, 30, 'layout'], [30, 60, 'script'], [60, 70, 'other'], [70, 80, 'paint'], [80, 100, 'other']]);
});

test('the clock comes from the sync mark: a shifted mark moves the windows; missing mark or timestamps are reported', () => {
  // same trace, but the page clock says the mark was 30 ms later: windows move 30 ms earlier in trace time
  const r = attributeFrames(TRACE_EVENTS, { frameTs: TRACE_TS.map((t) => t + 30), syncStartTime: TRACE_SYNC + 30, window: { from: WIN.from + 30, to: WIN.to + 30 } });
  assert.deepEqual(r.frames.map((f) => [f.t, f.scriptMs, f.styleMs]), [[1046, 8, 6], [1092, 0, 15]]);
  assert.match(attributeFrames(TRACE_EVENTS.filter((e) => e.name !== SYNC_MARK), opts()).error, /sync mark __fw_trace_sync not found/);
  assert.match(attributeFrames(TRACE_EVENTS, opts({ frameTs: [1000] })).error, /no rAF timestamps/);
  assert.equal(attributeFrames(TRACE_EVENTS, opts({ minMs: 29 })).summary.frames, 1, 'minMs');
});

test('kinds, categories, Tracing.start params (explicit buffer, recordUntilFull, buffer usage reports)', () => {
  assert.deepEqual(['FunctionCall', 'TimerFire', 'MinorGC', 'v8.compile', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Commit', 'RunTask', 'ComputeIntersections'].map(kindOf),
    ['script', 'script', 'script', 'script', 'style', 'layout', 'paint', 'paint', 'paint', 'other', 'other']);
  assert.ok(TRACE_CATEGORIES.includes('devtools.timeline') && TRACE_CATEGORIES.includes('blink.user_timing'));
  assert.ok(TRACE_CATEGORIES.includes('disabled-by-default-devtools.timeline.frame'), 'I-032: the Frames track category (DroppedFrame)');
  assert.deepEqual(['Layerize', 'UpdateLayer', 'UpdateLayerTree', 'CompositeLayers', 'Commit', 'Paint', 'PrePaint'].map((n) => LAYER_EVENTS.test(n)), [true, true, true, true, true, false, false]);
  assert.deepEqual(TRACE_START, { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: TRACE_BUFFER_KB, includedCategories: TRACE_CATEGORIES }, transferMode: 'ReportEvents', bufferUsageReportingInterval: 1000 });
  assert.ok(TRACE_BUFFER_KB >= 100 * 1024);
});

test('I-032 presentation: DroppedFrame with / without hasPartialUpdate, placed at its BeginFrame (frameSeqId), counted in [a, b)', () => {
  const ev = [
    { ph: 'I', name: 'BeginFrame', ts: 100, args: { frameSeqId: 1, layerTreeId: 5 } },
    { ph: 'I', name: 'DroppedFrame', ts: 260, args: { frameSeqId: 1, hasPartialUpdate: true, layerTreeId: 5 } }, // placed at 100
    { ph: 'I', name: 'DroppedFrame', ts: 150, args: { frameSeqId: 2, hasPartialUpdate: false, layerTreeId: 6 } }, // no BeginFrame: own ts
    { ph: 'I', name: 'DroppedFrame', ts: 210, args: { frameSeqId: 3 } }, // no hasPartialUpdate: dropped
    { ph: 'I', name: 'DroppedFrame', ts: 300, args: { frameSeqId: 4, hasPartialUpdate: false } }, // outside [a, b)
    { ph: 'I', name: 'DrawFrame', ts: 120 }, { ph: 'X', name: 'DroppedFrame', ts: 130, dur: 1, args: { hasPartialUpdate: true } },
    { ph: 'X', name: 'Paint', ts: 140, dur: 5 },
  ];
  const p = presentation(ev, 100, 300);
  assert.deepEqual(p.summary, { dropped: 2, partial: 2, beginFrames: 1, drawFrames: 1, placedAtBegin: 1, byLayerTree: { 5: 1, 6: 1, '?': 2 } });
  assert.deepEqual(p.at, [{ ts: 100, partial: true }, { ts: 130, partial: true }, { ts: 150, partial: false }, { ts: 210, partial: false }]);
  assert.deepEqual(presentation(ev, 0, 50).summary, { dropped: 0, partial: 0, beginFrames: 0, drawFrames: 0, placedAtBegin: 0, byLayerTree: {} });
});

test('I-032 ticks (protocol v2 §3.2): k = round(dt / 8.333); bands cut at 20.8 / 37.5 / 54.2 ms', () => {
  assert.deepEqual([8.3, 16.7, 20.8, 20.9, 33.3, 37.4, 37.5, 54.1, 54.2, 120].map(ticksOf), [1, 2, 2, 3, 4, 4, 5, 6, 7, 14]);
  // a trace with no frame category: presentation is all zeros, the attribution is unchanged
  const plain = TRACE_EVENTS.filter((e) => !['DroppedFrame', 'BeginFrame', 'DrawFrame'].includes(e.name));
  const r = attributeFrames(plain, opts());
  assert.deepEqual([r.summary.presentation.dropped, r.summary.presentation.partial, r.summary.presentation.beginFrames], [0, 0, 0]);
  assert.deepEqual(r.frames.map((f) => [f.dropped, f.partial]), [[0, 0], [0, 0]]);
  assert.equal(r.summary.scriptMs, 8);
});

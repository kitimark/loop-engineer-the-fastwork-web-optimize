// tools/lib/trace-frames.mjs (incident I-018): frames > 20 ms from the page's rAF timestamps, mapped onto
// the trace clock through the sync mark, and the renderer main thread's self time in each frame by kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeFrames, kindOf, SYNC_MARK, TRACE_CATEGORIES } from '../../tools/lib/trace-frames.mjs';
import { TRACE_TS, TRACE_EVENTS } from '../fixtures/trace-fixture.mjs';

test('each frame > 20 ms gets script / style / layout / paint / other / idle ms by self time, style elements, top events', () => {
  const r = attributeFrames(TRACE_EVENTS, { frameTs: TRACE_TS, syncStartTime: 1000 });
  assert.equal(r.error, undefined);
  const pick = (f) => ({ t: f.t, dur: f.dur, script: f.scriptMs, style: f.styleMs, layout: f.layoutMs, paint: f.paintMs, other: f.otherMs, idle: f.idleMs, el: f.styleElements, lo: f.layoutObjects, dom: f.dominant });
  assert.deepEqual(r.frames.map(pick), [
    // FunctionCall 12 ms minus its forced Layout 4 ms; UpdateLayoutTree 6 ms (120 elements); Paint 3 ms; 9 ms without main-thread work
    { t: 1016, dur: 30, script: 8, style: 6, layout: 4, paint: 3, other: 0, idle: 9, el: 120, lo: 40, dom: 'idle' },
    // RunTask 20 ms: UpdateLayoutTree 15 ms (900 elements) + a B/E Layout 2 ms, 3 ms of the task itself; 8 ms idle
    { t: 1062, dur: 28, script: 0, style: 15, layout: 2, paint: 0, other: 3, idle: 8, el: 900, lo: 0, dom: 'style' },
  ]);
  assert.deepEqual(r.frames[1].top, [['UpdateLayoutTree', 15], ['RunTask', 3], ['Layout', 2]]);
  assert.deepEqual(r.summary, { frames: 2, minMs: 20, scriptMs: 8, styleMs: 21, layoutMs: 6, paintMs: 3, otherMs: 3, idleMs: 17, styleElements: 1020, styleElementsMedian: 510, dominant: { script: 0, style: 1, layout: 0, paint: 0, other: 0, idle: 1 }, mainThreadEvents: 7 });
});

test('the clock comes from the sync mark: a shifted mark moves the windows; missing mark or timestamps are reported', () => {
  // same trace, but the page clock says the mark was at 1030 ms: windows move 30 ms earlier in trace time
  const r = attributeFrames(TRACE_EVENTS, { frameTs: TRACE_TS.map((t) => t + 30), syncStartTime: 1030 });
  assert.deepEqual(r.frames.map((f) => [f.t, f.scriptMs, f.styleMs]), [[1046, 8, 6], [1092, 0, 15]]);
  assert.match(attributeFrames(TRACE_EVENTS.filter((e) => e.name !== SYNC_MARK), { frameTs: TRACE_TS, syncStartTime: 1000 }).error, /sync mark __fw_trace_sync not found/);
  assert.match(attributeFrames(TRACE_EVENTS, { frameTs: [1000], syncStartTime: 1000 }).error, /no rAF timestamps/);
  assert.equal(attributeFrames(TRACE_EVENTS, { frameTs: TRACE_TS, syncStartTime: 1000, minMs: 29 }).summary.frames, 1, 'minMs');
});

test('kinds and categories', () => {
  assert.deepEqual(['FunctionCall', 'TimerFire', 'MinorGC', 'v8.compile', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Commit', 'RunTask', 'ComputeIntersections'].map(kindOf),
    ['script', 'script', 'script', 'script', 'style', 'layout', 'paint', 'paint', 'paint', 'other', 'other']);
  assert.ok(TRACE_CATEGORIES.includes('devtools.timeline') && TRACE_CATEGORIES.includes('blink.user_timing'));
});

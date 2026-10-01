// A synthetic --trace-frames recording, shared by tests/fixtures/fake-chrome.mjs (what the fake browser
// answers) and tests/unit/trace-frames.test.mjs (the expected attribution).
// --trace-frames: the page's rAF timestamps (ms) and a synthetic trace. The sync mark is at 5,000,000 µs
// of trace time = page time 1000 ms. Two frames > 20 ms: 1016-1046 (30 ms) and 1062-1090 (28 ms).
export const TRACE_TS = [1000, 1016, 1046, 1062, 1090, 1106];
export const TRACE_EVENTS = [
  { ph: 'M', name: 'thread_name', pid: 1, tid: 7, args: { name: 'CrRendererMain' } },
  { ph: 'I', name: '__fw_trace_sync', cat: 'blink.user_timing', pid: 1, tid: 7, ts: 5000000 },
  // frame 1: a rAF callback with a forced layout inside, a style recalc of 120 elements, a paint
  { ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: 5017000, dur: 12000 },
  { ph: 'X', name: 'Layout', pid: 1, tid: 7, ts: 5020000, dur: 4000, args: { beginData: { dirtyObjects: 40 } } },
  { ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: 5030000, dur: 6000, args: { elementCount: 120 } },
  { ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: 5037000, dur: 3000 },
  // frame 2: a task that recalculates style on 900 elements, then a B/E layout
  { ph: 'X', name: 'RunTask', pid: 1, tid: 7, ts: 5063000, dur: 20000 },
  { ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: 5064000, dur: 15000, args: { elementCount: 900 } },
  { ph: 'B', name: 'Layout', pid: 1, tid: 7, ts: 5080000 },
  { ph: 'E', name: 'Layout', pid: 1, tid: 7, ts: 5082000 },
  // another thread: ignored
  { ph: 'X', name: 'FunctionCall', pid: 1, tid: 8, ts: 5017000, dur: 25000 },
];

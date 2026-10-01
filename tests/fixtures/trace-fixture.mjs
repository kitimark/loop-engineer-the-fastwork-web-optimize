// A synthetic --trace-frames recording, shared by tests/fixtures/fake-chrome.mjs (what the fake browser
// answers) and tests/unit/trace-frames.test.mjs, tests/unit/perf-page.test.mjs (the expected attribution).
// --trace-frames: the page's rAF timestamps (ms) and a synthetic trace. The sync mark is at 4,990,000 µs
// of trace time = page time 990 ms (TRACE_SYNC), so trace µs = page ms * 1000 + 4,000,000.
// The logger's window (TRACE_WINDOW) is RESET at 1000 ms .. the last frame recorded before COLLECT, 1106:
//   992-1016 (24 ms) began before the reset: not a frame of the phase (a TimerFire in it)
//   1016-1046 (30 ms) and 1062-1090 (28 ms): the two frames > 20 ms of the phase
//   1106-1150 (44 ms) ended after COLLECT: not a frame of the phase (a FunctionCall in it, which also
//   shows the trace reaches past the last frame)
export const TRACE_SYNC = 990;
// FAKE_CHROME_TRACE=bigchunk: one dataCollected chunk with more events than a spread push(...chunk) takes
// (~125k arguments, then RangeError)
export const BIG_CHUNK = 200000;
export const TRACE_TS = [992, 1016, 1046, 1062, 1090, 1106, 1150];
export const TRACE_WINDOW = { t0: 1000, lastOn: 1106 };
export const TRACE_EVENTS = [
  { ph: 'M', name: 'thread_name', pid: 1, tid: 7, args: { name: 'CrRendererMain' } },
  { ph: 'I', name: '__fw_trace_sync', cat: 'blink.user_timing', pid: 1, tid: 7, ts: 4990000 },
  // before the window
  { ph: 'X', name: 'TimerFire', pid: 1, tid: 7, ts: 4995000, dur: 10000 },
  // frame 1: a rAF callback with a forced layout inside, a style recalc of 120 elements, a paint
  { ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: 5017000, dur: 12000 },
  { ph: 'X', name: 'Layout', pid: 1, tid: 7, ts: 5020000, dur: 4000, args: { beginData: { dirtyObjects: 40 } } },
  { ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: 5030000, dur: 6000, args: { elementCount: 120 } },
  { ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: 5037000, dur: 3000 },
  { ph: 'X', name: 'Layerize', pid: 1, tid: 7, ts: 5038000, dur: 1000 }, // layer work inside the paint (I-032 layerMs 1 of paintMs 3)
  // frame 2: a task that recalculates style on 900 elements, then a B/E layout
  { ph: 'X', name: 'RunTask', pid: 1, tid: 7, ts: 5063000, dur: 20000 },
  { ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: 5064000, dur: 15000, args: { elementCount: 900 } },
  { ph: 'B', name: 'Layout', pid: 1, tid: 7, ts: 5080000 },
  { ph: 'E', name: 'Layout', pid: 1, tid: 7, ts: 5082000 },
  // after the window
  { ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: 5107000, dur: 30000 },
  // another thread: ignored
  { ph: 'X', name: 'FunctionCall', pid: 1, tid: 8, ts: 5017000, dur: 25000 },
  // I-032 presentation (compositor thread, disabled-by-default-devtools.timeline.frame): frame 11 begins in
  // frame 1 (1016-1046) and is reported partial after it ends (placed at its BeginFrame); frame 12 begins
  // in frame 2 (1062-1090) and is dropped; one DrawFrame; a DroppedFrame before the window is not counted
  { ph: 'I', name: 'DroppedFrame', pid: 1, tid: 9, ts: 4996000, args: { frameSeqId: 10, hasPartialUpdate: false, layerTreeId: 1 } },
  { ph: 'I', name: 'BeginFrame', pid: 1, tid: 9, ts: 5017500, args: { frameSeqId: 11, layerTreeId: 1 } },
  { ph: 'I', name: 'DrawFrame', pid: 1, tid: 9, ts: 5047000, args: { layerTreeId: 1 } },
  { ph: 'I', name: 'DroppedFrame', pid: 1, tid: 9, ts: 5050000, args: { frameSeqId: 11, hasPartialUpdate: true, layerTreeId: 1 } },
  { ph: 'I', name: 'BeginFrame', pid: 1, tid: 9, ts: 5063500, args: { frameSeqId: 12, layerTreeId: 1 } },
  { ph: 'I', name: 'DroppedFrame', pid: 1, tid: 9, ts: 5064000, args: { frameSeqId: 12, hasPartialUpdate: false, layerTreeId: 1 } },
];

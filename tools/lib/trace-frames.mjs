// Per-frame attribution for verify.mjs --trace-frames (incident I-018): LoAF only reports frames >= 50 ms,
// so the ~100 frames of 20-50 ms per scroll were unexplained. With --trace-frames, verify.mjs records a
// devtools.timeline trace over the scroll phase plus the page's own rAF timestamps, and this module assigns
// each frame longer than `minMs` the renderer main thread's time in it by kind:
//   script  EvaluateScript, FunctionCall, TimerFire, FireAnimationFrame, EventDispatch, microtasks, V8/GC
//   style   UpdateLayoutTree (style recalc; `styleElements` sums its elementCount)
//   layout  Layout (`layoutObjects` sums its dirtyObjects)
//   paint   PrePaint, Paint, Layerize, UpdateLayerTree, CompositeLayers, Commit, image decode, ...
//   other   every other main-thread event (RunTask bookkeeping, ParseHTML, ComputeIntersections, HitTest, ...)
//   idle    no main-thread event at all: the frame waited for something else (compositor, GPU, raster, vsync)
// Attribution is by self time: a forced layout inside a FunctionCall counts as layout, the rest of the
// call as script (DevTools' summary does the same).
//
// Clock: the page marks `performance.mark(SYNC_MARK)` when tracing starts; the mark's trace event
// (blink.user_timing, µs of the trace clock) and its startTime (ms, the page clock of the rAF timestamps)
// give the offset. The main thread is the thread that emitted that mark.
//
// Tracing perturbs timing (the timeline categories instrument every task, style recalc and layout):
// frame counts and durations of a traced run are not comparable with untraced runs.

export const SYNC_MARK = '__fw_trace_sync';
export const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute', '__metadata'];

/** Page side: mark the clock sync point and start a rAF timestamp recorder; returns the mark's startTime. */
export const TRACE_ARM = `(() => { const m = performance.mark('${SYNC_MARK}'); const S = window.__fwTrace = { ts: [], on: true };
  const f = (t) => { if (!S.on) return; S.ts.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); return m.startTime; })()`;
/** Page side: stop the recorder, return the rAF timestamps (ms). */
export const TRACE_DISARM = '(() => { const S = window.__fwTrace; S.on = false; return S.ts; })()';

const KINDS = [
  ['script', /^(EvaluateScript|FunctionCall|TimerFire|FireAnimationFrame|FireIdleCallback|EventDispatch|RunMicrotasks|XHRReadyStateChange|XHRLoad|MajorGC|MinorGC|GCEvent|BlinkGC\.|CppGC\.|V8\.|v8\.|ProfileCall|v8$)/],
  ['style', /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)$/],
  ['layout', /^(Layout|UpdateLayout)$/],
  ['paint', /^(PrePaint|Paint|PaintImage|PaintSetup|Layerize|UpdateLayer|UpdateLayerTree|CompositeLayers|Commit|RasterTask|Decode Image|DecodeImage|ImageDecodeTask|Decode LazyPixelRef|ScrollLayer)$/],
];
export function kindOf(name) { for (const [k, re] of KINDS) if (re.test(name)) return k; return 'other'; }
export const BUCKETS = ['script', 'style', 'layout', 'paint', 'other', 'idle'];

/** Complete events (µs) of one thread: 'X' with dur, and B/E pairs matched by nesting. */
function intervals(events, pid, tid) {
  const out = [], open = [];
  for (const e of events) {
    if (e.pid !== pid || e.tid !== tid) continue;
    if (e.ph === 'X' && e.dur > 0) out.push({ name: e.name, start: e.ts, end: e.ts + e.dur, args: e.args || {} });
    else if (e.ph === 'B') open.push(e);
    else if (e.ph === 'E') {
      for (let i = open.length - 1; i >= 0; i--) if (open[i].name === e.name || !e.name) { const b = open.splice(i, 1)[0]; if (e.ts > b.ts) out.push({ name: b.name, start: b.ts, end: e.ts, args: { ...(b.args || {}), ...(e.args || {}) } }); break; }
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Self-time segments [{start, end, kind, name}] of properly nested intervals (children cut out of parents). */
function selfSegments(ivs) {
  const segs = [], stack = [];
  const close = (node) => { let cur = node.start; for (const c of node.kids) { if (c.start > cur) segs.push({ start: cur, end: c.start, kind: node.kind, name: node.name }); cur = Math.max(cur, c.end); } if (node.end > cur) segs.push({ start: cur, end: node.end, kind: node.kind, name: node.name }); };
  for (const iv of ivs) {
    const node = { ...iv, kind: kindOf(iv.name), kids: [] };
    while (stack.length && stack[stack.length - 1].end <= node.start) close(stack.pop());
    if (stack.length) { const p = stack[stack.length - 1]; node.end = Math.min(node.end, p.end); p.kids.push(node); }
    stack.push(node);
  }
  while (stack.length) close(stack.pop());
  return segs.sort((a, b) => a.start - b.start);
}

const r1 = (x) => Math.round(x * 10) / 10;
function median(xs) { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

/**
 * events: trace events; frameTs: rAF timestamps (ms, page clock) in order; syncStartTime: the mark's
 * startTime (ms). Returns {summary, frames: [every frame > minMs, in time order]} or {error}.
 */
export function attributeFrames(events, { frameTs, syncStartTime, minMs = 20 } = {}) {
  const mark = events.find((e) => e.name === SYNC_MARK && (e.ph === 'R' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n' || e.ph === 'b' || e.ph === 'X'));
  if (!mark) return { error: `sync mark ${SYNC_MARK} not found in the trace (${events.length} events)` };
  if (!frameTs || frameTs.length < 2) return { error: 'no rAF timestamps recorded' };
  const off = mark.ts - syncStartTime * 1000; // trace µs = page ms * 1000 + off
  const ivs = intervals(events, mark.pid, mark.tid);
  const segs = selfSegments(ivs);
  const frames = [];
  let si = 0;
  for (let i = 1; i < frameTs.length; i++) {
    const dur = frameTs[i] - frameTs[i - 1];
    if (!(dur > minMs)) continue;
    const a = frameTs[i - 1] * 1000 + off, b = frameTs[i] * 1000 + off;
    const f = { t: r1(frameTs[i - 1]), dur: r1(dur) };
    for (const k of BUCKETS) f[k + 'Ms'] = 0;
    const byName = new Map();
    while (si < segs.length && segs[si].end <= a) si++; // frames are in time order
    let busy = 0;
    for (let j = si; j < segs.length && segs[j].start < b; j++) {
      const s = segs[j], ov = Math.min(s.end, b) - Math.max(s.start, a);
      if (ov <= 0) continue;
      f[s.kind + 'Ms'] += ov / 1000; busy += ov / 1000;
      byName.set(s.name, (byName.get(s.name) || 0) + ov / 1000);
    }
    f.idleMs = Math.max(0, (b - a) / 1000 - busy);
    let el = 0, lo = 0;
    for (const iv of ivs) {
      if (iv.start < a || iv.start >= b) continue;
      if (iv.name === 'UpdateLayoutTree' || iv.name === 'RecalculateStyles') el += Number(iv.args.elementCount ?? iv.args.data?.elementCount ?? iv.args.endData?.elementCount ?? 0) || 0;
      if (iv.name === 'Layout') lo += Number(iv.args.beginData?.dirtyObjects ?? 0) || 0;
    }
    for (const k of BUCKETS) f[k + 'Ms'] = r1(f[k + 'Ms']);
    f.styleElements = el; f.layoutObjects = lo;
    f.dominant = BUCKETS.reduce((m, k) => (f[k + 'Ms'] > f[m + 'Ms'] ? k : m), 'idle');
    f.top = [...byName.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, ms]) => [n, r1(ms)]);
    frames.push(f);
  }
  const sum = (k) => r1(frames.reduce((x, f) => x + f[k], 0));
  const summary = {
    frames: frames.length, minMs,
    ...Object.fromEntries(BUCKETS.map((k) => [k + 'Ms', sum(k + 'Ms')])),
    styleElements: frames.reduce((x, f) => x + f.styleElements, 0),
    styleElementsMedian: median(frames.map((f) => f.styleElements)) ?? 0,
    dominant: Object.fromEntries(BUCKETS.map((k) => [k, frames.filter((f) => f.dominant === k).length])),
    mainThreadEvents: ivs.length,
  };
  return { summary, frames };
}

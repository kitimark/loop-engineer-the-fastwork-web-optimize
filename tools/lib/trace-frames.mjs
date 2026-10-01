// Per-frame attribution for verify.mjs --trace-frames (incident I-018): LoAF only reports frames >= 50 ms,
// so the ~100 frames of 20-50 ms per scroll were unexplained. With --trace-frames, verify.mjs records a
// devtools.timeline trace over the scroll phase plus the page's own rAF timestamps, and this module assigns
// each frame longer than `minMs` the renderer main thread's time in it by kind:
//   script   EvaluateScript, FunctionCall, TimerFire, FireAnimationFrame, EventDispatch, microtasks, V8/GC
//   style    UpdateLayoutTree (style recalc; `styleElements` sums its elementCount)
//   layout   Layout (`layoutObjects` sums its dirtyObjects)
//   paint    PrePaint, Paint, Layerize, UpdateLayerTree, CompositeLayers, Commit, image decode, ...
//   other    every other main-thread event (RunTask bookkeeping, ParseHTML, ComputeIntersections, HitTest, ...)
//   offMain  no main-thread event at all: the frame waited for something off the main thread, i.e. other
//            (compositor / raster / GPU / vsync). GPU is NOT separated: the trace has no GPU-process
//            categories (they would add perturbation and a second process's clock), so offMain is the
//            compositor + raster + GPU + vsync wait together.
// Attribution is by self time: a forced layout inside a FunctionCall counts as layout, the rest of the
// call as script (DevTools' summary does the same). Every instant of a frame goes to exactly one bucket
// (overlapping, non-nested events included: the latest-started event wins), so the six parts of a frame
// sum to its duration.
//
// Window: only frames inside the in-page logger's recording window count, i.e. exactly the intervals of
// the scroll phase's frames[] (lib/perf-page.mjs: an interval that began before RESET's t0 or ended after
// COLLECT is not a frame of the phase), so the traced frames > 20 ms are the phase's gt20 frames.
//
// Clock: the page marks `performance.mark(SYNC_MARK)` when tracing starts; the mark's trace event
// (blink.user_timing, µs of the trace clock) and its startTime (ms, the page clock of the rAF timestamps)
// give the offset. The main thread is the thread that emitted that mark.
//
// Completeness: the trace buffer is TRACE_BUFFER_KB in recordUntilFull mode; when it fills, Chrome drops
// the rest (tracingComplete.dataLossOccurred). A result is `partial` when data loss was reported or the
// main thread's last event ends before the window's last frame does (the trace stopped early).
//
// Tracing perturbs timing (the timeline categories instrument every task, style recalc and layout):
// frame counts and durations of a traced run are not comparable with untraced runs.

export const SYNC_MARK = '__fw_trace_sync';
export const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute', '__metadata'];
export const TRACE_BUFFER_KB = 300 * 1024;
/** Tracing.start params (verify.mjs): the categories, an explicit buffer that stops when full, usage reports every second. */
export const TRACE_START = { traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: TRACE_BUFFER_KB, includedCategories: TRACE_CATEGORIES }, transferMode: 'ReportEvents', bufferUsageReportingInterval: 1000 };

/** Page side: mark the clock sync point and start a rAF timestamp recorder; returns the mark's startTime.
 * The recorder also keeps the last frame it saw while the logger was recording (window.__perf.on). */
export const TRACE_ARM = `(() => { const m = performance.mark('${SYNC_MARK}'); const S = window.__fwTrace = { ts: [], on: true, lastOn: null };
  const f = (t) => { if (!S.on) return; S.ts.push(t); const p = window.__perf; if (p && p.on) S.lastOn = t; requestAnimationFrame(f); }; requestAnimationFrame(f); return m.startTime; })()`;
/** Page side: stop the recorder; return the rAF timestamps (ms) and the logger window (the phase's t0, its last recorded frame). */
export const TRACE_DISARM = '(() => { const S = window.__fwTrace; S.on = false; const p = window.__perf; return { ts: S.ts, t0: p ? p.t0 : null, lastOn: S.lastOn }; })()';

const KINDS = [
  ['script', /^(EvaluateScript|FunctionCall|TimerFire|FireAnimationFrame|FireIdleCallback|EventDispatch|RunMicrotasks|XHRReadyStateChange|XHRLoad|MajorGC|MinorGC|GCEvent|BlinkGC\.|CppGC\.|V8\.|v8\.|ProfileCall|v8$)/],
  ['style', /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)$/],
  ['layout', /^(Layout|UpdateLayout)$/],
  ['paint', /^(PrePaint|Paint|PaintImage|PaintSetup|Layerize|UpdateLayer|UpdateLayerTree|CompositeLayers|Commit|RasterTask|Decode Image|DecodeImage|ImageDecodeTask|Decode LazyPixelRef|ScrollLayer)$/],
];
export function kindOf(name) { for (const [k, re] of KINDS) if (re.test(name)) return k; return 'other'; }
export const BUCKETS = ['script', 'style', 'layout', 'paint', 'other', 'offMain'];
export const BUCKET_LABELS = { script: 'script', style: 'style', layout: 'layout', paint: 'paint', other: 'other main-thread', offMain: 'other (compositor/raster/GPU/vsync; GPU not separated)' };

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

/**
 * Self-time segments [{start, end, kind, name}], non-overlapping, in time order: a sweep over all event
 * boundaries gives each elementary interval to the innermost covering event, the latest-started one
 * (ties: the shorter, then the later in `ivs`). Nested events get their usual self time; where siblings
 * overlap without nesting, each instant still counts once (for the one that started later).
 * `ivs` sorted by start, then longer first (as intervals() returns them).
 */
export function selfSegments(ivs) {
  const pts = [...new Set(ivs.flatMap((iv) => [iv.start, iv.end]))].sort((a, b) => a - b);
  const segs = [];
  let active = [], k = 0;
  for (let p = 0; p + 1 < pts.length; p++) {
    const x = pts[p], y = pts[p + 1];
    while (k < ivs.length && ivs[k].start <= x) active.push(ivs[k++]);
    if (active.some((iv) => iv.end <= x)) active = active.filter((iv) => iv.end > x);
    if (!active.length) continue;
    let o = active[0];
    for (const iv of active) if (iv.start > o.start || (iv.start === o.start && iv.end <= o.end)) o = iv;
    const last = segs[segs.length - 1];
    if (last && last.iv === o && last.end === x) last.end = y;
    else segs.push({ start: x, end: y, kind: kindOf(o.name), name: o.name, iv: o });
  }
  return segs.map(({ iv, ...s }) => s);
}

const r1 = (x) => Math.round(x * 10) / 10;
function median(xs) { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
const zero = () => Object.fromEntries(BUCKETS.map((k) => [k, 0]));
/** The frames longer than `gt` ms: how many, how many per dominant bucket, ms per bucket. */
function classOf(frames, gt) {
  const fs = frames.filter((f) => f.dur > gt), dominant = zero(), ms = zero();
  for (const f of fs) { dominant[f.dominant]++; for (const k of BUCKETS) ms[k] += f[k + 'Ms']; }
  for (const k of BUCKETS) ms[k] = r1(ms[k]);
  return { frames: fs.length, dominant, ms };
}

/**
 * events: trace events; frameTs: rAF timestamps (ms, page clock) in order; syncStartTime: the mark's
 * startTime (ms); window {from, to} (ms, page clock): only intervals with from <= start and end <= to
 * count (the logger's window: RESET's t0, the last frame recorded before COLLECT); null: all of them.
 * dataLossOccurred: as tracingComplete reported it.
 * Returns {summary, frames: [every frame > minMs, in time order]} or {error}.
 */
export function attributeFrames(events, { frameTs, syncStartTime, minMs = 20, window = null, dataLossOccurred = null } = {}) {
  const mark = events.find((e) => e.name === SYNC_MARK && (e.ph === 'R' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n' || e.ph === 'b' || e.ph === 'X'));
  if (!mark) return { error: `sync mark ${SYNC_MARK} not found in the trace (${events.length} events)` };
  if (!frameTs || frameTs.length < 2) return { error: 'no rAF timestamps recorded' };
  const off = mark.ts - syncStartTime * 1000; // trace µs = page ms * 1000 + off
  const ivs = intervals(events, mark.pid, mark.tid);
  const segs = selfSegments(ivs);
  const inWindow = (i) => !window || (frameTs[i - 1] >= window.from && frameTs[i] <= window.to);
  const frames = [];
  let si = 0, ii = 0, windowFrames = 0, lastFrameEnd = null;
  for (let i = 1; i < frameTs.length; i++) {
    if (!inWindow(i)) continue;
    windowFrames++; lastFrameEnd = frameTs[i];
    const dur = frameTs[i] - frameTs[i - 1];
    if (!(dur > minMs)) continue;
    const a = frameTs[i - 1] * 1000 + off, b = frameTs[i] * 1000 + off;
    const f = { t: r1(frameTs[i - 1]), dur: r1(dur) };
    const ms = zero();
    const byName = new Map();
    while (si < segs.length && segs[si].end <= a) si++; // frames are in time order
    let busy = 0;
    for (let j = si; j < segs.length && segs[j].start < b; j++) {
      const s = segs[j], ov = Math.min(s.end, b) - Math.max(s.start, a);
      if (ov <= 0) continue;
      ms[s.kind] += ov / 1000; busy += ov / 1000;
      byName.set(s.name, (byName.get(s.name) || 0) + ov / 1000);
    }
    ms.offMain = Math.max(0, (b - a) / 1000 - busy);
    let el = 0, lo = 0;
    while (ii < ivs.length && ivs[ii].start < a) ii++;
    for (let j = ii; j < ivs.length && ivs[j].start < b; j++) {
      const iv = ivs[j];
      if (iv.name === 'UpdateLayoutTree' || iv.name === 'RecalculateStyles') el += Number(iv.args.elementCount ?? iv.args.data?.elementCount ?? iv.args.endData?.elementCount ?? 0) || 0;
      if (iv.name === 'Layout') lo += Number(iv.args.beginData?.dirtyObjects ?? 0) || 0;
    }
    for (const k of BUCKETS) f[k + 'Ms'] = r1(ms[k]);
    f.styleElements = el; f.layoutObjects = lo;
    f.dominant = BUCKETS.reduce((m, k) => (ms[k] > ms[m] ? k : m), 'offMain');
    f.top = [...byName.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, v]) => [n, r1(v)]);
    frames.push(f);
  }
  const sum = (k) => r1(frames.reduce((x, f) => x + f[k], 0));
  // completeness: the main thread's last event must reach the end of the window's last frame
  const lastMainEnd = ivs.reduce((m, iv) => Math.max(m, iv.end), -Infinity);
  const lastFrameUs = lastFrameEnd == null ? null : lastFrameEnd * 1000 + off;
  const reasons = [];
  if (dataLossOccurred) reasons.push('trace data loss (buffer full)');
  if (lastFrameUs != null && !(lastMainEnd >= lastFrameUs)) reasons.push(`the main thread's last event ends ${ivs.length ? r1((lastFrameUs - lastMainEnd) / 1000) + ' ms' : '(no events)'} before the last frame`);
  const summary = {
    frames: frames.length, minMs,
    ...Object.fromEntries(BUCKETS.map((k) => [k + 'Ms', sum(k + 'Ms')])),
    styleElements: frames.reduce((x, f) => x + f.styleElements, 0),
    styleElementsMedian: median(frames.map((f) => f.styleElements)) ?? 0,
    dominant: classOf(frames, minMs).dominant,
    gt34: classOf(frames, 34), gt50: classOf(frames, 50),
    windowFrames, window, mainThreadEvents: ivs.length,
    lastEventCoversLastFrame: lastFrameUs == null ? null : lastMainEnd >= lastFrameUs,
    dataLossOccurred, partial: reasons.length > 0, ...(reasons.length ? { partialReasons: reasons } : {}),
  };
  return { summary, frames };
}

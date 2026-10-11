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
//
// Render-side signals (incident I-032, protocol v2 T6; research/architecture/devtools-methodology.md G1,
// research/design-engineering/devtools-render-metrics.md §4.1-4.2, rank 3-4):
//   layerMs     the part of `paint` that is layer work: Layerize, UpdateLayer, UpdateLayerTree, CompositeLayers,
//               Commit (LAYER_EVENTS). A SUB-split: paintMs keeps its meaning (all paint + layer self time), so
//               the six buckets still sum to the frame; the bucket definitions are unchanged, but the added Frames
//               category adds tracing load: traced A/Bs compare only within one tool version.
//   presentation  the Frames track's states from `disabled-by-default-devtools.timeline.frame` (DevTools always
//               records it): DroppedFrame events in the logger window, `dropped` without and `partial` with
//               args.hasPartialUpdate (FramesHandler.ts's dropped/partial rule; unlike DevTools, NOT filtered to the
//               main frame's layerTreeId nor to DroppedFrames with a frameSeqId: byLayerTree shows the dropped split
//               per tree; one 6x trace had every frame event on one renderer, tree 1), plus BeginFrame / DrawFrame
//               counts. A DroppedFrame is placed at the BeginFrame with the same args.frameSeqId (the frame it
//               belongs to; else at its own ts). Each attributed frame gets its dropped/partial counts, and
//               `byGap` maps rAF gap bands to presentation (one traced A/A gives "do our gaps match what Chrome
//               calls dropped?"). Never call rAF gaps "dropped frames" (arch-devtools §2a).
// The trace `Paint` event's args.data.clip is NOT used for area: DevTools' own source calls it "unreliable and
// often wrong" (TraceEvents.ts). Paint area comes from CDP LayerTree.layerPainted (lib/paint-rects.mjs,
// verify --paint-rects). The trace's Paint *count* is fine: `paintEvents` per frame and in the summary.

export const SYNC_MARK = '__fw_trace_sync';
export const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8.execute', '__metadata'];
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
/** The layer work inside the paint bucket (I-032 sub-split; paintMs still includes it). */
export const LAYER_EVENTS = /^(Layerize|UpdateLayer|UpdateLayerTree|CompositeLayers|Commit)$/;
/** 120 Hz ticks of a rAF gap (protocol v2 §3.2): k = round(dt / 8.333); on time = k <= 2, ">34" = k >= 5, ">50" = k >= 7. */
export const TICK_MS = 1000 / 120;
export const ticksOf = (dt) => Math.round(dt / TICK_MS);
/** rAF gap bands of presentation.byGap: by ticks (§3.2 midpoints 20.8 / 37.5 / 54.2 ms) ... */
export const GAP_BANDS = [['k<=2', (k) => k <= 2], ['k3-4', (k) => k >= 3 && k <= 4], ['k5-6', (k) => k >= 5 && k <= 6], ['k>=7', (k) => k >= 7]];
/** ... and the legacy ms bands (byGapMs), kept alongside for one wave (§3.2 transition). */
export const GAP_BANDS_MS = [['le20', (d) => d <= 20], ['20-34', (d) => d > 20 && d <= 34], ['34-50', (d) => d > 34 && d <= 50], ['gt50', (d) => d > 50]];
const INSTANT = new Set(['I', 'i', 'n', 'R', 'X', 'b']);

/**
 * Presentation states of the Frames track inside [aUs, bUs) (trace µs): DroppedFrame without / with
 * args.hasPartialUpdate, BeginFrame and DrawFrame counts, DroppedFrame count per args.layerTreeId. Returns
 * {summary, at: [{ts, partial}]} where `at` places each DroppedFrame at its BeginFrame (same frameSeqId) when
 * the trace has one, else at its own ts.
 */
export function presentation(events, aUs, bUs) {
  const begin = new Map();
  let beginFrames = 0, drawFrames = 0;
  for (const e of events) {
    if (!INSTANT.has(e.ph)) continue;
    if (e.name === 'BeginFrame') { const id = e.args?.frameSeqId ?? e.args?.data?.frameSeqId; if (id != null && !begin.has(id)) begin.set(id, e.ts); if (e.ts >= aUs && e.ts < bUs) beginFrames++; }
    else if (e.name === 'DrawFrame' && e.ts >= aUs && e.ts < bUs) drawFrames++;
  }
  const at = [], byLayerTree = {};
  let dropped = 0, partial = 0, placedAtBegin = 0;
  for (const e of events) {
    if (e.name !== 'DroppedFrame' || !INSTANT.has(e.ph)) continue;
    const id = e.args?.frameSeqId ?? e.args?.data?.frameSeqId;
    const ts = id != null && begin.has(id) ? begin.get(id) : e.ts;
    if (!(ts >= aUs && ts < bUs)) continue;
    if (ts !== e.ts) placedAtBegin++;
    const isPartial = (e.args?.hasPartialUpdate ?? e.args?.data?.hasPartialUpdate) === true;
    if (isPartial) partial++; else dropped++;
    const lt = String(e.args?.layerTreeId ?? e.args?.data?.layerTreeId ?? '?');
    byLayerTree[lt] = (byLayerTree[lt] || 0) + 1;
    at.push({ ts, partial: isPartial });
  }
  return { summary: { dropped, partial, beginFrames, drawFrames, placedAtBegin, byLayerTree }, at: at.sort((x, y) => x.ts - y.ts) };
}
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
  // presentation over the window's span (all rAF intervals when there is no window)
  let wFrom = Infinity, wTo = -Infinity;
  for (let i = 1; i < frameTs.length; i++) if (inWindow(i)) { wFrom = Math.min(wFrom, frameTs[i - 1]); wTo = Math.max(wTo, frameTs[i]); }
  const pres = wFrom < wTo ? presentation(events, wFrom * 1000 + off, wTo * 1000 + off) : { summary: null, at: [] };
  const band = (list) => Object.fromEntries(list.map(([k]) => [k, { frames: 0, withDropped: 0, withPartial: 0 }]));
  const byGap = band(GAP_BANDS), byGapMs = band(GAP_BANDS_MS);
  let pi = 0;
  const frames = [];
  let si = 0, ii = 0, windowFrames = 0, lastFrameEnd = null;
  for (let i = 1; i < frameTs.length; i++) {
    if (!inWindow(i)) continue;
    windowFrames++; lastFrameEnd = frameTs[i];
    const dur = frameTs[i] - frameTs[i - 1];
    {
      const a0 = frameTs[i - 1] * 1000 + off, b0 = frameTs[i] * 1000 + off;
      while (pi < pres.at.length && pres.at[pi].ts < a0) pi++;
      let d = 0, p = 0;
      for (let j = pi; j < pres.at.length && pres.at[j].ts < b0; j++) if (pres.at[j].partial) p++; else d++;
      const k = ticksOf(dur);
      for (const [list, out, v] of [[GAP_BANDS, byGap, k], [GAP_BANDS_MS, byGapMs, dur]]) {
        const [name] = list.find(([, test]) => test(v));
        out[name].frames++; if (d) out[name].withDropped++; if (p) out[name].withPartial++;
      }
    }
    if (!(dur > minMs)) continue;
    const a = frameTs[i - 1] * 1000 + off, b = frameTs[i] * 1000 + off;
    const f = { t: r1(frameTs[i - 1]), dur: r1(dur), ticks: ticksOf(dur) };
    const ms = zero();
    const byName = new Map();
    while (si < segs.length && segs[si].end <= a) si++; // frames are in time order
    let busy = 0, layer = 0;
    for (let j = si; j < segs.length && segs[j].start < b; j++) {
      const s = segs[j], ov = Math.min(s.end, b) - Math.max(s.start, a);
      if (ov <= 0) continue;
      ms[s.kind] += ov / 1000; busy += ov / 1000;
      if (s.kind === 'paint' && LAYER_EVENTS.test(s.name)) layer += ov / 1000;
      byName.set(s.name, (byName.get(s.name) || 0) + ov / 1000);
    }
    ms.offMain = Math.max(0, (b - a) / 1000 - busy);
    let el = 0, lo = 0, pe = 0;
    while (ii < ivs.length && ivs[ii].start < a) ii++;
    for (let j = ii; j < ivs.length && ivs[j].start < b; j++) {
      const iv = ivs[j];
      if (iv.name === 'Paint') pe++;
      if (iv.name === 'UpdateLayoutTree' || iv.name === 'RecalculateStyles') el += Number(iv.args.elementCount ?? iv.args.data?.elementCount ?? iv.args.endData?.elementCount ?? 0) || 0;
      if (iv.name === 'Layout') lo += Number(iv.args.beginData?.dirtyObjects ?? 0) || 0;
    }
    for (const k of BUCKETS) f[k + 'Ms'] = r1(ms[k]);
    f.layerMs = r1(layer); f.paintEvents = pe;
    f.styleElements = el; f.layoutObjects = lo;
    const pr = pres.at.filter((x) => x.ts >= a && x.ts < b);
    f.dropped = pr.filter((x) => !x.partial).length; f.partial = pr.filter((x) => x.partial).length;
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
    layerMs: sum('layerMs'), paintEvents: frames.reduce((x, f) => x + f.paintEvents, 0),
    styleElements: frames.reduce((x, f) => x + f.styleElements, 0),
    styleElementsMedian: median(frames.map((f) => f.styleElements)) ?? 0,
    dominant: classOf(frames, minMs).dominant,
    gt34: classOf(frames, 34), gt50: classOf(frames, 50),
    windowFrames, window, mainThreadEvents: ivs.length,
    presentation: pres.summary ? { ...pres.summary, byGap, byGapMs } : null,
    lastEventCoversLastFrame: lastFrameUs == null ? null : lastMainEnd >= lastFrameUs,
    dataLossOccurred, partial: reasons.length > 0, ...(reasons.length ? { partialReasons: reasons } : {}),
  };
  return { summary, frames };
}

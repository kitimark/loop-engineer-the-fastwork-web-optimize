// Rendering cost card (incident I-083; user T-029 #23; design: research/architecture/isolated-measurement/README.md §6).
// Library of tools/costcard.mjs: turns SAVED records (Chrome trace JSON, Simulator/WebKit Timeline files, a probe's
// pre-cut per-event windows, layer censuses) into per-event counts per arm, and writes the card (JSON + plain md).
// Counts only: it judges no ms (ms columns are printed "unjudged"). It drives no browser and takes no lock.
//
// Reference status of what it reads (CLAUDE.md "Platform claims"; checked 2026-10-03 against source):
// - Chrome trace FunctionCall args.data.lineNumber / url: inspector_trace_events.cc inspector_function_call_event::Data
//   writes CaptureSourceLocation(function)->LineNumber(); its base is not settled by that code: P-076 OBSERVED 1-based in
//   our setup. So fire lines are matched as perLoad() of judge-tick.mjs does: both bases tried, both hit = VOID.
// - Chrome trace Paint args.data.clip: CONFIRMED the paint LAYER's contents cull rect in that layer's LOCAL coordinates,
//   not the dirty area, not page coordinates (chromium third_party/blink/renderer/core/paint/paint_layer_painter.cc, the
//   "Paint" TRACE_EVENT_BEGIN: GetContentsCullRect() offset by -PaintOffset; inspector_trace_events.cc
//   inspector_paint_event::Data: CreateQuad(clip), SetGeneratingNodeInfo -> nodeId, layerId 0 "for backward
//   compatibility"). So Chrome paint area is a cull-rect sum (upper bound) and is never intersected with an element rect;
//   element attribution in Chrome uses the paint's generating nodeId (backend node id) against the element's node ids.
// - WebKit Timeline Paint data.clip: CONFIRMED the painted clip rect mapped to absolute and then to ROOT-VIEW coordinates
//   (WebKit Source/WebCore/inspector/agents/page/PageTimelineAgent.cpp didPaint: contentsToRootView(localToAbsoluteQuad
//   (clipRect)); TimelineRecordFactory::createPaintData). The element rect must be given in the same root-view CSS px
//   (getBoundingClientRect at the load's scroll position; that the two agree on iOS with delegated scrolling at y > 0
//   is UNRESOLVED, at y 0 they coincide).
// - Chrome Layout args.beginData.dirtyObjects / totalObjects: CONFIRMED (inspector_layout_event::BeginData,
//   CountObjectsNeedingLayout).
// - Chrome trace "Animation" events (cat devtools.timeline, ph b/e/n): the nestable instant 'n' carries
//   data.compositeFailed (a CompositorAnimations::FailureReason bit mask) and data.unsupportedProperties: CONFIRMED in
//   source (inspector_trace_events.cc inspector_animation_compositor_event::Data; devtools-frontend
//   front_end/models/trace/types/TraceEvents.ts `Animation`, insights/CLSCulprits.ts reads the instant events).
//   OBSERVED on Chrome 154 with verify.mjs's categories (tests/chrome/costcard.chrome.test.mjs, 2026-10-03): a CSS width
//   animation gets compositeFailed 8224 (TargetHasInvalidCompositingState + UnsupportedCSSProperty) and
//   unsupportedProperties [width]; a transform animation gets no compositeFailed instant at all, so a missing reason is
//   never read as "composited". A CSS animation's name is data.displayName (data.name is the Web Animations id, "").
// - CDP LayerTree.Layer has no memory field (pdl/domains/LayerTree.pdl): Chrome memory is an ESTIMATE, drawing layers'
//   width x height (layer px = CSS px x the host DSF, tools/lib/paint-rects.mjs) x 4 bytes; WebKit LayerTree.Layer has
//   `memory` (bytes) (Source/JavaScriptCore/inspector/protocol/LayerTree.json): the Sim census is read, not estimated.

/** CompositorAnimations::FailureReason bits (chromium third_party/blink/renderer/core/animation/compositor_animations.h,
 * main 2026-10-03; bit 11 from older Chromium as mapped by devtools-frontend CLSCulprits.ts). */
export const FAILURE_REASONS = Object.freeze({
  0: 'AcceleratedAnimationsDisabled', 1: 'EffectSuppressedByDevtools', 2: 'InvalidAnimationOrEffect',
  3: 'EffectHasUnsupportedTimingParameters', 4: 'EffectHasNonReplaceCompositeMode', 5: 'TargetHasInvalidCompositingState',
  6: 'TargetHasIncompatibleAnimations', 7: 'TargetHasCSSOffset', 8: 'ObsoleteTargetHasMultipleTransformProperties',
  9: 'AnimationAffectsNonCSSProperties', 10: 'TransformRelatedPropertyCannotBeAcceleratedOnTarget',
  11: 'TransformRelatedPropertyDependsOnBoxSize', 12: 'FilterRelatedPropertyMayMovePixels', 13: 'UnsupportedCSSProperty',
  14: 'ObsoleteMultipleTransformAnimationsOnSameTarget', 15: 'MixedKeyframeValueTypes',
  16: 'TimelineSourceHasInvalidCompositingState', 17: 'AnimationHasNoVisibleChange', 18: 'AffectsImportantProperty',
  19: 'SVGTargetHasIndependentTransformProperty', 20: 'EffectHasNonReplaceIterationCompositeMode', 21: 'UnsupportedInheritance',
});
/** Names of the bits set in a compositeFailed mask (unknown bits as "bit<n>"). */
export function failureReasons(mask) {
  const out = [];
  if (!Number.isFinite(mask) || mask <= 0) return out;
  for (let b = 0; b < 32; b++) if (mask & (2 ** b)) out.push(FAILURE_REASONS[b] || `bit${b}`);
  return out;
}

export const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const round = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

// ---- geometry -------------------------------------------------------------------------------------------------------
/** Bounding box of a quad [x1,y1,...,x4,y4]: {x0,y0,x1,y1}, or null. */
export function quadBox(q) {
  if (!Array.isArray(q) || q.length < 8 || !q.slice(0, 8).every(Number.isFinite)) return null;
  const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
export const quadArea = (q) => { const b = quadBox(q); return b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0; };
/** Area of quad's bbox ∩ rect {x,y,w,h} (same units), 0 when disjoint. */
export function clipRectArea(q, r) {
  const b = quadBox(q);
  if (!b || !r) return 0;
  const w = Math.min(b.x1, r.x + r.w) - Math.max(b.x0, r.x), h = Math.min(b.y1, r.y + r.h) - Math.max(b.y0, r.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// ---- event-aligned windows (ported from research/architecture/isolated-measurement/judge-tick.mjs perLoad(), P-076) ----
/**
 * Cut a load at its element's own events. `times` are the event stamps (any one unit, µs here); T = number of instances
 * of the element; span i = [f_i, f_(i+T)) holds exactly one event of each instance; the partial stretches before the
 * first and after the last event are dropped. VOID rules as perLoad(): no events; a span outside spanUs (when given);
 * fewer than minEvents full spans. Returns {spans: [[a, b], ...]} or {void}.
 */
export function eventSpans(times, { T = 1, spanUs = null, minEvents = 4 } = {}) {
  const f = [...times].sort((a, b) => a - b);
  if (!f.length) return { void: 'no element events found' };
  const spans = [];
  for (let i = 0; i + T < f.length; i++) {
    const a = f[i], b = f[i + T];
    if (spanUs && (b - a < spanUs[0] || b - a > spanUs[1])) return { void: `irregular events (${((b - a) / 1e3).toFixed(0)} ms)` };
    spans.push([a, b]);
  }
  if (spans.length < minEvents) return { void: `${spans.length} full events < ${minEvents}` };
  return { spans };
}
/**
 * The fire-line rule of perLoad(): the trace's line base is not pinned, so the calls at the 1-based line L and at L-1
 * (the 0-based reading) are both collected; exactly one may be non-empty (both = VOID 'ambiguous fire line').
 * `at(line)` returns the stamps of the calls at that line. Returns {times, lineBase: 1|0} or {void}.
 */
export function fireTimes(at, line) {
  const c1 = at(line), c0 = at(line - 1);
  if (c0.length && c1.length) return { void: 'ambiguous fire line' };
  if (!c0.length && !c1.length) return { void: 'no interval fires found' };
  return c1.length ? { times: c1, lineBase: 1 } : { times: c0, lineBase: 0 };
}
/** The load-level VOID rules of perLoad() that don't need the trace (void/hash, FRZ element-runs check, instance count). */
export function loadVoid(load, { T = null } = {}) {
  if (load.void) return String(load.void);
  if (load.hashMismatch) return 'hash mismatch';
  if (load.error) return `error: ${load.error}`;
  if (load.mode === 'freeze') {
    const runs = load.elementRuns ?? load.countdownScreenChanges;
    if (!(runs > 0)) return runs === 0 ? 'element stopped in FRZ' : 'FRZ element-runs check missing';
  }
  if (T != null && load.timers != null && load.timers !== T) return `timers ${load.timers}, expected ${T}`;
  return null;
}

// ---- Chrome trace -------------------------------------------------------------------------------------------------
const FRAMEISH = /^(UpdateLayoutTree|FireAnimationFrame|BeginMainThreadFrame|Paint|TimeStamp|FunctionCall)$/;
/** Split a trace into its renderer main thread (CrRendererMain with the most frame work) and that pid's compositor. */
export function chromeThreads(events) {
  const names = new Map(events.filter((e) => e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args?.name]));
  const score = new Map();
  for (const e of events) if (FRAMEISH.test(e.name)) { const k = `${e.pid}:${e.tid}`; score.set(k, (score.get(k) || 0) + 1); }
  const main = [...score].filter(([k]) => names.get(k) === 'CrRendererMain').sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const pid = main ? main.split(':')[0] : null;
  const comp = new Set([...names].filter(([k, n]) => n === 'Compositor' && k.split(':')[0] === pid).map(([k]) => k));
  const M = events.filter((e) => `${e.pid}:${e.tid}` === main && e.ph !== 'M').sort((a, b) => a.ts - b.ts);
  const C = events.filter((e) => comp.has(`${e.pid}:${e.tid}`)).sort((a, b) => a.ts - b.ts);
  const all = events.filter((e) => e.ph !== 'M' && String(e.pid) === pid);
  return { main, M, X: foldBE(M), C, all };
}
/** Complete events: X with dur; B/E pairs on the main thread are folded into X (same name, nesting by stack). */
export function foldBE(M) {
  const out = [], stack = new Map();
  for (const e of M) {
    if (e.ph === 'B') { const s = stack.get(e.name) || []; s.push(e); stack.set(e.name, s); continue; }
    if (e.ph === 'E') { const b = (stack.get(e.name) || []).pop(); if (b) out.push({ ...b, ph: 'X', dur: e.ts - b.ts, args: { ...(b.args || {}), ...(e.args || {}) } }); continue; }
    out.push(e);
  }
  return out.sort((a, b) => a.ts - b.ts);
}
const dataOf = (e) => e.args?.data || {};
const inLines = (url, lines) => (e) => e.name === 'FunctionCall' && String(dataOf(e).url || '').includes(url) && dataOf(e).lineNumber >= lines[0] - 1 && dataOf(e).lineNumber <= lines[1] + 1;
/** Chrome element events of one load for a row spec ({kind: fire|mark|frame|times, ...}); returns {windows: [{kind,t0,t1}]} or {void}. */
export function chromeEventWindows(th, ev, load, { endTs } = {}) {
  const M = th.M;
  const end = endTs ?? Math.max(...M.map((e) => e.ts + (e.dur || 0)));
  if (ev.kind === 'fire' || ev.kind === 'times') {
    let times, lineBase = null;
    if (ev.kind === 'fire') {
      const at = (ln) => M.filter((e) => e.name === 'FunctionCall' && String(dataOf(e).url || '').includes(ev.url) && dataOf(e).lineNumber === ln).map((e) => e.ts);
      const f = fireTimes(at, ev.line);
      if (f.void) return f;
      times = f.times; lineBase = f.lineBase;
    } else times = (load.eventTimes?.[ev.name] || []).map(Number);
    const T = instancesFor(ev, load);
    const s = eventSpans(times, { T, spanUs: ev.periodMs ? [(ev.periodMs - (ev.toleranceMs ?? 150)) * 1e3, (ev.periodMs + (ev.toleranceMs ?? 150)) * 1e3] : null, minEvents: ev.minEvents ?? 4 });
    if (s.void) return s;
    return { windows: s.spans.map(([t0, t1]) => ({ kind: ev.name, t0, t1 })), lineBase, events: times.length };
  }
  if (ev.kind === 'mark') {
    const prefix = ev.prefix ?? 'fwcc mark ';
    const marks = M.filter((e) => e.name === 'TimeStamp' && String(dataOf(e).message || '').startsWith(prefix)).map((e) => ({ ts: e.ts, k: dataOf(e).message.slice(prefix.length) }));
    if (!marks.length) return { void: `no "${prefix}" marks` };
    const wins = marks.map((m, i) => ({ kind: m.k, t0: m.ts, t1: i + 1 < marks.length ? marks[i + 1].ts : end }));
    return { windows: wins.filter((w) => w.kind !== (ev.endKind ?? 'end')) };
  }
  if (ev.kind === 'frame') {
    const f = M.filter((e) => e.name === 'BeginMainThreadFrame').map((e) => e.ts);
    if (f.length < 2) return { void: 'fewer than 2 main frames' };
    return { windows: [{ kind: ev.name, t0: f[0], t1: f[f.length - 1], perFrame: true }] };
  }
  return { void: `unknown event kind ${ev.kind}` };
}
export function instancesFor(ev, load) {
  const T = ev.instances;
  if (T == null) return 1;
  if (typeof T === 'number') return T;
  const arm = load.arm ?? load.build;
  return T[arm] ?? T['*'] ?? 1;
}
/** Counts of one Chrome window (main thread M, compositor C). opts: code {url, lines}, fileUrl, nodeIds (Set), dpr. */
export function chromeWindowCounts(th, w, { code = null, fileUrl = null, nodeIds = null } = {}) {
  const inW = (e) => e.ts >= w.t0 && e.ts < w.t1;
  const E = th.X.filter(inW), C = th.C.filter(inW);
  const X = (n) => E.filter((e) => e.name === n);
  const ms = (a) => a.reduce((n, e) => n + (e.dur || 0), 0) / 1e3;
  const paints = X('Paint');
  const fc = X('FunctionCall');
  const codeCalls = code ? fc.filter(inLines(code.url, code.lines)) : null;
  const rafs = X('FireAnimationFrame');
  const rafWithCode = code ? rafs.filter((r) => codeCalls.some((c) => c.ts >= r.ts && c.ts < r.ts + (r.dur || 0))).length : null;
  const ePaints = nodeIds ? paints.filter((p) => nodeIds.has(dataOf(p).nodeId)) : null;
  return {
    seconds: (w.t1 - w.t0) / 1e6,
    mainFrames: X('BeginMainThreadFrame').length, rafFires: rafs.length, rafWithCode,
    codeCalls: codeCalls ? codeCalls.length : null,
    fileCalls: fileUrl ? fc.filter((e) => String(dataOf(e).url || '').includes(fileUrl)).length : null,
    functionCalls: fc.length, timerFires: X('TimerFire').length,
    styleRecalcs: X('UpdateLayoutTree').length,
    styleElements: X('UpdateLayoutTree').reduce((n, e) => n + (e.args?.elementCount || dataOf(e).elementCount || 0), 0),
    layouts: X('Layout').length,
    layoutObjects: X('Layout').reduce((n, e) => n + (e.args?.beginData?.dirtyObjects || 0), 0),
    paints: paints.length, pageCullArea: paints.reduce((n, p) => n + quadArea(dataOf(p).clip), 0),
    elementPaints: ePaints ? ePaints.length : null,
    elementCullArea: ePaints ? ePaints.reduce((n, p) => n + quadArea(dataOf(p).clip), 0) : null,
    prePaints: X('PrePaint').length, layerizes: X('Layerize').length,
    io: X('IntersectionObserverController::computeIntersections').length,
    commits: C.filter((e) => /^(Commit|ActivateLayerTree)$/.test(e.name)).length,
    compositorFrames: C.filter((e) => /^(DrawFrame|SubmitCompositorFrame|Graphics\.Pipeline\.DrawAndSwap)$/.test(e.name)).length,
    msUnjudged: { script: round(ms(code ? codeCalls : fc), 2), style: round(ms(X('UpdateLayoutTree')), 2), layout: round(ms(X('Layout')), 2), paint: round(ms(paints), 2) },
  };
}
/** Animation events of a trace: one entry per animation id with its name, node, state and failure reasons. */
export function chromeAnimations(events, { nodeIds = null } = {}) {
  const by = new Map();
  for (const e of events) {
    if (e.name !== 'Animation' || !String(e.cat || '').includes('devtools.timeline')) continue;
    const id = e.id2?.local ?? e.id2?.global ?? e.id ?? dataOf(e).id;
    const a = by.get(id) || { id, phases: [], compositeFailed: 0, unsupportedProperties: [] };
    const d = dataOf(e);
    a.phases.push(e.ph);
    // a CSS animation's name is in displayName; name is the Web Animations id, "" when unset (Chrome 154, OBSERVED)
    for (const k of ['name', 'displayName', 'nodeName', 'nodeId', 'state']) if (d[k] != null && d[k] !== '' && a[k] == null) a[k] = d[k];
    if (Number.isFinite(d.compositeFailed)) { a.compositeFailed |= d.compositeFailed; a.hasCompositeInstant = true; }
    if (Array.isArray(d.unsupportedProperties)) for (const p of d.unsupportedProperties) if (!a.unsupportedProperties.includes(p)) a.unsupportedProperties.push(p);
    by.set(id, a);
  }
  const all = [...by.values()].map((a) => ({ ...a, reasons: failureReasons(a.compositeFailed) }));
  return nodeIds ? all.filter((a) => nodeIds.has(a.nodeId)) : all;
}
/** Chrome layer census: raw CDP LayerTree layers ({layers:[...]}, or an array). Memory ESTIMATE, see header. */
export function chromeLayerCensus(layers, { nodeIds = null, layerScale = null, dpr = 3 } = {}) {
  const L = (nodeIds ? layers.filter((l) => nodeIds.has(l.backendNodeId)) : layers);
  const drawing = L.filter((l) => l.drawsContent);
  const px = drawing.reduce((n, l) => n + (l.width || 0) * (l.height || 0), 0);
  return {
    layers: L.length, drawing: drawing.length, paintCount: L.reduce((n, l) => n + (l.paintCount || 0), 0),
    estBytes: Math.round(px * 4), // as rastered on this host (layer px)
    estBytesAtDpr: layerScale ? Math.round((px / (layerScale * layerScale)) * dpr * dpr * 4) : null, // CSS px x DPR^2 x 4
    attribution: nodeIds ? 'element' : 'page',
  };
}
/** WebKit (Sim) layer census: LayerTree.layersForNode layers (with `memory`), optional compositing reasons by layerId. */
export function simLayerCensus(layers, reasons = null) {
  const anim = reasons ? Object.values(reasons).filter((r) => r && (r.animation || r.transformAnimation || r.opacityAnimation || r.filterAnimation)).length : null;
  return { layers: layers.length, memoryBytes: layers.reduce((n, l) => n + (l.memory || 0), 0), paintCount: layers.reduce((n, l) => n + (l.paintCount || 0), 0), animationReasonLayers: anim, attribution: 'element' };
}

// ---- WebKit Timeline (Simulator) ----------------------------------------------------------------------------------
/** Flatten nested Timeline records into [{type, t (µs), end (µs), data, frame}] (RenderingFrame index for each). */
export function simFlatten(recs) {
  const out = [];
  let frame = -1;
  const walk = (r, inFrame) => {
    if (!r) return;
    let f = inFrame;
    if (r.type === 'RenderingFrame') f = ++frame;
    out.push({ type: r.type, t: (r.startTime ?? 0) * 1e6, end: (r.endTime ?? r.startTime ?? 0) * 1e6, data: r.data || {}, frame: f });
    for (const c of r.children || []) walk(c, f);
  };
  for (const r of recs || []) walk(r, null);
  return out.sort((a, b) => a.t - b.t);
}
export function simEventWindows(flat, ev, load) {
  const end = Math.max(...flat.map((r) => r.end), 0);
  if (ev.kind === 'fire' || ev.kind === 'times') {
    let times, lineBase = null;
    if (ev.kind === 'fire') {
      const at = (ln) => flat.filter((r) => r.type === 'FunctionCall' && String(r.data.scriptName || '').includes(ev.url) && r.data.scriptLine === ln).map((r) => r.t);
      const f = fireTimes(at, ev.line);
      if (f.void) return f;
      times = f.times; lineBase = f.lineBase;
    } else times = (load.eventTimes?.[ev.name] || []).map((s) => Number(s) * (load.eventTimesUnit === 'us' ? 1 : 1e6));
    const s = eventSpans(times, { T: instancesFor(ev, load), spanUs: ev.periodMs ? [(ev.periodMs - (ev.toleranceMs ?? 150)) * 1e3, (ev.periodMs + (ev.toleranceMs ?? 150)) * 1e3] : null, minEvents: ev.minEvents ?? 4 });
    if (s.void) return s;
    return { windows: s.spans.map(([t0, t1]) => ({ kind: ev.name, t0, t1 })), lineBase, events: times.length };
  }
  if (ev.kind === 'mark') {
    const prefix = ev.prefix ?? 'fwcc mark ';
    const marks = flat.filter((r) => r.type === 'TimeStamp' && String(r.data.message || '').startsWith(prefix)).map((r) => ({ ts: r.t, k: r.data.message.slice(prefix.length) }));
    if (!marks.length) return { void: `no "${prefix}" marks` };
    return { windows: marks.map((m, i) => ({ kind: m.k, t0: m.ts, t1: i + 1 < marks.length ? marks[i + 1].ts : end })).filter((w) => w.kind !== (ev.endKind ?? 'end')) };
  }
  if (ev.kind === 'frame') {
    const f = flat.filter((r) => r.type === 'RenderingFrame').map((r) => r.t);
    if (f.length < 2) return { void: 'fewer than 2 rendering frames' };
    return { windows: [{ kind: ev.name, t0: f[0], t1: f[f.length - 1], perFrame: true }] };
  }
  return { void: `unknown event kind ${ev.kind}` };
}
export function simWindowCounts(flat, w, { code = null, rect = null, dpr = 3 } = {}) {
  const E = flat.filter((r) => r.t >= w.t0 && r.t < w.t1);
  const T = (n) => E.filter((r) => r.type === n);
  const fc = T('FunctionCall');
  const codeCalls = code ? fc.filter((r) => String(r.data.scriptName || '').includes(code.url) && r.data.scriptLine >= code.lines[0] - 1 && r.data.scriptLine <= code.lines[1] + 1) : null;
  const paints = T('Paint');
  const ePaints = rect ? paints.filter((p) => clipRectArea(p.data.clip, rect) > 0) : null;
  const frames = T('RenderingFrame');
  const framesWithCode = code ? new Set(codeCalls.filter((r) => r.frame != null).map((r) => r.frame)).size : null;
  const ms = (a) => a.reduce((n, r) => n + Math.max(0, r.end - r.t), 0) / 1e3;
  return {
    seconds: (w.t1 - w.t0) / 1e6,
    renderingFrames: frames.length, rafFires: T('FireAnimationFrame').length, framesWithCode,
    codeCalls: codeCalls ? codeCalls.length : null, functionCalls: fc.length, timerFires: T('TimerFire').length,
    styleRecalcs: T('RecalculateStyles').length, layouts: T('Layout').length,
    paints: paints.length, pageClipArea: paints.reduce((n, p) => n + quadArea(p.data.clip), 0),
    elementPaints: ePaints ? ePaints.length : null,
    elementPaintMpx: rect ? (paints.reduce((n, p) => n + clipRectArea(p.data.clip, rect), 0) * dpr * dpr) / 1e6 : null,
    composites: T('Composite').length,
    msUnjudged: { script: round(ms(code ? codeCalls : fc), 2), style: round(ms(T('RecalculateStyles')), 2), layout: round(ms(T('Layout')), 2), paint: round(ms(paints), 2) },
  };
}

// ---- per event, per load ------------------------------------------------------------------------------------------
/** Per-event value of every metric in one load: median over the event windows (perLoad's metric); per-frame windows
 * (event kind frame, or a mark kind listed in perFrame) are divided by their frame count instead. */
export function perEvent(windowCounts, { perFrame = false } = {}) {
  if (!windowCounts.length) return null;
  const keys = Object.keys(windowCounts[0]).filter((k) => k !== 'msUnjudged' && k !== 'eventDispatch' && k !== 'listenerOps' && k !== 'kind');
  const out = { events: windowCounts.length };
  for (const k of keys) {
    const vals = windowCounts.map((c) => c[k]).filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) { out[k] = null; continue; }
    if (perFrame) { const fr = windowCounts.reduce((n, c) => n + (c.mainFrames ?? c.renderingFrames ?? 0), 0); out[k] = k === 'mainFrames' || k === 'renderingFrames' || k === 'seconds' ? vals.reduce((a, b) => a + b, 0) : (fr ? vals.reduce((a, b) => a + b, 0) / fr : null); }
    else out[k] = median(vals);
  }
  const ms = windowCounts.map((c) => c.msUnjudged).filter(Boolean);
  if (ms.length) out.msUnjudged = Object.fromEntries(Object.keys(ms[0]).map((k) => [k, round(median(ms.map((m) => m[k])), 2)]));
  if (out.seconds && (out.mainFrames != null || out.renderingFrames != null)) {
    const secs = perFrame ? out.seconds : median(windowCounts.map((c) => c.seconds));
    const fr = perFrame ? (out.mainFrames ?? out.renderingFrames) : median(windowCounts.map((c) => c.mainFrames ?? c.renderingFrames));
    out.frameHz = secs > 0 ? round(fr / secs, 1) : null;
    const raf = perFrame ? windowCounts.reduce((n, c) => n + (c.rafFires || 0), 0) : median(windowCounts.map((c) => c.rafFires || 0));
    out.rafHz = secs > 0 ? round(raf / secs, 1) : null;
  }
  return out;
}
/** A probe's pre-cut windows (fix-nav-morph costcard-chrome.mjs: loads[].windows[{kind, ms, mainFrames, ...}]) by kind. */
export function preCutByKind(windows) {
  const by = {};
  for (const w of windows || []) {
    const c = { ...w, seconds: Number.isFinite(w.ms) ? w.ms / 1e3 : undefined };
    if (c.paintArea != null) { c.pageCullArea = c.paintArea; delete c.paintArea; }
    if (c.functionCallsNode2 != null) { c.fileCalls = c.functionCallsNode2; delete c.functionCallsNode2; }
    if (Array.isArray(c.listenerOps)) c.listenerOpsN = c.listenerOps.length;
    delete c.ms;
    (by[w.kind] ||= []).push(c);
  }
  return by;
}

// ---- arms, A/A, card ----------------------------------------------------------------------------------------------
/** Median over loads plus [min, max] and n. */
export function acrossLoads(vals) {
  const v = vals.filter((x) => x != null && Number.isFinite(x));
  return v.length ? { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : { median: null, n: 0 };
}
/** tol = max(2·|C − C2|, 2 counts); low-power when tol > |C|/2 (fix-nav-morph's F3 rule, README §6 / §4.3). */
export function aaTolerance(c, c2, { floor = 2 } = {}) {
  if (c == null || c2 == null || !Number.isFinite(c) || !Number.isFinite(c2)) return { tol: floor, aa: null, source: 'none' };
  const aa = Math.abs(c - c2);
  const tol = Math.max(2 * aa, floor);
  return { tol, aa, source: 'aa', lowPower: tol > Math.abs(c) / 2 };
}

/** Metric catalogue: card field, plain label, attribution. `frame`: frame-driven (FULL page only, §6.2). */
export const METRICS = Object.freeze({
  rafWithCode: { field: 1, label: 'rAF callbacks running the element code', unit: '' },
  framesWithCode: { field: 1, label: 'rendering frames running the element code', unit: '' },
  elementPaints: { field: 3, label: 'paints of the element', element: true },
  elementCullArea: { field: 3, label: 'element paint cull-rect area (layer px², upper bound)', element: true, area: true },
  elementPaintMpx: { field: 3, label: 'repaint area on the element (device Mpx)', element: true, mpx: true },
  paints: { field: 3, label: 'paints' },
  pageCullArea: { field: 3, label: 'paint cull-rect area, whole page (layer px², upper bound, not element-attributed)', area: true, pageOnly: true },
  pageClipArea: { field: 3, label: 'paint clip area, whole page (CSS px², not element-attributed)', area: true, pageOnly: true },
  layouts: { field: 4, label: 'layouts' },
  layoutObjects: { field: 4, label: 'objects needing layout (dirtyObjects)' },
  codeCalls: { field: 5, label: 'element code FunctionCalls', element: true },
  fileCalls: { field: 5, label: 'FunctionCalls in the element file (whole file)' },
  functionCalls: { field: 5, label: 'FunctionCalls (all scripts)' },
  styleElements: { field: 5, label: 'style elements recalculated' },
  styleRecalcs: { field: 5, label: 'style recalcs' },
  timerFires: { field: 5, label: 'timer fires' },
  listenerOpsN: { field: 5, label: 'touch/wheel listener adds+removes' },
  mainFrames: { field: 0, label: 'main frames', frame: true },
  renderingFrames: { field: 0, label: 'rendering frames', frame: true },
  rafFires: { field: 0, label: 'rAF callbacks', frame: true },
  frameHz: { field: 0, label: 'frame rate Hz', frame: true },
  rafHz: { field: 0, label: 'rAF rate Hz', frame: true },
  events: { field: null, label: 'element events per load' },
  seconds: { field: null, label: 'seconds per event' },
  prePaints: { field: 0, label: 'PrePaint', frame: true },
  layerizes: { field: 0, label: 'Layerize', frame: true },
  commits: { field: 0, label: 'commits', frame: true },
  compositorFrames: { field: 0, label: 'compositor frames', frame: true },
  composites: { field: 0, label: 'Composite', frame: true },
  io: { field: 0, label: 'IntersectionObserver passes', frame: true },
});
export const FIELD_NAMES = { 0: 'the page around it (FULL page only, never the element alone, H9)', 1: '1 thread', 2: '2 layers and memory', 3: '3 repaint area × rate', 4: '4 layout', 5: '5 script' };

/**
 * Field 1 reading for one arm. chromeAnims: chromeAnimations() of the arm's traces (element-filtered when node ids were
 * given); perEv: the arm's per-event metrics (codeCalls, rafWithCode/framesWithCode, frames); census reasons for the Sim.
 */
export function threadReading({ anims = null, animsAttributed = false, codeCalls = null, codePerFrame = null, framesPerEvent = null, simAnimationLayers = null }) {
  const parts = [];
  let status = 'UNRESOLVED';
  if (codePerFrame != null && framesPerEvent > 0 && codePerFrame / framesPerEvent >= 0.5) { parts.push(`main thread every frame (element code in ${round(codePerFrame, 1)} of ${round(framesPerEvent, 1)} frames per event)`); status = 'OBSERVED'; }
  else if (codeCalls != null && codeCalls > 0) { parts.push(`main thread per event (${round(codeCalls, 1)} element code calls per event)`); status = 'OBSERVED'; }
  else if (codeCalls === 0) parts.push('no element script per event');
  if (anims) {
    const failed = anims.filter((a) => a.compositeFailed > 0);
    const where = animsAttributed ? 'element' : 'page (not element-attributed)';
    if (failed.length) parts.push(`${failed.length} of ${anims.length} ${where} animations not composited: ${[...new Set(failed.flatMap((a) => a.reasons))].join(', ')}${failed.some((a) => a.unsupportedProperties.length) ? ` (properties ${[...new Set(failed.flatMap((a) => a.unsupportedProperties))].join(', ')})` : ''}`);
    else if (anims.length) parts.push(`${anims.length} ${where} animations, no failure reason in the trace (composited? not proven: a composited animation gets no event at all)`);
  }
  if (simAnimationLayers != null) parts.push(`Sim: ${simAnimationLayers} layer(s) with an animation compositing reason`);
  if (!parts.length) parts.push('no thread evidence in these records');
  return { text: parts.join('; '), status };
}

// ---- P-076 tick records (research/architecture/isolated-measurement/tick-probe.mjs: fires0, fires1, cd per load) -------
/** perLoad() of judge-tick.mjs on a tick record: per-event code calls; same VOID rules, generalised (T from the row). */
export function tickRecordPerEvent(r, ev) {
  const T = instancesFor(ev, r);
  const v = loadVoid(r, { T: ev.instances == null ? null : T });
  if (v) return { void: v };
  if (!Array.isArray(r.fires0) || !Array.isArray(r.fires1) || !Array.isArray(r.cd)) return { void: 'record lacks fires0/fires1/cd' };
  // tick-probe stores the calls at the callback's 0-based line (fires0) and at the next line (fires1): one must be empty
  if (r.fires0.length && r.fires1.length) return { void: 'ambiguous fire line' };
  const p = ev.periodMs ?? 1000, tl = ev.toleranceMs ?? 150;
  const s = eventSpans(r.fires0.length ? r.fires0 : r.fires1, { T, spanUs: [(p - tl) * 1e3, (p + tl) * 1e3], minEvents: ev.minEvents ?? 4 });
  if (s.void) return s.void === 'no element events found' ? { void: 'no interval fires found' } : s;
  const per = s.spans.map(([a, b]) => r.cd.filter((t) => t >= a && t < b).length);
  return { perEvent: { events: per.length, codeCalls: median(per) }, eventValues: per, lineBase: r.fires0.length ? 0 : 1 };
}

// ---- assembling the card --------------------------------------------------------------------------------------------
export const armOf = (l) => l.arm ?? l.build ?? '?';
export const engineOf = (l) => l.engine ?? (l.timelineRecs || l.timeline ? 'sim' : 'chrome');
export const modeOf = (l) => (l.mode === 'freeze' || l.mode === 'frz' ? 'freeze' : 'full');
const nodeSet = (load, keys) => {
  if (!keys || !load.nodeIds) return null;
  const ids = (Array.isArray(keys) ? keys : [keys]).flatMap((k) => load.nodeIds[k] || []);
  return ids.length ? new Set(ids) : null;
};
const spanOpts = (ev) => (ev.periodMs ? [(ev.periodMs - (ev.toleranceMs ?? 150)) * 1e3, (ev.periodMs + (ev.toleranceMs ?? 150)) * 1e3] : null);

/**
 * One load x one row spec -> {kinds: {<kind>: perEvent()}, lineBase?, anims?} or {void}. Sources, first present wins:
 * tick fields (fires0/fires1/cd), pre-cut `windows`, `traceEvents` (Chrome raw), `timelineRecs` (Sim raw).
 */
export function loadRowValues(load, row, { dpr = 3 } = {}) {
  const ev = { name: row.event.name ?? row.event.kind, ...row.event };
  if (Array.isArray(load.fires0) && Array.isArray(load.fires1) && Array.isArray(load.cd)) {
    if (ev.kind !== 'fire') return { void: 'a tick record (fires0/fires1/cd) needs a fire event row' };
    const r = tickRecordPerEvent(load, ev);
    return r.void ? r : { kinds: { [ev.name]: r.perEvent }, lineBase: r.lineBase, eventValues: r.eventValues };
  }
  const v = loadVoid(load, { T: ev.instances == null ? null : instancesFor(ev, load) });
  if (v) return { void: v };
  const perFrameKinds = new Set(ev.perFrame || []);
  const group = (wins, countFn) => {
    const by = {};
    for (const w of wins) (by[w.kind] ||= []).push({ ...countFn(w), perFrame: !!w.perFrame });
    const kinds = {};
    for (const [k, cs] of Object.entries(by)) {
      const frameOnly = cs.some((c) => c.perFrame);
      if (!frameOnly) kinds[k] = perEvent(cs.map(({ perFrame, ...c }) => c));
      if (frameOnly || perFrameKinds.has(k)) kinds[`${k}-frame`] = perEvent(cs.map(({ perFrame, ...c }) => c), { perFrame: true });
    }
    return kinds;
  };
  if (load.windows) { // pre-cut by the probe (fix-nav-morph costcard-chrome.mjs)
    const by = preCutByKind(load.windows);
    const kinds = {};
    for (const [k, cs] of Object.entries(by)) {
      if (k === (ev.endKind ?? 'end')) continue;
      kinds[k] = perEvent(cs);
      if (perFrameKinds.has(k)) kinds[`${k}-frame`] = perEvent(cs, { perFrame: true });
    }
    // a probe may carry the trace's Animation reads as load.anims [{name, nodeName, compositeFailed, unsupportedProperties}]
    const anims = Array.isArray(load.anims) ? load.anims.map((a) => ({ ...a, compositeFailed: a.compositeFailed || 0, reasons: failureReasons(a.compositeFailed || 0), unsupportedProperties: a.unsupportedProperties || [] })) : null;
    return { kinds, preCut: true, ...(anims ? { anims, animsAttributed: !!load.animsAttributed } : {}) };
  }
  const nodeIds = nodeSet(load, row.nodes ?? row.census);
  if (load.traceEvents) {
    const th = chromeThreads(load.traceEvents);
    if (!th.main) return { void: 'no renderer main thread in the trace' };
    const w = chromeEventWindows({ ...th, M: th.X }, ev, load);
    if (w.void) return w;
    const kinds = group(w.windows, (x) => chromeWindowCounts(th, x, { code: row.code ?? null, fileUrl: row.code?.url ?? row.fileUrl ?? null, nodeIds }));
    return { kinds, lineBase: w.lineBase ?? null, anims: chromeAnimations(th.all, { nodeIds }), animsAttributed: !!nodeIds };
  }
  if (load.timelineRecs) {
    const flat = simFlatten(load.timelineRecs);
    const w = simEventWindows(flat, ev, load);
    if (w.void) return w;
    const rect = row.rectKey ? load.rects?.[row.rectKey] ?? null : load.rect ?? null;
    const kinds = group(w.windows, (x) => simWindowCounts(flat, x, { code: row.code ?? null, rect, dpr }));
    return { kinds, lineBase: w.lineBase ?? null };
  }
  return { void: 'load has no trace, timeline, windows or tick fields' };
}

/** Layer census of one load for a row: Chrome raw CDP layers or a probe summary; Sim layersForNode layers. */
export function loadCensus(load, row, { dpr = 3 } = {}) {
  const c = load.census;
  if (!c) return null;
  const keys = row.census ?? row.nodes ?? null;
  const K = keys == null ? null : Array.isArray(keys) ? keys : [keys];
  if (engineOf(load) === 'sim') {
    const L = Array.isArray(c.layers) ? c.layers : K ? K.flatMap((k) => c.layers?.[k] || []) : Object.values(c.layers || {}).flat();
    return { ...simLayerCensus(L, c.reasons || null), source: 'WebKit LayerTree (memory read)' };
  }
  if (Array.isArray(c) || Array.isArray(c.layers)) {
    const layers = Array.isArray(c) ? c : c.layers;
    return { ...chromeLayerCensus(layers, { nodeIds: nodeSet(load, K), layerScale: load.layerScale ?? c.layerScale ?? null, dpr }), source: 'CDP LayerTree (memory ESTIMATE)' };
  }
  if (c.by && K) { // a probe's summary (fix-nav-morph): {layers, drawing, estBytes, by: {key: {layers, drawing, estBytes, paintCount}}}
    const s = { layers: 0, drawing: 0, estBytes: 0, paintCount: 0 };
    for (const k of K) for (const f of Object.keys(s)) s[f] += c.by[k]?.[f] || 0;
    return { ...s, attribution: 'element', source: 'probe census summary (memory ESTIMATE)' };
  }
  return { layers: c.layers ?? null, drawing: c.drawing ?? null, estBytes: c.estBytes ?? null, attribution: 'page', source: 'probe census summary (memory ESTIMATE)' };
}

/** Which metrics each field cell shows, in order. */
export const CELL = Object.freeze({ 3: ['elementPaints', 'elementPaintMpx', 'elementCullArea', 'paints', 'pageCullArea', 'pageClipArea'], 4: ['layouts', 'layoutObjects'], 5: ['codeCalls', 'fileCalls', 'styleElements', 'styleRecalcs', 'functionCalls', 'listenerOpsN'] });
const CONTEXT = ['mainFrames', 'renderingFrames', 'frameHz', 'rafHz', 'rafFires', 'prePaints', 'layerizes', 'commits', 'compositorFrames', 'composites', 'io'];

/** Which mode a metric comes from (README §6.2): frame-driven FULL only; script FULL unless scriptFromFrz names the
 * passed FULL-vs-FRZ check of the family; every other element field FRZ first, FULL beside it. */
export function sourceMode(metric, modes, { scriptFromFrz = null } = {}) {
  const has = (m) => modes.includes(m);
  if (METRICS[metric]?.frame) return has('full') ? 'full' : null;
  if (metric === 'codeCalls' || metric === 'fileCalls' || metric === 'functionCalls') return scriptFromFrz && has('freeze') ? 'freeze' : has('full') ? 'full' : null;
  return has('freeze') ? 'freeze' : has('full') ? 'full' : null;
}

/**
 * Build the card. spec: {topic, arms?, control?, aa?, dpr?, scriptFromFrz?, rows: [{element, event: {kind: fire|mark|
 * frame|times, name?, url?, line?, instances?, periodMs?, toleranceMs?, minEvents?, prefix?, endKind?, perFrame?},
 * code?: {url, lines: [a, b]}, nodes?/census?: key(s), rectKey?}]}. loads: normalised loads (see tools/costcard.mjs).
 */
export function buildCard(spec, loads, { inputs = [], now = new Date().toISOString() } = {}) {
  const dpr = spec.dpr ?? 3;
  const aaArm = spec.aa ?? null;
  const found = [...new Set(loads.map(armOf))];
  const arms = spec.arms ?? found.filter((a) => a !== aaArm);
  const control = spec.control ?? arms[0];
  const card = { tool: 'tools/costcard.mjs', schema: 'fw-costcard/1', topic: spec.topic ?? null, generatedAt: now, inputs, arms, control, aa: aaArm, dpr, scriptFromFrz: spec.scriptFromFrz ?? null, rows: [], voids: [], skipped: [] };
  for (const row of spec.rows) {
    const per = [];
    for (const l of loads) {
      const arm = armOf(l);
      if (!arms.includes(arm) && arm !== aaArm) { card.skipped.push(`${arm}/r${l.rep ?? '?'}`); continue; }
      const id = `${arm}/${engineOf(l)}/${modeOf(l) === 'freeze' ? 'FRZ' : 'FULL'}/r${l.rep ?? '?'}`;
      const r = loadRowValues(l, row, { dpr });
      if (r.void) { card.voids.push({ element: row.element, load: id, void: r.void }); continue; }
      per.push({ arm, engine: engineOf(l), mode: modeOf(l), rep: l.rep ?? null, ...r, census: loadCensus(l, row, { dpr }) });
    }
    const kinds = [...new Set(per.flatMap((p) => Object.keys(p.kinds)))];
    const engines = [...new Set(per.map((p) => p.engine))];
    for (const kind of kinds) for (const engine of engines) {
      const mine = per.filter((p) => p.engine === engine && p.kinds[kind]);
      if (!mine.length) continue;
      const modes = [...new Set(mine.map((p) => p.mode))].sort();
      const R = { element: row.element, event: kind, engine, modes, arms: {}, aaSource: {}, fields: {} };
      for (const arm of [...arms, ...(aaArm ? [aaArm] : [])]) {
        R.arms[arm] = {};
        for (const mode of modes) {
          const P = mine.filter((p) => p.arm === arm && p.mode === mode);
          if (!P.length) continue;
          const keys = [...new Set(P.flatMap((p) => Object.keys(p.kinds[kind])))].filter((k) => k !== 'msUnjudged');
          const metrics = Object.fromEntries(keys.map((k) => [k, acrossLoads(P.map((p) => p.kinds[kind][k]))]));
          const msK = [...new Set(P.flatMap((p) => Object.keys(p.kinds[kind].msUnjudged || {})))];
          const census = P.map((p) => p.census).filter(Boolean);
          let cen = null;
          if (census.length) {
            cen = Object.fromEntries(['layers', 'drawing', 'estBytes', 'estBytesAtDpr', 'memoryBytes', 'paintCount', 'animationReasonLayers'].filter((f) => census.some((c) => c[f] != null)).map((f) => [f, acrossLoads(census.map((c) => c[f]))]));
            cen.source = census[0].source; cen.attribution = census[0].attribution;
          }
          R.arms[arm][mode] = {
            loads: P.length, reps: P.map((p) => p.rep), metrics,
            msUnjudged: Object.fromEntries(msK.map((k) => [k, round(median(P.map((p) => p.kinds[kind].msUnjudged?.[k]).filter(Number.isFinite)), 2)])),
            census: cen, lineBase: [...new Set(P.map((p) => p.lineBase).filter((x) => x != null))], preCut: P.some((p) => p.preCut),
            anims: P.some((p) => p.anims) ? dedupeAnims(P.flatMap((p) => p.anims || [])) : null, animsAttributed: P.some((p) => p.animsAttributed),
            ...(P.some((p) => p.eventValues) ? { eventValues: P.map((p) => p.eventValues || null) } : {}),
          };
        }
      }
      for (const mode of modes) {
        const c = R.arms[control]?.[mode], c2 = aaArm ? R.arms[aaArm]?.[mode] : null;
        const tag = `${engine} ${mode === 'freeze' ? 'FRZ' : 'FULL'}`;
        R.aaSource[mode] = c && c2 ? `${control} vs ${aaArm}, ${tag}, loads ${c.loads}/${c2.loads}` : `none: 2-count floor only (${tag}${aaArm ? `, no ${aaArm} loads` : ', no A/A arm'})`;
        for (const arm of arms) {
          const a = R.arms[arm]?.[mode];
          if (!a || arm === control || !c) continue;
          a.delta = {};
          for (const [k, m] of Object.entries(a.metrics)) {
            if (k === 'events' || k === 'seconds') continue;
            const cm = c.metrics[k]?.median, x = m.median;
            if (cm == null || x == null) continue;
            const t = aaTolerance(cm, c2 ? c2.metrics[k]?.median : null);
            a.delta[k] = { d: x - cm, tol: t.tol, beyondAA: Math.abs(x - cm) > t.tol, lowPower: !!t.lowPower, aaSource: t.source };
          }
        }
      }
      fillFields(R, { arms, control, modes, scriptFromFrz: card.scriptFromFrz });
      card.rows.push(R);
    }
  }
  card.skipped = [...new Set(card.skipped)];
  card.sourceStatus = sourceStatus(card);
  return card;
}
function dedupeAnims(anims) {
  const by = new Map();
  for (const a of anims) {
    const k = `${a.name ?? ''}|${a.displayName ?? ''}|${a.nodeName ?? ''}`;
    const b = by.get(k);
    if (!b) by.set(k, { name: a.name ?? null, displayName: a.displayName ?? null, nodeName: a.nodeName ?? null, compositeFailed: a.compositeFailed, reasons: a.reasons, unsupportedProperties: [...a.unsupportedProperties], hasCompositeInstant: !!a.hasCompositeInstant, seen: 1 });
    else { b.seen++; b.compositeFailed |= a.compositeFailed; b.reasons = failureReasons(b.compositeFailed); b.hasCompositeInstant ||= !!a.hasCompositeInstant; for (const p of a.unsupportedProperties) if (!b.unsupportedProperties.includes(p)) b.unsupportedProperties.push(p); }
  }
  return [...by.values()];
}
function fillFields(R, { arms, control, modes, scriptFromFrz }) {
  const f1 = {};
  for (const arm of arms) {
    const mode = sourceMode('codeCalls', modes, { scriptFromFrz }) ?? modes[0];
    const a = R.arms[arm]?.[mode];
    if (!a) continue;
    const fr = a.metrics.mainFrames?.median ?? a.metrics.renderingFrames?.median ?? null;
    const cpf = a.metrics.rafWithCode?.median ?? a.metrics.framesWithCode?.median ?? null;
    const census = R.arms[arm]?.freeze?.census ?? R.arms[arm]?.full?.census;
    f1[arm] = { mode, ...threadReading({ anims: a.anims, animsAttributed: a.animsAttributed, codeCalls: a.metrics.codeCalls?.median ?? null, codePerFrame: cpf, framesPerEvent: fr, simAnimationLayers: census?.animationReasonLayers?.median ?? null }) };
  }
  R.fields[1] = f1;
  const f2 = {};
  for (const arm of arms) {
    const mode = R.arms[arm]?.freeze?.census ? 'freeze' : 'full';
    const c = R.arms[arm]?.[mode]?.census;
    if (c) f2[arm] = { mode, ...c };
  }
  R.fields[2] = f2;
  for (const f of [3, 4, 5]) {
    const cell = {};
    for (const metric of CELL[f]) {
      const mode = sourceMode(metric, modes, { scriptFromFrz });
      if (!mode) continue;
      const per = {};
      for (const arm of arms) {
        const m = R.arms[arm]?.[mode]?.metrics?.[metric];
        if (m && m.median != null) per[arm] = { mode, ...m, delta: arm === control ? null : R.arms[arm]?.[mode]?.delta?.[metric] ?? null };
      }
      if (Object.keys(per).length) cell[metric] = per;
    }
    R.fields[f] = cell;
  }
  const ctx = {};
  for (const metric of CONTEXT) {
    const per = {};
    for (const arm of arms) {
      const m = R.arms[arm]?.full?.metrics?.[metric];
      if (m && m.median != null) per[arm] = { mode: 'full', ...m, delta: arm === control ? null : R.arms[arm]?.full?.delta?.[metric] ?? null };
    }
    if (Object.keys(per).length) ctx[metric] = per;
  }
  R.fields[0] = ctx;
}
function sourceStatus(card) {
  const n = [];
  const any = (fn) => card.rows.some((r) => Object.values(r.arms).some((a) => Object.values(a).some(fn)));
  if (card.rows.some((r) => r.engine === 'chrome')) {
    n.push('Field 1, Chrome: the trace "Animation" instant event with compositeFailed is CONFIRMED in source (chromium inspector_trace_events.cc inspector_animation_compositor_event::Data; devtools-frontend TraceEvents.ts, CLSCulprits.ts). Emitted on Chrome 154 with our trace categories: OBSERVED for a CSS width animation (failure UnsupportedCSSProperty, property width) and absent for a transform animation (tests/chrome/costcard.chrome.test.mjs); that every animation type on this page gets it is UNRESOLVED. A composited animation gets no compositeFailed event, so "no failure reason" is never read as "composited".');
    n.push('Field 3, Chrome: a trace Paint clip is the paint layer\'s cull rect in layer-local coordinates (CONFIRMED, chromium paint_layer_painter.cc "Paint" event), so Chrome areas are upper bounds, never intersected with an element rect; element paints use Paint args.data.nodeId against the element\'s backend node ids.');
    if (any((m) => m.lineBase?.length)) n.push('FunctionCall line base: P-076 OBSERVED 1-based in our setup; every row prints the base its fire line matched.');
  }
  if (card.rows.some((r) => r.engine === 'sim')) n.push('Field 3, Sim: a Timeline Paint clip is in root-view coordinates (CONFIRMED, WebKit PageTimelineAgent::didPaint); that it matches getBoundingClientRect on iOS at scrollY > 0 is UNRESOLVED. Field 1, Sim: the behavioural reading (no element script per moving frame) is a method, OBSERVED; WebKit has no per-animation "accelerated" flag.');
  if (any((m) => m.preCut)) n.push('Pre-cut windows: the probe\'s own per-window counts are taken as given (no raw trace to re-cut). Their paint area is a whole-page cull-rect sum.');
  return n;
}

// ---- markdown --------------------------------------------------------------------------------------------------------
export const fmt = (x) => (x == null || !Number.isFinite(x) ? '-' : Number.isInteger(x) || Math.abs(x) >= 100 ? String(Math.round(x)) : Math.abs(x) >= 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x * 100) / 100));
const fmtBytes = (b) => (b == null || !Number.isFinite(b) ? '-' : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} kB` : `${b} B`);
const modeTag = (m) => (m === 'freeze' ? 'FRZ' : 'FULL');
const scale = (metric) => (METRICS[metric]?.area ? 1e-6 : 1);
function armVals(per, arms, control, metric) {
  const s = scale(metric);
  return arms.filter((a) => per[a]).map((a) => {
    const p = per[a];
    const r = p.n > 1 && p.min !== p.max ? ` [${fmt(p.min * s)}-${fmt(p.max * s)}]` : '';
    const d = a !== control && p.delta ? ` (${p.delta.d >= 0 ? '+' : ''}${fmt(p.delta.d * s)}${p.delta.beyondAA ? '' : ', within A/A'}${p.delta.lowPower ? ', low-power' : ''})` : '';
    return `${a} ${fmt(p.median * s)}${r}${d}`;
  }).join(' · ');
}
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** The plain-words md card: one row per element/event type with the five fields, then details per row. */
export function renderMarkdown(card) {
  const { arms, control } = card;
  const L = [];
  L.push(`# Rendering cost card${card.topic ? `: ${card.topic}` : ''}`, '');
  L.push(`Arms ${arms.join(', ')}; control ${control}; ${card.aa ? `A/A ${control} vs ${card.aa}` : 'no A/A arm (tol = the 2-count floor)'}. ` +
    'Counts per element event, median over page loads [min-max]. In brackets after an arm: its change against the control. "within A/A" means |change| ≤ tol = max(2·|C−C2|, 2). "low-power" means tol > C/2. ' +
    'FRZ = the rest of the page frozen, FULL = the page as served. ms are printed, never judged.', '');
  L.push('| Element / event | Engine | 1 Thread | 2 Layers, memory | 3 Repaint per event | 4 Layout per event | 5 Script per event | Page around it (FULL only) | A/A source |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const R of card.rows) {
    const f1 = arms.filter((a) => R.fields[1][a]).map((a) => `${a}: ${R.fields[1][a].text} (${R.fields[1][a].status})`).join('<br>') || '-';
    const f2 = arms.filter((a) => R.fields[2][a]).map((a) => {
      const c = R.fields[2][a];
      const mem = c.memoryBytes ? fmtBytes(c.memoryBytes.median) : c.estBytesAtDpr ? `est. ${fmtBytes(c.estBytesAtDpr.median)} at DPR ${card.dpr}` : c.estBytes ? `est. ${fmtBytes(c.estBytes.median)} (host layer px)` : 'memory -';
      return `${a}: ${fmt(c.layers?.median)} layers${c.drawing ? ` (${fmt(c.drawing.median)} drawing)` : ''}, ${mem}${c.attribution === 'page' ? ', whole page' : ''}`;
    }).join('<br>') || '-';
    const cell = (f) => Object.entries(R.fields[f]).map(([metric, per]) => `${METRICS[metric]?.label ?? metric}${METRICS[metric]?.area ? ' (millions)' : ''}, ${modeTag(Object.values(per)[0].mode)}: ${armVals(per, arms, control, metric)}`).join('<br>') || '-';
    const ctx = R.fields[0];
    const ctxs = ['mainFrames', 'renderingFrames', 'frameHz', 'rafHz', 'layerizes', 'composites'].filter((k) => ctx[k]).map((k) => `${METRICS[k]?.label ?? k}: ${armVals(ctx[k], arms, control, k)}`).join('<br>') || (R.modes.includes('full') ? 'n/a (no frame counts in these records)' : 'n/a (no FULL loads)');
    L.push(`| ${esc(R.element)} / ${esc(R.event)} | ${R.engine} | ${esc(f1)} | ${esc(f2)} | ${esc(cell(3))} | ${esc(cell(4))} | ${esc(cell(5))} | ${esc(ctxs)} | ${esc(R.modes.map((m) => R.aaSource[m]).join('; '))} |`);
  }
  L.push('', 'Frame-driven counts (main or rendering frames, Layerize, Composite, frame and rAF rates) come from the FULL page only and are never the element\'s alone (README §6.2, H9). They stand beside every per-event number so a per-time reading can be checked against them.', '');
  L.push('## Details per row', '');
  for (const R of card.rows) {
    L.push(`### ${R.element} / ${R.event} (${R.engine})`, '');
    for (const mode of R.modes) {
      const present = [...arms, ...(card.aa ? [card.aa] : [])].filter((a) => R.arms[a]?.[mode]);
      if (!present.length) continue;
      const bases = [...new Set(present.flatMap((a) => R.arms[a][mode].lineBase || []))];
      L.push(`${modeTag(mode)}: loads ${present.map((a) => `${a} ${R.arms[a][mode].loads}`).join(', ')}. A/A source: ${R.aaSource[mode]}.${bases.length ? ` Fire line base: ${bases.join('/')}-based.` : ''}`, '');
      L.push(`| Metric | ${present.join(' | ')} |`, `|---|${present.map(() => '---').join('|')}|`);
      const keys = [...new Set(present.flatMap((a) => Object.keys(R.arms[a][mode].metrics)))];
      for (const k of keys) {
        const M = METRICS[k] || { label: k };
        const note = M.frame && mode === 'freeze' ? ' (FRZ: not used, FULL only)' : '';
        const vals = present.map((a) => {
          const m = R.arms[a][mode].metrics[k], d = R.arms[a][mode].delta?.[k];
          if (m?.median == null) return '-';
          return `${fmt(m.median)}${m.n > 1 && m.min !== m.max ? ` [${fmt(m.min)}-${fmt(m.max)}]` : ''}${d ? `, change ${d.d >= 0 ? '+' : ''}${fmt(d.d)} tol ${fmt(d.tol)}${d.beyondAA ? '' : ' (within A/A)'}${d.lowPower ? ' (low-power)' : ''}` : ''}`;
        });
        L.push(`| ${esc(M.label)}${note} | ${vals.map(esc).join(' | ')} |`);
      }
      const ms = [...new Set(present.flatMap((a) => Object.keys(R.arms[a][mode].msUnjudged || {})))];
      for (const k of ms) L.push(`| ${k} ms (unjudged) | ${present.map((a) => fmt(R.arms[a][mode].msUnjudged?.[k])).join(' | ')} |`);
      L.push('');
      for (const a of present.filter((x) => R.arms[x][mode].anims?.length)) L.push(`- ${a} animations: ${R.arms[a][mode].anims.map((x) => `${x.name || x.displayName || '?'}${x.nodeName ? ` on ${x.nodeName}` : ''}: ${x.reasons.length ? x.reasons.join(', ') : 'no failure reason'}`).join('; ')}`);
      if (present.some((x) => R.arms[x][mode].anims?.length)) L.push('');
    }
  }
  if (card.voids.length) { L.push('## VOID loads (left out)', ''); for (const v of card.voids) L.push(`- ${v.element}, ${v.load}: ${v.void}`); L.push(''); }
  L.push('## What this card cannot say', '', '- Frame time, smoothness, finger feel and hot-only behaviour: those stay with the phone (V stage).', '- Raster and GPU time. Memory and area are proxies, and Chrome memory is an estimate.', '- Costs merged in from neighbours (H9). The FULL context hints at them but does not measure them.', '');
  if (card.sourceStatus.length) { L.push('## Status of the sources', ''); for (const u of card.sourceStatus) L.push(`- ${u}`); L.push(''); }
  return L.join('\n');
}

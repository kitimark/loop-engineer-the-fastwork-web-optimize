// Per-frame paints, paint area and per-layer paint counts for verify.mjs --paint-rects (incident I-032,
// protocol v2 T7; research/design-engineering/devtools-render-metrics.md §4.2 and §6 rank 2, rank 4's layer counts).
//
// Sources (never the trace `Paint` event's args.data.clip: "unreliable and often wrong", DevTools' TraceEvents.ts):
// - 'layerPainted': CDP LayerTree.layerPainted ({layerId, clip}), one per paint, with the dirty clip. Used whenever
//   the run has any such event.
// - 'paintCount': otherwise, the per-layer `paintCount` of CDP LayerTree.layerTreeDidChange's layer list, which
//   Chrome re-sends on every frame that changes or paints a layer: a layer's paints in a frame are the rise of its
//   paintCount since the previous list (a layer that appears after the first list counts its whole paintCount).
//   Chrome 148+ sends no layerPainted: since Chromium 1bf9d9eb378c (main@{#1610086}, M148) cc::LayerTreeHost::
//   WillCommit resets each layer's update_rect before probe::LayerTreePainted reads it (res-layerpainted's source
//   reading; check 2026-10-01: Chrome 154 0 events in every arm, Chrome 143 8-10; F-064, F-066; not
//   CompositeAfterPaint as F-059 said). There this is the source: per-frame and per-layer paint COUNTS, but no
//   dirty rects, so no clip area (mpx null). (The heavy alternative for rects, trace category
//   disabled-by-default-devtools.timeline.layers snapshots with annotated_invalidation_rects, is not used.)
//   LayerTree.enable must follow the navigation: the agent is not re-enabled after one.
// OBSERVED limitation of both sources (F-066, one check, not confirmed in source): a will-change box with only a
// solid background changed colour twice a second and got no layerPainted (Chrome 143) and no paintCount rise on
// its own layer. Inference: Chrome draws it as a solid-colour layer, so the change is a property update, not a
// paint; changes on such layers may be missing from both sources on any Chrome.
// paintCount itself works on Chrome 154: cc PictureLayer::Update calls IncreasePaintCount() on every non-empty
// invalidation, which 1bf9d9eb378c did not touch (CONFIRMED by source and a 154 vs 143 check, F-072 refuted:
// root layer and a fixed div with changing text rose every frame on both). OBSERVED (F-074): a fixed ::after
// whose generated text changes gets a NEW layer on every change (both versions), so it shows up as
// newLayerPaints and layer churn, not paints; and painted scrollbar layers never raise paintCount.
//
// Frames: a rAF recorder (PAINT_ARM) calls the CDP binding PAINT_BINDING once per frame with
// [rAF timestamp, __perf.on, __perf.t0]. Bindings and LayerTree events are notifications of the same page
// session and arrive in the renderer's order, so the paints reported between the binding call of frame k and
// that of frame k+1 are the paints of the rAF interval [t_k, t_k+1] (the frame whose rAF callbacks ran at t_k).
// An interval belongs to a phase exactly as in the in-page logger (lib/perf-page.mjs): it began at or after the
// phase's t0 and ended while the logger was recording.
//
// Layer space: Chrome reports layer sizes and clips in CSS px x the COMPOSITOR's device scale factor, which under
// device emulation is the host display's real DSF, not the emulated DPR: blink WidgetBase::UpdateSurfaceAndScreenInfo
// passes GetOriginalDeviceScaleFactor() to SetViewportRectAndScale ("the DSF specified in |new_screen_info| is not
// the DSF used by the compositor during device emulation!", third_party/blink/renderer/platform/widget/
// widget_base.cc, main 2026-10-01, lines 1906-1909; CONFIRMED by our probe 2026-10-01, Chrome 154 on a DSF 2 host:
// a 980 CSS px page's layers were 1960 wide and a 100x50 fixed box 200x100, at emulated DSF 3 and at DSF 1 alike).
// verify reads that scale (PAINT_LAYER_SCALE: devicePixelRatio before the emulation is set, i.e. the host DSF at
// the fresh profile's 100% zoom) as paintRects.layerScale; paintRects.units is 'layer px' (= CSS px x layerScale),
// paintRects.dpr the page's emulated devicePixelRatio. So on a DSF 2 Mac one CSS px is 4 layer px, whatever the
// emulated DPR; how many pixels the phone (DPR 3) or Chrome's raster really paints is not what these numbers say.
// Area, two different numbers, both in layer px:
// - mpx ('layerPainted' only, else null): the sum of clip width x height of every paint in the frame, never a
//   union (paints of one frame can overlap and nest). Chrome's area is a lower bound on WebKit's for resizing
//   layers (Chrome invalidates per tile and keeps a resized backing store) and exact for paint-only switches.
// - layerMpx (both sources): the summed FULL size of the distinct layers that painted in the frame, an upper
//   bound on the painted area (a layer that repainted one tile counts whole). Mpx = px / 1e6.
// - layerVpMpx (both sources, with the viewport): the same with each painted layer capped to the viewport, per
//   dimension (min(w, vpW) x min(h, vpH)): an upper bound that keeps one document-height scrolling-contents layer
//   from swamping the rest. Position-free: layer offsets are relative to the transform parent and scroll lives
//   in transform nodes, so a real layer-bounds ∩ viewport cannot be had from the layer list.
// None of these is called paint area or clip outside mpx.
//
// Cost: LayerTree.enable makes the renderer build the layer list on every tree change or paint and send it; the
// binding call is one CDP notification per frame from the page's main thread. That is a lot on this page (~160
// layers, a list every painting frame): the on/off A/A (2026-10-01 12:40Z, baseline, CPU 6x, idle 6, n=3 each
// interleaved, host clean) moved the scroll phase from 86.6 to 66.6 fps (ranges 85.7-87.4 vs 65.9-66.7), its tick
// median from 1 to 2 and frames > 34 ms from 5 to 10, the morph phase from 113.5 to 95.6 fps; idle unchanged. --paint-rects is for attribution (which layers
// paint, how often, churn), never for timing; a --paint-rects run is comparable only with other --paint-rects runs
// (the run records this as paintRects.note).

export const PAINT_BINDING = '__fwPaintFrame';
/** Page side: start the per-frame binding recorder (once per document); true when started. */
export const PAINT_ARM = `(() => { if (window.__fwPaint) return false; const S = window.__fwPaint = { on: true };
  const f = (t) => { if (!S.on) return; const p = window.__perf; try { window.${PAINT_BINDING}(JSON.stringify([t, !!(p && p.on), p ? p.t0 : null])); } catch (e) {} requestAnimationFrame(f); };
  requestAnimationFrame(f); return true; })()`;
/** Page side, before Emulation.setDeviceMetricsOverride: the compositor's scale (the host DSF; layer px = CSS px x this). */
export const PAINT_LAYER_SCALE = '(window.__fwPaintScale = devicePixelRatio)';
/** Page side: stop the recorder; {armed, w, h, dpr}: the viewport in CSS px and the emulated DPR (NOT the layer scale). */
export const PAINT_DISARM = '(() => { const S = window.__fwPaint; if (S) S.on = false; return { armed: !!S, w: innerWidth, h: innerHeight, dpr: devicePixelRatio }; })()';
export const PAINT_NOTE = 'paint-rects: LayerTree.enable + a per-frame CDP binding call add main-thread work (on/off A/A 2026-10-01: scroll tick median 1 -> 2, fps 86.6 -> 66.6): attribution only, never a timing run; compare only with other --paint-rects runs';

const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;
const p50 = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? r3(s[Math.floor(s.length / 2)]) : 0; };

/**
 * Turns one CDP message into a stream item, or null: {k:'f', t, on, t0} (binding), {k:'p', id, area, w, h}
 * (layerPainted), {k:'l', layers: [{id, w, h, node, draws, pc}]} (layerTreeDidChange with a layer list; pc =
 * the layer's paintCount, null when absent).
 */
export function streamItem(m) {
  if (m.method === 'Runtime.bindingCalled' && m.params?.name === PAINT_BINDING) {
    try { const [t, on, t0] = JSON.parse(m.params.payload); return { k: 'f', t, on, t0 }; } catch { return null; }
  }
  if (m.method === 'LayerTree.layerPainted') {
    const c = m.params?.clip || {};
    const w = Math.max(0, Number(c.width) || 0), h = Math.max(0, Number(c.height) || 0);
    return { k: 'p', id: String(m.params?.layerId), area: w * h, w, h };
  }
  if (m.method === 'LayerTree.layerTreeDidChange' && Array.isArray(m.params?.layers)) {
    return { k: 'l', layers: m.params.layers.map((l) => ({ id: String(l.layerId), w: l.width, h: l.height, node: l.backendNodeId ?? null, draws: !!l.drawsContent, pc: typeof l.paintCount === 'number' ? l.paintCount : null })) };
  }
  return null;
}

/** The source a stream supports: 'layerPainted' (any such event), else 'paintCount' (a layer list with counts), else null. */
export function paintSource(stream) {
  if (stream.some((it) => it.k === 'p')) return 'layerPainted';
  if (stream.some((it) => it.k === 'l' && it.layers.some((l) => l.pc != null))) return 'paintCount';
  return null;
}

/**
 * stream: streamItem()s in arrival order; phases: {name: t0} (the logger's t0 of each recorded phase);
 * vp: {w, h} the viewport in layer px (CSS px x layerScale), for layerVpMpx (null without it).
 * Returns {source, binding, intervals, phases: {name: summary}, frames: {name: [[t, dur, paints, mpx, layerMpx,
 * layers, layersDelta, topLayerId]]}, tagFrames: {name: [{t, dur, paints, mpx, layerMpx, layers, layersDelta,
 * topLayer}]}, layerPaintedEvents, countedPaints (paintCount rises over the whole stream), unassignedPaints,
 * bindingFrames, layers: Map(id -> last known {w, h, node, draws, pc})}. mpx fields are null with source
 * 'paintCount'.
 *
 * binding: 'frame' when every paint is placed in one rAF interval ('layerPainted', or every paint-bearing layer
 * list came one frame after the previous list); 'interval' when some paint-bearing list came more than one
 * frame after the previous list, so its rises may belong to any frame since (intervals.spanGt1 of
 * intervals.withPaints; per-frame values are then per list interval, placed at the frame it arrived in).
 * A layer first listed after the first list (paintCount source) counts its whole paintCount as newLayerPaints
 * (painted since it appeared), never in paints / layerMpx; layers leaving the list add to layersRemoved and
 * layerChurn (added + removed between consecutive lists, per frame).
 */
export function analyzePaints(stream, phases, vp = null) {
  const source = paintSource(stream);
  const clip = source !== 'paintCount'; // 'layerPainted', or no paint data at all (zeros)
  const vpW = vp?.w > 0 ? vp.w : null, vpH = vp?.h > 0 ? vp.h : null;
  const byT0 = new Map(Object.entries(phases).filter(([, t0]) => t0 != null).map(([n, t0]) => [t0, n]));
  const layers = new Map(); // every layer ever listed: id -> {w, h, node, draws, pc}
  const pcLast = new Map(); // id -> last paintCount seen
  let current = null; // ids of the latest layer list
  let lists = 0, framesSinceList = 0;
  const intervals = { lists: 0, withPaints: 0, spanGt1: 0, spanGt1Share: 0 };
  const out = {}, frames = {}, tagFrames = {};
  for (const n of byT0.values()) {
    out[n] = { frames: 0, framesWithPaint: 0, paints: 0, mpx: clip ? 0 : null, frameMpxMax: clip ? 0 : null, frameMpxP50: clip ? 0 : null,
      layerMpx: 0, frameLayerMpxMax: 0, frameLayerMpxP50: 0, layerVpMpx: vpW && vpH ? 0 : null, frameLayerVpMpxMax: vpW && vpH ? 0 : null,
      newLayerPaints: 0, layerTreeChanges: 0, layerCount: null, layersAdded: 0, layersRemoved: 0, layerChurn: 0, layersPainted: 0, topLayers: [], perLayer: {} };
    frames[n] = []; tagFrames[n] = [];
  }
  const startIds = {}, frameMpx = {}, frameLayerMpx = {};
  let prev = null, paintsIn = [], changesIn = 0, layerPaintedEvents = 0, countedPaints = 0, unassigned = 0, bindingFrames = 0;
  const size = (id) => { const l = layers.get(id); return l && l.w > 0 && l.h > 0 ? [l.w, l.h] : [0, 0]; };
  for (const it of stream) {
    if (it.k === 'p') {
      layerPaintedEvents++;
      if (prev) paintsIn.push({ id: it.id, n: 1, area: it.area }); else unassigned++;
      continue;
    }
    if (it.k === 'l') {
      current = it.layers.map((l) => l.id);
      const listed = new Set(current);
      for (const id of [...pcLast.keys()]) if (!listed.has(id)) pcLast.delete(id); // a removed layer contributes nothing; back = new
      let painted = false;
      for (const l of it.layers) {
        if (l.pc != null) {
          const was = pcLast.get(l.id);
          const fresh = was === undefined && lists > 0; // first listed after the reference list
          let d = was === undefined ? (lists ? l.pc : 0) : l.pc - was; // the first list is the reference
          if (d < 0) d = l.pc; // a reused id / a reset count
          pcLast.set(l.id, l.pc);
          if (d > 0) {
            countedPaints += d; painted = true;
            if (!clip) { if (prev) paintsIn.push({ id: l.id, n: d, area: null, fresh }); else unassigned += d; }
          }
        }
        layers.set(l.id, l);
      }
      if (lists > 0) {
        intervals.lists++;
        if (painted) { intervals.withPaints++; if (framesSinceList > 1) intervals.spanGt1++; }
      }
      lists++; framesSinceList = 0;
      if (prev) changesIn++;
      continue;
    }
    if (it.k !== 'f') continue;
    bindingFrames++; framesSinceList++;
    const steady = paintsIn.filter((p) => !p.fresh), fresh = paintsIn.filter((p) => p.fresh);
    const nIn = steady.reduce((a, p) => a + p.n, 0), nFresh = fresh.reduce((a, p) => a + p.n, 0);
    if (prev) {
      const name = it.on && prev.t >= it.t0 ? byT0.get(it.t0) : undefined;
      if (name) {
        const s = out[name];
        const countNow = current ? current.length : null;
        if (s.layerCount == null) { s.layerCount = { start: prev.count ?? countNow, end: countNow, max: countNow }; startIds[name] = new Set(prev.ids || current || []); }
        const byLayer = new Map(); // id -> {n, area}
        for (const p of steady) { const v = byLayer.get(p.id) || { n: 0, area: 0 }; v.n += p.n; if (p.area != null) v.area += p.area; byLayer.set(p.id, v); }
        let a = 0, la = 0, lva = 0, top = null;
        for (const [id, v] of byLayer) {
          const [w, h] = size(id), full = w * h;
          a += v.area; la += full; if (vpW && vpH) lva += Math.min(w, vpW) * Math.min(h, vpH);
          const key = clip ? v.area : full;
          if (!top || key > top[1]) top = [id, key, v.area, full];
          const L = (s.perLayer[id] ||= { paints: 0, area: 0, layerArea: 0, newPaints: 0 });
          L.paints += v.n; L.area += v.area; L.layerArea += full;
        }
        for (const p of fresh) (s.perLayer[p.id] ||= { paints: 0, area: 0, layerArea: 0, newPaints: 0 }).newPaints += p.n;
        const mpx = a / 1e6, lmpx = la / 1e6;
        s.frames++; s.paints += nIn; s.newLayerPaints += nFresh; if (nIn) s.framesWithPaint++;
        if (clip) { s.mpx += mpx; s.frameMpxMax = Math.max(s.frameMpxMax, mpx); (frameMpx[name] ||= []).push(mpx); }
        s.layerMpx += lmpx; s.frameLayerMpxMax = Math.max(s.frameLayerMpxMax, lmpx); (frameLayerMpx[name] ||= []).push(lmpx);
        if (s.layerVpMpx != null) { s.layerVpMpx += lva / 1e6; s.frameLayerVpMpxMax = Math.max(s.frameLayerVpMpxMax, lva / 1e6); }
        s.layerTreeChanges += changesIn;
        s.layerCount.end = countNow;
        if (countNow != null) s.layerCount.max = Math.max(s.layerCount.max ?? countNow, countNow);
        if (prev.ids && current) {
          const before = new Set(prev.ids), now = new Set(current);
          const added = current.filter((id) => !before.has(id)).length, removed = prev.ids.filter((id) => !now.has(id)).length;
          s.layersRemoved += removed; s.layerChurn += added + removed;
        }
        const delta = countNow != null && prev.count != null ? countNow - prev.count : null;
        const dur = it.t - prev.t;
        const fm = clip ? r3(mpx) : null;
        frames[name].push([r1(prev.t), r1(dur), nIn, fm, r3(lmpx), countNow, delta, top ? top[0] : null]);
        tagFrames[name].push({ t: prev.t, dur, paints: nIn, mpx: fm, layerMpx: r3(lmpx), layers: countNow, layersDelta: delta,
          topLayer: top ? { layerId: top[0], mpx: clip ? r3(top[2] / 1e6) : null, layerMpx: r3(top[3] / 1e6) } : null });
        if (current) for (const id of current) if (!startIds[name].has(id)) startIds[name].add(id), s.layersAdded++;
      } else unassigned += nIn + nFresh;
    } else unassigned += nIn + nFresh;
    prev = { t: it.t, count: current ? current.length : null, ids: current };
    paintsIn = []; changesIn = 0;
  }
  unassigned += paintsIn.reduce((a, p) => a + p.n, 0);
  intervals.spanGt1Share = intervals.withPaints ? r3(intervals.spanGt1 / intervals.withPaints) : 0;
  const binding = source === 'paintCount' && intervals.spanGt1 > 0 ? 'interval' : 'frame';
  for (const [n, s] of Object.entries(out)) {
    if (clip) { s.frameMpxP50 = p50(frameMpx[n] || []); s.mpx = r3(s.mpx); s.frameMpxMax = r3(s.frameMpxMax); }
    s.frameLayerMpxP50 = p50(frameLayerMpx[n] || []); s.layerMpx = r3(s.layerMpx); s.frameLayerMpxMax = r3(s.frameLayerMpxMax);
    if (s.layerVpMpx != null) { s.layerVpMpx = r3(s.layerVpMpx); s.frameLayerVpMpxMax = r3(s.frameLayerVpMpxMax); }
    const painted = Object.entries(s.perLayer).filter(([, v]) => v.paints > 0);
    s.layersPainted = painted.length;
    s.topLayers = painted.sort((x, y) => y[1].paints - x[1].paints || y[1].layerArea - x[1].layerArea).slice(0, 3)
      .map(([id, v]) => { const [w, h] = size(id); return { layerId: id, paints: v.paints, w, h }; });
    s.perLayer = Object.fromEntries(Object.entries(s.perLayer).sort((x, y) => (clip ? y[1].area - x[1].area : 0) || y[1].layerArea - x[1].layerArea || y[1].paints - x[1].paints)
      .map(([id, v]) => [id, { paints: v.paints, ...(v.newPaints ? { newPaints: v.newPaints } : {}), mpx: clip ? r3(v.area / 1e6) : null, layerMpx: r3(v.layerArea / 1e6), ...(layers.get(id) ? { w: layers.get(id).w, h: layers.get(id).h, backendNodeId: layers.get(id).node } : {}) }]));
  }
  return { source, binding, intervals, phases: out, frames, tagFrames, layerPaintedEvents, countedPaints, unassignedPaints: unassigned, bindingFrames, layers };
}

/** The top `n` layers over all phases (ids): by summed clip Mpx, by painted layer Mpx when there is no clip area. */
export function topLayerIds(phases, n = 8) {
  const all = new Map();
  for (const s of Object.values(phases)) for (const [id, v] of Object.entries(s.perLayer)) all.set(id, (all.get(id) || 0) + (v.mpx ?? v.layerMpx ?? 0));
  return [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/** "DIV#id.cls1.cls2" from a DOM.describeNode node (svelte-* classes dropped). */
export function nodeLabel(node) {
  if (!node) return null;
  const a = node.attributes || [];
  const attr = (k) => { for (let i = 0; i + 1 < a.length; i += 2) if (a[i] === k) return a[i + 1]; return null; };
  const id = attr('id'), cls = (attr('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('svelte-')).slice(0, 3);
  return `${(node.localName || node.nodeName || '?').toLowerCase()}${id ? '#' + id : ''}${cls.map((c) => '.' + c).join('')}`;
}

// tools/lib/paint-rects.mjs (incident I-032, verify.mjs --paint-rects): CDP messages -> stream items, frames
// delimited by the binding calls, paints summed (never unioned) per frame / phase / layer, layer counts, the
// phase membership rule of the in-page logger, and the page-side recorder run in node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PAINT_BINDING, PAINT_ARM, PAINT_DISARM, PAINT_LAYER_SCALE, streamItem, paintSource, analyzePaints, topLayerIds, nodeLabel } from '../../tools/lib/paint-rects.mjs';

const bind = (t, on, t0) => ({ method: 'Runtime.bindingCalled', params: { name: PAINT_BINDING, payload: JSON.stringify([t, on, t0]) } });
const painted = (id, width, height, x = 0, y = 0) => ({ method: 'LayerTree.layerPainted', params: { layerId: id, clip: { x, y, width, height } } });
const tree = (...ids) => ({ method: 'LayerTree.layerTreeDidChange', params: { layers: ids.map((id, i) => ({ layerId: id, width: 100 * (i + 1), height: 10, backendNodeId: 10 + i, drawsContent: true })) } });
// a list with paintCount, as Chrome 148+ sends it (and no layerPainted): [id, width, height, paintCount]
const counted = (...ls) => ({ method: 'LayerTree.layerTreeDidChange', params: { layers: ls.map(([id, w, h, pc], i) => ({ layerId: id, width: w, height: h, paintCount: pc, backendNodeId: 20 + i, drawsContent: true })) } });
const stream = (msgs) => msgs.map(streamItem).filter(Boolean);

test('streamItem: binding calls, layerPainted (area = clip w x h), layer lists; anything else is null', () => {
  assert.deepEqual(streamItem(bind(12.5, true, 3)), { k: 'f', t: 12.5, on: true, t0: 3 });
  assert.deepEqual(streamItem(painted(7, 30, 20, 5, 5)), { k: 'p', id: '7', area: 600, w: 30, h: 20 });
  assert.deepEqual(streamItem({ method: 'LayerTree.layerPainted', params: { layerId: 'x', clip: { width: -5, height: 4 } } }).area, 0, 'a negative clip is no area');
  assert.deepEqual(streamItem(tree('a')), { k: 'l', layers: [{ id: 'a', w: 100, h: 10, node: 10, draws: true, pc: null }] });
  assert.equal(streamItem(counted(['a', 5, 5, 7])).layers[0].pc, 7, 'paintCount kept');
  assert.equal(streamItem({ method: 'LayerTree.layerTreeDidChange', params: {} }), null, 'a change without a list (layers not requested) is not a list');
  assert.equal(streamItem({ method: 'Runtime.bindingCalled', params: { name: 'other', payload: '[1,true,0]' } }), null);
  assert.equal(streamItem({ method: 'Runtime.bindingCalled', params: { name: PAINT_BINDING, payload: 'not json' } }), null);
  assert.equal(streamItem({ method: 'Network.requestWillBeSent', params: {} }), null);
});

test('analyzePaints: paints between two binding calls are that rAF interval\'s; area is a sum (overlaps count twice), per frame, phase and layer', () => {
  const s = stream([
    tree('a', 'b'),
    painted('a', 10, 10), // before any frame: unassigned
    bind(100, true, 100),
    painted('a', 1000, 1000), painted('a', 1000, 1000), // the same clip twice: 2 Mpx (a sum, not a union)
    bind(116.7, true, 100),
    tree('a', 'b', 'c'), painted('b', 500, 200),
    bind(156.7, true, 100), // a 40 ms frame with a layer added
    painted('c', 100, 100),
    bind(173.4, false, 100), // ended after COLLECT: not in the phase (as the logger)
  ]);
  const r = analyzePaints(s, { scroll: 100 });
  const p = r.phases.scroll;
  assert.equal(p.frames, 2);
  assert.equal(p.framesWithPaint, 2);
  assert.equal(p.paints, 3);
  assert.equal(p.mpx, 2.1);
  assert.equal(p.frameMpxMax, 2);
  assert.equal(p.layerTreeChanges, 1);
  assert.deepEqual(p.layerCount, { start: 2, end: 3, max: 3 });
  assert.equal(p.layersAdded, 1);
  assert.equal(p.layersPainted, 2);
  assert.deepEqual(p.perLayer, { a: { paints: 2, mpx: 2, layerMpx: 0.001, w: 100, h: 10, backendNodeId: 10 }, b: { paints: 1, mpx: 0.1, layerMpx: 0.002, w: 200, h: 10, backendNodeId: 11 } });
  assert.deepEqual(r.frames.scroll, [[100, 16.7, 2, 2, 0.001, 2, 0, 'a'], [116.7, 40, 1, 0.1, 0.002, 3, 1, 'b']]);
  // the painted layers' full size (an upper bound, distinct layers per frame), churn, the top layers by paints
  assert.deepEqual([p.layerMpx, p.frameLayerMpxMax, p.frameLayerMpxP50, p.layerVpMpx], [0.003, 0.002, 0.002, null], 'no viewport given: layerVpMpx null');
  assert.deepEqual([p.layersRemoved, p.layerChurn, p.newLayerPaints], [0, 1, 0]);
  assert.deepEqual(p.topLayers, [{ layerId: 'a', paints: 2, w: 100, h: 10 }, { layerId: 'b', paints: 1, w: 200, h: 10 }]);
  assert.deepEqual([r.source, r.binding], ['layerPainted', 'frame']);
  const tf = r.tagFrames.scroll[1];
  assert.equal(Math.round(tf.dur * 10) / 10, 40);
  assert.deepEqual({ ...tf, dur: 40 }, { t: 116.7, dur: 40, paints: 1, mpx: 0.1, layerMpx: 0.002, layers: 3, layersDelta: 1, topLayer: { layerId: 'b', mpx: 0.1, layerMpx: 0.002 } });
  assert.equal(r.layerPaintedEvents, 5);
  assert.equal(r.unassignedPaints, 2, 'the one before the first frame and the one of the frame that ended after COLLECT');
  assert.equal(r.bindingFrames, 4);
});

test('analyzePaints: phases by the logger\'s t0; an interval that began before t0 or ended while off belongs to none', () => {
  const s = stream([
    // a paint belongs to the rAF interval that began at the binding call before it
    bind(10, true, 0), painted('a', 100, 100), // 10-15: idle
    bind(15, true, 0), painted('a', 100, 100), // 15-20 ended after COLLECT: in no phase
    bind(20, false, 0), painted('a', 100, 100), // 20-30 began at 20 < scroll t0 25 (straddles the boundary): in no phase
    bind(30, true, 25), painted('a', 300, 100), // 30-40: scroll
    bind(40, true, 25), // 40-50: scroll, no paint
    bind(50, true, 25),
  ]);
  const r = analyzePaints(s, { idle: 0, scroll: 25, morph: null });
  assert.deepEqual(Object.keys(r.phases), ['idle', 'scroll'], 'a phase without t0 (no idle phase) is left out');
  assert.equal(r.phases.idle.frames, 1);
  assert.equal(r.phases.idle.mpx, 0.01);
  assert.equal(r.phases.scroll.frames, 2);
  assert.equal(r.phases.scroll.framesWithPaint, 1);
  assert.equal(r.phases.scroll.mpx, 0.03);
  assert.equal(r.unassignedPaints, 2);
  assert.deepEqual(r.phases.scroll.layerCount, { start: null, end: null, max: null }, 'no layer list: counts stay null');
});

test('analyzePaints: LayerTree enabled but no layerPainted at all: zeros, not missing', () => {
  const r = analyzePaints(stream([tree('a'), bind(1, true, 1), bind(17.7, true, 1), bind(34.4, true, 1)]), { scroll: 1 });
  assert.equal(r.layerPaintedEvents, 0);
  assert.equal(r.phases.scroll.frames, 2);
  assert.equal(r.phases.scroll.paints, 0);
  assert.equal(r.phases.scroll.mpx, 0);
  assert.equal(r.phases.scroll.frameMpxP50, 0);
  assert.deepEqual(r.phases.scroll.perLayer, {});
  assert.equal(r.source, null, 'no layerPainted and no paintCount: no source, zeros');
});

test('paintSource: layerPainted wins; else a list with paintCount; else null', () => {
  assert.equal(paintSource(stream([counted(['a', 1, 1, 1]), painted('a', 1, 1)])), 'layerPainted');
  assert.equal(paintSource(stream([counted(['a', 1, 1, 1])])), 'paintCount');
  assert.equal(paintSource(stream([tree('a'), bind(1, true, 1)])), null);
});

test('analyzePaints, paintCount source (no layerPainted, as on Chrome 148+): paints are paintCount rises between lists, no clip area', () => {
  const s = stream([
    counted(['doc', 1290, 9000, 5], ['nav', 1290, 300, 2]), // the reference list (enable)
    bind(100, true, 100),
    counted(['doc', 1290, 9000, 6], ['nav', 1290, 300, 4]), // frame 100: doc +1, nav +2
    bind(116.7, true, 100),
    counted(['doc', 1290, 9000, 6], ['nav', 1290, 300, 4], ['pop', 600, 600, 3]), // frame 116.7: a new layer (3 paints since it appeared)
    bind(133.4, true, 100),
    bind(150.1, true, 100), // a quiet frame: no list
    counted(['doc', 1290, 9000, 7], ['pop', 600, 600, 3]), // frame 150.1: doc +1 after 2 frames without a list; nav removed
    bind(166.8, true, 100),
  ]);
  const r = analyzePaints(s, { scroll: 100 }, { w: 1290, h: 2000 });
  assert.equal(r.source, 'paintCount');
  assert.equal(r.layerPaintedEvents, 0);
  assert.equal(r.countedPaints, 7, '1 + 2 + 3 (new layer) + 1');
  const p = r.phases.scroll;
  assert.deepEqual([p.frames, p.framesWithPaint, p.paints, p.newLayerPaints], [4, 2, 4, 3], 'the new layer\'s first count is flagged, not a steady paint');
  assert.deepEqual([p.mpx, p.frameMpxMax, p.frameMpxP50], [null, null, null], 'no clip area without layerPainted');
  // frame 100: doc 1290x9000 + nav 1290x300 = 11.997 Mpx; frame 150.1: doc 11.61 Mpx
  assert.deepEqual([p.layerMpx, p.frameLayerMpxMax], [23.607, 11.997]);
  // capped to the 1290x2000 viewport per dimension: doc 1290x2000 = 2.58, nav 1290x300 = 0.387
  assert.deepEqual([p.layerVpMpx, p.frameLayerVpMpxMax], [5.547, 2.967]);
  assert.deepEqual(r.frames.scroll, [[100, 16.7, 3, null, 11.997, 2, 0, 'doc'], [116.7, 16.7, 0, null, 0, 3, 1, null], [133.4, 16.7, 0, null, 0, 3, 0, null], [150.1, 16.7, 1, null, 11.61, 2, -1, 'doc']]);
  assert.deepEqual([p.layersAdded, p.layersRemoved, p.layerChurn], [1, 1, 2]);
  assert.deepEqual(p.perLayer.pop, { paints: 0, newPaints: 3, mpx: null, layerMpx: 0, w: 600, h: 600, backendNodeId: 21 });
  assert.deepEqual(p.perLayer.doc, { paints: 2, mpx: null, layerMpx: 23.22, w: 1290, h: 9000, backendNodeId: 20 });
  assert.deepEqual(p.topLayers, [{ layerId: 'doc', paints: 2, w: 1290, h: 9000 }, { layerId: 'nav', paints: 2, w: 1290, h: 300 }], 'by paints, then layer size');
  assert.equal(p.layersPainted, 2, 'the new layer only has first-count paints');
  assert.deepEqual(r.tagFrames.scroll[0].topLayer, { layerId: 'doc', mpx: null, layerMpx: 11.61 });
  // the doc +1 list came 2 frames after the previous list: placed at the frame it arrived in, flagged
  assert.equal(r.binding, 'interval');
  assert.deepEqual(r.intervals, { lists: 3, withPaints: 3, spanGt1: 1, spanGt1Share: 0.333 });
  assert.deepEqual(topLayerIds(r.phases), ['doc', 'nav', 'pop'], 'by painted layer Mpx without clip area');
});

test('analyzePaints, paintCount source: one list per painting frame is binding "frame"; a count reset counts the new value', () => {
  const s = stream([counted(['a', 10, 10, 4]), bind(1, true, 1), counted(['a', 10, 10, 5]), bind(17.7, true, 1), counted(['a', 10, 10, 2]), bind(34.4, true, 1)]);
  const r = analyzePaints(s, { scroll: 1 });
  assert.equal(r.binding, 'frame');
  assert.deepEqual(r.intervals, { lists: 2, withPaints: 2, spanGt1: 0, spanGt1Share: 0 });
  assert.equal(r.phases.scroll.paints, 3, '+1, then a reset to 2 counts 2');
  // a layer that left the list and comes back is a new layer: its count is newLayerPaints, not a steady rise
  const back = analyzePaints(stream([counted(['a', 10, 10, 4], ['b', 5, 5, 9]), bind(1, true, 1), counted(['a', 10, 10, 4]), bind(17.7, true, 1),
    counted(['a', 10, 10, 4], ['b', 5, 5, 9]), bind(34.4, true, 1)]), { scroll: 1 });
  assert.deepEqual([back.phases.scroll.paints, back.phases.scroll.newLayerPaints, back.phases.scroll.layersRemoved, back.phases.scroll.layerChurn], [0, 9, 1, 2]);
});

test('topLayerIds: by summed Mpx over all phases; nodeLabel: tag#id.classes without svelte-*', () => {
  const phases = { a: { perLayer: { x: { mpx: 1 }, y: { mpx: 0.5 } } }, b: { perLayer: { y: { mpx: 1 }, z: { mpx: 0.1 } } } };
  assert.deepEqual(topLayerIds(phases), ['y', 'x', 'z']);
  assert.deepEqual(topLayerIds(phases, 1), ['y']);
  assert.equal(nodeLabel({ nodeName: 'SECTION', localName: 'section', attributes: ['id', 'hero', 'class', 'hero svelte-x9 is-on'] }), 'section#hero.hero.is-on');
  assert.equal(nodeLabel({ nodeName: 'DIV', attributes: [] }), 'div');
  assert.equal(nodeLabel(null), null);
});

test('PAINT_ARM / PAINT_DISARM in node:vm: one binding call per rAF with [t, __perf.on, __perf.t0], once per document, stops', () => {
  const calls = [];
  let cbs = [];
  const ctx = { window: null, requestAnimationFrame: (f) => cbs.push(f), JSON, innerWidth: 430, innerHeight: 932, devicePixelRatio: 3 };
  ctx.window = ctx;
  ctx[PAINT_BINDING] = (s) => calls.push(JSON.parse(s));
  vm.createContext(ctx);
  const frame = (t) => { const c = cbs; cbs = []; for (const f of c) f(t); };
  assert.equal(vm.runInContext(PAINT_ARM, ctx), true);
  assert.equal(vm.runInContext(PAINT_ARM, ctx), false, 'armed once per document');
  frame(10);
  ctx.__perf = { on: true, t0: 5 };
  frame(26.7);
  assert.deepEqual({ ...vm.runInContext(PAINT_DISARM, ctx) }, { armed: true, w: 430, h: 932, dpr: 3 }, 'stops; reports the CSS viewport and the emulated DPR');
  frame(43.4);
  frame(60);
  assert.deepEqual(calls, [[10, false, null], [26.7, true, 5]]);
  assert.equal(cbs.length, 0, 'no rAF scheduled after DISARM');
});

test('PAINT_LAYER_SCALE in node:vm: the page devicePixelRatio (read before the emulation: the host DSF, the layer px scale)', () => {
  const ctx = { devicePixelRatio: 2 };
  ctx.window = ctx;
  vm.createContext(ctx);
  assert.equal(vm.runInContext(PAINT_LAYER_SCALE, ctx), 2);
  assert.match(PAINT_LAYER_SCALE, /__fwPaint/, 'marked as a paint-rects command (the e2e default-sequence filter)');
});

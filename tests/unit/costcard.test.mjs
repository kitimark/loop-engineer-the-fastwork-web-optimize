// tools/lib/costcard.mjs (incident I-083): the rendering cost card's parsing, per-event cutting, normalisation, area
// sums, VOID paths, source selection (README §6.2) and the md writer, on small synthetic traces and Timeline records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { REPO } from '../helpers.mjs';
import {
  eventSpans, fireTimes, loadVoid, tickRecordPerEvent, quadArea, clipRectArea, failureReasons, chromeThreads, foldBE,
  chromeEventWindows, chromeWindowCounts, chromeAnimations, chromeLayerCensus, simFlatten, simEventWindows, simWindowCounts,
  simLayerCensus, perEvent, preCutByKind, aaTolerance, sourceMode, buildCard, renderMarkdown, loadRowValues, fmt, threadReading,
} from '../../tools/lib/costcard.mjs';

const URL_ = 'https://localhost:5300/_app/immutable/nodes/2.TEST.js';
const S = 1e6; // µs per s
// ---- a synthetic Chrome trace: renderer pid 1 (main tid 7, compositor tid 9), a second idle renderer pid 2 ----------
// The element's 1 s callback starts at 1-based line 100 (FunctionCall lineNumber 100, the 1-based reading); its code
// range is lines 100-200. Fires at 1..7 s -> 6 full events; per event: `calls[i]` extra code calls (line 150), one Layout
// (dirtyObjects 5), two Paints (nodeId 42 = the element, clip 100x50; nodeId 7 = elsewhere, clip 400x800), 10 main frames,
// one rAF that runs element code; an off-range call (line 900) and a call in another file per event.
function chromeTrace({ fireLine = 100, calls = [3, 3, 10, 3, 3, 3], fires = [1, 2, 3, 4, 5, 6, 7], extra = [] } = {}) {
  const ev = [
    { ph: 'M', name: 'thread_name', pid: 1, tid: 7, args: { name: 'CrRendererMain' } },
    { ph: 'M', name: 'thread_name', pid: 1, tid: 9, args: { name: 'Compositor' } },
    { ph: 'M', name: 'thread_name', pid: 2, tid: 7, args: { name: 'CrRendererMain' } },
    { ph: 'X', name: 'FunctionCall', pid: 2, tid: 7, ts: 1.5 * S, dur: 10, args: { data: { url: URL_, lineNumber: fireLine } } },
  ];
  const fc = (ts, line, url = URL_, dur = 100) => ({ ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts, dur, args: { data: { url, lineNumber: line } } });
  fires.forEach((f, i) => {
    const t = f * S;
    ev.push({ ph: 'X', name: 'TimerFire', pid: 1, tid: 7, ts: t - 5, dur: 500 }, fc(t, fireLine));
    if (i < fires.length - 1) {
      for (let k = 0; k < calls[i]; k++) ev.push(fc(t + 1000 + k * 10, 150, URL_, 5));
      ev.push(fc(t + 2000, 900), fc(t + 2100, 3, 'https://localhost:5300/_app/immutable/chunks/other.js'));
      ev.push({ ph: 'B', name: 'Layout', pid: 1, tid: 7, ts: t + 3000, args: { beginData: { dirtyObjects: 5, totalObjects: 900 } } }, { ph: 'E', name: 'Layout', pid: 1, tid: 7, ts: t + 3400 });
      ev.push({ ph: 'X', name: 'UpdateLayoutTree', pid: 1, tid: 7, ts: t + 2500, dur: 200, args: { elementCount: 12 } });
      ev.push({ ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: t + 4000, dur: 300, args: { data: { nodeId: 42, layerId: 0, clip: [0, 0, 100, 0, 100, 50, 0, 50] } } });
      ev.push({ ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: t + 4500, dur: 300, args: { data: { nodeId: 7, layerId: 0, clip: [0, 0, 400, 0, 400, 800, 0, 800] } } });
      for (let k = 0; k < 10; k++) ev.push({ ph: 'X', name: 'BeginMainThreadFrame', pid: 1, tid: 7, ts: t + 50000 + k * 100000, dur: 10 });
      ev.push({ ph: 'X', name: 'FireAnimationFrame', pid: 1, tid: 7, ts: t + 60000, dur: 1000 }, fc(t + 60100, 160, URL_, 50));
      ev.push({ ph: 'X', name: 'Layerize', pid: 1, tid: 7, ts: t + 70000, dur: 50 }, { ph: 'X', name: 'Commit', pid: 1, tid: 9, ts: t + 71000, dur: 50 });
    }
  });
  return [...ev, ...extra];
}

test('eventSpans: T instances, partial ends dropped, VOID on irregular and short', () => {
  assert.deepEqual(eventSpans([3, 1, 2, 4, 5], { T: 1, minEvents: 4 }).spans, [[1, 2], [2, 3], [3, 4], [4, 5]]);
  assert.deepEqual(eventSpans([1, 1.4, 2, 2.4, 3, 3.4], { T: 2, minEvents: 2 }).spans, [[1, 2], [1.4, 2.4], [2, 3], [2.4, 3.4]]);
  assert.match(eventSpans([], {}).void, /no element events/);
  assert.match(eventSpans([0, 1e6, 2.5e6], { spanUs: [850e3, 1150e3], minEvents: 1 }).void, /irregular events \(1500 ms\)/);
  assert.match(eventSpans([0, 1, 2], { minEvents: 4 }).void, /2 full events < 4/);
});

test('fireTimes: both line bases tried, both hit = ambiguous (perLoad rule)', () => {
  const at = (hits) => (ln) => hits[ln] || [];
  assert.deepEqual(fireTimes(at({ 100: [1, 2] }), 100), { times: [1, 2], lineBase: 1 });
  assert.deepEqual(fireTimes(at({ 99: [1, 2] }), 100), { times: [1, 2], lineBase: 0 });
  assert.equal(fireTimes(at({ 99: [1], 100: [2] }), 100).void, 'ambiguous fire line');
  assert.equal(fireTimes(at({}), 100).void, 'no interval fires found');
});

test('loadVoid: FRZ needs the element-runs check; timers must match T', () => {
  assert.equal(loadVoid({ mode: 'freeze', elementRuns: 0 }), 'element stopped in FRZ');
  assert.equal(loadVoid({ mode: 'freeze' }), 'FRZ element-runs check missing');
  assert.equal(loadVoid({ mode: 'freeze', countdownScreenChanges: 2 }), null);
  assert.equal(loadVoid({ mode: 'full', timers: 2 }, { T: 1 }), 'timers 2, expected 1');
  assert.equal(loadVoid({ hashMismatch: true }), 'hash mismatch');
  assert.equal(loadVoid({ void: 'served abc' }), 'served abc');
});

test('tickRecordPerEvent reproduces judge-tick.mjs perLoad() (P-076 reference) on synthetic records', async () => {
  const ref = join(REPO, 'research/architecture/isolated-measurement/judge-tick.mjs');
  if (!existsSync(ref)) return; // a checkout without research/ (none today)
  const { perLoad } = await import(pathToFileURL(ref).href);
  const fires = (n, T = 1, t0 = 1e6) => Array.from({ length: n * T }, (_, i) => t0 + Math.floor(i / T) * 1e6 + (i % T) * 300e3);
  const cd = (f) => f.flatMap((t, i) => Array.from({ length: 5 + (i % 3) }, (_, k) => t + k * 1000));
  const recs = [
    { build: 'C', mode: 'full', timers: 1, fires0: [], fires1: fires(7), countdownScreenChanges: 0 },
    { build: 'S', mode: 'full', timers: 2, fires0: fires(6, 2), fires1: [] },
    { build: 'C', mode: 'freeze', timers: 1, fires0: [], fires1: fires(7), countdownScreenChanges: 2 },
    { build: 'C', mode: 'freeze', timers: 1, fires0: [], fires1: fires(7), countdownScreenChanges: 0 },
    { build: 'C', mode: 'full', timers: 1, fires0: [1], fires1: [2] },
    { build: 'C', mode: 'full', timers: 2, fires0: [], fires1: fires(7) },
    { build: 'C', mode: 'full', timers: 1, fires0: [], fires1: fires(3) },
    { build: 'C', mode: 'full', timers: 1, fires0: [], fires1: [1e6, 2e6, 3.6e6, 4.6e6, 5.6e6, 6.6e6] },
    { build: 'C', mode: 'full', timers: 1, fires0: [], fires1: [] },
  ].map((r) => ({ ...r, cd: cd([...r.fires0, ...r.fires1]) }));
  const ev = { kind: 'fire', name: 'tick', instances: { C: 1, S: 2 } };
  for (const r of recs) {
    const a = perLoad(r), b = tickRecordPerEvent(r, ev);
    // generic wording (the element is not always a countdown with 1 s fires); the VOID cases themselves are perLoad's
    const same = { 'countdown stopped in FRZ': 'element stopped in FRZ', 'FRZ clock check missing': 'FRZ element-runs check missing' };
    if (a.void) { assert.equal(b.void, same[a.void] ?? a.void.replace(' full seconds < ', ' full events < ').replace('irregular fires', 'irregular events'), JSON.stringify(r).slice(0, 80)); continue; }
    assert.equal(b.void, undefined);
    assert.deepEqual(b.eventValues, a.seconds);
    assert.equal(b.perEvent.codeCalls, a.perSecond);
  }
});

test('quad areas: bbox area, intersection with an element rect, disjoint 0', () => {
  assert.equal(quadArea([0, 0, 10, 0, 10, 5, 0, 5]), 50);
  assert.equal(quadArea(null), 0);
  assert.equal(clipRectArea([0, 0, 100, 0, 100, 100, 0, 100], { x: 50, y: 50, w: 100, h: 100 }), 2500);
  assert.equal(clipRectArea([0, 0, 10, 0, 10, 10, 0, 10], { x: 20, y: 0, w: 5, h: 5 }), 0);
});

test('failureReasons: CompositorAnimations::FailureReason bits by name', () => {
  assert.deepEqual(failureReasons((1 << 13) | (1 << 5)), ['TargetHasInvalidCompositingState', 'UnsupportedCSSProperty']);
  assert.deepEqual(failureReasons(0), []);
  assert.deepEqual(failureReasons(1 << 25), ['bit25']);
});

test('Chrome: main thread pick, B/E folding, fire windows, per-event counts in the code range, element paints by nodeId', () => {
  const th = chromeThreads(chromeTrace());
  assert.equal(th.main, '1:7');
  assert.ok(th.X.some((e) => e.name === 'Layout' && e.dur === 400), 'B/E Layout folded to a complete event');
  const w = chromeEventWindows({ ...th, M: th.X }, { kind: 'fire', name: 'tick', url: 'nodes/2.TEST.js', line: 100, periodMs: 1000 }, {});
  assert.equal(w.lineBase, 1);
  assert.equal(w.windows.length, 6);
  const counts = w.windows.map((x) => chromeWindowCounts(th, x, { code: { url: 'nodes/2.TEST.js', lines: [100, 200] }, fileUrl: 'nodes/2.TEST.js', nodeIds: new Set([42]) }));
  const c = counts[0];
  assert.equal(c.codeCalls, 1 + 3 + 1, 'the fire + 3 calls + the rAF call; line 900 is out of range');
  assert.equal(c.fileCalls, 6);
  assert.equal(c.functionCalls, 7);
  assert.equal(c.layouts, 1); assert.equal(c.layoutObjects, 5);
  assert.equal(c.styleElements, 12);
  assert.equal(c.paints, 2); assert.equal(c.elementPaints, 1); assert.equal(c.elementCullArea, 5000); assert.equal(c.pageCullArea, 5000 + 320000);
  assert.equal(c.mainFrames, 10); assert.equal(c.rafFires, 1); assert.equal(c.rafWithCode, 1);
  assert.equal(c.commits, 1); assert.equal(c.layerizes, 1);
  const pe = perEvent(counts);
  assert.equal(pe.events, 6); assert.equal(pe.codeCalls, 5, 'median, the 10-call outlier event does not move it');
  assert.equal(pe.frameHz, 10); assert.equal(pe.rafHz, 1);
  // 0-based reading: the fire at line 99
  const th0 = chromeThreads(chromeTrace({ fireLine: 99 }));
  assert.equal(chromeEventWindows({ ...th0, M: th0.X }, { kind: 'fire', name: 'tick', url: 'nodes/2.TEST.js', line: 100 }, {}).lineBase, 0);
});

test('Chrome: mark windows run to the next marker, the end marker closes; per-frame kinds divide by main frames', () => {
  const mk = (ts, m) => ({ ph: 'I', name: 'TimeStamp', pid: 1, tid: 7, ts, args: { data: { message: `fwcc mark ${m}` } } });
  const th = chromeThreads(chromeTrace({ extra: [mk(1.1 * S, 'push-1'), mk(2.1 * S, 'push-n'), mk(3.1 * S, 'push-n'), mk(4.1 * S, 'hold'), mk(6.1 * S, 'end')] }));
  const w = chromeEventWindows({ ...th, M: th.X }, { kind: 'mark' }, {});
  assert.deepEqual(w.windows.map((x) => x.kind), ['push-1', 'push-n', 'push-n', 'hold']);
  assert.equal(w.windows[3].t1, 6.1 * S);
  const r = loadRowValues({ traceEvents: chromeTrace({ extra: [mk(1.1 * S, 'push-1'), mk(2.1 * S, 'push-n'), mk(3.1 * S, 'push-n'), mk(4.1 * S, 'hold'), mk(6.1 * S, 'end')] }) }, { element: 'nav', event: { kind: 'mark', perFrame: ['hold'] } });
  assert.deepEqual(Object.keys(r.kinds).sort(), ['hold', 'hold-frame', 'push-1', 'push-n']);
  assert.equal(r.kinds['hold-frame'].mainFrames, 20);
  assert.equal(r.kinds['hold-frame'].layouts, 2 / 20);
  assert.match(chromeEventWindows({ ...th, M: th.X }, { kind: 'mark', prefix: 'nope ' }, {}).void, /no "nope " marks/);
});

test('Chrome Animation events: failure mask and properties from the instant event, filtered by node ids', () => {
  const a = (ph, id, data) => ({ ph, name: 'Animation', cat: 'blink.animations,devtools.timeline,benchmark,rail', pid: 1, tid: 7, ts: 1, id2: { local: id }, args: { data } });
  const ev = [a('b', '0x1', { id: '1', name: 'roll', nodeId: 42, nodeName: 'SPAN', state: 'running' }), a('n', '0x1', { compositeFailed: 1 << 13, unsupportedProperties: ['width'] }), a('e', '0x1', {}),
    a('b', '0x2', { id: '2', name: 'fade', nodeId: 7, state: 'running' })];
  const all = chromeAnimations(ev);
  assert.equal(all.length, 2);
  const el = chromeAnimations(ev, { nodeIds: new Set([42]) });
  assert.equal(el.length, 1);
  assert.deepEqual(el[0].reasons, ['UnsupportedCSSProperty']);
  assert.deepEqual(el[0].unsupportedProperties, ['width']);
  assert.equal(all.find((x) => x.name === 'fade').reasons.length, 0);
  // Chrome 154 shape (tests/chrome/costcard.chrome.test.mjs): a CSS animation's name in displayName, name "" (the WA id)
  const real = chromeAnimations([a('b', '0x27', { displayName: 'grow', id: '2', name: '', nodeId: 4, nodeName: "DIV id='w'", state: 'running' }),
    a('n', '0x27', { compositeFailed: 8224, unsupportedProperties: ['width'] }), a('n', '0x27', { state: 'running' })]);
  assert.deepEqual({ name: real[0].name, displayName: real[0].displayName, reasons: real[0].reasons }, { name: undefined, displayName: 'grow', reasons: ['TargetHasInvalidCompositingState', 'UnsupportedCSSProperty'] });
});

test('Chrome layer census: an estimate (drawing w x h x 4), rescaled from host layer px to CSS px x DPR^2', () => {
  const layers = [{ backendNodeId: 42, width: 200, height: 100, drawsContent: true, paintCount: 3 }, { backendNodeId: 42, width: 50, height: 50, drawsContent: false }, { backendNodeId: 7, width: 1000, height: 1000, drawsContent: true }];
  const el = chromeLayerCensus(layers, { nodeIds: new Set([42]), layerScale: 2, dpr: 3 });
  assert.equal(el.layers, 2); assert.equal(el.drawing, 1); assert.equal(el.paintCount, 3);
  assert.equal(el.estBytes, 200 * 100 * 4);
  assert.equal(el.estBytesAtDpr, (200 * 100 / 4) * 9 * 4);
  assert.equal(chromeLayerCensus(layers).attribution, 'page');
  assert.equal(chromeLayerCensus(layers).estBytesAtDpr, null, 'no layerScale: no DPR figure');
});

// ---- Sim Timeline: RenderingFrame records with nested work, seconds ---------------------------------------------------------
function simRecs() {
  const recs = [];
  for (let i = 0; i < 6; i++) {
    const t = 1 + i; // a tick every second
    recs.push({ type: 'TimerFire', startTime: t, endTime: t + 0.001, data: { timerId: 1 }, children: [{ type: 'FunctionCall', startTime: t, endTime: t + 0.001, data: { scriptName: URL_, scriptLine: 100 } }] });
    recs.push({ type: 'TimeStamp', startTime: t + 0.01, data: { message: i % 2 ? 'fwcc mark b' : 'fwcc mark a' } });
    for (let f = 0; f < 6; f++) {
      const ft = t + 0.02 + f * 0.1;
      recs.push({ type: 'RenderingFrame', startTime: ft, endTime: ft + 0.004, data: {}, children: [
        ...(f === 0 ? [{ type: 'FireAnimationFrame', startTime: ft, endTime: ft + 0.001, children: [{ type: 'FunctionCall', startTime: ft, endTime: ft + 0.001, data: { scriptName: URL_, scriptLine: 130 } }] },
          { type: 'RecalculateStyles', startTime: ft + 0.001, endTime: ft + 0.002 }, { type: 'Layout', startTime: ft + 0.002, endTime: ft + 0.0025 },
          { type: 'Paint', startTime: ft + 0.003, endTime: ft + 0.0035, data: { clip: [0, 0, 200, 0, 200, 100, 0, 100] } }] : []),
        { type: 'Paint', startTime: ft + 0.0036, endTime: ft + 0.0037, data: { clip: [0, 500, 400, 500, 400, 600, 0, 600] } },
        { type: 'Composite', startTime: ft + 0.0038, endTime: ft + 0.004 }] });
    }
  }
  return recs;
}
test('Sim Timeline: flatten with frame index, fire windows, paint clip ∩ element rect in device Mpx, frames running element code', () => {
  const flat = simFlatten(simRecs());
  assert.ok(flat.every((r, i) => !i || r.t >= flat[i - 1].t));
  const w = simEventWindows(flat, { kind: 'fire', name: 'tick', url: 'nodes/2.TEST.js', line: 100, periodMs: 1000 }, {});
  assert.equal(w.windows.length, 5);
  const c = simWindowCounts(flat, w.windows[0], { code: { url: 'nodes/2.TEST.js', lines: [100, 200] }, rect: { x: 100, y: 0, w: 300, h: 300 }, dpr: 3 });
  assert.equal(c.renderingFrames, 6); assert.equal(c.codeCalls, 2); assert.equal(c.framesWithCode, 1);
  assert.equal(c.paints, 7); assert.equal(c.elementPaints, 1);
  assert.equal(c.elementPaintMpx, (100 * 100 * 9) / 1e6);
  assert.equal(c.styleRecalcs, 1); assert.equal(c.layouts, 1); assert.equal(c.composites, 6);
  const m = simEventWindows(flat, { kind: 'mark' }, {});
  assert.deepEqual([...new Set(m.windows.map((x) => x.kind))], ['a', 'b']);
  assert.deepEqual(simLayerCensus([{ memory: 1000, paintCount: 2 }, { memory: 24, paintCount: 1 }], { 1: { transformAnimation: true }, 2: {} }), { layers: 2, memoryBytes: 1024, paintCount: 3, animationReasonLayers: 1, attribution: 'element' });
});

test('perEvent per-frame normalisation and pre-cut probe windows (fix-nav-morph shape)', () => {
  const by = preCutByKind([{ kind: 'push-n', ms: 300, mainFrames: 18, layouts: 2, paintArea: 1e6, functionCallsNode2: 4, listenerOps: ['add touchmove window active capture'] }, { kind: 'push-n', ms: 300, mainFrames: 18, layouts: 4, paintArea: 3e6, functionCallsNode2: 6, listenerOps: [] }, { kind: 'push-n', ms: 300, mainFrames: 18, layouts: 3, paintArea: 2e6, functionCallsNode2: 5, listenerOps: [] }, { kind: 'hold', ms: 4000, mainFrames: 40, layouts: 8 }]);
  const pn = perEvent(by['push-n']);
  assert.equal(pn.layouts, 3); assert.equal(pn.pageCullArea, 2e6); assert.equal(pn.fileCalls, 5); assert.equal(pn.listenerOpsN, 0);
  const hf = perEvent(by.hold, { perFrame: true });
  assert.equal(hf.layouts, 0.2); assert.equal(hf.mainFrames, 40); assert.equal(hf.frameHz, 10);
});

test('A/A tolerance: max(2·|C−C2|, 2), low-power when tol > C/2, floor without an A/A arm', () => {
  assert.deepEqual(aaTolerance(10, 7), { tol: 6, aa: 3, source: 'aa', lowPower: true });
  assert.equal(aaTolerance(28, 28).tol, 2);
  assert.equal(aaTolerance(28, null).source, 'none');
});

test('sourceMode: frame-driven counts FULL only; script FULL unless the family check passed; other fields FRZ first', () => {
  assert.equal(sourceMode('mainFrames', ['freeze']), null);
  assert.equal(sourceMode('mainFrames', ['freeze', 'full']), 'full');
  assert.equal(sourceMode('codeCalls', ['freeze', 'full']), 'full');
  assert.equal(sourceMode('codeCalls', ['freeze', 'full'], { scriptFromFrz: 'P-076' }), 'freeze');
  assert.equal(sourceMode('layouts', ['freeze', 'full']), 'freeze');
  assert.equal(sourceMode('styleElements', ['full']), 'full');
});

test('buildCard: arms, A/A deltas, VOID loads listed, FRZ for element fields, FULL for frames, md table with the five fields', () => {
  const tr = (calls) => chromeTrace({ calls });
  const loads = [
    { arm: 'C', rep: 1, mode: 'full', traceEvents: tr([3, 3, 3, 3, 3, 3]), nodeIds: { el: [42] }, census: { layers: [{ backendNodeId: 42, width: 200, height: 100, drawsContent: true }] }, layerScale: 2 },
    { arm: 'C', rep: 1, mode: 'freeze', elementRuns: 2, traceEvents: tr([3, 3, 3, 3, 3, 3]), nodeIds: { el: [42] } },
    { arm: 'C2', rep: 1, mode: 'full', traceEvents: tr([4, 4, 4, 4, 4, 4]), nodeIds: { el: [42] } },
    { arm: 'V', rep: 1, mode: 'full', traceEvents: tr([0, 0, 0, 0, 0, 0]), nodeIds: { el: [42] } },
    { arm: 'V', rep: 1, mode: 'freeze', elementRuns: 2, traceEvents: tr([0, 0, 0, 0, 0, 0]), nodeIds: { el: [42] } },
    { arm: 'V', rep: 2, mode: 'freeze', traceEvents: tr([0, 0, 0, 0, 0, 0]) }, // no element-runs check: VOID
    { arm: 'X', rep: 1, mode: 'full', traceEvents: tr([0]) }, // not an arm of the card
  ];
  const spec = { topic: 'demo', arms: ['C', 'V'], control: 'C', aa: 'C2', rows: [{ element: 'clock', event: { kind: 'fire', name: 'tick', url: 'nodes/2.TEST.js', line: 100, periodMs: 1000 }, code: { url: 'nodes/2.TEST.js', lines: [100, 200] }, nodes: ['el'] }] };
  const card = buildCard(spec, loads, { now: '2026-10-03T00:00:00Z', inputs: ['a.json'] });
  assert.equal(card.rows.length, 1);
  assert.deepEqual(card.voids, [{ element: 'clock', load: 'V/chrome/FRZ/r2', void: 'FRZ element-runs check missing' }]);
  assert.deepEqual(card.skipped, ['X/r1']);
  const R = card.rows[0];
  assert.deepEqual(R.modes, ['freeze', 'full']);
  assert.equal(R.arms.C.full.metrics.codeCalls.median, 5);
  assert.equal(R.arms.V.full.delta.codeCalls.d, -3);
  assert.equal(R.arms.V.full.delta.codeCalls.tol, 2, 'C 5 vs C2 6: 2·1 = 2');
  assert.equal(R.arms.V.full.delta.codeCalls.beyondAA, true);
  assert.equal(R.fields[5].codeCalls.C.mode, 'full', 'script from FULL by default');
  assert.equal(R.fields[4].layouts.C.mode, 'freeze', 'layout from FRZ when present');
  assert.equal(R.fields[3].elementPaints.V.mode, 'freeze');
  assert.equal(R.fields[0].mainFrames.C.mode, 'full');
  assert.equal(R.fields[2].C.layers.median, 1);
  assert.match(R.fields[1].C.text, /main thread per event \(5 element code calls per event\)/);
  assert.equal(R.fields[1].C.status, 'OBSERVED');
  assert.match(R.aaSource.full, /C vs C2, chrome FULL, loads 1\/1/);
  assert.match(R.aaSource.freeze, /none: 2-count floor only \(chrome FRZ, no C2 loads\)/);
  const md = renderMarkdown(card);
  assert.match(md, /^# Rendering cost card: demo/);
  assert.match(md, /\| Element \/ event \| Engine \| 1 Thread \| 2 Layers, memory \| 3 Repaint per event \| 4 Layout per event \| 5 Script per event \| Page around it \(FULL only\) \| A\/A source \|/);
  assert.match(md, /\| clock \/ tick \| chrome \|/);
  assert.match(md, /element code FunctionCalls, FULL: C 5 · V 2 \(-3\)/);
  assert.match(md, /paint cull-rect area, whole page \(layer px², upper bound, not element-attributed\)/);
  assert.match(md, /main frames: C 10 · V 10 \(\+0, within A\/A\)/);
  assert.match(md, /frame rate Hz: C 10/);
  assert.match(md, /rAF rate Hz: C 1/);
  assert.match(md, /VOID loads \(left out\)[\s\S]*clock, V\/chrome\/FRZ\/r2: FRZ element-runs check missing/);
  assert.match(md, /Fire line base: 1-based/);
  assert.match(md, /OBSERVED for a CSS width animation .* "no failure reason" is never read as "composited"/);
  assert.match(md, /C: 1 layers \(1 drawing\), est\. 180 kB at DPR 3/);
});

test('buildCard on pre-cut windows (fix-nav-morph): push-n per load median, hold-frame, census summary by key, no A/A arm', () => {
  const load = (build, rep, k) => ({ build, rep, windows: [{ kind: 'start', ms: 1200, mainFrames: 80, layouts: 4 * k }, { kind: 'push-1', ms: 320, mainFrames: 20, layouts: 6 * k }, { kind: 'push-n', ms: 320, mainFrames: 20, layouts: 1 * k }, { kind: 'push-n', ms: 320, mainFrames: 20, layouts: 3 * k }, { kind: 'hold', ms: 4000, mainFrames: 40, layouts: 4 * k }],
    census: { layers: 30, drawing: 20, estBytes: 9e6, by: { panel: { layers: 2, drawing: 2, estBytes: 1e6, paintCount: 1 }, nav: { layers: 1, drawing: 1, estBytes: 5e5, paintCount: 0 }, platform: { layers: 0, drawing: 0, estBytes: 0, paintCount: 0 } } } });
  const card = buildCard({ rows: [{ element: 'nav morph', event: { kind: 'mark', perFrame: ['hold'] }, census: ['panel', 'nav', 'platform'] }] }, [load('C', 1, 1), load('C', 2, 1), load('V', 1, 0), load('V', 2, 0), { build: 'V', rep: 3, void: 'serves abc / def' }]);
  assert.deepEqual(card.arms, ['C', 'V']);
  assert.deepEqual(card.rows.map((r) => r.event), ['start', 'push-1', 'push-n', 'hold', 'hold-frame']);
  const pn = card.rows.find((r) => r.event === 'push-n');
  assert.equal(pn.arms.C.full.metrics.layouts.median, 2);
  assert.equal(card.rows.find((r) => r.event === 'hold-frame').arms.C.full.metrics.layouts.median, 0.1);
  assert.deepEqual({ layers: pn.fields[2].C.layers.median, est: pn.fields[2].C.estBytes.median }, { layers: 3, est: 1.5e6 });
  assert.match(pn.aaSource.full, /none: 2-count floor only/);
  assert.equal(card.voids[0].void, 'serves abc / def');
  const md = renderMarkdown(card);
  assert.match(md, /Pre-cut windows: the probe's own per-window counts are taken as given/);
  assert.match(md, /nav morph \/ hold-frame/);
});

test('pre-cut loads may carry the trace Animation reads (load.anims): failure bits named, field 1 reads them', () => {
  const w = [{ kind: 'cycle', ms: 5000, mainFrames: 300, paints: 2 }, { kind: 'cycle', ms: 5000, mainFrames: 300, paints: 2 }];
  const card = buildCard({ rows: [{ element: 'glint', event: { kind: 'mark' } }] }, [
    { build: 'C', rep: 1, windows: w, anims: [{ name: 'glint', nodeName: 'DIV', compositeFailed: 1 << 13, unsupportedProperties: ['background-position'] }], animsAttributed: true },
    { build: 'V', rep: 1, windows: w, anims: [{ name: 'glint', nodeName: 'DIV' }] },
  ]);
  const r = card.rows.find((x) => x.event === 'cycle');
  assert.deepEqual(r.arms.C.full.anims[0].reasons, ['UnsupportedCSSProperty']);
  assert.equal(r.arms.V.full.anims[0].compositeFailed, 0);
  assert.match(r.fields[1].C.text, /1 of 1 element animations not composited: UnsupportedCSSProperty \(properties background-position\)/);
  assert.match(r.fields[1].V.text, /no failure reason in the trace \(composited\? not proven/);
  assert.match(renderMarkdown(card), /C animations: glint on DIV: UnsupportedCSSProperty/);
});

test('fmt: integers plain, one decimal from 10, two below', () => {
  assert.equal(fmt(28), '28'); assert.equal(fmt(28.5), '28.5'); assert.equal(fmt(0.123), '0.12'); assert.equal(fmt(1234.5), '1235'); assert.equal(fmt(null), '-');
});

test('foldBE keeps nesting by name and X events untouched', () => {
  const f = foldBE([{ ph: 'B', name: 'Layout', ts: 1 }, { ph: 'B', name: 'Layout', ts: 2 }, { ph: 'E', name: 'Layout', ts: 3 }, { ph: 'E', name: 'Layout', ts: 5 }, { ph: 'X', name: 'Paint', ts: 4, dur: 1 }]);
  assert.deepEqual(f.map((e) => [e.name, e.ts, e.dur]), [['Layout', 1, 4], ['Layout', 2, 1], ['Paint', 4, 1]]);
});

test('threadReading: every frame vs per event vs none; failure reasons never read as composited when absent', () => {
  assert.match(threadReading({ codeCalls: 60, codePerFrame: 9, framesPerEvent: 10 }).text, /main thread every frame \(element code in 9 of 10 frames per event\)/);
  assert.match(threadReading({ codeCalls: 3, codePerFrame: 1, framesPerEvent: 10 }).text, /main thread per event/);
  const none = threadReading({ codeCalls: 0, anims: [{ compositeFailed: 0, reasons: [], unsupportedProperties: [] }], animsAttributed: true });
  assert.match(none.text, /no element script per event; 1 element animations, no failure reason in the trace \(composited\? not proven/);
  assert.equal(none.status, 'UNRESOLVED');
  const bad = threadReading({ anims: [{ compositeFailed: 1 << 13, reasons: ['UnsupportedCSSProperty'], unsupportedProperties: ['background-position'] }] });
  assert.match(bad.text, /1 of 1 page \(not element-attributed\) animations not composited: UnsupportedCSSProperty \(properties background-position\)/);
  assert.match(threadReading({}).text, /no thread evidence/);
});

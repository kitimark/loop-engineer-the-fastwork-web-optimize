// tools/lib/frame-tags.mjs (incident I-032): run.longFrames.<phase>, the per-frame tags of frames > 34 ms
// (scrollY, trace class, top LoAF script, paint area / top layer, layer delta), joined from the sources that
// have frame timestamps; none: null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longFrameTags, loafFor } from '../../tools/lib/frame-tags.mjs';

const LOAF = [
  { start: 990, duration: 30, render: 5, styleLayout: 2, scripts: [{ url: 'u', pos: 1, fn: 'a', dur: 10, forced: 0 }] },
  { start: 1040, duration: 60, render: 12, styleLayout: 9, scripts: [{ url: 'u', pos: 2, fn: 'small', dur: 5 }, { url: 'v', pos: 7, fn: 'big', dur: 40, forced: 18.4 }] },
];

test('loafFor: the LoAF overlapping the frame most, its longest script', () => {
  assert.deepEqual(loafFor({ t: 1030, dur: 50 }, LOAF), { dur: 60, script: 'v:7 big', scriptMs: 40, forcedMs: 18, renderMs: 12, styleLayoutMs: 9 });
  assert.deepEqual(loafFor({ t: 1030, dur: 50 }, LOAF, (s) => s.fn), { dur: 60, script: 'big', scriptMs: 40, forcedMs: 18, renderMs: 12, styleLayoutMs: 9 });
  assert.equal(loafFor({ t: 2000, dur: 50 }, LOAF), null);
  assert.equal(loafFor({ t: 1000, dur: 50 }, []), null);
});

test('no source with frame timestamps: null (a default run has frame durations only)', () => {
  assert.equal(longFrameTags({ loaf: LOAF }), null);
  assert.equal(longFrameTags(), null);
});

test('frame log is the base (the only scrollY): frames > 34 ms, ticks, joined with the trace and paint frames by start and duration', () => {
  // frame log rows are [tEnd, dt, scrollY]
  const frameLog = [[1016.7, 16.7, 0], [1030, 13.3, 0], [1080, 50, 250], [1116.7, 36.7, 500], [1150, 33.3, 700]];
  const trace = [{ t: 1030, dur: 50, dominant: 'style', top: [['UpdateLayoutTree', 21]], layerMs: 1, dropped: 0, partial: 1 }];
  const paint = [{ t: 1080.2, dur: 36.6, paints: 3, mpx: 2.5, layerMpx: 4, layers: 9, layersDelta: 2, topLayer: { layerId: 'L2', mpx: 2 } }];
  const tags = longFrameTags({ frameLog, trace, paint, loaf: LOAF, layerNodes: { L2: 'section#hero' } });
  assert.equal(tags.length, 2, '33.3 ms is not > 34');
  assert.deepEqual(tags[0], { t: 1030, dur: 50, ticks: 6, scrollY: 250, class: 'style', top: 'UpdateLayoutTree', layerMs: 1, dropped: 0, partial: 1,
    loaf: { dur: 60, script: 'v:7 big', scriptMs: 40, forcedMs: 18, renderMs: 12, styleLayoutMs: 9 }, paint: null, layers: null, layersDelta: null, source: 'frame-log' });
  assert.deepEqual(tags[1], { t: 1080, dur: 36.7, ticks: 4, scrollY: 500, class: null, top: null,
    loaf: { dur: 60, script: 'v:7 big', scriptMs: 40, forcedMs: 18, renderMs: 12, styleLayoutMs: 9 },
    paint: { paints: 3, mpx: 2.5, layerMpx: 4, topLayer: { layerId: 'L2', mpx: 2, node: 'section#hero' } }, layers: 9, layersDelta: 2, source: 'frame-log' });
});

test('without a frame log: paint-rects, then trace frames are the base; scrollY null; minMs', () => {
  const paint = [{ t: 100, dur: 16.7, paints: 0, mpx: 0, layers: 3, layersDelta: 0, topLayer: null }, { t: 116.7, dur: 40, paints: 2, mpx: 1.5, layers: 4, layersDelta: 1, topLayer: { layerId: 'x', mpx: 1 } }];
  const trace = [{ t: 116.7, dur: 40, dominant: 'paint', top: [['Paint', 9]], layerMs: 3, dropped: 1, partial: 0 }];
  const a = longFrameTags({ paint, trace });
  assert.equal(a.length, 1);
  assert.equal(a[0].source, 'paint-rects');
  assert.equal(a[0].scrollY, null);
  assert.equal(a[0].class, 'paint');
  assert.deepEqual(a[0].paint, { paints: 2, mpx: 1.5, layerMpx: null, topLayer: { layerId: 'x', mpx: 1, node: null } });
  const b = longFrameTags({ trace });
  assert.equal(b[0].source, 'trace-frames');
  assert.equal(b[0].ticks, 5);
  assert.equal(b[0].paint, null);
  assert.deepEqual(longFrameTags({ trace, minMs: 50 }), []);
});

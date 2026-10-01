// A deterministic raw page result of the std probe (what `iphone.mjs run` reads back from Safari before finish()),
// for the byte pins of tests/unit/iphone-run-device.test.mjs: frames with slow ones, mutation batches, crossings, an
// early log, a LAN href (lanSafeUrl), Resource Timing, battery reads and served hashes. All values are made up.
const FR = [];
let t = 1000, y = 0;
for (let i = 0; i < 120; i++) {
  const dt = i === 0 ? null : i === 40 ? 58.3 : i === 41 ? 41.7 : i === 90 ? 37.4 : 16.7;
  if (dt) t = Math.round((t + dt) * 10) / 10;
  const y0 = y;
  if (i >= 20 && i < 100) y = Math.min(1800, y + 25);
  FR.push([t, dt, y0, y, 775, null, i % 7 === 0 ? 2.4 : 0.3, i === 40 ? 1.6 : 0.2, 2900]);
}
export function makeRaw() {
  const frames = FR.map((f) => [...f]);
  const mark = (i) => frames[i][0];
  return {
    err: null,
    pre: { href: 'http://192.168.1.20:5300/', ua: 'FakeSafari/1.0', vw: 430, vh0: 775, dpr: 3, clock: { wallMs: 1759300000000, perfMs: 900 }, settings: { reducedMotion: false } },
    stateAtStart: { panel: true },
    early: { t0nav: 12, frames: [[10, null, 0], [30, 20, 0], [80, 50, 0], [97, 17, 0]], fonts: [], fontsStatus: 'loaded' },
    post: { href: 'http://192.168.1.20:5300/', resources: [['http://192.168.1.20:5300/_app/immutable/app.js', 'script', 1, 2, 3]] },
    tops: { platform: 2860 }, topsPost: { platform: 2860 },
    driverResult: { maxY: 1800, finalY: 1800 },
    probeVersion: 2, ySource: 'raf', yReads: { raf: frames.length, crossing: 0 },
    frames,
    batches: [[frames[40][0] - 3, 21, 2, 0, 1, 0, 1, 0, 0, 0, 0, 0, { 'data-x': 2 }], [frames[90][0] - 1, 0, 3, 1, 0, 0, 0, 0, 0, 1, 0, 0], [5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    crossings: [[frames[40][0] - 2, 'inert', 'div.panel', 'removed', 1000, true, 39], [frames[60][0] - 2, 'cv', 'section.commission', 'visible', 1500, false, 59]],
    marks: { idle: [mark(1), mark(19)], scroll: [mark(20), mark(100)], bottom: [mark(101), mark(119)] },
    t0: 900,
    macStartMs: 1759300000123,
    battery: { start: { t: '2026-10-01T00:00:00.000Z', Temperature: 3050, IsCharging: false, CurrentCapacity: 80, temperatureC: 30.5 }, end: { t: '2026-10-01T00:01:00.000Z', Temperature: 3100, IsCharging: false, CurrentCapacity: 79, temperatureC: 31 } },
    served: { '/_app/immutable/app.js': '0123456789abcdef' },
  };
}

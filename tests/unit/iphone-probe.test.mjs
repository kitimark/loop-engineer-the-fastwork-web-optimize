// `iphone.mjs run` (protocol v2 T1a): the pure Node side of tools/lib/iphone-probe.mjs (frame placement, uncapped
// mutation buckets, crossings, ticks, summaries), the argument parser and guards of tools/lib/iphone-run.mjs, and the
// in-page probe + drivers run in-process on the fake page of tests/fixtures/fake-run-dom.mjs (node:vm; no phone,
// no proxy, no lock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { createPage } from '../fixtures/fake-run-dom.mjs';
import * as P from '../../tools/lib/iphone-probe.mjs';
import { parseRunArgs, measureGuard, estimateMs, finish, toolVersion, TOOL_FILES, UNREADABLE_SETTINGS, parseBattery, deviceSettings, batteryInfo } from '../../tools/lib/iphone-run.mjs';

const MT = P.MUT_TYPES;
const counts = (o) => MT.map((k) => o[k] || 0);
const batch = (t, o, other = 0) => [t, ...counts(o), other];
// frames [t, dt, yStart, yEnd, innerHeight, m, rafJsMs, probeMs]
const fr = (ts, { y = (t) => t, m = () => null } = {}) => ts.map((t, k) => [t, k ? Math.round((t - ts[k - 1]) * 10) / 10 : null, k ? y(ts[k - 1]) : y(t), y(t), 815, m(k), k ? 0.5 : null, 0.1]);

test('frameIndexAt: row k holds t[k-1] <= x < t[k]; outside the frames -> null', () => {
  const f = fr([10, 18.3, 26.7, 60]);
  assert.equal(P.frameIndexAt(f, 9.9), null);
  assert.equal(P.frameIndexAt(f, 10), 1);
  assert.equal(P.frameIndexAt(f, 18.29), 1);
  assert.equal(P.frameIndexAt(f, 18.3), 2);
  assert.equal(P.frameIndexAt(f, 59.9), 3);
  assert.equal(P.frameIndexAt(f, 60), null);
  assert.equal(P.frameIndexAt([[1]], 1), null);
});

test('bucketMutations: per-frame counts by type with no cap, batches in one gap summed, other attrs named, outside kept', () => {
  const f = fr([0, 8.3, 16.7, 25, 33.3]);
  const b = [
    batch(9, { src: 21, inert: 1 }), batch(12, { class: 2, scene: 1, same: 5 }, { 'aria-hidden': 1 }),
    batch(17, { style: 3, tabindex: 4, render: 1, other: 2, childList: 6, text: 1 }, { 'aria-hidden': 1, 'data-x': 1 }),
    batch(40, { src: 1 }), batch(-1, { class: 1 }),
  ];
  const m = P.bucketMutations(f, b);
  assert.deepEqual(m.types, MT);
  assert.deepEqual(m.counts, [[2, ...counts({ src: 21, inert: 1, class: 2, scene: 1, same: 5 })], [3, ...counts({ style: 3, tabindex: 4, render: 1, other: 2, childList: 6, text: 1 })]]);
  assert.deepEqual(m.otherAttrs, [[2, { 'aria-hidden': 1 }], [3, { 'aria-hidden': 1, 'data-x': 1 }]]);
  assert.deepEqual(m.outside, counts({ src: 1, class: 1 }));
});

test('placeCrossings: time order, same-time rows keep record order, src "effect", frame index', () => {
  const f = fr([0, 8.3, 16.7]);
  const rows = [[10, 'scene', '#platform', 'active', 1960], [9, 'inert', 'div.start-selling-morph-panel', 'removed', 1960], [10, 'class', 'div.x', '+is-live', 1960], [99, 'cv', 'section.commission', 'rendered', 1250]];
  assert.deepEqual(P.placeCrossings(f, rows), [
    { frame: 2, t: 9, y: 1960, kind: 'inert', id: 'div.start-selling-morph-panel', value: 'removed', src: 'effect' },
    { frame: 2, t: 10, y: 1960, kind: 'scene', id: '#platform', value: 'active', src: 'effect' },
    { frame: 2, t: 10, y: 1960, kind: 'class', id: 'div.x', value: '+is-live', src: 'effect' },
    { frame: null, t: 99, y: 1250, kind: 'cv', id: 'section.commission', value: 'rendered', src: 'effect' },
  ]);
});

test('ticks: k = round(dt / 8.333); k >= 5 starts at 37.5 ms, k >= 7 at 54.2 ms', () => {
  assert.equal(P.TICK_MS, 1000 / 120);
  assert.equal(P.ticks(8.3), 1);
  assert.equal(P.ticks(16.7), 2);
  assert.equal(P.ticks(37.4), 4);
  assert.equal(P.ticks(37.5), 5);
  assert.equal(P.ticks(54.1), 6);
  assert.equal(P.ticks(54.2), 7);
});

test('summarize: phases count k>=5 / k>=7 and >34 / >50, the worst frame with +-2 neighbours, slow frames with the mutations and crossings of rows k-1 and k', () => {
  const ts = [0, 8.3, 16.7, 25, 33.3, 41.7, 50, 140, 148.3, 156.7, 165, 173.3];
  const frames = fr(ts, { y: (t) => Math.round(t * 10) });
  const doc = {
    frames, marks: { idle: [0, 30], scroll: [33.3, 173.3], open: [180] },
    mutations: P.bucketMutations(frames, [batch(45, { class: 1 }), batch(60, { src: 21, inert: 1, scene: 1, same: 1 })]),
    crossings: P.placeCrossings(frames, [[45, 'class', 'div.a', '+on', 450], [60, 'scene', '#platform', 'active', 1960], [60, 'inert', 'div.p', 'removed', 1960]]),
  };
  const s = P.summarize(doc);
  assert.deepEqual(Object.keys(s.phases), ['idle', 'scroll'], 'a phase without an end mark is not summarized');
  assert.equal(s.phases.idle.frames, 3);
  assert.equal(s.phases.idle.k5, 0);
  assert.deepEqual([s.phases.scroll.frames, s.phases.scroll.k5, s.phases.scroll.k7, s.phases.scroll.gt34, s.phases.scroll.gt50, s.phases.scroll.max, s.phases.scroll.maxY], [8, 1, 1, 1, 1, 90, 1400]);
  assert.deepEqual(s.phases.scroll.worst, { frame: 7, dt: 90, y: 1400, neighbours: [[-2, 8.4, 417], [-1, 8.3, 500], [0, 90, 1400], [1, 8.3, 1483], [2, 8.4, 1567]] });
  assert.equal(s.slow.length, 1);
  const w = s.slow[0];
  assert.deepEqual([w.frame, w.dt, w.ticks, w.yStart, w.yEnd, w.phase], [7, 90, 11, 500, 1400, 'scroll']);
  assert.deepEqual(w.mut, { src: 21, inert: 1, scene: 1, same: 1 }, 'all 21 src writes and the inert flip in one row: no first-N cap');
  assert.deepEqual(w.mutPrev, { class: 1 });
  assert.deepEqual(w.crossings, ['<class div.a +on', 'scene #platform active', 'inert div.p removed']);
  assert.deepEqual(s.mutationTotals, { ...Object.fromEntries(MT.map((k) => [k, 0])), src: 21, class: 1, inert: 1, scene: 1, same: 1 });
  assert.equal(s.crossings, 3);
  assert.equal(s.tweens, null);
  assert.equal(s.early, null);
});

test('tweenStarts: an unset --morph (null) counts as 0; both directions; the driver frames when the probe saw no m', () => {
  const ms = [null, null, 0.2, 0.6, 1, 1, 1, 0.5, 0, 0];
  const frames = fr([0, 8, 16, 24, 32, 40, 48, 56, 64, 72], { m: (k) => ms[k] });
  assert.deepEqual(P.tweenStarts(frames), [{ from: 0, dts: [8, 8, 8] }, { from: 1, dts: [8, 8, 8] }]);
  const none = fr([0, 8, 16]);
  assert.deepEqual(P.tweenStarts(none), []);
  assert.deepEqual(P.tweenStarts(none, [[0, 0, 0, 0], [8, 8, 0, 0], [16, 8, 0, 0.3], [24, 30, 0, 0.7], [32, 8, 0, 1]]), [{ from: 0, dts: [8, 30, 8] }]);
});

test('parseRunArgs: drivers, defaults, units, labels and validation', () => {
  assert.deepEqual(parseRunArgs(['--help']), { help: true });
  assert.throws(() => parseRunArgs([]), /--driver must be one of scroll, window, morph\n/);
  assert.throws(() => parseRunArgs(['--driver', 'fling']), /got fling/);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--probe', 'full']), /--probe must be std/);
  assert.throws(() => parseRunArgs(['--driver', 'window']), /needs --to/);
  assert.throws(() => parseRunArgs(['--driver', 'window', '--to', 'x']), /--to must be a number/);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--arm', 'treated']), /--arm is one letter/);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--tops', 'nosel']), /--tops wants id=selector/);
  const s = parseRunArgs(['--driver', 'scroll', '--owner', 'me']);
  assert.deepEqual([s.driver, s.probe, s.label, s.settleMs, s.allowDuringMeasure, s.stateFile], ['scroll', 'std', 'run', 8000, false, null]);
  assert.deepEqual(s.params, { tops: [], ySource: 'raf', idleMs: 3000, bottomMs: 3000, maxScrollMs: 45000 });
  assert.equal(s.battery, true);
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--y-source', 'layout']), /--y-source must be one of raf, scroll, none \(got layout\)/);
  assert.equal(parseRunArgs(['--driver', 'scroll', '--y-source', 'none']).params.ySource, 'none');
  assert.equal(parseRunArgs(['--driver', 'scroll', '--no-battery']).battery, false);
  assert.deepEqual(s.labels, { build: null, run: null, block: null, arm: null, pos: null, warmup: false });
  const w = parseRunArgs(['--driver=window', '--to=1000', '--from', '400', '--idle', '6', '--hold', '1.5', '--sentinel', '0', '--settle', '2', '--label', 'hero',
    '--build', 'B1', '--run', 'r3', '--block', 'k2', '--arm', 'V', '--pos', '2', '--warmup', '--tops', 'platform=#platform,panel=.start-selling-morph-panel', '--allow-during-measure', '--state', 'x.js']);
  assert.deepEqual(w.params, { tops: [['platform', '#platform'], ['panel', '.start-selling-morph-panel']], ySource: 'raf', from: 400, to: 1000, settleAtMs: 1000, idleMs: 6000, holdMs: 1500, sentinelMs: 0, maxScrollMs: 45000 });
  assert.deepEqual(w.labels, { build: 'B1', run: 'r3', block: 'k2', arm: 'V', pos: 2, warmup: true });
  assert.deepEqual([w.label, w.settleMs, w.allowDuringMeasure, w.stateFile], ['hero', 2000, true, 'x.js']);
  assert.equal(estimateMs(w), 1000 + 6000 + 45000 + 1500 + 0);
  const m = parseRunArgs(['--driver', 'morph']);
  assert.deepEqual(m.params, { tops: [], ySource: 'raf', holdMs: 2000, cycles: 3, maxDriveMs: 2 * 3 * 2000 + 30000 }, '--hold is in ms for morph (what __fwMorphDrive takes)');
  assert.throws(() => parseRunArgs(['--driver', 'morph', '--cycles', '0']), /--cycles must be a number >= 1/);
  assert.equal(estimateMs(m), 42000);
});

test('measureGuard: a normal chrome-measure hold refuses a timed run (WAIT); free, stale, short-lane or --allow-during-measure pass', () => {
  const o = { allowDuringMeasure: false };
  assert.doesNotThrow(() => measureGuard(o, { holder: null }));
  assert.throws(() => measureGuard(o, { holder: { owner: 'fix-x' }, stale: false }), /^Error: WAIT: chrome-measure is held by "fix-x"/);
  assert.doesNotThrow(() => measureGuard(o, { holder: { owner: 'fix-x' }, stale: true }));
  assert.doesNotThrow(() => measureGuard(o, { holder: { owner: 'npm-test', short: true }, stale: false }));
  assert.doesNotThrow(() => measureGuard({ allowDuringMeasure: true }, { holder: { owner: 'fix-x' }, stale: false }));
});

test('battery: only the named AppleSmartBattery keys are kept (no serials), temperature in degC; settings take charging and capacity from it', () => {
  const xml = '<?xml version="1.0"?><plist><dict><key>IORegistry</key><dict><key>Serial</key><string>F5D0SECRET</string>'
    + '<key>Temperature</key>\n\t<integer>3125</integer><key>IsCharging</key><true/><key>ExternalConnected</key><true/><key>FullyCharged</key><false/>'
    + '<key>CurrentCapacity</key><integer>81</integer><key>MaxCapacity</key><integer>100</integer><key>Voltage</key><integer>4100</integer></dict></dict></plist>';
  const b = parseBattery(xml);
  assert.deepEqual(b, { Temperature: 3125, IsCharging: true, ExternalConnected: true, FullyCharged: false, CurrentCapacity: 81, MaxCapacity: 100, temperatureC: 31.25 });
  assert.ok(!JSON.stringify(b).includes('SECRET'));
  assert.deepEqual(parseBattery('ERROR: no device'), { error: 'no AppleSmartBattery values in the output' });
  const st = deviceSettings({ dark: false }, b);
  assert.deepEqual([st.batteryPct, st.charging, st.lowPowerMode, st.dark], [81, true, 'unknown', false]);
  assert.equal(deviceSettings(null, { error: 'x' }).charging, 'unknown');
  const old = process.env.FW_IDEVICEDIAGNOSTICS;
  process.env.FW_IDEVICEDIAGNOSTICS = join(tempDir('fw-nobin-'), 'missing');
  try { assert.deepEqual(batteryInfo(), { error: 'idevicediagnostics: ENOENT' }, 'no libimobiledevice: an error field, not a crash'); }
  finally { if (old === undefined) delete process.env.FW_IDEVICEDIAGNOSTICS; else process.env.FW_IDEVICEDIAGNOSTICS = old; }
});

test('toolVersion: sha16 of every tool file plus the probe and driver code', () => {
  const v = toolVersion('window');
  assert.deepEqual(Object.keys(v.files), TOOL_FILES);
  for (const h of [...Object.values(v.files), v.probe, v.driver]) assert.match(h, /^[0-9a-f]{16}$/);
  assert.notEqual(toolVersion('morph').driver, v.driver);
  assert.equal(toolVersion('morph').probe, v.probe);
});

// ---- the in-page side, in-process on the fake page ------------------------------------------------------
async function runInPage(driver, opts, { page = createPage({ morph: driver === 'morph' }), customStateJs = null } = {}) {
  try {
    assert.equal(page.evaluate(P.optsJs(opts)), 'ok');
    assert.equal(page.evaluate(P.EARLY_JS), 'ok');
    await new Promise((r) => setTimeout(r, 120));
    page.readsBefore = page.win.__scrollYReads || 0;
    assert.equal(page.evaluate(P.startJs(driver, opts, { customStateJs })), 'started');
    const t0 = Date.now();
    while (!['done', 'error'].includes(page.evaluate(P.STATE_JS))) { assert.ok(Date.now() - t0 < 30000, 'run finished'); await new Promise((r) => setTimeout(r, 50)); }
    const len = page.evaluate(P.RESULT_LEN_JS);
    let s = '';
    for (let i = 0; i < len; i += P.CHUNK) s += page.evaluate(P.resultChunkJs(i));
    page.reads = (page.win.__scrollYReads || 0) - page.readsBefore;
    return { raw: JSON.parse(s), page };
  } finally { page.stop(); }
}
const WIN = { tops: [['platform', '#platform'], ['none', '.missing']], from: 1500, to: 2000, settleAtMs: 50, idleMs: 150, holdMs: 150, sentinelMs: 150, maxScrollMs: 45000 };

test('std probe + window driver: the y~1960 frame shows all 21 src writes, the inert flip, the scene flip and its rAF JS, uncapped', async () => {
  const { raw, page } = await runInPage('window', WIN, { customStateJs: `({ imgs: document.querySelectorAll('img').length })` });
  assert.equal(raw.err, null);
  assert.equal(page.win.requestAnimationFrame.toString().includes('js.set'), false, 'P.stop() restores the page rAF');
  assert.deepEqual(Object.keys(raw.marks), ['idle', 'scroll', 'hold', 'sentinel']);
  assert.ok(raw.frames[1][3] >= 1500, '--from jumps before the idle phase');
  assert.deepEqual(raw.stateAtStart, { panel: true, panelInert: true, panelImg: 21, panelImgSrc: 0, custom: { imgs: 21 } });
  assert.deepEqual(raw.tops, { platform: 2860, none: null });
  assert.deepEqual(raw.pre.anims, { total: 2, byTimeline: { DocumentTimeline: 1, ViewTimeline: 1 } });
  assert.deepEqual([raw.pre.vw, raw.pre.vh0, raw.pre.dpr, raw.pre.maxY], [430, 815, 3, 2900 - 815]);
  assert.deepEqual(raw.pre.settings, { reducedMotion: false, reducedTransparency: false, contrastMore: false, dark: true, hardwareConcurrency: 6 });
  assert.ok(Math.abs(raw.pre.clock.wallMs - Date.now()) < 10000 && raw.pre.clock.perfMs >= 0, 'page wall clock next to its performance.now()');
  assert.equal(raw.driverResult.stopAt, 2000);
  assert.equal(raw.driverResult.finalY, 2085, 'the sentinel jumps to the bottom');
  assert.ok(raw.early.frames.length > 3, 'early frames from the EARLY_JS logger');
  assert.equal(raw.early.fontsStatus, 'loaded');
  assert.equal(raw.ySource, 'raf');
  assert.deepEqual(raw.pre.screen, [430, 932]);
  assert.deepEqual(raw.post.resources, [], 'Resource Timing dump after the run');
  assert.ok(raw.frames.slice(1).every((f) => f[8] === 2900), 'docH per frame, read with y');

  const doc = P.buildDoc(raw);
  assert.deepEqual(doc.fields, P.FIELDS);
  const ev = doc.crossings.filter((c) => c.kind === 'inert' || c.kind === 'scene' || (c.kind === 'class' && c.id === 'div.start-selling-morph-panel'));
  assert.deepEqual(ev.map((c) => `${c.kind} ${c.id} ${c.value} ${c.src}`), [
    'inert div.start-selling-morph-panel removed effect', 'class div.start-selling-morph-panel +is-live effect', 'scene #platform active effect']);
  const k = ev[0].frame;
  assert.ok(ev.every((c) => c.frame === k));
  const row = doc.mutations.counts.find((c) => c[0] === k);
  assert.ok(row, 'mutations in the event frame');
  const n = Object.fromEntries(MT.map((t, i) => [t, row[1 + i]]));
  assert.equal(n.src, 21, 'every img src write is counted (no first-N cap, F-044)');
  assert.deepEqual([n.inert, n.class, n.scene, n.style], [1, 1, 1, 1]);
  assert.ok(n.same >= 1, 'the same-value data-fw-wc write counts as same (F-020)');
  assert.equal(n.other, 0, 'data-fw-wc never changes value, so it is not "other"');
  const f = doc.frames[k];
  assert.ok(f[1] >= 85, `the busy frame's gap (${f[1]})`);
  assert.ok(f[6] >= 85, `rafJsMs attributes the page's 90 ms rAF callback to the row it delayed (${f[6]})`);
  assert.ok(f[3] >= 1960);
  assert.ok(ev.every((c) => c.y > 1500 && c.y <= f[3]), 'crossing y = the last rAF y (no read in the observer)');
  assert.ok(doc.crossings.some((c) => c.kind === 'font' && c.id === 'document.fonts' && c.value === '2 faces'), 'document.fonts loadingdone is a crossing');
  const slow = doc.summary.slow.find((s) => s.frame === k);
  assert.ok(slow);
  assert.equal(slow.mut.src, 21);
  assert.ok(slow.crossings.includes('inert div.start-selling-morph-panel removed'));
  assert.ok(doc.crossings.some((c) => c.kind === 'cv' && c.id === 'section.commission' && c.value === 'rendered' && c.y >= 0 && c.y < 1960));
  assert.ok(page.reads >= raw.frames.length, `raf reads scrollY every frame (${page.reads} reads, ${raw.frames.length} frames)`);
  assert.equal(doc.summary.mutationTotals.src, 21);
  assert.ok(doc.summary.phases.scroll.k5 >= 1);
  assert.deepEqual(raw.topsPost, { platform: 2860, none: null });
});

test('--y-source scroll: y and docH from a passive scroll listener, no scrollY read per rAF; none: no y at all, the driver still stops at --to', async () => {
  const sc = await runInPage('window', { ...WIN, ySource: 'scroll' });
  assert.equal(sc.raw.err, null);
  assert.equal(sc.raw.ySource, 'scroll');
  const fs = sc.raw.frames.slice(1);
  assert.ok(fs.every((f) => typeof f[3] === 'number' && f[8] === 2900));
  assert.ok(fs.some((f) => f[3] >= 1960) && fs.at(-1)[3] === 2085, 'the listener follows the scroll and the sentinel jump');
  assert.ok(sc.page.reads < fs.length / 2, `scroll events only (${sc.page.reads} reads, ${fs.length} frames)`);
  assert.equal(sc.raw.early.frames.at(-1)[2], null, 'the early logger reads no y either');
  const ce = P.buildDoc(sc.raw).crossings.find((c) => c.kind === 'inert');
  assert.ok(ce.y > 1500, 'crossings take the listener y');

  const no = await runInPage('window', { ...WIN, ySource: 'none' });
  assert.equal(no.raw.err, null);
  assert.equal(no.raw.ySource, 'none');
  assert.ok(no.raw.frames.every((f) => f[2] === null && f[3] === null && f[8] === null));
  assert.equal(no.raw.driverResult.stopAt, 2000);
  assert.ok(no.raw.driverResult.yHold >= 2000, 'the driver stops by its own scrollY reads (every 300 ms)');
  assert.ok(no.page.reads < 20, `only the driver's and the page facts' reads (${no.page.reads})`);
  const d = P.buildDoc(no.raw);
  assert.ok(d.crossings.filter((c) => c.kind !== 'cv').every((c) => c.y === null));
  assert.equal(d.summary.mutationTotals.src, 21);
});

test('std probe + scroll driver: idle, scroll, bottom phases to the end of the page', async () => {
  const { raw } = await runInPage('scroll', { tops: [], idleMs: 100, bottomMs: 100, maxScrollMs: 45000 }, { page: createPage({ docHeight: 1500 }) });
  assert.equal(raw.err, null);
  assert.deepEqual(Object.keys(raw.marks), ['idle', 'scroll', 'bottom']);
  assert.deepEqual(raw.driverResult, { maxY: 685, finalY: 685 });
  assert.equal(raw.tops, null);
  const doc = P.buildDoc(raw);
  assert.ok(doc.summary.phases.scroll.frames > 10);
  assert.equal(doc.summary.mutationTotals.src, 0);
});

test('std probe + morph driver: m per frame, tween starts, the build\'s own summaries kept', async () => {
  const { raw } = await runInPage('morph', { tops: [], holdMs: 100, cycles: 2, maxDriveMs: 30000 });
  assert.equal(raw.err, null);
  assert.deepEqual(Object.keys(raw.marks), ['drive']);
  assert.equal(raw.driverResult.driver.cycles, 2);
  assert.ok(raw.driverResult.driver.moving.frames > 0);
  const doc = P.buildDoc(raw);
  assert.ok(doc.frames.some((f) => f[5] === 1), 'm reaches 1');
  assert.deepEqual(doc.summary.tweens.map((t) => t.from), [0, 1, 0, 1]);
  assert.ok(doc.summary.tweens.every((t) => t.dts.length === 3));
  assert.ok(doc.summary.mutationTotals.style > 0, 'the --morph writes are style mutations');
});

test('morph driver on a page without __fwMorphDrive: the error is reported, the probe stopped, the result still complete', async () => {
  const { raw } = await runInPage('morph', { tops: [], holdMs: 100, cycles: 1, maxDriveMs: 5000 }, { page: createPage() });
  assert.match(raw.err, /no window.__fwMorphDrive/);
  assert.ok(raw.frames.length >= 2, 'the settle frames are still recorded');
  assert.equal(raw.driverResult, null);
  assert.throws(() => P.startJs('fling', {}), /unknown driver fling/);
});

test('finish: one JSON per run (schema, meta with labels and tool hashes, measurement part); a page error is saved, then thrown', async () => {
  const { raw } = await runInPage('window', { ...WIN, tops: [] });
  raw.served = { '/_app/a.js': '0123456789abcdef' };
  raw.macStartMs = 1790000000000;
  raw.battery = { start: { IsCharging: false, CurrentCapacity: 64, temperatureC: 30 }, end: { IsCharging: false, CurrentCapacity: 63, temperatureC: 31 } };
  const dir = tempDir('fw-iphone-run-');
  const o = parseRunArgs(['--driver', 'window', '--to', '2000', '--label', 'ewin', '--build', 'B', '--arm', 'A', '--pos', '1', '--out', join(dir, 'r.json')]);
  const log = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' '));
  let out;
  try { out = finish(o, 'me', raw, { now: new Date('2026-10-01T10:00:00Z') }); } finally { console.log = log; }
  assert.equal(out, join(dir, 'r.json'));
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(j), ['meta', 'fields', 'frames', 'marks', 'mutations', 'crossings', 'summary', 'tops', 'topsPost', 'stateAtStart', 'early', 'driverResult', 'pre', 'post']);
  const m = j.meta;
  assert.deepEqual([m.schema, m.kind, m.driver, m.driverName, m.probe, m.label, m.build, m.run, m.block, m.arm, m.pos, m.warmup, m.owner, m.date, m.error],
    ['fw-iphone-run/1', 'run', 'W', 'window', 'std', 'ewin', 'B', 'ewin', null, 'A', 1, false, 'me', '2026-10-01T10:00:00.000Z', null]);
  assert.deepEqual(m.served, raw.served);
  assert.equal(m.wallStartMs, 1790000000000);
  assert.deepEqual(m.clock, raw.pre.clock);
  for (const k of UNREADABLE_SETTINGS.filter((x) => x !== 'batteryPct' && x !== 'charging')) assert.equal(m.settings[k], 'unknown', `settings.${k} is recorded as unknown, not left out (U9)`);
  assert.equal(m.settings.dark, true);
  assert.deepEqual([m.settings.batteryPct, m.settings.charging], [64, false], 'battery read fills U9 fields');
  assert.deepEqual(m.battery, raw.battery);
  assert.equal(m.ySource, 'raf');
  assert.equal(m.params.ySource, 'raf');
  assert.equal(m.params.settleMs, 8000);
  assert.equal(m.params.to, 2000);
  assert.deepEqual(Object.keys(m.tool.files), TOOL_FILES);
  assert.equal(m.href, 'http://127.0.0.1:9/');
  assert.equal(j.summary.mutationTotals.src, 21);
  assert.ok(lines.some((l) => /^ewin \[W\]: idle \d+fr/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /mut \{"src":21/.test(l)), 'the slow frame line shows the uncapped counts');
  assert.ok(lines.at(-1).startsWith('saved '));

  const bad = { ...raw, err: 'boom', driverResult: null };
  const o2 = { ...o, out: join(dir, 'bad.json') };
  console.log = () => {};
  try { assert.throws(() => finish(o2, 'me', bad), /driver failed in the page: boom \(partial run saved: /); } finally { console.log = log; }
  assert.ok(existsSync(join(dir, 'bad.json')));
  assert.equal(JSON.parse(readFileSync(join(dir, 'bad.json'), 'utf8')).meta.error, 'boom');
});

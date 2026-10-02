// `iphone.mjs run` (protocol v2 T1a): the pure Node side of tools/lib/iphone-probe.mjs (frame placement, uncapped
// mutation buckets, crossings, phone ms thresholds, summaries), the argument parser and guards of tools/lib/iphone-run.mjs, and the
// in-page probe + drivers run in-process on the fake page of tests/fixtures/fake-run-dom.mjs (node:vm; no phone,
// no proxy, no lock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { createPage } from '../fixtures/fake-run-dom.mjs';
import * as P from '../../tools/lib/iphone-probe.mjs';
import { parseRunArgs, measureGuard, estimateMs, finish, toolVersion, TOOL_FILES, UNREADABLE_SETTINGS, parseBattery, deviceSettings, batteryInfo, lanSafeUrl, LAN_HOST } from '../../tools/lib/iphone-run.mjs';

const MT = P.MUT_TYPES;
const counts = (o) => MT.map((k) => o[k] || 0);
const batch = (t, o, other = 0, seen) => (seen === undefined ? [t, ...counts(o), other] : [t, ...counts(o), other, seen]);
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
  assert.equal(m.movedFromTime, 0, 'v2 rows (no seen): by delivery time');
});

test('bucketMutations / placeCrossings (probe v3): placed by seen, the latest rAF stamp before delivery; a delivery time tied with the next stamp stays in its frame', () => {
  const f = fr([0, 8.3, 98.3, 106.6]);
  // a batch from the long frame's rAF callback (stamp 8.3), delivered at 98.3: the next frame's stamp (a 0.1 ms / 1 ms tie)
  const b = [batch(98.3, { src: 21 }, 0, 8.3), batch(98.3, { class: 1 }, 0, 98.3), batch(5, { style: 1 }, 0, 0), batch(3, { text: 1 }, 0, null)];
  assert.equal(P.frameIndexAt(f, 98.3), 3, 'by delivery time the tied batch would land in row 3');
  const m = P.bucketMutations(f, b);
  assert.deepEqual(m.counts, [[1, ...counts({ style: 1, text: 1 })], [2, ...counts({ src: 21 })], [3, ...counts({ class: 1 })]]);
  assert.equal(m.movedFromTime, 1);
  const c = P.placeCrossings(f, [[98.3, 'inert', 'div.p', 'removed', 1960, 0, 0, 8.3], [98.3, 'class', 'div.late', '+is-late', 1960, 0, 1, 98.3], [3, 'cv', 'section.c', 'rendered', 0, 0, null, null]]);
  assert.deepEqual(c.map((x) => [x.kind, x.frame, x.yFrame]), [['cv', 1, [0, 8.3]], ['inert', 2, [8.3, 98.3]], ['class', 3, [98.3, 106.6]]]);
  assert.equal(P.rowOf(f, 98.3, undefined), 3, 'a v2 row: by time');
});

test('placeCrossings: time order, same-time rows keep record order, src "effect", frame index, the frame\'s y interval, its y row, stale when y was not read at the crossing', () => {
  const f = fr([0, 8.3, 16.7]);
  // page rows [t, kind, id, value, y, fresh, yRow]: fresh 1 = y read at the crossing (raf-legacy) or a scroll event since the probe's last rAF callback, 0 = not;
  // yRow = the row whose yEnd y is (raf), else absent
  const rows = [[10, 'scene', '#platform', 'active', 1960, 0, 1], [9, 'inert', 'div.start-selling-morph-panel', 'removed', 1960, 1], [10, 'class', 'div.x', '+is-live', 1960, 0, 0],
    [99, 'cv', 'section.commission', 'rendered', 1250, 0], [12, 'cv', 'section.y', 'skipped', null, 0], [13, 'font', 'document.fonts', '2 faces', 900]];
  assert.deepEqual(P.placeCrossings(f, rows), [
    { frame: 2, t: 9, y: 1960, yFrame: [8.3, 16.7], yRow: null, stale: false, kind: 'inert', id: 'div.start-selling-morph-panel', value: 'removed', src: 'effect' },
    { frame: 2, t: 10, y: 1960, yFrame: [8.3, 16.7], yRow: 1, stale: true, kind: 'scene', id: '#platform', value: 'active', src: 'effect' },
    { frame: 2, t: 10, y: 1960, yFrame: [8.3, 16.7], yRow: 0, stale: true, kind: 'class', id: 'div.x', value: '+is-live', src: 'effect' },
    { frame: 2, t: 12, y: null, yFrame: [8.3, 16.7], yRow: null, stale: null, kind: 'cv', id: 'section.y', value: 'skipped', src: 'effect' },
    { frame: 2, t: 13, y: 900, yFrame: [8.3, 16.7], yRow: null, stale: null, kind: 'font', id: 'document.fonts', value: '2 faces', src: 'effect' },
    { frame: null, t: 99, y: 1250, yFrame: null, yRow: null, stale: true, kind: 'cv', id: 'section.commission', value: 'rendered', src: 'effect' },
  ], 'no y -> stale null; a probe v1 row without the fresh flag -> stale null');
});

test('phone thresholds in ms (no tick forms): dt > 50 / > 34, the +-4 ms counts, near flags, over', () => {
  assert.equal(P.ticks, undefined, 'no k forms on the phone');
  const d = [29.9, 30.1, 34, 34.1, 37.9, 38.1, 46, 50, 50.1, 54, 54.1, 60];
  assert.deepEqual(P.phoneCounts(d), { gt50: 4, gt34: 9, gt46: 5, gt54: 2, gt30: 11, gt38: 7, near34: 4, near50: 3 });
  assert.deepEqual([29.9, 30, 30.1, 38, 38.1, 46, 46.1, 54, 54.1].map(P.nearThreshold), [null, null, 34, 34, null, null, 50, 50, null]);
  assert.deepEqual([34, 34.1, 50, 50.1].map(P.overThreshold), [null, 34, 34, 50]);
  assert.equal(P.SLOW_MS, 30);
});

test('rafRate: median frame gap -> rafHz; a 30 Hz page is a Low Power Mode suspect', () => {
  assert.deepEqual(P.rafRate(fr([0, 16.7, 33.3, 50, 66.7, 140])), { rafHz: 60, lowPowerSuspect: false });
  assert.deepEqual(P.rafRate(fr([0, 33.3, 66.7, 100, 133.3])), { rafHz: 30, lowPowerSuspect: true });
  assert.deepEqual(P.rafRate([[0, null]]), { rafHz: null, lowPowerSuspect: null });
});

test('summarize: phases count >50 / >34 and the +-4 ms counts, the worst frame with +-2 neighbours, slow frames with the mutations and crossings of rows k-1 and k', () => {
  const ts = [0, 8.3, 16.7, 25, 33.3, 41.7, 50, 140, 148.3, 156.7, 165, 173.3, 205.3];
  const frames = fr(ts, { y: (t) => Math.round(t * 10) });
  const doc = {
    frames, marks: { idle: [0, 30], scroll: [33.3, 173.3], open: [180] },
    mutations: P.bucketMutations(frames, [batch(45, { class: 1 }), batch(60, { src: 21, inert: 1, scene: 1, same: 1 })]),
    crossings: P.placeCrossings(frames, [[45, 'class', 'div.a', '+on', 450], [60, 'scene', '#platform', 'active', 1960], [60, 'inert', 'div.p', 'removed', 1960]]),
  };
  const s = P.summarize(doc);
  assert.deepEqual(Object.keys(s.phases), ['idle', 'scroll'], 'a phase without an end mark is not summarized');
  assert.equal(s.phases.idle.frames, 3);
  assert.deepEqual([s.phases.idle.gt34, s.phases.idle.gt30], [0, 0]);
  const sc = s.phases.scroll;
  assert.deepEqual([sc.frames, sc.gt50, sc.gt34, sc.gt46, sc.gt54, sc.gt30, sc.gt38, sc.near34, sc.near50, sc.max, sc.maxY], [8, 1, 1, 1, 1, 1, 1, 0, 0, 90, 1400]);
  assert.equal(sc.k5, undefined, 'no k forms');
  assert.equal(s.rafHz, 120);
  assert.deepEqual(s.phases.scroll.worst, { frame: 7, dt: 90, y: 1400, neighbours: [[-2, 8.4, 417], [-1, 8.3, 500], [0, 90, 1400], [1, 8.3, 1483], [2, 8.4, 1567]] });
  assert.equal(s.slow.length, 2, 'every frame over 30 ms: the 90 ms one and a 32 ms one near 34');
  const w = s.slow[0];
  assert.deepEqual([w.frame, w.dt, w.over, w.near, w.yStart, w.yEnd, w.phase], [7, 90, 50, null, 500, 1400, 'scroll']);
  assert.deepEqual([s.slow[1].frame, s.slow[1].dt, s.slow[1].over, s.slow[1].near, s.slow[1].phase], [12, 32, null, 34, null]);
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
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--y-source', 'layout']), /--y-source must be one of raf, raf-legacy, scroll, none \(got layout\)/);
  assert.equal(parseRunArgs(['--driver', 'scroll', '--y-source', 'raf-legacy']).params.ySource, 'raf-legacy');
  assert.equal(parseRunArgs(['--driver', 'scroll', '--y-source', 'none']).params.ySource, 'none');
  assert.equal(parseRunArgs(['--driver', 'scroll', '--no-battery']).battery, false);
  assert.equal(s.lowPower, 'unknown');
  assert.equal(parseRunArgs(['--driver', 'scroll', '--low-power', 'on']).lowPower, 'on');
  assert.throws(() => parseRunArgs(['--driver', 'scroll', '--low-power', 'yes']), /--low-power must be on or off \(got yes\)/);
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
  // a no-timing hold (a build on the Mac, granted without the host gate) refuses timed phone runs too (ts-lock-bundle)
  assert.throws(() => measureGuard(o, { holder: { owner: 'wda-build', noTiming: true }, stale: false }), /^Error: WAIT: chrome-measure is held by "wda-build"/);
  assert.doesNotThrow(() => measureGuard(o, { holder: { owner: 'fix-x' }, stale: true }));
  assert.doesNotThrow(() => measureGuard(o, { holder: { owner: 'npm-test', short: true }, stale: false }));
  assert.doesNotThrow(() => measureGuard({ allowDuringMeasure: true }, { holder: { owner: 'fix-x' }, stale: false }));
});

test('I-056 measureGuard: a shared group (or its switch-off stand-in) refuses a recorded / timed phone run; the runner\'s own hold (same owner, or its FW_LOCK_HELD) passes', () => {
  const o = { allowDuringMeasure: false, owner: 'iphone-runner' };
  const env = {};
  const future = new Date(Date.now() + 120000).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  const group = (readers) => ({ holder: { resource: 'chrome-measure', owner: '(shared)', kind: 'lease', short: true, shared: true, format: 'rw1', token: 'aaaaaaaaaaaa', expiresAt: future, readers }, stale: null });
  const sim = { owner: 'de-counts-sim', token: 'bbbbbbbbbbbb', kind: 'lease', weight: 3, maxSec: 300, deadline: future };
  // (a) the 06:54Z case: a Simulator session (shared, weight 3) must not run beside a recording; it used to pass as a "short holder"
  assert.throws(() => measureGuard(o, group([sim]), env), (e) => /^WAIT: chrome-measure is held by the shared lane \("de-counts-sim" w3\)/.test(e.message) && /--no-timing/.test(e.message) && /I-056/.test(e.message));
  assert.throws(() => measureGuard(o, group([sim, { ...sim, owner: 'npm-x', token: 'cccccccccccc', weight: 2 }]), env), /shared lane \("de-counts-sim" w3, "npm-x" w2\)/);
  assert.doesNotThrow(() => measureGuard(o, group([{ ...sim, deadline: past }]), env), 'a group whose readers are all past their deadline holds nothing');
  assert.throws(() => measureGuard(o, { holder: { ...group([sim]).holder, format: 'rw9' }, stale: null }, env), /^Error: WAIT: chrome-measure is held by the shared lane/, 'a group in an unknown format counts as held');
  // the switch-off stand-in for a reader: an exclusive short hold with functional: true
  assert.throws(() => measureGuard(o, { holder: { owner: 'de-counts-sim', short: true, functional: true, weight: 3, token: 'dddddddddddd' }, stale: null }, env), /^Error: WAIT: chrome-measure is held by "de-counts-sim" as a shared \(functional\) job/);
  assert.throws(() => measureGuard({ ...o, owner: 'de-counts-sim' }, { holder: { owner: 'de-counts-sim', short: true, functional: true, weight: 3, token: 'dddddddddddd' }, stale: null }, env), /shared \(functional\) job/, 'a functional job is never the phone run\'s own hold, even under the same name');
  assert.doesNotThrow(() => measureGuard({ ...o, allowDuringMeasure: true }, group([sim]), env), '--allow-during-measure stays the diagnostics escape');
  // (b) the runner's own hold: a --no-timing hold (or a normal one) of the same owner, or the hold this process inherits
  const nt = { owner: 'iphone-runner', kind: 'process', noTiming: true, token: 'eeeeeeeeeeee' };
  assert.doesNotThrow(() => measureGuard(o, { holder: nt, stale: null }, env), 'same owner');
  assert.doesNotThrow(() => measureGuard(o, { holder: { ...nt, noTiming: undefined }, stale: null }, env), 'same owner, a normal hold');
  assert.doesNotThrow(() => measureGuard({ ...o, owner: 'g1-part' }, { holder: nt, stale: null }, { FW_LOCK_HELD: 'chrome-measure:eeeeeeeeeeee' }), 'inherited through lock.mjs run (FW_LOCK_HELD)');
  assert.throws(() => measureGuard({ ...o, owner: 'g1-part' }, { holder: nt, stale: null }, { FW_LOCK_HELD: 'chrome-measure:ffffffffffff' }), /^Error: WAIT: chrome-measure is held by "iphone-runner"/, 'another hold\'s token');
  assert.throws(() => measureGuard({ ...o, owner: 'g1-part' }, { holder: nt, stale: null }, { FW_LOCK_HELD: 'iphone:eeeeeeeeeeee' }), /WAIT/, 'a token for another resource');
  assert.throws(() => measureGuard({ ...o, owner: 'someone' }, { holder: nt, stale: null }, env), (e) => /^WAIT: chrome-measure is held by "iphone-runner" \(a no-timing hold/.test(e.message) && /lock\.mjs run chrome-measure --owner someone --no-timing/.test(e.message));
  // the token of a group is no exclusive hold: a reader slot is never a phone run's own hold
  assert.throws(() => measureGuard(o, group([{ ...sim, owner: 'iphone-runner' }]), { FW_LOCK_HELD: 'chrome-measure:aaaaaaaaaaaa' }), /shared lane/);
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
  assert.deepEqual([deviceSettings({}, null, 'on').lowPowerMode, deviceSettings({}, null, 'off').lowPowerMode, deviceSettings({}, null).lowPowerMode], [true, false, 'unknown'], '--low-power');
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
    const sh0 = page.win.__scrollHeightReads, sh00 = page.win.__scrollHeightReadsAtY0;
    assert.equal(page.evaluate(P.startJs(driver, opts, { customStateJs })), 'started');
    const t0 = Date.now();
    while (!['done', 'error'].includes(page.evaluate(P.STATE_JS))) { assert.ok(Date.now() - t0 < 30000, 'run finished'); await new Promise((r) => setTimeout(r, 50)); }
    const len = page.evaluate(P.RESULT_LEN_JS);
    let s = '';
    for (let i = 0; i < len; i += P.CHUNK) s += page.evaluate(P.resultChunkJs(i));
    page.reads = (page.win.__scrollYReads || 0) - page.readsBefore;
    page.shReads = page.win.__scrollHeightReads - sh0;
    page.shReadsAtY0 = page.win.__scrollHeightReadsAtY0 - sh00;
    return { raw: JSON.parse(s), page };
  } finally { page.stop(); }
}
const WIN = { tops: [['platform', '#platform'], ['none', '.missing']], from: 1500, to: 2000, settleAtMs: 50, idleMs: 150, holdMs: 150, sentinelMs: 150, maxScrollMs: 45000 };

test('probe v3 on a 1 ms page clock: the long frame\'s batch ties with the next stamp and still lands in the slow row (by seen)', async () => {
  const { raw } = await runInPage('window', { ...WIN, tops: [] }, { page: createPage({ clockMs: 1, tieAfterLong: true }) });
  assert.equal(raw.err, null);
  assert.equal(raw.probeVersion, 3);
  const n = MT.length;
  const b = raw.batches.find((x) => x[1 + MT.indexOf('src')] === 21);
  assert.ok(b, 'the src batch');
  const k = raw.frames.findIndex((x) => x[0] === b[0]);
  assert.ok(k > 1, `the batch's delivery time equals a frame stamp (the tie): ${b[0]}`);
  assert.ok(raw.frames[k][1] >= 85, 'that frame closes the long gap');
  assert.equal(b[2 + n], raw.frames[k - 1][0], 'seen = the long frame\'s stamp');
  assert.equal(P.frameIndexAt(raw.frames, b[0]), k + 1, 'by delivery time (v2) it would land one row late');
  const doc = P.buildDoc(raw);
  const row = doc.mutations.counts.find((c) => c[0] === k);
  assert.ok(row && row[1 + MT.indexOf('src')] === 21, 'by seen it lands in the slow row');
  assert.ok(doc.mutations.movedFromTime >= 1);
  const inert = doc.crossings.find((c) => c.kind === 'inert');
  assert.equal(inert.frame, k, 'the inert crossing too');
  assert.equal(doc.summary.slow.find((x) => x.frame === k).mut.src, 21);
});

test('probe v3, pre-rAF work: a scroll handler\'s batch (before the update\'s rAF callbacks) lands in that update\'s row k+1, not one row early', async () => {
  const page = createPage({ scrollHandlerY: 1700 });
  const { raw } = await runInPage('window', { ...WIN, tops: [] }, { page });
  assert.equal(raw.err, null);
  const n = MT.length;
  const stamp = page.win.__scrollMutStamp;
  assert.ok(typeof stamp === 'number', 'the page scroll handler mutated');
  const k = raw.frames.findIndex((x) => x[0] === Math.round(stamp * 10) / 10);
  assert.ok(k > 0, 'the update whose scroll step ran the handler has a probe row (its stamp)');
  const cr = raw.crossings.find((c) => c[1] === 'class' && c[3] === '+is-scrolled');
  assert.ok(cr, 'the crossing');
  assert.equal(cr[7], null, 'recorded while preRaf: seen = null');
  assert.ok(cr[0] >= raw.frames[k][0], 'delivered after the update\'s stamp');
  const b = raw.batches.find((x) => x[0] === cr[0] && x[1 + MT.indexOf('class')] >= 1);
  assert.ok(b && b[2 + n] === null, 'its batch carries seen = null too');
  assert.equal(P.frameIndexAt(raw.frames, raw.frames[k - 1][0]), k, 'the previous stamp (what seen would have been) is row k: one row early');
  const doc = P.buildDoc(raw);
  assert.equal(doc.crossings.find((c) => c.kind === 'class' && c.value === '+is-scrolled').frame, k + 1, 'placed in row k+1, with the rest of that update');
  const others = raw.batches.filter((x) => x[2 + n] !== null);
  assert.ok(others.length > 10, 'batches from rAF callbacks keep their seen');
});

test('probe v3: the pre-rAF listeners are passive capture listeners on window (scroll, resize, scrollend) and on visualViewport (resize, scroll), removed by P.stop()', () => {
  const page = createPage();
  try {
    const win0 = page.win.__winListeners().length;
    assert.equal(page.evaluate(P.PROBE_STD_JS), 'installed');
    const added = page.win.__winListeners().slice(win0);
    assert.deepEqual(added.map((l) => l.join(' ')).sort(), ['resize true true', 'scroll true true', 'scrollend true true'], '[type, capture, passive]');
    assert.deepEqual(page.win.visualViewport.listeners.map((l) => l.type).sort(), ['resize', 'scroll']);
    page.evaluate('window.__fwr.stop()');
    assert.equal(page.win.__winListeners().length, win0);
    assert.equal(page.win.visualViewport.listeners.length, 0);
  } finally { page.stop(); }
});

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
  assert.equal(raw.probeVersion, 3);
  assert.deepEqual([raw.yReads.raf, raw.yReads.crossing, raw.yReads.scroll], [raw.frames.length, 0, 0], 'raf: one scrollY read per frame, none in the crossing callbacks');
  assert.ok(raw.yReads.driver >= 2, 'the driver checks scrollY every 300 ms');
  assert.equal(raw.yReads.docH, raw.frames.filter((f) => f[3] !== 0).length, 'docH read once per frame with y != 0');
  assert.ok(page.reads >= raw.yReads.raf + raw.yReads.driver);
  assert.ok(ev.every((c) => c.stale === true), 'raf: a crossing\'s y is the previous frame\'s, never updated before the crossing');
  assert.ok(ev.every((c) => c.yRow === c.frame - 2 && c.y === doc.frames[c.yRow][3]),
    `raf: the engine's rAF loop was registered before the probe's, so its observer batch comes before the probe's callback in that frame: y = yEnd of row frame-2 (${JSON.stringify(ev.map((c) => [c.frame, c.yRow, c.y]))})`);
  const lateC = doc.crossings.find((c) => c.kind === 'class' && c.id === 'div.late' && c.value === '+is-late');
  assert.ok(lateC, 'the late loop\'s crossing');
  assert.equal(lateC.yRow, lateC.frame - 1, 'a loop registered after the probe: its batch comes after the probe\'s callback, y = yStart of its frame');
  assert.deepEqual([lateC.y, lateC.stale], [lateC.yFrame[0], true]);
  const noRow = doc.crossings.filter((c) => c.frame !== null && !(c.yRow !== null && c.y === doc.frames[c.yRow][3]));
  assert.ok(noRow.length >= 1 && noRow.every((c) => c.frame <= 1 && c.yRow === null && c.y === 0),
    `every raf crossing names its y row, except before the probe's first row (y = the probe-start read): ${JSON.stringify(noRow.map((c) => [c.frame, c.yRow, c.y, c.kind]))}`);
  assert.equal(doc.summary.mutationTotals.src, 21);
  assert.ok(doc.summary.phases.scroll.gt50 >= 1);
  assert.deepEqual(raw.topsPost, { platform: 2860, none: null });
});

test('--y-source raf-legacy (the reads of probe v1, the first T1a commit): scrollY in rAF plus one per MutationObserver batch and cv event; no docH, no font listener', async () => {
  const { raw, page } = await runInPage('window', { ...WIN, ySource: 'raf-legacy' });
  assert.equal(raw.err, null);
  assert.equal(raw.ySource, 'raf-legacy');
  const ev = raw.crossings.filter((c) => c[1] === 'cv').length;
  assert.ok(ev >= 1, 'cv event seen');
  assert.equal(raw.crossings.filter((c) => c[1] === 'font').length, 0, 'no font listener (v1 had none)');
  assert.ok(raw.batches.length >= 3);
  assert.equal(raw.yReads.raf, raw.frames.length);
  assert.equal(raw.yReads.crossing, raw.batches.length + ev, 'one read per observer batch (crossing or not) and per cv event, as v1 did');
  assert.equal(raw.yReads.docH, 0);
  assert.ok(page.reads >= raw.yReads.raf + raw.yReads.crossing + raw.yReads.driver, `${page.reads} scrollY reads in the page`);
  assert.ok(raw.frames.slice(1).every((f) => typeof f[3] === 'number' && f[8] === null), 'frames as with raf, without docH');
  const no = await runInPage('window', { ...WIN, ySource: 'none' });
  assert.equal(page.shReads, no.page.shReads, `no scrollHeight read beyond the page facts and the driver's, as with none (${page.shReads} vs ${no.page.shReads})`);
  assert.ok(typeof raw.early.frames.at(-1)[2] === 'number', 'the early logger reads y as with raf');
  const doc = P.buildDoc(raw);
  const inert = doc.crossings.find((c) => c.kind === 'inert');
  assert.equal(inert.stale, false, 'read in the observer, so not stale');
  assert.equal(inert.yRow, null, 'a fresh read comes from no frame row');
  assert.ok(inert.y >= inert.yFrame[0], 'a fresh read lies at or past the frame start');
  assert.ok(doc.crossings.every((c) => c.stale === false));
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
  assert.equal(typeof ce.stale, 'boolean', 'scroll: stale says whether a scroll event updated y since the frame');
  assert.equal(ce.yRow, null);
  assert.deepEqual([sc.raw.yReads.raf, sc.raw.yReads.crossing, sc.raw.yReads.driver], [0, 0, 0], 'scroll: the drivers use the listener y');
  assert.ok(sc.raw.yReads.scroll >= 1 && sc.raw.yReads.scroll <= sc.page.reads, 'the listener reads scrollY');
  assert.ok(sc.raw.yReads.docH >= 1 && sc.raw.yReads.docH <= sc.raw.yReads.scroll + 1, 'and scrollHeight after it (y != 0)');

  const no = await runInPage('window', { ...WIN, ySource: 'none' });
  assert.equal(no.raw.err, null);
  assert.equal(no.raw.ySource, 'none');
  assert.ok(no.raw.frames.every((f) => f[2] === null && f[3] === null && f[8] === null));
  assert.equal(no.raw.driverResult.stopAt, 2000);
  assert.ok(no.raw.driverResult.yHold >= 2000, 'the driver stops by its own scrollY reads (every 300 ms)');
  assert.ok(no.page.reads < 20, `only the driver's and the page facts' reads (${no.page.reads})`);
  const d = P.buildDoc(no.raw);
  assert.ok(d.crossings.filter((c) => c.kind !== 'cv').every((c) => c.y === null));
  assert.ok(d.crossings.every((c) => c.y !== null || c.stale === null));
  assert.deepEqual([no.raw.yReads.raf, no.raw.yReads.crossing, no.raw.yReads.scroll, no.raw.yReads.docH], [0, 0, 0, 0]);
  assert.ok(no.raw.yReads.driver >= 2 && no.raw.yReads.driver <= no.page.reads, 'none still reads: the driver\'s stop check');
  assert.equal(d.summary.mutationTotals.src, 21);
});

test('std probe + scroll driver: idle, scroll, bottom phases to the end of the page; at y 0 raf and scroll read no scrollHeight (review-t1a B1)', async () => {
  const S = { tops: [], idleMs: 100, bottomMs: 100, maxScrollMs: 45000 };
  const { raw, page } = await runInPage('scroll', S, { page: createPage({ docHeight: 1500 }) });
  assert.equal(raw.err, null);
  const idle = raw.frames.filter((f) => f[3] === 0);
  assert.ok(idle.length >= 5, 'idle frames at y 0');
  assert.ok(idle.every((f) => f[8] === null), 'no docH at y 0');
  assert.equal(raw.yReads.docH, raw.frames.length - idle.length);
  const none = await runInPage('scroll', { ...S, ySource: 'none' }, { page: createPage({ docHeight: 1500 }) });
  assert.equal(page.shReadsAtY0, none.page.shReadsAtY0, `raf: the scrollHeight reads at y 0 are only the driver's, as with none (${page.shReadsAtY0} vs ${none.page.shReadsAtY0})`);
  const sc = await runInPage('scroll', { ...S, ySource: 'scroll' }, { page: createPage({ docHeight: 1500 }) });
  assert.equal(sc.page.shReadsAtY0, none.page.shReadsAtY0, 'scroll: none at y 0 either');
  const leg = await runInPage('scroll', { ...S, ySource: 'raf-legacy' }, { page: createPage({ docHeight: 1500 }) });
  assert.equal(leg.page.shReads, none.page.shReads, 'raf-legacy: no probe scrollHeight read at all');
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

test('lanSafeUrl: LAN hosts get a placeholder, scheme, port, path and query stay; loopback and public hosts stay', () => {
  assert.equal(LAN_HOST, 'lan-host');
  assert.equal(lanSafeUrl('https://192.168.0.55:5234/a/b.js?x=1#h'), 'https://lan-host:5234/a/b.js?x=1#h');
  for (const h of ['10.0.0.7', '172.16.4.2', '172.31.255.1', '169.254.1.1', '100.100.1.2', 'my-mac.local', 'Someones-MacBook-Pro.local', 'nas', '[fd12::1]', '[fe80::1]']) assert.equal(new URL(lanSafeUrl(`http://${h}:8080/p`)).hostname, 'lan-host', h);
  for (const u of ['http://127.0.0.1:9/', 'https://localhost:5300/x', 'http://[::1]:5/', 'https://fastwork.com/', 'https://172.32.0.1/', 'https://8.8.8.8/']) assert.equal(lanSafeUrl(u), u, u);
  assert.equal(lanSafeUrl(null), null);
  assert.equal(lanSafeUrl('not a url'), 'not a url');
});

test('finish: one JSON per run (schema, meta with labels and tool hashes, measurement part); a page error is saved, then thrown', async () => {
  const { raw } = await runInPage('window', { ...WIN, tops: [] });
  const lan = 'https://192.168.0.55:5234/';
  const lanRaw = { ...raw, pre: { ...raw.pre, href: lan }, post: { ...raw.post, href: lan, resources: [[lan + '_app/a.js', 'script', 1, 2, 3, 4], ['https://fastwork.com/x.js', 'script', 1, 2, 3, 4]] } };
  raw.served = { '/_app/a.js': '0123456789abcdef' };
  raw.macStartMs = 1790000000000;
  raw.battery = { start: { IsCharging: false, CurrentCapacity: 64, temperatureC: 30 }, end: { IsCharging: false, CurrentCapacity: 63, temperatureC: 31 } };
  const dir = tempDir('fw-iphone-run-');
  const o = parseRunArgs(['--driver', 'window', '--to', '2000', '--label', 'ewin', '--build', 'B', '--arm', 'A', '--pos', '1', '--out', join(dir, 'r.json')]);
  const log = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' '));
  let out;
  try { out = finish(o, 'me', raw, { now: new Date('2026-10-01T10:00:00Z') }); } finally { console.log = log; }
  console.log = () => {};
  let lanOut;
  try { lanOut = finish({ ...o, out: join(dir, 'lan.json') }, 'me', lanRaw); } finally { console.log = log; }
  const lj = readFileSync(lanOut, 'utf8');
  assert.ok(!lj.includes('192.168'), 'no LAN address in the run file (review-t1a B4)');
  const lp = JSON.parse(lj);
  assert.deepEqual([lp.meta.href, lp.pre.href, lp.post.href], ['https://lan-host:5234/', 'https://lan-host:5234/', 'https://lan-host:5234/']);
  assert.deepEqual(lp.post.resources.map((r) => r[0]), ['https://lan-host:5234/_app/a.js', 'https://fastwork.com/x.js']);
  assert.equal(raw.pre.href, 'http://127.0.0.1:9/', 'the raw result is not changed');
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
  assert.equal(m.probeVersion, 3, 'probe v3: placed by seen (v2: by time; v1, the first T1a commit = raf-legacy reads)');
  assert.equal(m.yReads, 'probe rAF scrollY per frame, scrollHeight when y != 0; driver scrollY 3.3 Hz');
  assert.deepEqual(m.yReadCounts, raw.yReads);
  assert.deepEqual(Object.keys(P.Y_READS), P.Y_SOURCES);
  assert.equal(P.yReadsLabel('none', 'window'), 'none (driver reads 3.3 Hz)');
  assert.equal(P.yReadsLabel('none', 'scroll'), 'none (driver reads 3.3 Hz)');
  assert.equal(P.yReadsLabel('none', 'morph'), 'none', 'the morph driver has no stop check');
  assert.equal(P.yReadsLabel('raf', 'morph'), P.Y_READS.raf);
  assert.equal(P.yReadsLabel('scroll', 'window'), P.Y_READS.scroll, 'scroll: the drivers use the listener y');
  assert.match(P.yReadsLabel('raf-legacy', 'scroll'), /per observer batch and cv event .*; driver scrollY 3\.3 Hz$/);
  assert.equal(m.params.settleMs, 8000);
  assert.equal(m.params.to, 2000);
  assert.deepEqual(Object.keys(m.tool.files), TOOL_FILES);
  assert.equal(m.href, 'http://127.0.0.1:9/');
  assert.equal(j.summary.mutationTotals.src, 21);
  assert.ok(lines.some((l) => /^ewin \[W\]: idle \d+fr/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /mut \{"src":21/.test(l)), 'the slow frame line shows the uncapped counts');
  assert.ok(lines.at(-1).startsWith('saved '));
  assert.deepEqual([m.rafHz, m.lowPowerSuspect, m.settings.lowPowerMode], [j.summary.rafHz, false, 'unknown']);
  assert.ok(m.rafHz > 40, `the fake page ticks at about 8 ms (rafHz ${m.rafHz})`);
  assert.ok(!lines.some((l) => /Low Power Mode/.test(l)));

  // a 30 Hz page (Low Power Mode): warned unless the operator declared it with --low-power on
  const slow30 = { ...raw, frames: raw.frames.map((f) => (f[1] === null ? f : [f[0], 33.3, ...f.slice(2)])) };
  const lpLines = [];
  console.log = (...a) => lpLines.push(a.join(' '));
  let lpOut, lpOn;
  try {
    lpOut = finish({ ...o, out: join(dir, 'lp.json') }, 'me', slow30);
    lpLines.push('--- on');
    lpOn = finish({ ...parseRunArgs(['--driver', 'window', '--to', '2000', '--low-power', 'on', '--out', join(dir, 'lp-on.json')]) }, 'me', slow30);
  } finally { console.log = log; }
  const lm = JSON.parse(readFileSync(lpOut, 'utf8')).meta, lmOn = JSON.parse(readFileSync(lpOn, 'utf8')).meta;
  assert.deepEqual([lm.rafHz, lm.lowPowerSuspect, lm.settings.lowPowerMode], [30, true, 'unknown']);
  assert.deepEqual([lmOn.rafHz, lmOn.lowPowerSuspect, lmOn.settings.lowPowerMode], [30, true, true]);
  const cut = lpLines.indexOf('--- on');
  assert.ok(lpLines.slice(0, cut).some((l) => /^ {2}warning: rAF ~30 Hz \(median frame\): Low Power Mode on\? \(settings\.lowPowerMode unknown; pass --low-power on\|off\)$/.test(l)), lpLines.join('\n'));
  assert.ok(!lpLines.slice(cut).some((l) => /Low Power Mode/.test(l)), 'declared on: no warning');

  const bad = { ...raw, err: 'boom', driverResult: null };
  const o2 = { ...o, out: join(dir, 'bad.json') };
  console.log = () => {};
  try { assert.throws(() => finish(o2, 'me', bad), /driver failed in the page: boom \(partial run saved: /); } finally { console.log = log; }
  assert.ok(existsSync(join(dir, 'bad.json')));
  assert.equal(JSON.parse(readFileSync(join(dir, 'bad.json'), 'utf8')).meta.error, 'boom');
});

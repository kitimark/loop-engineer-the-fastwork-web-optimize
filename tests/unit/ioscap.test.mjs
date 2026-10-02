// tools/lib/ioscap.mjs (incident I-062): the iPhone screen recorder's pure rules. Duration cap, output only in
// out/iphone-screen/, the LaunchServices start (the Camera permission is the app's own), the --first-run gate in
// the app's arguments, the Foundation-only self-test build, the signing-identity choice (type only, never the
// person's name), and the numbers-only frame summary. Nothing here builds or starts the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

process.env.FW_IOSCAP_ROOT = tempDir('fw-ioscap-unit-');
const L = await import('../../tools/lib/ioscap.mjs');
const ROOT = process.env.FW_IOSCAP_ROOT;
const OUT = join(ROOT, 'out', 'iphone-screen');

test('parseSeconds: default 20, capped at 600, positive numbers only', () => {
  assert.deepEqual(L.parseSeconds(undefined), { seconds: 20 });
  assert.deepEqual(L.parseSeconds('25'), { seconds: 25 });
  assert.deepEqual(L.parseSeconds('600'), { seconds: 600 });
  for (const bad of ['601', '9999', '0', '-5', 'abc', 'Infinity', true]) assert.ok(L.parseSeconds(bad).error, String(bad));
  assert.match(L.parseSeconds('601').error, /at most 600/);
});

test('outPath: default name inside out/iphone-screen; --out only a plain .mov file directly inside it', () => {
  assert.equal(L.outPath({ owner: 'lead', label: 'first run', now: 123 }).mov, join(OUT, 'lead-first-run-123.mov'));
  assert.equal(L.outPath({ out: 'out/iphone-screen/a.mov' }).mov, join(OUT, 'a.mov'));
  assert.equal(L.outPath({ out: join(OUT, 'b_1.mov') }).mov, join(OUT, 'b_1.mov'));
  for (const bad of ['/tmp/a.mov', 'out/a.mov', 'out/iphone-screen/../a.mov', 'out/iphone-screen/sub/a.mov',
    'out/iphone-screen/a.mp4', 'out/iphone-screen/a b.mov', 'out/iphone-screen', join(ROOT, '..', 'x', 'out', 'iphone-screen', 'a.mov'),
    `${process.env.HOME}/Movies/a.mov`]) {
    assert.ok(L.outPath({ out: bad }).error, bad);
  }
});

test('sidecars sit beside the .mov', () => {
  assert.deepEqual(L.sidecars('/r/out/iphone-screen/a.mov'), { result: '/r/out/iphone-screen/a.result.json', frames: '/r/out/iphone-screen/a.frames.json', pid: '/r/out/iphone-screen/a.pid', log: '/r/out/iphone-screen/a.log', summary: '/r/out/iphone-screen/a.json' });
});

test('openArgs: LaunchServices start (new instance, wait), --first-run only when asked', () => {
  const a = L.openArgs({ mov: '/r/out/iphone-screen/a.mov', seconds: 20, log: '/r/a.log' });
  assert.deepEqual(a.slice(0, 8), ['-n', '-W', '-g', '--stdout', '/r/a.log', '--stderr', '/r/a.log', L.appPath()]);
  assert.deepEqual(a.slice(8), ['--args', 'record', '--out', '/r/out/iphone-screen/a.mov', '--seconds', '20', '--codec', 'h264']);
  assert.ok(!a.includes('--first-run'));
  assert.equal(L.openArgs({ mov: '/x.mov', seconds: 5, firstRun: true, log: '/l' }).at(-1), '--first-run');
  assert.equal(L.appPath(), join(ROOT, 'out', 'ioscap', 'ioscap.app'));
});

test('recordTimeoutSec: duration + device wait (+ the prompt on a first run) + margin', () => {
  assert.equal(L.recordTimeoutSec(20, false), 20 + 15 + 75);
  assert.equal(L.recordTimeoutSec(20, true), 20 + 15 + 150 + 75);
});

test('swiftcArgs: the self-test build is Selection.swift + selftest/main.swift with no framework; the app links the capture frameworks', () => {
  const st = L.swiftcArgs({ out: '/o/st', selftest: true });
  assert.deepEqual(st.filter((x) => x.endsWith('.swift')).map((x) => x.slice(L.SRC.length + 1)), ['Selection.swift', join('selftest', 'main.swift')]);
  assert.ok(!st.includes('-framework'), 'no framework in the self-test build');
  assert.ok(!st.join(' ').includes('main.swift ') || !st.some((x) => x === join(L.SRC, 'main.swift')), 'the recorder main.swift is not in the self-test');
  const app = L.swiftcArgs({ out: '/o/app' });
  assert.deepEqual(app.filter((x) => x.endsWith('.swift')).map((x) => x.slice(L.SRC.length + 1)), ['main.swift', 'Selection.swift']);
  for (const f of ['AVFoundation', 'CoreMediaIO']) assert.ok(app.join(' ').includes(`-framework ${f}`), f);
  assert.ok(app.some((x) => /-apple-macos14\.0$/.test(x)));
});

test('pickIdentity: an Apple Development identity by hash (lowest of several), never the name; none -> null (ad hoc)', () => {
  const h1 = 'B'.repeat(40), h2 = 'A'.repeat(40);
  const one = `  1) ${h1} "Apple Development: Test Person (ABCDE12345)"\n     1 valid identities found\n`;
  assert.deepEqual(L.pickIdentity(one), { hash: h1, type: 'Apple Development', count: 1 });
  assert.ok(!JSON.stringify(L.pickIdentity(one)).includes('Test Person'));
  const two = `${one}  2) ${h2} "Apple Development: Other Person (ZYXWV98765)"\n`;
  assert.deepEqual(L.pickIdentity(two), { hash: h2, type: 'Apple Development', count: 2 });
  assert.equal(L.pickIdentity('     0 valid identities found\n'), null);
  assert.equal(L.pickIdentity(`  1) ${h1} "Developer ID Application: X (ABCDE12345)"\n`), null);
  assert.equal(L.pickIdentity(''), null);
});

test('signatureType: type only from codesign -dvv', () => {
  assert.equal(L.signatureType('Executable=/x\nSignature=adhoc\n'), 'ad hoc');
  assert.equal(L.signatureType('Authority=Apple Development: Test Person (ABCDE12345)\nAuthority=Apple Worldwide Developer Relations Certification Authority\n'), 'Apple Development');
  assert.equal(L.signatureType('/x: code object is not signed at all'), 'unsigned');
});

test('summarizeFrames: frame count, distinct frames by hash, PTS gaps and thresholds, numbers only', () => {
  // 60 Hz delivery for 1 s, the picture changes every 2nd frame, one 100 ms hole
  const frames = [];
  let t = 1000;
  for (let i = 0; i < 61; i++) { frames.push([Math.round(t * 1e6) / 1e6, `h${Math.floor(i / 2)}`, true]); t += i === 30 ? 0.1 : 1 / 60; }
  const s = L.summarizeFrames({ frames, outputDrops: 1, writerDrops: 0, width: 1290, height: 2796, pixelFormat: '420v', format: { active: { width: 1290, height: 2796 } } });
  assert.equal(s.frames, 61);
  assert.equal(s.written, 61);
  assert.equal(s.distinct, 31);
  assert.equal(s.gapsMs.n, 60);
  assert.equal(s.gapsMs.median, 16.7);
  assert.equal(s.gapsMs.max, 100);
  assert.equal(s.gapsMs.gt50, 1);
  assert.equal(s.gapsMs.gt34, 1);
  assert.equal(s.distinctGapsMs.n, 30);
  assert.equal(s.distinctGapsMs.median, 33.3);
  assert.ok(s.distinctGapsMs.max > 100);
  assert.equal(s.nonMonotonic, 0);
  assert.equal(s.outputDrops, 1);
  assert.deepEqual([s.width, s.height, s.pixelFormat], [1290, 2796, '420v']);
  assert.match(L.summaryLine(s), /^frames 61 over 1\.1 s .* distinct 31 /);
  const empty = L.summarizeFrames({ frames: [] });
  assert.equal(empty.frames, 0);
  assert.equal(empty.fps, null);
});

test('holdKind: exclusive only for this process\'s own live hold; a shared slot is "shared"; nothing else counts', () => {
  const st = (holder) => ({ holder, stale: null, queue: [] });
  const h = { owner: 'me', token: 'abcdef012345', pid: process.pid, acquiredAt: new Date().toISOString() };
  assert.equal(L.holdKind(st(h), { FW_LOCK_HELD: 'chrome-measure:abcdef012345' }), 'exclusive');
  assert.equal(L.holdKind(st({ ...h, short: true }), { FW_LOCK_HELD: 'chrome-measure:abcdef012345' }), 'short');
  assert.equal(L.holdKind(st(h), { FW_LOCK_HELD: 'chrome-measure:000000000000' }), null);
  assert.equal(L.holdKind(st(h), {}), null);
  assert.equal(L.holdKind(st(null), { FW_LOCK_HELD: 'chrome-measure:abcdef012345' }), null);
});

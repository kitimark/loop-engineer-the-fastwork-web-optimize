// The iPhone screen recorder's Swift self-test (incident I-062), compiled from the same Selection.swift the app
// uses, plus tools/ioscap/selftest/main.swift: Foundation only, no capture framework linked, so running it can
// not list or open any device. It checks on FAKE device records that only the iOS screen is accepted (a built-in
// FaceTime camera, a Continuity camera, a USB camera, virtual cameras claiming muxed, an Apple-made non-iOS
// device, a disconnected or non-muxed iOS screen, and two iOS screens at once are all refused), plus the output
// path and duration rules. Skipped (with the reason) where swiftc is missing. An e2e file: the compile is a few
// CPU-seconds, so it runs only inside npm test's shared-lane slot, never in the unit tier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { swiftcArgs } from '../../tools/lib/ioscap.mjs';

const swiftc = spawnSync('swiftc', ['--version'], { encoding: 'utf8', timeout: 30000 });
const skip = swiftc.status === 0 ? false : `swiftc not available (${swiftc.error?.code || `exit ${swiftc.status}`}): install the Xcode command line tools`;

test('Swift self-test: only the iOS screen is accepted; no capture framework in the binary', { skip, timeout: 240000 }, () => {
  const bin = join(tempDir('fw-ioscap-st-'), 'ioscap-selftest');
  const c = spawnSync('swiftc', swiftcArgs({ out: bin, selftest: true }), { encoding: 'utf8', timeout: 220000 });
  assert.equal(c.status, 0, `swiftc failed:\n${c.stdout}${c.stderr}`);
  const libs = spawnSync('otool', ['-L', bin], { encoding: 'utf8' });
  if (libs.status === 0) assert.doesNotMatch(libs.stdout, /AVFoundation|CoreMediaIO|CoreMedia\.framework|AVFCapture/, 'the self-test links no capture framework');
  const r = spawnSync(bin, ['--selftest'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^SELFTEST ok (\d+)\/\1$/m);
  assert.ok(Number(r.stdout.match(/SELFTEST ok (\d+)/)[1]) >= 25, 'all cases ran');
  assert.doesNotMatch(r.stdout, /FAIL/);
});

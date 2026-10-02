// The recording-route guard (incident I-062, user T-018/T-019) in .claude/hooks/git-guard.mjs and
// .claude/settings.json: the only route that records the iPhone screen is `node tools/ioscap.mjs record`; QuickTime
// Player automation, camera listing, ffmpeg's avfoundation input, imagesnap, screencapture video, inline scripts
// that use the capture APIs and starting ioscap.app by hand are denied; the first run (--first-run, the macOS
// Camera prompt) asks the user. Runs the hook as Claude Code does (JSON on stdin; exit 2 = deny, JSON "ask").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'git-guard.mjs');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|PREFIX|CONFIG_(COUNT|PARAMETERS|KEY_|VALUE_))/.test(k)));

function decide(command) {
  const input = { session_id: 't', transcript_path: '/dev/null', cwd: ROOT, permission_mode: 'default', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command, description: 't' }, tool_use_id: 'toolu_t' };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10000, env: ENV });
  if (r.status === 2) { assert.match(r.stderr, /git-guard: .*ioscap\.mjs record/); return 'deny'; }
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

const DENY = [
  `osascript -e 'tell application "QuickTime Player" to new movie recording'`,
  `osascript -e 'tell application "QuickTime Player"' -e 'activate' -e 'end tell'`,
  `osascript <<EOF\ntell application "QuickTime Player" to new movie recording\nEOF`,
  `open -a "QuickTime Player"`,
  'open -a QuickTime\\ Player',
  'open -b com.apple.QuickTimePlayerX',
  'open "/System/Applications/QuickTime Player.app"',
  `sh -c 'open -a "QuickTime Player"'`,
  'system_profiler SPCameraDataType',
  '/usr/sbin/system_profiler -json SPCameraDataType',
  'system_profiler SPUSBDataType SPCameraDataType',
  'system_profiler',
  'system_profiler -detailLevel full',
  'ffmpeg -f avfoundation -list_devices true -i ""',
  'ffmpeg -f avfoundation -i "0" out.mov',
  'nice -n 5 ffmpeg -f avfoundation -i 1 x.mp4',
  'imagesnap -l',
  'imagesnap shot.jpg',
  'screencapture -v clip.mov',
  'screencapture -V 10 clip.mov',
  'screencapture -xv clip.mov',
  'screencapture -v -g clip.mov',
  `swift -e 'import AVFoundation; print(AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .unspecified).devices)'`,
  `python3 -c 'import AVFoundation; AVFoundation.AVCaptureDevice.devices()'`,
  `python3 <<EOF\nfrom AVFoundation import AVCaptureDevice\nEOF`,
  `xcrun swift -e 'import AVFoundation'`,
  'open out/ioscap/ioscap.app --args record --out /x/out/iphone-screen/a.mov --seconds 5',
  'open -n -W /repo/out/ioscap/ioscap.app',
  'out/ioscap/ioscap.app/Contents/MacOS/ioscap record --out /x/out/iphone-screen/a.mov --seconds 5',
  'node tools/lock.mjs run chrome-measure --owner x -- sh -c "system_profiler SPCameraDataType"',
];
const ASK = [
  'node tools/ioscap.mjs record --owner lead --seconds 10 --first-run',
  'node tools/lock.mjs run chrome-measure --owner lead --no-timing --max-seconds 600 -- node tools/ioscap.mjs record --owner lead --first-run',
];
const ALLOW = [
  'node tools/ioscap.mjs record --owner lead --seconds 10',
  'node tools/ioscap.mjs status',
  'node tools/lock.mjs run chrome-measure --owner me --no-timing --max-seconds 600 -- node tools/ioscap.mjs build',
  'out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest',
  'swiftc -swift-version 5 -typecheck tools/ioscap/main.swift tools/ioscap/Selection.swift',
  'system_profiler SPHardwareDataType',
  'system_profiler -listDataTypes',
  'screencapture -x shot.png',
  'open -a Simulator --args -CurrentDeviceUDID 1234',
  `osascript -e 'tell application "Simulator" to activate'`,
  'ffmpeg -i in.mov -vf fps=1 out_%03d.png',
  'grep -n AVCaptureDevice tools/ioscap/main.swift',
  `node -e 'console.log("AVCaptureDevice")'`,
  'node --test tests/unit/ioscap-source.test.mjs',
];

for (const c of DENY) test(`deny: ${JSON.stringify(c)}`, () => assert.equal(decide(c), 'deny'));
for (const c of ASK) test(`ask: ${JSON.stringify(c)}`, () => assert.equal(decide(c), 'ask'));
for (const c of ALLOW) test(`allow: ${JSON.stringify(c)}`, () => assert.equal(decide(c), 'allow'));

test('settings.json: deny rules for the other recording routes, ask on the first run', () => {
  const { ask = [], deny = [] } = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8')).permissions;
  for (const r of ['Bash(osascript *QuickTime*)', 'Bash(open *QuickTime*)', 'Bash(open *ioscap.app*)', 'Bash(system_profiler *SPCameraDataType*)',
    'Bash(ffmpeg *avfoundation*)', 'Bash(imagesnap*)', 'Bash(screencapture *-v*)', 'Bash(screencapture *-V*)']) assert.ok(deny.includes(r), r);
  assert.ok(ask.includes('Bash(node tools/ioscap.mjs record *--first-run*)'));
});

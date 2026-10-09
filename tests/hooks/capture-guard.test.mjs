// The recording-route guard (incident I-062, user T-018/T-019) in .claude/hooks/git-guard.mjs and
// .claude/settings.json: the only route that records the iPhone screen is `node tools/ioscap.mjs record`; QuickTime
// Player automation, camera listing, ffmpeg's avfoundation input, imagesnap, screencapture video, inline scripts
// that use the capture APIs and starting ioscap.app by hand are denied; the first run (--first-run, the macOS
// Camera prompt) asks the user. Runs the hook as Claude Code does (JSON on stdin; exit 2 = deny, JSON "ask").
// Incident I-064 (review-ioscap F2-F5): Photo Booth and FaceTime denied; ioscap started by name, bundle id or a
// binary outside <checkout>/out/ioscap/ denied; swift/swiftc/xcrun on tools/ioscap sources (other than a
// typecheck) or on any .swift file that uses the capture APIs (the hook reads the file) denied. The commands
// below are strings for the guard only: this suite never runs swift, open or any capture tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, looksGuarded } from '../../.claude/hooks/git-guard.mjs';

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
  // I-064 F3: Photo Booth and FaceTime open the Mac camera
  'open -a "Photo Booth"',
  "open -a 'Photo Booth'",
  'open -a FaceTime',
  'open -b com.apple.PhotoBooth',
  'open -b com.apple.FaceTime',
  'open "/System/Applications/Photo Booth.app"',
  'open /System/Applications/FaceTime.app',
  'open facetime://test',
  `sh -c 'open -a FaceTime'`,
  `osascript -e 'tell application "Photo Booth" to activate'`,
  `osascript -e 'tell application "FaceTime" to activate'`,
  `osascript -e 'tell application id "com.apple.PhotoBooth" to activate'`,
  `osascript <<EOF\ntell application "FaceTime" to activate\nEOF`,
  '"/System/Applications/Photo Booth.app/Contents/MacOS/Photo Booth"',
  '/System/Applications/FaceTime.app/Contents/MacOS/FaceTime',
  '"/System/Applications/QuickTime Player.app/Contents/MacOS/QuickTime Player"',
  // I-064 F4: ioscap by name, bundle id or a binary that is not <checkout>/out/ioscap/ioscap.app's
  'open -a ioscap',
  'open -a ioscap --args record --out /x/out/iphone-screen/a.mov --seconds 5',
  'open -n -a ioscap.app',
  'open -b local.fw-study.ioscap',
  'open -n -W -b local.fw-study.ioscap --args --selftest',
  '/usr/bin/open -a ioscap',
  `osascript -e 'tell application "ioscap" to activate'`,
  `osascript -e 'tell application id "local.fw-study.ioscap" to run'`,
  '/tmp/copy/ioscap.app/Contents/MacOS/ioscap --selftest',
  '/tmp/x/out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest',
  'out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest --first-run',
  'out/ioscap/ioscap.app/Contents/MacOS/other --selftest',
  '/tmp/ioscap record --out /x/out/iphone-screen/a.mov --seconds 5',
  './ioscap --selftest',
  // I-064 F2: tools/ioscap sources only through node tools/ioscap.mjs; files the guard cannot read are refused
  'swift tools/ioscap/main.swift record --out /x/out/iphone-screen/a.mov --seconds 5',
  'swift tools/ioscap/Selection.swift',
  'xcrun swift tools/ioscap/main.swift',
  'xcrun --sdk macosx swift tools/ioscap/main.swift',
  'xcrun -sdk macosx swiftc tools/ioscap/main.swift tools/ioscap/Selection.swift -o /tmp/cap',
  'swiftc -o /tmp/cap tools/ioscap/main.swift tools/ioscap/Selection.swift',
  'swiftc tools/ioscap/main.swift tools/ioscap/Selection.swift -framework AVFoundation',
  'swift-frontend -interpret tools/ioscap/main.swift',
  'tools/ioscap/main.swift',
  'swift research/architecture/oss-rendering-libs/ioscap.swift list',
  'swift research/architecture/oss-rendering-libs/ioscap.swift record /tmp/a.mov 5',
  'swift /nonexistent/elsewhere/probe.swift',
  'swift - < probe.swift',
  'cat probe.swift | swift -',
  'swift < probe.swift',
  'swift repl',
  'swiftc @args.txt',
  // I-064 follow-up (1): nobody views frames (was allowed under I-062: a frame export is viewing)
  'ffmpeg -i in.mov -vf fps=1 out_%03d.png',
  'ffmpeg -i out/iphone-screen/a.mov -f image2 frames/%04d.jpg',
  'ffmpeg -i a.mp4 -frames:v 1 shot.jpg',
  'ffmpeg -i a.mov -vframes 1 -f image2pipe -',
  'ffmpeg -i a.mov -f sdl preview',
  // user 2026-10-09 deck exception: only deck recordings, only image2 to image files under out/, no tricks
  'ffmpeg -i out/iphone-screen/lead-screen-1.mov -vf fps=10 out/deck/f_%03d.png',
  'ffmpeg -i out/iphone-screen/a-pb-V.mov -i out/iphone-screen/other.mov -vf fps=10 out/deck/f_%03d.png',
  'ffmpeg -i out/iphone-screen/a-pb-V.mov -vf fps=10 /tmp/f_%03d.png',
  'ffmpeg -i out/iphone-screen/a-pb-V.mov -vf fps=10 out/../../f_%03d.png',
  'ffmpeg -i out/iphone-screen/../x-pb-.mov -vf fps=10 out/deck/f_%03d.png',
  'ffmpeg -i out/people-blink/s1/../../iphone-screen/a.mov -vf fps=10 out/deck/f_%03d.png',
  'ffmpeg -i out/iphone-screen/a-pb-V.mov -f sdl preview',
  'ffmpeg -i out/iphone-screen/a-pb-V.mov -vframes 1 -f image2pipe -',
  // user 2026-10-09 worst-case exception: same rule as the deck, no tricks either
  'ffmpeg -i out/iphone-screen/a-wc-hero-orig.mov -vf fps=10 /tmp/f_%03d.png',
  'ffmpeg -i out/iphone-screen/../x-wc-.mov -vf fps=10 out/wc/f_%03d.png',
  'ffmpeg -i out/iphone-screen/a-wc-hero-orig.mov -f sdl preview',
  'ffmpeg -i out/iphone-screen/a-wc-end-g0l.mov -i out/iphone-screen/other.mov -vf hstack out/wc/x.gif',
  'ffmpeg -i out/wc/a-wc-hero.mov -vf fps=10 out/wc/f_%03d.png',
  'ffplay out/iphone-screen/a-wc-hero-orig.mov',
  'open out/iphone-screen/a-wc-hero-orig.mov',
  'ffmpeg -f avfoundation -i 0 out/people-blink/x.png',
  'ffplay out/iphone-screen/a-pb-V.mov',
  'open out/iphone-screen/a-pb-V.mov',
  'qlmanage -p out/people-blink/s1/C1.mov',
  'ffplay out/iphone-screen/a.mov',
  'open out/iphone-screen/lead-screen-1.mov',
  'open /x/out/iphone-screen/a.json',
  'open clip.mp4',
  'open -a IINA a.MOV',
  'open -R out/iphone-screen/',
  'qlmanage -p out/iphone-screen/a.mov',
  'qlmanage -t -s 800 -o /tmp a.mov',
  'mpv a.mov',
  // I-064 follow-up (2): wrappers are unwrapped, so the checks see the inner command
  'arch -arm64 open -a FaceTime',
  'arch -x86_64 -e A=1 imagesnap x.jpg',
  'caffeinate -i out/ioscap/ioscap.app/Contents/MacOS/ioscap record --out /x/out/iphone-screen/a.mov --seconds 5',
  'caffeinate -t 60 -w 123 swift tools/ioscap/main.swift',
  'script -q /dev/null open -a "Photo Booth"',
  'script -q -t 0 /tmp/log system_profiler SPCameraDataType',
  'launchctl submit -l x -- open -a FaceTime',
  'launchctl submit -l x -p /tmp/ioscap',
  'launchctl asuser 501 open -b local.fw-study.ioscap',
  'launchctl bsexec 1 imagesnap -l',
  'nohup ffmpeg -f avfoundation -i 0 x.mov',
  'sudo -u someone system_profiler SPCameraDataType',
  'timeout 5 qlmanage -p a.mov',
  'nice -n 5 caffeinate -i arch -arm64 open -a "Photo Booth"',
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
  'grep -n AVCaptureDevice tools/ioscap/main.swift',
  `node -e 'console.log("AVCaptureDevice")'`,
  'node --test tests/unit/ioscap-source.test.mjs',
  // I-064: what stays allowed
  'out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest',
  `${ROOT}/out/ioscap/ioscap.app/Contents/MacOS/ioscap --selftest`,
  'swiftc -typecheck tools/ioscap/main.swift tools/ioscap/Selection.swift',
  'swift --version',
  'swiftc --version',
  'xcrun --find swiftc',
  `swift -e 'print(1)'`,
  'node tools/ioscap.mjs selftest',
  'node tools/lock.mjs run chrome-measure --owner me --shared --weight 1 --max-seconds 300 -- node tools/ioscap.mjs selftest',
  'open -a Safari https://localhost:5300/',
  'grep -rn FaceTime tools/',
  'ls out/ioscap',
  // I-064 follow-ups: the numbers stay readable; the wrappers still allow the wrapped allowed command
  'ls out/iphone-screen',
  'cat out/iphone-screen/lead-screen-1.json',
  'node -e \'console.log(require("./out/iphone-screen/lead-screen-1.frames.json").frames.length)\'',
  'ffprobe -v error -show_entries format=duration out/iphone-screen/a.mov',
  'ffmpeg -i a.mov -c copy b.mov',
  // user 2026-10-09 deck exception (pictures of the people-blink deck recordings only)
  'ffmpeg -i out/people-blink/s1/C1.mov -vf fps=10 out/people-blink/frames/C1_%04d.png',
  'ffmpeg -ss 2 -i out/iphone-screen/fix-scrollcb-g0-pb-V-20261009T064210Z-1.mov -frames:v 3 out/people-blink/ph/V_%02d.png',
  'ffmpeg -i /Users/x/repo/.claude/worktrees/w/out/iphone-screen/o-pb-K-1.mov -f image2 /Users/x/repo/.claude/worktrees/w/out/pb/K_%03d.jpg',
  // user 2026-10-09 worst-case exception (pictures of the -wc- recordings)
  'ffmpeg -ss 1 -i out/iphone-screen/20261009T132512Z-wc-hero-orig.mov -vf fps=10 out/wc/frames/hero_%03d.png',
  'ffmpeg -i /Users/x/repo/.claude/worktrees/w/out/iphone-screen/20261009T141437Z-wc-end-g0l.mov -i /Users/x/repo/.claude/worktrees/w/out/iphone-screen/20261009T140920Z-wc-end-orig.mov -filter_complex hstack out/article-gifs/day7.gif',
  'caffeinate -i node tools/ioscap.mjs record --owner lead --seconds 10',
  'arch -arm64 node --version',
  'caffeinate -t 60',
  'script -q /dev/null ls',
  'launchctl list',
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

test('settings.json (I-064): deny Photo Booth, FaceTime, ioscap by name or bundle id, swift on tools/ioscap; ask before editing the recorder', () => {
  const { ask = [], deny = [] } = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8')).permissions;
  for (const r of ['Bash(open *Photo Booth*)', 'Bash(open *PhotoBooth*)', 'Bash(open *FaceTime*)', 'Bash(open *facetime*)',
    'Bash(osascript *Photo Booth*)', 'Bash(osascript *PhotoBooth*)', 'Bash(osascript *FaceTime*)',
    'Bash(open *ioscap*)', 'Bash(osascript *ioscap*)', 'Bash(swift *tools/ioscap/*)']) assert.ok(deny.includes(r), r);
  for (const r of ['Edit(/tools/ioscap/**)', 'Edit(/.claude/worktrees/*/tools/ioscap/**)',
    'Edit(/tests/unit/ioscap-source.test.mjs)', 'Edit(/.claude/worktrees/*/tests/unit/ioscap-source.test.mjs)']) assert.ok(ask.includes(r), r);
  // never loosened: the I-062 rules are all still there
  for (const r of ['Bash(osascript *QuickTime*)', 'Bash(open *QuickTime*)', 'Bash(open *ioscap.app*)']) assert.ok(deny.includes(r), r);
});

test('settings.json (I-064 follow-ups): no Read of recordings or frames, ask before editing the wrapper scripts', () => {
  const { ask = [], deny = [] } = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8')).permissions;
  for (const base of ['/out/iphone-screen', '/.claude/worktrees/*/out/iphone-screen']) {
    for (const ext of ['mov', 'mp4', 'm4v', 'png', 'jpg', 'jpeg', 'heic']) assert.ok(deny.includes(`Read(${base}/**/*.${ext})`), `${base} ${ext}`);
    assert.ok(!deny.includes(`Read(${base}/**)`), 'the numbers JSON stays readable');
  }
  for (const r of ['Edit(/tools/ioscap.mjs)', 'Edit(/.claude/worktrees/*/tools/ioscap.mjs)',
    'Edit(/tools/lib/ioscap.mjs)', 'Edit(/.claude/worktrees/*/tools/lib/ioscap.mjs)']) assert.ok(ask.includes(r), r);
  for (const r of ['Bash(open *iphone-screen*)', 'Bash(qlmanage *)', 'Bash(ffplay *)']) assert.ok(deny.includes(r), r);
});

test('wrappers (arch, caffeinate, script, launchctl) are unwrapped for the git rules too', () => {
  for (const c of ['arch -arm64 git push', 'caffeinate -i git merge feature', 'script -q /dev/null git push', 'launchctl submit -l x -- git push',
    'launchctl asuser 501 git merge --no-ff x']) assert.equal(analyze(c, { cwd: ROOT }).decision, 'deny', c);
  assert.equal(analyze('caffeinate -i git status', { cwd: ROOT }).decision, null);
});

test('the hook header names its known limits (xcodebuild, subprocess calls)', () => {
  const src = readFileSync(join(ROOT, '.claude', 'hooks', 'git-guard.mjs'), 'utf8').slice(0, 6000);
  assert.match(src, /Known limits/);
  assert.match(src, /xcodebuild/);
  assert.match(src, /subprocess/);
});

test('F4: the bundle id the guard denies is the one in tools/ioscap/Info.plist', () => {
  const plist = readFileSync(join(ROOT, 'tools', 'ioscap', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>CFBundleIdentifier<\/key>\s*<string>local\.fw-study\.ioscap<\/string>/);
});

test('F2: no tracked .swift file outside tools/ioscap/ uses the capture APIs (the old research recorder is gone)', () => {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-z', '*.swift'], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  const files = r.stdout.split('\0').filter(Boolean);
  assert.ok(files.includes('tools/ioscap/main.swift'), 'git ls-files sees the recorder');
  assert.ok(!files.includes('research/architecture/oss-rendering-libs/ioscap.swift'), 'the 6c5bcbb recorder is removed');
  const CAPTURE = /AVCapture|AVFoundation|CoreMediaIO|CMIOObject|ScreenCaptureKit|SCStream/;
  for (const f of files.filter((x) => !x.startsWith('tools/ioscap/'))) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), CAPTURE, `${f} uses the capture APIs outside tools/ioscap/`);
  }
  assert.match(readFileSync(join(ROOT, 'research', 'architecture', 'oss-rendering-libs', 'README.md'), 'utf8'), /tools\/ioscap/);
});

// F2 with files on disk: the guard reads the .swift file a swift/swiftc/xcrun command names. The files are text
// fixtures (never compiled or run); `analyze` is called on command strings only.
test('F2: swift, swiftc, xcrun and a swift shebang script on a file that uses the capture APIs are denied; plain files are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fw-capture-guard-'));
  try {
    writeFileSync(join(dir, 'cap.swift'), 'import AVFoundation\nlet s = AVCaptureSession()\n');
    writeFileSync(join(dir, 'cmio.swift'), 'import CoreMediaIO\nvar a = CMIOObjectPropertyAddress()\n');
    writeFileSync(join(dir, 'plain.swift'), 'print("hello")\n');
    writeFileSync(join(dir, 'capscript'), '#!/usr/bin/swift\nimport AVFoundation\n');
    mkdirSync(join(dir, 'pkg', 'Sources', 'cap'), { recursive: true });
    writeFileSync(join(dir, 'pkg', 'Package.swift'), '// swift-tools-version:5.9\nimport PackageDescription\n');
    writeFileSync(join(dir, 'pkg', 'Sources', 'cap', 'main.swift'), 'import AVFoundation\nprint(AVCaptureDevice.self)\n');
    mkdirSync(join(dir, 'clean', 'Sources', 'ok'), { recursive: true });
    writeFileSync(join(dir, 'clean', 'Package.swift'), '// swift-tools-version:5.9\nimport PackageDescription\n');
    writeFileSync(join(dir, 'clean', 'Sources', 'ok', 'main.swift'), 'print(1)\n');
    const ctx = { cwd: dir };
    const denied = [
      'swift cap.swift', `swift ${join(dir, 'cap.swift')}`, 'swift cmio.swift list', 'swiftc cap.swift -o cap', 'swiftc -typecheck cap.swift',
      'swiftc plain.swift cap.swift', 'xcrun swift cap.swift', 'xcrun --sdk macosx swiftc -O cap.swift', '/usr/bin/swift cap.swift',
      'sh -c "swift cap.swift"', 'node tools/lock.mjs run chrome-measure --owner x -- swift cap.swift', './cap.swift', 'swift capscript',
      'swift -swift-version 5 cap.swift', 'swift build --package-path pkg', 'swift run --package-path pkg', `swift run --package-path=${join(dir, 'pkg')}`,
      'swift missing.swift', 'swiftc missing.swift',
    ];
    for (const c of denied) {
      const r = analyze(c, ctx);
      assert.equal(r.decision, 'deny', c);
      assert.match(r.reason, /ioscap\.mjs record/, c);
    }
    for (const c of ['swift plain.swift', 'swiftc plain.swift -o plain', 'xcrun swift plain.swift', 'swift build --package-path clean', 'swift build']) {
      assert.equal(analyze(c, ctx).decision, null, c);
    }
    assert.equal(analyze('swift build', { cwd: join(dir, 'pkg') }).decision, 'deny', 'swift build in a capture package');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('F2-F4: the raw-text fallback (a command the guard cannot parse) blocks the new routes too', () => {
  for (const t of ['open -a "Photo Booth', "open -a FaceTime '", 'open -b local.fw-study.ioscap "', "open -a ioscap '",
    'swift tools/ioscap/main.swift "', "xcrun swiftc x.swift '",
    "open out/iphone-screen/a.mov '", 'qlmanage -p a.mov "', "ffmpeg -i a.mov -f image2 x%d.png '", 'ffplay a.mp4 "']) assert.ok(looksGuarded(t), t);
  assert.ok(!looksGuarded('ls -la out'), 'unrelated text');
});

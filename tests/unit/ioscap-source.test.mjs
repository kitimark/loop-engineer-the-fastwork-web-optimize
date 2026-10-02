// Static guard over the iPhone screen recorder's Swift source (incident I-062, user T-018/T-019): the app may
// only ever discover external muxed devices and open the one iOS screen. These checks read the source; they
// compile and run nothing. A failure here means the recorder could reach the Mac's own camera, list devices,
// fall back to another device, or print what identifies the phone: fix the source, never this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../helpers.mjs';

const DIR = join(REPO, 'tools', 'ioscap');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const FILES = walk(DIR).filter((f) => f.endsWith('.swift'));
const src = Object.fromEntries(FILES.map((f) => [relative(DIR, f), readFileSync(f, 'utf8')]));
/** Source without // comments and string literals' contents? No: comments only (strings matter: "QuickTime" in a string is banned too). */
const code = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const ALL = Object.values(src).join('\n');

test('the Swift sources are where the guard looks', () => {
  assert.deepEqual(Object.keys(src).sort(), ['Selection.swift', 'main.swift', join('selftest', 'main.swift')].sort());
});

test('no API that reaches other cameras or lists devices', () => {
  const banned = [
    [/AVCaptureDevice\s*\.\s*default\s*\(/, 'AVCaptureDevice.default('],
    [/\.devices\s*\(/, '.devices( (AVCaptureDevice.devices() / devices(for:))'],
    [/\bdefault\s*\(\s*for\s*:/, 'default(for:)'],
    [/builtInWideAngleCamera/, 'builtInWideAngleCamera'],
    [/continuityCamera/, 'continuityCamera'],
    [/deskViewCamera/, 'deskViewCamera'],
    [/externalUnknown/, 'externalUnknown'],
    [/builtIn[A-Z]\w*Camera|builtInMicrophone|\.microphone\b/, 'built-in device types'],
    [/QuickTime/i, 'QuickTime'],
    [/system_profiler/i, 'system_profiler'],
    [/SPCameraDataType/i, 'SPCameraDataType'],
    [/ffmpeg/i, 'ffmpeg'],
    [/avfoundation/, 'avfoundation (an ffmpeg input)'],
    [/imagesnap/i, 'imagesnap'],
    [/\bscreencapture\b/, 'screencapture (the CLI)'],
    [/osascript|NSAppleScript/, 'AppleScript'],
    [/\bProcess\s*\(|NSTask|posix_spawn|\bsystem\s*\(/, 'spawning another program'],
    [/AVCaptureMovieFileOutput/, 'AVCaptureMovieFileOutput (the recorder writes with AVAssetWriter)'],
    [/AVCaptureScreenInput|SCStream|ScreenCaptureKit/, 'Mac screen capture'],
    [/AllowWirelessScreenCaptureDevices/, 'wireless screen-capture devices (stay at the default, off)'],
    [/localizedName|uniqueID/, "the device's name or unique id (Hard rule 12: never read, never printed)"],
  ];
  for (const [f, s] of Object.entries(src)) for (const [re, what] of banned) assert.doesNotMatch(s, re, `${f}: ${what}`);
});

test('exactly one discovery: deviceTypes [.external], mediaType .muxed', () => {
  const calls = [...ALL.matchAll(/DiscoverySession\s*\(([^)]*)\)/g)];
  assert.equal(calls.length, 1, 'one DiscoverySession');
  const args = calls[0][1].replace(/\s+/g, '');
  assert.match(args, /^deviceTypes:\[\.external\],mediaType:\.muxed,position:\.unspecified$/, args);
  assert.equal((ALL.match(/DiscoverySession/g) || []).length, 1, 'no other DiscoverySession reference');
  assert.equal((ALL.match(/deviceTypes\s*:/g) || []).length, 1);
  assert.equal((ALL.match(/mediaType\s*:/g) || []).length, 2, 'the discovery and the writer input (.video, a file track) only');
  assert.match(code(src['main.swift']), /AVAssetWriterInput\(mediaType:\s*\.video,/);
});

test('the identity filter: model id "iOS Device", manufacturer "Apple Inc.", external, muxed, connected', () => {
  const s = code(src['Selection.swift']);
  assert.match(s, /let IOS_SCREEN_MODEL_ID = "iOS Device"/);
  assert.match(s, /let IOS_SCREEN_MANUFACTURER = "Apple Inc\."/);
  const f = s.slice(s.indexOf('func refusalReason'), s.indexOf('func selectIOSScreen'));
  for (const c of [/!d\.isExternalType/, /d\.modelID != IOS_SCREEN_MODEL_ID/, /d\.manufacturer != IOS_SCREEN_MANUFACTURER/, /!d\.hasMuxed/, /!d\.isConnected/]) assert.match(f, c);
  // the record the filter sees comes from the device itself, every field
  const m = code(src['main.swift']);
  assert.match(m, /DeviceRecord\(modelID: d\.modelID, manufacturer: d\.manufacturer, isExternalType: d\.deviceType == \.external,\s*hasMuxed: d\.hasMediaType\(\.muxed\), isConnected: d\.isConnected\)/);
});

test('no fallback: only the selected device is opened, exactly one candidate or nothing', () => {
  const m = code(src['main.swift']);
  const sel = code(src['Selection.swift']);
  assert.match(sel, /if ok\.count == 1 \{ return \.accepted\(ok\[0\]\) \}/);
  assert.match(sel, /if ok\.count > 1 \{ return \.ambiguous/);
  assert.doesNotMatch(ALL, /(candidates|devices|others)\s*\.\s*(first|last|randomElement)\b|\?\?\s*(candidates|discovery|AVCaptureDevice)/, 'no first/last device, no ?? fallback device');
  assert.doesNotMatch(code(src['main.swift']), /candidates\[0\]|devices\[0\]/, 'no index-0 device');
  // one input, made from screenDevice, which is assigned only in the .accepted branch
  assert.equal((m.match(/AVCaptureDeviceInput\(/g) || []).length, 1);
  assert.match(m, /AVCaptureDeviceInput\(device: screenDevice\)/);
  assert.equal((m.match(/screenDevice = /g) || []).length, 1);
  assert.match(m, /case \.accepted\(let i\):\s*screenDevice = candidates\[i\]/);
  assert.match(m, /case \.ambiguous[\s\S]{0,200}finish\(5,/);
  assert.match(m, /case \.noneAccepted[\s\S]{0,300}finish\(4,/);
  // the input comes after the permission check and the selection
  const at = (re) => m.search(re);
  assert.ok(at(/authorizationStatus\(for: \.video\)/) < at(/DiscoverySession\(/), 'permission state before discovery');
  assert.ok(at(/DiscoverySession\(/) < at(/AVCaptureDeviceInput\(/));
  assert.ok(at(/guard tccNow == \.authorized/) < at(/AVCaptureDeviceInput\(/), 'authorized before opening');
});

test('the permission prompt only behind --first-run; never asked otherwise', () => {
  const m = code(src['main.swift']);
  assert.equal((m.match(/requestAccess/g) || []).length, 1, 'one requestAccess');
  assert.match(m, /case \.notDetermined:\s*if !firstRun \{ finish\(3,/);
  assert.match(m, /let firstRun = argv\.contains\("--first-run"\)/);
  // the requestAccess sits in the notDetermined branch, reachable only when firstRun let it through
  assert.ok(m.indexOf('if !firstRun { finish(3,') < m.indexOf('requestAccess'));
  // I-064 (review-ioscap nit): the prompt block itself is gated on firstRun too, not only the earlier switch, and a
  // notDetermined state without --first-run ends with exit 3 right there
  const gate = 'if firstRun && AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {';
  const g = m.indexOf(gate);
  assert.ok(g >= 0, `the prompt block starts with: ${gate}`);
  const elseAt = m.indexOf('} else if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {', g);
  assert.ok(elseAt > g, 'an else branch for notDetermined without --first-run');
  const r = m.indexOf('requestAccess');
  assert.ok(g < r && r < elseAt, 'requestAccess sits inside the firstRun && notDetermined block');
  assert.match(m.slice(elseAt, elseAt + 400), /^\} else if [^\n]*\{\s*finish\(3, /, 'the else branch ends the run with exit 3');
});

test('the self-test half imports Foundation only; the recorder handles --selftest before any capture call', () => {
  for (const f of ['Selection.swift', join('selftest', 'main.swift')]) {
    const imports = [...src[f].matchAll(/^\s*import\s+(\w+)/gm)].map((x) => x[1]);
    assert.deepEqual(imports, ['Foundation'], f);
    assert.doesNotMatch(code(src[f]), /AVCapture|CMIO|AVAsset/, f);
  }
  const m = code(src['main.swift']);
  assert.ok(m.indexOf('if argv.first == "--selftest" { exit(ioscapSelfTest()) }') < m.search(/AVCapture|CMIO/));
});

test('output and duration rules are enforced in the app too (not only in the wrapper)', () => {
  const m = code(src['main.swift']);
  assert.match(m, /if let p = outPathProblem\(outPath\) \{ say\("refusing: \\\(p\)"\); exit\(2\) \}/);
  assert.match(m, /if let p = secondsProblem\(seconds\) \{ say\("refusing: \\\(p\)"\); exit\(2\) \}/);
  assert.match(code(src['Selection.swift']), /let MAX_SECONDS = 600\.0/);
  assert.match(code(src['Selection.swift']), /let OUT_DIR_MARK = "\/out\/iphone-screen\/"/);
  assert.match(m, /watchdog/);
});

test('Info.plist: the plain Camera usage text; entitlements: camera only', () => {
  const plist = readFileSync(join(DIR, 'Info.plist'), 'utf8');
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>Records the screen of your connected iPhone for the look check\. It never uses the Mac's camera\.<\/string>/);
  assert.match(plist, /<key>LSUIElement<\/key>\s*<true\/>/);
  const ent = readFileSync(join(DIR, 'ioscap.entitlements'), 'utf8');
  assert.deepEqual([...ent.matchAll(/<key>([^<]+)<\/key>/g)].map((x) => x[1]), ['com.apple.security.device.camera']);
});

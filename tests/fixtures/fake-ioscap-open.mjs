#!/usr/bin/env node
// Stand-in for `open -n -W ... ioscap.app --args record ...` in the tools/ioscap.mjs tests ($FW_IOSCAP_OPEN). It acts
// like the app behind it, without any device: the Camera permission state comes from FAKE_IOSCAP_TCC
// (authorized | notDetermined | denied; default authorized) with the app's rule (never asked -> exit 3 unless
// --first-run; --first-run -> FAKE_IOSCAP_ANSWER grant|deny, default grant), then FAKE_IOSCAP_DEVICE (ios | none),
// then a "recording": a few synthetic frames, an empty .mov, the frames sidecar and the result file.
// FAKE_IOSCAP_LOG: one JSON line of argv per call.
import { appendFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
if (process.env.FAKE_IOSCAP_LOG) appendFileSync(process.env.FAKE_IOSCAP_LOG, JSON.stringify(argv) + '\n');
const at = argv.indexOf('--args');
const app = argv.slice(0, at);
const args = argv.slice(at + 1);
const val = (n) => args[args.indexOf(n) + 1];
const log = app[app.indexOf('--stdout') + 1];
if (!(app.includes('-n') && app.includes('-W')) || !app.some((a) => a.endsWith('ioscap.app'))) { console.error('fake open: not an ioscap start'); process.exit(1); }
const out = val('--out');
const base = out.replace(/\.mov$/, '');
const seconds = Number(val('--seconds'));
const firstRun = args.includes('--first-run');
const result = { schema: 'fw-ioscap-result/1', seconds, firstRun, codec: val('--codec'), startedAt: new Date().toISOString() };
function finish(code, message) {
  Object.assign(result, { exit: code, message, endedAt: new Date().toISOString() });
  writeFileSync(`${base}.result.json`, JSON.stringify(result));
  appendFileSync(log, `ioscap: ${message}\n`);
  process.exit(0); // like `open -W`: the app's code does not come through
}
let tcc = process.env.FAKE_IOSCAP_TCC || 'authorized';
result.cameraPermission = tcc;
if (!out.includes('/out/iphone-screen/') || !out.endsWith('.mov') || seconds > 600) finish(2, 'refusing: bad arguments');
if (tcc === 'denied') finish(3, 'the Camera permission for ioscap is denied. Nothing was opened.');
if (tcc === 'notDetermined' && !firstRun) finish(3, 'the Camera permission for ioscap was never asked. Nothing was opened.');
if ((process.env.FAKE_IOSCAP_DEVICE || 'ios') === 'none') { result.refusedDevices = 1; finish(4, 'no iPhone screen appeared within 15 s (1 other external device(s) refused). Nothing was opened.'); }
if (tcc === 'notDetermined') {
  tcc = (process.env.FAKE_IOSCAP_ANSWER || 'grant') === 'grant' ? 'authorized' : 'denied';
  result.cameraPermission = tcc;
  if (tcc !== 'authorized') finish(3, 'the Camera permission was not granted; nothing was opened');
}
result.device = { modelID: 'iOS Device', manufacturer: 'Apple Inc.' };
const frames = [];
for (let i = 0; i < 31; i++) frames.push([100 + i / 60, `h${Math.floor(i / 3)}`, true]);
writeFileSync(out, '');
writeFileSync(`${base}.frames.json`, JSON.stringify({ schema: 'fw-ioscap-frames/1', frames, outputDrops: 0, writerDrops: 0, width: 1290, height: 2796, pixelFormat: '420v', format: { active: { width: 1290, height: 2796 } } }));
result.frames = frames.length;
finish(0, 'recording saved');

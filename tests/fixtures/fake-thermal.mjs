#!/usr/bin/env node
// Stand-in for the phone's thermal read (incident I-186, tools/lib/thermal-profile.mjs), so no test reaches the real
// phone, xctrace or libimobiledevice. tests/helpers.mjs cleanEnv points $FW_XCTRACE and $FW_THERMAL_BATTERY at it.
//   record ... --output <trace>      makes the trace dir (no 10 s wait)
//   export --input <trace> ...       prints a 'device-thermal-state-intervals' table in xctrace's export shape
//   ioregentry AppleSmartBattery     prints a battery plist (idevicediagnostics' shape)
// The state: $FAKE_THERMAL_FILE (a file "<state> <induced> [battC] [condition]", read on every call, so a test can change
// it while a hold runs), else $FAKE_THERMAL_STATE (default Serious) / $FAKE_THERMAL_INDUCED (default Yes) / $FAKE_THERMAL_BATT_C
// (default 33.5) / $FAKE_THERMAL_CONDITION (the Induced row's own state, default = the state; I-201: Current Critical
// under a Serious condition). $FAKE_THERMAL_ROWS (default 1) is the number of intervals (Current row, + Induced row when induced;
// repeated cells use xctrace's ref="n" form);
// $FAKE_THERMAL_RECORD_EXIT makes record fail. Each call appends {cmd} to $FAKE_THERMAL_LOG.
// I-225: $FAKE_THERMAL_SEQ, a file of such lines, one per read: each `record` moves to the next line (counter in
// <file>.n; the last line repeats), and that read's export and battery calls use it (overrides FAKE_THERMAL_FILE).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The export XML for intervals [{state, induced, condition}] (exported for unit tests), in the shape xctrace wrote on our
 * phone (tests/fixtures/thermal-induced-serious-2rows.xml, captured 2026-10-04): each interval is a "Current" row (the
 * device's state, is-induced No) and, while Xcode's condition is on (induced Yes), an "Induced" row (is-induced Yes, its
 * state the condition's own level: `condition`, default the state; the lead's read of 2026-10-05 06:14Z had Current
 * Critical and Induced Serious, I-201) whose repeated cells are refs. A value is written once with id + fmt, then as ref="n".
 */
export function thermalXml(intervals) {
  const ids = new Map();
  let n = 0;
  const cell = (tag, fmt, raw) => {
    const k = `${tag}:${fmt}`;
    if (ids.has(k)) return `<${tag} ref="${ids.get(k)}"/>`;
    ids.set(k, ++n);
    return `<${tag} id="${n}" fmt="${fmt}">${raw}</${tag}>`;
  };
  const row = (i, state, track, ind) => `<row>${cell('start-time', `00:${String(i * 10).padStart(2, '0')}.000.000`, i * 1e10)}${cell('duration', '10.00 s', 1e10)}${cell('start-time', `00:${String(i * 10 + 10).padStart(2, '0')}.000.000`, (i + 1) * 1e10)}${cell('thermal-state', state, state)}${cell('string', track, track)}${cell('boolean', ind, ind === 'Yes' ? 1 : 0)}<narrative id="${++n}" fmt="${state}  thermal state">${cell('thermal-state', state, state)}</narrative></row>`;
  const body = intervals.flatMap((r, i) => [row(i, r.state, 'Current', 'No'), ...(r.induced === 'Yes' ? [row(i, r.condition ?? r.state, 'Induced', 'Yes')] : [])]).join('\n');
  return `<?xml version="1.0"?>
<trace-query-result>
<node xpath='//trace-toc[1]/run[1]/data[1]/table[2]'><schema name="device-thermal-state-intervals"><col><mnemonic>start</mnemonic><name>Start</name><engineering-type>start-time</engineering-type></col><col><mnemonic>duration</mnemonic><name>Duration</name><engineering-type>duration</engineering-type></col><col><mnemonic>end</mnemonic><name>End</name><engineering-type>start-time</engineering-type></col><col><mnemonic>thermal-state</mnemonic><name>Thermal State</name><engineering-type>thermal-state</engineering-type></col><col><mnemonic>track-label</mnemonic><name>Track</name><engineering-type>string</engineering-type></col><col><mnemonic>is-induced</mnemonic><name>Is Induced</name><engineering-type>boolean</engineering-type></col><col><mnemonic>narrative</mnemonic><name>Narrative</name><engineering-type>narrative</engineering-type></col></schema>
${body}
</node></trace-query-result>`;
}

function main() {
  const args = process.argv.slice(2);
  const env = process.env;
  if (env.FAKE_THERMAL_LOG) appendFileSync(env.FAKE_THERMAL_LOG, JSON.stringify({ cmd: args[0] }) + '\n');
  let [state, induced, batt, condition] = [env.FAKE_THERMAL_STATE || 'Serious', env.FAKE_THERMAL_INDUCED || 'Yes', env.FAKE_THERMAL_BATT_C || '33.5', env.FAKE_THERMAL_CONDITION || undefined];
  if (env.FAKE_THERMAL_FILE && existsSync(env.FAKE_THERMAL_FILE)) {
    const f = readFileSync(env.FAKE_THERMAL_FILE, 'utf8').trim().split(/\s+/);
    [state, induced] = [f[0] || state, f[1] || induced];
    if (f[2]) batt = f[2];
    if (f[3]) condition = f[3];
  }
  if (env.FAKE_THERMAL_SEQ && existsSync(env.FAKE_THERMAL_SEQ)) {
    const lines = readFileSync(env.FAKE_THERMAL_SEQ, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const cnt = `${env.FAKE_THERMAL_SEQ}.n`;
    let n = existsSync(cnt) ? Number(readFileSync(cnt, 'utf8')) : -1;
    if (args[0] === 'record') writeFileSync(cnt, String(++n));
    const f = (lines[Math.min(Math.max(n, 0), lines.length - 1)] || '').split(/\s+/);
    [state, induced] = [f[0] || state, f[1] || induced];
    if (f[2]) batt = f[2];
    condition = f[3] || undefined;
  }
  if (args[0] === 'record') {
    if (env.FAKE_THERMAL_RECORD_EXIT) process.exit(Number(env.FAKE_THERMAL_RECORD_EXIT));
    const i = args.indexOf('--output');
    if (i < 0 || !args.includes('--device')) { console.error('fake xctrace: record needs --output and --device'); process.exit(2); }
    mkdirSync(args[i + 1], { recursive: true });
    return;
  }
  if (args[0] === 'export') {
    const i = args.indexOf('--input');
    if (i < 0 || !existsSync(args[i + 1])) { console.error('fake xctrace: export --input <trace> (no such trace)'); process.exit(3); }
    const n = Number(env.FAKE_THERMAL_ROWS ?? 1);
    console.log(thermalXml(Array.from({ length: n }, () => ({ state, induced, condition }))));
    return;
  }
  if (args[0] === 'ioregentry' && args[1] === 'AppleSmartBattery') {
    console.log(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>IORegistry</key>
	<dict>
		<key>Temperature</key>
		<integer>${Math.round(Number(batt) * 100)}</integer>
		<key>IsCharging</key>
		<false/>
	</dict>
</dict>
</plist>`);
    return;
  }
  console.error(`fake thermal: unexpected args ${args.join(' ')}`);
  process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

#!/usr/bin/env node
// Stand-in for `idevicediagnostics ioregentry AppleSmartBattery` in the `iphone.mjs run` tests ($FW_IDEVICEDIAGNOSTICS):
// prints a plist like libimobiledevice's, with a battery serial that must never reach the run JSON. Each call
// appends one line to $FAKE_IDD_LOG (if set) and reports 1 % less capacity than the previous call.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] !== 'ioregentry' || args[1] !== 'AppleSmartBattery') { console.error(`fake idevicediagnostics: unexpected args ${args.join(' ')}`); process.exit(1); }
const log = process.env.FAKE_IDD_LOG;
const n = log && existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0;
if (log) appendFileSync(log, JSON.stringify({ args }) + '\n');
console.log(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>IORegistry</key>
	<dict>
		<key>Serial</key>
		<string>FAKESERIAL0001</string>
		<key>Temperature</key>
		<integer>${3050 + 10 * n}</integer>
		<key>IsCharging</key>
		<false/>
		<key>ExternalConnected</key>
		<true/>
		<key>CurrentCapacity</key>
		<integer>${80 - n}</integer>
	</dict>
</dict>
</plist>`);

#!/usr/bin/env node
// Stand-in for `ioreg -p IOUSB -w0 -l -r -n iPhone` ($FW_IOREG, incident I-222): the Mac's USB bus as the test sets it.
// $FAKE_IOREG_FILE: a file the test rewrites between calls, "iphone" (an iPhone node with configuration 6, speed code
// 2, as the real bus showed on 2026-10-07; serial and signature made up), "none" (no iPhone: empty output, exit 0, like
// ioreg) or "fail" (exit 1). No file: "iphone". $FAKE_IOREG_LOG: one line per call with the arguments.
import { readFileSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_IOREG_LOG) appendFileSync(process.env.FAKE_IOREG_LOG, args.join(' ') + '\n');
let mode = 'iphone';
try { mode = readFileSync(process.env.FAKE_IOREG_FILE, 'utf8').trim() || 'iphone'; } catch {}
if (mode === 'fail') { console.error('ioreg: fake failure'); process.exit(1); }
if (mode === 'iphone') {
  process.stdout.write(`+-o iPhone@00100000  <class IOUSBHostDevice, id 0x10009dfef, registered, matched, active, busy 0 (238 ms), retain 65>
    {
      "kUSBSerialNumberString" = "FAKESERIAL0000000000000A"
      "USB Product Name" = "iPhone"
      "Device Speed" = 2
      "kUSBCurrentConfiguration" = 6
      "UsbDeviceSignature" = <ac05a8120000ffff>
      "locationID" = 1048576
    }
  +-o AppleUSBHostCompositeDevice@00100000  <class IOService, id 0x10009dff0, !registered, !matched, active, busy 0, retain 4>
`);
}

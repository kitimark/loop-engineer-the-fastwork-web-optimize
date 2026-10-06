#!/usr/bin/env node
// Stand-in for `idevice_id -l` (usbmux's list of USB devices) in the `iphone.mjs wda ensure` tests ($FW_IDEVICE_ID,
// I-220): prints the UDIDs in FAKE_USB_UDIDS (comma separated; empty = no USB device), one per line, exit 0.
if (!process.argv.includes('-l')) { console.error('fake idevice_id: only -l'); process.exit(2); }
for (const u of String(process.env.FAKE_USB_UDIDS || '').split(',').filter(Boolean)) console.log(u);

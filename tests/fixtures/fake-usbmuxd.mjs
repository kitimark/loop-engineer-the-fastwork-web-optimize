// A fake usbmuxd (incident I-227) for the preflight tests: a unix socket that answers ListDevices like the daemon
// (libimobiledevice/libusbmuxd: 16-byte little-endian header, XML plist payload) with the devices in a JSON file the
// test rewrites between calls ([{id, udid, type}]; a 24-character serial without its dash like the real one when
// `raw` is set). Never the Mac's /var/run/usbmuxd.
//   import { startFakeUsbmuxd } from './fake-usbmuxd.mjs';  const u = await startFakeUsbmuxd(dir);  u.set([...]); u.socket
import { createServer } from 'node:net';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePacket } from '../../tools/lib/usbmux.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function deviceListXml(devices) {
  const one = (d) => `\t\t<dict>\n\t\t\t<key>DeviceID</key>\n\t\t\t<integer>${d.id}</integer>\n\t\t\t<key>MessageType</key>\n\t\t\t<string>Attached</string>\n\t\t\t<key>Properties</key>\n\t\t\t<dict>\n`
    + `\t\t\t\t<key>ConnectionSpeed</key>\n\t\t\t\t<integer>480000000</integer>\n\t\t\t\t<key>ConnectionType</key>\n\t\t\t\t<string>${esc(d.type || 'USB')}</string>\n`
    + `\t\t\t\t<key>DeviceID</key>\n\t\t\t\t<integer>${d.id}</integer>\n\t\t\t\t<key>LocationID</key>\n\t\t\t\t<integer>1048576</integer>\n\t\t\t\t<key>ProductID</key>\n\t\t\t\t<integer>4776</integer>\n`
    + `\t\t\t\t<key>SerialNumber</key>\n\t\t\t\t<string>${esc(d.raw ? String(d.udid).replace('-', '') : d.udid)}</string>\n\t\t\t\t<key>USBSerialNumber</key>\n\t\t\t\t<string>x</string>\n\t\t\t\t<key>EscapedFullServiceName</key>\n\t\t\t\t<string>a &amp; b</string>\n\t\t\t\t<key>NetworkAddress</key>\n\t\t\t\t<data>\n\t\t\t\tAAAA\n\t\t\t\t</data>\n\t\t\t\t<key>Paired</key>\n\t\t\t\t<true/>\n\t\t\t</dict>\n\t\t</dict>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>DeviceList</key>\n\t<array>\n${devices.map(one).join('')}\t</array>\n</dict>\n</plist>\n`;
}
export function startFakeUsbmuxd(dir) {
  const socket = join(dir, 'mux.sock'), file = join(dir, 'devices.json'), log = join(dir, 'mux.log');
  writeFileSync(file, '[]'); writeFileSync(log, '');
  const server = createServer((c) => {
    let buf = Buffer.alloc(0);
    c.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const p = decodePacket(buf);
      if (!p) return;
      writeFileSync(log, readFileSync(log, 'utf8') + p.payload.toString('utf8').replace(/\s+/g, ' ') + '\n');
      const payload = Buffer.from(deviceListXml(JSON.parse(readFileSync(file, 'utf8'))), 'utf8');
      const h = Buffer.alloc(16);
      h.writeUInt32LE(16 + payload.length, 0); h.writeUInt32LE(1, 4); h.writeUInt32LE(8, 8); h.writeUInt32LE(p.tag, 12);
      c.end(Buffer.concat([h, payload]));
    });
    c.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(socket, () => resolve({
    socket, set: (devices) => writeFileSync(file, JSON.stringify(devices)), requests: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    close: () => new Promise((r) => server.close(() => r())),
  })));
}

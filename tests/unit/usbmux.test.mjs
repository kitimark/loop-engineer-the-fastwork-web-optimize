// I-227: lib/usbmux.mjs, usbmuxd's device list (which USB attach of the iPhone the Mac sees), against a fake daemon on
// a temp unix socket (tests/fixtures/fake-usbmuxd.mjs), never the Mac's /var/run/usbmuxd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { tempDir } from '../helpers.mjs';
import { parsePlistXml, plistXml, encodePacket, decodePacket, normalizeUdid, listDevices, usbAttachIn, attachVerdict } from '../../tools/lib/usbmux.mjs';
import { startFakeUsbmuxd, deviceListXml } from '../fixtures/fake-usbmuxd.mjs';

const UDID = '00008130-0011223344556677';

test('XML plist: a ListDevices answer parses (dict, array, integer, string, data, true, entities); the request round-trips', () => {
  const r = parsePlistXml(deviceListXml([{ id: 7, udid: UDID, raw: true }, { id: 9, udid: UDID, type: 'Network' }]));
  assert.equal(r.DeviceList.length, 2);
  assert.equal(r.DeviceList[0].DeviceID, 7);
  assert.equal(r.DeviceList[0].Properties.ConnectionType, 'USB');
  assert.equal(r.DeviceList[0].Properties.SerialNumber, '000081300011223344556677');
  assert.equal(r.DeviceList[0].Properties.EscapedFullServiceName, 'a & b');
  assert.equal(r.DeviceList[0].Properties.Paired, true);
  assert.ok(Buffer.isBuffer(r.DeviceList[0].Properties.NetworkAddress));
  assert.deepEqual(parsePlistXml(plistXml({ MessageType: 'ListDevices', ProgName: 'a<b' })), { MessageType: 'ListDevices', ProgName: 'a<b' });
  assert.throws(() => parsePlistXml('<plist><dict><key>a</key></dict></plist>'), /plist/);
  const p = decodePacket(encodePacket({ MessageType: 'ListDevices' }, 5));
  assert.deepEqual([p.version, p.message, p.tag], [1, 8, 5]);
  assert.equal(decodePacket(encodePacket({ a: 'b' }).subarray(0, 20)), null, 'incomplete packet');
});

test('a 24-character serial gets the dash like libusbmuxd sanitize_udid; the USB attach of this udid only', () => {
  assert.equal(normalizeUdid('000081300011223344556677'), UDID);
  assert.equal(normalizeUdid('0123456789abcdef0123456789abcdef01234567'), '0123456789abcdef0123456789abcdef01234567');
  const list = [{ id: 3, type: 'Network', udid: UDID }, { id: 5, type: 'USB', udid: '00008110-00AABBCCDDEEFF00' }, { id: 6, type: 'USB', udid: UDID }];
  assert.deepEqual(usbAttachIn(list, UDID), { listed: true, id: 6 });
  assert.deepEqual(usbAttachIn(list.slice(0, 2), UDID), { listed: false, usb: 1 }, 'on Wi-Fi only is not on USB');
  assert.deepEqual(usbAttachIn(list.slice(1, 2), null), { listed: true, id: 5 }, 'no udid configured: the only USB device');
  assert.equal(usbAttachIn(null, UDID), null);
});

test('attachVerdict: a runner from before the current attach (or with no record) is stale; same attach or no list is not', () => {
  assert.deepEqual(attachVerdict(4, { listed: true, id: 4 }), { stale: false, why: 'same USB attach #4 as at the runner\'s start' });
  assert.equal(attachVerdict(4, { listed: true, id: 5 }).stale, true);
  assert.match(attachVerdict(4, { listed: true, id: 5 }).why, /re-plugged since the runner started \(USB attach #4 then, #5 now\)/);
  assert.match(attachVerdict(undefined, { listed: true, id: 5 }).why, /recorded no USB attach/);
  assert.equal(attachVerdict(undefined, { listed: true, id: 5 }).stale, true);
  assert.equal(attachVerdict(4, null).stale, false);
  assert.equal(attachVerdict(null, { listed: false, usb: 0 }).stale, false);
});

test('listDevices asks the daemon on its socket; off, a missing socket or garbage: null (no verdict)', async () => {
  const dir = tempDir('fw-mux-');
  const u = await startFakeUsbmuxd(dir);
  try {
    u.set([{ id: 12, udid: UDID, raw: true }]);
    assert.deepEqual(await listDevices({ socket: u.socket }), [{ id: 12, type: 'USB', udid: UDID, location: 1048576 }]);
    assert.match(u.requests()[0], /<key>MessageType<\/key> <string>ListDevices<\/string>/);
    assert.equal(await listDevices({ socket: 'off' }), null);
    assert.equal(await listDevices({ socket: join(dir, 'nothing.sock') }), null);
    const bad = createServer((c) => c.end(Buffer.concat([Buffer.from([40, 0, 0, 0, 1, 0, 0, 0, 8, 0, 0, 0, 1, 0, 0, 0]), Buffer.from('<plist><dict><key>x</key>')])));
    await new Promise((r) => bad.listen(join(dir, 'bad.sock'), r));
    try { assert.equal(await listDevices({ socket: join(dir, 'bad.sock'), timeoutMs: 1000 }), null); } finally { bad.close(); }
  } finally { await u.close(); }
});

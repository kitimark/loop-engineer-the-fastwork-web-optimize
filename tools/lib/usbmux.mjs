// usbmuxd's device list, read-only (incident I-227): which USB attach of the iPhone the Mac sees now. usbmuxd gives
// every device attach its own DeviceID (libimobiledevice/usbmuxd src/device.c device_add -> get_next_device_id, the
// counter only grows; CONFIRMED for that implementation at 243dedf1; Apple's own usbmuxd on macOS is closed source, so
// "a re-plug gets a new DeviceID" is OBSERVED elsewhere and UNRESOLVED on our phone: `iphone.mjs preflight` prints the
// id, and the next re-plug is the decisive check). A WDA runner started before the phone's current attach is the stale
// runner of I-212 / I-227 (gestures abort with "point.x != INFINITY" after a re-plug), so the preflight restarts it.
//
// Protocol (libimobiledevice/libusbmuxd src/libusbmuxd.c 93eb168b, send_packet / send_plist_packet /
// device_info_from_plist): a unix socket ($FW_USBMUXD_SOCKET, default /var/run/usbmuxd); each packet is a 16-byte
// little-endian header {length incl. header, version 1, message 8 = plist, tag} and an XML plist. ListDevices answers
// {DeviceList: [{DeviceID, MessageType: "Attached", Properties: {ConnectionType "USB"|"Network", DeviceID, SerialNumber,
// LocationID, ProductID, ...}}]}. A 24-character SerialNumber is the UDID without its dash (sanitize_udid). Nothing here
// talks to the phone; it only asks the Mac's daemon what is attached. $FW_USBMUXD_SOCKET=off: no daemon (tests): null.
import { connect } from 'node:net';

export const USBMUXD_SOCKET = () => process.env.FW_USBMUXD_SOCKET || '/var/run/usbmuxd';
const MESSAGE_PLIST = 8;

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** An XML plist of a flat dict of strings (the request). */
export function plistXml(obj) {
  const body = Object.entries(obj).map(([k, v]) => `\t<key>${xmlEsc(k)}</key>\n\t<string>${xmlEsc(v)}</string>\n`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}</dict>\n</plist>\n`;
}

/** Parse an XML plist (dict, array, string, integer, real, true, false, data, date) into plain JS. Throws on bad input. */
export function parsePlistXml(text) {
  const toks = [];
  const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z]+)[^>]*?(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(String(text)));) {
    if (m[2]) toks.push({ close: !!m[1], tag: m[2], empty: !!m[3] });
    else if (m[4] !== undefined && m[4].trim()) toks.push({ text: m[4] });
  }
  let i = 0;
  const expectClose = (tag) => { const t = toks[i++]; if (!t || !t.close || t.tag !== tag) throw new Error(`plist: </${tag}> expected`); };
  const textOf = (tag) => { let s = ''; if (toks[i] && toks[i].text !== undefined) s = toks[i++].text; expectClose(tag); return s; };
  const value = () => {
    const t = toks[i++];
    if (!t || t.close || !t.tag) throw new Error('plist: value expected');
    if (t.empty) return t.tag === 'true' ? true : t.tag === 'false' ? false : t.tag === 'dict' ? {} : t.tag === 'array' ? [] : t.tag === 'string' ? '' : null;
    switch (t.tag) {
      case 'plist': { const v = value(); expectClose('plist'); return v; }
      case 'dict': {
        const o = {};
        while (toks[i] && !(toks[i].close && toks[i].tag === 'dict')) {
          const k = toks[i++];
          if (!k || k.tag !== 'key' || k.close) throw new Error('plist: <key> expected');
          const key = xmlUnesc(textOf('key'));
          o[key] = value();
        }
        expectClose('dict');
        return o;
      }
      case 'array': { const a = []; while (toks[i] && !(toks[i].close && toks[i].tag === 'array')) a.push(value()); expectClose('array'); return a; }
      case 'string': return xmlUnesc(textOf('string'));
      case 'integer': { const n = Number(textOf('integer').trim()); if (!Number.isFinite(n)) throw new Error('plist: bad integer'); return n; }
      case 'real': return Number(textOf('real').trim());
      case 'date': return textOf('date').trim();
      case 'data': return Buffer.from(textOf('data').replace(/\s+/g, ''), 'base64');
      case 'true': expectClose('true'); return true;
      case 'false': expectClose('false'); return false;
      default: throw new Error(`plist: unknown <${t.tag}>`);
    }
  };
  return value();
}

/** One usbmuxd packet: the 16-byte header and the XML plist payload. */
export function encodePacket(obj, tag = 1) {
  const payload = Buffer.from(plistXml(obj), 'utf8');
  const h = Buffer.alloc(16);
  h.writeUInt32LE(16 + payload.length, 0); h.writeUInt32LE(1, 4); h.writeUInt32LE(MESSAGE_PLIST, 8); h.writeUInt32LE(tag, 12);
  return Buffer.concat([h, payload]);
}
/** The first whole packet in `buf`: {length, version, message, tag, payload} or null while incomplete. */
export function decodePacket(buf) {
  if (buf.length < 16) return null;
  const length = buf.readUInt32LE(0);
  if (length < 16 || length > 16 * 1024 * 1024) throw new Error(`usbmuxd: bad packet length ${length}`);
  if (buf.length < length) return null;
  return { length, version: buf.readUInt32LE(4), message: buf.readUInt32LE(8), tag: buf.readUInt32LE(12), payload: buf.subarray(16, length) };
}

/** A SerialNumber as libusbmuxd prints it (sanitize_udid): a 24-character one gets the dash after 8. */
export const normalizeUdid = (s) => { const u = String(s || ''); return u.length === 24 ? `${u.slice(0, 8)}-${u.slice(8)}` : u; };

/** usbmuxd's ListDevices: [{id, type, udid, location}] or null when the daemon is off, missing or does not answer. */
export async function listDevices({ socket = USBMUXD_SOCKET(), timeoutMs = 3000 } = {}) {
  if (socket === 'off') return null;
  return new Promise((done) => {
    let buf = Buffer.alloc(0), over = false;
    const end = (v) => { if (over) return; over = true; clearTimeout(t); s.destroy(); done(v); };
    const s = connect(socket);
    const t = setTimeout(() => end(null), timeoutMs);
    s.on('error', () => end(null));
    s.on('close', () => end(null));
    s.on('connect', () => s.write(encodePacket({ MessageType: 'ListDevices', ClientVersionString: 'fastwork-study iphone.mjs', ProgName: 'iphone.mjs' })));
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      let p;
      try { p = decodePacket(buf); } catch { return end(null); }
      if (!p) return;
      try {
        const r = parsePlistXml(p.payload.toString('utf8'));
        const list = Array.isArray(r?.DeviceList) ? r.DeviceList : null;
        end(list ? list.map((e) => ({ id: Number(e?.Properties?.DeviceID ?? e?.DeviceID), type: String(e?.Properties?.ConnectionType || ''), udid: normalizeUdid(e?.Properties?.SerialNumber), location: e?.Properties?.LocationID ?? null })) : null);
      } catch { end(null); }
    });
  });
}

/**
 * The iPhone's USB attach now, from a device list: {listed: true, id} (its USB entry's DeviceID; with no udid
 * configured, the only USB device), {listed: false, usb: <USB devices listed>} or null (no list: no verdict).
 */
export function usbAttachIn(devices, udid) {
  if (!Array.isArray(devices)) return null;
  const usb = devices.filter((d) => d.type === 'USB');
  const mine = udid ? usb.filter((d) => d.udid.toLowerCase() === String(udid).toLowerCase()) : usb.length === 1 ? usb : [];
  return mine.length ? { listed: true, id: mine[0].id } : { listed: false, usb: usb.length };
}
export async function usbAttach(udid, opts) { return usbAttachIn(await listDevices(opts), udid); }

/**
 * Did the phone get a new USB attach since the runner started? `runnerAttach`: the attach id the runner's pidfile
 * recorded at its start (undefined/null: not recorded); `now`: usbAttachIn's verdict. {stale: true, why} when the
 * runner predates the current attach (or recorded none while one is known now), {stale: false, why} otherwise
 * (including no verdict: no list now).
 */
export function attachVerdict(runnerAttach, now) {
  if (!now || !now.listed) return { stale: false, why: now ? 'the iPhone is not on USB' : 'usbmuxd gave no device list (no verdict)' };
  if (runnerAttach == null) return { stale: true, why: `the runner recorded no USB attach at its start (started before I-227), the phone is on attach #${now.id}` };
  if (Number(runnerAttach) !== Number(now.id)) return { stale: true, why: `the phone was re-plugged since the runner started (USB attach #${runnerAttach} then, #${now.id} now)` };
  return { stale: false, why: `same USB attach #${now.id} as at the runner's start` };
}

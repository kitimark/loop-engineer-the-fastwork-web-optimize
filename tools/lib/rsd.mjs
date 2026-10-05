// The phone's RemoteServiceDiscovery (RSD) through macOS's own CoreDevice tunnel (incident I-199, tools/thermal.mjs).
// Route B (lead's GO, 2026-10-05): macOS keeps a kernel utun tunnel to a paired phone (owned by remotepairingd); a user
// process can open TCP to the phone's address inside it, as Xcode and CoreDeviceService do. We only USE that tunnel:
// nothing here creates, changes or replaces a tunnel or touches remotepairingd/remoted state, and nothing needs root.
//   1. findTunnel: remoted's own ESTABLISHED tcp6 connection to a ULA address (fc00::/7) in `netstat -anv -p tcp` is its
//      RSD session with the phone, so it names the RSD port (and the start of the phone's address: netstat cuts it);
//      `lsof` on our own processes' sockets (Xcode, CoreDeviceService) gives the full address. Read at run time, kept in
//      memory, never printed, logged or stored (messages say <tunnel>).
//   2. rsdServices: our own RSD client: HTTP/2 preface + the RemoteXPC handshake; the phone answers with its service
//      catalogue (body.Services = { name: { Port: "<n>", ... } }). We keep only names and ports, never the device's
//      properties (they carry its ids).
//   3. connectService: plain TCP to a service port (DTServiceHub needs no TLS and no RSDCheckin over RSD).
// XPC wire format and the handshake sequence are ported from appium-ios packages/remotexpc/src/lib/remote-xpc/
// (xpc-protocol.ts, handshake.ts, handshake-frames.ts, constants.ts, http2-frame-parser.ts, service-catalog.ts),
// Apache-2.0, Copyright the appium contributors, commit bd9ba5fd86b87035b15023ae46d3bcec928266b5; see tools/NOTICE.
// Test seams: $FW_NETSTAT and $FW_LSOF (programs printing netstat / lsof -F format; a .mjs runs under node),
// $FW_THERMAL_LOOPBACK=1 (also accepts remoted rows to ::1, for tests/fixtures/fake-coredevice.mjs only).
import { execFile } from 'node:child_process';
import { connect } from 'node:net';

// ---------- XPC (RemoteXPC wire format) ----------
export const XPC_WRAPPER_MAGIC = 0x29b00b92;
export const XPC_OBJECT_MAGIC = 0x42133742;
export const XPC_BODY_VERSION = 5;
export const XPC_HEADER = 24;
export const XPC_FLAGS = Object.freeze({ ALWAYS_SET: 0x1, DATA_PRESENT: 0x100, WANTING_REPLY: 0x10000, INIT_HANDSHAKE: 0x400000 });
export const XPC_TYPE = Object.freeze({ NULL: 0x1000, BOOL: 0x2000, INT64: 0x3000, UINT64: 0x4000, DOUBLE: 0x5000, DATE: 0x7000, DATA: 0x8000, STRING: 0x9000, UUID: 0xa000, ARRAY: 0xe000, DICT: 0xf000 });
const MAX_BODY = 16 * 1024 * 1024;
const pad4 = (n) => (4 - (n % 4)) % 4;
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };

function encodeKey(out, k) { const b = Buffer.from(k, 'utf8'); out.push(b, Buffer.alloc(1 + pad4(b.length + 1))); }

function encodeValue(out, v) {
  if (v === null || v === undefined) { out.push(u32(XPC_TYPE.NULL)); return; }
  if (typeof v === 'boolean') { out.push(u32(XPC_TYPE.BOOL), Buffer.from([v ? 1 : 0, 0, 0, 0])); return; }
  if (typeof v === 'number') {
    const b = Buffer.alloc(8);
    if (Number.isInteger(v)) { b.writeBigInt64LE(BigInt(v)); out.push(u32(XPC_TYPE.INT64), b); } else { b.writeDoubleLE(v); out.push(u32(XPC_TYPE.DOUBLE), b); }
    return;
  }
  if (typeof v === 'bigint') { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); out.push(u32(XPC_TYPE.UINT64), b); return; }
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); out.push(u32(XPC_TYPE.STRING), u32(s.length + 1), s, Buffer.alloc(1 + pad4(s.length + 1))); return; }
  if (v instanceof Date) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v.getTime()) * 1000000n); out.push(u32(XPC_TYPE.DATE), b); return; }
  if (Buffer.isBuffer(v)) { out.push(u32(XPC_TYPE.DATA), u32(v.length), v, Buffer.alloc(pad4(v.length))); return; }
  if (Array.isArray(v)) {
    const inner = [u32(v.length)];
    for (const x of v) encodeValue(inner, x);
    const p = Buffer.concat(inner);
    out.push(u32(XPC_TYPE.ARRAY), u32(p.length), p);
    return;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    const inner = [u32(keys.length)];
    for (const k of keys) { encodeKey(inner, k); encodeValue(inner, v[k]); }
    const p = Buffer.concat(inner);
    out.push(u32(XPC_TYPE.DICT), u32(p.length), p);
    return;
  }
  throw new TypeError(`xpc: unsupported type ${typeof v}`);
}

/** One XPC wrapper: { flags, id = 0, body (a plain object, or null for an empty message) }. */
export function xpcEncode({ flags, id = 0, body = null }) {
  const head = Buffer.alloc(XPC_HEADER);
  head.writeUInt32LE(XPC_WRAPPER_MAGIC, 0);
  head.writeUInt32LE(flags >>> 0, 4);
  head.writeBigUInt64LE(BigInt(id), 16);
  if (body === null) return head;
  if (typeof body !== 'object' || Array.isArray(body)) throw new TypeError('xpc: the body must be a dictionary');
  const out = [];
  encodeValue(out, body);
  const b = Buffer.concat([u32(XPC_OBJECT_MAGIC), u32(XPC_BODY_VERSION), ...out]);
  head.writeBigUInt64LE(BigInt(b.length), 8);
  return Buffer.concat([head, b]);
}

/** Framing check: { status: 'incomplete' | 'ok', byteLength } or { status: 'desynced', reason } (pure). */
export function xpcProbe(buf) {
  if (buf.length < XPC_HEADER) return { status: 'incomplete' };
  const magic = buf.readUInt32LE(0);
  if (magic !== XPC_WRAPPER_MAGIC) return { status: 'desynced', reason: `bad XPC wrapper magic 0x${magic.toString(16)}` };
  const len = buf.readBigUInt64LE(8);
  if (len > BigInt(MAX_BODY)) return { status: 'desynced', reason: `XPC body length ${len} too large` };
  const byteLength = XPC_HEADER + Number(len);
  return { status: buf.length < byteLength ? 'incomplete' : 'ok', byteLength };
}

const toSafe = (b) => (b >= BigInt(Number.MIN_SAFE_INTEGER) && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b);

function decodeValue(buf, o) {
  const need = (n) => { if (o.i + n > buf.length) throw new Error('xpc: truncated object'); };
  need(4);
  const t = buf.readUInt32LE(o.i); o.i += 4;
  switch (t) {
    case XPC_TYPE.NULL: return null;
    case XPC_TYPE.BOOL: need(4); o.i += 4; return buf[o.i - 4] !== 0;
    case XPC_TYPE.INT64: need(8); o.i += 8; return toSafe(buf.readBigInt64LE(o.i - 8));
    case XPC_TYPE.UINT64: need(8); o.i += 8; return toSafe(buf.readBigUInt64LE(o.i - 8));
    case XPC_TYPE.DOUBLE: need(8); o.i += 8; return buf.readDoubleLE(o.i - 8);
    case XPC_TYPE.DATE: need(8); o.i += 8; return new Date(Number(buf.readBigInt64LE(o.i - 8) / 1000000n));
    case XPC_TYPE.DATA: { need(4); const n = buf.readUInt32LE(o.i); o.i += 4; need(n); const d = Buffer.from(buf.subarray(o.i, o.i + n)); o.i += n + pad4(n); return d; }
    case XPC_TYPE.STRING: { need(4); const n = buf.readUInt32LE(o.i); o.i += 4; need(n); const s = buf.subarray(o.i, o.i + n); o.i += n + pad4(n); const z = s.indexOf(0); return s.subarray(0, z < 0 ? s.length : z).toString('utf8'); }
    case XPC_TYPE.UUID: need(16); o.i += 16; return buf.subarray(o.i - 16, o.i).toString('hex');
    case XPC_TYPE.ARRAY: {
      need(4); const n = buf.readUInt32LE(o.i); o.i += 4; need(n);
      const p = buf.subarray(o.i, o.i + n); o.i += n;
      const q = { i: 4 }; const count = p.readUInt32LE(0); const a = [];
      for (let k = 0; k < count; k++) a.push(decodeValue(p, q));
      return a;
    }
    case XPC_TYPE.DICT: {
      need(4); const n = buf.readUInt32LE(o.i); o.i += 4; need(n);
      const p = buf.subarray(o.i, o.i + n); o.i += n;
      const q = { i: 4 }; const count = p.readUInt32LE(0); const d = {};
      for (let k = 0; k < count; k++) {
        const z = p.indexOf(0, q.i);
        if (z < 0) throw new Error('xpc: unterminated dictionary key');
        const key = p.subarray(q.i, z).toString('utf8');
        q.i = z + 1 + pad4(z - q.i + 1);
        d[key] = decodeValue(p, q);
      }
      return d;
    }
    default: throw new Error(`xpc: unsupported type 0x${t.toString(16)}`);
  }
}

/** Decodes one XPC wrapper at the front of buf: { flags, id, body, byteLength } (pure; throws when incomplete). */
export function xpcDecode(buf) {
  const p = xpcProbe(buf);
  if (p.status !== 'ok') throw new Error(p.reason ?? 'xpc: incomplete message');
  const flags = buf.readUInt32LE(4), id = toSafe(buf.readBigUInt64LE(16)), len = p.byteLength - XPC_HEADER;
  if (len === 0) return { flags, id, body: null, byteLength: p.byteLength };
  if (buf.readUInt32LE(XPC_HEADER) !== XPC_OBJECT_MAGIC) throw new Error('xpc: bad object magic');
  if (buf.readUInt32LE(XPC_HEADER + 4) !== XPC_BODY_VERSION) throw new Error(`xpc: unexpected body version ${buf.readUInt32LE(XPC_HEADER + 4)}`);
  const body = decodeValue(buf.subarray(XPC_HEADER + 8, p.byteLength), { i: 0 });
  if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) throw new Error('xpc: the body is not a dictionary');
  return { flags, id, body, byteLength: p.byteLength };
}

/** Reassembles XPC messages from one HTTP/2 stream's DATA payloads. */
export class XpcStream {
  constructor() { this.buf = Buffer.alloc(0); }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const out = [];
    for (;;) {
      const p = xpcProbe(this.buf);
      if (p.status === 'desynced') throw new Error(p.reason);
      if (p.status !== 'ok') return out;
      out.push(xpcDecode(this.buf.subarray(0, p.byteLength)));
      this.buf = this.buf.subarray(p.byteLength);
    }
  }
}

// ---------- HTTP/2 framing (only what RemoteXPC uses) ----------
export const H2_PREFACE = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n', 'ascii');
export const H2 = Object.freeze({ DATA: 0, HEADERS: 1, RST_STREAM: 3, SETTINGS: 4, PING: 6, GOAWAY: 7, WINDOW_UPDATE: 8 });
export const H2_FLAG = Object.freeze({ ACK: 0x1, END_HEADERS: 0x4, PADDED: 0x8 });
export const ROOT_STREAM = 1;
export const REPLY_STREAM = 3;
const RECV_WINDOW = 16 * 1024 * 1024;

export function h2Frame(type, flags, stream, payload = Buffer.alloc(0)) {
  const h = Buffer.alloc(9);
  h.writeUIntBE(payload.length, 0, 3);
  h[3] = type; h[4] = flags;
  h.writeUInt32BE(stream & 0x7fffffff, 5);
  return Buffer.concat([h, payload]);
}
export function h2Settings(settings) {
  const p = Buffer.alloc(6 * Object.keys(settings).length);
  Object.entries(settings).forEach(([k, v], i) => { p.writeUInt16BE(Number(k), i * 6); p.writeUInt32BE(v, i * 6 + 2); });
  return h2Frame(H2.SETTINGS, 0, 0, p);
}
export function h2WindowUpdate(stream, inc) { const p = Buffer.alloc(4); p.writeUInt32BE(inc & 0x7fffffff); return h2Frame(H2.WINDOW_UPDATE, 0, stream, p); }

/** Splits a byte stream into HTTP/2 frames; { preface: true } first expects (and drops) the client preface. */
export class H2Decoder {
  constructor({ preface = false } = {}) { this.buf = Buffer.alloc(0); this.preface = preface; }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    if (this.preface) {
      if (this.buf.length < H2_PREFACE.length) return [];
      if (!this.buf.subarray(0, H2_PREFACE.length).equals(H2_PREFACE)) throw new Error('http2: bad client preface');
      this.buf = this.buf.subarray(H2_PREFACE.length);
      this.preface = false;
    }
    const out = [];
    while (this.buf.length >= 9) {
      const len = this.buf.readUIntBE(0, 3);
      if (this.buf.length < 9 + len) break;
      const type = this.buf[3], flags = this.buf[4], stream = this.buf.readUInt32BE(5) & 0x7fffffff;
      let payload = this.buf.subarray(9, 9 + len);
      if ((type === H2.DATA || type === H2.HEADERS) && flags & H2_FLAG.PADDED) {
        const padLen = payload[0];
        if (padLen >= payload.length) throw new Error('http2: bad padding');
        payload = payload.subarray(1, payload.length - padLen);
      }
      out.push({ type, flags, stream, payload: Buffer.from(payload) });
      this.buf = this.buf.subarray(9 + len);
    }
    return out;
  }
}

/** The client's RemoteXPC handshake bytes after the preface (appium handshake.ts, same order and flags). */
export function rsdHandshake() {
  return Buffer.concat([
    H2_PREFACE,
    h2Settings({ 3: 100, 4: RECV_WINDOW }),
    h2WindowUpdate(0, RECV_WINDOW - 65535),
    h2Frame(H2.HEADERS, H2_FLAG.END_HEADERS, ROOT_STREAM),
    h2Frame(H2.DATA, 0, ROOT_STREAM, xpcEncode({ flags: XPC_FLAGS.ALWAYS_SET, id: 0, body: {} })),
    h2Frame(H2.HEADERS, H2_FLAG.END_HEADERS, REPLY_STREAM),
    h2Frame(H2.DATA, 0, ROOT_STREAM, xpcEncode({ flags: 0x0201, id: 0, body: null })),
    h2Frame(H2.DATA, 0, REPLY_STREAM, xpcEncode({ flags: XPC_FLAGS.ALWAYS_SET | XPC_FLAGS.INIT_HANDSHAKE, id: 0, body: null })),
    h2Frame(H2.SETTINGS, H2_FLAG.ACK, 0),
  ]);
}

/** { name: port } from an RSD handshake body, or null when it carries no Services (pure). */
export function servicesOf(body) {
  const s = body?.Services;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const out = {};
  for (const [name, info] of Object.entries(s)) { const p = Number(info?.Port); if (Number.isInteger(p) && p > 0 && p < 65536) out[name] = p; }
  return out;
}

// ---------- the tunnel ----------
export const NETSTAT = '/usr/sbin/netstat';
const nodeOr = (bin, args) => (/\.m?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args]);

/** "addr.port" (netstat's form) -> { host, port }, or null (pure). */
function splitAddr(a) {
  const i = a.lastIndexOf('.');
  if (i <= 0) return null;
  const port = Number(a.slice(i + 1));
  return Number.isInteger(port) && port > 0 && port < 65536 ? { host: a.slice(0, i), port } : null;
}

/**
 * remoted's ESTABLISHED tcp6 connections to the phone's tunnel address (ULA fc00::/7; ::1 too with { loopback }),
 * from `netstat -anv -p tcp` text (pure): [{ host, port }], one per distinct (host, port).
 */
export function parseNetstat(text, { loopback = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const line of String(text).split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f[0] !== 'tcp6' || f[5] !== 'ESTABLISHED' || !f.some((x) => /^remoted:\d+$/.test(x))) continue;
    const a = splitAddr(f[4] ?? '');
    if (!a) continue;
    const host = a.host.replace(/%.*$/, '');
    if (!(/^f[cd][0-9a-f]{0,2}:/i.test(host) || (loopback && host === '::1'))) continue;
    const k = `${host}|${a.port}`;
    if (!seen.has(k)) { seen.add(k); out.push({ host, port: a.port }); }
  }
  return out;
}

/**
 * Remote hosts of the user's own ESTABLISHED TCP sockets from `lsof -nP -i6TCP -sTCP:ESTABLISHED -F cn` (pure):
 * [{ host, cmds: [command names] }]. lsof prints full IPv6 addresses ("[addr]:port"); it sees only our own processes
 * (Xcode, CoreDeviceService, xcodebuild hold connections to the phone through the tunnel).
 */
export function parseLsof(text) {
  const out = new Map();
  let cmd = '';
  for (const l of String(text).split('\n')) {
    if (l[0] === 'c') cmd = l.slice(1);
    else if (l[0] === 'n' && l.includes('->')) {
      const m = /^\[([^\]]+)\]:\d+$/.exec(l.slice(1).split('->')[1]);
      if (!m) continue;
      const host = m[1].replace(/%.*$/, '');
      if (!out.has(host)) out.set(host, new Set());
      out.get(host).add(cmd);
    }
  }
  return [...out].map(([host, c]) => ({ host, cmds: [...c] }));
}

const run = (bin, args, env, timeoutMs) => {
  const [cmd, a] = nodeOr(bin, args);
  return new Promise((resolve) => execFile(cmd, a, { env, timeout: timeoutMs, maxBuffer: 64 << 20 }, (err, stdout) => resolve({ err, stdout: String(stdout ?? '') })));
};

/**
 * { host, ports: [rsd port candidates] } or { error } (never naming the address). netstat names remoted's connection
 * and its port but cuts long IPv6 addresses to its column width (OBSERVED on macOS 26: "fd..::" for "fd..::<n>"; -W
 * does not help for tcp6), so the full phone address comes from lsof: the one remote host of our own processes that
 * starts with netstat's (possibly cut) host.
 */
export async function findTunnel({ env = process.env, timeoutMs = 15000 } = {}) {
  const ns = await run(env.FW_NETSTAT || NETSTAT, ['-anv', '-p', 'tcp'], env, timeoutMs);
  if (ns.err) return { error: `netstat failed (${ns.err.code ?? 'error'}): cannot look for the CoreDevice tunnel` };
  const rows = parseNetstat(ns.stdout, { loopback: env.FW_THERMAL_LOOPBACK === '1' });
  const cut = [...new Set(rows.map((r) => r.host))];
  if (cut.length === 0) return { error: 'no CoreDevice tunnel: remoted has no connection to a phone (connect and unlock the iPhone; Xcode > Devices shows it connected)' };
  if (cut.length > 1) return { error: `${cut.length} CoreDevice tunnels (more than one device connected): disconnect the others` };
  const ls = await run(env.FW_LSOF || 'lsof', ['-nP', '-i6TCP', '-sTCP:ESTABLISHED', '-F', 'cn'], env, timeoutMs);
  // lsof exits 1 when one of its selections matched nothing; its output still counts
  if (ls.err && !ls.stdout) return { error: `lsof failed (${ls.err.code ?? 'error'}): cannot read the phone's tunnel address` };
  const full = parseLsof(ls.stdout).filter((h) => h.host.startsWith(cut[0]));
  if (full.length === 0) return { error: 'no process of yours (Xcode, CoreDeviceService) holds a connection to the phone through <tunnel>, so its full address is unknown: open Xcode > Devices and Simulators with the iPhone selected, then retry' };
  if (full.length > 1) return { error: `${full.length} addresses behind <tunnel> match remoted's connection: cannot tell which one is the phone's RSD` };
  return { host: full[0].host, ports: rows.map((r) => r.port) };
}

/** A TCP socket to [host]:port, or a rejection whose message names only `what` (never the address). */
export function connectTcp({ host, port, what, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const s = connect({ host, port, family: 6, noDelay: true });
    const t = setTimeout(() => { s.destroy(); reject(new Error(`${what}: no TCP connection within ${timeoutMs / 1000} s`)); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); s.removeAllListeners('error'); s.on('error', () => {}); resolve(s); });
    s.once('error', (e) => { clearTimeout(t); reject(new Error(`${what}: TCP connect failed (${e.code ?? 'error'})`)); });
  });
}

/**
 * RSD's service catalogue over one short connection: { services: { name: port } }. Rejects (address-free message)
 * when the phone refuses, closes or stays silent; the socket is always closed afterwards.
 */
export async function rsdServices({ host, port, timeoutMs = 10000 }) {
  const sock = await connectTcp({ host, port, what: 'RSD on <tunnel>', timeoutMs });
  return new Promise((resolve, reject) => {
    const dec = new H2Decoder();
    const streams = new Map();
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true; clearTimeout(t); sock.destroy();
      if (err) reject(err); else resolve(val);
    };
    const t = setTimeout(() => finish(new Error(`RSD on <tunnel> sent no service list within ${timeoutMs / 1000} s`)), timeoutMs);
    sock.on('data', (chunk) => {
      let frames;
      try { frames = dec.push(chunk); } catch (e) { finish(new Error(`RSD on <tunnel>: ${e.message}`)); return; }
      for (const f of frames) {
        if (f.type === H2.SETTINGS && !(f.flags & H2_FLAG.ACK)) sock.write(h2Frame(H2.SETTINGS, H2_FLAG.ACK, 0));
        else if (f.type === H2.PING && !(f.flags & H2_FLAG.ACK)) sock.write(h2Frame(H2.PING, H2_FLAG.ACK, 0, f.payload));
        else if (f.type === H2.GOAWAY) { finish(new Error(`RSD on <tunnel> refused the connection (HTTP/2 GOAWAY, error code ${f.payload.length >= 8 ? f.payload.readUInt32BE(4) : '?'})`)); return; }
        else if (f.type === H2.RST_STREAM) { finish(new Error(`RSD on <tunnel> reset stream ${f.stream} (error code ${f.payload.length >= 4 ? f.payload.readUInt32BE(0) : '?'})`)); return; }
        else if (f.type === H2.DATA && f.payload.length) {
          if (!streams.has(f.stream)) streams.set(f.stream, new XpcStream());
          let msgs;
          try { msgs = streams.get(f.stream).push(f.payload); } catch (e) { finish(new Error(`RSD on <tunnel>: ${e.message}`)); return; }
          for (const m of msgs) { const s = servicesOf(m.body); if (s) { finish(null, { services: s }); return; } }
        }
      }
    });
    sock.on('close', () => finish(new Error('RSD on <tunnel> closed the connection before it listed its services')));
    sock.on('error', () => {});
    sock.write(rsdHandshake());
  });
}

/**
 * A TCP socket to one RSD service on the phone: { socket, services: count }. Tries remoted's connection ports in turn
 * (normally exactly one) until one answers as RSD.
 */
export async function connectService({ service, env = process.env, timeoutMs = 10000 }) {
  const tun = await findTunnel({ env });
  if (tun.error) throw new Error(tun.error);
  let services = null, last = null;
  for (const port of tun.ports) {
    try { ({ services } = await rsdServices({ host: tun.host, port, timeoutMs })); break; } catch (e) { last = e; }
  }
  if (!services) throw last;
  if (!services[service]) throw new Error(`the phone's RSD lists ${Object.keys(services).length} services but not ${service}`);
  const socket = await connectTcp({ host: tun.host, port: services[service], what: `${service} on <tunnel>`, timeoutMs });
  return { socket, services: Object.keys(services).length };
}

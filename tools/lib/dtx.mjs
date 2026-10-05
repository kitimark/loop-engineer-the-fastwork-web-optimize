// DTX, the Instruments wire protocol of DTServiceHub (com.apple.instruments.dtservicehub), client side, for the
// ConditionInducer calls of tools/thermal.mjs (incident I-199). Ported from appium-ios
// packages/remotexpc/src/services/ios/dvt/{dtx-message.ts, channel-fragmenter.ts, index.ts} (Apache-2.0, commit
// bd9ba5fd86b87035b15023ae46d3bcec928266b5); the ack of device messages that expect a reply follows go-ios
// ios/dtx_codec (MIT, commit 273d3e06e803fb6ee95e4df914d8be82c5ee4bb0). See tools/NOTICE.
//
// A message: 32-byte header (magic 0x1F3D5B79, header size 32, fragment id/count u16, length u32, identifier u32,
// conversation index u32, channel i32, expects-reply u32; little endian), then (in the last or only fragment) a 16-byte
// payload header (flags u32 = message type | 0x1000 when a reply is expected, aux length u32, total length u64), the
// aux block (16-byte header: buffer size u64, 0x1F0 from us, + length u64, then per item u32 0x0A, u32 type, value: 2 object = u32 length + archived
// bplist, 3 int32, 6 int64) and the payload (the NSKeyedArchiver bplist of the selector, or of a reply's return value).
// Replies carry the request's identifier with conversation index >= 1. Types: 0 ack, 2 method call, 3 reply with a
// return value, 4 error (payload NSError).
//
// SPDX-License-Identifier: Apache-2.0 (port); Copyright the appium-ios and go-ios contributors and this repo's authors.
import { EventEmitter } from 'node:events';
import { parseBplist } from './bplist.mjs';
import { archiveBuffer, unarchive, isNSError, errorText } from './nskeyed.mjs';

export const MAGIC = 0x1f3d5b79;
export const HEADER = 32;
export const PAYLOAD_HEADER = 16;
export const AUX_MAGIC = 0x1f0;
export const TYPE = Object.freeze({ ACK: 0, CALL: 2, REPLY: 3, ERROR: 4 });
export const AUX = Object.freeze({ OBJECT: 2, INT32: 3, INT64: 6 });
const EXPECTS_REPLY = 0x1000;

/** Aux items: [{ type: AUX.OBJECT, value }, { type: AUX.INT32, value }, ...]. */
export function encodeAux(items = []) {
  if (!items.length) return Buffer.alloc(0);
  const parts = [];
  for (const { type, value } of items) {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(0x0a, 0);
    head.writeUInt32LE(type, 4);
    parts.push(head);
    if (type === AUX.INT32) { const b = Buffer.alloc(4); b.writeInt32LE(value, 0); parts.push(b); }
    else if (type === AUX.INT64) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value), 0); parts.push(b); }
    else if (type === AUX.OBJECT) { const p = archiveBuffer(value); const l = Buffer.alloc(4); l.writeUInt32LE(p.length, 0); parts.push(l, p); }
    else throw new Error(`DTX: unsupported aux type ${type}`);
  }
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(16);
  h.writeBigUInt64LE(BigInt(AUX_MAGIC), 0);
  h.writeBigUInt64LE(BigInt(body.length), 8);
  return Buffer.concat([h, body]);
}

/**
 * The aux block -> [{ type, value }] (objects unarchived). The header's first field is not checked: we send 0x1F0, but
 * the phone's own messages carry other values there (OBSERVED on iOS 26.6.1, 2026-10-05; go-ios names the field
 * BufferSize, a capacity, not a magic), so only the length at offset 8 frames the block.
 */
export function decodeAux(buf) {
  if (!buf || buf.length < 16) return [];
  const end = 16 + Number(buf.readBigUInt64LE(8));
  if (end > buf.length) throw new Error(`DTX: aux length out of range (aux header ${buf.subarray(0, 16).toString('hex')}, block ${buf.length} bytes)`);
  const out = [];
  let o = 16;
  while (o < end) {
    let marker = buf.readUInt32LE(o);
    if (marker === 0x0a) { o += 4; marker = buf.readUInt32LE(o); }
    const type = marker;
    o += 4;
    if (type === AUX.INT32) { out.push({ type, value: buf.readInt32LE(o) }); o += 4; }
    else if (type === AUX.INT64) { out.push({ type, value: buf.readBigInt64LE(o) }); o += 8; }
    else if (type === AUX.OBJECT) {
      const n = buf.readUInt32LE(o);
      out.push({ type, value: unarchive(parseBplist(buf.subarray(o + 4, o + 4 + n))) });
      o += 4 + n;
    } else throw new Error(`DTX: unknown aux type ${type} at offset ${o - 4} (aux header ${buf.subarray(0, 16).toString('hex')})`);
  }
  return out;
}

/** One complete (unfragmented) message. selector/value: archived into the payload; payload: raw bytes instead. */
export function encodeMessage({ identifier, conversationIndex = 0, channel = 0, expectsReply = false, type = TYPE.CALL, aux = [], selector, value, payload }) {
  const a = encodeAux(aux);
  const p = payload ?? (selector !== undefined ? archiveBuffer(selector) : value !== undefined ? archiveBuffer(value) : Buffer.alloc(0));
  const ph = Buffer.alloc(PAYLOAD_HEADER);
  ph.writeUInt32LE((type | (expectsReply ? EXPECTS_REPLY : 0)) >>> 0, 0);
  ph.writeUInt32LE(a.length, 4);
  ph.writeBigUInt64LE(BigInt(a.length + p.length), 8);
  const h = Buffer.alloc(HEADER);
  h.writeUInt32LE(MAGIC, 0);
  h.writeUInt32LE(HEADER, 4);
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(1, 10);
  h.writeUInt32LE(PAYLOAD_HEADER + a.length + p.length, 12);
  h.writeUInt32LE(identifier >>> 0, 16);
  h.writeUInt32LE(conversationIndex >>> 0, 20);
  h.writeInt32LE(channel, 24);
  h.writeUInt32LE(expectsReply ? 1 : 0, 28);
  return Buffer.concat([h, ph, a, p]);
}

export function parseHeader(b) {
  return {
    magic: b.readUInt32LE(0), cb: b.readUInt32LE(4), fragmentId: b.readUInt16LE(8), fragmentCount: b.readUInt16LE(10),
    length: b.readUInt32LE(12), identifier: b.readUInt32LE(16), conversationIndex: b.readUInt32LE(20),
    channel: b.readInt32LE(24), expectsReply: b.readUInt32LE(28) !== 0,
  };
}

/** A message body (payload header + aux + payload) -> { type, expectsReply, aux, value } (value unarchived, or raw). */
export function decodeBody(body) {
  if (body.length < PAYLOAD_HEADER) return { type: TYPE.ACK, aux: [], value: undefined };
  const flags = body.readUInt32LE(0);
  if ((flags & 0xff000) >> 12 > 1) throw new Error(`DTX: compressed message (flags 0x${flags.toString(16)}) not supported`);
  const auxLen = body.readUInt32LE(4);
  const total = Number(body.readBigUInt64LE(8));
  const aux = auxLen ? decodeAux(body.subarray(PAYLOAD_HEADER, PAYLOAD_HEADER + auxLen)) : [];
  const raw = body.subarray(PAYLOAD_HEADER + auxLen, PAYLOAD_HEADER + total);
  let value;
  if (raw.length) { try { value = unarchive(parseBplist(raw)); } catch { value = Buffer.from(raw); } }
  return { type: flags & 0xff, expectsReplyFlag: (flags & EXPECTS_REPLY) !== 0, aux, value };
}

/** Stream decoder: push(chunk) -> complete messages [{ header, type, aux, value }] (fragments reassembled). */
export class DtxDecoder {
  constructor() { this.buf = Buffer.alloc(0); this.frags = new Map(); }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    for (;;) {
      if (this.buf.length < HEADER) break;
      const h = parseHeader(this.buf);
      if (h.magic !== MAGIC) throw new Error(`DTX: bad magic 0x${h.magic.toString(16)} (stream out of sync)`);
      const key = `${h.channel}:${h.identifier}:${h.conversationIndex}`;
      if (h.fragmentCount > 1 && h.fragmentId === 0) { // the first fragment of a split message is a header only
        this.frags.set(key, []);
        this.buf = this.buf.subarray(HEADER);
        continue;
      }
      if (this.buf.length < HEADER + h.length) break;
      const data = Buffer.from(this.buf.subarray(HEADER, HEADER + h.length));
      this.buf = this.buf.subarray(HEADER + h.length);
      let body = data;
      if (h.fragmentCount > 1) {
        const parts = this.frags.get(key) || [];
        parts.push(data);
        if (h.fragmentId < h.fragmentCount - 1) { this.frags.set(key, parts); continue; }
        this.frags.delete(key);
        body = Buffer.concat(parts);
      }
      out.push({ header: h, ...decodeBody(body) });
    }
    return out;
  }
}

/**
 * A DTX connection over a duplex stream (a socket to DTServiceHub). Events: 'message' (device-initiated), 'close'.
 * handshake() -> the device's capabilities; channel(identifier) -> code; call(code, selector, aux) -> { type, value, aux }.
 */
export class DtxConnection extends EventEmitter {
  constructor(sock, { log = () => {} } = {}) {
    super();
    this.sock = sock;
    this.log = log;
    this.next = 0;
    this.lastChannel = 0;
    this.pending = new Map();
    this.closed = null;
    this.capabilities = null;
    this.dec = new DtxDecoder();
    sock.on('data', (c) => {
      let msgs;
      try { msgs = this.dec.push(c); } catch (e) { this._fail(e); return; }
      for (const m of msgs) this._dispatch(m);
    });
    sock.on('error', (e) => this._fail(e));
    sock.on('close', () => this._fail(new Error('connection closed')));
    sock.on('end', () => this._fail(new Error('connection closed by the device')));
  }

  _fail(e) {
    if (this.closed) return;
    this.closed = e;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(e); }
    this.pending.clear();
    this.emit('close', e);
  }

  _send(buf) {
    if (this.closed) throw this.closed;
    this.sock.write(buf);
  }

  _dispatch(m) {
    const h = m.header;
    if (h.conversationIndex > 0) {
      const key = `${Math.abs(h.channel)}:${h.identifier}`;
      const p = this.pending.get(key);
      if (p) { this.pending.delete(key); clearTimeout(p.timer); p.resolve(m); }
      return;
    }
    if (h.identifier > this.next) this.next = h.identifier;
    if (h.expectsReply) {
      try { this._send(encodeMessage({ identifier: h.identifier, conversationIndex: 1, channel: h.channel, type: TYPE.ACK })); } catch {}
    }
    this.emit('message', m);
  }

  /** Send a call; resolves with the reply message { header, type, aux, value }. */
  request(channel, selector, aux = [], { timeoutMs = 30000, expectsReply = true } = {}) {
    const identifier = ++this.next;
    const buf = encodeMessage({ identifier, channel, expectsReply, type: TYPE.CALL, aux, selector });
    if (!expectsReply) { this._send(buf); return Promise.resolve(null); }
    return new Promise((resolve, reject) => {
      const key = `${Math.abs(channel)}:${identifier}`;
      const timer = setTimeout(() => { this.pending.delete(key); reject(new Error(`DTX: no reply to ${selector} within ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
      this.pending.set(key, { resolve, reject, timer });
      try { this._send(buf); } catch (e) { this.pending.delete(key); clearTimeout(timer); reject(e); }
    });
  }

  /** request(), then: an error reply throws (its NSError text); returns the reply's value. */
  async call(channel, selector, aux = [], opts = {}) {
    const r = await this.request(channel, selector, aux, opts);
    if (r.type === TYPE.ERROR) throw Object.assign(new Error(`${selector}: ${errorText(r.value)}`), { nserror: r.value });
    return r.value;
  }

  /** The capabilities exchange; resolves with the device's capabilities (a dict). */
  handshake({ timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { clearTimeout(timer); this.off('message', onMsg); this.off('close', onClose); fn(v); };
      const onMsg = (m) => {
        if (m.header.channel === 0 && m.value === '_notifyOfPublishedCapabilities:') {
          this.capabilities = m.aux[0]?.value ?? {};
          done(resolve, this.capabilities);
        }
      };
      const onClose = (e) => done(reject, e);
      const timer = setTimeout(() => done(reject, new Error(`DTX: no capabilities from the device within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      this.on('message', onMsg);
      this.on('close', onClose);
      try {
        this.request(0, '_notifyOfPublishedCapabilities:', [{ type: AUX.OBJECT, value: { 'com.apple.private.DTXBlockCompression': 0, 'com.apple.private.DTXConnection': 1 } }], { expectsReply: false });
      } catch (e) { done(reject, e); }
    });
  }

  /** Open a channel to a service identifier; returns its code. */
  async channel(identifier, { timeoutMs = 15000 } = {}) {
    const code = ++this.lastChannel;
    const r = await this.request(0, '_requestChannelWithCode:identifier:', [{ type: AUX.INT32, value: code }, { type: AUX.OBJECT, value: identifier }], { timeoutMs });
    if (r.type === TYPE.ERROR || isNSError(r.value)) throw new Error(`DTX: channel ${identifier} refused: ${errorText(r.value)}`);
    return code;
  }

  close() {
    try { this.sock.end(); } catch {}
    try { this.sock.destroy(); } catch {}
  }
}

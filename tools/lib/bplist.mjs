// Binary property list (bplist00) reader and writer, the subset DTX messages use (incident I-199, tools/thermal.mjs).
// Format: Apple's CFBinaryPList (header "bplist00", objects, offset table, 32-byte trailer). Written for this repo after
// appium-ios packages/remotexpc/src/lib/plist/binary-plist-parser.ts and binary-plist-creator.ts (Apache-2.0, commit
// bd9ba5fd86b87035b15023ae46d3bcec928266b5; see tools/NOTICE).
//
// Values: null, boolean, number (integer -> int, else real), bigint (int), string (ASCII or UTF-16BE), Buffer (data),
// Date, Uid (NSKeyedArchiver references), arrays, plain objects (dict, string keys). Ints wider than 2^53 read as bigint.
//
// SPDX-License-Identifier: Apache-2.0 (port); Copyright the appium-ios contributors and this repo's authors.

const MAGIC = 'bplist00';
const EPOCH_2001_MS = Date.UTC(2001, 0, 1);

/** An NSKeyedArchiver object reference (bplist marker 0x8). */
export class Uid {
  constructor(n) { this.uid = n; }
}

// ---- reader -------------------------------------------------------------------------------------------------------

function readUIntBE(buf, off, size) {
  let v = 0n;
  for (let i = 0; i < size; i++) v = (v << 8n) | BigInt(buf[off + i]);
  return v;
}
const toNum = (v) => (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v);

/** Parse a bplist00 buffer into JS values. Throws on anything malformed. */
export function parseBplist(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 40 || buf.toString('latin1', 0, 8) !== MAGIC) throw new Error('not a bplist00 buffer');
  const t = buf.length - 32;
  const offSize = buf[t + 6], refSize = buf[t + 7];
  const numObjects = Number(readUIntBE(buf, t + 8, 8));
  const top = Number(readUIntBE(buf, t + 16, 8));
  const tableOff = Number(readUIntBE(buf, t + 24, 8));
  if (!offSize || !refSize || tableOff + numObjects * offSize > t || top >= numObjects) throw new Error('bplist trailer out of range');
  const offsets = [];
  for (let i = 0; i < numObjects; i++) offsets.push(Number(readUIntBE(buf, tableOff + i * offSize, offSize)));
  const memo = new Map();
  const depth = { n: 0 };

  const lengthAt = (off, low) => {
    if (low !== 0xf) return [low, off + 1];
    const m = buf[off + 1];
    if (m >> 4 !== 0x1) throw new Error('bplist: bad length marker');
    const size = 1 << (m & 0xf);
    return [Number(readUIntBE(buf, off + 2, size)), off + 2 + size];
  };

  function obj(ref) {
    if (ref >= numObjects) throw new Error(`bplist: object ref ${ref} out of range`);
    if (memo.has(ref)) return memo.get(ref);
    if (++depth.n > 512) throw new Error('bplist: nesting too deep');
    const off = offsets[ref];
    const m = buf[off], hi = m >> 4, low = m & 0xf;
    let v;
    switch (hi) {
      case 0x0:
        if (m === 0x00) v = null; else if (m === 0x08) v = false; else if (m === 0x09) v = true;
        else throw new Error(`bplist: unknown marker 0x${m.toString(16)}`);
        break;
      case 0x1: {
        const size = 1 << low;
        if (size === 8) v = toNum(buf.readBigInt64BE(off + 1));
        else if (size === 16) v = toNum(readUIntBE(buf, off + 9, 8));
        else v = Number(readUIntBE(buf, off + 1, size));
        break;
      }
      case 0x2: v = low === 2 ? buf.readFloatBE(off + 1) : buf.readDoubleBE(off + 1); break;
      case 0x3: v = new Date(EPOCH_2001_MS + buf.readDoubleBE(off + 1) * 1000); break;
      case 0x4: { const [n, at] = lengthAt(off, low); v = Buffer.from(buf.subarray(at, at + n)); break; }
      case 0x5: { const [n, at] = lengthAt(off, low); v = buf.toString('latin1', at, at + n); break; }
      case 0x6: {
        const [n, at] = lengthAt(off, low);
        const s = Buffer.from(buf.subarray(at, at + n * 2));
        s.swap16();
        v = s.toString('utf16le');
        break;
      }
      case 0x8: v = new Uid(Number(readUIntBE(buf, off + 1, low + 1))); break;
      case 0xa: case 0xc: {
        const [n, at] = lengthAt(off, low);
        v = [];
        memo.set(ref, v);
        for (let i = 0; i < n; i++) v.push(obj(Number(readUIntBE(buf, at + i * refSize, refSize))));
        break;
      }
      case 0xd: {
        const [n, at] = lengthAt(off, low);
        v = {};
        memo.set(ref, v);
        for (let i = 0; i < n; i++) {
          const k = obj(Number(readUIntBE(buf, at + i * refSize, refSize)));
          v[String(k)] = obj(Number(readUIntBE(buf, at + (n + i) * refSize, refSize)));
        }
        break;
      }
      default: throw new Error(`bplist: unknown marker 0x${m.toString(16)}`);
    }
    depth.n--;
    memo.set(ref, v);
    return v;
  }
  return obj(top);
}

// ---- writer -------------------------------------------------------------------------------------------------------

const sizeFor = (n) => (n < 0x100 ? 1 : n < 0x10000 ? 2 : n < 0x100000000 ? 4 : 8);
function uintBE(n, size) {
  const b = Buffer.alloc(size);
  let v = BigInt(n);
  for (let i = size - 1; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
function intObj(v) {
  const n = BigInt(v);
  if (n >= 0n && n < 0x100n) return Buffer.from([0x10, Number(n)]);
  if (n >= 0n && n < 0x10000n) return Buffer.concat([Buffer.from([0x11]), uintBE(n, 2)]);
  if (n >= 0n && n < 0x100000000n) return Buffer.concat([Buffer.from([0x12]), uintBE(n, 4)]);
  const b = Buffer.alloc(9); b[0] = 0x13; b.writeBigInt64BE(BigInt.asIntN(64, n), 1); return b;
}
function lenHead(hi, n) {
  if (n < 0xf) return Buffer.from([(hi << 4) | n]);
  return Buffer.concat([Buffer.from([(hi << 4) | 0xf]), intObj(n)]);
}

/** Serialize a JS value (see the header for the types) to a bplist00 buffer. */
export function buildBplist(root) {
  const objs = []; // [{ kind, value, refs }]
  const seen = new Map(); // object identity -> index (cycles are refused)
  function add(v) {
    if (v !== null && typeof v === 'object' && !(v instanceof Uid) && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      if (seen.has(v)) throw new Error('bplist: cyclic or shared container');
      const idx = objs.length;
      seen.set(v, idx);
      if (Array.isArray(v)) {
        objs.push({ kind: 'array', refs: null });
        objs[idx].refs = v.map(add);
      } else {
        const keys = Object.keys(v);
        objs.push({ kind: 'dict', refs: null });
        const k = keys.map((key) => add(key));
        const vals = keys.map((key) => add(v[key]));
        objs[idx].refs = [...k, ...vals];
        objs[idx].n = keys.length;
      }
      return idx;
    }
    if (v === undefined) throw new Error('bplist: undefined value');
    objs.push({ kind: 'scalar', value: v });
    return objs.length - 1;
  }
  add(root);
  const refSize = sizeFor(objs.length);
  const ref = (i) => uintBE(i, refSize);
  const parts = [Buffer.from(MAGIC, 'latin1')];
  let at = 8;
  const offsets = [];
  for (const o of objs) {
    let b;
    if (o.kind === 'array') b = Buffer.concat([lenHead(0xa, o.refs.length), ...o.refs.map(ref)]);
    else if (o.kind === 'dict') b = Buffer.concat([lenHead(0xd, o.n), ...o.refs.map(ref)]);
    else {
      const v = o.value;
      if (v === null) b = Buffer.from([0x00]);
      else if (v === false) b = Buffer.from([0x08]);
      else if (v === true) b = Buffer.from([0x09]);
      else if (typeof v === 'bigint') b = intObj(v);
      else if (typeof v === 'number') {
        if (Number.isInteger(v)) b = intObj(v);
        else { b = Buffer.alloc(9); b[0] = 0x23; b.writeDoubleBE(v, 1); }
      } else if (typeof v === 'string') {
        if (/^[\x00-\x7f]*$/.test(v)) b = Buffer.concat([lenHead(0x5, v.length), Buffer.from(v, 'latin1')]);
        else { const u = Buffer.from(v, 'utf16le'); u.swap16(); b = Buffer.concat([lenHead(0x6, v.length), u]); }
      } else if (Buffer.isBuffer(v)) b = Buffer.concat([lenHead(0x4, v.length), v]);
      else if (v instanceof Date) { b = Buffer.alloc(9); b[0] = 0x33; b.writeDoubleBE((v.getTime() - EPOCH_2001_MS) / 1000, 1); }
      else if (v instanceof Uid) { const s = sizeFor(v.uid); b = Buffer.concat([Buffer.from([0x80 | (s - 1)]), uintBE(v.uid, s)]); }
      else throw new Error(`bplist: unsupported value type ${typeof v}`);
    }
    offsets.push(at);
    parts.push(b);
    at += b.length;
  }
  const offSize = sizeFor(at);
  const table = Buffer.concat(offsets.map((o) => uintBE(o, offSize)));
  const trailer = Buffer.alloc(32);
  trailer[6] = offSize;
  trailer[7] = refSize;
  trailer.writeBigUInt64BE(BigInt(objs.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(at), 24);
  return Buffer.concat([...parts, table, trailer]);
}

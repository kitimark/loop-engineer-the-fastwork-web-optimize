// I-199: the wire formats behind tools/thermal.mjs (bplist, NSKeyedArchiver, DTX, RemoteXPC over HTTP/2) and the pure
// parts of tunnel discovery and ConditionInducer profile choice. No phone, tunnel or network: in-memory buffers and a
// duplex pair; the CLI end to end is tests/e2e/thermal-cli.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Duplex } from 'node:stream';
import { FIXTURES, tempDir } from '../helpers.mjs';

const B = await import('../../tools/lib/bplist.mjs');
const N = await import('../../tools/lib/nskeyed.mjs');
const D = await import('../../tools/lib/dtx.mjs');
const R = await import('../../tools/lib/rsd.mjs');
const C = await import('../../tools/lib/condition-inducer.mjs');
const GOLDEN = JSON.parse(readFileSync(join(FIXTURES, 'nskeyed-golden.json'), 'utf8'));

// ---------- bplist ----------
test('I-199 bplist: round trip of every type DTX uses (ints of each width, negative, real, strings, data, dates, uid, nesting)', () => {
  const v = { a: 0, b: 255, c: 65535, d: 2 ** 32, e: -1, f: 1.5, g: 'ascii', h: 'ไทย ü', i: Buffer.from([1, 2, 3]), j: true, k: false, l: null, m: [1, [2, { n: 'x' }]], o: new Date('2026-10-05T00:00:00Z'), p: new B.Uid(7) };
  const back = B.parseBplist(B.buildBplist(v));
  assert.deepEqual({ ...back, i: [...back.i], o: back.o.toISOString(), p: back.p.uid }, { ...v, i: [1, 2, 3], o: v.o.toISOString(), p: 7 });
  assert.equal(B.buildBplist('x').subarray(0, 8).toString(), 'bplist00');
});

test('I-199 bplist: refuses a shared or cyclic container and a non-bplist buffer', () => {
  const shared = [1];
  assert.throws(() => B.buildBplist({ a: shared, b: shared }));
  const cyc = {}; cyc.self = cyc;
  assert.throws(() => B.buildBplist(cyc));
  assert.throws(() => B.parseBplist(Buffer.from('not a plist at all, really not')));
});

test('I-199 bplist: Apple plutil reads ours and we read plutil\'s (skipped without /usr/bin/plutil)', { skip: !existsSync('/usr/bin/plutil') }, () => {
  const d = tempDir('fw-bplist-');
  const ours = join(d, 'ours.plist');
  writeFileSync(ours, B.buildBplist({ name: 'ThermalCondition', n: 42, neg: -7, ok: true, list: ['a', 1.25] }));
  const r = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', ours], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { name: 'ThermalCondition', n: 42, neg: -7, ok: true, list: ['a', 1.25] });
  const theirs = join(d, 'theirs.plist');
  writeFileSync(theirs, JSON.stringify({ x: 'y', big: 4294967296, arr: [true, 'z'] }));
  assert.equal(spawnSync('/usr/bin/plutil', ['-convert', 'binary1', theirs]).status, 0);
  assert.deepEqual(B.parseBplist(readFileSync(theirs)), { x: 'y', big: 4294967296, arr: [true, 'z'] });
});

// ---------- NSKeyedArchiver ----------
test('I-199 nskeyed: archives written by Apple Foundation decode (selector, capabilities, groups, NSError, YES)', () => {
  const u = (k) => N.unarchiveBuffer(Buffer.from(GOLDEN[k], 'base64'));
  assert.equal(u('selector'), 'availableConditionInducers');
  assert.deepEqual(u('caps'), { 'com.apple.private.DTXBlockCompression': 0, 'com.apple.private.DTXConnection': 1 });
  assert.deepEqual(u('groups'), [{ isActive: true, activeProfile: 'SeriousThermalState', identifier: 'ThermalCondition', profiles: [{ name: 'Serious', identifier: 'SeriousThermalState' }] }]);
  const e = u('error');
  assert.ok(N.isNSError(e));
  assert.equal(e.domain, 'com.apple.dt.ConditionInducer');
  assert.equal(e.code, 3);
  assert.match(N.errorText(e), /No active condition/);
  assert.equal(u('yes'), true);
});

test('I-199 nskeyed: our archives round trip and are NSKeyedArchiver-shaped', () => {
  const v = { 'com.apple.private.DTXBlockCompression': 0, list: ['ThermalCondition', 'ThermalSerious', 5, true], s: '_requestChannelWithCode:identifier:' };
  const arc = N.archive(v);
  assert.ok(N.isArchive(arc));
  assert.equal(arc.$version, 100000);
  assert.deepEqual(N.unarchiveBuffer(N.archiveBuffer(v)), v);
  assert.equal(N.unarchiveBuffer(N.archiveBuffer('availableConditionInducers')), 'availableConditionInducers');
});

// ---------- DTX ----------
test('I-199 dtx: a call with object, int32 and int64 aux items encodes and decodes', () => {
  const buf = D.encodeMessage({ identifier: 5, channel: 2, expectsReply: true, selector: 'enableConditionWithIdentifier:profileIdentifier:', aux: [{ type: D.AUX.OBJECT, value: 'ThermalCondition' }, { type: D.AUX.INT32, value: -3 }, { type: D.AUX.INT64, value: 2n ** 40n }] });
  const h = D.parseHeader(buf);
  assert.equal(h.magic, D.MAGIC);
  assert.equal(h.identifier, 5);
  assert.equal(h.channel, 2);
  assert.equal(h.expectsReply, true);
  assert.equal(h.length, buf.length - D.HEADER);
  const [m] = new D.DtxDecoder().push(buf);
  assert.equal(m.type, D.TYPE.CALL);
  assert.equal(m.value, 'enableConditionWithIdentifier:profileIdentifier:');
  assert.deepEqual(m.aux.map((a) => a.value), ['ThermalCondition', -3, 2n ** 40n]);
});

test('I-199 dtx: the decoder takes byte-sized chunks, several messages per chunk, and fragments (header-only first fragment)', () => {
  const a = D.encodeMessage({ identifier: 1, selector: 'one' });
  const b = D.encodeMessage({ identifier: 2, type: D.TYPE.REPLY, conversationIndex: 1, value: [1, 2, 3] });
  const dec = new D.DtxDecoder();
  const got = [];
  for (const byte of Buffer.concat([a, b])) got.push(...dec.push(Buffer.from([byte])));
  assert.deepEqual(got.map((m) => m.value), ['one', [1, 2, 3]]);
  // the same message split in 3 fragments: fragment 0 is the header alone, 1 and 2 carry the body
  const whole = D.encodeMessage({ identifier: 9, channel: 1, selector: 'x'.repeat(300) });
  const body = whole.subarray(D.HEADER);
  const frag = (id, count, data) => { const h = Buffer.from(whole.subarray(0, D.HEADER)); h.writeUInt16LE(id, 8); h.writeUInt16LE(count, 10); h.writeUInt32LE(id === 0 ? body.length : data.length, 12); return Buffer.concat([h, data]); };
  const parts = Buffer.concat([frag(0, 3, Buffer.alloc(0)), frag(1, 3, body.subarray(0, 100)), frag(2, 3, body.subarray(100))]);
  const [m] = new D.DtxDecoder().push(parts);
  assert.equal(m.value, 'x'.repeat(300));
});

test('I-199 dtx: the aux header\'s first field is a buffer size, not a magic (the phone sends other values); a bad length throws', () => {
  const aux = D.encodeAux([{ type: D.AUX.INT32, value: 7 }]);
  assert.equal(aux.readBigUInt64LE(0), BigInt(D.AUX_MAGIC));
  const phone = Buffer.from(aux); phone.writeUInt32LE(0x1df0, 0);
  assert.deepEqual(D.decodeAux(phone).map((a) => a.value), [7]);
  const bad = Buffer.from(aux); bad.writeBigUInt64LE(9999n, 8);
  assert.throws(() => D.decodeAux(bad), /aux length out of range/);
  const msg = D.encodeMessage({ identifier: 1, selector: 's', aux: [{ type: D.AUX.OBJECT, value: { k: 1 } }] });
  msg.writeUInt32LE(0x1df0, D.HEADER + D.PAYLOAD_HEADER);
  assert.deepEqual(new D.DtxDecoder().push(msg)[0].aux[0].value, { k: 1 });
});

test('I-199 dtx: a stream out of sync (bad magic) throws', () => {
  assert.throws(() => new D.DtxDecoder().push(Buffer.alloc(40, 1)), /bad magic/);
});

/** A connected pair of in-memory duplexes. */
function pair() {
  let a, b;
  a = new Duplex({ read() {}, write(c, _e, cb) { b.push(c); cb(); }, final(cb) { b.push(null); cb(); } });
  b = new Duplex({ read() {}, write(c, _e, cb) { a.push(c); cb(); }, final(cb) { a.push(null); cb(); } });
  return [a, b];
}

/** A minimal DTServiceHub on one end of a pair: answers the handshake, channel requests and two selectors. */
function hub(sock, { errorOn } = {}) {
  const dec = new D.DtxDecoder();
  const seen = [];
  sock.on('data', (c) => {
    for (const m of dec.push(c)) {
      const h = m.header;
      seen.push({ selector: m.value, channel: h.channel, expectsReply: h.expectsReply, type: m.type, conversationIndex: h.conversationIndex });
      const reply = (type, value) => sock.write(D.encodeMessage({ identifier: h.identifier, conversationIndex: 1, channel: h.channel, type, value }));
      if (m.value === '_notifyOfPublishedCapabilities:') sock.write(D.encodeMessage({ identifier: 1, selector: '_notifyOfPublishedCapabilities:', aux: [{ type: D.AUX.OBJECT, value: { [C.SERVICE]: 1 } }] }));
      else if (m.value === '_requestChannelWithCode:identifier:') reply(D.TYPE.ACK);
      else if (m.value === errorOn) reply(D.TYPE.ERROR, { NSDomain: 'd', NSCode: 1, NSUserInfo: { NSLocalizedDescription: 'nope' } });
      else if (m.value === 'ask') sock.write(D.encodeMessage({ identifier: 50, channel: h.channel, expectsReply: true, selector: 'deviceAsks' }));
      else if (h.expectsReply) reply(D.TYPE.REPLY, `echo ${m.value}`);
    }
  });
  return seen;
}

test('I-199 dtx: DtxConnection handshake, channel and call round trip; replies match by identifier', async () => {
  const [mine, theirs] = pair();
  const seen = hub(theirs);
  const conn = new D.DtxConnection(mine);
  const caps = await conn.handshake({ timeoutMs: 2000 });
  assert.deepEqual(caps, { [C.SERVICE]: 1 });
  assert.equal(seen[0].selector, '_notifyOfPublishedCapabilities:');
  assert.equal(seen[0].expectsReply, false);
  const code = await conn.channel(C.SERVICE);
  assert.equal(code, 1);
  const [r1, r2] = await Promise.all([conn.call(code, 'first'), conn.call(code, 'second')]);
  assert.deepEqual([r1, r2], ['echo first', 'echo second']);
  conn.close();
});

test('I-199 dtx: an error reply throws with the NSError; a device message that expects a reply gets an ack', async () => {
  const [mine, theirs] = pair();
  const seen = hub(theirs, { errorOn: 'bad' });
  const conn = new D.DtxConnection(mine);
  await conn.handshake({ timeoutMs: 2000 });
  await assert.rejects(conn.call(0, 'bad'), (e) => /nope/.test(e.message) && N.isNSError(e.nserror));
  const asked = new Promise((res) => conn.once('message', res));
  conn.request(0, 'ask', [], { expectsReply: false });
  assert.equal((await asked).value, 'deviceAsks');
  await new Promise((r) => setImmediate(r));
  assert.ok(seen.some((s) => s.type === D.TYPE.ACK && s.conversationIndex === 1), JSON.stringify(seen));
  conn.close();
});

test('I-199 dtx: a closed connection rejects pending calls and emits close; a silent device times out', async () => {
  const [mine, theirs] = pair();
  const conn = new D.DtxConnection(mine);
  const closed = new Promise((res) => conn.once('close', res));
  const p = conn.call(0, 'never', [], { timeoutMs: 5000 });
  theirs.destroy();
  mine.destroy();
  await assert.rejects(p, /closed/);
  await closed;
  const [m2] = pair();
  const c2 = new D.DtxConnection(m2);
  await assert.rejects(c2.handshake({ timeoutMs: 50 }), /no capabilities/);
  await assert.rejects(c2.call(0, 'x', [], { timeoutMs: 50 }), /no reply to x/);
  c2.close();
});

// ---------- RemoteXPC + HTTP/2 ----------
test('I-199 xpc: the empty-dictionary message is byte-exact (wrapper, object magic, version 5, dict header)', () => {
  const b = R.xpcEncode({ flags: R.XPC_FLAGS.ALWAYS_SET, id: 0, body: {} });
  assert.equal(b.toString('hex'), '920bb029' + '01000000' + '1400000000000000' + '0000000000000000' + '42371342' + '05000000' + '00f00000' + '04000000' + '00000000');
  assert.equal(R.xpcEncode({ flags: 0x0201, id: 0, body: null }).length, 24);
});

test('I-199 xpc: every type round trips (padding of keys, strings and data; nesting; uint64; date; double)', () => {
  const body = { a: null, b: true, c: false, d: -5, e: 2 ** 40, f: 0.25, g: 'abc', h: 'abcd', i: Buffer.from([9, 8, 7]), j: [1, 'x', { k: [] }], l: 18446744073709551615n, m: new Date('2026-10-05T01:02:03.004Z'), longerKeyName: {} };
  const { body: back, flags, id, byteLength } = R.xpcDecode(R.xpcEncode({ flags: 0x101, id: 7, body }));
  assert.equal(flags, 0x101);
  assert.equal(id, 7);
  assert.ok(byteLength > 24);
  assert.deepEqual({ ...back, i: [...back.i], m: back.m.toISOString() }, { ...body, i: [9, 8, 7], m: body.m.toISOString() });
});

test('I-199 xpc: probe says incomplete / desynced; XpcStream reassembles split and back-to-back messages', () => {
  const m1 = R.xpcEncode({ flags: 1, body: { Services: { s: { Port: '1' } } } });
  const m2 = R.xpcEncode({ flags: 1, id: 2, body: null });
  assert.equal(R.xpcProbe(m1.subarray(0, 10)).status, 'incomplete');
  assert.equal(R.xpcProbe(m1.subarray(0, 30)).status, 'incomplete');
  assert.equal(R.xpcProbe(Buffer.alloc(24)).status, 'desynced');
  const s = new R.XpcStream();
  const all = Buffer.concat([m1, m2]);
  const got = [];
  for (let i = 0; i < all.length; i += 7) got.push(...s.push(all.subarray(i, i + 7)));
  assert.deepEqual(got.map((m) => m.id), [0, 2]);
  assert.deepEqual(R.servicesOf(got[0].body), { s: 1 });
  assert.throws(() => new R.XpcStream().push(Buffer.alloc(30, 7)), /magic/);
});

test('I-199 http2: the RemoteXPC handshake is the preface then appium\'s frame order; the decoder drops padding', () => {
  const hs = R.rsdHandshake();
  assert.ok(hs.subarray(0, R.H2_PREFACE.length).equals(R.H2_PREFACE));
  const frames = new R.H2Decoder({ preface: true }).push(hs);
  assert.deepEqual(frames.map((f) => [f.type, f.stream, f.flags]), [
    [R.H2.SETTINGS, 0, 0], [R.H2.WINDOW_UPDATE, 0, 0], [R.H2.HEADERS, 1, R.H2_FLAG.END_HEADERS], [R.H2.DATA, 1, 0],
    [R.H2.HEADERS, 3, R.H2_FLAG.END_HEADERS], [R.H2.DATA, 1, 0], [R.H2.DATA, 3, 0], [R.H2.SETTINGS, 0, R.H2_FLAG.ACK],
  ]);
  assert.equal(frames[0].payload.readUInt32BE(8), 16 * 1024 * 1024);
  assert.equal(frames[1].payload.readUInt32BE(0), 16 * 1024 * 1024 - 65535);
  assert.equal(R.xpcDecode(frames[6].payload).flags, R.XPC_FLAGS.ALWAYS_SET | R.XPC_FLAGS.INIT_HANDSHAKE);
  const padded = R.h2Frame(R.H2.DATA, R.H2_FLAG.PADDED, 1, Buffer.from([2, 0xaa, 0xbb, 0, 0]));
  const dec = new R.H2Decoder();
  const out = [...dec.push(padded.subarray(0, 5)), ...dec.push(padded.subarray(5))];
  assert.deepEqual([...out[0].payload], [0xaa, 0xbb]);
  assert.throws(() => new R.H2Decoder({ preface: true }).push(Buffer.from('GET / HTTP/1.1\r\n\r\nxxxxxxxxx')), /preface/);
});

test('I-199 rsd: servicesOf keeps names and valid ports only', () => {
  assert.equal(R.servicesOf({}), null);
  assert.equal(R.servicesOf({ Services: [] }), null);
  assert.deepEqual(R.servicesOf({ Services: { a: { Port: '123' }, b: { Port: 'x' }, c: {}, d: { Port: '70000' } } }), { a: 123 });
});

// ---------- tunnel discovery (pure) ----------
const NETSTAT_ROWS = [
  'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid',
  'tcp6       0      0  fd00:1:2::.50000       fd00:1:2::.58783       ESTABLISHED   10 20 131072 131072      remoted:373    00182 00000008',
  'tcp6       0      0  fd00:1:2::.50000       fd00:1:2::.58783       ESTABLISHED   10 20 131072 131072      remoted:373    00182 00000008',
  'tcp6       0      0  fe80::1%en9.50001      fe80::2%en9.58783      ESTABLISHED   1 2 3 4                  remoted:373    00182',
  'tcp6       0      0  *.62078                *.*                    LISTEN        0 0 0 0                  remoted:373    00180',
  'tcp6       0      0  fd00:1:2::.50002       fd00:1:2::.50003       ESTABLISHED   1 2 3 4                  Xcode:4242     00182',
  'tcp6       0      0  ::1.50004              ::1.50005              ESTABLISHED   1 2 3 4                  remoted:373    00182',
  'tcp4       0      0  127.0.0.1.1            127.0.0.1.2            ESTABLISHED   1 2 3 4                  remoted:373    00182',
].join('\n');

test('I-199 tunnel: parseNetstat keeps remoted\'s ESTABLISHED tcp6 rows to a ULA address, once each; ::1 only in loopback mode', () => {
  assert.deepEqual(R.parseNetstat(NETSTAT_ROWS), [{ host: 'fd00:1:2::', port: 58783 }]);
  assert.deepEqual(R.parseNetstat(NETSTAT_ROWS, { loopback: true }), [{ host: 'fd00:1:2::', port: 58783 }, { host: '::1', port: 50005 }]);
  assert.deepEqual(R.parseNetstat(''), []);
});

test('I-199 tunnel: parseLsof gives each remote host of our own sockets with its commands', () => {
  const t = ['p1', 'cXcode', 'f3', 'n[fd00:1:2::5]:50002->[fd00:1:2::7]:50003', 'f4', 'n[fd00:1:2::5]:50004->[fd00:1:2::7]:50005', 'p2', 'cCoreDeviceService', 'f9', 'n[fd00:1:2::5]:50006->[fd00:1:2::7]:50007', 'f10', 'n*:5000', 'f11', 'n127.0.0.1:1->127.0.0.1:2'].join('\n');
  assert.deepEqual(R.parseLsof(t), [{ host: 'fd00:1:2::7', cmds: ['Xcode', 'CoreDeviceService'] }]);
});

// ---------- ConditionInducer (pure) ----------
const GROUPS = C.normalizeGroups([
  { identifier: 'SlowNetworkCondition', name: 'Network Link', profiles: [{ identifier: 'SlowNetwork3GGood', name: '3G' }] },
  { identifier: 'ThermalCondition', name: 'Thermal State', isActive: true, activeProfile: 'SeriousThermalState', profiles: [{ identifier: 'FairThermalState', name: 'Fair' }, { identifier: 'SeriousThermalState', name: 'Serious' }, { identifier: 'CriticalThermalState', name: 'Critical' }] },
]);

test('I-199 inducer: normalizeGroups / activeOf', () => {
  assert.deepEqual(C.activeOf(GROUPS), { group: 'ThermalCondition', profile: 'SeriousThermalState' });
  assert.equal(C.activeOf(C.normalizeGroups([{ identifier: 'x', profiles: [] }])), null);
  assert.throws(() => C.normalizeGroups({ not: 'an array' }), /unexpected reply/);
});

test('I-199 inducer: resolveProfile takes an alias (case-insensitive, thermal groups only) or an exact identifier', () => {
  assert.deepEqual(C.resolveProfile(GROUPS, 'serious'), { group: 'ThermalCondition', profile: 'SeriousThermalState' });
  assert.deepEqual(C.resolveProfile(GROUPS, 'CRITICAL'), { group: 'ThermalCondition', profile: 'CriticalThermalState' });
  assert.deepEqual(C.resolveProfile(GROUPS, 'SlowNetwork3GGood'), { group: 'SlowNetworkCondition', profile: 'SlowNetwork3GGood' });
  assert.throws(() => C.resolveProfile(GROUPS, 'nominal'), /no condition profile "nominal".*FairThermalState/);
  assert.throws(() => C.resolveProfile(GROUPS, ''), (e) => e.usage === true);
  const twin = C.normalizeGroups([{ identifier: 'ThermalCondition', profiles: [{ identifier: 'SeriousA' }, { identifier: 'SeriousB' }] }]);
  assert.throws(() => C.resolveProfile(twin, 'serious'), /names 2 thermal profiles/);
});

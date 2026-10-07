#!/usr/bin/env node
// Stand-in for the phone behind macOS's CoreDevice tunnel (incident I-199, tools/thermal.mjs), so no test reaches
// remoted, the tunnel or the phone. Two modes:
//   serve     listens on ::1 (two ports): a fake RemoteServiceDiscovery (HTTP/2 + RemoteXPC: answers our handshake
//             with a Services catalogue naming the hub's port) and a fake DTServiceHub (DTX, our own lib/dtx.mjs codec).
//             Writes {rsd, hub, pid} to $FAKE_CD_PORTS once listening; runs until killed.
//   netstat   prints `netstat -anv -p tcp`-format lines: remoted's ESTABLISHED connection to ::1.<rsd port> (tests
//             set $FW_THERMAL_LOOPBACK=1 so thermal.mjs accepts ::1) plus decoys (a LISTEN row, a link-local remoted
//             row, another process's ULA row). $FAKE_CD_NETSTAT=none: no remoted tunnel row; two: a second ULA host.
//             $FAKE_CD_NETSTAT_EXIT=N fails it.
//   lsof      prints `lsof -F cn` lines: Xcode's socket to the phone's full address (::1 here) plus a decoy;
//             $FAKE_CD_LSOF=none: no process of ours talks to the phone; two: a second address with the same start.
// Device state (the active condition and which connection set it) lives in $FAKE_CD_STATE (JSON), so several
// connections see one device; events go to $FAKE_CD_LOG (JSON lines: rsd, services, connect, call, close, autoclear).
// The device ends a condition when the connection that set it closes (go-ios devicestate.go), unless
// $FAKE_CD_KEEP_ON_CLOSE=1. Faults: $FAKE_CD_RSD_REJECT=1 (RSD answers with GOAWAY and closes), $FAKE_CD_NO_HUB=1 (the
// catalogue lacks DTServiceHub), $FAKE_CD_NO_CAPS=1 (the hub never answers the handshake), $FAKE_CD_ENABLE_ERROR=1
// (enable -> NSError reply), $FAKE_CD_DROP_MS=N (the hub closes a connection N ms after it enabled a condition),
// $FAKE_CD_DISABLE_HANG=1, $FAKE_CD_FOREIGN_DISABLE=nserror (I-233: a disable from a connection that did not set the
// active condition gets the "No active condition" NSError and leaves it on).
import { createServer } from 'node:net';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { DtxDecoder, encodeMessage, TYPE, AUX, HEADER, PAYLOAD_HEADER } from '../../tools/lib/dtx.mjs';
import { H2, H2_FLAG, H2Decoder, XpcStream, XPC_FLAGS, REPLY_STREAM, ROOT_STREAM, h2Frame, h2Settings, xpcEncode } from '../../tools/lib/rsd.mjs';

const env = process.env;
const SERVICE = 'com.apple.instruments.server.services.ConditionInducer';
export const FAKE_UDID = 'FAKE-UDID-0000';
const log = (o) => { if (env.FAKE_CD_LOG) appendFileSync(env.FAKE_CD_LOG, `${JSON.stringify({ t: Date.now(), pid: process.pid, ...o })}\n`); };
const readState = () => { try { return JSON.parse(readFileSync(env.FAKE_CD_STATE, 'utf8')); } catch { return { active: null }; } };
const writeState = (s) => { if (env.FAKE_CD_STATE) writeFileSync(env.FAKE_CD_STATE, JSON.stringify(s)); };

export const GROUPS = [
  { identifier: 'SlowNetworkCondition', name: 'Network Link', profiles: [{ identifier: 'SlowNetwork3GGood', name: '3G, Good', description: '3G' }] },
  { identifier: 'ThermalCondition', name: 'Thermal State', profiles: [
    { identifier: 'ThermalFair', name: 'Fair', description: 'Fair thermal state' },
    { identifier: 'ThermalSerious', name: 'Serious', description: 'Serious thermal state' },
    { identifier: 'ThermalCritical', name: 'Critical', description: 'Critical thermal state' },
  ] },
];

function groupsNow() {
  const a = readState().active;
  return GROUPS.map((g) => ({ ...g, isActive: !!a && a.group === g.identifier, activeProfile: a && a.group === g.identifier ? a.profile : '', isDestructive: false, isInternal: false }));
}
const nsError = (code, desc) => ({ NSDomain: 'com.apple.dt.ConditionInducer', NSCode: code, NSUserInfo: { NSLocalizedDescription: desc } });

function serveHub(sock, connId) {
  const dec = new DtxDecoder();
  let next = 0;
  const channels = new Map();
  log({ ev: 'connect', conn: connId });
  const reply = (h, { type = TYPE.REPLY, value } = {}) => sock.write(encodeMessage({ identifier: h.identifier, conversationIndex: h.conversationIndex + 1, channel: h.channel, type, value }));
  sock.on('data', (c) => {
    let msgs;
    try { msgs = dec.push(c); } catch (e) { log({ ev: 'bad', error: e.message }); sock.destroy(); return; }
    for (const m of msgs) {
      const h = m.header, sel = m.value;
      log({ ev: 'call', conn: connId, channel: h.channel, selector: sel, aux: m.aux.map((a) => a.value) });
      if (h.channel === 0 && sel === '_notifyOfPublishedCapabilities:') {
        if (env.FAKE_CD_NO_CAPS === '1') continue;
        const caps = encodeMessage({ identifier: ++next, channel: 0, type: TYPE.CALL, selector: '_notifyOfPublishedCapabilities:', aux: [{ type: AUX.OBJECT, value: { 'com.apple.private.DTXConnection': 1, [SERVICE]: 1, 'com.apple.instruments.server.services.deviceinfo': 1 } }] });
        caps.writeUInt32LE(0x1df0, HEADER + PAYLOAD_HEADER); // like the phone: the aux header's first field is not 0x1F0
        sock.write(caps);
      } else if (h.channel === 0 && sel === '_requestChannelWithCode:identifier:') {
        channels.set(m.aux[0].value, m.aux[1].value);
        reply(h, { type: TYPE.ACK });
      } else if (channels.get(h.channel) === SERVICE && sel === 'availableConditionInducers') {
        reply(h, { value: groupsNow() });
      } else if (channels.get(h.channel) === SERVICE && sel === 'enableConditionWithIdentifier:profileIdentifier:') {
        if (env.FAKE_CD_ENABLE_ERROR === '1') { reply(h, { type: TYPE.ERROR, value: nsError(1, 'The condition could not be enabled') }); continue; }
        writeState({ active: { group: m.aux[0].value, profile: m.aux[1].value, conn: connId } });
        reply(h, { value: true });
        if (env.FAKE_CD_DROP_MS) setTimeout(() => sock.destroy(), Number(env.FAKE_CD_DROP_MS));
      } else if (channels.get(h.channel) === SERVICE && sel === 'disableActiveCondition') {
        if (env.FAKE_CD_DISABLE_HANG === '1') continue;
        const s = readState();
        // I-233: like our phone on 10-07 03:09Z (OBSERVED), $FAKE_CD_FOREIGN_DISABLE=nserror answers a disable from a
        // connection that did not set the active condition (Xcode's) with the "nothing active" NSError and leaves it on
        if (s.active && env.FAKE_CD_FOREIGN_DISABLE === 'nserror' && s.active.conn !== connId) reply(h, { value: nsError(2, 'No active condition') });
        else if (s.active) { writeState({ active: null }); reply(h, { value: true }); } else reply(h, { value: nsError(2, 'No active condition') });
      } else if (h.expectsReply) reply(h, { type: TYPE.ERROR, value: nsError(99, `unknown selector ${sel}`) });
    }
  });
  sock.on('close', () => {
    log({ ev: 'close', conn: connId });
    const s = readState();
    if (s.active?.conn === connId && env.FAKE_CD_KEEP_ON_CLOSE !== '1') { writeState({ active: null }); log({ ev: 'autoclear', conn: connId }); }
  });
  sock.on('error', () => {});
}

/** RSD: waits for the client's RemoteXPC handshake (the INIT_HANDSHAKE message on the reply stream), then sends the
 *  catalogue on the root stream, split over two DATA frames (the second one padded). */
function serveRsd(sock, hubPort) {
  const dec = new H2Decoder({ preface: true });
  const xpc = new Map();
  let sent = false;
  log({ ev: 'rsd' });
  sock.on('data', (c) => {
    let frames;
    try { frames = dec.push(c); } catch (e) { log({ ev: 'rsd-bad', error: e.message }); sock.destroy(); return; }
    for (const f of frames) {
      if (f.type !== H2.DATA || !f.payload.length) continue;
      if (!xpc.has(f.stream)) xpc.set(f.stream, new XpcStream());
      for (const m of xpc.get(f.stream).push(f.payload)) {
        if (sent || f.stream !== REPLY_STREAM || !(m.flags & XPC_FLAGS.INIT_HANDSHAKE)) continue;
        sent = true;
        if (env.FAKE_CD_RSD_REJECT === '1') {
          const p = Buffer.alloc(8); p.writeUInt32BE(0, 0); p.writeUInt32BE(11, 4);
          sock.end(h2Frame(H2.GOAWAY, 0, 0, p));
          log({ ev: 'rsd-reject' });
          return;
        }
        const services = { 'com.apple.mobile.lockdown.remote.trusted': { Port: '1', Properties: { UsesRemoteXPC: false } } };
        if (env.FAKE_CD_NO_HUB !== '1') services['com.apple.instruments.dtservicehub'] = { Port: String(hubPort), Properties: { UsesRemoteXPC: false } };
        const body = { MessageType: 'Handshake', MessagingProtocolVersion: 5, Properties: { UniqueDeviceID: env.FAKE_CD_UDID || FAKE_UDID, ProductType: 'iPhone16,2' }, Services: services };
        const msg = xpcEncode({ flags: XPC_FLAGS.ALWAYS_SET | XPC_FLAGS.DATA_PRESENT, id: 0, body });
        const cut = Math.floor(msg.length / 2);
        const padded = Buffer.concat([Buffer.from([3]), msg.subarray(cut), Buffer.alloc(3)]);
        sock.write(Buffer.concat([h2Settings({ 3: 100, 4: 1048576 }), h2Frame(H2.DATA, 0, ROOT_STREAM, msg.subarray(0, cut)), h2Frame(H2.DATA, H2_FLAG.PADDED, ROOT_STREAM, padded)]));
        log({ ev: 'services', count: Object.keys(services).length });
      }
    }
  });
  sock.on('error', () => {});
}

const listen = (srv) => new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(0, '::1', () => resolve(srv.address().port)); });

async function serve() {
  let n = 0;
  const socks = new Set();
  const track = (s) => { socks.add(s); s.on('close', () => socks.delete(s)); };
  const hub = createServer((s) => { track(s); serveHub(s, `${process.pid}-${++n}`); });
  const hubPort = await listen(hub);
  const rsd = createServer((s) => { track(s); serveRsd(s, hubPort); });
  const rsdPort = await listen(rsd);
  writeFileSync(env.FAKE_CD_PORTS, JSON.stringify({ rsd: rsdPort, hub: hubPort, pid: process.pid }));
  log({ ev: 'serve', rsd: rsdPort, hub: hubPort });
  process.stdout.write('FAKE_CD_READY\n');
  const stop = () => { hub.close(); rsd.close(); for (const s of socks) s.destroy(); setTimeout(() => process.exit(0), 100); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

function netstat() {
  if (env.FAKE_CD_NETSTAT_EXIT) { process.stderr.write('netstat: fake failure\n'); process.exit(Number(env.FAKE_CD_NETSTAT_EXIT)); }
  const { rsd } = JSON.parse(readFileSync(env.FAKE_CD_PORTS, 'utf8'));
  const row = (local, foreign, state, proc) => `tcp6       0      0  ${local.padEnd(46)} ${foreign.padEnd(46)} ${state.padEnd(11)}   1234   5678  131072  131072      ${proc}   00182 00000008 000000000000a1b2 00000080 00000800      1      0 000001`;
  const lines = [
    'Active Internet connections (including servers)',
    'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options           gencnt    flags   flags1 usecnt rtncnt fltrs',
    row('*.62078', '*.*', 'LISTEN', 'remoted:373'),
    row('fe80::1.50001', 'fe80::2.58783', 'ESTABLISHED', 'remoted:373'),
    row('fd00::10.50002', 'fd00::99.50003', 'ESTABLISHED', 'Xcode:4242'),
  ];
  if (env.FAKE_CD_NETSTAT !== 'none') lines.push(row('::1.50004', `::1.${rsd}`, 'ESTABLISHED', 'remoted:373'));
  if (env.FAKE_CD_NETSTAT === 'two') lines.push(row('fd00::20.50005', 'fd00::21.58783', 'ESTABLISHED', 'remoted:373'));
  lines.push('tcp4       0      0  127.0.0.1.50006        127.0.0.1.50007        ESTABLISHED   1  2  3  4  remoted:373 00182');
  process.stdout.write(`${lines.join('\n')}\n`);
}

/** lsof -nP -i6TCP -sTCP:ESTABLISHED -F cn: our own processes' sockets; Xcode's goes to the phone's full address. */
function lsof() {
  const { rsd } = JSON.parse(readFileSync(env.FAKE_CD_PORTS, 'utf8'));
  const lines = ['p100', 'cSafari', 'f20', 'n[fe80::1]:50010->[fe80::2]:443'];
  if (env.FAKE_CD_LSOF !== 'none') lines.push('p200', 'cXcode', 'f31', `n[::1]:50011->[::1]:${rsd + 1}`, 'f32', 'n[::1]:50012->[::1]:50013');
  if (env.FAKE_CD_LSOF === 'two') lines.push('p300', 'cCoreDeviceService', 'f7', 'n[::1]:50014->[::10]:50015');
  process.stdout.write(`${lines.join('\n')}\n`);
}

const mode = process.argv[2];
if (mode === 'serve') { await import('./lifeline.mjs'); } // I-072: the long-lived server ends with the test process
if (mode === 'serve') serve().catch((e) => { process.stderr.write(`fake-coredevice: ${e.message}\n`); process.exit(1); });
else if (mode === 'netstat' || mode === '-anv') netstat();
else if (mode === 'lsof' || mode === '-nP') lsof();
else { process.stderr.write(`fake-coredevice: unknown mode ${process.argv.slice(2).join(' ')}\n`); process.exit(64); }

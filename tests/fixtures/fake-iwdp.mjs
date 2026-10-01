#!/usr/bin/env node
// Stand-in for ios_webkit_debug_proxy in the tools/sim.mjs tests ($FW_IWDP). It reads the -c config like the real
// one (port_config.c): lines `<id>:<port>`, id = a device id, `null` (the device list) or empty (any device),
// first match wins, a port of -1 ignores that device before attach. Attached devices: SIMULATOR (when -s names a
// unix:...webinspectord_sim.socket) plus every phone id in $FAKE_IWDP_PHONES (comma list; made up). The list port
// serves GET /json [{deviceId, deviceName, deviceOSVersion, url}] for every attached device that got a port, like
// iwdp's device list; SIMULATOR's port runs tests/fixtures/fake-run-proxy.mjs (the fake Safari tab) as a child in
// this process group; a phone that got a port is listed (that is what tools/lib/sim.mjs must catch) and serves [].
// $FAKE_IWDP_LOG: one JSON line {argv, cfgMode, cfg} at start (the cfg text: only the TEST reads it).
import http from 'node:http';
import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2);
const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
const cfgPath = val('-c'), sock = val('-s');
const cfg = readFileSync(cfgPath, 'utf8');
if (process.env.FAKE_IWDP_LOG) appendFileSync(process.env.FAKE_IWDP_LOG, JSON.stringify({ argv: a, cfgMode: (statSync(cfgPath).mode & 0o777).toString(8), cfg }) + '\n');
const lines = cfg.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(':'); return { id: l.slice(0, i), port: Number(l.slice(i + 1)) }; });
for (const l of lines) if (!(l.id === '' || l.id === 'null' || /^[a-fA-F0-9-]{25,}$/.test(l.id))) { console.error(`Unknown file ${cfgPath}`); process.exit(1); }
const listPort = lines.find((l) => l.id === 'null')?.port;
const attached = [...(sock && /^unix:.*com\.apple\.webinspectord_sim\.socket$/.test(sock) ? ['SIMULATOR'] : []), ...String(process.env.FAKE_IWDP_PHONES || '').split(',').filter(Boolean)];
const devices = [];
for (const id of attached) {
  const e = lines.find((l) => l.id !== 'null' && (l.id === '' || l.id.toLowerCase() === id.toLowerCase()));
  if (e && e.port > 0) devices.push({ deviceId: id, deviceName: id === 'SIMULATOR' ? 'SIMULATOR' : "Test Person's iPhone", deviceOSVersion: '26.5', url: `localhost:${e.port}`, port: e.port });
}
const kids = [];
// a second device on the Simulator's port can't bind it (like iwdp, which logs and goes on); it is still listed
const serve = (port, body) => http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url === '/json' ? body() : [])); }).on('error', (e) => console.error(`fake iwdp: port ${port}: ${e.code}`)).listen(port, '127.0.0.1');
if (listPort) serve(listPort, () => devices.map(({ port, ...d }) => d));
for (const d of devices) {
  // $FAKE_IWDP_TAB=webkit: tests/fixtures/fake-webkit-proxy.mjs instead (its page model + fake WDA, for sim.mjs gesture)
  const tabJs = process.env.FAKE_IWDP_TAB === 'webkit' ? 'fake-webkit-proxy.mjs' : 'fake-run-proxy.mjs';
  if (d.deviceId === 'SIMULATOR') kids.push(spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), tabJs), `--port=${d.port}`, ...String(process.env.FAKE_IWDP_TAB_ARGS || '').split(' ').filter(Boolean)], { stdio: 'ignore' }));
  else serve(d.port, () => []);
}
const bye = () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch {} } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
console.log(`fake iwdp: list :${listPort}, ${devices.length} device(s)`);

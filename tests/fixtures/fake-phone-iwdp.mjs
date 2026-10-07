#!/usr/bin/env node
// Stand-in for the PHONE's ios_webkit_debug_proxy in the usblink tests ($FW_IWDP_PHONE, incident I-222). It takes the
// inline config the lead runs it with, `-c null:<list>,:<first tab>-<last tab>`, and serves GET /json on the list port:
// the device list in $FAKE_PHONE_IWDP_DEVICES (a file re-read per request; a JSON array, default []: the stale proxy of
// I-235). $FAKE_PHONE_IWDP_BIND: the address it binds (default 127.0.0.1, where usblink's bind-localhost shim puts the
// real one). Whether the shim reaches this fake depends on how macOS launches its #!/usr/bin/env line (OBSERVED both
// ways on 2026-10-07), so a test that needs "the shim did not take" (I-241) pairs 0.0.0.0 with a no-op dylib in
// $FW_USBLINK_SHIM. Entries carry a made-up id and the name "Test Person's iPhone", which the tools must never print. With
// `-s unix:<socket>` it plays a Simulator proxy (the tools must never signal it). $FAKE_PHONE_IWDP_LOG: one JSON line
// {pid, argv} at start. Exits with the test process (lifeline).
import './lifeline.mjs';
import http from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';

const a = process.argv.slice(2);
const cfg = a[a.indexOf('-c') + 1] || '';
const list = Number((cfg.match(/null:(\d+)/) || [])[1]);
if (!list) { console.error(`fake phone iwdp: no list port in -c "${cfg}"`); process.exit(2); }
if (process.env.FAKE_PHONE_IWDP_LOG) appendFileSync(process.env.FAKE_PHONE_IWDP_LOG, JSON.stringify({ pid: process.pid, argv: a }) + '\n');
const devices = () => { try { return JSON.parse(readFileSync(process.env.FAKE_PHONE_IWDP_DEVICES, 'utf8')); } catch { return []; } };
http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url === '/json' ? devices() : [])); })
  .on('error', (e) => { console.error(`fake phone iwdp: port ${list}: ${e.code}`); process.exit(1); })
  .listen(list, process.env.FAKE_PHONE_IWDP_BIND || '127.0.0.1', () => console.error(`fake phone iwdp listening on ${list}`));

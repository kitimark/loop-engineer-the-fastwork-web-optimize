#!/usr/bin/env node
// Stand-in for `iproxy 8100:8100 -u <udid>` in the `iphone.mjs wda start|stop` tests ($FW_IPROXY): logs its
// argv (FAKE_IPROXY_LOG) and stays alive until killed. The fake runner itself listens on $FW_WDA_URL, so
// `wda start` can report WDA_READY before this process has written its log (I-055); FAKE_IPROXY_DELAY_MS
// delays the write to make that late start happen on every run, not only on a loaded host.
// I-220: with FAKE_RUNNER_PORT set (the fake runner listens there, tests/fixtures/fake-xcodebuild.mjs) this one
// listens on $FW_WDA_URL's port like the real iproxy and acts per FAKE_IPROXY_MODES (one mode per start, counted in
// $FAKE_IPROXY_LOG.n; the last mode repeats): `forward` pipes each connection to the runner (and prints the real
// "Error connecting to device: Connection refused" while the runner is not up), `nodevice` prints the real
// "No connected/matching device found, disconnecting client." and drops it (usbmux has no USB device), `dead`
// never listens (a forward that does not come up).
import './lifeline.mjs'; // I-072: registered for the test's teardown; ends with the test process
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
const logArgv = () => { if (process.env.FAKE_IPROXY_LOG) appendFileSync(process.env.FAKE_IPROXY_LOG, JSON.stringify(process.argv.slice(2)) + '\n'); };
const delay = Number(process.env.FAKE_IPROXY_DELAY_MS) || 0;
let mode = 'none';
if (process.env.FAKE_RUNNER_PORT) {
  mode = 'forward';
  if (process.env.FAKE_IPROXY_MODES && process.env.FAKE_IPROXY_LOG) {
    const f = `${process.env.FAKE_IPROXY_LOG}.n`;
    appendFileSync(f, 'x');
    const modes = process.env.FAKE_IPROXY_MODES.split(',');
    mode = modes[Math.min(readFileSync(f, 'utf8').length, modes.length) - 1];
  }
}
if (delay > 0) setTimeout(logArgv, delay); else logArgv();
console.log('Creating listening port 8100 for device port 8100');
if (mode === 'forward' || mode === 'nodevice') {
  const runnerPort = Number(process.env.FAKE_RUNNER_PORT);
  createServer((sock) => {
    console.log('New connection for 8100->8100, fd = 5');
    sock.on('error', () => {});
    if (mode === 'nodevice') { console.log('No connected/matching device found, disconnecting client.'); sock.destroy(); return; }
    console.log(`Requesting connection to USB device handle 7 (serial: fake), port 8100`);
    const up = connect(runnerPort, '127.0.0.1');
    up.on('error', () => { console.log('Error connecting to device: Connection refused'); sock.destroy(); });
    up.on('connect', () => { sock.pipe(up); up.pipe(sock); });
    sock.on('close', () => up.destroy());
    up.on('close', () => sock.destroy());
  }).listen(Number(new URL(process.env.FW_WDA_URL).port), '127.0.0.1');
}
setInterval(() => {}, 1 << 30);

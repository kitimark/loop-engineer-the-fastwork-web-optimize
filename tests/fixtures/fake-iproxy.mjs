#!/usr/bin/env node
// Stand-in for `iproxy 8100:8100 -u <udid>` in the `iphone.mjs wda start|stop` tests ($FW_IPROXY): logs its
// argv (FAKE_IPROXY_LOG) and stays alive until killed. The fake runner itself listens on $FW_WDA_URL, so
// `wda start` can report WDA_READY before this process has written its log (I-055); FAKE_IPROXY_DELAY_MS
// delays the write to make that late start happen on every run, not only on a loaded host.
import './lifeline.mjs'; // I-072: registered for the test's teardown; ends with the test process
import { appendFileSync } from 'node:fs';
const logArgv = () => { if (process.env.FAKE_IPROXY_LOG) appendFileSync(process.env.FAKE_IPROXY_LOG, JSON.stringify(process.argv.slice(2)) + '\n'); };
const delay = Number(process.env.FAKE_IPROXY_DELAY_MS) || 0;
if (delay > 0) setTimeout(logArgv, delay); else logArgv();
console.log('Creating listening port 8100 for device port 8100');
setInterval(() => {}, 1 << 30);

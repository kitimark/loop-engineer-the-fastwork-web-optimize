#!/usr/bin/env node
// Stand-in for `iproxy 8100:8100 -u <udid>` in the `iphone.mjs wda start|stop` tests ($FW_IPROXY): logs its
// argv (FAKE_IPROXY_LOG) and stays alive until killed. The fake runner itself listens on $FW_WDA_URL.
import { appendFileSync } from 'node:fs';
if (process.env.FAKE_IPROXY_LOG) appendFileSync(process.env.FAKE_IPROXY_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
console.log('Creating listening port 8100 for device port 8100');
setInterval(() => {}, 1 << 30);

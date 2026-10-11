#!/usr/bin/env node
// This Mac's LAN address, the one the iPhone on the same Wi-Fi reaches (incident I-073; tools/lib/lan.mjs). It changes
// when the Wi-Fi reconnects, so never type it or write it into a committed file (Hard rule 12): phone URLs name the
// placeholder host `lan` (http://lan:<port>/), which iphone.mjs open / safari-restart --url, the iphone lease's --url and
// console.mjs post --url resolve at run time. Use this CLI for anything else that needs the address now.
//
//   node tools/lan.mjs                       # the address, e.g. 192.168.1.20
//   node tools/lan.mjs --url --port 5231     # http://<address>:5231/ (the plain-http twin form the iPhone opens)
//   node tools/lan.mjs --resolve <url>       # <url> with a `lan` / `lan-host` host replaced; any other URL unchanged
//   node tools/lan.mjs --json [--port N]     # {address, interface, source, candidates, url?}
//
// Rule (shared with serve.mjs's LAN: lines): a private IPv4 (10/8, 172.16/12, 192.168/16) on a non-tunnel interface;
// en0 first, then by interface name (en1 < en2 < en10), then by address. FW_LAN_ADDRESS=<IPv4> overrides it.
// Exit 0 printed, 2 usage, 3 no LAN address (Wi-Fi off or not connected).
import { lanChoice, resolveLanUrl } from './lib/lan.mjs';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return undefined; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const usage = () => { console.error('usage: node tools/lan.mjs [--url --port N] [--resolve <url>] [--json [--port N]]  (header of tools/lan.mjs)'); return 2; };

function main() {
  if (flag('help') || flag('h')) { console.log('see the header of tools/lan.mjs'); return 0; }
  const known = new Set(['--url', '--port', '--resolve', '--json']);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].split('=')[0];
    if (!known.has(name)) return usage();
    if ((name === '--port' || name === '--resolve') && !argv[i].includes('=')) i++;
  }
  const portOpt = opt('port');
  let port = null;
  if (portOpt !== undefined) {
    port = Number(portOpt);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error(`--port must be 1..65535 (got "${portOpt}")`); return 2; }
  }
  if (flag('url') && port == null) { console.error('--url needs --port N (the server\'s plain-http port, e.g. its httpTwin)'); return 2; }
  const resolveArg = opt('resolve');
  if (flag('resolve') && (resolveArg === undefined || resolveArg.startsWith('--'))) return usage();
  let c;
  try { c = lanChoice(); } catch (e) { console.error(`NO LAN ADDRESS: ${e.message}`); return 3; }
  const url = port != null ? `http://${c.address}:${port}/` : undefined;
  if (flag('json')) {
    console.log(JSON.stringify({ address: c.address, interface: c.name, source: c.source, candidates: c.candidates, ...(url ? { url } : {}), ...(resolveArg !== undefined ? { resolved: resolveLanUrl(resolveArg, { address: c.address }) } : {}) }));
    return 0;
  }
  if (resolveArg !== undefined) { console.log(resolveLanUrl(resolveArg, { address: c.address })); return 0; }
  console.log(flag('url') ? url : c.address);
  return 0;
}
process.exit(main());

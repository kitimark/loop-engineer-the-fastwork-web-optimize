#!/usr/bin/env node
// T-106: one process for every Try-it page (the /build page's versions, `console.mjs proposal phone`) instead of one
// long-lived serve.mjs each. One plain-http port per build (phone links http://lan:<port>/), the build's files loaded
// on the first request and dropped after 30 min without one; a stopped build's port shows a Start page. Try-it pages
// send Cache-Control: no-store. Measurement servers (serve.mjs, fix.mjs serve/ab, verify, bench) are not affected.
// Details and the registry: tools/lib/tryit.mjs.
//
//   node tools/tryit.mjs start [<name>]           # start the host (detached) if it is not running; with a name, also
//                                                 # serve that build again if it was stopped. Prints TRYIT_HOST pid <n>
//   node tools/tryit.mjs add <name> [--overlay <dir>[,<dir>]] [--root site-pretty|site] [--latency <ms>] [--port <n>]
//        [--vendors local|block|off] [--label "<plain words>"] [--by <you>]
//        [--from-state <serve.mjs --state file>]  # take root, overlays, latency, vendors and port from a running
//                                                 # serve.mjs (migrate a Try-it link: add, then stop that serve.mjs;
//                                                 # the host takes the port over within 5 s)
//        # registers (or updates) the build, starts the host if needed, waits until it is served:
//        # TRYIT <name> http://lan:<port>/ (added|updated|unchanged)
//   node tools/tryit.mjs stop <name>              # not served; its port answers with a Start page (one tap serves it)
//   node tools/tryit.mjs rm <name>                # unregister; the port is closed and freed
//   node tools/tryit.mjs list [--json]            # name, port, state (served | idle | stopped | starting | error |
//                                                 # host-down), last use, label
//   node tools/tryit.mjs host [--idle-min <n>]    # run the host in the foreground (start runs this detached);
//                                                 # $FW_TRYIT_IDLE_MIN, default 30; $FW_TRYIT_HOST 0.0.0.0 | 127.0.0.1
//   node tools/tryit.mjs quit                     # stop the host (registered builds stay; `start` brings them back)
// Exit: 0 ok, 1 error, 2 usage.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as T from './lib/tryit.mjs';
import { exitOnHelp } from './lib/help.mjs';

exitOnHelp(import.meta.url); // I-152 N10: --help prints the header above and exits before anything runs
const [cmd, ...rest] = process.argv.slice(2);
const args = rest;
const opt = (n) => { const i = args.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return undefined; const a = args[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1]; };
const flag = (n) => args.includes(`--${n}`);
const VALUED = new Set(['--overlay', '--root', '--latency', '--port', '--vendors', '--label', '--by', '--from-state', '--idle-min']);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(args[i - 1])));
const usage = (m) => { console.error(`tryit.mjs: ${m} (see the header of tools/tryit.mjs)`); process.exit(2); };
const ago = (iso) => { if (!iso) return 'never'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

async function main() {
  if (cmd === 'host') {
    const m = opt('idle-min');
    if (m !== undefined && !(Number(m) > 0)) usage('--idle-min: minutes > 0');
    return T.runHost(m !== undefined ? { idleMs: Number(m) * 60000 } : {});
  }
  if (cmd === 'start') {
    const name = pos[0];
    if (name && !T.getBuild(name)) throw new Error(`no Try-it build "${name}" (node tools/tryit.mjs list)`);
    if (name) T.setStopped(name, false);
    const h = await T.ensureHost();
    console.log(`TRYIT_HOST pid ${h.pid} (${h.started ? 'started' : 'already running'})`);
    if (name) { const { port } = await T.waitServed(name); console.log(`TRYIT ${name} ${T.tryitLink(port)} (served)`); }
    return 0;
  }
  if (cmd === 'add') {
    const name = pos[0];
    if (!name) usage('add <name>');
    let spec = { name, by: opt('by') || process.env.FW_AGENT || 'unknown' };
    if (opt('from-state')) {
      const st = JSON.parse(readFileSync(opt('from-state'), 'utf8'));
      spec = { ...spec, root: basename(String(st.root || 'site-pretty')), overlays: st.overlays || [], latency: st.latency || 0, vendors: st.vendors || 'local', port: Number.isInteger(st.port) ? st.port : null };
    }
    if (opt('root')) spec.root = opt('root');
    if (opt('overlay') !== undefined) spec.overlays = opt('overlay').split(',').filter(Boolean);
    if (opt('latency') !== undefined) spec.latency = Number(opt('latency'));
    if (opt('vendors')) spec.vendors = opt('vendors');
    if (opt('port') !== undefined) spec.port = Number(opt('port'));
    if (opt('label') !== undefined) spec.label = opt('label');
    const r = await T.ensureBuild(spec);
    console.log(`TRYIT ${name} ${T.tryitLink(r.port)} (${r.created ? 'added' : r.updated ? 'updated' : 'unchanged'})`);
    console.log('  plain http on the Wi-Fi (lan = this Mac\'s Wi-Fi address: node tools/lan.mjs); loaded on first use, no-store');
    return 0;
  }
  if (cmd === 'stop' || cmd === 'rm') {
    const name = pos[0];
    if (!name) usage(`${cmd} <name>`);
    const e = cmd === 'stop' ? T.setStopped(name, true) : T.removeBuild(name);
    if (!e) throw new Error(`no Try-it build "${name}" (node tools/tryit.mjs list)`);
    console.log(cmd === 'stop' ? `STOPPED ${name}: ${T.tryitLink(e.port)} now shows a Start page` : `REMOVED ${name}: port ${e.port} is closed`);
    return 0;
  }
  if (cmd === 'list') {
    const rows = T.buildRows();
    if (flag('json')) { console.log(JSON.stringify({ host: T.readHost(), builds: rows }, null, 1)); return 0; }
    const h = T.readHost();
    console.log(h ? `Try-it host pid ${h.pid}, since ${h.startedAt}` : 'Try-it host not running (node tools/tryit.mjs start)');
    if (!rows.length) console.log('no Try-it builds (node tools/tryit.mjs add <name> --overlay <dir>)');
    for (const r of rows) console.log(`${r.state.padEnd(9)} ${r.name}  ${T.tryitLink(r.port)}  last use ${ago(r.lastHit)}${r.label ? `  "${r.label}"` : ''}${r.error ? `  ERROR ${r.error}` : ''}`);
    return 0;
  }
  if (cmd === 'quit') {
    const h = T.readHost();
    if (!h) { console.log('Try-it host not running'); return 0; }
    process.kill(h.pid, 'SIGTERM');
    console.log(`STOPPED Try-it host pid ${h.pid}`);
    return 0;
  }
  usage(cmd ? `unknown command "${cmd}"` : 'a command: start | add | stop | rm | list | host | quit');
}
main().then((c) => { if (typeof c === 'number') process.exitCode = c; }, (e) => { console.error(`tryit.mjs: ${e.message}`); process.exit(1); });

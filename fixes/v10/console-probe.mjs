#!/usr/bin/env node
// v10 console probe (int-v8; lead 2026-10-06: build-private-demo saw "Failed to hydrate: HierarchyRequestError …
// appendChild" on v10). Console messages only, nothing timed. One load per build in headless Chrome at the phone
// viewport (430 x 775 DPR 3, mobile + touch, hover:none / pointer:coarse), served like the phone servers (plain http,
// --vendors=local, --latency 150, --no-cache). Records every console message (all levels), Log entries and
// uncaught exceptions with their first stack frame, for 8 s after load, then a walk to the page end and back
// (the morph mounts), 4 s more.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 180 --owner int-v8 -- \
//     node fixes/v10/console-probe.mjs [--out out/v10/console.json]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { launchChrome, CDP, gotoAndSettle, tempProfileDir, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', join(WT, 'out/v10/console.json'));
mkdirSync(join(WT, 'out/v10'), { recursive: true });
const S = 'out/v10/snap-f5068db34a32-a4ed5432f2f7';
const BUILDS = [
  ['B', null, 'plain baseline (site-pretty)'],
  ['C', `${S}/C`, 'main v9-final 1b2eecc66011'],
  ['M', 'out/emp1v9f/snap-4da641f828bb/V', 'measured 4da641f828bb'],
  ['N', `${S}/N`, 'v10 pre-nolift f5068db34a32 / a81b9af7b2c9'],
  ['V', `${S}/V`, 'v10 f5068db34a32 / a4ed5432f2f7'],
];
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const frame0 = (st) => { const f = st?.callFrames?.[0]; return f ? `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}` : null; };

async function server(k, ov) {
  const st = join(WT, `out/v10/serve-console-${k}.json`); rmSync(st, { force: true });
  const a = [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150', '--no-http-twin'];
  if (ov) a.push('--overlay', join(WT, ov));
  const p = spawn(process.execPath, a, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 200; i++) { if (existsSync(st)) { try { const s = JSON.parse(readFileSync(st, 'utf8')); return { p, url: `http://localhost:${s.port}/` }; } catch {} } await sleep(100); }
  p.kill(); throw new Error('server ' + k);
}

const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v10/chrome'), 'v10-console'), headless: true, windowSize: '430,775' });
const cdp = await CDP.connect(chrome.wsUrl);
const res = { tool: 'fixes/v10/console-probe.mjs (int-v8)', at: new Date().toISOString(), loads: [] };
try {
  for (const [k, ov, what] of BUILDS) {
    const srv = await server(k, ov);
    const page = await cdp.newIsolatedPage();
    const msgs = [];
    page.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled') msgs.push({ kind: 'console.' + m.params.type, text: m.params.args.map((x) => x.value ?? x.description ?? '').join(' ').slice(0, 300), frame: frame0(m.params.stackTrace) });
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; msgs.push({ kind: 'exception', text: (d.exception?.description || d.text || '').slice(0, 300), frame: frame0(d.stackTrace) }); }
      if (m.method === 'Log.entryAdded') msgs.push({ kind: 'log.' + m.params.entry.level, text: (m.params.entry.text || '').slice(0, 300), frame: frame0(m.params.entry.stackTrace), url: m.params.entry.url });
    });
    await page.send('Runtime.enable').catch(() => {}); await page.send('Log.enable').catch(() => {});
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 775, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }).catch(() => {});
    await gotoAndSettle(page, srv.url, { quietMs: 1500, maxMs: 45000 });
    await sleep(8000);
    await page.eval(`new Promise((res) => { let y = 0; const L = document.documentElement.scrollHeight; const step = () => { y += 500; scrollTo({ top: y, behavior: 'instant' }); y < L ? setTimeout(step, 50) : setTimeout(() => { scrollTo({ top: 0, behavior: 'instant' }); res(1); }, 1500); }; step(); })`, { timeout: 60000 });
    await sleep(4000);
    const served = await page.eval(`Promise.all([${JSON.stringify(NODE)}, ${JSON.stringify(CSSF)}].map((p) => fetch('/' + p, { cache: 'no-store' }).then((r) => r.arrayBuffer()).then((b) => crypto.subtle.digest('SHA-256', b)).then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12))))`);
    const hyd = msgs.filter((m) => /hydrat|HierarchyRequestError/i.test(m.text));
    res.loads.push({ k, what, served, hydrate: hyd, warnErr: msgs.filter((m) => /warn|error|exception/.test(m.kind)), all: msgs });
    console.log(`${k} (${what}) served ${served.join('/')}: hydrate/HierarchyRequestError ${hyd.length}${hyd.length ? ' first: ' + JSON.stringify(hyd[0]) : ''}; warnings/errors ${msgs.filter((m) => /warn|error|exception/.test(m.kind)).length}, messages ${msgs.length}`);
    for (const m of msgs.filter((m) => /warn|error|exception/.test(m.kind)).slice(0, 6)) console.log(`   ${m.kind}: ${m.text.slice(0, 160)} @ ${m.frame}`);
    await page.close(); srv.p.kill();
  }
} finally {
  writeFileSync(OUT, JSON.stringify(res, null, 1));
  cdp.close(); await chrome.close();
  console.log('wrote', OUT.replace(WT + '/', ''));
}

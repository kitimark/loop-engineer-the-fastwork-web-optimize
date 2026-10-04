#!/usr/bin/env node
// P-100 (PHONE TICKET P-100 in fixes/cd-roll-ca/README.md): one display-rate record on the phone. Safari already shows
// the arm's page (the caller ran `iphone.mjs open`); this waits --settle s, records --seconds s of Xcode's 'Display',
// 'Core Animation FPS' and 'Thermal State' instruments on the device (xcrun xctrace record, all processes; installs
// nothing; no Web Inspector attached), exports the tables the scorer reads, and writes one JSON:
//   { label, arm, at, seconds, battery: {start, end}, tables: { <schema>: {cols, rows} }, toc: [schemas], summary, error }
// The device id (WDA runner config) and the device name (from the trace's table of contents) are never printed or
// stored (redacted to <DEVICE> / <NAME>), nor any LAN address. The .trace bundle is deleted after the export.
//   node fixes/cd-roll-ca/phone/p100-rec.mjs --arm <name> --label <run label> --out <file.json> [--seconds 20] [--settle 5]
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readConfig } from '../../../tools/lib/wda-runner.mjs';
import { batteryInfo } from '../../../tools/lib/iphone-run.mjs';
import { readTable, summarize } from './p100-lib.mjs';

const a = process.argv.slice(2);
const opt = (k, d = null) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
const arm = opt('arm'), label = opt('label'), out = opt('out'), seconds = Number(opt('seconds', 20)), settle = Number(opt('settle', 5));
if (!arm || !label || !out || !(seconds > 0)) { console.error('usage: p100-rec.mjs --arm <name> --label <x> --out <f.json> [--seconds 20] [--settle 5]'); process.exit(1); }
export const SCHEMAS = ['display-vsyncs-interval', 'displayed-surfaces-interval', 'core-animation-fps-estimate', 'device-thermal-state-intervals'];
const { udid } = readConfig();
if (!udid) { console.log(`P100REC ${label} error: no device in the WDA runner config`); process.exit(1); }
const red = (s) => String(s || '').split(udid).join('<DEVICE>').replace(/\b(?:10|172|192)\.\d+\.\d+\.\d+\b/g, '<LAN>');
const xc = (args, timeout = 120000) => { const r = spawnSync('xcrun', ['xctrace', ...args], { encoding: 'utf8', timeout, maxBuffer: 256 << 20 }); return { code: r.status, out: red(r.stdout), err: red(r.stderr) }; };
const batt = () => { const b = batteryInfo(); return b.error ? null : (b.temperatureC ?? null); };

mkdirSync(dirname(out), { recursive: true });
const rec = { label, arm, at: new Date().toISOString(), seconds, settle, battery: {}, tables: {}, toc: [], error: null };
await new Promise((r) => setTimeout(r, settle * 1000));
rec.battery.start = batt();
const TR = out.replace(/\.json$/, '') + '.trace';
rmSync(TR, { recursive: true, force: true });
const r = xc(['record', '--instrument', 'Display', '--instrument', 'Core Animation FPS', '--instrument', 'Thermal State', '--device', udid, '--all-processes', '--time-limit', `${seconds}s`, '--output', TR, '--no-prompt'], (seconds + 90) * 1000);
rec.battery.end = batt();
rec.recordExit = r.code;
rec.recordIssues = (r.out + r.err).split('\n').filter((l) => /\[(Error|Warning)\]/.test(l)).slice(0, 10);
const toc = xc(['export', '--input', TR, '--toc']);
if (toc.code !== 0) rec.error = `export --toc exit ${toc.code}`;
else {
  const names = [...toc.out.matchAll(/<device [^>]*?name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n.length > 2);
  const scrub = (x) => names.reduce((t, n) => t.split(n).join('<NAME>'), x);
  rec.toc = [...new Set([...toc.out.matchAll(/schema="([^"]+)"/g)].map((m) => m[1]))];
  const parsed = {};
  for (const s of SCHEMAS) {
    if (!rec.toc.includes(s)) continue;
    const ex = xc(['export', '--input', TR, '--xpath', `/trace-toc/run[@number="1"]/data/table[@schema="${s}"]`]);
    if (ex.code !== 0) { rec.error = `export ${s} exit ${ex.code}`; continue; }
    parsed[s] = readTable(scrub(ex.out));
    rec.tables[s] = { cols: parsed[s].cols, rows: parsed[s].rows.length };
  }
  rec.summary = summarize(parsed);
  writeFileSync(out.replace(/\.json$/, '') + '.tables.json', JSON.stringify(parsed));
}
if (r.code !== 0 && !rec.error) rec.error = `record exit ${r.code}`;
rmSync(TR, { recursive: true, force: true });
writeFileSync(out, JSON.stringify(rec));
console.log(`P100REC ${label} arm ${arm} record ${r.code} tables ${Object.entries(rec.tables).map(([k, t]) => `${k}:${t.rows}`).join(' ')} summary ${JSON.stringify(rec.summary ?? null)} batt ${rec.battery.start}->${rec.battery.end}${rec.error ? ` ERROR ${rec.error}` : ''}`);

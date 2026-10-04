// One diagnostic read of the 'Thermal State' table (iphone-runner, 2026-10-04): prints every row's fmt values,
// device id and LAN address redacted, so the gate's parser can be checked against what xctrace writes under
// Xcode's induced condition. Same xctrace record/export as thermal-gate.mjs; nothing judged, nothing kept.
//   node research/phone-thermal-gate/diag-rows.mjs [--raw]   (--raw also saves the redacted export to out/thermal-gate/)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../../tools/lib/wda-runner.mjs';
const OUT = join(process.cwd(), 'out', 'thermal-gate'); mkdirSync(OUT, { recursive: true });
const { udid } = readConfig(); if (!udid) { console.log('no device'); process.exit(1); }
const red = (s) => String(s || '').split(udid).join('<DEVICE>').replace(/\b(?:10|172|192)\.\d+\.\d+\.\d+\b/g, '<LAN>');
const xc = (args) => { const r = spawnSync('xcrun', ['xctrace', ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 << 20 }); return { code: r.status, out: red(r.stdout), err: red(r.stderr) }; };
const TR = join(OUT, `diag-${Date.now()}.trace`);
const rec = xc(['record', '--instrument', 'Thermal State', '--device', udid, '--all-processes', '--time-limit', '10s', '--output', TR, '--no-prompt']);
console.log(`record exit ${rec.code}`);
const ex = xc(['export', '--input', TR, '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="device-thermal-state-intervals"]']);
console.log(`export exit ${ex.code}`);
if (process.argv.includes('--raw')) { writeFileSync(join(OUT, 'diag-raw.xml'), ex.out); console.log(`raw export (redacted) -> out/thermal-gate/diag-raw.xml`); }
const rs = ex.out.split('<row').slice(1);
rs.forEach((r, i) => console.log(`row ${i}: ${JSON.stringify([...r.matchAll(/fmt="([^"]*)"/g)].map((m) => m[1]))}`));
const schema = ex.out.match(/<schema[\s\S]*?<\/schema>/);
if (schema) console.log(`schema cols: ${[...schema[0].matchAll(/<mnemonic>([^<]*)<\/mnemonic>/g)].map((m) => m[1]).join(', ')}`);
rmSync(TR, { recursive: true, force: true });

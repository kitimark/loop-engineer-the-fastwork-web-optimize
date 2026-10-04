#!/usr/bin/env node
// selftest.mjs: P-094 scorer checks on synthetic blocks built from ONE real W run file (fw-iphone-run/1, any page),
// run before any P-094 phone data. Each case writes 8 counted runs (block order C V V C C V V C) plus 2 warm-ups to a
// temp dir, runs fixes/rest-script/phone/score.mjs on them as a child process and checks the verdict.
// usage: node fixes/rest-script/phone/selftest.mjs <real W run.json>     -> "SELFTEST PASS n cases" exit 0 | FAIL exit 1
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.log('usage: selftest.mjs <real W run.json>'); process.exit(1); }
const base = JSON.parse(readFileSync(src, 'utf8'));
if (base?.meta?.driver !== 'W' || !base.marks?.hold) { console.log('need a W run with idle/scroll/hold marks'); process.exit(1); }
const HASH = { C: ['7bf7c4657d21f1e9', 'f523598b2a24ede8'], V: ['520d5f1139c74b55', 'f523598b2a24ede8'] };
const ORDER = ['C', 'V', 'V', 'C', 'C', 'V', 'V', 'C'];
const flat = (j) => { for (const f of j.frames) if (f[1] != null && f[1] > 30) f[1] = 16; return j; }; // 0 slow frames
const inWin = (j, a, b) => j.frames.map((f, k) => [f, k]).filter(([f]) => f[1] != null && f[0] >= a && f[0] < b).map(([, k]) => k);
// put n frames of dt ms inside [a, b) (spread over the window)
const slow = (j, n, dt, a, b) => { const ks = inWin(j, a, b); for (let i = 0; i < n; i++) j.frames[ks[Math.floor(((i + 0.5) * ks.length) / n)]][1] = dt; return j; };
function run(name, mutate, expect) {
  const dir = mkdtempSync(join(tmpdir(), 'p094-selftest-'));
  const args = [];
  const mk = (arm, label, warmup) => {
    const j = flat(structuredClone(base));
    j.meta = { ...j.meta, label, arm, warmup, error: null, lowPowerSuspect: false, settings: { ...(j.meta.settings || {}), lowPowerMode: false },
      served: { ...(j.meta.served || {}), '/_app/immutable/nodes/2.DyWL8TcE.js': HASH[arm][0], '/_app/immutable/assets/2.gBuqKVzi.css': HASH[arm][1] },
      sentinel: arm === 'C' && !warmup ? { driver: 'W', pass: true } : null };
    return j;
  };
  const list = [['C', 'wC', true], ['V', 'wV', true], ...ORDER.map((a, i) => [a, `${a}${i + 1}`, false])];
  for (const [arm, label, warmup] of list) {
    const j = mk(arm, label, warmup);
    mutate(j, { arm, label, pos: warmup ? 0 : Number(label.slice(1)) });
    const f = join(dir, `${label}.json`); writeFileSync(f, JSON.stringify(j)); args.push(`${arm}:${f}`);
  }
  const out = join(dir, 'score.json');
  const r = spawnSync(process.execPath, [join(here, 'score.mjs'), ...args, '--json', out], { encoding: 'utf8' });
  let got;
  try { got = JSON.parse(readFileSync(out, 'utf8')); } catch { got = null; }
  rmSync(dir, { recursive: true, force: true });
  const v = got?.gates?.framesTimed?.verdict ?? `no output (${(r.stderr || '').split('\n')[0]})`;
  const ok = typeof expect === 'function' ? expect(got, v) : v.startsWith(expect);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${v}`);
  return ok;
}
const M = base.marks;
const cases = [
  ['all equal -> hit', () => {}, 'hit'],
  ['V +3 frames > 50 in the idle phase -> FALSIFIED', (j, c) => { if (c.arm === 'V') slow(j, 3, 60, M.idle[0], M.idle[1]); }, 'FALSIFIED'],
  ['V +3 frames > 50 in the hold phase -> FALSIFIED', (j, c) => { if (c.arm === 'V') slow(j, 3, 60, M.hold[0], M.hold[1]); }, 'FALSIFIED'],
  ['V +2 frames > 50 in the scroll phase -> FALSIFIED', (j, c) => { if (c.arm === 'V') slow(j, 2, 60, M.scroll[0], M.scroll[1]); }, 'FALSIFIED'],
  ['V +1 frame > 50 -> hit', (j, c) => { if (c.arm === 'V') slow(j, 1, 60, M.hold[0], M.hold[1]); }, 'hit'],
  ['V +5 frames > 50 in the sentinel phase only (outside the window) -> hit', (j, c) => { if (c.arm === 'V') slow(j, 5, 60, M.sentinel[0], M.sentinel[1]); }, 'hit'],
  ['V +3 frames of 52 ms (> 50 and > 46, not > 54) -> FALSIFIED, threshold-sensitive', (j, c) => { if (c.arm === 'V') slow(j, 3, 52, M.idle[0], M.idle[1]); }, (g, v) => v.startsWith('FALSIFIED') && g.gates.framesTimed.thresholdSensitive === true],
  ['warm-ups slow -> skipped, hit', (j, c) => { if (c.pos === 0) slow(j, 9, 80, M.idle[0], M.hold[1]); }, 'hit'],
  ['C4 sentinel fails -> C4 and V2 V3 void (since C1 passed); n C 3, V 2 -> not enough', (j, c) => { if (c.label === 'C4') j.meta.sentinel.pass = false; }, 'not enough'],
  ['C8 sentinel no data -> C8 V6 V7 void; C 3, V 2 -> not enough', (j, c) => { if (c.label === 'C8') j.meta.sentinel = { driver: 'W', pass: null }; }, 'not enough'],
  ['V2 served the C hash -> void; V 3 left -> hit', (j, c) => { if (c.label === 'V2') j.meta.served['/_app/immutable/nodes/2.DyWL8TcE.js'] = HASH.C[0]; }, (g, v) => v === 'hit' && g.runs.find((r) => r.label === 'V2').void.some((x) => x.startsWith('served'))],
  ['V3 Low Power Mode -> void; hit', (j, c) => { if (c.label === 'V3') j.meta.settings.lowPowerMode = true; }, (g, v) => v === 'hit' && g.runs.find((r) => r.label === 'V3').void.includes('Low Power Mode')],
  ['C4 wrong hash AND failing sentinel -> still voids back to C1 (V2 V3 void)', (j, c) => { if (c.label === 'C4') { j.meta.served['/_app/immutable/nodes/2.DyWL8TcE.js'] = HASH.V[0]; j.meta.sentinel.pass = false; } }, (g) => ['V2', 'V3'].every((l) => g.runs.find((r) => r.label === l).void.length)],
  ['C4 Low Power with a passing sentinel -> void itself, resets (V2 V3 valid)', (j, c) => { if (c.label === 'C4') j.meta.lowPowerSuspect = true; }, (g) => g.runs.find((r) => r.label === 'C4').void.length && ['V2', 'V3'].every((l) => !g.runs.find((r) => r.label === l).void.length)],
  ['no hold mark -> void', (j, c) => { if (c.label === 'V6') delete j.marks.hold; }, (g) => g.runs.find((r) => r.label === 'V6').void.includes('no idle/scroll/hold marks')],
];
let pass = 0;
for (const [n, m, e] of cases) if (run(n, m, e)) pass++;
console.log(pass === cases.length ? `SELFTEST PASS ${pass} cases` : `SELFTEST FAIL ${cases.length - pass} of ${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);

#!/usr/bin/env node
// P-137o block 2 reader (written before data; fixes/end-bg/README.md "P-137o"; lead decision 2026-10-11). Three arms on
// the fs-fixed script: O = the original, C = v9-final + morph-scroll 7d with pictures (P-137's C), V = C without the
// background pictures (P-137's V). A pure reader: no device.
//   node fixes/end-bg/phone/p137f-read.mjs <folder> [--bridge <part-1 runs folder>] [--json out.json]
// Validity: p137f-gates.mjs (P-129's readRun G1-G5, G6 against fs-fixed); a re-run <run>r replaces an INVALID first try.
// Sentinels S0/S1 on C: S fps >= 50 and slow share <= 0.06 (P-129's rule); a failed sentinel makes the result VOID.
// READING (2), primary (the lead's): every recorded frame, moving or not, from mark E20 to mark done whose last touch event
//   before it is a touchend (the finger is up). Why not P-137's metric: the original pins the page at the end and opens
//   and closes the menu with its own handlers, so its scrollY does not move there and a moving-frames count cannot see it.
//   Per run: n, s(th) for dt > 30/34/38 (the >34 line and twins) and > 46/50/54, and the window length in s.
//   Pairs C vs O, V vs O, V vs C, per-run >34 counts (>= 3 valid runs per arm, else THIN): BETTER = max(new) < min(old)
//   ("BETTER, median <= half" when median(new) <= 0.5 median(old)), WORSE = min(new) > max(old), OVERLAP otherwise; a twin
//   (>30, >38) with another word: "threshold-sensitive"; >50 with twins reported the same way.
// READING (1), bridge for C and V only: P-137's own metric (p137-read.mjs metric(): moving lastScreen-band frames after a
//   touchend) on today's C and V runs, next to 5 Oct's P-137 counts (C 30/17/14/15, V 2/3/3/5) and, with --bridge, part 1's
//   C runs on the unchanged fs-v1 (EC1, EC2; P-129's gates unchanged there). Descriptive.
// HEAT: per run the start/end state, battery °C and condition holder from meta.profile.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { metric } = await import(pathToFileURL(join(here, 'p137-read.mjs')).href);
const { gateRun } = await import(pathToFileURL(join(here, 'p137f-gates.mjs')).href);
export const TH = [30, 34, 38, 46, 50, 54];
const OCT5 = { C: [30, 17, 14, 15], V: [2, 3, 3, 5] };
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function rule(old, neu, min = 3) {
  if (old.length < min || neu.length < min) return 'THIN';
  if (Math.max(...neu) < Math.min(...old)) return med(neu) <= 0.5 * med(old) ? 'BETTER, median <= half' : 'BETTER';
  if (Math.min(...neu) > Math.max(...old)) return 'WORSE';
  return 'OVERLAP';
}
/** Reading (2) on one run record. */
export function upFrames(g) {
  const seg = g.run.segments[0], fr = seg.frames, tc = seg.touches || [];
  const mk = Object.fromEntries((seg.marks || []).map(([t, n]) => [n.split('-')[0], t]));
  const t0 = mk.E20, t1 = mk.done;
  if (t0 == null || t1 == null) return { error: 'no E20/done mark' };
  const dts = [];
  for (const f of fr) {
    if (f[0] < t0 || f[0] > t1) continue;
    let last = null; for (const e of tc) { if (e[0] <= f[0]) last = e; else break; }
    if (last && last[1] === 'e') dts.push(f[1]);
  }
  return { n: dts.length, windowS: Math.round((t1 - t0) / 100) / 10, s: Object.fromEntries(TH.map((th) => [th, dts.filter((d) => d > th).length])) };
}
const heatOf = (g) => { const p = g.meta?.profile || {}, s = p.start || {}, e = p.end || {}; return `${s.state ?? '?'} ${s.battC ?? '?'} -> ${e.state ?? '?'} ${e.battC ?? '?'} (${e.holder || s.holder || '?'})`; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-bg/phone/p137f-read.mjs <folder> [--bridge <folder>] [--json out.json]'); process.exit(a[0] ? 0 : 2); }
  const dir = a[0], opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null), jsonOut = opt('--json'), bridge = opt('--bridge');
  const load = (d, f) => (existsSync(join(d, f)) ? JSON.parse(readFileSync(join(d, f), 'utf8')) : null);
  const out = { sentinels: {}, runs: {}, invalid: {}, per: { O: [], C: [], V: [] }, bridge1: { C: [], V: [] } };
  for (const s of ['S0', 'S1']) { const g = load(dir, `g-${s}.json`); const r = g ? gateRun(g, null, 'S') : null;
    out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel, why: r.why } : { sentinel: 'FAIL (no record)' }; }
  for (const arm of ['O', 'C', 'V']) for (let k = 1; k <= 3; k++) {
    const base = `E${arm}${k}`; let used = null;
    for (const name of [base, `${base}r`]) {
      const g = load(dir, `g-${name}.json`), tl = load(dir, `tl-${name}.json`);
      if (!g) continue;
      const r = gateRun(g, tl, 'E');
      if (r.why.length) { out.invalid[name] = r.why; continue; }
      used = name; const u = upFrames(g);
      if (u.error) { out.invalid[name] = [u.error]; used = null; continue; }
      const m1 = metric(g, r);
      out.runs[name] = { arm, idle: r.idle, up: u, p137: { n: m1.n, s: m1.s }, heat: heatOf(g) };
      out.per[arm].push(u); if (arm !== 'O') out.bridge1[arm].push(m1.s[34]); break;
    }
    if (!used) out.invalid[base] ||= ['no valid try'];
  }
  const col = (arm, th) => out.per[arm].map((u) => u.s[th]);
  const pair = (old, neu) => {
    const w = Object.fromEntries(TH.map((th) => [th, rule(col(old, th), col(neu, th))]));
    return { '>34': w[34] + (w[30] !== w[34] || w[38] !== w[34] ? ' [threshold-sensitive]' : ''), twins: { '>30': w[30], '>38': w[38] }, gt50: { '>46': w[46], '>50': w[50], '>54': w[54] } };
  };
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.medians = Object.fromEntries(['O', 'C', 'V'].map((arm) => [arm, Object.fromEntries([...TH.map((th) => [`>${th}`, med(col(arm, th))]), ['n', med(out.per[arm].map((u) => u.n))], ['windowS', med(out.per[arm].map((u) => u.windowS))]])]));
  out.result = sentOk ? { 'C vs O': pair('O', 'C'), 'V vs O': pair('O', 'V'), 'V vs C': pair('C', 'V') } : 'VOID (a sentinel failed or is missing)';
  out.reading1 = { today: { C: out.bridge1.C, V: out.bridge1.V }, oct5: OCT5, C: rule(OCT5.C, out.bridge1.C, 2), V: rule(OCT5.V, out.bridge1.V, 2), note: 'OVERLAP = within 5 Oct spread; script differs (fs-fixed vs fs-v1)' };
  if (bridge) {
    const b = [];
    for (const name of ['EC1', 'EC2', 'EC3', 'EC4']) { const g = load(bridge, `g-${name}.json`), tl = load(bridge, `tl-${name}.json`); if (!g) continue;
      const r = readRun(g, tl, 'E'); if (r.why.length) { b.push({ name, invalid: r.why }); continue; } const m = metric(g, r); b.push({ name, n: m.n, s34: m.s[34], s: m.s, heat: heatOf(g) }); }
    const v = b.filter((x) => x.s34 != null).map((x) => x.s34);
    out.bridgeFsV1 = { runs: b, oct5C: OCT5.C, reading: rule(OCT5.C, v, 2) };
  }
  console.log(`P-137o (block 2, fs-fixed) read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(`  ${n} (${r.arm}) up n ${r.up.n} in ${r.up.windowS} s ${TH.map((th) => `>${th} ${r.up.s[th]}`).join(' ')} | P-137 metric n ${r.p137.n} >34 ${r.p137.s[34]} | idle ${r.idle} | heat ${r.heat}`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${[].concat(w).join('; ')}`);
  console.log(`MEDIANS ${JSON.stringify(out.medians)}`);
  console.log(`RESULT (reading 2) ${JSON.stringify(out.result)}`);
  console.log(`READING 1 (P-137 metric, C/V) ${JSON.stringify(out.reading1)}`);
  if (out.bridgeFsV1) console.log(`BRIDGE fs-v1 C (part 1) ${JSON.stringify(out.bridgeFsV1)}`);
  delete out.per; delete out.bridge1;
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

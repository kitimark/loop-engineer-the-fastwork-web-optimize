#!/usr/bin/env node
// A-card reader (fix-end-morph-p1; card: fixes/end-morph-p1b-a/README.md "Phone card", written before any data; the lead
// signs it). C (the landing base's control) vs A = C + P1 + P1b (a). A pure reader: no device, no measurement.
//   node fixes/end-morph-p1/phone/pA-read.mjs <folder> [--json out.json]      (folder: out/pA/runs)
//   node fixes/end-morph-p1/phone/pA-read.mjs --selftest
// RUNS: part A (g-fastshort-v1) counted EC1-EC4, EA1-EA4; part B (g-park30-v1) counted BC1, BC2, BA1, BA2; sentinels S0,
//   S1 on C (g- only). g-<run>.json (+ tl-<run>.json when the runner captures Timeline). A re-run <run>r replaces its run
//   only when the first try is INVALID (P-153's rule). A run counts only when its hold's log (hold-<H>.log next to the
//   runs folder) ends "HOLD <H> VALID" (P-153 rev 1.2's holdStatus). Per run: P-129's readRun (role E) for the run gates
//   and the moving-frame rows. Shared functions are imported from p153-read.mjs (same folder), not copied.
// METRICS
//   First open (Pr1): P-153's FIRST OPEN, O1 = the first open after load; f1, f2, f3 (= f123 - f12) and f123.
//   End zone (Pr2): P-153's metric and rule (decideNoWorse: separation, or a median bound with permutation p <= 0.05).
//   CB34 / CB50 (Pr3): P-155's closing band (fix-end-morph's fixes/end-morph-f12/phone/p155-read.mjs closingBand, copied:
//     that file is not on main): moving lastScreen frames going down, 0.2 <= m < 0.55, m = (y - (docH - 2 ih)) / ih.
//   Part B (Pr4): CBp34 / CBp50 = the closing band restricted to frames after a "P<k>-close-*" mark and before the next
//     mark; the run's value is the sum over its closes. Op.f2 = f2 of the first open (P-153's opens()) after each
//     "P<k>-open-*" mark and before the next mark; the run's value is the median over its opens.
//   Census (descriptive, decides nothing alone): part A's moving frames binned by scrollY / 250; per bin and run the
//     count over 34 and over 50 ms and the median dt. A bin is flagged "worse" when the median over runs of A - C is
//     >= +1 frame over 34 ms, or >= +1 frame over 50 ms, or the median dt is >= +8.33 ms (one Chrome tick, disclosed:
//     the phone has no ticks).
//   Heat (descriptive): battery °C at the hold's start (meta.profile.start.battC), and the thermal state when recorded.
// PREDICTIONS (fixed before data):
//   Pr1: median A O1.f2 - median C O1.f2 <= +2 ms.
//   Pr2: end zone NO-WORSE PASS (P-153's rule).
//   Pr3: median CB34 A - C <= +3.
//   Pr4: median CBp34 A - C <= +2 AND median Op.f2 A - C <= +2 ms.
//   An arm with fewer than 3 valid part-A runs: INSUFFICIENT for Pr1-Pr3; fewer than 2 valid part-B runs: INSUFFICIENT for
//   Pr4. A missing or failed sentinel: VOID.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { endZone, decideNoWorse, holdStatus, opens, firstOpen, firstOpenSummary, TH } = await import(pathToFileURL(join(here, 'p153-read.mjs')).href);
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const BOUNDS = { f2: 2, cb34: 3, cbp34: 2, opf2: 2 };
/** g-park30-v1's compiled program hash (gesture --dry-run GESTURE_HASH). */
export const PARK_HASH = '6f9209453750';
/** P-129's run gates (role E); part B runs carry g-park30-v1, so its G6 (the fs hash) is replaced by the park30 hash. */
export function gateRun(g, tl, part) {
  const r = readRun(g, tl, 'E');
  if (part === 'B') {
    r.why = r.why.filter((w) => !w.startsWith('G6'));
    if (!String(g?.program?.hash || '').startsWith(PARK_HASH)) r.why.push(`G6 script hash ${String(g?.program?.hash || 'none').slice(0, 12)} is not park30 ${PARK_HASH}`);
  }
  return r;
}
export const BIN = 250, TICK = 1000 / 120;

/** P-155's morph value (copied): frames are [t, dt, scrollY, innerHeight]. */
export function mOf(seg, i) { const fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0; const [, , y, ih] = fr[i]; return (y - (docH - 2 * ih)) / ih; }
/** P-155's closing band (copied), optionally limited to frame times in [from, to). */
export function closingBand(seg, rows, from = -Infinity, to = Infinity) {
  const fr = seg.frames;
  const cb = rows.filter((x) => x.band === 'lastScreen' && x.i > 0 && fr[x.i][2] < fr[x.i - 1][2] && fr[x.i][0] >= from && fr[x.i][0] < to)
    .filter((x) => { const m = mOf(seg, x.i); return m >= 0.2 && m < 0.55; });
  return { n: cb.length, s34: cb.filter((x) => x.dt > 34).length, s50: cb.filter((x) => x.dt > 50).length };
}
/** Windows [mark time, next mark time) of the marks whose name matches re. */
export function markWindows(seg, re) {
  const mk = [...(seg.marks || [])].sort((a, b) => a[0] - b[0]);
  return mk.map((m, k) => ({ name: m[1], from: m[0], to: k + 1 < mk.length ? mk[k + 1][0] : Infinity })).filter((w) => re.test(w.name));
}
/** Part B of one run: the closes and opens after a park. */
export function parkMetrics(g, r) {
  const seg = g.run.segments[0];
  const closes = markWindows(seg, /^P\d+-close-/).map((w) => ({ name: w.name, ...closingBand(seg, r.rows, w.from, w.to) }));
  const op = opens(g);
  const opensAfter = markWindows(seg, /^P\d+-open-/).map((w) => { const o = op.find((x) => x.t >= w.from && x.t < w.to); return { name: w.name, f2: o ? o.f2 : null, f1: o ? o.f1 : null }; });
  return { closes, cbp34: closes.reduce((s, c) => s + c.s34, 0), cbp50: closes.reduce((s, c) => s + c.s50, 0), opens: opensAfter, opf2: med(opensAfter.map((o) => o.f2)) };
}
/** Census of one run: moving frames per 250 px bin. */
export function census(g, r) {
  const fr = g.run.segments[0].frames, out = {};
  for (const x of r.rows) { const b = Math.floor(fr[x.i][2] / BIN); (out[b] ||= []).push(x.dt); }
  return Object.fromEntries(Object.entries(out).map(([b, d]) => [b, { n: d.length, s34: d.filter((v) => v > 34).length, s50: d.filter((v) => v > 50).length, medDt: med(d) }]));
}
/** Census diff over runs: bins where A is worse than C (decides nothing). */
export function censusDiff(cs, as) {
  const bins = new Set([...cs, ...as].flatMap((c) => Object.keys(c))), out = [];
  for (const b of [...bins].sort((p, q) => p - q)) {
    const get = (arr, k) => arr.map((c) => (c[b] ? c[b][k] : 0));
    const d34 = med(get(as, 's34')) - med(get(cs, 's34')), d50 = med(get(as, 's50')) - med(get(cs, 's50'));
    const dDt = med(as.map((c) => c[b]?.medDt ?? null)) != null && med(cs.map((c) => c[b]?.medDt ?? null)) != null ? med(as.map((c) => c[b]?.medDt ?? null)) - med(cs.map((c) => c[b]?.medDt ?? null)) : null;
    const worse = d34 >= 1 || d50 >= 1 || (dDt != null && dDt >= TICK - 1e-9);
    out.push({ bin: Number(b), y: `${b * BIN}-${(Number(b) + 1) * BIN}`, d34, d50, dDt: dDt == null ? null : Math.round(dDt * 10) / 10, worse });
  }
  return { bins: out, worse: out.filter((x) => x.worse).map((x) => x.y) };
}
/** Predictions from per-arm lists. */
export function decide({ foC, foA, ezC, ezA, cbC, cbA, pbC, pbA, sentOk }) {
  if (!sentOk) return { result: 'VOID (a sentinel failed or is missing)' };
  const out = {};
  const enoughA = foC.length >= 3 && foA.length >= 3;
  const F = firstOpenSummary(foC, foA);
  out.Pr1 = !enoughA ? 'INSUFFICIENT' : F.f2.diff == null ? 'NOT READ (no open in an arm)' : F.f2.diff <= BOUNDS.f2 + 1e-12 ? `holds (f2 A - C ${F.f2.diff} ms)` : `FAILS (f2 A - C ${F.f2.diff} ms > +${BOUNDS.f2})`;
  const nw = decideNoWorse(ezC, ezA);
  out.Pr2 = nw.result === 'NO-WORSE PASS' ? 'holds (NO-WORSE PASS)' : nw.result.startsWith('INSUFFICIENT') ? 'INSUFFICIENT' : `FAILS (${nw.result})`;
  const d3 = enoughA ? med(cbA) - med(cbC) : null;
  out.Pr3 = !enoughA ? 'INSUFFICIENT' : d3 <= BOUNDS.cb34 + 1e-12 ? `holds (CB34 A - C ${d3})` : `FAILS (CB34 A - C ${d3} > +${BOUNDS.cb34})`;
  if (pbC.length < 2 || pbA.length < 2) out.Pr4 = 'INSUFFICIENT';
  else {
    const dc = med(pbA.map((p) => p.cbp34)) - med(pbC.map((p) => p.cbp34)), dof = med(pbA.map((p) => p.opf2)) != null && med(pbC.map((p) => p.opf2)) != null ? med(pbA.map((p) => p.opf2)) - med(pbC.map((p) => p.opf2)) : null;
    const ok = dc <= BOUNDS.cbp34 + 1e-12 && dof != null && dof <= BOUNDS.opf2 + 1e-12;
    out.Pr4 = `${ok ? 'holds' : dof == null ? 'NOT READ (no open after a park in an arm)' : 'FAILS'} (CBp34 A - C ${dc}, Op.f2 A - C ${dof} ms)`;
  }
  const fails = ['Pr1', 'Pr2', 'Pr3', 'Pr4'].filter((k) => out[k].startsWith('FAILS'));
  const insuff = ['Pr1', 'Pr2', 'Pr3', 'Pr4'].filter((k) => !out[k].startsWith('holds') && !out[k].startsWith('FAILS'));
  out.result = fails.length ? `FAIL ${fails.join(', ')}` : insuff.length ? `INCOMPLETE (${insuff.join(', ')} not read)` : 'PASS (Pr1-Pr4 hold)';
  out.firstOpen = F; out.noWorse = nw;
  return out;
}
function selftest() {
  let n = 0;
  const ok = (a, b, m) => { n++; if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  // closing band: ih 800, docH 6800 -> m = (y - 5200) / 800; going down frames at m 0.6, 0.5, 0.3, 0.1
  const seg = { docH: 6800, frames: [[0, 16, 6000, 800], [16, 16, 5680, 800], [56, 40, 5600, 800], [116, 60, 5440, 800], [132, 16, 5280, 800]], marks: [[10, 'P1-close-120px-60ms'], [100, 'P2-park-closed-30s']] };
  const rows = [1, 2, 3, 4].map((i) => ({ i, dt: seg.frames[i][1], band: 'lastScreen' }));
  const cb = closingBand(seg, rows);
  ok(`${cb.n} ${cb.s34} ${cb.s50}`, '2 2 1', 'closing band: m 0.5 (dt 40) and 0.3 (dt 60) in, m 0.6 and 0.1 out');
  const cbw = closingBand(seg, rows, 10, 100);
  ok(`${cbw.n} ${cbw.s34}`, '1 1', 'closing band limited to the mark window [10, 100)');
  ok(markWindows(seg, /^P\d+-close-/).map((w) => `${w.from}-${w.to}`).join(','), '10-100', 'mark window ends at the next mark');
  // part B: an open after a park mark
  const g = { run: { segments: [{ docH: 6800, frames: [[0, 16, 5000, 800], [16, 16, 5100, 800], [500, 16, 5100, 800], [540, 40, 5300, 800], [570, 30, 5500, 800], [586, 16, 5600, 800]], marks: [[400, 'P2-open-120px-60ms']] }] } };
  const pm = parkMetrics(g, { rows: [] });
  ok(`${pm.opens.length} ${pm.opens[0].f1} ${pm.opens[0].f2} ${pm.opf2}`, '1 40 30 30', 'part B: f2 of the first open after the open mark');
  // census
  const gc = { run: { segments: [{ frames: [[0, 16, 100, 800], [16, 40, 300, 800], [32, 60, 320, 800]] }] } };
  const c1 = census(gc, { rows: [{ i: 0, dt: 16 }, { i: 1, dt: 40 }, { i: 2, dt: 60 }] });
  ok(`${c1[0].n} ${c1[1].n} ${c1[1].s34} ${c1[1].s50}`, '1 2 2 1', 'census bins by 250 px');
  const C = { 0: { n: 10, s34: 1, s50: 0, medDt: 16 } }, A = { 0: { n: 10, s34: 2, s50: 0, medDt: 17 } };
  ok(censusDiff([C, C, C], [A, A, A]).worse.join(','), '0-250', 'census: +1 frame over 34 ms flags the bin');
  ok(censusDiff([C, C, C], [C, C, C]).worse.length, 0, 'census: A/A flags nothing');
  // decisions
  const fo = (f2) => ({ o1: { f1: 16, f2, f12: 16 + f2, f123: 32 + f2 }, repeatFullF2Median: null });
  const ez = (s34, s50 = 1) => ({ n: 300, s: { 30: s34 + 3, 34: s34, 38: Math.max(0, s34 - 3), 46: s50 + 1, 50: s50, 54: s50 } });
  const pb = (cbp34, opf2) => ({ cbp34, opf2 });
  const base = { foC: [fo(31), fo(30), fo(33), fo(31)], ezC: [ez(20), ez(21), ez(19), ez(22)], cbC: [11, 10, 11, 16], pbC: [pb(2, 30), pb(3, 31)], sentOk: true };
  ok(decide({ ...base, foA: [fo(32), fo(31), fo(32), fo(30)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(1, 31), pb(2, 30)] }).result, 'PASS (Pr1-Pr4 hold)', 'all four hold');
  ok(decide({ ...base, foA: [fo(41), fo(40), fo(45), fo(38)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(1, 31), pb(2, 30)] }).result, 'FAIL Pr1', 'P-153-like first open fails Pr1 only');
  ok(decide({ ...base, foA: [fo(32), fo(31), fo(32), fo(30)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [15, 14, 16, 17], pbA: [pb(1, 31), pb(2, 30)] }).result, 'FAIL Pr3', 'CB34 +4.5 fails Pr3');
  ok(decide({ ...base, foA: [fo(32), fo(31), fo(32), fo(30)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(6, 31), pb(7, 30)] }).result, 'FAIL Pr4', 'CBp34 +4 after a park fails Pr4');
  ok(decide({ ...base, foA: [fo(32), fo(31), fo(32), fo(30)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(1, 31)] }).result, 'INCOMPLETE (Pr4 not read)', 'one valid part-B run in A: Pr4 not read');
  ok(decide({ ...base, foA: [fo(32), fo(31)], ezA: [ez(18), ez(19)], cbA: [4, 5], pbA: [pb(1, 31), pb(2, 30)] }).result, 'INCOMPLETE (Pr1, Pr2, Pr3 not read)', 'two valid part-A runs in A: Pr1-Pr3 not read');
  // gates: part B swaps G6's program hash
  const gp = (h) => ({ program: { hash: h }, run: { segments: [{ frames: [] }] } });
  ok(gateRun(gp('6f9209453750aa'), null, 'B').why.some((w) => w.startsWith('G6')), false, 'part B: the park30 hash passes G6');
  ok(gateRun(gp('8737f212c0ffaa'), null, 'B').why.some((w) => w.startsWith('G6') && w.includes('park30')), true, 'part B: the fs hash fails G6');
  ok(gateRun(gp('6f9209453750aa'), null, 'E').why.some((w) => w.startsWith('G6')), true, 'part A: the park30 hash fails G6 (fs pinned)');
  ok(decide({ ...base, sentOk: false }).result, 'VOID (a sentinel failed or is missing)', 'sentinel VOID first');
  ok(decide({ ...base, foA: [fo(33), fo(33), fo(33), fo(33)], ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(1, 31), pb(2, 30)] }).Pr1, 'holds (f2 A - C 2 ms)', 'f2 +2 ms exactly holds');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log('usage: node fixes/end-morph-p1/phone/pA-read.mjs <folder> [--json out.json] | --gates <folder> <run>... | --selftest'); process.exit(a[0] ? 0 : 2); }
  // the runner's per-run gate check for part B runs (B<arm><n>[r]): gate lines only, no numbers (p129-gates.mjs's format)
  if (a[0] === '--gates') {
    const [dir, ...runs] = a.slice(1); let bad = 0;
    const ld = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
    for (const run of runs) {
      const g = ld(`g-${run}.json`);
      if (!g) { console.log(`GATES ${run} E INVALID no record g-${run}.json`); bad++; continue; }
      const r = gateRun(g, ld(`tl-${run}.json`), run[0] === 'B' ? 'B' : 'E');
      if (r.why.length) { bad++; console.log(`GATES ${run} E INVALID ${r.why.join('; ')}`); } else console.log(`GATES ${run} E ok idle ${r.idle}`);
    }
    process.exit(bad ? 1 : 0);
  }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const base = dirname(dir.replace(/\/+$/, '')), logs = {};
  for (const f of existsSync(base) ? readdirSync(base) : []) { const m = f.match(/^hold-(H[0-9A]+)\.log$/); if (m) logs[m[1]] = readFileSync(join(base, f), 'utf8'); }
  const hs = holdStatus(logs), holdWhy = (item) => (!hs[item] ? 'in no hold log' : hs[item].valid ? null : hs[item].why);
  const out = { sentinels: {}, runs: {}, invalid: {}, holds: Object.fromEntries(Object.keys(logs).sort().map((h) => [h, (logs[h].match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || ['no HOLD line']).pop()])) };
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const hw = g ? holdWhy(s) : null; const r = g && !hw ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: hw ? `FAIL (${hw})` : 'FAIL (no record)' }; }
  const L = { foC: [], foA: [], ezC: [], ezA: [], cbC: [], cbA: [], pbC: [], pbA: [], csC: [], csA: [] };
  const take = (name) => { for (const nm of [name, `${name}r`]) { const g = load(`g-${nm}.json`), tl = load(`tl-${nm}.json`); if (!g) continue; const hw = holdWhy(nm); if (hw) { out.invalid[nm] = [hw]; continue; } const r = gateRun(g, tl, nm[0] === 'B' ? 'B' : 'E'); if (r.why.length) { out.invalid[nm] = r.why; continue; } return { nm, g, r }; } out.invalid[name] ||= ['no valid try']; return null; };
  for (const arm of ['C', 'A']) for (let k = 1; k <= 4; k++) {
    const t = take(`E${arm}${k}`); if (!t) continue;
    const ez = endZone(t.r), fo = firstOpen(t.g), cb = closingBand(t.g.run.segments[0], t.r.rows), cs = census(t.g, t.r);
    out.runs[t.nm] = { part: 'A', arm, endZone: ez, firstOpen: fo.o1, cb34: cb.s34, cb50: cb.s50, start: t.g.meta?.date ?? null, battC: t.g.meta?.profile?.start?.battC ?? null, thermal: t.g.meta?.profile?.start?.thermal ?? null };
    L[`fo${arm}`].push(fo); L[`ez${arm}`].push(ez); L[`cb${arm}`].push(cb.s34); L[`cs${arm}`].push(cs);
  }
  for (const arm of ['C', 'A']) for (let k = 1; k <= 2; k++) {
    const t = take(`B${arm}${k}`); if (!t) continue;
    const pm = parkMetrics(t.g, t.r);
    out.runs[t.nm] = { part: 'B', arm, ...pm, start: t.g.meta?.date ?? null, battC: t.g.meta?.profile?.start?.battC ?? null, thermal: t.g.meta?.profile?.start?.thermal ?? null };
    L[`pb${arm}`].push(pm);
  }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.decision = decide({ ...L, sentOk });
  out.census = censusDiff(L.csC, L.csA);
  out.cb = { C: L.cbC, A: L.cbA, CB50: { C: Object.values(out.runs).filter((r) => r.part === 'A' && r.arm === 'C').map((r) => r.cb50), A: Object.values(out.runs).filter((r) => r.part === 'A' && r.arm === 'A').map((r) => r.cb50) } };
  console.log(`A-card read: sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) console.log(r.part === 'A'
    ? `  ${n} (${r.arm}) start ${r.start} batt ${r.battC ?? '-'} C ${r.thermal ?? ''} | end zone n ${r.endZone.n} >34 ${r.endZone.s[34]} >50 ${r.endZone.s[50]} | CB34 ${r.cb34} CB50 ${r.cb50} | O1 f1 ${r.firstOpen?.f1 ?? '-'} f2 ${r.firstOpen?.f2 ?? '-'} f3 ${r.firstOpen?.f123 != null ? r.firstOpen.f123 - r.firstOpen.f12 : '-'} f123 ${r.firstOpen?.f123 ?? '-'} ms`
    : `  ${n} (${r.arm}) start ${r.start} batt ${r.battC ?? '-'} C ${r.thermal ?? ''} | CBp34 ${r.cbp34} CBp50 ${r.cbp50} (${r.closes.map((c) => `${c.name} ${c.s34}/${c.n}`).join(', ')}) | Op.f2 ${r.opf2 ?? '-'} (${r.opens.map((o) => `${o.name} ${o.f2 ?? '-'}`).join(', ')})`);
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`HOLDS ${JSON.stringify(out.holds)}`);
  const D = out.decision;
  console.log(`DECISION ${D.result}`);
  for (const k of ['Pr1', 'Pr2', 'Pr3', 'Pr4']) if (D[k]) console.log(`  ${k} ${D[k]}`);
  if (D.firstOpen) { const F = D.firstOpen, d = (k) => `${k} C ${F[k].C ? `${F[k].C.median} (${F[k].C.min}-${F[k].C.max})` : '-'} A ${F[k].V ? `${F[k].V.median} (${F[k].V.min}-${F[k].V.max})` : '-'} diff ${F[k].diff ?? '-'}`; console.log(`FIRST OPEN ${d('f2')} | ${d('f1')} | ${d('f12')} | ${d('f123')}`); }
  console.log(`CENSUS (250 px bins; decides nothing alone) worse: ${out.census.worse.join(', ') || 'none'}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

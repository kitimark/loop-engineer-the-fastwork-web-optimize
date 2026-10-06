#!/usr/bin/env node
// v10 no-worse check (int-v8, lead 2026-10-06 15:36Z): a copy of fix-end-morph-p1's fixes/end-morph-p1/phone/pA-read.mjs
// (rev 2, credited) that also knows the base "v10" (C = main's rev 7d C 1b2eecc66011 / e1359ab9994a, A = v10 + CM's V
// a33a6c7c1f2b / 62743920fe1a; holds from fixes/v10/phone/nw-hold.sh, start line "(v10cm-nw)"). Metrics, predictions and
// gates are unchanged. Part A only in this check, so Pr4 (part B) reads INSUFFICIENT by design. Original header:
// A-card reader (fix-end-morph-p1; card: fixes/end-morph-p1b-a/README.md "Phone card", written before any data; the lead
// signs it). C (the landing base's control) vs A = C + P1 + P1b (a). A pure reader: no device, no measurement.
//   node fixes/end-morph-p1/phone/pA-read.mjs <folder> --base 1|0 [--json out.json]      (folder: out/p156/runs)
//   node fixes/end-morph-p1/phone/pA-read.mjs --gates <folder> <run>...                  (the runner's per-run gate lines)
//   node fixes/end-morph-p1/phone/pA-read.mjs --selftest
// REV 2 (the lead's FIX-FIRST list after ops-reader-P156, 2026-10-06 10:15Z): close and open windows end at the next
//   touchstart after the window's own stroke; Pr4's two parts decide separately (a CBp34 miss fails Pr4 alone; Op.f2
//   needs a value in every valid part-B run of each arm, else NOT READ); `med` returns null when any value is missing
//   (no silent drop); park gates G7 on part B runs; the base and pin check of every hold log (--base); bounds Pr1 and
//   Op.f2 +4 ms (the phone minShift); Pr1 needs >= 3 first opens per arm; the census flags on frame counts only;
//   descriptive: heat at each run's hold start and end, busy/busyRF/cls of the O1.f2 frame and of the CB frames over
//   34 ms, f123 next to f2, Pr2's threshold-sensitive flag.
// RUNS: part A (g-fastshort-v1) counted EC1-EC4, EA1-EA4; part B (g-park30-v1) counted BC1, BC2, BA1, BA2; sentinels S0,
//   S1 on C (g- only); the uncounted pilot PC (park30 on C, read only by --gates). g-<run>.json (+ tl-<run>.json when the
//   runner captures Timeline). A re-run <run>r replaces its run only when the first try is INVALID (P-153's rule). A run
//   counts only when its hold's log (hold-<H>.log next to the runs folder) ends "HOLD <H> VALID" (P-153 rev 1.2's
//   holdStatus). Per run: P-129's readRun (role E) for the run gates and the moving-frame rows. Shared functions are
//   imported from p153-read.mjs (same folder), not copied.
// BASE (rev 2): --base names the base written into the P-156 ledger before H1 (1 = B1 if P-155 lands U2, else 0 = B0).
//   Every hold log's start line must say "base <that>", and every hold log with a RUN line must carry the SERVED line of
//   that base's pins (PINS below). Any miss: the block is VOID.
// PARK GATES (rev 2, part B runs only; G7, a run gate like G1-G6): for each "P<k>-park-*" mark, the frames from the mark
//   to the next mark (plus the last frame before the mark): no moving frame (scrollY equal to the previous frame's),
//   and m (opens()' form, lvh = the run's largest innerHeight) >= 0.99 at the open parks (P1, P3), <= 0 at the closed
//   park (P2). All three parks must be present.
// METRICS
//   First open (Pr1): P-153's FIRST OPEN, O1 = the first open after load; f1, f2, f3 (= f123 - f12) and f123.
//   End zone (Pr2): P-153's metric and rule (decideNoWorse: separation, or a median bound with permutation p <= 0.05).
//   CB34 / CB50 (Pr3): P-155's closing band (fix-end-morph's fixes/end-morph-f12/phone/p155-read.mjs closingBand, copied:
//     that file is not on main): moving lastScreen frames going down, 0.2 <= m < 0.55, m = (y - (docH - 2 ih)) / ih.
//   Part B (Pr4): CBp34 / CBp50 = the closing band restricted to the window of each "P<k>-close-*" mark: from the mark to
//     the next touchstart after the close's own stroke (the first touchstart at or after the mark), or the end of the
//     record; so the 450 px drag-close that follows P1's re-approach (no park before it) is outside. The run's value is
//     the sum over its closes. Op.f2 = f2 of the first open (P-153's opens()) in each "P<k>-open-*" window (the same
//     window rule); the run's value is the median over its opens, null when any of its open windows has no open.
//   Census (descriptive, decides nothing alone): part A's moving frames binned by scrollY / 250; per bin and run the
//     count over 34 and over 50 ms and the median dt. A bin is flagged "worse" when the median over runs of A - C is
//     >= +1 frame over 34 ms or >= +1 frame over 50 ms (rev 2: no dt-tick criterion on the phone; the median dt
//     difference is printed only).
//   Heat (descriptive): battery °C and thermal state at the run's hold start and end gates (meta.profile.start / end).
//   Work (descriptive): busy, busyRF and cls (P-129's gapWork / classify) of the O1.f2 frame and of each CB frame over 34.
// PREDICTIONS (fixed before data):
//   Pr1: median A O1.f2 - median C O1.f2 <= +4 ms (rev 2; was +2), read on >= 3 first opens per arm; a valid run with
//     no first open is named, never dropped silently.
//   Pr2: end zone NO-WORSE PASS (P-153's rule); its threshold-sensitive flag is printed.
//   Pr3: median CB34 A - C <= +3.
//   Pr4: median CBp34 A - C <= +2 (a miss fails Pr4 by itself) AND median Op.f2 A - C <= +4 ms (rev 2; was +2; NOT READ
//     when a valid part-B run of either arm has no Op.f2).
//   An arm with fewer than 3 valid part-A runs: INSUFFICIENT for Pr1-Pr3; fewer than 2 valid part-B runs: INSUFFICIENT for
//   Pr4. A missing or failed sentinel, or a base or pin miss: VOID.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { readRun } = await import(pathToFileURL(join(root, 'research', 'serious-heat', 'p129-read.mjs')).href);
const { endZone, decideNoWorse, holdStatus, opens, firstOpen, firstOpenSummary, TH } = await import(pathToFileURL(join(root, 'fixes', 'end-morph-p1', 'phone', 'p153-read.mjs')).href);
/** rev 2: strict median, null when the list is empty or any value is missing (no silent drop). */
export const med = (a) => { if (!a.length || a.some((x) => x == null)) return null; const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export const BOUNDS = { f2: 4, cb34: 3, cbp34: 2, opf2: 4 };
/** Served pins per base (p156-serve.sh / p156-hold.sh): C JS, C CSS, A JS, A CSS. */
export const PINS = { 1: ['fe7c668d35e8', 'e1359ab9994a', 'f83aa54c2acc', 'cfb8b8c5b019'], 0: ['387a2b38790b', 'e1359ab9994a', '888ed8eb2d15', 'cfb8b8c5b019'], v10: ['1b2eecc66011', 'e1359ab9994a', 'a33a6c7c1f2b', '62743920fe1a'] };
/** g-park30-v1's compiled program hash (gesture --dry-run GESTURE_HASH). */
export const PARK_HASH = '6f9209453750';
/** opens()' morph value (lvh = the run's largest innerHeight). */
export function mLvh(seg, i) { const fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0, lvh = Math.max(...fr.map((f) => f[3])); return (fr[i][2] - (docH - fr[i][3] - lvh)) / lvh; }
/** G7 (rev 2): the three 30 s parks are still: no moving frame, m >= 0.99 at the open parks, m <= 0 at the closed one. */
export function parkGates(seg) {
  const why = [], fr = seg?.frames || [], mk = [...(seg?.marks || [])].sort((a, b) => a[0] - b[0]);
  const parks = mk.map((m, k) => ({ name: m[1], from: m[0], to: k + 1 < mk.length ? mk[k + 1][0] : Infinity })).filter((w) => /^P\d+-park-/.test(w.name));
  for (const want of ['P1-park-open', 'P2-park-closed', 'P3-park-open']) if (!parks.some((p) => p.name.startsWith(want))) why.push(`G7 park mark ${want}-* missing`);
  for (const p of parks) {
    const idx = []; let before = -1;
    for (let i = 0; i < fr.length; i++) { if (fr[i][0] < p.from) before = i; else if (fr[i][0] < p.to) idx.push(i); }
    if (before >= 0) idx.unshift(before);
    if (idx.length < 2) { why.push(`G7 ${p.name}: ${idx.length} frame(s) in the park`); continue; }
    const mv = idx.slice(1).filter((i) => fr[i][2] !== fr[i - 1][2]).length;
    if (mv) why.push(`G7 ${p.name}: ${mv} moving frame(s) in the park`);
    const ms = idx.map((i) => mLvh(seg, i)), lo = Math.min(...ms), hi = Math.max(...ms);
    if (/-park-open/.test(p.name) && lo < 0.99) why.push(`G7 ${p.name}: m min ${lo.toFixed(3)} < 0.99`);
    if (/-park-closed/.test(p.name) && hi > 0) why.push(`G7 ${p.name}: m max ${hi.toFixed(3)} > 0`);
  }
  return why;
}
/** P-129's run gates (role E); part B runs carry g-park30-v1, so its G6 (the fs hash) is replaced by the park30 hash,
 *  and G7 (the park gates) is added. */
export function gateRun(g, tl, part) {
  const r = readRun(g, tl, 'E');
  if (part === 'B') {
    r.why = r.why.filter((w) => !w.startsWith('G6'));
    if (!String(g?.program?.hash || '').startsWith(PARK_HASH)) r.why.push(`G6 script hash ${String(g?.program?.hash || 'none').slice(0, 12)} is not park30 ${PARK_HASH}`);
    r.why.push(...parkGates(g?.run?.segments?.[0]));
  }
  return r;
}
/** rev 2: the base and pin check of the hold logs ({ H: text }); returns the list of misses (empty = ok). */
export function baseCheck(logs, base) {
  const miss = [], p = PINS[base];
  if (!p) return [`--base ${base} is not 1, 0 or v10`];
  for (const [h, text] of Object.entries(logs)) {
    const st = text.match(/^HOLD \S+ \((?:P-156|v10cm-nw)\) start .* base (\S+)\s*$/m);
    if (!st) miss.push(`hold ${h}: no start line with a base`);
    else if (st[1] !== String(base)) miss.push(`hold ${h}: base ${st[1]}, the ledger says ${base}`);
    if (/^RUN /m.test(text)) {
      const sv = text.match(/^SERVED C JS (\w+) CSS (\w+) ok, A JS (\w+) CSS (\w+) ok/m);
      if (!sv) miss.push(`hold ${h}: runs but no SERVED line`);
      else if (sv.slice(1, 5).join(' ') !== p.join(' ')) miss.push(`hold ${h}: served ${sv.slice(1, 5).join(' ')}, base ${base} pins ${p.join(' ')}`);
    }
  }
  return miss;
}
export const BIN = 250, TICK = 1000 / 120;

/** P-155's morph value (copied): frames are [t, dt, scrollY, innerHeight]. */
export function mOf(seg, i) { const fr = seg.frames, docH = seg.docH1 ?? seg.docH ?? 0; const [, , y, ih] = fr[i]; return (y - (docH - 2 * ih)) / ih; }
/** P-155's closing band (copied), optionally limited to frame times in [from, to). */
export function closingBand(seg, rows, from = -Infinity, to = Infinity) {
  const fr = seg.frames;
  const cb = rows.filter((x) => x.band === 'lastScreen' && x.i > 0 && fr[x.i][2] < fr[x.i - 1][2] && fr[x.i][0] >= from && fr[x.i][0] < to)
    .filter((x) => { const m = mOf(seg, x.i); return m >= 0.2 && m < 0.55; });
  const work = cb.filter((x) => x.dt > 34).map((x) => ({ dt: x.dt, busy: x.busy ?? null, busyRF: x.busyRF ?? null, cls: x.cls ?? null }));
  return { n: cb.length, s34: cb.filter((x) => x.dt > 34).length, s50: cb.filter((x) => x.dt > 50).length, work };
}
/** rev 2: windows of the marks whose name matches re, each from its mark to the next touchstart after its own stroke
 *  (own stroke = the first touchstart at or after the mark); no own stroke: an empty window; no later touchstart: the
 *  end of the record. */
export function strokeWindows(seg, re) {
  const ts = (seg.touches || []).filter((e) => e[1] === 's').map((e) => e[0]).sort((a, b) => a - b);
  return [...(seg.marks || [])].sort((a, b) => a[0] - b[0]).filter((m) => re.test(m[1])).map((m) => {
    const own = ts.find((t) => t >= m[0]);
    if (own == null) return { name: m[1], from: m[0], to: m[0], own: null };
    const next = ts.find((t) => t > own);
    return { name: m[1], from: m[0], to: next ?? Infinity, own };
  });
}
/** Part B of one run: the closes and opens after a park. */
export function parkMetrics(g, r) {
  const seg = g.run.segments[0];
  const closes = strokeWindows(seg, /^P\d+-close-/).map((w) => ({ name: w.name, ...closingBand(seg, r.rows, w.from, w.to) }));
  const op = opens(g);
  const opensAfter = strokeWindows(seg, /^P\d+-open-/).map((w) => { const o = op.find((x) => x.t >= w.from && x.t < w.to); return { name: w.name, f2: o ? o.f2 : null, f1: o ? o.f1 : null, f123: o ? o.f123 : null }; });
  return { closes, cbp34: closes.reduce((s, c) => s + c.s34, 0), cbp50: closes.reduce((s, c) => s + c.s50, 0), opens: opensAfter, opf2: opensAfter.length ? med(opensAfter.map((o) => o.f2)) : null };
}
/** Descriptive work of the O1.f2 frame (the frame after O1's first frame) from the run's rows. */
export function o1Work(o1, rows) {
  if (!o1) return null;
  const x = rows.find((w) => w.i === o1.i + 1);
  return x ? { dt: x.dt, busy: x.busy ?? null, busyRF: x.busyRF ?? null, cls: x.cls ?? null } : null;
}
/** Census of one run: moving frames per 250 px bin. */
export function census(g, r) {
  const fr = g.run.segments[0].frames, out = {};
  for (const x of r.rows) { const b = Math.floor(fr[x.i][2] / BIN); (out[b] ||= []).push(x.dt); }
  return Object.fromEntries(Object.entries(out).map(([b, d]) => [b, { n: d.length, s34: d.filter((v) => v > 34).length, s50: d.filter((v) => v > 50).length, medDt: med(d) }]));
}
/** Census diff over runs: bins where A is worse than C (decides nothing). */
export function censusDiff(cs, as) {
  if (!cs.length || !as.length) return { bins: [], worse: [] };
  const bins = new Set([...cs, ...as].flatMap((c) => Object.keys(c))), out = [];
  for (const b of [...bins].sort((p, q) => p - q)) {
    const get = (arr, k) => arr.map((c) => (c[b] ? c[b][k] : 0));
    const d34 = med(get(as, 's34')) - med(get(cs, 's34')), d50 = med(get(as, 's50')) - med(get(cs, 's50'));
    // median dt difference: printed only (rev 2), null when a run has no frame in the bin
    const mA = med(as.map((c) => c[b]?.medDt ?? null)), mC = med(cs.map((c) => c[b]?.medDt ?? null));
    const dDt = mA != null && mC != null ? mA - mC : null;
    const worse = d34 >= 1 || d50 >= 1;
    out.push({ bin: Number(b), y: `${b * BIN}-${(Number(b) + 1) * BIN}`, d34, d50, dDt: dDt == null ? null : Math.round(dDt * 10) / 10, worse });
  }
  return { bins: out, worse: out.filter((x) => x.worse).map((x) => x.y) };
}
/** Predictions from per-arm lists. */
/** Predictions from per-arm lists (rev 2). fo* entries are firstOpen() records (optionally with .nm), pb* entries
 *  parkMetrics() records (optionally with .nm); baseMiss = baseCheck()'s list. */
export function decide({ foC, foA, ezC, ezA, cbC, cbA, pbC, pbA, sentOk, baseMiss = [] }) {
  if (baseMiss.length) return { result: `VOID (base or pin check: ${baseMiss.join('; ')})` };
  if (!sentOk) return { result: 'VOID (a sentinel failed or is missing)' };
  const out = {};
  const enoughA = foC.length >= 3 && foA.length >= 3;
  // Pr1 on the runs that have a first open (>= 3 per arm); the others are named
  const has = (r) => r.o1?.f2 != null, noOpen = [...foC, ...foA].filter((r) => !has(r)).map((r) => r.nm ?? '?');
  const oC = foC.filter(has), oA = foA.filter(has);
  const F = firstOpenSummary(oC, oA);
  const named = noOpen.length ? `; no first open: ${noOpen.join(', ')}` : '';
  const f123 = F.f123.diff == null ? '-' : F.f123.diff;
  out.Pr1 = !enoughA ? 'INSUFFICIENT' : oC.length < 3 || oA.length < 3 ? `INSUFFICIENT (first opens C ${oC.length}, A ${oA.length}, want >= 3${named})`
    : F.f2.diff <= BOUNDS.f2 + 1e-12 ? `holds (f2 A - C ${F.f2.diff} ms, f123 A - C ${f123} ms${named})` : `FAILS (f2 A - C ${F.f2.diff} ms > +${BOUNDS.f2}, f123 A - C ${f123} ms${named})`;
  const nw = decideNoWorse(ezC, ezA);
  const sens = nw.sensitive ? ', threshold-sensitive' : nw.result.startsWith('INSUFFICIENT') ? '' : ', not threshold-sensitive';
  out.Pr2 = nw.result === 'NO-WORSE PASS' ? `holds (NO-WORSE PASS${sens})` : nw.result.startsWith('INSUFFICIENT') ? 'INSUFFICIENT' : `FAILS (${nw.result}${sens})`;
  const d3 = enoughA ? med(cbA) - med(cbC) : null;
  out.Pr3 = !enoughA ? 'INSUFFICIENT' : d3 <= BOUNDS.cb34 + 1e-12 ? `holds (CB34 A - C ${d3})` : `FAILS (CB34 A - C ${d3} > +${BOUNDS.cb34})`;
  if (pbC.length < 2 || pbA.length < 2) out.Pr4 = 'INSUFFICIENT';
  else {
    // the two parts decide separately: a CBp34 miss fails Pr4 alone; Op.f2 needs a value in every valid run of each arm
    const dc = med(pbA.map((p) => p.cbp34)) - med(pbC.map((p) => p.cbp34));
    const mA = med(pbA.map((p) => p.opf2)), mC = med(pbC.map((p) => p.opf2));
    const dof = mA != null && mC != null ? mA - mC : null;
    const noOp = [...pbC, ...pbA].filter((p) => p.opf2 == null).map((p) => p.nm ?? '?');
    const cbFail = dc > BOUNDS.cbp34 + 1e-12, ofFail = dof != null && dof > BOUNDS.opf2 + 1e-12;
    const txt = `CBp34 A - C ${dc}${cbFail ? ` > +${BOUNDS.cbp34}` : ''}, Op.f2 A - C ${dof == null ? `NOT READ (no Op.f2 in ${noOp.join(', ')})` : `${dof} ms${ofFail ? ` > +${BOUNDS.opf2}` : ''}`}`;
    out.Pr4 = cbFail || ofFail ? `FAILS (${txt})` : dof == null ? `NOT READ (${txt})` : `holds (${txt})`;
  }
  const fails = ['Pr1', 'Pr2', 'Pr3', 'Pr4'].filter((k) => out[k].startsWith('FAILS'));
  const insuff = ['Pr1', 'Pr2', 'Pr3', 'Pr4'].filter((k) => !out[k].startsWith('holds') && !out[k].startsWith('FAILS'));
  out.result = fails.length ? `FAIL ${fails.join(', ')}${insuff.length ? ` (${insuff.join(', ')} not read)` : ''}` : insuff.length ? `INCOMPLETE (${insuff.join(', ')} not read)` : 'PASS (Pr1-Pr4 hold)';
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
  // rev 2 windows: from the mark to the next touchstart after the close's own stroke
  const segW = { ...seg, touches: [[12, 's'], [60, 'e'], [100, 's'], [140, 'e']] };
  ok(strokeWindows(segW, /^P\d+-close-/).map((w) => `${w.from}-${w.to}`).join(','), '10-100', 'close window ends at the next touchstart after its own stroke');
  const segX = { ...seg, marks: [[10, 'P1-close-120px-60ms'], [130, 'P2-park-closed-30s']], touches: [[12, 's'], [60, 'e'], [100, 's'], [125, 'e']] };
  const pw = parkMetrics({ run: { segments: [segX] } }, { rows });
  ok(`${pw.closes[0].n} ${pw.cbp34}`, '1 1', 'a later stroke (the drag-close, m 0.3 dt 60 at t 116) is outside the window although the next mark comes later');
  ok(strokeWindows({ marks: [[10, 'P1-close-x']], touches: [] }, /^P\d+-close-/).map((w) => `${w.from}-${w.to}`).join(','), '10-10', 'no own stroke: an empty window');
  ok(strokeWindows({ marks: [[10, 'P3-close-x']], touches: [[12, 's']] }, /^P\d+-close-/)[0].to, Infinity, 'no later touchstart: to the end of the record');
  // part B: an open after a park mark
  const g = { run: { segments: [{ docH: 6800, frames: [[0, 16, 5000, 800], [16, 16, 5100, 800], [500, 16, 5100, 800], [540, 40, 5300, 800], [570, 30, 5500, 800], [586, 16, 5600, 800]], marks: [[400, 'P2-open-120px-60ms']], touches: [[450, 's'], [600, 'e']] }] } };
  const pm = parkMetrics(g, { rows: [] });
  ok(`${pm.opens.length} ${pm.opens[0].f1} ${pm.opens[0].f2} ${pm.opf2}`, '1 40 30 30', 'part B: f2 of the first open after the open mark');
  const gN = { run: { segments: [{ ...g.run.segments[0], touches: [[450, 's'], [460, 'e'], [520, 's']] }] } };
  ok(parkMetrics(gN, { rows: [] }).opf2, null, 'part B: the open falls after the next touchstart, so the window has none: Op.f2 null');
  // strict median
  ok(med([3, null, 1]), null, 'med: a missing value gives null, not the median of the rest');
  ok(med([3, 1, 2, 10]), 2.5, 'med: even count');
  // park gates G7: docH 6800, ih 800: m = 1 at y 6000, m = 0 at y 5200
  const pk = (yP2, yP1 = 6000) => ({ docH: 6800, marks: [[100, 'P1-park-open-30s'], [200, 'P1-close-120px-60ms'], [300, 'P2-park-closed-30s'], [400, 'P2-open-120px-60ms'], [500, 'P3-park-open-30s'], [600, 'P3-close-120px-60ms']],
    frames: [[90, 16, 6000, 800], [150, 16, yP1, 800], [190, 16, yP1, 800], [290, 16, 5200, 800], [350, 16, 5200, 800], [390, 16, yP2, 800], [490, 16, 6000, 800], [550, 16, 6000, 800], [590, 16, 6000, 800]] });
  ok(parkGates(pk(5200)).join('; '), '', 'G7: still parks at m 1, 0, 1 pass');
  ok(parkGates(pk(5210)).some((w) => w.startsWith('G7 P2-park-closed-30s: 1 moving') ), true, 'G7: a moving frame in the closed park fails');
  ok(parkGates(pk(5200, 5990)).some((w) => w.includes('P1-park-open-30s: m min 0.988')), true, 'G7: m 0.9875 at an open park fails');
  ok(parkGates({ ...pk(5200), marks: pk(5200).marks.filter((m) => !m[1].startsWith('P3')) }).some((w) => w.includes('P3-park-open-* missing')), true, 'G7: a missing park fails');
  ok(gateRun({ program: { hash: '6f9209453750aa' }, run: { segments: [{ frames: [] }] } }, null, 'B').why.some((w) => w.startsWith('G7')), true, 'part B gates include G7');
  // base and pin check of the hold logs
  const lg = (b, sv) => `HOLD H2 (P-156) start 2026-10-06T12:00:00Z items EC1 gates both base ${b}\nSERVED ${sv}\nRUN EC1 arm C exit 0\nHOLD H2 VALID 300 s\n`;
  const sv1 = 'C JS fe7c668d35e8 CSS e1359ab9994a ok, A JS f83aa54c2acc CSS cfb8b8c5b019 ok';
  ok(baseCheck({ H2: lg(1, sv1) }, 1).length, 0, 'base check: base 1 log and pins pass');
  ok(baseCheck({ H2: lg(0, sv1) }, 1)[0], 'hold H2: base 0, the ledger says 1', 'base check: another base fails');
  ok(baseCheck({ H2: lg(1, sv1) }, 0).some((m) => m.includes('served')), true, 'base check: base 1 pins under --base 0 fail');
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
  const good = { ...base, ezA: [ez(18), ez(19), ez(20), ez(17)], cbA: [4, 5, 7, 5], pbA: [pb(1, 31), pb(2, 30)] };
  ok(decide({ ...good, foA: [fo(35), fo(35), fo(35), fo(35)] }).Pr1, 'holds (f2 A - C 4 ms, f123 A - C 4 ms)', 'f2 +4 ms exactly holds (rev 2 bound), f123 printed');
  ok(decide({ ...good, foA: [fo(36), fo(36), fo(36), fo(36)] }).result, 'FAIL Pr1', 'f2 +5 ms fails');
  const noO = { o1: null, repeatFullF2Median: null, nm: 'EA4' };
  ok(decide({ ...good, foA: [fo(32), fo(31), fo(32), noO] }).Pr1, 'holds (f2 A - C 1 ms, f123 A - C 1 ms; no first open: EA4)', 'a run without a first open is named; Pr1 reads 3 opens');
  ok(decide({ ...good, foA: [fo(32), fo(31), noO, noO] }).Pr1.startsWith('INSUFFICIENT (first opens C 4, A 2'), true, 'fewer than 3 first opens in an arm: INSUFFICIENT');
  ok(decide({ ...good, foA: [fo(32), fo(31), fo(32), fo(30)], pbA: [pb(6, null), pb(7, 30)] }).result, 'FAIL Pr4', 'a CBp34 miss fails Pr4 even when Op.f2 is not read');
  ok(decide({ ...good, foA: [fo(32), fo(31), fo(32), fo(30)], pbA: [{ ...pb(1, null), nm: 'BA1' }, pb(2, 30)] }).result, 'INCOMPLETE (Pr4 not read)', 'Op.f2 missing in one valid run: Pr4 NOT READ, not the other run alone');
  ok(decide({ ...good, foA: [fo(32), fo(31), fo(32), fo(30)], pbA: [pb(1, 36), pb(2, 36)] }).result, 'FAIL Pr4', 'Op.f2 +5.5 ms fails Pr4');
  ok(decide({ ...good, foA: [fo(32), fo(31), fo(32), fo(30)], baseMiss: ['hold H3: base 0, the ledger says 1'] }).result.startsWith('VOID (base or pin check'), true, 'a base miss voids the block');
  ok(decide({ ...good, foA: [fo(41), fo(40), fo(45), fo(38)], pbA: [pb(1, null), pb(2, 30)] }).result, 'FAIL Pr1 (Pr4 not read)', 'FAIL names the predictions not read');
  console.log(`SELFTEST ok (${n} checks)`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  const usage = 'usage: node fixes/v10/phone/nw-read.mjs <folder> --base v10|1|0 [--json out.json] | --gates <folder> <run>... | --selftest';
  if (!a[0] || a[0] === '--help' || a[0] === '-h') { console.log(usage); process.exit(a[0] ? 0 : 2); }
  // the runner's per-run gate check for part B runs (B<arm><n>[r]) and the pilot (PC): gate lines only, no numbers
  // (p129-gates.mjs's format)
  if (a[0] === '--gates') {
    const [dir, ...runs] = a.slice(1); let bad = 0;
    const ld = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
    for (const run of runs) {
      const g = ld(`g-${run}.json`);
      if (!g) { console.log(`GATES ${run} E INVALID no record g-${run}.json`); bad++; continue; }
      const r = gateRun(g, ld(`tl-${run}.json`), run[0] === 'B' || run[0] === 'P' ? 'B' : 'E');
      if (r.why.length) { bad++; console.log(`GATES ${run} E INVALID ${r.why.join('; ')}`); } else console.log(`GATES ${run} E ok idle ${r.idle}`);
    }
    process.exit(bad ? 1 : 0);
  }
  const dir = a[0], jsonOut = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
  // --arm D (v10, int-v8): read the third arm D (Vc) in A's place against C (items ED<n> / BD<n>); default A
  const AX = a.includes('--arm') ? a[a.indexOf('--arm') + 1] : 'A';
  if (AX !== 'A' && AX !== 'D') { console.log('--arm A|D'); process.exit(2); }
  const baseArg = a.includes('--base') ? a[a.indexOf('--base') + 1] : null;
  if (baseArg !== '1' && baseArg !== '0' && baseArg !== 'v10') { console.log(`--base 1|0 is required (the base written into the ledger before H1)\n${usage}`); process.exit(2); }
  const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
  const base = dirname(dir.replace(/\/+$/, '')), logs = {};
  for (const f of existsSync(base) ? readdirSync(base) : []) { const m = f.match(/^hold-(H[0-9A]+)\.log$/); if (m) logs[m[1]] = readFileSync(join(base, f), 'utf8'); }
  const hs = holdStatus(logs), holdWhy = (item) => (!hs[item] ? 'in no hold log' : hs[item].valid ? null : hs[item].why);
  const baseMiss = baseCheck(logs, baseArg);
  const out = { base: baseArg === 'v10' ? 'v10' : Number(baseArg), baseMiss, sentinels: {}, runs: {}, invalid: {}, holds: Object.fromEntries(Object.keys(logs).sort().map((h) => [h, (logs[h].match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || ['no HOLD line']).pop()])) };
  for (const s of ['S0', 'S1']) { const g = load(`g-${s}.json`); const hw = g ? holdWhy(s) : null; const r = g && !hw ? readRun(g, null, 'S') : null; out.sentinels[s] = r ? { fps: r.fps, slowShare: r.slowShare, sentinel: r.sentinel } : { sentinel: hw ? `FAIL (${hw})` : 'FAIL (no record)' }; }
  const L = { foC: [], foA: [], ezC: [], ezA: [], cbC: [], cbA: [], pbC: [], pbA: [], csC: [], csA: [] };
  const take = (name) => { for (const nm of [name, `${name}r`]) { const g = load(`g-${nm}.json`), tl = load(`tl-${nm}.json`); if (!g) continue; const hw = holdWhy(nm); if (hw) { out.invalid[nm] = [hw]; continue; } const r = gateRun(g, tl, nm[0] === 'B' ? 'B' : 'E'); if (r.why.length) { out.invalid[nm] = r.why; continue; } return { nm, g, r }; } out.invalid[name] ||= ['no valid try']; return null; };
  // heat at the run's hold start and end gates (one counted run per hold)
  const heat = (g) => { const p = g.meta?.profile || {}; return { start: p.start ? { battC: p.start.battC ?? null, state: p.start.state ?? null } : null, end: p.end ? { battC: p.end.battC ?? null, state: p.end.state ?? null } : null }; };
  const ht = (h) => `heat ${h.start ? `${h.start.battC ?? '-'} C ${h.start.state ?? ''}` : '-'} -> ${h.end ? `${h.end.battC ?? '-'} C ${h.end.state ?? ''}` : '-'}`;
  const wk = (w) => (w ? `dt ${w.dt} busy ${w.busy ?? '-'} busyRF ${w.busyRF ?? '-'} ${w.cls ?? '-'}` : '-');
  for (const arm of ['C', 'A']) for (let k = 1; k <= 4; k++) {
    const t = take(`E${arm === 'A' ? AX : arm}${k}`); if (!t) continue;
    const ez = endZone(t.r), fo = { ...firstOpen(t.g), nm: t.nm }, cb = closingBand(t.g.run.segments[0], t.r.rows), cs = census(t.g, t.r);
    out.runs[t.nm] = { part: 'A', arm, endZone: ez, firstOpen: fo.o1, o1f2Work: o1Work(fo.o1, t.r.rows), cb34: cb.s34, cb50: cb.s50, cbWork: cb.work, start: t.g.meta?.date ?? null, heat: heat(t.g) };
    L[`fo${arm}`].push(fo); L[`ez${arm}`].push(ez); L[`cb${arm}`].push(cb.s34); L[`cs${arm}`].push(cs);
  }
  for (const arm of ['C', 'A']) for (let k = 1; k <= 2; k++) {
    const t = take(`B${arm === 'A' ? AX : arm}${k}`); if (!t) continue;
    const pm = { ...parkMetrics(t.g, t.r), nm: t.nm };
    out.runs[t.nm] = { part: 'B', arm, ...pm, start: t.g.meta?.date ?? null, heat: heat(t.g) };
    L[`pb${arm}`].push(pm);
  }
  const sentOk = Object.values(out.sentinels).every((s) => s.sentinel === 'PASS');
  out.decision = decide({ ...L, sentOk, baseMiss });
  out.census = censusDiff(L.csC, L.csA);
  out.cb = { C: L.cbC, A: L.cbA, CB50: { C: Object.values(out.runs).filter((r) => r.part === 'A' && r.arm === 'C').map((r) => r.cb50), A: Object.values(out.runs).filter((r) => r.part === 'A' && r.arm === 'A').map((r) => r.cb50) } };
  console.log(`A-card read (rev 2), base ${baseArg}: ${baseMiss.length ? `BASE CHECK FAIL ${baseMiss.join('; ')}` : `base check ok (${Object.keys(logs).length} hold logs)`}`);
  console.log(`sentinels ${JSON.stringify(out.sentinels)}`);
  for (const [n, r] of Object.entries(out.runs)) {
    console.log(r.part === 'A'
      ? `  ${n} (${r.arm}) start ${r.start} ${ht(r.heat)} | end zone n ${r.endZone.n} >34 ${r.endZone.s[34]} >50 ${r.endZone.s[50]} | CB34 ${r.cb34} CB50 ${r.cb50} | O1 f1 ${r.firstOpen?.f1 ?? '-'} f2 ${r.firstOpen?.f2 ?? '-'} f3 ${r.firstOpen?.f123 != null ? r.firstOpen.f123 - r.firstOpen.f12 : '-'} f123 ${r.firstOpen?.f123 ?? '-'} ms`
      : `  ${n} (${r.arm}) start ${r.start} ${ht(r.heat)} | CBp34 ${r.cbp34} CBp50 ${r.cbp50} (${r.closes.map((c) => `${c.name} ${c.s34}/${c.n}`).join(', ')}) | Op.f2 ${r.opf2 ?? '-'} (${r.opens.map((o) => `${o.name} f2 ${o.f2 ?? '-'} f123 ${o.f123 ?? '-'}`).join(', ')})`);
    // descriptive work (decides nothing): the O1.f2 frame and the closing-band frames over 34 ms
    if (r.part === 'A') console.log(`      work: O1.f2 frame ${wk(r.o1f2Work)} | CB >34 frames ${r.cbWork.map(wk).join('; ') || 'none'}`);
    else console.log(`      work: CBp >34 frames ${r.closes.flatMap((c) => c.work).map(wk).join('; ') || 'none'}`);
  }
  for (const [n, w] of Object.entries(out.invalid)) console.log(`  INVALID ${n}: ${w.join('; ')}`);
  console.log(`HOLDS ${JSON.stringify(out.holds)}`);
  const D = out.decision;
  console.log(`DECISION ${D.result}`);
  for (const k of ['Pr1', 'Pr2', 'Pr3', 'Pr4']) if (D[k]) console.log(`  ${k} ${D[k]}`);
  if (D.firstOpen) { const F = D.firstOpen, d = (k) => `${k} C ${F[k].C ? `${F[k].C.median} (${F[k].C.min}-${F[k].C.max}, n ${F[k].C.n})` : '-'} A ${F[k].V ? `${F[k].V.median} (${F[k].V.min}-${F[k].V.max}, n ${F[k].V.n})` : '-'} diff ${F[k].diff ?? '-'}`; console.log(`FIRST OPEN ${d('f2')} | ${d('f123')} | ${d('f1')} | ${d('f12')}`); }
  if (D.noWorse) console.log(`END ZONE ${D.noWorse.result} basis ${D.noWorse.basis} threshold-sensitive ${D.noWorse.sensitive ? 'YES' : 'no'}`);
  console.log(`CENSUS (250 px bins; frame counts; decides nothing alone) worse: ${out.census.worse.join(', ') || 'none'}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}

// P-036 scorer (G touch-to-scroll, F3 mw10e-arm-scope-c vs aw1-10e). Registered rules: fixes/PREDICTIONS.md P-036 row.
// usage (from the repo root): node fixes/mw10e-arm-scope-c/p036-score.mjs C:<rec.json> V:<rec.json> ... [S:<sentinel.json> ...] [--json out.json]
//   Records are tools/iphone.mjs gesture outputs (arm-scope-touch-v1, compiler v2 hash d72ee13644cc). Pass the
//   counted runs only, warm-ups excluded. S: are sentinel records: an S-driver
//   record (amendment 4084772, signed 23:58Z) is judged by its own meta.sentinel (bottom >= 58 / scroll >= 44 fps); a
//   hero-none G record (v3-gesture.json, the original plan) by p50/p95.
// Per stroke: touch-to-scroll = first rAF stamp with scrollY moved - touchstart timeStamp (gesture-rec touchToScrollMs).
// Zones, by the zone mark and the stroke-start scrollY (the script's own bands): Z1 y < 1900, Z2 2100 <= y <= 3300,
//   Z3 y >= 3800. A zone-marked stroke outside its band is not scored and is listed. Transit / end strokes are not scored.
// Void run: a zone with < 3 scored strokes; any touchmove whose timeStamp is > 1 ms after its handler now();
//   phone only: stroke-map mismatch or a stroke's contact > 10 % off plan (lead 00:3xZ, e0b8583; Simulator exempt).
// Block verdict per zone: SEPARATED-WORSE = every V run median > every C run median AND median(V) - median(C) >= 16.7 ms
//   (>= 3 valid runs per arm); BETTER = the mirror; FLAGGED = one arm entirely above the other by 4-16.7 ms (V min > C max
//   or the mirror); else overlap. Card part passes iff no zone is SEPARATED-WORSE.
import { readFileSync, writeFileSync } from 'node:fs';
import { summarizeRun } from '../../tools/lib/gesture-rec.mjs';

const HASH = 'd72ee13644cc', SENT_HASH = 'f2cef11cb363', FIDELITY = 0.10, SEP_MS = 16.7, MIN_SHIFT = 4;
const ZONES = { z1: (y) => y < 1900, z2: (y) => y >= 2100 && y <= 3300, z3: (y) => y >= 3800 };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

function markAt(marks, t) { let m = null; for (const [mt, name] of marks) if (mt <= t) m = name; return m; }

function scoreRun(doc, file) {
  const segs = doc.run?.segments || [], strokes = doc.run?.strokes || [];
  const sum = doc.summary?.segments ? doc.summary : summarizeRun(segs, strokes);
  const sim = doc.meta?.device === 'simulator';
  const voids = [], notes = [], zones = { z1: [], z2: [], z3: [] }, info = { z1: {}, z2: {}, z3: {} };
  const hash = doc.program?.hash?.slice(0, 12);
  if (hash !== HASH) voids.push(`script hash ${hash} != ${HASH}`);
  if (doc.run?.aborted) voids.push(`aborted: ${doc.run.aborted}`);
  for (const [si, seg] of segs.entries()) {
    const out = sum.segments[si], marks = seg.marks || [];
    // time base: touchmove timeStamp later than its handler's now() by > 1 ms
    const bad = (seg.touches || []).filter((e) => e[1] === 'm' && typeof e[7] === 'number' && e[7] > e[0] + 1);
    if (bad.length) voids.push(`seg${si}: ${bad.length} touchmove(s) with timeStamp > handler now() + 1 ms`);
    if (!out.aligned) voids.push(`seg${si}: stroke-map: ${out.strokes} strokes sent, ${out.touchSequences} touch sequences seen`);
    const mine = strokes.filter((s) => s.seg === si);
    out.perStroke.forEach((p, k) => {
      const plan = mine[k]?.kin?.contactMs;
      if (!sim && out.aligned && plan && p.contactMs != null) {
        const off = (p.contactMs - plan) / plan;
        if (Math.abs(off) > FIDELITY) voids.push(`stroke-fidelity ${p.id}: contact ${p.contactMs} ms vs plan ${plan} ms (${r1(off * 100)} %)`);
      }
      if (p.touchStart == null) return;
      const z = markAt(marks, p.touchStart);
      if (!ZONES[z]) return; // transit, end, idle
      if (!ZONES[z](p.startY)) { notes.push(`${p.id} (${z}) starts at y ${p.startY}, outside the zone band: not scored`); return; }
      const I = info[z];
      I.strokes = (I.strokes || 0) + 1;
      I.firstMoveCancelable = (I.firstMoveCancelable || 0) + (p.firstMoveCancelable ? 1 : 0);
      if (p.touchToScrollMs == null) { notes.push(`${p.id} (${z}): no touch-to-scroll (page not at rest or no move in 1.5 s)`); return; }
      zones[z].push(p.touchToScrollMs);
      // info: moving frames in the stroke window, phone thresholds + twins + near bands
      const fr = seg.frames || [], next = out.perStroke[k + 1]?.touchStart ?? Infinity;
      const win = fr.filter((f, i) => i > 0 && f[0] > p.touchStart && f[0] < next && f[2] !== fr[i - 1][2]).map((f) => f[1]);
      for (const [key, th] of [['gt34', 34], ['gt30', 30], ['gt38', 38], ['gt50', 50], ['gt46', 46], ['gt54', 54]]) I[key] = (I[key] || 0) + win.filter((d) => d > th).length;
      I.near30_38 = (I.near30_38 || 0) + win.filter((d) => d > 30 && d <= 38).length;
      I.near46_54 = (I.near46_54 || 0) + win.filter((d) => d > 46 && d <= 54).length;
    });
    // touchmove queue delay (handler now() - timeStamp), per zone
    for (const e of seg.touches || []) {
      if (e[1] !== 'm' || typeof e[7] !== 'number' || e[7] <= 0) continue;
      const z = markAt(marks, e[0]);
      if (ZONES[z]) (info[z].qd ||= []).push(e[0] - e[7]);
    }
  }
  const med = {};
  for (const z of Object.keys(ZONES)) {
    med[z] = r1(median(zones[z]));
    if (zones[z].length < 3) voids.push(`${z}: ${zones[z].length} scored stroke(s) < 3`);
    const qd = info[z].qd || [];
    info[z] = { ...info[z], qd: undefined, queueDelayMedMs: r1(median(qd)), queueDelayP95Ms: r1(pct(qd, 0.95)), cancelableShare: info[z].strokes ? r1(info[z].firstMoveCancelable / info[z].strokes) : null };
    delete info[z].firstMoveCancelable;
  }
  return { file, label: doc.meta?.label, date: doc.meta?.date, device: doc.meta?.device, battery: doc.meta?.battery ?? null, hash, valid: voids.length === 0, voids, notes, strokesMs: zones, medianMs: med, info };
}

function sentinel(doc, file) {
  const hash = doc.program?.hash?.slice(0, 12);
  const gaps = [];
  for (const seg of doc.run?.segments || []) { const fr = seg.frames || []; for (let i = 1; i < fr.length; i++) if (fr[i][2] !== fr[i - 1][2]) gaps.push(fr[i][1]); }
  const p50 = pct(gaps, 0.5), p95 = pct(gaps, 0.95);
  return { file, label: doc.meta?.label, date: doc.meta?.date, hash, hashOk: hash === SENT_HASH, movingFrames: gaps.length, p50: r1(p50), p95: r1(p95), pass: hash === SENT_HASH && p50 <= 17.5 && p95 <= 18 };
}

function verdict(c, v) {
  if (c.length < 3 || v.length < 3) return { verdict: 'n/a (< 3 valid runs per arm)' };
  const d = r1(median(v) - median(c)), cMax = Math.max(...c), cMin = Math.min(...c), vMax = Math.max(...v), vMin = Math.min(...v);
  if (vMin > cMax) return { verdict: d >= SEP_MS ? 'SEPARATED-WORSE' : (vMin - cMax >= 0 && d >= MIN_SHIFT ? 'FLAGGED (V above C, 4-16.7 ms)' : 'overlap'), deltaMs: d };
  if (cMin > vMax) return { verdict: -d >= SEP_MS ? 'BETTER' : (-d >= MIN_SHIFT ? 'FLAGGED (V below C, 4-16.7 ms)' : 'overlap'), deltaMs: d };
  return { verdict: 'overlap', deltaMs: d };
}

const args = process.argv.slice(2), jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const runs = [], sents = [];
for (const a of args) {
  const m = /^([CVS]):(.+)$/.exec(a); if (!m) continue;
  const doc = JSON.parse(readFileSync(m[2], 'utf8'));
  if (m[1] === 'S') {
    if (doc.program?.hash) sents.push(sentinel(doc, m[2]));
    else { const st = doc.meta?.sentinel; sents.push({ file: m[2], label: doc.meta?.label, date: doc.meta?.date, driver: 'S', criterion: st?.criterion ?? null, bottom: st?.value?.bottom ?? null, scroll: st?.value?.scroll ?? null, pass: !!st?.pass, invalid: !st }); }
  }
  else runs.push({ arm: m[1], ...scoreRun(doc, m[2]) });
}
const zones = {};
for (const z of Object.keys(ZONES)) {
  const c = runs.filter((r) => r.arm === 'C' && r.valid).map((r) => r.medianMs[z]).filter((x) => x != null);
  const v = runs.filter((r) => r.arm === 'V' && r.valid).map((r) => r.medianMs[z]).filter((x) => x != null);
  zones[z] = { C: c, V: v, medianC: r1(median(c)), medianV: r1(median(v)), ...verdict(c, v) };
}
const pass = Object.values(zones).every((z) => z.verdict !== 'SEPARATED-WORSE') && Object.values(zones).every((z) => !z.verdict.startsWith('n/a'));
// Sentinels are part of the card part (review-f3-arm-scope round 1): no sentinel -> INCOMPLETE; a failing or invalid
// sentinel -> VOID (the registered rule voids the counted runs since the last passing sentinel; the scorer does not
// order runs in time, so any failure voids the card part and the owner re-scores the runs the rule keeps).
const sentFail = sents.filter((s) => !s.pass);
const zoneCard = pass ? 'PASS (no zone SEPARATED-WORSE)' : Object.values(zones).some((z) => z.verdict === 'SEPARATED-WORSE') ? 'FAIL (a zone SEPARATED-WORSE)' : 'INCOMPLETE';
const cardPart = !sents.length ? `INCOMPLETE (no sentinel passed in; zones: ${zoneCard})` : sentFail.length ? `VOID (${sentFail.length} sentinel(s) failed or invalid; zones: ${zoneCard})` : zoneCard;
const out = { prediction: 'P-036', scriptHash: HASH, sentinelHash: SENT_HASH, sentinels: sents, runs: runs.map(({ strokesMs, ...r }) => ({ ...r, strokesMs })), zones, cardPart };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
for (const s of sents) console.log(s.driver === 'S'
  ? `sentinel ${s.label ?? s.file}: S-driver (amendment 4084772) ${s.invalid ? 'no meta.sentinel (INVALID)' : `${s.criterion}: bottom ${s.bottom} scroll ${s.scroll}`} -> ${s.pass ? 'pass' : 'FAIL'}`
  : `sentinel ${s.label}: hash ${s.hash}${s.hashOk ? '' : ' (WRONG)'} moving ${s.movingFrames} p50 ${s.p50} p95 ${s.p95} -> ${s.pass ? 'pass' : 'FAIL'}`);
for (const r of runs) console.log(`${r.arm} ${r.label}: ${r.valid ? 'valid' : 'VOID ' + r.voids.join('; ')} | z1 ${r.medianMs.z1} z2 ${r.medianMs.z2} z3 ${r.medianMs.z3} ms${r.notes.length ? ' | ' + r.notes.length + ' note(s)' : ''}`);
for (const [z, s] of Object.entries(zones)) console.log(`${z}: C [${s.C}] V [${s.V}] med C ${s.medianC} V ${s.medianV} -> ${s.verdict}${s.deltaMs != null ? ` (V-C ${s.deltaMs} ms)` : ''}`);
console.log(`card part: ${out.cardPart}`);

// countdown-tick P-130 reader (frozen before data). Reads one block's runs and applies the void rules, the timer-grid
// strata, the minimums and the P1-P4 checks of the P-130 card (fixes/countdown-tick/README.md "Phone check (P-130)").
//   node fixes/countdown-tick/p130-read.mjs <block.json>     verdict + JSON; exit 0 PASS, 1 FAIL, 2 INSUFFICIENT, 3 VOID, 4 usage
//   node fixes/countdown-tick/p130-read.mjs --selftest       synthetic cases; exit 0 when all pass
// block.json (p130-block.mjs builds it from the holds' manifests): { ticket: "P-130", runs: [ { item, hold, arm: "C"|"V",
//   counted: true|false, startedAt: ISO, thermal: { start, end } ("serious" when the hold's pinned gate passed, else the
//   gate's exit), holdVoid: null | "<why>", logger: <phone-logger.mjs read() JSON, with its own readAt> } ] }
// Rules (all boundaries as written here):
//   void run: the hold is VOID (holdVoid: a served-hash check, the Mac sleep check, an open failure); gestureExit not 0
//     (the gesture run failed, e.g. the stroke after the logger read, or a budget refusal); thermal start or end not "serious"; summary.hidden > 0; summary.changes < 100; summary.windowMs < 115000;
//     recs[0] not tagged 'initial' (logger installed late); readAt < first change + 123000 (end grid read unfinished);
//     summary.grid.start or .end missing; startedAt later than 2026-11-02T04:45:00Z (15 min before the countdown expiry).
//   stratum of a grid read (p50 of the hop gaps, ms): >= 25 "30ms"; [6, 12] "8ms"; < 6 "fair"; (12, 25) "other".
//     A run's stratum is that value when start and end agree, else "mixed". "other" and "mixed" runs count for the
//     no-worse test only.
//   no-worse (all valid counted runs): total V skips <= total C skips, and V repeats = 0 in every run.
//     Repeats: consecutive equal logged values. The DOM spec queues a mutation record for setAttribute even with an
//     unchanged value, so a repeat can also be a no-op write; a V repeat fails the test either way (the fix writes once
//     per second, each a new second).
//   fix claim (30ms stratum only): needs >= 2 valid C and >= 2 valid V runs there, else INSUFFICIENT; PASS when every V
//     run has 0 skips and total C skips > 0; FAIL when a V run skips; C with 0 skips everywhere = INSUFFICIENT (nothing
//     to remove in this block).
//   verdict: VOID when no valid C or no valid V run; FAIL when no-worse or the claim fails; INSUFFICIENT when no-worse
//     passes and the claim is INSUFFICIENT; PASS when both pass.
//   P1 V 0 skips and 0 repeats in every valid run; P2 every 30ms C run >= 2 skips (and P2b >= 1); P3 every 8ms/fair C run
//     0-1 skips; P4 V gap p50 in [985, 1015] ms in every valid run and C gap p50 >= 1015 in every 30ms run. P1-P4 are
//     reported (true / false / null when no run applies); they do not change the verdict.
import { readFileSync } from 'node:fs';

const EXPIRY_GUARD = Date.parse('2026-11-02T04:45:00Z');
export const stratumOf = (p50) => (p50 == null ? null : p50 >= 25 ? '30ms' : p50 < 6 ? 'fair' : p50 >= 6 && p50 <= 12 ? '8ms' : 'other');

export function voidReasons(run) {
  const r = [], L = run.logger || {}, s = L.summary || {};
  if (run.holdVoid) r.push(`hold void: ${run.holdVoid}`);
  if (run.gestureExit != null && run.gestureExit !== 0) r.push(`gesture exit ${run.gestureExit}`);
  if (String(run.thermal?.start).toLowerCase() !== 'serious') r.push(`thermal start ${run.thermal?.start}`);
  if (String(run.thermal?.end).toLowerCase() !== 'serious') r.push(`thermal end ${run.thermal?.end}`);
  if (!(s.hidden === 0)) r.push(`hidden ${s.hidden}`);
  if (!(s.changes >= 100)) r.push(`changes ${s.changes} < 100`);
  if (!(s.windowMs >= 115000)) r.push(`windowMs ${s.windowMs} < 115000`);
  const recs = L.recs || [];
  if (!recs.length || recs[0][4] !== 'initial') r.push('late install (no initial record)');
  const first = recs.find((x) => x[4] !== 'initial');
  if (!first || !((L.readAt ?? run.readAt) >= first[0] + 123000)) r.push('read before first change + 123 s');
  if (!s.grid?.start || !s.grid?.end) r.push('grid read missing');
  if (!(Date.parse(run.startedAt) <= EXPIRY_GUARD)) r.push('too close to the countdown expiry');
  return r;
}

export function read(block) {
  if (block.ticket !== 'P-130') return { verdict: 'VOID', exit: 3, why: 'ticket is not P-130' };
  const runs = (block.runs || []).filter((r) => r.counted !== false).map((r) => {
    const s = r.logger?.summary || {}, vr = voidReasons(r);
    const a = stratumOf(s.grid?.start?.p50), b = stratumOf(s.grid?.end?.p50);
    return { item: r.item, arm: r.arm, valid: vr.length === 0, void: vr, stratum: a && a === b ? a : 'mixed',
      skips: s.skips, repeats: s.repeats, gapP50: s.gapMs?.p50, grid: [s.grid?.start?.p50, s.grid?.end?.p50] };
  });
  const ok = runs.filter((r) => r.valid), C = ok.filter((r) => r.arm === 'C'), V = ok.filter((r) => r.arm === 'V');
  const sum = (xs) => xs.reduce((t, r) => t + r.skips, 0);
  const out = { runs, valid: { C: C.length, V: V.length } };
  if (!C.length || !V.length) return { ...out, verdict: 'VOID', exit: 3, why: 'no valid C or no valid V run' };
  const noWorse = sum(V) <= sum(C) && V.every((r) => r.repeats === 0);
  out.noWorse = { pass: noWorse, skipsC: sum(C), skipsV: sum(V), repeatsV: V.map((r) => r.repeats) };
  const C30 = C.filter((r) => r.stratum === '30ms'), V30 = V.filter((r) => r.stratum === '30ms');
  let claim;
  if (C30.length < 2 || V30.length < 2) claim = 'INSUFFICIENT';
  else if (V30.some((r) => r.skips > 0)) claim = 'FAIL';
  else claim = sum(C30) > 0 ? 'PASS' : 'INSUFFICIENT';
  out.claim = { result: claim, runsC: C30.length, runsV: V30.length, skipsC: sum(C30), skipsV: sum(V30) };
  const all = (xs, f) => (xs.length ? xs.every(f) : null);
  const C8f = C.filter((r) => r.stratum === '8ms' || r.stratum === 'fair');
  const p4v = all(V, (r) => r.gapP50 >= 985 && r.gapP50 <= 1015), p4c = all(C30, (r) => r.gapP50 >= 1015);
  out.predictions = { P1: all(V, (r) => r.skips === 0 && r.repeats === 0), P2: all(C30, (r) => r.skips >= 2), P2b: all(C30, (r) => r.skips >= 1),
    P3: all(C8f, (r) => r.skips <= 1), P4: p4v === null || p4c === null ? (p4v ?? p4c) : p4v && p4c };
  if (!noWorse || claim === 'FAIL') return { ...out, verdict: 'FAIL', exit: 1 };
  if (claim === 'INSUFFICIENT') return { ...out, verdict: 'INSUFFICIENT', exit: 2 };
  return { ...out, verdict: 'PASS', exit: 0 };
}

// ---- self-test: synthetic logger outputs ----
function fake({ arm, skips = 0, repeats = 0, grid = [30, 30], hidden = 0, changes = 120, windowMs = 119500, late = false, gap = arm === 'C' ? 1020 : 995,
  thermal = ['serious', 'serious'], readAfter = 125000, startedAt = '2026-10-10T00:00:00Z' }) {
  const t0 = 1.8e12, recs = [];
  if (!late) recs.push([t0 - 500, 0, 2e6, false, 'initial']);
  recs.push([t0, 500, 2e6 - 1, false]);
  return { arm, counted: true, startedAt, readAt: t0 + readAfter, thermal: { start: thermal[0], end: thermal[1] },
    logger: { n: recs.length, recs, summary: { windowMs, changes, distinct: changes - repeats, skips, repeats, hidden,
      gapMs: { min: gap - 10, p50: gap, max: gap + 10 }, grid: { start: { p50: grid[0] }, end: { p50: grid[1] } } } } };
}
function selftest() {
  const B = (...runs) => ({ ticket: 'P-130', runs: runs.map((r, i) => ({ item: i + 1, ...r })) });
  const C2 = fake({ arm: 'C', skips: 2 }), V0 = fake({ arm: 'V' });
  const cases = [
    ['30ms: C 2 skips x2, V 0 x2 -> PASS', B(C2, V0, V0, C2), (o) => o.verdict === 'PASS' && o.predictions.P1 && o.predictions.P2 && o.predictions.P4],
    ['V skips in 30ms -> FAIL', B(C2, fake({ arm: 'V', skips: 1 }), V0, C2), (o) => o.verdict === 'FAIL' && o.claim.result === 'FAIL'],
    ['V repeat -> FAIL (no-worse)', B(C2, fake({ arm: 'V', repeats: 1 }), V0, C2), (o) => o.verdict === 'FAIL' && !o.noWorse.pass],
    ['only 1 C in 30ms -> INSUFFICIENT', B(C2, V0, V0, fake({ arm: 'C', grid: [4.6, 4.6], gap: 1001 })), (o) => o.verdict === 'INSUFFICIENT' && o.claim.runsC === 1],
    ['all Fair, no skips -> INSUFFICIENT, P3 true', B(...['C', 'V', 'V', 'C'].map((arm) => fake({ arm, grid: [4.6, 4.7], gap: 1000 }))),
      (o) => o.verdict === 'INSUFFICIENT' && o.noWorse.pass && o.predictions.P3 === true && o.predictions.P2 === null],
    ['all 8ms, V more skips than C -> FAIL', B(fake({ arm: 'C', grid: [8, 8] }), fake({ arm: 'V', grid: [8, 8], skips: 1 }), fake({ arm: 'V', grid: [8, 8] }), fake({ arm: 'C', grid: [8, 8] })),
      (o) => o.verdict === 'FAIL' && !o.noWorse.pass],
    ['stratum change -> mixed, counted for no-worse only', B(C2, V0, fake({ arm: 'V', grid: [30, 8] }), fake({ arm: 'C', skips: 1, grid: [8, 30] })),
      (o) => o.runs[2].stratum === 'mixed' && o.runs[3].stratum === 'mixed' && o.claim.runsV === 1 && o.verdict === 'INSUFFICIENT' && o.noWorse.skipsC === 3],
    ['p50 18 ms -> other', B(fake({ arm: 'C', grid: [18, 18] }), V0), (o) => o.runs[0].stratum === 'other'],
    ['boundaries: 25 -> 30ms, 12 -> 8ms, 6 -> 8ms, 5.9 -> fair, 12.1 -> other', B(V0, C2),
      () => stratumOf(25) === '30ms' && stratumOf(12) === '8ms' && stratumOf(6) === '8ms' && stratumOf(5.9) === 'fair' && stratumOf(12.1) === 'other' && stratumOf(24.9) === 'other'],
    ['hidden > 0 -> void', B(fake({ arm: 'C', hidden: 3 }), V0), (o) => !o.runs[0].valid && o.verdict === 'VOID'],
    ['late install -> void', B(C2, fake({ arm: 'V', late: true })), (o) => !o.runs[1].valid && /late install/.test(o.runs[1].void.join()) && o.verdict === 'VOID'],
    ['windowMs < 115000 -> void', B(C2, fake({ arm: 'V', windowMs: 110000 })), (o) => !o.runs[1].valid && o.verdict === 'VOID'],
    ['changes < 100 -> void', B(C2, fake({ arm: 'V', changes: 90 })), (o) => !o.runs[1].valid],
    ['read at 122 s -> void', B(C2, fake({ arm: 'V', readAfter: 122000 })), (o) => !o.runs[1].valid && /123 s/.test(o.runs[1].void.join())],
    ['gesture exit 1 after the logger read -> void', B(C2, { ...V0, gestureExit: 1 }), (o) => !o.runs[1].valid && /gesture exit 1/.test(o.runs[1].void.join()) && o.verdict === 'VOID'],
    ['gesture exit 0 or absent -> valid', B({ ...C2, gestureExit: 0 }, V0), (o) => o.runs[0].valid && o.runs[1].valid],
    ['hold void -> run void', B(C2, { ...V0, holdVoid: 'served hash' }), (o) => !o.runs[1].valid && o.verdict === 'VOID'],
    ['logger readAt (phone clock) preferred', B(C2, { ...fake({ arm: 'V' }), readAt: undefined, logger: { ...fake({ arm: 'V' }).logger, readAt: 1.8e12 + 124000 } }), (o) => o.runs[1].valid],
    ['thermal end fair -> void', B(fake({ arm: 'C', skips: 2, thermal: ['serious', 'fair'] }), V0), (o) => !o.runs[0].valid],
    ['after expiry guard -> void', B(C2, fake({ arm: 'V', startedAt: '2026-11-02T04:50:00Z' })), (o) => !o.runs[1].valid],
    ['uncounted warm-up ignored', B({ ...fake({ arm: 'V', skips: 5 }), counted: false }, C2, V0, V0, C2), (o) => o.runs.length === 4 && o.verdict === 'PASS'],
    ['30ms C with 0 skips everywhere -> INSUFFICIENT', B(fake({ arm: 'C' }), V0, V0, fake({ arm: 'C' })), (o) => o.verdict === 'INSUFFICIENT' && o.claim.result === 'INSUFFICIENT'],
    ['wrong ticket -> VOID', { ticket: 'P-129', runs: [C2, V0] }, (o) => o.verdict === 'VOID'],
    ['exit codes', B(C2, V0, V0, C2), (o) => o.exit === 0 && read(B(C2, fake({ arm: 'V', skips: 1 }), V0, C2)).exit === 1 && read(B(C2, V0)).exit === 2 && read(B(C2)).exit === 3],
  ];
  let pass = 0;
  for (const [name, block, check] of cases) { const o = read(block); const ok = !!check(o); pass += ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(o)}`); }
  console.log(`SELFTEST ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (process.argv[2] === '--selftest') selftest();
  else if (!process.argv[2]) { console.error('usage: p130-read.mjs <block.json> | --selftest'); process.exit(4); }
  else { const o = read(JSON.parse(readFileSync(process.argv[2], 'utf8'))); console.log(`${o.verdict}`); console.log(JSON.stringify(o, null, 1)); process.exit(o.exit); }
}

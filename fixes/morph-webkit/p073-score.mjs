// P-073 scorer (fix-nav-morph; card fixes/mw10e-arm-scope-d/README.md "P-073 prediction card", rev 2.1). Derived
// numbers only (N1): no href, host or device field is copied from a record.
//   node fixes/morph-webkit/p073-score.mjs <manifest.json> [--json out.json]
// manifest: { "batt": "<battery log .jsonl>",
//             "runs": [ { "arm": "C|V|D", "file": "<gesture record.json>", "topup": false,
//                         "start": "direct|cooled|warmed", "lpm": false, "sentinelVoid": false, "thermal": false,
//                         "note": "" }, ... ] }
//   Runs in block order. "topup": true marks a V top-up run (after the Latin square). "lpm", "sentinelVoid" and "thermal"
//   come from the runner's notes (Low Power Mode on; voided by a failing sentinel; an iOS thermal notice during the run).
//   Everything else is computed here.
// Per run (rules of the card):
//   program hash must be v1c 0653995a35be; pin arrival = first frame y >= 5200; settle y = scrollY of the last frame
//   before the 'end' mark, bin low <= 5216 / high >= 5217 (lead 07:1xZ); pushes to end = touch sequences starting
//   from pin arrival - 300 ms to 'end' (must be 9), end pushes = sequences after 'end' (must be 2); prevented pooled over
//   the 9 pin pushes, >= 90 % in either bin; idle phase fps from 'idle' + 500 ms to 'z1' >= 57; battery: start read =
//   last read at or before the record's start (+5 s), must be 40.0-41.0 C; its age is reported and a read older than
//   60 s is flagged to the lead (ops nit a); any read during the run >= 42.5 C = void (ceiling); an iOS thermal notice
//   ("thermal": true) = void; charge state (charging, external) the same at the start and end reads, and the same state
//   across all counted runs (P-068 form: runs in the minority state are void; a tie between states voids nothing and
//   goes to the lead, ops nit c); temperature at pin arrival = the read nearest the pin arrival (its distance is
//   reported).
//   Collapse (P-071): 2 s fps windows from pin arrival to the last frame; collapsed = 2 consecutive windows < 30 fps;
//   sustained = >= 50 % of windows < 30, else transient; onset from pin arrival and from the nearest pin-push lift.
// Per arm: reading on n runs: n >= 3 (first 3): >= 2 collapsed = collapses, 0 = clean, 1 = inconclusive; n = 2: 2/2
//   collapses, 0/2 clean, 1/2 inconclusive; n <= 1: not enough. Readings: all (Latin-square counted runs), low bin
//   (counted low-bin runs; V's top-up runs enter only this one), sustained-only (all runs, sustained collapses only).
//   settle-sensitive = all and low-bin readings both verdicts and different; rule-sensitive = all vs sustained differ.
// Decision: the card's order (first match wins), printed with the flags.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { touchSequences } from '../../tools/lib/gesture-rec.mjs';

const V1C = '0653995a35be', LOW_MAX = 5216;
const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args[ji + 1] : null;
const manPath = args.find((a, i) => !a.startsWith('--') && (ji < 0 || i !== ji + 1));
if (!manPath) { console.error('usage: node fixes/morph-webkit/p073-score.mjs <manifest.json> [--json out.json]'); process.exit(1); }
const man = JSON.parse(readFileSync(manPath, 'utf8'));
const base = dirname(resolve(manPath));
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const batt = man.batt ? readFileSync(resolve(base, man.batt), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((b) => ({ ...b, ms: Date.parse(b.t) })) : [];

function scoreRun(m, idx) {
  const j = JSON.parse(readFileSync(resolve(base, m.file), 'utf8'));
  const seg = (j.run?.segments || []).filter((s) => (s.frames || []).length).pop();
  const out = { n: idx + 1, arm: m.arm, topup: !!m.topup, start: m.start ?? null, note: m.note ?? '', program: j.program?.hash?.slice(0, 12) ?? null, void: [] };
  if (!seg) { out.void.push('no frames'); return out; }
  const fr = seg.frames, mark = (n) => (seg.marks || []).find((x) => x[1] === n)?.[0] ?? null;
  const mIdle = mark('idle'), mZ1 = mark('z1'), mEnd = mark('end');
  const wall = (t) => Date.parse(seg.startWall) + (t - (seg.t0 ?? 0));
  if (out.program !== V1C) out.void.push(`program ${out.program} is not v1c`);
  if (j.run?.aborted) out.void.push('aborted');
  if ((j.run?.errors || []).length) out.void.push(`${j.run.errors.length} gesture errors`);
  if (m.lpm) out.void.push('Low Power Mode');
  if (m.sentinelVoid) out.void.push('failing sentinel');
  if (m.thermal) out.void.push('iOS thermal notice');
  // idle phase fps
  const idleF = fr.filter((f) => mIdle != null && mZ1 != null && f[0] >= mIdle + 500 && f[0] < mZ1);
  out.idleFps = idleF.length > 1 ? r1(((idleF.length - 1) * 1000) / (idleF[idleF.length - 1][0] - idleF[0][0])) : null;
  if (out.idleFps == null || out.idleFps < 57) out.void.push(`idle fps ${out.idleFps}`);
  // pin, settle, exposure
  const pin = fr.find((f) => f[2] >= 5200);
  if (!pin) { out.void.push('no pin'); return out; }
  const pinT = pin[0], lastT = fr[fr.length - 1][0];
  const before = mEnd == null ? [] : fr.filter((f) => f[0] < mEnd);
  out.settleY = before.length ? before[before.length - 1][2] : null;
  out.bin = out.settleY == null ? null : out.settleY <= LOW_MAX ? 'low' : 'high';
  const seqs = touchSequences(seg).filter((s) => s.start >= pinT - 300);
  const loop = seqs.filter((s) => mEnd != null && s.start < mEnd), ends = seqs.filter((s) => mEnd != null && s.start >= mEnd);
  const mv = loop.reduce((a, s) => a + s.moves, 0), pv = loop.reduce((a, s) => a + s.prevented, 0);
  out.pinPushes = loop.length; out.endPushes = ends.length; out.prevented = `${pv}/${mv}`; out.preventedShare = mv ? r1((100 * pv) / mv) : null;
  if (loop.length !== 9) out.void.push(`${loop.length} pin pushes`);
  if (ends.length !== 2) out.void.push(`${ends.length} end pushes`);
  if (out.preventedShare == null || out.preventedShare < 90) out.void.push(`prevented ${out.preventedShare} %`);
  out.pinToEndS = mEnd == null ? null : r1((mEnd - pinT) / 1000);
  // battery
  const t0 = wall(seg.t0 ?? fr[0][0]), t1 = wall(lastT), tp = wall(pinT);
  const startRead = batt.filter((b) => b.ms <= t0 + 5000).pop() ?? null;
  const endRead = batt.find((b) => b.ms >= t1 - 5000) ?? null;
  const during = batt.filter((b) => b.ms >= t0 - 5000 && b.ms <= t1 + 5000);
  const near = batt.length ? batt.reduce((a, b) => (Math.abs(b.ms - tp) < Math.abs(a.ms - tp) ? b : a)) : null;
  out.temp = { start: startRead?.tempC ?? null, startReadAgeS: startRead ? r1((t0 - startRead.ms) / 1000) : null, pin: near?.tempC ?? null, pinReadOffsetS: near ? r1((near.ms - tp) / 1000) : null, end: endRead?.tempC ?? null, max: during.length ? Math.max(...during.map((b) => b.tempC)) : null };
  out.charge = startRead ? `${startRead.charging ? 'charging' : 'held'}${startRead.external ? '+ext' : ''}` : null;
  const endCharge = endRead ? `${endRead.charging ? 'charging' : 'held'}${endRead.external ? '+ext' : ''}` : null;
  if (out.temp.start == null || out.temp.start < 40.0 || out.temp.start > 41.0) out.void.push(`start ${out.temp.start} C outside 40.0-41.0`);
  if (out.temp.max != null && out.temp.max >= 42.5) out.void.push(`ceiling ${out.temp.max} C`);
  if (out.charge && endCharge && out.charge !== endCharge) out.void.push(`charge ${out.charge} -> ${endCharge}`);
  // collapse
  const windows = [];
  for (let w = pinT; w + 2000 <= lastT; w += 2000) windows.push(r1(fr.filter((f) => f[0] >= w && f[0] < w + 2000).length / 2));
  out.windows = windows; out.minWindow = windows.length ? Math.min(...windows) : null;
  let ci = -1; for (let i = 0; i + 1 < windows.length; i++) if (windows[i] < 30 && windows[i + 1] < 30) { ci = i; break; }
  out.collapsed = ci >= 0;
  out.lowShare = windows.length ? r1((100 * windows.filter((x) => x < 30).length) / windows.length) : null;
  out.sustained = out.collapsed && out.lowShare >= 50;
  if (out.collapsed) {
    const w0 = pinT + ci * 2000, first = fr.find((f) => f[0] >= w0 && f[0] < w0 + 2000 && f[1] > 34);
    const dropT = first ? first[0] - first[1] : w0;
    const lifts = loop.concat(ends).map((s) => s.end).filter((x) => x != null);
    const nl = lifts.length ? lifts.reduce((a, b) => (Math.abs(b - dropT) < Math.abs(a - dropT) ? b : a)) : null;
    out.onset = { fromPinS: r1((dropT - pinT) / 1000), fromNearestLiftMs: nl == null ? null : r1(dropT - nl) };
  }
  return out;
}

const runs = man.runs.map(scoreRun);
// charge state across counted runs (P-068 form): the majority state stands, runs in the other state are void
const okRuns = () => runs.filter((r) => !r.void.length);
const states = {}; for (const r of okRuns()) states[r.charge] = (states[r.charge] || 0) + 1;
const ranked = Object.entries(states).sort((a, b) => b[1] - a[1]);
const major = ranked[0]?.[0];
const chargeTie = ranked.length > 1 && ranked[0][1] === ranked[1][1];
if (!chargeTie) for (const r of okRuns()) if (ranked.length > 1 && r.charge !== major) r.void.push(`charge state ${r.charge}, block state ${major}`);

const reading = (rs, coll = (r) => r.collapsed) => {
  const n = rs.length, k = rs.filter(coll).length;
  if (n <= 1) return { n, k, v: 'not enough' };
  if (n === 2) return { n, k, v: k === 2 ? 'collapses' : k === 0 ? 'clean' : 'inconclusive' };
  const f3 = rs.slice(0, 3), k3 = f3.filter(coll).length;
  return { n: 3, k: k3, v: k3 >= 2 ? 'collapses' : k3 === 0 ? 'clean' : 'inconclusive' };
};
const VERD = new Set(['collapses', 'clean', 'inconclusive']);
const arms = {};
for (const a of ['C', 'V', 'D']) {
  const counted = okRuns().filter((r) => r.arm === a);
  const sq = counted.filter((r) => !r.topup);
  const all = reading(sq), low = reading(counted.filter((r) => r.bin === 'low')), sus = reading(sq, (r) => r.sustained);
  arms[a] = { counted: sq.length, topup: counted.length - sq.length, settle: { low: counted.filter((r) => r.bin === 'low').length, high: counted.filter((r) => r.bin === 'high').length },
    settleRuns: counted.map((r) => `${r.n}${r.topup ? 't' : ''}:${r.settleY}/${r.bin}`), starts: counted.map((r) => r.start), all, low, sustained: sus,
    settleSensitive: VERD.has(all.v) && VERD.has(low.v) && all.v !== low.v, ruleSensitive: all.v !== sus.v };
}
// decision, first match wins (card rev 2.1)
const C = arms.C, V = arms.V, D = arms.D;
// ops re-read of rev 2.1: without a top-up, rows 5-7 need V.counted >= 3 (V at n = 2 falls to row 8)
const vTopup = V.topup > 0 || (V.counted >= 3 && V.all.v === 'clean' && V.settle.low < 2);
const vTable = vTopup ? V.low.v : V.counted >= 3 ? V.all.v : 'fewer than 3';
let row;
if (D.all.k > 0 || okRuns().some((r) => r.arm === 'D' && r.collapsed)) row = 'D: a counted run collapsed -> F3 does not land as is (build E)';
else if (D.counted < 3) row = 'D: fewer than 3 counted runs -> inconclusive, to the lead, no landing';
else if (C.counted < 3) row = 'C: fewer than 3 counted runs -> C comparison void, to the lead (read before the V rows)';
else if (C.all.v === 'collapses') row = 'C collapses -> B1 re-framed with the lead (read before the V rows)';
else if (vTopup && V.settle.low < 2) row = 'V clean with fewer than 2 low-bin counted runs after the top-up -> positive control not in condition, inconclusive, to the lead, no landing on this block';
else if (vTable === 'collapses' && D.all.v === 'clean') row = 'V collapses, D clean -> D fixes B1: P-036 confirmation on D, then the F swipe, then the land request';
else if (vTable === 'clean' && D.all.v === 'clean') row = 'V clean, D clean -> heat does not reproduce B1 under this script; B1 UNRESOLVED; disclosed-risk landing is the lead\'s call';
else row = 'V inconclusive or fewer than 3 counted runs, D clean -> V comparison void, to the lead, no build decision';
const flags = [];
if (chargeTie) flags.push(`charge-state tie (${ranked.map(([s, n]) => `${s} ${n}`).join(', ')}): no majority state, the lead decides which runs count`);
for (const r of runs) if (r.temp?.startReadAgeS != null && r.temp.startReadAgeS > 60) flags.push(`run ${r.n} (${r.arm}) start battery read ${r.temp.startReadAgeS} s old`);
for (const r of runs) if (r.temp && r.temp.max == null) flags.push(`run ${r.n} (${r.arm}) no battery read during the run: ceiling unchecked`);
for (const a of ['C', 'V', 'D']) { if (arms[a].settleSensitive) flags.push(`${a} settle-sensitive`); if (arms[a].ruleSensitive) flags.push(`${a} rule-sensitive`); }
for (const r of runs) { if (r.void.length && r.collapsed) flags.push(`void run ${r.n} (${r.arm}) collapsed: ${r.void.join('; ')}`); if (!r.void.length && r.collapsed && r.bin === 'high') flags.push(`run ${r.n} (${r.arm}) collapsed in the high bin`); }

for (const r of runs) console.log(`#${r.n} ${r.arm}${r.topup ? ' top-up' : ''} ${r.void.length ? 'VOID (' + r.void.join('; ') + ')' : 'counted'} | settle ${r.settleY} ${r.bin} | pushes ${r.pinPushes}+${r.endPushes} prevented ${r.prevented} | idle ${r.idleFps} fps | temp ${JSON.stringify(r.temp)} ${r.charge} start ${r.start} | collapse ${r.collapsed ? (r.sustained ? 'sustained' : 'transient') + ' ' + JSON.stringify(r.onset) : 'no'} min ${r.minWindow} | windows ${(r.windows || []).join(' ')}`);
for (const a of ['C', 'V', 'D']) { const x = arms[a]; console.log(`${a}: counted ${x.counted}${x.topup ? ' + top-up ' + x.topup : ''}, settle low/high ${x.settle.low}/${x.settle.high} [${x.settleRuns.join(' ')}], starts ${x.starts.join(',')} | all ${x.all.k}/${x.all.n} ${x.all.v} | low-bin ${x.low.k}/${x.low.n} ${x.low.v} | sustained-only ${x.sustained.k}/${x.sustained.n} ${x.sustained.v}${x.settleSensitive ? ' | SETTLE-SENSITIVE' : ''}${x.ruleSensitive ? ' | RULE-SENSITIVE' : ''}`); }
console.log(`decision: ${row}${flags.length ? ' | to the lead with: ' + flags.join(', ') : ''}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ tool: 'p073-score', runs, arms, decision: row, flags }, null, 1));

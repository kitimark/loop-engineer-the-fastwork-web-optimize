#!/usr/bin/env node
// toolbar-resize P-127 reader (frozen with the card; COUNT-ONLY). Reads out/toolbar-resize/sim127/tl-<arm>.json from
// p127-capture.mjs and calls each arm, then the outcomes of the frozen P-127 table.
//   node fixes/toolbar-resize/p127-read.mjs out/toolbar-resize/sim127 [--json p127-read.json]
//
// FIELDS READ (frozen; nothing else): per record `type`, `children` (nesting and sibling order), `data.message` (TimeStamp
// only), `stackTrace.callFrames[].url` and `.functionName`, and `startTime` ONLY for rule T (the P-126 2 ms nearest-record
// rule and its +-25 ms background). No endTime, no durations. From the arm file: `arm`, `spec`, `depth`, `page.fired`.
//
// BRACKET (structural, not by time): the page marks each round with performance.mark('p127:<spec>:<i>') before the write
// and 'p127end:<spec>:<i>' after it, in the same callback. Both TimeStamp records sit in the same parent's children; the
// round's records are the siblings strictly between them, with their descendants. A round whose two marks are not
// siblings counts as unbracketed. Container = the parent's type (TOP when none).
// SHAPE of a ScheduleStyleRecalculation / InvalidateLayout record: page (a frame whose url contains '/p127/'), dom-call
// (frames, none of them page, the first one '[native code]'), no-stack (no callFrames or none), other.
// CALLS per arm:
//   RAISES  bracketed rounds >= 20, and >= 80 % of them hold >= 1 invalidation record; NONE <= 20 %; PARTIAL between;
//           THIN when bracketed < 20.
//   STACK   over the bracketed invalidation records: PAGE >= 80 % page; DOM-ONLY >= 80 % dom-call; STACKLESS >= 80 %
//           no-stack; MIXED otherwise; n/a when there is none.
//   T       (descriptive) per round, write time = the open mark's startTime: a hit when any invalidation record anywhere in
//           the capture starts within 2 ms; the same at +-25 ms (background).
// DEPTH RULE (lead): per-round counts compare only within the same depth: d16 arms with each other; the d1 arms only with
// P-126 (stack shape), never with d16 counts.
// OUTCOMES (frozen; see the README P-127 card for what each means for P-126's NATIVE):
//   CONTROL  every d16-<cause>-none arm NONE; a cause whose none arm is not NONE is VOID in every outcome below.
//   O1 (N4 (a), observer-callback writes; d16-io-change-sel): SEEN-WITH-CALLER (RAISES, PAGE) | STACKLESS (RAISES,
//      STACKLESS) | CALLER-CUT (RAISES, DOM-ONLY) | UNSEEN (NONE, while d16-raf- and d16-timer-change-sel RAISE) |
//      NO-RECORD (NONE and a raf or timer change-sel arm not RAISES: the test raised nothing, VOID) | MIXED otherwise.
//   O2 ((c), depth 1; d1-io/raf/timer-change-sel): DOM-ONLY-AT-1 when all three are RAISES and DOM-ONLY; PAGE-AT-1 when
//      any is PAGE; else MIXED.
//   O3 (stackless script writes; every d16 change/same arm): NEVER when 0 bracketed no-stack records, else SOMETIMES (n).
//   O4 (same-value; d16-io/raf/timer-same-sel): SILENT when all NONE; RECORDS when any RAISES; else MIXED.
//   O5 (selector gate; d16-io/raf/timer-change-nosel): GATED when all NONE; NOT-GATED when any RAISES; else MIXED.
//   O6 (rule T; d16-io-change-sel vs d16-io-same-sel): hits and background, descriptive.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INVAL = new Set(['ScheduleStyleRecalculation', 'InvalidateLayout']);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

export function shape(rec) {
  const fr = rec.stackTrace?.callFrames || [];
  if (!fr.length) return 'no-stack';
  if (fr.some((f) => String(f.url || '').includes('/p127/'))) return 'page';
  if (fr[0].url === '[native code]') return 'dom-call';
  return 'other';
}

const markOf = (r) => (r.type === 'TimeStamp' ? String(r.data?.message || '') : '');

export function readArm(file) {
  const rounds = new Map(), allInval = [];
  const addRound = (i) => { if (!rounds.has(i)) rounds.set(i, { i, open: null, bracketed: false, container: null, recs: [] }); return rounds.get(i); };
  const collect = (r, out) => { if (INVAL.has(r.type)) out.push(r); for (const c of r.children || []) collect(c, out); };
  const visit = (kids, parentType) => {
    const list = kids || [];
    for (let a = 0; a < list.length; a++) {
      const m = markOf(list[a]);
      if (m.startsWith('p127:')) {
        const i = Number(m.split(':').pop()), R = addRound(i);
        R.open = list[a].startTime;
        let b = a + 1; const inside = [];
        for (; b < list.length; b++) { const e = markOf(list[b]); if (e.startsWith('p127end:') && Number(e.split(':').pop()) === i) break; collect(list[b], inside); }
        if (b < list.length) { R.bracketed = true; R.container = parentType; R.recs = inside; }
      }
    }
    for (const r of list) { if (INVAL.has(r.type)) allInval.push(r.startTime * 1000); visit(r.children, r.type); }
  };
  visit(file.recs, 'TOP');
  const rs = [...rounds.values()].sort((x, y) => x.i - y.i), br = rs.filter((x) => x.bracketed);
  const recs = br.flatMap((x) => x.recs);
  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
  const shapes = count(recs, shape), n = recs.length;
  const withRec = br.filter((x) => x.recs.length).length;
  const raises = br.length < 20 ? 'THIN' : withRec / br.length >= 0.8 ? 'RAISES' : withRec / br.length <= 0.2 ? 'NONE' : 'PARTIAL';
  const top = (k) => (shapes[k] || 0) / n >= 0.8;
  const stack = !n ? 'n/a' : top('page') ? 'PAGE' : top('dom-call') ? 'DOM-ONLY' : top('no-stack') ? 'STACKLESS' : 'MIXED';
  const near = (t, w) => allInval.some((x) => Math.abs(x - t) <= w);
  const opens = rs.filter((x) => typeof x.open === 'number').map((x) => x.open * 1000);
  const T = { n: opens.length, hit2ms: opens.filter((t) => near(t, 2)).length, minus25: opens.filter((t) => near(t - 25, 2)).length, plus25: opens.filter((t) => near(t + 25, 2)).length };
  const named = recs.filter((r) => (r.stackTrace?.callFrames || []).some((f) => /^p127(write|io|raf|timer)$/.test(f.functionName || ''))).length;
  return {
    arm: file.arm, spec: file.spec, depth: file.depth, fired: file.page?.fired ?? null, marks: rs.length, bracketed: br.length,
    containers: count(br, (x) => x.container), roundsWithRecord: withRec,
    roundsWithSSR: br.filter((x) => x.recs.some((r) => r.type === 'ScheduleStyleRecalculation')).length,
    roundsWithIL: br.filter((x) => x.recs.some((r) => r.type === 'InvalidateLayout')).length,
    records: count(recs, (r) => r.type), shapes, stackLengths: count(recs, (r) => r.stackTrace?.callFrames?.length ?? 0),
    pageShare: n ? r3((shapes.page || 0) / n) : null, callerNamed: named, raises, stack, T,
  };
}

export function outcomes(arms) {
  const A = (k) => arms[k] || { raises: 'MISSING', stack: 'n/a', T: null };
  const causes = ['io', 'raf', 'timer'];
  const control = Object.fromEntries(causes.map((c) => [c, A(`d16-${c}-none`).raises === 'NONE' ? 'OK' : 'VOID']));
  const ok = (c) => control[c] === 'OK';
  const io = A('d16-io-change-sel'), raf = A('d16-raf-change-sel'), tim = A('d16-timer-change-sel');
  let O1;
  if (!ok('io')) O1 = 'VOID';
  else if (io.raises === 'RAISES') O1 = io.stack === 'PAGE' ? 'SEEN-WITH-CALLER' : io.stack === 'STACKLESS' ? 'STACKLESS' : io.stack === 'DOM-ONLY' ? 'CALLER-CUT' : 'MIXED';
  else if (io.raises === 'NONE') O1 = raf.raises === 'RAISES' && tim.raises === 'RAISES' && ok('raf') && ok('timer') ? 'UNSEEN' : 'NO-RECORD';
  else O1 = 'MIXED';
  const d1 = causes.map((c) => A(`d1-${c}-change-sel`));
  const O2 = !causes.every(ok) ? 'VOID' : d1.every((x) => x.raises === 'RAISES' && x.stack === 'DOM-ONLY') ? 'DOM-ONLY-AT-1' : d1.some((x) => x.stack === 'PAGE') ? 'PAGE-AT-1' : 'MIXED';
  const writes = Object.values(arms).filter((x) => x.depth === 16 && /-(change|same)-/.test(x.spec) && ok(x.spec.split('-')[0]));
  const ns = writes.reduce((m, x) => m + (x.shapes['no-stack'] || 0), 0);
  const O3 = !writes.length ? 'VOID' : ns === 0 ? 'NEVER' : `SOMETIMES (${ns})`;
  const group = (kind) => { const xs = causes.filter(ok).map((c) => A(`d16-${c}-${kind}`)); return !xs.length ? 'VOID' : xs.every((x) => x.raises === 'NONE') ? 'all-NONE' : xs.some((x) => x.raises === 'RAISES') ? 'any-RAISES' : 'MIXED'; };
  const g4 = group('same-sel'), g5 = group('change-nosel');
  const O4 = g4 === 'all-NONE' ? 'SILENT' : g4 === 'any-RAISES' ? 'RECORDS' : g4;
  const O5 = g5 === 'all-NONE' ? 'GATED' : g5 === 'any-RAISES' ? 'NOT-GATED' : g5;
  const O6 = { change: A('d16-io-change-sel').T, same: A('d16-io-same-sel').T };
  return { control, O1, O2, O3, O4, O5, O6 };
}

export function readDir(dir) {
  const arms = {};
  for (const f of readdirSync(dir).filter((x) => /^tl-d(16|1)-.*\.json$/.test(x)).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    arms[j.arm] = readArm(j);
  }
  return { arms, outcomes: outcomes(arms) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), dir = args[0];
  if (!dir) { console.error('usage: p127-read.mjs <folder> [--json out.json]'); process.exit(1); }
  const res = readDir(dir);
  for (const a of Object.values(res.arms)) console.log(`${a.arm.padEnd(22)} fired ${a.fired} marks ${a.marks} br ${a.bracketed} withRec ${a.roundsWithRecord} SSR ${a.roundsWithSSR} IL ${a.roundsWithIL} ${a.raises.padEnd(7)} ${a.stack.padEnd(9)} shapes ${JSON.stringify(a.shapes)} len ${JSON.stringify(a.stackLengths)} cont ${JSON.stringify(a.containers)} T ${JSON.stringify(a.T)}`);
  console.log(JSON.stringify(res.outcomes, null, 1));
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1) + '\n');
}

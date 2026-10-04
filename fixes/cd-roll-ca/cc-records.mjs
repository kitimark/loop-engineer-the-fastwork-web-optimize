// Builds the tools/costcard.mjs records file from the full-page comp-check runs (review round 4 B3):
//   node fixes/cd-roll-ca/cc-records.mjs <dir with comp-check-<arm>-full-r<R>.json> <out.json>
// One load per run: {arm, rep, mode: 'full', engine: 'chrome', trace, eventTimes: {tick: [trace us]}, servedHash}.
// The tick stamps are comp-check's tickTimes: countdown-code function calls outside any rAF callback (the 1 s
// setInterval), deduped at 50 ms. They stand in for a fire:<line> event because the interval sits on another line
// in C8 (4158) and V9 (4321).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: cc-records.mjs <dir> <out.json>'); process.exit(2); }
const loads = [];
for (const f of readdirSync(dir).filter((f) => /^comp-check-.+-full-r\d+\.json$/.test(f)).sort()) {
  const [, arm, rep] = f.match(/^comp-check-(.+)-full-r(\d+)\.json$/);
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!j.trace) { loads.push({ arm, rep: +rep, mode: 'full', engine: 'chrome', void: 'no trace saved' }); continue; }
  const trace = relative(dirname(resolve(out)), resolve(j.trace));
  // the tick: a countdown-code FunctionCall inside a TimerFire (the 1 s setInterval; trace line 4154 in C8, 4317 in
  // V9, 0-based); the hero and the panel clock each fire one, so stamps within 200 ms are one tick
  const ev = JSON.parse(readFileSync(resolve(j.trace), 'utf8')).traceEvents;
  const tfs = ev.filter((e) => e.name === 'TimerFire' && e.ph === 'X');
  const calls = ev.filter((e) => e.name === 'FunctionCall' && e.ph === 'X' && String(e.args?.data?.url || '').includes('2.DyWL8TcE.js')
    && e.args.data.lineNumber >= 3985 && e.args.data.lineNumber <= 4400 && tfs.some((f) => f.tid === e.tid && e.ts >= f.ts && e.ts <= f.ts + (f.dur || 0)));
  const lines = calls.reduce((m, e) => ((m[e.args.data.lineNumber] = (m[e.args.data.lineNumber] || 0) + 1), m), {});
  // the two clocks run two intervals with their own phase: take one timer (the first to fire), so a window is one
  // second with one tick of each clock in it
  const timerOf = (e) => tfs.find((f) => f.tid === e.tid && e.ts >= f.ts && e.ts <= f.ts + (f.dur || 0))?.args?.data?.timerId;
  const byTimer = {};
  for (const e of calls.sort((a, b) => a.ts - b.ts)) (byTimer[timerOf(e)] ||= []).push(e.ts);
  const first = Object.entries(byTimer).sort((a, b) => a[1][0] - b[1][0])[0];
  const tick = (first ? first[1] : []).filter((t, i, a) => i === 0 || t - a[i - 1] > 200e3);
  loads.push({ arm, rep: +rep, mode: 'full', engine: 'chrome', trace, eventTimes: { tick }, tickLines: lines, servedHash: j.servedHash || j.served || null });
}
writeFileSync(out, JSON.stringify({ loads }, null, 1));
console.log(`wrote ${out}: ${loads.length} loads (${loads.map((l) => `${l.arm}/${l.rep}${l.void ? ' VOID' : ''} ticks ${l.eventTimes?.tick.length ?? 0}`).join(', ')})`);

#!/usr/bin/env node
// rest-script P-089 addendum (I-098): did the Mac sleep during a hold? Reads `pmset -g log` (read-only) and lists the
// Sleep / DarkWake / Maintenance events whose time falls inside [start - 5 s, end + 5 s] (epoch seconds; pmset stamps
// whole seconds). Any such event makes the hold VOID. Also VOID when the log cannot be read (no evidence of no sleep).
// usage: node pmcheck.mjs <startEpochSec> <endEpochSec>     -> "PMSET OK ..." exit 0 | "PMSET VOID ..." exit 3
//        node pmcheck.mjs --selftest
import { execFileSync } from 'node:child_process';

const LINE = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) ([+-])(\d\d)(\d\d) (Sleep|DarkWake|Wake|Maintenance)\b/;
export function events(text) {
  const out = [];
  for (const l of text.split('\n')) {
    const m = l.match(LINE); if (!m) continue;
    const off = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 - off * 60;
    out.push({ t, kind: m[10], line: l.trim().slice(0, 140) });
  }
  return out;
}
export function check(text, start, end, slack = 5) {
  const hits = events(text).filter((e) => e.t >= start - slack && e.t <= end + slack && e.kind !== 'Wake');
  return { void: hits.length > 0, hits };
}

function selftest() {
  const txt = [
    '2026-10-04 00:23:05 +0700 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to x',
    '2026-10-04 00:23:14 +0700 Sleep               \tEntering Sleep state due to \'Dark Wake Thermal Emergency\'',
    '2026-10-04 00:30:00 +0700 Wake                \tWake from Deep Idle',
    '2026-10-04 00:31:00 +0700 Assertions          \tPID 1 Created',
  ].join('\n');
  const t0 = Date.UTC(2026, 9, 3, 17, 23, 5) / 1000;   // 00:23:05 +0700 = 17:23:05Z
  const ok = (c, m) => { if (!c) { console.log('SELFTEST FAIL ' + m); process.exit(1); } };
  ok(events(txt).length === 3, 'three events parsed');
  ok(events(txt)[0].t === t0, 'offset applied');
  ok(check(txt, t0 - 60, t0 + 1).void, 'DarkWake inside the window');
  ok(check(txt, t0 + 9, t0 + 20).hits.length === 1, 'Sleep inside the window');
  ok(!check(txt, t0 + 400, t0 + 500).void, 'a lone Wake does not void');
  ok(!check(txt, t0 + 1000, t0 + 2000).void, 'outside the window');
  console.log('SELFTEST OK');
}

const direct = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (direct) {
  if (process.argv[2] === '--selftest') selftest();
  else {
    const start = Number(process.argv[2]), end = Number(process.argv[3]);
    if (!(start > 0 && end >= start)) { console.log('usage: pmcheck.mjs <startEpochSec> <endEpochSec>'); process.exit(1); }
    let text;
    try { text = execFileSync('pmset', ['-g', 'log'], { encoding: 'utf8', maxBuffer: 256 << 20 }); } catch (e) { console.log('PMSET VOID: pmset -g log unreadable: ' + String(e.message).split('\n')[0]); process.exit(3); }
    const r = check(text, start, end);
    if (r.void) { console.log(`PMSET VOID: ${r.hits.length} sleep event(s) in ${start}-${end}: ${r.hits.map((h) => h.line).join(' | ')}`); process.exit(3); }
    console.log(`PMSET OK: no Sleep/DarkWake/Maintenance in ${start}-${end}`);
  }
}

// PR-018 rev 7d: counts from sim7d.sh's count-only gesture records (and iphone.mjs gesture records with the same
// --inject logger). Per finger stroke (touchstart .. next touchstart): start p, where the page came to rest, the lowest
// p after the lift, whether it came back to open with no finger down, and rev 7d's __msDbg entry (__msFv at touchend).
// p = (scrollY - (maxY - endH)) / endH: 0 closed rest, 1 open (page end); positions only, no times are reported.
//   node fixes/morph-scroll/sim7d-analyze.mjs <dir or record.json>... [--strokes]
// Rules: an end stroke is one that starts inside the extra screen (-0.1 < p < 1.1). Intended end: finger down
// (closing) -> rest p <= 0.05 (closed, or out of the screen); finger up (opening) -> rest p >= 0.95. A miss: an end
// stroke whose rest is not its intended end. Left the end (fling-out): a close stroke from open whose rest is p < -0.15.
// Return to open: after the lift the page went below p -0.15, then reached p >= 0.98 before the next touchstart.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const showStrokes = process.argv.includes('--strokes');
const files = args.flatMap((a) => (statSync(a).isDirectory() ? readdirSync(a).filter((f) => f.endsWith('.json') && !f.startsWith('serve-')).sort().map((f) => join(a, f)) : [a]));
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const run = d.run || {};
  const tot = { strokes: 0, end: 0, miss: 0, out: 0, outFling: 0, ret: 0, fv: [] };
  const rows = [];
  (run.segments || []).forEach((seg, si) => {
    const inj = (run.inject || []).find((x) => x.seg === si);
    const v = inj && (typeof inj.value === 'string' ? JSON.parse(inj.value) : inj.value);
    if (!v || !v.endH) return;
    const closed = v.maxY - v.endH, P = (y) => (y - closed) / v.endH;
    const tch = seg.touches || [];
    const starts = tch.filter((t) => t[1] === 's').map((t) => t[0]);
    const marks = seg.marks || [];
    starts.forEach((t0, k) => {
      const t1 = k + 1 < starts.length ? starts[k + 1] : Infinity;
      const mine = tch.filter((t) => t[0] >= t0 && t[0] < t1);
      const end = mine.find((t) => t[1] === 'e' || t[1] === 'c');
      if (!end) return;
      const moves = mine.filter((t) => t[1] === 'm' && t[6] !== null);
      const first = mine[0], dy = moves.length ? moves[moves.length - 1][6] - first[6] : 0; // + = finger down = closing
      const p0 = P(first[5]);
      const after = (v.scroll || []).filter((s) => s[0] >= end[0] && s[0] < t1);
      const rest = after.length ? P(after[after.length - 1][1]) : P(end[5]);
      let minP = P(end[5]), ret = false;
      for (const s of after) { const p = P(s[1]); if (p < minP) minP = p; if (minP < -0.15 && p >= 0.98) ret = true; }
      const mark = [...marks].reverse().find((m) => m[0] <= t0);
      const dbg = (v.dbg || []).find((x) => Math.abs(x[0] - end[7]) < 2 || Math.abs(x[0] - end[0]) < 2) || null;
      const isEnd = p0 > -0.1 && p0 < 1.1, closing = dy > 0;
      const miss = isEnd && Math.abs(dy) >= 20 && (closing ? rest > 0.05 : rest < 0.95);
      const out = isEnd && closing && p0 >= 0.9 && rest < -0.15;
      tot.strokes++; if (isEnd) tot.end++; if (miss) tot.miss++; if (out) tot.out++; if (ret) tot.ret++;
      if (dbg) tot.fv.push(r2(dbg[1]));
      rows.push({ seg: si, mark: mark ? mark[1] : null, dy, p0: r2(p0), rest: r2(rest), minP: r2(minP), ret, miss, out, fv: dbg ? r2(dbg[1]) : null, fl: dbg ? dbg[3] : null, travel: dbg && dbg.length > 5 ? dbg[5] : null });
    });
  });
  const fo = rows.filter((r) => r.mark === 'fling-out' && r.dy > 0);
  console.log(`${basename(f)}  strokes ${tot.strokes}, end strokes ${tot.end}, misses ${tot.miss}, fling-outs left the end ${fo.length ? `${fo.filter((r) => r.out).length}/${fo.length}` : '-'}, returned to open ${tot.ret}${run.aborted ? `, ABORTED ${run.aborted}` : ''}${(run.errors || []).length ? `, errors ${run.errors.length}` : ''}`);
  // per mark, close strokes from open (p0 >= 0.9, finger down): released = rest p < -0.15 (left the extra screen),
  // caught = rest at the closed end (-0.15 <= p <= 0.05), back = came back to open (p >= 0.98) with no finger down
  // (pulled back), other = rested part-open
  const by = {};
  for (const r of rows) {
    if (!(r.dy > 0 && r.p0 >= 0.9)) continue;
    const k = r.mark || '-', b = (by[k] ||= { n: 0, released: 0, caught: 0, back: 0, other: 0, fv: [], travel: [] });
    b.n++; if (r.ret || r.rest >= 0.98) b.back++; else if (r.rest < -0.15) b.released++; else if (r.rest <= 0.05) b.caught++; else b.other++;
    if (r.fv !== null) b.fv.push(r.fv); if (r.travel !== null) b.travel.push(r.travel);
  }
  for (const [k, b] of Object.entries(by)) console.log(`  closes from open @${k}: n ${b.n}, released ${b.released}, caught ${b.caught}, pulled back to open ${b.back}, part-open ${b.other}${b.fv.length ? `; Fv ${b.fv.join(' ')}` : ''}${b.travel.length ? `; travel ${b.travel.join(' ')}` : ''}`);
  if (tot.fv.length) console.log(`  __msFv at touchend (px/ms, + opening): ${tot.fv.join(' ')}`);
  for (const r of rows) if (showStrokes || r.miss || r.ret || r.mark === 'fling-out' || /E4/.test(r.mark || '')) console.log(`  ${JSON.stringify(r)}`);
}

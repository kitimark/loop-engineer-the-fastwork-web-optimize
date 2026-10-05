// toolbar-resize P-127 descriptive add-on (post hoc, NOT frozen, decides nothing): type, nesting path and lag after the end
// mark of the rule-W stackless records per arm. Usage: node fixes/toolbar-resize/p127-desc.mjs out/toolbar-resize/sim127
// Reads only frozen fields: type, children, data.message (TimeStamp), stackTrace.callFrames, startTime.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const D = process.argv[2];
const INVAL = new Set(['ScheduleStyleRecalculation', 'InvalidateLayout']);
for (const f of readdirSync(D).filter((x) => /^tl-d(16|1)-.*\.json$/.test(x)).sort()) {
  const a = JSON.parse(readFileSync(join(D, f), 'utf8'));
  const ends = [], opens = new Map(), sl = [];
  const visit = (kids, parent, path) => {
    for (const r of kids || []) {
      const m = r.type === 'TimeStamp' ? String(r.data?.message || '') : '';
      if (m.startsWith('p127end:')) ends.push({ i: Number(m.split(':').pop()), t: r.startTime * 1000 });
      else if (m.startsWith('p127:')) opens.set(Number(m.split(':').pop()), r.startTime * 1000);
      if (INVAL.has(r.type) && !(r.stackTrace?.callFrames || []).length) sl.push({ type: r.type, parent, path: path.join('>'), t: r.startTime * 1000 });
      visit(r.children, r.type, [...path, r.type]);
    }
  };
  visit(a.recs, 'TOP', []);
  const cnt = {}, lag = [];
  for (const e of ends) {
    const nx = opens.get(e.i + 1), w = Math.min(100, nx != null ? nx - e.t : 100);
    for (const s of sl.filter((s) => s.t > e.t && s.t <= e.t + w)) { const k = `${s.type} in ${s.path}`; cnt[k] = (cnt[k] || 0) + 1; lag.push(s.t - e.t); }
  }
  lag.sort((x, y) => x - y);
  const q = (p) => (lag.length ? lag[Math.floor(p * (lag.length - 1))].toFixed(1) : '-');
  console.log(`${a.arm.padEnd(22)} stackless total ${sl.length} in-window ${lag.length} ${JSON.stringify(cnt)} lag ms min ${q(0)} med ${q(0.5)} max ${q(1)}`);
}

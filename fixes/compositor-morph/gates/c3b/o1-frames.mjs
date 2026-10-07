// c3b O1 (arch-compositor-morph; a pure reader of k-sim.mjs pass O Timelines, no device): what the open frame of the
// FIRST open after load does that later opens do not. For each fw-open0 frame f1 (and f2): record types with count
// and ms (self and inclusive), every Paint with its clip rect size (from the quad) and ms, Composite children, and any
// record type that occurs in open 1 but in no later open.
//   node fixes/compositor-morph/gates/c3b/o1-frames.mjs out/cm/ksim/tlO-<arm>-<stamp>.json [--frames 2]
import { readFileSync } from 'node:fs';
const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const NF = process.argv.includes('--frames') ? Number(process.argv[process.argv.indexOf('--frames') + 1]) : 2;
const recs = JSON.parse(readFileSync(file, 'utf8'));
const ms = (x) => (((x.endTime ?? x.startTime) - x.startTime) * 1000);
const marks = (r) => { const out = []; const st = [r]; while (st.length) { const x = st.pop(); if (x.type === 'TimeStamp' && x.data?.message) out.push(x.data.message); st.push(...(x.children || [])); } return out; };
const frames = recs.filter((r) => r.type === 'RenderingFrame');
const opens = []; frames.forEach((r, i) => { if (marks(r).includes('fw-open0')) opens.push(i); });
const quadWH = (q) => q && q.length === 8 ? `${Math.round(Math.hypot(q[2] - q[0], q[3] - q[1]))}x${Math.round(Math.hypot(q[6] - q[0], q[7] - q[1]))}` : '?';
function summarize(r) {
  const types = {}; const paints = []; const once = new Set();
  const walk = (x, depth, path) => {
    const d = ms(x); const self = d - (x.children || []).reduce((s, c) => s + ms(c), 0);
    const t = (types[x.type] ||= { n: 0, ms: 0, self: 0 }); t.n++; t.ms += d; t.self += Math.max(0, self);
    if (x.type === 'Paint') paints.push(`${quadWH(x.data?.clip)}@${x.data?.clip ? Math.round(x.data.clip[0]) + ',' + Math.round(x.data.clip[1]) : '?'} ${d.toFixed(2)}`);
    once.add(x.type + (x.data?.type ? ':' + x.data.type : ''));
    for (const c of x.children || []) walk(c, depth + 1, path + '/' + x.type);
  };
  walk(r, 0, '');
  return { span: ms(r), types, paints, once };
}
console.log(`${file}: ${frames.length} frames, opens at frame ${opens.join(', ')}`);
const S = opens.map((i) => Array.from({ length: NF }, (_, d) => frames[i + d] && summarize(frames[i + d])));
S.forEach((fs, k) => fs.forEach((s, d) => {
  if (!s) return;
  console.log(`open ${k + 1} f${d + 1}: span ${s.span.toFixed(1)} ms`);
  console.log('  ' + Object.entries(s.types).sort((a, b) => b[1].ms - a[1].ms).map(([t, v]) => `${t} ${v.n}x ${v.ms.toFixed(1)} (self ${v.self.toFixed(1)})`).join(' | '));
  console.log(`  paints (${s.paints.length}): ${s.paints.join('; ')}`);
}));
if (S.length > 1) {
  const later = new Set(); S.slice(1).forEach((fs) => fs.forEach((s) => s && s.once.forEach((t) => later.add(t))));
  const only = [...S[0].flatMap((s) => (s ? [...s.once] : []))].filter((t) => !later.has(t));
  console.log(`record types in open 1 only: ${[...new Set(only)].join(', ') || '-'}`);
}
// the raw top-level children of open 1 f1, in order, with ms (to see what precedes Composite)
const f = frames[opens[0]];
if (f) console.log('open 1 f1 children: ' + (f.children || []).map((c) => `${c.type} ${ms(c).toFixed(1)}`).join(', '));
const g = frames[opens[1]];
if (g) console.log('open 2 f1 children: ' + (g.children || []).map((c) => `${c.type} ${ms(c).toFixed(1)}`).join(', '));

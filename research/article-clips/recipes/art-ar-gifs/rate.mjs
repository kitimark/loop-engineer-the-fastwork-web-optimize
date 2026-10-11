import { readFileSync } from 'node:fs';
const [file, ...wins] = process.argv.slice(2);
const j = JSON.parse(readFileSync(file, 'utf8')); const fr = j.frames; const t0 = fr[0][0];
console.log(file, 'frames', fr.length, 'keys', Object.keys(j).join(','), 'sample', JSON.stringify(fr[1]));
for (const w of wins) { const [a, b] = w.split(':').map(Number);
  const inw = fr.filter(f => f[0] - t0 >= a && f[0] - t0 < b);
  let distinct = 0, prev = null, maxgap = 0, lastT = null; for (const f of inw) { if (f[1] !== prev) { distinct++; if (lastT != null) maxgap = Math.max(maxgap, f[0]-lastT); lastT = f[0]; } prev = f[1]; }
  console.log(` ${a}-${b}s: samples ${inw.length} (${(inw.length/(b-a)).toFixed(1)}/s), distinct ${distinct} (${(distinct/(b-a)).toFixed(1)}/s), max distinct gap ${(maxgap*1000).toFixed(0)} ms`); }

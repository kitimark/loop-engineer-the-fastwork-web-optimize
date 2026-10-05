// Per-record band summary + slow-frame dt histogram + finer y split of P-124 records.
import fs from 'node:fs';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const tot = {}; const hist = {}; const ybins = {}; let allSlow = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const seg = j.summary.segments[0];
  const b = {}; for (const [k, v] of Object.entries(seg.bands)) { b[k] = `${v.frames}f >34:${v.gt34} >50:${v.gt50} max${v.max}`; tot[k] = (tot[k] || 0) + v.gt34; }
  console.log(f, JSON.stringify(b));
  if (f === files[0]) console.log('bandDefs', JSON.stringify(j.summary.bandDefs || seg.bandDefs || Object.keys(seg)));
  const s = j.run.segments[0];
  // moving or not: scrollY change vs previous frame
  for (let i = 1; i < s.frames.length; i++) {
    const [t, dt, y] = s.frames[i];
    if (dt <= 34) continue;
    const moving = y !== s.frames[i - 1][2] || (i + 1 < s.frames.length && s.frames[i + 1][2] !== y);
    const key = `${Math.floor(dt / 4) * 4}`; hist[key] = (hist[key] || 0) + 1;
    const yb = Math.floor(y / 500) * 500; ybins[yb] = ybins[yb] || { n: 0, mov: 0 }; ybins[yb].n++; if (moving) ybins[yb].mov++;
    allSlow.push({ f, t, dt, y, moving });
  }
}
console.log('total >34 per band', tot);
console.log('slow dt hist (4ms bins)', hist);
console.log('slow by y (500px bins, scrollY top)', ybins);
console.log('n slow', allSlow.length, 'moving', allSlow.filter(x => x.moving).length);

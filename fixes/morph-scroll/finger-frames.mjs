// C-052 frame gaps per capture: moving frames (scrollY changed since the previous frame), split by zone
// (the extra screen at the end: p >= -0.1) and finger down/up. Counts dt > 20 / 34 / 50 ms (phone thresholds).
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8')), fr = j.frames;
  const maxE = Math.max(...fr.map((x) => x[2] + x[3]));
  const ends = {}; for (const x of fr) if (x[2] + x[3] >= maxE - 300) ends[x[2] + x[3]] = (ends[x[2] + x[3]] || 0) + 1;
  const sH = +Object.entries(ends).sort((a, b) => b[1] - a[1])[0][0], lvh = Math.max(...fr.map((x) => x[3]));
  // finger-down intervals from touches [t, type, n, ...]
  const downs = []; let s = null;
  for (const t of j.touches) { if (t[1] === 's' && s == null) s = t[0]; if ((t[1] === 'e' || t[1] === 'c') && t[2] === 0 && s != null) { downs.push([s, t[0]]); s = null; } }
  const isDown = (t) => downs.some(([a, b]) => t >= a && t <= b);
  const b = {};
  const add = (k, dt) => { const r = (b[k] ||= { n: 0, g20: 0, g34: 0, g50: 0, max: 0 }); r.n++; if (dt > 20) r.g20++; if (dt > 34) r.g34++; if (dt > 50) r.g50++; r.max = Math.max(r.max, dt); };
  for (let i = 1; i < fr.length; i++) {
    const [t, dt, y, ih] = fr[i]; if (y === fr[i - 1][2]) continue;
    const p = (y - (sH - ih - lvh)) / lvh, zone = p >= -0.1 ? 'zone' : 'plain', fing = isDown(t) ? 'down' : 'up';
    add('all', dt); add(zone, dt); add(zone + '/' + fing, dt);
  }
  console.log(j.label, `docEnd ${sH} lvh ${lvh} touches ${downs.length}`);
  for (const [k, r] of Object.entries(b)) console.log(`  ${k.padEnd(11)} moving ${String(r.n).padStart(5)}  >20 ${(100 * r.g20 / r.n).toFixed(1).padStart(5)} %  >34 ${String(r.g34).padStart(3)}  >50 ${String(r.g50).padStart(3)}  max ${r.max} ms`);
}

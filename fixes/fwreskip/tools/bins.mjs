// Per-250 px Layout counts (>= MIN ms) by direction from vfix T runs (T-<arm>.tl.json), summed over the files given
// per arm label (label = file name without T- and the trailing run digit). Attribution only (Sim Timeline).
// usage: MIN=3 Y0=2250 Y1=3750 node bins.mjs <T-*.tl.json>...
import { readFileSync } from 'node:fs';
const MIN = +(process.env.MIN || 3), Y0 = +(process.env.Y0 || 2250), Y1 = +(process.env.Y1 || 3750), BIN = 250;
const tab = {}; const runs = {};
for (const file of process.argv.slice(2)) {
  const arm = file.split('/').pop().replace(/^T-/, '').replace(/\.tl\.json$/, '').replace(/\d+$/, '');
  runs[arm] = (runs[arm] || 0) + 1;
  const tl = JSON.parse(readFileSync(file));
  const flat = []; const walk = (x) => { flat.push(x); for (const c of x.children || []) walk(c); };
  for (const x of tl.recs) walk(x);
  const at = (t) => { let f = tl.fr[0]; for (const x of tl.fr) { if (x[0] > t) break; f = x; } return f; };
  const dir = (t) => (t >= tl.m.down[0] && t <= tl.m.down[1] ? 'down' : t >= tl.m.up[0] && t <= tl.m.up[1] ? 'up' : null);
  for (const L of flat) {
    if (L.type !== 'Layout' || ((L.endTime ?? L.startTime) - L.startTime) * 1000 < MIN) continue;
    const t = L.startTime * 1000 - tl.off; const d = dir(t); if (!d) continue;
    const y = at(t)[2]; if (y < Y0 || y >= Y1) continue;
    const k = `${d} ${Math.floor(y / BIN) * BIN}`;
    tab[k] = tab[k] || {}; tab[k][arm] = (tab[k][arm] || 0) + 1;
  }
}
const arms = Object.keys(runs);
console.log(`| dir | y bin | ${arms.map((a) => `${a} (n=${runs[a]})`).join(' | ')} |`);
console.log(`|---|---|${arms.map(() => '---').join('|')}|`);
for (const d of ['down', 'up']) for (let y = Y0; y < Y1; y += BIN) { const r = tab[`${d} ${y}`] || {}; console.log(`| ${d} | ${y}-${y + BIN} | ${arms.map((a) => r[a] || 0).join(' | ')} |`); }

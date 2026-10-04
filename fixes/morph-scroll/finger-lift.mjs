// slow moving frames (> 34 ms) by time since the last finger lift, per capture; plus capture start and Mac state
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8')), fr = j.frames;
  const lifts = j.touches.filter((t) => (t[1] === 'e' || t[1] === 'c') && t[2] === 0).map((t) => t[0]);
  const bins = { down: [0, 0], '0-100': [0, 0], '100-300': [0, 0], '300-600': [0, 0], '600+': [0, 0] };
  const downs = []; let s = null;
  for (const t of j.touches) { if (t[1] === 's' && s == null) s = t[0]; if ((t[1] === 'e' || t[1] === 'c') && t[2] === 0 && s != null) { downs.push([s, t[0]]); s = null; } }
  for (let i = 1; i < fr.length; i++) {
    const [t, dt, y] = fr[i]; if (y === fr[i - 1][2]) continue;
    let k; if (downs.some(([a, b]) => t >= a && t <= b)) k = 'down'; else { const l = lifts.filter((x) => x <= t).at(-1); const d = l == null ? 1e9 : t - l; k = d < 100 ? '0-100' : d < 300 ? '100-300' : d < 600 ? '300-600' : '600+'; }
    bins[k][0]++; if (dt > 34) bins[k][1]++;
  }
  // idle frames (page not moving) > 20 ms: a heat / background-load hint independent of the morph
  let idle = 0, idleSlow = 0; for (let i = 1; i < fr.length; i++) if (fr[i][2] === fr[i - 1][2]) { idle++; if (fr[i][1] > 20) idleSlow++; }
  console.log(j.label, Object.entries(bins).map(([k, [n, g]]) => `${k}: ${g}/${n}`).join('  '), ` idle>20: ${idleSlow}/${idle}`, j.startedAt, JSON.stringify(j.mac));
}

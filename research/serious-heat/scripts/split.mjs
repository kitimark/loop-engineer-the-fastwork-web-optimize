// P-124 slow frames (dt > 34): band (tools' frameBands rule), toolbar step (innerHeight change within +-1 frame),
// time since page ready, finger phase, and 'held' (scrollY unchanged) frames.
import fs from 'node:fs';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const agg = {};
const add = (k, f) => { agg[k] = agg[k] || { n: 0, tb: 0, down: 0, lift300: 0, dts: [] }; const a = agg[k]; a.n++; if (f.tb) a.tb++; if (f.ph === 'down') a.down++; if (f.ph === 'lift0_300') a.lift300++; a.dts.push(f.dt); };
const movingTot = {};
let heroFirst = [];
for (const file of files) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
  const s = j.run.segments[0];
  const fr = s.frames, maxY = (f) => (s.docH1 ?? s.docH) - f[3];
  const ev = s.touches.filter(t => t[1] !== 'm');
  const ready = j.run.reloads?.[0]?.readyPageMs ?? s.t0;
  let firstHeroT = null;
  for (let i = 1; i < fr.length; i++) {
    const f = fr[i];
    const moving = f[2] !== fr[i - 1][2];
    const band = !moving ? 'held' : f[2] < 900 ? 'hero' : f[2] >= maxY(f) - f[3] ? 'lastScreen' : 'middle';
    movingTot[band] = (movingTot[band] || 0) + 1;
    if (f[1] <= 34) continue;
    const tb = fr[i - 1][3] !== f[3] || (i + 1 < fr.length && fr[i + 1][3] !== f[3]) || (i > 1 && fr[i - 2][3] !== fr[i - 1][3]);
    let last = null; for (const e of ev) { if (e[0] <= f[0]) last = e; else break; }
    const ph = !last ? 'none' : last[1] === 's' ? 'down' : (f[0] - last[0] <= 300 ? 'lift0_300' : 'lift300p');
    add(band, { tb, ph, dt: f[1] });
    if (band === 'hero') heroFirst.push(Math.round((f[0] - ready) / 100) / 10);
  }
}
for (const [k, a] of Object.entries(agg)) {
  const d = a.dts.sort((x, y) => x - y);
  console.log(k, `slow ${a.n} of ${movingTot[k]} frames (${(100 * a.n / movingTot[k]).toFixed(1)} %)`, `toolbar-step ${a.tb}`, `finger down ${a.down}`, `<=300ms after lift ${a.lift300}`, `dt median ${d[d.length >> 1]} p90 ${d[Math.floor(d.length * 0.9)]} max ${d[d.length - 1]}`, `>50: ${d.filter(x => x > 50).length}`);
}
heroFirst.sort((a, b) => a - b);
console.log('hero slow frames, s after page ready:', heroFirst.join(' '));

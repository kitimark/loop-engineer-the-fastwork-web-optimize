// When do moving frames happen (s after ready), and slow rate by time window, all bands.
import fs from 'node:fs';
const dir = process.argv[2];
const win = (s) => s < 8.5 ? 'first 8.5 s' : s < 20 ? '8.5-20 s' : '20 s+';
const W = {}; const heroT = {};
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
  const s = j.run.segments[0]; const fr = s.frames;
  const ready = j.run.reloads?.[0]?.readyPageMs ?? s.t0;
  for (let i = 1; i < fr.length; i++) {
    const f = fr[i]; if (f[2] === fr[i - 1][2]) continue;
    const t = (f[0] - ready) / 1000, w = win(t);
    W[w] = W[w] || { n: 0, slow: 0 }; W[w].n++; if (f[1] > 34) W[w].slow++;
    if (f[2] < 900) { const k = Math.floor(t); heroT[k] = (heroT[k] || 0) + 1; }
  }
}
for (const [k, v] of Object.entries(W)) console.log(k, `${v.slow}/${v.n} = ${(100 * v.slow / v.n).toFixed(1)} %`);
console.log('hero moving frames by second after ready', heroT);

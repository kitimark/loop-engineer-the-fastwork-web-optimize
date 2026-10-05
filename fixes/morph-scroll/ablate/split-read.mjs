// T-193 items 3/4 split: read split-sim.mjs console logs (one or more), group the step lines by arm (in order; an arm
// is a run of lines with the same label, labels in --arms order), and print per arm and direction the mean paints,
// kpx and layouts over the 1.2 s step window, plus the mean paintCount of the top layers by class. Counts only.
//   node fixes/morph-scroll/ablate/split-read.mjs --arms base,fixp,nofilter,nobackdrop,all <log>...
import { readFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const names = arg('--arms', '').split(',').filter(Boolean);
const files = process.argv.slice(2).filter((x, i, a) => !x.startsWith('--') && !['--arms', '--per'].includes(a[i - 1]));
const re = /^(\S+) (glide|glideopen|restopen)\s+(close|open|rest)\s+p \S+ \| sum (\d+) (\d+) lay (\d+) \| max (\d+)\/(\d+) .*?\| layers \d+ -> \d+ (\[.*?\]) gone/;
const steps = [];
for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(re); if (m) steps.push(m); }
// arms change every 4 steps (glide, glideopen, glide, glideopen)
const per = Number(arg('--per', '4'));
const out = {};
steps.forEach((m, i) => {
  const arm = names[Math.floor(i / per)] || `arm${Math.floor(i / per)}`;
  const k = `${arm} ${m[3]}`;
  const o = (out[k] ||= { n: 0, paints: 0, kpx: 0, lay: 0, maxP: 0, layers: {} });
  o.n++; o.paints += +m[4]; o.kpx += +m[5]; o.lay += +m[6]; o.maxP = Math.max(o.maxP, +m[7]);
  for (const s of JSON.parse(m[9])) { const [, name, d] = s.match(/^(.*?)\*?:(\d+) /) || []; if (!name) continue; const c = name.replace(/\.is-[\w-]+/g, ''); o.layers[c] = (o.layers[c] || 0) + +d; }
});
console.log('arm dir      n  paints   kpx    layouts  maxFramePaints | top layers (paintCount, mean per step; top 8 listed per step only)');
for (const [k, o] of Object.entries(out)) {
  const top = Object.entries(o.layers).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => `${c.replace('div.start-selling-', '').replace('header.start-selling-', 'hdr.')}:${(v / o.n).toFixed(0)}`).join(' ');
  console.log(k.padEnd(18), o.n, String(Math.round(o.paints / o.n)).padStart(6), String(Math.round(o.kpx / o.n)).padStart(7), String(Math.round(o.lay / o.n)).padStart(6), String(o.maxP).padStart(6), '|', top);
}

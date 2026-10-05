// Per P-124 record: run length, first touch - page ready, hero / all moving frames and slow (>34) counts, toolbar-step
// slow, last-screen after-lift slow. Same rules as split.mjs. For P-129 rev 2 floors and gates (ops C4).
//   node perrun.mjs <dir of P-124 records>
import fs from 'node:fs';
const dir = process.argv[2];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
  const s = j.run.segments[0], fr = s.frames;
  const ready = j.run.reloads?.[0]?.readyPageMs ?? s.t0;
  const t1 = (s.touches || []).find((e) => e[1] === 's');
  const c = { hero: [0, 0], all: [0, 0], w1: [0, 0] };
  for (let i = 1; i < fr.length; i++) {
    const f = fr[i]; if (f[2] === fr[i - 1][2]) continue;
    const slow = f[1] > 34 ? 1 : 0;
    c.all[0]++; c.all[1] += slow;
    if (f[2] < 900) { c.hero[0]++; c.hero[1] += slow; }
    if (f[0] - ready < 8500) { c.w1[0]++; c.w1[1] += slow; }
  }
  console.log(file, `len ${((fr.at(-1)[0] - fr[0][0]) / 1000).toFixed(0)} s`, `firstTouch-ready ${t1 ? ((t1[0] - ready) / 1000).toFixed(2) : '-'} s`, `ready-t0 ${((ready - s.t0) / 1000).toFixed(2)} s`,
    `hero ${c.hero[1]}/${c.hero[0]}`, `W1 ${c.w1[1]}/${c.w1[0]}`, `all ${c.all[1]}/${c.all[0]}`);
}

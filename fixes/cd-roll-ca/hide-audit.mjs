// audit (review round 2, nit 1): the first (hold5 run) vs the second (--analyze) first-frame selection of hide-check.mjs,
// on the same saved raw log. Usage: node fixes/cd-roll-ca/hide-audit.mjs out/cd-roll-ca/hide-V0.json out/cd-roll-ca/hide-V.json
import { readFileSync } from 'node:fs';
const UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16;
function GE(e, t, n, r = UE) { let { value: i, velocity: a } = e, o = Math.max(0, n); for (; o > 0;) { let e = Math.min(o, WE) / 1e3; o -= WE; let n = (-r.stiffness * (i - t) - r.damping * a) / r.mass; a += n * e; i += a * e; }
  return Math.abs(a) < 0.01 && Math.abs(i - t) < 0.001 ? { state: { value: t, velocity: 0 }, done: true } : { state: { value: i, velocity: a }, done: false }; }
const r3 = (x) => Math.round(x * 1000) / 1000;
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const { frames: F, vis: V, anims } = j.log;
  const hides = V.filter((v) => v.hidden), shows = V.filter((v) => !v.hidden);
  const rows = [];
  hides.forEach((h, k) => {
    const s = shows.find((v) => v.now > h.now);
    const preF = [...F].reverse().find((f) => f.t <= h.now && !f.hidden);
    const postF = F.find((f) => f.cb > s.now && !f.hidden);
    const pick = { first: anims.filter((a) => a.now > h.now && a.now < s.now), second: anims.filter((a) => a.now > h.now && a.now <= postF.cb) };
    for (let i = 0; i < postF.ty.length; i++) {
      const out = {};
      for (const [m, R] of Object.entries(pick)) {
        const last = R.filter((a) => a.i === i).slice(-1)[0];
        if (!last) continue;
        const c = last.c, t0 = last.startTime ?? last.now;
        const o = GE({ value: -preF.ty[i] / c, velocity: 0 }, -last.to / c, postF.t - t0);
        const exp = -(((o.state.value % 10) + 10) % 10) * c;
        out[m] = { rollAt: r3(last.now), hidden: last.hidden, toPx: last.to, dtMs: r3(postF.t - t0), model: r3(exp), errPx: r3(Math.abs(postF.ty[i] - exp)) };
      }
      if (Object.keys(out).length) rows.push({ k, i, showEvent: r3(s.now), firstFrameCb: r3(postF.cb), build: r3(postF.ty[i]), ...out });
    }
  });
  console.log(f.replace(/^.*\//, ''), 'max first', Math.max(...rows.map((r) => r.first?.errPx ?? 0)), 'max second', Math.max(...rows.map((r) => r.second?.errPx ?? 0)));
  for (const r of rows) console.log(' ', JSON.stringify(r));
}

// movie time of the flick's first scroll movement per arm/seg (same mapping as fixes/people-blink/phone/pb-strip-plan.mjs)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const R = '.claude/worktrees/agent-ac97cdb0aa8f3a8b2/';
const MONO_OFF = 1790444203298;
for (const spec of process.argv.slice(2)) {
  const [arm, ts, segS] = spec.split(':'); const SEG = Number(segS);
  const g = JSON.parse(readFileSync(R + `out/pbp/g-${arm}-${ts}.json`, 'utf8'));
  const seg = g.run.segments[SEG], inj = g.run.inject.find((x) => x.seg === SEG).value;
  const mk = Object.fromEntries(seg.marks.map(([t, n]) => [n, t]));
  const tF = mk.fling, f = inj.f;
  const mv = f.find(([t, y]) => t >= tF && y > 1)[0];
  const s0 = seg.sync[0], toWall = (t) => t - s0[1] + (s0[0] + s0[2]) / 2;
  const base = readdirSync(R + 'out/iphone-screen').find((x) => x.includes(`-pb-${arm}-${ts}-`) && x.endsWith('.frames.json'));
  const fr = JSON.parse(readFileSync(join(R + 'out/iphone-screen', base), 'utf8')).frames;
  const firstWall = fr[0][0] * 1000 + MONO_OFF;
  const movT = (toWall(mv) - firstWall) / 1000;
  const flip = inj.m.find(([t, n, a, d]) => t >= tF && /section#people/.test(n) && a === 'class' && /\+is-visible/.test(d));
  const yAt = (t) => { let y = null; for (const [ft, fy] of f) { if (ft <= t) y = fy; else break; } return y; };
  const ys = []; for (let k = -200; k <= 3000; k += 100) ys.push(`${k}:${Math.round(yAt(mv + k))}`);
  console.log(JSON.stringify({ arm, ts, seg: SEG, base: base.replace('.frames.json', '.mov'), moveMovT: +movT.toFixed(3), flipAfterMove: flip ? Math.round(flip[0] - mv) : null, syncErr: Math.round((s0[2] - s0[0]) / 2), ys: ys.join(' ') }));
}

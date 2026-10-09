// people-blink: plan the phone strips (lead 2026-10-09, user T-228 #158): for each arm, the first fling's window in its
// ioscap .mov (movie time 0 = the first captured frame's PTS), the ffmpeg -ss/-t to cut it, and per output frame (fps)
// its page time after the scroll start and the page scrollY, for the sheet labels. Prints one PLAN line per arm, writes
// out/people-blink/phone-frames/plan.json. Usage: node fixes/people-blink/phone/pb-strip-plan.mjs <ARM>=<TS> ... [--seg N]
//   [--fps 10] [--pre 100] [--post 300] [--mono-off ms]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? Number(a.splice(i, 2)[1]) : d; };
const SEG = opt('--seg', 0), FPS = opt('--fps', 10), PRE = opt('--pre', 100), POST = opt('--post', 300), MONO_OFF = opt('--mono-off', 1790444203298);
const OUT = 'out/people-blink/phone-frames'; mkdirSync(OUT, { recursive: true });
const plan = [];
for (const spec of a) {
  const [arm, ts] = spec.split('=');
  const g = JSON.parse(readFileSync(`out/pbp/g-${arm}-${ts}.json`, 'utf8'));
  const seg = g.run.segments[SEG], inj = g.run.inject.find((x) => x.seg === SEG).value;
  const tF = seg.marks.find(([, n]) => n === 'fling')[0];
  const f = inj.f;
  const mv = f.find(([t, y]) => t >= tF && y > 1)[0];
  const land = f[f.length - 1][1];
  const near = f.find(([t, y]) => t >= tF && y >= land - 20)[0];
  const s0 = seg.sync[0], toWall = (t) => t - s0[1] + (s0[0] + s0[2]) / 2;
  const base = readdirSync('out/iphone-screen').find((x) => x.includes(`-pb-${arm}-${ts}-`) && x.endsWith('.frames.json'));
  const fr = JSON.parse(readFileSync(join('out/iphone-screen', base), 'utf8')).frames;
  const firstWall = fr[0][0] * 1000 + MONO_OFF;
  const mov = join('out/iphone-screen', base.replace('.frames.json', '.mov'));
  const w0 = toWall(mv - PRE), w1 = toWall(near + POST);
  const ss = (w0 - firstWall) / 1000, dur = (w1 - w0) / 1000;
  const yAt = (t) => { let y = null; for (const [ft, fy] of f) { if (ft <= t) y = fy; else break; } return y; };
  const frames = [];
  for (let k = 0; k * (1000 / FPS) <= w1 - w0; k++) { const pt = mv - PRE + k * (1000 / FPS); frames.push({ n: k + 1, ms: Math.round(pt - mv), y: Math.round(yAt(pt)) }); }
  plan.push({ arm, ts, seg: SEG, mov, ss: +ss.toFixed(3), dur: +dur.toFixed(3), fps: FPS, moveMs: mv - tF, nearMs: Math.round(near - mv), land, frames });
  console.log(`PLAN ${arm} ss ${ss.toFixed(3)} t ${dur.toFixed(3)} mov ${mov} (move +${Math.round(mv - tF)} ms after the flick mark, near-landing +${Math.round(near - mv)} ms, land y ${Math.round(land)}, ${frames.length} frames)`);
}
writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ tool: 'fixes/people-blink/phone/pb-strip-plan.mjs', monoOff: MONO_OFF, plan }, null, 1));

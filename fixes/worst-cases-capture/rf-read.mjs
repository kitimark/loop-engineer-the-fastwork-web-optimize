#!/usr/bin/env node
// rf-read.mjs: reader for the Day 11 reveal-flick pair (fixes/worst-cases-capture/rf.sh; cap-end-orig, 2026-10-11).
// Per record out/rf/runs/<stamp>-ar-revealflick-<g0l|g0m>.json (iphone.mjs gesture with pb-lite injected), numbers only:
//   flick window = frames with t in (mark flick, mark flick-end] (wc-read.mjs's people window); counts dt > 30/34/38
//     (the >34 line and twins) and > 46/50/54 (the >50 line and twins), the longest frame and its scrollY;
//   reveal frame = the first frame after pb-lite's first `+is-visible` flip on section#people after the flick mark
//     (fixes/g0-0m/phone/g0m-reveal.mjs's FLICK method): its dt, scrollY and delay after the flip; R7 = the longest dt among
//     the reveal frame and the 3 frames before and after it (P-175's primary);
//   thermal start/end from meta.profile; the recorder's numbers from out/iphone-screen/<same>.json when present.
//   node fixes/worst-cases-capture/rf-read.mjs [runs dir, default out/rf/runs] [--json out.json]
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2), ji = args.indexOf('--json');
const dir = args.find((a, i) => !a.startsWith('--') && i !== ji + 1) || 'out/rf/runs';
const TH = [30, 34, 38, 46, 50, 54];
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const rows = [];
for (const f of readdirSync(dir).filter((n) => /-ar-revealflick-(g0l|g0m)\.json$/.test(n)).sort()) {
  const g = JSON.parse(readFileSync(join(dir, f), 'utf8')), s = g.run?.segments?.[0];
  const arm = f.includes('-g0m') ? 'g0m' : 'g0l', name = f.replace(/\.json$/, '');
  if (!s) { rows.push({ name, arm, err: 'no segment' }); continue; }
  const mk = Object.fromEntries((s.marks || []).map(([t, m]) => [m, t]));
  const all = s.frames || [], win = all.filter(([t]) => t > mk.flick && t <= mk['flick-end']);
  const cnt = Object.fromEntries(TH.map((th) => [`>${th}`, win.filter((x) => x[1] > th).length]));
  const worst = win.reduce((a, b) => (!a || b[1] > a[1] ? b : a), null);
  const v = g.run?.inject?.find((x) => x.seg === 0)?.value, inj = typeof v === 'string' ? JSON.parse(v) : v;
  const flip = inj?.m?.find(([t, nm, at, d]) => t >= mk.flick - 50 && /section#people/.test(nm) && at === 'class' && /\+is-visible/.test(d))?.[0];
  const k = flip == null ? -1 : all.findIndex(([t]) => t > flip), rf = k >= 0 ? all[k] : null;
  const W = k >= 0 ? all.slice(Math.max(0, k - 3), k + 4) : [];
  const p = g.meta?.profile || {}, ps = p.start || {}, pe = p.end || {};
  const cap = existsSync(`out/iphone-screen/${name}.json`) ? JSON.parse(readFileSync(`out/iphone-screen/${name}.json`, 'utf8')) : null;
  rows.push({ name, arm, aborted: !!g.run?.aborted, frames: win.length, windowS: r1((mk['flick-end'] - mk.flick) / 1000), counts: cnt,
    longest: worst ? { dt: worst[1], y: worst[2] } : null,
    reveal: rf ? { dt: rf[1], y: rf[2], afterFlipMs: r1(rf[0] - flip), r7: Math.max(...W.map((x) => x[1])) } : { err: flip == null ? 'no flip in the page log' : 'no frame after the flip' },
    thermal: `${ps.state ?? '?'} ${ps.battC ?? '?'} -> ${pe.state ?? '?'} ${pe.battC ?? '?'}`, recorder: cap ? { frames: cap.frames ?? null, fps: cap.distinctFps ?? cap.fps ?? null } : null });
}
for (const r of rows) console.log(r.err ? `${r.name} ${r.err}` : `${r.name} (${r.arm})${r.aborted ? ' ABORTED' : ''} flick window ${r.frames} frames ${r.windowS} s | >34 ${r.counts['>34']} (${r.counts['>30']}/${r.counts['>38']}) >50 ${r.counts['>50']} (${r.counts['>46']}/${r.counts['>54']}) | longest ${r.longest?.dt} ms at y ${r.longest?.y} | reveal frame ${r.reveal.err ?? `${r.reveal.dt} ms at y ${r.reveal.y} (+${r.reveal.afterFlipMs} ms after the flip), R7 ${r.reveal.r7}`} | ${r.thermal}`);
if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify({ tool: 'fixes/worst-cases-capture/rf-read.mjs', dir, rows }, null, 1));

#!/usr/bin/env node
// nav-fade phone read (for P-142's G block, standing in for P-139): frame gaps in the nav-fade windows of a G run.
// Input: the JSON that `iphone.mjs gesture … --out <f>` writes (run.segments[].frames = [t, dt, scrollY, innerHeight],
// tools/lib/gesture-rec.mjs). No page logger needed: the windows come from scrollY crossings of the code thresholds.
//
// Windows (crossing frame -> + window ms, per segment, each crossing counted once until the page leaves the zone):
//   flipDown / flipUp  hero progress crosses 0.72 (is-hero-pill off / on; v9-final JS 14149):
//                      y_flip = trackTop + 0.72 * max(1, trackH - innerHeight), .hero-track height 200vh (CSS 1630),
//                      iOS vh = lvh. Window 1600 ms (reveal sweep 0.52 s delay + 0.98 s, CSS 12060-12082).
//   endIn / endOut     the end morph m = (y - (docH - innerHeight - L)) / L, L = .fw-ms-end height = 100lvh
//                      (v9-final JS 14308-14309, CSS 12411); .is-earn-hidden on at m >= 0.2, off at m <= 0 (JS 13938).
//                      Window 1000 ms (the Join hide/show WA <= 680 ms, JS 13957; the switch's is-on-dark 0.24 s).
//                      docH = max over the segment of (scrollY + innerHeight), so an end window needs a segment that
//                      reaches the page end: end windows are counted only in segments whose max scrollY is >= --min-end-y
//                      (default 4 * lvh = 3260; the hero flick programs stop near 1800), else they are flagged noBottom.
// Per window: frames, and counts of dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38), frames in the near bands
// (30, 38] and (46, 54] (CLAUDE.md "Frame thresholds", phone). The first frame of a segment (no dt) is skipped.
// Parameters (defaults for the iPhone 15 Pro Max in Safari at 430 wide; pass the run's values if they differ):
//   --lvh 815 (large viewport height = 100vh = 100lvh)   --track-top 0 (.hero-track top in the document)
//   --flip-ms 1600  --end-ms 1000  --min-end-y <4 * lvh>
// Usage:
//   node fixes/nav-fade/phone/nf-read.mjs run <gesture.json> [...]            per-run windows (JSON lines)
//   node fixes/nav-fade/phone/nf-read.mjs compare --C <f,f,...> --V <f,f,...>  per arm and window kind: per-run totals,
//        ranges, and the no-worse verdict per count (WORSE only when V's min > C's max over >= 3 runs per arm, as the
//        study's range rule; otherwise "no worse"); threshold-sensitive when a twin's verdict differs.
//   node fixes/nav-fade/phone/nf-read.mjs --selftest
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const P = { lvh: +opt('--lvh', 815), trackTop: +opt('--track-top', 0), flipMs: +opt('--flip-ms', 1600), endMs: +opt('--end-ms', 1000) };
P.minEndY = +opt('--min-end-y', 4 * P.lvh);
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const KINDS = ['flipDown', 'flipUp', 'endIn', 'endOut'];

export function windows(frames, p = P) {
  const out = [];
  if (!frames?.length) return out;
  const docH = Math.max(...frames.map((f) => f[2] + f[3]));
  const maxY = Math.max(...frames.map((f) => f[2]));
  const reachedBottom = maxY >= (p.minEndY ?? 4 * p.lvh);
  const flipY = (ih) => p.trackTop + 0.72 * Math.max(1, 2 * p.lvh - ih);
  const morph = (y, ih) => (y - (docH - ih - p.lvh)) / p.lvh;
  let pill = null, hidden = null; // state from the previous frame
  const open = [];
  for (let i = 0; i < frames.length; i++) {
    const [t, dt, y, ih] = frames[i];
    const nowPill = !(y >= flipY(ih));
    const m = morph(y, ih);
    const nowHidden = hidden === null ? m >= 0.2 : hidden ? !(m <= 0) : m >= 0.2;
    if (pill !== null && nowPill !== pill) open.push({ kind: nowPill ? 'flipUp' : 'flipDown', t0: t, y0: y, end: t + p.flipMs });
    if (hidden !== null && nowHidden !== hidden) open.push({ kind: nowHidden ? 'endIn' : 'endOut', t0: t, y0: y, end: t + p.endMs, bottom: reachedBottom });
    pill = nowPill; hidden = nowHidden;
  }
  for (const w of open) {
    const fr = frames.filter((f, i) => i > 0 && f[1] != null && f[0] > w.t0 && f[0] <= w.end);
    const c = { kind: w.kind, t0: w.t0, y0: w.y0, frames: fr.length };
    for (const [k, v] of Object.entries(TH)) c[k] = fr.filter((f) => f[1] > v).length;
    c.near34 = fr.filter((f) => f[1] > 30 && f[1] <= 38).length;
    c.near50 = fr.filter((f) => f[1] > 46 && f[1] <= 54).length;
    if (w.kind.startsWith('end') && !w.bottom) c.noBottom = true;
    out.push(c);
  }
  return out;
}

export function readRun(file, p = P) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const segs = j.segments || j.run?.segments || [];
  const ws = segs.flatMap((s, i) => windows(s.frames || [], p).map((w) => ({ seg: i, ...w })));
  const tot = {};
  for (const k of KINDS) {
    const list = ws.filter((w) => w.kind === k && !w.noBottom);
    tot[k] = { windows: list.length, frames: list.reduce((a, w) => a + w.frames, 0) };
    for (const c of [...Object.keys(TH), 'near34', 'near50']) tot[k][c] = list.reduce((a, w) => a + w[c], 0);
  }
  return { file, windows: ws, totals: tot, errors: j.errors?.length ?? 0, aborted: j.aborted ?? null };
}

export function compare(C, V) {
  const out = {};
  for (const k of KINDS) {
    const r = { C: C.map((x) => x.totals[k]), V: V.map((x) => x.totals[k]) };
    const v = {};
    for (const c of Object.keys(TH)) {
      const a = r.C.map((x) => x[c]), b = r.V.map((x) => x[c]);
      const enough = a.length >= 3 && b.length >= 3;
      v[c] = { C: [Math.min(...a), Math.max(...a)], V: [Math.min(...b), Math.max(...b)], verdict: !enough ? 'too few runs' : Math.min(...b) > Math.max(...a) ? 'WORSE' : 'no worse' };
    }
    const sens = (main, tw) => tw.some((x) => v[x].verdict !== v[main].verdict);
    out[k] = { windowsC: r.C.map((x) => x.windows), windowsV: r.V.map((x) => x.windows), counts: v,
      gt50: v.gt50.verdict + (sens('gt50', ['gt46', 'gt54']) ? ' (threshold-sensitive)' : ''),
      gt34: v.gt34.verdict + (sens('gt34', ['gt30', 'gt38']) ? ' (threshold-sensitive)' : '') };
  }
  out.verdict = KINDS.some((k) => /WORSE/.test(out[k].gt50) || /WORSE/.test(out[k].gt34)) ? 'WORSE' : KINDS.some((k) => /too few/.test(out[k].gt50)) ? 'too few runs' : 'no worse';
  return out;
}

function selftest() {
  const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); process.exitCode = 1; } else console.log('ok ' + m); };
  // synthetic segment: 16.7 ms frames, scroll 0 -> page end (docH 6000, ih 775) and back to 0
  const fr = []; let t = 0;
  const ys = [...Array(300).keys()].map((i) => Math.min(5225, i * 20)).concat([...Array(300).keys()].map((i) => Math.max(0, 5225 - i * 20)));
  for (const y of ys) { fr.push([t, fr.length ? 16.7 : null, y, 775]); t += 16.7; }
  // two long frames right after the down flip (y_flip = 0.72 * (1630 - 775) = 615.6 -> first y >= 615.6 is 620)
  const iFlip = fr.findIndex((f) => f[2] >= 615.6); fr[iFlip + 3][1] = 60; fr[iFlip + 5][1] = 36;
  const w = windows(fr);
  const k = w.map((x) => x.kind).join(',');
  ok(k === 'flipDown,endIn,endOut,flipUp', 'window order ' + k);
  const fd = w.find((x) => x.kind === 'flipDown');
  ok(fd.gt50 === 1 && fd.gt34 === 2 && fd.gt54 === 1 && fd.gt38 === 1 && fd.near34 === 1, 'flipDown counts ' + JSON.stringify(fd));
  ok(Math.abs(fd.y0 - 620) < 1, 'flip crossing y ' + fd.y0);
  const ei = w.find((x) => x.kind === 'endIn'); // m >= 0.2: y >= 6000 - 775 - 815 + 163 = 4573
  ok(ei.y0 >= 4573 && ei.y0 < 4593 && !ei.noBottom, 'endIn crossing y ' + ei.y0);
  const eo = w.find((x) => x.kind === 'endOut'); // m <= 0: y <= 4410
  ok(eo.y0 <= 4410 && eo.y0 > 4390, 'endOut crossing y ' + eo.y0);
  // a segment that never reaches the bottom: end windows flagged
  const half = fr.filter((f) => f[2] < 3000);
  ok(windows(half).filter((x) => x.kind.startsWith('end')).every((x) => x.noBottom), 'end windows short of the end are flagged noBottom');
  const mk = (n50) => ({ totals: Object.fromEntries(KINDS.map((k2) => [k2, { windows: 1, frames: 90, gt50: n50, gt46: n50, gt54: n50, gt34: n50, gt30: n50, gt38: n50, near34: 0, near50: 0 }])) });
  ok(compare([mk(0), mk(1), mk(0)], [mk(0), mk(1), mk(1)]).verdict === 'no worse', 'compare no worse');
  ok(compare([mk(0), mk(0), mk(0)], [mk(1), mk(2), mk(1)]).verdict === 'WORSE', 'compare WORSE');
  ok(compare([mk(0)], [mk(0)]).verdict === 'too few runs', 'compare too few');
}

const cmd = argv[0];
if (cmd === '--selftest') selftest();
else if (cmd === 'run') for (const f of argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')))) console.log(JSON.stringify(readRun(f)));
else if (cmd === 'compare') {
  const C = opt('--C', '').split(',').filter(Boolean).map((f) => readRun(f)), V = opt('--V', '').split(',').filter(Boolean).map((f) => readRun(f));
  console.log(JSON.stringify({ params: P, C: C.map((x) => ({ file: x.file, totals: x.totals, errors: x.errors })), V: V.map((x) => ({ file: x.file, totals: x.totals, errors: x.errors })), result: compare(C, V) }, null, 1));
} else { console.log('usage: nf-read.mjs run <gesture.json>... | compare --C a,b,c --V d,e,f | --selftest'); process.exitCode = 1; }

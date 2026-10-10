// Worst-case captures (cap-worst, 2026-10-09): per-window frame counts from the iPhone's own rAF log in each G record
// (out/wc/runs/<stamp>-wc-<case>-<orig|g0l>.json, written by `iphone.mjs gesture`), plus the screen recorder's numbers
// (out/iphone-screen/<same>.json) and the thermal read. Numbers only; prints no URL (the records hold the LAN address).
// Windows were fixed before any data (plan to the lead, 2026-10-09 ~12:00Z). A frame [t, dt, scrollY, innerHeight]
// covers (t - dt, t]; it is in a window when t is in (start, end]. Phone thresholds (CLAUDE.md): > 34 and > 50 ms with
// the +-4 ms twins (30/38, 46/54); worst frame.
//   hero   rest  = (mark rest, mark fade]       the countdown at rest at the top (12 s)
//          fade  = (mark fade, mark end]        3 slow drags through the hero cards' fade-out
//   middle deck  = scrollY in [1000, 1700)      people deck under a slow drag
//          dark  = scrollY in [1850, 2100)      the dark section comes in (~1,970), nav turns dark
//          switch= scrollY in [2500, 2760)      the switch into #platform (~2,610; 345 -> 99 restyled elements)
//          all   = (mark approach, mark approach-end]
//   people flick = (mark flick, mark flick-end] one flick that lands on the people deck, 3 s rest
//   end    end   = (first frame with scrollY >= 4900, mark done]   last screen and the menu pushes
//          push  = (mark E20-close-fast-60px-50ms, mark done]
//   flick  all   = (mark down1, mark end]       fast flicks through the top card and back, twice
// usage: node fixes/worst-cases-capture/wc-read.mjs [runs dir, default out/wc/runs] [--json out/wc/read.json]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const dir = args.find((a, i) => !a.startsWith('--') && i !== ji + 1) || 'out/wc/runs';
const jsonOut = ji >= 0 ? args[ji + 1] : null;

const count = (fr) => {
  const c = (x) => fr.filter((f) => f[1] > x).length;
  return { n: fr.length, gt30: c(30), gt34: c(34), gt38: c(38), gt46: c(46), gt50: c(50), gt54: c(54),
    max: fr.length ? Math.max(...fr.map((f) => f[1])) : null,
    worstAtY: fr.length ? fr.reduce((a, b) => (b[1] > a[1] ? b : a))[2] : null };
};
const mark = (seg, name) => (seg.marks || []).find((m) => m[1] === name)?.[0];
const byT = (seg, a, b) => (a == null || b == null ? [] : seg.frames.filter((f) => f[0] > a && f[0] <= b));
const byY = (fr, lo, hi) => fr.filter((f) => f[2] >= lo && f[2] < hi);

function windows(cs, seg) {
  const end = seg.frames.length ? seg.frames[seg.frames.length - 1][0] : null;
  switch (cs) {
    case 'hero': return { rest: byT(seg, mark(seg, 'rest'), mark(seg, 'fade')), fade: byT(seg, mark(seg, 'fade'), mark(seg, 'end') ?? end) };
    case 'middle': {
      const all = byT(seg, mark(seg, 'approach'), mark(seg, 'approach-end') ?? end);
      return { deck: byY(all, 1000, 1700), dark: byY(all, 1850, 2100), switch: byY(all, 2500, 2760), all };
    }
    case 'people': return { flick: byT(seg, mark(seg, 'flick'), mark(seg, 'flick-end') ?? end) };
    case 'end': {
      const done = mark(seg, 'done') ?? end;
      const first = seg.frames.find((f) => f[2] >= 4900);
      return { end: first ? byT(seg, first[0] - first[1] - 0.001, done) : [], push: byT(seg, mark(seg, 'E20-close-fast-60px-50ms'), done),
        // added after the block (cap-worst 14:3xZ): both original runs aborted after E26 when the recorder stopped at its
        // 240 s cap (the link drop ends the driver), so the window every run covers is E20 -> E26: six pushes
        push6: byT(seg, mark(seg, 'E20-close-fast-60px-50ms'), mark(seg, 'E26-close-fast-60px-50ms')) };
    }
    case 'menu': return { pushes: byT(seg, mark(seg, 'P1-open-slow-hold'), mark(seg, 'done') ?? end) }; // Day 8 -ar- pair
    case 'carousel': return { rest: byT(seg, mark(seg, 'rest'), mark(seg, 'end') ?? end) }; // article pair, page at rest at the top
    case 'ptitle': return { title: byT(seg, mark(seg, 'title'), mark(seg, 'end') ?? end) }; // article pair, title stroke + 7 s still
    case 'flick': return { all: byT(seg, mark(seg, 'down1'), mark(seg, 'end') ?? end) };
    default: return {};
  }
}

const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => /-(wc|ar)-[a-z]+-(orig|g0l|v14|g0m)\.json$/.test(x)).sort()) {
  const m = f.match(/^(.*)-(?:wc|ar)-([a-z]+)-(orig|g0l|v14|g0m)\.json$/);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const segs = rec.run?.segments || [];
  const seg = segs.find((s) => (s.marks || []).length) || segs[0];
  if (!seg) { rows.push({ file: f, error: 'no segment' }); continue; }
  const w = windows(m[2], seg);
  const p = rec.meta?.profile || {};
  let cap = null;
  try {
    const c = JSON.parse(fs.readFileSync(path.join('out/iphone-screen', f), 'utf8'));
    cap = { frames: c.frames ?? c.result?.frames ?? null, distinctFps: c.distinctFps ?? c.result?.distinctFps ?? null };
  } catch { /* no recorder summary */ }
  rows.push({ file: f.replace(/\.json$/, ''), case: m[2], arm: m[3], at: rec.meta?.date,
    thermal: { start: p.start ? `${p.start.state} ${p.start.battC}` : null, end: p.end ? `${p.end.state} ${p.end.battC}` : null, drift: !!p.drift },
    load1: [rec.meta?.mac?.start?.load1, rec.meta?.mac?.end?.load1], errors: (rec.run?.errors || []).length, aborted: !!rec.run?.aborted,
    windows: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, count(v)])), capture: cap });
}

for (const r of rows) {
  if (r.error) { console.log(r.file, r.error); continue; }
  console.log(`${r.file}  thermal ${r.thermal.start} -> ${r.thermal.end}${r.thermal.drift ? ' DRIFT' : ''}  load1 ${r.load1.join('/')}  errors ${r.errors}${r.aborted ? ' ABORTED' : ''}`);
  for (const [k, c] of Object.entries(r.windows)) {
    console.log(`  ${k.padEnd(6)} frames ${String(c.n).padStart(4)}  >34 ${c.gt34} (${c.gt30}/${c.gt38})  >50 ${c.gt50} (${c.gt46}/${c.gt54})  max ${c.max ?? '-'} ms at y ${c.worstAtY ?? '-'}`);
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ readAt: new Date().toISOString(), rows }, null, 1));

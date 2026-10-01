#!/usr/bin/env node
// Pacing v3 load: turn measured fastwork phone main-thread work into a replayable busy schedule.
//
//   node research/design-engineering/pacing-v3-load.mjs <iphone-runner out dir> <phase> <label>... [--write]
//   e.g. ... /path/to/out/iphone-runner scroll B7 B8 --write
//
// Source: iphone-runner's P3 block (P-019/P-020), files p3-<label>.json (page log: syncT, marks) and
// p3-<label>.tl.json (WebKit Timeline records, depth 1, F-047 sequence). baseline-A = B7, B8 (aw1-10e family
// baseline, postmortem-hero.md §7.9).
//
// Busy = the union of the intervals of every top-level Timeline record that is not a RenderingFrame, plus, per
// RenderingFrame, the span from its first child's start to its last child's end (a RenderingFrame record spans
// the whole frame, idle time included; its children are the work, and the short gaps between them are the
// rendering update's own steps, which the Timeline does not record). A task within 0.5 ms of other work joins it;
// two frames never merge. Times are page ms (performance.now() of the recorded page), cut to the named phase
// window and re-based to 0. Chunk = [startMs, busyMs, 'f' frame | 't' task].
//
// Caveats (also written into the config): Timeline-on runs (durations may be inflated by the instrumentation);
// the recorded page ran iphone-runner's rAF logger, whose scrollY read pays a forced Layout that the page would
// otherwise pay in its rendering update (P-023: neutral on layout counts) - it is part of the busy time here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [dir, phase, ...labels] = args.filter((a) => a !== '--write');
if (!dir || !phase || !labels.length) {
  console.error('usage: pacing-v3-load.mjs <iphone-runner out dir> <phase> <label>... [--write]');
  process.exit(2);
}
const dur = (x) => { const d = (x.endTime - x.startTime) * 1000; return Number.isFinite(d) ? d : 0; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const r1 = (x) => Math.round(x * 10) / 10;

const sources = [];
for (const label of labels) {
  const tlFile = path.join(dir, `p3-${label}.tl.json`), pgFile = path.join(dir, `p3-${label}.json`);
  const tl = JSON.parse(fs.readFileSync(tlFile, 'utf8')), pg = JSON.parse(fs.readFileSync(pgFile, 'utf8'));
  const off = tl.syncTL * 1000 - pg.syncT;
  const w = pg.marks[phase];
  if (!w) throw new Error(`${label}: no phase ${phase} in marks (${Object.keys(pg.marks)})`);
  // f = a rendering frame's work (replayed inside one rAF callback), t = a task outside a rendering frame
  // (replayed as its own task). Frames are never merged with each other: a run of 25 ms frames stays a run of
  // frames, each with a rendering opportunity after it, not one long block.
  const iv = [];
  for (const x of tl.recs) {
    let span, kind;
    if (x.type === 'RenderingFrame') {
      const ch = (x.children || []).filter((c) => dur(c) > 0);
      if (!ch.length) continue;
      span = [Math.min(...ch.map((c) => c.startTime)), Math.max(...ch.map((c) => c.endTime))]; kind = 'f';
    } else {
      if (dur(x) <= 0) continue;
      span = [x.startTime, x.endTime]; kind = 't';
    }
    const s = span[0] * 1000 - off, e = span[1] * 1000 - off;
    if (e <= w[0] || s >= w[1]) continue;
    iv.push([Math.max(s, w[0]), Math.min(e, w[1]), kind]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e, k] of iv) {
    const last = merged[merged.length - 1];
    // a task overlapping (or within 0.5 ms of) other work joins it; two frames stay separate
    if (last && s <= last[1] + 0.5 && !(k === 'f' && last[2] === 'f')) { last[1] = Math.max(last[1], e); if (k === 'f') last[2] = 'f'; }
    else merged.push([s, e, k]);
  }
  const chunks = merged.map(([s, e, k]) => [r1(s - w[0]), r1(e - s), k]).filter((c) => c[1] >= 0.5);
  const spanMs = r1(w[1] - w[0]);
  sources.push({
    run: `iphone-runner p3-${label}`, label, date: pg.meta?.date, device: pg.meta?.device,
    // no host: LAN addresses stay out of committed files (Hard rule 12); the port names the served build
    servedPort: pg.href ? new URL(pg.href).port : null, arm: 'baseline-A (aw1-10e family, postmortem-hero.md §7.9)',
    phase, window: w.map(r1), spanMs, chunks,
  });
}

// stats over all sources (pooled), for the README and the steady arm
const all = sources.flatMap((s) => s.chunks.map((c) => c[1]));
const spanAll = sources.reduce((a, s) => a + s.spanMs, 0);
const busyAll = all.reduce((a, b) => a + b, 0);
const stats = { spanMs: r1(spanAll), busyMs: r1(busyAll), busyShare: Math.round(1000 * busyAll / spanAll) / 1000, chunks: all.length };
const long = [], spacing = [];
for (const s of sources) {
  const l = s.chunks.filter((c) => c[1] >= 16.7);
  long.push(...l.map((c) => c[1]));
  spacing.push(...l.slice(1).map((c, i) => r1(c[0] - l[i][0])));
}
Object.assign(stats, {
  long: { n: long.length, perS: r1(1000 * long.length / spanAll), p50: r1(q(long, 0.5)), p90: r1(q(long, 0.9)), max: r1(Math.max(...long)) },
  longStartSpacing: { p10: r1(q(spacing, 0.1)), p50: r1(q(spacing, 0.5)), p90: r1(q(spacing, 0.9)) },
  chunkP50: r1(q(all, 0.5)), chunkP90: r1(q(all, 0.9)),
});
console.log(JSON.stringify(stats, null, 1));
for (const s of sources) console.log(s.run, s.date, s.phase, s.spanMs, 'ms,', s.chunks.length, 'chunks');

if (write) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.join(here, 'pacing', 'v3-load.js');
  const cfg = {
    generatedBy: 'research/design-engineering/pacing-v3-load.mjs',
    args: `<iphone-runner out> ${phase} ${labels.join(' ')}`,
    busyDefinition: 'per RenderingFrame: first child start to last child end (kind f, replayed in one rAF callback); top-level non-RenderingFrame records (kind t, own task; joined to adjacent work within 0.5 ms); frames never merged; page ms re-based to the phase start. chunk = [startMs, busyMs, kind]',
    caveats: [
      'Timeline-on runs: durations may be inflated by the instrumentation (OBSERVED cost unknown)',
      'the recorded page ran iphone-runner\'s rAF logger; its scrollY read pays a forced Layout the page would otherwise pay in its rendering update (P-023: neutral on layout counts); that Layout is counted here',
      'replayed as busy-waits in the synthetic page: same main-thread occupancy over time, not the same work (no style/layout/paint invalidation)',
    ],
    stats,
    sources,
  };
  fs.writeFileSync(out, `// GENERATED by research/design-engineering/pacing-v3-load.mjs - do not edit by hand.\n// Measured fastwork phone main-thread busy time, replayed by v3.js (window.FW_V3_LOAD).\nwindow.FW_V3_LOAD = ${JSON.stringify(cfg)};\n`);
  console.log('wrote', out);
}

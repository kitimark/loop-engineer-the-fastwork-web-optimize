#!/usr/bin/env node
// toolbar-resize ablation scorer (P-106, attribution block, judged as counts, no U-test).
//   node fixes/toolbar-resize/score-tr.mjs <folder> [run ...] [--json <out.json>]
// <folder> holds g-<run>.json (iphone.mjs gesture record) + tl-<run>.json (its --timeline) per run, and optionally
// runs.jsonl (tr.mjs log: run order, sentinels). <run> = "<arm>-<kind><n>" (e.g. C-H1, sticky-H2, cv-E1) or any
// name with both files (e.g. TH1 in iphone-runner's t113 folder). Without runs, every g-*.json with a tl-*.json.
//
// FROZEN filters (do not change after P-106 is registered; the card pins this file's sha256/12):
// - frames: every frame of the recorded segment (g.run.segments, the one with the most frames);
//   a frame is [t, dt, y, innerHeight, ...] in page ms.
// - toolbar-moving frame: 775 < innerHeight < 815 (phone, 430 wide; 775 = toolbar shown, 815 = collapsed).
// - zone split at phone y 3250: "hero" y < 3250 (hero track + #people rendered), "end" y >= 3250 (re-skipped by v7's far re-skip).
// - a Layout belongs to a frame when its Timeline start lies in (t - dt, t]; Timeline seconds -> page ms: s*1000 - tl.offsetMs.
// - largest Layout of a frame = max duration of its Layouts (0 when none); heavy frame = largest Layout >= 5 ms.
// - reported, not judged: heavyInterleaved = frames with a Layout >= heavy ms inside a RecalculateStyles record;
//   medianStyle / maxStyle = largest RecalculateStyles per moving frame (same window rule).
// - per run and zone: frames, heavy, heavyFrac, medianLargest (ms, over the zone's moving frames), meanLayouts,
//   slow counts dt > 30/34/38 and > 46/50/54 ms (goal thresholds with the +-4 ms twins), near-band counts (30,38] (46,54].
// - a run counts for the verdict when its zone has >= 8 moving frames ("thin" otherwise).
// Verdict (card fixes/toolbar-resize/README.md, P-106):
// - H arms (sticky cq dvh vt js): metric = heavyFrac of moving frames in the hero zone; neighbouring C = nearest C-H run
//   before and after each arm run in run order; cMean = mean over those C runs (each once).
//   WIN: every counted arm run <= 0.20 AND <= 0.5 * cMean (>= 2 counted runs). PARTIAL: every run <= 0.6 * cMean, not WIN.
//   NONE otherwise. threshold-sensitive: the WIN/PARTIAL/NONE call differs when heavy is 4 ms or 6 ms instead of 5.
// - cv (E runs, positive control for the far re-skip): metric = heavyFrac of moving frames in the end zone vs the
//   nearest C-E run(s). CONFIRMS when every cv-E run >= 0.5 and every neighbouring C-E run <= 0.1.
// - VOID: C-H hero-zone medianLargest drifts > 30 % from the first to the last C-H run, or a sentinel in runs.jsonl failed.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const pos = args.filter((x, i) => !(jsonAt >= 0 && (i === jsonAt || i === jsonAt + 1)));
const dir = pos[0];
if (!dir) { console.error('usage: score-tr.mjs <folder> [run ...] [--json out.json]'); process.exit(1); }

const HEAVY = 5, MOVE = (ih) => ih > 775 && ih < 815, SPLIT = 3250, MIN_FRAMES = 8;
const readJ = (f) => JSON.parse(readFileSync(f, 'utf8'));
const runsLog = existsSync(join(dir, 'runs.jsonl'))
  ? readFileSync(join(dir, 'runs.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];

let names = pos.slice(1);
if (!names.length) {
  const logged = runsLog.filter((r) => r.file && r.gestureExit === 0).map((r) => r.file.split('/').pop().replace(/^g-|\.json$/g, ''));
  const onDisk = readdirSync(dir).filter((f) => /^g-.+\.json$/.test(f)).map((f) => f.slice(2, -5)).filter((n) => existsSync(join(dir, `tl-${n}.json`)));
  names = [...logged.filter((n) => onDisk.includes(n)), ...onDisk.filter((n) => !logged.includes(n)).sort()];
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

function scoreRun(name, heavyMs = HEAVY) {
  const g = readJ(join(dir, `g-${name}.json`)), tl = readJ(join(dir, `tl-${name}.json`));
  const seg = [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  if (!seg) return { name, error: 'no segment' };
  const lays = [], styles = [];
  // rec[2]: the Layout runs inside a RecalculateStyles record = WebKit's style-interleaved layout (Document::resolveStyle
  // l.2843-2918 brackets the TreeResolver needsInterleavedLayout loop, l.2879-2890: query containers / anchor positioning)
  const walk = (r, inStyle) => { const rec = r.endTime != null ? [r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000, inStyle] : null;
    if (rec && r.type === 'Layout') lays.push(rec); if (rec && r.type === 'RecalculateStyles') styles.push(rec);
    (r.children || []).forEach((c) => walk(c, inStyle || r.type === 'RecalculateStyles')); };
  (tl.recs || []).forEach((r) => walk(r, false));
  const zones = {};
  for (const x of seg.frames) {
    const [t, dt, y, ih] = x;
    if (!MOVE(ih)) continue;
    const inF = lays.filter((l) => l[0] > t - dt && l[0] <= t);
    const big = inF.reduce((m, l) => Math.max(m, l[1]), 0);
    const st = styles.filter((l) => l[0] > t - dt && l[0] <= t).reduce((m, l) => Math.max(m, l[1]), 0);
    const z = (zones[y < SPLIT ? 'hero' : 'end'] ||= { frames: 0, heavy: 0, largest: [], style: [], layouts: 0, gt30: 0, gt34: 0, gt38: 0, gt46: 0, gt50: 0, gt54: 0, near34: 0, near50: 0 });
    z.frames++; if (big >= heavyMs) z.heavy++;
    if (inF.some((l) => l[2] && l[1] >= heavyMs)) z.heavyInterleaved = (z.heavyInterleaved || 0) + 1; z.largest.push(big); z.style.push(st); z.layouts += inF.length;
    for (const k of [30, 34, 38, 46, 50, 54]) if (dt > k) z[`gt${k}`]++;
    if (dt > 30 && dt <= 38) z.near34++; if (dt > 46 && dt <= 54) z.near50++;
  }
  for (const k of ['hero', 'end']) {
    const z = (zones[k] ||= { frames: 0, heavy: 0, largest: [], style: [], layouts: 0 });
    z.heavyFrac = z.frames ? r3(z.heavy / z.frames) : null; z.medianLargest = r3(median(z.largest));
    z.heavyInterleaved ||= 0; z.medianStyle = r3(median(z.style)); z.maxStyle = z.style.length ? r3(Math.max(...z.style)) : null; delete z.style;
    z.meanLayouts = z.frames ? r3(z.layouts / z.frames) : null; z.counted = z.frames >= MIN_FRAMES; delete z.largest;
  }
  const m = name.match(/^(\w+)-([HEF])(\d+)$/);
  return { name, arm: m ? m[1] : null, kind: m ? m[2] : null, frames: seg.frames.length, timelineLayouts: lays.length, zones };
}

function judge(runs) {
  const order = runs.map((r) => r.name);
  const neigh = (i, kind) => { const out = [];
    for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C' && runs[j].kind === kind) { out.push(runs[j]); break; }
    for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C' && runs[j].kind === kind) { out.push(runs[j]); break; }
    return out; };
  const arms = {};
  runs.forEach((r, i) => { if (!r.arm || r.arm === 'C') return; (arms[`${r.arm}:${r.kind}`] ||= []).push({ r, c: neigh(i, r.kind) }); });
  const verdicts = {};
  for (const [key, list] of Object.entries(arms)) {
    const [arm, kind] = key.split(':');
    const zone = kind === 'E' ? 'end' : 'hero';
    const cs = [...new Map(list.flatMap((x) => x.c).map((c) => [c.name, c])).values()];
    const cVals = cs.filter((c) => c.zones[zone].counted).map((c) => c.zones[zone].heavyFrac);
    const vals = list.filter((x) => x.r.zones[zone].counted).map((x) => x.r.zones[zone].heavyFrac);
    const cMean = cVals.length ? cVals.reduce((a, b) => a + b, 0) / cVals.length : null;
    let call;
    if (kind === 'E') call = vals.length >= 2 && cVals.length && vals.every((v) => v >= 0.5) && cVals.every((v) => v <= 0.1) ? 'CONFIRMS' : vals.length < 2 || !cVals.length ? 'INSUFFICIENT' : 'NOT-CONFIRMED';
    else if (vals.length < 2 || cMean == null) call = 'INSUFFICIENT';
    else if (vals.every((v) => v <= 0.2 && v <= 0.5 * cMean)) call = 'WIN';
    else if (vals.every((v) => v <= 0.6 * cMean)) call = 'PARTIAL';
    else call = 'NONE';
    verdicts[key] = { zone, runs: list.map((x) => ({ name: x.r.name, heavyFrac: x.r.zones[zone].heavyFrac, frames: x.r.zones[zone].frames, counted: x.r.zones[zone].counted, neighbours: x.c.map((c) => c.name) })),
      controls: cs.map((c) => ({ name: c.name, heavyFrac: c.zones[zone].heavyFrac, frames: c.zones[zone].frames, counted: c.zones[zone].counted })), cMean: r3(cMean), call };
  }
  const cH = runs.filter((r) => r.arm === 'C' && r.kind === 'H' && r.zones.hero.counted);
  let drift = null;
  if (cH.length >= 2) { const a = cH[0].zones.hero.medianLargest, b = cH[cH.length - 1].zones.hero.medianLargest; drift = { first: cH[0].name, last: cH[cH.length - 1].name, a, b, rel: a ? r3(Math.abs(b - a) / a) : null }; }
  const sentinels = runsLog.filter((r) => r.sentinel).map((r) => ({ step: r.step, scrollFps: r.scrollFps, bottomFps: r.bottomFps, pass: r.pass }));
  const voidWhy = [];
  if (drift && drift.rel != null && drift.rel > 0.3) voidWhy.push(`C-H hero medianLargest drift ${drift.rel} > 0.3`);
  if (sentinels.some((s) => !s.pass)) voidWhy.push('a sentinel failed');
  return { order, verdicts, drift, sentinels, void: voidWhy.length ? voidWhy : false };
}

const runs = names.map((n) => scoreRun(n)).filter((r) => !r.error);
const res = judge(runs);
// threshold sensitivity: re-judge with heavy at 4 and 6 ms
for (const h of [4, 6]) {
  const alt = judge(names.map((n) => scoreRun(n, h)).filter((r) => !r.error));
  for (const [k, v] of Object.entries(res.verdicts)) { v[`callHeavy${h}`] = alt.verdicts[k]?.call; }
}
for (const v of Object.values(res.verdicts)) v.thresholdSensitive = v.callHeavy4 !== v.call || v.callHeavy6 !== v.call;
const out = { scorer: 'fixes/toolbar-resize/score-tr.mjs', folder: dir.replace(/^.*\/(out\/)/, '$1'), heavyMs: HEAVY, split: SPLIT, minFrames: MIN_FRAMES, runs, ...res };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + '\n');
for (const r of runs) {
  const z = (k) => { const q = r.zones[k]; return `${k} ${q.heavy}/${q.frames} heavy (${q.heavyFrac ?? '-'}, in-style ${q.heavyInterleaved ?? 0}) medL ${q.medianLargest ?? '-'} ms lay/fr ${q.meanLayouts ?? '-'} medS ${q.medianStyle ?? '-'} maxS ${q.maxStyle ?? '-'} >34 ${q.gt34 ?? 0} >50 ${q.gt50 ?? 0}${q.counted ? '' : ' thin'}`; };
  console.log(`${r.name.padEnd(12)} ${z('hero')} | ${z('end')}`);
}
for (const [k, v] of Object.entries(res.verdicts)) console.log(`VERDICT ${k} ${v.call} (arm ${v.runs.map((x) => x.heavyFrac).join(',')} vs C ${v.controls.map((x) => x.heavyFrac).join(',')} mean ${v.cMean})${v.thresholdSensitive ? ' threshold-sensitive' : ''}`);
console.log(`DRIFT ${JSON.stringify(res.drift)} SENTINELS ${JSON.stringify(res.sentinels)} VOID ${JSON.stringify(res.void)}`);

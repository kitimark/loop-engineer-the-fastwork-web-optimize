// countdown-tick: fold the probe outputs (out/countdown-tick/{counts,pixels,resume}-*.json) and the model into
// fixes/countdown-tick/results.json. Count runs shorter than 200 s (the smoke test) are left out.
//   node fixes/countdown-tick/mkresults.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { REPO as WT } from '../../tools/lib/paths.mjs';

const OUT = join(WT, 'out/countdown-tick');
const files = readdirSync(OUT).filter((f) => f.endsWith('.json') && /^(counts|pixels|resume|logger)-/.test(f)).sort();
const load = (f) => ({ file: `out/countdown-tick/${f}`, ...JSON.parse(readFileSync(join(OUT, f), 'utf8')) });
const counts = files.filter((f) => f.startsWith('counts-')).map(load).filter((r) => r.window && r.window.seconds >= 200);
const pixels = files.filter((f) => f.startsWith('pixels-')).map(load).pop();
const resume = files.filter((f) => f.startsWith('resume-')).map(load).pop();
const loggers = files.filter((f) => f.startsWith('logger-')).map(load);
const sha = (p) => createHash('sha256').update(readFileSync(join(WT, p))).digest('hex');

const perGrid = {};
for (const r of counts) {
  const g = (perGrid[`grid${r.grid}`] ||= { runs: [], arms: {} });
  g.runs.push({ file: r.file, from: r.window.from, seconds: r.window.seconds, load1: r.load1 });
  for (const [arm, a] of Object.entries(r.arms_)) {
    const s = (g.arms[arm] ||= { seconds: 0, clockFires: 0, skippedSeconds: 0, repeatedSeconds: 0, labelSkips: 0, wrongValue: 0,
      lateIn0to40: 0, lateMinMs: Infinity, lateMaxMs: -Infinity, perRun: [], errors: 0 });
    s.seconds += a.windowS; s.clockFires += a.clockFires; s.skippedSeconds += a.skippedSeconds; s.repeatedSeconds += a.repeatedSeconds;
    s.labelSkips += a.labelSkips; s.wrongValue += a.wrongCount; s.lateIn0to40 += a.lateIn0to40; s.errors += a.errors.length;
    s.lateMinMs = Math.min(s.lateMinMs, a.lateMs.min); s.lateMaxMs = Math.max(s.lateMaxMs, a.lateMs.max);
    s.perRun.push({ s: a.windowS, fires: a.clockFires, skipped: a.skippedSeconds, repeated: a.repeatedSeconds, late: [a.lateMs.min, a.lateMs.max], timersOnPage: a.timersOnPage, sites: a.sites });
  }
  for (const s of Object.values(g.arms)) {
    s.firesPer60s = +((s.clockFires / s.seconds) * 60).toFixed(2);
    s.skippedPer10min = +((s.skippedSeconds / s.seconds) * 600).toFixed(2);
    s.repeatedPer10min = +((s.repeatedSeconds / s.seconds) * 600).toFixed(2);
  }
}

const model = JSON.parse(execFileSync(process.execPath, [join(WT, 'fixes/countdown-tick/model.mjs')], { encoding: 'utf8' }));
const model20 = JSON.parse(execFileSync(process.execPath, [join(WT, 'fixes/countdown-tick/model.mjs'), '--jitter', '20'], { encoding: 'utf8' }));

const res = {
  topic: 'countdown-tick',
  kind: 'counts + frozen-frame pixel identity (no timing A/B, no gain claim; less-work landing rule)',
  config: {
    chrome: 'headless Chrome, 430x932 DPR 3 mobile + touch, no CPU throttle (counts only), serve --vendors=local --https --latency 150 --no-cache, all arms of a run side by side in one browser, shared lane (--shared --weight probe)',
    baselineSnapshot: 'b1789284481295-4ad4a84a',
    timerGrid: 'forced by an init-script model of WebKit DOMTimer (fixes/countdown-tick/tick-probe.mjs header): nesting level >= 5 rounds the fire time up to a multiple of GRID ms on performance.now(); a repeating timer re-arms at its actual fire time + interval. GRID=30 = thermal mitigation, GRID=0 = Fair (WebKit re-arm semantics kept)',
    measurementCode: 'no change to tools/ (verify.mjs, lib/cdp.mjs, fix.mjs ab untouched); the probe uses tools/lib/cdp.mjs and tools/serve.mjs as they are',
    expiry: 'all runs before 2026-11-02 05:00Z (the probe refuses within 15 min of it)',
  },
  arms: {
    orig: 'baseline snapshot',
    tick: 'baseline + fixes/countdown-tick/patch.diff',
    v9: 'v9 step 4 (fixes/v9-best/patch.diff on main: JS de237379b556, CSS e1359ab9994a)',
    v9tick: 'v9 step 4 + fixes/countdown-tick-v9/patch.diff (delta on v9)',
  },
  patches: {
    'fixes/countdown-tick/patch.diff': sha('fixes/countdown-tick/patch.diff'),
    'fixes/countdown-tick-v9/patch.diff (delta stacked on v9-best)': sha('fixes/countdown-tick-v9/patch.diff'),
  },
  scripts: Object.fromEntries(['tick-probe.mjs', 'model.mjs', 'phone-logger.mjs', 'p130-read.mjs', 'p130-block.mjs', 'phone/idle-p130.json', 'phone/hold.sh', 'phone/serve.sh', 'phone/idle-raf.mjs'].map((f) => [f, sha(`fixes/countdown-tick/${f}`).slice(0, 12)])),
  servedJs: counts[0]?.served,
  counts: perGrid,
  resume: resume && { file: resume.file, grid: resume.grid, hideS: [7.4, 7.85], resumes: resume.resumes,
    note: 'after each scroll back to the top, the first label change equals the value of the live chain at that second (v9tick: exact by construction; v9: equals countdown-faces model value T0 + floor((now-T0)/1000) s, which its drifting interval would not show under the grid). Skipped seconds in this run are the hidden stretches (clock off screen, no writes), not visible skips.' },
  pixels: pixels && { file: pixels.file, grid: pixels.grid, pairs: pixels.pairs.map((p) => ({ a: p.a, b: p.b, label: p.label, bytesEqual: p.bytesEqual, diffPixels: p.diffPixels, maxChannelDelta: p.maxChannelDelta, size: [p.w, p.h] })),
    note: 'hero clock clip at rest (two byte-equal shots in a row, same label before and after), paired across arms by equal aria-label; orig/orig2 is the A/A' },
  loggerCheck: loggers.map((r) => ({ file: r.file, grid: r.grid, window: r.window,
    probe: Object.fromEntries(Object.entries(r.arms_).map(([a, x]) => [a, { skipped: x.skippedSeconds, fires: x.clockFires, late: [x.lateMs.min, x.lateMs.max] }])),
    logger: Object.fromEntries(Object.entries(r.logger).map(([a, x]) => [a, x.summary])),
    note: 'functional check of phone-logger.mjs (P-130) under the Chrome grid shim: its counts vs the probe own' })),
  model: { file: 'fixes/countdown-tick/model.mjs', jitter2ms: model.rows, jitter20ms: model20.rows,
    note: "'chain' = spec 3.3.1 as first written (tick writes Date.now()); 'nominal' = the shipped form (tick writes T0 + k s)" },
};
writeFileSync(join(WT, 'fixes/countdown-tick/results.json'), JSON.stringify(res, null, 1) + '\n');
const brief = Object.fromEntries(Object.entries(perGrid).map(([g, x]) => [g, Object.fromEntries(Object.entries(x.arms).map(([a, s]) => [a, `${s.seconds.toFixed(0)} s fires/60s ${s.firesPer60s} skipped ${s.skippedSeconds} (${s.skippedPer10min}/10min) repeated ${s.repeatedSeconds} wrong ${s.wrongValue} late ${s.lateMinMs}..${s.lateMaxMs} in0-40 ${s.lateIn0to40}/${s.clockFires} err ${s.errors}`]))]));
console.log(JSON.stringify(brief, null, 1));

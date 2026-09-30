// Summarise iPhone scripted-scroll runs with the SAME metric definitions as tools/chrome_scroll.mjs
// (frameStats / sectionOf / aggregate copied verbatim), plus refresh-rate-normalised metrics, the
// Timeline-chunk counts, and a comparison against the earlier finger-scroll recording (scroll1.json).
// Usage: node iphone_analyze.mjs [dataDir=../data/iphone] [fingerScroll=<dataDir>/finger_scroll1.json]
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const DIR = process.argv[2] || here + '../data/iphone';
const FINGER = process.argv[3] || DIR + '/finger_scroll1.json';

// ---- copied from chrome_scroll.mjs ----
const r1 = x => Math.round(x * 10) / 10;
const pct = (s, p) => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
function frameStats(fr, t0, t1) {
  const d = fr.map(f => f[1]).sort((a, b) => a - b);
  const dur = t1 - t0;
  return {
    duration_ms: Math.round(dur), frames: d.length, fps: r1(d.length / (dur / 1000)),
    median_ms: r1(pct(d, 0.5)), p95_ms: r1(pct(d, 0.95)), p99_ms: r1(pct(d, 0.99)), max_ms: r1(d.at(-1) || 0),
    gt20: d.filter(x => x > 20).length, gt34: d.filter(x => x > 34).length, gt50: d.filter(x => x > 50).length, gt100: d.filter(x => x > 100).length,
    smooth_pct: d.length ? r1(100 * d.filter(x => x <= 20).length / d.length) : 0,
    jank_ms: Math.round(d.reduce((s, x) => s + Math.max(0, x - 16.7), 0)),
    time_in_gt50_ms: Math.round(d.filter(x => x > 50).reduce((s, x) => s + x, 0)),
  };
}
function sectionOf(secs, y, vh) {
  const c = y + vh / 2; let best = null;
  for (const s of secs) if (c >= s.top && c < s.top + s.h) { if (!best || s.h < best.h) best = s; }
  return best ? (best.id || best.h2 || best.cls || `@${best.top}`) : '(none)';
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0;
// ---- end copy ----

// Refresh-rate normalisation. P = display/rAF cadence period (iOS Safari rAF: 60 Hz => 16.67 ms;
// Chrome on a 120 Hz Mac panel: 8.33 ms). An interval "hits cadence" when dt <= 1.5P (i.e. it rounds
// to one vsync). Missed vsyncs for an interval = max(0, round(dt/P) - 1). dropped_ratio =
// missed / (missed + frames) = share of display refreshes that did not get a new rAF frame.
// fps_pct_of_cadence = fps / (1000/P).
function normStats(fr, t0, t1, P) {
  const d = fr.map(f => f[1]);
  const missed = d.reduce((s, x) => s + Math.max(0, Math.round(x / P) - 1), 0);
  return {cadence_ms: r1(P * 100) / 100, hit_cadence_pct: d.length ? r1(100 * d.filter(x => x <= 1.5 * P).length / d.length) : 0,
    missed_vsyncs: missed, dropped_ratio_pct: r1(100 * missed / (missed + d.length || 1)),
    fps_pct_of_cadence: r1(100 * (d.length / ((t1 - t0) / 1000)) / (1000 / P)),
    over_2P: d.filter(x => x > 2.5 * P).length};
}
const cadenceOf = frames => { const d = frames.map(f => f[1]).filter(x => x > 0).sort((a, b) => a - b); const m = pct(d, 0.5); return m > 12 ? 1000 / 60 : 1000 / 120; };

function summarize(raw) {
  const {marks, frames, secs, vh} = raw;
  const P = cadenceOf(frames.filter(f => f[0] >= marks.idle[0] && f[0] <= marks.idle[1]));
  const phases = {};
  for (const ph of ['idle', 'scroll', 'bottom']) {
    const [a, b] = marks[ph];
    const fr = frames.filter(f => f[0] >= a && f[0] <= b);
    phases[ph] = {...frameStats(fr, a, b), norm: normStats(fr, a, b, P)};
  }
  const [a, b] = marks.scroll;
  const bySec = new Map();
  const top = secs.filter(s => s.h < 20000);
  for (const f of frames) if (f[0] >= a && f[0] <= b) {
    const k = sectionOf(top, f[2], vh);
    const s = bySec.get(k) || {section: k, frames: 0, gt34: 0, gt50: 0, gt100: 0, max_ms: 0, jank_ms: 0};
    s.frames++; if (f[1] > 34) s.gt34++; if (f[1] > 50) s.gt50++; if (f[1] > 100) s.gt100++;
    s.max_ms = Math.max(s.max_ms, f[1]); s.jank_ms += Math.max(0, f[1] - 16.7); bySec.set(k, s);
  }
  const sections = [...bySec.values()].map(s => ({...s, jank_ms: Math.round(s.jank_ms)}));
  return {phases, sections, scroll: {steps_approx: Math.ceil((b - a) / 300), maxY: raw.maxY, finalY: raw.finalY, startY: raw.startY, scrollHeight: raw.docH, vw: raw.vw, vh: raw.vh}};
}
const KEYS = ['duration_ms', 'fps', 'median_ms', 'p95_ms', 'p99_ms', 'max_ms', 'gt20', 'gt34', 'gt50', 'gt100', 'smooth_pct', 'jank_ms', 'time_in_gt50_ms'];
const NKEYS = ['hit_cadence_pct', 'missed_vsyncs', 'dropped_ratio_pct', 'fps_pct_of_cadence', 'over_2P'];
function aggregate(sums) {
  const out = {};
  for (const ph of ['idle', 'scroll', 'bottom']) {
    out[ph] = {};
    for (const k of KEYS) { const v = sums.map(s => s.phases[ph][k]); out[ph][k] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v}; }
    for (const k of NKEYS) { const v = sums.map(s => s.phases[ph].norm[k]); out[ph]['norm_' + k] = {mean: r1(mean(v)), sd: r1(sd(v)), values: v}; }
  }
  return out;
}

// ---- Timeline chunk rates (per second of chunk wall time) ----
function chunkRates(chunks, filter = () => true) {
  const cs = chunks.filter(filter);
  const secs = cs.reduce((s, c) => s + (c.t[1] - c.t[0]) / 1000, 0);
  const sum = k => cs.reduce((s, c) => s + (c[k] || 0), 0);
  const scripts = {}, events = {};
  for (const c of cs) { for (const [k, v] of Object.entries(c.scripts || {})) scripts[k] = (scripts[k] || 0) + v; for (const [k, v] of Object.entries(c.events || {})) events[k] = (events[k] || 0) + v; }
  return {chunks: cs.length, seconds: r1(secs),
    per_s: Object.fromEntries(['layout', 'style', 'paint', 'composite', 'raf', 'timer'].map(k => [k, r1(sum(k) / (secs || 1))])),
    paint_mpx_per_s: r1(sum('paintArea') / 1e6 / (secs || 1)),
    events, topScripts: Object.entries(scripts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({fn: k, calls: v, per_s: r1(v / (secs || 1))}))};
}

// ---- scripted runs ----
const runs = fs.readdirSync(DIR).filter(f => /^scroll_run\d+\.json$/.test(f)).sort();
const sums = runs.map(f => { const raw = JSON.parse(fs.readFileSync(`${DIR}/${f}`)); return {file: f, ...summarize(raw)}; });
const agg = aggregate(sums);
let timeline = null;
if (fs.existsSync(`${DIR}/scroll_timeline.json`)) {
  const raw = JSON.parse(fs.readFileSync(`${DIR}/scroll_timeline.json`));
  const {marks} = raw;
  const inPh = (c, ph) => c.t[0] >= marks[ph][0] - 500 && c.t[1] <= marks[ph][1] + 500;
  timeline = {note: 'separate run with Timeline instrumentation on (1s chunks); frame stats of this run are perturbed and excluded from the aggregate',
    frameStats: summarize(raw).phases,
    idle: chunkRates(raw.chunks, c => inPh(c, 'idle')), scroll: chunkRates(raw.chunks, c => c.t[0] < marks.scroll[1] && c.t[1] > marks.scroll[0]),
    bottom: chunkRates(raw.chunks, c => inPh(c, 'bottom')), all: chunkRates(raw.chunks)};
}

// ---- finger-scroll ground truth (scroll1.json: 2 duplicate rAF loops -> dedupe by rounded t) ----
let finger = null;
if (fs.existsSync(FINGER)) {
  const d = JSON.parse(fs.readFileSync(FINGER));
  const seen = new Set();
  const fr = d.page.frames.filter(f => { const k = Math.round(f[0]); if (seen.has(k)) return false; seen.add(k); return true; });
  const P = 1000 / 60;
  const ch = d.chunks;
  const active = ch.map((c, i) => ({c, i})).filter(({c}) => Object.keys(c.events).some(e => /touch|pointer|scroll/.test(e)));
  const first = active[0].i, lastActive = active.at(-1).i;
  // windows: idle-before (chunks before first touch), down (first touch .. y reaches max), bottom-touch
  // (y at max with touchmove/pointermove = scroll-jack region), up (flick back to top), idle-after.
  const maxY = Math.max(...fr.map(f => f[2]));
  const tReachMax = fr.find(f => f[2] >= maxY - 15)[0];                    // first time at the bottom
  const tLeaveBottom = [...fr].reverse().find(f => f[2] >= maxY - 100)[0];  // last frame near the bottom
  const tTop = (fr.find(f => f[0] > tLeaveBottom && f[2] <= 0) || fr.at(-1))[0];
  const win = {
    idle_before: [ch[0].t[0], ch[first].t[0]],
    scroll_down: [ch[first].t[0], tReachMax],                 // finger flicks down (incl. one short flick back up)
    bottom_touch: [tReachMax, tLeaveBottom],                  // repeated touches at the page end: touchmove scroll-jack region
    scroll_up: [tLeaveBottom, tTop],                          // flick back to the top
    idle_after: [tTop, ch.at(-1).t[1]],
  };
  const phases = {};
  for (const [k, [a, b]] of Object.entries(win)) { const f = fr.filter(x => x[0] >= a && x[0] <= b); phases[k] = {...frameStats(f, a, b), norm: normStats(f, a, b, P)}; }
  const bySec = new Map(); const top = d.page.sections.filter(s => s.h < 20000);
  for (const f of fr) if (f[0] >= win.scroll_down[0] && f[0] <= win.scroll_down[1]) {
    const k = sectionOf(top, f[2], d.page.vh);
    const s = bySec.get(k) || {section: k, frames: 0, gt34: 0, gt50: 0, gt100: 0, max_ms: 0, jank_ms: 0};
    s.frames++; if (f[1] > 34) s.gt34++; if (f[1] > 50) s.gt50++; if (f[1] > 100) s.gt100++;
    s.max_ms = Math.max(s.max_ms, f[1]); s.jank_ms += Math.max(0, f[1] - 16.7); bySec.set(k, s);
  }
  const inWin = (c, [a, b]) => c.t[0] < b && c.t[1] > a;
  finger = {note: 'finger-scroll recording (record.mjs, Timeline on in 1s chunks the whole time => timing perturbed like scroll_timeline). Frames deduped by rounded t (2 rAF loggers were running).',
    frames_deduped: fr.length, maxY, windows: Object.fromEntries(Object.entries(win).map(([k, v]) => [k, v.map(Math.round)])), phases,
    sections: [...bySec.values()].map(s => ({...s, jank_ms: Math.round(s.jank_ms)})),
    timeline: Object.fromEntries(Object.entries(win).map(([k, w]) => [k, chunkRates(ch, c => inWin(c, w))])),
    timeline_all_active: chunkRates(ch, (c) => ch.indexOf(c) >= first && ch.indexOf(c) <= lastActive),
    sections_note: 'per-section stats use the scroll_down window only (comparable with the scripted scroll-down phase)'};
}

const out = {generated: new Date().toISOString(), device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari (rAF capped at 60 Hz)',
  runs: sums, aggregate: agg, timeline, finger};
fs.writeFileSync(`${DIR}/scroll_summary.json`, JSON.stringify(out, null, 1));

// ---- console tables ----
const row = (name, p) => `| ${name} | ${p.duration_ms} | ${p.frames} | ${p.fps} | ${p.median_ms} | ${p.p95_ms} | ${p.p99_ms} | ${p.gt20} | ${p.gt34} | ${p.gt50} | ${p.gt100} | ${p.max_ms} | ${p.norm.hit_cadence_pct}% | ${p.norm.dropped_ratio_pct}% | ${p.norm.fps_pct_of_cadence}% |`;
console.log('| run/phase | dur ms | frames | fps | med | p95 | p99 | >20 | >34 | >50 | >100 | max | hit cad | dropped | fps/cad |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of sums) for (const ph of ['idle', 'scroll', 'bottom']) console.log(row(`${s.file.replace('.json', '')} ${ph}`, s.phases[ph]));
if (timeline) for (const ph of ['idle', 'scroll', 'bottom']) console.log(row(`timeline-run ${ph}`, timeline.frameStats[ph]));
if (finger) for (const [k, p] of Object.entries(finger.phases)) console.log(row(`finger ${k}`, p));
console.log('\nAGG mean±sd');
for (const ph of ['idle', 'scroll', 'bottom']) console.log(ph, KEYS.map(k => `${k}=${agg[ph][k].mean}±${agg[ph][k].sd}`).join(' '), NKEYS.map(k => `${k}=${agg[ph]['norm_' + k].mean}±${agg[ph]['norm_' + k].sd}`).join(' '));
console.log('\nSECTIONS'); for (const s of sums) console.log(s.file, JSON.stringify(s.sections));
if (finger) console.log('finger', JSON.stringify(finger.sections));
console.log('\nTIMELINE scripted'); if (timeline) for (const k of ['idle', 'scroll', 'bottom']) console.log(k, JSON.stringify(timeline[k]));
console.log('\nTIMELINE finger'); if (finger) { console.log(JSON.stringify(finger.windows)); for (const [k, v] of Object.entries(finger.timeline)) console.log(k, JSON.stringify(v)); }

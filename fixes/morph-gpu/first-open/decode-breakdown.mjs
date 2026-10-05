// morph-gpu first open: breakdown of the image decode work in each open window from first-open-chrome.mjs raw files
// (raw-<stamp>-<arm>-<load>.json.gz). Prints per window: decode events by name and thread, their start relative to
// the open mark (ms), the image urls/sizes where the trace names them, and the main-thread frames (BeginMainFrame) and
// compositor frames (DrawFrame, PipelineReporter) in the first 400 ms. Counts and offsets only.
// Usage: node fixes/morph-gpu/first-open/decode-breakdown.mjs <raw.json.gz> [m|s] [hold ms]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [f, kind = 'm', holdS = '2500'] = process.argv.slice(2);
const { ev } = JSON.parse(gunzipSync(readFileSync(f)));
const HOLD = +holdS * 1e3;
const tname = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') tname.set(e.pid + '|' + e.tid, e.args?.name);
const mark = (id) => ev.find((e) => e.name === id && e.cat?.includes('user_timing'))?.ts;
const wins = [];
for (let c = 0; c < 3; c++) {
  if (kind === 'm') { const on = mark(`fo-on-${c}`); wins.push([`open${c + 1}`, on]); wins.push([`close${c + 1}`, on + HOLD]); }
  else { wins.push([`open${c + 1}`, mark(`fo-go-${c}`)]); wins.push([`close${c + 1}`, mark(`fo-gc-${c}`)]); }
}
const begins = new Map();
const spans = [];
for (const e of ev) {
  if (e.ph === 'X') spans.push(e);
  else if (e.ph === 'B') { const k = e.pid + '|' + e.tid + '|' + e.name; (begins.get(k) || begins.set(k, []).get(k)).push(e); }
  else if (e.ph === 'E') { const k = e.pid + '|' + e.tid + '|' + e.name, b = begins.get(k)?.pop(); if (b) spans.push({ ...b, dur: e.ts - b.ts }); }
}
for (const [id, t0] of wins) {
  const inW = spans.filter((e) => e.ts >= t0 - 150e3 && e.ts < t0 + 1500e3);
  const dec = inW.filter((e) => /decode/i.test(e.name));
  const by = {};
  for (const e of dec) { const k = `${e.name} @${tname.get(e.pid + '|' + e.tid) || e.tid}`; const q = (by[k] ||= { n: 0, ms: 0, first: Infinity, last: -Infinity }); q.n++; q.ms += (e.dur || 0) / 1e3; q.first = Math.min(q.first, (e.ts - t0) / 1e3); q.last = Math.max(q.last, (e.ts + (e.dur || 0) - t0) / 1e3); }
  console.log(id, 'decode events', dec.length);
  for (const [k, v] of Object.entries(by)) console.log(`  ${k}: n ${v.n} ${v.ms.toFixed(1)} ms, from +${v.first.toFixed(0)} to +${v.last.toFixed(0)} ms`);
  const sample = dec.find((e) => e.args && Object.keys(e.args).length); if (sample) console.log('  args sample', JSON.stringify(sample.args).slice(0, 300));
  // frames: compositor DrawFrame / main BeginMainFrame gaps in the first 600 ms
  const draws = inW.filter((e) => e.name === 'DrawFrame' || e.name === 'Graphics.Pipeline.DrawAndSwap').map((e) => (e.ts - t0) / 1e3).filter((t) => t > -20 && t < 600);
  const ck = ev.filter((e) => /checker|Checker/.test(e.name) && e.ts >= t0 - 150e3 && e.ts < t0 + 1500e3);
  console.log('  draws first 600 ms', draws.length, 'checker-imaging events', ck.length, [...new Set(ck.map((e) => e.name))].join(','));
}
const names = [...new Set(ev.filter((e) => /decode|Decode|Image/i.test(e.name)).map((e) => e.name))];
console.log('decode/image event names in the trace:', names.join(', '));

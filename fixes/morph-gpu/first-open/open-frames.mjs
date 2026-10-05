// morph-gpu first open: per open window, the main-thread frames (ProxyMain::BeginMainFrame) of the first 12 frames with
// their durations and the largest child events, plus EventDispatch by event type and long tasks (> 20 ms) outside
// frames. Raw file from first-open-chrome.mjs. Durations are 6x-throttled context, not a verdict.
// Usage: node fixes/morph-gpu/first-open/open-frames.mjs <raw.json.gz> [m|s] [hold ms] [frames]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [f, kind = 'm', holdS = '2500', nfS = '12'] = process.argv.slice(2);
const { ev } = JSON.parse(gunzipSync(readFileSync(f)));
const HOLD = +holdS * 1e3, NF = +nfS;
const mark = (id) => ev.find((e) => e.name === id && e.cat?.includes('user_timing'))?.ts;
const spans = []; const begins = new Map();
for (const e of ev) {
  if (e.ph === 'X') spans.push(e);
  else if (e.ph === 'B') { const k = e.pid + '|' + e.tid + '|' + e.name; (begins.get(k) || begins.set(k, []).get(k)).push(e); }
  else if (e.ph === 'E') { const k = e.pid + '|' + e.tid + '|' + e.name, b = begins.get(k)?.pop(); if (b) spans.push({ ...b, dur: e.ts - b.ts, endArgs: e.args }); }
}
spans.sort((a, b) => a.ts - b.ts);
const mainKeys = new Set(spans.filter((e) => e.name === 'UpdateLayoutTree').map((e) => e.pid + '|' + e.tid));
const main = spans.filter((e) => mainKeys.has(e.pid + '|' + e.tid));
const wins = [];
for (let c = 0; c < 3; c++) {
  if (kind === 'm') wins.push([`open${c + 1}`, mark(`fo-on-${c}`)]);
  else wins.push([`open${c + 1}`, mark(`fo-go-${c}`)]);
}
for (const [id, t0] of wins) {
  const a = t0 - 150e3, b = t0 + 1500e3;
  const frames = main.filter((e) => e.name === 'ProxyMain::BeginMainFrame' && e.ts >= a && e.ts < b);
  const tasks = main.filter((e) => e.name === 'RunTask' && e.ts >= a && e.ts < b);
  console.log(`${id}: frames ${frames.length}`);
  for (const fr of frames.filter((x) => x.ts >= t0 - 20e3).slice(0, NF)) {
    const kids = main.filter((e) => e.ts >= fr.ts && e.ts + (e.dur || 0) <= fr.ts + fr.dur && e !== fr && e.name !== 'RunTask');
    const by = {}; for (const k of kids) { const q = (by[k.name] ||= { n: 0, ms: 0 }); q.n++; q.ms += (k.dur || 0) / 1e3; }
    const top = Object.entries(by).sort((x, y) => y[1].ms - x[1].ms).slice(0, 5).map(([k, v]) => `${k} ${v.n}/${v.ms.toFixed(1)}`).join(' | ');
    console.log(`  +${((fr.ts - t0) / 1e3).toFixed(0).padStart(5)} ms  ${(fr.dur / 1e3).toFixed(1).padStart(6)} ms  ${top}`);
  }
  const evd = main.filter((e) => e.name === 'EventDispatch' && e.ts >= a && e.ts < b);
  const byType = {}; for (const e of evd) { const t = e.args?.data?.type || '?'; const q = (byType[t] ||= { n: 0, ms: 0, first: null }); q.n++; q.ms += (e.dur || 0) / 1e3; if (q.first == null) q.first = ((e.ts - t0) / 1e3).toFixed(0); }
  console.log('  EventDispatch:', Object.entries(byType).map(([k, v]) => `${k} n${v.n} ${v.ms.toFixed(1)} ms (first +${v.first})`).join(' | '));
  const longT = tasks.filter((t) => t.dur > 20e3 && !frames.some((fr) => fr.ts >= t.ts && fr.ts < t.ts + t.dur));
  for (const t of longT) {
    const kids = main.filter((e) => e.ts >= t.ts && e.ts < t.ts + t.dur && e !== t && e.name !== 'RunTask');
    const by = {}; for (const k of kids) { const nm = k.name + (k.args?.data?.type ? ':' + k.args.data.type : '') + (k.args?.data?.url ? ' ' + String(k.args.data.url).split('/').pop().slice(0, 40) : ''); const q = (by[nm] ||= { n: 0, ms: 0 }); q.n++; q.ms += (k.dur || 0) / 1e3; }
    console.log(`  long task +${((t.ts - t0) / 1e3).toFixed(0)} ms ${(t.dur / 1e3).toFixed(1)} ms:`, Object.entries(by).sort((x, y) => y[1].ms - x[1].ms).slice(0, 5).map(([k, v]) => `${k} ${v.n}/${v.ms.toFixed(1)}`).join(' | '));
  }
}

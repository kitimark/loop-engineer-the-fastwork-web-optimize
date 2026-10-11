// Item 4: cache re-writes after idle gaps. Reads requests.ndjson (usage numbers only), writes tok-gaps.json.
// Per agent stream (one transcript file = one agent), sorted by time; a request whose gap since the same stream's
// previous request exceeds the cache TTL in force (1h if the stream writes 1h entries, else 5 min) is a "post-gap" turn.
// Prices: $/MTok base input; cache write 5m = 1.25x, 1h = 2x; cache read = model's read price; output listed.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const R = readFileSync(here + 'requests.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const P = { // claude-api skill model table (cached 2026-09-25) + prompt-caching.md economics
  'claude-opus-5-5': { in: 4, out: 20, read: 0.20 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.20 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, read: 0.10 },
};
const cost = (r) => { const p = P[r.model]; return (r.in * p.in + r.cw5m * p.in * 1.25 + r.cw1h * p.in * 2 + (r.cw - r.cw5m - r.cw1h) * p.in * 1.25 + r.cr * p.read + r.out * p.out) / 1e6; };
const streams = new Map();
for (const r of R) { if (!streams.has(r.f)) streams.set(r.f, []); streams.get(r.f).push(r); }
const tot = { req: 0, cw: 0, cost: 0, cwCost: 0 };
const gap = { n: 0, cw: 0, cwCost: 0, excessCost: 0, excessTok: 0, byKind: {}, byDay: {}, byStream: {}, lead: { n: 0, excessCost: 0, excessTok: 0 } };
const miss = { n: 0, cw: 0, excessCost: 0 }; // any non-first turn whose write > 50 % of its prompt and > 20k tokens
const gapHist = { '5-15m': 0, '15-60m': 0, '1-3h': 0, '>3h': 0 };
const ttlUse = {};
for (const [f, arr] of streams) {
  arr.sort((a, b) => a.t.localeCompare(b.t));
  const w1h = arr.reduce((s, r) => s + r.cw1h, 0), w5 = arr.reduce((s, r) => s + r.cw5m, 0);
  const mode = w1h > w5 ? '1h' : '5m'; ttlUse[mode] = (ttlUse[mode] || 0) + 1;
  // typical per-turn new-content write in this stream when warm (median of writes on turns with gap < 4 min)
  const warm = []; for (let i = 1; i < arr.length; i++) { const g = Date.parse(arr[i].t) - Date.parse(arr[i - 1].t); if (g < 240e3) warm.push(arr[i].cw); }
  warm.sort((a, b) => a - b); const med = warm.length ? warm[Math.floor(warm.length / 2)] : 0;
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i], p = P[r.model]; tot.req++; tot.cw += r.cw; tot.cost += cost(r);
    const wc = (r.cw5m * 1.25 + r.cw1h * 2 + (r.cw - r.cw5m - r.cw1h) * 1.25) * p.in / 1e6; tot.cwCost += wc;
    if (i === 0) continue;
    const g = Date.parse(r.t) - Date.parse(arr[i - 1].t);
    const ttl = (r.cw1h > 0 || (r.cw5m === 0 && mode === '1h')) ? 3600e3 : 300e3;
    const writeMult = r.cw1h > 0 ? 2 : 1.25;
    const ex = Math.max(0, r.cw - med); // re-written prefix beyond the stream's normal per-turn write
    const exCost = ex * (writeMult * p.in - p.read) / 1e6; // vs reading the same tokens from a warm cache
    if (r.cw > 20000 && r.cw > 0.5 * (r.cw + r.cr)) { miss.n++; miss.cw += r.cw; miss.excessCost += exCost; }
    if (g > ttl) {
      gap.n++; gap.cw += r.cw; gap.cwCost += wc; gap.excessCost += exCost; gap.excessTok += ex;
      const k = r.kind === 'session' ? 'lead/session' : 'subagent'; gap.byKind[k] = gap.byKind[k] || { n: 0, excessTok: 0, excessCost: 0 };
      gap.byKind[k].n++; gap.byKind[k].excessTok += ex; gap.byKind[k].excessCost += exCost;
      const d = r.t.slice(0, 10); gap.byDay[d] = gap.byDay[d] || { n: 0, excessTok: 0, excessCost: 0 };
      gap.byDay[d].n++; gap.byDay[d].excessTok += ex; gap.byDay[d].excessCost += exCost;
      const name = f.replace(/#.*/, ''); gap.byStream[name] = gap.byStream[name] || { n: 0, excessTok: 0, excessCost: 0 };
      gap.byStream[name].n++; gap.byStream[name].excessTok += ex; gap.byStream[name].excessCost += exCost;
      const m = g / 60e3; gapHist[m < 15 ? '5-15m' : m < 60 ? '15-60m' : m < 180 ? '1-3h' : '>3h']++;
    }
  }
}
// calibration: cost up to the 5 Oct readout (01:19Z), to compare with the session's own $ readout
const cut = '2026-10-05T01:19:00Z'; let pre = { opus: 0, sonnet: 0, haiku: 0 };
for (const r of R) if (r.t < cut) { const k = r.model.includes('opus') ? 'opus' : r.model.includes('sonnet') ? 'sonnet' : 'haiku'; pre[k] += cost(r); }
const top = Object.entries(gap.byStream).sort((a, b) => b[1].excessCost - a[1].excessCost).slice(0, 12);
const out = { tot, gap: { ...gap, byStream: undefined, top }, miss, gapHist, ttlUse, streams: streams.size, preReadoutCost: pre };
writeFileSync(here + 'tok-gaps.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

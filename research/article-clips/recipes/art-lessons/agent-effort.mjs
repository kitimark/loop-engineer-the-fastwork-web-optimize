// Per-agent effort from transcript usage numbers: requests, active hours (sum of inter-request gaps capped at 5 min),
// first/last timestamp, list-price cost. Agents with the same spawn name are merged. Writes agent-effort.json.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const R = readFileSync(here + 'requests.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const P = { 'claude-opus-5-5': [4, 20, 0.20], 'claude-sonnet-5-5': [2, 10, 0.20], 'claude-haiku-4-5-20251001': [1, 5, 0.10] };
const cost = r => { const [i, o, rd] = P[r.model]; return (r.in * i + r.cw5m * i * 1.25 + r.cw1h * i * 2 + r.cr * rd + r.out * o) / 1e6; };
const S = new Map(); for (const r of R) { if (!S.has(r.f)) S.set(r.f, []); S.get(r.f).push(r); }
const A = {};
for (const [f, a] of S) {
  a.sort((x, y) => x.t.localeCompare(y.t)); const n = f.startsWith('session:') ? f : f.replace(/#.*/, '');
  const x = A[n] = A[n] || { req: 0, activeH: 0, usd: 0, first: a[0].t, last: a[0].t, spawns: 0 };
  x.spawns++; x.req += a.length; if (a[0].t < x.first) x.first = a[0].t; if (a[a.length - 1].t > x.last) x.last = a[a.length - 1].t;
  for (let i = 0; i < a.length; i++) { x.usd += cost(a[i]); if (i) x.activeH += Math.min(300e3, Date.parse(a[i].t) - Date.parse(a[i - 1].t)) / 3600e3; }
}
for (const v of Object.values(A)) { v.activeH = Math.round(v.activeH * 10) / 10; v.usd = Math.round(v.usd); }
writeFileSync(here + 'agent-effort.json', JSON.stringify(A, null, 1));
const tot = Object.values(A).reduce((s, v) => ({ h: s.h + v.activeH, usd: s.usd + v.usd }), { h: 0, usd: 0 });
console.log(Object.keys(A).length, 'agents', tot);
// by day: active hours and $ across all agents
const D = {}; for (const [f, a] of S) for (let i = 0; i < a.length; i++) { const d = a[i].t.slice(0, 10); D[d] = D[d] || { h: 0, usd: 0 }; D[d].usd += cost(a[i]); if (i) D[d].h += Math.min(300e3, Date.parse(a[i].t) - Date.parse(a[i - 1].t)) / 3600e3; }
for (const v of Object.values(D)) { v.h = Math.round(v.h); v.usd = Math.round(v.usd); }
console.log(D);

#!/usr/bin/env node
// Compares stopstate.mjs records: per stop, which recorded fields differ between loads (arm + load index), and the clip
// hashes at the two pixel spots. node fixes/nav-hit-cache/v93/stopdiff.mjs <stopstate.json>[,<more>] [--ys 2120,6278]
import { readFileSync } from 'node:fs';
const files = process.argv[2].split(',');
const ysArg = process.argv.indexOf('--ys'); const only = ysArg > 0 ? process.argv[ysArg + 1].split(',').map(Number) : null;
const loads = files.flatMap((f, fi) => JSON.parse(readFileSync(f, 'utf8')).loads.map((l) => ({ ...l, tag: `${l.arm}${fi}.${l.i}` })));
for (const l of loads) console.log(`load ${l.tag} served ${l.served?.js} errors ${l.errors.length}`);
const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out); } else out[p] = JSON.stringify(o); return out; };
const ys = [...new Set(loads.flatMap((l) => l.stops.map((s) => s.y)))].sort((a, b) => a - b);
for (const y of ys) {
  if (only && !only.includes(y)) continue;
  const rows = loads.map((l) => ({ tag: l.tag, s: l.stops.find((s) => s.y === y) })).filter((r) => r.s);
  const f = rows.map((r) => ({ tag: r.tag, v: flat({ pre: r.s.pre, state: r.s.state }) }));
  const keys = [...new Set(f.flatMap((r) => Object.keys(r.v)))];
  const diff = keys.filter((k) => new Set(f.map((r) => r.v[k])).size > 1);
  console.log(`\ny ${y}: clips ${rows.map((r) => `${r.tag}=${r.s.clip ?? '-'}`).join(' ')}; ${diff.length} differing fields`);
  for (const k of diff) { console.log(`  ${k}`); for (const r of f) console.log(`    ${r.tag}: ${String(r.v[k]).slice(0, 300)}`); }
}

#!/usr/bin/env node
// de-offscreen: compare two Simulator census files (layers-sim.mjs output) per position: totals and the owner selectors
// whose layer count or memory differ (a knock-out against its base, or two builds).
//   node fixes/de-offscreen/kodiff.mjs <base sim-*.json> <other sim-*.json> [--json]
import { readFileSync } from 'node:fs';
const [fa, fb] = process.argv.slice(2);
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
const MB = (b) => Math.round(b / 1e4) / 100;
const out = {};
for (const pos of ['top', 'B']) {
  const by = (r) => { const P = r.positions[pos]; const o = {}; for (const l of P?.C1?.layers || []) { const w = P.owners[l.id]?.owner || {}; const k = (w.sel || '?') + (l.pseudo ? '::' + l.pseudo : ''); const g = (o[k] ||= { n: 0, mem: 0 }); g.n++; g.mem += l.mem; } return o; };
  const a = by(A), b = by(B);
  const tot = (o) => Object.values(o).reduce((s, g) => ({ n: s.n + g.n, mem: s.mem + g.mem }), { n: 0, mem: 0 });
  const ta = tot(a), tb = tot(b);
  const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => ({ k, dn: (b[k]?.n || 0) - (a[k]?.n || 0), dmb: MB((b[k]?.mem || 0) - (a[k]?.mem || 0)) }))
    .filter((x) => x.dn || Math.abs(x.dmb) >= 0.01).sort((x, y) => x.dmb - y.dmb || x.dn - y.dn);
  out[pos] = { base: { n: ta.n, mb: MB(ta.mem) }, other: { n: tb.n, mb: MB(tb.mem) }, diff };
  if (!process.argv.includes('--json')) {
    console.log(`${pos}: ${ta.n} L ${MB(ta.mem)} MB -> ${tb.n} L ${MB(tb.mem)} MB (${tb.n - ta.n} L, ${MB(tb.mem - ta.mem)} MB)`);
    for (const x of diff) console.log(`   ${x.dn > 0 ? '+' : ''}${x.dn} L ${x.dmb > 0 ? '+' : ''}${x.dmb} MB  ${x.k}`);
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out));

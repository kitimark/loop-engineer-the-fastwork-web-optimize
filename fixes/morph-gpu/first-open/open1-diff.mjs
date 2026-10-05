// morph-gpu first open: from a first-open-chrome.mjs result file, per run, the trace event names (per thread group) whose
// count or total ms in open1 differs most from the mean of open2 and open3. Also the JS self time per function.
// Usage: node fixes/morph-gpu/first-open/open1-diff.mjs <first-open-chrome-*.json> [top]
import { readFileSync } from 'node:fs';
const [f, topS = '12'] = process.argv.slice(2);
const r = JSON.parse(readFileSync(f, 'utf8'));
for (const run of r.runs) {
  if (run.error) { console.log(run.arm, run.load, 'error'); continue; }
  const w = Object.fromEntries(run.windows.map((x) => [x.id, x]));
  const rows = [];
  const keys = new Set();
  for (const id of ['open1', 'open2', 'open3']) for (const [th, t] of Object.entries(w[id].byThread)) for (const k of Object.keys(t)) keys.add(th.replace(/\d+$/, '') + '|' + k);
  const get = (id, key) => { const [th, k] = key.split('|'); let n = 0, ms = 0; for (const [t2, t] of Object.entries(w[id].byThread)) if (t2.replace(/\d+$/, '') === th && t[k]) { n += t[k].n; ms += t[k].ms; } return { n, ms }; };
  for (const key of keys) {
    const a = get('open1', key), b = get('open2', key), c = get('open3', key);
    rows.push({ key, n1: a.n, n23: (b.n + c.n) / 2, ms1: a.ms, ms23: (b.ms + c.ms) / 2, dms: a.ms - (b.ms + c.ms) / 2, dn: a.n - (b.n + c.n) / 2 });
  }
  console.log(`== ${run.arm} load ${run.load}`);
  for (const x of rows.sort((p, q) => Math.abs(q.dms) - Math.abs(p.dms)).slice(0, +topS)) console.log(`  ${x.key.padEnd(70)} n ${x.n1} vs ${x.n23}  ms ${x.ms1.toFixed(1)} vs ${x.ms23.toFixed(1)}  (d ${x.dms.toFixed(1)})`);
  const js = new Set([...Object.keys(w.open1.js), ...Object.keys(w.open2.js), ...Object.keys(w.open3.js)]);
  const jr = [...js].map((k) => ({ k, a: w.open1.js[k] || 0, b: ((w.open2.js[k] || 0) + (w.open3.js[k] || 0)) / 2 })).sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b)).slice(0, 8);
  console.log('  js self ms, open1 vs mean(open2, open3):', jr.map((x) => `${x.k} ${x.a.toFixed(1)}/${x.b.toFixed(1)}`).join(' | '));
}

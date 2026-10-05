// morph-gpu first open: JS stacks (CPU profile samples) inside main-thread EventDispatch events of one type, per open
// window, from a first-open-chrome.mjs raw file. Prints the long dispatches and, aggregated, the script files and the
// leaf functions their samples fall in.
// Usage: node fixes/morph-gpu/first-open/event-stacks.mjs <raw.json.gz> <m|s> <event type> [hold ms]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [f, kind = 's', type = 'scrollend', holdS = '2500'] = process.argv.slice(2);
const { ev, prof } = JSON.parse(gunzipSync(readFileSync(f)));
const mark = (id) => ev.find((e) => e.name === id && e.cat?.includes('user_timing'))?.ts;
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
const st = []; { let t = prof.startTime; for (const d of prof.timeDeltas) { t += d; st.push(t); } }
const short = (cf) => `${cf.functionName || '(anon)'} ${cf.url ? cf.url.replace(/^https?:\/\/[^/]+/, '').split('/').pop().split('?')[0] + (cf.url.includes('?id=') ? '?' + cf.url.split('?')[1].slice(0, 16) : '') : ''}:${cf.lineNumber + 1}`;
const disp = ev.filter((e) => e.ph === 'X' && e.name === 'EventDispatch' && e.args?.data?.type === type);
for (let c = 0; c < 3; c++) {
  const t0 = kind === 'm' ? mark(`fo-on-${c}`) : mark(`fo-go-${c}`);
  const inW = disp.filter((e) => e.ts >= t0 - 150e3 && e.ts < t0 + 1500e3);
  const files = {}, leaves = {};
  for (const e of inW) {
    for (const [i, t] of st.entries()) {
      if (t < e.ts || t >= e.ts + e.dur) continue;
      const d = (prof.timeDeltas[i + 1] ?? 0) / 1e3;
      let id = prof.samples[i]; const leaf = nodes.get(id)?.callFrame; if (leaf) leaves[short(leaf)] = (leaves[short(leaf)] || 0) + d;
      const seen = new Set();
      while (id != null) { const cf = nodes.get(id)?.callFrame; if (cf?.url) { const k = cf.url.replace(/^https?:\/\/[^/]+/, '').split('/').pop().split('?')[0] + (cf.url.includes('?id=') ? '?id=…' : ''); if (!seen.has(k)) { seen.add(k); files[k] = (files[k] || 0) + d; } } id = parent.get(id); }
    }
  }
  const long = inW.filter((e) => e.dur > 2e3).map((e) => `+${((e.ts - t0) / 1e3).toFixed(0)} ${(e.dur / 1e3).toFixed(1)} ms`);
  console.log(`open${c + 1}: ${type} n ${inW.length}, total ${(inW.reduce((s, e) => s + e.dur, 0) / 1e3).toFixed(1)} ms; long: ${long.join(', ') || '-'}`);
  console.log('  files (inclusive ms):', Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' | '));
  console.log('  leaves (self ms):', Object.entries(leaves).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' | '));
}

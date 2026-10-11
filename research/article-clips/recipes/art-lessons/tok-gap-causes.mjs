// Item 4 link to item 3: what were agents doing during the idle gaps that cost cache re-writes?
// For each post-gap subagent turn (gap > 5 min), look for (1) the agent's own status-board rows (owner = agent name)
// with a waitingOn kind overlapping the gap, (2) the agent's own holds.log entries (queue wait or hold of
// chrome-measure / iphone) overlapping the gap. Classifies by the largest overlap. Numbers only.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const G = '.git/fastwork-mirror';
const R = readFileSync(here + 'requests.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const P = { 'claude-opus-5-5': { in: 4, read: 0.20 }, 'claude-sonnet-5-5': { in: 2, read: 0.20 }, 'claude-haiku-4-5-20251001': { in: 1, read: 0.10 } };
const iv = new Map(); const push = (o, k, a, b) => { if (!(b > a)) return; if (!iv.has(o)) iv.set(o, []); iv.get(o).push({ k, a, b }); };
for (const f of readdirSync(G + '/status').filter(f => f.endsWith('.json'))) {
  const o = JSON.parse(readFileSync(G + '/status/' + f, 'utf8')); let st = null, w = null; const ev = [];
  for (const h of o.history || []) { const c = h.changes || {}; if ('state' in c) st = c.state; if ('waitingOn' in c) w = c.waitingOn; ev.push({ t: Date.parse(h.at), by: h.by, st, k: w?.kind }); }
  for (let i = 0; i < ev.length; i++) { const e = ev[i]; if (!e.k || ['landed', 'done', 'parked', 'dropped', 'closed-no-fix'].includes(e.st)) continue; const end = i + 1 < ev.length ? ev[i + 1].t : e.t + 4 * 3600e3; push(o.owner, 'status:' + e.k, e.t, end); }
}
for (const l of readFileSync(G + '/locks/holds.log', 'utf8').trim().split('\n')) {
  let h; try { h = JSON.parse(l); } catch { continue; } if (!h.acquiredAt) continue;
  const res = h.resource === 'iphone' ? 'phone' : 'mac';
  if (h.queuedAt) push(h.owner, 'queue:' + res, Date.parse(h.queuedAt), Date.parse(h.acquiredAt));
  push(h.owner, 'hold:' + res + (h.mode === 'shared' ? '-shared' : ''), Date.parse(h.acquiredAt), Date.parse(h.endedAt || h.at));
}
const owners = [...iv.keys()];
const S = new Map(); for (const r of R) if (r.kind === 'subagent') { const n = r.f.replace(/#.*/, ''); const key = r.f; if (!S.has(key)) S.set(key, { n, a: [] }); S.get(key).a.push(r); }
const cls = {}; let matchedAgents = 0;
for (const [, { n, a }] of S) {
  a.sort((x, y) => x.t.localeCompare(y.t));
  const cands = owners.filter(o => o === n || 'fix-' + o === n || n.endsWith('-' + o) || o === n.replace(/^(fix|ts|arch|de|map|cap|art)-/, ''));
  if (cands.length) matchedAgents++;
  const mine = cands.flatMap(o => iv.get(o));
  const warm = []; for (let i = 1; i < a.length; i++) if (Date.parse(a[i].t) - Date.parse(a[i - 1].t) < 240e3) warm.push(a[i].cw);
  warm.sort((x, y) => x - y); const med = warm.length ? warm[Math.floor(warm.length / 2)] : 0;
  for (let i = 1; i < a.length; i++) {
    const g0 = Date.parse(a[i - 1].t), g1 = Date.parse(a[i].t); if (g1 - g0 <= 300e3) continue;
    const p = P[a[i].model]; const ex = Math.max(0, a[i].cw - med); const c = ex * (1.25 * p.in - p.read) / 1e6;
    const ov = {}; for (const x of mine) { const o = Math.min(g1, x.b) - Math.max(g0, x.a); if (o > 0) ov[x.k] = (ov[x.k] || 0) + o; }
    // priority: an explicit device queue/hold or a status wait on chrome/phone wins over other kinds when it covers >= 30 % of the gap
    const dev = Object.entries(ov).filter(([k]) => /mac|phone|chrome/.test(k)).sort((x, y) => y[1] - x[1])[0];
    let k = 'unmatched (no own record in the gap)';
    if (dev && dev[1] >= 0.3 * (g1 - g0)) k = /phone/.test(dev[0]) ? 'device: iPhone (queue, hold or status wait)' : 'device: Mac lock (queue, hold or status wait)';
    else { const top = Object.entries(ov).sort((x, y) => y[1] - x[1])[0]; if (top && top[1] >= 0.3 * (g1 - g0)) k = 'other wait: ' + top[0].replace('status:', ''); }
    cls[k] = cls[k] || { n: 0, tokM: 0, usd: 0 }; cls[k].n++; cls[k].tokM += ex / 1e6; cls[k].usd += c;
  }
}
for (const v of Object.values(cls)) { v.tokM = Math.round(v.tokM); v.usd = Math.round(v.usd); }
const out = { subagentStreams: S.size, streamsWithOwnRecords: matchedAgents, byCause: cls };
writeFileSync(here + 'tok-gap-causes.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));

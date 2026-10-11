// Item 3 model: Mac lock busy fraction per day (union of all hold intervals in holds.log) and an Erlang-C estimate
// of how much a second lane would cut queue waits at that utilization. Writes lock-util.json.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const H = readFileSync('.git/fastwork-mirror/locks/holds.log', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
function unionByDay(iv) {
  iv.sort((a, b) => a[0] - b[0]); const m = []; for (const [a, b] of iv) { if (m.length && a <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]); }
  const d = {}; for (let [a, b] of m) while (a < b) { const k = new Date(a).toISOString().slice(0, 10); const e = Math.min(b, Date.parse(k + 'T24:00:00Z')); d[k] = (d[k] || 0) + (e - a) / 3600e3; a = e; }
  return Object.fromEntries(Object.entries(d).sort().map(([k, v]) => [k, Math.round(v * 10) / 10]));
}
const mac = [], phone = [];
for (const h of H) { if (!h.acquiredAt) continue; const a = Date.parse(h.acquiredAt), b = Date.parse(h.endedAt || h.at); if (!(b > a)) continue; (h.resource === 'iphone' ? phone : h.resource === 'chrome-measure' ? mac : []).push([a, b]); }
// Erlang C: P(wait) for c servers, offered load A (erlangs)
function erlangC(c, A) { let s = 0, t = 1; for (let k = 0; k < c; k++) { if (k > 0) t *= A / k; s += t; } const tc = t * A / c; const top = tc * c / (c - A); return top / (s + top); }
function wq(c, A) { return erlangC(c, A) / (c - A); } // in units of mean service time
const util = unionByDay(mac);
const model = Object.fromEntries(Object.entries(util).map(([d, h]) => { const rho = Math.min(0.95, h / 24); const w1 = wq(1, rho), w2 = wq(2, rho); return [d, { busyH: h, rho: Math.round(rho * 100) / 100, waitRatio2vs1: Math.round(w2 / w1 * 100) / 100 }]; }));
const out = { macBusyHoursByDay: util, phoneHeldHoursByDay: unionByDay(phone), erlang: model };
writeFileSync(here + 'lock-util.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));

// Item 3: waits for the two scarce devices. Read-only on the shared git dir. Writes lock-waits.json.
// Sources: .git/fastwork-mirror/locks/holds.log (one line per `lock.mjs run` hold; queuedAt from 2026-10-04T23:24Z;
// iPhone ledger lines from 2026-10-05), .git/fastwork-mirror/status/*.json (status board history from 2026-10-01T19:20Z).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const G = '.git/fastwork-mirror';
const here = new URL('.', import.meta.url).pathname;
const H = readFileSync(G + '/locks/holds.log', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const day = (iso) => iso.slice(0, 10);
const add = (o, k, f, v) => { o[k] = o[k] || {}; o[k][f] = (o[k][f] || 0) + v; };
const hrs = (s) => Math.round(s / 360) / 10;
const ts = (x) => Date.parse(x);

// ---- A. Mac lock: holds and queue waits (holds.log) ----
const mac = {}; const macModes = {};
const excl = []; // exclusive holds with queue time, for the lane simulation
for (const h of H) {
  if (h.resource !== 'chrome-measure' || !h.acquiredAt) continue;
  const end = h.endedAt || h.at; const dur = h.durationSec ?? (ts(end) - ts(h.acquiredAt)) / 1000;
  const mode = h.mode === 'shared' ? 'shared' : h.noTiming ? 'no-timing' : (h.short || h.mode === 'short') ? 'short' : 'timing';
  const d = day(h.acquiredAt);
  add(mac, d, 'holds', 1); add(mac, d, 'holdSec_' + mode, dur);
  if (h.queuedAt) {
    const w = Math.max(0, (ts(h.acquiredAt) - ts(h.queuedAt)) / 1000);
    add(mac, d, 'waitSec_' + mode, w); add(mac, d, 'waitN_' + mode, 1);
    macModes[mode] = macModes[mode] || { n: 0, waitSec: 0, max: 0, over10m: 0 };
    const m = macModes[mode]; m.n++; m.waitSec += w; m.max = Math.max(m.max, w); if (w > 600) m.over10m++;
    if (mode !== 'shared') excl.push({ q: ts(h.queuedAt), a: ts(h.acquiredAt), dur, owner: h.owner });
  }
}
// FIFO lane simulation on the exclusive holds since queue times exist: 1 lane (sanity check vs the real waits) and 2 lanes.
// Ignores shared-lane jobs, lead queue moves, the host gate and the short lane, so it is a model, not a replay.
function sim(jobs, lanes) {
  const free = Array(lanes).fill(0); let wait = 0; const byDay = {};
  for (const j of [...jobs].sort((a, b) => a.q - b.q)) {
    free.sort((a, b) => a - b); const start = Math.max(j.q, free[0]); free[0] = start + j.dur * 1000;
    const w = (start - j.q) / 1000; wait += w; byDay[new Date(j.q).toISOString().slice(0, 10)] = (byDay[new Date(j.q).toISOString().slice(0, 10)] || 0) + w;
  }
  return { waitH: hrs(wait), byDayH: Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, hrs(v)])) };
}
const realExclWait = excl.reduce((s, j) => s + (j.a - j.q) / 1000, 0);
const laneSim = { jobs: excl.length, realWaitH: hrs(realExclWait), sim1: sim(excl, 1), sim2: sim(excl, 2) };

// ---- B. iPhone ledger (holds.log, from 5 Oct) ----
const ph = {}; const phTot = {};
const F = ['durationSec', 'runSec', 'coolingSec', 'userWaitSec', 'macHoldSec', 'macWaitSec', 'idleSec', 'waitersPresentSec', 'idleWaitersSec'];
for (const h of H) {
  if (h.resource !== 'iphone' || !h.ledger) continue;
  const d = day(h.acquiredAt); add(ph, d, 'holds', 1);
  for (const f of F) { add(ph, d, f, h[f] || 0); phTot[f] = (phTot[f] || 0) + (h[f] || 0); }
}

// ---- C. Status board: agent time spent waiting on chrome / phone / lead (history intervals) ----
const SB = {}; const SBcap = {}; const rows = new Set();
const CAP = 4 * 3600e3; // an interval longer than 4 h is counted as 4 h in the capped column (stale rows)
const now = Date.parse('2026-10-11T05:00:00Z');
for (const f of readdirSync(G + '/status').filter(f => f.endsWith('.json'))) {
  const o = JSON.parse(readFileSync(G + '/status/' + f, 'utf8'));
  let state = null, waitingOn = null; const ev = [];
  for (const h of o.history || []) {
    const c = h.changes || {};
    if ('state' in c) state = c.state;
    if ('waitingOn' in c) waitingOn = c.waitingOn;
    ev.push({ t: ts(h.at), state, kind: waitingOn?.kind || null });
  }
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]; if (!e.kind || ['landed', 'done', 'closed-no-fix', 'dropped', 'parked'].includes(e.state)) continue;
    const end = i + 1 < ev.length ? ev[i + 1].t : Math.min(now, e.t + CAP);
    let t = e.t; const tEndCap = Math.min(end, e.t + CAP);
    // split by UTC day
    const k = e.kind === 'phone' ? 'phone' : e.kind;
    for (const [lim, tgt] of [[end, SB], [tEndCap, SBcap]]) {
      let a = e.t;
      while (a < lim) { const dEnd = Date.parse(new Date(a).toISOString().slice(0, 10) + 'T24:00:00Z'); const b = Math.min(lim, dEnd); add(tgt, new Date(a).toISOString().slice(0, 10), k, (b - a) / 1000); a = b; }
    }
    if (k === 'chrome' || k === 'phone') rows.add(o.id + ':' + k);
  }
}
const fmt = (o) => Object.fromEntries(Object.entries(o).sort().map(([d, v]) => [d, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /Sec|^[a-z]+$/.test(k) && k !== 'holds' && !k.startsWith('waitN') ? hrs(x) : x]))]));
const out = {
  macByDay_hours: fmt(mac), macWaitByMode: Object.fromEntries(Object.entries(macModes).map(([k, v]) => [k, { n: v.n, waitH: hrs(v.waitSec), meanMin: Math.round(v.waitSec / v.n / 6) / 10, maxMin: Math.round(v.max / 6) / 10, over10m: v.over10m }])),
  laneSim, phoneByDay_hours: fmt(ph), phoneTotal_hours: Object.fromEntries(Object.entries(phTot).map(([k, v]) => [k, hrs(v)])),
  statusWait_hours: fmt(SB), statusWaitCapped4h_hours: fmt(SBcap), statusRowsWaiting: rows.size,
};
writeFileSync(here + 'lock-waits.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

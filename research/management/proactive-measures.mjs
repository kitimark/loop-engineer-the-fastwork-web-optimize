#!/usr/bin/env node
// Team measures for roles v3 "Proactive by default" (user T-160 #7, T-163 #1). Read only.
// Usage: node research/management/proactive-measures.mjs [--since <ISO>] [--until <ISO>]
// Prints one block: lead queue moves, phone idle alarms, active rows naming the lead, user-message answer times.
// Default window: the last 3 h. Sources: the shared git dir's locks/audit.log, console/threads, status rows, and
// out/idle-watch.log of the main checkout. Prints no thread text (Hard rule 12).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const until = arg('--until') ?? new Date().toISOString();
const since = arg('--since') ?? new Date(Date.parse(until) - 3 * 3600e3).toISOString();
const common = path.resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
const D = path.join(common, 'fastwork-mirror');
const mainCheckout = path.dirname(common);
const inWin = (ts) => ts >= since && ts < until;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// M1: queue moves (who moved the Mac queue by hand)
const moves = {};
for (const l of fs.readFileSync(path.join(D, 'locks/audit.log'), 'utf8').split('\n')) {
  const x = (() => { try { return JSON.parse(l); } catch { return null; } })();
  if (x?.code === 'queue-move' && inWin(x.ts)) moves[x.by] = (moves[x.by] ?? 0) + 1;
}

// M2: phone idle alarms from the lead's idle watch
let idle = [];
try {
  idle = fs.readFileSync(path.join(mainCheckout, 'out/idle-watch.log'), 'utf8').split('\n')
    // the watch logs one "POSTED T-nnn iphone: …" line per alarm thread (older lines: "IDLE iphone" / "STUCK iphone")
    .filter((l) => /IDLE iphone|STUCK iphone|POSTED T-\d+ iphone:/.test(l) && inWin(l.slice(0, 20)));
  // one alarm logs an IDLE line and a POSTED line at the same stamp: count each stamp once
  idle = [...new Map(idle.map((l) => [l.slice(0, 20), l])).values()]
    .map((l) => l.match(/for (\d+) min/)?.[1]).filter(Boolean).map(Number);
} catch {}

// M3: active board rows whose wait, next or note names the lead (now)
const lead = [];
let active = 0;
for (const f of fs.readdirSync(path.join(D, 'status'))) {
  const s = readJson(path.join(D, 'status', f));
  if (!s?.state || ['done', 'landed', 'closed-no-fix', 'dropped', 'parked'].includes(s.state)) continue;
  active++;
  if (s.id !== 'direction' && /\blead\b/i.test(JSON.stringify([s.waitingOn, s.next, s.note]))) lead.push(s.id);
}

// M4: user messages in the window: minutes to the first reply; late > 10 min; unanswered before the user wrote again
const mins = [], late = [], unans = [];
for (const f of fs.readdirSync(path.join(D, 'console/threads')).filter((f) => /^T-\d+\.json$/.test(f))) {
  const t = readJson(path.join(D, 'console/threads', f));
  const m = t?.messages ?? [];
  m.forEach((u, i) => {
    if (u.by !== 'user' || !inWin(u.at)) return;
    const first = m.slice(i + 1).find((x) => x.by !== 'user');
    const nextUser = m.slice(i + 1).find((x) => x.by === 'user');
    // a burst (the user wrote again within 2 min, before any reply) is one message: the reply after it answers both
    if (nextUser && (!first || nextUser.n < first.n) && Date.parse(nextUser.at) - Date.parse(u.at) < 120e3) return;
    if (!first || (nextUser && nextUser.n < first.n)) {
      if (Date.parse(until) - Date.parse(u.at) > 600e3) unans.push(`${t.id} #${u.n}`);
      return;
    }
    const min = (Date.parse(first.at) - Date.parse(u.at)) / 60e3;
    mins.push(min);
    if (min > 10) late.push(`${t.id} #${u.n} ${Math.round(min)}m`);
  });
}
mins.sort((a, b) => a - b);

console.log(`PROACTIVE MEASURES ${since.slice(0, 16)}Z .. ${until.slice(0, 16)}Z`);
console.log(`M1 queue moves by hand: ${JSON.stringify(moves)} (target: lead 0 once I-171 lands)`);
console.log(`M2 phone idle alarms: ${idle.length}, minutes ${JSON.stringify(idle)} (target: <= 2 min free with a startable job)`);
console.log(`M3 active rows naming the lead: ${lead.length} of ${active} ${lead.join(' ')} (target <= 3)`);
console.log(`M4 user messages: ${mins.length + unans.length}, median first reply ${mins.length ? mins[mins.length >> 1].toFixed(1) : '-'} min, late ${late.length} ${late.join(', ')}, unanswered ${unans.length} ${unans.join(', ')} (target late 0, unanswered 0)`);

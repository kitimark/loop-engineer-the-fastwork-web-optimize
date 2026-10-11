// Item 4 what-if: overlap of post-gap and miss turns; what a 1-hour TTL on subagents would have cost/saved.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const R = readFileSync(here + 'requests.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const P = { 'claude-opus-5-5': { in: 4, read: 0.20 }, 'claude-sonnet-5-5': { in: 2, read: 0.20 }, 'claude-haiku-4-5-20251001': { in: 1, read: 0.10 } };
const S = new Map(); for (const r of R) { if (!S.has(r.f)) S.set(r.f, []); S.get(r.f).push(r); }
let avoidedWriteExtra = 0, both = 0, gapOnly = 0, missOnly = 0, gapExcessUnder1h = 0, extraWrite1h = 0, gapExcessAll = 0, gapTokUnder1h = 0;
for (const [f, a] of S) {
  if (!f.startsWith('session:')) {
    a.sort((x, y) => x.t.localeCompare(y.t));
    const warm = []; for (let i = 1; i < a.length; i++) if (Date.parse(a[i].t) - Date.parse(a[i - 1].t) < 240e3) warm.push(a[i].cw);
    warm.sort((x, y) => x - y); const med = warm.length ? warm[Math.floor(warm.length / 2)] : 0;
    for (let i = 0; i < a.length; i++) {
      const r = a[i], p = P[r.model];
      // under a 1h TTL every write costs 2x instead of 1.25x
      if (r.cw5m > 0) extraWrite1h += r.cw5m * 0.75 * p.in / 1e6;
      if (i === 0) continue;
      const g = Date.parse(r.t) - Date.parse(a[i - 1].t);
      const isGap = g > 300e3, isMiss = r.cw > 20000 && r.cw > 0.5 * (r.cw + r.cr);
      if (isGap && isMiss) both++; else if (isGap) gapOnly++; else if (isMiss) missOnly++;
      const ex = Math.max(0, r.cw - med), exCost = ex * (1.25 * p.in - p.read) / 1e6;
      if (isGap) gapExcessAll += exCost;
      if (isGap && g <= 3600e3) { gapExcessUnder1h += exCost; gapTokUnder1h += ex; avoidedWriteExtra += ex * 0.75 * p.in / 1e6; }
    }
  }
}
// with 1h TTL: the gap<=1h re-writes vanish (save gapExcessUnder1h) but all subagent writes cost 0.75x more
const o = { subagentPostGap: { bothGapAndMiss: both, gapOnly, missOnly }, gapExcessAll, gapExcessUnder1h, gapTokUnder1h, extraWriteCostIf1hTTL: extraWrite1h, extraWriteNet: extraWrite1h - avoidedWriteExtra, net1hSaving: gapExcessUnder1h - (extraWrite1h - avoidedWriteExtra) };
writeFileSync(here + 'tok-whatif.json', JSON.stringify(o, null, 1)); console.log(o);

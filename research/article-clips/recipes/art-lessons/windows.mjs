// Items 1-2: agent-hours, $ and main commits per phase of the study (UTC). Phase edges from the article's hint timeline
// and fixes/BEST_BUILDS.md. Commit subjects are classified by topic prefix (curated lists below). Writes windows.json.
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const R = readFileSync(here + 'requests.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
const P = { 'claude-opus-5-5': [4, 20, 0.20], 'claude-sonnet-5-5': [2, 10, 0.20], 'claude-haiku-4-5-20251001': [1, 5, 0.10] };
const cost = r => { const [i, o, rd] = P[r.model]; return (r.in * i + r.cw5m * i * 1.25 + r.cw1h * i * 2 + r.cr * rd + r.out * o) / 1e6; };
const W = [
  ['A start -> first finger test (Chrome-led wave 1)', '2026-09-30T17:05:00Z', '2026-10-01T07:57:00Z'],
  ['B finger test -> GPU hint (hint 5)', '2026-10-01T07:57:00Z', '2026-10-02T23:00:00Z'],
  ['C GPU hint -> v6 breakthrough lands', '2026-10-02T23:00:00Z', '2026-10-04T07:33:00Z'],
  ['D v6 -> end-of-page focus (5 Oct 22:40)', '2026-10-04T07:33:00Z', '2026-10-05T22:40:00Z'],
  ['E end-of-page focus -> faithful turn (7 Oct 15:38)', '2026-10-05T22:40:00Z', '2026-10-07T15:38:00Z'],
  ['F faithful g0 line -> done (9 Oct 10:56)', '2026-10-07T15:38:00Z', '2026-10-09T10:56:00Z'],
  ['G epilogue (article, captures)', '2026-10-09T10:56:00Z', '2026-10-11T06:00:00Z'],
];
const S = new Map(); for (const r of R) { if (!S.has(r.f)) S.set(r.f, []); S.get(r.f).push(r); }
const out = W.map(([n, a, b]) => ({ phase: n, from: a, to: b, wallH: Math.round((Date.parse(b) - Date.parse(a)) / 36e5 * 10) / 10, agentH: 0, usd: 0, commits: 0, cat: {} }));
for (const [, a] of S) { a.sort((x, y) => x.t.localeCompare(y.t)); for (let i = 0; i < a.length; i++) { const w = out.find(o => a[i].t >= o.from && a[i].t < o.to); if (!w) continue; w.usd += cost(a[i]); if (i) w.agentH += Math.min(300e3, Date.parse(a[i].t) - Date.parse(a[i - 1].t)) / 36e5; } }
// commit classes
const notSurvived = /^(end-morph|morph-scroll|PR-018|morph-gpu|v10|v9-2|v9-1|v9\.1|v12|v13|toolbar-resize|nav-hit-cache|scroll-cb-phone|deck-contain|illusion|end-bg|countdown-tick|people-word|layout-containment|scene-scope|iphone-wave2|n10|N10|st6-rb\b|compositor-morph|cm-|v11|int-v11|join|pill-swap|image-size|anim-transform|g0-box|scrollcb-g0|morph-panel|morph-inherit)/i;
const gpuType = /(gpu|composit|scroll-driven|threaded|-ca\b|cd-roll-ca|cd-strip|platform-idle|accent-ca|reveal-paint|menu-layers|v3w|g0-gpu)/i;
const ops = /^(ops|ops-handover|docs|DIRECTION|PREDICTIONS|predictions|progress|PROGRESS|memory|CLAUDE\.md|roles|LEAD\.md|Hard rules|AGENT|ARCH_TEAM|TOPICS|FINDINGS|FINGER_TESTS|EXPERIMENTS|best builds|fixes\/BEST_BUILDS|threads|settings|team-article)/i;
const tools = /^(tools|tests)/i;
const research = /^research/i;
for (const line of readFileSync(here + 'gitlog.txt', 'utf8').trim().split('\n')) {
  const [t, ...rest] = line.split('|'); const s = rest.join('|'); const w = out.find(o => t >= o.from && t < o.to); if (!w) continue; w.commits++;
  const p = s.split(':')[0].replace(/^fix(es)?\(/, '').replace(/\)$/, '');
  const c = tools.test(p) ? 'tools' : ops.test(p) ? 'ops/docs' : research.test(p) ? 'research' : notSurvived.test(p) ? (gpuType.test(p) ? 'fix: not in g0.0m (GPU-type)' : 'fix: not in g0.0m') : (gpuType.test(p) ? 'fix: in g0.0m lineage (GPU-type)' : 'fix/other: in lineage or unclassified');
  w.cat[c] = (w.cat[c] || 0) + 1;
}
for (const o of out) { o.agentH = Math.round(o.agentH); o.usd = Math.round(o.usd); }
writeFileSync(here + 'windows.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));

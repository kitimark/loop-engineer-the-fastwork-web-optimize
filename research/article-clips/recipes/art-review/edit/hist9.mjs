// art-histogram: frame-time histograms + "when" series from the worst-case G records (read-only).
// Windows as fixes/worst-cases-capture/wc-read.mjs (frame [t, dt, scrollY, innerHeight] in (start, end] by t).
import fs from 'node:fs';
import path from 'node:path';
const DIR = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs';
const OUT = path.dirname(new URL(import.meta.url).pathname); // edit-article-p1 copy: writes hist9.json here
const BINS = [[0, 20, '0-20'], [20, 34, '20-34'], [34, 50, '34-50'], [50, 100, '50-100'], [100, 200, '100-200'], [200, Infinity, '>200']];
const mark = (seg, n) => (seg.marks || []).find((m) => m[1] === n)?.[0];
const byT = (seg, a, b) => (a == null || b == null ? [] : seg.frames.filter((f) => f[0] > a && f[0] <= b));
const byY = (fr, lo, hi) => fr.filter((f) => f[2] >= lo && f[2] < hi);
function windows(cs, seg) {
  const end = seg.frames.at(-1)?.[0];
  switch (cs) {
    case 'hero': return { 'hero-rest': byT(seg, mark(seg, 'rest'), mark(seg, 'fade')), 'hero-fade': byT(seg, mark(seg, 'fade'), mark(seg, 'end') ?? end) };
    case 'middle': { const all = byT(seg, mark(seg, 'approach'), mark(seg, 'approach-end') ?? end);
      return { 'people-deck': byY(all, 1000, 1700), 'dark-section': byY(all, 1850, 2100), 'platform-switch': byY(all, 2500, 2760), 'slow-approach': all }; }
    case 'people': return { 'people-flick': byT(seg, mark(seg, 'flick'), mark(seg, 'flick-end') ?? end) };
    case 'end': return { 'end-push6': byT(seg, mark(seg, 'E20-close-fast-60px-50ms'), mark(seg, 'E26-close-fast-60px-50ms')) };
    case 'menu': return { 'ar-menu-pushes': byT(seg, mark(seg, 'P1-open-slow-hold'), mark(seg, 'done') ?? end) };
    case 'carousel': return { 'ar-carousel-rest': byT(seg, mark(seg, 'rest'), mark(seg, 'end') ?? end) };
    case 'ptitle': return mark(seg, 'return') != null
      ? { 'ar-ptitle-v2-back': byT(seg, mark(seg, 'return'), mark(seg, 'end') ?? end) }
      : { 'ar-ptitle-v1-title': byT(seg, mark(seg, 'title'), mark(seg, 'end') ?? end) };
    default: return {};
  }
}
const hist = (fr) => {
  const n = fr.length;
  const bins = BINS.map(([lo, hi, label]) => { const c = fr.filter((f) => f[1] > lo && f[1] <= hi).length; return { bin: label, count: c, share: n ? +(c / n).toFixed(4) : null }; });
  const worst = n ? fr.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  return { n, gt34: fr.filter((f) => f[1] > 34).length, gt50: fr.filter((f) => f[1] > 50).length, worst: worst?.[1] ?? null, worstAtY: worst?.[2] ?? null, bins };
};
// clean/drift per fixes/worst-cases-capture/README.md (headline = clean runs only)
const NOTE = {
  '20261009T144444Z-wc-people-orig': 'drift (Serious -> Critical), out of the headline',
  '20261009T140920Z-wc-end-orig': 'clean thermal, run cut after E28; end case is different behaviour by design',
  '20261009T142230Z-wc-end-orig': 'drift (-> Critical); run cut after E26',
  '20261009T144540Z-wc-end-orig': 'drift (-> Critical)',
  '20261009T141903Z-wc-end-g0l': 'drift (-> Critical); only g0l end run',
};
const cases = {}; const runs = [];
for (const f of fs.readdirSync(DIR).filter((x) => /-(wc|ar)-[a-z]+-(orig|g0l|v14|g0m)\.json$/.test(x)).sort()) {
  const [, id, cs, arm] = f.match(/^(.*?-(?:wc|ar)-([a-z]+)-(orig|g0l|v14|g0m))\.json$/);
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const seg = (rec.run?.segments || []).find((s) => (s.marks || []).length) || rec.run?.segments?.[0];
  if (!seg) continue;
  const p = rec.meta?.profile || {};
  const drift = !!p.drift || /drift/.test(NOTE[id] || '') || (cs === 'menu');
  const thermal = `${p.start?.state} ${p.start?.battC} -> ${p.end?.state} ${p.end?.battC}`;
  for (const [w, fr] of Object.entries(windows(cs, seg))) {
    (cases[w] ??= {}); (cases[w][arm] ??= []);
    cases[w][arm].push({ run: id, clean: !drift, thermal, note: NOTE[id] || (cs === 'menu' ? 'drift (all four menu runs end at Critical); behaviour differs by design' : null), ...hist(fr) });
  }
  if (cs === 'middle') runs.push({ id, arm, seg });
}
// pooled clean slow approach
const pooled = {};
for (const [arm, rs] of Object.entries(cases['slow-approach'])) {
  const clean = rs.filter((r) => r.clean); const n = clean.reduce((a, r) => a + r.n, 0);
  pooled[arm] = { runs: clean.map((r) => r.run), n, gt34: clean.reduce((a, r) => a + r.gt34, 0), gt50: clean.reduce((a, r) => a + r.gt50, 0), worst: Math.max(...clean.map((r) => r.worst)),
    bins: BINS.map(([, , label], i) => { const c = clean.reduce((a, r) => a + r.bins[i].count, 0); return { bin: label, count: c, share: +(c / n).toFixed(4) }; }) };
}
// "when" series: one run per arm, the pair art-gif-pb used for the middle clip
const WHEN = ['20261009T135711Z-wc-middle-orig', '20261009T135904Z-wc-middle-g0l'];
const when = {};
for (const r of runs.filter((r) => WHEN.includes(r.id))) {
  const a = mark(r.seg, 'approach'); const b = mark(r.seg, 'approach-end');
  when[r.arm] = { run: r.id, columns: ['tMs_from_approach', 'dtMs', 'scrollY', 'innerHeight'], frames: byT(r.seg, a, b).map((f) => [f[0] - a, f[1], f[2], f[3]]) };
}
const outj = { madeAt: new Date().toISOString(), by: 'art-histogram', status: 'OBSERVED, iPhone 15 Pro Max Safari, G robot finger, tool-serious; n = 1-2 per arm, one afternoon',
  source: 'fixes/worst-cases-capture (README, wc-read.mjs windows); records in the cap-worst worktree out/wc/runs/',
  binsMs: 'dt in (lo, hi]; >34 = sum of bins 34-50 and up', thresholds: { slow: 34, goal: 50, frameMs: 16.7 },
  arms: { orig: 'original page (baseline b1789284481295-a455e793)', g0l: 'g0.0l (9 Oct)', g0m: 'g0.0m (10 Oct)', v14: 'v14 (Day 8 menu pair)' },
  pooledSlowApproachClean: pooled, cases, when };
fs.writeFileSync(path.join(OUT, 'hist9.json'), JSON.stringify(outj, null, 1));
for (const [w, arms] of Object.entries(cases)) for (const [arm, rs] of Object.entries(arms)) for (const r of rs)
  console.log(w.padEnd(20), arm.padEnd(5), r.run.slice(0, 16), r.clean ? 'clean' : 'DRIFT', 'n', r.n, '>34', r.gt34, '>50', r.gt50, 'worst', r.worst, '@y', r.worstAtY, r.bins.map((b) => b.count).join('/'));
console.log(JSON.stringify(pooled, null, 1));

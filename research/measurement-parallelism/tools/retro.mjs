#!/usr/bin/env node
// Retrospective: collect every raw verify output (verify.json / results*.json with per-run rows) from
// the main checkout and all worktrees (read-only), keep mobile 6x runs, and relate per-run metrics to
// the host load recorded by verify.mjs (loadavg1 before each run).
// Usage: node retro.mjs [--json out.json]   (prints markdown tables)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const HOME = process.env.FW_HOME || '/Users/<user>/source/fastwork-com-web-optimize';
const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const roots = [HOME, ...readdirSync(join(HOME, '.claude/worktrees')).map((d) => join(HOME, '.claude/worktrees', d))];
const SKIP = new Set(['node_modules', '.git', 'site', 'site-pretty', 'overlay', 'worktrees', 'certs']);
const files = [];
function walk(d, depth) {
  if (depth > 6) return;
  let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('chrome')) walk(p, depth + 1); }
    else if (/^(results.*|verify.*)\.json$/.test(e.name)) files.push(p);
  }
}
for (const r of roots) for (const sub of ['out', 'fixes', 'research']) walk(join(r, sub), 0);

const METRICS = ['fps', 'gt20', 'gt34', 'gt50', 'max', 'p95', 'loafMs', 'loafScriptMs', 'forcedLayoutMs'];
const rows = [];
const seen = new Set();
for (const f of files) {
  let v; try { v = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (!Array.isArray(v.results) || !v.results.some((r) => r.scrollSummary)) continue; // not raw verify output
  if (Number(v.cpu) !== 6) continue;
  const labels = (v.targets || []).map((t) => t.label);
  const kind = labels.includes('base2') ? 'A/A' : labels.includes('fix') ? 'A/B' : labels.join('/');
  const session = relative(HOME, f);
  let order = 0;
  for (const r of v.results) {
    if (r.diff || !r.scrollSummary || r.viewport !== 'mobile') continue;
    const key = session + r.label + r.run;
    if (seen.has(key)) continue; seen.add(key);
    rows.push({
      session, kind, label: r.label, side: r.label === 'fix' ? 'patched' : 'baseline', run: r.run, order: order++,
      loadBefore: r.loadavg1?.before ?? null, loadAfter: r.loadavg1?.after ?? null,
      ...Object.fromEntries(METRICS.map((m) => [m, r.scrollSummary[m]])),
      morphFps: r.morphSummary?.fps, morphGt50: r.morphSummary?.gt50,
    });
  }
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r1 = (x) => Math.round(x * 10) / 10;
function pearson(x, y) {
  const n = x.length; const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx };
}
function spearman(x, y) {
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const rk = []; idx.forEach(([, i], k) => { rk[i] = k; }); return rk; };
  return pearson(rank(x), rank(y)).r;
}

const out = [];
out.push(`# Retrospective: ${rows.length} mobile 6x runs from ${new Set(rows.map((r) => r.session)).size} sessions\n`);
out.push('## Sessions\n');
out.push('| session | kind | runs | load range | baseline gt20 median [min-max] | baseline fps median [min-max] | baseline LoAF ms median [min-max] |');
out.push('|---|---|---|---|---|---|---|');
const sessions = [...new Set(rows.map((r) => r.session))];
for (const s of sessions) {
  const rs = rows.filter((r) => r.session === s), b = rs.filter((r) => r.side === 'baseline');
  const L = rs.map((r) => r.loadBefore).filter((x) => x != null);
  const rng = (m) => `${r1(med(b.map((r) => r[m])))} [${Math.min(...b.map((r) => r[m]))}-${Math.max(...b.map((r) => r[m]))}]`;
  out.push(`| ${s.replace(/^\.claude\/worktrees\//, '')} | ${rs[0].kind} | ${rs.length} | ${L.length ? `${Math.min(...L)}-${Math.max(...L)}` : '?'} | ${rng('gt20')} | ${rng('fps')} | ${rng('loafMs')} |`);
}

out.push('\n## Baseline-side runs by host load (loadavg1 before the run)\n');
const base = rows.filter((r) => r.side === 'baseline' && r.loadBefore != null);
const bins = [[0, 4], [4, 6], [6, 8], [8, 10], [10, 15], [15, 99]];
out.push('| load | n | fps median [min-max] | >20 ms median [min-max] | >34 ms | >50 ms | LoAF ms | forced ms |');
out.push('|---|---|---|---|---|---|---|---|');
for (const [lo, hi] of bins) {
  const b = base.filter((r) => r.loadBefore >= lo && r.loadBefore < hi);
  if (!b.length) continue;
  const c = (m) => `${r1(med(b.map((r) => r[m])))} [${Math.min(...b.map((r) => r[m]))}-${Math.max(...b.map((r) => r[m]))}]`;
  out.push(`| ${lo}-${hi === 99 ? '' : hi} | ${b.length} | ${c('fps')} | ${c('gt20')} | ${c('gt34')} | ${c('gt50')} | ${c('loafMs')} | ${c('forcedLayoutMs')} |`);
}
out.push('\n## Correlation with load (baseline-side runs)\n');
out.push('| metric | Pearson r | Spearman rho | OLS slope per +1 load |');
out.push('|---|---|---|---|');
const corr = {};
for (const m of [...METRICS, 'morphFps', 'morphGt50']) {
  const pts = base.filter((r) => r[m] != null);
  if (pts.length < 4) continue;
  const x = pts.map((r) => (r.loadBefore + (r.loadAfter ?? r.loadBefore)) / 2), y = pts.map((r) => r[m]);
  const p = pearson(x, y), s = spearman(x, y);
  corr[m] = { n: pts.length, r: p.r, rho: s, slope: p.slope };
  out.push(`| ${m} | ${p.r.toFixed(2)} | ${s.toFixed(2)} | ${p.slope.toFixed(2)} |`);
}
out.push(`\n(load per run = mean of loadavg1 before and after the run; n=${base.length})`);

// Within-session: demean load and metric per session (all runs, both sides; A/B sides demeaned separately)
// so a between-session difference (different time, different code) can't masquerade as a load effect.
out.push('\n## Within-session correlation (load and metric demeaned per session and side)\n');
out.push('| metric | n | Pearson r | slope per +1 load |');
out.push('|---|---|---|---|');
const within = {};
for (const m of ['fps', 'gt20', 'gt34', 'gt50', 'loafMs', 'forcedLayoutMs']) {
  const x = [], y = [];
  for (const s of sessions) for (const side of ['baseline', 'patched']) {
    const g = rows.filter((r) => r.session === s && r.side === side && r.loadBefore != null && r[m] != null);
    if (g.length < 3) continue;
    const L = g.map((r) => (r.loadBefore + (r.loadAfter ?? r.loadBefore)) / 2), V = g.map((r) => r[m]);
    const mL = L.reduce((a, b) => a + b, 0) / L.length, mV = V.reduce((a, b) => a + b, 0) / V.length;
    L.forEach((l, i) => { x.push(l - mL); y.push(V[i] - mV); });
  }
  if (x.length < 4) continue;
  const p = pearson(x, y);
  within[m] = { n: x.length, r: p.r, slope: p.slope };
  out.push(`| ${m} | ${x.length} | ${p.r.toFixed(2)} | ${p.slope.toFixed(2)} |`);
}
corr.within = within;
console.log(out.join('\n'));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), rows, corr }, null, 1));

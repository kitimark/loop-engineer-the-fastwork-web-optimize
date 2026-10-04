// v8-section-ms: tables from out/sec/pages.jsonl (probe.mjs). Median and range over runs per arm, per section
// (scroll phase: ms per one top-to-bottom scroll while that section is under the viewport's centre line) and per
// rest window (ms per second at rest). Writes fixes/v8-section-ms/results.json and prints Markdown tables.
//   node fixes/v8-section-ms/summarize.mjs [--pages pages.jsonl] [--tags h1,h2] [--arms A,V,B]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO as WT } from '../../tools/lib/paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const TAGS = opt('tags', '') ? opt('tags').split(',') : null;
const pages = readFileSync(join(WT, 'out/sec', opt('pages', 'pages.jsonl')), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((p) => p.tag !== 'dry' && (!TAGS || TAGS.includes(p.tag)));
const ARMS = opt('arms', 'A,V,B').split(',').filter((a) => pages.some((p) => p.arm === a));
const NAME = { A: 'v7', V: 'v8', B: 'baseline' };
const LABEL = { above: 'above first section', 'hero-track': 'hero', people: 'people (avatar rows)', 'profile-showcase': 'profile showcase', feed: 'profile feed',  pain: 'pain', commission: 'commission', platform: 'platform', footer: 'below platform (footer)' };
const r1 = (x) => Math.round(x * 10) / 10;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const stat = (xs) => ({ median: r1(med(xs)), min: r1(Math.min(...xs)), max: r1(Math.max(...xs)), n: xs.length, runs: xs.map(r1) });
const MAIN = ['script', 'style', 'layout', 'paint', 'other'];
const COLS = [...MAIN, 'main', 'layer', 'hitTest', 'navJs', 'compositor'];
const mainOf = (z) => MAIN.reduce((a, m) => a + (z?.[m] || 0), 0);
const val = (z, k) => (k === 'main' ? mainOf(z) : k === 'mainPerFrame' ? (z?.frames ? mainOf(z) / z.frames : 0) : k === 'commits' ? z?.counts?.Commit || 0 : z?.[k] || 0);
/** v8 vs v7 on one metric: lower / higher only when the ranges do not overlap. */
const cmp = (a, b) => (!a || !b ? null : b.max < a.min ? 'lower' : b.min > a.max ? 'higher' : 'overlap');

const byArm = Object.fromEntries(ARMS.map((a) => [a, pages.filter((p) => p.arm === a)]));
// section order from the first page's geometry
const g0 = pages[0].geom; const order = ['above', ...[...new Set([...g0.secs.map((s) => s.id), ...Object.keys(g0.marks || {})])].sort((x, y) => ((g0.marks?.[x] ?? g0.secs.find((s) => s.id === x))?.top ?? 0) - ((g0.marks?.[y] ?? g0.secs.find((s) => s.id === y))?.top ?? 0)), 'footer'];
const out = { generated: new Date().toISOString(), source: 'out/sec/pages.jsonl (fixes/v8-section-ms/probe.mjs)', tags: [...new Set(pages.map((p) => p.tag))],
  setting: 'Chrome 430x932 DPR 3 touch, CPU 6x, serve --vendors=local --https --latency 150, fresh isolated context per page; tracing + JS profiler on (perturbs timing: compare arms with each other only)',
  arms: Object.fromEntries(ARMS.map((a) => [a, { name: NAME[a], js: byArm[a][0].js, css: byArm[a][0].css, nav: byArm[a][0].nav, runs: byArm[a].length, browser: byArm[a][0].browser }])),
  geometry: Object.fromEntries(ARMS.map((a) => [a, { h: byArm[a][0].geom.h, vh: byArm[a][0].geom.vh, secs: byArm[a][0].geom.secs, nav: byArm[a][0].geom.nav,
    sameAcrossRuns: byArm[a].every((p) => JSON.stringify(p.geom.secs) === JSON.stringify(byArm[a][0].geom.secs)),
    maxTopShiftAfterScroll: Math.max(...byArm[a].map((p) => Math.max(...p.geom.secs.map((s, i) => Math.abs((p.geomAfter?.secs?.[i]?.top ?? s.top) - s.top))))) }])),
  checks: Object.fromEntries(ARMS.map((a) => [a, byArm[a].map((p) => ({ run: p.run, tag: p.tag, errors: p.errors.length, load1: p.load1.map(r1), scrollHostBusyPct: p.scroll.hostBusyPct, scrollTicks: p.scroll.ticks, scrollS: r1(p.scroll.ms / 1000), traceEvents: p.scroll.events, bufferPercentMax: p.scroll.bufferPercentMax, dataLoss: p.scroll.dataLoss, jsInsideMainEvents: p.scroll.jsInsideMainEvents, restJsInside: Object.fromEntries(Object.entries(p.rests).map(([k, r]) => [k, r.jsInsideMainEvents])) }))])),
  scroll: {}, scrollTotal: {}, rest: {} };

for (const sec of order) {
  if (!ARMS.some((a) => byArm[a].some((p) => p.scroll.bands?.[sec]))) continue;
  out.scroll[sec] = { label: LABEL[sec] || sec };
  for (const a of ARMS) {
    const ps = byArm[a];
    out.scroll[sec][a] = Object.fromEntries([...COLS, 'wallMs', 'frames', 'mainPerFrame', 'k5', 'k7', 'styleElements', 'layoutObjects'].map((k) => [k, stat(ps.map((p) => val(p.scroll.bands?.[sec], k)))]));
    out.scroll[sec][a].topJs = ps[0].scroll.bands?.[sec]?.topJs ?? [];
    out.scroll[sec][a].topNames = ps[0].scroll.bands?.[sec]?.topNames ?? [];
  }
  if (out.scroll[sec].A && out.scroll[sec].V) out.scroll[sec].v8vsV7 = Object.fromEntries(COLS.map((k) => [k, cmp(out.scroll[sec].A[k], out.scroll[sec].V[k])]));
}
for (const a of ARMS) { out.scrollTotal[a] = Object.fromEntries([...COLS, 'wallMs', 'frames', 'k5', 'k7'].map((k) => [k, stat(byArm[a].map((p) => Object.values(p.scroll.bands || {}).reduce((s, z) => s + val(z, k), 0)))]));
  out.scrollTotal[a].mainPerFrame = stat(byArm[a].map((p) => { const b = Object.values(p.scroll.bands || {}); return b.reduce((s, z) => s + mainOf(z), 0) / Math.max(1, b.reduce((s, z) => s + z.frames, 0)); })); }
if (out.scrollTotal.A && out.scrollTotal.V) out.scrollTotal.v8vsV7 = Object.fromEntries(COLS.map((k) => [k, cmp(out.scrollTotal.A[k], out.scrollTotal.V[k])]));
const RESTS = ['hero', 'people', 'profile-showcase', 'pain', 'commission', 'end'].filter((w) => pages.some((p) => p.rests[w]));
for (const w of RESTS) {
  out.rest[w] = { y: Object.fromEntries(ARMS.map((a) => [a, byArm[a][0].rests[w]?.y])), section: byArm[ARMS[0]][0].rests[w]?.section };
  for (const a of ARMS) {
    const ps = byArm[a].filter((p) => p.rests[w]?.bands?.window);
    out.rest[w][a] = Object.fromEntries(COLS.map((k) => [k, stat(ps.map((p) => (val(p.rests[w].bands.window, k) * 1000) / p.rests[w].windowMs))]));
    // frames at rest: main-thread Commit events (counted from the h2 hold on; null before)
    const cps = ps.filter((p) => p.rests[w].bands.window.counts);
    out.rest[w][a].commitsPerS = cps.length ? stat(cps.map((p) => (val(p.rests[w].bands.window, 'commits') * 1000) / p.rests[w].windowMs)) : null;
    out.rest[w][a].mainMsPerCommit = cps.length ? stat(cps.map((p) => mainOf(p.rests[w].bands.window) / Math.max(1, val(p.rests[w].bands.window, 'commits')))) : null;
    out.rest[w][a].topNames = ps[0]?.rests[w].bands.window.topNames ?? [];
    out.rest[w][a].topJs = ps[0]?.rests[w].bands.window.topJs ?? [];
  }
  if (out.rest[w].A && out.rest[w].V) out.rest[w].v8vsV7 = Object.fromEntries(COLS.map((k) => [k, cmp(out.rest[w].A[k], out.rest[w].V[k])]));
}
writeFileSync(join(HERE, 'results.json'), JSON.stringify(out, null, 1) + '\n');

// ---------- Markdown ----------
const cell = (s) => (s ? `${s.median} (${s.min}-${s.max})` : '-');
const tbl = (title, rows, unit) => {
  console.log(`\n${title} (${unit}; median (min-max) over ${Math.min(...ARMS.map((a) => byArm[a].length))} runs; ${ARMS.map((a) => NAME[a]).join(' / ')})\n`);
  const extra = unit.startsWith('ms per one') ? [['frames', 'frames'], ['mainPerFrame', 'main ms / frame']] : rows.some(([, z]) => ARMS.some((a) => z[a]?.commitsPerS)) ? [['commitsPerS', 'commits / s'], ['mainMsPerCommit', 'main ms / commit']] : [];
  const ks = ['script', 'style', 'layout', 'paint', 'layer', 'other', 'main', 'navJs', 'hitTest', 'compositor', ...extra.map(([k]) => k)];
  console.log(`| ${['where', 'build', 'script', 'style', 'layout', 'paint', 'of it layerize/commit', 'other main', 'main total', 'nav JS (profile)', 'hit test', 'compositor thread', ...extra.map(([, l]) => l), 'v8 vs v7 (no range overlap)'].join(' | ')} |`);
  console.log(`|${' --- |'.repeat(ks.length + 3)}`);
  for (const [label, z, v] of rows) for (const a of ARMS) console.log(`| ${a === ARMS[0] ? label : ''} | ${NAME[a]} | ${ks.map((k) => cell(z[a]?.[k])).join(' | ')} | ${a === 'V' && v ? Object.entries(v).filter(([, x]) => x === 'lower' || x === 'higher').map(([k, x]) => `${k} ${x}`).join(', ') || 'all overlap' : ''} |`);
};
tbl('Scroll, per section', Object.entries(out.scroll).map(([k, z]) => [z.label, z, z.v8vsV7]).concat([['whole page', out.scrollTotal, out.scrollTotal.v8vsV7]]), 'ms per one top-to-bottom scroll');
tbl('Rest windows', Object.entries(out.rest).map(([k, z]) => [`${k} (y ${z.y.V ?? z.y.A})`, z, z.v8vsV7]), 'ms per second at rest');
console.log('\nwall time per section in the scroll (ms):', JSON.stringify(Object.fromEntries(Object.entries(out.scroll).map(([k, z]) => [k, Object.fromEntries(ARMS.map((a) => [NAME[a], z[a].wallMs.median]))]))));
console.log('checks:', JSON.stringify(out.checks));

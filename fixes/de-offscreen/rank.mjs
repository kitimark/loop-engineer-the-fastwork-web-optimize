#!/usr/bin/env node
// de-offscreen: from summarize.mjs's JSON, (1) per build and position the layers the user cannot see (seen = off or
// hidden) that still hold memory, paint, animate or carry will-change, ranked by memory then paints; (2) the owner
// groups g0.0e / g0.0f add over v0 among them (count by owner selector + seen class).
//   node fixes/de-offscreen/rank.mjs <summary.json> [--engine sim|chrome] [--top 15]
import { readFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const S = JSON.parse(readFileSync(argv[0], 'utf8'));
const eng = opt('--engine', 'sim'), TOP = Number(opt('--top', '15'));
const PAINT = { chrome: (x) => (x.idle || 0) + (x.scroll || 0), sim: (x) => (x.pcNet ?? x.total ?? 0) };
const MB = (b) => (Math.round(b / 1e4) / 100).toFixed(2);
const anim = (x) => [...x.own, ...x.sub].slice(0, 2).join(' ');
const key = (x) => `${x.sel}|${x.seen}`;
for (const pos of ['top', 'B']) {
  const by = {};
  for (const arm of ['v0', 'e', 'f']) {
    const s = S[eng]?.[arm]?.positions?.[pos]; if (!s) continue;
    const unseen = s.rows.filter((x) => x.seen === 'off' || x.seen === 'hidden');
    by[arm] = unseen;
    const act = unseen.filter((x) => x.mem > 0 || PAINT[eng](x) > 0 || x.own.length || x.subRunning || x.wc);
    const tot = (xs) => `${xs.length} layers, ${MB(xs.reduce((a, x) => a + x.mem, 0))} MB, ${xs.reduce((a, x) => a + PAINT[eng](x), 0)} paints`;
    console.log(`\n### ${eng} ${pos} ${arm}: unseen ${tot(unseen)}; of them active ${tot(act)}`);
    console.log('| owner | seen | gap px | box (viewport) | MB | paints | reasons | anim / will-change |'); console.log('|---|---|---|---|---|---|---|---|');
    for (const x of act.sort((a, b) => b.mem - a.mem || PAINT[eng](b) - PAINT[eng](a)).slice(0, TOP))
      console.log(`| ${x.sel.slice(0, 60)} | ${x.seen}${x.hiddenBy ? ' (' + x.hiddenBy.slice(0, 50) + ')' : ''} | ${x.gap ?? ''}${x.dir ? ' ' + x.dir : ''} | ${(x.box || []).join(',')} | ${MB(x.mem)} | ${PAINT[eng](x)}${x.isNew ? ' new' : ''} | ${x.reasons.slice(0, 3).join(',')} | ${anim(x)}${x.wc ? ' wc:' + x.wc : ''} |`);
  }
  for (const arm of ['e', 'f']) {
    if (!by[arm] || !by.v0) continue;
    const cnt = (xs) => { const o = {}; for (const x of xs) { const k = key(x); (o[k] ||= []).push(x); } return o; };
    const a = cnt(by[arm]), b = cnt(by.v0);
    const adds = Object.entries(a).map(([k, xs]) => ({ k, xs, d: xs.length - (b[k]?.length || 0), dm: xs.reduce((s, x) => s + x.mem, 0) - (b[k] || []).reduce((s, x) => s + x.mem, 0) })).filter((x) => x.d > 0 || x.dm > 1e5);
    const gone = Object.entries(b).map(([k, xs]) => ({ k, d: (a[k]?.length || 0) - xs.length })).filter((x) => x.d < 0);
    console.log(`\n#### ${eng} ${pos}: unseen layers ${arm} adds over v0 (+${adds.reduce((s, x) => s + x.d, 0)} layers, ${MB(adds.reduce((s, x) => s + x.dm, 0))} MB); v0-only: ${gone.map((x) => x.k + ' ' + x.d).join('; ') || 'none'}`);
    console.log('| owner | seen | +n | +MB | paints | gap px | reasons | anim / will-change |'); console.log('|---|---|---|---|---|---|---|---|');
    for (const x of adds.sort((p, q) => q.dm - p.dm || q.d - p.d)) { const f = x.xs[0]; const gaps = x.xs.map((y) => y.gap).filter((g) => g != null);
      console.log(`| ${x.k.split('|')[0].slice(0, 60)} | ${x.k.split('|')[1]} | ${x.d} | ${MB(x.dm)} | ${x.xs.reduce((s, y) => s + PAINT[eng](y), 0)} | ${gaps.length ? Math.min(...gaps) + '-' + Math.max(...gaps) + ' ' + (f.dir || '') : ''} | ${f.reasons.slice(0, 3).join(',')} | ${anim(f)}${f.wc ? ' wc:' + f.wc : ''} |`); }
  }
}

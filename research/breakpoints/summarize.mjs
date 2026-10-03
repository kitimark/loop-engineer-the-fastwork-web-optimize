// Markdown tables from the sweep's JSON (de-breakpoints, T-034): node research/breakpoints/summarize.mjs <sweep-pix.json|sweep-census.json|sweep-resize.json>
// pix/resize: per config x stop: A/B % (n differing px > 8 levels, > 48 levels), A/A %, flag; plus console errors / HTTP errors per arm.
// census: per config x arm: the counts sweep.mjs recorded (rest, scroll, end rest).
import { readFileSync } from 'node:fs';
const f = process.argv[2];
const r = JSON.parse(readFileSync(f, 'utf8'));
const fmt = (d) => (d.pct === 0 ? '0' : `${d.pct}`) + (d.big ? ` (${d.big} big)` : '');
if (r.mode === 'census' || /census/.test(f)) {
  // rest = 4 s at the top after load; scroll = rAF scroll to the end (vh/40 per frame); end = 1.5 s at rest at the end.
  // L/R = Performance.getMetrics LayoutCount / RecalcStyleCount deltas; P = trace Paint events; lay = LayerTree size.
  const keys = Object.keys(r.units).filter((k) => r.units[k].done);
  console.log('| config/arm | rest L / R / P / lay | scroll L / R / P / max lay (frames) | end L / R / P | F3 cover at end: #platform / nav (of 96), O | err |\n|---|---|---|---|---|---|');
  for (const k of keys) {
    const u = r.units[k], t = (x) => x?.trace?.Paint ?? '-';
    const e = u.errs; const err = `${e.exceptions.length}/${e.consoleErrors.length}/${e.http.length}`;
    console.log(`| ${k} | ${u.rest.layouts} / ${u.rest.recalcs} / ${t(u.rest)} / ${u.rest.layers} | ${u.scrollCounts.layouts} / ${u.scrollCounts.recalcs} / ${t(u.scrollCounts)} / ${u.scrollCounts.maxLayers} (${u.scroll.frames}) | ${u.endRest.layouts} / ${u.endRest.recalcs} / ${t(u.endRest)} | ${u.cover.plat} / ${u.cover.nav}, ${u.cover.O} | ${err} |`);
  }
  // the media-query truth table per config (same in every arm: it is the viewport's, not the fix's)
  const seen = new Set();
  for (const k of keys) { const c = k.split('/')[0]; if (seen.has(c)) continue; seen.add(c); console.log(`- ${c}: ${Object.entries(r.units[k].mq || {}).filter(([, v]) => v).map(([q]) => q).join(', ')}`); }
} else {
  const stops = ['top', 'hero', 'people', 'pain', 'commission', 'end'];
  const diffKeys = Object.keys(r.diffs);
  const cfgs = [...new Set(diffKeys.map((k) => k.split('/')[0]))];
  console.log(`| config | ${stops.join(' | ')} | errors B/S/B2 (exc/console/http) |\n|---|${stops.map(() => '---').join('|')}|---|`);
  for (const c of cfgs) {
    const cell = (s) => { const d = r.diffs[`${c}/${s}`]; if (!d) return '-'; return `${fmt(d.ab)} / A/A ${fmt(d.aa)}${d.flag ? ' **FLAG**' : ''}`; };
    const errs = ['B', 'S', 'B2'].map((a) => { const e = r.units[`${c}/${a}`]?.errs; return e ? `${e.exceptions.length}/${e.consoleErrors.length}/${e.http.length}` : '-'; }).join(', ');
    console.log(`| ${c} | ${stops.map(cell).join(' | ')} | ${errs} |`);
  }
  const extra = diffKeys.filter((k) => !stops.includes(k.split('/').slice(1).join('/')));
  if (extra.length) { console.log('\n| step | A/B % | A/A % | S~B2 % | flag |\n|---|---|---|---|---|'); for (const k of extra) { const d = r.diffs[k]; console.log(`| ${k} | ${fmt(d.ab)} | ${fmt(d.aa)} | ${fmt(d.s2b)} | ${d.flag ? 'FLAG' : ''} |`); } }
}

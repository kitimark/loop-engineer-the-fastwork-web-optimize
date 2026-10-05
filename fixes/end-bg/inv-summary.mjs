// end-bg: summarize an endbg-chrome.mjs --mode inv file: one line per painting item (background image/gradient, mask,
// filter, backdrop-filter, blend, img/svg/canvas, big solid fill) seen in the viewport at any position, with its visible
// area per position and height, and whether its box changes between the two heights (775 vs 815).
//   node fixes/end-bg/inv-summary.mjs out/end-bg/inv-<stamp>.json [--pos m0,mhalf,m1]
import { readFileSync } from 'node:fs';
const f = process.argv[2]; const POS = (process.argv.includes('--pos') ? process.argv[process.argv.indexOf('--pos') + 1] : 'pre,m0,mhalf,m1').split(',');
const res = JSON.parse(readFileSync(f, 'utf8'));
const items = new Map();
for (const run of res.runs) for (const [pos, p] of Object.entries(run.pos)) { if (!POS.includes(pos)) continue;
  for (const it of p.inv.items) { const k = it.key; const e = items.get(k) || { it, seen: {} }; e.seen[`${pos}@${run.h}`] = { vis: it.visArea, rect: it.rect, filter: it.filter, opacity: it.opacity }; items.set(k, e); } }
const kind = (it) => [it.bgImage && (it.bgImage.includes('url(') ? 'url' : 'gradient'), it.mask && 'mask', it.filter !== 'none' && 'filter:' + it.filter.slice(0, 40), it.backdrop && it.backdrop !== 'none' && 'backdrop:' + it.backdrop.slice(0, 30), it.blend !== 'normal' && 'blend:' + it.blend, it.img && 'img', it.tag === 'svg' && 'svg', it.tag === 'CANVAS' && 'canvas'].filter(Boolean).join(' ') || 'solid-fill';
const rows = [...items.values()].map((e) => ({ ...e, maxVis: Math.max(...Object.values(e.seen).map((s) => s.vis)) })).sort((a, b) => b.maxVis - a.maxVis);
for (const e of rows) { const it = e.it;
  const vis = POS.map((p) => `${p}:${e.seen[`${p}@775`]?.vis ?? '-'}/${e.seen[`${p}@815`]?.vis ?? '-'}`).join(' ');
  const h775 = Object.entries(e.seen).filter(([k]) => k.endsWith('@775')).map(([, s]) => s.rect.h), h815 = Object.entries(e.seen).filter(([k]) => k.endsWith('@815')).map(([, s]) => s.rect.h);
  const resize = h775.length && h815.length && Math.max(...h775) !== Math.max(...h815) ? `RESIZES h ${Math.max(...h775)}->${Math.max(...h815)}` : '';
  const url = it.bgImage && (it.bgImage.match(/url\("?([^")]{0,90})/) || [])[1];
  console.log(`${it.region.padEnd(10)} ${String(e.maxVis).padStart(7)} ${kind(it).padEnd(46)} ${it.key.slice(-110)}\n           rect ${it.rect.w}x${it.rect.h} pos ${it.position} op ${it.opacity} ${it.bgSize && it.bgImage ? 'bgSize ' + it.bgSize + ' rep ' + it.bgRepeat + ' att ' + it.bgAttach : ''} ${url ? 'url ' + url : ''} ${it.img ? 'img ' + it.img.src.slice(-60) + ' ' + it.img.nw + 'x' + it.img.nh + ' fit ' + it.img.objectFit : ''} ${resize}\n           vis(775/815) ${vis}${it.rules.some((r) => r.props.some((p) => /vh|vw|dvh|svh|lvh/.test(p))) ? '\n           VU ' + it.rules.flatMap((r) => r.props.filter((p) => /vh|vw|dvh|svh|lvh/.test(p))).join('; ').slice(0, 200) : ''}`); }
console.log('\nurls:'); for (const u of res.runs[0].urls || []) console.log(' ', u.bytes, u.type, `${u.nw}x${u.nh}`, u.u.slice(-100));

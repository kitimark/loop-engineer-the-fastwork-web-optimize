// Compare probe.mjs records: per-window counts side by side, and a spread summary per metric.
// usage: node compare.mjs <a.json> <b.json> [...] [--metrics ult.maxEl,ult.el,...] [--windows] [--md]
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (n) => process.argv.includes('--' + n);
const mi = process.argv.indexOf('--metrics');
const METRICS = (mi > 0 ? process.argv[mi + 1] : 'ult.n,ult.el,ult.maxEl,lay.n,lay.dirty,lay.maxDirty,lay.viewRoots,inv.sInvSubtree,inv.recalcOther,inv.recalcNodes,inv.recalcAnim,inv.layInv,paint.n,paint.img,frames,pm.styleN,pm.layoutN,lt.end,lt.paints,mo.add,mo.rem,mo.attr').split(',');
const recs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const keys = recs[0].windows.map((w) => w.k);
// per metric: sum over all windows, sum over walk windows, idle value; and windows where runs disagree
console.log('runs: ' + recs.map((r) => `${r.label}(${r.headless ? 'hl' : 'hd'} cpu${r.cpu} ${r.mode} h${r.docH} y${r.finalY})`).join(' | '));
const rows = [];
for (const m of METRICS) {
  const tot = recs.map((r) => r.windows.reduce((s, w) => s + (get(w, m) ?? 0), 0));
  const idle = recs.map((r) => get(r.windows[0], m) ?? 0);
  let diffWins = 0, exactWins = 0; const dl = [];
  for (const k of keys) {
    const v = recs.map((r) => get(r.windows.find((w) => w.k === k) || {}, m));
    if (v.some((x) => x == null)) continue;
    if (v.every((x) => x === v[0])) exactWins++; else { diffWins++; if (dl.length < 4) dl.push(`${k}:${v.join('/')}`); }
  }
  rows.push({ m, tot, idle, exactWins, diffWins, dl });
  console.log(`${m.padEnd(18)} total ${tot.join(' / ').padEnd(40)} idle ${idle.join('/').padEnd(22)} windows equal ${exactWins}/${exactWins + diffWins}  ${dl.join('  ')}`);
}
if (flag('windows')) {
  for (const k of keys) {
    const ws = recs.map((r) => r.windows.find((w) => w.k === k));
    console.log(`${k.padEnd(5)} y${String(ws[0]?.y).padEnd(5)} ` + METRICS.slice(0, 12).map((m) => `${m.split('.').pop()}=${ws.map((w) => get(w || {}, m) ?? '-').join('/')}`).join(' ') + ' | ' + (ws[0]?.inv?.sInvTop?.[0]?.[0] || ''));
  }
}

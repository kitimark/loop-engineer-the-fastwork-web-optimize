// arch-sim class-4 scorer (README §4.3 rule 4 + amendment 6 + pins), tree walk as de-pm-hero's p3flip.mjs / p3x.mjs.
// usage: node score4.mjs <dir> <prefix> <rotline> <label>...   (files <dir>/<prefix><label>.json + .tl.json)
// env CUT=<ms> forces the cut (default: min(2, 0.5 x the shortest rotator-only idle Layout of that run)).
import fs from 'fs';
const [dir, prefix, rotline, ...labels] = process.argv.slice(2);
const ROT = new RegExp('JS:' + rotline + '\\b');
const TARGETS = [500, 700, 900, 1150];
const out = [];
for (const label of labels) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${prefix}${label}.json`));
  const tl = JSON.parse(fs.readFileSync(`${dir}/${prefix}${label}.tl.json`));
  const off = tl.syncTL * 1000 - r.syncT;
  const fr = r.frames;
  const ci = fr.findIndex((f) => f[2] >= 687);
  const cross = ci > 0 ? fr[ci - 1][0] : NaN;
  const flat = [];
  const w = (x, chain) => {
    const d = x.data || {};
    let tag = null;
    if (x.type === 'FunctionCall') tag = `${(d.scriptName || '').split('/').pop() || 'logger'}:${d.scriptLine}`;
    else if (x.type === 'TimerFire') tag = 'Timer';
    else if (x.type === 'FireAnimationFrame') tag = 'rAF';
    else if (x.type === 'ObserverCallback') tag = `Obs:${d.type}`;
    const c = tag ? [...chain, tag] : chain;
    flat.push({ x, chain: c });
    (x.children || []).forEach((k) => w(k, c));
  };
  tl.recs.forEach((x) => w(x, []));
  flat.sort((p, q) => p.x.startTime - q.x.startTime);
  let inv = [];
  const L = [];
  const rotInv = [];
  for (const { x, chain } of flat) {
    if (x.type === 'InvalidateLayout' && !chain.some((s) => s.startsWith('logger'))) {
      const s = (chain.join('>') || '(native)').replaceAll('2.DyWL8TcE.js', 'JS');
      inv.push(s);
      if (ROT.test(s)) rotInv.push(x.startTime * 1000 - off);
    }
    if (x.type === 'Layout') {
      L.push({ t: x.startTime * 1000 - off, ms: (x.endTime - x.startTime) * 1000, inv: [...new Set(inv)], root: x.data && x.data.root ? x.data.root.map(Math.round).join(',') : '' });
      inv = [];
    }
  }
  const hasRot = (l) => l.inv.some((s) => ROT.test(s));
  const rotOnly = (l) => l.inv.length > 0 && l.inv.every((s) => ROT.test(s));
  const [ia, ib] = r.marks.idle;
  const idleL = L.filter((l) => l.t >= ia && l.t < ib);
  const rotOnlyIdle = idleL.filter(rotOnly);
  const cut = process.env.CUT ? Number(process.env.CUT) : Math.min(2, 0.5 * Math.min(...rotOnlyIdle.map((l) => l.ms)));
  // rotator cell
  const VIEW = '0,0,430,0,430,775,0,775';
  let pass = 0, fail = 0, coal = 0; const why = [];
  const ticks = rotInv.filter((t) => t >= ia && t + 100 < ib).filter((t, i, a) => i === 0 || t - a[i - 1] > 5); // one per tick
  for (const t of ticks) {
    const l = L.find((x) => x.t >= t - 1 && x.t - t < 100 && hasRot(x));
    if (!l) { fail++; why.push(`noLayout@${Math.round(t - ia)}`); continue; }
    if (!rotOnly(l)) { coal++; continue; }
    if (l.root === VIEW && l.ms >= cut) pass++; else { fail++; why.push(`${l.root}/${l.ms.toFixed(1)}`); }
  }
  const rotCell = fail === 0 && pass >= 5 ? 'HOLDS' : 'FAILS';
  // reveal cells
  const rel = L.filter((l) => l.t - cross >= 0 && l.t - cross <= 2000).map((l) => ({ ...l, rel: Math.round(l.t - cross) }));
  const kept = rel.filter((l) => !rotOnly(l));
  const at = (min) => Object.fromEntries(TARGETS.map((tg) => [tg, kept.some((l) => Math.abs(l.rel - tg) <= 60 && l.ms >= min)]));
  const hist = { '<0.5': 0, '0.5-1': 0, '1-2': 0, '2-3': 0, '3-6': 0, '6-10': 0, '>=10': 0 };
  let inBand = 0;
  for (const l of kept.filter((l) => l.rel >= 400 && l.rel <= 1300)) {
    const m = l.ms; hist[m < 0.5 ? '<0.5' : m < 1 ? '0.5-1' : m < 2 ? '1-2' : m < 3 ? '2-3' : m < 6 ? '3-6' : m < 10 ? '6-10' : '>=10']++;
    if (m >= cut && m < 3 * cut) inBand++;
  }
  const big = kept.filter((l) => l.ms >= cut).map((l) => l.rel);
  let hits = 0, n = 0; for (let c = 400; c <= 1300; c += 5) { n++; if (big.some((x) => Math.abs(x - c) <= 60)) hits++; }
  const rec = { label, cut: +cut.toFixed(2), cells: at(cut), cells1ms: inBand ? at(1) : null, chance: Math.round((100 * hits) / n), hist, inBand, rot: { cell: rotCell, pass, fail, coalesced: coal, ticks: ticks.length, why: why.slice(0, 4), rotMs: rotOnlyIdle.map((l) => +l.ms.toFixed(1)) }, near: Object.fromEntries(TARGETS.map((tg) => [tg, kept.filter((l) => Math.abs(l.rel - tg) <= 60 && l.ms >= cut).map((l) => `+${l.rel}/${l.ms.toFixed(1)}`)])) };
  out.push(rec);
  const yn = (c) => TARGETS.map((tg) => `+${tg}:${c[tg] ? 'Y' : '-'}`).join(' ');
  console.log(`== ${label} cut ${rec.cut} ms | cells ${yn(rec.cells)}${rec.cells1ms ? ` | at 1 ms ${yn(rec.cells1ms)}` : ''} | chance ${rec.chance} % | hist ${JSON.stringify(hist)} inBand ${inBand}`);
  console.log(`   rotator ${rotCell}: pass ${pass} fail ${fail} coalesced ${coal} of ${ticks.length} ${why.length ? JSON.stringify(why.slice(0, 4)) : ''} | rot ms ${JSON.stringify(rec.rot.rotMs)}`);
  console.log(`   near: ${TARGETS.map((tg) => `+${tg}[${rec.near[tg].join(' ')}]`).join(' ')}`);
}
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(out, null, 1));

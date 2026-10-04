// T-096 step 3 summary: per load (arm A = C8, A2 = C8 second load, B = V9), Simulator Timeline counts from
// sim-rollstart.mjs. Rounds A B A2 / B A2 A / A2 A B, run as "C8,V9,C8" / "V9,C8,C8" / "C8,C8,V9" with 1 rep each, so
// the C8 rows of round 1 are [A, A2] and of rounds 2-3 [A2, A] (the label only sets the A vs A2 pairing).
// node fixes/cd-roll-ca/t096-agg3.mjs out/cd-roll-ca/rollstart rollstart-2026-10-04T13-24 rollstart-...T13-29 rollstart-...T13-39
import fs from 'node:fs';
const [D, ...pre] = process.argv.slice(2);
const files = pre.map((p) => fs.readdirSync(D).find((f) => f.startsWith(p)));
const C8LAB = [['A', 'A2'], ['A2', 'A'], ['A2', 'A']];
const med = (a) => { const s = a.filter((x) => typeof x == 'number').sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const loads = { A: [], A2: [], B: [] };
files.forEach((f, round) => {
  const r = JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8'));
  (r.arms.C8 || []).forEach((row, i) => loads[C8LAB[round][i]].push({ round, row }));
  (r.arms.V9 || []).forEach((row) => loads.B.push({ round, row }));
});
const per = (row) => {
  const R = row.rows;
  const fr = (i, k) => sum(R.map((x) => x.frames[i]?.[k]));
  return {
    ticks: row.ticks, stamped: row.stamped, renderingFrames: row.renderingFrames, layerTreeChanges: row.layerTreeChanges,
    classes: Object.fromEntries(['long', 'multi', 'one'].map((c) => [c, R.filter((x) => x.cls === c).length])),
    animCellsMed: med(R.map((x) => x.anim?.cells)), kfMaxMed: med(R.map((x) => x.anim?.kfMax)), kfTotalMed: med(R.map((x) => x.anim?.kfTotal)),
    taskRecalc: sum(R.map((x) => x.task.RecalculateStyles)), taskLayout: sum(R.map((x) => x.task.Layout)), taskTypes: [...new Set(R.map((x) => x.task.type))],
    f1: { Paint: fr(0, 'Paint'), cellPaint: fr(0, 'cellPaint'), RecalculateStyles: fr(0, 'RecalculateStyles'), Layout: fr(0, 'Layout'), Composite: fr(0, 'Composite'), FireAnimationFrame: fr(0, 'FireAnimationFrame') },
    f2: { Paint: fr(1, 'Paint'), cellPaint: fr(1, 'cellPaint'), RecalculateStyles: fr(1, 'RecalculateStyles'), Layout: fr(1, 'Layout'), Composite: fr(1, 'Composite'), FireAnimationFrame: fr(1, 'FireAnimationFrame') },
    f1to4: { Paint: sum([0, 1, 2, 3].map((i) => fr(i, 'Paint'))), RecalculateStyles: sum([0, 1, 2, 3].map((i) => fr(i, 'RecalculateStyles'))), FireAnimationFrame: sum([0, 1, 2, 3].map((i) => fr(i, 'FireAnimationFrame'))) },
  };
};
const out = { files, loads: {} };
for (const [arm, L] of Object.entries(loads)) out.loads[arm] = L.sort((a, b) => a.round - b.round).map(({ round, row }) => ({ round, ...per(row) }));
console.log(JSON.stringify(out, null, 1));

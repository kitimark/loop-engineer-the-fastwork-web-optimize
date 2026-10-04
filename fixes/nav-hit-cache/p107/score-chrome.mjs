// P-107 Chrome scoring (judged counts, guards, served hashes) from the count records.
import { readFileSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const ARM = { C: ['3e3e94cb6e9f', 'f836404b3728'], V: ['fd3688901f50', 'f836404b3728'] };
const PRED = {
  mobile: { pp: { C: [2.16, 2.28], V: [1.81, 1.94] }, ppf: { C: [0.94, 1.06], V: [0.58, 0.70] }, efp: { C: [0.94, 1.06], V: [0.58, 0.70] }, gcs: { C: [0.94, 1.06], V: [0, 0.02] } },
  desktop: { pp: { C: [1.76, 1.90], V: [1.63, 1.75] }, ppf: { C: [0.60, 0.73], V: [0.45, 0.57] }, efp: { C: [0.94, 1.06], V: [0.61, 0.73] }, gcs: { C: [0.94, 1.06], V: [0, 0.02] } },
};
const out = {};
for (const vp of ['mobile', 'desktop']) {
  const r = JSON.parse(readFileSync(D + `count-${vp}.json`, 'utf8'));
  const loads = r.loads.filter((l) => l.vp === vp);
  const get = {
    pp: (l) => l.prePaintPerStep,
    ppf: (l) => l.perStep['PrePaint.forced'] ?? 0,
    efp: (l) => l.api.navPerStep.efp ?? 0,
    gcs: (l) => l.api.navPerStep.gcs ?? 0,
    layoutForced: (l) => l.perStep['Layout.forced'] ?? 0,
    layout: (l) => l.layoutPerStep,
    ult: (l) => l.styleRecalcPerStep,
    paint: (l) => l.perStep['Paint.frame'] ?? 0,
  };
  const res = { served: loads.map((l) => [l.arm, l.served.join('/'), String(l.served) === String(ARM[l.arm])]), errors: loads.flatMap((l) => l.errors) };
  for (const [k, f] of Object.entries(get)) {
    const c = loads.filter((l) => l.arm === 'C').map(f), v = loads.filter((l) => l.arm === 'V').map(f);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const row = { C: c, V: v, Cmean: +mean(c).toFixed(3), Vmean: +mean(v).toFixed(3) };
    if (PRED[vp][k]) {
      row.judged = Math.max(...v) < Math.min(...c) ? 'lower' : 'NOT lower';
      row.inPred = { C: c.every((x) => x >= PRED[vp][k].C[0] && x <= PRED[vp][k].C[1]), V: v.every((x) => x >= PRED[vp][k].V[0] && x <= PRED[vp][k].V[1]) };
    } else row.guard = mean(v) <= mean(c) + 0.05 ? 'no worse' : 'WORSE';
    res[k] = row;
  }
  out[vp] = res;
}
console.log(JSON.stringify(out, null, 1));

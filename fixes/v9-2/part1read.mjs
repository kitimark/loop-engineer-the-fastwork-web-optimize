// P-142 part 1 read (rules as registered in fixes/v9-2/README.md "Part 1"; N6: records = part1.log RECORD lines, sim =
// each arm's first 3 non-VOID loads in log order).
import fs from 'fs';
const W = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a068af37646232e05/';
const log = fs.readFileSync(W + 'out/v92/part1.log', 'utf8');
const recs = [...log.matchAll(/^RECORD (\S+)$/gm)].map((m) => m[1]);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const rule = (F, V, abs) => {
  const fmin = Math.min(...F), fmax = Math.max(...F), vmin = Math.min(...V);
  const d = med(V) - med(F), thr = Math.max(fmax - fmin, 0.1 * med(F), abs);
  return { worse: vmin > fmax && d > thr, F, V, d: +d.toFixed(2), thr: +thr.toFixed(2) };
};
const out = { a: [], c: [], worse: [] };
// 1a Chrome census
const C = { F: [], V: [] };
for (const f of recs) { const j = JSON.parse(fs.readFileSync(W + f, 'utf8')); C[j.arm.startsWith('F') ? 'F' : 'V'].push(j); }
console.log(`1a loads F ${C.F.map((j) => j.arm)} V ${C.V.map((j) => j.arm)}`);
const served = [...log.matchAll(/^== (\S+) serves (\S+) \/ (\S+)/gm)].map((m) => `${m[1]}:${m[2]}/${m[3]}`);
console.log(`1a served ${served.join(' ')}`);
const labels = C.F[0].windows.map((w) => w.label);
for (const L of labels) for (const k of ['mainFrames', 'rafFire']) {
  const g = (arm) => C[arm].map((j) => j.windows.find((w) => w.label === L).perSec[k]);
  const r = rule(g('F'), g('V'), 2);
  const loop = L.startsWith('rest') && g('F').every((x) => x <= 5) && g('V').every((x) => x >= 15);
  const line = `1a ${L} ${k}: F ${r.F} V ${r.V} d ${r.d} thr ${r.thr} -> ${r.worse || loop ? 'WORSE' + (loop ? ' (new rest loop)' : '') : 'no-worse'}`;
  console.log(line); if (r.worse || loop) out.worse.push(line);
}
// 1c Simulator census
const S = JSON.parse(fs.readFileSync(W + 'out/v92/sim/p142.json', 'utf8')).loads;
const pick = (arm) => S.filter((l) => l.arm === arm && !l.void).slice(0, 3);
const SF = pick('F'), SV = pick('V');
console.log(`1c loads F ${SF.map((l) => l.rep + ':' + l.served.js + '/' + l.served.css)} V ${SV.map((l) => l.rep + ':' + l.served.js + '/' + l.served.css)} (all loads ${S.length}, void ${S.filter((l) => l.void).length})`);
for (const w of SF[0].windows) {
  const get = (L, f) => L.map((l) => f(l.windows.find((x) => x.stop === w.stop)));
  const mets = w.kind === 'idle'
    ? [['renderingFrames', (x) => x.renderingFrames], ['layouts', (x) => x.layouts], ['styleRecalcs', (x) => x.styleRecalcs]]
    : [['layouts/frame', (x) => x.perFrame.layouts], ['styleRecalcs/frame', (x) => x.perFrame.styleRecalcs]];
  for (const [k, f] of mets) {
    const r = rule(get(SF, f), get(SV, f), w.kind === 'idle' ? 2 : 0);
    const nw = w.kind === 'idle' && k === 'renderingFrames' && r.F.every((x) => x <= 2) && r.V.every((x) => x >= 10);
    const line = `1c ${w.stop} ${k}: F ${r.F} V ${r.V} d ${r.d} thr ${r.thr} -> ${r.worse || nw ? 'WORSE' + (nw ? ' (new rest work)' : '') : 'no-worse'}`;
    console.log(line); if (r.worse || nw) out.worse.push(line);
  }
  for (const k of ['paints', 'composites']) console.log(`1c ${w.stop} ${k} (report): F ${get(SF, (x) => x[k])} V ${get(SV, (x) => x[k])}`);
}
console.log(`PART1 ${out.worse.length ? 'WORSE' : 'no-worse'} (${out.worse.length} worse lines; NF-C not run: nf OUT, rev 1.3)`);

// best-build: platform-idle's idle-count gate on the combined build. Reads idlecount (Chrome) and simcount (Simulator)
// records and checks, per engine, that the best build N behaves as platform-idle's own build V:
//   - every load: served hashes = the arm's pin (./arms.mjs PIN); platform-idle's element rules (fixes/platform-idle/tools/
//     score.mjs voidReason) for V and N: no SMIL <animate>, 2 glints active and the glint animation running when a dash
//     is in view, a sweep band running per sweep title in view; for C: SMIL present, sweep running;
//   - per stop and judged count: N within V's range widened by the platform-idle tolerance max(2, ceil(10 % of V min))
//     ("N = V"); guard counts are no-worse only, as in platform-idle's rules: N at most V max + tolerance (a first
//     version applied the two-sided rule to guards too; changed after the first Simulator data, see README);
//   - at the primary stop (Chrome 5346, Sim bottom), each judged count of N below C's min by the same tolerance rule
//     platform-idle used ("N lower than C").
// usage: node fixes/best-build/gates/idle-compare.mjs [--chrome <records.json>] [--sim <records.json>] [--json out.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PIN } from './arms.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ENGINES = {
  chrome: { file: arg('--chrome'), primary: 5346, key: (w) => w.y, judged: ['styleRecalcs', 'prePaints', 'paints'], guard: ['layouts', 'layerizes'], report: ['functionCalls', 'beginFrames', 'drawFrames'] },
  sim: { file: arg('--sim'), primary: 'bottom', key: (w) => w.stop, judged: ['styleRecalcs', 'layouts', 'paints'], guard: ['renderingFrames', 'composites'], report: ['functionCalls', 'timerFires', 'rafs'] },
};
const tolOf = (v) => Math.max(2, Math.ceil(0.1 * v));
function voidReason(l) {
  if (l.void) return l.void;
  const p = PIN[l.arm]; if (!p) return 'unknown arm';
  if (!l.served || l.served.js !== p[0] || l.served.css !== p[1]) return `served ${l.served?.js}/${l.served?.css} != ${p.join('/')}`;
  for (const w of l.windows) {
    if (!w.ms || (l.engine === 'sim' && !w.records)) return `empty window ${w.y ?? w.stop}`;
    const k = w.check || {};
    if (l.arm === 'V' || l.arm === 'N') {
      if (k.smilAnimate !== 0) return `${l.arm} still has SMIL <animate>`;
      if (k.dashInView > 0 && (k.glintActive !== 2 || !k.running.some((n) => /pi-glint/.test(n)))) return `${l.arm} glint not running at ${w.y ?? w.stop}`;
      if (k.sweepTitlesInView > 0 && k.running.filter((n) => /pi-sweep-band/.test(n)).length < k.sweepTitlesInView) return `${l.arm} sweep band not running at ${w.y ?? w.stop}`;
    }
    if (l.arm === 'C') {
      if (!(k.smilAnimate > 0)) return 'C has no SMIL glint';
      if (k.sweepTitlesInView > 0 && !k.running.some((n) => /sweep/.test(n))) return `C sweep not running at ${w.y ?? w.stop}`;
    }
  }
  return null;
}
const out = { engines: {} }; let bad = 0;
for (const [eng, E] of Object.entries(ENGINES)) {
  if (!E.file || !existsSync(E.file)) continue;
  const loads = JSON.parse(readFileSync(E.file, 'utf8')).loads.filter((l) => l.engine === eng);
  const valid = {}, voids = [];
  for (const l of loads) { const r = voidReason(l); if (r) voids.push(`${l.arm}${l.rep}: ${r}`); else (valid[l.arm] ||= []).push(l); }
  const R = (out.engines[eng] = { loads: Object.fromEntries(Object.entries(valid).map(([a, v]) => [a, v.length])), voids, stops: {}, fails: [] });
  if (!valid.N?.length || !valid.V?.length) { R.fails.push('need valid N and V loads'); bad++; continue; }
  const stops = [...new Set(valid.N.flatMap((l) => l.windows.map(E.key)))];
  for (const stop of stops) {
    const S = (R.stops[stop] = {});
    for (const k of [...E.judged, ...E.guard, ...E.report]) {
      const per = (a) => (valid[a] || []).map((l) => l.windows.find((w) => E.key(w) === stop)?.[k]).filter((v) => v != null);
      const n = per('N'), v = per('V'), c = per('C');
      const vMin = Math.min(...v), vMax = Math.max(...v), tol = tolOf(vMin);
      const guard = E.guard.includes(k);
      const sameAsV = n.every((x) => (guard || x >= vMin - tol) && x <= vMax + tol);
      const row = { N: n, V: v, C: c, sameAsV };
      if (E.judged.includes(k) && stop === E.primary && c.length) { const cMin = Math.min(...c); row.lowerThanC = Math.max(...n) < cMin - tolOf(cMin); if (!row.lowerThanC) R.fails.push(`${stop} ${k}: N ${n} not lower than C ${c}`); }
      if (!E.report.includes(k) && !sameAsV) R.fails.push(`${stop} ${k}: N ${n} outside V ${v} ± ${tol}`);
      S[k] = row;
    }
  }
  if (voids.length) R.fails.push(`void loads: ${voids.join('; ')}`);
  R.verdict = R.fails.length ? 'FAIL' : 'PASS'; if (R.fails.length) bad++;
  console.log(`${eng}: ${R.verdict}  loads ${JSON.stringify(R.loads)}${voids.length ? '  voids ' + voids.join('; ') : ''}`);
  for (const [stop, S] of Object.entries(R.stops)) console.log(`  ${stop}: ` + Object.entries(S).map(([k, r]) => `${k} N${r.N.join('/')} V${r.V.join('/')}${r.C.length ? ' C' + r.C.join('/') : ''}${r.sameAsV ? '' : ' (N!=V)'}${r.lowerThanC === false ? ' (N not < C)' : ''}`).join(' | '));
  for (const f of R.fails) console.log('  FAIL', f);
}
const j = arg('--json'); if (j) writeFileSync(j, JSON.stringify(out, null, 1) + '\n');
process.exit(bad ? 1 : 0);

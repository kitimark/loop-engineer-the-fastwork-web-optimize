// nav-hit-cache flicker gate, the scorer (for int-v8's v9-final vs v9 step 4 phone ticket; G driver, C vs V).
// Reads `iphone.mjs gesture --inject fixes/nav-hit-cache/flicker-inject.mjs` records and scores the `.pain`
// is-pain-dark and nav is-on-dark flips per run. COUNTS ONLY: no timing claim.
//
//   node fixes/nav-hit-cache/flicker-gate.mjs --arm C c1.json c2.json ... --arm V v1.json v2.json ... [--k 8] [--json out.json]
//
// Definitions (fixed before any data, lead ruling 10-05):
//   flip      a change of the class (MutationObserver, flicker-inject.mjs), stamped with performance.now().
//   frame of a flip   the last recorder frame (run.segments[s].frames [t, dt, scrollY, innerHeight]) with t <= flip t.
//   blink     two consecutive flips of the same kind whose middle state lasted <= K rendered frames
//             (frames with t in (t1, t2]); K = 8 (primary), twins K = 4 and K = 16.
//   monotone blink   a blink across which the page's scrollY moved one way only: the recorder's scrollY from two frames
//             before the first flip's frame to the second flip's frame never changes direction (equal values ignored).
//             A blink with a direction change is a "turn" blink: the class followed the scroll position back.
// Gate (both kinds; sums over the counted runs of each arm):
//   G1 hard      V monotone blinks = 0.
//   G2 no-worse  V blinks <= C blinks + 1.
//   G3 no-worse  per kind, median flips per run: V <= C + 2.
//   Valid run: an inject value for every segment, both elements found, no inject error; an arm needs >= 3 valid runs,
//   else the gate is VOID. A verdict that differs between K = 8 and either twin is "threshold-sensitive".
// Backward steps (lead ruling A, ops note A): scrollY at EVERY rendered frame (the recorder's frames), per run: direction
//   changes and one-frame step-backs (the Simulator flickers' cause, OBSERVED), and the step-back rate per 1000 moving
//   frames, median per arm. A blink count (G2) goes against V only when the rates match (within a factor 1.5, or both
//   <= 0.5); G2 failing with rates that differ is INCONCLUSIVE (exit 5), not PASS. G1 stands regardless.
// Prediction (P-card, before data): G1 0 in both arms; G2 V blinks = C blinks +- 1; G3 equal medians +- 1.
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arms = { C: [], V: [] };
let cur = null, K = 8, jsonOut = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--arm') { cur = argv[++i]; if (!arms[cur]) { console.error(`unknown arm ${cur} (C or V)`); process.exit(1); } }
  else if (a === '--k') K = Number(argv[++i]);
  else if (a === '--json') jsonOut = argv[++i];
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
  else if (cur) arms[cur].push(a);
  else { console.error('usage: flicker-gate.mjs --arm C <files...> --arm V <files...> [--k 8] [--json out.json]'); process.exit(1); }
}
if (!arms.C.length || !arms.V.length) { console.error('usage: flicker-gate.mjs --arm C <files...> --arm V <files...> [--k 8] [--json out.json]'); process.exit(1); }

const KINDS = ['pain', 'nav'];
const frameIdx = (fr, t) => { let lo = 0, hi = fr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (fr[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const monotone = (ys) => { let dir = 0; for (let i = 1; i < ys.length; i++) { const d = Math.sign(ys[i] - ys[i - 1]); if (!d) continue; if (dir && d !== dir) return false; dir = d; } return true; };

/** Score one gesture record for one K: {valid, why, perKind: {flips, blinks, monotone, turn, list}} */
export function scoreRun(doc, k) {
  const run = doc.run || {};
  const segs = run.segments || [];
  const inj = (run.inject || []).filter((x) => x.name === 'nhc-flicker');
  const errs = (run.errors || []).filter((e) => /inject/.test(e));
  const out = { valid: true, why: [], perKind: Object.fromEntries(KINDS.map((x) => [x, { flips: 0, blinks: 0, monotone: 0, turn: 0, list: [] }])) };
  if (errs.length) { out.valid = false; out.why.push(...errs); }
  if (!segs.length) { out.valid = false; out.why.push('no segments'); }
  // report only (ops note A): how often the page's scrollY changed direction, and how many of those were one-frame
  // step-backs (direction flips and flips back on the next moving frame), per run
  out.reversals = 0; out.stepBacks = 0; out.moving = 0;
  for (const sg of segs) {
    const d = []; const fr = sg.frames || [];
    for (let i = 1; i < fr.length; i++) { const x = Math.sign(fr[i][2] - fr[i - 1][2]); if (x) d.push(x); }
    out.moving += d.length;
    for (let i = 1; i < d.length; i++) if (d[i] !== d[i - 1]) { out.reversals++; if (i + 1 < d.length && d[i + 1] !== d[i]) out.stepBacks++; }
  }
  for (const s of segs.keys()) {
    const v = inj.find((x) => x.seg === s)?.value;
    if (!v || v.error || !Array.isArray(v.flips)) { out.valid = false; out.why.push(`seg ${s}: no logger value`); continue; }
    if (!v.found?.pain || !v.found?.nav) { out.valid = false; out.why.push(`seg ${s}: element missing ${JSON.stringify(v.found)}`); }
    const fr = segs[s].frames || [];
    for (const kind of KINDS) {
      const fl = v.flips.filter((f) => f[1] === kind);
      const pk = out.perKind[kind];
      pk.flips += fl.length;
      for (let i = 1; i < fl.length; i++) {
        const a = frameIdx(fr, fl[i - 1][0]), b = frameIdx(fr, fl[i][0]);
        const n = fr.filter((f) => f[0] > fl[i - 1][0] && f[0] <= fl[i][0]).length;
        if (n > k) continue;
        const ys = fr.slice(Math.max(0, a - 2), b + 1).map((f) => f[2]);
        const mono = monotone(ys);
        pk.blinks++; mono ? pk.monotone++ : pk.turn++;
        pk.list.push({ seg: s, t: [fl[i - 1][0], fl[i][0]], on: [fl[i - 1][2], fl[i][2]], frames: n, ys, monotone: mono });
      }
    }
  }
  return out;
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function gate(k) {
  const res = {};
  for (const arm of ['C', 'V']) {
    const runs = arms[arm].map((f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return { file: f, label: d.meta?.label ?? null, script: d.program?.hash ?? null, ...scoreRun(d, k) }; });
    const valid = runs.filter((r) => r.valid);
    const sum = (kind, key) => valid.reduce((n, r) => n + r.perKind[kind][key], 0);
    res[arm] = { runs, valid: valid.length, medianReversals: median(valid.map((r) => r.reversals)), medianStepBacks: median(valid.map((r) => r.stepBacks)),
      stepBackRate: median(valid.map((r) => (r.moving ? (1000 * r.stepBacks) / r.moving : 0))),
      kinds: Object.fromEntries(KINDS.map((kind) => [kind, { blinks: sum(kind, 'blinks'), monotone: sum(kind, 'monotone'), turn: sum(kind, 'turn'), medianFlips: median(valid.map((r) => r.perKind[kind].flips)) }])) };
  }
  const C = res.C, V = res.V;
  const scripts = new Set([...C.runs, ...V.runs].map((r) => r.script));
  const voidWhy = [];
  if (C.valid < 3 || V.valid < 3) voidWhy.push(`valid runs C ${C.valid}, V ${V.valid} (need >= 3 each)`);
  if (scripts.size > 1) voidWhy.push(`gesture script hashes differ: ${[...scripts].join(', ')}`);
  const tot = (A, key) => KINDS.reduce((n, kind) => n + A.kinds[kind][key], 0);
  const g1 = tot(V, 'monotone') === 0;
  const g2 = tot(V, 'blinks') <= tot(C, 'blinks') + 1;
  const g3 = KINDS.every((kind) => V.kinds[kind].medianFlips <= C.kinds[kind].medianFlips + 2);
  // lead ruling (A): a blink count goes against an arm only when the arms' backward-step rates match (median one-frame
  // step-backs per 1000 moving frames: within a factor 1.5 of each other, or both <= 0.5). G1 needs no step-back.
  const rc = C.stepBackRate ?? 0, rv = V.stepBackRate ?? 0;
  const ratesMatch = (rc <= 0.5 && rv <= 0.5) || (Math.min(rc, rv) > 0 && Math.max(rc, rv) / Math.min(rc, rv) <= 1.5);
  const verdict = voidWhy.length ? 'VOID' : !g1 ? 'FAIL' : g2 && g3 ? 'PASS' : !g2 && !ratesMatch ? (g3 ? 'INCONCLUSIVE' : 'FAIL') : 'FAIL';
  return { k, verdict, voidWhy, stepBackRate: { C: rc, V: rv, match: ratesMatch }, G1: { pass: g1, Vmonotone: tot(V, 'monotone'), Cmonotone: tot(C, 'monotone') },
    G2: { pass: g2, Vblinks: tot(V, 'blinks'), Cblinks: tot(C, 'blinks') },
    G3: { pass: g3, medianFlips: Object.fromEntries(KINDS.map((kind) => [kind, { C: C.kinds[kind].medianFlips, V: V.kinds[kind].medianFlips }])) },
    arms: res };
}

const main = gate(K), twins = [4, 16].filter((x) => x !== K).map(gate);
const sensitive = twins.some((t) => t.verdict !== main.verdict);
const report = { tool: 'fixes/nav-hit-cache/flicker-gate.mjs', k: K, verdict: main.verdict + (sensitive ? ' (threshold-sensitive)' : ''), main, twins: twins.map(({ arms, ...t }) => t) };
for (const arm of ['C', 'V']) for (const r of main.arms[arm].runs) console.log(`${arm} ${r.label ?? r.file}: ${r.valid ? 'valid' : 'VOID ' + r.why.join('; ')}  ` +
  KINDS.map((kind) => `${kind} flips ${r.perKind[kind].flips} blinks ${r.perKind[kind].blinks} (monotone ${r.perKind[kind].monotone})`).join(', '));
console.log(`G1 V monotone blinks ${main.G1.Vmonotone} (C ${main.G1.Cmonotone}): ${main.G1.pass ? 'pass' : 'FAIL'}`);
console.log(`G2 blinks V ${main.G2.Vblinks} <= C ${main.G2.Cblinks} + 1: ${main.G2.pass ? 'pass' : 'FAIL'}`);
console.log(`G3 median flips ${KINDS.map((kind) => `${kind} C ${main.G3.medianFlips[kind].C} V ${main.G3.medianFlips[kind].V}`).join(', ')}: ${main.G3.pass ? 'pass' : 'FAIL'}`);
console.log(`backward steps: median direction changes per run C ${main.arms.C.medianReversals} V ${main.arms.V.medianReversals}; one-frame step-backs per run C ${main.arms.C.medianStepBacks} V ${main.arms.V.medianStepBacks}; per 1000 moving frames C ${main.stepBackRate.C.toFixed(2)} V ${main.stepBackRate.V.toFixed(2)} (${main.stepBackRate.match ? 'rates match' : 'rates DIFFER'})`);
for (const t of twins) console.log(`twin K=${t.k}: ${t.verdict}`);
if (main.voidWhy.length) console.log(`VOID: ${main.voidWhy.join('; ')}`);
console.log(`FLICKER-GATE ${report.verdict} (K=${K})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
process.exit(main.verdict === 'PASS' ? 0 : main.verdict === 'VOID' ? 4 : main.verdict === 'INCONCLUSIVE' ? 5 : 3);

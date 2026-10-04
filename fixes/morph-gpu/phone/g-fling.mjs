#!/usr/bin/env node
// g-fling.mjs: the morph-gpu rev 2 G check before landing (the lead's ruling, 2026-10-04): a fling into the page end,
// then a drag that catches the page and pushes past the end in the same touch (fixes/morph-gpu/phone/fling-end-v2.json,
// `iphone.mjs gesture --inject fixes/morph-gpu/phone/rv2-flinglog.mjs`), C = best-build against V = rev 2 A (rv2a),
// scored with P-098's O1 bound. It covers rev 2's risk: its setup runs 300 ms after the scroll rests, so a morph that
// starts before that measures in its first frame, as rev 1 did ('cold').
// usage: node g-fling.mjs <arm>:<gesture.json> ... --served <served.json> [--json out]   (arms C, V; block order)
// served.json (written by the runner before each run): {"<meta.label>": {"js": <sha256 12>, "css": <sha256 12>}}.
// Frames: the logger's rAF rows in run.morph[].frames: [t, dt, scrollY, m, flags]; m = the nav's inline --morph;
// flags 'd' = the nav holds rev 2's dark layer (made by the setup, or by the open's first frame), 'r' = reveal on.
// Tweens: a tween starts at the first row whose m leaves a held 0 (open O1) or a held 1 (close C1), held = m <= 0.001
// or >= 0.999 in the row before (as frames-rv2.mjs). f1 = that row's dt, f2 = f1 + the next row's, f3 = + the next.
// Void run (listed, left out):
//   - meta.kind not 'gesture', run.aborted set, or a runner error in run.errors;
//   - program.hash not fling-end-v2's (GESTURE_HASH 6a7569615807...);
//   - served js/css missing or not the arm's build; the logger's CSS tag not the arm's ('none' C, 'rv2' V);
//   - tweens in the logger rows not exactly O1 then C1;
//   - O1 not inside the catch touch: from the second touchstart to 50 ms after its touchend (an open made by another
//     touch is not the case under test).
// Per run (reported): cold (V only) = no 'd' flag in the row before O1, i.e. the setup had not run; restMs = O1's t
// minus the last row before O1 whose scrollY changed; catchGapMs = the catch stroke's sentAt minus the fling's
// returnedAt (the runner reads the page before each stroke); catchY = scrollY at the catch's touchstart.
// Verdict per key, d = median(V) - median(C) over the valid runs, in ms: 'better' when d <= -2 and every V run is below
// every C run; 'no-worse' when d <= +2; else 'WORSE'. Scored: O1.f1 (the bound the lead named), O1.f2, O1.f3. Reported:
// C1.f1, C1.f3. 'insufficient' (no verdict) while either arm has fewer than 3 valid runs.
// Cold subset (scored when V has >= 2 cold valid runs, else reported as 'cold not reached'): O1.f1, O1.f3 of the cold
// V runs against all valid C runs, same rule. V's warm runs are reported the same way.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((s) => { const k = s.indexOf(':'); return { arm: s.slice(0, k), f: s.slice(k + 1) }; });
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const BUILD = { C: { js: '65052c4a3902', css: 'e0f92804c521', tag: 'none', name: 'best' }, V: { js: 'ef9d1c9d5fca', css: 'f7071e9138ac', tag: 'rv2', name: 'rv2a' } };
const SCRIPT = opt('--script-hash', '6a7569615807');
const served = opt('--served') ? JSON.parse(readFileSync(opt('--served'), 'utf8')) : {};
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const R1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const out = { scorer: 'g-fling.mjs', sha256: self, script: SCRIPT, runs: [] };

function tweens(fr) {
  const tw = []; let o = 0, c = 0;
  for (let q = 1; q < fr.length; q++) {
    const pm = fr[q - 1][3], m = fr[q][3]; let id = null;
    if (pm <= 0.001 && m > 0.001) id = 'O' + ++o; else if (pm >= 0.999 && m < 0.999) id = 'C' + ++c;
    if (!id) continue;
    const g = (n) => (q + n - 1 < fr.length ? fr.slice(q, q + n).reduce((a, r) => a + r[1], 0) : null);
    tw.push({ id, q, t: fr[q][0], f1: fr[q][1], f2: g(2), f3: g(3), flagsBefore: fr[q - 1][4] ?? '', flagsAt: fr[q][4] ?? '' });
  }
  return tw;
}

for (const { arm, f } of runs) {
  const r = { arm, file: f.split('/').slice(-1)[0] }; out.runs.push(r);
  const v = (why) => { r.void = why; };
  if (!BUILD[arm]) { v(`unknown arm ${arm}`); continue; }
  let G; try { G = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { v(`unreadable: ${e.message}`); continue; }
  r.label = G.meta?.label ?? null;
  if (G.meta?.kind !== 'gesture') { v('not a gesture run'); continue; }
  if (G.run?.aborted) { v(`aborted: ${String(G.run.aborted).slice(0, 120)}`); continue; }
  if ((G.run?.errors || []).length) { v(`runner errors: ${JSON.stringify(G.run.errors).slice(0, 120)}`); continue; }
  if (!String(G.program?.hash || '').startsWith(SCRIPT)) { v(`script ${String(G.program?.hash).slice(0, 12)}, not ${SCRIPT}`); continue; }
  const sv = served[r.label];
  if (!sv || sv.js !== BUILD[arm].js || sv.css !== BUILD[arm].css) { v(`served ${sv ? `${sv.js}/${sv.css}` : 'not recorded'}, not ${BUILD[arm].name}`); continue; }
  const segs = G.run?.morph || [];
  const tag = segs[0]?.summary?.css ?? null; r.css = tag;
  if (tag !== BUILD[arm].tag) { v(`logger CSS tag ${tag}, not ${BUILD[arm].tag}`); continue; }
  const fr = segs.flatMap((s) => s.frames || []);
  const tw = tweens(fr); r.tweens = tw.map((x) => x.id).join(',');
  if (r.tweens !== 'O1,C1') { v(`tweens ${r.tweens || 'none'}, not O1,C1`); continue; }
  const touches = (G.run?.segments || []).flatMap((s) => s.touches || []);
  const starts = touches.map((u, i) => [u, i]).filter(([u]) => u[1] === 's');
  if (starts.length < 2) { v('no catch touch recorded'); continue; }
  const [cs, ci] = starts[1];
  const ce = touches.slice(ci + 1).find((u) => u[1] === 'e' || u[1] === 'c');
  const O1 = tw[0], C1 = tw[1];
  if (!ce || O1.t < cs[0] || O1.t > ce[0] + 50) { v(`O1 at ${O1.t} is outside the catch touch ${cs[0]}-${ce ? ce[0] : '?'}`); continue; }
  let k = O1.q - 1; while (k > 0 && fr[k][2] === fr[k - 1][2]) k--;
  const sk = G.run?.strokes || [];
  Object.assign(r, {
    O1: { f1: O1.f1, f2: R1(O1.f2), f3: R1(O1.f3), flagsBefore: O1.flagsBefore, flagsAt: O1.flagsAt },
    C1: { f1: C1.f1, f2: R1(C1.f2), f3: R1(C1.f3) },
    cold: arm === 'V' ? !O1.flagsBefore.includes('d') : null,
    restMs: Math.round(O1.t - fr[k][0]),
    catchGapMs: sk.length > 1 ? Math.round(sk[1].sentAt - sk[0].returnedAt) : null,
    catchY: cs[5],
  });
}

const valid = (a, pred = () => true) => out.runs.filter((r) => r.arm === a && !r.void && pred(r));
const verdict = (vs, cs, get) => {
  const V = vs.map(get).filter((x) => x !== null), C = cs.map(get).filter((x) => x !== null);
  if (V.length < 1 || C.length < 1) return { verdict: 'insufficient', nV: V.length, nC: C.length };
  const d = R1(med(V) - med(C));
  const sep = Math.max(...V) < Math.min(...C);
  return { V: med(V), C: med(C), d, nV: V.length, nC: C.length, verdict: d <= -2 && sep ? 'better' : d <= 2 ? 'no-worse' : 'WORSE' };
};
const KEYS = { 'O1.f1': (r) => r.O1.f1, 'O1.f2': (r) => r.O1.f2, 'O1.f3': (r) => r.O1.f3, 'C1.f1': (r) => r.C1.f1, 'C1.f3': (r) => r.C1.f3 };
const SCORED = ['O1.f1', 'O1.f2', 'O1.f3'];
const vC = valid('C'), vV = valid('V'), vCold = valid('V', (r) => r.cold), vWarm = valid('V', (r) => !r.cold);
out.n = { C: vC.length, V: vV.length, Vcold: vCold.length, Vwarm: vWarm.length };
out.insufficient = vC.length < 3 || vV.length < 3;
out.verdict = {};
for (const [k, g] of Object.entries(KEYS)) {
  const x = verdict(vV, vC, g);
  out.verdict[k] = { ...x, scored: SCORED.includes(k), ...(out.insufficient ? { verdict: 'insufficient' } : {}) };
}
out.cold = vCold.length >= 2 && vC.length >= 3
  ? { scored: true, 'O1.f1': verdict(vCold, vC, KEYS['O1.f1']), 'O1.f3': verdict(vCold, vC, KEYS['O1.f3']) }
  : { scored: false, note: `cold not reached (${vCold.length} cold V run(s) of ${vV.length})` };
out.warm = vWarm.length >= 1 && vC.length >= 1 ? { 'O1.f1': verdict(vWarm, vC, KEYS['O1.f1']), 'O1.f3': verdict(vWarm, vC, KEYS['O1.f3']) } : null;

console.log(`g-fling.mjs ${self}  script ${SCRIPT}  valid C ${vC.length}  V ${vV.length} (cold ${vCold.length}, warm ${vWarm.length})${out.insufficient ? '  INSUFFICIENT' : ''}`);
for (const r of out.runs) console.log(r.void ? `  ${r.arm} ${r.label ?? r.file}: VOID ${r.void}` : `  ${r.arm} ${r.label}: O1 f1 ${r.O1.f1} f2 ${r.O1.f2} f3 ${r.O1.f3}  C1 f1 ${r.C1.f1} f3 ${r.C1.f3}  ${r.arm === 'V' ? (r.cold ? 'COLD' : 'warm') : ''}  rest ${r.restMs} ms  catchGap ${r.catchGapMs} ms  catchY ${r.catchY}`);
for (const [k, x] of Object.entries(out.verdict)) console.log(`  ${x.scored ? 'scored  ' : 'reported'} ${k}: C ${x.C ?? '-'} V ${x.V ?? '-'} d ${x.d ?? '-'} -> ${x.verdict}`);
console.log(out.cold.scored ? `  cold    O1.f1 d ${out.cold['O1.f1'].d} -> ${out.cold['O1.f1'].verdict}; O1.f3 d ${out.cold['O1.f3'].d} -> ${out.cold['O1.f3'].verdict}` : `  cold    ${out.cold.note}`);
if (out.warm) console.log(`  warm    O1.f1 d ${out.warm['O1.f1'].d} -> ${out.warm['O1.f1'].verdict}; O1.f3 d ${out.warm['O1.f3'].d} -> ${out.warm['O1.f3'].verdict} (reported)`);
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(out, null, 1));

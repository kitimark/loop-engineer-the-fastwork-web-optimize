#!/usr/bin/env node
// P-138 part 1 scorer (README "D card P-138"; post-data card after P-136's C5 FAIL). Written before any P-138 data.
// Same arms, pins, metrics and VOID rules as P-136 (imports fixes/nav-hit-cache/p136/counts.mjs b93a69de05f0:
// chromeMetrics, simMetrics, chromeVoid, simVoid, PIN; refused if changed). What differs from P-136:
//   - tolerance: tol(k, vp) = max(2, max - min of count k over ALL loads of the A/A for that viewport (both arms,
//     identical bytes; >= 3 per arm required, else no tolerance)), instead of 2 x one pair's median gap;
//   - A0 (gating): every tolerance C3 / C5 / C7 use is <= max(5, 5 % of that count's A/A median); a wider one means the A/A is too noisy to judge "unchanged": part 1 INSUFFICIENT, K / V not judged on it;
//   - every arm needs >= 3 valid loads (P-136: 2); per-pair criteria take the pairs in record order.
// Inputs (comma-separated lists are merged):
//   --chrome <kv-mobile.json,kv-desktop.json>   probe.mjs count --base v9f7du2 --ctl v9f7d --reps 3 --vp <vp>
//   --aa <aa-mobile.json,aa-desktop.json>       probe.mjs count --base v9f7d --ctl v9f7d --reps 3 --vp <vp>
//   --sim <sim-kv.json>  --sim-aa <sim-aa.json> simcount.mjs <rec> K:1 V:1 V:2 K:2 K:3 V:3 (--base v9f7du2 | v9f7d) --ctl v9f7d
//   --parity <json>  (default ../v9final/parity-u2-2.json: C2's reference, deferred task10 mobile / 2)  [--json out.json]
// Prints the tolerances, A0, one line per prediction, then PART1 PASS | FAIL | INSUFFICIENT.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const P136 = join(here, '../p136/counts.mjs');
const P136_SHA = 'b93a69de05f0';
const got = createHash('sha256').update(readFileSync(P136)).digest('hex').slice(0, 12);
if (got !== P136_SHA) throw new Error(`p136/counts.mjs is ${got}, pinned ${P136_SHA}: refused`);
const B = await import(P136);
export const PIN = B.PIN;
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const KEYS = { chrome: ['efpNav', 'forcedLayout', 'forcedStyle', 'prePaint'], sim: ['efpNav', 'forcedLayout', 'forcedStyle'] };

// tol(k) = max(2, range of k over all A/A loads); null unless >= 3 valid loads per arm
export function tolerance(loads, metrics, keys) {
  const K = loads.filter((l) => l.arm === 'K'), V = loads.filter((l) => l.arm === 'V');
  if (K.length < 3 || V.length < 3) return null;
  const m = loads.map(metrics);
  return Object.fromEntries(keys.map((k) => { const v = m.map((x) => x[k]).filter(Number.isFinite); return [k, { tol: Math.max(2, Math.max(...v) - Math.min(...v)), median: med(v) }]; }));
}
const capOk = (t) => t.tol <= Math.max(5, 0.05 * t.median);

export function score({ chrome, aa, sim, simAa, parity }) {
  const out = { preds: {}, voids: [] };
  const cl = (chrome?.loads || []).map((l) => ({ ...l, void: B.chromeVoid(l, (a) => PIN[a]), m: B.chromeMetrics(l) }));
  const sl = (sim?.loads || []).map((l) => ({ ...l, void: B.simVoid(l, (a) => PIN[a]), m: B.simMetrics(l) }));
  for (const l of [...cl, ...sl]) if (l.void.length) out.voids.push(`${l.engine === 'sim' ? 'sim' : l.vp} ${l.arm} rep ${l.rep}: ${l.void.join('; ')}`);
  const aaVoids = [];
  const aaC = (aa?.loads || []).filter((l) => { const v = B.chromeVoid(l, () => PIN.K); if (v.length) aaVoids.push(`A/A ${l.vp} ${l.arm} rep ${l.rep}: ${v.join('; ')}`); return !v.length; });
  const aaS = (simAa?.loads || []).filter((l) => { const v = B.simVoid(l, () => PIN.K); if (v.length) aaVoids.push(`A/A sim ${l.arm} rep ${l.rep}: ${v.join('; ')}`); return !v.length; });
  out.aaVoids = aaVoids;
  const tol = { mobile: tolerance(aaC.filter((l) => l.vp === 'mobile'), B.chromeMetrics, KEYS.chrome), desktop: tolerance(aaC.filter((l) => l.vp === 'desktop'), B.chromeMetrics, KEYS.chrome), sim: tolerance(aaS, B.simMetrics, KEYS.sim) };
  out.tol = tol;
  // A0: the tolerances used by C3 (mobile forced), C5 (desktop all four), C7 (sim forced) under the cap
  const used = [['mobile', ['forcedLayout', 'forcedStyle']], ['desktop', KEYS.chrome], ['sim', ['forcedLayout', 'forcedStyle']]];
  const wide = [], missing = [];
  for (const [vp, ks] of used) { if (!tol[vp]) { missing.push(vp); continue; } for (const k of ks) if (!capOk(tol[vp][k])) wide.push(`${vp} ${k} tol ${tol[vp][k].tol} > cap (median ${tol[vp][k].median})`); }
  out.preds.A0 = { verdict: missing.length ? 'insufficient' : wide.length ? 'miss' : 'hit', missing, wide };
  const T = (vp, k) => tol[vp]?.[k]?.tol;
  const ok = (L, f) => L.filter((l) => !l.void.length && f(l));
  const medArm = (L, a, k) => med(L.filter((l) => l.arm === a).map((l) => l.m[k]));
  const pairs = (L) => { const ks = L.filter((l) => l.arm === 'K'), vs = L.filter((l) => l.arm === 'V'); return ks.map((k, i) => (vs[i] ? [k, vs[i]] : null)).filter(Boolean); };
  const P = (id, verdict, detail) => (out.preds[id] = { verdict, ...detail });
  const mob = ok(cl, (l) => l.vp === 'mobile'), desk = ok(cl, (l) => l.vp === 'desktop'), sv = ok(sl, () => true);
  const enough = (L) => L.filter((l) => l.arm === 'K').length >= 3 && L.filter((l) => l.arm === 'V').length >= 3;
  for (const [id, L] of [['C1', mob], ['C6', sv]]) {
    if (!enough(L)) { P(id, 'insufficient', { n: L.length }); continue; }
    const d = pairs(L).map(([k, v]) => k.m.efpNav - v.m.efpNav);
    P(id, d.every((x) => x >= 40) ? 'hit' : 'miss', { drops: d, K: L.filter((l) => l.arm === 'K').map((l) => l.m.efpNav), V: L.filter((l) => l.arm === 'V').map((l) => l.m.efpNav) });
  }
  const ref = parity?.audit?.mobile?.task10?.deferred;
  if (!enough(mob) || !Number.isFinite(ref)) P('C2', 'insufficient', { ref });
  else { const drop = medArm(mob, 'K', 'efpNav') - medArm(mob, 'V', 'efpNav'), r = ref / 2; P('C2', Math.abs(drop - r) <= 0.25 * r ? 'hit' : 'miss', { drop, ref: r }); }
  for (const [id, L, vp] of [['C3', mob, 'mobile'], ['C7', sv, 'sim']]) {
    if (!enough(L) || !tol[vp]) { P(id, 'insufficient', { tol: tol[vp] }); continue; }
    const r = Object.fromEntries(['forcedLayout', 'forcedStyle'].map((k) => [k, { K: medArm(L, 'K', k), V: medArm(L, 'V', k), tol: T(vp, k) }]));
    P(id, Object.values(r).every((x) => x.V <= x.K + x.tol) ? 'hit' : 'miss', r);
  }
  if (!enough(mob)) P('C4', 'insufficient', {});
  else { const K = medArm(mob, 'K', 'forcedLayout'), V = medArm(mob, 'V', 'forcedLayout'); P('C4', V < K ? 'hit' : 'miss', { K, V }); }
  if (!enough(desk) || !tol.desktop) P('C5', 'insufficient', { tol: tol.desktop });
  else {
    const r = Object.fromEntries(KEYS.chrome.map((k) => [k, { K: medArm(desk, 'K', k), V: medArm(desk, 'V', k), tol: T('desktop', k) }]));
    P('C5', Object.values(r).every((x) => Math.abs(x.V - x.K) <= x.tol) ? 'hit' : 'miss', r);
  }
  const all = [...cl, ...sl];
  P('C8', all.length && all.every((l) => !l.void.length) ? 'hit' : 'miss', { loads: all.length, voids: out.voids });
  const vs = ['C1', 'C3', 'C5', 'C6', 'C7', 'C8'].map((k) => out.preds[k].verdict);
  out.part1 = out.preds.A0.verdict !== 'hit' ? 'INSUFFICIENT' : vs.includes('miss') ? 'FAIL' : vs.includes('insufficient') ? 'INSUFFICIENT' : 'PASS';
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const rd = (p) => (p ? { loads: p.split(',').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).loads) } : null);
  const out = score({ chrome: rd(a('--chrome')), aa: rd(a('--aa')), sim: rd(a('--sim')), simAa: rd(a('--sim-aa')), parity: JSON.parse(readFileSync(a('--parity') || join(here, '../v9final/parity-u2-2.json'), 'utf8')) });
  console.log(`tol ${JSON.stringify(out.tol)}`);
  for (const v of [...out.aaVoids, ...out.voids]) console.log(`VOID ${v}`);
  for (const [k, p] of Object.entries(out.preds)) console.log(`${k} ${p.verdict} ${JSON.stringify({ ...p, verdict: undefined })}`);
  console.log(`PART1 ${out.part1}`);
  const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
  console.log(`scorer sha256 ${self}`);
  if (a('--json')) writeFileSync(a('--json'), JSON.stringify({ scorer: 'fixes/nav-hit-cache/p138/counts.mjs', sha256: self, ...out }, null, 1));
}

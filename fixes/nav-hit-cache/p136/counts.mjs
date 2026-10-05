#!/usr/bin/env node
// P-136 part 1 scorer: the cost-card count predictions C1-C8 (README "P-136"), from the records of
//   --chrome <json>     probe.mjs count --base v9f7du2 --ctl v9f7d --reps 2 --vp mobile,desktop (arms K, V)
//   --aa <json>         probe.mjs count --base v9f7d --ctl v9f7d (the A/A self-test: K and V are the same bytes)
//   --sim <json>        simcount.mjs <rec> K:1 V:1 V:2 K:2 --base v9f7du2 --ctl v9f7d
//   --sim-aa <json>     simcount.mjs <rec> K:1 V:1 --base v9f7d --ctl v9f7d (the Simulator A/A)
//   --parity <json>     probe.mjs parity --base v9f7du2 record (C2's reference: deferred in task10 mobile, / 2 for the
//                       down scroll; default v9final/parity-u2-2.json)
//   [--json out.json]
// Counts are per load (one top-to-bottom scroll), raw. Per arm the median over its loads. tol(k, vp) = max(2, 2 x the
// |K - V| of the A/A pair for that count and viewport). A load is VOID when it did not serve its arm's pin, has a page
// error, or (Simulator) has `void` set. Prints one line per prediction, then PART1 PASS | FAIL | INSUFFICIENT.
// Pins: K 1b2eecc66011, V c7435c24dc56 (CSS e1359ab9994a); the A/A arms must both be K's bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export const PIN = { K: '1b2eecc66011', V: 'c7435c24dc56', css: 'e1359ab9994a' };
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// Chrome load -> metrics
export const chromeMetrics = (l) => ({
  efpNav: l.api?.nav?.efp ?? 0, efpAll: l.api?.all?.efp ?? 0,
  forcedLayout: l.counts?.['Layout.forced'] ?? 0, forcedStyle: l.counts?.['UpdateLayoutTree.forced'] ?? 0,
  prePaint: (l.counts?.['PrePaint.forced'] ?? 0) + (l.counts?.['PrePaint.frame'] ?? 0), steps: l.steps,
});
export const simMetrics = (l) => ({
  efpNav: l.api?.nav?.efp ?? 0, efpAll: l.api?.all?.efp ?? 0,
  forcedLayout: l.window?.forcedLayouts ?? null, forcedStyle: l.window?.forcedStyleRecalcs ?? null, steps: l.window?.scroll?.n ?? null,
});
const servedOk = (served, js) => Array.isArray(served) ? served[0] === js && served[1] === PIN.css : served && served.js === js && served.css === PIN.css;
export function chromeVoid(l, pinOf) {
  const v = [];
  if (!servedOk(l.served, pinOf(l.arm))) v.push(`served ${JSON.stringify(l.served)} not ${l.arm}`);
  if ((l.errors || []).length) v.push(`page error: ${String(l.errors[0]).slice(0, 80)}`);
  return v;
}
export function simVoid(l, pinOf) {
  const v = [];
  if (l.void) v.push(l.void);
  if (!servedOk(l.served, pinOf(l.arm))) v.push(`served ${JSON.stringify(l.served)} not ${l.arm}`);
  if (!l.api) v.push('no API counter');
  return v;
}
const armPin = (a) => PIN[a];
const aaPin = () => PIN.K;

// A/A tolerance per count: max(2, 2 x |K - V|) over the A/A's K/V medians
export function tolerance(aaLoads, metrics, vp) {
  const L = aaLoads.filter((l) => vp == null || l.vp === vp);
  const K = L.filter((l) => l.arm === 'K').map(metrics), V = L.filter((l) => l.arm === 'V').map(metrics);
  if (!K.length || !V.length) return null;
  const keys = Object.keys(K[0]).filter((k) => k !== 'steps');
  return Object.fromEntries(keys.map((k) => [k, Math.max(2, 2 * Math.abs(med(K.map((x) => x[k])) - med(V.map((x) => x[k]))))]));
}

export function score({ chrome, aa, sim, simAa, parity }) {
  const out = { preds: {}, voids: [] };
  const cl = (chrome?.loads || []).map((l) => ({ ...l, void: chromeVoid(l, armPin), m: chromeMetrics(l) }));
  const sl = (sim?.loads || []).map((l) => ({ ...l, void: simVoid(l, armPin), m: simMetrics(l) }));
  for (const l of [...cl, ...sl]) if (l.void.length) out.voids.push(`${l.engine === 'sim' ? 'sim' : l.vp} ${l.arm} rep ${l.rep}: ${l.void.join('; ')}`);
  const aaC = (aa?.loads || []).filter((l) => !chromeVoid(l, aaPin).length), aaS = (simAa?.loads || []).filter((l) => !simVoid(l, aaPin).length);
  const tol = { mobile: tolerance(aaC, chromeMetrics, 'mobile'), desktop: tolerance(aaC, chromeMetrics, 'desktop'), sim: tolerance(aaS, simMetrics, null) };
  out.tol = tol;
  const ok = (L, f) => L.filter((l) => !l.void.length && f(l));
  const medArm = (L, a, k) => med(L.filter((l) => l.arm === a).map((l) => l.m[k]));
  const pairs = (L) => { const ks = L.filter((l) => l.arm === 'K'), vs = L.filter((l) => l.arm === 'V'); return ks.map((k, i) => vs[i] ? [k, vs[i]] : null).filter(Boolean); };
  const P = (id, verdict, detail) => (out.preds[id] = { verdict, ...detail });
  const mob = ok(cl, (l) => l.vp === 'mobile'), desk = ok(cl, (l) => l.vp === 'desktop'), sv = ok(sl, () => true);
  const enough = (L) => L.filter((l) => l.arm === 'K').length >= 2 && L.filter((l) => l.arm === 'V').length >= 2;
  // C1 / C6: per pair drop >= 40
  for (const [id, L] of [['C1', mob], ['C6', sv]]) {
    if (!enough(L)) { P(id, 'insufficient', { n: L.length }); continue; }
    const d = pairs(L).map(([k, v]) => k.m.efpNav - v.m.efpNav);
    P(id, d.every((x) => x >= 40) ? 'hit' : 'miss', { drops: d, K: L.filter((l) => l.arm === 'K').map((l) => l.m.efpNav), V: L.filter((l) => l.arm === 'V').map((l) => l.m.efpNav) });
  }
  // C2: median drop within 25 % of deferred(task10 mobile) / 2
  const ref = parity?.audit?.mobile?.task10?.deferred;
  if (!enough(mob) || !Number.isFinite(ref)) P('C2', 'insufficient', { ref });
  else { const drop = medArm(mob, 'K', 'efpNav') - medArm(mob, 'V', 'efpNav'), r = ref / 2; P('C2', Math.abs(drop - r) <= 0.25 * r ? 'hit' : 'miss', { drop, ref: r }); }
  // C3 / C7: forced Layout and forced style, V <= K + tol
  for (const [id, L, t] of [['C3', mob, tol.mobile], ['C7', sv, tol.sim]]) {
    if (!enough(L) || !t) { P(id, 'insufficient', { tol: t }); continue; }
    const r = Object.fromEntries(['forcedLayout', 'forcedStyle'].map((k) => [k, { K: medArm(L, 'K', k), V: medArm(L, 'V', k), tol: t[k] }]));
    P(id, Object.values(r).every((x) => x.V <= x.K + x.tol) ? 'hit' : 'miss', r);
  }
  // C4: forced Layout V < K
  if (!enough(mob)) P('C4', 'insufficient', {});
  else { const K = medArm(mob, 'K', 'forcedLayout'), V = medArm(mob, 'V', 'forcedLayout'); P('C4', V < K ? 'hit' : 'miss', { K, V }); }
  // C5: desktop within tol on efpNav, forcedLayout, forcedStyle, prePaint
  if (!enough(desk) || !tol.desktop) P('C5', 'insufficient', { tol: tol.desktop });
  else {
    const r = Object.fromEntries(['efpNav', 'forcedLayout', 'forcedStyle', 'prePaint'].map((k) => [k, { K: medArm(desk, 'K', k), V: medArm(desk, 'V', k), tol: tol.desktop[k] }]));
    P('C5', Object.values(r).every((x) => Math.abs(x.V - x.K) <= x.tol) ? 'hit' : 'miss', r);
  }
  // C8: every load served its pin, no page error in a V load
  const all = [...cl, ...sl];
  P('C8', all.length && all.every((l) => !l.void.length) ? 'hit' : 'miss', { loads: all.length, voids: out.voids });
  const gating = ['C1', 'C3', 'C5', 'C6', 'C7', 'C8'];
  const vs = gating.map((k) => out.preds[k].verdict);
  out.part1 = vs.includes('miss') ? 'FAIL' : vs.includes('insufficient') ? 'INSUFFICIENT' : 'PASS';
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const rd = (p) => (p ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const out = score({ chrome: rd(a('--chrome')), aa: rd(a('--aa')), sim: rd(a('--sim')), simAa: rd(a('--sim-aa')), parity: rd(a('--parity') || join(here, '../v9final/parity-u2-2.json')) });
  console.log(`tol ${JSON.stringify(out.tol)}`);
  for (const v of out.voids) console.log(`VOID ${v}`);
  for (const [k, p] of Object.entries(out.preds)) console.log(`${k} ${p.verdict} ${JSON.stringify({ ...p, verdict: undefined })}`);
  console.log(`PART1 ${out.part1}`);
  const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
  console.log(`scorer sha256 ${self}`);
  if (a('--json')) writeFileSync(a('--json'), JSON.stringify({ scorer: 'fixes/nav-hit-cache/p136/counts.mjs', sha256: self, ...out }, null, 1));
}

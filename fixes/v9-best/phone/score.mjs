#!/usr/bin/env node
// v9 scorer (phone no-worse check, less-work rule: C = v8 vs V = v9; PHONE TICKET draft in fixes/v9-best/README.md).
// Committed before any v9 phone data. It imports P-111's committed scorer unchanged (fixes/v8-best/phone/score.mjs,
// sha256 26d944bf93e2, refused if changed) and uses its scoreBlock as it is: scoreM (the moving frames and the tween
// start frames of P-098's morph driver), scoreG (moving frames, 250 px bins, the G voids, the served check log),
// applySentinel (the sentinel chain), gate (medians, deltas, twins, minimum 3 valid runs per arm), tweenGate and
// clusters (the new-cluster rule). Only these are v9's (P-117's pattern):
//   - the arm pins: P-111's EXPECT object is re-pinned in place to C = v8, V = v9 (pin(V9)) before scoring, so its
//     "served not arm" void checks the v9 arms;
//   - the item names: hold.sh's sCo / sCc go to P-111's scorer as sC (an S validity sentinel on C); all warm-ups (wC,
//     wV, wgMC, wgMV, wgEC, wgEV) are skipped before scoring;
//   - the block verdict: only the legs this ticket runs are gated: Mmoving, Mtweens, GM, GE (P-111's Wtop, Wrest, GF,
//     GH have no runs here and are dropped, not counted as insufficient). WORSE when any is WORSE or has a NEW CLUSTER;
//     else insufficient when any is; else no-worse (P-114's order). Threshold-sensitive when any gate or cluster is.
// Gates (P-111's, unchanged): Mmoving > 50 WORSE when d > +1, > 34 when d > +2; Mtweens O1.f1-f3, close.f1/f3 WORSE when
//   d > +2 ms; GM / GE > 50 WORSE when d > +2, any NEW 250 px cluster fails (also scored at > 46 / > 54). Twins reported.
// Profile xcode-serious: never pooled with real-heat blocks or with another ticket's blocks.
//   node fixes/v9-best/phone/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// The served check log for a G item: pv9-<H>-check-<item>.log beside the run file (newest wins).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const basePath = join(here, '../../v8-best/phone/score.mjs');
const baseSha = createHash('sha256').update(readFileSync(basePath)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const BASE_SHA = '26d944bf93e2fa461703536ca3a70a987c8a0c34427abbd79d6d77f03ab7fd4f';
if (baseSha !== BASE_SHA) { console.error(`P-111 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
export const S = await import(basePath);

// P-111's own pins (V = v8, C = v7), kept for the self-test before re-pinning
export const P111 = { C: { ...S.EXPECT.C }, V: { ...S.EXPECT.V } };
// v9's pins: C = v8-best, V = v9 step 4 (fixes/v9-best/build.mjs; out/v9/snap-de237379b556/HASHES.txt)
export const V9 = {
  C: { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  V: { js: 'de237379b556dc898bcabb49f7940c7d5b58c6f920d9089f0c1752bf5c08cd5d', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
};
export function pin(arms) { S.EXPECT.C = { ...arms.C }; S.EXPECT.V = { ...arms.V }; }

// hold.sh item -> P-111 item (null = skipped warm-up)
export function mapItem(item) {
  if (/^w([CV]|g[ME][CV])$/.test(item)) return null;
  if (/^sC[oc]$/.test(item) || item === 'sC') return 'sC';
  if (/^m[CV]\d+$/.test(item) || /^g[ME][CV]\d+$/.test(item)) return item;
  throw new Error(`unknown item ${item}`);
}

export const GATED = ['Mmoving', 'Mtweens', 'GM', 'GE'];
export function scoreV9(entries) {
  const kept = entries.map((e) => ({ ...e, mapped: mapItem(e.item) })).filter((e) => e.mapped);
  const out = S.scoreBlock(kept.map((e) => ({ item: e.mapped, j: e.j, checkLog: e.checkLog })));
  out.runs.forEach((r, i) => { r.item = kept[i].item; });
  out.gates = Object.fromEntries(GATED.map((k) => [k, out.gates[k]]));
  delete out.reported;
  const vs = GATED.map((k) => out.gates[k].verdict);
  out.verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  out.thresholdSensitive = GATED.some((k) => out.gates[k].thresholdSensitive || out.gates[k].clusterThresholdSensitive);
  return out;
}

export function loadEntries(pairs) {
  return pairs.map((s) => {
    const k = s.indexOf(':'); const item = s.slice(0, k), file = s.slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((n) => n.endsWith(`-check-${item}.log`)).map((n) => ({ n, t: statSync(join(d, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0]; if (f) checkLog = readFileSync(join(d, f.n), 'utf8'); } catch {}
    return { item, file, j, checkLog };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args[ji + 1] : null;
  pin(V9);
  const out = scoreV9(loadEntries(args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1))));
  for (const r of out.runs) {
    const what = r.kind === 'M' ? `moving ${JSON.stringify(r.moving)}; O1 ${JSON.stringify(r.tweens?.O1 ?? null)}; held m=1 p95 ${r.atOneP95}; sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : `${JSON.stringify(r.counts)}; slow ${r.slow.map((s) => `${s.dt}@${s.y}${s.toolbarStep ? '*' : ''}`).join(' ')}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self} (base ${BASE_SHA.slice(0, 12)})`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v9-best/phone/score.mjs', sha256: self, base: BASE_SHA, ...out }, null, 1));
}

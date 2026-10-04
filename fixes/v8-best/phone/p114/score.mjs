#!/usr/bin/env node
// P-114 scorer (v8 vs v7 phone confirm block, M leg + G part H; PHONE TICKET in fixes/v8-best/README.md "P-114").
// Committed before any P-114 data. It runs P-111's committed scorer unchanged (fixes/v8-best/phone/score.mjs, sha256
// 26d944bf93e2: the same arms C = v7 8c90da217745 / 308f0da70c3a and V = v8 3e3e94cb6e9f / f836404b3728, scoreBlock with
// its voids, the sentinel chain, the M gates and the G gate with the new-cluster rule) and keeps only the gates P-114
// measures: Mmoving, Mtweens and GH. P-111's W and G F/M/E gates have no runs here and are left out of the verdict.
//   node fixes/v8-best/phone/p114/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// Items: wmC / wmV / wgC / wgV (warm-ups, skipped), mC<n> / mV<n> (counted M), sCo / sCc (S heat sentinels on C, given to
//   P-111's scorer as its item sC), gHC<n> / gHV<n> (counted G part H; the served check log
//   p114-<H>-check-<item>.log beside the run file).
// Verdict: WORSE when Mmoving, Mtweens or GH is WORSE or GH has a NEW CLUSTER (P-111's rules: M moving > 50 d > +1,
//   > 34 d > +2; tween keys O1.f1/f2/f3, close.f1/f3 d > +2 ms; GH > 50 d > +2; new cluster = a V bin with a > 50 frame in
//   >= 2 V runs, no C run in it or a neighbour; twins 46 / 54 and "threshold-sensitive" as P-111); else insufficient
//   when any of the three is; else no-worse.
// Reported, not gated: the band of P-111's GH cluster (bins 9-11, scrollY 2250-2999, P-113's): per arm the cluster at
//   > 50 / > 46 / > 54 restricted to the band (P-113's present rule) and the band-max per run; Mac load1 per run
//   (mac.start / mac.end in the record).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '../score.mjs');
const baseSha = createHash('sha256').update(readFileSync(base)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const BASE_SHA = '26d944bf93e2fa461703536ca3a70a987c8a0c34427abbd79d6d77f03ab7fd4f';
if (baseSha !== BASE_SHA) { console.error(`P-111 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
const S = await import(base);
export const BAND = [9, 10, 11];
const GATES = ['Mmoving', 'Mtweens', 'GH'];

export function mapItem(item) {
  if (/^w[mg][CV]$/.test(item)) return { warmup: true };
  if (/^sC[oc]$/.test(item)) return { as: 'sC' };
  if (/^m[CV]\d+$/.test(item) || /^gH[CV]\d+$/.test(item)) return { as: item };
  throw new Error(`unknown item ${item}`);
}

const find = (o, k, d = 0) => { if (!o || typeof o !== 'object' || d > 4) return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const x = find(v, k, d + 1); if (x !== undefined) return x; } };
const load1 = (x) => x?.load1 ?? (Array.isArray(x?.load) ? x.load[0] : x?.load) ?? null;

export function present(runs, k) {
  const n = new Map();
  for (const r of runs) for (const b of r.bins[k]) if (BAND.includes(b)) n.set(b, (n.get(b) || 0) + 1);
  const bins = [...n].filter(([, c]) => c >= 2).map(([b]) => b).sort((a, b) => a - b);
  return { present: bins.length > 0, bins: bins.map((b) => `${b * 250}-${b * 250 + 249}`) };
}

export function scoreP114(entries) {
  const skipped = [], pass = [], loads = [];
  for (const e of entries) {
    const m = mapItem(e.item);
    const mac = find(e.j, 'mac') || {};
    loads.push({ item: e.item, start: load1(mac.start), end: load1(mac.end) });
    if (m.warmup) { skipped.push(e.item); continue; }
    pass.push({ item: m.as, j: e.j, checkLog: e.checkLog, orig: e.item });
  }
  const out = S.scoreBlock(pass);
  out.runs.forEach((r, i) => { r.item = pass[i].orig; });
  const gates = Object.fromEntries(GATES.map((g) => [g, out.gates[g]]));
  const vs = Object.values(gates).map((g) => g.verdict);
  const verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  const ts = Object.values(gates).some((g) => g.thresholdSensitive || g.clusterThresholdSensitive);
  const ok = (a) => out.runs.filter((r) => !r.warmup && !r.void.length && !r.sentinelOnly && r.kind === 'G' && r.arm === a);
  const bandOf = (r) => { const s = (r.slow || []).filter((x) => BAND.includes(Math.floor(x.y / 250))); return s.length ? Math.max(...s.map((x) => x.dt)) : null; };
  const band = Object.fromEntries(['C', 'V'].map((a) => { const rs = ok(a); return [a, { n: rs.length, max: rs.map(bandOf), present: Object.fromEntries(['gt50', 'gt46', 'gt54'].map((k) => [k, present(rs, k)])) }]; }));
  return { verdict, thresholdSensitive: ts, gates, band, loads, skipped, runs: out.runs };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2); let jsonOut = null; const entries = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { jsonOut = args[++i]; continue; }
    const k = args[i].indexOf(':'); const item = args[i].slice(0, k), file = args[i].slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((x) => x.endsWith(`-check-${item}.log`)).map((x) => join(d, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]; if (f) checkLog = readFileSync(f, 'utf8'); } catch {}
    entries.push({ item, j, checkLog });
  }
  const out = scoreP114(entries);
  for (const r of out.runs) {
    const what = r.kind === 'M' ? `moving ${JSON.stringify(r.moving)}; O1 ${JSON.stringify(r.tweens?.O1 ?? null)}; held p95 ${r.atOneP95}; sentinel ${r.sentinel?.pass ?? null}`
      : r.kind === 'S' ? `sentinel ${r.sentinel?.pass ?? null}` : `${JSON.stringify(r.counts)}; >50 bins ${JSON.stringify(r.bins?.gt50)}; slow ${(r.slow || []).map((s) => `${s.dt}@${s.y}`).join(' ')}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  console.log(`skipped warm-ups: ${out.skipped.join(' ') || '-'}`);
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  for (const [a, b] of Object.entries(out.band)) console.log(`band 2250-2999 arm ${a}: n ${b.n}; max ${JSON.stringify(b.max)}; >50 ${JSON.stringify(b.present.gt50)} >46 ${b.present.gt46.present} >54 ${b.present.gt54.present}`);
  console.log(`load1 ${out.loads.map((l) => `${l.item} ${l.start ?? '-'}/${l.end ?? '-'}`).join(' ')}`);
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self}; base ${baseSha}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...out, scorer: self, base: baseSha }, null, 1));
}

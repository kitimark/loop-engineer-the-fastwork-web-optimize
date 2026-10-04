#!/usr/bin/env node
// P-113 scorer (v8 hero-flick cluster attribution; PHONE TICKET in fixes/v8-best/README.md "P-113"). Committed before
// any P-113 data. It runs P-111's committed G scoring unchanged (fixes/v8-best/phone/score.mjs, sha256 26d944bf93e2:
// scoreG for part H = moving frames between the down1 mark and the end mark, its voids, the 250 px bins at > 50 / > 46 /
// > 54, and applySentinel's chain), with three arms in place of two:
//   C = v8-best (3e3e94cb6e9f / f836404b3728), F = v8 minus countdown-faces and the heUp glue (cf7ec51d037e /
//   f836404b3728), R = v8 with cd-roll-ca V9 in place of K (5ea2a58788cf / f836404b3728).
//   node fixes/v8-best/phone/p113/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// Items: sCo / sCc (S heat sentinels on C), wgC / wgF / wgR (warm-ups, skipped), gH<arm><n> (counted G part H runs).
// The band (fixed before data, lead 2026-10-04 16:2xZ): P-111's new GH cluster sat in bin 10 (scrollY 2500-2749); the
//   band is that bin and its neighbours, bins 9-11 = scrollY [2250, 3000) (phone geometry, the flick-hero script's up
//   flicks cross it). Cluster PRESENT in an arm at threshold k when one band bin holds a moving frame > k ms in >= 2 of
//   that arm's valid runs (P-111's vCluster rule, restricted to the band); k = 50, twins 46 and 54.
// Verdict, per removed part (F: faces + glue; R: K, i.e. K back to V9), at > 50:
//   C has no cluster                -> NOT REPRODUCED (no attribution from this block)
//   C has it, the part's arm too    -> <part> NOT THE CAUSE (the falsifier: cluster present in the removed-part arm)
//   C has it, the part's arm has not -> <part> CAUSE
//   threshold-sensitive when the verdict at > 46 or > 54 differs.
//   Fewer than 3 valid runs in an arm: insufficient.
// Reported (not gated): per run the band's max moving dt and its > 34 frames (dt@y), the > 50 / > 46 / > 54 bins;
//   per arm the band-max median; P-111's G count gate (> 50, d = median(arm) - median(C)) for F and R against C.
// Voids: P-111's G voids (no record, aborted, errors, missing marks, median moving dt > 25 ms) plus the hold's served
//   check before the item (all four lines B, C, F, R "ok", none WRONG); S sentinel runs: no record, not driver S, run
//   error, served not C's build, Low Power Mode; a sentinel whose pass is not true voids every run since the last
//   passing one (applySentinel).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '../score.mjs');
const baseSha = createHash('sha256').update(readFileSync(base)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const BASE_SHA = '26d944bf93e2fa461703536ca3a70a987c8a0c34427abbd79d6d77f03ab7fd4f';
if (baseSha !== BASE_SHA) { console.error(`P-111 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
const S = await import(base);
export const ARMS = {
  C: { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  F: { js: 'cf7ec51d037ec01f2b3b131120001c6414d557b6257a5319c431ff6f476861a4', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  R: { js: '5ea2a58788cf2d6325f2b74fee83767629f49ce443c40793bcde40f818735c02', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
};
export const BAND = [9, 10, 11]; // 250 px bins: scrollY [2250, 3000)
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const PART = { F: 'faces + glue', R: 'K (V9 back)' };
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function parseItem(item) {
  if (/^sC[oc]$/.test(item)) return { kind: 'S', arm: 'C', sentinelOnly: true };
  if (/^wg[CFR]$/.test(item)) return { kind: 'G', arm: item[2], warmup: true };
  const m = item.match(/^gH([CFR])(\d+)$/); if (m) return { kind: 'G', arm: m[1], run: +m[2] };
  throw new Error(`unknown item ${item}`);
}

export function checkOk(log) {
  if (log == null) return false;
  return ['B', 'C', 'F', 'R'].every((x) => new RegExp(`^${x} .* ok$`, 'm').test(log)) && !/WRONG/.test(log);
}

function scoreS(j) {
  const v = [];
  if (!j || j?.meta?.schema !== 'fw-iphone-run/1') return { void: ['no run record'], sentinel: null };
  const m = j.meta;
  if (m.driver !== 'S') v.push(`driver ${m.driver}, not S`);
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  if (!(prefixOk(ARMS.C.js, sv[NODE]) && prefixOk(ARMS.C.css, sv[CSS]))) v.push(`served not arm C (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  return { void: v, sentinel: m.sentinel ?? null };
}

function band(g) {
  const fr = (g.slow || []).filter((s) => BAND.includes(Math.floor(s.y / 250)));
  return { max: fr.length ? Math.max(...fr.map((s) => s.dt)) : null, slow34: fr.map((s) => `${Math.round(s.dt)}@${Math.round(s.y)}`) };
}

export function present(runs, k) {
  const n = new Map();
  for (const r of runs) for (const b of r.bins[k]) if (BAND.includes(b)) n.set(b, (n.get(b) || 0) + 1);
  const bins = [...n].filter(([, c]) => c >= 2).map(([b]) => b).sort((a, b) => a - b);
  return { present: bins.length > 0, bins: bins.map((b) => `${b * 250}-${b * 250 + 249}`) };
}

function partVerdict(C, X, k) {
  if (!present(C, k).present) return 'NOT REPRODUCED';
  return present(X, k).present ? 'NOT THE CAUSE' : 'CAUSE';
}

export function scoreP113(entries) {
  const runs = entries.map(({ item, j, checkLog }) => {
    const p = parseItem(item);
    const r = { item, ...p, isSentinel: p.kind === 'S' };
    if (p.kind === 'S') return { ...r, ...scoreS(j) };
    const ok = checkOk(checkLog);
    const g = S.scoreG(j, 'H', ok ? 'B - ok\nC - ok\nV - ok' : 'not ok');
    if (!ok) g.void = g.void.filter((x) => x !== 'served check not ok').concat(checkLog == null ? ['no served check log'] : ['served check not ok']);
    return { ...r, ...g, band: band(g) };
  });
  const counted = runs.filter((r) => !r.warmup);
  S.applySentinel(counted);
  const ok = (a) => counted.filter((r) => !r.void.length && !r.sentinelOnly && r.kind === 'G' && r.arm === a);
  const A = { C: ok('C'), F: ok('F'), R: ok('R') };
  const out = { arms: {}, parts: {}, runs, band: 'scrollY 2250-2999 (bins 9-11)' };
  for (const [a, rs] of Object.entries(A)) {
    out.arms[a] = { n: rs.length, present: Object.fromEntries(['gt50', 'gt46', 'gt54'].map((k) => [k, present(rs, k)])), bandMaxMedian: S.median(rs.map((r) => r.band.max ?? 0)), bandMax: rs.map((r) => r.band.max) };
  }
  const ins = Object.entries(A).filter(([, rs]) => rs.length < 3).map(([a, rs]) => `${a} ${rs.length}`);
  if (ins.length) { out.verdict = `insufficient (${ins.join(', ')}; need 3 per arm)`; return out; }
  for (const X of ['F', 'R']) {
    const v = partVerdict(A.C, A[X], 'gt50');
    const tw = ['gt46', 'gt54'].map((k) => partVerdict(A.C, A[X], k));
    out.parts[X] = { part: PART[X], verdict: v, twins: { gt46: tw[0], gt54: tw[1] }, thresholdSensitive: tw.some((t) => t !== v), countGate: S.gate(A.C.map((r) => r.counts), A[X].map((r) => r.counts), 3) };
  }
  const v = Object.values(out.parts).map((p) => p.verdict);
  const ts = Object.values(out.parts).some((p) => p.thresholdSensitive) ? ' (threshold-sensitive)' : '';
  if (v[0] === 'NOT REPRODUCED') out.verdict = 'NOT REPRODUCED: v8 (C) shows no > 50 cluster in the band; no attribution' + ts;
  else if (v[0] === 'CAUSE' && v[1] === 'CAUSE') out.verdict = 'BOTH: removing either faces + glue or K removes the cluster' + ts;
  else if (v[0] === 'CAUSE') out.verdict = 'faces + glue CAUSE; K NOT THE CAUSE' + ts;
  else if (v[1] === 'CAUSE') out.verdict = 'K CAUSE; faces + glue NOT THE CAUSE' + ts;
  else out.verdict = 'NEITHER: the cluster stays without faces + glue and without K' + ts;
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2); let jsonOut = null; const entries = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { jsonOut = args[++i]; continue; }
    const k = args[i].indexOf(':'); const item = args[i].slice(0, k), file = args[i].slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    // the hold's served check for this item: p113-<H>-check-<item>.log beside the run file (any hold H)
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((x) => x.endsWith(`-check-${item}.log`)).map((x) => join(d, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]; if (f) checkLog = readFileSync(f, 'utf8'); } catch {}
    entries.push({ item, j, checkLog, file: basename(file) });
  }
  const out = scoreP113(entries);
  for (const r of out.runs) {
    if (r.kind === 'S') console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join('; ') : 'valid'}; sentinel ${r.sentinel?.pass ?? null}`);
    else console.log(`${r.item}${r.warmup ? ' (warm-up)' : ''}: ${r.void.length ? 'VOID ' + r.void.join('; ') : 'valid'}; ${JSON.stringify(r.counts)}; band max ${r.band.max ?? '-'} >34 ${r.band.slow34.join(' ') || '-'}; bins>50 ${JSON.stringify(r.bins.gt50)}`);
  }
  for (const [a, x] of Object.entries(out.arms)) console.log(`arm ${a}: n ${x.n}; band max ${JSON.stringify(x.bandMax)} median ${x.bandMaxMedian}; present >50 ${JSON.stringify(x.present.gt50)} >46 ${x.present.gt46.present} >54 ${x.present.gt54.present}`);
  for (const [X, p] of Object.entries(out.parts)) console.log(`${X} (${p.part}): ${p.verdict}; twins ${JSON.stringify(p.twins)}; count gate ${p.countGate.verdict} d ${JSON.stringify(p.countGate.delta)}`);
  console.log(`VERDICT ${out.verdict}`);
  console.log(`scorer sha256 ${self}; base ${baseSha}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...out, scorer: self, base: baseSha }, null, 1));
}

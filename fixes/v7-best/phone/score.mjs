#!/usr/bin/env node
// score.mjs: P-105, the v7 phone no-worse check (less-work rule; PHONE TICKET in fixes/v7-best/README.md).
// V = v7 (JS 8c90da217745 / CSS 308f0da70c3a) vs C = v6 (JS 8018ce062d30 / CSS 71b65c667720). Frame counts only,
// Timeline off. Two legs: S (iphone.mjs run --driver scroll) and G (iphone.mjs gesture, the whole-page fast-flick check,
// protocol v2 §5.4: parts F fresh load, H hero, M middle, E end).
// The S part is adapted from fix-rest-script's fixes/rest-script/phone/score.mjs (P-094, 4cbaf2b72219; itself from
// fix-cd-roll-ca's P-093), with credit: the same void rules and sentinel voiding.
// usage: node fixes/v7-best/phone/score.mjs <item>:<file> ... [--json out.json]
//   <item> is the hold.sh item (C1, V2, sC, wC, gHV3, ...), in block order across all VALID holds. Files of a VOID hold
//   (thermal gate or I-098 sleep) are left out by the caller and listed in the block log. Warm-ups are skipped.
// S windows (fixed before data; S = settle 8 s, idle 3 s at the top, UIKit scroll to the bottom, 3 s there):
//   timed = frames with t in [marks.idle[0], marks.bottom[0]) (idle at the top + the scroll down). THE S GATE.
// G windows: frames between the part's start mark and its 'end' mark (F fresh-flick, H down1, M mid1, E into1), moving
//   frames only (scrollY differs from the frame before).
// Counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
// Gates (no-worse, mgmt-ops-10's P-105 terms): d = median over V's valid runs minus median over C's, per leg/part;
//   > 50: WORSE when d > +2; the same with each twin, a verdict that differs is "threshold-sensitive". > 34: reported.
//   Needs >= 3 valid runs per arm (per part for G), else "insufficient".
// New cluster (lead ruling 2026-10-04 12:5xZ, protocol §5.4), per G part: spots are fixed 250 px bins of the frame's
//   scrollY (§3.4 fixed bins; both arms run on the same phone and page geometry). A run is slow at a spot when it has a
//   moving frame > 50 ms there. A V cluster is a spot slow in >= 2 of V's valid runs; it is NEW when no valid C run is
//   slow at that spot or at a neighbouring spot (+-250 px). Any new cluster fails the check, even inside +2. Also
//   scored with > 46 and > 54 (threshold-sensitive when the verdict differs).
// Toolbar state per slow G frame: innerHeight and whether it changed within one frame (descriptive).
// Void (dropped, reported):
//   S: meta.error; served JS/CSS not the arm's; Low Power Mode (settings.lowPowerMode true or lowPowerSuspect); no
//      idle/scroll/bottom marks.
//   G: no record, run.aborted, any run.errors entry, missing window marks, median moving dt > 25 ms (30 Hz: LPM
//      suspect), or the hold's served check before the item not all ok (log p105-<H>-check-<item>.log beside the run).
//   Heat: every counted C S run and every sC run is a heat sentinel (meta.sentinel.pass). Anything but pass === true
//      voids that run and every run (S or G, either arm) since the last passing sentinel, in block order.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const EXPECT = {
  V: { js: '8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00', css: '308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d' },
  C: { js: '8018ce062d30', css: '71b65c667720' },
};
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const PART_START = { F: 'fresh-flick', H: 'down1', M: 'mid1', E: 'into1' };
const cnt = (dts) => Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function parseItem(item) {
  if (/^w[CV]$/.test(item)) return { kind: 'S', arm: item[1], warmup: true };
  if (item === 'sC') return { kind: 'S', arm: 'C', warmup: false, sentinelOnly: true };
  let m = item.match(/^([CV])(\d+)$/); if (m) return { kind: 'S', arm: m[1], run: +m[2] };
  m = item.match(/^g([FHME])([CV])(\d+)$/); if (m) return { kind: 'G', part: m[1], arm: m[2], run: +m[3] };
  throw new Error(`unknown item ${item}`);
}

export function scoreS(j, arm) {
  const m = j.meta || {}; const v = [];
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  if (!(prefixOk(EXPECT[arm].js, sv[NODE]) && prefixOk(EXPECT[arm].css, sv[CSS]))) v.push(`served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  const mk = j.marks || {};
  let timed = null;
  if (mk.idle?.[0] == null || mk.bottom?.[0] == null) v.push('no idle/bottom marks');
  else { const T = (j.frames || []).filter((f) => f[1] != null && f[0] >= mk.idle[0] && f[0] < mk.bottom[0]); timed = { frames: T.length, ...cnt(T.map((f) => f[1])) }; }
  return { void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, timed };
}

export function scoreG(j, part, checkLog) {
  const v = [];
  if (!j) return { void: ['no record'], counts: null, slow: [], bins: {} };
  const r = j.run || {};
  if (r.aborted) v.push(`aborted: ${String(r.aborted).slice(0, 80)}`);
  if ((r.errors || []).length) v.push(`errors: ${String(r.errors[0]).slice(0, 80)}`);
  if (checkLog === null) v.push('no served check log');
  else if (!/^B .* ok$/m.test(checkLog) || !/^C .* ok$/m.test(checkLog) || !/^V .* ok$/m.test(checkLog) || /WRONG/.test(checkLog)) v.push('served check not ok');
  const seg = (r.segments || []).find((s) => (s.marks || []).some((mk) => mk[1] === PART_START[part]));
  if (!seg) { v.push(`no ${PART_START[part]} mark`); return { void: v, counts: null, slow: [], bins: {} }; }
  const mk = Object.fromEntries(seg.marks.map((x) => [x[1], x[0]]));
  if (mk.end == null) v.push('no end mark');
  const t0 = mk[PART_START[part]], t1 = mk.end ?? Infinity, fr = seg.frames || [];
  const mv = [];
  for (let i = 1; i < fr.length; i++) if (fr[i][0] >= t0 && fr[i][0] <= t1 && fr[i][1] != null && fr[i][2] !== fr[i - 1][2]) mv.push(i);
  const md = median(mv.map((i) => fr[i][1]));
  if (md != null && md > 25) v.push(`median moving dt ${md} ms (30 Hz, LPM suspect)`);
  const counts = { frames: mv.length, ...cnt(mv.map((i) => fr[i][1])) };
  const slow = [], bins = { gt50: new Set(), gt46: new Set(), gt54: new Set() };
  for (const i of mv) {
    const [t, dt, y, ih] = fr[i];
    for (const [k, th] of [['gt50', 50], ['gt46', 46], ['gt54', 54]]) if (dt > th) bins[k].add(Math.floor(y / 250));
    if (dt > 34) slow.push({ t, dt, y, ih, toolbarStep: [i - 1, i, i + 1].some((k) => fr[k] && fr[k - 1] && fr[k][3] !== fr[k - 1][3]) });
  }
  return { void: v, counts, slow, bins: Object.fromEntries(Object.entries(bins).map(([k, s]) => [k, [...s].sort((a, b) => a - b)])) };
}

export function applySentinel(list) {
  let since = [];
  for (const r of list) {
    since.push(r);
    if (!r.isSentinel) continue;
    const p = r.sentinel?.pass ?? null;
    if (p === true) { since = []; continue; }
    for (const x of since) x.void.push(x === r ? `sentinel ${p === false ? 'failed' : 'no data'}` : `voided by failing sentinel ${r.item}`);
    since = [];
  }
}

export function gate(C, V, minN) {
  const out = { nC: C.length, nV: V.length };
  if (C.length < minN || V.length < minN) return { ...out, verdict: `insufficient (C ${C.length}, V ${V.length}, need ${minN})` };
  const d = (k) => median(V.map((x) => x[k])) - median(C.map((x) => x[k]));
  out.delta = Object.fromEntries(Object.keys(TH).map((k) => [k, d(k)]));
  const worse = (k) => out.delta[k] > 2;
  out.gt50 = worse('gt50') ? 'WORSE (>50 up by more than 2)' : 'no-worse';
  out.thresholdSensitive = [worse('gt46'), worse('gt54')].some((x) => x !== worse('gt50'));
  out.verdict = out.gt50 + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

export function clusters(Cruns, Vruns, k = 'gt50') {
  const nV = new Map(); for (const r of Vruns) for (const b of r.bins[k]) nV.set(b, (nV.get(b) || 0) + 1);
  const cAny = new Set(); for (const r of Cruns) for (const b of r.bins[k]) cAny.add(b);
  const vClusters = [...nV].filter(([, n]) => n >= 2).map(([b]) => b).sort((a, b) => a - b);
  const fresh = vClusters.filter((b) => !cAny.has(b - 1) && !cAny.has(b) && !cAny.has(b + 1));
  return { vClusters: vClusters.map((b) => `${b * 250}-${b * 250 + 249}`), newClusters: fresh.map((b) => `${b * 250}-${b * 250 + 249}`) };
}

export function scoreBlock(entries) {
  const runs = entries.map(({ item, j, checkLog }) => {
    const p = parseItem(item);
    const base = { item, ...p, isSentinel: p.kind === 'S' && p.arm === 'C' && !p.warmup };
    if (p.kind === 'S') {
      if (!j || j?.meta?.schema !== 'fw-iphone-run/1' || j.meta.driver !== 'S') return { ...base, void: ['not an S run record'], sentinel: null };
      return { ...base, ...scoreS(j, p.arm) };
    }
    return { ...base, ...scoreG(j, p.part, checkLog) };
  });
  const counted = runs.filter((r) => !r.warmup);
  applySentinel(counted);
  const ok = (f) => counted.filter((r) => !r.void.length && !r.sentinelOnly && f(r));
  const out = { gates: {}, runs };
  out.gates.S = gate(ok((r) => r.kind === 'S' && r.arm === 'C').map((r) => r.timed), ok((r) => r.kind === 'S' && r.arm === 'V').map((r) => r.timed), 3);
  for (const P of ['F', 'H', 'M', 'E']) {
    const C = ok((r) => r.kind === 'G' && r.part === P && r.arm === 'C'), V = ok((r) => r.kind === 'G' && r.part === P && r.arm === 'V');
    const g = gate(C.map((r) => r.counts), V.map((r) => r.counts), 3);
    if (!/^insufficient/.test(g.verdict)) {
      g.cluster = clusters(C, V, 'gt50');
      const twin = ['gt46', 'gt54'].map((k) => clusters(C, V, k).newClusters.length > 0);
      g.clusterThresholdSensitive = twin.some((x) => x !== g.cluster.newClusters.length > 0);
      if (g.cluster.newClusters.length) g.verdict = `NEW CLUSTER at ${g.cluster.newClusters.join(', ')}` + (g.verdict.startsWith('WORSE') ? `; ${g.verdict}` : '');
    }
    out.gates[`G${P}`] = g;
  }
  const vs = Object.values(out.gates).map((g) => g.verdict);
  out.verdict = vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : 'no-worse';
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args[ji + 1] : null;
  const entries = args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)).map((s) => {
    const k = s.indexOf(':'); const item = s.slice(0, k), file = s.slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    // the hold.sh served check before this item: p105-<H>-check-<item>.log beside the run file
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((n) => n.endsWith(`-check-${item}.log`)).map((n) => ({ n, t: statSync(join(d, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0]; if (f) checkLog = readFileSync(join(d, f.n), 'utf8'); } catch {} // newest: a re-run in a later hold wins
    return { item, file, j, checkLog };
  });
  const out = scoreBlock(entries);
  for (const r of out.runs) console.log(`${r.item}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}${r.kind === 'S' ? `; timed ${JSON.stringify(r.timed)}; sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}` : `; ${JSON.stringify(r.counts)}; slow ${r.slow.map((s) => `${s.dt}@${s.y}${s.toolbarStep ? '*' : ''}`).join(' ')}`}`);
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`VERDICT ${out.verdict}`);
  console.log(`scorer sha256 ${self}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v7-best/phone/score.mjs', sha256: self, ...out, runs: out.runs.map((r) => ({ ...r, bins: r.bins })) }, null, 1));
}

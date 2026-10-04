#!/usr/bin/env node
// score.mjs: P-111, the v8 phone no-worse check (less-work rule; PHONE TICKET in fixes/v8-best/README.md).
// V = v8 (JS 3e3e94cb6e9f / CSS f836404b3728) vs C = v7 (JS 8c90da217745 / CSS 308f0da70c3a). Frame counts only,
// Timeline off. Three legs: W (iphone.mjs run --driver window: accent and countdown at y 0, the hero, the rest past the
// hero), M (iphone.mjs run --driver morph: the nav morph opening and closing at the page end), G (iphone.mjs gesture,
// the whole-page fast-flick check, protocol v2 §5.4: parts F fresh load, H hero, M middle, E end).
// Adapted, with credit, from: iphone-runner's P-105 score.mjs (fixes/v7-best/phone/score.mjs at b9c7d1eb, b9a29ffcc7bb:
// the item list, the G leg, the clusters, the sentinel chain), fix-cd-roll-ca's P-093 score.mjs (57856e3f530a: the W
// windows) and fix-morph-gpu's frames-rv2.mjs (P-098: the M scopes and the tween start frames).
// usage: node fixes/v8-best/phone/score.mjs <item>:<file> ... [--json out.json]
//   <item> is the hold.sh item (C1, V2, mC1, mV2, sC, wC, gHV3, ...), in block order across all VALID holds. Files of a
//   VOID hold (thermal gate or I-098 sleep) are left out by the caller and listed in the block log. Warm-ups are skipped.
// W windows (fixed before data; W = settle 8 s, idle 8 s at y 0, UIKit steps to y 2700, hold 6 s there, sentinel 3 s at
//   the bottom):
//   top  = frames with t in [marks.idle[0], marks.scroll[1]) and yEnd < 1000 (P-093's window: accent and clock at rest at
//          y 0, then the steps through the hero). GATED.
//   rest = frames with t in [marks.hold[0], marks.hold[1]) (the page at rest past the hero track: countdown-faces holds
//          the hero clock there in V, v7 rolls it unseen). GATED.
//   idle = frames with t in [marks.idle[0], marks.idle[1]) (y 0 at rest; inside top). Reported.
// M scopes (frames-rv2.mjs, unchanged): 'moving' = drive frames whose m differs from the previous or the next frame's m;
//   tween start frames from the driver's own rows: f1, f2 = f1 + next, f3 = f1 + next two, for O1-O3 and C1-C3;
//   'close' = per run the median over C1-C3.
// G windows: frames between the part's start mark and its 'end' mark (F fresh-flick, H down1, M mid1, E into1), moving
//   frames only (scrollY differs from the frame before).
// Counts per run: dt > 50 (twins > 46, > 54) and dt > 34 (twins > 30, > 38).
// Gates (no-worse), d = median over V's valid runs minus median over C's:
//   W top, W rest, G parts (P-105's terms): > 50 WORSE when d > +2; the same with each twin, a verdict that differs is
//     "threshold-sensitive". > 34: reported.
//   M (P-098's terms): moving > 50 WORSE when d > +1; moving > 34 WORSE when d > +2 (twins as above); tween keys O1.f1,
//     O1.f2, O1.f3, close.f1, close.f3 WORSE when d > +2 ms (others reported).
//   Needs >= 3 valid runs per arm (per part for G), else "insufficient".
// New cluster (P-105, lead ruling 2026-10-04 12:5xZ, protocol §5.4), per G part: fixed 250 px bins of the frame's
//   scrollY. A V cluster is a bin with a moving frame > 50 ms in >= 2 of V's valid runs; it is NEW when no valid C run
//   has one there or in a neighbouring bin (+-250 px). Any new cluster fails, even inside +2. Also scored with > 46, > 54.
// Void (dropped, reported):
//   W/M/S: no record; not the item's driver; meta.error; served JS/CSS not the arm's; Low Power Mode (settings.lowPowerMode
//      true or lowPowerSuspect); W: no idle/scroll/hold marks; M: no drive mark, the probe saw no m, tween starts != 2 x
//      cycles, driver tweens not exactly O1 C1 O2 C2 O3 C3.
//   G: no record, run.aborted, any run.errors entry, missing window marks, median moving dt > 25 ms (30 Hz: LPM
//      suspect), or the hold's served check before the item not all ok (log p111-<H>-check-<item>.log beside the run).
//   Heat: every counted C W run, every counted C M run (held m=1 p95 <= 18 ms) and every sC run is a heat sentinel
//      (meta.sentinel.pass). Anything but pass === true voids that run and every run (any leg, either arm) since the last
//      passing sentinel, in block order.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const EXPECT = {
  V: { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  C: { js: '8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00', css: '308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d' },
};
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const PART_START = { F: 'fresh-flick', H: 'down1', M: 'mid1', E: 'into1' };
const DRIVER = { W: 'W', M: 'M', S: 'S' };
const TW = ['O1', 'C1', 'O2', 'C2', 'O3', 'C3'];
const TKEYS = [...TW.flatMap((t) => ['f1', 'f2', 'f3'].map((k) => `${t}.${k}`)), 'close.f1', 'close.f2', 'close.f3'];
const TSCORED = ['O1.f1', 'O1.f2', 'O1.f3', 'close.f1', 'close.f3'];
const cnt = (dts) => Object.fromEntries(Object.entries(TH).map(([k, v]) => [k, dts.filter((d) => d > v).length]));
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function parseItem(item) {
  if (/^w[CV]$/.test(item)) return { kind: 'W', arm: item[1], warmup: true };
  if (item === 'sC') return { kind: 'S', arm: 'C', warmup: false, sentinelOnly: true };
  let m = item.match(/^([CV])(\d+)$/); if (m) return { kind: 'W', arm: m[1], run: +m[2] };
  m = item.match(/^m([CV])(\d+)$/); if (m) return { kind: 'M', arm: m[1], run: +m[2] };
  m = item.match(/^g([FHME])([CV])(\d+)$/); if (m) return { kind: 'G', part: m[1], arm: m[2], run: +m[3] };
  throw new Error(`unknown item ${item}`);
}

function commonVoids(j, arm, kind) {
  const v = [];
  if (!j || j?.meta?.schema !== 'fw-iphone-run/1') return ['no run record'];
  const m = j.meta;
  if (m.driver !== DRIVER[kind]) v.push(`driver ${m.driver}, not ${DRIVER[kind]}`);
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  if (!(prefixOk(EXPECT[arm].js, sv[NODE]) && prefixOk(EXPECT[arm].css, sv[CSS]))) v.push(`served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  return v;
}

export function scoreW(j, arm) {
  const v = commonVoids(j, arm, 'W');
  const mk = j?.marks || {};
  let top = null, rest = null, idle = null;
  if (mk.idle?.[0] == null || mk.idle?.[1] == null || mk.scroll?.[1] == null || mk.hold?.[0] == null || mk.hold?.[1] == null) v.push('no idle/scroll/hold marks');
  else {
    const F = (j.frames || []).filter((f) => f[1] != null);
    const T = F.filter((f) => f[0] >= mk.idle[0] && f[0] < mk.scroll[1] && f[3] < 1000).map((f) => f[1]); top = { frames: T.length, ...cnt(T) };
    const R = F.filter((f) => f[0] >= mk.hold[0] && f[0] < mk.hold[1]).map((f) => f[1]); rest = { frames: R.length, ...cnt(R) };
    const I = F.filter((f) => f[0] >= mk.idle[0] && f[0] < mk.idle[1]).map((f) => f[1]); idle = { frames: I.length, ...cnt(I) };
  }
  return { void: v, sentinel: j?.meta?.sentinel ?? null, tempStart: j?.meta?.battery?.start?.temperatureC ?? null, yHold: j?.driverResult?.yHold ?? null, top, rest, idle };
}

export function driverTweens(fr) { // driver rows [t, dt, y, m]
  const t = {}; let o = 0, c = 0;
  for (let q = 1; q + 2 < fr.length; q++) {
    const pm = fr[q - 1][3], m = fr[q][3]; let id = null;
    if (pm <= 0.001 && m > 0.001) id = 'O' + ++o; else if (pm >= 0.999 && m < 0.999) id = 'C' + ++c;
    if (id) t[id] = { f1: fr[q][1], f2: +(fr[q][1] + fr[q + 1][1]).toFixed(1), f3: +(fr[q][1] + fr[q + 1][1] + fr[q + 2][1]).toFixed(1) };
  }
  return t;
}

export function scoreM(j, arm) {
  const v = commonVoids(j, arm, 'M');
  if (v[0] === 'no run record') return { void: v, sentinel: null, moving: null, tweens: null };
  const mk = (j.marks || {}).drive;
  const fr = (j.frames || []).filter((f) => f[1] !== null);
  if (!mk || mk[1] === undefined) v.push('no drive mark');
  if (!fr.some((f) => f[5] != null)) v.push('the probe saw no m');
  const cycles = j.meta.params?.cycles ?? 3, tw = (j.summary?.tweens || []).length;
  if (tw !== 2 * cycles) v.push(`${tw} tween starts in the probe frames, expected ${2 * cycles}`);
  const tweens = driverTweens(j.driverResult?.driver?.frames || []);
  if (Object.keys(tweens).join() !== TW.join()) v.push(`driver tweens ${Object.keys(tweens).join(',') || 'none'}, expected ${TW.join(',')}`);
  let moving = null;
  if (mk && mk[1] !== undefined && fr.some((f) => f[5] != null)) {
    const D = fr.filter((f) => f[0] >= mk[0] && f[0] <= mk[1]); const m = D.map((f) => f[5] ?? 0);
    const mov = D.map((f, i) => (i > 0 && m[i] !== m[i - 1]) || (i < D.length - 1 && m[i + 1] !== m[i]));
    const M = D.filter((f, i) => mov[i]).map((f) => f[1]); moving = { frames: M.length, ...cnt(M) };
  }
  return { void: v, sentinel: j.meta.sentinel ?? null, atOneP95: j.driverResult?.driver?.atOne?.p95 ?? null, moving, tweens };
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

// lim: WORSE when d > lim (W/G > 50: 2; M moving > 50: 1, > 34: 2)
export function gate(C, V, minN, lim = { gt50: 2 }) {
  const out = { nC: C.length, nV: V.length };
  if (C.length < minN || V.length < minN) return { ...out, verdict: `insufficient (C ${C.length}, V ${V.length}, need ${minN})` };
  const d = (k) => median(V.map((x) => x[k])) - median(C.map((x) => x[k]));
  out.delta = Object.fromEntries(Object.keys(TH).map((k) => [k, d(k)]));
  const fams = Object.entries(lim).map(([k, l]) => {
    const tw = k === 'gt50' ? ['gt46', 'gt54'] : ['gt30', 'gt38'];
    const worse = (x) => out.delta[x] > l;
    return { k, l, worse: worse(k), sensitive: tw.some((x) => worse(x) !== worse(k)) };
  });
  for (const f of fams) out[f.k] = f.worse ? `WORSE (${f.k.slice(2) === '50' ? '>50' : '>34'} up by more than ${f.l})` : 'no-worse';
  out.thresholdSensitive = fams.some((f) => f.sensitive);
  const w = fams.find((f) => f.worse);
  out.verdict = (w ? out[w.k] : 'no-worse') + (out.thresholdSensitive ? ' (threshold-sensitive)' : '');
  return out;
}

export function tweenGate(C, V, minN) {
  if (C.length < minN || V.length < minN) return { verdict: `insufficient (C ${C.length}, V ${V.length}, need ${minN})` };
  const tv = (x, key) => { const [t, k] = key.split('.'); return t === 'close' ? median(['C1', 'C2', 'C3'].map((c) => x.tweens[c][k])) : x.tweens[t][k]; };
  const keys = {};
  for (const key of TKEYS) {
    const c = C.map((x) => tv(x, key)), v = V.map((x) => tv(x, key)), d = +(median(v) - median(c)).toFixed(2);
    keys[key] = { scored: TSCORED.includes(key), C: median(c), V: median(v), delta: d, verdict: d > 2 ? 'WORSE' : 'no-worse', C_runs: c, V_runs: v };
  }
  const bad = TSCORED.filter((k) => keys[k].verdict === 'WORSE');
  return { keys, verdict: bad.length ? `WORSE (${bad.join(', ')} up by more than 2 ms)` : 'no-worse' };
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
    const base = { item, ...p, isSentinel: (p.kind === 'S' || ((p.kind === 'W' || p.kind === 'M') && p.arm === 'C')) && !p.warmup };
    if (p.kind === 'W') return { ...base, ...scoreW(j, p.arm) };
    if (p.kind === 'M') return { ...base, ...scoreM(j, p.arm) };
    if (p.kind === 'S') { const v = commonVoids(j, 'C', 'S'); return { ...base, void: v, sentinel: j?.meta?.sentinel ?? null }; }
    return { ...base, ...scoreG(j, p.part, checkLog) };
  });
  const counted = runs.filter((r) => !r.warmup);
  applySentinel(counted);
  const ok = (f) => counted.filter((r) => !r.void.length && !r.sentinelOnly && f(r));
  const out = { gates: {}, runs };
  for (const w of ['top', 'rest']) out.gates[`W${w}`] = gate(ok((r) => r.kind === 'W' && r.arm === 'C').map((r) => r[w]), ok((r) => r.kind === 'W' && r.arm === 'V').map((r) => r[w]), 3);
  const iC = ok((r) => r.kind === 'W' && r.arm === 'C'), iV = ok((r) => r.kind === 'W' && r.arm === 'V');
  out.reported = { Widle: iC.length && iV.length ? Object.fromEntries(Object.keys(TH).map((k) => [k, median(iV.map((r) => r.idle[k])) - median(iC.map((r) => r.idle[k]))])) : null };
  const mC = ok((r) => r.kind === 'M' && r.arm === 'C'), mV = ok((r) => r.kind === 'M' && r.arm === 'V');
  out.gates.Mmoving = gate(mC.map((r) => r.moving), mV.map((r) => r.moving), 3, { gt50: 1, gt34: 2 });
  out.gates.Mtweens = tweenGate(mC, mV, 3);
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
  out.verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args[ji + 1] : null;
  const entries = args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)).map((s) => {
    const k = s.indexOf(':'); const item = s.slice(0, k), file = s.slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    // the hold.sh served check before this item: p111-<H>-check-<item>.log beside the run file (newest wins)
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((n) => n.endsWith(`-check-${item}.log`)).map((n) => ({ n, t: statSync(join(d, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0]; if (f) checkLog = readFileSync(join(d, f.n), 'utf8'); } catch {}
    return { item, file, j, checkLog };
  });
  const out = scoreBlock(entries);
  for (const r of out.runs) {
    const what = r.kind === 'W' ? `top ${JSON.stringify(r.top)}; rest ${JSON.stringify(r.rest)} (y ${r.yHold}); idle ${JSON.stringify(r.idle)}; sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : r.kind === 'M' ? `moving ${JSON.stringify(r.moving)}; O1 ${JSON.stringify(r.tweens?.O1 ?? null)}; held m=1 p95 ${r.atOneP95}; sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : `${JSON.stringify(r.counts)}; slow ${r.slow.map((s) => `${s.dt}@${s.y}${s.toolbarStep ? '*' : ''}`).join(' ')}`;
    console.log(`${r.item}${r.warmup ? ' (warm-up, skipped)' : ''}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`reported: ${JSON.stringify(out.reported)}`);
  console.log(`VERDICT ${out.verdict}`);
  console.log(`scorer sha256 ${self}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v8-best/phone/score.mjs', sha256: self, ...out }, null, 1));
}

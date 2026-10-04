#!/usr/bin/env node
// P-117 scorer (combined phone no-worse check: C = v8 vs V = v8 + nav-hit-cache + scroll-cb; S leg + G part M; CARD
// research/management/p117-combined-phone-no-worse.md). Committed before any P-117 data. It imports P-105's committed
// scorer unchanged (fixes/v7-best/phone/score.mjs, sha256 b9a29ffcc7bb, refused if changed) and uses its scoreS (the S
// timed window, its counts and voids), scoreG (moving frames, the 250 px bins, the G voids), applySentinel (the sentinel
// chain), gate (medians, deltas, WORSE at d > +2, twins, minimum 3 valid runs per arm) and clusters (the new-cluster rule).
// Only the arm hashes, the item names and the block verdict's order are P-117's.
//   node fixes/v8-best/phone/p117/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// Items: wC / wV (S warm-ups) and wgC / wgV (G warm-ups): skipped; C<n> / V<n> (counted S; every counted C S run is a heat
//   sentinel, as P-105); sCo / sCc (S heat sentinels on C, uncounted); gMC<n> / gMV<n> (counted G part M, window mid1 ->
//   end, moving frames; the served check log p117-<H>-check-<item>.log beside the run file, newest wins).
// Arms: C = v8-best (3e3e94cb6e9f / f836404b3728); V = C + nav-hit-cache + scroll-cb carried onto v8 (e8d8323f674b /
//   f836404b3728; fixes/v8-best/phone/nsc/build.mjs). B = the plain baseline (4606120cf392 / 27776f3d4138, gates only).
// How the served check gets the arm hashes (P-117's, nothing else changes):
//   S runs: the record's meta.served (hashes the phone loaded, prefix rule as P-105) is checked against P117.expect;
//     P-105's scoreS checks its own arms (v6 / v7), so its "served not arm" void is dropped and P-117's put in its place.
//     Every other scoreS void stays.
//   G runs: the hold's served check log before the item (serve.sh check) must have an "ok" line for B, C and V whose
//     "served JS <h> CSS <h>" match P117.check (B) / P117.expect (C, V), and no WRONG. A log that passes goes to P-105's
//     scoreG as it is (its own B / C / V ok test then passes too); one that fails goes as itself plus WRONG, so scoreG
//     voids it with its own reason "served check not ok"; a missing log stays null ("no served check log").
// Gates (P-105's, unchanged): S and GM: d = median V - median C of dt > 50 per run, WORSE at d > +2, twins 46 / 54
//   (threshold-sensitive when a twin's verdict differs), > 34 (twins 30 / 38) reported; GM: any NEW cluster fails (a 250 px
//   bin with a > 50 frame in >= 2 V runs, no C run with one in that bin or a neighbour), also scored at > 46 / > 54.
//   Fewer than 3 valid runs per arm in a leg or part: insufficient.
// Block verdict (P-117's order, as P-114): WORSE when S or GM is WORSE or GM has a NEW CLUSTER; else insufficient when
//   either is; else no-worse. Threshold-sensitive when any gate or the cluster rule is.
// Reported, not gated: per run the largest dt and the frames > 100 ms (S: the timed window's frames; G: the moving
//   frames), and Mac load1 per item (mac.start / mac.end).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const basePath = join(here, '../../../v7-best/phone/score.mjs');
const baseSha = createHash('sha256').update(readFileSync(basePath)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const BASE_SHA = 'b9a29ffcc7bbbf677f14c31b7b3af2900f032b0abb406c806538823decc38368';
if (baseSha !== BASE_SHA) { console.error(`P-105 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
export const S = await import(basePath);

const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSSP = '/_app/immutable/assets/2.gBuqKVzi.css';
export const P117 = {
  expect: {
    C: { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
    V: { js: 'e8d8323f674b0dd713b38b070f706f0a8540fcd7927c9fbab87f5cbb9ea0f657', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  },
  check: { B: { js: '4606120cf392', css: '27776f3d4138' } },
};
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function mapItem(item) {
  if (/^wg?[CV]$/.test(item)) return { warmup: true, arm: item.at(-1) };
  if (/^sC[oc]$/.test(item)) return { kind: 'S', arm: 'C', sentinelOnly: true };
  let m = item.match(/^([CV])(\d+)$/); if (m) return { kind: 'S', arm: m[1], run: +m[2] };
  m = item.match(/^gM([CV])(\d+)$/); if (m) return { kind: 'G', part: 'M', arm: m[1], run: +m[2] };
  throw new Error(`unknown item ${item}`);
}

export function checkOk(log, cfg = P117) {
  if (log == null) return null;
  if (/WRONG/.test(log)) return false;
  const want = { B: cfg.check.B, C: cfg.expect.C, V: cfg.expect.V };
  return Object.entries(want).every(([A, e]) => {
    const m = log.match(new RegExp(`^${A} .*served JS (\\w+) CSS (\\w+) ok$`, 'm'));
    return !!m && prefixOk(e.js, m[1]) && prefixOk(e.css, m[2]);
  });
}

export function scoreS117(j, arm, cfg = P117) {
  const r = S.scoreS(j, arm);
  r.void = r.void.filter((v) => !v.startsWith('served not arm'));
  const sv = j.meta?.served || {}, e = cfg.expect[arm];
  if (!(prefixOk(e.js, sv[NODE]) && prefixOk(e.css, sv[CSSP]))) r.void.unshift(`served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSSP] ?? 'none'})`);
  const mk = j.marks || {};
  const T = mk.idle?.[0] == null || mk.bottom?.[0] == null ? [] : (j.frames || []).filter((f) => f[1] != null && f[0] >= mk.idle[0] && f[0] < mk.bottom[0]);
  r.maxDt = T.length ? Math.max(...T.map((f) => f[1])) : null;
  r.over100 = T.filter((f) => f[1] > 100).map((f) => ({ dt: f[1], y: f[2] }));
  return r;
}

const find = (o, k, d = 0) => { if (!o || typeof o !== 'object' || d > 4) return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const x = find(v, k, d + 1); if (x !== undefined) return x; } };
const load1 = (x) => x?.load1 ?? (Array.isArray(x?.load) ? x.load[0] : x?.load) ?? null;

export function scoreP117(entries, cfg = P117) {
  const loads = [], skipped = [];
  const runs = entries.map(({ item, j, checkLog }) => {
    const m = mapItem(item);
    const mac = find(j, 'mac') || {};
    loads.push({ item, start: load1(mac.start), end: load1(mac.end) });
    if (m.warmup) { skipped.push(item); return { item, warmup: true, arm: m.arm, void: [] }; }
    const base = { item, ...m, isSentinel: m.kind === 'S' && m.arm === 'C' };
    if (m.kind === 'S') {
      if (!j || j?.meta?.schema !== 'fw-iphone-run/1' || j.meta.driver !== 'S') return { ...base, void: ['not an S run record'], sentinel: null };
      return { ...base, ...scoreS117(j, m.arm, cfg) };
    }
    const ck = checkOk(checkLog, cfg);
    const g = S.scoreG(j, 'M', ck === null ? null : ck ? checkLog : `${checkLog}\nWRONG`);
    const mv = g.slow || [];
    return { ...base, servedCheck: ck, ...g, maxDt: mv.length ? Math.max(...mv.map((s) => s.dt)) : g.counts ? '<= 34' : null, over100: mv.filter((s) => s.dt > 100).map((s) => ({ dt: s.dt, y: s.y })) };
  });
  const counted = runs.filter((r) => !r.warmup);
  S.applySentinel(counted);
  const ok = (f) => counted.filter((r) => !r.void.length && !r.sentinelOnly && f(r));
  const gates = {};
  gates.S = S.gate(ok((r) => r.kind === 'S' && r.arm === 'C').map((r) => r.timed), ok((r) => r.kind === 'S' && r.arm === 'V').map((r) => r.timed), 3);
  {
    const C = ok((r) => r.kind === 'G' && r.arm === 'C'), V = ok((r) => r.kind === 'G' && r.arm === 'V');
    const g = S.gate(C.map((r) => r.counts), V.map((r) => r.counts), 3);
    if (!/^insufficient/.test(g.verdict)) {
      g.cluster = S.clusters(C, V, 'gt50');
      g.clusterTwins = Object.fromEntries(['gt46', 'gt54'].map((k) => [k, S.clusters(C, V, k).newClusters]));
      g.clusterThresholdSensitive = Object.values(g.clusterTwins).some((n) => n.length > 0 !== g.cluster.newClusters.length > 0);
      if (g.cluster.newClusters.length) g.verdict = `NEW CLUSTER at ${g.cluster.newClusters.join(', ')}` + (g.verdict.startsWith('WORSE') ? `; ${g.verdict}` : '');
    }
    gates.GM = g;
  }
  const vs = Object.values(gates).map((g) => g.verdict);
  const verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  const thresholdSensitive = Object.values(gates).some((g) => g.thresholdSensitive || g.clusterThresholdSensitive);
  const perRun = counted.filter((r) => !r.sentinelOnly).map((r) => {
    const c = r.kind === 'S' ? r.timed : r.counts;
    return { item: r.item, kind: r.kind, arm: r.arm, valid: !r.void.length, frames: c?.frames ?? null, gt50: c?.gt50 ?? null, gt34: c?.gt34 ?? null, maxDt: r.maxDt ?? null, over100: r.over100 ?? [] };
  });
  return { verdict, thresholdSensitive, gates, perRun, loads, skipped, runs };
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
  const out = scoreP117(entries);
  for (const r of out.runs) {
    if (r.warmup) continue;
    const what = r.kind === 'S' ? `timed ${JSON.stringify(r.timed ?? null)}; sentinel ${r.sentinel?.pass ?? null}` : `${JSON.stringify(r.counts)}; >50 bins ${JSON.stringify(r.bins?.gt50)}; slow ${(r.slow || []).map((s) => `${s.dt}@${s.y}${s.toolbarStep ? '*' : ''}`).join(' ')}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  console.log(`skipped warm-ups: ${out.skipped.join(' ') || '-'}`);
  for (const p of out.perRun) console.log(`run ${p.item}: frames ${p.frames}; >50 ${p.gt50}; >34 ${p.gt34}; max ${p.maxDt}; >100 ms ${p.over100.map((o) => `${o.dt}@${o.y}`).join(' ') || '-'}${p.valid ? '' : ' (VOID)'}`);
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  console.log(`load1 ${out.loads.map((l) => `${l.item} ${l.start ?? '-'}/${l.end ?? '-'}`).join(' ')}`);
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self}; base ${baseSha}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...out, scorer: self, base: baseSha }, null, 1));
}

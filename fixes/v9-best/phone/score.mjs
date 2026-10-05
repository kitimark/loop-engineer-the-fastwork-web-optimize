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
// Amendment A2 (P-120, written AFTER H1's M data; README "Amendment A2"): the M leg is re-driven from m = 0 in both arms.
//   H1's M items (m<arm><n>) are void (rev 7c opens the panel at the driver's start y, __pinMax, so V's first tween was
//   a close) and are never pooled: a block holding both m and n items is refused. H2' items are n<arm><n> (hold.sh runs
//   them as the same driver call in both arms with --cycles 4). trimM cuts every n record, by one rule in both arms:
//   drop everything up to the first frame at m <= 0.001 after the first close (at most one open before that close:
//   C's uncounted O C, V's uncounted C), in the driver's rows, the probe frames (the drive mark starts there) and the
//   probe's tween list alike, then hands P-111's scoreM a cycles-3 record: the counted window is O1 C1 O2 C2 O3 C3 from
//   m = 0, P-111's EXPECT and gates unchanged. A record that does not fit (cycles != 4, no close, > 1 open before it,
//   the driver and probe cuts > 50 ms apart, dropped probe tweens != dropped driver tweens) is void ("run error: A2 ...").
//   The C sentinel (meta.sentinel, held m=1 p95, the tool's) is kept as recorded.
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
  if (/^n[CV]\d+$/.test(item)) return 'm' + item.slice(1); // A2: H2' M items, cut by trimM, then scored as P-111's M
  throw new Error(`unknown item ${item}`);
}

// A2: the counted window of an H2' M record (see the header). Pure; returns { j, trim } (j untouched on success
// except the cut fields) or { j: <j with meta.error 'A2 ...'>, trim: null }.
export const A2 = { cycles: 4, maxCutApartMs: 50 };
const atZero = (m) => (m ?? 0) <= 0.001, atOne = (m) => (m ?? 0) >= 0.999;
// rows: [t, m]; the index of the first row at m = 0 after the first close start, and the opens before that close
export function firstCloseCut(rows) {
  let opens = 0;
  for (let q = 1; q < rows.length; q++) {
    const p = rows[q - 1][1], m = rows[q][1];
    if (atZero(p) && !atZero(m)) opens++;
    if (atOne(p) && !atOne(m)) { for (let z = q; z < rows.length; z++) if (atZero(rows[z][1])) return { at: z, opens }; return { at: null, opens }; }
  }
  return { at: null, opens };
}
export function trimM(j) {
  const bad = (why) => ({ j: { ...j, meta: { ...(j?.meta || {}), error: `A2 ${why}` } }, trim: null });
  if (!j || j?.meta?.schema !== 'fw-iphone-run/1') return { j, trim: null }; // P-111's own "no run record" void
  if (j.meta.params?.cycles !== A2.cycles) return bad(`cycles ${j.meta.params?.cycles}, not ${A2.cycles}`);
  const D = j.driverResult?.driver?.frames || [];
  const dc = firstCloseCut(D.map((f) => [f[0], f[3]]));
  if (dc.at === null) return bad('no close back to m = 0 in the driver rows');
  if (dc.opens > 1) return bad(`${dc.opens} opens before the first close (driver)`);
  const F = j.frames || [], mk = j.marks?.drive;
  if (!mk || mk[1] === undefined) return { j, trim: null }; // P-111's "no drive mark" void
  const Fi = F.map((f, i) => [f, i]).filter(([f]) => f[1] !== null && f[0] >= mk[0] && f[0] <= mk[1]);
  const pc = firstCloseCut(Fi.map(([f]) => [f[0], f[5]]));
  if (pc.at === null) return bad('no close back to m = 0 in the probe frames');
  if (pc.opens > 1) return bad(`${pc.opens} opens before the first close (probe)`);
  const tD = D[dc.at][0], tP = Fi[pc.at][0][0];
  if (Math.abs(tD - tP) > A2.maxCutApartMs) return bad(`driver cut ${tD} and probe cut ${tP} > ${A2.maxCutApartMs} ms apart`);
  const tw = j.summary?.tweens || [], c1 = tw.findIndex((t) => t.from === 1);
  if (c1 < 0) return bad('no close in the probe tween list');
  if (c1 !== dc.opens) return bad(`${c1} probe tweens before the first close, the driver had ${dc.opens}`);
  const W = Fi.slice(pc.at).map(([f]) => f[5] ?? 0);
  if (!W.some((m, i) => (i > 0 && m !== W[i - 1]) || (i < W.length - 1 && W[i + 1] !== m))) return bad('no data: zero moving frames after the cut');
  const trim = { cutT: tP, driverCutT: tD, droppedDriverRows: dc.at, droppedTweens: c1 + 1, opensBefore: dc.opens };
  return {
    trim,
    j: {
      ...j,
      meta: { ...j.meta, params: { ...j.meta.params, cycles: 3 }, a2: trim },
      marks: { ...j.marks, drive: [tP, mk[1]] },
      summary: { ...j.summary, tweens: tw.slice(c1 + 1) },
      driverResult: { ...j.driverResult, driver: { ...j.driverResult.driver, frames: D.slice(dc.at) } },
    },
  };
}

// A2 (lead, after H3a): a counted G record that exits 0 but carries no data is void too: zero moving frames (scrollY
// changes) in its part window (P-111's scoreG window: the part's start mark .. 'end'). Reported through run.errors, so
// P-111's scoreG voids it ("errors: A2 no data ..."). A missing or empty record is P-111's own "no record" void.
const G_START = { M: 'mid1', E: 'into1' };
export function gNoData(j, part) {
  const r = j?.run; if (!r) return j;
  const seg = (r.segments || []).find((s) => (s.marks || []).some((mk) => mk[1] === G_START[part]));
  if (!seg) return j; // P-111's "no <mark> mark" void
  const mk = Object.fromEntries(seg.marks.map((x) => [x[1], x[0]])), t0 = mk[G_START[part]], t1 = mk.end ?? Infinity, fr = seg.frames || [];
  let n = 0; for (let i = 1; i < fr.length; i++) if (fr[i][0] >= t0 && fr[i][0] <= t1 && fr[i][1] != null && fr[i][2] !== fr[i - 1][2]) n++;
  return n ? j : { ...j, run: { ...r, errors: [`A2 no data: zero moving frames in part ${part}`, ...(r.errors || [])] } };
}

export const GATED = ['Mmoving', 'Mtweens', 'GM', 'GE'];
export function scoreV9(entries) {
  const kept = entries.map((e) => ({ ...e, mapped: mapItem(e.item) })).filter((e) => e.mapped);
  if (kept.some((e) => /^m[CV]\d+$/.test(e.item)) && kept.some((e) => /^n[CV]\d+$/.test(e.item)))
    throw new Error('A2: H1 M items (m..) and H2\' M items (n..) in one block: H1 M data is void, never pooled');
  for (const e of kept) if (/^n[CV]\d+$/.test(e.item)) { const t = trimM(e.j); e.j = t.j; e.trim = t.trim; }
  for (const e of kept) if (/^g[ME][CV]\d+$/.test(e.item)) e.j = gNoData(e.j, e.item[1]);
  const out = S.scoreBlock(kept.map((e) => ({ item: e.mapped, j: e.j, checkLog: e.checkLog })));
  out.runs.forEach((r, i) => { if (kept[i].trim !== undefined) r.a2 = kept[i].trim; });
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

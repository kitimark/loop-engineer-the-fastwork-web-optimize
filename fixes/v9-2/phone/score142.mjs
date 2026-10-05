#!/usr/bin/env node
// P-142 scorer (v9.2 phone no-worse check: C = v9-final as landed 8b5ce9b3 vs V = v9.2 = v9.1d + people-word a +
// nav-fade (rev 1.2: U2 OUT); fixes/v9-2/README.md "P-142"). Written before any P-142 data. A wrapper:
//   parts M, X, S  every rule is P-122's scorer fixes/v9-best/phone/p122/score.mjs, imported unchanged and refused if
//                  changed (pin below), as P-134's score134.mjs; only the arm pins differ:
//                  GM (C vs V on part M, >= 3 valid an arm), EX (V ceiling on X, >= 3 valid V), ES (V ceiling on S,
//                  >= 2 valid V), FLICKER (nav-hit-cache's gate, G1 = V monotone blinks 0, per part M, X, S), and the
//                  fling-distance parity (BEHAVIOUR).
//   part H (new)   flick-hero-v1 runs (nav-fade's hero flip). P-122's scorer refuses part H, so H is scored here:
//                  a counted H run is VOID on: no record, run.aborted, any run.errors entry, no served-check log or a
//                  check not ok (the same regexes as P-122's G runs), median moving dt > 25 ms (30 Hz), or no
//                  flipDown and flipUp window in the run; the sentinel chain (a failing sCo/sCc voids every run since
//                  the last passing one) is applied over the hold order with M, X, S, as P-122's applySentinel.
//                  FLICKER H: nav-hit-cache's flicker gate on part H's counted runs (same child, same reading).
//   NF (new)       nav-fade's windows (fixes/v9-2/phone/nf-read.mjs f9631790c0aa, refused if changed; P-139's stand-in):
//                  flipDown / flipUp from part H, endIn / endOut from part X. Runs: the counted runs with a record whose
//                  only void reasons are path-gate ones ("path: ..."; as the parity, a path void is no frame-data void;
//                  C = v9-final has no rev 7d, so P-122's C rule voids C's caught X outs by design).
//                  Per window kind: nf-read's compare (sum per run, >= 3 runs an arm; WORSE only if V's min > C's max).
//                  The gate reads the > 50 ms count (twins > 46 / > 54: threshold-sensitive); the > 34 ms count is
//                  reported only. Part S's end windows are reported only. NF WORSE -> nav-fade no-land in the bisect.
// Block verdict: BEHAVIOUR FAIL (own line, leads) if the parity counts; frames: WORSE if any gate (GM, EX, ES, FLICKER,
// FLICKER_H, NF) is WORSE or has a NEW cluster; else insufficient if any is; else no-worse.
//   node fixes/v9-2/phone/score142.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const P122_SCORER = ['../../v9-best/phone/p122/score.mjs', 'd1dddb910cd9'];
export const NF_READ = ['nf-read.mjs', 'f9631790c0aa'];
for (const [p, h] of [P122_SCORER, NF_READ]) {
  const got = sha(join(here, p)).slice(0, 12);
  if (got !== h) { console.error(`${p} changed (${got}, pinned ${h}): refuse`); process.exit(3); }
}
export const Q = await import(join(here, P122_SCORER[0]));
// nf-read runs as a child (its module runs its CLI on import): `run` gives per-run windows and totals, `compare` the
// per-kind verdicts; both read the default phone parameters (--lvh 815, flip 1600 ms, end 1000 ms).
export const NFR = join(here, NF_READ[0]);
const nfChild = (args) => { const r = spawnSync(process.execPath, [NFR, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(`nf-read ${args[0]} exit ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 200)}`); return r.stdout; };
export const nfRun = (files) => (files.length ? nfChild(['run', ...files]).trim().split('\n').map((l) => JSON.parse(l)) : []);
export const nfCompare = (C, V) => JSON.parse(nfChild(['compare', '--C', C.join(','), '--V', V.join(',')])).result;
const S = Q.V9S.S;
const self = sha(fileURLToPath(import.meta.url));
// P-142's arms: C = v9-final as landed (fixes/v9-best/build.mjs V9F / V9_EXPECT), V = v9.2 (build.mjs --target v92,
// V92_EXPECT)
export const P142 = {
  C: { js: '647c9ef2b1e2bd7bb0f3a3f3c93cb69e2991744e91f8df48d276bbc7feab55f2', css: 'e1359ab9994a67cab41dc313806037dba1d93817bd6a31918d3b23de78db87ba' },
  V: { js: '30f6371751f4a83029629484b791a53c4231bec57565c80bfea9e0e42f1c5794', css: '1c4161f56545d955d8eb99960530fb1d541dd386bbe0cc746308409d4057d1c4' },
};
export const MIN_NF = 3;
const isH = (item) => /^(wg|g)H/.test(item);
export function parseH(item) {
  if (/^wgH[CV]$/.test(item)) return { warmup: true };
  const m = item.match(/^gH([CV])(\d+)$/); if (m) return { kind: 'G', part: 'H', arm: m[1], run: +m[2] };
  throw new Error(`unknown item ${item}`);
}

// one counted H run: void reasons and nav-fade windows
export function scoreH(item, j, checkLog, file = null) {
  const p = parseH(item); if (p.warmup) return null;
  const out = { item, ...p, isSentinel: false, void: [] };
  if (!j) { out.void.push('no record'); return out; }
  const r = j.run || {};
  if (r.aborted) out.void.push(`aborted: ${String(r.aborted).slice(0, 80)}`);
  if ((r.errors || []).length) out.void.push(`errors: ${String(r.errors[0]).slice(0, 80)}`);
  if (checkLog === null || checkLog === undefined) out.void.push('no served check log');
  else if (!/^B .* ok$/m.test(checkLog) || !/^C .* ok$/m.test(checkLog) || !/^V .* ok$/m.test(checkLog) || /WRONG/.test(checkLog)) out.void.push('served check not ok');
  const segs = r.segments || [];
  const mv = segs.flatMap((s) => (s.frames || []).filter((f, i, fr) => i > 0 && f[1] != null && f[2] !== fr[i - 1][2]).map((f) => f[1]));
  const md = S.median(mv);
  if (md != null && md > 25) out.void.push(`median moving dt ${md} ms (30 Hz, LPM suspect)`);
  out.moving = { frames: mv.length, gt50: mv.filter((d) => d > 50).length, gt34: mv.filter((d) => d > 34).length };
  const ws = file ? nfRun([file])[0].windows : [];
  out.flips = { down: ws.filter((w) => w.kind === 'flipDown').length, up: ws.filter((w) => w.kind === 'flipUp').length };
  if (!out.flips.down || !out.flips.up) out.void.push(`no flip window (down ${out.flips.down}, up ${out.flips.up})`);
  return out;
}

// the sentinel chain over the whole block order: P-122's runs (sentinels with their pass) and the H runs
export function chainH(entries, p122Runs, hRuns) {
  const sent = p122Runs.filter((r) => r.kind === 'S');
  let si = 0, hi = 0, since = [];
  for (const e of entries) {
    if (isH(e.item)) { if (parseH(e.item).warmup) continue; since.push(hRuns[hi++]); continue; }
    const p = Q.parse(e.item);
    if (p.kind !== 'S') continue;
    const s = sent[si++], pass = s?.sentinel?.pass ?? null;
    if (pass !== true) for (const x of since) x.void.push(`voided by failing sentinel ${s?.item ?? e.item}`);
    since = [];
  }
}

// nav-fade windows gate: per kind, nf-read's compare over the NF-usable runs
const nfUsable = (r) => r && r.void.every((v) => /^path: /.test(v));
export function nfGate(entries, p122Runs, hRuns) {
  const byItem = new Map([...p122Runs, ...hRuns].map((r) => [r.item, r]));
  const files = (part, arm) => entries.filter((e) => { const r = byItem.get(e.item); return r && r.kind === 'G' && r.part === part && r.arm === arm && e.j && nfUsable(r); });
  const kinds = { flipDown: 'H', flipUp: 'H', endIn: 'X', endOut: 'X' };
  const res = {}, rep = {};
  for (const P of ['H', 'X', 'S']) {
    const fC = files(P, 'C'), fV = files(P, 'V');
    const cmp = nfCompare(fC.map((e) => e.file), fV.map((e) => e.file));
    const tot = (list) => nfRun(list.map((e) => e.file)).map((x, i) => ({ item: list[i].item, totals: x.totals }));
    rep[P] = { nC: fC.length, nV: fV.length, C: tot(fC), V: tot(fV), compare: cmp };
  }
  for (const [k, P] of Object.entries(kinds)) {
    const x = rep[P], c = x.compare[k];
    const enough = x.nC >= MIN_NF && x.nV >= MIN_NF;
    const v = !enough ? `insufficient (part ${P}: C ${x.nC}, V ${x.nV}, need ${MIN_NF})` : c.gt50;
    res[k] = { part: P, verdict: /^too few/.test(v) ? `insufficient (${v})` : v, gt50: c.counts.gt50, gt46: c.counts.gt46, gt54: c.counts.gt54, gt34Report: c.gt34, windowsC: c.windowsC, windowsV: c.windowsV };
  }
  const vs = Object.values(res).map((r) => r.verdict);
  const tag = Object.entries(res).map(([k, r]) => `${k} ${r.verdict.split(' ')[0]}`).join(', ');
  const verdict = vs.some((v) => /^WORSE/.test(v)) ? `WORSE (${tag})` : vs.some((v) => /^insufficient/.test(v)) ? `insufficient (${tag})` : `no-worse (${tag})`;
  return { verdict, kinds: res, thresholdSensitive: vs.some((v) => /threshold-sensitive/.test(v)), parts: rep, sReport: Object.fromEntries(['endIn', 'endOut'].map((k) => [k, rep.S.compare[k].gt50])) };
}

export function flickerH(entries, hRuns, run) {
  const ok = new Set(hRuns.filter((r) => !r.void.length).map((r) => r.item));
  const f = { C: [], V: [] };
  for (const e of entries) { if (!isH(e.item) || !e.j) continue; const p = parseH(e.item); if (!p.warmup && ok.has(e.item)) f[p.arm].push(e.file); }
  if (f.C.length < 3 || f.V.length < 3) return { verdict: `insufficient (flicker gate H: valid C ${f.C.length} V ${f.V.length}, need >= 3)`, files: { C: f.C.length, V: f.V.length } };
  const r = run('H', f.C, f.V), p = Q.flickerPart(r.status, r.stdout);
  // part H is not pooled with M, X, S: a gate VOID on its own run count is insufficient here (P-122's pooling rule
  // covers only the parts it pooled)
  if (p.countOnly) p.verdict = `insufficient (flicker gate H VOID on its run count: valid C ${p.valid.C} V ${p.valid.V}, need >= 3; not pooled)`;
  return { ...p, exit: r.status, files: { C: f.C.length, V: f.V.length }, json: r.json ?? null, out: (r.stdout || '').trim().split('\n').slice(-12) };
}

export function score142(entries, flicker = null, runFlicker = null) {
  const mxs = entries.filter((e) => !isH(e.item));
  const out = Q.scoreP122(mxs, flicker);
  const hRuns = entries.filter((e) => isH(e.item)).map((e) => scoreH(e.item, e.j, e.checkLog, e.j ? e.file : null)).filter(Boolean);
  chainH(entries, out.runs, hRuns);
  out.runs = out.runs.concat(hRuns);
  if (runFlicker) out.gates.FLICKER_H = flickerH(entries, hRuns, runFlicker);
  out.gates.NF = nfGate(entries, out.runs.filter((r) => r.part !== 'H'), hRuns);
  out.reported.H = hRuns.map((r) => ({ item: r.item, void: r.void, moving: r.moving, flips: r.flips }));
  const vs = Object.values(out.gates).map((g) => g.verdict);
  let verdict = vs.some((x) => /^(WORSE|NEW CLUSTER)/.test(x)) ? 'WORSE' : vs.some((x) => /^insufficient/.test(x)) ? 'insufficient' : 'no-worse';
  if (out.reported.parity.verdict === 'BEHAVIOUR FAIL') verdict = `BEHAVIOUR FAIL; frames ${verdict}`;
  out.verdict = verdict;
  out.thresholdSensitive = Object.values(out.gates).some((g) => g.thresholdSensitive || g.clusterThresholdSensitive);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  Q.V9S.pin(P142);
  const entries = Q.V9S.loadEntries(args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)));
  const fbase = (jsonOut || '/dev/null') === '/dev/null' ? null : jsonOut.replace(/\.json$/, '');
  const runF = (P, C, V) => {
    const fj = fbase ? `${fbase}-flicker-${P}.json` : null;
    return { ...spawnSync(process.execPath, [Q.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V, ...(fj ? ['--json', fj] : [])], { encoding: 'utf8' }), json: fj };
  };
  const mxs = entries.filter((e) => !isH(e.item));
  const out = score142(entries, Q.flickerGate(Q.flickerFiles(mxs), runF), runF);
  for (const r of out.runs) {
    const what = r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : r.part === 'H' ? `moving ${JSON.stringify(r.moving ?? null)} flips ${JSON.stringify(r.flips ?? null)}`
      : `${JSON.stringify(r.window ?? r.counts)}${r.path?.outs ? '; outs ' + JSON.stringify(r.path.outs.map((o) => [o.name, o.fv, o.travel, o.fromEnd])) : ''}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}${r.f260 ? `; f260 ${JSON.stringify(r.f260)}` : ''}`);
  }
  for (const [k, g] of Object.entries(out.gates)) if (k !== 'NF') console.log(`${k}: ${JSON.stringify({ ...g, parts: undefined })}`);
  for (const [P, x] of Object.entries(out.gates.FLICKER.parts)) console.log(`FLICKER ${P}: ${x.verdict}${x.files ? ` (files C ${x.files.C} V ${x.files.V})` : ''}`);
  for (const [k, x] of Object.entries(out.gates.NF.kinds)) console.log(`NF ${k} (part ${x.part}): ${x.verdict}; > 50 C ${JSON.stringify(x.gt50.C)} V ${JSON.stringify(x.gt50.V)}; > 34 (report) ${x.gt34Report}; windows C ${JSON.stringify(x.windowsC)} V ${JSON.stringify(x.windowsV)}`);
  console.log(`NF part S end windows (report only): ${JSON.stringify(out.gates.NF.sReport)}`);
  console.log(`NF: ${out.gates.NF.verdict}`);
  for (const [P, x] of Object.entries(out.reported.parity.parts)) {
    const runs = x.runs.C.concat(x.runs.V).map((r) => `${r.item} ${r.compared ? `${r.compared.d}${r.compared.clipped ? ' clipped' : ''} (${r.compared.how})` : '-'}`).join(' | ');
    console.log(`parity ${P} (OBSERVED, lift to settle or next stroke): ${x.compared ? `${x.compared}: median C ${x.C} V ${x.V} gap ${x.gap}; pairs ${JSON.stringify((x.pairs || []).map((q) => [q.n, q.gap, q.counts]))}; ${x.verdict}` : 'reported only'}${x.firstDown ? `; first page-down (report) C ${x.firstDown.C} V ${x.firstDown.V}` : ''}; runs ${runs}`);
  }
  console.log(`parity: ${out.reported.parity.verdict}`);
  if (out.reported.parity.verdict === 'BEHAVIOUR FAIL') { console.log('BEHAVIOUR FAIL'); for (const f of out.reported.parity.fail) console.log(`  ${f}`); }
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self} (wraps p122/score.mjs ${P122_SCORER[1]}, nf-read.mjs ${NF_READ[1]})`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v9-2/phone/score142.mjs', sha256: self, wraps: [P122_SCORER, NF_READ], ...out }, null, 1));
}

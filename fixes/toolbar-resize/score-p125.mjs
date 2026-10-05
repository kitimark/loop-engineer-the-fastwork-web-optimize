#!/usr/bin/env node
// toolbar-resize P-125 scorer (frozen before data). Simulator, attribution only: times compare within one session
// against interleaved C runs, never as a gain.
//   node fixes/toolbar-resize/score-p125.mjs <folder> <run> ... [--json out.json]   (<run> = <arm>-H<n>, arm C | wpx | wc1)
// <folder> holds g-<run>.json (sim.mjs gesture --out, with p125-inject.mjs's record), tl-<run>.json (--timeline) and
// runs.jsonl (sim-p125.mjs: served bytes and the server per run).
// FRAMES (as P-119 N1, split-io119.mjs 1ad22b858eb8): the run's longest segment. A frame [t, dt, y, ih] covers (t - dt, t].
//   moving = innerHeight strictly between the run's min and max (a toolbar step in progress); rest = every other frame.
//   in view = the showcase's last IntersectionObserver entry with time <= t says intersecting (none yet = unknown).
//   IN-VIEW STEP FRAMES = moving, y < 3250, in view. Per frame: largest outermost Layout starting in (t - dt, t] (0 if
//   none), and the summed outermost Layout ms.
// 1. GATE (per run, else INSUFFICIENT; never NONE): the inject installed with its IO and write log; >= 100 frames; >= 1
//    Timeline Layout; runs.jsonl names the run's server (C, wc1 on A = v8 JS 3e3e94cb6e9f; wpx on B = JS 6a79036cc108)
//    and the served-bytes record matches; C and wpx: arm as labelled, 0 drops; wc1: arm wc1, no data-fw-wc="0" at read;
//    wpx: promotion at install (promo0.willChange) within +-1 of its neighbouring C runs' mean (the window is the same
//    at rest at ih 775), and ih0 = 775.
// 2. METRICS per run: in-view step frames n, medL (median largest Layout), msPerS (sum Layout ms / sum dt s); the same
//    for off-screen step frames (descriptive). Non-C runs: ratio to the mean of the nearest valid C run before and after.
// 3. NOISE: each valid C run against the mean of its valid C neighbours (previous and next C run); N = max |1 - ratio|
//    over the C runs, per metric, floor 0.10. N > 0.30 or < 3 valid C runs: VOID (no call).
// 4. BANDS (ratio r, noise N): r <= 0.30 LOCATES; <= 0.70 PARTIAL; < 1 - N SMALL; <= 1 + N NONE (within C-to-C noise:
//    no effect claimed); else WORSE. Run call = band of medL (per frame); the msPerS band (per second of toolbar motion)
//    differing from it flags N-SENSITIVE (both reported, no effect size claimed). THIN when the run or a neighbouring C
//    run has < 3 in-view step frames. Arm call = the common call of its replicates, else SPLIT; any INSUFFICIENT or THIN
//    replicate makes the arm that. ARMS: |mean medL ratio wpx - mean medL ratio wc1| <= N: ARMS-EQUAL, else ARMS-DIFFER.
// 5. COINCIDENCE (C runs pooled; per key fw-wc and scene): a frame carries a write when a record of that key falls in
//    its own interval or the previous frame's (an IO callback's write takes effect in the next update). Heavy = in-view
//    step frame with largest Layout >= 10 ms. H heavy frames, Hw carrying. Base b = share of rest frames carrying.
//    h = Hw / H, hLo = its Clopper-Pearson one-sided 95 % lower bound; floor F = max(5, 2 x pooled runs). THIN when
//    H < 5; COVERS when Hw >= F, hLo >= 2 b and h >= 0.8; LINKED-PART when Hw >= F and hLo >= 2 b; else NO-LINK.
//    (Rate vs rate with a floor: ops' rule, 2026-10-05.)
// 6. WRITE RATE (per arm pooled, per key; ops' rule): s records in moving frames over Fs moving frames, r records in rest
//    frames over Fr. RR = (s / Fs) / (r / Fr); RRlo = the Clopper-Pearson one-sided 95 % lower bound of s / (s + r),
//    as odds, times Fr / Fs. STEP-LINKED when s >= max(8, 4 x pooled runs) and RRlo >= 2, else not (P-123's 2-3 step
//    records per run cannot pass, pooled or not). Records outside every frame are dropped. Descriptive: no call uses it.
// 7. READING (frozen): see README "Prediction P-125" -> Reading; printed as `reading`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export const GATE_JS = { A: '3e3e94cb6e9f', B: '6a79036cc108' }, GATE_CSS = 'f836404b3728';
export const ARM_SERVER = { C: 'A', wc1: 'A', wpx: 'B' };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
// binomial upper tail P(X >= x | n, p), in logs
const lgam = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
const tail = (x, n, p) => { if (x <= 0) return 1; if (p <= 0) return 0; if (p >= 1) return 1; let s = 0; for (let k = x; k <= n; k++) s += Math.exp(lgam(n + 1) - lgam(k + 1) - lgam(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p)); return Math.min(1, s); };
export const cpLower = (x, n, alpha = 0.05) => { if (x <= 0 || n <= 0) return 0; let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (tail(x, n, m) >= alpha) hi = m; else lo = m; } return (lo + hi) / 2; };
export const rateRule = (s, Fs, r, Fr, runs = 1) => {
  const RR = Fs && Fr ? (r ? (s / Fs) / (r / Fr) : s ? Infinity : null) : null;
  const pl = cpLower(s, s + r), RRlo = Fs && Fr ? (pl >= 1 ? Infinity : (pl / (1 - pl)) * (Fr / Fs)) : null;
  const floor = Math.max(8, 4 * runs);
  return { s, Fs, r, Fr, runs, floor, RR: r3(RR), RRlo: r3(RRlo), linked: s >= floor && RRlo != null && RRlo >= 2 };
};
export const band = (r, N) => (r == null ? 'INSUFFICIENT' : r <= 0.3 ? 'LOCATES' : r <= 0.7 ? 'PARTIAL' : r < 1 - N ? 'SMALL' : r <= 1 + N ? 'NONE' : 'WORSE');
export const coincidence = (H, Hw, base, runs = 1) => {
  const h = H ? Hw / H : null, hLo = cpLower(Hw, H), floor = Math.max(5, 2 * runs);
  const call = H < 5 ? 'THIN' : Hw >= floor && hLo >= 2 * base && h >= 0.8 ? 'COVERS' : Hw >= floor && hLo >= 2 * base ? 'LINKED-PART' : 'NO-LINK';
  return { H, Hw, runs, floor, h: r3(h), hLo: r3(hLo), base: r3(base), call };
};
export function score(dir, names) {
  const served = { byRun: {}, top: null };
  if (existsSync(join(dir, 'runs.jsonl'))) for (const l of readFileSync(join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean)) { const o = JSON.parse(l); if (o.served) served.top = o.served; if (o.name) served.byRun[o.name] = o; }
  const load = (name) => {
    const arm = name.replace(/-H\d+$/, ''), why = [];
    let g = null, tl = null; try { g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8')); tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8')); } catch (e) { why.push(`files: ${e.message}`); }
    const seg = g ? [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0] : null;
    let inj = g ? (g.run?.inject || g.inject || [])[0]?.value ?? null : null; if (typeof inj === 'string') { try { inj = JSON.parse(inj); } catch { inj = null; } }
    const lays = [];
    const walk = (r, inLay) => { const isL = r.type === 'Layout' && r.endTime != null; if (isL && !inLay) lays.push([r.startTime * 1000 - tl.offsetMs, (r.endTime - r.startTime) * 1000]); (r.children || []).forEach((c) => walk(c, inLay || isL)); };
    if (tl) for (const r of tl.recs || []) walk(r, false);
    return { name, arm, g, seg, inj, lays, why };
  };
  const runs = names.map(load);
  for (const R of runs) {
    const { inj, seg, why } = R;
    if (!inj) why.push('no inject record'); else { if (!inj.ioInstalled || !(inj.io || []).length) why.push('no IO entries'); if (!Array.isArray(inj.wr)) why.push('no write log'); }
    if (!seg || (seg.frames || []).length < 100) why.push('< 100 frames');
    if (!R.lays.length) why.push('no Timeline Layout');
    const sr = served.byRun[R.name], want = ARM_SERVER[R.arm];
    if (!want) why.push(`unknown arm ${R.arm}`);
    else if (!sr || sr.server !== want || sr.jsWant !== GATE_JS[want]) why.push(`server record ${sr ? sr.server : 'missing'} (want ${want})`);
    else if (!served.top || served.top[want]?.js?.h !== GATE_JS[want] || served.top[want]?.css?.h !== GATE_CSS || served.top[want]?.port !== sr.port) why.push('served bytes record does not match');
    if (inj) {
      const wantArm = R.arm === 'C' ? 'none' : R.arm;
      if (inj.arm !== wantArm) why.push(`inject arm ${inj.arm} (want ${wantArm})`);
      if (R.arm !== 'wc1' && inj.drops) why.push(`drops ${inj.drops} in ${R.arm}`);
      if (R.arm === 'wc1' && (inj.fwwc0AtRead !== 0 || inj.promo1?.n0 !== 0)) why.push('wc1 not pinned at read');
      if (R.arm === 'wpx' && inj.ih0 !== 775) why.push(`wpx ih0 ${inj.ih0} (the px margin equals 50 % only at 775)`);
    }
    R.valid = !why.length;
    if (!seg) continue;
    const fr = seg.frames, ihs = fr.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs), io = inj?.io || [];
    R.frames = fr.map(([t, dt, y, ih]) => {
      let st = null; for (const e of io) { if (e[0] <= t) st = e[1]; else break; }
      const ls = R.lays.filter((l) => l[0] > t - dt && l[0] <= t);
      return { t, dt, y, moving: ih > lo && ih < hi, view: st, max: ls.reduce((m, l) => Math.max(m, l[1]), 0), sum: ls.reduce((a, l) => a + l[1], 0) };
    });
    const grp = (f) => { const a = R.frames.filter(f), dts = a.reduce((x, q) => x + q.dt, 0); return { n: a.length, medL: r3(median(a.map((q) => q.max))), msPerS: dts ? r3(a.reduce((x, q) => x + q.sum, 0) / (dts / 1000)) : null }; };
    R.in = grp((q) => q.moving && q.y < 3250 && q.view === 1);
    R.off = grp((q) => q.moving && q.y < 3250 && q.view === 0);
    // writes per frame (own interval or the previous frame's)
    const wr = inj?.wr || [];
    const idxOf = (w) => { let a = 0, b = R.frames.length - 1; if (!R.frames.length || w <= R.frames[0].t - R.frames[0].dt || w > R.frames[b].t) return -1; while (a < b) { const m = (a + b) >> 1; if (R.frames[m].t < w) a = m + 1; else b = m; } return w > R.frames[a].t - R.frames[a].dt ? a : -1; };
    R.wFrame = { 0: new Array(R.frames.length).fill(0), 1: new Array(R.frames.length).fill(0) };
    for (const [w, k] of wr) { const i = idxOf(w); if (i >= 0) R.wFrame[k][i]++; }
  }
  // wpx promotion-at-rest gate needs the neighbouring C runs
  const nbC = (i) => { const nb = []; for (let j = i - 1; j >= 0; j--) if (runs[j].arm === 'C' && runs[j].valid) { nb.push(runs[j]); break; } for (let j = i + 1; j < runs.length; j++) if (runs[j].arm === 'C' && runs[j].valid) { nb.push(runs[j]); break; } return nb; };
  runs.forEach((R, i) => { if (R.arm !== 'wpx' || !R.inj) return; const m = mean(nbC(i).map((c) => c.inj.promo0?.willChange).filter((v) => v != null)); if (m == null || Math.abs((R.inj.promo0?.willChange ?? -99) - m) > 1) { R.why.push(`wpx promotion at rest ${R.inj.promo0?.willChange} vs C ${m}`); R.valid = false; } });
  // noise
  const Cs = runs.filter((R) => R.arm === 'C' && R.valid), noise = {};
  for (const m of ['medL', 'msPerS']) {
    let N = 0; Cs.forEach((c, k) => { const nb = [Cs[k - 1], Cs[k + 1]].filter(Boolean).map((x) => x.in[m]).filter((v) => v != null); const cm = mean(nb); if (cm && c.in[m] != null) N = Math.max(N, Math.abs(1 - c.in[m] / cm)); });
    noise[m] = r3(Math.max(0.1, N));
  }
  const VOID = Cs.length < 3 || noise.medL > 0.3 || noise.msPerS > 0.3;
  // run calls
  runs.forEach((R, i) => {
    if (R.arm === 'C') return;
    if (!R.valid) { R.call = 'INSUFFICIENT'; return; }
    const nb = nbC(i); R.ratio = {}; R.ratioOff = {};
    for (const m of ['medL', 'msPerS']) {
      const cm = mean(nb.map((c) => c.in[m]).filter((v) => v != null)); R.ratio[m] = cm && R.in[m] != null ? r3(R.in[m] / cm) : null;
      const co = mean(nb.map((c) => c.off[m]).filter((v) => v != null)); R.ratioOff[m] = co && R.off[m] != null ? r3(R.off[m] / co) : null;
    }
    if (VOID) { R.call = 'VOID'; return; }
    if (R.in.n < 3 || nb.length === 0 || nb.some((c) => c.in.n < 3)) { R.call = 'THIN'; return; }
    R.call = band(R.ratio.medL, noise.medL); R.secondary = band(R.ratio.msPerS, noise.msPerS); R.nSensitive = R.call !== R.secondary;
    R.offCall = band(R.ratioOff.medL, noise.medL);
  });
  const arms = {};
  for (const a of ['wpx', 'wc1']) {
    const rs = runs.filter((R) => R.arm === a); if (!rs.length) continue;
    const cs = rs.map((R) => R.call);
    const call = cs.find((c) => ['INSUFFICIENT', 'VOID', 'THIN'].includes(c)) || (cs.every((c) => c === cs[0]) ? cs[0] : 'SPLIT');
    arms[a] = { call, runs: cs, nSensitive: rs.some((R) => R.nSensitive), meanRatio: r3(mean(rs.map((R) => R.ratio?.medL).filter((v) => v != null))) };
  }
  const armsCmp = arms.wpx && arms.wc1 && arms.wpx.meanRatio != null && arms.wc1.meanRatio != null ? (Math.abs(arms.wpx.meanRatio - arms.wc1.meanRatio) <= noise.medL ? 'ARMS-EQUAL' : 'ARMS-DIFFER') : null;
  // coincidence and write rates
  const pooled = (rs, k) => {
    let H = 0, Hw = 0, rest = 0, restW = 0, s = 0, Fs = 0, r = 0, Fr = 0;
    for (const R of rs) { if (!R.frames) continue; const w = R.wFrame[k];
      R.frames.forEach((q, i) => { const carry = w[i] + (i ? w[i - 1] : 0) > 0;
        if (q.moving) { Fs++; s += w[i]; } else { Fr++; r += w[i]; rest++; if (carry) restW++; }
        if (q.moving && q.y < 3250 && q.view === 1 && q.max >= 10) { H++; if (carry) Hw++; } }); }
    const k2 = rs.filter((R) => R.frames).length;
    return { coincidence: coincidence(H, Hw, rest ? restW / rest : 0, k2), rate: rateRule(s, Fs, r, Fr, k2) };
  };
  const byArm = {};
  for (const a of ['C', 'wpx', 'wc1']) { const rs = runs.filter((R) => R.arm === a && R.valid); if (rs.length) byArm[a] = { fwwc: pooled(rs, 0), scene: pooled(rs, 1) }; }
  const coinC = byArm.C?.fwwc.coincidence.call ?? 'THIN';
  const W = arms.wpx?.call, P = arms.wc1?.call, eff = (c) => c === 'LOCATES' || c === 'PARTIAL';
  let reading;
  if (VOID) reading = 'VOID';
  else if (!W || [W, P].filter(Boolean).some((c) => ['INSUFFICIENT', 'THIN', 'SPLIT', 'VOID'].includes(c))) reading = 'UNCLEAR (no arm call)';
  else if (eff(W) && coinC !== 'NO-LINK') reading = 'WINDOW-TRIGGER';
  else if (eff(W)) reading = 'UNCLEAR (wpx effect without coincidence)';
  else if (W === 'NONE' && (!P || P === 'NONE')) reading = 'NOT-THE-WINDOW';
  else if (W === 'NONE' && (eff(P) || P === 'SMALL')) reading = 'PROMOTION-STATE';
  else if (W === 'SMALL') reading = 'MINOR';
  else reading = 'UNCLEAR';
  const out = {
    scorer: 'fixes/toolbar-resize/score-p125.mjs', noise, VOID, reading, coincidenceC: coinC, arms, armsCmp, byArm,
    runs: runs.map((R) => ({ name: R.name, arm: R.arm, valid: R.valid, why: R.why, in: R.in, off: R.off, ratio: R.ratio, ratioOff: R.ratioOff, call: R.call ?? null, secondary: R.secondary ?? null, nSensitive: R.nSensitive ?? null, offCall: R.offCall ?? null,
      promo0: R.inj?.promo0 ?? null, promo1: R.inj?.promo1 ?? null, drops: R.inj?.drops ?? null, writes: R.inj?.wr ? { fwwc: R.inj.wr.filter((w) => w[1] === 0).length, scene: R.inj.wr.filter((w) => w[1] === 1).length } : null })),
  };
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  const [dir, ...names] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
  if (!dir || !names.length) { console.error('usage: score-p125.mjs <folder> <run> ... [--json out.json]'); process.exit(1); }
  const o = score(dir, names);
  console.log(`noise medL ${o.noise.medL} msPerS ${o.noise.msPerS}${o.VOID ? ' VOID' : ''}`);
  for (const r of o.runs) console.log(`${r.name.padEnd(8)} ${r.valid ? 'valid' : 'INSUFFICIENT ' + r.why.join('; ')} | in n ${r.in?.n} medL ${r.in?.medL} ms/s ${r.in?.msPerS} | off n ${r.off?.n} medL ${r.off?.medL}${r.ratio ? ` | ratio ${r.ratio.medL} / ${r.ratio.msPerS} ${r.call}${r.nSensitive ? ' N-SENSITIVE (' + r.secondary + ')' : ''} off ${r.offCall}` : ''} | promo ${JSON.stringify(r.promo0)} drops ${r.drops} writes ${JSON.stringify(r.writes)}`);
  for (const [a, v] of Object.entries(o.arms)) console.log(`ARM ${a}: ${v.call}${v.nSensitive ? ' (N-SENSITIVE)' : ''} runs ${v.runs.join(',')} mean ratio ${v.meanRatio}`);
  for (const [a, v] of Object.entries(o.byArm)) console.log(`${a} fw-wc: coincidence ${JSON.stringify(v.fwwc.coincidence)} rate ${JSON.stringify(v.fwwc.rate)} | scene: coincidence ${v.scene.coincidence.call} rate linked ${v.scene.rate.linked}`);
  console.log(`ARMS ${o.armsCmp} | COINCIDENCE (C, fw-wc) ${o.coincidenceC} | READING ${o.reading}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(o, null, 1) + '\n');
}

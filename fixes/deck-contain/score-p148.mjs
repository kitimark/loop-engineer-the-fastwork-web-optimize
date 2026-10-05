// P-148 scorer (frozen before data). Reads every group file in out/deck-contain/p148/ (px148-chrome.mjs and
// px148-sim.mjs output); only files with complete: true count. Step 1, per engine, the instrument gate on the null arm
// N0 and on the base-vs-base-again (A/A) of every triple. Step 2, only when BOTH gates pass: R3 against T0/T1/T2.
// A failed gate ends the card: the scorer then computes and prints nothing about R3.
// usage: node fixes/deck-contain/score-p148.mjs [dir] [--out file]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { registeredKeys } from './px148.mjs';

export const GATE = { AA_ANY_SHARE: { chrome: 0.0001, sim: 0.0001 }, AA8: 0 };
const key = (t) => `${t.cfg}|${t.pos}|${t.mode}|${t.arm}`;
const RANK = { T0: 0, T1: 1, T2: 2, T3: 3 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);
// page frames and timeouts held during the arm phase beyond those held during the back phase (intervals excluded)
export const HELD_EXTRA_MAX = 2;
const held = (s) => s.raf + s.timeout;
export const heldExtra = (t) => (t.stat?.arm && t.stat?.back ? held(t.stat.arm) - held(t.stat.back) : 0);
// rev 1.1 N3: also against the null arm's arm phase at the same key (an R3 reaction on both on and off cancels in heldExtra)
export const heldVsNull = (t, n0) => (t.stat?.arm && n0?.stat?.arm ? held(t.stat.arm) - held(n0.stat.arm) : 0);

// files: [{ name, json }]; returns { engines: { chrome, sim }, verdict, ... } or throws on a duplicate key
export function score(files) {
  const by = { chrome: new Map(), sim: new Map() }, used = [], ignored = [], erroredIgnored = [];
  for (const { name, json } of files) {
    if (!json || json.complete !== true) { ignored.push(name); continue; }
    const eng = json.tool === 'deck-contain px148-chrome' ? 'chrome' : json.tool === 'deck-contain px148-sim' ? 'sim' : null;
    if (!eng) { ignored.push(name); continue; }
    used.push(name);
    for (const t of json.triples || []) {
      // rule 1b (rev 1.1 N2): triples of a config that ended with an error are ignored (its RR2 re-run is the record)
      if (json.configs?.[t.cfg]?.error) { erroredIgnored.push(`${name} ${key(t)}`); continue; }
      const k = key(t);
      if (by[eng].has(k)) throw new Error(`DUPLICATE ${eng} ${k} (${by[eng].get(k).file}, ${name}): the scorer never picks`);
      by[eng].set(k, { ...t, file: name });
    }
  }
  const out = { files: { used, ignored, erroredTriplesIgnored: erroredIgnored.length }, engines: {} };
  for (const eng of ['chrome', 'sim']) {
    const m = by[eng], reg = registeredKeys(eng), all = [...m.values()];
    const missing = reg.filter((k) => !m.has(k)), extra = [...m.keys()].filter((k) => !reg.includes(k));
    const unsettled = all.filter((t) => !t.settled).map(key);
    const aa8 = all.filter((t) => t.judge.aa8 > GATE.AA8).map(key);
    const aaAny = all.filter((t) => t.judge.aaAny / t.judge.frame > GATE.AA_ANY_SHARE[eng]).map(key);
    const nullBad = all.filter((t) => t.arm === 'N0' && (RANK[t.judge.tier] > 1 || t.geoArm.length)).map(key);
    const geoAA = all.filter((t) => t.geoAA.length).map(key);
    const checks = { G1_complete: missing.length === 0, G2_settled: unsettled.length === 0, G3_aa8: aa8.length === 0,
      G4_aaAny: aaAny.length === 0, G5_null: nullBad.length === 0, G6_geoAA: geoAA.length === 0 };
    out.engines[eng] = { triples: all.length, registered: reg.length, gate: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', checks,
      missing, extra, unsettled, aa8, aaAny, nullBad, geoAA,
      maxAaAnyShare: all.length ? Math.max(...all.map((t) => t.judge.aaAny / t.judge.frame)) : null,
      maskDropped: all.filter((t) => t.maskDropped?.length).map((t) => `${key(t)} ${t.maskDropped.join(',')}`) };
  }
  if (out.engines.chrome.gate !== 'PASS' || out.engines.sim.gate !== 'PASS') {
    out.verdict = 'GATE-FAILED'; out.failed = ['chrome', 'sim'].filter((e) => out.engines[e].gate !== 'PASS');
    return out;
  }
  // step 2: R3
  let overall = 'T0';
  const flags = { geometry: [], rmNotExact: [], motionOnly: [], outsideF: [], heldExtra: [] };
  for (const eng of ['chrome', 'sim']) {
    const m = by[eng], r3 = [...m.values()].filter((t) => t.arm === 'R3');
    const tiers = { T0: 0, T1: 0, T2: 0, T3: 0 }; let w = 'T0', worstT = null;
    for (const t of r3) {
      let tier = t.judge.tier;
      if (t.geoArm.length) { tier = 'T3'; flags.geometry.push(`${eng} ${key(t)} ${t.geoArm.join('; ')}`); }
      if (t.cfg.endsWith('-rm') && RANK[tier] > 1) flags.rmNotExact.push(`${eng} ${key(t)} ${tier}`);
      if (t.judge.beyondOutsideF) flags.outsideF.push(`${eng} ${key(t)} ${t.judge.beyondOutsideF}`);
      const n0 = m.get(`${t.cfg}|${t.pos}|${t.mode}|N0`), hb = heldExtra(t), hn = heldVsNull(t, n0);
      if (hb > HELD_EXTRA_MAX || hn > HELD_EXTRA_MAX) flags.heldExtra.push(`${eng} ${key(t)} vs back +${hb}, vs N0 +${hn}`);
      if (t.mode === 'swipe' && RANK[tier] >= 2) {
        const rest = m.get(`${t.cfg}|${t.pos}|rest|R3`);
        if (rest && RANK[rest.judge.tier] <= 1 && !rest.geoArm.length) flags.motionOnly.push(`${eng} ${key(t)} ${tier}`);
      }
      tiers[tier]++;
      if (!worstT || RANK[tier] > RANK[worstT.tier] || (tier === worstT.tier && t.judge.largestShade > worstT.j.largestShade)) worstT = { tier, j: t.judge, k: key(t), mode: t.mode };
      w = worst(w, tier);
    }
    const j = worstT?.j;
    out.engines[eng].r3 = { tiers, worstTier: w,
      worst: worstT && RANK[worstT.tier] >= 1 ? { triple: worstT.k, tier: worstT.tier, largestShade: j.largestShade, shareBeyondAA: j.shareBeyond, areaCssPx: j.areaCssPx,
        edgeOrFill: j.beyond ? (j.beyondEdge >= j.beyondFill ? 'edge' : 'fill') : 'none (all <= 8 levels)', fillMax: j.fillMax, edgeMax: j.edgeMax,
        staticOrMoving: worstT.mode === 'rest' ? 'static (rest)' : 'moving (swipe end, frozen)' } : null,
      inert1440: [...m.values()].filter((t) => t.arm === 'R3' && t.cfg === 'd1440x900').map((t) => t.judge.tier) };
    overall = worst(overall, w);
  }
  if (flags.rmNotExact.length || flags.motionOnly.length) overall = worst(overall, 'T3');
  out.flags = flags;
  // R3 woke page callbacks that the hold kept out of the arm shot: the tier cannot be trusted
  if (flags.heldExtra.length && overall !== 'T3') { out.verdict = 'R3 UNDECIDED-HELD'; out.reading = 'R3 woke held page callbacks; the arm shot may not show their effect: the lead rules'; return out; }
  out.verdict = `R3 ${overall}`;
  out.reading = overall === 'T3' ? 'beyond T2 (or reduced motion not exact, or a motion-only difference): a proposal to the user, the lead rules'
    : overall === 'T2' ? 'within T2 in both engines (numbers check; rule (c) read on the saved shots by the reader)' : 'within A/A or exact in both engines';
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/deck-contain/p148';
  const oi = process.argv.indexOf('--out'), outFile = oi > 0 ? process.argv[oi + 1] : 'out/deck-contain/score-p148.json';
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /^[CS]\d+b?\.json$/.test(n)).sort().map((n) => ({ name: n, json: JSON.parse(readFileSync(join(dir, n), 'utf8')) })) : [];
  let r;
  try { r = score(files); } catch (e) { console.log(String(e.message || e)); process.exit(2); }
  writeFileSync(outFile, JSON.stringify(r, null, 1));
  for (const eng of ['chrome', 'sim']) { const e = r.engines[eng]; console.log(`${eng} gate ${e.gate} ${JSON.stringify(e.checks)} triples ${e.triples}/${e.registered} maxAaAny ${e.maxAaAnyShare}`); if (e.r3) console.log(`${eng} R3 ${JSON.stringify(e.r3.tiers)} worst ${JSON.stringify(e.r3.worst)}`); }
  console.log('VERDICT', r.verdict, r.reading || '');
}

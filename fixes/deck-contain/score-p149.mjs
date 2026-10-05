// P-149 scorer (frozen before data). Reads out/deck-contain/p149/{L,R,S1,S2}[b].json (px149-chrome.mjs, px149-sim.mjs);
// only files with complete: true count; stops of a config whose file records an error for it are ignored (rule 1b).
// Step 1, part L: the stable cells of the 2x2 (px149.mjs stableCells) and the descriptive locator pattern.
// Step 2: R3 against the envelope, only at stable stops of the registered part-R plan and in the Simulator.
// usage: node fixes/deck-contain/score-p149.mjs [dir] [--out file]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CELLS, POSITIONS, MODES, SIM_GROUPS, stableCells, rPlan, stopStable } from './px149.mjs';

const RANK = { T0: 0, T1: 1, T2: 2, T3: 3 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);
const key = (s) => `${s.cfg}|${s.pos}|${s.mode}`;
export const HELD_EXTRA_MAX = 2;
export const motionCounts = (j) => j.largestShadeAboveEnv > 8;
const held = (s) => (s ? s.raf + s.timeout : 0);
// R3's arm phase held more page frames/timeouts than the most of the stop's N0-on phases (margin 2)
export const heldExtra = (s) => (s.stat?.arm ? held(s.stat.arm) - Math.max(0, ...(s.stat.n0on || []).map(held)) : 0);
// descriptive 2x2 reading of part L (no cause): which factor the unstable cells share
export function pattern(stable) {
  const u = CELLS.filter((c) => !stable.includes(c.cell)).map((c) => c.cell).sort().join(',');
  return ({ '': 'all four cells stable', 'desk3,mob3': 'DPR 3 cells unstable, DPR 1 cells stable', 'mob1,mob3': 'mobile-emulated cells unstable, desktop cells stable',
    mob3: 'only the mobile-emulated DPR-3 cell unstable', 'desk1,desk3,mob1,mob3': 'no cell stable' })[u] ?? `other: unstable ${u}`;
}

export function score(files) {
  const by = new Map(), used = [], ignored = [], errored = [], rFiles = [], notRun = [];
  for (const { name, json } of files) {
    const eng = json?.tool === 'deck-contain px149-chrome' ? 'chrome' : json?.tool === 'deck-contain px149-sim' ? 'sim' : null;
    if (!json || json.complete !== true || !eng) { ignored.push(name); continue; }
    used.push(name);
    if (eng === 'chrome' && json.part === 'R') rFiles.push({ name, json });
    notRun.push(...(json.notRun || []).map((n) => ({ ...n, file: name })));
    for (const s of json.stops || []) {
      // rule 1b, and rev 1.1 N10: a top-level error (e.g. the server did not start) counts as an error for every state
      if (json.error || json.configs?.[s.cfg]?.error) { errored.push(`${name} ${key(s)}`); continue; }
      const k = `${eng}|${key(s)}`;
      if (by.has(k)) throw new Error(`DUPLICATE ${k} (${by.get(k).file}, ${name}): the scorer never picks`);
      by.set(k, { ...s, file: name, eng });
    }
  }
  const out = { files: { used, ignored, erroredStopsIgnored: errored.length }, notRun };
  // step 1: part L
  const L = [...by.values()].filter((s) => s.eng === 'chrome' && s.cfg.startsWith('L-'));
  const stable = stableCells(L);
  out.locator = { stableCells: stable, pattern: pattern(stable), cells: {} };
  for (const c of CELLS) {
    const s = L.filter((x) => x.cfg === `L-${c.cell}`), pairs = s.flatMap((x) => x.pairs.map((q) => ({ ...q, frame: x.frame })));
    out.locator.cells[c.cell] = { dpr: c.dpr, kind: c.kind, stops: s.length, stableStops: s.filter(stopStable).length, pairs: pairs.length,
      pairsWithAny: pairs.filter((q) => q.aaAny).length, pairsAa8: pairs.filter((q) => q.aa8).length,
      maxAaAnyShare: pairs.length ? Math.max(...pairs.map((q) => q.aaAny / q.frame)) : null, maxLevel: pairs.length ? Math.max(...pairs.map((q) => q.max)) : null,
      maxBlindShare: s.length ? Math.max(...s.map((x) => x.envBlind / x.frame)) : null, maxEnvShare: s.length ? Math.max(...s.map((x) => x.envPixels / x.frame)) : null,
      unsettled: s.filter((x) => !x.settled).map((x) => x.pos), geoFresh: s.filter((x) => x.geoFresh.length).map((x) => x.pos),
      where: [...new Set(s.flatMap((x) => (x.locator || []).map((t) => t.who?.[0]).filter(Boolean)))].slice(0, 8),
      stable: stable.includes(c.cell) };
  }
  // step 2: the registered R plan and the Simulator stops
  const plan = rPlan(stable);
  out.plan = plan.map((c) => c.cfg);
  // an R file (an RR2 re-run runs a subset with --only) may run only configs of the plan part L gives
  // (rev 1.1 N5b: decided after NO-STABLE-CELL, in the card's table order)
  const mismatch = rFiles.find((f) => !(f.json.plan || []).every((c) => out.plan.includes(c)));
  const flags = { geometry: [], rmNotExact: [], motionOnly: [], outsideF: [], heldExtra: [] };
  const judged = [], unjudged = [];
  const judgeStop = (eng, cfg, pos, mode, rm) => {
    const s = by.get(`${eng}|${cfg}|${pos}|${mode}`);
    if (!s) return { k: `${eng} ${cfg}|${pos}|${mode}`, eng, missing: true };
    if (!stopStable(s)) return { k: `${eng} ${key(s)}`, eng, unstable: true };
    let tier = s.judge.tier;
    if (s.geoArm.length) { tier = 'T3'; flags.geometry.push(`${eng} ${key(s)} ${s.geoArm.join('; ')}`); }
    if (rm && RANK[tier] > 1) { flags.rmNotExact.push(`${eng} ${key(s)} ${tier}`); tier = 'T3'; }
    if (s.judge.beyondOutsideF) flags.outsideF.push(`${eng} ${key(s)} ${s.judge.beyondOutsideF}`);
    const h = heldExtra(s); if (h > HELD_EXTRA_MAX) flags.heldExtra.push(`${eng} ${key(s)} +${h}`);
    return { k: `${eng} ${key(s)}`, eng, cfg, pos, mode, tier, j: s.judge };
  };
  const budgetCut = (cfg) => notRun.some((n) => n.cfg === cfg && /^budget/.test(n.reason));
  const regs = [];
  if (plan.length) for (const c of plan) for (const pos of POSITIONS) for (const mode of c.modes) regs.push({ eng: 'chrome', cfg: c.cfg, pos, mode, rm: !!c.rm, optional: c.role === 'second' && budgetCut(c.cfg) });
  for (const st of Object.values(SIM_GROUPS).flat()) for (const pos of POSITIONS) for (const mode of MODES) regs.push({ eng: 'sim', cfg: st, pos, mode });
  for (const r of regs) {
    if (r.optional) continue;
    const x = judgeStop(r.eng, r.cfg, r.pos, r.mode, r.rm);
    (x.tier ? judged : unjudged).push(x);
  }
  // motion-only: a swipe stop beyond T1 whose rest stop at the same position is within T1; rev 1.1 N5: only when the
  // swipe stop has a pixel above 8 levels and above its envelope (largestShadeAboveEnv > 8; every counted "beyond" pixel
  // is one), so sub-8 sampling noise never trips it; otherwise the swipe stop keeps its own tier
  for (const x of judged) if (x.mode === 'swipe' && RANK[x.tier] >= 2 && motionCounts(x.j)) {
    const rest = judged.find((y) => y.eng === x.eng && y.cfg === x.cfg && y.pos === x.pos && y.mode === 'rest');
    if (rest && RANK[rest.tier] <= 1) { flags.motionOnly.push(`${x.k} ${x.tier}`); x.tier = 'T3'; }
  }
  const sum = (eng) => { const t = { T0: 0, T1: 0, T2: 0, T3: 0 }; let w = 'T0', wx = null;
    for (const x of judged.filter((y) => y.eng === eng)) { t[x.tier]++; if (!wx || RANK[x.tier] > RANK[wx.tier] || (x.tier === wx.tier && x.j.largestShadeAboveEnv > wx.j.largestShadeAboveEnv)) wx = x; w = worse(w, x.tier); }
    return { judged: judged.filter((y) => y.eng === eng).length, unjudged: unjudged.filter((y) => y.eng === eng).map((y) => `${y.k} ${y.missing ? 'missing' : 'unstable'}`),
      tiers: t, worstTier: w, worst: wx && RANK[wx.tier] >= 1 ? { stop: wx.k, tier: wx.tier, largestShade: wx.j.largestShade, largestShadeAboveEnv: wx.j.largestShadeAboveEnv, aboveEnv: wx.j.aboveEnv,
        blindAboveEnv: wx.j.blindAboveEnv, blindMax: wx.j.blindMax, staticOrMoving: wx.mode === 'rest' ? 'static (rest)' : 'moving (swipe end, frozen)',
        beyond: wx.j.beyond, edgeOrFill: wx.j.beyond ? (wx.j.beyondEdge >= wx.j.beyondFill ? 'edge' : 'fill') : 'none (all <= 8 levels)', fillMax: wx.j.fillMax, edgeMax: wx.j.edgeMax,
        shareBeyond: wx.j.shareBeyond, areaCssPx: wx.j.areaCssPx } : null }; };
  out.chrome = sum('chrome'); out.sim = sum('sim'); out.flags = flags;
  // rev 1.1 N7 (descriptive): A/A per stop in run order within each file, to show whether later stops (after earlier
  // stops' R3 in the same load) drift: [stop, envPixels, envBlind, stable]
  out.byIndex = {};
  for (const x of by.values()) if (!x.cfg.startsWith('L-')) (out.byIndex[`${x.file} ${x.cfg}`] ??= []).push([`${x.pos}/${x.mode}`, x.envPixels, x.envBlind, stopStable(x)]);
  const simStable = Object.fromEntries(Object.values(SIM_GROUPS).flat().map((st) => [st, unjudged.filter((y) => y.k.startsWith(`sim ${st}|`)).length === 0]));
  out.sim.statesFullyJudged = simStable;
  const w = worse(out.chrome.worstTier, out.sim.worstTier);
  if (!stable.length) { out.verdict = 'NO-STABLE-CELL'; out.reading = 'no Chrome cell is stable: R3 is not judged; R3 goes to a look proposal with Try-it panels (Simulator numbers descriptive)'; return out; }
  if (mismatch) { out.verdict = 'PLAN-MISMATCH'; out.reading = `${mismatch.name} ran ${JSON.stringify(mismatch.json.plan)}; part L gives ${JSON.stringify(out.plan)}: the lead rules`; return out; }
  if (w === 'T3') { out.verdict = 'R3 T3'; out.reading = 'R3 beyond T2 (or reduced motion not exact, geometry, motion-only) at a judged stop: a look proposal, the lead rules'; return out; }
  if (flags.heldExtra.length) { out.verdict = 'R3 UNDECIDED-HELD'; out.reading = 'R3 woke held page callbacks; the arm shot may not show their effect: the lead rules'; return out; }
  if (unjudged.length) { out.verdict = 'R3 UNDECIDED-UNSTABLE'; out.reading = `${unjudged.length} registered stop(s) not judged (unstable or missing): R3 goes to a look proposal with Try-it panels`; return out; }
  out.verdict = `R3 ${w}`;
  out.reading = w === 'T2' ? `within T2 at every judged stop (Chrome cells ${plan.map((c) => c.cell).filter((v, i, a) => a.indexOf(v) === i).join(', ')}; Simulator ${Object.keys(simStable).join(', ')}); the reader looks at the saved shots`
    : `within the A/A envelope or exact at every judged stop (Chrome cells ${plan.map((c) => c.cell).filter((v, i, a) => a.indexOf(v) === i).join(', ')}; Simulator ${Object.keys(simStable).join(', ')})`;
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/deck-contain/p149';
  const oi = process.argv.indexOf('--out'), outFile = oi > 0 ? process.argv[oi + 1] : 'out/deck-contain/score-p149.json';
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /^(L|R|S\d)b?\.json$/.test(n)).sort().map((n) => ({ name: n, json: JSON.parse(readFileSync(join(dir, n), 'utf8')) })) : [];
  let r;
  try { r = score(files); } catch (e) { console.log(String(e.message || e)); process.exit(2); }
  writeFileSync(outFile, JSON.stringify(r, null, 1));
  console.log('LOCATOR', r.locator.pattern, 'stable', JSON.stringify(r.locator.stableCells));
  for (const [c, v] of Object.entries(r.locator.cells)) console.log(` ${c} stops ${v.stops} stable ${v.stableStops} pairs ${v.pairs} any ${v.pairsWithAny} aa8 ${v.pairsAa8} maxShare ${v.maxAaAnyShare} maxBlind ${v.maxBlindShare} maxLevel ${v.maxLevel} where ${v.where.join(' ')}`);
  if (r.chrome) console.log('chrome R3', JSON.stringify(r.chrome.tiers), 'unjudged', r.chrome.unjudged.length, 'worst', JSON.stringify(r.chrome.worst));
  if (r.sim) console.log('sim R3', JSON.stringify(r.sim.tiers), 'unjudged', r.sim.unjudged.length, 'worst', JSON.stringify(r.sim.worst));
  console.log('VERDICT', r.verdict, r.reading || '');
}

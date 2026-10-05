#!/usr/bin/env node
// P-097 rev 4.1/4.2 scorer (counts and pixels only, no timing). Reads the rep outputs of p097-census.mjs (Chrome counts),
// p097-px.mjs (Chrome shots), p097-sim.mjs (Simulator count / shot / rm), never test outputs (test: true, --b, --arms,
// --settle) and never rep 0 (the smokes); scores Q1, Q2a, G, Q2b′ (smoke-informed), Q3-Q6 in the registered first-miss
// order, and Q2b apart. Rules as registered in fixes/cd-roll-ca/README.md "Ticket P-097" rev 4 / 4.1 / 4.2:
// - selection: per (platform kind, rep, arm) the attempts in time order; the first attempt without a tool fault (fatal,
//   missing output) is the rep's load; one re-run allowed (attempts after the second are ignored and listed). A load's
//   validity per prediction is read from that load only (no picking per prediction).
// - VOID load: served JS/CSS prefix != the snapshot pin (HASHES.txt), started at/after the countdown expiry.
// - VOID platform: tool sha256 prefixes (toolShas) differ between its scored loads (a measurement-code change).
// - per-load value of a count = the median of its 3 rest windows; arm value = the median of its loads' values.
// - A/A spread = max over reps with valid C and C2 of |C - C2|; < 4 pairs: VOID; > 25 % of C's median: A/A-limited.
// - a verdict needs >= 5 valid loads per arm for that prediction on that platform, else VOID.
//   node fixes/cd-roll-ca/p097-score.mjs [--out <file>]      node fixes/cd-roll-ca/p097-score.mjs --selftest
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, NODE, CSS, HASHES, dirOf, png, exact, fiveNum, maskCompare, selftest as libSelftest } from './p097-lib.mjs';

const EXPIRY = Date.parse('2026-11-02T05:00:00Z');
export const ORDER = ['Q1', 'Q2a', 'G', "Q2b'", 'Q3', 'Q4', 'Q5', 'Q6'];
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r3 = (x) => (x === null || x === undefined ? x : +(+x).toFixed(3));

// ---- selection ----
// attempts: [{rep, arm, startedAt, fatal, test, ...}] of one kind. Returns {loads: Map 'rep:arm' -> load, ignored, faults}
export function select(attempts) {
  const by = new Map();
  for (const a of attempts) { if (a.test || !(a.rep >= 1 && a.rep <= 6) || a.arm === 'B') continue; const k = `${a.rep}:${a.arm}`; if (!by.has(k)) by.set(k, []); by.get(k).push(a); }
  const loads = new Map(), ignored = [], faults = [];
  for (const [k, list] of by) {
    list.sort((x, y) => String(x.startedAt).localeCompare(String(y.startedAt)));
    const two = list.slice(0, 2); for (const x of list.slice(2)) ignored.push(`${k} ${x.startedAt}`);
    const ok = two.find((x) => !x.fatal);
    for (const x of two) if (x.fatal) faults.push(`${k} ${x.startedAt}: ${String(x.fatal).slice(0, 120)}`);
    if (ok) loads.set(k, ok);
  }
  return { loads, ignored, faults };
}
export function pinsOk(load, H) {
  const d = dirOf(load.arm), js = String(H[`${d}/${NODE}`] || '').slice(0, 12), css = String(H[`${d}/${CSS}`] || '').slice(0, 12);
  return !!load.served && load.served.js === js && load.served.css === css;
}
// ---- A/A and comparisons ----
// vals: Map arm -> Map rep -> value (null = invalid for this measure)
export function spreadOf(vals) {
  const C = vals.get('C') || new Map(), C2 = vals.get('C2') || new Map(); const d = [];
  for (let k = 1; k <= 6; k++) { const a = C.get(k), b = C2.get(k); if (a !== null && a !== undefined && b !== null && b !== undefined) d.push(Math.abs(a - b)); }
  const cMed = med([...C.values()].filter((x) => x !== null && x !== undefined));
  const spread = d.length ? Math.max(...d) : null;
  return { pairs: d.length, spread, cMed, void: d.length < 4, limited: d.length >= 4 && (cMed === 0 ? spread > 0 : spread > 0.25 * Math.abs(cMed)) };
}
const validN = (m) => [...(m || new Map()).values()].filter((x) => x !== null && x !== undefined);
export function armStats(vals) { const o = {}; for (const arm of ['C', 'V', 'C2']) { const v = validN(vals.get(arm)); o[arm] = { n: v.length, med: r3(med(v)), min: v.length ? r3(Math.min(...v)) : null, max: v.length ? r3(Math.max(...v)) : null, perRep: Object.fromEntries([...(vals.get(arm) || new Map())].map(([k, x]) => [k, r3(x)])) }; } return o; }
const enough = (vals, arms = ['C', 'V', 'C2']) => arms.every((a) => validN(vals.get(a)).length >= 5);
// kinds: 'less' (V < C - spread, with an optional extra V <= frac x C), 'within' (|V - C| <= spread), 'noworse' (V <= C + spread)
export function compare(vals, kind, { frac = null, abs = null } = {}) {
  const st = armStats(vals), sp = spreadOf(vals);
  const res = { stats: st, aa: { pairs: sp.pairs, spread: r3(sp.spread), cMed: r3(sp.cMed) } };
  if (!enough(vals)) return { ...res, status: 'VOID', why: 'fewer than 5 valid loads in an arm' };
  if (sp.void) return { ...res, status: 'VOID', why: 'fewer than 4 valid C/C2 pairs' };
  if (sp.limited) return { ...res, status: 'AA-LIMITED', why: `spread ${r3(sp.spread)} > 25 % of C median ${r3(sp.cMed)}` };
  const V = st.V.med, Cm = sp.cMed, s = sp.spread; let pass;
  if (kind === 'less') pass = V < Cm - s && (frac === null || V <= frac * Cm) && (abs === null || V <= abs);
  else if (kind === 'within') pass = Math.abs(V - Cm) <= s;
  else pass = V <= Cm + s;
  return { ...res, status: pass ? 'pass' : 'MISS' };
}
// Q2b / Q2b′ no-worse: no V load above the highest C or C2 load + 2/s
export function noNewLevel(vals) {
  const st = armStats(vals);
  if (!enough(vals)) return { stats: st, status: 'VOID', why: 'fewer than 5 valid loads in an arm' };
  const top = Math.max(...validN(vals.get('C')), ...validN(vals.get('C2'))), vmax = Math.max(...validN(vals.get('V')));
  return { stats: st, limit: r3(top + 2), vMax: r3(vmax), status: vmax <= top + 2 ? 'pass' : 'MISS' };
}
const worst = (sts) => (sts.includes('MISS') ? 'MISS' : sts.includes('VOID') ? 'VOID' : sts.includes('AA-LIMITED') ? 'AA-LIMITED' : 'pass');

// ---- per-load values ----
const winMed = (ws, f) => (ws && ws.length === 3 ? med(ws.map(f)) : null);
export function chromeCountValues(l) {
  const base = !l.fatal && l.fwMs && l.passScrollInDone && l.rest?.windows?.length === 3;
  const q12 = base && l.mCheck === true;
  return {
    q1: q12 ? winMed(l.rest.windows, (w) => w.countdownRafPer4s) : null,
    q2a: q12 ? winMed(l.rest.windows, (w) => w.page.countdownFrames) : null,
    q2b: q12 ? winMed(l.rest.windows, (w) => w.page.otherFrames) : null,
    q2bp: q12 && l.restRoll?.valid && l.restRoll.windows.length === 3 ? winMed(l.restRoll.windows, (w) => w.otherPrime) : null,
    g: q12 ? winMed(l.rest.windows, (w) => w.page.mainFrames) : null,
    q3running: base && l.passFacts ? l.passFacts.midRunning : null,
    q3raf: base && l.passMidCountdownRaf !== null && l.passMidCountdownRaf !== undefined ? l.passMidCountdownRaf : null,
    q6: base && l.passFacts?.handoff?.met ? l.passFacts.handoff.maxJumpPx : null,
    leak: l.restRoll ? l.restRoll.leak : null, orphan: l.restRoll ? l.restRoll.orphan : null, m: [l.m1, l.m2],
  };
}
export function simCountValues(l) {
  const base = !l.fatal && l.fwMs && l.passScrollInDone && Array.isArray(l.rest) && l.rest.length === 3 && l.rest.every((w) => w.perS);
  return {
    q3running: base && l.passFacts ? l.passFacts.midRunning : null,
    q3raf: base && l.passMid ? l.passMid.countdownRaf : null,
    q4paint: base && l.passMid && l.passMid.paintPerFrame !== null ? l.passMid.paintPerFrame : null,
    layers: base && l.hold?.held && l.layersMid && !l.layersMid.error ? l.layersMid : null,
    q6: base && l.passFacts?.handoff?.met ? l.passFacts.handoff.maxJumpPx : null,
    m: [l.m1, l.m2], restPerS: base ? l.rest.map((w) => w.perS) : null,
  };
}
const mapOf = (loads, f) => { const v = new Map([['C', new Map()], ['V', new Map()], ['C2', new Map()]]); for (const [k, l] of loads) { const [rep, arm] = k.split(':'); v.get(arm)?.set(+rep, f(l)); } return v; };

// Q3 on one platform: 0 running in every valid load (all arms), countdown rAF within C +/- spread
function q3(loads, valuesOf) {
  const run = mapOf(loads, (l) => valuesOf(l).q3running), raf = mapOf(loads, (l) => valuesOf(l).q3raf);
  const runningLoads = [...run].flatMap(([arm, m]) => [...m].filter(([, x]) => x !== null && x > 0).map(([k, x]) => `${arm} rep${k}: ${x}`));
  const gate = !enough(run) ? 'VOID' : runningLoads.length ? 'MISS' : 'pass';
  const r = compare(raf, 'within');
  return { status: worst([gate, r.status]), gate: { status: gate, runningLoads, stats: armStats(run) }, raf: r };
}
// Q4 (Simulator): paint per pass frame V <= C + spread; layers per square position
export function q4(loads) {
  const p = compare(mapOf(loads, (l) => simCountValues(l).q4paint), 'noworse');
  const L = mapOf(loads, (l) => simCountValues(l).layers);
  const rows = [], beyond = []; let differ = 0, pairs = 0, layerMiss = false;
  for (let k = 1; k <= 6; k++) {
    const c = L.get('C').get(k), c2 = L.get('C2').get(k), v = L.get('V').get(k);
    if (c && c2) { pairs++; if (c.n !== c2.n || c.memoryMB !== c2.memoryMB) differ++; }
    if (!(c && c2 && v)) { rows.push({ rep: k, valid: false }); continue; }
    const nMax = Math.max(c.n, c2.n), mbMax = Math.max(c.memoryMB, c2.memoryMB);
    const ok = v.n <= nMax && v.memoryMB <= mbMax; if (!ok) layerMiss = true;
    const key = (x) => `${x[0]}:${x[1]}`, cb = new Set([...c.cells, ...c2.cells].filter((x) => x[2] > 0).map(key));
    const extra = v.cells.filter((x) => x[2] > 0 && !cb.has(key(x))).map((x) => `digit ${x[0]} cell ${x[1]} ${x[2]} B`);
    if (v.n > nMax || extra.length) beyond.push({ rep: k, vLayers: v.n, maxC: nMax, vMB: v.memoryMB, maxCMB: mbMax, extraBackedCells: extra });
    rows.push({ rep: k, valid: true, C: [c.n, c.memoryMB], C2: [c2.n, c2.memoryMB], V: [v.n, v.memoryMB], ok });
  }
  const validRows = rows.filter((r) => r.valid).length;
  const layers = { rows, beyond, aaDifferPairs: differ, aaPairs: pairs,
    status: validRows < 5 || pairs < 4 ? 'VOID' : differ > 2 ? 'AA-LIMITED' : layerMiss ? 'MISS' : 'pass' };
  return { status: worst([p.status, layers.status]), paintPerFrame: p, layers };
}
// Q6 on one platform: V's valid pulls, max jump <= 0.5 CSS px
function q6(loads, valuesOf) {
  const v = [...loads].filter(([k]) => k.endsWith(':V')).map(([k, l]) => [k, valuesOf(l).q6]).filter(([, x]) => x !== null);
  const max = v.length ? Math.max(...v.map(([, x]) => x)) : null;
  return { status: v.length < 5 ? 'VOID' : max <= 0.5 ? 'pass' : 'MISS', validV: v.length, maxJumpPx: r3(max), perLoad: Object.fromEntries(v.map(([k, x]) => [k, r3(x)])) };
}

// ---- pixels ----
const readPng = (f) => png(readFileSync(f));
// Chrome: px loads per (rep, arm, rm). shots {mid, rest}, cards per shot; dir = the px.json's directory
export function q5Chrome(px, pxRm) {
  const out = { rest: [], rm: [], mid: [] };
  const pairShot = (loads, k, arm, name) => { const l = loads.get(`${k}:${arm}`); const s = l && l.shots?.[name]; return s && !s.void && !l.fatal ? { img: readPng(join(l.dir, s.file)), cards: s.cards } : null; };
  for (const [loads, kind] of [[px, 'rest'], [pxRm, 'rm']]) for (let k = 1; k <= 6; k++) {
    const C = pairShot(loads, k, 'C', 'rest'), V = pairShot(loads, k, 'V', 'rest'), C2 = pairShot(loads, k, 'C2', 'rest');
    out[kind].push({ rep: k, VvsC: C && V ? maskCompare(C.img, V.img, C.cards, V.cards, 3) : null, C2vsC: C && C2 ? maskCompare(C.img, C2.img, C.cards, C2.cards, 3) : null });
  }
  for (let k = 1; k <= 6; k++) { const C = pairShot(px, k, 'C', 'mid'), V = pairShot(px, k, 'V', 'mid'), C2 = pairShot(px, k, 'C2', 'mid');
    out.mid.push({ rep: k, five: C && V && C2 ? fiveNum(C.img, V.img, C2.img, 430 * 932 * 9, 3) : null }); }
  const judge = (rows) => {
    const v = rows.filter((r) => r.VvsC), a = rows.filter((r) => r.C2vsC);
    if (v.length < 5 || a.length < 5) return { status: 'VOID', validV: v.length, validAA: a.length };
    const aaOk = a.every((r) => r.C2vsC.outsideMbg === 0 && r.C2vsC.mbgMax <= 1);
    const iii = { vAny: v.filter((r) => r.VvsC.mbgAny).length, aaAny: a.filter((r) => r.C2vsC.mbgAny).length };
    const ok = v.every((r) => r.VvsC.outsideMbg === 0 && r.VvsC.mbgMax <= 1) && iii.vAny <= iii.aaAny + 2;
    return { status: !aaOk ? 'AA-LIMITED' : ok ? 'pass' : 'MISS', iii };
  };
  out.restVerdict = judge(out.rest); out.rmVerdict = judge(out.rm);
  out.status = worst([out.restVerdict.status, out.rmVerdict.status]);
  out.midNote = 'descriptive: Chrome mid-roll is reported with the five numbers only';
  return out;
}
// Simulator: shot loads (mode shot: mid + rest) and rm loads (rest); T0 exact for rest and rm, A/A C2 vs C at 0; mid T2
export function q5Sim(shot, rm) {
  const get = (loads, k, arm, name) => { const l = loads.get(`${k}:${arm}`); const s = l && l.shots?.[name]; return s && !s.void && !l.fatal ? { img: readPng(join(OUT, 'sim', s.file)), cal: l.cal } : null; };
  const out = { rest: [], rm: [], mid: [] };
  for (const [loads, kind] of [[shot, 'rest'], [rm, 'rm']]) for (let k = 1; k <= 6; k++) {
    const C = get(loads, k, 'C', 'rest'), V = get(loads, k, 'V', 'rest'), C2 = get(loads, k, 'C2', 'rest');
    out[kind].push({ rep: k, VvsC: C && V ? exact(C.img, V.img) : null, C2vsC: C && C2 ? exact(C.img, C2.img) : null });
  }
  for (let k = 1; k <= 6; k++) { const C = get(shot, k, 'C', 'mid'), V = get(shot, k, 'V', 'mid'), C2 = get(shot, k, 'C2', 'mid');
    out.mid.push({ rep: k, five: C && V && C2 ? fiveNum(C.img, V.img, C2.img, C.cal.screen[0] * C.cal.screen[1], C.cal.s) : null }); }
  const judge = (rows) => { const v = rows.filter((r) => r.VvsC), a = rows.filter((r) => r.C2vsC);
    if (v.length < 5 || a.length < 5) return { status: 'VOID', validV: v.length, validAA: a.length };
    return { status: !a.every((r) => r.C2vsC.exact) ? 'AA-LIMITED' : v.every((r) => r.VvsC.exact) ? 'pass' : 'MISS' }; };
  out.restVerdict = judge(out.rest); out.rmVerdict = judge(out.rm);
  const m = out.mid.filter((r) => r.five);
  out.midVerdict = { status: m.length < 5 ? 'VOID' : m.every((r) => r.five.t2) ? 'pass' : 'MISS', valid: m.length };
  out.status = worst([out.restVerdict.status, out.rmVerdict.status, out.midVerdict.status]);
  return out;
}

// ---- reading the outputs ----
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return { fatal: 'unreadable ' + f + ': ' + e.message }; } };
function collect() {
  const census = ls(join(OUT, 'census')).filter((f) => /^rep\d+-(C2|C|V|B)-.+\.json$/.test(f)).map((f) => ({ ...readJson(join(OUT, 'census', f)), file: `census/${f}` }));
  const px = [], pxRm = [];
  for (const d of ls(join(OUT, 'px'))) { const f = join(OUT, 'px', d, 'px.json'); if (!existsSync(f)) continue; const j = readJson(f);
    for (const l of j.loads || []) (j.rm ? pxRm : px).push({ ...l, rep: j.rep, test: j.test, startedAt: j.startedAt, tools: j.tools, dir: join(OUT, 'px', d), file: `px/${d}/px.json` }); }
  const sim = { count: [], shot: [], rm: [] };
  for (const f of ls(join(OUT, 'sim'))) { const m = /^rep\d+-(count|shot|rm)-(C2|C|V|B)-.+\.json$/.exec(f); if (m) sim[m[1]].push({ ...readJson(join(OUT, 'sim', f)), file: `sim/${f}` }); }
  return { census, px, pxRm, sim };
}

export function score(data, H) {
  const res = { scorer: 'fixes/cd-roll-ca/p097-score.mjs', at: new Date().toISOString(), voids: [], selection: {}, platforms: {} };
  const sel = {};
  for (const [kind, list] of [['census', data.census], ['px', data.px], ['pxRm', data.pxRm], ['simCount', data.sim.count], ['simShot', data.sim.shot], ['simRm', data.sim.rm]]) {
    const s = select(list);
    for (const [k, l] of [...s.loads]) {
      if (!pinsOk(l, H)) { res.voids.push(`${kind} ${k}: served ${JSON.stringify(l.served)} != pin`); s.loads.delete(k); }
      else if (Date.parse(l.startedAt) >= EXPIRY) { res.voids.push(`${kind} ${k}: after the countdown expiry`); s.loads.delete(k); }
    }
    sel[kind] = s; res.selection[kind] = { loads: [...s.loads].map(([k, l]) => `${k} ${l.file}`), ignored: s.ignored, toolFaults: s.faults };
  }
  // measurement-code constancy per platform
  const toolsVoid = {};
  for (const [plat, kinds] of [['chrome', ['census', 'px', 'pxRm']], ['sim', ['simCount', 'simShot', 'simRm']]]) {
    const set = new Set(kinds.flatMap((k) => [...sel[k].loads.values()].map((l) => JSON.stringify(l.tools || null))));
    toolsVoid[plat] = set.size > 1; if (set.size > 1) res.voids.push(`${plat}: tool sha256 prefixes differ between loads (${set.size} sets): platform VOID`);
    res.platforms[plat] = { toolSets: [...set].map((x) => JSON.parse(x)) };
  }
  const C = sel.census.loads, S = sel.simCount.loads;
  const cv = (f) => mapOf(C, (l) => f(chromeCountValues(l)));
  const q = {};
  q.Q1 = compare(cv((v) => v.q1), 'less', { frac: 0.1 });
  q.Q2a = compare(cv((v) => v.q2a), 'less', { abs: 4 });
  q.G = { ...compare(cv((v) => v.g), 'less'), label: 'smoke-informed (rev 4.2)' };
  q["Q2b'"] = { ...noNewLevel(cv((v) => v.q2bp)), label: 'smoke-informed (rev 4.2)', leaks: Object.fromEntries([...C].map(([k, l]) => [k, chromeCountValues(l).leak])), orphans: Object.fromEntries([...C].map(([k, l]) => [k, chromeCountValues(l).orphan])) };
  q.Q2b = { ...noNewLevel(cv((v) => v.q2b)), note: 'scored apart (rev 4.2), missed at the smoke, p miss 0.95, cause F-277' };
  const q3c = q3(C, chromeCountValues), q3s = q3(S, simCountValues);
  q.Q3 = { status: worst([q3c.status, q3s.status]), chrome: q3c, sim: q3s };
  q.Q4 = q4(S);
  let q5c, q5s; try { q5c = q5Chrome(sel.px.loads, sel.pxRm.loads); } catch (e) { q5c = { status: 'VOID', error: String(e.message || e) }; }
  try { q5s = q5Sim(sel.simShot.loads, sel.simRm.loads); } catch (e) { q5s = { status: 'VOID', error: String(e.message || e) }; }
  q.Q5 = { status: worst([q5c.status, q5s.status]), chrome: q5c, sim: q5s };
  const q6c = q6(C, chromeCountValues), q6s = q6(S, simCountValues);
  q.Q6 = { status: worst([q6c.status, q6s.status]), chrome: q6c, sim: q6s };
  // platform voids
  const chromeQs = ['Q1', 'Q2a', 'G', "Q2b'", 'Q2b'];
  if (toolsVoid.chrome) for (const k of chromeQs) q[k] = { ...q[k], status: 'VOID', why: 'tool change (Chrome)' };
  if (toolsVoid.sim) q.Q4 = { ...q.Q4, status: 'VOID', why: 'tool change (Simulator)' };
  if (toolsVoid.chrome || toolsVoid.sim) for (const k of ['Q3', 'Q5', 'Q6']) q[k] = { ...q[k], status: 'VOID', why: 'tool change' };
  res.questions = q;
  res.descriptive = {
    chromeLoads: Object.fromEntries([...C].map(([k, l]) => { const v = chromeCountValues(l); return [k, { m: v.m, total: r3(v.g), countdown: r3(v.q2a), other: r3(v.q2b), otherPrime: r3(v.q2bp), cdRafPer4s: r3(v.q1), level: v.g === null ? null : v.g >= 45 ? 'high' : 'low',
      styleRecalcPerS: r3(winMed(l.rest?.windows, (w) => w.census.styleRecalc)), paintPerS: r3(winMed(l.rest?.windows, (w) => w.census.paint)), unframed: l.rest?.windows?.map((w) => w.unframed), errors: (l.errors || []).length }]; })),
    simLoads: Object.fromEntries([...S].map(([k, l]) => { const v = simCountValues(l); return [k, { m: v.m, rest: v.restPerS, layers: v.layers && { n: v.layers.n, MB: v.layers.memoryMB, backed: v.layers.backed } }]; })),
    chromeMidFive: q5c.mid,
  };
  const st = ORDER.map((k) => [k, q[k].status]);
  const firstMiss = st.find(([, s]) => s === 'MISS');
  const open = st.filter(([, s]) => s === 'VOID' || s === 'AA-LIMITED');
  res.outcome = firstMiss ? { firstMiss: firstMiss[0], before: st.slice(0, ORDER.indexOf(firstMiss[0])).filter(([, s]) => s !== 'pass') }
    : open.length ? { notScorable: open } : { allPass: true };
  res.outcome.Q2b = q.Q2b.status;
  res.labels = { preSmokeLessWorkClaim: 'Q1', smokeInformed: ['G', "Q2b'"] };
  return res;
}

// ---- self-test (synthetic, no browser, no files) ----
export function selftest() {
  const ok = [...libSelftest().map((x) => 'lib: ' + x)], fail = (m) => { throw new Error('SELFTEST ' + m); };
  const at = (i) => `2026-10-05T10:${String(i).padStart(2, '0')}:00Z`;
  const s = select([{ rep: 1, arm: 'C', startedAt: at(2), fatal: 'x' }, { rep: 1, arm: 'C', startedAt: at(3) }, { rep: 1, arm: 'C', startedAt: at(4) }, { rep: 0, arm: 'V', startedAt: at(1) }, { rep: 2, arm: 'V', startedAt: at(1), test: true }, { rep: 2, arm: 'B', startedAt: at(1) }]);
  if (s.loads.size !== 1 || s.loads.get('1:C').startedAt !== at(3) || s.ignored.length !== 1 || s.faults.length !== 1) fail('select ' + JSON.stringify([...s.loads.keys()]));
  ok.push('selection: first attempt without a tool fault, one re-run, later attempts ignored; test, rep 0 and B never scored');
  const H = { [`C/${NODE}`]: 'aaaaaaaaaaaaZ', [`C/${CSS}`]: 'bbbbbbbbbbbbZ' };
  if (!pinsOk({ arm: 'C2', served: { js: 'aaaaaaaaaaaa', css: 'bbbbbbbbbbbb' } }, H) || pinsOk({ arm: 'C', served: { js: 'aaaaaaaaaaab', css: 'bbbbbbbbbbbb' } }, H)) fail('pins');
  ok.push('pins: C2 is checked against the C directory; one differing prefix voids');
  const V = (c, v, c2) => new Map([['C', new Map(c.map((x, i) => [i + 1, x]))], ['V', new Map(v.map((x, i) => [i + 1, x]))], ['C2', new Map(c2.map((x, i) => [i + 1, x]))]]);
  const q1 = compare(V([120, 130, 125, 140, 128, 132], [4, 5, 4, 4, 5, 4], [122, 126, 131, 138, 129, 135]), 'less', { frac: 0.1 });
  if (q1.status !== 'pass' || q1.aa.spread !== 6 || q1.aa.pairs !== 6) fail('Q1 pass ' + JSON.stringify(q1)); ok.push('less: V < C - spread and V <= 10 % of C; spread = max |C - C2| over the pairs');
  const q1m = compare(V([120, 130, 125, 140, 128, 132], [14, 15, 14, 14, 15, 14], [122, 126, 131, 138, 129, 135]), 'less', { frac: 0.1 });
  if (q1m.status !== 'MISS') fail('Q1 miss'); ok.push('less: V over 10 % of C misses');
  const q2a = compare(V([27, 28, 27, 29, 28, 27], [4.5, 4.5, 4.5, 4.5, 4.5, 4.5], [27, 28, 28, 28, 28, 27]), 'less', { abs: 4 });
  if (q2a.status !== 'MISS') fail('Q2a abs'); ok.push('less with abs: V median over 4/s misses');
  const pv = compare(V([10, null, 10, null, 10, 10], [1, 1, 1, 1, 1, 1], [10, 10, null, 10, 10, 10]), 'less');
  if (pv.status !== 'VOID') fail('pairs void ' + JSON.stringify(pv)); ok.push('fewer than 5 valid loads or 4 valid pairs: VOID');
  const lim = compare(V([28, 28, 28, 60, 28, 28], [8, 8, 8, 8, 8, 8], [28, 60, 28, 28, 28, 28]), 'less');
  if (lim.status !== 'AA-LIMITED') fail('limited ' + JSON.stringify(lim)); ok.push('A/A spread over 25 % of C median: A/A-limited');
  const within = compare(V([10, 11, 10, 12, 10, 11], [13, 12, 13, 12, 13, 12], [11, 10, 11, 11, 10, 12]), 'within');
  if (within.status !== 'MISS') fail('within'); ok.push('within: |V - C| > spread misses');
  const nw = noNewLevel(V([1, 1, 1, 1, 1, 1], [3, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1])), nw2 = noNewLevel(V([1, 1, 1, 1, 1, 1], [3.5, 0, 0, 0, 0, 0], [1, 1, 1.5, 1, 1, 1]));
  if (nw.status !== 'pass' || nw2.status !== 'pass' || noNewLevel(V([1, 1, 1, 1, 1, 1], [3.01, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1])).status !== 'MISS') fail('noNewLevel');
  ok.push('no-worse level: no V load above the highest C or C2 load + 2/s');
  // per-load values: m check gates Q1/Q2/G, leak gates Q2b′ only
  const w = (cd, oth, roll) => ({ countdownRafPer4s: 4, page: { mainFrames: cd + oth, countdownFrames: cd, otherFrames: oth }, census: { styleRecalc: 1, paint: 1 }, unframed: 0, roll });
  const load = { fwMs: true, passScrollInDone: true, mCheck: true, rest: { windows: [w(2, 6), w(2, 5), w(2, 6)] }, restRoll: { valid: true, leak: 0, windows: [{ otherPrime: 0 }, { otherPrime: 0 }, { otherPrime: 1 }] }, passFacts: { midRunning: 0, handoff: { met: true, maxJumpPx: 0.01 } }, passMidCountdownRaf: 3 };
  const v1 = chromeCountValues(load), v2 = chromeCountValues({ ...load, mCheck: false }), v3 = chromeCountValues({ ...load, restRoll: { ...load.restRoll, valid: false, leak: 1 } });
  if (v1.q2b !== 6 || v1.q2bp !== 0 || v1.g !== 8 || v2.q1 !== null || v2.g !== null || v2.q3raf !== 3 || v3.q2bp !== null || v3.q2a !== 2) fail('values ' + JSON.stringify([v1, v2, v3]));
  ok.push('per-load: median of 3 windows; the m check gates Q1/Q2/G only; a leak voids Q2b′ only');
  // Q4 layers: V beyond max(C, C2) named; C/C2 differing in > 2 pairs: A/A-limited
  const Ls = (n, mb, cells) => ({ fwMs: true, passScrollInDone: true, rest: [{ perS: {} }, { perS: {} }, { perS: {} }], hold: { held: true }, layersMid: { n, memoryMB: mb, backed: cells.length, cells }, passMid: { paintPerFrame: 1 }, passFacts: { midRunning: 0 } });
  const mk = (vf, c2f) => new Map([1, 2, 3, 4, 5, 6].flatMap((k) => [[`${k}:C`, Ls(4, 1, [[0, 1, 100]])], [`${k}:C2`, c2f(k)], [`${k}:V`, vf(k)]]));
  const a4 = q4(mk(() => Ls(4, 1, [[0, 1, 100]]), () => Ls(4, 1, [[0, 1, 100]])));
  const b4 = q4(mk((k) => (k === 3 ? Ls(5, 1.2, [[0, 1, 100], [2, 5, 50]]) : Ls(4, 1, [[0, 1, 100]])), () => Ls(4, 1, [[0, 1, 100]])));
  const c4 = q4(mk(() => Ls(4, 1, [[0, 1, 100]]), (k) => (k <= 3 ? Ls(5, 1, [[0, 1, 100]]) : Ls(4, 1, [[0, 1, 100]]))));
  if (a4.status !== 'pass' || b4.layers.status !== 'MISS' || b4.layers.beyond[0].extraBackedCells[0] !== 'digit 2 cell 5 50 B' || c4.layers.status !== 'AA-LIMITED') fail('Q4 ' + JSON.stringify([a4.layers.status, b4.layers, c4.layers.status]));
  ok.push('Q4 layers: V <= max(C, C2) per position, extra backed cells named; C/C2 differing in > 2 pairs: A/A-limited');
  return ok;
}

if (process.argv.includes('--selftest')) { const r = selftest(); for (const x of r) console.log('ok', x); console.log(`SELFTEST PASS ${r.length}`); process.exit(0); }
// --b-smoke: the readers on the B smoke outputs only (test files of arm B; never scored): which per-load values come
// out set or null, and whether the shot PNGs read back. Mechanics only, prints no counts.
if (process.argv.includes('--b-smoke')) {
  const d = collect(), B = (l) => l.arm === 'B';
  const shape = (o) => Object.entries(o).map(([k, v]) => `${k}:${v === null || v === undefined ? 'null' : 'set'}`).join(' ');
  for (const l of d.census.filter(B)) console.log('census', l.file, l.fatal ? 'FATAL ' + String(l.fatal).slice(0, 80) : shape(chromeCountValues(l)));
  for (const l of d.sim.count.filter(B)) console.log('simCount', l.file, l.fatal ? 'FATAL ' + String(l.fatal).slice(0, 80) : shape(simCountValues(l)));
  for (const [kind, list, dir] of [['px', d.px], ['pxRm', d.pxRm], ['simShot', d.sim.shot], ['simRm', d.sim.rm]]) for (const l of list.filter(B)) {
    const shots = Object.entries(l.shots || {}).map(([n, s]) => { try { const img = readPng(join(l.dir || join(OUT, 'sim'), s.file)); return `${n}:png ${img.w}x${img.h} void ${s.void}${s.cards ? ' cards ' + s.cards.length : ''}`; } catch (e) { return `${n}:UNREADABLE ${e.message}`; } });
    console.log(kind, l.file, l.fatal ? 'FATAL ' + String(l.fatal).slice(0, 80) : shots.join(' ; ') || 'no shots');
  }
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = score(collect(), HASHES());
  const outF = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : join(OUT, `score-${res.at.replace(/[:.]/g, '-')}.json`); })();
  writeFileSync(outF, JSON.stringify(res, null, 1));
  for (const k of [...ORDER, 'Q2b']) { const x = res.questions[k]; console.log(`${k.padEnd(4)} ${x.status}${x.label ? ' [' + x.label + ']' : ''}${x.why ? ' (' + x.why + ')' : ''}${x.stats ? ' V ' + x.stats.V.med + ' C ' + x.stats.C.med + ' C2 ' + x.stats.C2.med : ''}${x.aa ? ' spread ' + x.aa.spread + ' pairs ' + x.aa.pairs : ''}`); }
  console.log('outcome', JSON.stringify(res.outcome)); if (res.voids.length) console.log('voids', res.voids.join(' | '));
  console.log('wrote', outF);
}

// P-096 reader (fix-nav-morph): applies the frozen rules of fixes/nav-morph/README.md "Draft ticket P-096" to the files
// crossing-chrome.mjs and crossing-sim.mjs saved. Data only, drives nothing.
//   node fixes/nav-morph/crossing-read.mjs [--dir out/nav-morph/p096] [--reps 1,2,3] [--dry] [--out <file.json>]
// --dry reads the *-dry-* files and prints only mechanics (crossing found, census, invalidation events with stacks).
//
// Chrome (renderer main thread = the thread with the most UpdateLayoutTree events):
//   frames j = [BeginMainThreadFrame_j, BeginMainThreadFrame_j+1); k0 = the frame holding the FunctionCall at the arm's IO
//   callback (url nodes/2.DyWL8TcE.js, lineNumber cb or cb-1, columnNumber col or col-1: the trace's base is reported);
//   R(j) = sum of UpdateLayoutTree elementCount; L(j) = sum of Layout beginData.dirtyObjects; window k0..k0+2; band k0-10..k0-3.
//   Style invalidation events: names ending InvalidationTracking that start with Style or ScheduleStyle. A stack frame
//   counts for H2 when its url is nodes/2.DyWL8TcE.js and its line, converted to 1-based with the base found for
//   FunctionCall, is in 13517-13519 or 13576-13588 (V file 65052c4a3902); H2 is also computed with the other base, and a
//   verdict that differs is reported as base-sensitive.
//   Page ms -> trace us: traceUs = sync.traceUs + (pageMs - sync.pageMs) * 1000.
// Simulator: page ms of a record = (startTime - syncTL) * 1000 + syncT; frames j = [t_j, t_j+1) of the scroll's rAF
//   stamps; k0 = the frame holding the IntersectionObserver ObserverCallback's FunctionCall at scriptLine:scriptColumn = cb;
//   RecalculateStyles / Layout / Paint records counted at every depth by start time (descriptive).
// Validity, rules H1 / H2 / M and the decision: as frozen in the ticket.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIR = arg('--dir', join(WT, 'out/nav-morph/p096'));
const DRY = argv.includes('--dry');
const REPS = DRY ? ['dry'] : arg('--reps', '1,2,3').split(',').map((r) => `r${r}`);
const ARMS = ['C', 'V', 'C2'];
const NODE_RE = /nodes\/2\.DyWL8TcE\.js$/;
const RANGES = [[13517, 13519], [13576, 13588]];
const med = (a) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const dataOf = (e) => e.args?.data ?? e.args?.beginData ?? {};

function chromeLoad(J) {
  const out = { arm: J.meta.arm, void: J.void || J.error || null };
  if (out.void) return out;
  const ev = J.events;
  const cnt = new Map(); for (const e of ev) if (e.name === 'UpdateLayoutTree') { const k = `${e.pid}:${e.tid}`; cnt.set(k, (cnt.get(k) || 0) + 1); }
  const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) { out.void = 'no UpdateLayoutTree events'; return out; }
  const M = ev.filter((e) => `${e.pid}:${e.tid}` === main);
  const B = M.filter((e) => e.name === 'BeginMainThreadFrame').map((e) => e.ts).sort((a, b) => a - b);
  const [cbL, cbC] = J.meta.cb;
  const calls = M.filter((e) => e.name === 'FunctionCall' && (e.ph === 'X' || e.ph === 'B') && NODE_RE.test(dataOf(e).url || '') && [cbL, cbL - 1].includes(dataOf(e).lineNumber) && [cbC, cbC - 1].includes(dataOf(e).columnNumber));
  out.base = calls.length ? (calls[0].args.data.lineNumber === cbL ? 1 : 0) : null;
  out.crossings = calls.length;
  if (calls.length !== 1) { out.void = `crossing found ${calls.length} times`; return out; }
  const fi = (ts) => { let lo = -1; for (let j = 0; j < B.length; j++) if (B[j] <= ts) lo = j; else break; return lo; };
  const k0 = fi(calls[0].ts);
  out.k0 = k0; out.frames = B.length;
  if (k0 < 10 || k0 + 3 > B.length - 1) { out.void = `crossing frame ${k0} lacks the band or 3 frames after (frames ${B.length})`; return out; }
  const pageToUs = (ms) => J.sync.traceUs + (ms - J.sync.pageMs) * 1000;
  // panel rules
  if (J.meta.arm === 'V' && !J.panelAtStart) { out.void = 'V panel not mounted before the scroll'; return out; }
  if (J.meta.arm !== 'V' && J.census.panelFirst != null && J.sync.traceUs != null && pageToUs(J.census.panelFirst) < B[k0]) { out.void = 'C panel in the DOM before k0'; return out; }
  const per = new Map(); for (let j = k0 - 10; j <= k0 + 8; j++) per.set(j, { R: 0, ult: 0, L: 0, layouts: 0, styleInv: 0, layoutInv: 0, muts: {} });
  for (const e of M) {
    if (!(e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n')) continue;
    const j = fi(e.ts); const p = per.get(j); if (!p) continue;
    if (e.name === 'UpdateLayoutTree') { p.ult++; p.R += Number(e.args?.elementCount ?? e.args?.endData?.elementCount ?? e.args?.data?.elementCount ?? 0) || 0; }
    if (e.name === 'Layout') { p.layouts++; p.L += Number(e.args?.beginData?.dirtyObjects ?? 0) || 0; }
    if (/^(Style|ScheduleStyle)\w*InvalidationTracking$/.test(e.name)) p.styleInv++;
    if (/^Layout\w*InvalidationTracking$/.test(e.name)) p.layoutInv++;
  }
  // endData-only UpdateLayoutTree (B/E pairs): add E's elementCount when B had none
  for (const e of M) if (e.name === 'UpdateLayoutTree' && e.ph === 'E' && e.args?.elementCount != null) { const p = per.get(fi(e.ts)); if (p) p.R += Number(e.args.elementCount) || 0; }
  if (J.sync.traceUs != null) for (const m of J.census.muts) { const p = per.get(fi(pageToUs(m[0]))); if (p) { const key = `${m[1]}:${m[2] || ''}${m[4] ? ' (panel)' : ''}`; p.muts[key] = (p.muts[key] || 0) + 1; } }
  const win = [k0, k0 + 1, k0 + 2], band = []; for (let j = k0 - 10; j <= k0 - 3; j++) band.push(j);
  out.windowR = win.reduce((s, j) => s + per.get(j).R, 0);
  out.windowL = win.reduce((s, j) => s + per.get(j).L, 0);
  out.bandMedianR = med(band.map((j) => per.get(j).R));
  out.perFrame = Object.fromEntries([...per.entries()].map(([j, p]) => [j - k0, p]));
  // H2 share, both bases
  const winLo = B[k0], winHi = B[k0 + 3];
  const sinv = M.filter((e) => /^(Style|ScheduleStyle)\w*InvalidationTracking$/.test(e.name) && e.ts >= winLo && e.ts < winHi);
  const stackOf = (e) => e.args?.data?.stackTrace || e.args?.data?.stack_trace || e.args?.data?.stack || null;
  const hit = (e, base) => (stackOf(e) || []).some((f) => NODE_RE.test(f.url || '') && RANGES.some(([a, b]) => { const l = Number(f.lineNumber) + (base === 0 ? 1 : 0); return l >= a && l <= b; }));
  const withStack = sinv.filter((e) => (stackOf(e) || []).length);
  out.styleInvWindow = sinv.length; out.styleInvWithStack = withStack.length;
  const share = (base) => (sinv.length ? sinv.filter((e) => hit(e, base)).length / sinv.length : null);
  out.h2Share = { base0: share(0), base1: share(1) };
  out.h2ShareAtBase = out.base == null ? null : share(out.base);
  // top stack sources in the window (descriptive)
  const src = {}; for (const e of sinv) { const fr = (stackOf(e) || []).find((f) => NODE_RE.test(f.url || '')) || (stackOf(e) || [])[0]; const k = fr ? `${(fr.url || '').split('/').pop()}:${fr.lineNumber}` : '(no stack)'; src[k] = (src[k] || 0) + 1; }
  out.styleInvSources = Object.fromEntries(Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 12));
  return out;
}

function simLoad(J) {
  const out = { arm: J.meta.arm, void: J.void || J.error || null };
  if (out.void) return out;
  if (J.sync?.syncTL == null) { out.void = 'no Timeline sync'; return out; }
  const pt = (s) => (s - J.sync.syncTL) * 1000 + J.sync.syncT;
  const T = J.scroll.ts.map((x) => x[0]);
  const [cbL, cbC] = J.meta.cb;
  const ios = []; const all = [];
  const walk = (r, inIO) => { all.push(r); const isIO = r.type === 'ObserverCallback' && r.data?.type === 'IntersectionObserver';
    if (inIO && r.type === 'FunctionCall' && NODE_RE.test(r.data?.scriptName || '') && r.data?.scriptLine === cbL && r.data?.scriptColumn === cbC) ios.push(pt(r.startTime));
    for (const c of r.children || []) walk(c, inIO || isIO); };
  for (const r of J.recs) walk(r, false);
  out.crossings = ios.length;
  if (ios.length !== 1) { out.void = `crossing found ${ios.length} times`; return out; }
  const fi = (t) => { let lo = -1; for (let j = 0; j < T.length; j++) if (T[j] <= t) lo = j; else break; return lo; };
  const k0 = fi(ios[0]); out.k0 = k0; out.frames = T.length;
  if (k0 < 10 || k0 + 3 > T.length - 1) { out.void = `crossing frame ${k0} lacks the band or 3 frames after (frames ${T.length})`; return out; }
  if (J.meta.arm === 'V' && !J.panelAtStart) { out.void = 'V panel not mounted before the scroll'; return out; }
  if (J.meta.arm !== 'V' && J.census.panelFirst != null && J.census.panelFirst < T[k0]) { out.void = 'C panel in the DOM before k0'; return out; }
  const per = new Map(); for (let j = k0 - 10; j <= k0 + 8; j++) per.set(j, { style: 0, layout: 0, paint: 0, muts: {} });
  for (const r of all) { if (r.startTime == null) continue; const p = per.get(fi(pt(r.startTime))); if (!p) continue;
    if (r.type === 'RecalculateStyles') p.style++; if (r.type === 'Layout') p.layout++; if (r.type === 'Paint') p.paint++; }
  for (const m of J.census.muts) { const p = per.get(fi(m[0])); if (p) { const key = `${m[1]}:${m[2] || ''}${m[4] ? ' (panel)' : ''}`; p.muts[key] = (p.muts[key] || 0) + 1; } }
  out.perFrame = Object.fromEntries([...per.entries()].map(([j, p]) => [j - k0, p]));
  const inM = J.census.muts.filter((m) => { const j = fi(m[0]); return j === k0 || j === k0 + 1; });
  out.mInert = inM.some((m) => m[1] === 'attributes' && m[2] === 'inert' && /start-selling-morph-panel/.test(m[3] || ''));
  out.mSrc = inM.filter((m) => m[1] === 'attributes' && m[2] === 'src' && m[4] === 1 && /^img/.test(m[3] || '')).length;
  out.M = out.mInert && out.mSrc >= 1;
  out.inertSubtree = J.census.muts.find((m) => m[2] === 'inert')?.[7] ?? null;
  return out;
}

const res = { ticket: 'P-096', tool: 'crossing-read.mjs', dry: DRY, reps: REPS, chrome: {}, sim: {} };
for (const rep of REPS) {
  res.chrome[rep] = {}; res.sim[rep] = {};
  for (const arm of ARMS) {
    const c = load(join(DIR, `chrome-${rep}-${arm}.json`)); if (c) res.chrome[rep][arm] = chromeLoad(c);
    const s = load(join(DIR, `sim-${rep}-${arm}.json`)); if (s) res.sim[rep][arm] = simLoad(s);
  }
  const C = res.chrome[rep].C, C2 = res.chrome[rep].C2;
  if (!DRY) res.chrome[rep].aa = C && C2 && !C.void && !C2.void ? (() => { const d = Math.abs(C.windowR - C2.windowR), tol = Math.max(0.1 * Math.max(C.windowR, C2.windowR), 50); return { d, tol, ok: d <= tol }; })() : { ok: false, why: 'C or C2 void or missing' };
}
if (DRY) {
  for (const rep of REPS) for (const eng of ['chrome', 'sim']) for (const [arm, o] of Object.entries(res[eng][rep] || {})) if (o && o.arm)
    console.log(`DRY ${eng} ${arm}: void ${o.void} crossings ${o.crossings} k0 ${o.k0} frames ${o.frames}` + (eng === 'chrome' ? ` base ${o.base} styleInv(window) ${o.styleInvWindow} withStack ${o.styleInvWithStack}` : ` M ${o.M} (inert ${o.mInert}, src ${o.mSrc})`));
} else {
  const validChromeRep = (rep) => res.chrome[rep]?.aa?.ok;
  const cV = REPS.filter((r) => validChromeRep(r) && res.chrome[r].V && !res.chrome[r].V.void).map((r) => res.chrome[r].V);
  const sV = REPS.map((r) => res.sim[r]?.V).filter((o) => o && !o.void);
  const chromeEngine = cV.length >= 2 ? 'ok' : 'VOID', simEngine = sV.length >= 2 ? 'ok' : 'VOID';
  const winR = med(cV.map((o) => o.windowR)), bandR = med(cV.map((o) => o.bandMedianR));
  const h1 = chromeEngine === 'ok' ? winR >= Math.max(9 * bandR, 100) : null;
  const stacks = cV.reduce((s, o) => s + o.styleInvWithStack, 0);
  const h2At = (k) => med(cV.map((o) => o.h2Share[k]));
  const h2base = med(cV.map((o) => o.base));
  const h2share = chromeEngine === 'ok' && stacks > 0 ? med(cV.map((o) => o.h2ShareAtBase)) : null;
  const h2sens = stacks > 0 && ((h2At('base0') >= 0.5) !== (h2At('base1') >= 0.5));
  // ops (P-096 freeze): a base-sensitive H2 is scored UNRESOLVED
  const h2 = h2share == null || h2sens ? 'UNRESOLVED' : h2share >= 0.5;
  const M = simEngine === 'ok' ? sV.filter((o) => o.M).length > sV.length / 2 : null;
  let decision;
  if (chromeEngine !== 'ok' || M !== true) decision = 'UNRESOLVED';
  else if (h1 === false || h2 === false) decision = 'STYLE fails';
  else if (h2 === 'UNRESOLVED') decision = 'UNRESOLVED';
  else decision = 'STYLE holds';
  res.rules = { chromeEngine, simEngine, validChromeV: cV.length, validSimV: sV.length, windowR: winR, bandMedianR: bandR, h1Threshold: bandR == null ? null : Math.max(9 * bandR, 100), H1: h1,
    H2share: h2share, H2: h2, H2base: h2base, H2shareBase0: h2At('base0'), H2shareBase1: h2At('base1'), H2baseSensitive: h2sens, M, decision };
  console.log(`P096 chrome ${chromeEngine} (valid V reps ${cV.length}); sim ${simEngine} (valid V reps ${sV.length})`);
  for (const rep of REPS) console.log(`  ${rep} A/A ${JSON.stringify(res.chrome[rep].aa)}; ` + ARMS.map((a) => { const o = res.chrome[rep][a]; return o ? `${a} ${o.void ? 'VOID ' + o.void : `R ${o.windowR} L ${o.windowL} band ${o.bandMedianR} h2 ${o.h2ShareAtBase == null ? '-' : o.h2ShareAtBase.toFixed(2)}`}` : `${a} missing`; }).join('; '));
  for (const rep of REPS) console.log(`  ${rep} sim ` + ARMS.map((a) => { const o = res.sim[rep][a]; return o ? `${a} ${o.void ? 'VOID ' + o.void : `M ${o.M} (inert ${o.mInert}, src ${o.mSrc})`}` : `${a} missing`; }).join('; '));
  console.log(`H1 ${h1} (window R ${winR} vs max(9 x ${bandR}, 100)); H2 ${h2} (share ${h2share}, base ${h2base}${h2sens ? ', BASE-SENSITIVE' : ''}); M ${M}`);
  console.log(`decision: ${decision}`);
}
const out = arg('--out', join(DIR, DRY ? 'read-dry.json' : 'read.json'));
writeFileSync(out, JSON.stringify(res, null, 1)); console.log('wrote', out.replace(WT + '/', ''));

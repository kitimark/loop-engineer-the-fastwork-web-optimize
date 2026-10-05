#!/usr/bin/env node
// toolbar-resize P-128 reader (frozen before data): which JS functions make the DOM calls of P-126's dom-call bucket in
// the in-view toolbar-step frames? Reads the count-only census of p128-inject.mjs (no Timeline, no timestamps).
//   node fixes/toolbar-resize/p128-read.mjs <folder> <run> ... [--json out.json]   (<run> = C-H<n>; folder out/toolbar-resize/sim128)
// GATE (per run, else the run is not read): g-<run>.json holds an inject value (the segment with the most frames);
//   installs >= 1; all four deciding wrappers installed (setAttribute, toggle, setProperty, gBCR); the showcase IO
//   installed; >= 100 frames; the run's innerHeight range hi - lo >= 30 px (a toolbar step happened); >= 1 call with a
//   page stack line (sim-p128 formatOk); runs.jsonl's served record: JS 3e3e94cb6e9f and CSS f836404b3728, both from
//   the overlay. < 3 valid runs: INSUFFICIENT.
// FRAMES: fr[k] = [ih, y, view] (k = rAF order). lo / hi = the run's min / max ih. moving = lo < ih < hi.
//   STEP = moving, y < 3250, view 1 (P-125's in-view step frame without its Layout test: no duration is read here;
//   P-126 ops R2: every in-view mid-step frame was heavy in all 9 P-125 runs). CONTROL = not moving, y < 3250, view 1;
//   when the pooled set has < 20, every not-moving frame with y < 3250 (flagged "wide").
//   A call with frame index k belongs to frame k (calls with k >= fr.length are dropped). A frame CARRIES a feature when
//   the feature has a call in the frame or the previous frame (as P-125 rule 5).
// CALLER KEY (per call, from its stack lines "fn@url:line:col", innermost first):
//   the innermost line in "/_app/immutable/nodes/" (the route's component code); in 2.DyWL8TcE.js its line maps to
//   read-inval126.mjs's REGIONS (fwWC 2738-2748, sceneCE 2793-2805, sceneB 2925-2955, sceneC 14205-14220; padded by 1
//   as P-126), else `<file>:<fn>@<line>`; no nodes line: the innermost "/_app/immutable/" line, `<file>:<fn>@<line>`;
//   none: the first line with another url (not "[native code]", not p128-inject.js) as `ext:<file>:<fn>@<line>`; else
//   `probe` (frames without a url: injected code such as the gesture recorder) or `native` (no line, or only native).
//   HELPER = the innermost "/_app/immutable/" line, ENTRY = the outermost one (both descriptive).
// FEATURES per frame (counts):
//   deciding:    `setAttribute:<caller>`, `toggle:<caller>`, `setProperty:<caller>` (CHANGED calls only) and
//                `gBCR:<caller>` (every call; a read)
//   descriptive: the cousins `<api>:<caller>` (removeAttribute, toggleAttribute, add, remove, replace, removeProperty;
//                changed only) and `same:<api>:<caller>` (unchanged writes, any api)
// CALLS (C runs pooled): per feature, presence = coincidence() and rate = rateRule() (both imported unchanged from
//   score-p125.mjs c52de0edd5d3, as P-126 rules 5 and 5b): presence THIN when H < 5, COVERS when Hw >= max(5, 2 x runs),
//   hLo >= 2 x base and h >= 0.8, LINKED-PART when Hw >= floor and hLo >= 2 x base, else NO-LINK (base = share of
//   CONTROL frames carrying); rate s = calls in STEP frames, Fs = STEP frames, r / Fr the same over CONTROL, RATE-LINKED
//   when s >= max(8, 4 x runs) and RRlo >= 2.
//   C1 (rev 2, ops pre-data read): rate counts calls, and DOM calls cluster (one loop of 20+ calls in one STEP frame
//   would pass). A RATE-LINKED feature links only when its STEP calls fall in >= max(5, 2 x runs) distinct STEP frames
//   (own interval) and in >= 3 valid runs; otherwise it reads RATE-CLUSTERED (descriptive, never links).
//   LINKED = COVERS, LINKED-PART, or RATE-LINKED with that spread.
// READING (frozen; a deciding feature "counts" when its caller is not probe or native):
//   NAMED(<features>)  some counting deciding feature whose caller is not fwWC is LINKED
//   FWWC-ONLY          no such feature, and a deciding feature with caller fwWC is LINKED (P-125's wc1 removed fwWC's
//                      toggles without effect, so fwWC cannot name the trigger)
//   NONE-LINKED        no counting deciding feature is LINKED
//   THIN               < 5 STEP frames pooled;  INSUFFICIENT  < 3 valid runs
// DESCRIPTIVE (no call uses them): B1 the bucket check (per deciding api, all callers pooled, changed only for writes:
//   rateRule STEP vs CONTROL); pageShare (deciding-api calls in STEP frames with a "/_app/immutable/" line); per LINKED
//   feature its names (attribute / property / token), ENTRY and HELPER keys, and per-run s, r, RR (ops N2: records
//   cluster, so the pooled bound is optimistic); the cousins and unchanged writes, LINKED or not.
//   N1 (rev 2, ops): per LINKED feature, calls per frame in STEP frames, in CONTROL frames whose y moved since the
//   previous frame (scrolling at a settled toolbar) and in CONTROL frames whose y did not (still): STEP frames are the
//   flick's earliest and fastest frames, so a scroll-driven caller can link too; this tells an arm card which.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { coincidence, rateRule } from './score-p125.mjs';
import { REGIONS } from './read-inval126.mjs';
import { injectValue, runGateWhy, DECIDE_APIS } from './sim-p128.mjs';

export { DECIDE_APIS };
export const COUSINS = ['removeAttribute', 'toggleAttribute', 'add', 'remove', 'replace', 'removeProperty'];
const GATE = { js: '3e3e94cb6e9f', css: 'f836404b3728' };
const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);

export function parseLine(l) {
  const a = l.lastIndexOf('@'), fn = a < 0 ? '' : l.slice(0, a), rest = a < 0 ? l : l.slice(a + 1);
  const m = rest.match(/^(.*?):(\d+):(\d+)$/);
  return m ? { fn, url: m[1], line: Number(m[2]), col: Number(m[3]) } : { fn, url: rest, line: null, col: null };
}
const file = (u) => u.split('/').pop();
const pageKey = (p) => `${file(p.url)}:${p.fn || '?'}@${p.line}`;
export function callerKey(stack) {
  const ps = (stack || []).map(parseLine);
  const node = ps.find((p) => p.url.includes('/_app/immutable/nodes/') && p.line != null);
  if (node) {
    if (node.url.includes('2.DyWL8TcE.js')) for (const [k, a, b] of REGIONS) if (node.line >= a - 1 && node.line <= b + 1) return k;
    return pageKey(node);
  }
  const page = ps.find((p) => p.url.includes('/_app/immutable/') && p.line != null);
  if (page) return pageKey(page);
  const ext = ps.find((p) => p.url && p.url !== '[native code]' && !p.url.includes('p128-inject.js') && p.line != null);
  if (ext) return `ext:${pageKey(ext)}`;
  return ps.some((p) => p.url !== '[native code]') ? 'probe' : 'native';
}
export const helperKey = (stack) => { const p = (stack || []).map(parseLine).find((x) => x.url.includes('/_app/immutable/') && x.line != null); return p ? pageKey(p) : null; };
export const entryKey = (stack) => { const p = (stack || []).map(parseLine).filter((x) => x.url.includes('/_app/immutable/') && x.line != null).pop(); return p ? pageKey(p) : null; };
export const counts = (caller) => caller !== 'probe' && caller !== 'native';
export function features(c) {
  const k = callerKey(c.stack);
  if (c.api === 'gBCR') return [`gBCR:${k}`];
  if (c.changed === 1) return [`${c.api}:${k}`];
  return [`same:${c.api}:${k}`];
}
export const isDeciding = (f) => DECIDE_APIS.includes(f.split(':')[0]);
export const callerOf = (f) => f.split(':').slice(1).join(':');

export function servedOk(dir) {
  const f = join(dir, 'runs.jsonl'); if (!existsSync(f)) return false;
  const rec = readFileSync(f, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o?.served);
  const s = rec?.served; return !!s && s.js?.h === GATE.js && s.css?.h === GATE.css && s.js?.source === 'overlay' && s.css?.source === 'overlay';
}

export function loadRun(dir, name, { served = servedOk(dir) } = {}) {
  const F = join(dir, `g-${name}.json`);
  const v = existsSync(F) ? injectValue(JSON.parse(readFileSync(F, 'utf8'))) : null;
  const why = runGateWhy(v); // the same run gate sim-p128 applies after run 1 (ops N2)
  const fr = v?.fr || [], ihs = fr.map((x) => x[0]), lo = ihs.length ? Math.min(...ihs) : null, hi = ihs.length ? Math.max(...ihs) : null;
  if (!served) why.push('served bytes record missing or wrong');
  const frames = fr.map(([ih, y, view]) => ({ ih, y, view, moving: ih > lo && ih < hi, cnt: new Map() }));
  const meta = new Map();
  for (const c of v?.calls || []) {
    for (const f of features(c)) {
      if (!meta.has(f)) meta.set(f, { names: new Map(), entry: new Map(), helper: new Map(), page: 0, all: 0 });
      const m = meta.get(f);
      const page = (c.stack || []).some((l) => l.includes('/_app/immutable/'));
      for (const k of c.f) {
        if (k < 0 || k >= frames.length) continue;
        const q = frames[k]; q.cnt.set(f, (q.cnt.get(f) || 0) + 1);
        q.pageCalls = (q.pageCalls || 0) + (isDeciding(f) && page ? 1 : 0);
        q.decCalls = (q.decCalls || 0) + (isDeciding(f) ? 1 : 0);
        const STEPish = q.moving && q.y < 3250 && q.view === 1;
        if (STEPish) { const inc = (mp, key) => mp.set(key, (mp.get(key) || 0) + 1); inc(m.names, c.name); inc(m.entry, entryKey(c.stack)); inc(m.helper, helperKey(c.stack)); }
      }
    }
  }
  frames.forEach((q, i) => {
    q.carry = new Set([...q.cnt.keys(), ...(i ? frames[i - 1].cnt.keys() : [])]);
    q.step = q.moving && q.y < 3250 && q.view === 1;
    q.ctrl = !q.moving && q.y < 3250 && q.view === 1;
    q.ctrlWide = !q.moving && q.y < 3250;
    q.yMoved = i > 0 && q.y !== frames[i - 1].y;
  });
  return { name, valid: why.length === 0, why, frames, lo, hi, meta };
}

const presence = (c) => !!c && (c.call === 'COVERS' || c.call === 'LINKED-PART');
const linked = (c) => presence(c) || (!!c?.rate?.linked && !!c?.spread?.ok);
const top = (mp, n = 3) => [...(mp || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

export function readSet(all) {
  const runs = all.filter((R) => R.valid), k = runs.length;
  const S = [], ctrl = [], wideC = [];
  for (const R of runs) for (const q of R.frames) { if (q.step) S.push(q); if (q.ctrl) ctrl.push(q); if (q.ctrlWide) wideC.push(q); }
  const wide = ctrl.length < 20, C = wide ? wideC : ctrl;
  const sum = (arr, f) => arr.reduce((m, q) => m + (q.cnt.get(f) || 0), 0);
  const keys = new Set(); for (const q of [...S, ...C]) for (const f of q.cnt.keys()) keys.add(f);
  const feats = {};
  for (const f of [...keys].sort()) {
    const Hw = S.filter((q) => q.carry.has(f)).length, base = C.length ? C.filter((q) => q.carry.has(f)).length / C.length : 0;
    feats[f] = coincidence(S.length, Hw, base, k);
    feats[f].rate = rateRule(sum(S, f), S.length, sum(C, f), C.length, k);
    const frames = S.filter((q) => q.cnt.get(f)).length, runsWith = runs.filter((R) => R.frames.some((q) => q.step && q.cnt.get(f))).length;
    const need = Math.max(5, 2 * k);
    feats[f].spread = { frames, runs: runsWith, need, ok: frames >= need && runsWith >= 3 };
    feats[f].rateClustered = feats[f].rate.linked && !feats[f].spread.ok;
    feats[f].linked = linked(feats[f]);
    feats[f].deciding = isDeciding(f) && counts(callerOf(f));
  }
  const named = Object.keys(feats).filter((f) => feats[f].deciding && feats[f].linked && callerOf(f) !== 'fwWC');
  const fw = Object.keys(feats).filter((f) => feats[f].deciding && feats[f].linked && callerOf(f) === 'fwWC');
  const reading = all.filter((R) => R.valid).length < 3 ? 'INSUFFICIENT' : S.length < 5 ? 'THIN' : named.length ? `NAMED(${named.join(',')})` : fw.length ? 'FWWC-ONLY' : 'NONE-LINKED';
  // B1, the bucket check: per deciding api, all callers pooled (writes: changed only)
  const B1 = {};
  for (const api of DECIDE_APIS) {
    const fs = Object.keys(feats).filter((f) => f.split(':')[0] === api);
    const s = fs.reduce((m, f) => m + sum(S, f), 0), r = fs.reduce((m, f) => m + sum(C, f), 0);
    B1[api] = rateRule(s, S.length, r, C.length, k);
  }
  const B1all = rateRule(DECIDE_APIS.reduce((m, a) => m + B1[a].s, 0), S.length, DECIDE_APIS.reduce((m, a) => m + B1[a].r, 0), C.length, k);
  const dec = S.reduce((m, q) => m + (q.decCalls || 0), 0), pg = S.reduce((m, q) => m + (q.pageCalls || 0), 0);
  const detail = {};
  for (const f of Object.keys(feats).filter((x) => feats[x].linked)) {
    const meta = new Map(); for (const R of runs) { const m = R.meta.get(f); if (!m) continue; for (const key of ['names', 'entry', 'helper']) { if (!meta.has(key)) meta.set(key, new Map()); for (const [a, b] of m[key]) meta.get(key).set(a, (meta.get(key).get(a) || 0) + b); } }
    const perRun = runs.map((R) => { const s = sum(R.frames.filter((q) => q.step), f), Fs = R.frames.filter((q) => q.step).length, Cs = R.frames.filter((q) => (wide ? q.ctrlWide : q.ctrl)), r = sum(Cs, f); return { run: R.name, s, Fs, r, Fr: Cs.length, RR: Fs && r ? r3((s / Fs) / (r / Cs.length)) : null }; });
    const per = (arr) => ({ calls: sum(arr, f), frames: arr.length, perFrame: arr.length ? r3(sum(arr, f) / arr.length) : null });
    const scrollSplit = { step: per(S), controlMoved: per(C.filter((q) => q.yMoved)), controlStill: per(C.filter((q) => !q.yMoved)) };
    detail[f] = { names: top(meta.get('names')), entry: top(meta.get('entry')), helper: top(meta.get('helper')), perRun, scrollSplit };
  }
  return {
    runs: all.map((R) => ({ run: R.name, valid: R.valid, why: R.why, frames: R.frames.length, lo: R.lo, hi: R.hi, step: R.frames.filter((q) => q.step).length, control: R.frames.filter((q) => q.ctrl).length })),
    valid: k, STEP: S.length, control: C.length, controlWide: wide, reading, named, fwWC: fw, B1, B1all,
    pageShare: dec ? r3(pg / dec) : null, pageCalls: pg, decidingCalls: dec, feats, detail,
  };
}

export function read(dir, names) { return readSet(names.map((n) => loadRun(dir, n))); }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), out = ji >= 0 ? args.splice(ji, 2)[1] : null;
  const [dir, ...names] = args;
  const res = read(dir, names);
  console.log(`P-128 READING: ${res.reading}  (valid runs ${res.valid}, STEP ${res.STEP}, control ${res.control}${res.controlWide ? ' wide' : ''}, pageShare ${res.pageShare})`);
  for (const r of res.runs) console.log(`  ${r.run}: ${r.valid ? 'valid' : 'INVALID ' + r.why.join('; ')} frames ${r.frames} ih ${r.lo}-${r.hi} step ${r.step} control ${r.control}`);
  console.log('  B1: ' + DECIDE_APIS.map((a) => `${a} ${res.B1[a].s}/${res.B1[a].Fs} vs ${res.B1[a].r}/${res.B1[a].Fr} RR ${res.B1[a].RR} RRlo ${res.B1[a].RRlo}${res.B1[a].linked ? ' RATE-LINKED' : ''}`).join(' | '));
  for (const [f, c] of Object.entries(res.feats).filter(([, c]) => c.rateClustered && !c.linked)) console.log(`  RATE-CLUSTERED ${f}: rate ${c.rate.s}/${c.rate.Fs} vs ${c.rate.r}/${c.rate.Fr} RRlo ${c.rate.RRlo}, in ${c.spread.frames} STEP frames (need ${c.spread.need}) and ${c.spread.runs} runs (need 3)`);
  for (const [f, c] of Object.entries(res.feats).filter(([, c]) => c.linked)) console.log(`  LINKED ${f}${c.deciding ? '' : ' (descriptive)'}: presence ${c.call} ${c.Hw}/${c.H} base ${c.base}; rate ${c.rate.s}/${c.rate.Fs} vs ${c.rate.r}/${c.rate.Fr} RR ${c.rate.RR} RRlo ${c.rate.RRlo}${c.rate.linked ? ' RATE-LINKED' : ''}; spread ${c.spread.frames} frames / ${c.spread.runs} runs; per frame step ${res.detail[f].scrollSplit.step.perFrame} controlMoved ${res.detail[f].scrollSplit.controlMoved.perFrame} controlStill ${res.detail[f].scrollSplit.controlStill.perFrame}; names ${JSON.stringify(res.detail[f].names)} entry ${JSON.stringify(res.detail[f].entry)}`);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
}

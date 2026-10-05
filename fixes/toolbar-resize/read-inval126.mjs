#!/usr/bin/env node
// toolbar-resize P-126 stage 1 reader (frozen before reading any per-frame content of the P-125 captures).
// Reads the WebKit Timeline records P-125 already captured (no new hold) and asks what invalidates the heavy in-view
// toolbar-step frames.
//   node fixes/toolbar-resize/read-inval126.mjs <folder> <run> ... [--json out.json]   (<run> = <arm>-H<n>, arm C|wpx|wc1)
// <folder> = out/toolbar-resize/sim125 (g-<run>.json with p125-inject.mjs's record, tl-<run>.json, runs.jsonl).
// FRAMES: exactly as score-p125.mjs (c52de0edd5d3) rules 1-5: longest segment, frame [t, dt, y, ih] covers (t - dt, t],
//   moving = ih strictly between the run's min and max, in view = the showcase IO's last entry with time <= t,
//   HEAVY = moving, y < 3250, in view, largest outermost Layout >= 10 ms. CONTROL = in-view rest frames (not moving,
//   y < 3250, in view); when a pooled set has < 20 of them, every rest frame with y < 3250 is the control (flagged).
//   Only runs that passed P-125's gate are read (the gate is not re-run here: runs named on the command line).
// RECORDS: every Timeline record, at t = startTime * 1000 - offsetMs (the frames' clock), with its ancestor chain.
//   A frame CARRIES a feature when a record with it starts in the frame's own interval or the previous frame's (as
//   P-125 rule 5).
// STACK KEY (rev 2, ops C1): the first call frame (innermost first, as WebKit lists them) whose url contains
//   "/_app/immutable/" (the page's own JS). Its line maps to a REGION (ranges in
//   the v8 JS, 2.DyWL8TcE.js, padded by one line on each side because the protocol's line base is taken from the docs,
//   not checked here): fwWC 2738-2748 (the will-change window), sceneCE 2793-2805 (cE, the scene gate's setter),
//   sceneB 2925-2955 and sceneC 14205-14220 (the other scene-attribute writers), rE 2700-2737 is NOT used (no frozen
//   range); any other page line keys as `<file>:<function>@<line>`. No page frame: the first frame with another url
//   (not "[native code]") keys as `ext:<file>:<function>@<line>` (decides like a page key); else, when a frame has an
//   empty url (the injected probe, evaluated without a sourceURL), `probe` (reported, never deciding); else `native`
//   (no stack, or only native frames).
// FEATURES per frame:
//   inval:<key>  a ScheduleStyleRecalculation or InvalidateLayout record with that stack key (`native` = no page frame)
//   ev:<type>    an EventDispatch of that type (resize, scroll, ...)
//   obs:<type>   an ObserverCallback of that type
// PER HEAVY FRAME (its largest outermost Layout, "the Layout"):
//   parent       the Layout's immediate parent record type and its top-level ancestor type
//   forced       the Layout's own stack key, else its RecalculateStyles parent's stack key, else none (UPDATE)
//   root         Layout.data.root (8 numbers, a quad): VIEW when its bounding box is x 0..430, y 0..ih of the frame
//                (+-1 px), else SUBTREE (box size kept)
// CALLS (C runs pooled; wpx + wc1 pooled as the replicate set R, descriptive):
//   per feature, presence: coincidence() imported from score-p125.mjs (frozen): THIN when H < 5; COVERS when Hw >= max(5, 2 x runs),
//     hLo >= 2 x base and h >= 0.8; LINKED-PART when Hw >= floor and hLo >= 2 x base; else NO-LINK. Base = share of
//     CONTROL frames carrying the feature (printed for every feature).
//   per inval:<key>, RATE (rev 2, ops C2; P-125 rule 6 form, rateRule() imported from score-p125.mjs): s = records with
//     that key starting in the heavy frames' OWN intervals, Fs = heavy frames; r = the same in the CONTROL frames' own
//     intervals, Fr = control frames; RR = (s/Fs)/(r/Fr), RRlo = Clopper-Pearson 95 % lower bound of s/(s+r) as odds
//     x Fr/Fs; RATE-LINKED when s >= max(8, 4 x runs) and RRlo >= 2. (Presence saturates when a key sits in most
//     control frames, e.g. ~1 stackless invalidation per frame: then hLo >= 2 x base cannot hold; the rate still can.)
//   LINKED = COVERS, LINKED-PART or RATE-LINKED.
//   PARENT: RECALC when >= 80 % of heavy Layouts sit directly in RecalculateStyles, else OTHER (shares kept).
//   FORCED: SCRIPT when >= 80 % of heavy Layouts have a page or ext stack key (probe and native excluded), UPDATE when <= 20 %, else MIXED.
//   ROOT: VIEW when >= 80 % VIEW, SUBTREE when <= 20 %, else MIXED.
// READING (frozen; fwWC is reported but cannot decide, P-125's wc1 removed its toggles without effect):
//   SCRIPT-SOURCE(<keys>)  some inval:<page or ext key> other than fwWC is LINKED in C
//   NATIVE                 no such key, and inval:native is LINKED in C
//   (inval:probe is reported with probeLinked, never deciding: the probe's own work is not the page's)
//   UNCLEAR                otherwise (no invalidation record links to the heavy frames, or THIN)
//   R (wpx + wc1) gives its own reading; AGREE when equal to C's, else DIFFER (descriptive).
// K1 (root growth, the P-125 wpx miss): per run, the showcase IO entries' rootBounds heights (inject `io` [time, in,
//   top, bottom, rootH]). SUPPORTS when, pooled over all runs, heights within 1 px of both the runs' min and max ih
//   appear; ONE-HEIGHT when only one appears; NONE when no entries. K1b (descriptive): distinct heights of VIEW roots.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coincidence, cpLower, rateRule } from './score-p125.mjs';

export const REGIONS = [['fwWC', 2738, 2748], ['sceneCE', 2793, 2805], ['sceneB', 2925, 2955], ['sceneC', 14205, 14220]];
const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);

export function stackKey(st) {
  const fr = st?.callFrames || [];
  let ext = null, probe = false;
  for (const f of fr) {
    const url = f.url || '';
    if (url.includes('/_app/immutable/')) {
      const ln = f.lineNumber;
      for (const [k, a, b] of REGIONS) if (url.includes('2.DyWL8TcE.js') && ln >= a - 1 && ln <= b + 1) return k;
      return `${url.split('/').pop()}:${f.functionName || '?'}@${ln}`;
    }
    if (url === '[native code]') continue;
    if (!url) { probe = true; continue; }
    if (!ext) ext = `ext:${url.split('/').pop() || url}:${f.functionName || '?'}@${f.lineNumber}`;
  }
  return ext || (probe ? 'probe' : 'native');
}
// keys that may decide a SCRIPT-SOURCE reading: page keys other than fwWC, and ext keys
export const decides = (key) => key !== 'native' && key !== 'probe' && key !== 'fwWC';

export function quadBox(q) {
  if (!Array.isArray(q) || q.length < 8) return null;
  const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function loadRun(dir, name) {
  const arm = name.replace(/-H\d+$/, '');
  const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8'));
  const tl = JSON.parse(readFileSync(join(dir, `tl-${name}.json`), 'utf8'));
  const seg = [...(g.run?.segments || [])].sort((a, b) => (b.frames?.length || 0) - (a.frames?.length || 0))[0];
  let inj = (g.run?.inject || g.inject || [])[0]?.value ?? null;
  if (typeof inj === 'string') { try { inj = JSON.parse(inj); } catch { inj = null; } }
  const fr = seg?.frames || [], ihs = fr.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs), io = inj?.io || [];
  // records, flattened, with ancestors
  const recs = [];
  // each record keeps its parent (for RecalculateStyles -> Layout stacks)
  const walk2 = (r, anc, parent) => {
    const me = { type: r.type, t: r.startTime * 1000 - tl.offsetMs, dur: r.endTime != null ? (r.endTime - r.startTime) * 1000 : null, data: r.data || {}, stack: r.stackTrace || null, anc, parent };
    me.outerLayout = r.type === 'Layout' && !anc.includes('Layout') && me.dur != null;
    recs.push(me);
    for (const c of r.children || []) walk2(c, [...anc, r.type], me);
  };
  for (const r of tl.recs || []) walk2(r, [], null);
  const frames = fr.map(([t, dt, y, ih]) => {
    let st = null; for (const e of io) { if (e[0] <= t) st = e[1]; else break; }
    return { t, dt, y, ih, moving: ih > lo && ih < hi, view: st, feats: new Set(), cnt: new Map(), layouts: [] };
  });
  const idxOf = (w) => { let a = 0, b = frames.length - 1; if (!frames.length || w <= frames[0].t - frames[0].dt || w > frames[b].t) return -1; while (a < b) { const m = (a + b) >> 1; if (frames[m].t < w) a = m + 1; else b = m; } return w > frames[a].t - frames[a].dt ? a : -1; };
  for (const r of recs) {
    const i = idxOf(r.t); if (i < 0) continue;
    if (r.outerLayout) frames[i].layouts.push(r);
    let f = null;
    if (r.type === 'ScheduleStyleRecalculation' || r.type === 'InvalidateLayout') f = `inval:${stackKey(r.stack)}`;
    else if (r.type === 'EventDispatch') f = `ev:${r.data.type}`;
    else if (r.type === 'ObserverCallback') f = `obs:${r.data.type}`;
    if (f) { frames[i].feats.add(f); frames[i].cnt.set(f, (frames[i].cnt.get(f) || 0) + 1); }
  }
  frames.forEach((q, i) => {
    q.carry = new Set([...q.feats, ...(i ? frames[i - 1].feats : [])]);
    q.L = q.layouts.reduce((m, l) => (!m || l.dur > m.dur ? l : m), null);
    q.max = q.L ? q.L.dur : 0;
    q.heavy = q.moving && q.y < 3250 && q.view === 1 && q.max >= 10;
    q.ctrl = !q.moving && q.y < 3250 && q.view === 1;
    q.ctrlWide = !q.moving && q.y < 3250;
  });
  return { name, arm, frames, io, lo, hi };
}

function heavyInfo(q) {
  const L = q.L, parentType = L.parent?.type ?? null, top = L.anc[0] ?? null;
  let forced = stackKey(L.stack);
  if (forced === 'native' && L.parent?.type === 'RecalculateStyles') forced = stackKey(L.parent.stack);
  const b = quadBox(L.data.root);
  const view = b && Math.abs(b.x0) <= 1 && Math.abs(b.y0) <= 1 && Math.abs(b.x1 - 430) <= 1 && Math.abs(b.y1 - q.ih) <= 1;
  return { t: r3(q.t), y: q.y, ih: q.ih, ms: r3(q.max), parentType, top, forced, root: b ? (view ? 'VIEW' : 'SUBTREE') : 'none', box: b ? [r3(b.x1 - b.x0), r3(b.y1 - b.y0)] : null };
}

const share3 = (n, d, hiCut, loCut, hiName, loName, mid) => (d ? (n / d >= hiCut ? hiName : n / d <= loCut ? loName : mid) : 'THIN');

export function readSet(runs) {
  const H = [], ctrl = [], ctrlWide = [];
  for (const R of runs) for (const q of R.frames) { if (q.heavy) H.push(q); if (q.ctrl) ctrl.push(q); if (q.ctrlWide) ctrlWide.push(q); }
  const wide = ctrl.length < 20, C = wide ? ctrlWide : ctrl, k = runs.length;
  const keys = new Set(); for (const q of [...H, ...C]) for (const f of q.carry) keys.add(f);
  const feats = {};
  for (const f of [...keys].sort()) {
    const Hw = H.filter((q) => q.carry.has(f)).length, base = C.length ? C.filter((q) => q.carry.has(f)).length / C.length : 0;
    feats[f] = coincidence(H.length, Hw, base, k);
    if (f.startsWith('inval:')) {
      const sum = (arr) => arr.reduce((m, q) => m + (q.cnt.get(f) || 0), 0);
      feats[f].rate = rateRule(sum(H), H.length, sum(C), C.length, k);
    }
  }
  const info = H.map(heavyInfo), n = info.length;
  const parentRecalc = info.filter((x) => x.parentType === 'RecalculateStyles').length;
  const scripted = info.filter((x) => x.forced !== 'native' && x.forced !== 'probe').length;
  const viewN = info.filter((x) => x.root === 'VIEW').length;
  const parent = n < 5 ? 'THIN' : parentRecalc / n >= 0.8 ? 'RECALC' : 'OTHER';
  const forced = n < 5 ? 'THIN' : share3(scripted, n, 0.8, 0.2, 'SCRIPT', 'UPDATE', 'MIXED');
  const root = n < 5 ? 'THIN' : share3(viewN, n, 0.8, 0.2, 'VIEW', 'SUBTREE', 'MIXED');
  const linked = (c) => !!c && (c.call === 'COVERS' || c.call === 'LINKED-PART' || !!c.rate?.linked);
  const src = Object.entries(feats).filter(([f, c]) => f.startsWith('inval:') && decides(f.slice(6)) && linked(c)).map(([f]) => f.slice(6));
  const reading = src.length ? `SCRIPT-SOURCE(${src.join(',')})` : linked(feats['inval:native']) ? 'NATIVE' : 'UNCLEAR';
  const probeLinked = linked(feats['inval:probe']);
  const count = (arr, key) => arr.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
  return {
    runs: runs.map((R) => R.name), H: n, control: C.length, controlWide: wide, feats, reading, probeLinked,
    parent, parentShare: n ? r3(parentRecalc / n) : null, parentTypes: count(info, 'parentType'), topTypes: count(info, 'top'),
    forced, forcedShare: n ? r3(scripted / n) : null, forcedKeys: count(info, 'forced'), forcedLo: r3(cpLower(scripted, n)),
    root, rootShare: n ? r3(viewN / n) : null, heavy: info,
  };
}

export function k1(runs) {
  const hs = [], lo = Math.min(...runs.map((R) => R.lo)), hi = Math.max(...runs.map((R) => R.hi));
  for (const R of runs) for (const e of R.io) if (e[4] != null) hs.push(Math.round(e[4]));
  const has = (v) => hs.some((h) => Math.abs(h - v) <= 1);
  const call = !hs.length ? 'NONE' : has(lo) && has(hi) ? 'SUPPORTS' : 'ONE-HEIGHT';
  return { call, ihMin: lo, ihMax: hi, heights: [...new Set(hs)].sort((a, b) => a - b), entries: hs.length };
}

export function read(dir, names) {
  const runs = names.map((n) => loadRun(dir, n));
  const C = runs.filter((R) => R.arm === 'C'), Rp = runs.filter((R) => R.arm !== 'C');
  const c = readSet(C), r = Rp.length ? readSet(Rp) : null;
  const viewHeights = [...new Set([...c.heavy, ...(r?.heavy || [])].filter((x) => x.root === 'VIEW').map((x) => Math.round(x.box[1])))].sort((a, b) => a - b);
  return { reader: 'fixes/toolbar-resize/read-inval126.mjs', C: c, R: r, agree: r ? (r.reading === c.reading ? 'AGREE' : 'DIFFER') : null, k1: k1(runs), k1b: { viewRootHeights: viewHeights } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  const [dir, ...names] = args.filter((x, i) => !(ji >= 0 && (i === ji || i === ji + 1)));
  if (!dir || !names.length) { console.error('usage: read-inval126.mjs <folder> <run> ... [--json out.json]'); process.exit(1); }
  const o = read(dir, names);
  for (const [lab, s] of [['C', o.C], ['R', o.R]]) {
    if (!s) continue;
    console.log(`${lab} (${s.runs.join(' ')}): H ${s.H}, control ${s.control}${s.controlWide ? ' (wide)' : ''} | READING ${s.reading} | probeLinked ${s.probeLinked}`);
    console.log(`  parent ${s.parent} (${s.parentShare}) ${JSON.stringify(s.parentTypes)} top ${JSON.stringify(s.topTypes)}`);
    console.log(`  forced ${s.forced} (${s.forcedShare}) ${JSON.stringify(s.forcedKeys)} | root ${s.root} (${s.rootShare})`);
    for (const [f, v] of Object.entries(s.feats)) console.log(`  ${f.padEnd(44)} ${v.call.padEnd(11)} Hw ${v.Hw}/${v.H} hLo ${v.hLo} base ${v.base}${v.rate ? ` | rate s ${v.rate.s}/${v.rate.Fs} r ${v.rate.r}/${v.rate.Fr} RR ${v.rate.RR} RRlo ${v.rate.RRlo} floor ${v.rate.floor} ${v.rate.linked ? 'RATE-LINKED' : 'no-rate-link'}` : ''}`);
  }
  console.log(`AGREE ${o.agree} | K1 ${o.k1.call} heights ${JSON.stringify(o.k1.heights)} (ih ${o.k1.ihMin}-${o.k1.ihMax}, ${o.k1.entries} entries) | K1b VIEW root heights ${JSON.stringify(o.k1b.viewRootHeights)}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(o, null, 1) + '\n');
}

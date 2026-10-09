#!/usr/bin/env node
// g0.0l phone card reader (fix-scrollcb-g0, 2026-10-09; card: fixes/g0-0l/README.md "Phone check card"). Frozen before the
// first counted run (sha256 in the card).
//   node fixes/g0-0l/phone/g0l-read.mjs [runs dir, default out/g0lp/runs]     -> prints the table, writes <dir>/../g0l-read.json
//   node fixes/g0-0l/phone/g0l-read.mjs --selftest                             -> reads earlier phone records with the same code
// Counted items E<a><n> (a = C | V, n 1-4; a re-run E<a><n>r replaces its run) have two records:
//   g-E<a><n>f.json (+ tl-...f.json)  FLICK program g-flick-g0l.json: window = frames with t in (mark flick, mark flick-end]
//   g-E<a><n>a.json (+ tl-...a.json)  APPROACH program g-approach-g0l.json: window = t in (mark approach, mark approach-end]
// A frame is the gesture record's [t, dt, scrollY, innerHeight] (segment 0), covering (t - dt, t].
// Validity: the run gates (g0l-read-gates.mjs readRun, role E: G1-G6) on both records; an invalid item has no counts.
// Primary D1 per window: frames dt > 50 per run; d = median V - median C <= +2 -> PASS; the twins > 46 and > 54 must give the
// same verdict, else OPEN (threshold-sensitive). Near band (46, 54] flagged.
// Secondary (FLICK, from the pb-lite page log; no verdict): deckIn (first rAF after the flick with scrollY + innerHeight > the
// deck's page top), blurred frames (page-log rAF frames with the deck in view while the card's filter transition runs),
// fadeInViewMs (deck in view before the card is fully shown: until the opacity transitionend, or until the is-visible
// flip when no opacity transition runs; the screen's blank time is a part of it), <img> loads in #people before the flick and from deckIn to flick-end, data-fw-reveal set.
// Descriptive: > 34 (30 / 38) per window; APPROACH X = the longest frame with scrollY in [1650, 1850].
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { readRun } = await import(pathToFileURL(join(here, 'g0l-read-gates.mjs')).href);
const TH = [30, 34, 38, 46, 50, 54];
const LIMIT = 2;
const load = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/** Frames of one segment in (a, b]: counts per threshold and the near bands. */
export function windowCounts(seg, markA, markB) {
  const mk = Object.fromEntries((seg?.marks || []).map(([t, n]) => [n, t]));
  const a = mk[markA], b = mk[markB];
  if (a == null || b == null) return { err: `marks ${markA}/${markB} missing` };
  const fr = (seg.frames || []).filter(([t]) => t > a && t <= b);
  const c = Object.fromEntries(TH.map((th) => [th, fr.filter((f) => f[1] > th).length]));
  return { frames: fr.length, ms: r1(b - a), c, near50: fr.filter((f) => f[1] > 46 && f[1] <= 54).length, near34: fr.filter((f) => f[1] > 30 && f[1] <= 38).length, max: r1(Math.max(0, ...fr.map((f) => f[1]))), yEnd: fr.at(-1)?.[2] ?? null };
}

/** The longest frame with scrollY in [lo, hi] inside the window. */
export function crossing(seg, markA, markB, lo = 1650, hi = 1850) {
  const mk = Object.fromEntries((seg?.marks || []).map(([t, n]) => [n, t]));
  let best = null;
  for (const f of seg?.frames || []) if (f[0] > mk[markA] && f[0] <= mk[markB] && f[2] >= lo && f[2] <= hi && (!best || f[1] > best[1])) best = f;
  return best && { y: best[2], dt: best[1] };
}

/** Deck metrics of one FLICK segment from the page log (pb-lite or pb-log). */
export function deck(seg, inj, markFlick, markEnd) {
  if (!inj) return null;
  const mk = Object.fromEntries((seg?.marks || []).map(([t, n]) => [n, t]));
  const tF = mk[markFlick], tE = mk[markEnd] ?? (tF + 6000);
  const top = inj.geom?.deck?.[0], ht = inj.geom?.deck?.[1] ?? 0, vh = inj.geom?.vh || 815;
  if (tF == null || top == null) return { err: 'no flick mark or no deck geometry' };
  const f = (inj.f || []).filter(([t]) => t >= tF && t <= tE);
  const inView = ([, y]) => y + vh > top && y < top + ht;
  const deckIn = f.find(inView)?.[0] ?? null;
  const flip = (inj.m || []).find(([t, n, a, d]) => t >= tF - 50 && /section#people/.test(n) && a === 'class' && /\+is-visible/.test(d))?.[0] ?? null;
  const ev = (inj.ev || []).filter(([t]) => t >= tF - 50 && t <= tE);
  const tr = (k, p) => ev.find(([, e, n, pp]) => e === k && /future-card/.test(n) && pp === p)?.[0] ?? null;
  const fStart = tr('transitionstart', 'filter'), fEnd = tr('transitionend', 'filter') ?? tr('transitioncancel', 'filter');
  const oStart = tr('transitionstart', 'opacity'), oEnd = tr('transitionend', 'opacity') ?? tr('transitioncancel', 'opacity');
  const blurLo = fStart ?? (fEnd != null ? flip : null), blurHi = fStart != null || fEnd != null ? (fEnd ?? tE) : null;
  const blurred = blurLo == null ? 0 : f.filter((x) => inView(x) && x[0] >= blurLo && x[0] <= blurHi).length;
  const shown = oStart != null || oEnd != null ? (oEnd ?? tE) : flip;
  const fadeInView = deckIn == null ? null : shown == null ? r1(tE - deckIn) : r1(Math.max(0, shown - deckIn));
  const imgs = (inj.ev || []).filter(([, e]) => e === 'imgload');
  const reveal = (inj.m || []).filter(([t, , a, v]) => t >= tF - 50 && t <= tE && a === 'data-fw-reveal' && v === 'instant').length;
  return { deckIn: deckIn == null ? null : r1(deckIn - tF), flip: flip == null ? null : r1(flip - tF), blurredFrames: blurred, fadeInViewMs: fadeInView,
    imgsBefore: imgs.filter(([t]) => t < tF).length, imgsAfterDeckIn: deckIn == null ? null : imgs.filter(([t]) => t >= deckIn && t <= tE).length, revealInstant: reveal,
    filterTransition: fStart != null || fEnd != null, opacityTransition: oStart != null || oEnd != null };
}

const injOf = (g, si = 0) => { const v = g?.run?.inject?.find((x) => x.seg === si)?.value; return typeof v === 'string' ? JSON.parse(v) : v ?? null; };

/** D1 verdict on per-run counts of one window: by threshold, then the twins. */
export function d1(C, V, key = 'c') {
  const out = {};
  for (const th of [46, 50, 54]) {
    const mc = med(C.map((r) => r[key][th])), mv = med(V.map((r) => r[key][th]));
    out[th] = { C: C.map((r) => r[key][th]), V: V.map((r) => r[key][th]), medC: mc, medV: mv, d: mc == null || mv == null ? null : mv - mc };
    out[th].pass = out[th].d != null && out[th].d <= LIMIT;
  }
  const nC = C.length, nV = V.length;
  out.verdict = nC < 3 || nV < 3 ? `THIN (${nC} C, ${nV} V valid runs; >= 3 each)` : out[46].pass === out[50].pass && out[54].pass === out[50].pass ? (out[50].pass ? 'PASS' : 'FAIL') : 'OPEN (threshold-sensitive: a twin disagrees)';
  return out;
}

function readBlock(dir) {
  const items = {};
  for (const arm of ['C', 'V']) for (let n = 1; n <= 6; n++) {
    const base = `E${arm}${n}`;
    const name = existsSync(join(dir, `g-${base}rf.json`)) || existsSync(join(dir, `g-${base}ra.json`)) ? `${base}r` : base;
    const gf = load(join(dir, `g-${name}f.json`)), ga = load(join(dir, `g-${name}a.json`));
    if (!gf && !ga) continue;
    const vf = gf && readRun(gf, load(join(dir, `tl-${name}f.json`)), 'E'), va = ga && readRun(ga, load(join(dir, `tl-${name}a.json`)), 'E');
    const why = [...(vf ? vf.why.map((w) => `f: ${w}`) : ['f: no record']), ...(va ? va.why.map((w) => `a: ${w}`) : ['a: no record'])];
    const sf = gf?.run?.segments?.[0], sa = ga?.run?.segments?.[0];
    items[name] = { arm, valid: !why.length, why, flick: sf && windowCounts(sf, 'flick', 'flick-end'), approach: sa && windowCounts(sa, 'approach', 'approach-end'),
      x: sa && crossing(sa, 'approach', 'approach-end'), deck: sf && deck(sf, injOf(gf), 'flick', 'flick-end'),
      yLand: sf ? windowCounts(sf, 'flick', 'landed').yEnd : null };
  }
  const ok = (arm, w) => Object.values(items).filter((r) => r.arm === arm && r.valid && r[w] && !r[w].err).map((r) => r[w]);
  const out = { items, D1: { flick: d1(ok('C', 'flick'), ok('V', 'flick')), approach: d1(ok('C', 'approach'), ok('V', 'approach')) } };
  for (const w of ['flick', 'approach']) out.D1[w].gt34 = { C: ok('C', w).map((r) => r.c[34]), V: ok('V', w).map((r) => r.c[34]) };
  out.verdict = ['flick', 'approach'].map((w) => out.D1[w].verdict).every((v) => v === 'PASS') ? 'PASS' : ['flick', 'approach'].some((w) => out.D1[w].verdict === 'FAIL') ? 'FAIL' : 'OPEN';
  return out;
}

function print(out) {
  console.log('item arm valid | FLICK frames >50 (46/54) >34 (30/38) max yLand | APPROACH frames >50 (46/54) >34 (30/38) max X(y,dt) | deck: in flip blurred fadeInViewMs imgsBefore imgsAfterIn instant');
  for (const [n, r] of Object.entries(out.items)) {
    const w = (x) => (x && !x.err ? `${x.frames} ${x.c[50]} (${x.c[46]}/${x.c[54]}) ${x.c[34]} (${x.c[30]}/${x.c[38]}) ${x.max}` : x?.err || '-');
    const d = r.deck && !r.deck.err ? `${r.deck.deckIn} ${r.deck.flip} ${r.deck.blurredFrames} ${r.deck.fadeInViewMs} ${r.deck.imgsBefore} ${r.deck.imgsAfterDeckIn} ${r.deck.revealInstant}` : r.deck?.err || '-';
    console.log(`${n} ${r.arm} ${r.valid ? 'ok' : 'INVALID ' + r.why.join('; ')} | ${w(r.flick)} ${r.yLand} | ${w(r.approach)} ${r.x ? `${r.x.y},${r.x.dt}` : '-'} | ${d}`);
  }
  for (const w of ['flick', 'approach']) {
    const D = out.D1[w];
    console.log(`D1 ${w}: ${D.verdict} | >50 C ${D[50].C} V ${D[50].V} d ${D[50].d} | >46 d ${D[46].d} | >54 d ${D[54].d} | >34 C ${D.gt34.C} V ${D.gt34.V}`);
  }
  console.log(`CARD D1: ${out.verdict}`);
}

const MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href; // imported: helpers only
const arg = MAIN ? process.argv[2] : null;
if (MAIN && arg === '--selftest') {
  // (1) the FLICK reader on the cause read's phone records (pb-land, 4 segments each, marks fling / landed): V = g0.0j, B = baseline
  for (const f of ['out/pbp/g-V-20261009T064210Z.json', 'out/pbp/g-B-20261009T064518Z.json']) {
    const g = load(f); if (!g) { console.log(`SELFTEST skip ${f} (absent)`); continue; }
    g.run.segments.forEach((s, i) => { const inj = injOf(g, i); const mk = (s.marks || []).map(([, n]) => n);
      if (!mk.includes('fling')) return;
      // pb-land has no flick-end mark: the segment's last frame stands in
      const s2 = { ...s, marks: [...s.marks, [s.frames.at(-1)[0], 'end']] };
      console.log(`SELFTEST ${f.split('/').pop()} seg ${i}: window ${JSON.stringify(windowCounts(s2, 'fling', 'end'))} deck ${JSON.stringify(deck(s2, inj, 'fling', 'end'))}`); });
  }
  // (2) the APPROACH window and X on P-173's runs (fix-cm-return; marks approach / E20-...): EC1 = g0.0j, EV1 = g0.0k
  const P = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-ac431a36ea4f729ab/out/g0kp/runs';
  for (const n of ['EC1', 'EV1']) {
    const g = load(join(P, `g-${n}.json`)); if (!g) { console.log(`SELFTEST skip P-173 ${n} (absent)`); continue; }
    const s = g.run.segments[0];
    console.log(`SELFTEST P-173 ${n}: approach ${JSON.stringify(windowCounts(s, 'approach', 'E20-close-fast-60px-50ms'))} X ${JSON.stringify(crossing(s, 'approach', 'E20-close-fast-60px-50ms'))}`);
  }
  // (3) d1 on synthetic counts: PASS, FAIL, OPEN, THIN
  const mkr = (a) => a.map((x) => ({ c: { 46: x[0], 50: x[1], 54: x[2] } }));
  const t = [[mkr([[0, 0, 0], [0, 0, 0], [1, 0, 0], [0, 0, 0]]), mkr([[1, 1, 0], [2, 1, 0], [0, 0, 0], [1, 0, 0]]), 'PASS'],
    [mkr([[0, 0, 0], [0, 0, 0], [0, 0, 0]]), mkr([[4, 4, 4], [5, 5, 5], [3, 3, 3]]), 'FAIL'],
    [mkr([[0, 0, 0], [0, 0, 0], [0, 0, 0]]), mkr([[3, 2, 2], [4, 2, 1], [3, 2, 2]]), 'OPEN'],
    [mkr([[0, 0, 0], [0, 0, 0]]), mkr([[0, 0, 0], [0, 0, 0], [0, 0, 0]]), 'THIN']];
  let bad = 0;
  for (const [C, V, want] of t) { const v = d1(C, V).verdict; const okk = v.startsWith(want); bad += okk ? 0 : 1; console.log(`SELFTEST d1 want ${want}: ${v} ${okk ? 'ok' : 'WRONG'}`); }
  console.log(bad ? 'SELFTEST FAIL' : 'SELFTEST ok'); process.exit(bad ? 1 : 0);
}
if (MAIN) {
const dir = arg || 'out/g0lp/runs';
const out = readBlock(dir);
print(out);
const of = join(dir, '..', 'g0l-read.json');
writeFileSync(of, JSON.stringify({ tool: 'fixes/g0-0l/phone/g0l-read.mjs', dir, ...out }, null, 1));
console.log('wrote', of);
}

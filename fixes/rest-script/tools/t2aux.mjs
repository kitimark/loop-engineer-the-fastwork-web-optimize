#!/usr/bin/env node
// rest-script P-089 helpers next to t2score.mjs (which stays unchanged, hash 3e236a71ef6b). Written before any run.
//
// parts: the moving-part check of PR-010 T2 ("a moving part stays within 1 device px of the original at every frame").
//   For every shot label of the fix run that has a replay (st6-rb2 replaying the fix's frozen state, simrot2.mjs or
//   rot.mjs output with `parts`), compare each avatar slot's border box (left, top, width, height in CSS px, read with
//   the row frozen just before the screenshot) between the fix shot and the replay: max |delta| x DPR must be <= 1 device
//   px for every slot and every edge. Opacity, transform and clip-path must match as strings (reported, not converted).
//   Each row also has cropTop (CSS px, capTop - 6) and enInCrop (cropTop < 64: the F-199 header band; VOID for T2).
//   Output per label: maxDevPx, worst slot/edge, style mismatches, PASS/FAIL; VOID when parts are missing or the slot
//   counts differ.
// pair: pixel diff of two replay sets of the same states (the F-200 image-rendering pin diagnostics: st6-rb2 unpinned vs
//   pinned optimizeSpeed / optimizeQuality). Per label: pixels with any difference, pixels with d > 8, max d, on the
//   calibrated element crop (t2score.mjs calCrop, pad 6 device px). No tier: a diagnostic, not a T2 number.
// usage: node t2aux.mjs parts --run fix.json --replay rep-fix.json [--labels a,b] [--out f.json]
//        node t2aux.mjs pair --a repA.json --b repB.json [--labels a,b] [--out f.json]
//        node t2aux.mjs unmasked --run fix.json --replay rep-fix.json --t2 t2.json [--out f.json]
//        node t2aux.mjs coverage --t2 t2.json [--parts parts.json] [--run fix.json] [--replay rep-fix.json] --need quiet,intoview
//               --moving 10 [--since quiet,intoview] [--out f.json]
//        node t2aux.mjs --selftest
// unmasked (P-089 addendum item 4): the A/A mask works both ways: where st6's own A/A caught a two-state, the mask also
//   hides the fix's difference. Per label that t2score scored (non-VOID), the same X/Y crops are scored with no mask
//   (A/A = [X, X]: aa 0 everywhere); a label whose unmasked share or area breaks a T2 number while the masked tier is
//   T0-T2 is MASK-DEPENDENT: it goes to the lead and is not counted in a PASS. The shade is unmasked in both.
// coverage (addendum item 3): a leg is VOID unless every --need label is non-VOID in t2 (and in parts, when given) and
//   at least --moving of the 12 moving labels (smooth and jump at 0/40/100/160/215, outin 20/60) are non-VOID in both
//   (a parts row with enInCrop counts as VOID, F-199).
//   Option A (lead, P-089 Chrome legs): with --run, a label whose record shot carries `void` (rot2/simrot2 shot-level
//   void, e.g. a quiet shot too close to a slide) or mutAfter > 0 counts as VOID. With --replay, a --since label
//   (default quiet,intoview) whose replay records `since` (rot2 option A) with endMs or resizeMs < 1500 counts as VOID;
//   replays without `since` (simrot2) are not judged on it. When t2 scored both rest and quiet, rest (transient-exposed)
//   is compared with quiet: a T3 on one side only is REST-QUIET DISAGREE, reported for the lead and not in the verdict.
//   Exit 3 when VOID.
import { readFileSync, writeFileSync } from 'node:fs';
import { calCrop, pngPixels, score, BAR } from './t2score.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const tail = (l) => l.replace(/^[a-z0-9]+-(?:sim-|\d+-)/, '');
const EDGES = ['left', 'top', 'width', 'height'];
export const HEADER_CSS = 64;

export function partsCheck(fixParts, repParts, dpr) {
  if (!Array.isArray(fixParts) || !Array.isArray(repParts)) return { void: 'parts missing' };
  if (fixParts.length !== repParts.length) return { void: `slot count ${fixParts.length} vs ${repParts.length}` };
  let maxDev = 0, worst = null; const style = [];
  for (let i = 0; i < fixParts.length; i++) {
    const a = fixParts[i], b = repParts[i];
    for (let e = 0; e < 4; e++) { const dv = Math.abs(a[e] - b[e]) * dpr; if (dv > maxDev) { maxDev = dv; worst = { slot: i, edge: EDGES[e], fix: a[e], orig: b[e] }; } }
    for (const [j, name] of [[4, 'opacity'], [5, 'transform'], [6, 'clipPath']]) if (a[j] !== b[j]) style.push({ slot: i, prop: name, fix: a[j], orig: b[j] });
  }
  return { maxDevPx: +maxDev.toFixed(3), worst, style, pass: maxDev <= 1 && style.length === 0 };
}

const dmapCount = (A, B) => {
  if (A.w !== B.w || A.h !== B.h) return { void: `crop size ${A.w}x${A.h} vs ${B.w}x${B.h}` };
  let any = 0, over8 = 0, max = 0;
  for (let i = 0; i < A.px.length; i += 3) { const d = Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2])); if (d) { any++; if (d > 8) over8++; if (d > max) max = d; } }
  return { any, over8, max };
};
export const MOVING = ['smooth', 'jump'].flatMap((k) => [0, 40, 100, 160, 215].map((p) => `${k}-${p}`)).concat(['outin-20', 'outin-60']);
// the crop exactly as t2score.mjs builds it (Sim: calibration, DPR and screen from it; Chrome: clip, DPR and screen from the run)
const cropFull = (r, run) => (r.cal ? calCrop(r.file, r.cal, r.rect) : { ...pngPixels(readFileSync(r.file)), dpr: run.dpr, screen: run.w * run.vh * run.dpr * run.dpr });
export function breaksT2(five) { return five.largestShade.fill > BAR.fill || five.largestShade.edge > BAR.edge || five.sharePct > BAR.sharePct || five.areaCss > BAR.areaCss; }
export const SINCE_MIN = 1500;
export function sinceShort(since) { return !!since && [since.endMs, since.resizeMs].some((v) => v !== null && v !== undefined && v < SINCE_MIN); }
export function coverage(t2rows, partsRows, need, movingMin, { runShots = null, replays = null, sinceLabels = ['quiet', 'intoview'] } = {}) {
  const why = {};
  const ok = (L) => {
    const a = t2rows.find((x) => x.label === L); if (!a || a.void) return (why[L] = 't2 VOID or missing'), false;
    if (partsRows) { const p = partsRows.find((x) => x.label === L); if (!p || p.void || p.enInCrop) return (why[L] = 'parts VOID, missing or EN in crop'), false; }
    const sh = runShots && runShots.find((x) => tail(x.label) === L);
    if (runShots && (!sh || sh.void || sh.mutAfter > 0)) return (why[L] = 'record shot ' + (!sh ? 'missing' : sh.void || `mutAfter ${sh.mutAfter}`)), false;
    if (replays && sinceLabels.includes(L)) { const rp = sh && replays.find((x) => x.label === sh.label); if (rp && sinceShort(rp.since)) return (why[L] = `replay since ${JSON.stringify(rp.since)} < ${SINCE_MIN} ms`), false; }
    return true;
  };
  const missingNeed = need.filter((L) => !ok(L)), movingOk = MOVING.filter(ok).length;
  const isVoid = missingNeed.length > 0 || movingOk < movingMin;
  const rest = t2rows.find((x) => x.label === 'rest'), quiet = t2rows.find((x) => x.label === 'quiet');
  const restQuiet = rest && quiet && !rest.void && !quiet.void ? { rest: rest.tier, quiet: quiet.tier, disagree: (rest.tier === 'T3') !== (quiet.tier === 'T3') } : null;
  return { void: isVoid, missingNeed, why: Object.fromEntries(missingNeed.map((L) => [L, why[L]])), movingOk, movingMin, restQuiet };
}
const cropOf = (r, run) => (r.cal ? calCrop(r.file, r.cal, r.rect) : { ...pngPixels(readFileSync(r.file)), dpr: run.dpr });

function selftest() {
  const ok = (c, m) => { if (!c) { console.log('SELFTEST FAIL ' + m); process.exit(1); } };
  const p = (l, t, w, h, o = '1', tr = 'none', cp = 'none') => [l, t, w, h, o, tr, cp, 'auto'];
  ok(partsCheck([p(0, 0, 40, 40)], [p(0, 0, 40, 40)], 3).pass, 'identical passes');
  ok(partsCheck([p(0.3, 0, 40, 40)], [p(0, 0, 40, 40)], 3).pass, '0.9 device px passes');
  ok(!partsCheck([p(0.4, 0, 40, 40)], [p(0, 0, 40, 40)], 3).pass, '1.2 device px fails');
  ok(!partsCheck([p(0, 0, 40, 40, '0.5')], [p(0, 0, 40, 40)], 3).pass, 'opacity mismatch fails');
  ok(partsCheck([p(0, 0, 40, 40)], [], 3).void, 'slot count void');
  ok(partsCheck(null, [], 3).void, 'missing void');
  const img = (v) => ({ w: 2, h: 1, px: Buffer.from([v, 0, 0, 0, 0, 0]) });
  const d = dmapCount(img(0), img(20)); ok(d.any === 1 && d.over8 === 1 && d.max === 20, 'pair counts');
  ok(MOVING.length === 12, '12 moving labels');
  {
    const t2 = ['rest', 'quiet', 'intoview'].map((label) => ({ label, tier: 'T2' }));
    const shots = ['rest', 'quiet', 'intoview'].map((L) => ({ label: 'fix-1440-' + L }));
    const reps = shots.map((x) => ({ label: x.label, since: { endMs: 2600, resizeMs: 2650 } }));
    ok(!coverage(t2, null, ['quiet', 'intoview'], 0, { runShots: shots, replays: reps }).void, 'option A: clean quiet/intoview pass');
    ok(coverage(t2, null, ['quiet'], 0, { runShots: shots.map((x) => (x.label.endsWith('quiet') ? { ...x, void: 'slide end 1400 ms before capture' } : x)), replays: reps }).void, 'record shot void fails');
    ok(coverage(t2, null, ['intoview'], 0, { runShots: shots.map((x) => (x.label.endsWith('intoview') ? { ...x, mutAfter: 1 } : x)) }).void, 'mutAfter fails');
    ok(coverage(t2, null, ['intoview'], 0, { runShots: shots, replays: reps.map((x) => (x.label.endsWith('intoview') ? { ...x, since: { endMs: 1210, resizeMs: 5000 } } : x)) }).void, 'replay since < 1500 fails');
    ok(!coverage(t2, null, ['rest'], 0, { runShots: shots, replays: reps.map((x) => ({ ...x, since: { endMs: 100, resizeMs: 100 } })) }).void, 'rest is not judged on since');
    ok(!coverage(t2, null, ['quiet'], 0, { runShots: shots, replays: reps.map((x) => { const { since, ...y } = x; return y; }) }).void, 'replays without since (simrot2) are not judged on it');
    ok(!coverage(t2, null, ['quiet'], 0, { runShots: shots, replays: reps.map((x) => ({ ...x, since: { endMs: null, resizeMs: null } })) }).void, 'null since (reduced motion) passes');
    ok(coverage([{ label: 'rest', tier: 'T3' }, { label: 'quiet', tier: 'T1' }], null, [], 0).restQuiet.disagree, 'rest T3 vs quiet T1: disagree');
    ok(!coverage([{ label: 'rest', tier: 'T2' }, { label: 'quiet', tier: 'T0' }], null, [], 0).restQuiet.disagree, 'rest T2 vs quiet T0: agree (both within T2)');
  }
  const rows = ['rest', 'quiet', 'intoview', ...MOVING.slice(0, 10)].map((label) => ({ label })).concat(MOVING.slice(10).map((label) => ({ label, void: 'x' })));
  ok(!coverage(rows, null, ['rest', 'quiet', 'intoview'], 10).void, 'coverage 10 of 12 passes');
  ok(coverage(rows, null, ['rest', 'quiet', 'intoview'], 11).void, 'coverage 11 needed fails');
  ok(coverage(rows.filter((x) => x.label !== 'quiet'), null, ['rest', 'quiet'], 0).void, 'missing need fails');
  ok(coverage(rows, rows.map((x) => (x.label === 'rest' ? { ...x, void: 'parts' } : x)), ['rest'], 0).void, 'parts VOID fails');
  ok(coverage(rows, rows.map((x) => (x.label === 'rest' ? { ...x, enInCrop: true } : x)), ['rest'], 0).void, 'EN in crop fails');
  const f5 = (fill, edge, share, area) => ({ largestShade: { fill, edge }, sharePct: share, areaCss: area });
  ok(!breaksT2(f5(64, 128, 0.5, 2000)) && breaksT2(f5(0, 0, 0, 2000.01)) && breaksT2(f5(65, 0, 0, 0)) && breaksT2(f5(0, 0, 0.51, 0)), 'T2 bar edges');
  const X = { w: 4, h: 1, px: Buffer.from([0, 0, 0, 50, 50, 50, 0, 0, 0, 0, 0, 0]) }, Y = { w: 4, h: 1, px: Buffer.from([0, 0, 0, 90, 50, 50, 0, 0, 0, 0, 0, 0]) };
  ok(score(X, Y, [X, Y], { dpr: 1, screen: 100, moving: false }).counted === 0 && score(X, Y, [X, X], { dpr: 1, screen: 100, moving: false }).counted === 1, 'mask hides, no-mask counts');
  console.log('SELFTEST OK');
}

function main() {
  const cmd = process.argv[2];
  if (cmd === '--selftest') return selftest();
  const want = arg('--labels') ? arg('--labels').split(',') : null;
  const J = (k) => JSON.parse(readFileSync(arg(k), 'utf8'));
  const out = { tool: 't2aux.mjs', cmd, rows: [] };
  if (cmd === 'parts') {
    const run = J('--run'), rep = J('--replay'), dpr = run.geo?.dpr || run.dpr;
    out.dpr = dpr;
    for (const s of run.shots) {
      const L = tail(s.label); if (want && !want.includes(L)) continue;
      const r = rep.replays.find((q) => q.label === s.label);
      const res = !r || r.error ? { void: 'no replay: ' + (r?.error || 'missing') } : partsCheck(s.parts, r.parts, dpr);
      // F-199: the nav 'EN' label sits at viewport y 33-46 CSS px; a crop whose top (capTop - 6 px pad) is above 64 CSS px
      // includes the header band and is VOID for T2 (P-089 registration)
      const cropTop = +(s.capTop - 6).toFixed(2), enInCrop = cropTop < HEADER_CSS;
      out.rows.push({ label: L, moving: !!(s.rec && (s.rec[5] || (s.rec[7] && s.rec[7].length))), cropTop, enInCrop, ...res });
    }
    for (const r of out.rows) console.log(r.label.padEnd(14), r.void ? 'VOID ' + r.void : `${r.pass ? 'PASS' : 'FAIL'} max ${r.maxDevPx} device px${r.worst ? ` (slot ${r.worst.slot} ${r.worst.edge})` : ''} style mismatches ${r.style.length} ${r.moving ? 'moving' : 'static'}`, `crop top ${r.cropTop}${r.enInCrop ? ' EN-IN-CROP (VOID)' : ' EN not in crop'}`);
  } else if (cmd === 'pair') {
    const A = J('--a'), B = J('--b');
    for (const a of A.replays) {
      const L = tail(a.label); if (want && !want.includes(L)) continue;
      const b = B.replays.find((q) => q.label === a.label);
      let res;
      if (a.error || !b || b.error) res = { void: 'missing or errored replay' };
      else if (Math.abs(a.capTop - b.capTop) > 0.01 || Math.abs(a.capLeft - b.capLeft) > 0.01) res = { void: `geometry differs (dy ${(a.capTop - b.capTop).toFixed(2)}, dx ${(a.capLeft - b.capLeft).toFixed(2)})` };
      else res = dmapCount(cropOf(a, A), cropOf(b, B));
      out.rows.push({ label: L, ...res });
    }
    for (const r of out.rows) console.log(r.label.padEnd(14), r.void ? 'VOID ' + r.void : `any ${r.any} over8 ${r.over8} max ${r.max}`);
  } else if (cmd === 'unmasked') {
    const run = J('--run'), rep = J('--replay'), t2 = J('--t2');
    for (const m of t2.shots) {
      if (m.void) { out.rows.push({ label: m.label, void: m.void }); continue; }
      const s = run.shots.find((q) => tail(q.label) === m.label), rp = s && rep.replays.find((q) => q.label === s.label);
      if (!s || !rp) { out.rows.push({ label: m.label, void: 'shot or replay missing' }); continue; }
      const Y = cropFull(s, run), X = cropFull(rp, run);
      const u = score(X, Y, [X, X], { dpr: Y.dpr, screen: Y.screen, moving: m.five.motion === 'moving' });
      if (u.void) { out.rows.push({ label: m.label, void: u.void }); continue; }
      const maskDependent = m.tier !== 'T3' && breaksT2(u.five);
      out.rows.push({ label: m.label, maskedTier: m.tier, masked: { sharePct: m.five.sharePct, areaCss: m.five.areaCss, counted: m.counted }, unmasked: { fillMax: u.five.largestShade.fill, edgeMax: u.five.largestShade.edge, sharePct: u.five.sharePct, areaCss: u.five.areaCss, counted: u.counted, edgeFill: u.five.edgeFill }, maskHid: u.counted - m.counted, maskDependent });
    }
    for (const r of out.rows) console.log(r.label.padEnd(14), r.void ? 'VOID ' + r.void : `${r.maskedTier} masked ${r.masked.counted} px ${r.masked.areaCss} css ${r.masked.sharePct} %  unmasked fill/edge max ${r.unmasked.fillMax}/${r.unmasked.edgeMax} ${r.unmasked.counted} px ${r.unmasked.areaCss} css ${r.unmasked.sharePct} %  mask hid ${r.maskHid} px ${r.maskDependent ? 'MASK-DEPENDENT' : 'ok'}`);
    out.maskDependent = out.rows.filter((r) => r.maskDependent).map((r) => r.label);
    console.log(out.maskDependent.length ? `MASK-DEPENDENT: ${out.maskDependent.join(',')} (to the lead, not a PASS)` : 'MASK OK: no label passes only because of the A/A mask');
  } else if (cmd === 'coverage') {
    const t2 = J('--t2'), parts = arg('--parts') ? J('--parts') : null;
    const need = (arg('--need') || '').split(',').filter(Boolean), movingMin = Number(arg('--moving', '0'));
    const runShots = arg('--run') ? J('--run').shots : null, replays = arg('--replay') ? J('--replay').replays : null;
    const c = coverage(t2.shots, parts && parts.rows, need, movingMin, { runShots, replays, sinceLabels: arg('--since', 'quiet,intoview').split(',') });
    Object.assign(out, c);
    if (runShots) out.since = runShots.filter((x) => ['rest', 'quiet', 'intoview'].includes(tail(x.label))).map((x) => ({ label: tail(x.label), transientExposed: !!x.transientExposed, since: x.since ?? null, replaySince: (replays && replays.find((q) => q.label === x.label) || {}).since ?? null, void: x.void || null }));
    if (out.since) for (const x of out.since) console.log(`SINCE ${x.label.padEnd(9)} record ${JSON.stringify(x.since)} replay ${JSON.stringify(x.replaySince)}${x.transientExposed ? ' transient-exposed (not in the verdict)' : ''}${x.void ? ' VOID ' + x.void : ''}`);
    console.log(c.void ? `COVERAGE VOID: missing ${c.missingNeed.map((L) => `${L} (${c.why[L]})`).join(', ') || '-'}; moving ${c.movingOk}/12 (need ${movingMin})` : `COVERAGE OK: ${need.join(',')}; moving ${c.movingOk}/12 (need ${movingMin})`);
    if (c.restQuiet) console.log(c.restQuiet.disagree ? `REST-QUIET DISAGREE: rest ${c.restQuiet.rest}, quiet ${c.restQuiet.quiet} (to the lead, not in the verdict)` : `REST-QUIET agree: rest ${c.restQuiet.rest}, quiet ${c.restQuiet.quiet}`);
    if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
    process.exit(c.void ? 3 : 0);
  } else { console.log('usage: t2aux.mjs parts|pair|unmasked|coverage ... | --selftest'); process.exit(1); }
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
}
const direct = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (direct) main();

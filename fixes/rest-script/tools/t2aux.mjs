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
//        node t2aux.mjs --selftest
import { readFileSync, writeFileSync } from 'node:fs';
import { calCrop, pngPixels } from './t2score.mjs';

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
  } else { console.log('usage: t2aux.mjs parts|pair ... | --selftest'); process.exit(1); }
  if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
}
const direct = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (direct) main();

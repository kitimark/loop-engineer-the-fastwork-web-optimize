#!/usr/bin/env node
// P-142 part 1 read (int-v8). Rules as registered in fixes/v9-2/README.md "Part 1" (1a, 1c; NF-C dropped in rev 1.3);
// N6 record selection: 1a = the part1.log RECORD files; 1c = each arm's first 3 valid loads in log order.
// Rev 1.4 (lead ruling after ops-reader-P142p1's read): (1) an insufficient branch: fewer than 3 valid loads an arm on an
// item -> that item INSUFFICIENT; part 1 = WORSE if any item is WORSE, else INSUFFICIENT if any is, else no-worse (N6
// precedence); (2) a 1c scroll window counts only if it passes sim92check.mjs's scrollCheck (part 1's truncated windows
// fail it, so 1c scroll from part 1's records alone is INSUFFICIENT); (3) the 1c scroll item may come from a separate
// records file (the rev 1.4 scroll-only re-run): --scroll <file>. The 2-count floor is applied as registered (also to the
// per-frame ratios, where it makes WORSE need a rise of > 2 per frame; part 1's first read used 0 there); the floor-0
// verdict of the per-frame items is printed as a report, not a gate. The no-worse rule is otherwise unchanged:
//   WORSE when V's min > F's max AND median(V) - median(F) > max(F's range, 10 % of median(F), floor).
// Usage: node fixes/v9-2/part1read.mjs [--log out/v92/part1.log] [--sim out/v92/sim/p142.json] [--scroll <records.json>]
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), WT = join(here, '..', '..');
const { scrollCheck } = await import(join(here, 'sim92check.mjs'));
export const N = 3, FLOOR = 2;
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export function rule(F, V, floor = FLOOR) {
  if (F.length < N || V.length < N) return { verdict: `insufficient (F ${F.length}, V ${V.length}, need ${N})`, F, V };
  const fmin = Math.min(...F), fmax = Math.max(...F), vmin = Math.min(...V);
  const d = med(V) - med(F), thr = Math.max(fmax - fmin, 0.1 * med(F), floor);
  return { verdict: vmin > fmax && d > thr ? 'WORSE' : 'no-worse', F, V, d: +d.toFixed(3), thr: +thr.toFixed(3) };
}
const fold = (vs) => (vs.some((v) => /^WORSE/.test(v)) ? 'WORSE' : vs.some((v) => /^insufficient/.test(v)) ? 'INSUFFICIENT' : 'no-worse');

// 1a: Chrome census records ({arm, windows: [{label, perSec}]})
export function read1a(recs) {
  const C = { F: recs.filter((j) => j.arm.startsWith('F')).slice(0, N), V: recs.filter((j) => j.arm.startsWith('V')).slice(0, N) };
  const out = [];
  const labels = (C.F[0] || C.V[0])?.windows.map((w) => w.label) || [];
  for (const L of labels) for (const k of ['mainFrames', 'rafFire']) {
    const g = (arm) => C[arm].map((j) => j.windows.find((w) => w.label === L)?.perSec[k]).filter((x) => x != null);
    const r = rule(g('F'), g('V'));
    const loop = r.verdict === 'no-worse' && L.startsWith('rest') && r.F.every((x) => x <= 5) && r.V.every((x) => x >= 15);
    out.push({ item: `1a ${L} ${k}`, ...r, verdict: loop ? 'WORSE (new rest loop)' : r.verdict });
  }
  if (!labels.length) out.push({ item: '1a', verdict: `insufficient (no records)` });
  return out;
}
// 1c rest stops (idle windows) from full loads
export function read1cRest(loads) {
  const ok = loads.filter((l) => !l.void || /^scroll check: /.test(l.void)); // a scroll-check VOID leaves the idle stops valid
  const SF = ok.filter((l) => l.arm === 'F').slice(0, N), SV = ok.filter((l) => l.arm === 'V').slice(0, N);
  const out = [];
  const stops = (SF[0] || SV[0])?.windows.filter((w) => w.kind === 'idle').map((w) => w.stop) || [];
  for (const st of stops) for (const k of ['renderingFrames', 'layouts', 'styleRecalcs']) {
    const g = (L) => L.map((l) => l.windows.find((w) => w.stop === st)?.[k]).filter((x) => x != null);
    const r = rule(g(SF), g(SV));
    const nw = r.verdict === 'no-worse' && k === 'renderingFrames' && r.F.every((x) => x <= 2) && r.V.every((x) => x >= 10);
    out.push({ item: `1c ${st} ${k}`, ...r, verdict: nw ? 'WORSE (new rest work)' : r.verdict });
  }
  if (!stops.length) out.push({ item: '1c rest', verdict: 'insufficient (no loads)' });
  return out;
}
// 1c scroll item: only windows passing scrollCheck count
export function read1cScroll(loads, opts = {}) { // opts.B: the bound (default sim92check's pinned BOUND_B)
  const valid = (l) => { const w = l.windows.find((x) => x.kind === 'scroll'); return w && !l.void && scrollCheck(w, opts).ok ? w : null; };
  const pick = (arm) => loads.filter((l) => l.arm === arm).map(valid).filter(Boolean).slice(0, N);
  const WF = pick('F'), WV = pick('V');
  const failed = loads.filter((l) => { const w = l.windows.find((x) => x.kind === 'scroll'); return !w || !scrollCheck(w, opts).ok; })
    .map((l) => `${l.arm}${l.rep}: ${(scrollCheck(l.windows.find((x) => x.kind === 'scroll'), opts).why || []).join(', ')}`);
  return [['layouts/frame', (w) => w.perFrame.layouts], ['styleRecalcs/frame', (w) => w.perFrame.styleRecalcs]]
    .map(([k, f]) => ({ item: `1c top->end ${k}`, ...rule(WF.map(f), WV.map(f)), floor0: rule(WF.map(f), WV.map(f), 0).verdict, failedChecks: failed }));
}
export function readPart1({ chrome, sim, scroll }) {
  const items = [...read1a(chrome), ...read1cRest(sim), ...read1cScroll(scroll || sim)];
  return { items, verdict: fold(items.map((x) => x.verdict)) };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const a = process.argv.slice(2), opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const logP = join(WT, opt('--log', 'out/v92/part1.log')), simP = join(WT, opt('--sim', 'out/v92/sim/p142.json')), scP = opt('--scroll', null);
  const log = fs.readFileSync(logP, 'utf8');
  const chrome = [...log.matchAll(/^RECORD (\S+)$/gm)].map((m) => JSON.parse(fs.readFileSync(join(WT, m[1]), 'utf8')));
  const sim = JSON.parse(fs.readFileSync(simP, 'utf8')).loads;
  const scroll = scP ? JSON.parse(fs.readFileSync(join(WT, scP), 'utf8')).loads : null;
  const r = readPart1({ chrome, sim, scroll });
  console.log(`1a loads ${chrome.map((j) => j.arm)}; 1c loads ${sim.map((l) => l.arm + l.rep + (l.void ? ' VOID' : ''))}${scroll ? `; scroll loads ${scroll.map((l) => l.arm + l.rep + (l.void ? ' VOID' : ''))}` : ''}`);
  for (const x of r.items) console.log(`${x.item}: F ${x.F ?? '-'} V ${x.V ?? '-'}${x.d != null ? ` d ${x.d} thr ${x.thr}` : ''} -> ${x.verdict}${x.floor0 ? ` (report: floor 0 ${x.floor0})` : ''}${x.failedChecks?.length ? ` (scroll check failed: ${x.failedChecks.join(' | ')})` : ''}`);
  console.log(`PART1 ${r.verdict}`);
}

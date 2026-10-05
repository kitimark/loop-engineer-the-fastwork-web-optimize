#!/usr/bin/env node
// PR-025 B cost card reader (frozen before data; card: fixes/end-bg/README.md "B cost card"). Pure reader: no device.
//   node fixes/end-bg/img/cost-b.mjs --chrome <out/end-bg/images/img-scroll-<stamp>.json> --sim out/end-bg/simb [--json f]
//   node fixes/end-bg/img/cost-b.mjs --selftest
// CHROME (fixes/end-bg/img-scroll.mjs, arms C and B, 3 rounds, arms alternate, cache off, counts only): per run
//   bytes = image bytes over the network (encodedDataLength), files = image responses, bad = image responses with a
//   status other than 200, decLoad = image decode events during the load, decAll = load + scroll, pImg = PaintImage
//   during the scroll, paint = Paint during the scroll, raster = RasterTask during the scroll.
// SIMULATOR (fixes/end-bg/img/sim-b.sh, 2 sessions, one load + fs gesture per arm each; img-inject.mjs counts): per run
//   bytes = sum of encodedBodySize of picture resources, files, avifOk / avifBad (decode test), broken <img>.
// RULES (C = control, B = option B):
//   R1 less download   Chrome max(B bytes) < min(C bytes), and Simulator max(B bytes) < min(C bytes).
//   R2 fewer decodes   Chrome max(B decLoad) < min(C decLoad). Reported with R1; the card's LESS needs R1 and R2.
//   R3 no more redraw  for pImg, paint, raster: WORSE when min(B) > max(C) (Chrome); NO-WORSE when no field is WORSE.
//   R4 works           every B run: Chrome bad = 0; Simulator avifBad = 0, avifFiles >= 1, broken <= the C run's of
//                      the same session.
//   R5 enough data     Chrome >= 3 runs per arm, Simulator >= 2 per arm, else INSUFFICIENT.
//   CARD: INSUFFICIENT (R5) | BROKEN (R4 fails) | PASS (R1, R2, R3 NO-WORSE, R4) | NOT-LESS (R1 or R2 fails, R3 and R4
//   hold) | WORSE (R3 WORSE, R4 holds; named per field).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { counts } = await import(pathToFileURL(join(here, 'img-inject.mjs')).href);
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

export function chromeRuns(j) {
  return j.runs.map((r) => ({ arm: r.arm, bytes: r.network.bytes, files: r.network.n, bad: r.network.images.filter((i) => i.status !== 200).length,
    decLoad: r.load.decodes, decAll: r.load.decodes + r.scroll.decodes, pImg: r.scroll.paintImageN, paint: r.scroll.paint, raster: r.scroll.raster }));
}
export function simRuns(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^K\d+-[CB]\.json$/.test(f)).sort().map((f) => {
    const g = JSON.parse(readFileSync(join(dir, f), 'utf8')); let v = g.run?.inject?.[0]?.value; try { v = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { v = null; }
    const [, tag, arm] = /^(K\d+)-([CB])\.json$/.exec(f); return { tag, arm, ...(counts(v) || { none: 1 }) };
  });
}
const below = (b, c) => b.length && c.length && Math.max(...b) < Math.min(...c);
const above = (b, c) => b.length && c.length && Math.min(...b) > Math.max(...c);
export function decide(ch, sim) {
  const C = ch.filter((r) => r.arm === 'C'), B = ch.filter((r) => r.arm === 'B'), sC = sim.filter((r) => r.arm === 'C'), sB = sim.filter((r) => r.arm === 'B');
  const v = (rs, k) => rs.map((r) => r[k]);
  if (C.length < 3 || B.length < 3 || sC.length < 2 || sB.length < 2 || sim.some((r) => r.none)) return { card: 'INSUFFICIENT', why: `Chrome C ${C.length} B ${B.length}, Simulator C ${sC.length} B ${sB.length}${sim.some((r) => r.none) ? ', a Simulator run without counts' : ''}` };
  const R1 = !!(below(v(B, 'bytes'), v(C, 'bytes')) && below(v(sB, 'bytes'), v(sC, 'bytes')));
  const R2 = !!below(v(B, 'decLoad'), v(C, 'decLoad'));
  const worse = ['pImg', 'paint', 'raster'].filter((k) => above(v(B, k), v(C, k)));
  const r4why = [];
  for (const r of B) if (r.bad) r4why.push(`Chrome B ${r.bad} image responses not 200`);
  for (const r of sB) { if (r.avifBad) r4why.push(`Simulator ${r.tag} B ${r.avifBad} AVIF not decoded`); if (!(r.avifFiles >= 1)) r4why.push(`Simulator ${r.tag} B fetched no AVIF`);
    const c = sC.find((x) => x.tag === r.tag); if (c && r.imgBroken > c.imgBroken) r4why.push(`Simulator ${r.tag} B broken ${r.imgBroken} > C ${c.imgBroken}`); }
  const card = r4why.length ? 'BROKEN' : worse.length ? 'WORSE' : R1 && R2 ? 'PASS' : 'NOT-LESS';
  const m = (rs, k) => med(v(rs, k));
  return { card, R1, R2, R3: worse.length ? `WORSE ${worse.join(', ')}` : 'NO-WORSE', R4: r4why.length ? r4why : 'ok',
    medians: { chrome: Object.fromEntries(['bytes', 'files', 'decLoad', 'decAll', 'pImg', 'paint', 'raster'].map((k) => [k, { C: m(C, k), B: m(B, k) }])),
      sim: Object.fromEntries(['bytes', 'files', 'avifFiles', 'avifOk', 'imgBroken'].map((k) => [k, { C: m(sC, k), B: m(sB, k) }])) } };
}
function selftest() {
  const ok = (a, b, m) => { if (a !== b) { console.log(`SELFTEST FAIL ${m}: ${a} != ${b}`); process.exit(1); } };
  const c = (arm, bytes, dec, p = 900, bad = 0) => ({ arm, bytes, files: 89, bad, decLoad: dec, decAll: dec + 5, pImg: p, paint: 1300, raster: 980 });
  const s = (tag, arm, bytes, avifBad = 0, imgBroken = 0) => ({ tag, arm, bytes, files: 89, avifFiles: arm === 'B' ? 33 : 0, avifOk: arm === 'B' ? 33 - avifBad : 0, avifBad, imgBroken });
  const CH = [c('C', 10e6, 36), c('B', 4.5e6, 16), c('B', 4.5e6, 16), c('C', 10e6, 36), c('C', 10e6, 35), c('B', 4.5e6, 17)];
  const SI = [s('K1', 'C', 10e6), s('K1', 'B', 4.5e6), s('K2', 'B', 4.5e6), s('K2', 'C', 10e6)];
  ok(decide(CH, SI).card, 'PASS', 'pass');
  ok(decide(CH.slice(0, 4), SI).card, 'INSUFFICIENT', 'too few');
  ok(decide(CH, [s('K1', 'C', 10e6), s('K1', 'B', 4.5e6, 1), s('K2', 'B', 4.5e6), s('K2', 'C', 10e6)]).card, 'BROKEN', 'avif fail');
  ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, pImg: 990 } : r)), SI).card, 'WORSE', 'redraw worse');
  ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, decLoad: 36 } : r)), SI).card, 'NOT-LESS', 'decodes not fewer');
  ok(decide(CH, [s('K1', 'C', 10e6), s('K1', 'B', 10e6), s('K2', 'B', 4.5e6), s('K2', 'C', 10e6)]).R1, false, 'sim bytes overlap');
  ok(counts({ entries: { '/a.avif': [0, 100, 200], '/b.jpg': [50, 60, 70] }, avif: { '/a.avif': 'ok' }, imgs: [['/b.jpg', 1, 0]] }).imgBroken, 1, 'counts broken');
  console.log('SELFTEST ok (7 checks)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (a[0] === '--selftest') { selftest(); process.exit(0); }
  if (!arg('--chrome') || !arg('--sim')) { console.log('usage: cost-b.mjs --chrome <img-scroll json> --sim <dir> [--json f] | --selftest'); process.exit(a[0] === '--help' ? 0 : 2); }
  const ch = chromeRuns(JSON.parse(readFileSync(arg('--chrome'), 'utf8'))), sim = simRuns(arg('--sim'));
  for (const r of ch) console.log(`  chrome ${r.arm} bytes ${r.bytes} files ${r.files} bad ${r.bad} decLoad ${r.decLoad} decAll ${r.decAll} pImg ${r.pImg} paint ${r.paint} raster ${r.raster}`);
  for (const r of sim) console.log(`  sim ${r.tag} ${r.arm} ${JSON.stringify(r)}`);
  const d = decide(ch, sim); console.log(`CARD ${d.card} | R1 ${d.R1} R2 ${d.R2} R3 ${d.R3} R4 ${JSON.stringify(d.R4)}${d.why ? ' | ' + d.why : ''}`);
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ chrome: ch, sim, decision: d }, null, 1));
}

#!/usr/bin/env node
// PR-025 B cost card reader (frozen before data; card: fixes/end-bg/README.md section 10, rev 1.1). Pure reader: no device.
//   node fixes/end-bg/img/cost-b.mjs --chrome <out/end-bg/images/img-scroll-<stamp>.json> --sim out/end-bg/simb [--json f]
//   node fixes/end-bg/img/cost-b.mjs --selftest
// CHROME (fixes/end-bg/img-scroll.mjs, arms C and B, 3 rounds, arms alternate, cache off, counts only): per run
//   bytes = image bytes over the network (encodedDataLength), files = image responses, bad = image responses with a
//   status other than 200, decLoad = image decode events during the load, decAll = load + scroll, pImg = PaintImage
//   during the scroll, paint = Paint during the scroll, raster = RasterTask during the scroll.
// SIMULATOR (fixes/end-bg/img/sim-b.sh, one load + fs gesture per arm per session; img-inject.mjs counts): per run, from
//   img-inject's counts(): bytes = encodedBytes (sum of encodedBodySize of picture resources), files, avifFiles, avifOk,
//   avifBad (every AVIF whose decode test is not 'ok': 'fail', 'zero' and a still 'pending' test all count as failures),
//   imgBroken. A record counts only when its gesture exited 0 (sim-b.sh renames other records to <tag>-<arm>.fail.json)
//   and its counter saw no Resource Timing buffer overflow (bufferFull > 0: no counts for that run).
// RULES (C = control, B = option B; rev 1.1, ops-reader-P150 F1):
//   R1 less download   Chrome max(B bytes) < min(C bytes), and Simulator max(B bytes) < min(C bytes).
//   R2 fewer decodes   Chrome max(B decAll) < min(C decAll): load + scroll, so the lazy edit's deferral of wall decodes
//                      from the load into the scroll cannot count as fewer decodes. decLoad is reported, decides nothing.
//   R3 no more work    for decAll ("decAll not more"), pImg, paint, raster: WORSE when min(B) > max(C) (Chrome);
//                      NO-WORSE when no field is WORSE.
//   R4 works           every B run: Chrome bad = 0; Simulator avifBad = 0, avifFiles >= 1, broken <= the C run's of
//                      the same session.
//   R5 enough data     Chrome >= 3 runs per arm, Simulator >= 2 counted runs per arm, else INSUFFICIENT.
//   CARD: INSUFFICIENT (R5) | BROKEN (R4 fails) | WORSE (R3 WORSE, named per field) | PASS (R1, R2, R3 NO-WORSE, R4) |
//   NOT-LESS (anything else).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { counts } = await import(pathToFileURL(join(here, 'img-inject.mjs')).href);
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

export function chromeRuns(j) {
  return j.runs.map((r) => ({ arm: r.arm, bytes: r.network.bytes, files: r.network.n, bad: r.network.images.filter((i) => i.status !== 200).length,
    decLoad: r.load.decodes, decAll: r.load.decodes + r.scroll.decodes, pImg: r.scroll.paintImageN, paint: r.scroll.paint, raster: r.scroll.raster }));
}
/** Simulator runs: one row per counted record; `none` marks a record without usable counts. */
export function simRuns(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^K\d+-[CB]\.json$/.test(f)).sort().map((f) => {
    const g = JSON.parse(readFileSync(join(dir, f), 'utf8')); let v = g.run?.inject?.[0]?.value; try { v = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { v = null; }
    const [, tag, arm] = /^(K\d+)-([CB])\.json$/.exec(f); const c = counts(v);
    if (!c) return { tag, arm, none: 'no counter value' };
    if (c.bufferFull > 0) return { tag, arm, none: `Resource Timing buffer full ${c.bufferFull}x` };
    return { tag, arm, ...c, bytes: c.encodedBytes };
  });
}
const below = (b, c) => b.length && c.length && Math.max(...b) < Math.min(...c);
const above = (b, c) => b.length && c.length && Math.min(...b) > Math.max(...c);
export function decide(ch, simAll) {
  const sim = simAll.filter((r) => !r.none);
  const C = ch.filter((r) => r.arm === 'C'), B = ch.filter((r) => r.arm === 'B'), sC = sim.filter((r) => r.arm === 'C'), sB = sim.filter((r) => r.arm === 'B');
  const v = (rs, k) => rs.map((r) => r[k]);
  if (C.length < 3 || B.length < 3 || sC.length < 2 || sB.length < 2) return { card: 'INSUFFICIENT', why: `Chrome C ${C.length} B ${B.length}, Simulator counted C ${sC.length} B ${sB.length}${simAll.some((r) => r.none) ? ` (uncounted: ${simAll.filter((r) => r.none).map((r) => `${r.tag}-${r.arm} ${r.none}`).join('; ')})` : ''}` };
  const sb = (rs) => rs.map((r) => r.bytes ?? r.encodedBytes); // Simulator rows carry encodedBytes (simRuns also sets bytes)
  const R1 = !!(below(v(B, 'bytes'), v(C, 'bytes')) && below(sb(sB), sb(sC)));
  const R2 = !!below(v(B, 'decAll'), v(C, 'decAll'));
  const worse = ['decAll', 'pImg', 'paint', 'raster'].filter((k) => above(v(B, k), v(C, k))); // decAll here = "decAll not more"
  const r4why = [];
  for (const r of B) if (r.bad) r4why.push(`Chrome B ${r.bad} image responses not 200`);
  for (const r of sB) { if (r.avifBad) r4why.push(`Simulator ${r.tag} B ${r.avifBad} AVIF not decoded ok`); if (!(r.avifFiles >= 1)) r4why.push(`Simulator ${r.tag} B fetched no AVIF`);
    const c = sC.find((x) => x.tag === r.tag); if (c && r.imgBroken > c.imgBroken) r4why.push(`Simulator ${r.tag} B broken ${r.imgBroken} > C ${c.imgBroken}`); }
  const card = r4why.length ? 'BROKEN' : worse.length ? 'WORSE' : R1 && R2 ? 'PASS' : 'NOT-LESS';
  const m = (rs, k) => med(v(rs, k));
  return { card, R1, R2, R3: worse.length ? `WORSE ${worse.join(', ')}` : 'NO-WORSE', R4: r4why.length ? r4why : 'ok',
    medians: { chrome: Object.fromEntries(['bytes', 'files', 'decLoad', 'decAll', 'pImg', 'paint', 'raster'].map((k) => [k, { C: m(C, k), B: m(B, k) }])),
      sim: Object.fromEntries(['encodedBytes', 'files', 'avifFiles', 'avifOk', 'imgBroken'].map((k) => [k, { C: m(sC, k), B: m(sB, k) }])) } };
}
function selftest() {
  const ok = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`SELFTEST FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  const c = (arm, bytes, dec, p = 900, bad = 0, scrollDec = 5) => ({ arm, bytes, files: 89, bad, decLoad: dec, decAll: dec + scrollDec, pImg: p, paint: 1300, raster: 980 });
  const CH = [c('C', 10e6, 36), c('B', 4.5e6, 16), c('B', 4.5e6, 16), c('C', 10e6, 36), c('C', 10e6, 35), c('B', 4.5e6, 17)];
  // Simulator rows go through the real path: gesture-like records in a temp dir -> simRuns -> counts()
  const D = mkdtempSync(join(tmpdir(), 'cost-b-'));
  const rec = (tag, arm, { big = arm === 'C', avif = arm === 'B' ? 'ok' : null, full = 0, broken = 0 } = {}) => {
    const entries = {}; for (let i = 0; i < 10; i++) entries[`/p${i}.${avif ? 'avif' : 'jpg'}`] = [0, big ? 1e6 : 4.5e5, 2e6];
    const v = { full, entries, avif: avif ? Object.fromEntries(Object.keys(entries).map((p) => [p, avif])) : {}, imgs: Array.from({ length: broken }, (_, i) => [`/b${i}.jpg`, 1, 0]) };
    writeFileSync(join(D, `${tag}-${arm}.json`), JSON.stringify({ run: { inject: [{ name: 'imgb', value: JSON.stringify(v) }] } }));
  };
  const reset = () => { for (const f of readdirSync(D)) rmSync(join(D, f)); };
  try {
    rec('K1', 'C'); rec('K1', 'B'); rec('K2', 'B'); rec('K2', 'C');
    const SI = simRuns(D);
    ok(SI.find((r) => r.tag === 'K1' && r.arm === 'B').bytes, 4.5e6, 'sim bytes = encodedBytes');
    ok(decide(CH, SI).card, 'PASS', 'pass through simRuns');
    ok(decide(CH, SI).R1, true, 'R1 sim half true when bytes separate');
    reset(); rec('K1', 'C'); rec('K1', 'B', { big: true }); rec('K2', 'B'); rec('K2', 'C');
    ok(decide(CH, simRuns(D)).R1, false, 'R1 sim half false on overlap');
    reset(); rec('K1', 'C'); rec('K1', 'B', { avif: 'pending' }); rec('K2', 'B'); rec('K2', 'C');
    ok(decide(CH, simRuns(D)).card, 'BROKEN', 'pending AVIF counts as a failure');
    reset(); rec('K1', 'C'); rec('K1', 'B', { full: 1 }); rec('K2', 'B'); rec('K2', 'C');
    ok(decide(CH, simRuns(D)).card, 'INSUFFICIENT', 'buffer full: no counts');
    reset(); rec('K1', 'C'); rec('K1', 'B'); rec('K2', 'B'); rec('K2', 'C');
    const S2 = simRuns(D);
    ok(decide(CH.slice(0, 4), S2).card, 'INSUFFICIENT', 'too few Chrome');
    ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, pImg: 990 } : r)), S2).card, 'WORSE', 'redraw worse');
    // lazy deferral: fewer decodes in the load but the same over load + scroll is not "fewer decodes"
    ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, decAll: 41 } : r)), S2).card, 'NOT-LESS', 'R2 on decAll');
    ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, decLoad: 36 } : r)), S2).card, 'PASS', 'decLoad decides nothing');
    // rows that carry only encodedBytes (no bytes field), 10x apart: R1's Simulator half holds (lead F1 ruling)
    const raw = (tag, arm, eb) => ({ tag, arm, encodedBytes: eb, files: 10, avifFiles: arm === 'B' ? 10 : 0, avifOk: arm === 'B' ? 10 : 0, avifBad: 0, imgBroken: 0 });
    const d10 = decide(CH, [raw('K1', 'C', 1e7), raw('K1', 'B', 1e6), raw('K2', 'B', 1e6), raw('K2', 'C', 1e7)]);
    ok([d10.card, d10.R1], ['PASS', true], 'encodedBytes-only rows 10x apart: PASS');
    ok(decide(CH.map((r) => (r.arm === 'B' ? { ...r, decAll: 60 } : r)), S2).R3, 'WORSE decAll', 'decAll more is WORSE');
  } finally { rmSync(D, { recursive: true, force: true }); }
  ok(counts({ entries: { '/a.avif': [0, 100, 200], '/b.jpg': [50, 60, 70] }, avif: { '/a.avif': 'ok' }, imgs: [['/b.jpg', 1, 0]] }).imgBroken, 1, 'counts broken');
  console.log('SELFTEST ok (13 checks)');
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

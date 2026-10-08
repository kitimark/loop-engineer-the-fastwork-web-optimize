#!/usr/bin/env node
// P-165 scorer (card: fixes/g0-box/README.md "P-165", signed c31626f2; written before any P-165 data). A pure reader:
// no device, no measurement. S leg (DS1-DS3) and the block's sentinel chain; it lists the valid G runs for g0b-read.mjs
// (D1-D3 stay in g0b-read.mjs, unchanged).
// It imports P-105's committed scorer unchanged (fixes/v7-best/phone/score.mjs, sha256 b9a29ffcc7bb, refused if changed)
// and uses its median, gate (d = median V - median C, WORSE at d > +2, twins, minimum runs), clusters (the new-cluster
// rule) and applySentinel (the sentinel chain). Its scoreS checks v6/v7 pins, so the S run check is P-165's own (below),
// as P-118's scorer did.
//   node fixes/g0-box/phone/p165-score.mjs <block dir, e.g. out/p165> [--json out.json]
//   node fixes/g0-box/phone/p165-score.mjs --selftest
// Input: the block's hold logs <dir>/hold-H<n>.log (VALID holds only, in hold order; a hold's RUN lines give the block
// order) and the run records <dir>/runs/: S counted s-<item>.json, sC s-sC-<H>.json; G counted g-<item>.json (the
// GATES lines of the hold log decide G run validity).
// S run (counted C<n>/V<n>, re-run <item>x; sentinels C<n> and sC) is VOID when: no record or not an S record
//   (schema fw-iphone-run/1, driver S); meta.error; the served JS/CSS (meta.served) is not the arm's pin (prefix rule);
//   Low Power Mode (settings.lowPowerMode or lowPowerSuspect); no idle/bottom marks; meta.profile.name is not
//   real-serious, or meta.profileDrift is true (I-246: the hold's end read did not fit).
// Timed window: frames with t in [marks.idle[0], marks.bottom[0]) (P-105), dt counted at > 50 (46, 54) and > 34 (30, 38);
//   each frame's spot is the 250 px bin of its scrollY (yEnd, the probe's field).
// Sentinel chain (P-105's applySentinel over the block order, both legs): every counted C S run and every sC is a
//   sentinel (meta.sentinel.pass); a failing or missing one voids itself (if counted) and every counted run since the last
//   passing one. A G counted run is VOID when its GATES line is INVALID, its hold printed ITEM <run> VOID, or it has no
//   record. For each base run (C1, EV2, ...) the first valid of <base>, <base>r, <base>x is used.
// DS1 (no-worse): P-105's gate on the per-run timed counts: WORSE at d > +2 (> 50); twins 46 / 54 -> threshold-sensitive.
// DS2 (no-worse anywhere): P-105's clusters on the timed window's bins: any NEW cluster at > 50 fails; twins 46 / 54.
// DS3 (better where claimed): BETTER at T in {50, 34} when every valid V run is below every valid C run (max V < min C)
//   and d <= -2; twins (46/54 for 50, 30/38 for 34) mark it threshold-sensitive when their verdict differs.
// S verdict: insufficient (< 3 valid runs per arm) | FAIL (DS1 WORSE or DS2 NEW CLUSTER) | OPEN (no FAIL, a twin flips
//   DS1 or DS2) | PASS. DS3 is reported beside it.
// Prints "GRUNS <list>": the valid G runs for `node fixes/g0-box/phone/g0b-read.mjs <dir>/runs --runs <list>`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const basePath = join(here, '../../v7-best/phone/score.mjs');
const baseSha = createHash('sha256').update(readFileSync(basePath)).digest('hex');
if (!baseSha.startsWith('b9a29ffcc7bb')) { console.error(`P-105 scorer changed (${baseSha.slice(0, 12)}, pinned b9a29ffcc7bb): refuse`); process.exit(3); }
const { median, gate, clusters, applySentinel } = await import(pathToFileURL(basePath).href);
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const PINS = { C: { js: '4606120cf392', css: '27776f3d4138' }, V: { js: '30fd80ccbb3f', css: '1d1e5d62a2c4' } };
const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSS = '/_app/immutable/assets/2.gBuqKVzi.css';
const TH = { gt50: 50, gt46: 46, gt54: 54, gt34: 34, gt30: 30, gt38: 38 };
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function scoreS(j, arm) {
  const v = [];
  if (!j || j?.meta?.schema !== 'fw-iphone-run/1' || j.meta.driver !== 'S') return { void: ['not an S run record'], sentinel: null, timed: null, bins: null };
  const m = j.meta;
  if (m.error) v.push(`run error: ${String(m.error).slice(0, 80)}`);
  const sv = m.served || {};
  if (!(prefixOk(sv[NODE], PINS[arm].js) && prefixOk(sv[CSS], PINS[arm].css))) v.push(`served not arm ${arm} (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSS] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) v.push('Low Power Mode');
  if (m.profile?.name !== 'real-serious') v.push(`profile ${m.profile?.name ?? 'none'} (not real-serious)`);
  if (m.profileDrift === true || m.profile?.drift === true) v.push('profile drift at the hold end');
  const mk = j.marks || {};
  let timed = null, bins = null;
  if (mk.idle?.[0] == null || mk.bottom?.[0] == null) v.push('no idle/bottom marks');
  else {
    const f = j.fields || [], it = f.indexOf('t'), id = f.indexOf('dt'), iy = f.indexOf('yEnd');
    const T = (j.frames || []).filter((r) => r[id] != null && r[it] >= mk.idle[0] && r[it] < mk.bottom[0]);
    timed = { frames: T.length, ...Object.fromEntries(Object.entries(TH).map(([k, th]) => [k, T.filter((r) => r[id] > th).length])) };
    bins = Object.fromEntries(Object.entries(TH).map(([k, th]) => [k, [...new Set(T.filter((r) => r[id] > th).map((r) => Math.floor(r[iy] / 250)))].sort((a, b) => a - b)]));
  }
  return { void: v, sentinel: m.sentinel ?? null, tempStart: m.battery?.start?.temperatureC ?? null, timed, bins };
}

/** parse the hold logs of VALID holds, in hold order -> [{hold, item, gates}] */
export function readOrder(logs) {
  const num = (h) => { const m = h.match(/^H(\d+)(.*)$/); return m ? [Number(m[1]), m[2]] : [1e9, h]; };
  const hs = Object.keys(logs).sort((a, b) => { const [x, xs] = num(a), [y, ys] = num(b); return x - y || String(xs).localeCompare(String(ys)); });
  const out = [];
  for (const h of hs) {
    const t = logs[h];
    const last = (t.match(new RegExp(`^HOLD ${h} (VALID|VOID|DRY).*$`, 'gm')) || []).pop() || '';
    if (!/^HOLD \S+ VALID/.test(last)) continue;
    for (const m of t.matchAll(/^RUN (\S+) arm (\S+) exit (\d+)/gm)) {
      const item = m[1];
      const g = (t.match(new RegExp(`^GATES ${item} E (ok|INVALID.*)$`, 'm')) || [])[1] ?? null;
      const itemVoid = new RegExp(`^ITEM ${item} VOID`, 'm').test(t);
      out.push({ hold: h, item, arm: m[2], exit: Number(m[3]), gates: g, itemVoid });
    }
  }
  return out;
}

const better = (C, V, k) => {
  if (C.length < 3 || V.length < 3) return null;
  const c = C.map((x) => x[k]), v = V.map((x) => x[k]), d = median(v) - median(c);
  return Math.max(...v) < Math.min(...c) && d <= -2;
};

/** entries: [{hold, item, arm, exit, gates, itemVoid, j}] in block order (j = the S record for S items) */
export function scoreBlock(entries) {
  const runs = [];
  for (const e of entries) {
    const it = e.item;
    if (/^(w[CV]|W[CV])$/.test(it)) continue; // warm-ups
    const S = /^([CV][1-8]x?|sC)$/.test(it), G = /^E[CV][1-4][rx]?$/.test(it);
    if (!S && !G) continue;
    if (S) {
      const arm = it === 'sC' ? 'C' : it[0];
      const r = scoreS(e.j, arm);
      runs.push({ ...e, kind: 'S', arm, base: it === 'sC' ? null : it.replace(/x$/, ''), sentinelOnly: it === 'sC', isSentinel: arm === 'C', ...r });
    } else {
      const v = [];
      if (e.itemVoid || e.exit !== 0) v.push(`run exit ${e.exit}${e.itemVoid ? ', ITEM VOID' : ''}`);
      if (e.gates !== 'ok') v.push(`run gates ${e.gates ?? 'missing'}`);
      runs.push({ ...e, kind: 'G', arm: it[1], base: it.replace(/[rx]$/, ''), isSentinel: false, sentinel: null, void: v });
    }
  }
  applySentinel(runs);
  const pick = (kind) => {
    const by = new Map();
    for (const r of runs) if (r.kind === kind && r.base && !r.void.length && !by.has(r.base)) by.set(r.base, r);
    return [...by.values()];
  };
  const S = pick('S'), Gv = pick('G');
  const Cs = S.filter((r) => r.arm === 'C'), Vs = S.filter((r) => r.arm === 'V');
  const out = { runs: runs.map(({ j, ...r }) => r), S: {} };
  const ds1 = gate(Cs.map((r) => r.timed), Vs.map((r) => r.timed), 3);
  out.S.DS1 = ds1;
  if (/^insufficient/.test(ds1.verdict)) { out.S.verdict = 'insufficient'; }
  else {
    const cl = clusters(Cs, Vs, 'gt50');
    const tw = ['gt46', 'gt54'].map((k) => clusters(Cs, Vs, k).newClusters.length > 0);
    const ds2 = { ...cl, fail: cl.newClusters.length > 0 };
    ds2.thresholdSensitive = tw.some((x) => x !== ds2.fail);
    out.S.DS2 = ds2;
    const ds3 = {};
    for (const [T, tw2] of [['gt50', ['gt46', 'gt54']], ['gt34', ['gt30', 'gt38']]]) {
      const b = better(Cs.map((r) => r.timed), Vs.map((r) => r.timed), T);
      const ts = tw2.map((k) => better(Cs.map((r) => r.timed), Vs.map((r) => r.timed), k));
      ds3[T] = { better: b, thresholdSensitive: ts.some((x) => x !== b), d: median(Vs.map((r) => r.timed[T])) - median(Cs.map((r) => r.timed[T])), C: Cs.map((r) => r.timed[T]), V: Vs.map((r) => r.timed[T]) };
    }
    out.S.DS3 = ds3;
    const fail = /^WORSE/.test(ds1.gt50) || ds2.fail;
    const ts = ds1.thresholdSensitive || ds2.thresholdSensitive;
    out.S.verdict = fail ? 'FAIL' : ts ? 'OPEN' : 'PASS';
  }
  out.S.valid = { C: Cs.map((r) => r.item), V: Vs.map((r) => r.item) };
  out.G = { valid: Gv.map((r) => r.item), C: Gv.filter((r) => r.arm === 'C').length, V: Gv.filter((r) => r.arm === 'V').length };
  out.sentinels = runs.filter((r) => r.isSentinel).map((r) => ({ item: r.item, hold: r.hold, pass: r.sentinel?.pass ?? null, tempStart: r.tempStart ?? null }));
  return out;
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const fields = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs', 'docH'];
  // a synthetic S record: 400 timed frames of 17 ms down the page, plus slow frames {dt, y}
  const mk = (arm, slow, extra = {}) => {
    const frames = [[0, null, 0, 0, 775, 0, null, 0, null]];
    for (let i = 1; i <= 400; i++) frames.push([1000 + i * 17, 17, (i - 1) * 13, i * 13, 775, 0, 0, 0, 6035]);
    slow.forEach(([dt, y], k) => frames.push([1000 + 401 * 17 + k, dt, y, y, 775, 0, 0, 0, 6035]));
    return { meta: { schema: 'fw-iphone-run/1', driver: 'S', served: { [NODE]: PINS[arm].js + 'aaaa', [CSS]: PINS[arm].css + 'bbbb' }, profile: { name: 'real-serious' }, sentinel: arm === 'C' ? { pass: true } : null, ...extra }, fields, frames, marks: { idle: [1000, 2000], bottom: [9000, 12000] } };
  };
  const rep = (n, dt, y) => Array.from({ length: n }, (_, i) => [dt, y + i * 300]);
  const block = (Cslow, Vslow, opt = {}) => {
    const order = ['C1', 'V2', 'V3', 'C4', 'C5', 'V6', 'V7', 'C8'];
    let ci = 0, vi = 0;
    return order.map((it) => ({ hold: 'H1', item: it, arm: it[0], exit: 0, gates: null, itemVoid: false, j: it[0] === 'C' ? mk('C', Cslow[ci++ % Cslow.length], opt[it]) : mk('V', Vslow[vi++ % Vslow.length], opt[it]) }));
  };
  // 1. PASS and BETTER: C 5 frames > 50 per run spread over the page, V 1
  let r = scoreBlock(block([rep(5, 80, 100)], [rep(1, 80, 100)]));
  ok(r.S.verdict === 'PASS', `1 verdict ${r.S.verdict}`); ok(r.S.DS3.gt50.better === true, '1 DS3 >50 better'); ok(r.S.DS1.delta.gt50 === -4, `1 d ${r.S.DS1.delta?.gt50}`);
  // 2. NEW CLUSTER: V adds a > 50 frame at y 4100 in every run, C has none within +-250 px; counts stay within +2
  r = scoreBlock(block([rep(2, 80, 100)], [[...rep(2, 80, 100), [80, 4100]]]));
  ok(r.S.DS2.fail === true && r.S.DS2.newClusters.includes('4000-4249'), `2 new cluster ${JSON.stringify(r.S.DS2)}`); ok(r.S.verdict === 'FAIL', `2 verdict ${r.S.verdict}`); ok(!/^WORSE/.test(r.S.DS1.gt50), '2 DS1 no-worse');
  // 3. twin flip on DS1: V has 5 frames of 52 ms, C 2: d50 = +3 WORSE, d54 = 0 no-worse -> FAIL and threshold-sensitive
  r = scoreBlock(block([rep(2, 52, 100)], [rep(5, 52, 100)]));
  ok(/^WORSE/.test(r.S.DS1.gt50) && r.S.DS1.thresholdSensitive === true, `3 twin flip ${JSON.stringify(r.S.DS1)}`);
  // 4. twin flip on DS3: C 4 frames of 52 ms, V 0: better at 50 and 46, not at 54 -> threshold-sensitive
  r = scoreBlock(block([rep(4, 52, 100)], [[]]));
  ok(r.S.DS3.gt50.better === true && r.S.DS3.gt50.thresholdSensitive === true, `4 DS3 twin ${JSON.stringify(r.S.DS3.gt50)}`);
  // 5. OPEN: no FAIL, a DS2 twin flips (V cluster of 48 ms frames: new at > 46 only)
  r = scoreBlock(block([rep(1, 80, 100)], [[...rep(1, 80, 100), [48, 4100]]]));
  ok(r.S.verdict === 'OPEN' && r.S.DS2.fail === false && r.S.DS2.thresholdSensitive === true, `5 open ${r.S.verdict} ${JSON.stringify(r.S.DS2)}`);
  // 6. sentinel chain: C4 fails -> V2, V3, C4 void; with C4x re-run after, C has C1 C4x C5 C8; V has V6 V7 only -> insufficient
  const b6 = block([rep(5, 80, 100)], [rep(1, 80, 100)], { C4: { sentinel: { pass: false } } });
  r = scoreBlock(b6);
  ok(r.runs.find((x) => x.item === 'V2').void.some((v) => /voided by failing sentinel C4/.test(v)), '6 V2 voided by C4');
  ok(r.S.verdict === 'insufficient', `6 verdict ${r.S.verdict}`);
  b6.push({ hold: 'H9', item: 'V2x', arm: 'V', exit: 0, gates: null, itemVoid: false, j: mk('V', rep(1, 80, 100)) }, { hold: 'H9', item: 'C4x', arm: 'C', exit: 0, gates: null, itemVoid: false, j: mk('C', rep(5, 80, 100)) });
  r = scoreBlock(b6);
  ok(r.S.valid.V.includes('V2x') && r.S.valid.C.includes('C4x') && r.S.verdict === 'PASS', `6b re-runs used ${JSON.stringify(r.S.valid)} ${r.S.verdict}`);
  // 7. served hash of another build, wrong profile: void
  r = scoreBlock(block([rep(5, 80, 100)], [rep(1, 80, 100)], { V2: { served: { [NODE]: '5c39f7a96e41', [CSS]: 'd4e684032482' } }, V3: { profile: { name: 'serious' } } }));
  ok(r.runs.find((x) => x.item === 'V2').void.some((v) => /served not arm V/.test(v)), '7 served');
  ok(r.runs.find((x) => x.item === 'V3').void.some((v) => /profile serious/.test(v)), '7 profile');
  // 8. G runs: gates INVALID void, re-run r used; a G run before a failing sC is voided
  const g = (item, gates = 'ok', hold = 'H6') => ({ hold, item, arm: item[1], exit: 0, gates, itemVoid: false });
  const b8 = [...block([rep(5, 80, 100)], [rep(1, 80, 100)]), g('EC1', 'INVALID G4 idle 6.1 s'), g('EV1'), { hold: 'H8', item: 'sC', arm: 'C', exit: 0, gates: null, itemVoid: false, j: mk('C', [], { sentinel: { pass: false } }) }, g('EV2', 'ok', 'H8'), g('EC1r', 'ok', 'H14')];
  r = scoreBlock(b8);
  ok(r.G.valid.join(',') === 'EV2,EC1r', `8 G valid ${r.G.valid}`);
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (8 cases: PASS + BETTER, NEW CLUSTER, DS1 twin flip, DS3 twin flip, OPEN by a DS2 twin, sentinel chain + re-runs, served/profile voids, G gates + sentinel)');
  return bad.length ? 1 : 0;
}

const argv = process.argv.slice(2);
if (argv[0] === '--selftest') process.exitCode = selftest();
else if (argv[0]) {
  const dir = argv[0], rd = join(dir, 'runs');
  const logs = {};
  for (const f of readdirSync(dir).filter((f) => /^hold-H[^.]+\.log$/.test(f))) logs[f.slice(5, -4)] = readFileSync(join(dir, f), 'utf8');
  const order = readOrder(logs);
  const load = (f) => { try { return JSON.parse(readFileSync(join(rd, f), 'utf8')); } catch { return null; } };
  const entries = order.map((e) => ({ ...e, j: /^([CV][1-8]x?)$/.test(e.item) ? load(`s-${e.item}.json`) : e.item === 'sC' ? load(`s-sC-${e.hold}.json`) : null }));
  const out = scoreBlock(entries);
  for (const r of out.runs) console.log(`${r.hold} ${r.item} (${r.kind} ${r.arm}${r.isSentinel ? ', sentinel ' + JSON.stringify(r.sentinel?.pass ?? null) : ''}): ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}${r.timed ? ' timed ' + JSON.stringify(r.timed) : ''}`);
  console.log(`DS1 ${JSON.stringify(out.S.DS1)}`);
  if (out.S.DS2) console.log(`DS2 ${JSON.stringify(out.S.DS2)}`);
  if (out.S.DS3) console.log(`DS3 ${JSON.stringify(out.S.DS3)}`);
  console.log(`S VERDICT ${out.S.verdict} (valid C ${out.S.valid.C.join(',')} | V ${out.S.valid.V.join(',')})`);
  console.log(`GRUNS ${out.G.valid.join(',')} (C ${out.G.C}, V ${out.G.V})`);
  console.log(`scorer sha256 ${self.slice(0, 12)}, P-105 base ${baseSha.slice(0, 12)}`);
  const ji = argv.indexOf('--json'); if (ji > 0) writeFileSync(argv[ji + 1], JSON.stringify({ scorer: 'fixes/g0-box/phone/p165-score.mjs', sha256: self, ...out }, null, 1));
} else console.log('usage: node fixes/g0-box/phone/p165-score.mjs <block dir> [--json f] | --selftest');

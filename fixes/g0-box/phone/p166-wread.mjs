#!/usr/bin/env node
// P-166 stage 2 reader (card: fixes/g0-box/README.md "P-166", stage 2 signed 41b8b179; written before any stage-2 data).
// A pure reader: no device, no measurement. Per spot and arm, from the counted W runs (Timeline on) of VALID holds:
//   the spot frame (A: the first frame whose yEnd passes 30, the he-css crossing (JS 4908-4909, heTop 0), the stage-1
//   rule; B: the frame of the `+is-play` class crossing), its dt (twins 46 / 54), its Timeline segments inside the frame
//   interval (t - dt, t] in page ms (Timeline ms = page ms + offsetMs; records in s), each record's SELF time (its
//   span minus its children's) counted once: Script (FunctionCall, EvaluateScript, TimerFire, EventDispatch,
//   FireAnimationFrame, ObserverCallback, ScheduleStyleRecalculation...), Layout (Layout, RecalculateStyles,
//   InvalidateLayout), Paint+Composite (Paint, Composite), Other (everything else, RenderingFrame's own time
//   included); gap - frame = dt - the union of the RenderingFrame spans in the interval; the frame's crossings.
// Owner (card): the first arm after v0 in the spot's order (A: v0 -> g0.0e; B: v0 -> g0.0e -> g0.0f) whose spot frame
//   is > 50 ms in >= 2 of 3 runs AND one Timeline segment's median rise over the previous arm is >= 2/3 of the median dt
//   rise; none: "not attributed". Twins 46 / 54 decide threshold-sensitivity. Spot A's knock-out e-nohe "removes" the
//   frame when its spot frame is <= 50 ms in >= 2 of 3 runs.
// Reproduce rule (lead amendment 10:4xZ, user T-247 #12; profile tool-serious): a spot is "reproduced under induced
//   Serious" when the median spot-frame dt of its test arm (A: g0.0e, B: g0.0f) is >= v0's median + 6 ms; otherwise the
//   spot reads "not reproduced under induced" and gets no owner (it needs a real-heat block later, the lead's call).
//   Checked before the owner rule. Profiles never pool: these numbers compare only within this block, never with P-165.
// Run validity: a RUN line in a VALID hold (out/p166ph/order.log), a record with no meta.error, profile serious
//   (tool-serious: the induced condition held by thermal.mjs) without drift, the served JS/CSS of the arm's pin (meta.served, when present), a Timeline file with recs, stopped
//   true and a finite offsetMs. A re-run <item>x replaces a void <item>.
//   node fixes/g0-box/phone/p166-wread.mjs [out/p166ph] [--json out.json]     node fixes/g0-box/phone/p166-wread.mjs --selftest
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PIN = { 0: ['4606120cf392', '27776f3d4138'], e: ['5c39f7a96e41', 'd4e684032482'], n: ['779fc9f36fc1', 'd4e684032482'], f: ['30fd80ccbb3f', '1d1e5d62a2c4'] };
const NAME = { 0: 'v0', e: 'g0.0e', n: 'e-nohe', f: 'g0.0f' };
const ORDER = { A: ['0', 'e'], B: ['0', 'e', 'f'] };
const KNOCK = { A: 'n' };
const TEST = { A: 'e', B: 'f' }; const REPRO_MS = 6;
const PROFILE = 'serious';
const SEG = (t) => /^(FunctionCall|EvaluateScript|TimerFire|TimerInstall|TimerRemove|EventDispatch|FireAnimationFrame|RequestAnimationFrame|CancelAnimationFrame|ObserverCallback|ConsoleProfile|MicrotaskCheckpoint|ScheduleStyleRecalculation|GCEvent)$/.test(t) ? 'Script'
  : /^(Layout|RecalculateStyles|InvalidateLayout|InvalidateStyle|ForcedLayout)$/.test(t) ? 'Layout' : /^(Paint|Composite)$/.test(t) ? 'PaintComposite' : 'Other';
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** self-time segments of the Timeline inside [lo, hi] (page ms) and the RenderingFrame union */
export function segments(tl, lo, hi) {
  const out = { Script: 0, Layout: 0, PaintComposite: 0, Other: 0 }; const rf = [];
  const clip = (a, b) => Math.max(0, Math.min(b, hi) - Math.max(a, lo));
  const walk = (r) => {
    const a = r.startTime * 1000 - tl.offsetMs, b = (r.endTime ?? r.startTime) * 1000 - tl.offsetMs;
    if (r.type === 'RenderingFrame' && b > lo && a < hi) rf.push([Math.max(a, lo), Math.min(b, hi)]);
    const kids = (r.children || []).reduce((s, c) => s + clip(c.startTime * 1000 - tl.offsetMs, (c.endTime ?? c.startTime) * 1000 - tl.offsetMs), 0);
    out[SEG(r.type)] += Math.max(0, clip(a, b) - kids);
    for (const c of r.children || []) walk(c);
  };
  for (const r of tl.recs || []) walk(r);
  rf.sort((x, y) => x[0] - y[0]); let u = 0, e = -Infinity;
  for (const [a, b] of rf) { if (a > e) { u += b - a; e = b; } else if (b > e) { u += b - e; e = b; } }
  return { ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, r1(v)])), rf: r1(u) };
}

/** the spot frame of one W record: index, t, dt, y, crossings in it */
export function spotFrame(j, spot) {
  const F = j.fields || [], it = F.indexOf('t'), id = F.indexOf('dt'), iy = F.indexOf('yEnd'), fr = j.frames || [];
  let i = -1;
  if (spot === 'A') { for (let k = 1; k < fr.length; k++) if (fr[k][iy] > 30 && fr[k - 1][iy] <= 30) { i = k; break; } }
  else { const c = (j.crossings || []).find((x) => x.kind === 'class' && x.value === '+is-play'); i = c ? c.frame : -1; }
  if (i < 0 || !fr[i] || fr[i][id] == null) return null;
  const xs = (j.crossings || []).filter((x) => x.frame === i).map((x) => `${x.id} ${x.value}`);
  return { i, t: fr[i][it], dt: fr[i][id], y: fr[i][iy], crossings: xs };
}

export function readRun(j, tl, spot, arm) {
  const why = []; const m = j?.meta || {};
  if (!j) why.push('no record');
  if (m.error) why.push(`error ${String(m.error).slice(0, 60)}`);
  if (j && m.profile && m.profile.name !== PROFILE) why.push(`profile ${m.profile.name}`);
  if (m.profileDrift === true || m.profile?.drift === true) why.push('profile drift');
  const sv = m.served || {}; const js = Object.entries(sv).find(([k]) => /2\.DyWL8TcE\.js/.test(k)); const css = Object.entries(sv).find(([k]) => /2\.gBuqKVzi\.css/.test(k));
  const h = (v) => String(typeof v === 'string' ? v : v?.sha256 || v?.hash || '').slice(0, 12);
  if (js && h(js[1]) && h(js[1]) !== PIN[arm][0]) why.push(`served JS ${h(js[1])}`);
  if (css && h(css[1]) && h(css[1]) !== PIN[arm][1]) why.push(`served CSS ${h(css[1])}`);
  if (!tl || !(tl.recs || []).length || tl.stopped === false || !Number.isFinite(tl.offsetMs)) why.push('no usable Timeline');
  const sf = j ? spotFrame(j, spot) : null;
  if (!sf) why.push('no spot frame');
  const seg = sf && !why.length ? segments(tl, sf.t - sf.dt, sf.t) : null;
  return { arm, spot, valid: !why.length, why, frame: sf, seg, gapMinusFrame: seg ? r1(sf.dt - seg.rf) : null };
}

export function decide(spot, rows) {
  const by = (a) => rows.filter((r) => r.arm === a && r.valid);
  const st = (a) => { const v = by(a); const dts = v.map((r) => r.frame.dt);
    return { n: v.length, dts, med: med(dts), gt50: dts.filter((d) => d > 50).length, gt46: dts.filter((d) => d > 46).length, gt54: dts.filter((d) => d > 54).length,
      seg: Object.fromEntries(['Script', 'Layout', 'PaintComposite', 'Other', 'rf'].map((k) => [k, r1(med(v.map((r) => r.seg[k])))])), gap: r1(med(v.map((r) => r.gapMinusFrame))) }; };
  const S = {}; for (const a of [...ORDER[spot], ...(KNOCK[spot] ? [KNOCK[spot]] : [])]) S[a] = st(a);
  const enough = Object.values(S).every((s) => s.n >= 3);
  let owner = null, ts = false; const steps = [];
  const ord = ORDER[spot];
  for (let k = 1; k < ord.length; k++) {
    const a = S[ord[k]], p = S[ord[k - 1]], rise = a.med - p.med;
    const segRise = Object.fromEntries(['Script', 'Layout', 'PaintComposite', 'Other'].map((s) => [s, r1(a.seg[s] - p.seg[s])]));
    const top = Object.entries(segRise).sort((x, y) => y[1] - x[1])[0];
    const slow = (c) => c >= 2;
    const accounts = rise > 0 && top[1] >= (2 / 3) * rise;
    const pass = slow(a.gt50) && accounts;
    if ((slow(a.gt46) && accounts) !== pass || (slow(a.gt54) && accounts) !== pass) ts = true;
    steps.push({ from: NAME[ord[k - 1]], to: NAME[ord[k]], dtRise: r1(rise), segRise, top: top[0], accounts, gt50: a.gt50, pass });
    if (pass && !owner) owner = NAME[ord[k]];
  }
  const tm = S[TEST[spot]].med, vm = S['0'].med;
  const repro = { test: NAME[TEST[spot]], v0Med: vm, testMed: tm, rise: r1(tm - vm), reproduced: tm >= vm + REPRO_MS };
  let knock = null;
  if (KNOCK[spot]) { const kn = S[KNOCK[spot]]; knock = { arm: NAME[KNOCK[spot]], le50: kn.dts.filter((d) => d <= 50).length, removes: kn.dts.filter((d) => d <= 50).length >= 2, med: kn.med }; }
  return { spot, enough, repro, owner: !enough ? 'insufficient' : !repro.reproduced ? 'not reproduced under induced' : owner || 'not attributed', thresholdSensitive: ts, steps, knock, stats: Object.fromEntries(Object.entries(S).map(([a, s]) => [NAME[a], s])) };
}

function load(dir) {
  const O = join(dir, 'runs'); const order = existsSync(join(dir, 'order.log')) ? readFileSync(join(dir, 'order.log'), 'utf8') : '';
  const items = [...order.matchAll(/^\S+ RUN ([AB][0enf][1-3]x?) arm/gm)].map((m) => m[1]);
  const rows = [];
  for (const spot of ['A', 'B']) for (const a of [...ORDER[spot], ...(KNOCK[spot] ? [KNOCK[spot]] : [])]) for (let n = 1; n <= 3; n++) {
    const base = `${spot}${a}${n}`; let pick = null;
    for (const it of [base, `${base}x`]) {
      if (!items.includes(it)) continue;
      const rf = join(O, `w-${it}.json`), tf = join(O, `tl-${it}.json`);
      const j = existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')) : null; const tl = existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null;
      const r = { item: it, ...readRun(j, tl, spot, a) };
      if (!pick || (!pick.valid && r.valid)) pick = r;
    }
    rows.push(pick || { item: base, arm: a, spot, valid: false, why: ['not run in a VALID hold'] });
  }
  return rows;
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const F = ['t', 'dt', 'yStart', 'yEnd', 'innerHeight', 'm', 'rafJsMs', 'probeMs', 'docH'];
  const rec = (dtSpot, spot) => ({ meta: { profile: { name: 'serious' } }, fields: F,
    frames: spot === 'A' ? [[1000, 16, 0, 0], [1016, 16, 0, 10], [1016 + dtSpot, dtSpot, 10, 61], [1100 + dtSpot, 16, 61, 80]] : [[1000, 16, 0, 4400], [1000 + dtSpot, dtSpot, 4400, 4520]],
    crossings: spot === 'A' ? [{ frame: 2, kind: 'class', id: 'section.hero-track', value: '+he-css' }] : [{ frame: 1, kind: 'class', id: 'div.x', value: '+is-play' }] });
  const tl = (lo, paint) => ({ offsetMs: 0, stopped: true, recs: [{ type: 'RenderingFrame', startTime: lo / 1000, endTime: (lo + 10 + paint) / 1000, children: [{ type: 'Layout', startTime: lo / 1000, endTime: (lo + 10) / 1000 }, { type: 'Paint', startTime: (lo + 10) / 1000, endTime: (lo + 10 + paint) / 1000 }] }] });
  const r = readRun(rec(55, 'A'), tl(1020, 30), 'A', 'e');
  ok(r.valid && r.frame.dt === 55 && r.frame.crossings[0] === 'section.hero-track +he-css' && r.seg.PaintComposite === 30 && r.seg.Layout === 10 && r.seg.rf === 40 && r.gapMinusFrame === 15, `1 readRun ${JSON.stringify(r)}`);
  const mk = (a, dt, paint) => ({ arm: a, valid: true, frame: { dt }, seg: { Script: 2, Layout: 10, PaintComposite: paint, Other: 1, rf: 13 + paint }, gapMinusFrame: dt - 13 - paint });
  const rowsA = [...[41, 40, 42].map((d) => mk('0', d, 10)), ...[55, 52, 58].map((d) => mk('e', d, 25)), ...[40, 43, 41].map((d) => mk('n', d, 10))];
  let d = decide('A', rowsA);
  ok(d.owner === 'g0.0e' && d.knock.removes && !d.thresholdSensitive, `2 owner A ${JSON.stringify(d.steps)} ${JSON.stringify(d.knock)}`);
  const rowsB = [...[40, 41, 42].map((d) => mk('0', d, 10)), ...[41, 42, 40].map((d) => mk('e', d, 10)), ...[51, 52, 49].map((d) => mk('f', d, 20))];
  d = decide('B', rowsB);
  ok(d.owner === 'g0.0f' && d.thresholdSensitive, `3 owner B with a 46/54 twin flip ${JSON.stringify(d)}`);
  const rowsB2 = [...[40, 41, 42].map((d) => mk('0', d, 10)), ...[41, 42, 40].map((d) => mk('e', d, 10)), ...[56, 58, 57].map((d) => mk('f', d, 11))];
  d = decide('B', rowsB2);
  ok(d.owner === 'not attributed', `4 slow but no segment accounts ${JSON.stringify(d.steps)}`);
  ok(decide('B', rowsB.slice(0, 7)).owner === 'insufficient', '5 insufficient');
  ok(spotFrame(rec(50, 'B'), 'B').dt === 50, '6 spot B frame');
  const rowsB3 = [...[44, 45, 46].map((d) => mk('0', d, 10)), ...[45, 44, 46].map((d) => mk('e', d, 10)), ...[49, 51, 50].map((d) => mk('f', d, 22))];
  d = decide('B', rowsB3);
  ok(d.owner === 'not reproduced under induced' && d.repro.rise === 5 && !d.repro.reproduced, `7 not reproduced (rise 5 < 6) ${JSON.stringify(d.repro)} ${d.owner}`);
  const rowsB4 = rowsB3.map((r) => (r.arm === 'f' ? { ...r, frame: { dt: r.frame.dt + 2 } } : r));
  d = decide('B', rowsB4);
  ok(d.repro.reproduced && d.repro.rise === 7 && d.owner === 'g0.0f', `8 reproduced (rise 7) and owned ${JSON.stringify(d.repro)} ${d.owner}`);
  const rowsB5 = rowsB3.map((r) => (r.arm === 'f' ? { ...r, frame: { dt: r.frame.dt + 1 } } : r));
  ok(decide('B', rowsB5).repro.reproduced === true, '9 reproduced at exactly +6 ms');
  ok(readRun({ ...rec(55, 'A'), meta: { profile: { name: 'real-serious' } } }, tl(1020, 30), 'A', 'e').why.includes('profile real-serious'), '10 a real-serious record is void here');
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (10 cases: frame + segments, owner A + knock-out, owner B twin flip, not attributed, insufficient, spot B, not reproduced, reproduced + owned, +6 exact, profile)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
const dir = args.find((a) => !a.startsWith('--')) || 'out/p166ph'; const ji = args.indexOf('--json');
const rows = load(dir); const res = {};
for (const r of rows) console.log(`${r.item} ${NAME[r.arm]} ${r.valid ? 'valid' : 'VOID ' + r.why.join('; ')}${r.frame ? ` frame ${r.frame.i} y ${r.frame.y} dt ${r.frame.dt} [${r.frame.crossings.join('; ')}]` : ''}${r.seg ? ` seg ${JSON.stringify(r.seg)} gap-frame ${r.gapMinusFrame}` : ''}`);
for (const spot of ['A', 'B']) { const d = decide(spot, rows.filter((r) => r.spot === spot)); res[spot] = d;
  console.log(`SPOT ${spot}: ${Object.entries(d.stats).map(([a, s]) => `${a} dt ${s.dts.join('/')} (med ${s.med}, >50 ${s.gt50}/3) seg ${JSON.stringify(s.seg)} gap ${s.gap}`).join(' | ')}`);
  for (const s of d.steps) console.log(`  ${s.from} -> ${s.to}: dt rise ${s.dtRise}, segment rise ${JSON.stringify(s.segRise)} (top ${s.top}, accounts ${s.accounts}), >50 ${s.gt50}/3 -> ${s.pass ? 'OWNER' : 'no'}`);
  if (d.knock) console.log(`  knock-out ${d.knock.arm}: <= 50 ms in ${d.knock.le50}/3 (median ${d.knock.med}) -> ${d.knock.removes ? 'removes the frame' : 'does not remove it'}`);
  console.log(`REPRODUCE ${spot}: ${d.repro.test} median ${d.repro.testMed} vs v0 ${d.repro.v0Med} (rise ${d.repro.rise}, need >= ${REPRO_MS}) -> ${d.repro.reproduced ? 'reproduced under induced Serious' : 'not reproduced under induced'}`);
  console.log(`OWNER ${spot}: ${d.owner}${d.thresholdSensitive ? ' (threshold-sensitive)' : ''}`); }
if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify({ rows, decision: res }, null, 1));
}

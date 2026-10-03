// P-075 scorer: applies the pre-registered rule (pilot-prereg.md, b89ec7f) to the pilot data. node judge.mjs <data dir>
import fs from 'node:fs';
const S = process.argv[2] || '.'; // dir holding pilot-chrome-full.json, pilot-chrome-freeze.json, pilot-sim.json
const rd = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
// Records from a run whose served JS hash mismatched are never written (chrome-hold.mjs / pilot-sim.mjs abort with exit 3
// before any load); a record carrying a `void` or `hashMismatch` field is dropped here as well.
const valid = (r) => !r.void && !r.hashMismatch;
const out = { chrome: null, sim: null };
const fmt = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : String(x));

function judge(get, pairs, counts, aaFn, engine) {
  const rows = []; const miss = {};
  const aaInfo = Object.fromEntries(counts.map((m) => [m, aaFn(m)]));
  const aa = Object.fromEntries(counts.map((m) => [m, aaInfo[m].v]));
  for (const [b, ctrl, judged] of pairs) for (const m of counts) {
    const F = (arm, mode) => get(arm, mode, m);
    const fb = F(b, 'full'), fc = F(ctrl, 'full'), zb = F(b, 'freeze'), zc = F(ctrl, 'freeze');
    if (![fb, fc, zb, zc].every((x) => x.length)) { rows.push({ engine, b, ctrl, m, missing: true }); continue; }
    const dFULL = mean(fb) - mean(fc), dFRZ = mean(zb) - mean(zc);
    const tol = Math.max(0.15 * Math.abs(dFRZ), 2 * (Number.isFinite(aa[m]) ? aa[m] : 0), 2);
    const diff = Math.abs(dFULL - dFRZ);
    const signOk = Math.abs(dFRZ) <= tol || Math.sign(dFULL) === Math.sign(dFRZ);
    const pass = diff <= tol && signOk;
    // prereg: a MISS within 2x AA of the tolerance boundary is 'noise-sensitive' (passes are not flagged)
    const noiseSensitive = !pass && Number.isFinite(aa[m]) && diff - tol <= 2 * aa[m];
    // full-page within-arm range (for the layout/paint open item)
    const range = Math.max(Math.max(...fb) - Math.min(...fb), Math.max(...fc) - Math.min(...fc));
    // H9 reading (prereg 'Layout and Paint open item'): a miss larger than the full-page within-arm range = real per-frame interaction
    const realInteraction = !pass && diff > range;
    rows.push({ engine, b, ctrl, judged, m, fullB: fb, fullC: fc, frzB: zb, frzC: zc, dFULL, dFRZ, AA: aa[m], aaFlag: aaInfo[m].flag, tol, diff, pass, noiseSensitive, fullWithinArmRange: range, realInteraction });
    if (judged && !pass) (miss[m] ||= []).push(b);
  }
  // family verdict: FAIL on a count when >= min(2, judged builds) judged builds miss on it (Sim: 2 of 2)
  const nJudged = new Set(pairs.filter((p) => p[2]).map((p) => p[0] + '-' + p[1])).size;
  const need = Math.min(2, nJudged);
  const family = Object.fromEntries(counts.map((m) => [m, (miss[m] || []).length >= need ? 'FAIL' : 'PASS']));
  return { rows, miss, aa, aaInfo, family, nJudged, need };
}

const cf = rd(`${S}/pilot-chrome-full.json`), cz = rd(`${S}/pilot-chrome-freeze.json`);
if (cf && cz) {
  const all = [...cf.results, ...cz.results];
  const get = (arm, mode, m) => all.filter((r) => valid(r) && r.build === arm && r.mode === mode && !(mode === 'freeze' && r.countdownScreenChanges === 0)).map((r) => r.counts[m]);
  const counts = ['countdownCalls', 'styleElements', 'layout', 'paint'];
  const aaFn = (m) => { const per = ['full', 'freeze'].map((mode) => Math.abs(mean(get('C', mode, m)) - mean(get('C2', mode, m)))).filter(Number.isFinite);
    return per.length === 2 ? { v: Math.max(...per), flag: '' } : per.length === 1 ? { v: per[0], flag: 'AA from one mode' } : { v: NaN, flag: 'AA UNKNOWN: verdict flagged to the lead' }; };
  const pairs = [['Vf', 'C', true], ['C6', 'S', true], ['V7', 'C6', true], ['C6', 'C', false], ['V7', 'C', false]];
  out.chrome = judge(get, pairs, counts, aaFn, 'chrome');
  out.chrome.voidFrz = cz.results.filter((r) => r.countdownScreenChanges === 0).map((r) => `${r.build} rep${r.rep}`);
  out.chrome.frzScreenChanges = cz.results.map((r) => `${r.build}:${r.countdownScreenChanges}`).join(' ');
  out.chrome.n = Object.fromEntries(['full', 'freeze'].map((mode) => [mode, Object.fromEntries(['C', 'C2', 'Vf', 'S', 'C6', 'V7'].map((a) => [a, get(a, mode, 'layout').length]))]));
  out.chrome.pageWide = Object.fromEntries(['C', 'C2', 'Vf', 'S', 'C6', 'V7'].map((a) => [a, Object.fromEntries(['full', 'freeze'].map((mode) => [mode, { mainFrames: mean(get(a, mode, 'mainFrames')), layerize: mean(get(a, mode, 'layerize')), io: mean(get(a, mode, 'io')) }]))]));
}
const sm = rd(`${S}/pilot-sim.json`);
if (sm) {
  const get = (arm, mode, m) => sm.rows.filter((r) => valid(r) && r.arm === arm && r.mode === mode && !(mode === 'freeze' && r.ticks === 0)).map((r) => r.counts[m]);
  const counts = ['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'Composite', 'countdownRaf'];
  const aaFn = (m) => { const per = ['full', 'freeze'].map((mode) => get('C', mode, m)).filter((v) => v.length >= 2).map((v) => Math.abs(v[0] - v[1]));
    return per.length === 2 ? { v: Math.max(...per), flag: '' } : per.length === 1 ? { v: per[0], flag: 'AA from one mode' } : { v: NaN, flag: 'AA UNKNOWN: verdict flagged to the lead' }; };
  out.sim = judge(get, [['Vf', 'C', true], ['V7', 'C6', true], ['C6', 'C', false], ['V7', 'C', false]], counts, aaFn, 'sim');
  out.sim.ticks = sm.rows.map((r) => `${r.arm}/${r.mode}/r${r.rep}:${r.ticks}`).join(' ');
}
for (const e of ['chrome', 'sim']) {
  const J = out[e]; if (!J) { console.log(e, 'no data'); continue; }
  console.log(`\n== ${e}  AA ${JSON.stringify(Object.fromEntries(Object.entries(J.aaInfo).map(([k, v]) => [k, Number.isFinite(v.v) ? +v.v.toFixed(1) + (v.flag ? ' (' + v.flag + ')' : '') : v.flag])))}`);
  for (const r of J.rows) {
    if (r.missing) { console.log(r.b, '-', r.ctrl, r.m, 'MISSING'); continue; }
    console.log(`${(r.b + '-' + r.ctrl).padEnd(7)} ${r.judged ? 'J' : 's'} ${r.m.padEnd(17)} dFULL ${fmt(r.dFULL).padStart(7)} dFRZ ${fmt(r.dFRZ).padStart(7)} |diff| ${fmt(r.diff).padStart(6)} tol ${fmt(r.tol).padStart(6)} ${r.pass ? 'PASS' : 'MISS'}${r.noiseSensitive ? ' noise-sensitive' : ''}${r.realInteraction ? ' H9-real-interaction' : ''}  fullRange ${fmt(r.fullWithinArmRange)}  full ${r.fullB.join('/')} vs ${r.fullC.join('/')}  frz ${r.frzB.join('/')} vs ${r.frzC.join('/')}`);
  }
  const fam = Object.entries(J.miss).map(([m, bs]) => `${m}: missed by ${bs.join(',')}`);
  console.log('misses (judged):', fam.join('; ') || 'none');
  for (const [m, v] of Object.entries(J.family)) console.log(v === 'FAIL'
    ? `FAMILY FAIL: ${e} ${m} (${J.miss[m].join(', ')}; ${J.miss[m].length} of ${J.nJudged} judged) -> FRZ deltas do not predict the full page for ${m}; full-page counts stay the default for it (README 4.2 rule 2)`
    : `family PASS: ${e} ${m} (${(J.miss[m] || []).length} of ${J.nJudged} judged missed)`);
}
if (out.chrome) { console.log('\nchrome FRZ screenshot changes', out.chrome.frzScreenChanges, 'void', out.chrome.voidFrz.join(',') || 'none'); console.log('n', JSON.stringify(out.chrome.n)); console.log('pageWide', JSON.stringify(out.chrome.pageWide)); }
if (out.sim) console.log('sim ticks', out.sim.ticks);
fs.writeFileSync(`${S}/judge.json`, JSON.stringify(out, null, 1));

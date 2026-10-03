// P-075 scorer: applies the pre-registered rule (pilot-prereg.md, b89ec7f) to the pilot data. node judge.mjs <data dir>
import fs from 'node:fs';
const S = process.argv[2] || '.'; // dir holding pilot-chrome-full.json, pilot-chrome-freeze.json, pilot-sim.json
const rd = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const out = { chrome: null, sim: null };
const fmt = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : String(x));

function judge(get, pairs, counts, aaFn, engine) {
  const rows = []; const miss = {};
  const aa = Object.fromEntries(counts.map((m) => [m, aaFn(m)]));
  for (const [b, ctrl, judged] of pairs) for (const m of counts) {
    const F = (arm, mode) => get(arm, mode, m);
    const fb = F(b, 'full'), fc = F(ctrl, 'full'), zb = F(b, 'freeze'), zc = F(ctrl, 'freeze');
    if (![fb, fc, zb, zc].every((x) => x.length)) { rows.push({ engine, b, ctrl, m, missing: true }); continue; }
    const dFULL = mean(fb) - mean(fc), dFRZ = mean(zb) - mean(zc);
    const tol = Math.max(0.15 * Math.abs(dFRZ), 2 * aa[m], 2);
    const diff = Math.abs(dFULL - dFRZ);
    const signOk = Math.abs(dFRZ) <= tol || Math.sign(dFULL) === Math.sign(dFRZ);
    const pass = diff <= tol && signOk;
    const noiseSensitive = Math.abs(diff - tol) <= 2 * aa[m];
    // full-page within-arm range (for the layout/paint open item)
    const range = Math.max(Math.max(...fb) - Math.min(...fb), Math.max(...fc) - Math.min(...fc));
    rows.push({ engine, b, ctrl, judged, m, fullB: fb, fullC: fc, frzB: zb, frzC: zc, dFULL, dFRZ, AA: aa[m], tol, diff, pass, noiseSensitive, fullWithinArmRange: range });
    if (judged && !pass) (miss[m] ||= []).push(b);
  }
  return { rows, miss, aa };
}

const cf = rd(`${S}/pilot-chrome-full.json`), cz = rd(`${S}/pilot-chrome-freeze.json`);
if (cf && cz) {
  const all = [...cf.results, ...cz.results];
  const get = (arm, mode, m) => all.filter((r) => r.build === arm && r.mode === mode && !(mode === 'freeze' && r.countdownScreenChanges === 0)).map((r) => r.counts[m]);
  const counts = ['countdownCalls', 'styleElements', 'layout', 'paint'];
  const aaFn = (m) => Math.max(Math.abs(mean(get('C', 'full', m)) - mean(get('C2', 'full', m))), Math.abs(mean(get('C', 'freeze', m)) - mean(get('C2', 'freeze', m))));
  const pairs = [['Vf', 'C', true], ['C6', 'S', true], ['V7', 'C6', true], ['C6', 'C', false], ['V7', 'C', false]];
  out.chrome = judge(get, pairs, counts, aaFn, 'chrome');
  out.chrome.voidFrz = cz.results.filter((r) => r.countdownScreenChanges === 0).map((r) => `${r.build} rep${r.rep}`);
  out.chrome.frzScreenChanges = cz.results.map((r) => `${r.build}:${r.countdownScreenChanges}`).join(' ');
  out.chrome.n = Object.fromEntries(['full', 'freeze'].map((mode) => [mode, Object.fromEntries(['C', 'C2', 'Vf', 'S', 'C6', 'V7'].map((a) => [a, get(a, mode, 'layout').length]))]));
  out.chrome.pageWide = Object.fromEntries(['C', 'C2', 'Vf', 'S', 'C6', 'V7'].map((a) => [a, Object.fromEntries(['full', 'freeze'].map((mode) => [mode, { mainFrames: mean(get(a, mode, 'mainFrames')), layerize: mean(get(a, mode, 'layerize')), io: mean(get(a, mode, 'io')) }]))]));
}
const sm = rd(`${S}/pilot-sim.json`);
if (sm) {
  const get = (arm, mode, m) => sm.rows.filter((r) => r.arm === arm && r.mode === mode && !(mode === 'freeze' && r.ticks === 0)).map((r) => r.counts[m]);
  const counts = ['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'Composite', 'countdownRaf'];
  const aaFn = (m) => Math.max(...['full', 'freeze'].map((mode) => { const v = get('C', mode, m); return v.length >= 2 ? Math.abs(v[0] - v[1]) : 0; }));
  out.sim = judge(get, [['Vf', 'C', true], ['V7', 'C6', true], ['C6', 'C', false], ['V7', 'C', false]], counts, aaFn, 'sim');
  out.sim.ticks = sm.rows.map((r) => `${r.arm}/${r.mode}/r${r.rep}:${r.ticks}`).join(' ');
}
for (const e of ['chrome', 'sim']) {
  const J = out[e]; if (!J) { console.log(e, 'no data'); continue; }
  console.log(`\n== ${e}  AA ${JSON.stringify(Object.fromEntries(Object.entries(J.aa).map(([k, v]) => [k, +v.toFixed(1)])))}`);
  for (const r of J.rows) {
    if (r.missing) { console.log(r.b, '-', r.ctrl, r.m, 'MISSING'); continue; }
    console.log(`${(r.b + '-' + r.ctrl).padEnd(7)} ${r.judged ? 'J' : 's'} ${r.m.padEnd(17)} dFULL ${fmt(r.dFULL).padStart(7)} dFRZ ${fmt(r.dFRZ).padStart(7)} |diff| ${fmt(r.diff).padStart(6)} tol ${fmt(r.tol).padStart(6)} ${r.pass ? 'PASS' : 'MISS'}${r.noiseSensitive ? ' noise-sensitive' : ''}  fullRange ${fmt(r.fullWithinArmRange)}  full ${r.fullB.join('/')} vs ${r.fullC.join('/')}  frz ${r.frzB.join('/')} vs ${r.frzC.join('/')}`);
  }
  const fam = Object.entries(J.miss).map(([m, bs]) => `${m}: missed by ${bs.join(',')}`);
  console.log('misses (judged):', fam.join('; ') || 'none');
}
if (out.chrome) { console.log('\nchrome FRZ screenshot changes', out.chrome.frzScreenChanges, 'void', out.chrome.voidFrz.join(',') || 'none'); console.log('n', JSON.stringify(out.chrome.n)); console.log('pageWide', JSON.stringify(out.chrome.pageWide)); }
if (out.sim) console.log('sim ticks', out.sim.ticks);
fs.writeFileSync(`${S}/judge.json`, JSON.stringify(out, null, 1));

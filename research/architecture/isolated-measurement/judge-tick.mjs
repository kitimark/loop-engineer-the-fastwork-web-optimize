// P-076 scorer: countdown calls per countdown second, cut at the countdown's own 1 s interval fires (p076-prereg.md).
// node judge-tick.mjs <data dir>   reads pilot-tick-full.json and pilot-tick-freeze.json, writes judge-tick.json.
// Input record (one per load, written by the probe): { rep, build, mode, timers, fires: [trace ts us], cd: [trace ts us],
//   countdownScreenChanges (freeze only) }. fires = main-thread FunctionCall of the interval callback `let e = () => {`
// (z(c, Date.now(), !0)) in the served JS; cd = every main-thread FunctionCall in the countdown range (fires included).
import fs from 'node:fs';
const S = process.argv[2] || '.';
const rd = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
// expected number of [role=timer] countdown instances per arm (P-075 records: st6-rb2-based arms show a second timer)
const TIMERS = { C: 1, C2: 1, Vf: 1, S: 2, C6: 2, V7: 2 };
const MIN_SECONDS = 4; // full fire-aligned seconds needed per load
const SPAN_US = [850e3, 1150e3]; // a fire-aligned second must span 1 s +- 150 ms

// Per load: T = number of timer instances. Second i = [fires[i], fires[i+T]) contains exactly one fire of each instance
// (T = 1: one tick interval). The partial stretches before the first fire and after the last are dropped.
// metric = median over the load's seconds of the countdown calls whose ts falls in the second.
export function perLoad(r) {
  if (r.void || r.hashMismatch) return { void: r.void || 'hash mismatch' };
  if (r.mode === 'freeze' && r.countdownScreenChanges === 0) return { void: 'countdown stopped in FRZ' };
  const T = TIMERS[r.build];
  if (r.timers !== T) return { void: `timers ${r.timers}, expected ${T}` };
  // The trace's FunctionCall line base is not pinned down here, so the probe keeps the calls at the callback's 0-based
  // line (fires0) and at the next line (fires1). The next line holds no function start (it is the callback body), so
  // at most one candidate can carry the interval: use the non-empty one; both non-empty = VOID.
  const c0 = r.fires0 || r.fires || [], c1 = r.fires1 || [];
  if (c0.length && c1.length) return { void: 'ambiguous fire line' };
  const f = [...(c0.length ? c0 : c1)].sort((a, b) => a - b);
  if (!f.length) return { void: 'no interval fires found' };
  const per = [];
  for (let i = 0; i + T < f.length; i++) {
    const a = f[i], b = f[i + T];
    if (b - a < SPAN_US[0] || b - a > SPAN_US[1]) return { void: `irregular fires (${((b - a) / 1e3).toFixed(0)} ms)` };
    per.push(r.cd.filter((t) => t >= a && t < b).length);
  }
  if (per.length < MIN_SECONDS) return { void: `${per.length} full seconds < ${MIN_SECONDS}` };
  return { perSecond: median(per), meanPerSecond: mean(per), seconds: per };
}

function main() {
  const cf = rd(`${S}/pilot-tick-full.json`), cz = rd(`${S}/pilot-tick-freeze.json`);
  if (!cf || !cz) { console.log('no data'); return; }
  const loads = [...cf.results, ...cz.results].map((r) => ({ ...r, ...perLoad(r) }));
  const get = (arm, mode) => loads.filter((r) => !r.void && r.build === arm && r.mode === mode).map((r) => r.perSecond);
  const per = ['full', 'freeze'].map((mode) => Math.abs(mean(get('C', mode)) - mean(get('C2', mode)))).filter(Number.isFinite);
  const AA = per.length === 2 ? Math.max(...per) : per.length === 1 ? per[0] : NaN;
  const aaFlag = per.length === 2 ? '' : per.length === 1 ? 'AA from one mode' : 'AA UNKNOWN: verdict flagged to the lead';
  const pairs = [['Vf', 'C', true], ['C6', 'S', true], ['V7', 'C6', true], ['C6', 'C', false], ['V7', 'C', false]];
  const rows = []; const miss = []; let scorable = 0;
  for (const [b, ctrl, judged] of pairs) {
    const fb = get(b, 'full'), fc = get(ctrl, 'full'), zb = get(b, 'freeze'), zc = get(ctrl, 'freeze');
    if (![fb, fc, zb, zc].every((x) => x.length >= 2)) { rows.push({ b, ctrl, judged, unscorable: true, n: [fb, fc, zb, zc].map((x) => x.length) }); continue; }
    if (judged) scorable++;
    const dFULL = mean(fb) - mean(fc), dFRZ = mean(zb) - mean(zc);
    const tol = Math.max(0.15 * Math.abs(dFRZ), 2 * (Number.isFinite(AA) ? AA : 0), 2);
    const diff = Math.abs(dFULL - dFRZ);
    const signOk = Math.abs(dFRZ) <= tol || Math.sign(dFULL) === Math.sign(dFRZ);
    const pass = diff <= tol && signOk;
    const noiseSensitive = !pass && Number.isFinite(AA) && diff - tol <= 2 * AA;
    rows.push({ b, ctrl, judged, fullB: fb, fullC: fc, frzB: zb, frzC: zc, dFULL, dFRZ, AA, tol, diff, pass, noiseSensitive });
    if (judged && !pass) miss.push(b + '-' + ctrl);
  }
  const need = Math.min(2, scorable);
  const family = scorable < 2 ? 'INCONCLUSIVE' : miss.length >= need ? 'FAIL' : 'PASS';
  console.log(`== chrome calls per countdown second  AA ${fmt(AA)}${aaFlag ? ' (' + aaFlag + ')' : ''}`);
  for (const r of rows) {
    if (r.unscorable) { console.log(`${(r.b + '-' + r.ctrl).padEnd(7)} ${r.judged ? 'J' : 's'} UNSCORABLE (valid loads ${r.n.join('/')})`); continue; }
    console.log(`${(r.b + '-' + r.ctrl).padEnd(7)} ${r.judged ? 'J' : 's'} dFULL ${fmt(r.dFULL).padStart(6)} dFRZ ${fmt(r.dFRZ).padStart(6)} |diff| ${fmt(r.diff).padStart(5)} tol ${fmt(r.tol).padStart(5)} ${r.pass ? 'PASS' : 'MISS'}${r.noiseSensitive ? ' noise-sensitive' : ''}  full ${r.fullB.join('/')} vs ${r.fullC.join('/')}  frz ${r.frzB.join('/')} vs ${r.frzC.join('/')}`);
  }
  console.log(`P-076 family ${family}: ${miss.length} of ${scorable} scorable judged pairs missed${miss.length ? ' (' + miss.join(', ') + ')' : ''}${aaFlag ? '; ' + aaFlag : ''}`);
  const voids = loads.filter((r) => r.void).map((r) => `${r.build}/${r.mode}/r${r.rep}: ${r.void}`);
  console.log('void loads:', voids.join('; ') || 'none');
  for (const r of loads.filter((x) => !x.void)) console.log(`  ${r.build}/${r.mode}/r${r.rep} seconds ${r.seconds.join(',')} median ${r.perSecond}`);
  fs.writeFileSync(`${S}/judge-tick.json`, JSON.stringify({ AA, aaFlag, rows, miss, scorable, family, voids, loads: loads.map(({ fires, cd, ...x }) => x) }, null, 1));
}
if (import.meta.url === `file://${process.argv[1]}`) main();

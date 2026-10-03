// Read a tween-series-sim.mjs result: per arm and tween, a compact table at fixed times, and per child property the
// largest difference from the reference arm (default B) on two axes: at the same time since the wheel dispatch, and
// at the same header --morph value m (linear interpolation along the reference's monotonic part).
//   node fixes/morph-inherit/gates/tween-series-read.mjs out/morph-inherit/series-<ts>/series.json [--ref B] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const res = JSON.parse(readFileSync(argv[0], 'utf8'));
const REF = arg('--ref', 'B');
const PROPS = [['earn', 'op'], ['earn', 'w'], ['earn', 'x'], ['logo', 'x'], ['logo', 'op'], ['actions', 'x'], ['panel', 'op'], ['bar', 'km'], ['logo', 'km'], ['earn', 'km'], ['panel', 'km']];
const val = (s, [k, p]) => (s[k] ? Number(s[k][p]) : NaN);
const at = (ser, t, f) => { // linear in t
  for (let i = 1; i < ser.length; i++) if (ser[i].t >= t) { const a = ser[i - 1], b = ser[i], u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t); return f(a) + (f(b) - f(a)) * u; }
  return f(ser[ser.length - 1]);
};
const atM = (ser, m, f, open) => { // linear in m along the monotonic part
  const pts = ser.filter((s) => s.m !== '').map((s) => [Number(s.m), f(s)]);
  for (let i = 1; i < pts.length; i++) { const [m0, v0] = pts[i - 1], [m1, v1] = pts[i];
    if (open ? m0 <= m && m <= m1 : m1 <= m && m <= m0) return m1 === m0 ? v1 : v0 + (v1 - v0) * (m - m0) / (m1 - m0); }
  return NaN;
};
const out = { file: argv[0], ref: REF, arms: {} };
const ref = res.runs.find((r) => r.arm === REF && r.series);
for (const r of res.runs) {
  if (!r.series) { console.log(r.arm, 'no series', r.void || r.error || ''); continue; }
  out.arms[r.arm] = {};
  for (const tw of ['open', 'close']) {
    const ser = r.series[tw]; const O = (out.arms[r.arm][tw] = { frames: ser.length, table: [], diff: {} });
    for (const t of [0, 50, 100, 150, 200, 250, 300, 400, 500, 700, 1000, 1500]) {
      const s = ser.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b));
      O.table.push({ t: s.t, m: s.m, cls: (s.morphing ? 'M' : '-') + (s.expanded ? 'E' : '-'), earn: s.earn && `${s.earn.op}/${s.earn.w}/${s.earn.x}`, logo: s.logo && `${s.logo.op}/${s.logo.x}`, panel: s.panel && s.panel.op, km: ['bar', 'logo', 'earn', 'panel'].map((k) => s[k]?.km ?? '-').join(' ') });
    }
    if (ref && r !== ref) {
      const rs = ref.series[tw];
      for (const pr of PROPS) {
        let dt = 0, dm = 0, dtAt = null, dmAt = null;
        for (const s of ser) { const v = val(s, pr); if (Number.isNaN(v)) continue;
          const a = Math.abs(v - at(rs, s.t, (x) => val(x, pr))); if (a > dt) { dt = a; dtAt = s.t; }
          if (s.m !== '') { const b = Math.abs(v - atM(rs, Number(s.m), (x) => val(x, pr), tw === 'open')); if (b > dm) { dm = b; dmAt = s.m; } } }
        O.diff[pr.join('.')] = { sameT: [Math.round(dt * 1000) / 1000, dtAt], sameM: [Math.round(dm * 1000) / 1000, dmAt] };
      }
    }
  }
}
for (const [arm, A] of Object.entries(out.arms)) for (const [tw, O] of Object.entries(A)) {
  console.log(`\n${arm} ${tw}: ${O.frames} frames   t | m | cls | earn op/w/x | logo op/x | panel op | --morph bar logo earn panel`);
  for (const x of O.table) console.log(`  ${x.t} | ${x.m} | ${x.cls} | ${x.earn} | ${x.logo} | ${x.panel} | ${x.km}`);
  if (Object.keys(O.diff).length) console.log(`  max |${arm} - ${REF}| [value, at t or m]:`, JSON.stringify(O.diff));
}
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));

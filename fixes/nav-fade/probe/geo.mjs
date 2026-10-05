// geo.mjs <motion.json dir> <control> <arm> [<A/A arm>]: the 1-device-px check from the parity pass's per-frame geometry.
// For every scene and frozen time: the mask image's left edge relative to the button (mx), the button's left edge (bx)
// and the earn box's left edge and width (ex, ew), arm minus control, in device px (DPR 3 in both engines).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ctl, arm, aa] = process.argv.slice(2);
const res = JSON.parse(readFileSync(join(dir, 'motion.json'), 'utf8'));
const run = (n) => res.runs.find((r) => r.arm === n);
// geoV 1 (before 2026-10-05 ~10:00Z) took the mask-position arms' W from offsetWidth (integer); the mask is laid out on
// the fractional border box (bw): rescale those mx values (arms without .fw-nf-mk, i.e. whose mx is a multiple of 1.4)
if (!res.geoV) for (const r of res.runs) for (const s of Object.values(r.scen || {})) for (const f of s.frames || [])
  if (f.geo?.mx != null && !r.arm.startsWith('nav-fade')) f.geo.mx *= f.geo.bw / Math.round(f.geo.bw);
const DPR = 3, K = ['mx', 'bx', 'ex', 'ew'];
const worst = {};
for (const sc of Object.keys(run(ctl).scen)) {
  const fc = run(ctl).scen[sc].frames, fa = run(arm)?.scen[sc]?.frames || [], f2 = aa ? run(aa)?.scen[sc]?.frames || [] : [];
  console.log(`== ${sc}: ${arm} - ${ctl} (device px)${aa ? `; A/A ${aa} - ${ctl}` : ''}`);
  for (const c of fc) {
    const a = fa.find((x) => x.t === c.t), b = f2.find((x) => x.t === c.t);
    if (!a?.geo || !c.geo) { console.log(`   t ${c.t}: no geometry`); continue; }
    const d = (g, k) => (g?.geo?.[k] == null || c.geo[k] == null ? null : +((g.geo[k] - c.geo[k]) * DPR).toFixed(2));
    const row = K.map((k) => { const v = d(a, k); if (v != null) worst[k] = Math.max(worst[k] || 0, Math.abs(v)); return `${k} ${v == null ? (a.geo[k] == null && c.geo[k] == null ? '-' : `${a.geo[k] == null ? 'off' : (a.geo[k] * DPR).toFixed(1)}/${c.geo[k] == null ? 'off' : (c.geo[k] * DPR).toFixed(1)}`) : v}`; });
    const r2 = b ? '  | A/A ' + K.map((k) => `${k} ${d(b, k) ?? '-'}`).join(' ') : '';
    console.log(`   t ${String(c.t).padStart(5)}: ${row.join('  ')}${r2}`);
  }
}
console.log('worst |arm - control| device px:', JSON.stringify(worst));

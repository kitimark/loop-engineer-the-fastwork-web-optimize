#!/usr/bin/env node
// toolbar-resize page-side arm card: applied-arm gate (frozen with the card; same rule as check-inject115): an arm run
// counts only when its gesture file's inject record shows the arm applied as carded; otherwise INSUFFICIENT (never NONE).
//   node fixes/toolbar-resize/check-pgp.mjs <folder> <run> ...   (run = <arm>-H<n>; C runs need arm 'none')
// Every run: record present, arm matches, ioInstalled, census present, |docH0 - docHpre| <= 2 (the rule kept the page's
//   height when it went in).
// Non-C: applied === true and css non-empty, plus per arm (vc1 = census right after the rule):
//   nvc: vc1 holds no fixed and no sticky renderer;   nvn: vc1 holds no sticky renderer;
//   tps: computed contain of .hero-track has size and layout, vc1's sticky renderers are only the hero;
//   trk: .hero-track contain has size and layout, trkH1 = trkH (+-0.5 px);
//   pbx: section.pain contain has size and layout, painH1 = painH (+-0.5 px);
//   tp:  both of trk and pbx;
//   vu0: the four key pins present (.hero-track height, .hero height, .pain-hold height, .start-selling-future-card
//        min-height), each a px value.
// Reported, never gating: vcEnd (census at the end of the run; the page can add classes or inline styles later), skipped
// vu0 pins, fw-ms at install and at the end.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const KEYPINS = ['.hero-track.svelte-1p2vpne height', '.hero.svelte-1p2vpne height', '.pain-hold height', '.start-selling-future-card min-height'];
const has = (c, ...w) => w.every((x) => String(c || '').split(/\s+/).includes(x));
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 0.5;
export function gateWhy(run, v) {
  const arm = run.replace(/-H\d+$/, ''), want = arm === 'C' ? 'none' : arm, why = [];
  if (!v || typeof v !== 'object') return ['no inject record'];
  if (v.arm !== want) why.push(`arm ${v.arm} != ${want}`);
  if (!v.ioInstalled) why.push('no showcase IO');
  if (!Array.isArray(v.vc1)) why.push('no census');
  if (!(Math.abs((v.docH0 ?? NaN) - (v.docHpre ?? NaN)) <= 2)) why.push(`docH ${v.docHpre} -> ${v.docH0}`);
  if (arm === 'C') return why;
  if (v.applied !== true) why.push('applied not true');
  if (!v.css) why.push('empty css');
  const vc = Array.isArray(v.vc1) ? v.vc1 : [];
  const sticky = vc.filter((r) => r[1] === 'sticky'), fixed = vc.filter((r) => r[1] === 'fixed');
  const trkOk = () => { if (!has(v.contain?.trk, 'size', 'layout')) why.push(`trk contain ${v.contain?.trk}`); if (!near(v.trkH1, v.measured?.trkH)) why.push(`trkH ${v.measured?.trkH} -> ${v.trkH1}`); };
  const pbxOk = () => { if (!has(v.contain?.pain, 'size', 'layout')) why.push(`pain contain ${v.contain?.pain}`); if (!near(v.painH1, v.measured?.painH)) why.push(`painH ${v.measured?.painH} -> ${v.painH1}`); };
  if (arm === 'nvc' && (sticky.length || fixed.length)) why.push(`left: ${[...sticky, ...fixed].map((r) => r[0] + ':' + r[1]).join(', ')}`);
  if (arm === 'nvn' && sticky.length) why.push(`sticky left: ${sticky.map((r) => r[0]).join(', ')}`);
  if (arm === 'tps') { trkOk(); const other = sticky.filter((r) => !/^div\.hero(\.|$)/.test(r[0])); if (other.length) why.push(`sticky left: ${other.map((r) => r[0]).join(', ')}`); }
  if (arm === 'trk' || arm === 'tp') trkOk();
  if (arm === 'pbx' || arm === 'tp') pbxOk();
  if (arm === 'vu0') { const got = (v.pins || []).filter((p) => /^-?[0-9.]+px$/.test(p[2])).map((p) => `${p[0]} ${p[1]}`); for (const k of KEYPINS) if (!got.includes(k)) why.push(`pin missing: ${k}`); }
  return why;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, ...runs] = process.argv.slice(2);
  if (!dir || !runs.length) { console.error('usage: check-pgp.mjs <folder> <run> ...'); process.exit(1); }
  let bad = 0;
  for (const run of runs) {
    let v = null; const pre = [];
    try { const g = JSON.parse(readFileSync(join(dir, `g-${run}.json`), 'utf8')); v = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof v === 'string') v = JSON.parse(v); } catch (e) { pre.push(`read: ${e.message}`); }
    const why = [...pre, ...gateWhy(run, v)];
    if (why.length) bad++;
    const rep = v ? { vc1: (v.vc1 || []).map((r) => r.join(':')), vcEnd: (v.vcEnd || []).map((r) => r.join(':')), skipped: v.skipped, fwms: [v.fwms0, v.fwmsEnd], docH: [v.docHpre, v.docH0, v.docH1] } : null;
    console.log(`${run.padEnd(9)} ${why.length ? 'NOT-APPLIED -> INSUFFICIENT: ' + why.join('; ') : 'applied'} | ${JSON.stringify(rep).slice(0, 400)}`);
  }
  console.log(`INJECT-GATE ${bad ? `${bad} run(s) not applied` : 'all applied'}`);
}

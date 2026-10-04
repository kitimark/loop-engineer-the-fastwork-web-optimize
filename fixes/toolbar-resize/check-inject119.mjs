#!/usr/bin/env node
// toolbar-resize P-119 applied-arm gate and look gate (frozen before data; runs before the scorer).
//   node fixes/toolbar-resize/check-inject119.mjs <folder> <run> ...      (<run> = <arm>-H<n>, arm C | cct | cva)
// Reads run.inject[0].value of g-<run>.json (p119-inject.mjs read()).
// Applied gate, per run (else INSUFFICIENT, never NONE):
//   every run: ioInstalled true and the IO log has >= 1 entry (the crossing record exists);
//   C: arm none, applied false;
//   cct: applied, its rule says contain:content, the computed contain is "content" or names layout, paint and style;
//   cva: applied, measured.showcaseH > 0, the computed content-visibility is auto.
// Look gate (R1): the structural probe taken before the arm rule (same DOM in every arm): LOOK-GATE clean when
// look.clean in every run that has a probe, else LOOK-RISK with the flags. cct's and cva's calls count as
// "look-clean" only with LOOK-GATE clean; with LOOK-RISK they are mechanism only (no build) until the pixel check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ...names] = process.argv.slice(2);
if (!dir || !names.length) { console.error('usage: check-inject119.mjs <folder> <run> ...'); process.exit(1); }
const bad = [], looks = [];
for (const name of names) {
  const arm = name.replace(/-H\d+$/, '');
  let v = null;
  try { const g = JSON.parse(readFileSync(join(dir, `g-${name}.json`), 'utf8')); v = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof v === 'string') v = JSON.parse(v); } catch (e) { bad.push(`${name}: no gesture file (${e.message})`); continue; }
  if (!v) { bad.push(`${name}: no inject record`); continue; }
  const why = [];
  if (!v.ioInstalled || !Array.isArray(v.io) || v.io.length < 1) why.push('no IO record');
  const c = v.cs || {};
  if (arm === 'C') { if (v.arm !== 'none') why.push(`arm ${v.arm}`); if (v.applied) why.push('arm rule present'); }
  else if (arm === 'cct') {
    if (!v.applied || !/contain:content/.test(v.css || '')) why.push('rule not applied');
    const ok = c.contain === 'content' || ['layout', 'paint', 'style'].every((k) => (c.contain || '').includes(k));
    if (!ok) why.push(`computed contain ${c.contain}`);
  } else if (arm === 'cva') {
    if (!v.applied) why.push('rule not applied');
    if (!(v.measured?.showcaseH > 0)) why.push('no measured height');
    if (c.cv !== 'auto') why.push(`computed content-visibility ${c.cv}`);
  } else why.push(`unknown arm ${arm}`);
  console.log(`${name.padEnd(8)} arm ${v.arm} applied ${v.applied} cs ${JSON.stringify(c)} io ${v.io?.length ?? 0} entries docH ${v.docH0}->${v.docH1}${why.length ? ' INSUFFICIENT: ' + why.join('; ') : ''}`);
  if (why.length) bad.push(`${name}: ${why.join('; ')}`);
  if (v.look) looks.push([name, v.look]);
}
console.log(bad.length ? `INJECT-GATE INSUFFICIENT ${bad.join(' | ')}` : 'INJECT-GATE all applied');
if (!looks.length) console.log('LOOK-GATE no probe');
else {
  const risky = looks.filter(([, l]) => !l.clean);
  const l = looks[0][1];
  const flags = (x) => `out ${x.nOut} fixed ${x.fixed.length} absOut ${x.nAbsOut} zidx ${x.nZidx} (box stacking ${x.stacking}) counters ${x.counters.length} collapse ${x.collapse.join(',') || 0} ink ${x.nInk} baseline ${x.baseline} clipped ${x.clipped}`;
  console.log(risky.length ? `LOOK-GATE LOOK-RISK ${risky.map(([n, x]) => `${n}: ${flags(x)}`).join(' | ')}` : `LOOK-GATE clean (${flags(l)})`);
}

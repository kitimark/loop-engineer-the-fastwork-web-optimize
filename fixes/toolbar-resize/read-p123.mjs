#!/usr/bin/env node
// toolbar-resize P-123 reader (frozen before data): per run, p123-inject read() from g-<run>.json -> one call; COUNTS ONLY.
//   node fixes/toolbar-resize/read-p123.mjs <folder> <run> ... [--json]
// Validity per run (else INSUFFICIENT): inject value present, no install/tick error, snapshots A, B and C taken, >= 2
//   toolbar steps (innerHeight changes) seen, ihMax - ihMin >= 20.
// Call per run (first match):
//   VALUE-FLIP   >= 1 ATTRIBUTED property of an element in the box (the showcase or a descendant) flips with the toolbar
//                (A == A2 == C, B == B2, A != B; B2 missing: flipPartial counts only with C == A). Attributed (T3, ops
//                pre-data read): the element:property is in the audit's viewport-unit set (own rule, inline style, or a
//                var() of a viewport-unit custom property), or the element inherits it from an ancestor that is (same
//                value at A and B). Every other flip is listed as "scroll-confounded or layout-derived", never called.
//                Flips are counted over every element:property (T1); a flip list over its cap (2000) is INSUFFICIENT.
//   WRITE        no attributed flip; >= 1 STEP-SPECIFIC write key on the box or inside it (T2): MutationObserver count
//                in step frames >= 2 and (none in rest frames, or step rate per step frame >= 2x rest rate per rest frame)
//   INVAL-ONLY   no flip, no step write; >= 1 element in the box matches a viewport-unit rule or has one inline
//                (the set WebKit re-resolves on a viewport size change; values unchanged)
//   OUTSIDE      no flip, no step write, no viewport-unit element in the box (the trigger enters from outside;
//                ancestor flips and ancestor step writes are listed)
// Probe call: the runs' calls agree (and for VALUE-FLIP the flipping element:property sets overlap) -> that call;
//   else SPLIT. Ancestor flips, step writes and resize hits are always listed, never part of the call.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const argv = process.argv.slice(2), asJson = argv.includes('--json');
const [dir, ...runs] = argv.filter((a) => a !== '--json');
const rows = [];
for (const run of runs) {
  let v = null; try { const g = JSON.parse(readFileSync(join(dir, `g-${run}.json`), 'utf8')); v = (g.run?.inject || g.inject || [])[0]?.value ?? null; } catch (e) { v = { error: 'read: ' + e.message }; }
  const why = [];
  if (!v) why.push('no inject value'); else if (v.error) why.push('inject error: ' + v.error);
  const fr = v?.frames || {}, sn = v?.snaps || {};
  if (v && !v.error) {
    if (fr.err) why.push('tick error: ' + fr.err);
    for (const k of ['A', 'B', 'C']) if (!sn[k]) why.push(`snapshot ${k} missing`);
    if (!(fr.steps >= 2)) why.push(`steps ${fr.steps}`);
    if (!(fr.ihMax - fr.ihMin >= 20)) why.push(`ih range ${fr.ihMin}-${fr.ihMax}`);
    if (!(fr.stepFrames >= 2 && fr.restFrames >= 1)) why.push(`frames step ${fr.stepFrames} rest ${fr.restFrames}`);
    if (v.diff?.flipsTruncated) why.push('flip list over its cap (T1)');
  }
  const list = v?.diff?.flips || [];
  const inBox = (el) => { const h = (v?.audit?.nBox ?? 0); return Number(el.split(':')[0]) < h; };
  const fl = list.filter((d) => d.flip || (d.flipPartial && d.v[3] !== null));
  const fmt = (d) => `${d.el} ${d.prop}: ${d.v[0]} -> ${d.v[2]}${d.attr ? ' [' + d.attr + ']' : ''}`;
  const flips = fl.filter((d) => d.attr && inBox(d.el)).map(fmt);
  const ancFlips = fl.filter((d) => d.attr && !inBox(d.el)).map(fmt);
  const confounded = fl.filter((d) => !d.attr).map(fmt);
  const ss = v?.mo?.stepSpecific || [];
  const stepWrites = ss.filter(([k]) => /^(box|in)\|/.test(k));
  const ancWrites = ss.filter(([k]) => /^anc\|/.test(k));
  const vuBox = (v?.audit?.hits || []).filter((h) => h.where !== 'anc' && !h.pseudo).map((h) => `${h.el} <- ${h.sel} {${h.decl.join('; ')}}${h.cond ? ' @' + h.cond : ''}`);
  const nVuBox = (v?.audit?.nVuBox ?? 0) + 0;
  const call = why.length ? 'INSUFFICIENT' : flips.length ? 'VALUE-FLIP' : (stepWrites.length > 0 ? 'WRITE' : nVuBox > 0 ? 'INVAL-ONLY' : 'OUTSIDE');
  rows.push({ run, call, why, frames: fr, snaps: sn, nFlip: flips.length, flips, ancFlips, nConfounded: confounded.length, confounded: confounded.slice(0, 40), nNoise: v?.diff?.nNoise, nAny: v?.diff?.nAny, truncated: v?.diff?.rowsTruncated,
    mo: v?.mo ? { stepBoxIn: v.mo.stepBoxIn, stepAnc: v.mo.stepAnc, restBoxIn: v.mo.restBoxIn, restAnc: v.mo.restAnc } : null, stepWrites, ancWrites,
    ro: v?.ro ? { step: v.ro.step, rest: v.ro.rest, top: v.ro.top.slice(0, 12) } : null,
    audit: v?.audit ? { nBox: v.audit.nBox, nAnc: v.audit.nAnc, nRulesVU: v.audit.nRulesVU, nVuBox, nVuAnc: v.audit.nVuAnc, nHits: v.audit.nHits, skipped: v.audit.skipped, inline: v.audit.inline, nCustom: v.audit.nCustom, custom: (v.audit.custom || []).slice(0, 8), anims: (v.audit.anims || []).filter((a) => a.vu), nQc: v.audit.nQc, qc: v.audit.qc } : null, vuBox });
}
const calls = [...new Set(rows.map((r) => r.call))];
let probe = calls.length === 1 ? calls[0] : 'SPLIT';
if (probe === 'VALUE-FLIP' && rows.length > 1) { const sets = rows.map((r) => new Set(r.flips.map((f) => f.split(':').slice(0, 2).join(':').split(' ').slice(0, 2).join(' ')))); const common = [...sets[0]].filter((k) => sets.every((s) => s.has(k))); if (!common.length) probe = 'SPLIT'; }
if (rows.some((r) => r.call === 'INSUFFICIENT')) probe = rows.every((r) => r.call === 'INSUFFICIENT') ? 'INSUFFICIENT' : probe === 'SPLIT' ? 'SPLIT' : probe;
const out = { probe, runs: rows };
// no process.exit here: a large --json output must flush (a pipe write is async)
if (asJson) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
else {
  console.log(`P-123 probe call: ${probe}`);
  for (const r of rows) {
    console.log(`\n${r.run}: ${r.call}${r.why.length ? ' (' + r.why.join('; ') + ')' : ''}  frames ${r.frames?.f} steps ${r.frames?.steps} ih ${r.frames?.ihMin}-${r.frames?.ihMax}  snaps ${Object.entries(r.snaps || {}).map(([k, s]) => `${k}@ih${s.ih}/top${s.top}`).join(' ')}`);
    console.log(`  diff: any ${r.nAny} noise ${r.nNoise} attributed box flips ${r.nFlip}${r.truncated ? ' (other rows truncated)' : ''}`); for (const f of r.flips.slice(0, 20)) console.log('    ' + f);
    if (r.nConfounded) { console.log(`  scroll-confounded or layout-derived flips (not called) ${r.nConfounded}`); for (const f of r.confounded.slice(0, 15)) console.log('    ' + f); }
    if (r.ancFlips.length) { console.log(`  ancestor flips ${r.ancFlips.length}`); for (const f of r.ancFlips.slice(0, 10)) console.log('    ' + f); }
    console.log(`  writes (MO): step frames ${r.frames?.stepFrames} rest frames ${r.frames?.restFrames}; records step box/in ${r.mo?.stepBoxIn} anc ${r.mo?.stepAnc}; rest box/in ${r.mo?.restBoxIn} anc ${r.mo?.restAnc}; step-specific keys box/in ${r.stepWrites.length} anc ${r.ancWrites.length}`); for (const w of r.stepWrites.concat(r.ancWrites).slice(0, 10)) console.log(`    ${w[0]} step ${w[1]} rest ${w[2]}`);
    console.log(`  sizes (RO): step ${r.ro?.step} rest ${r.ro?.rest}`); for (const w of (r.ro?.top || []).filter(([k]) => k.startsWith('step')).slice(0, 8)) console.log('    ' + w.join(' x'));
    console.log(`  audit: box ${r.audit?.nBox} anc ${r.audit?.nAnc}; VU rules ${r.audit?.nRulesVU}, hits ${r.audit?.nHits}, VU elements box ${r.audit?.nVuBox} anc ${r.audit?.nVuAnc}; custom ${r.audit?.nCustom}; VU animations ${r.audit?.anims?.length}; query containers / anchors ${r.audit?.nQc} (${(r.audit?.qc || []).map((q) => q.where + ' ' + q.el + ' ' + q.ct).slice(0, 6).join(', ')}); skipped sheets ${r.audit?.skipped?.length}`);
    for (const h of r.vuBox.slice(0, 12)) console.log('    ' + h);
  }
}

#!/usr/bin/env node
// toolbar-resize P-141 (single-sticky card): applied-arm gate, run before the scorer (frozen with the card). An arm run counts only
// when its gesture file's inject record shows the arm applied as carded; otherwise INSUFFICIENT (never NONE).
//   node fixes/toolbar-resize/check-ss.mjs <folder> <run> ...   (run = <arm>-H<n>; C runs need arm 'none')
// C, nvc, nvn: exactly check-pgp.mjs's gateWhy (da32f37117f6): record present, arm matches, showcase IO installed, census
//   present, |docH0 - docHpre| <= 2; nvc: no fixed and no sticky renderer in the census right after the rule; nvn: no
//   sticky renderer left.
// Keep-one arms (hso | pso | fso), on top of gateWhy's common checks (applied, non-empty rule): the census right after the
//   rule holds EXACTLY ONE sticky renderer, and it is the kept one (hso: div.hero...; pso: div.pain-sticky; fso:
//   section#platform). The fixed renderers may stay.
// Reported, never gating: vcEnd (census at the end of the run), fw-ms at install and at the end, docH.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateWhy as pgpGateWhy } from './check-pgp.mjs';
export const KEEP_RE = { hso: /^div\.hero(\.|$)/, pso: /^div\.pain-sticky(\.|$)/, fso: /^section#platform(\.|$)/ };
export function gateWhy(run, v) {
  const arm = run.replace(/-H\d+$/, '');
  const why = pgpGateWhy(run, v);
  if (!v || typeof v !== 'object' || !KEEP_RE[arm]) return why;
  const sticky = (Array.isArray(v.vc1) ? v.vc1 : []).filter((r) => r[1] === 'sticky');
  if (sticky.length !== 1 || !KEEP_RE[arm].test(sticky[0][0])) why.push(`sticky after the rule: [${sticky.map((r) => r[0]).join(', ')}], want only the kept one (${arm})`);
  return why;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, ...runs] = process.argv.slice(2);
  if (!dir || !runs.length) { console.error('usage: check-ss.mjs <folder> <run> ...'); process.exit(1); }
  let bad = 0;
  for (const run of runs) {
    let v = null; const pre = [];
    try { const g = JSON.parse(readFileSync(join(dir, `g-${run}.json`), 'utf8')); v = (g.run?.inject || g.inject || [])[0]?.value ?? null; if (typeof v === 'string') v = JSON.parse(v); } catch (e) { pre.push(`read: ${e.message}`); }
    const why = [...pre, ...gateWhy(run, v)];
    if (why.length) bad++;
    const rep = v ? { vc1: (v.vc1 || []).map((r) => r.join(':')), vcEnd: (v.vcEnd || []).map((r) => r.join(':')), fwms: [v.fwms0, v.fwmsEnd], docH: [v.docHpre, v.docH0, v.docH1] } : null;
    console.log(`${run.padEnd(9)} ${why.length ? 'NOT-APPLIED -> INSUFFICIENT: ' + why.join('; ') : 'applied'} | ${JSON.stringify(rep).slice(0, 400)}`);
  }
  console.log(`INJECT-GATE ${bad ? `${bad} run(s) not applied` : 'all applied'}`);
}

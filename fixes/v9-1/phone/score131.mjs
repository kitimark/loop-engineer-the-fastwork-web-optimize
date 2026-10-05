#!/usr/bin/env node
// P-131 scorer (v9.1 phone no-worse check: C = v9-final 8b5ce9b3 vs V = v9.1 = v9-final + scroll-cb + the g11 close rule;
// fixes/v9-1/README.md "P-131"). Written before any P-131 data. A thin wrapper: every rule is P-122's scorer
// fixes/v9-best/phone/p122/score.mjs, imported unchanged and refused if changed (pin below); only the arm pins differ.
//   gates     GM (P-111's G gate on part M, C vs V, >= 3 valid runs an arm), EX (V ceiling on part X, >= 3 valid V),
//             ES (V ceiling on part S, >= 2 valid V), FLICKER (nav-hit-cache's gate, G1 = V monotone blinks 0, per part)
//   behaviour fling-distance parity (P-122's rule: M's first page-up fling after mid1, X's first stroke after into1;
//             > 300 px median gap AND >= 2 same-direction pairs > 300 px is BEHAVIOUR FAIL; < 2 pairs insufficient)
//   no part R in P-131 (hold131.sh refuses it); P-122's R report prints nV 0.
// Known, by design, report only: arm C now carries rev 7c too, so P-122's C rule for part X (the fling leaves the end
// by >= 1600 px) VOIDs C's X runs as "caught". No gate reads C's X runs (EX and ES are V ceilings; parity and FLICKER
// take every counted run whatever its path gate said), so this changes no verdict.
//   node fixes/v9-1/phone/score131.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const P122_SCORER = ['../../v9-best/phone/p122/score.mjs', 'd1dddb910cd9'];
{
  const got = sha(join(here, P122_SCORER[0])).slice(0, 12);
  if (got !== P122_SCORER[1]) { console.error(`p122/score.mjs changed (${got}, pinned ${P122_SCORER[1]}): refuse`); process.exit(3); }
}
export const Q = await import(join(here, P122_SCORER[0]));
const self = sha(fileURLToPath(import.meta.url));
// P-131's arms: C = v9-final (P-122's V, fixes/v9-best/build.mjs V9_EXPECT), V = v9.1 (build.mjs --target v91, V91_EXPECT)
export const P131 = {
  C: { ...Q.P122.V },
  V: { js: 'c3d36476c3ce04cf475a33c4f59e5592b5cfb1e964230614f86b6c41231926b8', css: 'f1997edf53090f2301f475c6d05675ae28f2e37808f3189276e90368ade60308' },
};

export function score131(entries, flicker = null) { return Q.scoreP122(entries, flicker); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  Q.V9S.pin(P131);
  const entries = Q.V9S.loadEntries(args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)));
  const fbase = (jsonOut || '/dev/null') === '/dev/null' ? null : jsonOut.replace(/\.json$/, '');
  const flicker = Q.flickerGate(Q.flickerFiles(entries), (P, C, V) => {
    const fj = fbase ? `${fbase}-flicker-${P}.json` : null;
    return { ...spawnSync(process.execPath, [Q.FLICKER, '--arm', 'C', ...C, '--arm', 'V', ...V, ...(fj ? ['--json', fj] : [])], { encoding: 'utf8' }), json: fj };
  });
  const out = score131(entries, flicker);
  for (const r of out.runs) {
    const what = r.kind === 'S' ? `sentinel ${JSON.stringify(r.sentinel?.pass ?? null)}`
      : `${JSON.stringify(r.window ?? r.counts)}${r.path?.outs ? '; outs ' + JSON.stringify(r.path.outs.map((o) => [o.name, o.fv, o.travel, o.fromEnd])) : ''}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}; f260 ${JSON.stringify(r.f260 ?? null)}`);
  }
  for (const [k, g] of Object.entries(out.gates)) console.log(`${k}: ${JSON.stringify(g)}`);
  for (const [P, x] of Object.entries(out.gates.FLICKER.parts)) console.log(`FLICKER ${P}: ${x.verdict}${x.files ? ` (files C ${x.files.C} V ${x.files.V})` : ''}`);
  for (const [P, x] of Object.entries(out.reported.parity.parts)) {
    const runs = x.runs.C.concat(x.runs.V).map((r) => `${r.item} ${r.compared ? `${r.compared.d}${r.compared.clipped ? ' clipped' : ''} (${r.compared.how})` : '-'}`).join(' | ');
    console.log(`parity ${P} (OBSERVED, lift to settle or next stroke): ${x.compared ? `${x.compared}: median C ${x.C} V ${x.V} gap ${x.gap}; pairs ${JSON.stringify((x.pairs || []).map((q) => [q.n, q.gap, q.counts]))}; ${x.verdict}` : 'reported only'}${x.firstDown ? `; first page-down (report) C ${x.firstDown.C} V ${x.firstDown.V}` : ''}; runs ${runs}`);
  }
  console.log(`parity: ${out.reported.parity.verdict}`);
  if (out.reported.parity.verdict === 'BEHAVIOUR FAIL') { console.log('BEHAVIOUR FAIL'); for (const f of out.reported.parity.fail) console.log(`  ${f}`); }
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}`);
  console.log(`scorer sha256 ${self} (wraps p122/score.mjs ${P122_SCORER[1]})`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v9-1/phone/score131.mjs', sha256: self, wraps: P122_SCORER, ...out }, null, 1));
}

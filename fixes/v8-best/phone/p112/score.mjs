#!/usr/bin/env node
// P-112 scorer (v8 morph close-tween attribution; PHONE TICKET in fixes/v8-best/README.md "P-112"). Committed before any
// phone data. It runs P-111's committed scorer unchanged (fixes/v8-best/phone/score.mjs, sha256 26d944bf93e2: the same M
// voids, sentinel chain, Mmoving and Mtweens gates) with two changes: arm C's expected served build is v8 minus morph-gpu
// rev 3 (JS 3e3e94cb6e9f, CSS 7eda63cc7015), and the verdict is taken over the M gates only (the W and G gates have no
// runs here). Warm-up items wmC / wmV are skipped.
//   node fixes/v8-best/phone/p112/score.mjs mC1:<file> mV2:<file> ... [--json out.json]   (block order, VALID holds)
// Verdict (attribution, C = v8 - rev 3, V = v8):
//   CAUSE when Mtweens is WORSE (close.f1 or close.f3 d > +2 ms, or an O1 key) -> rev 3 is the cause of P-111's close.
//   NOT THE CAUSE when close.f1 and close.f3 d <= +2 ms (the falsifier) and Mmoving is no-worse.
//   insufficient when either arm has fewer than 3 valid runs.
// Reported: every tween key (O1-O3, C1-C3 f1/f2/f3, close.f1-f3), the O2/O3 opens, Mmoving's deltas and twins.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '../score.mjs');
const baseSha = createHash('sha256').update(readFileSync(base)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const BASE_SHA = '26d944bf93e2fa461703536ca3a70a987c8a0c34427abbd79d6d77f03ab7fd4f';
if (baseSha !== BASE_SHA) { console.error(`P-111 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
const S = await import(base);
S.EXPECT.C = { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: '7eda63cc70155d8abfd89ceb5ea33a7dedbc6f7def014d60b8f11e85acf5d0ea' };

export function scoreP112(entries) {
  const out = S.scoreBlock(entries.filter((e) => !/^wm[CV]$/.test(e.item)));
  const M = { Mmoving: out.gates.Mmoving, Mtweens: out.gates.Mtweens };
  const ins = Object.values(M).some((g) => /^insufficient/.test(g.verdict));
  const k = out.gates.Mtweens.keys || {};
  const closeOk = k['close.f1'] && k['close.f3'] && k['close.f1'].delta <= 2 && k['close.f3'].delta <= 2;
  let verdict;
  if (ins) verdict = 'insufficient';
  else if (/^WORSE/.test(M.Mtweens.verdict)) verdict = `CAUSE: rev 3 is the cause (${M.Mtweens.verdict})`;
  else if (closeOk && !/^WORSE/.test(M.Mmoving.verdict)) verdict = 'NOT THE CAUSE: close.f1 and close.f3 d <= +2 ms, rev 3 is not the cause';
  else verdict = `MIXED: tweens no-worse, Mmoving ${M.Mmoving.verdict}`;
  const opens = Object.fromEntries(['O2', 'O3'].flatMap((t) => ['f1', 'f2', 'f3'].map((f) => [`${t}.${f}`, k[`${t}.${f}`] ? { C: k[`${t}.${f}`].C, V: k[`${t}.${f}`].V, delta: k[`${t}.${f}`].delta } : null])));
  return { runs: out.runs, gates: M, opens, verdict };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args[ji + 1] : null;
  const entries = args.filter((a, i) => !a.startsWith('--') && !(ji >= 0 && i === ji + 1)).map((s) => {
    const c = s.indexOf(':'); const item = s.slice(0, c), file = s.slice(c + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((n) => n.endsWith(`-check-${item}.log`)).map((n) => ({ n, t: statSync(join(d, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0]; if (f) checkLog = readFileSync(join(d, f.n), 'utf8'); } catch {}
    return { item, file, j, checkLog };
  });
  const r = scoreP112(entries);
  for (const x of r.runs) console.log(`${x.item}: ${x.void.length ? 'VOID ' + x.void.join(' | ') : 'valid'}; moving ${JSON.stringify(x.moving)}; O1 ${JSON.stringify(x.tweens?.O1 ?? null)}; C1 ${JSON.stringify(x.tweens?.C1 ?? null)}; held m=1 p95 ${x.atOneP95}; sentinel ${JSON.stringify(x.sentinel?.pass ?? null)}`);
  for (const [g, v] of Object.entries(r.gates)) console.log(`${g}: ${JSON.stringify(v)}`);
  console.log(`opens (reported): ${JSON.stringify(r.opens)}`);
  console.log(`VERDICT ${r.verdict}`);
  console.log(`scorer sha256 ${self} (P-111 base ${baseSha})`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ scorer: 'fixes/v8-best/phone/p112/score.mjs', sha256: self, base: baseSha, ...r }, null, 1));
}

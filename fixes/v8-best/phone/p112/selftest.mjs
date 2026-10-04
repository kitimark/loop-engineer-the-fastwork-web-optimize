#!/usr/bin/env node
// P-112 scorer self-test (before any P-112 data), on P-111's M records (out/p111/runs, H3-H4) and synthetic edits:
//   1. P-111's C records under P-112's arm C are VOID (served CSS 308f0da70c3a is not v8 - rev 3) -> insufficient;
//   2. with arm C's expectation set back to v7, P-111's M runs give CAUSE (close.f1 +2.5, close.f3 +3.5), as P-111 did;
//   3. the same with every V close tween shortened by 3 ms gives NOT THE CAUSE (the falsifier);
//   4. warm-up items wmC / wmV are skipped.
//   node fixes/v8-best/phone/p112/selftest.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { scoreP112 } = await import('./score.mjs');
const S = await import('../score.mjs');
const items = ['mC1', 'mV2', 'mV3', 'mC4', 'mC5', 'mV6', 'mV7', 'mC8'];
const load = () => items.map((item) => ({ item, j: JSON.parse(readFileSync(join(WT, `out/p111/runs/p111-${item}.json`), 'utf8')), checkLog: null }));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const keepC = S.EXPECT.C;
let r = scoreP112(load());
ok(r.verdict === 'insufficient' && r.runs.filter((x) => x.arm === 'C').every((x) => x.void.some((v) => /served not arm C/.test(v))), `1. v7 records under arm C are void -> ${r.verdict}`);
S.EXPECT.C = { js: '8c90da2177455718861e4b6a7d5a826671b7946fc61ef9254fd90d37cdcd6f00', css: '308f0da70c3a64b0dfe1a99cdbd127a77256eef9b0c809583fc328052417c84d' };
r = scoreP112(load());
ok(/^CAUSE/.test(r.verdict) && r.gates.Mtweens.keys['close.f1'].delta === 2.5 && r.gates.Mtweens.keys['close.f3'].delta === 3.5, `2. P-111's M leg -> ${r.verdict}`);
ok(r.opens['O2.f1'] && r.opens['O2.f1'].delta < 0, `   O2/O3 opens reported (O2.f1 d ${r.opens['O2.f1']?.delta})`);
const shorten = (e) => { if (e.item.startsWith('mV')) { const fr = e.j.driverResult.driver.frames; for (let q = 1; q < fr.length; q++) if (fr[q - 1][3] >= 0.999 && fr[q][3] < 0.999) for (const z of [q, q + 1, q + 2]) fr[z][1] = Math.max(1, fr[z][1] - 3); } return e; };
r = scoreP112(load().map(shorten));
ok(/^NOT THE CAUSE/.test(r.verdict), `3. V closes 3 ms shorter -> ${r.verdict} (close.f1 d ${r.gates.Mtweens.keys['close.f1'].delta}, close.f3 d ${r.gates.Mtweens.keys['close.f3'].delta})`);
r = scoreP112([{ item: 'wmC', j: null }, { item: 'wmV', j: null }, ...load()]);
ok(r.runs.length === 8 && /^CAUSE/.test(r.verdict), `4. warm-ups skipped (${r.runs.length} runs scored)`);
S.EXPECT.C = keepC;
console.log(fails ? `SELFTEST FAILED (${fails})` : 'SELFTEST OK'); process.exit(fails ? 1 : 0);

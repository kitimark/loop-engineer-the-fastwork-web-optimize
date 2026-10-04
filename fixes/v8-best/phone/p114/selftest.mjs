#!/usr/bin/env node
// P-114 scorer self-test (no P-114 data): node fixes/v8-best/phone/p114/selftest.mjs
// 1. Item mapping and warm-up skipping. 2. Equivalence: on P-111's own M and G part H records (the same arms, C = v7,
//    V = v8; out/p111/runs in int-v8's worktree, skipped when absent), the P-114 wrapper gives exactly the Mmoving,
//    Mtweens and GH gates of P-111's scorer run directly on the same items.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreP114, mapItem, present } from './score.mjs';
const S = await import('../score.mjs');
let bad = 0;
const t = (name, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}`); if (!pass) bad++; };
t('warm-ups wmC wmV wgC wgV skipped', ['wmC', 'wmV', 'wgC', 'wgV'].every((x) => mapItem(x).warmup));
t('sCo / sCc scored as P-111 sC', mapItem('sCo').as === 'sC' && mapItem('sCc').as === 'sC');
t('mC1 / gHV3 kept', mapItem('mC1').as === 'mC1' && mapItem('gHV3').as === 'gHV3');
let threw = false; try { mapItem('C1'); } catch { threw = true; } t('W items refused (no W leg in P-114)', threw);
t('band present needs 2 runs in one band bin', present([{ bins: { gt50: [10] } }, { bins: { gt50: [10] } }], 'gt50').present && !present([{ bins: { gt50: [10] } }, { bins: { gt50: [11] } }], 'gt50').present && !present([{ bins: { gt50: [12] } }, { bins: { gt50: [12] } }], 'gt50').present);
{
  const o = scoreP114([{ item: 'wmC', j: null }, { item: 'wmV', j: null }]);
  t('no counted run: insufficient', o.verdict === 'insufficient' && o.skipped.length === 2);
}
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const R = join(WT, 'out/p111/runs');
const M = ['mC1', 'mV2', 'mV3', 'mC4', 'mC5', 'mV6', 'mV7', 'mC8'], GH = ['gHC1', 'gHV1', 'gHV2', 'gHC2', 'gHC3', 'gHV3'];
if (!existsSync(join(R, 'p111-gHC1.json'))) console.log('SKIP equivalence (no out/p111/runs)');
else {
  const read = (f) => { try { return JSON.parse(readFileSync(join(R, f), 'utf8')); } catch { return null; } };
  const chk = (item) => { const f = readdirSync(R).find((x) => x.endsWith(`-check-${item}.log`)); return f ? readFileSync(join(R, f), 'utf8') : null; };
  const base = [...M.map((i) => ({ item: i, j: read(`p111-${i}.json`), checkLog: chk(i) })), ...GH.map((i) => ({ item: i, j: read(`p111-${i}.json`), checkLog: chk(i) })), { item: 'sC', j: read('p111-sC-H6.json'), checkLog: null }];
  const direct = S.scoreBlock(base.map((e) => ({ ...e })));
  const mine = scoreP114([{ item: 'wmC', j: null }, ...base.slice(0, -1), { item: 'sCc', j: base.at(-1).j, checkLog: null }]);
  for (const g of ['Mmoving', 'Mtweens', 'GH']) t(`P-111 data: ${g} equal to P-111's scorer (${String(direct.gates[g].verdict).slice(0, 60)})`, JSON.stringify(direct.gates[g]) === JSON.stringify(mine.gates[g]));
  t('P-111 data: one load1 per item', mine.loads.length === base.length + 1 && mine.loads.slice(1).every((l) => typeof l.start === 'number'));
}
console.log(bad ? `${bad} FAILED` : 'all OK');
process.exit(bad ? 1 : 0);

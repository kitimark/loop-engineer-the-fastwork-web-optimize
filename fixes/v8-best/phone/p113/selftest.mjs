#!/usr/bin/env node
// P-113 scorer self-test on synthetic records (no phone data): node fixes/v8-best/phone/p113/selftest.mjs
import { scoreP113, present, checkOk } from './score.mjs';
let bad = 0;
const t = (name, pass) => { console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}`); if (!pass) bad++; };
const LOG = 'B pid 1 port 1 served JS x CSS y ok\nC pid 1 port 2 served JS x CSS y ok\nF pid 1 port 3 served JS x CSS y ok\nR pid 1 port 4 served JS x CSS y ok\n';
// a G part H record: down1 at t 1000, end at t 9000; moving frames 16 ms, y up 20 px per frame; slow frames at {y: dt}
const G = (slow = {}) => {
  const frames = [[990, 16, 0, 775]]; let y = 0;
  for (let t = 1000; t < 9000; t += 16) { y += 20; const s = Object.entries(slow).find(([sy]) => Math.abs(+sy - y) < 10); frames.push([t, s ? s[1] : 16, y, 775]); }
  return { meta: { kind: 'gesture' }, run: { segments: [{ marks: [[0, 'idle'], [1000, 'down1'], [9000, 'end']], frames }], errors: [], aborted: null } };
};
const Srun = (pass = true) => ({ meta: { schema: 'fw-iphone-run/1', driver: 'S', served: { '/_app/immutable/nodes/2.DyWL8TcE.js': '3e3e94cb6e9f', '/_app/immutable/assets/2.gBuqKVzi.css': 'f836404b3728' }, sentinel: { pass } } });
const block = (spec, { sent = true, log = LOG } = {}) => [
  { item: 'sCo', j: Srun(true) },
  ...['C', 'F', 'R'].map((a) => ({ item: `wg${a}`, j: G(), checkLog: log })),
  ...[['C', 1], ['F', 1], ['R', 1], ['F', 2], ['R', 2], ['C', 2], ['R', 3], ['C', 3], ['F', 3]].map(([a, n]) => ({ item: `gH${a}${n}`, j: G(spec[a][n - 1]), checkLog: log })),
  { item: 'sCc', j: Srun(sent) },
];
const hit = { 2700: 58 }, near = { 2700: 48 }, none = {};
// 1. faces is the cause: C and R keep the cluster, F loses it
let o = scoreP113(block({ C: [hit, hit, none], F: [none, near, none], R: [hit, none, hit] }));
t('faces cause: F CAUSE, R NOT THE CAUSE', o.parts.F.verdict === 'CAUSE' && o.parts.R.verdict === 'NOT THE CAUSE' && /^faces \+ glue CAUSE/.test(o.verdict));
t('faces cause at > 46 too: F twin gt46 sees the 48 ms frame in one run only, still CAUSE', o.parts.F.twins.gt46 === 'CAUSE');
// 2. not reproduced: C has the slow frame in one run only
o = scoreP113(block({ C: [hit, none, none], F: [none, none, none], R: [none, none, none] }));
t('one C run only: NOT REPRODUCED', /^NOT REPRODUCED/.test(o.verdict));
// 3. neither: the cluster stays in every arm (falsifier for both parts)
o = scoreP113(block({ C: [hit, hit, hit], F: [hit, hit, none], R: [none, hit, hit] }));
t('neither: both NOT THE CAUSE', o.verdict.startsWith('NEITHER'));
// 4. threshold-sensitive: F's runs keep 52 ms frames (> 50, not > 54)
o = scoreP113(block({ C: [hit, hit, hit], F: [{ 2700: 52 }, { 2700: 52 }, none], R: [hit, hit, hit] }));
t('52 ms in F: NOT THE CAUSE at > 50, CAUSE at > 54: threshold-sensitive', o.parts.F.verdict === 'NOT THE CAUSE' && o.parts.F.twins.gt54 === 'CAUSE' && o.parts.F.thresholdSensitive);
// 5. outside the band does not count: slow frames at y 1500 only
o = scoreP113(block({ C: [{ 1500: 70 }, { 1500: 70 }, { 1500: 70 }], F: [none, none, none], R: [none, none, none] }));
t('slow frames outside 2250-2999 are not the cluster', /^NOT REPRODUCED/.test(o.verdict));
t('band edges: bins 9 and 11 count (2260, 2990)', present([{ bins: { gt50: [9] } }, { bins: { gt50: [9] } }], 'gt50').present && present([{ bins: { gt50: [11] } }, { bins: { gt50: [11] } }], 'gt50').present && !present([{ bins: { gt50: [12] } }, { bins: { gt50: [12] } }], 'gt50').present);
// 6. failing closing sentinel voids every counted run: insufficient
o = scoreP113(block({ C: [hit, hit, hit], F: [none, none, none], R: [hit, hit, hit] }, { sent: false }));
t('failing closing sentinel: insufficient', /^insufficient/.test(o.verdict));
// 7. served check: an arm line missing or WRONG voids the run
t('check log needs B C F R ok', checkOk(LOG) && !checkOk(LOG.replace(/^R .*$/m, 'R pid 1 port 4 served JS z CSS y WRONG')) && !checkOk(LOG.replace(/^F .*\n/m, '')) && !checkOk(null));
o = scoreP113(block({ C: [hit, hit, hit], F: [none, none, none], R: [hit, hit, hit] }, { log: LOG.replace(/^F .*\n/m, '') }));
t('missing F check line voids all G runs: insufficient', /^insufficient/.test(o.verdict));
// 8. warm-ups are never counted
o = scoreP113(block({ C: [hit, hit, none], F: [none, none, none], R: [hit, hit, none] }));
t('warm-ups skipped: 3 counted runs per arm', o.arms.C.n === 3 && o.arms.F.n === 3 && o.arms.R.n === 3);
console.log(bad ? `${bad} FAILED` : 'all OK');
process.exit(bad ? 1 : 0);

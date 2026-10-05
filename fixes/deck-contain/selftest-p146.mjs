// P-146 self-test: the P-146 scorer's changed rules on synthetic holds (pooled MIN_N 100, POOL-MISMATCH, warm-up
// exclusion, PC2 control, median arm call with >= 2 runs, BIMODAL flag) and the P-146 driver's arms and applied checks.
// usage: node fixes/deck-contain/selftest-p146.mjs   (prints SELFTEST-P146 ok <n> checks, exit 0; else the failures, exit 1)
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { scoreSimHold, armCall, runState, RULE } from './score-p146.mjs';
import { ARMS, APPLIED, PINS, POOL_N, POOL_MAX } from './sim-swipe-p146.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };
const deck = { top: 1100, bottom: 1944, h: 844.08, w: 462, ih: 775, docH: 6739 };
// one swipe = 162 band frames at 10 px; pooled runs repeat it
const frames = (ms, swipes = 1) => { const f = []; for (let s = 0; s < swipes; s++) for (let y = 10; y <= 2600; y += 10) f.push({ y, lay: 2.8, layMs: y > deck.top - deck.ih && y < deck.bottom ? ms : 1 }); return f; };
const thin = (ms, keep) => frames(ms).filter((f, i) => !(f.y > deck.top - deck.ih && f.y < deck.bottom) || i % keep === 0);
const run = (step, ms, extra = {}) => ({ step, arm: step.split(':')[0], applied: true, deck: { ...deck }, swipe: { steps: 260, yMax: 2600 },
  swipes: [{ s: 0, top: deck.top, docH: deck.docH }], frames: frames(ms), ...extra });
// rules
ok(RULE.MIN_N === 100 && RULE.MIN_ARM_RUNS === 2 && RULE.LOCATES === 0.30 && RULE.PARTIAL === 0.70, 'P-146 thresholds');
ok(POOL_N === 120 && POOL_MAX === 4, 'driver pool constants');
// 1 pooled C: 3 thin swipes (~55 band frames each) pass MIN_N 100; one thin swipe is LOW-N
const thinC = (k) => { const f = []; for (let s = 0; s < k; s++) f.push(...thin(40, 3)); return f; };
ok(runState(run('C:1', 40, { frames: thinC(1) })) === 'LOW-N', 'one thin C swipe is LOW-N under MIN_N 100');
ok(runState(run('C:1', 40, { frames: thinC(3) })) === 'OK', 'three pooled thin C swipes pass');
// 2 POOL-MISMATCH: a swipe whose deck top differs by 48 px
ok(runState(run('C:1', 40, { swipes: [{ s: 0, top: deck.top, docH: deck.docH }, { s: 1, top: deck.top + 48, docH: deck.docH }] })) === 'POOL-MISMATCH', 'swipes disagree -> POOL-MISMATCH');
// 3 a clean hold with PC2 locating
let h = scoreSimHold({ dir: 'h1', runs: [run('C:1', 40), run('PC2:1', 0.4), run('A3:1', 0.5), run('C:2', 40), run('R3:1', 25), run('A4:1', 0.5), run('C:3', 40)] });
ok(h.hold === 'OK', 'clean hold OK');
// 4 PC2 at the middle level -> CONTROL-FAILED
const h2 = scoreSimHold({ dir: 'h2', runs: [run('C:1', 40), run('PC2:1', 25), run('A3:1', 0.5), run('C:2', 40)] });
ok(h2.hold === 'CONTROL-FAILED', 'PC2 0.62 -> CONTROL-FAILED');
// 5 median arm call, bimodal flag, >= 2 runs
const h3 = scoreSimHold({ dir: 'h3', runs: [run('C:4', 40), run('PC2:2', 0.4), run('A3:2', 25), run('C:5', 40), run('R3:2', 25), run('C:6', 40)] });
const h4 = scoreSimHold({ dir: 'h4', runs: [run('C:7', 40), run('PC2:3', 0.4), run('A3:3', 0.5), run('C:8', 40), run('R3:3', 0.5), run('C:9', 40)] });
const a3 = armCall([h, h3, h4], 'A3');
ok(a3.call === 'LOCATES' && a3.runs === 3 && a3.bimodal && a3.low === 2 && a3.high === 1, 'A3 median of 0.012, 0.62, 0.012 -> LOCATES, BIMODAL');
const r3 = armCall([h, h3, h4], 'R3');
ok(r3.call === 'PARTIAL' && r3.bimodal, 'R3 median of 0.62, 0.62, 0.012 -> PARTIAL, BIMODAL');
ok(armCall([h], 'A4').call === 'INSUFFICIENT', 'one run -> INSUFFICIENT');
ok(armCall([h2, h3], 'A3').runs === 1, 'CONTROL-FAILED hold not read');
// 6 warm-up step W:0 never scored (loader filter), via a temp hold folder
const dir = mkdtempSync(join(tmpdir(), 'p146-'));
try {
  writeFileSync(join(dir, 'runs.jsonl'), [run('W:0', 99), run('C:1', 40), run('PC2:1', 0.4), run('C:2', 40)].map((r) => JSON.stringify(r)).join('\n') + '\n');
  const { loadHold } = await import('./score-p146.mjs');
  if (loadHold) ok(!loadHold(dir).runs.some((r) => r.step === 'W:0'), 'W:0 excluded by the loader');
  else ok(/:0\$\/\.test/.test(readFileSync(join(HERE, 'score-p146.mjs'), 'utf8')), 'loader excludes :0 steps');
} finally { rmSync(dir, { recursive: true, force: true }); }
// 6b rev 1.1 (read N1): the budget-drop branch, and a hold missing a registered step
{
  const { budgetDrop } = await import('./sim-swipe-p146.mjs');
  ok(budgetDrop('H1', 'A4:1', 400, null, 500) === null && budgetDrop('H1', 'A4:1', 400, 90, 500) === null, 'budgetDrop: no estimate or fits -> null');
  const d = budgetDrop('H1', 'A4:1', 420, 90.4, 500);
  ok(d && d.rec.dropped === 'budget' && d.rec.est === 90.4 && d.line === 'DROPPED A4:1 budget 420 + 90 > 500', 'budgetDrop: past the budget -> record and log line, no throw');
  const reg = ['W:0', 'C:1', 'PC2:1', 'A3:1', 'C:2', 'R3:1', 'A4:1', 'C:3'];
  const full = [run('C:1', 40), run('PC2:1', 0.4), run('A3:1', 0.5), run('C:2', 40), run('R3:1', 0.5), run('A4:1', 0.5), run('C:3', 40)];
  ok(scoreSimHold({ dir: 'm0', runs: full, registered: reg }).hold === 'OK', 'all registered steps present -> OK');
  const cut = scoreSimHold({ dir: 'm1', runs: full.slice(0, 5), registered: reg });
  ok(cut.hold === 'NOT-REPRODUCED' && cut.missingSteps.join() === 'A4:1,C:3', 'hold cut after R3:1 -> NOT-REPRODUCED, missing A4:1 C:3');
  ok(scoreSimHold({ dir: 'm2', runs: full, registered: null }).hold === 'NOT-REPRODUCED', 'no hold.json manifest -> NOT-REPRODUCED');
  const dropped = scoreSimHold({ dir: 'm3', runs: [...full.slice(0, 5), { step: 'A4:1', arm: 'A4', dropped: 'budget' }, run('C:3', 40)], registered: reg });
  ok(dropped.hold === 'OK' && !dropped.missingSteps, 'a budget-dropped arm has a record: not missing');
}
// 7 driver arms and applied forms
ok(ARMS.PC2 === 'pc2-cv-hidden.css' && ARMS.W === null && ARMS.C === null, 'PC2 and W arms');
ok(/content-visibility:\s*hidden/.test(readFileSync(join(HERE, 'arms', ARMS.PC2), 'utf8')) && !/\d+px/.test(readFileSync(join(HERE, 'arms', ARMS.PC2), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*/, '')), 'PC2: content-visibility hidden, no px length outside the media query');
const base = { contain: 'none', pb: 0, ct: 'normal', cv: 'visible', h: 844.078 };
ok(APPLIED.C(base) && APPLIED.W(base) && !APPLIED.PC2(base), 'C and W apply on base; PC2 does not');
ok(APPLIED.PC2({ ...base, cv: 'hidden', pb: 844.08 }) && !APPLIED.C({ ...base, cv: 'hidden' }), 'PC2 applied form');
ok(PINS.js === '941aa13e5bdf' && PINS.css === 'f1997edf5309', 'served pins unchanged');
if (bad.length) { console.log('SELFTEST-P146 FAIL', bad.join('; ')); process.exit(1); }
console.log(`SELFTEST-P146 ok ${n} checks`);

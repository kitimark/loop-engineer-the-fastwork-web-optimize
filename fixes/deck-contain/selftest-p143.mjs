// P-143 self-test: the frozen scorer's rules on synthetic holds, and the drivers' pinned arms and applied checks.
// usage: node fixes/deck-contain/selftest-p143.mjs   (prints SELFTEST ok <n> checks, exit 0; else the failures, exit 1)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { scoreSimHold, armCall, scoreChromeHold, runState, call, RULE } from './score-p143.mjs';
import { ARMS, APPLIED, PINS, HOST_MAX, TO, PX } from './sim-swipe.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };
const deck = { top: 1100, bottom: 1944, h: 844.08, w: 462, ih: 775, docH: 6739 };
const frames = (ms, k = 1) => { const f = []; for (let y = 10; y <= 2600; y += 10) f.push({ y, lay: k, layMs: y > deck.top - deck.ih && y < deck.bottom ? ms : 1, rs: 1, rsMs: 1, invLay: 1, paints: 1 }); return f; };
const run = (step, ms, extra = {}) => ({ step, arm: step.split(':')[0], applied: true, deck: { ...deck }, swipe: { steps: 260, yMax: 2600 }, frames: frames(ms), load1Start: 50, load1End: 60, ...extra });
// 1 a clean hold: C 40, PC 0.5, A 0.6, C 41, B 0.5, C 40
let h = scoreSimHold({ dir: 'h1', runs: [run('C:1', 40), run('PC:1', 0.5), run('A3:1', 0.6), run('C:2', 41), run('A4:1', 0.5), run('C:3', 40)] });
ok(h.hold === 'OK', 'clean hold OK');
ok(h.runs.find((r) => r.step === 'A3:1').call === 'LOCATES', 'A LOCATES');
ok(Math.abs(h.runs.find((r) => r.step === 'A3:1').ratio - 0.6 / 40.5) < 0.001, 'A ratio vs nearest C before and after');
ok(h.runs.find((r) => r.step === 'C:1').n === frames(1).filter((f) => f.y > deck.top - deck.ih && f.y < deck.bottom).length && h.runs.find((r) => r.step === 'C:1').n === 162, 'band n counts frames with the deck in view');
// 2 PC does not locate -> CONTROL-FAILED
h = scoreSimHold({ dir: 'h2', runs: [run('C:1', 40), run('PC:1', 30), run('A3:1', 0.6), run('C:2', 40)] });
ok(h.hold === 'CONTROL-FAILED', 'PC NONE -> CONTROL-FAILED');
ok(armCall([h], 'A3').call === 'INSUFFICIENT', 'CONTROL-FAILED hold is not read');
// 3 A/A gate: inner C off by 40 % -> NOT-REPRODUCED
h = scoreSimHold({ dir: 'h3', runs: [run('C:1', 40), run('PC:1', 0.5), run('C:2', 56), run('A3:1', 1), run('C:3', 40)] });
ok(h.hold === 'NOT-REPRODUCED', 'A/A outside 0.80-1.25 -> NOT-REPRODUCED');
// 4 drift > 30 % -> VOID
h = scoreSimHold({ dir: 'h4', runs: [run('C:1', 40), run('PC:1', 0.5), run('C:2', 45), run('A3:1', 1), run('C:3', 53)] });
ok(h.hold === 'VOID', 'drift 0.325 -> VOID');
// 5 a C run with an error -> NOT-REPRODUCED
h = scoreSimHold({ dir: 'h5', runs: [run('C:1', 40), run('PC:1', 0.5), run('C:2', 40, { error: 'x' })] });
ok(h.hold === 'NOT-REPRODUCED', 'C error -> NOT-REPRODUCED');
// 6 GEOMETRY: A's deck 10 px taller
h = scoreSimHold({ dir: 'h6', runs: [run('C:1', 40), run('PC:1', 0.5), run('A3:1', 1, { deck: { ...deck, h: 854.08 } }), run('C:2', 40)] });
ok(h.runs.find((r) => r.step === 'A3:1').call === 'GEOMETRY', 'deck +10 px -> GEOMETRY');
ok(armCall([h], 'A3').call === 'GEOMETRY', 'armCall GEOMETRY');
// 7 PC's own 0.08 px height change is no GEOMETRY for anyone; PC geometry only reported
h = scoreSimHold({ dir: 'h7', runs: [run('C:1', 40), run('PC:1', 0.5, { deck: { ...deck, h: 844 } }), run('C:2', 40)] });
ok(h.runs.find((r) => r.step === 'PC:1').call === 'LOCATES', 'PC 844 vs 844.08 not GEOMETRY');
// 8 states
ok(runState({ ...run('A3:1', 1), applied: false }) === 'NOT-APPLIED', 'not applied');
ok(runState({ ...run('A3:1', 1), swipe: { yMax: 1500 } }) === 'SHORT', 'short swipe');
ok(runState({ ...run('A3:1', 1), frames: frames(1).slice(0, 50) }) === 'LOW-N', 'low n');
ok(runState({ step: 'A3:2', dropped: 'budget' }) === 'DROPPED', 'dropped');
ok(runState({ step: 'C:1', voidHost: 210 }) === 'VOID-HOST', 'void host');
// 9 calls and two-run arm rule
ok(call(0.30) === 'LOCATES' && call(0.31) === 'PARTIAL' && call(0.70) === 'PARTIAL' && call(0.71) === 'NONE', 'call thresholds');
const hA = scoreSimHold({ dir: 'a', runs: [run('C:1', 40), run('PC:1', 0.5), run('A3:1', 10), run('C:2', 40)] });
const hB = scoreSimHold({ dir: 'b', runs: [run('C:1', 40), run('PC:1', 0.5), run('A3:2', 2), run('C:2', 40)] });
ok(armCall([hA, hB], 'A3').call === 'LOCATES', 'two runs: mean (0.25+0.05)/2 <= 0.30 -> LOCATES');
const hC = scoreSimHold({ dir: 'c', runs: [run('C:1', 40), run('PC:1', 0.5), run('A3:2', 20), run('C:2', 40)] });
ok(armCall([hA, hC], 'A3').call === 'PARTIAL', 'two runs: mean 0.375 -> PARTIAL');
// 10 VOID-HOST hold
h = scoreSimHold({ dir: 'h10', runs: [run('C:1', 40), { step: 'PC:1', voidHost: 230 }] });
ok(h.hold === 'VOID-HOST', 'void-host hold');
// 11 chrome scorer ratios
const cf = (dirty) => frames(1).map((f) => ({ y: f.y, lay: 2, layMs: 1, dirty, ult: 1, ultEl: 10, paints: 1 }));
const ch = scoreChromeHold({ dir: 'c1', runs: [{ step: 'C:1', arm: 'C', applied: true, deck, swipe: { yMax: 2600 }, frames: cf(100) }, { step: 'A3:1', arm: 'A', applied: true, deck, swipe: { yMax: 2600 }, frames: cf(50) }, { step: 'C:2', arm: 'C', applied: true, deck, swipe: { yMax: 2600 }, frames: cf(100) }] });
ok(ch.hold === 'OK' && ch.runs[1].dirtyRatio === 0.5 && ch.runs[1].layRatio === 1, 'chrome ratios');
// 12 pins and arms
const sha = (f) => createHash('sha256').update(readFileSync(join(HERE, 'arms', f))).digest('hex').slice(0, 12);
ok(sha('pc-strict844.css') === 'a8b99f85dc7a', 'PC is T-194 abl-strict-deck.css byte for byte (a8b99f85dc7a)');
ok(ARMS.C === null && ARMS.PC === 'pc-strict844.css' && ARMS.A3 === 'a3-pad.css' && ARMS.A4 === 'a4-cq.css' && ARMS.R3 === 'r3-pad-only.css' && Object.keys(ARMS).length === 5, 'arm files');
ok(PINS.js === '941aa13e5bdf' && PINS.css === 'f1997edf5309', 'served pins v9.1d');
ok(HOST_MAX === 200 && TO === 2600 && PX === 10 && RULE.MIN_N === 60, 'constants');
const d0 = { contain: 'none', pb: 0, ct: 'normal', h: 844.08 };
ok(APPLIED.C(d0) && !APPLIED.A3(d0) && !APPLIED.A4(d0) && !APPLIED.R3(d0) && !APPLIED.PC(d0), 'C form only C');
ok(APPLIED.A3({ ...d0, contain: 'size layout', pb: 844.08 }) && !APPLIED.R3({ ...d0, contain: 'size layout', pb: 844.08 }), 'A3 form');
ok(APPLIED.R3({ ...d0, pb: 844.08 }) && !APPLIED.A3({ ...d0, pb: 844.08 }), 'R3 form');
ok(APPLIED.A4({ ...d0, contain: 'size layout', ct: 'inline-size' }) && !APPLIED.A3({ ...d0, contain: 'size layout', ct: 'inline-size' }), 'A4 form');
ok(APPLIED.PC({ contain: 'strict', h: 844 }) && !APPLIED.PC({ contain: 'strict', h: 844.08 }), 'PC form');
// the arm files' rules (no hard-coded height in A3, A4, R3; PC's 844 is the control)
const txt = (f) => readFileSync(join(HERE, 'arms', f), 'utf8').replace(/^@media[^{]*\{/m, '');
ok(!/\d+px/.test(txt('a3-pad.css').replace(/\/\*[\s\S]*?\*\//g, '')) && !/\d+px/.test(txt('a4-cq.css').replace(/\/\*[\s\S]*?\*\//g, '')) && !/\d+px/.test(txt('r3-pad-only.css').replace(/\/\*[\s\S]*?\*\//g, '')), 'no px length in A3, A4, R3 (width<=Npx media features aside)');
if (bad.length) { console.log('SELFTEST FAIL', bad.join('; ')); process.exit(1); }
console.log(`SELFTEST ok ${n} checks`);

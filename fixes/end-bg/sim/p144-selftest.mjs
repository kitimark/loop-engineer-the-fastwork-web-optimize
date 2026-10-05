#!/usr/bin/env node
// end-bg P-144 self-test (no Simulator, no lock, no data): node fixes/end-bg/sim/p144-selftest.mjs -> SELFTEST ok N checks
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileScript } from '../../../tools/lib/gesture.mjs';
import * as L from './p144-lib.mjs';
import { armCss, appliedWhy, EXPECT, install, read } from './eb-inject.mjs';
import { stepsOk, firstRunWhy, PLANS } from './sim-p144.mjs';
import { dryWhy } from './dry-p144.mjs';
import { runWhy } from './check-p144.mjs';
const DIR = new URL('.', import.meta.url).pathname;
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

// 1. stimulus compiles: 1 approach loop (body: one 520 px up drag), then 6 x (400 down, 440 up), every down guarded
const script = JSON.parse(readFileSync(join(DIR, 'end-cycle-v1.json'), 'utf8'));
const prog = compileScript(script);
const loops = prog.ops.filter((o) => o.op === 'loop');
eq(loops.length, 1, 'one approach loop');
eq(loops[0].until.kind, 'atEnd', 'loop ends at the end');
eq(loops[0].max, 20, 'loop cap 20');
const top = prog.ops.filter((o) => o.op === 'stroke');
eq(top.length, 12, '12 cycle strokes outside the loop');
eq(top.filter((s) => s.kin.dir === 'down' && s.kin.px === 400).length, 6, '6 down strokes of 400');
eq(top.filter((s) => s.kin.dir === 'up' && s.kin.px === 440).length, 6, '6 up strokes of 440');
ok(top.filter((s) => s.kin.dir === 'down').every((s) => s.minScrollY === 400), 'down strokes carry the runtime guard 400');
ok(prog.ops.some((o) => o.op === 'mark' && o.name === 'cycles'), 'cycles mark');

// 2. CSS split: pictures-off + titles-off = nobg, disjoint, paint-only properties
const sels = (f) => { const t = readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); const out = []; for (const m of t.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const s of m[1].split(',')) out.push(s.trim().replace(/\s+/g, ' ')); return out; };
const props = (f) => { const t = readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); return [...t.matchAll(/\{([^}]*)\}/g)].flatMap((b) => [...b[1].matchAll(/([a-z-]+)\s*:[^;]+;/g)].map((m) => m[1])); };
const nob = sels('../nobg.css'), pic = sels('pictures-off.css'), tit = sels('titles-off.css');
eq([...pic, ...tit].sort(), [...nob].sort(), 'pic + tit selectors = nobg selectors');
ok(pic.every((s) => !tit.includes(s)), 'pic and tit disjoint');
eq(tit.length, 6, 'tit: 6 selectors');
ok(tit.every((s) => /row-title-(doc|earn|secure)/.test(s)), 'tit: only the doc/earn/secure titles');
for (const f of ['../nobg.css', 'pictures-off.css', 'titles-off.css']) ok(props(f).every((p) => ['background-image', 'mix-blend-mode', 'visibility'].includes(p)), `${f}: paint-only properties`);

// 3. inject: arm CSS and the applied rule
eq(armCss('C').css, '', 'C no css'); eq(armCss('C2').css, '', 'C2 no css');
ok(armCss('nob').css.includes('start-selling-platform-stage-grain'), 'nob css from nobg.css');
ok(armCss('tit').css.includes('row-title-secure::after'), 'tit css has the ::after line');
let threw = false; try { armCss('x'); } catch { threw = true; } ok(threw, 'unknown arm throws');
ok(/eb-arm/.test(install()) && /__eb/.test(read()), 'install/read expressions');
for (const arm of L.ARMS) {
  const v = { arm, at1: { ...EXPECT[arm], style: !(arm === 'C' || arm === 'C2') } };
  eq(appliedWhy(arm, v), [], `${arm} applied`);
  ok(appliedWhy(arm, { ...v, at1: { ...v.at1, grain: !v.at1.grain } }).length > 0, `${arm} wrong grain refused`);
  ok(appliedWhy(arm, { ...v, at1: { ...v.at1, title: null } }).length > 0, `${arm} missing title refused`);
}
ok(appliedWhy('C', null).length > 0, 'no value refused');

// 4. plan, budget rule, host rule, steps
const plans = [L.PLAN, L.PLAN4];
for (const P of plans) {
  const holds = Object.values(P);
  ok(holds.every((h) => h[0].startsWith('C:') && h.at(-1).startsWith('C:')), 'C bracket in every hold');
  ok(holds.every((h) => h.some((s) => s.startsWith('nob:'))), 'nob in every hold');
  for (const a of ['pic', 'tit', 'C2']) { const where = holds.map((h, i) => (h.some((s) => s.startsWith(a + ':')) ? i : -1)).filter((i) => i >= 0); eq(where.length, 2, `${a} in two holds`); }
  const all = holds.flat(); eq(new Set(all).size, all.length, 'step labels unique');
}
ok(Object.values(L.PLAN).every((h) => h.length === 5), 'E holds of 5');
ok(Object.values(L.PLAN4).every((h) => h.length === 4), 'F holds of 4');
eq([L.planFor(84), L.planFor(84.1), L.planFor(107.5), L.planFor(107.6)], ['E', 'F', 'F', 'FAIL'], 'planFor thresholds');
eq([L.hostWhy(154).length, L.hostWhy(200).length, L.hostWhy(200.1).length], [0, 0, 1], 'host rule 200');
ok(stepsOk('E1', L.PLAN.E1) && !stepsOk('E1', L.PLAN.E2) && !stepsOk('X', []), 'stepsOk');
eq(Object.keys(PLANS).length, 9, 'nine holds known');

// 5. frames, metrics
const seg = (frames, docH = 6740) => ({ run: { segments: [{ frames, docH, docH1: docH }] } });
// t, dt, y, ih: ih 775 / 815 are the two toolbar states (excluded), 790 / 800 moving
const fr = [[100, 16, 6000, 775], [116, 16, 6000, 790], [132, 16, 6000, 800], [148, 16, 3000, 800], [164, 16, 5965, 815]];
const b = L.bandFrames(seg(fr));
eq(b.frames.map((f) => f.t), [116, 132], 'band-moving frames: moving ih, in band (y >= docH - 2 ih)');
const tl = { offsetMs: 0, recs: [{ type: 'Composite', startTime: 0.105, endTime: 0.110, children: [{ type: 'Paint', startTime: 0.106, endTime: 0.107, data: { clip: [0, 0, 100, 0, 100, 50, 0, 50] } }, { type: 'Paint', startTime: 0.108, endTime: 0.1095 }] }, { type: 'Composite', startTime: 0.125, endTime: 0.127, children: [] }] };
const s = L.summarize(seg(fr), tl);
eq([s.n, s.m1, s.m2, s.paintFrames, s.compFrames], [2, 1.25, 3.5, 1, 2], 'summarize: median paint ms, composite ms, frames');

// 6. scoring
const R = (name, arm, m, extra = {}) => ({ name, arm, applied: true, n: 20, counted: true, m1: m, m2: m * 2, paintFrames: 20, compFrames: 20, docH: [6740, 6740], ...extra });
const h1 = L.scoreHold([R('C-H1', 'C', 2), R('nob-H1', 'nob', 0.5), R('pic-H1', 'pic', 0.6), R('tit-H1', 'tit', 1.9), R('C-H2', 'C', 2)]);
eq([h1.replica, h1.control, h1.void, h1.verdicts['nob-H1'].call, h1.verdicts['pic-H1'].call, h1.verdicts['tit-H1'].call], [true, true, false, 'LOCATES', 'LOCATES', 'NONE'], 'scoreHold calls');
eq(h1.verdicts['pic-H1'].neighbours, ['C-H1', 'C-H2'], 'neighbours');
eq(L.scoreHold([R('C-H1', 'C', 2), R('nob-H1', 'nob', 1.6), R('C-H2', 'C', 2)]).control, false, 'control fails at nob NONE');
eq(L.scoreHold([R('C-H1', 'C', 2), R('nob-H1', 'nob', 0.5), R('C-H2', 'C', 2.7)]).void, true, 'drift > 0.30 voids');
eq(L.scoreHold([R('C-H1', 'C', 2, { n: 5, counted: false }), R('nob-H1', 'nob', 0.5), R('C-H2', 'C', 2)]).replica, false, 'thin C fails replication');
eq(L.scoreHold([R('C-H1', 'C', 2, { applied: false }), R('nob-H1', 'nob', 0.5), R('C-H2', 'C', 2)]).replica, false, 'unapplied C fails replication');
eq(L.scoreHold([R('C-H1', 'C', 2, { paintFrames: 5 }), R('nob-H1', 'nob', 0.5), R('C-H2', 'C', 2)]).replica, false, 'C with paint in < half its frames fails replication');
eq(L.scoreHold([R('C-H1', 'C', 2), R('pic-H1', 'pic', 0.5, { docH: [6740, 6750] }), R('C-H2', 'C', 2)]).verdicts['pic-H1'].call, 'GEOMETRY', 'geometry');
eq(L.scoreHold([R('C-H1', 'C', 2), R('pic-H1', 'pic', 0.5, { applied: false }), R('C-H2', 'C', 2)]).verdicts['pic-H1'].call, 'INSUFFICIENT', 'unapplied arm insufficient');
eq(L.armCall([{ ratio: 0.2, call: 'LOCATES' }, { ratio: 0.5, call: 'PARTIAL' }]).call, 'PARTIAL', 'armCall mean 0.35 PARTIAL');
eq(L.armCall([{ ratio: 0.2, call: 'LOCATES' }, { ratio: 0.38, call: 'PARTIAL' }]).call, 'LOCATES', 'armCall mean 0.29 LOCATES');
const hold = (pic, tit, c2 = 1.0, nob = 0.4) => L.scoreHold([R('C-H1', 'C', 2), R('nob-H1', 'nob', nob * 2), R('pic-H1', 'pic', pic * 2), R('tit-H1', 'tit', tit * 2), R('C2-H1', 'C2', c2 * 2), R('C-H2', 'C', 2)]);
eq(L.cardReading([hold(0.5, 1.0), hold(0.5, 0.95)]).reading, 'PICTURES', 'reading PICTURES');
eq(L.cardReading([hold(1.0, 0.5), hold(0.95, 0.6)]).reading, 'TITLES', 'reading TITLES');
eq(L.cardReading([hold(0.6, 0.6), hold(0.6, 0.6)]).reading, 'BOTH', 'reading BOTH');
eq(L.cardReading([hold(0.9, 0.9), hold(0.95, 0.9)]).reading, 'JOINT', 'reading JOINT');
eq(L.cardReading([hold(0.5, 1.0, 0.6), hold(0.5, 1.0)]).status, 'AA-FAILED', 'A/A failure stops the reading');
eq(L.cardReading([hold(0.5, 1.0, 1, 0.9), hold(0.5, 1.0, 1, 0.9)]).status, 'CONTROL-FAILED', 'control failed everywhere');
const noRep = L.scoreHold([R('C-H1', 'C', 0), R('nob-H1', 'nob', 0.5), R('C-H2', 'C', 0)]);
eq(L.cardReading([noRep, hold(0.5, 1)]).status, 'NOT REPRODUCED', 'any hold without replication');
eq(L.chooseMetric([{ control: false }, { control: false }], [{ replica: true, control: true }, { replica: true, control: true }]), 'm2', 'switch to M2');
eq(L.chooseMetric([{ control: true }, { control: false }], [{ replica: true, control: true }, { replica: true, control: true }]), 'm1', 'stay on M1');
eq(L.chooseMetric([{ control: false }], [{ replica: true, control: false }]), 'm1', 'M2 must pass too');

// 7. gates on synthetic records
const strokes = [{ kin: { dir: 'up', px: 520 } }, ...Array.from({ length: 6 }, () => [{ kin: { dir: 'down', px: 400 } }, { kin: { dir: 'up', px: 440 } }]).flat()];
const good = { run: { strokes, loops: [{ until: 'atEnd', passes: 12, ended: 'atEnd' }], errors: [], inject: [{ value: JSON.stringify({ arm: 'C', bandSteps: 12, at1: { grain: true, title: true, style: false } }) }], segments: [{ frames: fr, docH: 6740 }] } };
eq(dryWhy(good, 'C'), [], 'dry pass');
ok(dryWhy({ run: { ...good.run, loops: [{ ended: 'max' }] } }, 'C').length > 0, 'dry: loop at cap fails');
ok(dryWhy({ run: { ...good.run, strokes: strokes.slice(0, 5) } }, 'C').length > 0, 'dry: missing strokes fail');
ok(dryWhy(good, 'nob').length > 0, 'dry: C probes under nob fail');
eq(runWhy(good, true).why, ['n 2 < 8'], 'check: thin run fails the hold');
ok(runWhy({ run: { ...good.run, aborted: true } }, true).why.includes('aborted'), 'check: aborted');
ok(runWhy(good, false).why.includes('no tl file'), 'check: no tl');
eq(firstRunWhy({ arm: 'C', docH0: 6740, at1: { grain: true, title: true, style: false } }, 20), [], 'first-run gate pass');
ok(firstRunWhy({ arm: 'C', docH0: 6740, at1: { grain: true, title: true, style: false } }, 7).length === 1, 'first-run gate n');

if (fails.length) { console.log(`SELFTEST FAIL ${fails.length} of ${n}:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log(`SELFTEST ok ${n} checks`);

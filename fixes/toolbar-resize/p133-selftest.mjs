#!/usr/bin/env node
// toolbar-resize P-133 self-test: cycle-hero-v2.json compiles (18 strokes, every down stroke guaranteed above the
// pull-to-refresh guard by the compiler's static model), sim-p133.mjs's frame count and first-run gate, check-n133.mjs's
// n check, dry-p133.mjs's count-only criteria. No browser, no lock, no Simulator. node fixes/toolbar-resize/p133-selftest.mjs -> "SELFTEST ok N checks".
import { readFileSync } from 'node:fs';
import { compileScript } from '../../tools/lib/gesture.mjs';
import { movingHeroN, firstRunWhy, ARMS, HOLDS } from './sim-p133.mjs';
import { checkRun, N_MIN, N_TARGET } from './check-n133.mjs';
import { dryWhy, strokeWallS, STROKES, MIN_TRANSITIONS, Y_LO, Y_HI } from './dry-p133.mjs';
let n = 0, bad = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log(`FAIL ${what}`); } };
// --- the stimulus ---------------------------------------------------------------------------------------------------
const script = JSON.parse(readFileSync(new URL('./cycle-hero-v2.json', import.meta.url), 'utf8'));
const prog = compileScript(script);
const strokes = [];
const walk = (ops) => (ops || []).forEach((o) => { if (o.op === 'stroke') strokes.push(o); if (o.ops) walk(o.ops); if (o.body) walk(o.body); });
walk(prog.ops || prog.program || []);
const all = strokes.length ? strokes : (prog.strokes || []);
ok(all.length === 18, `18 strokes (got ${all.length})`);
ok(all.every((s) => (s.kin || s).profile === 'drag'), 'every stroke is a drag (no momentum)');
const downs = all.filter((s) => (s.kin || s).dir === 'down');
ok(downs.length === 8, `8 down strokes (got ${downs.length})`);
// static model: from 0, up drags add >= px - 15, down drags subtract <= px; every down needs >= max(300, px)
let lo = 0, hi = 0, guardOk = true, maxHi = 0;
for (const s of all) {
  const k = s.kin || s;
  if (k.dir === 'up') { lo += k.px - 15; hi += k.px; } else { if (lo < Math.max(300, k.px)) guardOk = false; lo = Math.max(0, lo - k.px); hi = Math.max(0, hi - (k.px - 15)); }
  maxHi = Math.max(maxHi, hi);
}
ok(guardOk, 'every down stroke has a guaranteed scrollY >= 560 (static model)');
ok(maxHi < 3250, `highest scrollY by the static model ${maxHi} < 3250 (hero zone)`);
ok(script.params.cycles >= 4, 'at least 4 collapse/expand cycles');
ok(downs.every((s) => s.minScrollY === 560), 'the runner re-checks scrollY >= 560 before every down stroke');
ok(all.filter((s) => (s.kin || s).dir === 'up').every((s) => s.minScrollY === null), 'up strokes carry no guard');
// --- frame count and first-run gate ---------------------------------------------------------------------------------
const fr = (y, ih) => [0, 16.7, y, ih];
const g = (frames, extra = {}) => ({ run: { segments: [{ frames }], strokes: Array(18).fill({}), loops: [], errors: [], ...extra } });
const twelve = [fr(0, 775), ...Array.from({ length: 12 }, (_, i) => fr(1000 + i, 790)), fr(2000, 815)];
ok(movingHeroN(g(twelve)) === 12, 'movingHeroN counts frames strictly between the two ih values');
ok(movingHeroN(g([fr(0, 775), fr(3300, 790), fr(3260, 800), fr(1000, 795), fr(0, 815)])) === 1, 'movingHeroN drops y >= 3250');
ok(movingHeroN(g([fr(0, 775), fr(10, 775)])) === 0, 'no toolbar move -> n 0');
ok(movingHeroN({}) === 0, 'no record -> n 0');
const v = { ioInstalled: true, vc1: [], docH0: 6814 };
ok(firstRunWhy(v, 12).length === 0, 'first-run gate passes a good run');
ok(firstRunWhy(v, 7).some((w) => /n 7 < 8/.test(w)), 'first-run gate stops at n 7');
ok(firstRunWhy(null, 12).includes('no inject value'), 'first-run gate stops without an inject value');
ok(firstRunWhy({ ...v, ioInstalled: false }, 12).includes('no showcase IO'), 'first-run gate: no IO');
ok(ARMS.join() === 'C,nvc,nvn,tps,tp,vu0' && HOLDS.join() === 'A,B', 'arms and holds');
// --- n check ----------------------------------------------------------------------------------------------------------
ok(N_MIN === 8 && N_TARGET === 12, 'thresholds 8 and 12');
const r12 = checkRun(g(twelve), 18);
ok(r12.fail.length === 0 && r12.n === 12 && !r12.belowTarget && r12.transitions === 1, 'n 12 passes, one transition, not below target');
const nine = [fr(0, 775), ...Array.from({ length: 9 }, () => fr(1200, 790)), fr(0, 815)];
const r9 = checkRun(g(nine), 18);
ok(r9.fail.length === 0 && r9.belowTarget, 'n 9 passes but is flagged below target');
const seven = [fr(0, 775), ...Array.from({ length: 7 }, () => fr(1200, 790)), fr(0, 815)];
ok(checkRun(g(seven), 18).fail.some((w) => /n 7 < 8/.test(w)), 'n 7 fails the hold');
ok(checkRun(g(twelve, { aborted: { why: 'x' } }), 18).fail.some((w) => /aborted/.test(w)), 'an aborted gesture fails');
ok(checkRun(g(twelve, { strokes: Array(17).fill({}) }), 18).fail.some((w) => /strokes 17\/18/.test(w)), 'a missing stroke fails');
const rg = checkRun(g(twelve, { loops: [{ ended: 'pull guard' }], errors: ['pull-to-refresh guard: s7 (down 560 px) needs scrollY >= 560, the page is at 400; nothing was sent'] }), 18);
ok(rg.guardLoops === 1 && rg.guardErrors === 1, 'guard-ended loops and guard errors are counted');
const two = [fr(0, 775), fr(1000, 790), fr(1001, 800), fr(0, 815), fr(2000, 800), fr(2001, 790), fr(0, 775)];
ok(checkRun(g(two), 18).transitions === 2, 'two separate moving stretches = two transitions');
ok(checkRun({}, 18).fail.includes('no frames'), 'no frames fails');
// --- count-only dry run criteria ----------------------------------------------------------------------------------------
const st = (dir, y) => ({ kin: { dir, px: 560 }, guardY: dir === 'down' ? [y, y] : null, sentAt: 1000, returnedAt: 1600 });
const dryStrokes = [...Array(10).fill(0).map(() => st('up')), ...Array(8).fill(0).map(() => st('down', 1650))];
const dd = (o = {}, sum = 9) => ({ meta: { countOnly: true }, run: { strokes: dryStrokes, loops: [], errors: [], ...o }, summary: { countOnly: true, toolbar: { transitions: sum } } });
ok(STROKES === 18 && MIN_TRANSITIONS === 8 && Y_LO === 560 && Y_HI === 3000, 'dry-run constants');
ok(dryWhy(dd()).length === 0, 'dry run: a good record passes');
ok(dryWhy(dd({}, 7)).some((w) => /transitions 7 < 8/.test(w)), 'dry run: 7 transitions fail');
ok(dryWhy(dd({ strokes: dryStrokes.slice(0, 17) })).some((w) => /strokes 17\/18/.test(w)), 'dry run: a missing stroke fails');
ok(dryWhy(dd({ loops: [{ ended: 'pull guard' }] })).some((w) => /guard-ended loops 1/.test(w)), 'dry run: a guard-ended loop fails');
ok(dryWhy(dd({ errors: ['pull-to-refresh guard: s9 (down 560 px) needs scrollY >= 560, the page is at 400; nothing was sent'] })).some((w) => /\(guard\)/.test(w)), 'dry run: a guard error fails and is named');
ok(dryWhy(dd({ aborted: { why: 'x' } })).includes('aborted'), 'dry run: an abort fails');
ok(dryWhy(dd({ strokes: [...dryStrokes.slice(0, 17), st('down', 3400)] })).some((w) => /outside 560-3000/.test(w)), 'dry run: a down stroke from y 3400 fails (zone)');
ok(dryWhy(dd({ strokes: [...dryStrokes.slice(0, 17), { kin: { dir: 'down' }, guardY: null }] })).some((w) => /outside/.test(w)), 'dry run: a down stroke without a guard read fails');
ok(dryWhy({ ...dd(), summary: { countOnly: true } }).some((w) => /transitions/.test(w)), 'dry run: no toolbar summary fails');
ok(dryWhy(null).length >= 2, 'dry run: no record fails');
ok(strokeWallS({ run: { strokes: [{ sentAt: 1000 }, { returnedAt: 33500 }] } }) === 32.5 && strokeWallS({}) === null, 'stroke wall time');
console.log(bad ? `SELFTEST FAILED ${bad} of ${n}` : `SELFTEST ok ${n} checks`);
process.exit(bad ? 1 : 0);

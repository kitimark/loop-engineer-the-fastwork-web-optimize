// P-148 self-test: judge (T0-T3 boundaries, fill/edge, share, area, footprint count), settle equality, plan and budget,
// masks and footprint, the gated index.html, the motion hold (in a fake window), the page snippets' syntax, and the
// scorer's gate and R3 rules on synthetic group files. No page, device or lock. Prints SELFTEST-P148 ok <n> checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import vm from 'node:vm';
import { judgeImages, sameImages, isFlat, T2, budgetSkip, armOrder, registeredKeys, GROUPS, EST_S, BUDGET_S, CHROME_CFG, SIM_STATES } from './px148.mjs';
import { footRect, applyFoot, outsideMasks, HOLD_ON, HOLD_OFF, REPAUSE, RAF2G, STAT, GATE, DECK } from './px148-run.mjs';
import { gatedIndex, TAG } from './mk-px148-overlay.mjs';
import { score } from './score-p148.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---- images
const img = (w, h, f) => { const px = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); px.set(Array.isArray(v) ? v : [v, v, v], (y * w + x) * 3); } return { w, h, bpp: 3, px }; };
const W = 100, H = 100, flat = img(W, H, () => 128);
const patch = (base, x0, y0, x1, y1, d) => img(W, H, (x, y) => { const i = (y * W + x) * 3, v = base.px[i]; return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? Math.min(255, v + d) : v; });
ok(judgeImages(flat, flat, flat).tier === 'T0', 'identical = T0');
// T1: arm differs only where A/A differs
const aa = patch(flat, 0, 0, 9, 9, 3);
ok(judgeImages(flat, aa, aa).tier === 'T1', 'arm diff inside A/A = T1');
// T2 fill at 64, T3 fill at 65 (50 px = 0.5 % of 10,000)
ok(judgeImages(flat, patch(flat, 50, 50, 54, 59, 64), flat, [], 1).tier === 'T2', 'fill 64 = T2');
let j = judgeImages(flat, patch(flat, 50, 50, 54, 59, 65), flat, [], 1);
ok(j.tier === 'T3' && j.fillMax === 65 && j.beyondFill > 0, 'fill 65 = T3');
// edges: a checkerboard base is never flat; 128 passes, 129 fails
const checker = img(W, H, (x, y) => ((x + y) % 2 ? 40 : 90));
ok(!isFlat(checker, 5, 5) && isFlat(flat, 5, 5), 'flat test');
ok(judgeImages(checker, patch(checker, 20, 20, 24, 24, 128), checker, [], 1).tier === 'T2', 'edge 128 = T2');
ok(judgeImages(checker, patch(checker, 20, 20, 24, 24, 129), checker, [], 1).tier === 'T3', 'edge 129 = T3');
// share: 51 px of 10,000 = 0.51 % > 0.5 % (level 20, fill)
ok(judgeImages(flat, patch(flat, 0, 0, 50, 0, 20), flat, [], 1).tier === 'T3', 'share 0.51 % = T3');
ok(judgeImages(flat, patch(flat, 0, 0, 49, 0, 20), flat, [], 1).tier === 'T2', 'share 0.50 % = T2');
// area: 2001 CSS px over a large frame at dpr 1 -> T3 (share stays under 0.5 %)
const big = img(1000, 1000, () => 128), bigP = img(1000, 1000, (x, y) => (y < 3 && x < 667 ? 148 : 128));
j = judgeImages(big, bigP, big, [], 1); ok(j.areaCssPx === 2001 && j.tier === 'T3', 'area 2001 CSS px = T3');
ok(judgeImages(big, bigP, big, [], 3).tier === 'T2', 'same pixels at dpr 3 = 222 CSS px = T2');
// level <= 8 differences are beyond A/A for the shade but not counted for share/area
j = judgeImages(flat, patch(flat, 0, 0, 99, 99, 8), flat, [], 1); ok(j.tier === 'T2' && j.beyond === 0 && j.largestShade === 8, 'level 8 everywhere: shade 8, not counted');
// A/A > 8 blinds the counting: arm 30 where A/A 9 is not beyond
j = judgeImages(flat, patch(flat, 0, 0, 9, 9, 30), patch(flat, 0, 0, 9, 9, 9)); ok(j.beyond === 0 && j.aa8 === 100, 'A/A > 8 excluded from beyond, counted in aa8');
// masks and footprint
j = judgeImages(flat, patch(flat, 0, 0, 9, 9, 200), flat, [[0, 0, 9, 9]]); ok(j.tier === 'T0' && j.masked === 100, 'mask hides');
j = judgeImages(flat, patch(flat, 0, 0, 1, 0, 30), flat, [], 1, [10, 10, 99, 99]); ok(j.beyondOutsideF === 2, 'outside F counted');
// settle equality
ok(sameImages(flat, flat) && !sameImages(flat, aa) && sameImages(flat, aa, [[0, 0, 9, 9]]), 'sameImages with masks');

// ---- plan and budget
ok(registeredKeys('chrome').length === 14 * 4 * 2 * 2 && registeredKeys('sim').length === 3 * 4 * 2 * 2, 'registered keys 224 + 48');
ok(JSON.stringify(armOrder(0)) === '["N0","R3"]' && JSON.stringify(armOrder(1)) === '["R3","N0"]', 'arm order alternates');
const grouped = Object.values(GROUPS).flat().sort(), plan = [...CHROME_CFG.map((c) => c[0]), ...SIM_STATES].sort();
ok(JSON.stringify(grouped) === JSON.stringify(plan), 'every config in exactly one group');
for (const [g, cfgs] of Object.entries(GROUPS)) ok(cfgs.reduce((s, c) => s + EST_S[c], 0) <= BUDGET_S, `group ${g} estimate within ${BUDGET_S} s`);
ok(budgetSkip(0, 't1024x1366') === null && /budget/.test(budgetSkip(200, 't1024x1366')), 'budget guard');

// ---- footprint and masks
const cal = { scale: 3, ox: 0, oy: 177, W: 1290, H: 2796 };
const f = footRect([20, 60, 410, 904, 430, 775], cal); ok(f[1] === Math.floor(36 * 3 + 177) && f[3] === Math.ceil(775 * 3 + 177) - 1 && f[0] === 0, 'F inflated, clipped to the viewport');
const om = outsideMasks(cal, 430, 775); ok(om.length === 2 && om[0].r[3] === 176 && om[1].r[1] === 177 + 2325, 'outside masks: above and below the viewport');
const af = applyFoot([{ kind: 'clock', r: [0, 0, 10, 10] }, { kind: 'clock', r: [0, 2000, 10, 2010] }, ...om], [0, 1000, 1289, 2500]);
ok(af.dropped.length === 1 && af.kept.length === 3, 'a clock mask meeting F is dropped; outside masks kept');

// ---- gated index
const gi = gatedIndex('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
ok(gi.includes('<head>' + TAG + '<meta'), 'gate script is the first child of head');
assert.throws(() => gatedIndex('<head></head><head></head>')); n++;
assert.throws(() => gatedIndex('<html></html>')); n++;

// ---- motion hold in a fake window
{
  const timers = []; let rafs = [];
  const win = { requestAnimationFrame: (cb) => { rafs.push(cb); return rafs.length; }, setTimeout: (cb, ms) => { timers.push({ cb, ms, once: true }); return timers.length; },
    setInterval: (cb, ms) => { timers.push({ cb, ms, once: false }); return timers.length; } };
  win.window = win; vm.createContext(win);
  vm.runInContext(readFileSync(join(HERE, 'px148-gate.js'), 'utf8'), win);
  const fire = () => { const r = rafs; rafs = []; r.forEach((cb) => cb(16)); for (const t of timers.splice(0)) { t.cb(); } };
  let ran = { t: 0, r: 0, i: 0 };
  win.setTimeout(() => ran.t++, 10); win.requestAnimationFrame(() => ran.r++); win.setInterval(() => ran.i++, 1000);
  win.__dcHoldOn(); fire();
  ok(ran.t === 0 && ran.r === 0 && ran.i === 0, 'hold: no page callback runs');
  const s = win.__dcStat(false); ok(s.timeout === 1 && s.raf === 1 && s.interval === 1 && s.queued === 2, 'hold counters');
  let own = 0; win.__dcRAF(() => own++); fire(); ok(own === 1, 'instrument rAF runs under hold');
  ok(win.__dcHoldOff() === 2 && ran.t === 1, 'release runs the queued timeout');
  fire(); ok(ran.r === 1, 'queued frame runs on the next frame after release');
  ok(win.__dcGate === 'px148-gate v1', 'gate version');
}
// ---- page snippets parse
for (const [k, s] of Object.entries({ HOLD_ON, HOLD_OFF, REPAUSE, RAF2G, STAT, GATE, DECK })) { new Function(`return ${s}`); n++; }

// ---- scorer
const J = (o = {}) => ({ tier: 'T0', frame: 10000, aaAny: 0, aa8: 0, abAny: 0, abNotInAA: 0, largestShade: 0, beyond: 0, beyondFill: 0, beyondEdge: 0, fillMax: 0, edgeMax: 0, shareBeyond: 0, areaCssPx: 0, beyondOutsideF: 0, ...o });
const T = (k, o = {}) => { const [cfg, pos, mode, arm] = k.split('|'); return { cfg, pos, mode, arm, settled: true, geoArm: [], geoAA: [], maskDropped: [], judge: J(o.judge), ...o, ...(o.judge ? { judge: J(o.judge) } : {}) }; };
const files = (mod = {}) => ['chrome', 'sim'].map((e) => ({ name: e === 'chrome' ? 'C1.json' : 'S1.json',
  json: { tool: `deck-contain px148-${e}`, complete: true, triples: registeredKeys(e).map((k) => (mod[`${e} ${k}`] ? T(k, mod[`${e} ${k}`]) : T(k))) } }));
let r = score(files()); ok(r.verdict === 'R3 T0' && r.engines.chrome.gate === 'PASS', 'all exact: gate PASS, R3 T0');
r = score(files().map((x, i) => (i ? x : { ...x, json: { ...x.json, triples: x.json.triples.slice(1) } }))); ok(r.verdict === 'GATE-FAILED' && !r.engines.chrome.checks.G1_complete && !('r3' in r.engines.sim), 'missing triple: gate fails, no R3 output');
r = score(files({ 'sim expanded|top|rest|N0': { settled: false } })); ok(r.verdict === 'GATE-FAILED' && !r.engines.sim.checks.G2_settled, 'unsettled fails the gate');
r = score(files({ 'chrome m430x932|inview|rest|R3': { judge: { aa8: 1, aaAny: 1 } } })); ok(r.verdict === 'GATE-FAILED' && !r.engines.chrome.checks.G3_aa8, 'A/A > 8 in an R3 triple fails the gate');
r = score(files({ 'chrome m430x932|inview|rest|N0': { judge: { aaAny: 2 } } })); ok(r.verdict === 'GATE-FAILED' && !r.engines.chrome.checks.G4_aaAny, 'A/A share 0.02 % fails the gate');
r = score(files({ 'chrome m430x932|inview|rest|N0': { judge: { aaAny: 1 } } })); ok(r.engines.chrome.checks.G4_aaAny, 'A/A share 0.01 % passes');
r = score(files({ 'chrome m430x932|top|rest|N0': { judge: { tier: 'T2' } } })); ok(r.verdict === 'GATE-FAILED' && !r.engines.chrome.checks.G5_null, 'null arm above T1 fails the gate');
r = score(files({ 'sim landscape|leave|swipe|R3': { geoAA: ['docH 1 -> 2'] } })); ok(r.verdict === 'GATE-FAILED' && !r.engines.sim.checks.G6_geoAA, 'page moved between base and base again fails the gate');
r = score(files({ 'chrome m430x932|inview|rest|R3': { judge: { tier: 'T2', largestShade: 30, beyond: 10, beyondFill: 10, fillMax: 30 } }, 'chrome m430x932|inview|swipe|R3': { judge: { tier: 'T2' } } }));
ok(r.verdict === 'R3 T2' && r.engines.chrome.r3.worst.edgeOrFill === 'fill', 'R3 T2 with the five numbers');
r = score(files({ 'chrome m430x932|inview|swipe|R3': { judge: { tier: 'T2' } } })); ok(r.verdict === 'R3 T3' && r.flags.motionOnly.length === 1, 'swipe-only T2 = motion-only = T3');
r = score(files({ 'chrome m430x775-rm|top|rest|R3': { judge: { tier: 'T2' } } })); ok(r.verdict === 'R3 T3' && r.flags.rmNotExact.length === 1, 'reduced motion not exact = T3');
r = score(files({ 'sim collapsed|enter|rest|R3': { geoArm: ['deck.h 844 -> 845'] } })); ok(r.verdict === 'R3 T3' && r.flags.geometry.length === 1, 'geometry change = T3');
r = score(files({ 'chrome m430x932|inview|rest|R3': { judge: { tier: 'T1' } } })); ok(r.verdict === 'R3 T1', 'within A/A = T1');
assert.throws(() => score([...files(), files()[0]]), /DUPLICATE/); n++;
r = score([...files(), { name: 'C2.json', json: { tool: 'deck-contain px148-chrome', complete: false, triples: [] } }]); ok(r.files.ignored.includes('C2.json'), 'incomplete file ignored');
const held = (a, b) => ({ stat: { arm: { raf: a, timeout: 0, interval: 5 }, back: { raf: b, timeout: 0, interval: 0 } } });
r = score(files({ 'sim expanded|inview|rest|R3': held(5, 2) })); ok(r.verdict === 'R3 UNDECIDED-HELD' && r.flags.heldExtra.length === 1, 'R3 woke 3 held callbacks: undecided');
r = score(files({ 'sim expanded|inview|rest|R3': held(4, 2) })); ok(r.verdict === 'R3 T0', '+2 held is within the margin; intervals do not count');
r = score(files({ 'sim expanded|inview|rest|N0': held(9, 0) })); ok(r.verdict === 'R3 T0', 'held counts of the null arm are not an R3 flag');
r = score(files({ 'sim expanded|inview|rest|R3': { ...held(9, 0), judge: { tier: 'T3' } } })); ok(r.verdict === 'R3 T3', 'T3 stands with held extras');
console.log(`SELFTEST-P148 ok ${n} checks`);

// P-149 self-test: the envelope (pairs, stability), judgeEnv (T0-T3 boundaries against the envelope), the locator tiles,
// the plan (cells, stableCells, rPlan, budget), the stop procedure on a fake page (shot order: fresh N0 pairs before R3,
// no R3 in part L), and the scorer's verdicts on synthetic files. No page, device or lock. Prints SELFTEST-P149 ok <n> checks.
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { envelope, judgeEnv, stopStable, envStable, envTiles, CELLS, stableCells, rPlan, budgetSkip, EST_S, BUDGET_S, SIM_GROUPS, POSITIONS, MODES, STABLE } from './px149.mjs';
import { stop, N0_CSS, WHO } from './px149-run.mjs';
import { HOLD_ON, HOLD_OFF, REPAUSE, RAF2G, STAT_RESET, DECK } from './px148-run.mjs';
import { GEO } from './geo.mjs';
import { CLOCK } from './px.mjs';
import { score, heldExtra, pattern } from './score-p149.mjs';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---- images
const img = (w, h, f) => { const px = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); px.set(Array.isArray(v) ? v : [v, v, v], (y * w + x) * 3); } return { w, h, bpp: 3, px }; };
const W = 100, H = 100, flat = img(W, H, () => 128);
const patch = (base, x0, y0, x1, y1, d) => img(base.w, base.h, (x, y) => { const i = (y * base.w + x) * 3, v = base.px[i]; return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? Math.min(255, v + d) : v; });
const png = (I) => { const raw = Buffer.alloc(I.h * (I.w * 3 + 1)); for (let y = 0; y < I.h; y++) I.px.copy(raw, y * (I.w * 3 + 1) + 1, y * I.w * 3, (y + 1) * I.w * 3);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(I.w, 0); ih.writeUInt32BE(I.h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };

// ---- envelope and stability (frame 10,000 px: 0.01 % = 1 px)
let E = envelope([flat, flat, flat, flat, flat, flat]);
ok(E.pairs.length === 3 && E.envStable && E.envPixels === 0 && E.envBlind === 0, 'six equal shots: 3 pairs, empty envelope, stable');
ok(!envelope([flat, flat, flat, flat]).envStable, 'two pairs are not enough');
E = envelope([flat, patch(flat, 0, 0, 0, 0, 9), flat, flat, flat, flat]);
ok(E.envStable && E.envBlind === 1 && E.env[0] === 9 && E.pairs[0].bbox.join() === '0,0,0,0', 'one blind pixel (level 9, 1 px = 0.01 %): stable');
ok(!envelope([flat, patch(flat, 0, 0, 1, 0, 9), flat, flat, flat, flat]).envStable, 'two blind pixels (0.02 %): unstable');
E = envelope([flat, patch(flat, 0, 0, 99, 99, 8), flat, flat, flat, flat]);
ok(E.envStable && E.envPixels === 10000 && E.envBlind === 0, 'level 8 on the whole frame: no blind pixel, stable');
ok(!envelope([flat, flat, flat, flat, patch(flat, 0, 0, 0, 1, 40), flat]).envStable, 'blind pixels in any pair count');
E = envelope([flat, patch(flat, 3, 3, 3, 3, 4), patch(flat, 3, 3, 3, 3, 1), patch(flat, 3, 3, 3, 3, 7), flat, flat]);
ok(E.env[3 * W + 3] === 6 && E.envMax === 6, 'envelope = max over pairs (4 and 6)');
ok(envelope([flat, patch(flat, 0, 0, 9, 9, 50)], [[0, 0, 9, 9]]).envPixels === 0, 'masks skipped');
ok(envelope([flat, img(10, 10, () => 1)]).sizeMismatch, 'size mismatch');
const st = { settled: true, frame: 10000, pairs: E.pairs, envBlind: 0, geoFresh: [] };
ok(stopStable(st) && !stopStable({ ...st, settled: false }) && !stopStable({ ...st, geoFresh: ['f3: deck.h 1 -> 2'] }) && !stopStable({ ...st, envBlind: 2 })
  && !stopStable({ ...st, envBlind: undefined }) && !stopStable({ ...st, pairs: E.pairs.slice(0, 2) }), 'stop stability: settled, 3 pairs, blind share, geometry');
ok(STABLE.BLIND_LEVEL === 8 && STABLE.BLIND_SHARE === 0.0001 && STABLE.MIN_PAIRS === 3 && envStable(3, 1, 10000) && !envStable(3, 2, 10000), 'registered stability numbers');

// ---- judgeEnv
const env0 = new Uint8Array(W * H), envA = envelope([flat, patch(flat, 0, 0, 9, 9, 6), flat, flat, flat, flat]).env;
ok(judgeEnv(flat, flat, env0).tier === 'T0', 'identical = T0');
ok(judgeEnv(flat, patch(flat, 0, 0, 9, 9, 6), envA).tier === 'T1', 'arm level <= envelope everywhere = T1');
let j = judgeEnv(flat, patch(flat, 0, 0, 9, 9, 7), envA);
ok(j.tier === 'T2' && j.aboveEnv === 100 && j.beyond === 0, 'level 7 over envelope 6: above the envelope, not beyond (<= 8): T2');
ok(judgeEnv(flat, patch(flat, 50, 50, 54, 59, 64), env0).tier === 'T2', 'fill 64 = T2');
j = judgeEnv(flat, patch(flat, 50, 50, 54, 59, 65), env0); ok(j.tier === 'T3' && j.fillMax === 65, 'fill 65 = T3');
const checker = img(W, H, (x, y) => ((x + y) % 2 ? 40 : 90));
ok(judgeEnv(checker, patch(checker, 20, 20, 24, 24, 128), env0).tier === 'T2', 'edge 128 = T2');
ok(judgeEnv(checker, patch(checker, 20, 20, 24, 24, 129), env0).tier === 'T3', 'edge 129 = T3');
ok(judgeEnv(flat, patch(flat, 0, 0, 50, 0, 20), env0).tier === 'T3' && judgeEnv(flat, patch(flat, 0, 0, 49, 0, 20), env0).tier === 'T2', 'share 0.51 % T3, 0.50 % T2');
const big = img(1000, 1000, () => 128), bigP = img(1000, 1000, (x, y) => (y < 3 && x < 667 ? 148 : 128)), envBig = new Uint8Array(1e6);
j = judgeEnv(big, bigP, envBig, [], 1); ok(j.areaCssPx === 2001 && j.tier === 'T3' && judgeEnv(big, bigP, envBig, [], 3).tier === 'T2', 'area 2001 CSS px T3; at dpr 3 T2');
// an envelope above 8 at a pixel takes it out of the T2 counting (as P-148's A/A > 8)
const envHi = new Uint8Array(W * H).fill(0); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) envHi[y * W + x] = 9;
j = judgeEnv(flat, patch(flat, 0, 0, 9, 9, 30), envHi); ok(j.beyond === 0 && j.aboveEnv === 100 && j.tier === 'T2', 'envelope 9: arm 30 above the envelope, not counted as beyond');
const dark = img(W, H, () => 20); ok(judgeEnv(dark, patch(dark, 0, 0, 9, 9, 129), envHi).tier === 'T3' && judgeEnv(dark, patch(dark, 0, 0, 9, 9, 128), envHi).tier === 'T2', 'largest shade above the envelope: 128 T2, 129 T3');
j = judgeEnv(flat, patch(flat, 0, 0, 1, 0, 30), env0, [], 1, [10, 10, 99, 99]); ok(j.beyondOutsideF === 2, 'outside F counted');
ok(judgeEnv(flat, patch(flat, 0, 0, 9, 9, 200), env0, [[0, 0, 9, 9]]).tier === 'T0', 'mask hides');
// locator tiles: 64 CSS px tiles at scale 1, the strongest pixel in CSS px
const envT = new Uint8Array(200 * 200); envT[70 * 200 + 130] = 9; envT[71 * 200 + 131] = 3; envT[5] = 2;
const tl = envTiles(envT, 200, { scale: 1, ox: 0, oy: 0 });
ok(tl[0].tile === '2,1' && tl[0].count === 2 && tl[0].max === 9 && tl[0].at.join() === '130,70' && tl[1].tile === '0,0', 'locator tiles');
ok(envTiles(envT, 200, { scale: 2, ox: 0, oy: 10 })[0].at.join() === '65,30', 'locator CSS px from the calibration');

// ---- plan
ok(CELLS.map((c) => `${c.cell}:${c.dpr}:${c.kind}`).join() === 'mob3:3:mob,desk3:3:desk,mob1:1:mob,desk1:1:desk', 'the 2x2 cells in priority order');
const stopL = (cell, pos, st = true) => ({ cfg: `L-${cell}`, pos, mode: 'rest', settled: true, frame: 100, pairs: [0, 1, 2].map(() => ({ aaAny: 0, aa8: 0 })), envBlind: st ? 0 : 1, geoFresh: [] });
const allL = (bad = []) => CELLS.flatMap((c) => POSITIONS.map((p) => stopL(c.cell, p, !bad.includes(c.cell) || p !== 'inview')));
ok(stableCells(allL()).join() === 'mob3,desk3,mob1,desk1', 'all stable');
ok(stableCells(allL(['mob3', 'desk3'])).join() === 'mob1,desk1', 'one unstable stop makes its cell unstable');
ok(stableCells(allL().filter((s) => !(s.cfg === 'L-mob1' && s.pos === 'leave'))).join() === 'mob3,desk3,desk1', 'a missing stop makes its cell unstable');
ok(rPlan([]).length === 0, 'no stable cell: no part R');
let P = rPlan(['mob1', 'desk1']);
ok(P.map((c) => c.cfg).join() === 'R-mob1,R-mob1-rm,R-desk1' && P[1].rm && P[1].modes.join() === 'rest' && P[0].modes.join() === 'rest,swipe', 'rPlan: primary, primary rm, second');
ok(rPlan(['desk1']).map((c) => c.cfg).join() === 'R-desk1,R-desk1-rm', 'rPlan with one stable cell');
for (const s of [['mob3', 'desk3'], ['mob3', 'mob1'], ['desk3', 'desk1'], ['mob3', 'desk1'], ['desk3', 'mob1'], ['mob1', 'desk1']]) {
  const t = rPlan(s).reduce((a, c) => a + EST_S[c.cfg], 0); ok(t <= BUDGET_S, `part R estimate ${s.join('+')} ${t} <= ${BUDGET_S}`);
}
ok(CELLS.reduce((a, c) => a + EST_S[`L-${c.cell}`], 0) <= BUDGET_S, 'part L estimate within budget');
ok(SIM_GROUPS.S1.reduce((a, s) => a + EST_S[s], 0) <= BUDGET_S && SIM_GROUPS.S2.reduce((a, s) => a + EST_S[s], 0) <= BUDGET_S, 'Simulator groups within budget');
ok(budgetSkip(0, 'expanded') === null && /budget/.test(budgetSkip(200, 'landscape')), 'budget guard');

// ---- the stop procedure on a fake page: the shot shows the page's current arm state
const fakeIo = (armImg) => {
  const log = []; let arm = null, geo = { sy: 100, docH: 5000, deck: { x: 0, y: 0, w: 10, h: 10, ow: 10, oh: 10, cw: 10, ch: 10, sw: 10 }, sec: { y: 0, h: 10 }, nextY: 10, shells: [] };
  const ev = async (e) => {
    if (e === HOLD_OFF) { log.push('off'); return 0; } if (e === HOLD_ON) { log.push('on'); return { paused: 0 }; }
    if (e === RAF2G || e === REPAUSE) return 0; if (e === STAT_RESET) return { raf: 0, timeout: 0, interval: 0, queued: 0 };
    if (e === CLOCK) return null; if (e === DECK) return [0, 0, 50, 50, 100, 100]; if (e === GEO) return structuredClone(geo);
    if (e.includes("getElementById('dc-arm')?.remove()")) { arm = e.includes('/* P-149 null arm') ? 'N0' : e.includes('const css = null') ? null : 'R3'; log.push(`arm:${arm}`); return arm; }
    if (e.startsWith('(() => [')) return [['div.x', 'section']];
    if (e.startsWith('scrollTo')) return 1;
    throw new Error('unexpected eval ' + e.slice(0, 60));
  };
  const shot = async () => { log.push(`shot:${arm}`); return png(arm === 'R3' ? armImg : flat); };
  return { io: { ev, shot, sleep: async () => {}, cal: { scale: 1, ox: 0, oy: 0 }, dpr: 1, extraMasks: [], armWait: 0, save: (t, s) => log.push(`save:${t}:${Object.keys(s).join('+')}`) }, log };
};
let F = fakeIo(flat), r = await stop(F.io, { cfg: 'L-mob3', pos: 'top', y: 0, mode: 'rest' });
ok(!F.log.some((l) => l === 'arm:R3') && F.log.filter((l) => l.startsWith('shot')).join() === 'shot:null,shot:null,shot:N0,shot:null,shot:N0,shot:null,shot:N0', 'part L: settle, then N0 on/off/on/off/on; never R3');
ok(r.stable && r.settled && r.settleShots === 2 && r.pairs.length === 3 && !r.judge && r.envPixels === 0, 'part L record: stable, 3 pairs, no judge');
F = fakeIo(patch(flat, 40, 40, 44, 49, 30)); r = await stop(F.io, { cfg: 'R-mob1', pos: 'inview', y: 0, mode: 'rest', arm: { name: 'R3', css: '.x{}' } });
const shots = F.log.filter((l) => l.startsWith('shot'));
ok(shots.slice(-2).join() === 'shot:null,shot:R3' && shots.indexOf('shot:R3') === shots.length - 1, 'part R: R3 is the last shot, after every fresh pair (N4)');
ok(F.log.slice(F.log.indexOf('shot:R3')).includes('arm:null'), 'R3 removed before the hold ends');
ok(r.judge.tier === 'T2' && r.judge.beyond === 50 && r.geoArm.length === 0 && F.log.some((l) => l === 'save:R-mob1-inview-rest-R3:f7+a'), 'part R record: R3 judged T2 against the empty envelope, shots saved');
ok(typeof WHO([[1, 2]]) === 'string' && N0_CSS.startsWith('/*'), 'WHO and N0 snippets');
new Function(`return ${WHO([[1, 2]])}`); n++;

// ---- scorer
const sStop = (eng, cfg, pos, mode, { stable = true, tier = 'T0', geoArm = [], held = 0, shade = 0 } = {}) => ({ cfg, pos, mode, settled: stable, stable, frame: 100,
  pairs: [0, 1, 2].map(() => ({ aaAny: stable ? 0 : 50, aa8: stable ? 0 : 5, max: stable ? 0 : 30 })), geoFresh: [], envPixels: stable ? 0 : 50, envBlind: stable ? 0 : 5, envMax: stable ? 0 : 30,
  ...(cfg.startsWith('L-') ? {} : { arm: 'R3', judge: { tier, largestShadeAboveEnv: shade, aboveEnv: 0, beyond: 0, beyondEdge: 0, beyondFill: 0, shareBeyond: 0, areaCssPx: 0 },
    geoArm, stat: { n0on: [{ raf: 1, timeout: 0 }], arm: { raf: 1 + held, timeout: 0 } } }) });
const Lfile = (bad = []) => ({ name: 'L.json', json: { tool: 'deck-contain px149-chrome', part: 'L', complete: true, configs: {}, notRun: [],
  stops: CELLS.flatMap((c) => POSITIONS.map((p) => sStop('chrome', `L-${c.cell}`, p, 'rest', { stable: !bad.includes(c.cell) }))) } });
const Rfile = (stable, opt = () => ({})) => { const plan = rPlan(stable); return { name: 'R.json', json: { tool: 'deck-contain px149-chrome', part: 'R', complete: true, plan: plan.map((c) => c.cfg), configs: {}, notRun: [],
  stops: plan.flatMap((c) => POSITIONS.flatMap((p) => c.modes.map((m) => sStop('chrome', c.cfg, p, m, opt(c.cfg, p, m))))) } }; };
const Sfile = (g, opt = () => ({})) => ({ name: `${g}.json`, json: { tool: 'deck-contain px149-sim', group: g, complete: true, configs: {}, notRun: [],
  stops: SIM_GROUPS[g].flatMap((st) => POSITIONS.flatMap((p) => MODES.map((m) => sStop('sim', st, p, m, opt(st, p, m))))) } });
const good = ['mob1', 'desk1'], bad = ['mob3', 'desk3'];
let R = score([Lfile(bad), Rfile(good), Sfile('S1'), Sfile('S2')]);
ok(R.verdict === 'R3 T0' && R.locator.pattern === 'DPR 3 cells unstable, DPR 1 cells stable' && R.plan.join() === 'R-mob1,R-mob1-rm,R-desk1', 'clean: R3 T0, DPR pattern');
ok(score([Lfile(['mob3', 'desk3', 'mob1', 'desk1']), Rfile([]), Sfile('S1'), Sfile('S2')]).verdict === 'NO-STABLE-CELL', 'no stable cell');
ok(score([Lfile(bad), Rfile(good, (c, p, m) => (c === 'R-desk1' && p === 'top' && m === 'swipe' ? { tier: 'T2', shade: 40 } : {})), Sfile('S1'), Sfile('S2')]).verdict === 'R3 T3', 'swipe T2 over a T0 rest = motion-only T3');
R = score([Lfile(bad), Rfile(good, (c, p, m) => (c === 'R-desk1' && p === 'top' ? { tier: 'T2', shade: 40 } : {})), Sfile('S1'), Sfile('S2')]);
ok(R.verdict === 'R3 T2' && R.chrome.worst.tier === 'T2', 'rest and swipe T2: R3 T2');
ok(score([Lfile(bad), Rfile(good, (c) => (c === 'R-mob1-rm' ? { tier: 'T2' } : {})), Sfile('S1'), Sfile('S2')]).flags.rmNotExact.length === 4, 'reduced motion not exact');
ok(score([Lfile(bad), Rfile(good, (c, p) => (p === 'leave' ? { geoArm: ['deck.h 1 -> 2'] } : {})), Sfile('S1'), Sfile('S2')]).verdict === 'R3 T3', 'geometry = T3');
ok(score([Lfile(bad), Rfile(good, (c, p) => (p === 'enter' ? { held: 3 } : {})), Sfile('S1'), Sfile('S2')]).verdict === 'R3 UNDECIDED-HELD', 'held extra');
ok(heldExtra({ stat: { n0on: [{ raf: 2, timeout: 1 }, { raf: 0, timeout: 0 }], arm: { raf: 5, timeout: 0 } } }) === 2, 'held extra vs the most N0-on phase');
ok(score([Lfile(bad), Rfile(good), Sfile('S1', (st, p) => (st === 'landscape' && p === 'top' ? { stable: false } : {})), Sfile('S2')]).verdict === 'R3 UNDECIDED-UNSTABLE', 'an unstable Simulator stop: undecided');
R = score([Lfile(bad), Rfile(good), Sfile('S1')]);
ok(R.verdict === 'R3 UNDECIDED-UNSTABLE' && R.sim.unjudged.length === 8 && R.chrome.unjudged.length === 0 && R.sim.statesFullyJudged.collapsed === false, 'a missing Simulator group: undecided, 8 stops missing');
R = score([Lfile(bad), Rfile(good, (c, p, m) => (c === 'R-mob1' && p === 'top' && m === 'rest' ? { stable: false } : {})), Sfile('S1'), Sfile('S2')]);
ok(R.verdict === 'R3 UNDECIDED-UNSTABLE' && R.chrome.unjudged.join() === 'chrome R-mob1|top|rest unstable', 'an unstable Chrome part-R stop: undecided, named');
const Rb = Rfile(good); Rb.json.plan = ['R-mob3'];
ok(score([Lfile(bad), Rb, Sfile('S1'), Sfile('S2')]).verdict === 'PLAN-MISMATCH', 'an R file outside the plan');
const Rcut = Rfile(good); Rcut.json.stops = Rcut.json.stops.filter((s) => s.cfg !== 'R-desk1'); Rcut.json.notRun = [{ cfg: 'R-desk1', reason: 'budget: 200 + 40 > 270' }];
ok(score([Lfile(bad), Rcut, Sfile('S1'), Sfile('S2')]).verdict === 'R3 T0', 'second cell cut by the budget does not block');
const Rerr = Rfile(good); Rerr.json.configs['R-mob1'] = { error: 'x' };
ok(score([Lfile(bad), Rerr, Sfile('S1'), Sfile('S2')]).verdict === 'R3 UNDECIDED-UNSTABLE', 'rule 1b: errored config stops ignored, so missing');
assert.throws(() => score([Lfile(bad), Lfile(bad)]), /DUPLICATE/); n++;
ok(pattern(['desk3', 'desk1']) === 'mobile-emulated cells unstable, desktop cells stable' && pattern(['desk3', 'mob1', 'desk1']) === 'only the mobile-emulated DPR-3 cell unstable' && /^other/.test(pattern(['mob3'])), 'pattern readings');
console.log(`SELFTEST-P149 ok ${n} checks`);

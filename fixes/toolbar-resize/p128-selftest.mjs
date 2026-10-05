#!/usr/bin/env node
// toolbar-resize P-128 self-test (synthetic data only; no Simulator, no lock). Prints SELFTEST PASS (<n> checks).
//   node fixes/toolbar-resize/p128-selftest.mjs
// Part 1 runs the inject's install/read expressions in a node vm with a stub DOM (wrapper pass-through, changed flags,
// frame index binning, own-frame stripping via sourceURL). Part 2 checks the reader's stack keys on JSC-format lines.
// Part 3 writes synthetic census runs to a temp folder and checks the gate, frames, floors and every reading.
import vm from 'node:vm';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, read as readExpr } from './p128-inject.mjs';
import { parseLine, callerKey, helperKey, entryKey, features, loadRun, readSet, read } from './p128-read.mjs';
import { formatOk, runGateWhy, ownFramesLeft } from './sim-p128.mjs';

let n = 0; const fails = [];
const ok = (c, msg) => { n++; if (!c) fails.push(msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// ---- part 1: the inject in a stub DOM
{
  const rafs = [];
  class Element { constructor() { this.attrs = new Map(); this.classList = new DOMTokenList(); this.style = new CSSStyleDeclaration(); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    toggleAttribute(k) { if (this.attrs.has(k)) { this.attrs.delete(k); return false; } this.attrs.set(k, ''); return true; }
    getBoundingClientRect() { return { top: 0 }; } }
  class DOMTokenList { constructor() { this.s = new Set(); } contains(t) { return this.s.has(t); }
    toggle(t, f) { const on = f === undefined ? !this.s.has(t) : !!f; if (on) this.s.add(t); else this.s.delete(t); return on; }
    add(...ts) { for (const t of ts) this.s.add(t); } remove(...ts) { for (const t of ts) this.s.delete(t); }
    replace(a, b) { if (!this.s.has(a)) return false; this.s.delete(a); this.s.add(b); return true; } }
  class CSSStyleDeclaration { constructor() { this.p = new Map(); } getPropertyValue(k) { return this.p.get(k)?.[0] ?? ''; }
    getPropertyPriority(k) { return this.p.get(k)?.[1] ?? ''; } setProperty(k, v, pr = '') { this.p.set(k, [String(v), pr]); }
    removeProperty(k) { const v = this.getPropertyValue(k); this.p.delete(k); return v; } }
  let ioCb = null;
  const sc = new Element();
  const ctx = { Element, DOMTokenList, CSSStyleDeclaration, innerHeight: 775, scrollY: 100, Math, String, Map, Error, JSON,
    document: { querySelector: () => sc }, requestAnimationFrame: (f) => rafs.push(f),
    IntersectionObserver: class { constructor(cb) { ioCb = cb; } observe() {} } };
  ctx.window = ctx; vm.createContext(ctx);
  const ev = (src) => vm.runInContext(src, ctx, { filename: 'p128-inject.js' });
  eq(ev(install()), 'ok', 'inject install');
  eq(ev(install()), 'again', 'inject second install is a no-op');
  const tick = () => { const f = rafs.shift(); f(); };
  const el = new Element();
  vm.runInContext('void 0', ctx);
  // frame 0 (before any rAF): one changed setAttribute, one same-value
  el.setAttribute('data-x', '1'); el.setAttribute('data-x', '1');
  tick(); // fr = [[775, 100, null]]
  ioCb([{ isIntersecting: true }]);
  ctx.innerHeight = 790; tick(); // fr[1] = [790, 100, 1]
  // frame 2: toggle changes, setProperty changes then same, gBCR, cousins
  el.classList.toggle('a'); el.style.setProperty('--v', '1'); el.style.setProperty('--v', '1'); el.getBoundingClientRect();
  el.classList.add('a'); el.classList.add('b'); el.removeAttribute('nope'); el.style.removeProperty('--v');
  ctx.innerHeight = 815; tick();
  const v = JSON.parse(ev(readExpr()));
  eq(v.fr, [[775, 100, null], [790, 100, 1], [815, 100, 1]], 'inject frames [ih, y, view]');
  eq(v.wrapped.length, 10, 'inject wraps 10 functions');
  const byApi = (api, ch) => v.calls.filter((c) => c.api === api && c.changed === ch).reduce((m, c) => m.concat(c.f), []);
  eq(byApi('setAttribute', 1), [0], 'setAttribute change in frame 0');
  eq(byApi('setAttribute', 0), [0], 'setAttribute same value in frame 0');
  eq(byApi('toggle', 1), [2], 'toggle change in frame 2');
  eq(byApi('setProperty', 1), [2], 'setProperty change');
  eq(byApi('setProperty', 0), [2], 'setProperty same value');
  eq(byApi('gBCR', null), [2], 'gBCR read, changed null');
  eq([byApi('add', 0), byApi('add', 1), byApi('removeAttribute', 0), byApi('removeProperty', 1)], [[2], [2], [2], [2]], 'cousins: add same / add change / removeAttribute absent / removeProperty');
  ok(v.calls.every((c) => !c.stack.some((l) => l.includes('p128-inject.js'))), 'own frames stripped (sourceURL)');
  ok(v.calls.every((c) => c.stack.length <= 16), 'stack <= 16 lines');
  eq(el.getAttribute('data-x'), '1', 'wrapper passes setAttribute through');
  ok(el.classList.contains('a') && el.classList.contains('b') && el.style.getPropertyValue('--v') === '', 'wrappers pass through');
}

// ---- part 2: stack keys on JSC lines
{
  const N = '/_app/immutable/nodes/2.DyWL8TcE.js', CH = '/_app/immutable/chunks/abc.js';
  eq(parseLine(`ee@${N}:13860:25`), { fn: 'ee', url: N, line: 13860, col: 25 }, 'parseLine');
  eq(parseLine('forEach@[native code]'), { fn: 'forEach', url: '[native code]', line: null, col: null }, 'parseLine native');
  eq(callerKey([`set_attr@${CH}:10:1`, `eff@${N}:5000:3`, `flush@${CH}:99:1`]), '2.DyWL8TcE.js:eff@5000', 'caller = innermost nodes line over a chunk helper');
  eq(helperKey([`set_attr@${CH}:10:1`, `eff@${N}:5000:3`, `flush@${CH}:99:1`]), 'abc.js:set_attr@10', 'helper = innermost page line');
  eq(entryKey([`set_attr@${CH}:10:1`, `eff@${N}:5000:3`, `flush@${CH}:99:1`]), 'abc.js:flush@99', 'entry = outermost page line');
  eq(callerKey([`@${N}:2742:9`]), 'fwWC', 'region fwWC');
  eq(callerKey([`x@${N}:2737:1`]), 'fwWC', 'region padding -1');
  eq(callerKey([`x@${N}:2750:1`]), '2.DyWL8TcE.js:x@2750', 'outside the padded region');
  eq(callerKey([`cE@${N}:2800:1`]), 'sceneCE', 'region sceneCE');
  eq(callerKey([`h@${CH}:7:1`]), 'abc.js:h@7', 'chunk only');
  eq(callerKey(['forEach@[native code]', 'f@/vendor/lib.js:3:4']), 'ext:lib.js:f@3', 'ext key');
  eq(callerKey(['rec@', 'forEach@[native code]']), 'probe', 'no-url frame = probe');
  eq(callerKey(['forEach@[native code]']), 'native', 'native only');
  eq(callerKey([]), 'native', 'empty stack');
  eq(features({ api: 'setAttribute', changed: 0, stack: [`f@${N}:1:1`] }), ['same:setAttribute:2.DyWL8TcE.js:f@1'], 'unchanged write -> same:');
  eq(features({ api: 'gBCR', changed: null, stack: [`f@${N}:1:1`] }), ['gBCR:2.DyWL8TcE.js:f@1'], 'gBCR feature');
  ok(formatOk({ calls: [{ stack: [`f@${N}:1:1`] }] }) && !formatOk({ calls: [{ stack: ['f@'] }] }), 'formatOk');
}

// ---- part 3: synthetic runs
const N = '/_app/immutable/nodes/2.DyWL8TcE.js';
const STK = { a: [`setA@${N}:9000:1`], fw: [`@${N}:2742:9`], g: [`rd@${N}:4000:1`], probe: ['rec@'], chunk: [`h@/_app/immutable/chunks/c.js:7:1`, `onScroll@${N}:7000:2`] };
// a run: 400 frames; rest at 815 (in view, y 1000) except step blocks of 5 moving frames (ih 780..810) every 80 frames
function mkRun({ stepCalls = [], restCalls = [], view = 1, steps = 5, lo = 775 } = {}) {
  const fr = [], step = [], rest = [];
  for (let k = 0; k < 400; k++) {
    const blk = k % 80, mv = blk >= 40 && blk < 45 && Math.floor(k / 80) < steps;
    fr.push([k === 0 ? lo : mv ? 780 + (blk - 40) * 7 : 815, 1000, view]);
    (mv ? step : rest).push(k);
  }
  const calls = [];
  const add = (spec, idx) => { for (const s of spec) { const f = []; for (const k of idx) for (let i = 0; i < s.per; i++) if (!s.every || k % s.every === 0) f.push(k); calls.push({ api: s.api, name: s.name || 'x', changed: s.changed ?? 1, stack: STK[s.stk], f }); } };
  add(stepCalls, step); add(restCalls, rest.slice(1));
  return { run: { inject: [{ seg: 0, value: JSON.stringify({ installs: 1, wrapped: ['setAttribute', 'toggle', 'setProperty', 'gBCR', 'removeAttribute', 'toggleAttribute', 'add', 'remove', 'replace', 'removeProperty'], ioInstalled: true, fr, calls }) }] } };
}
const served = { served: { js: { h: '3e3e94cb6e9f', source: 'overlay' }, css: { h: 'f836404b3728', source: 'overlay' } } };
function setup(runs, { srv = served } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'p128st-'));
  writeFileSync(join(dir, 'runs.jsonl'), JSON.stringify(srv) + '\n');
  runs.forEach((g, i) => writeFileSync(join(dir, `g-C-H${i + 1}.json`), JSON.stringify(g)));
  return { dir, names: runs.map((_, i) => `C-H${i + 1}`) };
}
const go = (runs, o) => { const { dir, names } = setup(runs, o); try { return read(dir, names); } finally { rmSync(dir, { recursive: true }); } };
const five = (o) => Array.from({ length: 5 }, () => mkRun(o));
const fmt = { api: 'setAttribute', stk: 'chunk', per: 1, every: 7, changed: 0 }; // keeps formatOk true, decides nothing

{ // NAMED: a changed setAttribute in every step frame, rare at rest
  const r = go(five({ stepCalls: [{ api: 'setAttribute', stk: 'a', per: 1 }, fmt], restCalls: [{ api: 'setAttribute', stk: 'a', per: 1, every: 40 }, fmt] }));
  eq(r.valid, 5, 'five valid runs');
  eq(r.STEP, 125, 'STEP frames: 5 blocks x 5 moving frames x 5 runs');
  ok(r.reading === 'NAMED(setAttribute:2.DyWL8TcE.js:setA@9000)', `NAMED reading: ${r.reading}`);
  eq(r.feats['setAttribute:2.DyWL8TcE.js:setA@9000'].rate.floor, 20, 'rate floor 20 for 5 runs');
  ok(r.detail['setAttribute:2.DyWL8TcE.js:setA@9000'].perRun.length === 5, 'per-run detail');
  ok(r.B1.setAttribute.linked, 'B1 setAttribute RATE-LINKED');
  eq(r.pageShare, 1, 'pageShare 1');
}
{ // same-value writes in every step frame decide nothing
  const r = go(five({ stepCalls: [{ api: 'setAttribute', stk: 'a', per: 2, changed: 0 }, fmt], restCalls: [fmt] }));
  eq(r.reading, 'NONE-LINKED', 'unchanged writes never decide');
  ok(r.feats['same:setAttribute:2.DyWL8TcE.js:setA@9000'].linked && !r.feats['same:setAttribute:2.DyWL8TcE.js:setA@9000'].deciding, 'same: is LINKED but descriptive');
}
{ // cousins decide nothing
  const r = go(five({ stepCalls: [{ api: 'add', stk: 'a', per: 2 }, fmt], restCalls: [fmt] }));
  eq(r.reading, 'NONE-LINKED', 'cousin add never decides');
}
{ // fwWC only
  const r = go(five({ stepCalls: [{ api: 'setAttribute', stk: 'fw', per: 1 }, fmt], restCalls: [fmt] }));
  eq(r.reading, 'FWWC-ONLY', 'FWWC-ONLY');
}
{ // probe caller never decides
  const r = go(five({ stepCalls: [{ api: 'gBCR', stk: 'probe', per: 3 }, fmt], restCalls: [fmt] }));
  eq(r.reading, 'NONE-LINKED', 'probe gBCR never decides');
}
{ // gBCR decides without a changed flag; chunk helper keyed by the nodes line
  const r = go(five({ stepCalls: [{ api: 'gBCR', stk: 'g', per: 2 }, { api: 'toggle', stk: 'chunk', per: 1 }, fmt], restCalls: [fmt] }));
  ok(r.reading === 'NAMED(gBCR:2.DyWL8TcE.js:rd@4000,toggle:2.DyWL8TcE.js:onScroll@7000)', `gBCR + toggle NAMED: ${r.reading}`);
  eq(r.detail['toggle:2.DyWL8TcE.js:onScroll@7000'].helper[0][0], 'c.js:h@7', 'helper reported');
}
{ // an equal rate at rest: no link
  const r = go(five({ stepCalls: [{ api: 'setProperty', stk: 'a', per: 1 }, fmt], restCalls: [{ api: 'setProperty', stk: 'a', per: 1 }, fmt] }));
  eq(r.reading, 'NONE-LINKED', 'every-frame setProperty: no link');
}
{ // rate floor: s 19 < 20 does not rate-link (presence also below its floor 10 with 4 carrying frames... use 1 run of calls)
  const runs = five({ restCalls: [fmt], stepCalls: [fmt] });
  const v = JSON.parse(runs[0].run.inject[0].value);
  const stepIdx = v.fr.map((x, k) => [x, k]).filter(([x]) => x[0] > 775 && x[0] < 815).map(([, k]) => k);
  v.calls.push({ api: 'setAttribute', name: 'x', changed: 1, stack: STK.a, f: [...stepIdx.slice(0, 19)] });
  runs[0].run.inject[0].value = JSON.stringify(v);
  const r = go(runs);
  const f = r.feats['setAttribute:2.DyWL8TcE.js:setA@9000'];
  ok(f && f.rate.s === 19 && !f.rate.linked, 'rate floor: 19 < 20 not RATE-LINKED');
  v.calls[v.calls.length - 1].f.push(stepIdx[19]); runs[0].run.inject[0].value = JSON.stringify(v);
  const r2 = go(runs);
  ok(r2.feats['setAttribute:2.DyWL8TcE.js:setA@9000'].rate.linked, 'rate floor: 20 RATE-LINKED');
  eq(r2.feats['setAttribute:2.DyWL8TcE.js:setA@9000'].spread, { frames: 20, runs: 1, need: 10, ok: false }, 'C1: 20 frames in 1 run is no spread');
  ok(r2.feats['setAttribute:2.DyWL8TcE.js:setA@9000'].rateClustered, 'C1: one-run rate link reads RATE-CLUSTERED');
}
{ // carry: a call in the frame before a step frame carries it
  const runs = five({ stepCalls: [fmt], restCalls: [fmt] });
  for (const g of runs) { const v = JSON.parse(g.run.inject[0].value); v.calls.push({ api: 'toggle', name: 'x', changed: 1, stack: STK.a, f: [39, 119, 199, 279, 359] }); g.run.inject[0].value = JSON.stringify(v); }
  const r = go(runs), f = r.feats['toggle:2.DyWL8TcE.js:setA@9000'];
  eq([f.Hw, f.rate.s], [25, 0], 'previous-frame carry counts for presence, not for rate');
}
{ // gate
  const bad = five({ stepCalls: [fmt], restCalls: [fmt] });
  const v0 = JSON.parse(bad[0].run.inject[0].value); v0.wrapped = ['setAttribute']; bad[0].run.inject[0].value = JSON.stringify(v0);
  const v1 = JSON.parse(bad[1].run.inject[0].value); v1.fr = v1.fr.map((x) => [815, x[1], x[2]]); bad[1].run.inject[0].value = JSON.stringify(v1);
  const v2 = JSON.parse(bad[2].run.inject[0].value); v2.ioInstalled = false; bad[2].run.inject[0].value = JSON.stringify(v2);
  const r = go(bad);
  eq(r.runs.map((x) => x.valid), [false, false, false, true, true], 'gate: wrappers / no step / no IO');
  eq(r.reading, 'INSUFFICIENT', 'INSUFFICIENT under 3 valid runs');
  const r2 = go(five({ stepCalls: [fmt], restCalls: [fmt] }), { srv: { served: { js: { h: 'xxx', source: 'overlay' }, css: { h: 'f836404b3728', source: 'overlay' } } } });
  eq(r2.reading, 'INSUFFICIENT', 'gate: served bytes mismatch');
  const nf = five({ stepCalls: [], restCalls: [{ api: 'setAttribute', stk: 'probe', per: 1 }] });
  eq(go(nf).reading, 'INSUFFICIENT', 'gate: no page stack line (formatOk)');
}
{ // THIN and the wide control
  const r = go(five({ stepCalls: [fmt], restCalls: [fmt], steps: 0 }));
  eq(r.reading, 'THIN', 'THIN: no step frames');
  ok(r.runs.every((x) => !x.valid) || r.reading === 'THIN', 'no-step runs');
  const r2 = go(five({ stepCalls: [fmt], restCalls: [fmt], view: 0 }));
  ok(r2.controlWide && r2.reading === 'THIN', `out of view: wide control and THIN (${r2.reading})`);
}

// ---- rev 2 (ops pre-data read, C1 and N1): a rate link decides only when spread over >= max(5, 2 x runs) STEP frames
// and >= 3 runs. Rest frames carry the feature every other frame (base ~1), so presence never links in these cases.
const restEven = { api: 'setAttribute', stk: 'a', per: 1, every: 2 };
const FA = 'setAttribute:2.DyWL8TcE.js:setA@9000';
{ // C1: one clustered frame per run (30 calls in the last step frame of a block) is not deciding
  const runs = five({ stepCalls: [fmt], restCalls: [fmt] });
  for (const g of runs) { const v = JSON.parse(g.run.inject[0].value); v.calls.push({ api: 'setAttribute', name: 'x', changed: 1, stack: STK.a, f: Array(30).fill(44) }); g.run.inject[0].value = JSON.stringify(v); }
  const r = go(runs), f = r.feats[FA];
  ok(f.rate.linked && f.call === 'NO-LINK', `C1 cluster: rate-linked by count, no presence link (${f.call}, ${f.rate.linked})`);
  eq(f.spread, { frames: 5, runs: 5, need: 10, ok: false }, 'C1 cluster: 5 frames < 10');
  ok(f.rateClustered && !f.linked, 'C1 cluster: RATE-CLUSTERED, not LINKED');
  eq(r.reading, 'NONE-LINKED', 'C1: one clustered frame per run is not deciding');
  ok(!r.detail[FA], 'C1 cluster: no LINKED detail');
}
{ // C1: spread over many frames but only 2 runs is not deciding
  const runs = five({ stepCalls: [fmt], restCalls: [restEven, fmt] });
  runs.splice(0, 2, ...[0, 1].map(() => mkRun({ stepCalls: [{ api: 'setAttribute', stk: 'a', per: 8 }, fmt], restCalls: [restEven, fmt] })));
  const r = go(runs), f = r.feats[FA];
  ok(f.rate.linked && f.call === 'NO-LINK', `C1 two runs: rate-linked, no presence (${f.call}, RRlo ${f.rate.RRlo})`);
  eq([f.spread.frames, f.spread.runs, f.spread.ok], [50, 2, false], 'C1 two runs: 50 frames, 2 runs < 3');
  ok(f.rateClustered && !f.linked, 'C1 two runs: RATE-CLUSTERED');
  eq(r.reading, 'NONE-LINKED', 'C1: a rate link in 2 runs is not deciding');
}
{ // C1: a spread rate link (every step frame of 5 runs) decides; N1 splits control into y-moved and still frames
  const runs = Array.from({ length: 5 }, () => mkRun({ stepCalls: [{ api: 'setAttribute', stk: 'a', per: 4 }, fmt], restCalls: [restEven, fmt] }));
  for (const g of runs) { const v = JSON.parse(g.run.inject[0].value); v.fr = v.fr.map((x, k) => (k % 80 >= 50 && k % 80 < 60 ? [x[0], 1000 + k, x[2]] : x)); g.run.inject[0].value = JSON.stringify(v); }
  const r = go(runs), f = r.feats[FA];
  ok(f.rate.linked && f.call === 'NO-LINK' && f.spread.ok && !f.rateClustered && f.linked, `C1 spread: RATE-LINKED and spread (${f.call}, ${JSON.stringify(f.spread)})`);
  eq([f.spread.frames, f.spread.runs], [125, 5], 'C1 spread: 125 frames in 5 runs');
  eq(r.reading, `NAMED(${FA})`, 'C1: a spread rate link is deciding');
  const sp = r.detail[FA].scrollSplit;
  eq([sp.step.frames, sp.step.perFrame], [125, 4], 'N1: step calls per frame');
  ok(sp.controlMoved.frames > 0 && sp.controlStill.frames > 0 && sp.controlMoved.frames + sp.controlStill.frames === r.control, `N1: control split moved ${sp.controlMoved.frames} + still ${sp.controlStill.frames} = CONTROL ${r.control}`);
  ok(sp.controlMoved.perFrame > 0.3 && sp.controlMoved.perFrame < 0.7 && sp.controlStill.perFrame > 0.3 && sp.controlStill.perFrame < 0.7, `N1: both control rates ~0.5 (${sp.controlMoved.perFrame}, ${sp.controlStill.perFrame})`);
}
{ // N2: the driver's run-1 gate is the reader's run gate; N3: own frames left
  const good = JSON.parse(mkRun({ stepCalls: [fmt], restCalls: [fmt] }).run.inject[0].value);
  eq(runGateWhy(good), [], 'N2 gate: a good run passes');
  eq(runGateWhy(null), ['no inject value'], 'N2 gate: no value');
  eq(runGateWhy({ ...good, wrapped: ['setAttribute'], ioInstalled: false }), ['wrappers missing', 'no showcase IO'], 'N2 gate: wrappers and IO');
  eq(runGateWhy({ ...good, fr: good.fr.slice(0, 50) }), ['< 100 frames'], 'N2 gate: < 100 frames');
  eq(runGateWhy({ ...good, fr: good.fr.map((x) => [815, x[1], x[2]]) }), ['no toolbar step (ih range < 30)'], 'N2 gate: no toolbar step');
  eq(runGateWhy({ ...good, calls: [{ stack: ['rec@'], f: [1] }] }), ['no page stack line'], 'N2 gate: no page stack line');
  eq(runGateWhy({ ...good, installs: 0 }), ['not installed'], 'N2 gate: not installed');
  eq([ownFramesLeft(good), ownFramesLeft({ calls: [{ stack: ['w@p128-inject.js:3:1', `f@${N}:1:1`], f: [1, 2] }, { stack: [`f@${N}:1:1`], f: [3] }] })], [0, 2], 'N3 ownFramesLeft counts calls with a wrapper line');
}

if (fails.length) { console.log(`SELFTEST FAIL (${fails.length} of ${n})\n  ` + fails.join('\n  ')); process.exit(1); }
console.log(`SELFTEST PASS (${n} checks)`);

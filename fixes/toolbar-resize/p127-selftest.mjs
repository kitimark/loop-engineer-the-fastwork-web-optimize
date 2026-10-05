#!/usr/bin/env node
// toolbar-resize P-127 reader self-test (synthetic records; no device). node fixes/toolbar-resize/p127-selftest.mjs
import { readArm, outcomes, shape } from './p127-read.mjs';
import { bracketDepths, PLAN, timelineStart } from './p127-capture.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`FAIL ${m}`); } };
const PAGE = 'http://localhost:5555/p127/';
const fr = { page: [{ functionName: 'setAttribute', url: '[native code]' }, { functionName: 'p127write', url: PAGE }, { functionName: 'p127round', url: PAGE }, { functionName: 'p127io', url: PAGE }],
  dom: [{ functionName: 'setAttribute', url: '[native code]' }], none: null };
const inv = (t, st, type = 'ScheduleStyleRecalculation') => ({ type, startTime: t, ...(st ? { stackTrace: { callFrames: st } } : {}) });
const mark = (m, t) => ({ type: 'TimeStamp', startTime: t, data: { message: m } });
// one round: a container holding open mark, records, end mark
const round = (spec, i, t, recs, container = 'FunctionCall', bracket = true) => ({ type: container, startTime: t, children: [mark(`p127:${spec}:${i}`, t), ...recs, ...(bracket ? [mark(`p127end:${spec}:${i}`, t + 0.0001)] : [])] });
const arm = (name, spec, depth, n, recsFor, opts = {}) => ({ arm: name, spec, depth, page: { fired: n }, recs: Array.from({ length: n }, (_, i) => ({ type: 'RenderingFrame', startTime: 10 + i * 0.1, children: [round(spec, i, 10 + i * 0.1, recsFor(i, 10 + i * 0.1), opts.container, opts.bracket ?? true), ...(opts.after ? opts.after(i, 10 + i * 0.1) : [])] })) });

// shapes
ok(shape(inv(1, fr.page)) === 'page', 'shape page');
ok(shape(inv(1, fr.dom)) === 'dom-call', 'shape dom-call');
ok(shape(inv(1, null)) === 'no-stack', 'shape no-stack');
ok(shape(inv(1, [{ functionName: 'x', url: 'http://other/x.js' }])) === 'other', 'shape other');

// a page-stacked IO arm: RAISES, PAGE, callerNamed, container
const a1 = readArm(arm('d16-io-change-sel', 'io-change-sel', 16, 30, (i, t) => [inv(t, fr.page)], { container: 'ObserverCallback' }));
ok(a1.bracketed === 30 && a1.roundsWithSSR === 30 && a1.raises === 'RAISES' && a1.stack === 'PAGE', `a1 ${JSON.stringify(a1)}`);
ok(a1.callerNamed === 30 && a1.containers.ObserverCallback === 30 && a1.pageShare === 1, 'a1 named/container');
// records outside the bracket do not count (later in the same rendering frame)
const a2 = readArm(arm('d16-raf-none', 'raf-none', 16, 30, () => [], { after: (i, t) => [inv(t + 0.003, null), inv(t + 0.003, null, 'InvalidateLayout')] }));
ok(a2.raises === 'NONE' && a2.stack === 'n/a' && a2.roundsWithRecord === 0, 'outside bracket not counted');
ok(a2.T.hit2ms === 0, `T: a record 3 ms later is no 2 ms hit (${a2.T.hit2ms})`);
// rule T hits a record 1 ms later even outside the bracket
const a3 = readArm(arm('d16-io-same-sel', 'io-same-sel', 16, 30, () => [], { after: (i, t) => [inv(t + 0.001, null)] }));
ok(a3.T.hit2ms === 30 && a3.raises === 'NONE', 'T hit outside bracket, still NONE');
ok(a3.T.minus25 === 0 && a3.T.plus25 === 0, 'T background 0');
// unbracketed rounds
const a4 = readArm(arm('d16-timer-change-sel', 'timer-change-sel', 16, 30, (i, t) => [inv(t, fr.page)], { bracket: false }));
ok(a4.marks === 30 && a4.bracketed === 0 && a4.raises === 'THIN', 'unbracketed -> THIN');
// nested records inside a sibling count (descendants)
const a5 = readArm(arm('d16-raf-change-sel', 'raf-change-sel', 16, 30, (i, t) => [{ type: 'FunctionCall', startTime: t, children: [inv(t, fr.page)] }]));
ok(a5.raises === 'RAISES' && a5.records.ScheduleStyleRecalculation === 30, 'descendant counted');
// mixed shapes and PARTIAL
const a6 = readArm(arm('x', 'io-change-sel', 16, 30, (i, t) => (i % 2 ? [inv(t, fr.page)] : [])));
ok(a6.raises === 'PARTIAL', `PARTIAL ${a6.raises}`);
const a7 = readArm(arm('x', 'io-change-sel', 16, 30, (i, t) => [inv(t, i % 2 ? fr.page : null)]));
ok(a7.stack === 'MIXED', 'MIXED');
const a8 = readArm(arm('d1-io-change-sel', 'io-change-sel', 1, 30, (i, t) => [inv(t, fr.dom)]));
ok(a8.stack === 'DOM-ONLY' && a8.stackLengths[1] === 30, 'DOM-ONLY');
const a9 = readArm(arm('x', 'io-change-sel', 16, 30, (i, t) => [inv(t, null)]));
ok(a9.stack === 'STACKLESS', 'STACKLESS');
// a mark whose end has another round index does not close it
const bad = { arm: 'x', spec: 'raf-change-sel', depth: 16, page: { fired: 1 }, recs: [{ type: 'FireAnimationFrame', startTime: 1, children: [mark('p127:raf-change-sel:0', 1), inv(1, fr.page), mark('p127end:raf-change-sel:1', 1)] }] };
ok(readArm(bad).bracketed === 0, 'end mark index must match');

// outcomes
const mk = (spec, depth, raises, stack, shapes = {}) => ({ arm: `d${depth}-${spec}`, spec, depth, raises, stack, shapes, T: { n: 30 } });
const base = () => {
  const o = {};
  for (const c of ['io', 'raf', 'timer']) {
    o[`d16-${c}-none`] = mk(`${c}-none`, 16, 'NONE', 'n/a');
    o[`d16-${c}-change-sel`] = mk(`${c}-change-sel`, 16, 'RAISES', 'PAGE', { page: 30 });
    o[`d16-${c}-same-sel`] = mk(`${c}-same-sel`, 16, 'NONE', 'n/a');
    o[`d16-${c}-change-nosel`] = mk(`${c}-change-nosel`, 16, 'NONE', 'n/a');
    o[`d16-${c}-same-nosel`] = mk(`${c}-same-nosel`, 16, 'NONE', 'n/a');
    o[`d1-${c}-change-sel`] = mk(`${c}-change-sel`, 1, 'RAISES', 'DOM-ONLY', { 'dom-call': 30 });
  }
  return o;
};
let o = outcomes(base());
ok(o.O1 === 'SEEN-WITH-CALLER' && o.O2 === 'DOM-ONLY-AT-1' && o.O3 === 'NEVER' && o.O4 === 'SILENT' && o.O5 === 'GATED', `base ${JSON.stringify(o)}`);
ok(o.control.io === 'OK' && o.control.raf === 'OK' && o.control.timer === 'OK', 'control ok');
let b = base(); b['d16-io-change-sel'] = mk('io-change-sel', 16, 'RAISES', 'STACKLESS', { 'no-stack': 30 }); o = outcomes(b);
ok(o.O1 === 'STACKLESS' && o.O3 === 'SOMETIMES (30)', `stackless ${JSON.stringify(o)}`);
b = base(); b['d16-io-change-sel'] = mk('io-change-sel', 16, 'NONE', 'n/a'); o = outcomes(b);
ok(o.O1 === 'UNSEEN', 'UNSEEN');
b = base(); b['d16-io-change-sel'] = mk('io-change-sel', 16, 'NONE', 'n/a'); b['d16-raf-change-sel'] = mk('raf-change-sel', 16, 'NONE', 'n/a'); o = outcomes(b);
ok(o.O1 === 'NO-RECORD', 'NO-RECORD');
b = base(); b['d16-io-none'] = mk('io-none', 16, 'PARTIAL', 'MIXED'); o = outcomes(b);
ok(o.control.io === 'VOID' && o.O1 === 'VOID' && o.O2 === 'VOID', 'io control VOID');
b = base(); b['d16-raf-same-sel'] = mk('raf-same-sel', 16, 'RAISES', 'PAGE', { page: 30 }); o = outcomes(b);
ok(o.O4 === 'RECORDS', 'RECORDS');
b = base(); b['d16-timer-change-nosel'] = mk('timer-change-nosel', 16, 'RAISES', 'PAGE', { page: 30 }); o = outcomes(b);
ok(o.O5 === 'NOT-GATED', 'NOT-GATED');
b = base(); b['d1-raf-change-sel'] = mk('raf-change-sel', 1, 'RAISES', 'PAGE', { page: 30 }); o = outcomes(b);
ok(o.O2 === 'PAGE-AT-1', 'PAGE-AT-1');
b = base(); b['d16-io-change-sel'] = mk('io-change-sel', 16, 'RAISES', 'DOM-ONLY', { 'dom-call': 30 }); o = outcomes(b);
ok(o.O1 === 'CALLER-CUT', 'CALLER-CUT');
// d1 no-stack records do not enter O3 (depth rule)
b = base(); b['d1-io-change-sel'].shapes = { 'no-stack': 5 }; o = outcomes(b);
ok(o.O3 === 'NEVER', 'O3 counts d16 only');

// rule W (rev 2, N2): stackless records after the end mark, capped at the next round / 100 ms
ok(a2.W.call === 'RAISES' && a2.W.rounds === 30 && a2.W.roundsWithStackless === 30 && a2.W.records === 60, `W counts downstream stackless ${JSON.stringify(a2.W)}`);
ok(a1.W.call === 'NONE' && a1.W.records === 0, 'W ignores the bracketed records (before the end mark)');
const w1 = readArm(arm('x', 'raf-change-sel', 16, 30, () => [], { after: (i, t) => [inv(t + 0.003, fr.page)] }));
ok(w1.W.call === 'NONE', 'W ignores stacked records');
const w2 = readArm(arm('x', 'raf-change-sel', 16, 30, () => [], { after: (i, t) => (i === 29 ? [inv(t + 0.15, null)] : []) }));
ok(w2.W.records === 0, 'W: the last round\'s window ends at end mark + 100 ms');
const w2b = readArm(arm('x', 'raf-change-sel', 16, 30, () => [], { after: (i, t) => (i === 29 ? [inv(t + 0.05, null)] : []) }));
ok(w2b.W.records === 1, 'W: the last round\'s window holds a record 50 ms later');
const w2c = readArm(arm('x', 'raf-change-sel', 16, 30, () => [], { after: (i, t) => (i === 0 ? [inv(t + 0.15, null)] : []) }));
ok(w2c.W.records === 1 && w2c.W.roundsWithStackless === 1, 'W: a record past the next open counts once, for the next round');
const w3 = readArm(arm('x', 'raf-change-sel', 16, 30, () => [], { after: (i, t) => (i % 2 ? [inv(t + 0.003, null)] : []) }));
ok(w3.W.call === 'PARTIAL', 'W PARTIAL');
ok(a4.W.call === 'THIN', 'W THIN without end marks');
// O7
const withW = (o, spec, call) => { o[`d16-${spec}`] = { ...o[`d16-${spec}`], W: { call } }; };
const baseW = (ch, no, sa) => { const o = base(); for (const c of ['io', 'raf', 'timer']) { withW(o, `${c}-change-sel`, ch); withW(o, `${c}-none`, no); withW(o, `${c}-same-sel`, sa); } return o; };
ok(outcomes(baseW('RAISES', 'NONE', 'NONE')).O7.call === 'DOWNSTREAM-STACKLESS', 'O7 DOWNSTREAM-STACKLESS');
ok(outcomes(baseW('NONE', 'NONE', 'NONE')).O7.call === 'NONE-DOWNSTREAM', 'O7 NONE-DOWNSTREAM');
ok(outcomes(baseW('RAISES', 'RAISES', 'NONE')).O7.call === 'BACKGROUND', 'O7 BACKGROUND (none)');
ok(outcomes(baseW('RAISES', 'NONE', 'RAISES')).O7.call === 'BACKGROUND', 'O7 BACKGROUND (same)');
ok(outcomes(baseW('PARTIAL', 'NONE', 'NONE')).O7.call === 'MIXED', 'O7 PARTIAL -> MIXED');
b = baseW('RAISES', 'NONE', 'NONE'); withW(b, 'timer-change-sel', 'NONE'); o = outcomes(b);
ok(o.O7.call === 'MIXED' && o.O7.byCause.timer === 'NONE-DOWNSTREAM' && o.O7.byCause.io === 'DOWNSTREAM-STACKLESS', 'O7 causes disagree -> MIXED');
b = baseW('RAISES', 'NONE', 'NONE'); b['d16-raf-none'] = { ...b['d16-raf-none'], raises: 'PARTIAL' }; o = outcomes(b);
ok(!('raf' in o.O7.byCause) && o.O7.call === 'DOWNSTREAM-STACKLESS', 'O7 skips a VOID cause');

// capture helpers
ok(PLAN.length === 19 && PLAN.filter((p) => p.depth === 1).length === 4, `plan ${PLAN.length}`);
const ts = timelineStart(16);
ok(ts.at(-1)[0] === 'Timeline.start' && ts.at(-1)[1].maxCallStackDepth === 16 && timelineStart(1).at(-1)[1].maxCallStackDepth === 1, 'timelineStart depth');
ok(JSON.stringify(ts.slice(0, -1)) === JSON.stringify([['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }]]), 'timelineStart other commands unchanged');
const dd = bracketDepths(arm('dry', 'raf-change-sel', 16, 5, (i, t) => [inv(t, fr.page)]).recs);
ok(dd.length === 5 && dd.every((d) => d === 4), `bracketDepths ${dd}`);
ok(bracketDepths(arm('dry', 'raf-change-sel', 16, 5, (i, t) => [inv(t, fr.dom)]).recs).every((d) => d === 1), 'bracketDepths depth 1');

console.log(`p127 selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

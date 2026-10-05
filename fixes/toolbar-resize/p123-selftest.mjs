#!/usr/bin/env node
// Self-test for p123-inject.mjs read() and read-p123.mjs (no browser): a synthetic window.__p123, then the reader on
// fixture g-files. Covers the ops pre-data read conditions:
//   T1  400 noise rows come before the flips in iteration order: flips are still counted (the row cap is 300); a flip
//       list over its cap (2001 flips) is INSUFFICIENT
//   T2  a write key at the same per-frame rate in step and rest frames is not step-specific; one seen only in step
//       frames is; a key with a single step record is not
//   T3  a flip of a property in the viewport-unit set is attributed (own); a flip inherited from an ancestor with that
//       property in the set is attributed (inherited); a transform flip with no viewport unit is scroll-confounded
// Flips in the fixture: box height (own), font-size on all three (ancestor 2 owns the rule: 2 own, 0 and 1 inherited),
// box transform (no viewport unit) = 5 flips, 4 attributed, 3 of them in the box.
// Elements: 0 = the box (div.box), 1 = a child (span.kid), 2 = an ancestor (section#people). Prints SELFTEST PASS|FAIL.
import { read, install } from './p123-inject.mjs';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const fails = []; let n = 0; const ok = (c, m) => { n++; if (!c) fails.push(m); };
const NOISE = Array.from({ length: 400 }, (_, i) => `n${i}`);
const NAMES = [...NOISE, 'height', 'font-size', 'transform', 'p4'];
const els = ['0:div.box', '1:span.kid', '2:section#people'], parent = [2, 0, -1];
// per snapshot, per element: values by property
const val = (snap, e, p) => {
  if (p.startsWith('n')) return e === 0 && snap === 'A2' ? 'noise2' : 'noise1';
  const hi = snap === 'B' || snap === 'B2';
  if (p === 'height') return e === 0 ? (hi ? '815px' : '775px') : 'auto';
  if (p === 'font-size') return hi ? '12px' : '10px'; // all three, ancestor 2 owns the rule
  if (p === 'transform') return e === 0 ? (hi ? 'matrix(1,0,0,1,0,5)' : 'none') : 'none';
  if (p === 'p4') return e === 1 ? { A: 's1', A2: 's1', B: 's2', C: 's3', B2: 's4' }[snap] : 'k';
  return 'k';
};
const snaps = (names) => Object.fromEntries(['A', 'A2', 'B', 'C', 'B2'].map((k) => [k, { ih: k.startsWith('B') ? 815 : 775, sy: 0, top: 0, bottom: 0, f: 0, vals: els.map((_, e) => names.map((p) => val(k, e, p))) }]));
const hitsVU = [{ el: '0:div.box', where: 'box', pseudo: false, props: ['height'] }, { el: '2:section#people', where: 'anc', pseudo: false, props: ['font-size'] }];
const moMap = (specific) => new Map([['step|box|0:div.box|style:--x', 30], ['rest|box|0:div.box|style:--x', 300], ['step|anc|2:section#people|childList', 1], ...(specific ? [['step|in|1:span.kid|attributes:class=a>b', 4]] : [])]);
const page = ({ hits = hitsVU, specific = true, names = NAMES, snapsOverride = null } = {}) => {
  globalThis.window = { __p123: { sel: 'S', audit: { nBox: 2, nAnc: 1, nVuBox: 1, hits: [], inline: [] }, names, els, parent, hitsAll: hits,
    st: { f: 110, steps: 10, ih0: 775, ihMin: 775, ihMax: 815, snaps: snapsOverride || snaps(names) }, mo: moMap(specific), ro: new Map([['step|box|0:div.box|same', 2]]) } };
  return JSON.parse((0, eval)(read()));
};
// in-page read()
const r = page();
const f = (el, prop) => r.diff.flips.find((d) => d.el === el && d.prop === prop);
ok(r.diff.rowsTruncated === true && r.diff.rows.length === 300, 'T1: other rows capped at 300');
ok(r.diff.nFlip === 5 && r.diff.flips.length === 5 && !r.diff.flipsTruncated, `T1: all 5 flips counted past 400 noise rows (${r.diff.nFlip})`);
ok(f('0:div.box', 'height')?.attr === 'own', 'T3: own viewport-unit flip attributed');
ok(f('1:span.kid', 'font-size')?.attr === 'inherited:2:section#people', `T3: inherited flip attributed (${f('1:span.kid', 'font-size')?.attr})`);
ok(f('0:div.box', 'transform') && f('0:div.box', 'transform').attr === null, 'T3: transform flip not attributed');
ok(r.diff.nVuFlip === 4, `T3: 4 attributed flips (${r.diff.nVuFlip})`);
const ss = Object.fromEntries(r.mo.stepSpecific.map(([k, s, q]) => [k, [s, q]]));
ok(!ss['box|0:div.box|style:--x'], 'T2: same per-frame rate in step and rest is not step-specific');
ok(ss['in|1:span.kid|attributes:class=a>b']?.[0] === 4, 'T2: step-only key is step-specific');
ok(!ss['anc|2:section#people|childList'], 'T2: one step record is not step-specific');
ok(r.frames.stepFrames === 10 && r.frames.restFrames === 100, 'T2: step and rest frame counts');
ok(!/"(cost|ms|time)"/.test(JSON.stringify(r)), 'no time fields in the read');
try { new Function(install()); } catch (e) { fails.push('install parse: ' + e.message); }
ok(!/performance\.now|\.time\b/.test(install()), 'install records no time');
ok(/matchAll\(\/var\\\(\(--\[\\w-\]\+\)\/g/.test(install()), 'var() regex survives the template literal');
// reader
const FX = new URL('../../out/toolbar-resize/selftest123/', import.meta.url).pathname;
rmSync(FX, { recursive: true, force: true }); mkdirSync(FX, { recursive: true });
const put = (name, v) => writeFileSync(FX + `g-${name}.json`, JSON.stringify({ run: { inject: [{ seg: 0, name: 'p123', value: v }] } }));
put('R1', r); put('R2', r);
put('W1', page({ hits: [] })); put('W2', page({ hits: [] }));
put('I1', page({ hits: [], specific: false }));
const many = Array.from({ length: 2001 }, (_, i) => `height-${i}`);
const manySnaps = Object.fromEntries(['A', 'A2', 'B', 'C', 'B2'].map((k) => [k, { ih: 0, sy: 0, top: 0, bottom: 0, f: 0, vals: els.map(() => many.map(() => (k.startsWith('B') ? 'b' : 'a'))) }]));
put('T1', page({ names: many, snapsOverride: manySnaps }));
const noC = page(); delete noC.snaps.C; put('NC', noC);
const rd = (...a) => JSON.parse(spawnSync('node', [new URL('./read-p123.mjs', import.meta.url).pathname, FX, ...a, '--json'], { encoding: 'utf8' }).stdout);
const x = rd('R1', 'R2');
ok(x.probe === 'VALUE-FLIP' && x.runs[0].nFlip === 3 && x.runs[0].ancFlips.length === 1 && x.runs[0].nConfounded === 1, `reader VALUE-FLIP: ${x.probe} box ${x.runs[0].nFlip} anc ${x.runs[0].ancFlips.length} conf ${x.runs[0].nConfounded}`);
const w = rd('W1', 'W2');
ok(w.probe === 'WRITE' && w.runs[0].nConfounded === 5 && w.runs[0].stepWrites.length === 1, `reader T3+T2: no attributed flip -> WRITE (${w.probe}, conf ${w.runs[0].nConfounded})`);
ok(rd('I1').probe === 'INVAL-ONLY', 'reader T2: per-frame writes alone do not make WRITE -> INVAL-ONLY');
const t = rd('T1');
ok(t.probe === 'INSUFFICIENT' && t.runs[0].why.some((s) => /cap/.test(s)), `reader T1: flip list over cap -> INSUFFICIENT (${t.probe})`);
ok(rd('NC').probe === 'INSUFFICIENT', 'reader: snapshot C missing -> INSUFFICIENT');
console.log(fails.length ? `SELFTEST FAIL\n  ${fails.join('\n  ')}` : `SELFTEST PASS (${n} checks)`);
process.exit(fails.length ? 1 : 0);

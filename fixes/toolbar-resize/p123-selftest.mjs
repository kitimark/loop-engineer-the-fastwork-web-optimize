#!/usr/bin/env node
// Self-test for p123-inject.mjs read(): the in-page diff and tallies on a synthetic window.__p123 (no browser).
// Cases (element 0 = box, 1 = ancestor; 5 properties):
//   p0 flips with the toolbar (A = A2 = C = 775px-ish, B = B2)      -> flip
//   p1 changes with no step (A2 != A)                                -> noise, never flip
//   p2 constant                                                      -> not listed
//   p3 differs only at B, C missing in run 2                         -> flipPartial
//   p4 differs at B and does not come back at C (scroll-dependent)   -> listed, neither flip nor partial
// Also: MutationObserver / ResizeObserver tallies split step|rest and box/in vs anc. Prints SELFTEST PASS|FAIL.
import { read, install } from './p123-inject.mjs';
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const mk = (vals) => ({ ih: 0, sy: 0, top: 0, bottom: 0, f: 0, vals });
const snaps = (withC) => ({
  A: mk([['a', 'x', 'k', 'q', 's1'], ['a', 'x', 'k', 'q', 's1']]),
  A2: mk([['a', 'y', 'k', 'q', 's1'], ['a', 'x', 'k', 'q', 's1']]),
  B: mk([['b', 'x', 'k', 'r', 's2'], ['a', 'x', 'k', 'q', 's1']]),
  ...(withC ? { C: mk([['a', 'x', 'k', 'q', 's3'], ['a', 'x', 'k', 'q', 's1']]), B2: mk([['b', 'x', 'k', 'r', 's4'], ['a', 'x', 'k', 'q', 's1']]) } : {}),
});
const run = (withC) => {
  globalThis.window = { __p123: { sel: 'S', audit: {}, names: ['p0', 'p1', 'p2', 'p3', 'p4'], els: ['0:div.box', '1:section#people'],
    st: { f: 100, steps: 4, ih0: 775, ihMin: 775, ihMax: 815, snaps: snaps(withC) },
    mo: new Map([['step|box|0:div.box|style:--x', 3], ['rest|in|5:span|childList', 2], ['step|anc|1:section#people|attributes:class', 1]]),
    ro: new Map([['step|box|0:div.box|grow', 2], ['rest|anc|1:x|same', 1]]) } };
  return JSON.parse((0, eval)(read()));
};
const r1 = run(true);
const by = (r, prop, el = '0:div.box') => r.diff.list.find((d) => d.prop === prop && d.el === el);
ok(by(r1, 'p0')?.flip === true, 'p0 should flip');
ok(by(r1, 'p1')?.noise === true && by(r1, 'p1')?.flip === false, 'p1 should be noise, not flip');
ok(!by(r1, 'p2'), 'p2 should not be listed');
ok(by(r1, 'p3')?.flip === true, 'p3 flips when C and B2 exist (C = A, B2 = B)');
ok(by(r1, 'p4') && !by(r1, 'p4').flip && !by(r1, 'p4').flipPartial, 'p4 should be listed, not flip');
ok(r1.diff.nFlip === 2 && r1.diff.nNoise === 1 && r1.diff.nAny === 4, `run1 counts ${JSON.stringify([r1.diff.nFlip, r1.diff.nNoise, r1.diff.nAny])}`);
ok(r1.mo.stepBoxIn === 3 && r1.mo.restBoxIn === 2 && r1.mo.stepAnc === 1 && r1.mo.restAnc === 0, `mo tallies ${JSON.stringify(r1.mo)}`);
ok(r1.ro.step === 2 && r1.ro.rest === 1, 'ro tallies');
ok(Object.keys(r1.snaps).join() === 'A,A2,B,C,B2', 'snap order');
const r2 = run(false);
ok(by(r2, 'p3')?.flipPartial === true && by(r2, 'p0')?.flipPartial === true, 'without C/B2: partial');
ok(r2.diff.nFlip === 0, 'no full flip without C/B2');
ok(!JSON.stringify(r1).match(/"(cost|ms|time)"/), 'no time fields in the read');
try { new Function(install()); } catch (e) { fails.push('install parse: ' + e.message); }
ok(!/performance\.now|\.time\b/.test(install()), 'install records no time');
// reader: VALUE-FLIP on two runs with the full fixture; INSUFFICIENT without C
{
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const FX = new URL('../../out/toolbar-resize/selftest123/', import.meta.url).pathname;
  rmSync(FX, { recursive: true, force: true }); mkdirSync(FX, { recursive: true });
  const g = (r) => ({ run: { inject: [{ seg: 0, name: 'p123', value: { ...r, audit: { nBox: 1, nAnc: 1, nVuBox: 1, hits: [] } } }] } });
  writeFileSync(FX + 'g-R1.json', JSON.stringify(g(r1))); writeFileSync(FX + 'g-R2.json', JSON.stringify(g(r1))); writeFileSync(FX + 'g-R3.json', JSON.stringify(g(r2)));
  const rd = (...a) => JSON.parse(spawnSync('node', [new URL('./read-p123.mjs', import.meta.url).pathname, FX, ...a, '--json'], { encoding: 'utf8' }).stdout);
  const x = rd('R1', 'R2');
  ok(x.probe === 'VALUE-FLIP' && x.runs[0].nFlip === 2 && x.runs[0].ancFlips.length === 0, `reader R1 R2: ${x.probe} ${x.runs[0].nFlip}`);
  const y = rd('R3');
  ok(y.probe === 'INSUFFICIENT' && y.runs[0].why.includes('snapshot C missing'), `reader R3: ${y.probe} ${JSON.stringify(y.runs[0].why)}`);
}
console.log(fails.length ? `SELFTEST FAIL\n  ${fails.join('\n  ')}` : 'SELFTEST PASS (14 checks)');
process.exit(fails.length ? 1 : 0);

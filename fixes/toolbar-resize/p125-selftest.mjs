#!/usr/bin/env node
// toolbar-resize P-125 scorer self-test (before data). Fixture: P-119's Simulator runs (out/toolbar-resize/sim119,
// gitignored), re-labelled into P-125's shape in a temp folder: C-H1..H5 = P-119's C runs; wpx = cct-H1/H2 (in view
// unchanged in P-119 N1); wc1 = cva-H1/H2 (in view unchanged, off screen skipped). Synthetic parts: the write log, the
// promotion counts, the served-bytes records. Checks the gate, the noise band, the calls, the coincidence and the
// write-rate rule (ops' floor), and the frozen reading.
//   node fixes/toolbar-resize/p125-selftest.mjs [sim119 folder]     -> SELFTEST PASS (n checks) | SELFTEST FAIL
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { score, cpLower, rateRule, coincidence, band } from './score-p125.mjs';
const WT = new URL('../..', import.meta.url).pathname;
const SRC = process.argv[2] || join(WT, 'out/toolbar-resize/sim119');
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log(`FAIL ${m}`); } };
// pure rules
ok(Math.abs(cpLower(3, 10) - 0.0873) < 0.0005, `cpLower(3,10) = ${cpLower(3, 10)} (want 0.0873)`);
ok(cpLower(0, 10) === 0, 'cpLower(0,n) = 0');
ok(rateRule(3, 30, 7, 1260).linked === false, 'P-123-like key (3 step / 30, 7 rest / 1260) is not step-linked (floor s >= 8)');
ok(rateRule(12, 150, 37, 5500, 1).linked === true, 'one run, 12/150 vs 37/5500 is step-linked (RRlo >= 2)');
ok(rateRule(12, 150, 37, 5500, 5).linked === false, '5 pooled runs, 12 step records (P-123 level, 2-3 per run) is below the floor 20');
ok(rateRule(25, 150, 40, 5500, 5).linked === true, '5 pooled runs, 25 step records at RRlo >= 2 is step-linked');
ok(rateRule(10, 150, 300, 5500).linked === false, 'a key written every frame is not step-linked');
ok(coincidence(25, 3, 0.01).call === 'NO-LINK', 'coincidence: 3 carrying heavy frames is below the floor');
ok(coincidence(25, 25, 0.01).call === 'COVERS', 'coincidence: every heavy frame carries: COVERS');
ok(coincidence(25, 10, 0.02).call === 'LINKED-PART', 'coincidence: 10 of 25 over a 2 % base: LINKED-PART');
ok(coincidence(25, 5, 0.01, 5).call === 'NO-LINK', 'coincidence: 5 carrying frames over 5 pooled runs is below the floor 10');
ok(coincidence(25, 10, 0.3).call === 'NO-LINK', 'coincidence: 10 of 25 over a 30 % base: NO-LINK');
ok(coincidence(4, 4, 0).call === 'THIN', 'coincidence: < 5 heavy frames: THIN');
ok(band(0.95, 0.1) === 'NONE' && band(0.85, 0.1) === 'SMALL' && band(1.2, 0.1) === 'WORSE' && band(0.5, 0.1) === 'PARTIAL' && band(0.2, 0.1) === 'LOCATES', 'bands');
ok(band(0.75, 0.3) === 'NONE', 'a ratio inside a wide C noise band is NONE (no effect claimed)');
// fixture
const MAP = { 'C-H1': 'C-H1', 'wpx-H1': 'cct-H1', 'C-H2': 'C-H2', 'wc1-H1': 'cva-H1', 'C-H3': 'C-H3', 'wc1-H2': 'cva-H2', 'C-H4': 'C-H4', 'wpx-H2': 'cct-H2', 'C-H5': 'C-H5' };
const ORDER = Object.keys(MAP);
const served = { A: { css: { h: 'f836404b3728', source: 'overlay' }, js: { h: '3e3e94cb6e9f', source: 'overlay' }, port: 5301 }, B: { css: { h: 'f836404b3728', source: 'overlay' }, js: { h: '6a79036cc108', source: 'overlay' }, port: 5302 } };
const build = ({ writes = 'none', scaleWpx = 1, mutate = {} } = {}) => {
  const d = mkdtempSync(join(tmpdir(), 'p125st-'));
  const lines = [JSON.stringify({ served, injectSha: 'test' })];
  for (const name of ORDER) {
    const arm = name.replace(/-H\d+$/, ''), srv = arm === 'wpx' ? 'B' : 'A';
    const g = JSON.parse(readFileSync(join(SRC, `g-${MAP[name]}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(SRC, `tl-${MAP[name]}.json`), 'utf8'));
    let v = (g.run?.inject || g.inject || [])[0]?.value; if (typeof v === 'string') v = JSON.parse(v);
    const seg = [...g.run.segments].sort((a, b) => b.frames.length - a.frames.length)[0], ihs = seg.frames.map((x) => x[3]), lo = Math.min(...ihs), hi = Math.max(...ihs);
    const wr = [];
    if (writes === 'every-moving') for (const [t, dt, , ih] of seg.frames) if (ih > lo && ih < hi) wr.push([t - dt / 2, 0, 1, 0]);
    if (writes === 'few') { let k = 0; for (const [t, dt, , ih] of seg.frames) if (ih > lo && ih < hi && k++ < 2) wr.push([t - dt / 2, 0, 0, 0]); for (let i = 0; i < 8; i++) { const f = seg.frames[50 + i * 100]; if (f) wr.push([f[0] - f[1] / 2, 0, 1, 2]); } }
    const inj = { arm: arm === 'C' ? 'none' : arm, pin: arm === 'wc1', drops: arm === 'wc1' ? 4 : 0, pinnedAtInstall: arm === 'wc1' ? 3 : 0, installs: 1, ioInstalled: true, io: v.io, wr, ih0: 775, promo0: { n: 10, n0: arm === 'wc1' ? 0 : 3, willChange: arm === 'wc1' ? 10 : 7 }, promo1: { n: 10, n0: arm === 'wc1' ? 0 : 2, willChange: arm === 'wc1' ? 10 : 8 }, fwwc0AtRead: arm === 'wc1' ? 0 : 2, ...(mutate[name] || {}) };
    g.run.inject = [{ seg: 0, name: 'p125', value: JSON.stringify(inj) }];
    if (arm === 'wpx' && scaleWpx !== 1) { const sc = (r) => { if (r.type === 'Layout' && r.endTime != null) r.endTime = r.startTime + (r.endTime - r.startTime) * scaleWpx; (r.children || []).forEach(sc); }; (tl.recs || []).forEach(sc); }
    writeFileSync(join(d, `g-${name}.json`), JSON.stringify(g)); writeFileSync(join(d, `tl-${name}.json`), JSON.stringify(tl));
    lines.push(JSON.stringify({ step: name.replace('-', ':'), name, server: mutate[name]?.__server || srv, port: served[srv].port, jsWant: served[mutate[name]?.__server || srv].js.h }));
  }
  writeFileSync(join(d, 'runs.jsonl'), lines.join('\n') + '\n');
  return d;
};
const run = (opts) => { const d = build(opts); try { return score(d, ORDER); } finally { rmSync(d, { recursive: true, force: true }); } };
// 1. as P-119: no arm changes the in-view frames
const A = run({ writes: 'few' });
ok(A.runs.every((r) => r.valid), `all fixture runs valid (${A.runs.filter((r) => !r.valid).map((r) => r.name + ': ' + r.why.join(',')).join(' | ')})`);
ok(!A.VOID && A.noise.medL >= 0.1 && A.noise.medL <= 0.3, `noise medL ${A.noise.medL} in [0.10, 0.30], not VOID`);
ok(A.arms.wpx.call === 'NONE', `wpx (cct data) in view NONE (got ${A.arms.wpx.call} ${A.arms.wpx.runs})`);
ok(A.arms.wc1.call === 'NONE', `wc1 (cva data) in view NONE (got ${A.arms.wc1.call} ${A.arms.wc1.runs})`);
ok(A.runs.filter((r) => r.arm === 'wc1').every((r) => r.offCall === 'LOCATES'), 'wc1 (cva data) off screen LOCATES (the skip, as P-119 N1)');
ok(A.armsCmp === 'ARMS-EQUAL', `arms equal within noise (${A.armsCmp})`);
ok(A.coincidenceC === 'NO-LINK', `2 step writes per run do not link (${JSON.stringify(A.byArm.C.fwwc.coincidence)})`);
ok(A.byArm.C.fwwc.rate.linked === false && A.byArm.C.fwwc.rate.s === 10, `pooled C rate: 2 step writes x 5 runs = 10 is below the floor 20, not step-linked (${JSON.stringify(A.byArm.C.fwwc.rate)})`);
ok(A.reading === 'NOT-THE-WINDOW', `reading NOT-THE-WINDOW (got ${A.reading})`);
ok(A.runs.every((r) => r.in && r.in.n >= 3), 'every run has >= 3 in-view step frames');
// 2. wpx removes 80 % of every Layout, every moving frame carries a write in C: WINDOW-TRIGGER
const B = run({ writes: 'every-moving', scaleWpx: 0.2 });
ok(B.arms.wpx.call === 'LOCATES', `scaled wpx LOCATES (got ${B.arms.wpx.call})`);
ok(B.coincidenceC === 'COVERS', `writes in every moving frame: COVERS (got ${B.coincidenceC})`);
ok(B.byArm.C.fwwc.rate.linked === true, 'writes only in moving frames: step-linked');
ok(B.reading === 'WINDOW-TRIGGER', `reading WINDOW-TRIGGER (got ${B.reading})`);
ok(B.armsCmp === 'ARMS-DIFFER', 'arms differ');
// 3. wpx effect without coincidence is not read as the window
const B2 = run({ writes: 'few', scaleWpx: 0.2 });
ok(B2.reading === 'UNCLEAR (wpx effect without coincidence)', `wpx effect, NO-LINK: UNCLEAR (got ${B2.reading})`);
// 4. gate
const G = run({ writes: 'few', mutate: { 'wpx-H1': { promo0: { n: 10, n0: 0, willChange: 10 } }, 'wc1-H2': { fwwc0AtRead: 1 }, 'wpx-H2': { __server: 'A' }, 'C-H3': { drops: 2 } } });
const gv = Object.fromEntries(G.runs.map((r) => [r.name, r.valid]));
ok(gv['wpx-H1'] === false, 'gate: wpx promotion at rest differs from C: INSUFFICIENT');
ok(gv['wc1-H2'] === false, 'gate: wc1 not pinned at read: INSUFFICIENT');
ok(gv['wpx-H2'] === false, 'gate: wpx served from server A: INSUFFICIENT');
ok(gv['C-H3'] === false, 'gate: drops in C: INSUFFICIENT');
ok(G.arms.wpx.call === 'INSUFFICIENT' && G.arms.wc1.call === 'INSUFFICIENT', 'an INSUFFICIENT replicate makes the arm INSUFFICIENT (never NONE)');
ok(G.reading === 'UNCLEAR (no arm call)', `no arm call: UNCLEAR (got ${G.reading})`);
const G2 = run({ writes: 'few', mutate: { 'wpx-H1': { ih0: 815 } } });
ok(G2.runs.find((r) => r.name === 'wpx-H1').valid === false, 'gate: wpx at ih0 815: INSUFFICIENT');
console.log(bad ? `SELFTEST FAIL (${bad} of ${n})` : `SELFTEST PASS (${n} checks)`);
process.exit(bad ? 1 : 0);

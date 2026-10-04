#!/usr/bin/env node
// Self-test for score-p119.mjs (P-119 ticket, roles v3 R3): builds a fixture folder from P-115's runs (P-115 has no IO
// log) with a synthetic IntersectionObserver log per run, two enter events placed exactly on known RenderingFrame
// starts (one down: top > 0, one up: top < 0), and checks the scorer's plumbing against values computed here:
// event count and direction, exact update match (approx false), window max Layout / Paint over updates E-1..E+2,
// catch-up k, the run medians, and that the primary block equals score-bisect's own output.
//   node fixes/toolbar-resize/p119-selftest.mjs [<P-115 folder>]   (default out/toolbar-resize/sim115) -> SELFTEST PASS|FAIL
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const WT = new URL('../..', import.meta.url).pathname, HERE = new URL('.', import.meta.url).pathname;
const SRC = process.argv[2] || join(WT, 'out/toolbar-resize/sim115'), FX = join(WT, 'out/toolbar-resize/selftest119');
const NAMES = ['C-H1', 'csl-H1', 'C-H2', 'cva-H1', 'C-H3'];
rmSync(FX, { recursive: true, force: true }); mkdirSync(FX, { recursive: true });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const expect = {};
for (const n of NAMES) {
  copyFileSync(join(SRC, `tl-${n}.json`), join(FX, `tl-${n}.json`));
  const g = JSON.parse(readFileSync(join(SRC, `g-${n}.json`), 'utf8')), tl = JSON.parse(readFileSync(join(FX, `tl-${n}.json`), 'utf8'));
  const big = (r, type) => { let m = 0; const w = (x) => { if (x.type === type && x.endTime != null) m = Math.max(m, (x.endTime - x.startTime) * 1000); (x.children || []).forEach(w); }; w(r); return m; };
  const ups = tl.recs.filter((r) => r.type === 'RenderingFrame' && r.endTime != null).map((r) => ({ s: r.startTime * 1000 - tl.offsetMs, L: big(r, 'Layout'), P: big(r, 'Paint') })).sort((a, b) => a.s - b.s);
  const seg = [...g.run.segments].sort((a, b) => b.frames.length - a.frames.length)[0];
  const inSpan = ups.map((u, k) => k).filter((k) => ups[k].s > seg.frames[0][0] + 50 && ups[k].s < seg.frames.at(-1)[0] - 50 && k > 0 && k < ups.length - 3);
  const k1 = inSpan[Math.floor(inSpan.length * 0.3)], k2 = inSpan[Math.floor(inSpan.length * 0.7)];
  const r2 = (x) => Math.round(x * 100) / 100;
  const io = [[r2(seg.frames[0][0] - 10), 0, 900, 1800, 775], [r2(ups[k1].s), 1, 700, 1600, 815], [r2(ups[k1].s + 300), 0, -950, -50, 815], [r2(ups[k2].s), 1, -800, 100, 775]];
  const v = g.run.inject[0].value; v.io = io; v.ioInstalled = true; v.measured = { ...(v.measured || {}), showcaseTop0: 1200, ih0: 775 };
  writeFileSync(join(FX, `g-${n}.json`), JSON.stringify(g));
  const ev = [k1, k2].map((E, i) => { const w = ups.slice(E - 1, E + 3); let c = null; for (let j = 0; j <= 2; j++) if (ups[E + j].L >= 5) { c = j; break; } return { dir: i ? 'up' : 'down', maxL: Math.round(Math.max(...w.map((u) => u.L)) * 1000) / 1000, maxP: Math.round(Math.max(...w.map((u) => u.P)) * 1000) / 1000, catchUp: c }; });
  expect[n] = ev;
}
const out = join(FX, 'score.json');
const r = spawnSync('node', [join(HERE, 'score-p119.mjs'), FX, ...NAMES, '--json', out], { encoding: 'utf8' });
ok(r.status === 0, `scorer exit ${r.status}: ${r.stderr}`);
if (r.status === 0) {
  const s = JSON.parse(readFileSync(out, 'utf8'));
  const ref = spawnSync('node', [join(HERE, 'score-bisect.mjs'), SRC, ...NAMES, '--json', join(FX, 'ref.json')], { encoding: 'utf8' });
  const refj = JSON.parse(readFileSync(join(FX, 'ref.json'), 'utf8'));
  ok(JSON.stringify(refj.verdicts) === JSON.stringify(s.primary.verdicts), 'primary verdicts differ from score-bisect on the source runs');
  for (const n of NAMES) {
    const run = s.runs.find((x) => x.name === n), e = run.enter, x = expect[n];
    ok(e.n === 2 && e.nDown === 1 && e.nUp === 1, `${n}: events ${e.n} down ${e.nDown} up ${e.nUp}`);
    e.events.forEach((ev, i) => {
      ok(!ev.approx, `${n} event ${i}: approx update match`);
      ok(ev.dir === x[i].dir, `${n} event ${i}: dir ${ev.dir} want ${x[i].dir}`);
      ok(ev.maxL === x[i].maxL && ev.maxP === x[i].maxP, `${n} event ${i}: max L/P ${ev.maxL}/${ev.maxP} want ${x[i].maxL}/${x[i].maxP}`);
      ok(ev.catchUp === x[i].catchUp, `${n} event ${i}: catch-up ${ev.catchUp} want ${x[i].catchUp}`);
    });
    const med = (a) => (a[0] + a[1]) / 2;
    ok(Math.abs(e.enterL - med(x.map((q) => q.maxL))) < 0.002, `${n}: enterL ${e.enterL}`);
    ok(run.gapAtTop === 425, `${n}: gapAtTop ${run.gapAtTop}`);
  }
  for (const n of ['csl-H1', 'cva-H1']) ok(/^ENTER-(OK|COST|UNCLEAR)$/.test(s.calls[n].enter), `${n}: enter call ${s.calls[n].enter}`);
}
console.log(fails.length ? `SELFTEST FAIL\n  ${fails.join('\n  ')}` : `SELFTEST PASS (${NAMES.length} runs, 2 synthetic enter events each)`);
process.exit(fails.length ? 1 : 0);

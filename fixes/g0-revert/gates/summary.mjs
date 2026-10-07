// g0.0 gate summary: reads the g0px.mjs / g0sim.mjs / g0count.mjs outputs and prints one markdown table per gate;
// with --write <results.json> also stores the numbers. No browser, no lock.
//   node fixes/g0-revert/gates/summary.mjs out/g0/gates out/g0 [--write fixes/g0-revert/results.json]
//   SIMPREFIX=simb- GATESKEY=gatesB node fixes/g0-revert/gates/summary.mjs out/g0/gates-b out/g0 [--write …]   (g0.0b,
//   PR-034 rev 2: stored under results.json gatesB; the Simulator counts are g0.0's, not re-run, so left out)
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [gdir, simRoot] = process.argv.slice(2);
// the Simulator runs are the <simRoot>/<prefix>*/ dirs (default sim-; g0.0b's are simb-)
const SIMP = process.env.SIMPREFIX || 'sim-';
const wi = process.argv.indexOf('--write');
const out = { chrome: [], sim: [], counts: null };
const list = (d) => (existsSync(d) ? readdirSync(d) : []);
// state parity: m, classes, scrollY, #platform fade, panel aria/scene/inert, gap; the Join by its box (width, x) to
// 0.01 px (computed-value strings differ in the 6th digit under R4b's registered --morph)
// #platform's inline --morph-fade: unset ('') computes to 1, the registered initial value (@property, R4b, CSS 1608-1612),
// so '' and '1' are the same state (v14 writes '1' at load, v0 and g0.0 only once the morph moves)
const fadeN = (v) => (v === '' || v === null || v === undefined ? '1' : String(v));
const stateSame = (a, b) => {
  const k = ['m', 'cls', 'y', 'pe'].filter((x) => a[x] !== b[x]);
  if (fadeN(a.fade) !== fadeN(b.fade)) k.push('fade'); // pfPaused: v14's kept [platform-fade c] attribute (v0 has none)
  if (JSON.stringify(a.panel) !== JSON.stringify(b.panel)) k.push('panel');
  if (a.gap !== undefined && Math.abs(parseFloat(a.gap) - parseFloat(b.gap)) > 0.01) k.push('gap');
  if (a.join && b.join && (Math.abs(a.join.w - b.join.w) > 0.01 || Math.abs(a.join.x - b.join.x) > 0.01)) k.push('join');
  return k;
};
for (const sub of list(gdir)) {
  const d = join(gdir, sub);
  if (!statSync(d).isDirectory()) continue;
  for (const f of list(d).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(d, f), 'utf8'));
    const pairs = [...new Set(r.diffs.map((x) => x.pair))];
    for (const p of pairs) {
      const D = r.diffs.filter((x) => x.pair === p);
      const [an, bn] = p.split('~');
      const states = D.map((x) => { const a = r.stops[an]?.find((s) => s.stop === x.stop), b = r.stops[bn]?.find((s) => s.stop === x.stop); return a && b ? stateSame(a, b) : ['?']; });
      out.chrome.push({
        run: sub, viewport: r.viewport, phase: r.phase, reduce: r.reduce, pair: p, stops: D.length,
        t0Stops: D.filter((x) => x.diff === 0).length, t0UnmaskedStops: D.filter((x) => x.unmasked === 0).length,
        maxShade: Math.max(...D.map((x) => x.max)), maxShadeUnmasked: Math.max(...D.map((x) => x.unmaskedMax ?? x.max)),
        maxOver8Unmasked: Math.max(...D.map((x) => x.unmaskedOver8 ?? 0)), maxOver8Pct: Math.max(...D.map((x) => x.over8Pct ?? 0)),
        maskedDiffMax: Math.max(...D.map((x) => x.masked ?? 0)), navMax: Math.max(...D.map((x) => x.nav ?? 0)), platformUnmaskedMax: Math.max(...D.map((x) => x.plat ?? 0)),
        stateMismatch: states.filter((s) => s.length).length,
        // page height (scrollHeight - innerHeight) per side: g0.0 must equal v0 at the end (no .fw-ms-end spacer)
        maxScroll: [...new Set(D.map((x) => `${r.stops[an]?.find((s) => s.stop === x.stop)?.max}/${r.stops[bn]?.find((s) => s.stop === x.stop)?.max}`))].join(' '), stateKeys: [...new Set(states.flat())],
        worst: D.slice().sort((a, b) => (b.unmaskedMax ?? b.max) - (a.unmaskedMax ?? a.max))[0]?.stop,
        logs: (r.loads || []).filter((l) => l.logs || l.pageLog).map((l) => ({ name: l.name, n: (l.logs?.length || 0) + (l.pageLog?.length || 0), hydrate: l.hydrateMsgs?.length || 0 })),
      });
    }
  }
}
for (const sub of list(simRoot).filter((x) => x.startsWith(SIMP) && statSync(join(simRoot, x)).isDirectory())) {
  for (const ph of list(join(simRoot, sub))) {
    const f = join(simRoot, sub, ph, 'g0sim.json');
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, 'utf8'));
    for (const p of [...new Set(r.diffs.map((x) => x.pair))]) {
      const D = r.diffs.filter((x) => x.pair === p);
      out.sim.push({ run: sub, phase: r.phase, pair: p, stops: D.length, t0Stops: D.filter((x) => x.diff === 0).length,
        maxShade: Math.max(...D.map((x) => x.max)), maxShadeUnmasked: Math.max(...D.map((x) => x.unmaskedMax ?? x.max)),
        maxOver8Unmasked: Math.max(...D.map((x) => x.unmaskedOver8 ?? 0)),
        // the Join compares by its width (the opacity string differs in the 6th digit under R4b)
        stateKeys: [...new Set(D.flatMap((x) => { const [an, bn] = p.split('~'), fa = r.runs.find((q) => q.name === an)?.frames.find((q) => q.stop === x.stop), fb = r.runs.find((q) => q.name === bn)?.frames.find((q) => q.stop === x.stop);
          return Object.entries(x.same).filter(([k, v]) => !v && !(k === 'join' && fa && fb && fa.state.join.split(' ')[0] === fb.state.join.split(' ')[0]) && !(k === 'fade' && fa && fb && fadeN(fa.state.fade) === fadeN(fb.state.fade))).map(([k]) => k); }))],
        errors: r.runs.filter((x) => x.error || x.void).map((x) => x.name) });
    }
  }
}
const cf = join(simRoot, 'sim-counts', 'counts.json');
if (SIMP === 'sim-' && existsSync(cf)) out.counts = JSON.parse(readFileSync(cf, 'utf8')).loads.map((l) => ({ arm: l.arm, void: l.void, windows: (l.windows || []).map((w) => ({ stop: w.stop, RF: w.renderingFrames, RS: w.styleRecalcs, L: w.layouts, P: w.paints, C: w.composites, FC: w.functionCalls, perFrame: { RS: w.styleRecalcsPerFrame, L: w.layoutsPerFrame, P: w.paintsPerFrame }, m: w.state?.m })) }));
const t = (rows, cols) => ['| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + cols.map((c) => (typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])).join(' | ') + ' |')].join('\n');
console.log('## Chrome\n' + t(out.chrome, ['run', 'viewport', 'phase', 'reduce', 'pair', 'stops', 't0Stops', 't0UnmaskedStops', 'maxShadeUnmasked', 'maxOver8Unmasked', 'maxOver8Pct', 'navMax', 'platformUnmaskedMax', 'maskedDiffMax', 'stateMismatch', 'stateKeys', 'maxScroll', 'worst']));
console.log('\n## Simulator\n' + t(out.sim, ['run', 'phase', 'pair', 'stops', 't0Stops', 'maxShade', 'maxShadeUnmasked', 'maxOver8Unmasked', 'stateKeys', 'errors']));
if (out.counts) for (const l of out.counts) console.log(`\n${l.arm}${l.void ? ' VOID ' + l.void : ''}\n` + t(l.windows, ['stop', 'RF', 'RS', 'L', 'P', 'C', 'FC', 'perFrame', 'm']));
if (wi > 0) {
  const res = JSON.parse(existsSync(process.argv[wi + 1]) ? readFileSync(process.argv[wi + 1], 'utf8') : '{}');
  res[process.env.GATESKEY || 'gates'] = out; writeFileSync(process.argv[wi + 1], JSON.stringify(res, null, 1) + '\n');
}

// Identity checks of the best build (no browser, no timing). Run after build.mjs and `fix.mjs diff best-build`.
//   node fixes/best-build/check.mjs     # one line per check, exit 1 on any failure; details in out/best-build/check.json
// Checks:
//   1. the overlay on disk = the build (hashes) = BUILD_EXPECT; patch.diff applied to the baseline = the build
//   2. per component: the build with every OTHER component's delta reversed is byte-identical to that component's own
//      build (so wherever the others don't touch, the build is that fix's build); all deltas reversed = st6-rb2
//   3. the same, a second way, line by line: the lines diff(component, build) adds and removes are exactly the other
//      components' delta lines (as multisets), nothing else
//   4. node --check on the JS (ES module)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WT, JS, CSS, FILES, BUILD_EXPECT, build, sha, parseDiff, applyHunks, udiff } from './build.mjs';

const { st6, baseline, comps, tree, result } = build({ work: join(WT, 'out/best-build/work-check'), quiet: true });
const out = []; let bad = 0;
const rec = (ok, name, detail) => { out.push({ ok, name, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) bad++; };

// 1
const ov = join(WT, 'fixes/best-build/overlay');
for (const f of FILES) {
  const p = join(ov, f), disk = existsSync(p) ? readFileSync(p, 'utf8') : baseline[f];
  rec(disk === tree[f], `overlay ${f} = build`, `${sha(disk)}`);
  if (BUILD_EXPECT) rec(sha(tree[f]) === BUILD_EXPECT[f], `build ${f} = pinned BUILD_EXPECT`, `${sha(tree[f])} vs ${BUILD_EXPECT[f]}`);
}
const pd = join(WT, 'fixes/best-build/patch.diff');
if (existsSync(pd)) {
  const d = parseDiff(readFileSync(pd, 'utf8'));
  for (const f of FILES) { const r = d[f] ? applyHunks(baseline[f], d[f]) : { text: baseline[f] }; rec(!r.error && r.text === tree[f], `patch.diff on the baseline: ${f} = build`, r.error || sha(r.text)); }
} else rec(false, 'patch.diff exists (run: node tools/fix.mjs diff best-build)');

// 2
const unapply = (t, list) => { const o = { ...t }; for (const c of [...list].reverse()) for (const f of Object.keys(c.delta)) { const r = applyHunks(o[f], c.delta[f], { reverse: true }); if (r.error) return { error: `${c.name} ${f}: ${r.error}` }; o[f] = r.text; } return o; };
for (const c of comps) {
  const others = comps.filter((x) => x !== c), r = unapply(tree, others);
  for (const f of FILES) rec(!r.error && r[f] === c.own[f], `build minus {${others.map((x) => x.name).join(', ')}} = ${c.name}'s own build: ${f.split('/').pop()}`, r.error || `${sha(r[f])} (own ${sha(c.own[f])})`);
}
{ const r = unapply(tree, comps); for (const f of FILES) rec(!r.error && r[f] === st6[f], `build minus every delta = st6-rb2: ${f.split('/').pop()}`, r.error || sha(r[f])); }

// 3
const ms = (hunks, op) => { const m = new Map(); for (const h of hunks || []) for (const [o, t] of h.body) if (o === op) m.set(t, (m.get(t) || 0) + 1); return m; };
const sameMs = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const merge = (ms1) => { const m = new Map(); for (const x of ms1) for (const [k, v] of x) m.set(k, (m.get(k) || 0) + v); return m; };
for (const c of comps) for (const f of FILES) {
  const t = udiff(c.own[f], tree[f], `own/${f}`, `build/${f}`, join(WT, 'out/best-build')); const hs = t ? parseDiff(t)[f] : [];
  const others = comps.filter((x) => x !== c);
  const ok = sameMs(ms(hs, '+'), merge(others.map((o) => ms(o.delta[f], '+')))) && sameMs(ms(hs, '-'), merge(others.map((o) => ms(o.delta[f], '-'))));
  rec(ok, `diff(${c.name} own, build) lines = the other deltas' lines: ${f.split('/').pop()}`, `${hs.length} hunk(s)`);
}

// 4
try { execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: tree[JS], stdio: ['pipe', 'ignore', 'pipe'] }); rec(true, 'node --check (module) on the build JS'); }
catch (e) { rec(false, 'node --check (module) on the build JS', String(e.stderr).split('\n')[0]); }

writeFileSync(join(WT, 'out/best-build/check.json'), JSON.stringify({ result, checks: out }, null, 2) + '\n');
console.log(bad ? `\n${bad} check(s) FAILED` : `\nall ${out.length} checks ok; build js ${result.build[JS]} css ${result.build[CSS]}`);
process.exit(bad ? 1 : 0);

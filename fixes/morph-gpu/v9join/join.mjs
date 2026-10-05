#!/usr/bin/env node
// morph-close-peak (fix-morph-gpu): join the close rule (v9 #6, fixes/morph-gpu/close/delta.diff, a delta on v8) onto a
// v9 step-4 base, mechanically, and stage a pixel snapshot for fixes/v9-best/gates (A = the base, V = base + close).
// Lead's instruction (2026-10-05): pre-stage the join on both possible step-4 bases, A = v9 step 4 as built (rev 7c,
// fixes/v9-best/patch.diff on main) and B = v9 + rev 7d (fix-hero-exit-threaded's build); mechanical conflicts only.
// Checks (refuse, exit 3, nothing written, on any failure):
//   - v8 = fixes/v8-best/patch.diff on the baseline (3e3e94cb6e9f / f836404b3728); the close delta has its pinned sha;
//   - the base = its baseline-relative patch on the baseline, with the expected hashes (--expect js12/css12);
//   - V = base + close, strict applier (exact context, no fuzz; offsets reported);
//   - order: v8 + close, then (base - v8) as a diff, gives the same bytes as V (the close commutes with the base's changes);
//   - V - close (reverse) = base; V changes exactly the close delta's +/- lines relative to the base; node --check on V's JS.
// Writes (unless --dry): out/morph-gpu/v9join/snap-<arm>-<css12>/{A,V}/ read-only + HASHES.txt (the layout
// fixes/v9-best/gates/px-chrome.mjs and px-sim.mjs read through V9_SNAP), fixes/morph-gpu/v9join/close-on-<arm>.diff
// (the close re-based on the base, for the integrator), out/morph-gpu/v9join/<arm>.json.
//   node fixes/morph-gpu/v9join/join.mjs --arm A --base fixes/v9-best/patch.diff --expect de237379b556/e1359ab9994a [--rev <sha>] [--dry]
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JS, CSS, FILES, sha, parseDiff, applyHunks, udiff } from '../../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const ARM = arg('--arm'), BASE = arg('--base'), REV = arg('--rev'), EXPECT = arg('--expect'), DRY = argv.includes('--dry');
if (!ARM || !BASE || !EXPECT) { console.error('usage: --arm <name> --base <baseline-relative patch> --expect js12/css12 [--rev <sha>] [--dry]'); process.exit(2); }
const CLOSE = 'fixes/morph-gpu/close/delta.diff', CLOSE_SHA = '60eba2d73b68';

const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(3); };
const checks = [];
const ok = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) die(`${name}${detail ? '  ' + detail : ''}`); console.log(`ok  ${name}${detail ? '  ' + detail : ''}`); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const fmt = (t) => { const h = H(t); return `${h[JS]} / ${h[CSS]}`; };
const full = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => FILES.every((f) => a[f] === b[f]);
const apply = (d, start, name, reverse = false) => {
  d = typeof d === 'string' ? parseDiff(d) : d; const out = { ...start }; const offs = [];
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`);
    out[f] = r.text; offs.push(...r.offsets.filter((o) => o));
  }
  return { t: out, offs };
};
const rd = (p) => readFileSync(join(WT, p), 'utf8');
const show = (rev, p) => { const r = spawnSync('git', ['-C', WT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) die(`git show ${rev}:${p}: ${r.stderr.trim()}`); return r.stdout; };
const lineSet = (d) => { const m = new Map(); for (const hs of Object.values(d)) for (const h of hs) for (const [op, t] of h.body) if (op !== ' ') m.set(op + t, (m.get(op + t) || 0) + 1); return m; };
const sameSet = (a, b) => [...new Set([...a.keys(), ...b.keys()])].every((k) => (a.get(k) || 0) === (b.get(k) || 0));

const baseDir = resolveTree('site-pretty');
const site = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
const v8 = apply(rd('fixes/v8-best/patch.diff'), site, 'v8').t;
ok('v8 = fixes/v8-best/patch.diff on the baseline', H(v8)[JS] === '3e3e94cb6e9f' && H(v8)[CSS] === 'f836404b3728', fmt(v8));
const closeText = rd(CLOSE);
ok(`close delta ${CLOSE}`, sha(closeText) === CLOSE_SHA, sha(closeText));
const close = parseDiff(closeText);

const baseText = REV ? show(REV, BASE) : rd(BASE);
const X = apply(baseText, site, `base ${BASE}`).t;
const [ej, ec] = EXPECT.split('/');
ok(`base ${BASE}${REV ? ` @${REV.slice(0, 12)}` : ''} (patch ${sha(baseText)}) on the baseline = ${EXPECT}`, H(X)[JS] === ej && H(X)[CSS] === ec, fmt(X));

const v = apply(close, X, 'close on base'); const V = v.t;
ok('V = base + close (strict, exact context)', true, `${fmt(V)}${v.offs.length ? `  offsets ${v.offs.join(',')}` : '  no offsets'}`);
const work = join(WT, 'out/morph-gpu/v9join/work'); mkdirSync(work, { recursive: true });
let baseOnV8 = ''; for (const f of FILES) baseOnV8 += udiff(v8[f], X[f], `a/${f}`, `b/${f}`, work);
const v8c = apply(close, v8, 'close on v8').t;
const viaV8 = apply(baseOnV8, v8c, 'base-v8 on v8+close').t;
ok('order: v8 + close + (base - v8) = base + close', same(viaV8, V), fmt(viaV8));
ok('V - close (reverse) = base', same(apply(close, V, 'V - close', true).t, X));
let rebased = ''; for (const f of FILES) rebased += udiff(X[f], V[f], `a/${f}`, `b/${f}`, work);
ok('V - base changes exactly the close delta\'s lines', sameSet(lineSet(parseDiff(rebased)), lineSet(close)), `close-on-${ARM}.diff ${sha(rebased)}`);
writeFileSync(join(work, 'v.mjs'), V[JS]);
const nc = spawnSync(process.execPath, ['--check', join(work, 'v.mjs')], { encoding: 'utf8' });
ok('node --check (ES module) on V\'s JS', nc.status === 0, nc.stderr.trim());
let patch = ''; for (const f of FILES) patch += udiff(site[f], V[f], `a/${f}`, `b/${f}`, work);
ok('baseline-relative patch (baseline -> V) reproduces V', same(apply(patch, site, 'patch').t, V), `patch ${sha(patch)}`);

const lines = [];
for (const [a, t] of Object.entries({ A: X, V })) for (const f of FILES) lines.push(`${full(t[f])}  ${a}/${f}`);
console.log(lines.join('\n'));
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
const snapRel = `out/morph-gpu/v9join/snap-${ARM}-${H(V)[CSS]}`, snap = join(WT, snapRel);
if (existsSync(snap)) console.log(`${snapRel} exists: kept (immutable; HASHES checked below)`);
else {
  for (const [a, t] of Object.entries({ A: X, V })) for (const f of FILES) { const p = join(snap, a, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t[f]); chmodSync(p, 0o444); }
  writeFileSync(join(snap, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(snap, 'HASHES.txt'), 0o444);
}
const hs = spawnSync('shasum', ['-a', '256', '-c', '--quiet', 'HASHES.txt'], { cwd: snap, encoding: 'utf8' });
ok(`snapshot ${snapRel} matches HASHES.txt`, hs.status === 0, hs.stdout.trim());
writeFileSync(join(WT, `fixes/morph-gpu/v9join/close-on-${ARM}.diff`), rebased);
writeFileSync(join(WT, `out/morph-gpu/v9join/${ARM}.json`), JSON.stringify({ arm: ARM, base: { patch: BASE, rev: REV, patchSha: sha(baseText), hashes: H(X), full: { [JS]: full(X[JS]), [CSS]: full(X[CSS]) } }, close: { delta: CLOSE, sha: CLOSE_SHA }, v: H(V), vfull: { [JS]: full(V[JS]), [CSS]: full(V[CSS]) }, rebased: sha(rebased), patch: sha(patch), snap: snapRel, checks }, null, 2) + '\n');
console.log(`wrote ${snapRel}, fixes/morph-gpu/v9join/close-on-${ARM}.diff (${sha(rebased)}), out/morph-gpu/v9join/${ARM}.json`);

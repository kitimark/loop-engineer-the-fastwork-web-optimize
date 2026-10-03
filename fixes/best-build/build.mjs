// best-build (wi-best-build, user T-046): every fix landed on main, combined into ONE baseline-relative build.
//
// The landed fixes are all built on st6-rb2, and each one's patch.diff is against the baseline, so each carries all of
// st6-rb2. They can't be stacked as they are (fix.mjs combine would apply st6-rb2 twice). This script:
//   1. builds st6-rb2 = baseline + fixes/st6-rb2/patch.diff, and each component = baseline + its own patch.diff (or
//      st6-rb2 + its delta file), and checks every one against the hashes its owner measured (EXPECT);
//   2. derives each component's delta against st6-rb2 (diff -u st6-rb2 component);
//   3. refuses (exit 1, CONFLICT) when two deltas touch the same st6-rb2 lines, or lines within CONTEXT of each other
//      (they would share diff context: not mechanical, report it, don't resolve it here);
//   4. applies the deltas to st6-rb2 in COMPONENTS order with a strict applier (exact context, no fuzz; a shifted
//      hunk is fine and reported as an offset), then again in reverse order, and requires the same bytes;
//   5. checks the result against BUILD_EXPECT (when set) and writes it.
//
//   node fixes/best-build/build.mjs                     # writes fixes/best-build/overlay/ (gitignored) + out/best-build/build.json
//   node fixes/best-build/build.mjs --out <dir>         # writes the two files under <dir> instead (e.g. a snapshot copy)
//   node fixes/best-build/build.mjs --snapshot          # also out/snapshots/best-<js12>/ (read-only copy, for serving as an A side)
//   node fixes/best-build/build.mjs --no-expect         # print the hashes, don't compare with BUILD_EXPECT (after a component change)
//
// To add a fix (e.g. cd-strip once it lands): add ONE line to COMPONENTS below with its patch (or delta) and the hashes
// its owner measured, run with --no-expect, run fixes/best-build/check.mjs, then pin the new BUILD_EXPECT.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
export const JS = '_app/immutable/nodes/2.DyWL8TcE.js';
export const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
export const FILES = [JS, CSS];

// The base every component is built on. Its patch.diff is against the baseline.
export const BASE = { name: 'st6-rb2', patch: 'fixes/st6-rb2/patch.diff', expect: { [JS]: '7bf7c4657d21', [CSS]: 'f523598b2a24' } };
// Components in apply order. `patch`: against the baseline, built on st6-rb2 (carries st6-rb2). `delta`: against st6-rb2.
// `expect`: sha256/12 of the component's own build as its owner measured it (README of the fix).
export const COMPONENTS = [
  { name: 'platform-idle', patch: 'fixes/platform-idle/patch.diff', expect: { [JS]: 'de29ff8aa622', [CSS]: 'e0f92804c521' } },
  { name: 'morph-inherit', patch: 'fixes/morph-inherit/patch.diff', expect: { [JS]: '7c61fe7d0662', [CSS]: 'f523598b2a24' } },
  // { name: 'cd-strip', patch: 'fixes/cd-strip/patch.diff', expect: { [JS]: '…', [CSS]: '…' } },   // when it lands
];
// The combined build, pinned after check.mjs passed (README "Hashes"). null: not pinned.
export const BUILD_EXPECT = { [JS]: '65052c4a3902', [CSS]: 'e0f92804c521' };
const CONTEXT = 3; // two deltas closer than this many lines would share diff context

export const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const die = (m) => { console.error(m); process.exit(1); };

// ---- unified diffs -------------------------------------------------------------------------------------------------
/** Split text into lines that keep their '\n' (the last line may lack one). */
export const lines = (s) => s.match(/[^\n]*\n|[^\n]+$/g) || [];
/** Parse a (multi-file) unified diff: {file: [{oldStart, oldLen, newStart, newLen, body: [[op, text]]}]}. */
export function parseDiff(text) {
  const out = {}; let cur = null, h = null;
  const ls = text.split('\n'); if (ls.at(-1) === '') ls.pop();
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (l.startsWith('+++ ')) { const f = l.slice(4).replace(/\t.*$/, '').replace(/^[^/]+\//, ''); cur = out[f] ||= []; h = null; continue; }
    if (l.startsWith('--- ') && (ls[i + 1] || '').startsWith('+++ ')) { h = null; continue; }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (m) { h = { oldStart: +m[1], oldLen: m[2] === undefined ? 1 : +m[2], newStart: +m[3], newLen: m[4] === undefined ? 1 : +m[4], body: [] }; cur.push(h); continue; }
    if (!h) continue;
    if (l.startsWith('\\')) { const last = h.body.at(-1); if (last) last[2] = true; continue; } // "\ No newline at end of file"
    h.body.push([l[0], l.slice(1)]);
  }
  return out;
}
/** Apply hunks to text strictly: every context and removed line must match exactly (no fuzz). Returns {text, offsets}. */
export function applyHunks(text, hunks, { reverse = false } = {}) {
  const src = lines(text); const res = []; let pos = 0; const offsets = [];
  for (const h of hunks) {
    const want = [], put = [];
    for (const [op, t, noNl] of h.body) {
      const s = t + (noNl ? '' : '\n');
      if (op === ' ') { want.push(s); put.push(s); } else if (op === (reverse ? '+' : '-')) want.push(s); else if (op === (reverse ? '-' : '+')) put.push(s);
    }
    const at0 = (reverse ? h.newStart : h.oldStart) - (want.length ? 1 : 0);
    const fits = (at) => at >= pos && at + want.length <= src.length && want.every((w, k) => src[at + k] === w);
    let at = -1;
    for (let d = 0; d <= src.length; d++) { if (fits(at0 + d)) { at = at0 + d; break; } if (d && fits(at0 - d)) { at = at0 - d; break; } }
    if (at < 0) return { error: `hunk @@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@ does not apply (exact context)` };
    offsets.push(at - at0);
    res.push(...src.slice(pos, at), ...put); pos = at + want.length;
  }
  res.push(...src.slice(pos));
  return { text: res.join(''), offsets };
}
/** diff -u a b (texts) as a string ('' when equal). */
export function udiff(a, b, la, lb, dir) {
  const fa = join(dir, 'a.tmp'), fb = join(dir, 'b.tmp');
  writeFileSync(fa, a); writeFileSync(fb, b);
  const r = spawnSync('diff', ['-u', '--label', la, '--label', lb, fa, fb], { encoding: 'utf8', maxBuffer: 1 << 28 });
  rmSync(fa); rmSync(fb);
  if (r.status === 0) return ''; if (r.status !== 1) throw new Error(`diff failed: ${r.stderr}`);
  return r.stdout;
}
/** Changed st6-rb2 lines of a delta's hunks, as [first, last] old-side spans (an insertion is a 0-length span at its line). */
export function spans(hunks) {
  const out = [];
  for (const h of hunks) {
    let o = h.oldStart - (h.oldLen === 0 ? 0 : 1), start = null, end = null; // o: 0-based index of the next old line
    const flush = () => { if (start !== null) out.push([start, end]); start = end = null; };
    for (const [op] of h.body) {
      if (op === ' ') { flush(); o++; }
      else if (op === '-') { if (start === null) start = o; end = o; o++; }
      else if (op === '+') { if (start === null) { start = o; end = o - 1; } }
    }
    flush();
  }
  return out;
}

// ---- build ---------------------------------------------------------------------------------------------------------
export function build({ work = join(WT, 'out/best-build/work'), order = COMPONENTS, quiet = false } = {}) {
  const log = (...a) => quiet || console.log(...a);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  const baseDir = resolveTree('site-pretty');
  const baseline = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
  const fromPatch = (rel, start) => {
    const d = parseDiff(readFileSync(join(WT, rel), 'utf8')); const out = { ...start };
    for (const f of Object.keys(d)) {
      if (!FILES.includes(f)) die(`${rel}: touches ${f}, which this script does not know (add it to FILES)`);
      const r = applyHunks(out[f], d[f]); if (r.error) die(`${rel} ${f}: ${r.error}`);
      out[f] = r.text;
    }
    return out;
  };
  const checkExpect = (name, tree, expect) => {
    for (const f of FILES) { const h = sha(tree[f]); if (h !== expect[f]) die(`${name}: ${f} is ${h}, its owner measured ${expect[f]}: refused`); }
    log(`${name.padEnd(16)} js ${sha(tree[JS])}  css ${sha(tree[CSS])}  (= owner's hashes)`);
  };
  const st6 = fromPatch(BASE.patch, baseline);
  checkExpect(BASE.name, st6, BASE.expect);
  const comps = order.map((c) => {
    const own = c.patch ? fromPatch(c.patch, baseline) : fromPatch(c.delta, st6);
    checkExpect(c.name, own, c.expect);
    const delta = {}, text = [];
    for (const f of FILES) {
      const t = udiff(st6[f], own[f], `st6-rb2/${f}`, `${c.name}/${f}`, work);
      if (t) { delta[f] = parseDiff(t)[f]; text.push(t); }
    }
    if (!text.length) die(`${c.name}: no change against st6-rb2`);
    writeFileSync(join(work, `delta-${c.name}.diff`), text.join(''));
    return { ...c, own, delta, deltaText: text.join('') };
  });
  // conflicts: changed st6-rb2 lines of two components closer than CONTEXT lines
  const conflicts = [];
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) for (const f of FILES) {
    const a = spans(comps[i].delta[f] || []), b = spans(comps[j].delta[f] || []);
    for (const [a0, a1] of a) for (const [b0, b1] of b) {
      const gap = Math.max(b0 - a1, a0 - b1) - 1; // lines strictly between the two spans
      if (gap < CONTEXT) conflicts.push(`${comps[i].name} st6-rb2 ${f}:${a0 + 1}-${a1 + 1} vs ${comps[j].name} :${b0 + 1}-${b1 + 1} (${gap < 0 ? 'overlap' : gap + ' lines apart'})`);
    }
  }
  if (conflicts.length) { for (const c of conflicts) console.error(`CONFLICT ${c}`); die(`${conflicts.length} conflict(s): two fixes touch the same st6-rb2 lines; not resolved here, report it`); }
  const stack = (list) => {
    const out = { ...st6 }, offs = {};
    for (const c of list) for (const f of Object.keys(c.delta)) {
      const r = applyHunks(out[f], c.delta[f]); if (r.error) die(`CONFLICT ${c.name} ${f}: ${r.error}`);
      out[f] = r.text; (offs[c.name] ||= {})[f] = r.offsets;
    }
    return { tree: out, offs };
  };
  const fwd = stack(comps), rev = stack([...comps].reverse());
  for (const f of FILES) if (fwd.tree[f] !== rev.tree[f]) die(`order matters for ${f} (forward ${sha(fwd.tree[f])}, reverse ${sha(rev.tree[f])}): not mechanical, report it`);
  const result = {
    snapshot: JSON.parse(readFileSync(join(WT, 'baseline.json'), 'utf8')).id,
    baseline: Object.fromEntries(FILES.map((f) => [f, sha(baseline[f])])),
    base: { name: BASE.name, patch: BASE.patch, patchSha: sha(readFileSync(join(WT, BASE.patch))), files: Object.fromEntries(FILES.map((f) => [f, sha(st6[f])])) },
    components: comps.map((c) => ({
      name: c.name, source: c.patch || c.delta, sourceSha: sha(readFileSync(join(WT, c.patch || c.delta))), own: Object.fromEntries(FILES.map((f) => [f, sha(c.own[f])])),
      delta: { sha: sha(c.deltaText), files: Object.keys(c.delta), hunks: Object.fromEntries(Object.entries(c.delta).map(([f, hs]) => [f, hs.map((h) => `-${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen}`)])), offsetsWhenStacked: fwd.offs[c.name] },
    })),
    build: Object.fromEntries(FILES.map((f) => [f, sha(fwd.tree[f])])),
    reverseOrderSame: true,
  };
  return { st6, baseline, comps, tree: fwd.tree, result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const { tree, baseline, result } = build();
  for (const c of result.components) console.log(`delta ${c.name.padEnd(14)} ${c.delta.sha}  ${Object.entries(c.delta.hunks).map(([f, h]) => `${f.split('/').pop()}: ${h.length} hunk(s), offsets ${JSON.stringify(c.delta.offsetsWhenStacked[f])}`).join('; ')}`);
  console.log(`build            js ${result.build[JS]}  css ${result.build[CSS]}  (forward = reverse order)`);
  if (!argv.includes('--no-expect') && BUILD_EXPECT) for (const f of FILES) if (result.build[f] !== BUILD_EXPECT[f]) die(`build ${f} is ${result.build[f]}, pinned ${BUILD_EXPECT[f]}: refused (a component changed? rerun with --no-expect, check, re-pin)`);
  const outs = [opt('--out') || join(WT, 'fixes/best-build/overlay')];
  if (argv.includes('--snapshot')) outs.push(join(WT, 'out/snapshots', `best-${result.build[JS]}`));
  for (const dir of outs) {
    if (dir.includes('/out/snapshots/') && existsSync(join(dir, JS))) { console.log(`snapshot exists: ${dir}`); continue; }
    rmSync(dir, { recursive: true, force: true });
    for (const f of FILES) { if (tree[f] === baseline[f]) continue; mkdirSync(join(dir, dirname(f)), { recursive: true }); writeFileSync(join(dir, f), tree[f]); }
    if (dir.includes('/out/snapshots/')) for (const f of FILES) if (existsSync(join(dir, f))) chmodSync(join(dir, f), 0o444);
    console.log(`wrote ${dir}`);
  }
  mkdirSync(join(WT, 'out/best-build'), { recursive: true });
  writeFileSync(join(WT, 'out/best-build/build.json'), JSON.stringify(result, null, 2) + '\n');
  execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: tree[JS] }); // syntax (the bundle is an ES module)
  console.log('node --check: ok');
}

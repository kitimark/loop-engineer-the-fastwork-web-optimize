// P1b base snapshots without F1 (fix-end-morph-p1, lead 09:10Z: F1 is out; P-155 decides whether U2 ships).
// Builds immutable overlay snapshots (JS + CSS of node 2) under out/p1b/snap/<name>/ from committed inputs, with a
// strict applier (patch -F 0, every hunk must apply), and writes HASHES.txt. Read-only files (chmod a-w).
//   B1 (v9-final + U2):  C1 = v9-final + U2;  V1 = C1 + P1;  AB1 = V1 + P1b (a) + P1b (b)
//   B0 (plain v9-final): C0 = v9-final;       V0 = C0 + P1;  AB0 = V0 + P1b (a) + P1b (b, re-ported: the __rvArm call
//                        inserted after `e = t > 0 ? ... : 0;` in __msTick, whose trailing context in delta-js-on-a.diff
//                        is U2's comment block)
// Inputs: v9-final JS = out/em1/c-2.DyWL8TcE.js (647c9ef2b1e2, P1's build base); U2 = the v9-final -> P-153 C diff
// without F1's hunk (#platform visibility); P1 = fixes/end-morph-p1/delta.diff; P1b = fixes/end-morph-p1b-a/delta-*.diff,
// fixes/end-morph-p1b-ab/delta-*-on-a.diff. CSS: C's e1359ab9994a (v9-final's; F1 and U2 change no CSS), P1 and P1b on it.
//   node fixes/end-morph-p1/p1b/snap.mjs [--out out/p1b/snap]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const OUT = resolve(WT, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'out/p1b/snap');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const T = mkdtempSync(join(tmpdir(), 'p1bsnap-'));
const read = (p) => readFileSync(resolve(WT, p), 'utf8');
const want = (s, h, what) => { if (sha(s) !== h) throw new Error(`${what}: ${sha(s)} != ${h}`); return s; };
function apply(src, diffText, what) {
  const f = join(T, 'f'), d = join(T, 'd.diff'); writeFileSync(f, src); writeFileSync(d, diffText);
  try { execFileSync('patch', ['-s', '-F', '0', '--no-backup-if-mismatch', '-r', '-', f, d], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { throw new Error(`${what}: patch failed: ${e.stdout}${e.stderr}`); }
  return readFileSync(f, 'utf8');
}
// split a two-file diff (JS then CSS, as in delta.diff) into its JS / CSS parts
const part = (diff, which) => { const i = diff.search(/^--- .*assets\/2\.gBuqKVzi\.css/m); return which === 'js' ? (i < 0 ? diff : diff.slice(0, i)) : (i < 0 ? '' : diff.slice(i)); };
const V9F = want(read('out/em1/c-2.DyWL8TcE.js'), '647c9ef2b1e2', 'v9-final JS');
const CJS = want(read('out/p153/snap/C/' + NODE), 'a6426953727a', 'P-153 C JS');
const CSS0 = want(read('out/p153/snap/C/' + CSSF), 'e1359ab9994a', 'P-153 C CSS');
// U2 = v9-final -> C without F1's hunk
const full = (() => { const a = join(T, 'a.js'), b = join(T, 'b.js'); writeFileSync(a, V9F); writeFileSync(b, CJS); try { execFileSync('diff', ['-u', a, b]); return ''; } catch (e) { return String(e.stdout); } })();
const hunks = full.split(/^(?=@@ )/m); const head = hunks.shift();
const f1 = hunks.filter((h) => /perf\(end-morph F1\)/.test(h)); if (f1.length !== 1) throw new Error('F1 hunk not found once');
const U2 = head + hunks.filter((h) => !/perf\(end-morph F1\)/.test(h)).join('');
const P1 = read('fixes/end-morph-p1/delta.diff');
const Aj = read('fixes/end-morph-p1b-a/delta-js.diff'), Ac = read('fixes/end-morph-p1b-a/delta-css.diff');
const Bj = read('fixes/end-morph-p1b-ab/delta-js-on-a.diff'), Bc = read('fixes/end-morph-p1b-ab/delta-css-on-a.diff');
const cssV = apply(CSS0, part(P1, 'css'), 'P1 css'), cssA = apply(cssV, Ac, 'P1b (a) css'), cssAB = apply(cssA, Bc, 'P1b (b) css');
// the (b) __msTick hunk without U2: re-port by hand (the one hunk whose context is U2's)
const ARM = '        // P1b (b): arm the reveal from one end-track height above the end track (e >= -1), disarm above it\n        typeof __rvArm == `function` && __rvArm(e);\n';
const anchor = '          e = t > 0 ? (y - (document.documentElement.scrollHeight - window.innerHeight - t)) / t : 0;\n';
function bNoU2(js) {
  const hs = Bj.split(/^(?=@@ )/m); const h0 = hs.shift();
  const rest = h0 + hs.filter((h) => !h.includes('__rvArm(e);') || h.includes('__rvArm = (e)')).join('');
  let out = apply(js, rest, 'P1b (b) without the __msTick hunk');
  if (out.split(anchor).length !== 2) throw new Error('re-port anchor not found once');
  return out.replace(anchor, anchor + ARM);
}
const builds = {};
const C1 = apply(V9F, U2, 'U2'); const V1 = apply(C1, part(P1, 'js'), 'P1 on B1'); const AB1 = apply(apply(V1, Aj, 'P1b (a) on B1'), Bj, 'P1b (b) on B1');
const C0 = V9F; const V0 = apply(C0, part(P1, 'js'), 'P1 on B0'); const AB0 = bNoU2(apply(V0, Aj, 'P1b (a) on B0'));
Object.assign(builds, { C1: [C1, CSS0], V1: [V1, cssV], AB1: [AB1, cssAB], C0: [C0, CSS0], V0: [V0, cssV], AB0: [AB0, cssAB] });
// checks: AB1 == the AB overlay minus F1's line; AB0 differs from AB1 only by U2
const lines = [];
for (const [n, [js, css]] of Object.entries(builds)) {
  const d = join(OUT, n); if (existsSync(d)) { execFileSync('chmod', ['-R', 'u+w', d]); rmSync(d, { recursive: true }); }
  mkdirSync(join(d, dirname(NODE)), { recursive: true }); mkdirSync(join(d, dirname(CSSF)), { recursive: true });
  writeFileSync(join(d, NODE), js); writeFileSync(join(d, CSSF), css);
  execFileSync(process.execPath, ['--check', join(d, NODE)]);
  execFileSync('chmod', ['-R', 'a-w', d]);
  lines.push(`${n} js ${sha(js)} css ${sha(css)}`);
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n')); console.log('wrote', OUT);
rmSync(T, { recursive: true, force: true });

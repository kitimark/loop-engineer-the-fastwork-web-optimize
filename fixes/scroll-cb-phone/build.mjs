// scroll-cb-phone arms: the best build (C) and best + scroll-cb-phone (V), as immutable snapshot copies to serve.
// Pattern: fixes/nav-hit-cache/build.mjs (fix-nav-morph).
//   node fixes/scroll-cb-phone/build.mjs            # check C, build V, print the arm table
//   node fixes/scroll-cb-phone/build.mjs --diff     # regenerate patch-on-best.diff from overlay/ (the working copy)
//   node fixes/scroll-cb-phone/build.mjs --no-expect  # print V's hashes without comparing them with EXPECT
// Arms (sha256/12 of the JS node / the CSS as written):
//   C  the best build, out/snapshots/best-65052c4a3902 (node fixes/best-build/build.mjs --snapshot)
//   V  C + patch-on-best.diff (JS only; the CSS is C's): the landing build, no debug code
// SCB_SET=v8 (P-117 N2, the count re-check on v8; every harness reads its arms from here):
//   C  v8-best (3e3e94cb6e9f / f836404b3728), V  v8 + nav-hit-cache + scroll-cb carried by int-v8 (e8d8323f674b / f836404b3728),
//   read-only copies in out/snapshots/{v8,nsc}-<js>; `node fixes/scroll-cb-phone/build.mjs --import-v8 <int-v8 out/nsc/snap>`
//   copies them in after checking every file's full sha256 against V8_FULL below.
// SCB_SET=v9 (int-v8's v9 step 3 check): C = v9 step 2 (v8 + rev 7c + double-drive, no scroll-cb; ab6f1062aaeb /
//   40037dc99f11), V = v9 step 3 (C + scroll-cb-on-v8dd.diff 7b4a7ee04d85; 25dc3025f1a0 / 40037dc99f11);
//   `--import-v9 <int-v8 out/v9/snap-ab6f1062aaeb/V> <int-v8 out/v9/snap-25dc3025f1a0/V>`.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const WT = join(HERE, '../..');
export const JS = '_app/immutable/nodes/2.DyWL8TcE.js';
export const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const FILES = [JS, CSS];
export const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const SNAP = join(WT, 'out/snapshots');
const PATCH = join(HERE, 'patch-on-best.diff');
const OVERLAY = join(HERE, 'overlay');
export const PIN = { C: ['65052c4a3902', 'e0f92804c521'] };
const EXPECT = { V: ['27f23f6a3878', 'e0f92804c521'] }; // pinned in the README's D card
const C_DIR = join(SNAP, 'best-65052c4a3902');
const V8_FULL = {
  C: { [JS]: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', [CSS]: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  V: { [JS]: 'e8d8323f674b0dd713b38b070f706f0a8540fcd7927c9fbab87f5cbb9ea0f657', [CSS]: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  // split check (lead, after N2's Simulator nav parity failure): N = v8 + nav-hit-cache alone (64ad0b9b
  // patch-on-v8.diff 7bbb6d4212ff, P-107's V), S = v8 + scroll-cb alone (int-v8's scroll-cb-on-v8.diff 3abcd7008e61)
  N: { [JS]: 'fd3688901f506b2a81b0aa07e63d86900c12f20f570122950ccca78556a01f79', [CSS]: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  S: { [JS]: '4c48e372ecdd6cdf93c25f6b0adc2617c77ab0ed71b4be823bd37492db591dec', [CSS]: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
};
const V8_DIR = { C: join(SNAP, 'v8-3e3e94cb6e9f'), V: join(SNAP, 'nsc-e8d8323f674b'), N: join(SNAP, 'nav-fd3688901f50'), S: join(SNAP, 'scbv8-4c48e372ecdd') };
const V9_CSS = '40037dc99f115b89b63114f6a95ea8401a7f938f6e4307057dfd52dcf8ab0b79';
const V9_FULL = {
  C: { [JS]: 'ab6f1062aaeb03b4f3b71056e9c0bf17379b1bd7568fc9e26b73eb2d7bc44964', [CSS]: V9_CSS },
  V: { [JS]: '25dc3025f1a0ca5b3313ab3fa8dadebeb898903473f10f145d67ac7c254a8205', [CSS]: V9_CSS },
};
const V9_DIR = { C: join(SNAP, 'v9s2-ab6f1062aaeb'), V: join(SNAP, 'v9s3-25dc3025f1a0') };
const full = (b) => createHash('sha256').update(b).digest('hex');

function v8Arms(log) {
  const arms = {};
  for (const k of Object.keys(V8_DIR)) {
    if ((k === 'N' || k === 'S') && !existsSync(join(V8_DIR[k], JS))) continue; // split arms: optional
    for (const f of FILES) {
      if (!existsSync(join(V8_DIR[k], f))) throw new Error(`${V8_DIR[k]}: missing ${f}; run --import-v8 <dir>`);
      if (full(read(V8_DIR[k], f)) !== V8_FULL[k][f]) throw new Error(`${V8_DIR[k]}/${f}: not the pinned v8 arm ${k}`);
    }
    arms[k] = { dir: V8_DIR[k], js: V8_FULL[k][JS].slice(0, 12), css: V8_FULL[k][CSS].slice(0, 12) };
  }
  for (const [k, a] of Object.entries(arms)) log(`${k.padEnd(3)} js ${a.js} css ${a.css}  ${a.dir.replace(WT + '/', '')}  (SCB_SET=v8)`);
  return arms;
}

function v9Arms(log) {
  const arms = {};
  for (const k of Object.keys(V9_DIR)) {
    for (const f of FILES) {
      if (!existsSync(join(V9_DIR[k], f))) throw new Error(`${V9_DIR[k]}: missing ${f}; run --import-v9 <step2 dir> <step3 dir>`);
      if (full(read(V9_DIR[k], f)) !== V9_FULL[k][f]) throw new Error(`${V9_DIR[k]}/${f}: not the pinned v9 arm ${k}`);
    }
    arms[k] = { dir: V9_DIR[k], js: V9_FULL[k][JS].slice(0, 12), css: V9_FULL[k][CSS].slice(0, 12) };
  }
  for (const [k, a] of Object.entries(arms)) log(`${k.padEnd(3)} js ${a.js} css ${a.css}  ${a.dir.replace(WT + '/', '')}  (SCB_SET=v9)`);
  return arms;
}

function importV9(c, v) {
  for (const [k, src] of [['C', c], ['V', v]]) {
    const tree = {};
    for (const f of FILES) {
      tree[f] = read(src, f);
      if (full(tree[f]) !== V9_FULL[k][f]) throw new Error(`${src}/${f}: sha256 ${full(tree[f])}, pinned ${V9_FULL[k][f]}`);
    }
    writeSnap(V9_DIR[k].split('/').pop(), tree);
  }
}

// --import-arm N|S <js file>: the split arms, the JS as built (sha256-checked) + v8's CSS
function importArm(k, jsFile) {
  if (k !== 'N' && k !== 'S') throw new Error('--import-arm N|S <js>');
  const tree = { [JS]: readFileSync(jsFile), [CSS]: read(V8_DIR.C, CSS) };
  for (const f of FILES) if (full(tree[f]) !== V8_FULL[k][f]) throw new Error(`arm ${k} ${f}: sha256 ${full(tree[f])}, pinned ${V8_FULL[k][f]}`);
  writeSnap(V8_DIR[k].split('/').pop(), tree);
}

function importV8(src) {
  for (const k of ['C', 'V']) {
    const tree = {};
    for (const f of FILES) {
      tree[f] = read(join(src, k), f);
      if (full(tree[f]) !== V8_FULL[k][f]) throw new Error(`${src}/${k}/${f}: sha256 ${full(tree[f])}, pinned ${V8_FULL[k][f]}`);
    }
    writeSnap(V8_DIR[k].split('/').pop(), tree);
  }
}

const read = (dir, f) => readFileSync(join(dir, f));

function writeSnap(name, tree) {
  const d = join(SNAP, name);
  if (existsSync(join(d, JS))) {
    for (const f of FILES) if (sha(read(d, f)) !== sha(tree[f])) throw new Error(`${d} exists with other bytes for ${f}`);
    return d;
  }
  for (const f of FILES) {
    mkdirSync(join(d, dirname(f)), { recursive: true });
    writeFileSync(join(d, f), tree[f]);
    chmodSync(join(d, f), 0o444);
  }
  return d;
}

export function build({ quiet = false, expect = true } = {}) {
  const log = (...a) => quiet || console.log(...a);
  if (process.env.SCB_SET === 'v8') return v8Arms(log);
  if (process.env.SCB_SET === 'v9') return v9Arms(log);
  if (process.env.SCB_SET && process.env.SCB_SET !== 'best') throw new Error(`SCB_SET=${process.env.SCB_SET}: best, v8 or v9`);
  if (!existsSync(join(C_DIR, JS))) throw new Error('best build snapshot missing: run node fixes/best-build/build.mjs --snapshot');
  const c = Object.fromEntries(FILES.map((f) => [f, read(C_DIR, f)]));
  if ([sha(c[JS]), sha(c[CSS])].join() !== PIN.C.join()) throw new Error(`C at ${C_DIR}: not the pinned best build`);
  const tmp = mkdtempSync(join(tmpdir(), 'scb-'));
  try {
    for (const f of FILES) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), c[f]); }
    const r = spawnSync('patch', ['-p1', '-s', '-F', '0', '-N', '-d', tmp, '-i', PATCH], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`patch-on-best.diff does not apply to the best build: ${r.stdout}${r.stderr}`);
    const v = Object.fromEntries(FILES.map((f) => [f, read(tmp, f)]));
    const h = [sha(v[JS]), sha(v[CSS])];
    if (expect && EXPECT.V[0] && h.join() !== EXPECT.V.join()) throw new Error(`arm V: ${h.join(' / ')}, pinned ${EXPECT.V.join(' / ')}`);
    const arms = { C: { dir: C_DIR, js: PIN.C[0], css: PIN.C[1] }, V: { dir: writeSnap(`scb-${h[0]}`, v), js: h[0], css: h[1] } };
    for (const [k, a] of Object.entries(arms)) log(`${k.padEnd(3)} js ${a.js} css ${a.css}  ${a.dir.replace(WT + '/', '')}`);
    return arms;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function regenDiff() {
  let out = '';
  for (const f of [JS]) {
    const r = spawnSync('diff', ['-u', '--label', `a/${f}`, '--label', `b/${f}`, join(C_DIR, f), join(OVERLAY, f)], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status > 1) throw new Error(r.stderr);
    out += r.stdout;
  }
  writeFileSync(PATCH, out);
  console.log(`wrote ${PATCH.replace(WT + '/', '')} (${out.split('\n').length} lines)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--diff')) regenDiff();
  const iv = process.argv.indexOf('--import-v8');
  if (iv > 0) importV8(process.argv[iv + 1]);
  const i9 = process.argv.indexOf('--import-v9');
  if (i9 > 0) importV9(process.argv[i9 + 1], process.argv[i9 + 2]);
  const ia = process.argv.indexOf('--import-arm');
  if (ia > 0) importArm(process.argv[ia + 1], process.argv[ia + 2]);
  build({ expect: !process.argv.includes('--no-expect') });
}

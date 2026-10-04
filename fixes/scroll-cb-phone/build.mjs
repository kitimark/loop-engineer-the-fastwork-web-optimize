// scroll-cb-phone arms: the best build (C) and best + scroll-cb-phone (V), as immutable snapshot copies to serve.
// Pattern: fixes/nav-hit-cache/build.mjs (fix-nav-morph).
//   node fixes/scroll-cb-phone/build.mjs            # check C, build V, print the arm table
//   node fixes/scroll-cb-phone/build.mjs --diff     # regenerate patch-on-best.diff from overlay/ (the working copy)
//   node fixes/scroll-cb-phone/build.mjs --no-expect  # print V's hashes without comparing them with EXPECT
// Arms (sha256/12 of the JS node / the CSS as written):
//   C  the best build, out/snapshots/best-65052c4a3902 (node fixes/best-build/build.mjs --snapshot)
//   V  C + patch-on-best.diff (JS only; the CSS is C's): the landing build, no debug code
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
  build({ expect: !process.argv.includes('--no-expect') });
}

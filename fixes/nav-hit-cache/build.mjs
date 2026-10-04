// nav-hit-cache arms: the best build (C) and best + nav-hit-cache (V), as immutable snapshot copies to serve.
//   node fixes/nav-hit-cache/build.mjs           # check C, build V (+ VA, the audit-hook copy), print the arm table
//   node fixes/nav-hit-cache/build.mjs --diff    # regenerate patch-on-best.diff from overlay/ (the working copy)
//   node fixes/nav-hit-cache/build.mjs --no-expect   # print V's hashes without comparing them with EXPECT
// Arms (sha256/12 of the JS node / the CSS as written):
//   C   the best build, out/snapshots/best-65052c4a3902 (fixes/best-build/build.mjs --snapshot)
//   V   C + patch-on-best.diff: the landing build, no debug code
//   VA  V + the in-frame audit hook (DEBUG ONLY, never lands): in every frame where V keeps its cached theme answer it
//       also runs the real hit test F() and records a mismatch. Used only by the parity part of probe.mjs.
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
// pinned hashes: C is the best build (fixes/best-build BUILD_EXPECT); V / VA as pinned in the README's D card
export const PIN = { C: ['65052c4a3902', 'e0f92804c521'] };
const EXPECT = { V: ['aa3ea472d26b', 'e0f92804c521'], VA: ['a01a2ef32db0', 'e0f92804c521'] };
const C_DIR = join(SNAP, 'best-65052c4a3902');

const HOOK_AT = '          __h && ((__nsG = F()), (__nsGeo.probe = __navProbeY()), (__nsForce = !1)),\n';
const HOOK =
  '          // DEBUG ONLY (nav-hit-cache VA arm, never lands): audit every cached frame against the real hit test\n' +
  '          window.__nhcAudit &&\n' +
  '            (__h\n' +
  '              ? window.__nhcAudit.t++\n' +
  '              : (window.__nhcAudit.n++,\n' +
  '                ((e) => e !== __nsG && window.__nhcAudit.m.push([Math.round(__nsY), __nsG, e]))(F()))),\n';

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
  if (!existsSync(join(C_DIR, JS))) throw new Error(`best build snapshot missing: run node fixes/best-build/build.mjs --snapshot`);
  const c = Object.fromEntries(FILES.map((f) => [f, read(C_DIR, f)]));
  if ([sha(c[JS]), sha(c[CSS])].join() !== PIN.C.join()) throw new Error(`C at ${C_DIR}: not the pinned best build`);
  const tmp = mkdtempSync(join(tmpdir(), 'nhc-'));
  try {
    for (const f of FILES) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), c[f]); }
    const r = spawnSync('patch', ['-p1', '-s', '-F', '0', '-N', '-d', tmp, '-i', PATCH], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`patch-on-best.diff does not apply to the best build: ${r.stdout}${r.stderr}`);
    const v = Object.fromEntries(FILES.map((f) => [f, read(tmp, f)]));
    const js = v[JS].toString('utf8');
    if (js.split(HOOK_AT).length !== 2) throw new Error('audit hook anchor not unique');
    const va = { ...v, [JS]: Buffer.from(js.replace(HOOK_AT, HOOK + HOOK_AT)) };
    const arms = { C: { dir: C_DIR, js: PIN.C[0], css: PIN.C[1] } };
    for (const [k, t, pre] of [['V', v, 'nhc'], ['VA', va, 'nhca']]) {
      const h = [sha(t[JS]), sha(t[CSS])];
      if (expect && EXPECT[k] && h.join() !== EXPECT[k].join()) throw new Error(`arm ${k}: ${h.join(' / ')}, pinned ${EXPECT[k].join(' / ')}`);
      arms[k] = { dir: writeSnap(`${pre}-${h[0]}`, t), js: h[0], css: h[1] };
    }
    for (const [k, a] of Object.entries(arms)) log(`${k.padEnd(3)} js ${a.js} css ${a.css}  ${a.dir.replace(WT + '/', '')}`);
    return arms;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function regenDiff() {
  let out = '';
  for (const f of FILES) {
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

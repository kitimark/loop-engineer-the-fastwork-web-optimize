// nav-hit-cache arms: the control build (C) and C + nav-hit-cache (V), as immutable snapshot copies to serve.
//   node fixes/nav-hit-cache/build.mjs [--base v8|best]          # check C, build V (+ VA, the audit-hook copy), print the arm table
//   node fixes/nav-hit-cache/build.mjs [--base v8|best] --diff   # regenerate the base's patch from overlay/ (the working copy)
//   node fixes/nav-hit-cache/build.mjs --no-expect               # print V's hashes without comparing them with EXPECT
// Bases (sha256/12 of the JS node / the CSS as written):
//   v8   (default, from the P-104 successor on) best build v8 = baseline + fixes/v8-best/patch.diff, written once to
//        out/snapshots/v8-3e3e94cb6e9f; V = C + patch-on-v8.diff
//   best (P-101 / P-104 record) best build v6, out/snapshots/best-65052c4a3902 (fixes/best-build/build.mjs --snapshot);
//        V = C + patch-on-best.diff
//   v8sc (P-117 combined) v8 + scroll-cb-on-v8.diff (int-v8 833fb29e) = 4c48e372ecdd, out/snapshots/v8sc-4c48e372ecdd;
//        V = C + patch-on-v8.diff = e8d8323f674b (int-v8's combined V), VA = eb2089b858ab
// Arms:
//   C   the base build
//   V   C + the base's patch: the landing build, no debug code
//   VA  V + the in-frame audit hook (DEBUG ONLY, never lands): in every frame where V keeps its cached theme answer it
//       also runs the real hit test F() and records a mismatch. Used only by the parity part of probe.mjs.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTree } from '../../tools/lib/paths.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const WT = join(HERE, '../..');
export const JS = '_app/immutable/nodes/2.DyWL8TcE.js';
export const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const FILES = [JS, CSS];
export const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const SNAP = join(WT, 'out/snapshots');
const OVERLAY = join(HERE, 'overlay');
// pinned hashes: C per base (best: fixes/best-build BUILD_EXPECT; v8: fixes/v8-best/README.md); V / VA as pinned in the
// README's D card for that base
export const BASES = {
  best: {
    dir: join(SNAP, 'best-65052c4a3902'), pin: ['65052c4a3902', 'e0f92804c521'], patch: join(HERE, 'patch-on-best.diff'),
    expect: { V: ['aa3ea472d26b', 'e0f92804c521'], VA: ['a01a2ef32db0', 'e0f92804c521'] }, pre: { V: 'nhc', VA: 'nhca' },
  },
  v8: {
    dir: join(SNAP, 'v8-3e3e94cb6e9f'), pin: ['3e3e94cb6e9f', 'f836404b3728'], from: join(WT, 'fixes/v8-best/patch.diff'),
    patch: join(HERE, 'patch-on-v8.diff'), expect: { V: null, VA: null }, pre: { V: 'nhc8', VA: 'nhc8a' },
  },
  // P-117 combined build (int-v8 833fb29e, fixes/v8-best/phone/nsc/build.mjs): C = v8 + scroll-cb-on-v8.diff (scroll-cb
  // carried onto v8), V = C + patch-on-v8.diff = the combined V int-v8 pinned (nav and scroll-cb commute, int-v8 checked)
  v8sc: {
    dir: join(SNAP, 'v8sc-4c48e372ecdd'), pin: ['4c48e372ecdd', 'f836404b3728'],
    from: [join(WT, 'fixes/v8-best/patch.diff'), { rev: '833fb29e', path: 'fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff', sha: '3abcd7008e61' }],
    patch: join(HERE, 'patch-on-v8.diff'), expect: { V: ['e8d8323f674b', 'f836404b3728'], VA: ['eb2089b858ab', 'f836404b3728'] }, pre: { V: 'nhcsc', VA: 'nhcsca' },
  },
  // v9 prep: C = v8 + PR-018 rev 7c (fixes/morph-scroll/delta.diff, the owner's build 428961bda278 / 659b02f7169d),
  // V = C + patch-on-v8ms.diff = patch-on-v8.diff's changed lines (same lines, offsets only) + the glue in rev 7c's
  // microtask: (z(g, (__nsG = F()), !0), (__nsForce = !0)), so the cached nav frame keeps the fresh answer
  v8ms: {
    dir: join(SNAP, 'v8ms-428961bda278'), pin: ['428961bda278', '659b02f7169d'],
    from: [join(WT, 'fixes/v8-best/patch.diff'), { rev: '75466887', path: 'fixes/morph-scroll/delta.diff', sha: '81ac7e1ee500' }],
    patch: join(HERE, 'patch-on-v8ms.diff'), expect: { V: ['9138732704f2', '659b02f7169d'], VA: ['f325bf009cd6', '659b02f7169d'] }, pre: { V: 'nhcms', VA: 'nhcmsa' },
  },
  // v9-final entry (lead ruling 10-05, ops note B): C = int-v8's v9 step 4 (7c + double-drive + scroll-cb + PR-021 rev 3,
  // out/v9/snap-de237379b556/V in int-v8's worktree, copied byte-identical to dir; no `from`), V = C + U1 + glue, applied
  // strictly (patch -F 0), as one diff
  v9s4: {
    dir: join(SNAP, 'v9s4-de237379b556'), pin: ['de237379b556', 'e1359ab9994a'],
    patch: join(HERE, 'patch-on-v9s4.diff'), expect: { V: ['c3d36476c3ce', 'e1359ab9994a'], VA: ['33bf2744db57', 'e1359ab9994a'] }, pre: { V: 'nhcv9', VA: 'nhcv9a' },
  },
};
// a `from` entry is a path, or {rev, path, sha}: that file at that commit (git show), checked against its pinned hash and
// cached under out/nav-hit-cache/from/
function fromFile(e) {
  if (typeof e === 'string') return e;
  const to = join(WT, 'out/nav-hit-cache/from', `${e.rev}-${e.path.split('/').pop()}`);
  if (!existsSync(to)) {
    const r = spawnSync('git', ['-C', WT, 'show', `${e.rev}:${e.path}`], { encoding: 'buffer', maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`git show ${e.rev}:${e.path}: ${r.stderr}`);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, r.stdout);
  }
  if (sha(readFileSync(to)) !== e.sha) throw new Error(`${to}: ${sha(readFileSync(to))}, pinned ${e.sha}`);
  return to;
}
const baseOf = (b) => {
  const B = BASES[b];
  if (!B) throw new Error(`unknown base ${b} (v8 | v8sc | v8ms | best)`);
  return B;
};
// v8's C is not kept anywhere else: build it once from the baseline snapshot + fixes/v8-best/patch.diff
function ensureBase(B) {
  if (existsSync(join(B.dir, JS)) || !B.from) return;
  const base = resolveTree('site-pretty');
  const tmp = mkdtempSync(join(tmpdir(), 'nhc-base-'));
  try {
    for (const f of FILES) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), readFileSync(join(base, f))); }
    for (const e of [B.from].flat()) {
      const p = fromFile(e);
      const r = spawnSync('patch', ['-p1', '-s', '-F', '0', '-N', '-d', tmp, '-i', p], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${p} does not apply: ${r.stdout}${r.stderr}`);
    }
    const t = Object.fromEntries(FILES.map((f) => [f, read(tmp, f)]));
    if ([sha(t[JS]), sha(t[CSS])].join() !== B.pin.join()) throw new Error(`base ${B.dir.split('/').pop()}: ${sha(t[JS])} / ${sha(t[CSS])}, pinned ${B.pin.join(' / ')}`);
    writeSnap(B.dir.split('/').pop(), t);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const HOOK_AT = '          __h && ((__nsG = F()), (__nsGeo.probe = __navProbeY()), (__nsForce = !1)),\n';
// best base (P-104 record): the theme audit only
const HOOK_BEST =
  '          // DEBUG ONLY (nav-hit-cache VA arm, never lands): audit every cached frame against the real hit test\n' +
  '          window.__nhcAudit &&\n' +
  '            (__h\n' +
  '              ? window.__nhcAudit.t++\n' +
  '              : (window.__nhcAudit.n++,\n' +
  '                ((e) => e !== __nsG && window.__nhcAudit.m.push([Math.round(__nsY), __nsG, e]))(F()))),\n';
// v8 base (P-104 successor): every frame is audited against the original's own per-frame reads, in the same frame:
//   m theme  (cached frames only) the cached answer vs the real hit test F()
//   v profile-sticky  __nsEE(n) vs the original ee() (getComputedStyle + 2 rects)
//   p hero pill  the cached-offset formula vs the original's live hero-track rect formula
// each entry [__nsY, V's answer, the original's answer, scrollY]; lag counts frames where the scroll position captured
// in the scroll event (__nsY) is not the live scrollY (a script scrolled between the scroll event and this rAF callback)
const HOOK_V8 =
  '          // DEBUG ONLY (nav-hit-cache VA arm, never lands): audit every frame against the original per-frame reads\n' +
  '          window.__nhcAudit &&\n' +
  '            ((window.__nhcAudit.lag += Math.round(window.scrollY) !== Math.round(__nsY) ? 1 : 0),\n' +
  '            __h\n' +
  '              ? window.__nhcAudit.t++\n' +
  '              : (window.__nhcAudit.n++,\n' +
  '                ((q) => q !== __nsG && window.__nhcAudit.m.push([Math.round(__nsY), __nsG, q, Math.round(window.scrollY)]))(F())),\n' +
  '            ((q, w) => q !== w && window.__nhcAudit.v.push([Math.round(__nsY), q, w, Math.round(window.scrollY)]))(__nsEE(n), ee()),\n' +
  '            ((q, w) => q !== w && window.__nhcAudit.p.push([Math.round(__nsY), q, w, Math.round(window.scrollY)]))(\n' +
  '              ((q) => !q || e.matches || n - q.t >= 0.72 * Math.max(1, q.h - __nsVh))(__nsGeo.track),\n' +
  '              ((q) => {\n' +
  '                if (!q || e.matches) return !0;\n' +
  '                let w = q.getBoundingClientRect(), u = Math.max(1, w.height - window.innerHeight);\n' +
  '                return Math.min(u, Math.max(0, -w.top)) / u >= 0.72;\n' +
  '              })(__navEl(`.hero-track`)))),\n';

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

export function build({ quiet = false, expect = true, base = 'v8' } = {}) {
  const log = (...a) => quiet || console.log(...a);
  const B = baseOf(base), C_DIR = B.dir, PATCH = B.patch;
  ensureBase(B);
  if (!existsSync(join(C_DIR, JS))) throw new Error(`base ${base} snapshot missing: run node fixes/best-build/build.mjs --snapshot`);
  const c = Object.fromEntries(FILES.map((f) => [f, read(C_DIR, f)]));
  if ([sha(c[JS]), sha(c[CSS])].join() !== B.pin.join()) throw new Error(`C at ${C_DIR}: not the pinned ${base} build`);
  const tmp = mkdtempSync(join(tmpdir(), 'nhc-'));
  try {
    for (const f of FILES) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), c[f]); }
    const r = spawnSync('patch', ['-p1', '-s', '-F', '0', '-N', '-d', tmp, '-i', PATCH], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${PATCH.split('/').pop()} does not apply to the ${base} build: ${r.stdout}${r.stderr}`);
    const v = Object.fromEntries(FILES.map((f) => [f, read(tmp, f)]));
    const js = v[JS].toString('utf8');
    if (js.split(HOOK_AT).length !== 2) throw new Error('audit hook anchor not unique');
    const HOOK = base === 'best' ? HOOK_BEST : HOOK_V8;
    const va = { ...v, [JS]: Buffer.from(js.replace(HOOK_AT, HOOK + HOOK_AT)) };
    const arms = { C: { dir: C_DIR, js: B.pin[0], css: B.pin[1] } };
    for (const [k, t, pre] of [['V', v, B.pre.V], ['VA', va, B.pre.VA]]) {
      const h = [sha(t[JS]), sha(t[CSS])];
      if (expect && B.expect[k] && h.join() !== B.expect[k].join()) throw new Error(`arm ${k}: ${h.join(' / ')}, pinned ${B.expect[k].join(' / ')}`);
      arms[k] = { dir: writeSnap(`${pre}-${h[0]}`, t), js: h[0], css: h[1] };
    }
    for (const [k, a] of Object.entries(arms)) log(`${k.padEnd(3)} js ${a.js} css ${a.css}  ${a.dir.replace(WT + '/', '')}`);
    return arms;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function regenDiff(base) {
  const B = baseOf(base), C_DIR = B.dir, PATCH = B.patch;
  ensureBase(B);
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
  const i = process.argv.indexOf('--base'), base = i > 0 ? process.argv[i + 1] : 'v8';
  if (process.argv.includes('--diff')) regenDiff(base);
  build({ base, expect: !process.argv.includes('--no-expect') });
}

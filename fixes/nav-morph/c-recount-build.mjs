// (c) recount builds (fix-nav-morph, F3): the build on main after morph-inherit and platform-idle landed.
//   pi-<js12>  = platform-idle as landed (501d9f7): the baseline + fixes/platform-idle/patch.diff (st6-rb2 + G1 + G3)
//   mpi-<js12> = main's stack: morph-inherit's mi (st6-rb2 + the inline --morph writes) + platform-idle's delta on st6-rb2
//                (diff c -> pi, applied to mi with patch(1); the two touch different lines)
// Needs out/snapshots/c-7bf7c4657d21 and mi-7c61fe7d0662 (node fixes/morph-inherit/build.mjs). Refuses any hash other
// than EXPECT.
//   node fixes/nav-morph/c-recount-build.mjs [--pi-patch fixes/platform-idle/patch.diff]
//   (on a branch without fixes/platform-idle: git show main:fixes/platform-idle/patch.diff > out/nav-morph/platform-idle-main.patch.diff)
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const argv = process.argv.slice(2);
const piPatch = argv.includes('--pi-patch') ? argv[argv.indexOf('--pi-patch') + 1]
  : [join(WT, 'fixes/platform-idle/patch.diff'), join(WT, 'out/nav-morph/platform-idle-main.patch.diff')].find(existsSync);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const EXPECT = { c: ['7bf7c4657d21', 'f523598b2a24'], mi: ['7c61fe7d0662', 'f523598b2a24'], pi: ['de29ff8aa622', 'e0f92804c521'], mpi: ['65052c4a3902', 'e0f92804c521'] };
const check = (name, dir) => { const got = [sha(readFileSync(join(dir, NODE))), sha(readFileSync(join(dir, CSS)))];
  if (got.join() !== EXPECT[name].join()) throw new Error(`${name}: js ${got[0]} css ${got[1]}, expected ${EXPECT[name].join(' / ')}`); return got; };
const put = (name, dir) => { const [js] = check(name, dir); const out = join(SNAP, `${name}-${js}`);
  if (!existsSync(out)) cpSync(dir, out, { recursive: true }); console.log(`${name} ${out} js ${EXPECT[name][0]} css ${EXPECT[name][1]}`); };
if (!piPatch) throw new Error('no platform-idle patch.diff (see the header)');
const C = join(SNAP, 'c-7bf7c4657d21'), MI = join(SNAP, 'mi-7c61fe7d0662');
check('c', C); check('mi', MI);
const SRC = join(WT, 'out/nav-morph/c-recount-src'); rmSync(SRC, { recursive: true, force: true });
const PI = join(SRC, 'pi'), MPI = join(SRC, 'mpi'), BASE = resolveTree('site-pretty');
for (const f of [NODE, CSS]) { mkdirSync(join(PI, dirname(f)), { recursive: true }); cpSync(join(BASE, f), join(PI, f)); }
execFileSync('patch', ['-s', '-p1', '-d', PI, '-i', piPatch], { stdio: 'inherit' });
put('pi', PI);
// platform-idle's delta on st6-rb2, then onto mi
const delta = [NODE, CSS].map((f) => { const r = spawnSync('diff', ['-u', '--label', `a/${f}`, '--label', `b/${f}`, join(C, f), join(PI, f)], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status > 1) throw new Error(r.stderr); return r.stdout; }).join('');
writeFileSync(join(SRC, 'pi-vs-c.diff'), delta);
cpSync(MI, MPI, { recursive: true });
execFileSync('patch', ['-s', '-p1', '-d', MPI, '-i', join(SRC, 'pi-vs-c.diff')], { stdio: 'inherit' });
put('mpi', MPI);

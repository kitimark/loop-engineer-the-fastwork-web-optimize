#!/usr/bin/env node
// P-151 kit self-test (int-v8; committed before any P-151 data). Prints SELFTEST-151 OK <n> or the first failure.
//   1. score151's block pins equal the prebuilt copies' HASHES (out/v91d/att, out/p142/snap) where they exist;
//   2. the bisect reading rules (synthetic): Q1 / Q2 not reproduced, cleared, both fail, insufficient; Q3 both readings;
//   3. score151 refuses M / H / R items;
//   4. replay: P-142's X and S records (out/p142, when present) through score151 --block P142 give P-142's gates
//      (EX WORSE 3, ES WORSE threshold-sensitive, FLICKER X WORSE 6 / control 0, FLICKER S no-worse) and the readings
//      (EX control insufficient: v9-final's X outs are caught, path-VOID; FLICKER X cleared; FLICKER S not reproduced);
//   5. hold151.sh refuses a wrong TICKET, an unknown block and a block whose servers are not running; it refuses M / H / R
//      items (static: its item case); serve151.sh refuses an unknown block.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const S = await import(join(here, 'score151.mjs'));
let n = 0;
const ok = (c, what) => { if (!c) { console.log(`SELFTEST-151 FAIL: ${what}`); process.exit(1); } n++; };
// 1
const hashes = (f) => existsSync(join(root, f)) ? Object.fromEntries(readFileSync(join(root, f), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse())) : null;
const att = hashes('out/v91d/att/HASHES.txt'), p142 = hashes('out/p142/snap/HASHES.txt');
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const eq = (pin, h, d) => h && ok(pin.js === h[`${d}/${JS}`] && pin.css === h[`${d}/${CSS}`], `pin vs ${d}`);
if (att) { eq(S.BLOCKS.Q1.C, att, 'S'); eq(S.BLOCKS.Q1.V, att, 'V'); eq(S.BLOCKS.Q2.C, att, 'G'); eq(S.BLOCKS.Q2.V, att, 'V'); eq(S.BLOCKS.Q3.V, att, 'C'); }
if (p142) { eq(S.BLOCKS.Q3.C, p142, 'C'); eq(S.BLOCKS.P142.V, p142, 'V'); }
ok(S.BLOCKS.Q1.V.js === S.BLOCKS.Q2.V.js && S.BLOCKS.Q1.V.css === S.BLOCKS.Q2.V.css, 'Q1 and Q2 test the same v9.2');
// 2
const W = 'WORSE (V ceiling: 1 frame(s) > 50 ms)', OKV = 'no-worse';
ok(S.reading('Q1', OKV, { pass: true }) === 'not reproduced', 'Q1 not reproduced');
ok(S.reading('Q1', W, { pass: true }) === 'cleared by removal: CAUSE scroll-cb', 'Q1 cleared');
ok(S.reading('Q2', W, { pass: true }) === 'cleared by removal: CAUSE g11', 'Q2 cleared');
ok(S.reading('Q1', W, { pass: false }) === 'both fail: not the cause alone', 'Q1 both fail');
ok(S.reading('Q2', W, { pass: null }) === 'insufficient (control)', 'Q2 control insufficient');
ok(S.reading('Q1', 'insufficient (V 1)', { pass: true }) === 'insufficient (test)', 'test insufficient');
ok(S.reading('Q3', W, { pass: null }) === '7d alone fails the gate', 'Q3 fails');
ok(/^7d alone passes/.test(S.reading('Q3', OKV, { pass: true })), 'Q3 passes');
// 3
for (const it of ['gMV1', 'wgMC', 'gHC1', 'gRV2']) { let threw = false; try { S.score151('Q1', [{ item: it, j: null, file: null }]); } catch { threw = true; } ok(threw, `refuses ${it}`); }
// 4
const args = existsSync(join(root, 'out/p142/score-args.txt')) ? readFileSync(join(root, 'out/p142/score-args.txt'), 'utf8').trim().split('\n').filter((l) => !/^(g|wg)M|-H1[abc]\.json$/.test(l)) : null;
if (args && args.every((a) => existsSync(join(root, a.split(':')[1])))) {
  const r = spawnSync(process.execPath, [join(here, 'score151.mjs'), '--block', 'P142', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const o = r.stdout || '';
  ok(r.status === 0, `replay exit ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
  ok(/^P142 EX: test WORSE \(V ceiling: 3 frame\(s\) > 50 ms\);.*READING insufficient \(control\)$/m.test(o), 'replay EX');
  ok(/^P142 ES: test WORSE \(V ceiling: 1 frame\(s\) > 50 ms\) \(threshold-sensitive\);/m.test(o), 'replay ES');
  ok(/^P142 FLICKER X: test WORSE \(G1: V monotone blinks 6, C 0\).*"Cmonotone":0.*READING cleared by removal/m.test(o), 'replay FLICKER X');
  ok(/^P142 FLICKER S: test no-worse.*READING not reproduced$/m.test(o), 'replay FLICKER S');
  ok(/^BLOCK P142 .* test verdict WORSE \(threshold-sensitive\)$/m.test(o), 'replay block verdict');
} else console.log('NOTE replay skipped: no out/p142 records in this checkout');
// 5
const sh = (env, ...a) => spawnSync('sh', [join(here, 'hold151.sh'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
ok(sh({ TICKET: 'P-142' }, 'Q1', 'Ha', 'sCo').status === 2, 'hold151 refuses another TICKET');
ok(sh({ TICKET: 'P-151' }, 'Q9', 'Ha', 'sCo').status === 2, 'hold151 refuses an unknown block');
if (!existsSync(join(root, 'out/p151/snap/block'))) ok(sh({ TICKET: 'P-151' }, 'Q1', 'Ha', 'sCo').status === 4, 'hold151 refuses a block whose servers are not running');
const hs = readFileSync(join(here, 'hold151.sh'), 'utf8');
ok(/wg\[MHR\]\*\|g\[MHR\]\*\) echo "HOLD \$Q \$H VOID item \$I: P-151 runs parts X and S only/.test(hs), 'hold151 item case refuses M / H / R');
ok(!/flick-middle|flick-hero/.test(hs.split('\n').filter((l) => !l.startsWith('#')).join('\n')), 'hold151 runs no M / H script');
const sv = spawnSync('sh', [join(here, 'serve151.sh'), 'check', 'Q7'], { cwd: root, encoding: 'utf8' });
ok(sv.status === 2, 'serve151 refuses an unknown block');
console.log(`SELFTEST-151 OK ${n}`);

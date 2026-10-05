// tools/lock.mjs shared lane end to end (ts-lock-share): `run --shared` jobs overlap each other, never an exclusive
// run; the switch (lead only); FW_LOCK_SHARED in the command's env; the deadline kill lands before the group's
// expiresAt (so old code's stale-lease takeover never fires while a reader is alive); status / wait / doctor output;
// timing tools refuse --shared. Temp FW_STATE_DIR only (I-041); the fake host (cleanEnv) keeps the gate quiet.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, sleep } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env, dir;
beforeEach(() => { state = tempDir('fw-sharedcli-'); dir = tempDir('fw-sharedcli-out-'); env = { FW_STATE_DIR: state, FW_LOCK_SHARED_JOIN_LOAD: '1000', FW_LOCK_SHARED_JOIN_BUSY: '100' }; });
const lock = (...a) => node(LOCK, a, { env });
const lockAsync = (...a) => nodeAsync(LOCK, a, { env });
const holder = () => { try { return JSON.parse(readFileSync(join(state, 'locks', 'chrome-measure.json'), 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (fn, ms = 15000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await sleep(50); } };
const turnOn = () => assert.equal(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
// a job that records its start / end (ms) and its FW_LOCK_* env, and runs `sec` seconds
const job = (name, sec) => `const fs=require('fs');const f=${JSON.stringify(join(dir, name + '.json'))};const s=Date.now();setTimeout(()=>{fs.writeFileSync(f,JSON.stringify({s,e:Date.now(),shared:process.env.FW_LOCK_SHARED||null,held:process.env.FW_LOCK_HELD||null}))},${sec * 1000})`;
const stamp = (name) => JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8'));
const holdsLog = () => (existsSync(join(state, 'locks', 'holds.log')) ? readFileSync(join(state, 'locks', 'holds.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

test('switch CLI: lead only, with a reason; cap 3 by default, --cap, --join-load and --join-busy; status shows it only while in use (N1)', () => {
  const bad = lock('shared', 'on', 'chrome-measure', '--by', 'me', '--reason', 'x');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--by lead/);
  const quiet = () => { assert.doesNotMatch(lock('status', 'chrome-measure', '--no-host').stdout, /shared lane/); assert.equal(JSON.parse(lock('status', 'chrome-measure', '--no-host', '--json').stdout)[0].sharedLane, undefined); };
  quiet(); // off and unused: status reads as on main
  turnOn();
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /shared lane: on \(cap 3\)/);
  const on4 = lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e', '--cap', '4', '--join-load', '12');
  assert.match(on4.stdout, /^SHARED LANE chrome-measure: on \(cap 4, join load 12\)/);
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /shared lane: on \(cap 4, join load 12\)/);
  assert.match(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e', '--join-load', '0').stderr, /--join-load/);
  // I-051: --join-busy (CPU busy % a joining reader needs), shown with the lane
  const onB = lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e', '--cap', '4', '--join-busy', '60');
  assert.match(onB.stdout, /^SHARED LANE chrome-measure: on \(cap 4, join busy 60 %\)/);
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /shared lane: on \(cap 4, join busy 60 %\)/);
  assert.match(lock('shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e', '--join-busy', '101').stderr, /--join-busy/);
  assert.equal(lock('shared', 'off', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
  quiet();
  // off but in use: an off-mode shared lease (a functional stand-in) shows the line
  assert.equal(lock('acquire', 'chrome-measure', '--shared', '--max-seconds', '30', '--owner', 'fn').code, 0);
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /shared lane: off/);
});

test('I-051 status: a free lock says whom it is handing over to and why that waiter has not taken it', () => {
  mkdirSync(join(state, 'locks'), { recursive: true });
  const now = Date.now(), iso = (s) => new Date(now - s * 1000).toISOString();
  const q = [{ owner: 'fix-x', kind: 'lease', checkout: '/tmp/x', since: iso(900), lastSeen: iso(1), queueTtlSec: 600,
    gate: { since: iso(300), at: iso(2), quiet: false, reasons: ['load1 70.8 > 6'] } }];
  writeFileSync(join(state, 'locks', 'chrome-measure.queue.json'), JSON.stringify(q));
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /free, handing over to "fix-x" \(gated: load1 70\.8 > 6\)/);
  q[0].lastSeen = iso(25); delete q[0].gate;
  writeFileSync(join(state, 'locks', 'chrome-measure.queue.json'), JSON.stringify(q));
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /free, handing over to "fix-x" \(not seen for 2[5-9] s\)/);
  const js = JSON.parse(lock('status', 'chrome-measure', '--no-host', '--json').stdout)[0];
  assert.equal(js.handover.to, 'fix-x');
  assert.ok(js.handover.notSeenSec >= 25);
});

test('usage: --shared needs --max-seconds, never with --short / --no-timing, not on iphone', () => {
  assert.match(lock('run', 'chrome-measure', '--shared', '--owner', 'a', '--', 'true').stderr, /--shared needs --max-seconds/);
  assert.match(lock('run', 'chrome-measure', '--shared', '--short', '--max-seconds', '10', '--owner', 'a', '--', 'true').stderr, /--short/);
  const nt = lock('run', 'chrome-measure', '--shared', '--no-timing', '--max-seconds', '10', '--owner', 'a', '--', 'true');
  assert.equal(nt.code, 1, nt.out);
  assert.match(nt.stderr, /--shared and --no-timing do not combine/);
  assert.match(lock('acquire', 'iphone', '--lead', '--reason', 'test fixture', '--shared', '--max-seconds', '10', '--owner', 'a').stderr, /iphone/);
  assert.match(lock('run', 'chrome-measure', '--shared', '--max-seconds', '10', '--weight', '7', '--owner', 'a', '--', 'true').stderr, /weight/);
});

test('two shared runs overlap; an exclusive run waits for both; no shared run starts while it holds', async () => {
  turnOn();
  const a = lockAsync('run', 'chrome-measure', '--shared', '--weight', '2', '--max-seconds', '60', '--owner', 'npm-a', '--', process.execPath, '-e', job('a', 2.5));
  const b = lockAsync('run', 'chrome-measure', '--shared', '--weight', '1', '--max-seconds', '60', '--owner', 'fn-b', '--', process.execPath, '-e', job('b', 2.5));
  await until(() => holder()?.readers?.length === 2);
  const st = lock('status', 'chrome-measure', '--no-host').stdout;
  assert.match(st, /shared by 2 readers \(weight 3\/3\)/);
  assert.match(st, /npm-a \(w2, pid \d+, until /);
  const x = lockAsync('run', 'chrome-measure', '--owner', 'ab', '--max-seconds', '60', '--', process.execPath, '-e', job('x', 1.5));
  await until(() => JSON.parse(lock('status', 'chrome-measure', '--json', '--no-host').stdout)[0].queue.some((w) => w.owner === 'ab'));
  assert.match(lock('status', 'chrome-measure', '--no-host').stdout, /joins closed: "ab" waits/);
  // a reader arriving now waits behind "ab" (writer preference)
  const c = lockAsync('run', 'chrome-measure', '--shared', '--max-seconds', '60', '--owner', 'fn-c', '--', process.execPath, '-e', job('c', 0.2));
  const [ra, rb, rx, rc] = await Promise.all([a, b, x, c]);
  for (const r of [ra, rb, rx, rc]) assert.equal(r.code, 0, r.out);
  const [A, B, X, C] = ['a', 'b', 'x', 'c'].map(stamp);
  assert.ok(A.s < B.e && B.s < A.e, 'the two readers overlapped');
  assert.ok(X.s >= Math.max(A.e, B.e), 'the exclusive run started after both readers ended');
  assert.ok(C.s >= X.e, 'the late reader started after the exclusive run');
  assert.match(A.shared, /^chrome-measure:[0-9a-f]{12}$/);
  assert.notEqual(A.shared, B.shared);
  assert.equal(A.held, null, 'a reader exports no FW_LOCK_HELD');
  assert.match(X.held, /^chrome-measure:[0-9a-f]{12}$/);
  assert.equal(X.shared, null);
  assert.equal(holder(), null);
});

test('inside a shared run: a nested exclusive run is refused at once; a nested shared run re-enters the slot', async () => {
  turnOn();
  const inner = `const {spawnSync}=require('child_process');const L=${JSON.stringify(LOCK)};`
    + `const ex=spawnSync(process.execPath,[L,'run','chrome-measure','--owner','verify-x','--','true'],{encoding:'utf8'});`
    + `const sh=spawnSync(process.execPath,[L,'run','chrome-measure','--shared','--max-seconds','20','--owner','inner','--',process.execPath,'-e','process.exit(7)'],{encoding:'utf8'});`
    + `require('fs').writeFileSync(${JSON.stringify(join(dir, 'nested.json'))},JSON.stringify({ex:[ex.status,ex.stderr],sh:[sh.status,sh.stderr]}))`;
  const r = await lockAsync('run', 'chrome-measure', '--shared', '--max-seconds', '60', '--owner', 'outer', '--', process.execPath, '-e', inner);
  assert.equal(r.code, 0, r.out);
  const n = JSON.parse(readFileSync(join(dir, 'nested.json'), 'utf8'));
  assert.equal(n.ex[0], 1);
  assert.match(n.ex[1], /inside the shared \(functional\) hold of "outer"/);
  assert.equal(n.sh[0], 7, n.sh[1]);
});

test('switch off: run --shared runs as an exclusive short job (with a notice) and exports FW_LOCK_SHARED, never FW_LOCK_HELD (N2)', async () => {
  const r = await lockAsync('run', 'chrome-measure', '--shared', '--max-seconds', '30', '--owner', 'fn', '--', process.execPath, '-e', job('off', 0.1));
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /shared lane is off: running as an exclusive --short job/);
  const s = stamp('off');
  assert.match(s.shared, /^chrome-measure:[0-9a-f]{12}$/);
  assert.equal(s.held, null);
});

test('N2/N5/N7: inside run --shared, switch off or on, nothing timed starts: an exclusive run or lease acquire, verify.mjs, iphone.mjs scroll; a shared lease re-enters', async () => {
  for (const on of [false, true]) {
    if (on) turnOn();
    const inner = `const {spawnSync}=require('child_process');const L=${JSON.stringify(LOCK)};const o={encoding:'utf8'};`
      + `const run=spawnSync(process.execPath,[L,'run','chrome-measure','--owner','verify-x','--','true'],o);`
      + `const acq=spawnSync(process.execPath,[L,'acquire','chrome-measure','--owner','lease-x'],o);`
      + `const sh=spawnSync(process.execPath,[L,'acquire','chrome-measure','--shared','--max-seconds','20','--owner','lease-y'],o);`
      + `const ip=spawnSync(process.execPath,[${JSON.stringify(tool('iphone.mjs'))},'scroll','--owner','x'],o);`
      + `require('fs').writeFileSync(${JSON.stringify(join(dir, 'n2.json'))},JSON.stringify([run,acq,sh,ip].map((x)=>[x.status,x.stdout+x.stderr])))`;
    const r = await lockAsync('run', 'chrome-measure', '--shared', '--max-seconds', '60', '--owner', 'outer', '--', process.execPath, '-e', inner);
    assert.equal(r.code, 0, r.out);
    const [run, acq, sh, ip] = JSON.parse(readFileSync(join(dir, 'n2.json'), 'utf8'));
    const tag = `switch ${on ? 'on' : 'off'}`;
    assert.equal(run[0], 1, `${tag}: ${run[1]}`);
    assert.match(run[1], /inside the shared \(functional\) hold of "outer"/, tag);
    assert.equal(acq[0], 1, `${tag}: ${acq[1]}`);
    assert.match(acq[1], /inside the shared \(functional\) hold of "outer"/, tag);
    assert.equal(sh[0], 0, `${tag}: ${sh[1]}`);
    assert.equal(ip[0], 2, `${tag}: ${ip[1]}`);
    assert.match(ip[1], /iphone\.mjs scroll is a timing run/, tag);
    assert.equal(holder(), null, `${tag}: released`);
  }
});

test('deadline: a reader overrunning --max-seconds is hard-killed (exit 124) before the group\'s expiresAt', async () => {
  turnOn();
  const pidFile = join(dir, 'pid');
  const child = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
  const run = lockAsync('run', 'chrome-measure', '--shared', '--max-seconds', '2', '--owner', 'stuck', '--', process.execPath, '-e', child);
  // I-099: the file exists (writeFileSync's open) before its pid is written; reading it then gave pid 0, and
  // kill(0, 0) signals this test's own process group, so "alive" was true for a dead command
  const pidNow = () => { try { const s = readFileSync(pidFile, 'utf8'); return /^\d+$/.test(s) ? Number(s) : 0; } catch { return 0; } };
  await until(() => holder()?.readers?.length === 1 && pidNow() > 1);
  const expiresAt = Date.parse(holder().expiresAt);
  const deadline = Date.parse(holder().readers[0].deadline); // acquiredAt + maxSec + killGraceSec (N3: the tighter bound)
  assert.ok(deadline < expiresAt);
  const pid = pidNow();
  assert.ok(pid > 1, `a real pid (${pid})`);
  const r = await run;
  assert.equal(r.code, 124, r.out);
  assert.equal(alive(pid), false, 'the SIGTERM-ignoring command is dead');
  assert.ok(Date.now() < deadline, `run ended ${Date.now() - deadline} ms after the reader's deadline`);
  assert.equal(holder(), null, 'the reader left and closed the group');
  // I-056 (d): the kill is auditable: the reader's holds.log line carries exit 124
  const l = holdsLog();
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].owner, l[0].mode, l[0].weight, l[0].maxSec, l[0].code, l[0].killed], ['stuck', 'shared', 1, 2, 124, 'max-seconds']);
  assert.ok(l[0].durationSec >= 2 && l[0].durationSec < 10, `duration ${l[0].durationSec} s`);
});

test('I-056 (d): every shared reader writes one holds.log line (owner, weight, start, end, duration, exit code); a nested re-entry writes none; no display / wake record', async () => {
  turnOn();
  const nested = `const {spawnSync}=require('child_process');const r=spawnSync(process.execPath,[${JSON.stringify(LOCK)},'run','chrome-measure','--shared','--max-seconds','20','--owner','inner','--',process.execPath,'-e','0'],{stdio:'inherit'});process.exit(r.status===0?7:1)`;
  const t0 = Date.now();
  const [a, b] = await Promise.all([
    lockAsync('run', 'chrome-measure', '--shared', '--weight', '2', '--max-seconds', '60', '--owner', 'npm-a', '--', process.execPath, '-e', nested),
    lockAsync('run', 'chrome-measure', '--shared', '--weight', '1', '--max-seconds', '60', '--owner', 'fn-b', '--', process.execPath, '-e', 'process.exit(3)'),
  ]);
  assert.deepEqual([a.code, b.code], [7, 3], a.out + b.out);
  const l = holdsLog().sort((x, y) => x.owner.localeCompare(y.owner));
  assert.deepEqual(l.map((x) => [x.owner, x.mode, x.short, x.weight, x.maxSec, x.code]), [['fn-b', 'shared', false, 1, 60, 3], ['npm-a', 'shared', false, 2, 60, 7]], 'one line per reader, none for the nested re-entry');
  for (const x of l) {
    assert.ok(Date.parse(x.acquiredAt) >= t0 - 1000 && Date.parse(x.endedAt) >= Date.parse(x.acquiredAt) && Date.parse(x.at) >= Date.parse(x.endedAt), JSON.stringify(x));
    assert.equal(x.durationSec, Math.round((Date.parse(x.endedAt) - Date.parse(x.acquiredAt)) / 100) / 10);
    assert.equal(x.killed, undefined);
    assert.ok(!('start' in x) && !('end' in x), 'a reader measures nothing: no display / wake record');
  }
  // switch off: the stand-in (an exclusive short job) logs as before, with the reader's weight
  assert.equal(lock('shared', 'off', 'chrome-measure', '--by', 'lead', '--reason', 'e2e').code, 0);
  assert.equal(lock('run', 'chrome-measure', '--shared', '--weight', '2', '--max-seconds', '30', '--owner', 'fn-off', '--', process.execPath, '-e', '0').code, 0);
  const off = holdsLog().find((x) => x.owner === 'fn-off');
  assert.deepEqual([off.mode, off.short, off.functional, off.weight, off.code], ['short', true, true, 2, 0]);
  assert.equal(off.start.display, 'on', 'a short hold keeps its display / wake record');
});

test('I-114: --weight npm-test takes --max-seconds up to 480 (run and the commit\'s lease); any other shared job keeps 300', () => {
  turnOn();
  const no = lock('acquire', 'chrome-measure', '--shared', '--weight', '2', '--max-seconds', '480', '--owner', 'commit-n');
  assert.equal(no.code, 1, no.out);
  assert.match(no.stderr, /between 1 and 300/);
  const usage = lock('acquire', 'chrome-measure', '--shared', '--weight', 'npm-test', '--owner', 'commit-u');
  assert.match(usage.stderr, /--shared needs --max-seconds N \(1\.\.480 for npm-test\)/);
  const a = lock('acquire', 'chrome-measure', '--shared', '--weight', 'npm-test', '--max-seconds', '480', '--owner', 'commit-x');
  assert.equal(a.code, 0, a.out);
  assert.match(a.stdout, /^ACQUIRED chrome-measure for "commit-x" \(shared, weight 2, max 480 s\)/);
  assert.equal(lock('release', 'chrome-measure', '--shared', '--owner', 'commit-x').code, 0);
  const over = lock('run', 'chrome-measure', '--shared', '--weight', 'npm-test', '--max-seconds', '481', '--owner', 'npm', '--', 'true');
  assert.equal(over.code, 1, over.out);
  assert.match(over.stderr, /between 1 and 480/);
  const r = lock('run', 'chrome-measure', '--shared', '--weight', 'npm-test', '--max-seconds', '480', '--owner', 'npm', '--', 'true');
  assert.equal(r.code, 0, r.out);
});

test('acquire --shared lease + release --shared; wait --until held-by sees a reader', () => {
  turnOn();
  const a = lock('acquire', 'chrome-measure', '--shared', '--weight', '2', '--max-seconds', '120', '--owner', 'commit-x');
  assert.equal(a.code, 0, a.out);
  assert.match(a.stdout, /^ACQUIRED chrome-measure for "commit-x" \(shared, weight 2, max 120 s\)/);
  assert.match(lock('wait', 'chrome-measure', '--until', 'held-by:commit-x', '--timeout', '5').stdout, /^MET/);
  const bad = lock('release', 'chrome-measure', '--owner', 'commit-x');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /release --shared/);
  assert.equal(lock('acquire', 'chrome-measure', '--shared', '--max-seconds', '60', '--owner', 'commit-y').code, 0);
  const one = lock('release', 'chrome-measure', '--shared', '--owner', 'commit-y');
  assert.equal(one.code, 0, one.out);
  assert.match(one.stdout, /^RELEASED chrome-measure \(shared reader "commit-y"\)$/m, 'another reader is still in: the group stays');
  const rel = lock('release', 'chrome-measure', '--shared', '--owner', 'commit-x');
  assert.equal(rel.code, 0, rel.out);
  assert.match(rel.stdout, /^RELEASED chrome-measure \(shared reader "commit-x"; the group closed\)$/m, 'the last reader out closes the group');
  assert.equal(holder(), null);
});

test('doctor flags a dead reader; repair --apply prunes it', () => {
  turnOn();
  assert.equal(lock('acquire', 'chrome-measure', '--shared', '--max-seconds', '120', '--owner', 'lease-r').code, 0);
  const h = holder();
  const dead = { ...h.readers[0], owner: 'gone', token: 'bbbbbbbbbbbb', kind: 'process', pid: 999999 };
  writeFileSync(join(state, 'locks', 'chrome-measure.json'), JSON.stringify({ ...h, readers: [...h.readers, dead] }));
  const d = lock('doctor', 'chrome-measure');
  assert.equal(d.code, 1);
  assert.match(d.stdout, /\[group-reader-dead\]/);
  assert.equal(lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'e2e', '--apply').code, 0);
  assert.deepEqual(holder().readers.map((x) => x.owner), ['lease-r']);
  assert.equal(lock('doctor', 'chrome-measure').code, 0);
});

test('timing tools refuse --shared (exit 2): verify.mjs, fix.mjs ab, bench gain / calibrate / reconfirm', () => {
  for (const [t, args] of [['verify.mjs', ['a=http://localhost:1/', '--shared']], ['fix.mjs', ['ab', 'x', '--shared']], ['bench.mjs', ['gain', '--shared']], ['bench.mjs', ['calibrate', '--shared']], ['bench.mjs', ['reconfirm', '--shared']]]) {
    const r = node(tool(t), args, { env });
    assert.equal(r.code, 2, `${t} ${args.join(' ')}: ${r.out}`);
    assert.match(r.stderr, /never runs in the shared lane/);
  }
});

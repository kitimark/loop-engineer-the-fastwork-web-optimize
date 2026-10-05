// Phone hold v2 T2 end to end (incident I-168) on a temp state dir: `lock.mjs acquire iphone` is refused for agents
// (exit 2, naming the run form) and passes for the user's hand test, the lead (--lead --reason, audited) and --not-ready
// queueing; `lock.mjs run iphone` holds the phone only while its command runs (released at once after it, or after
// --keep S, inside which the same owner's next part continues the hold), bounds --max-seconds (900, 3600 with
// --block); iphone.mjs and ioscap.mjs pass inside the hold (the FW_LOCK_HELD token) and refuse outside; wait.mjs
// phone-temp inside the hold is cooling on the ledger. No phone, Chrome, real locks or store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, freePort, sleep, startProc, TESTS } from '../helpers.mjs';

const LOCK = tool('lock.mjs'), IPHONE = tool('iphone.mjs'), IOSCAP = tool('ioscap.mjs'), WAIT = tool('wait.mjs');
let base, env, state;
before(async () => {
  base = { FW_IPHONE_PORT: String(await freePort()), FW_IPHONE_DEVICE_PORT: String(await freePort()), FW_LOCK_LOAD1: '4.5', FW_NO_CAFFEINATE: '1',
    FW_WDA_URL: `http://127.0.0.1:${await freePort()}`, FW_WDA_HOME: tempDir('fw-ph-wdahome-'), FW_DEVICECTL: join(TESTS, 'fixtures', 'fake-devicectl.mjs') };
});
beforeEach(() => { state = tempDir('fw-phone-hold-e2e-'); env = { ...base, FW_STATE_DIR: state }; });
const lock = (...a) => node(LOCK, a, { env });
const statusJson = () => JSON.parse(lock('status', 'iphone', '--json', '--no-host').stdout)[0];
const ledger = () => { const f = join(state, 'locks', 'holds.log'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.resource === 'iphone') : []; };
const audit = () => { const f = join(state, 'locks', 'audit.log'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
// a command that prints the iphone holder as one line "HOLDER <json>" (it runs inside the hold)
const printHolder = [process.execPath, '--input-type=module', '-e', `const {status}=await import(${JSON.stringify(new URL('../../tools/lib/lock.mjs', import.meta.url).href)});console.log('HOLDER '+JSON.stringify(status('iphone').holder))`];
const holderOut = (r) => JSON.parse(r.stdout.match(/^HOLDER (.*)$/m)[1]);

test('I-168: acquire iphone is refused for an agent (exit 2, the run form); the user\'s hand test, the lead with a reason (audited) and --not-ready pass', () => {
  let r = lock('acquire', 'iphone', '--owner', 'fix-x', '--ttl', '900');
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /node tools\/lock\.mjs run iphone --owner fix-x/);
  assert.equal(statusJson().holder, null, 'nothing taken, nothing queued');
  assert.deepEqual(statusJson().queue, []);
  assert.equal(lock('acquire', 'iphone', '--owner', 'fix-x', '--wait', '5').code, 2, 'refused before any wait');
  r = lock('acquire', 'iphone', '--owner', 'user-try', '--ttl', '900');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^ACQUIRED iphone for "user-try"/m);
  r = lock('acquire', 'iphone', '--owner', 'fix-y', '--not-ready');
  assert.equal(r.code, 3, r.out);
  assert.match(r.stdout, /^QUEUED iphone \(not ready\)/m);
  assert.equal(lock('release', 'iphone', '--owner', 'user-try').code, 0);
  r = lock('acquire', 'iphone', '--owner', 'fix-x', '--lead');
  assert.equal(r.code, 2, r.out);
  assert.match(r.stderr, /--lead needs --reason/);
  r = lock('acquire', 'iphone', '--owner', 'fix-x', '--lead', '--reason', 'hand the phone to a step runner');
  assert.equal(r.code, 0, r.out);
  const a = audit().filter((x) => x.code === 'lead-lease');
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, 'fix-x');
  assert.equal(a[0].reason, 'hand the phone to a step runner');
  assert.equal(a[0].resource, 'iphone');
  // chrome-measure leases are not touched by the phone rule
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'fix-x', '--short', '--max-seconds', '30').code, 0);
});

test('I-168: run iphone holds the phone while its command runs and frees it within 5 s of its exit; --max-seconds is bounded (900, 3600 with --block, which marks the block)', () => {
  let r = node(LOCK, ['run', 'iphone', '--owner', 'fix-x', '--', ...printHolder], { env });
  const exited = Date.now();
  assert.equal(r.code, 0, r.out);
  let h = holderOut(r);
  assert.equal(h.owner, 'fix-x');
  assert.equal(h.kind, 'process');
  assert.equal(h.meta.expectSec, 900, 'default --max-seconds 900');
  assert.equal(statusJson().holder, null);
  assert.ok(Date.now() - exited < 5000);
  const l = ledger();
  assert.equal(l.length, 1);
  assert.equal(l[0].kind, 'process');
  assert.equal(l[0].runSec, 0, 'the wrapper itself is no phone run');
  r = lock('run', 'iphone', '--owner', 'fix-x', '--max-seconds', '901', '--', process.execPath, '-e', '');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /at most 900 s/);
  r = lock('run', 'iphone', '--owner', 'fix-x', '--max-seconds', '3601', '--block', 'P-9', '--', process.execPath, '-e', '');
  assert.match(r.stderr, /at most 3600 s/);
  r = node(LOCK, ['run', 'iphone', '--owner', 'fix-x', '--max-seconds', '1800', '--block', 'P-9', '--', ...printHolder], { env });
  assert.equal(r.code, 0, r.out);
  h = holderOut(r);
  assert.equal(h.meta.expectSec, 1800);
  assert.equal(h.meta.block.id, 'P-9');
  assert.equal(ledger().at(-1).block, 'P-9');
  for (const k of ['0', '181', 'x']) assert.match(lock('run', 'iphone', '--owner', 'fix-x', '--keep', k, '--', process.execPath, '-e', '').stderr, /--keep/);
  assert.match(lock('run', 'chrome-measure', '--owner', 'fix-x', '--keep', '10', '--', process.execPath, '-e', '').stderr, /--keep is for lock\.mjs run iphone/);
  assert.equal(statusJson().holder, null);
});

test('I-168: a run iphone killed with SIGKILL frees the phone at the next status read (its pid is gone); the ledger says stale', async () => {
  const p = await startProc(process.execPath, [LOCK, 'run', 'iphone', '--owner', 'fix-k', '--', process.execPath, '-e', "console.log('IN ' + process.pid); setInterval(() => {}, 1000)"],
    { env, ready: (s) => /^IN \d+$/m.test(s) }); // true, not the pid: a string would be read as the server's URL
  const child = Number(/^IN (\d+)$/m.exec(p.stdout())[1]);
  try {
    assert.equal(statusJson().holder.owner, 'fix-k');
    p.proc.kill('SIGKILL');
    await p.exited;
  } finally { try { process.kill(child, 'SIGKILL'); } catch {} }
  const s = statusJson();
  assert.ok(!s.holder || s.stale, JSON.stringify(s.holder));
  const r = lock('acquire', 'iphone', '--owner', 'user-try');
  assert.equal(r.code, 0, r.out);
  const last = ledger().filter((l) => l.owner === 'fix-k').at(-1);
  assert.equal(last.kind, 'process');
  assert.match(last.how, /^stale/);
});

test('I-168: --keep S keeps the phone for the same owner after the command; its next part continues the hold (same token); others wait; it ends by itself', async () => {
  let r = lock('run', 'iphone', '--owner', 'fix-x', '--keep', '60', '--', process.execPath, '-e', '');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stderr, /kept for "fix-x" 60 s/);
  let s = statusJson();
  assert.equal(s.holder.owner, 'fix-x');
  assert.equal(s.holder.kind, 'lease');
  assert.equal(s.holder.keep.sec, 60);
  const tok = s.holder.token;
  assert.match(lock('status', 'iphone', '--no-host').stdout, /KEEP/);
  assert.equal(lock('acquire', 'iphone', '--owner', 'user-try').code, 3, 'the user waits too');
  r = node(LOCK, ['run', 'iphone', '--owner', 'fix-x', '--', ...printHolder], { env });
  assert.equal(r.code, 0, r.out);
  const inner = holderOut(r);
  assert.equal(inner.token, tok);
  assert.equal(inner.kind, 'process');
  assert.equal(inner.keep, undefined);
  s = statusJson();
  assert.ok(!s.holder || s.holder.owner === 'user-try', 'no keep without --keep: released at its end (the queued user may take it)');
  assert.equal(ledger().filter((l) => l.owner === 'fix-x').length, 1, 'one hold, one line');
  if (s.holder) assert.equal(lock('release', 'iphone', '--owner', 'user-try').code, 0);
  lock('dequeue', 'iphone', '--owner', 'user-try');
  // a short keep runs out: the next waiter takes the phone at once
  r = lock('run', 'iphone', '--owner', 'fix-x', '--keep', '1', '--', process.execPath, '-e', '');
  assert.equal(r.code, 0, r.out);
  await sleep(1300);
  r = lock('acquire', 'iphone', '--owner', 'user-try');
  assert.equal(r.code, 0, r.out);
  const last = ledger().filter((l) => l.owner === 'fix-x').at(-1);
  assert.equal(last.kind, 'keep');
  assert.match(last.how, /^keep ended/);
});

test('I-168: iphone.mjs and ioscap.mjs pass the phone check inside run iphone (no --owner needed: the hold\'s token) and refuse outside, naming the run form', () => {
  let r = node(IPHONE, ['scroll', '--owner', 'me'], { env, timeout: 20000 });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /you \("me"\) don't hold the iphone lease\. Run: node tools\/lock\.mjs run iphone --owner me -- /);
  r = node(LOCK, ['run', 'iphone', '--owner', 'me', '--', process.execPath, IPHONE, 'scroll'], { env, timeout: 30000 });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /fetch failed|ECONNREFUSED/, 'past the phone check: the (absent) proxy');
  assert.doesNotMatch(r.stderr, /don't hold/);
  // ioscap: refused outside; inside, the phone check passes and it stops later (no recorder app built here)
  const root = tempDir('fw-ph-ioscap-');
  const ienv = { ...env, FW_IOSCAP_ROOT: root };
  r = node(IOSCAP, ['record', '--owner', 'me'], { env: ienv, timeout: 30000 });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /you \("me"\) don't hold the iphone lease\. Run: node tools\/lock\.mjs run iphone --owner me -- /);
  r = node(LOCK, ['run', 'iphone', '--owner', 'me', '--', process.execPath, IOSCAP, 'record', '--owner', 'me'], { env: ienv, timeout: 30000 });
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(r.stderr, /don't hold/);
});

test('I-168: wait.mjs phone-temp inside run iphone is a cooling use on the ledger', () => {
  const iddEnv = { ...env, FW_IDEVICEDIAGNOSTICS: join(TESTS, 'fixtures', 'fake-idevicediagnostics.mjs'), FAKE_IDD_LOG: join(state, 'idd.log') };
  const r = node(LOCK, ['run', 'iphone', '--owner', 'fix-c', '--', process.execPath, WAIT, 'phone-temp', '--below', '20', '--timeout', '2', '--owner', 'fix-c'], { env: iddEnv, timeout: 30000 });
  assert.equal(r.code, 3, r.out); // TIMEOUT: the fake phone stays at ~30.5 C
  const l = ledger();
  assert.equal(l.length, 1);
  assert.ok(l[0].coolingSec >= 1, JSON.stringify(l[0]));
  assert.equal(l[0].runSec, 0);
  // outside a phone hold the wait marks nothing (and needs no hold)
  assert.equal(node(WAIT, ['phone-temp', '--below', '20', '--timeout', '1', '--owner', 'fix-c'], { env: iddEnv, timeout: 30000 }).code, 3);
  assert.equal(ledger().length, 1);
});

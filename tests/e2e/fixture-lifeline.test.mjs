// I-072: the long-lived fixtures the WDA/Simulator tests' tools start detached (fake xcodebuild's runner and its
// SIGTERM-ignoring helper, fake iproxy) never outlive their test: they ran on with ppid 1 for hours after a failed or
// killed run. Proven here on the real fixtures, started the way tools/lib/wda-runner.mjs starts them (detached, own
// process group, unref'd), from a child test process that (1) fails, (2) times out, (3) is SIGKILLed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir, nodeAsync, startProc, freePort, TESTS, sleep } from '../helpers.mjs';

const HELPERS = pathToFileURL(join(TESTS, 'helpers.mjs')).href;
const FX = (n) => join(TESTS, 'fixtures', n);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function allGone(pids, ms = 5000) {
  for (const t = Date.now() + ms; Date.now() < t && pids.some(alive);) await sleep(50);
  return pids.filter(alive);
}
const readPids = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(Number) : []);
const killAll = (pids) => { for (const p of pids) { try { process.kill(-p, 'SIGKILL'); } catch {} try { process.kill(p, 'SIGKILL'); } catch {} } };

/** Source of a module that starts the fixtures like wda-runner's startDetached and appends their pids to $OUT_PIDS. */
const START = `
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEnv, sleep } from ${JSON.stringify(HELPERS)};
export async function startFixtures(tag) {
  const env = cleanEnv({ FW_WDA_URL: 'http://127.0.0.1:' + process.env.WDA_PORT_BASE.split(',')[tag], FAKE_XCODEBUILD_SLOW: process.env.SLOW_DIR + '/' + tag });
  const slowDir = env.FAKE_XCODEBUILD_SLOW;
  (await import('node:fs')).mkdirSync(slowDir, { recursive: true });
  const det = (args, e = env) => { const p = spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: e }); p.unref(); return p.pid; };
  const pids = [
    det([${JSON.stringify(FX('fake-xcodebuild.mjs'))}, 'test-without-building', '-xctestrun', 'x.xctestrun']),
    det([${JSON.stringify(FX('fake-iproxy.mjs'))}, '8100:8100', '-u', 'x']),
    det([${JSON.stringify(FX('fake-xcodebuild.mjs'))}, 'build-for-testing']),
  ];
  for (let i = 0; i < 200 && !existsSync(join(slowDir, 'helper.pid')); i++) await sleep(25);
  pids.push(Number(readFileSync(join(slowDir, 'helper.pid'), 'utf8')));
  // registered (lifeline.mjs) before we go on, like a tool that waited for its runner to answer
  for (let i = 0; i < 200; i++) { const { liveFixtures } = await import(${JSON.stringify(HELPERS)}); if (liveFixtures().length >= pids.length) break; await sleep(25); }
  appendFileSync(process.env.OUT_PIDS, pids.join('\\n') + '\\n');
  return pids;
}
`;

async function setup() {
  const dir = tempDir('fw-lifeline-');
  writeFileSync(join(dir, 'start.mjs'), START);
  const ports = [await freePort(), await freePort(), await freePort()];
  return { dir, env: { OUT_PIDS: join(dir, 'pids'), SLOW_DIR: join(dir, 'slow'), WDA_PORT_BASE: ports.join(',') } };
}

test('I-072: a test that fails or times out leaves no fixture running: afterEach kills them (process group too), the exit hook the rest', async () => {
  const { dir, env } = await setup();
  writeFileSync(join(dir, 'child.test.mjs'), `
import { test, beforeEach, afterEach } from 'node:test';
import { writeFileSync, readFileSync } from 'node:fs';
import { killFixtures, sleep } from ${JSON.stringify(HELPERS)};
import { startFixtures } from './start.mjs';
let since = 0;
beforeEach(() => { since = Date.now(); });
afterEach(() => { killFixtures({ since }); });
test('fails after starting the fixtures', async () => { await startFixtures(0); throw new Error('boom'); });
test('times out after starting the fixtures', { timeout: 1500 }, async () => { await startFixtures(1); await new Promise(() => {}); });
test('the next test sees none of them alive', async () => {
  const pids = readFileSync(process.env.OUT_PIDS, 'utf8').trim().split('\\n').map(Number);
  await sleep(300);
  const live = pids.filter((p) => { try { process.kill(p, 0); return true; } catch { return false; } });
  writeFileSync(${JSON.stringify(join(dir, 'between'))}, JSON.stringify({ n: pids.length, live }));
});
test('left running for the exit hook', async () => { await startFixtures(2); });
`);
  const r = await nodeAsync('--test', ['--test-reporter=spec', join(dir, 'child.test.mjs')], { env, timeout: 60000 });
  const pids = readPids(env.OUT_PIDS);
  try {
    assert.equal(r.code, 1, r.out);
    assert.match(r.stdout, /✖ fails after starting the fixtures/);
    assert.match(r.stdout, /✖ times out after starting the fixtures .*\n\s*'test timed out after 1500ms'/s);
    assert.match(r.stdout, /ℹ pass 2\n/);
    assert.equal(pids.length, 12, `xcodebuild runner, iproxy, slow build and its helper, three times: ${r.out}`);
    const between = JSON.parse(readFileSync(join(dir, 'between'), 'utf8'));
    assert.deepEqual(between, { n: 8, live: [] }, 'the failed and the timed-out test\'s fixtures were gone before the next test');
    assert.deepEqual(await allGone(pids), [], 'nothing survives the test process (exit hook)');
  } finally { killAll(pids); }
});

test('I-072: a SIGKILLed test process (the lane\'s hard kill, no exit hook) still leaves no fixture: each one follows its lifeline', async () => {
  const { dir, env } = await setup();
  writeFileSync(join(dir, 'child.mjs'), `
import { startFixtures } from './start.mjs';
await startFixtures(0);
console.log('STARTED');
setInterval(() => {}, 1 << 30);
`);
  const p = await startProc(process.execPath, [join(dir, 'child.mjs')], { env, ready: (s) => /STARTED/.test(s), timeout: 30000 });
  const pids = readPids(env.OUT_PIDS);
  try {
    assert.equal(pids.length, 4);
    assert.deepEqual(pids.filter((x) => !alive(x)), [], 'all running while the test process lives');
    p.proc.kill('SIGKILL');
    await p.exited;
    assert.deepEqual(await allGone(pids, 5000), [], 'every fixture, also the SIGTERM-ignoring helper, ended within 5 s');
  } finally { killAll(pids); }
});

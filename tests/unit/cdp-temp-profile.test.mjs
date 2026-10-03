// I-095 (disk full): a throwaway Chrome profile made with tempProfileDir() is removed by tools/lib/cdp.mjs itself when
// its run ends: at close(), when the process exits on an error, and on SIGTERM / SIGINT / SIGHUP. Only the directory
// this process created is removed (recorded at creation, marker file inside), never one that existed before, never a
// persistent profile (verify.mjs's out/chrome-verify-profile). FW_KEEP_PROFILE=1 (or keepProfile) keeps it. A SIGKILL
// cannot be caught: the leftover keeps its marker, so `space.mjs report` lists it. All against the fake Chrome.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { tempDir, TESTS, TOOLS, sleep } from '../helpers.mjs';

const FAKE = join(TESTS, 'fixtures', 'fake-chrome.mjs');
const cdp = await import('../../tools/lib/cdp.mjs');
const saved = { CHROME: process.env.CHROME, KEEP: process.env.FW_KEEP_PROFILE };
after(() => {
  for (const [k, e] of [['CHROME', 'CHROME'], ['KEEP', 'FW_KEEP_PROFILE']]) { if (saved[k] === undefined) delete process.env[e]; else process.env[e] = saved[k]; }
});
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const gone = async (pid, ms = 3000) => { for (let t = 0; t < ms && alive(pid); t += 50) await sleep(50); return !alive(pid); };

test('close() removes a tempProfileDir profile it created; the marker names the creating process', async () => {
  process.env.CHROME = FAKE;
  delete process.env.FW_KEEP_PROFILE;
  const base = join(tempDir('fw-tp-'), 'out', 'chrome-fn');
  const dir = cdp.tempProfileDir(base, 'unit');
  const ch = await cdp.launchChrome({ port: 0, profileDir: dir, headless: true });
  assert.ok(existsSync(join(dir, 'DevToolsActivePort')));
  const marker = JSON.parse(readFileSync(join(dir, cdp.TEMP_PROFILE_MARKER), 'utf8'));
  assert.equal(marker.pid, process.pid);
  assert.equal(marker.dir, dir);
  assert.equal(marker.schema, 'fw-temp-profile/1');
  assert.ok(Date.parse(marker.createdAt) > 0);
  assert.equal(cdp.ownedTempProfiles().includes(dir), true);
  await ch.close();
  assert.equal(existsSync(dir), false, 'profile removed at close');
  assert.equal(existsSync(base), true, 'only the profile itself, not its parent');
  assert.equal(cdp.ownedTempProfiles().includes(dir), false);
});

test('a persistent profile (not from tempProfileDir) is kept at close, without a marker (verify.mjs unchanged)', async () => {
  process.env.CHROME = FAKE;
  const dir = join(tempDir('fw-tp-'), 'out', 'chrome-verify-profile');
  const ch = await cdp.launchChrome({ port: 0, profileDir: dir });
  assert.equal(existsSync(join(dir, cdp.TEMP_PROFILE_MARKER)), false);
  await ch.close();
  assert.equal(existsSync(dir), true);
});

test('FW_KEEP_PROFILE=1 and keepProfile: true keep the temp profile (debugging opt-out)', async () => {
  process.env.CHROME = FAKE;
  const base = tempDir('fw-tp-');
  process.env.FW_KEEP_PROFILE = '1';
  try {
    const a = cdp.tempProfileDir(base, 'keep-env');
    const ch = await cdp.launchChrome({ port: 0, profileDir: a });
    await ch.close();
    assert.equal(existsSync(a), true, 'kept by FW_KEEP_PROFILE=1');
  } finally { delete process.env.FW_KEEP_PROFILE; }
  const b = cdp.tempProfileDir(base, 'keep-opt');
  const ch = await cdp.launchChrome({ port: 0, profileDir: b, keepProfile: true });
  await ch.close();
  assert.equal(existsSync(b), true, 'kept by keepProfile');
});

test('a tempProfileDir path that already holds files at launch is not owned and not removed', async () => {
  process.env.CHROME = FAKE;
  const dir = cdp.tempProfileDir(tempDir('fw-tp-'), 'pre');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'someone-elses.txt'), 'x');
  const ch = await cdp.launchChrome({ port: 0, profileDir: dir });
  await ch.close();
  assert.equal(existsSync(join(dir, 'someone-elses.txt')), true);
  assert.equal(existsSync(join(dir, cdp.TEMP_PROFILE_MARKER)), false);
});

test('a launch that fails (browser exits at once) removes the temp profile it created', async () => {
  const d = tempDir('fw-tp-');
  const bin = join(d, 'dies.sh');
  writeFileSync(bin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  process.env.CHROME = bin;
  const dir = cdp.tempProfileDir(join(d, 'chrome'), 'dies');
  await assert.rejects(cdp.launchChrome({ port: 0, profileDir: dir }), /exited at once/);
  assert.equal(existsSync(dir), false);
});

// ---- the exit paths of a whole process (a probe or a tool) --------------------------------------------------
// The driver launches the fake Chrome on a temp profile, prints {dir, chrome} and then does what `mode` says.
function driver(d) {
  const f = join(d, 'driver.mjs');
  writeFileSync(f, `
const cdp = await import(${JSON.stringify(pathToFileURL(join(TOOLS, 'lib', 'cdp.mjs')).href)});
const mode = process.argv[2];
if (mode === 'own-handler') for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));
const dir = cdp.tempProfileDir(process.argv[3], 'drv-' + mode);
const ch = await cdp.launchChrome({ port: 0, profileDir: dir, headless: true });
console.log(JSON.stringify({ dir, chrome: ch.proc.pid }));
if (mode === 'throw') { await new Promise((r) => setTimeout(r, 100)); throw new Error('probe failed'); }
if (mode === 'reject') { await Promise.reject(new Error('probe rejected')); }
if (mode === 'exit') process.exit(3);
setInterval(() => {}, 1000); // wait for a signal
`);
  return f;
}
async function runDriver(mode, { signal } = {}) {
  process.env.CHROME = FAKE;
  const d = tempDir('fw-tp-drv-');
  const base = join(d, 'out', 'chrome');
  const p = spawn(process.execPath, [driver(d), mode, base], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CHROME: FAKE, FW_KEEP_PROFILE: '' } });
  let err = '';
  p.stderr.on('data', (b) => { err += b; });
  const first = await new Promise((res, rej) => {
    let buf = '';
    p.stdout.on('data', (b) => { buf += b; const i = buf.indexOf('\n'); if (i >= 0) res(JSON.parse(buf.slice(0, i))); });
    p.on('exit', (c) => rej(new Error(`driver exited ${c} before launch: ${err}`)));
  });
  assert.equal(existsSync(join(first.dir, cdp.TEMP_PROFILE_MARKER)), true, 'marker while running');
  const exited = new Promise((res) => p.on('exit', (code, sig) => res({ code, sig })));
  if (signal) p.kill(signal);
  const ex = await exited;
  return { ...first, ...ex, err, base };
}

for (const mode of ['throw', 'reject', 'exit']) {
  test(`process exit after an error (${mode}): Chrome killed and the temp profile removed`, async () => {
    const r = await runDriver(mode);
    assert.notEqual(r.code, 0, r.err);
    assert.ok(await gone(r.chrome), 'Chrome is gone');
    assert.equal(existsSync(r.dir), false, `profile left: ${readdirSync(r.base).join(', ')}`);
  });
}

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  test(`${signal} (no handler of its own, e.g. the lock's max-seconds SIGTERM): Chrome killed, profile removed, exit 128+n`, async () => {
    const r = await runDriver('wait', { signal });
    assert.equal(r.code, 128 + { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal], r.err);
    assert.ok(await gone(r.chrome), 'Chrome is gone');
    assert.equal(existsSync(r.dir), false);
  });
}

test('a process with its own signal handler (check.mjs, the lock library): that handler decides the exit, the profile is still removed', async () => {
  const r = await runDriver('own-handler', { signal: 'SIGTERM' });
  assert.equal(r.code, 130, r.err);
  assert.ok(await gone(r.chrome));
  assert.equal(existsSync(r.dir), false);
});

test('SIGKILL cannot be caught: the profile stays with its marker (pid now dead), for space.mjs report to list', async () => {
  const r = await runDriver('wait', { signal: 'SIGKILL' });
  assert.equal(r.sig, 'SIGKILL');
  try { process.kill(r.chrome, 'SIGKILL'); } catch {} // the orphaned fake Chrome
  assert.equal(existsSync(r.dir), true);
  const m = JSON.parse(readFileSync(join(r.dir, cdp.TEMP_PROFILE_MARKER), 'utf8'));
  assert.equal(alive(m.pid), false);
});

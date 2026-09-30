// tools/serve.mjs --https self-signed certificate handling (incident I-001): `fix.mjs ab` starts two
// HTTPS servers at once, and on a mirror home without out/certs both used to run openssl into the same
// two files, so a server could load one run's key with the other run's certificate ("key values
// mismatch"). A slow `openssl` shim on PATH widens that window so the race is deterministic.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir, startServe, request } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

const REAL_OPENSSL = spawnSync('sh', ['-c', 'command -v openssl'], { encoding: 'utf8' }).stdout.trim();
const pairMatches = (certPem, keyPem) => new X509Certificate(certPem).checkPrivateKey(createPrivateKey(keyPem));
const peerCert = (url) => new Promise((res, rej) => {
  const s = tls.connect({ host: 'localhost', port: Number(new URL(url).port), rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] }, () => {
    const raw = s.getPeerCertificate().raw; s.end(); res(raw);
  });
  s.on('error', rej);
});

let shimDir, callLog;
before(() => {
  // `openssl` shim: runs the real openssl into private temp files, then publishes the key, waits, and
  // publishes the certificate (the order and gap openssl itself has, only wider), logging each call.
  shimDir = tempDir('fw-openssl-shim-');
  callLog = join(shimDir, 'calls.log');
  const shim = join(shimDir, 'openssl');
  writeFileSync(shim, `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const { copyFileSync, appendFileSync } = require('node:fs');
const a = process.argv.slice(2);
appendFileSync(${JSON.stringify(callLog)}, a.join(' ') + '\\n');
const ki = a.indexOf('-keyout'), oi = a.indexOf('-out');
if (ki < 0 || oi < 0) process.exit(spawnSync(${JSON.stringify(REAL_OPENSSL)}, a, { stdio: 'inherit' }).status ?? 1);
const key = a[ki + 1], cert = a[oi + 1], tk = ${JSON.stringify(shimDir)} + '/key-' + process.pid, tc = ${JSON.stringify(shimDir)} + '/cert-' + process.pid;
const b = a.slice(); b[ki + 1] = tk; b[oi + 1] = tc;
const r = spawnSync(${JSON.stringify(REAL_OPENSSL)}, b, { stdio: 'ignore' });
if (r.status !== 0) process.exit(r.status ?? 1);
copyFileSync(tk, key);
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
copyFileSync(tc, cert);
`);
  chmodSync(shim, 0o755);
});

function freshHome() {
  const home = tempDir('fw-certs-');
  makeFixtureHome(home);
  return { home, certs: join(home, 'out', 'certs'), env: { FW_MIRROR_HOME: home, FW_STATE_DIR: join(home, 'state'), PATH: `${shimDir}:${process.env.PATH}` } };
}
const calls = () => (existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).length : 0);

test('--https: concurrent first starts share one freshly generated, matching key/cert pair', async () => {
  assert.ok(REAL_OPENSSL, 'openssl on PATH');
  const { certs, env } = freshHome();
  const before = calls();
  const N = 4;
  const results = await Promise.allSettled(Array.from({ length: N }, () => startServe(['--port', '0', '--https', '--quiet'], { env, timeout: 60000 })));
  const servers = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  try {
    const failed = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason).split('\n').slice(0, 4).join(' | '));
    assert.deepEqual(failed, [], `${failed.length}/${N} servers failed to start`);
    const certPem = readFileSync(join(certs, 'selfsigned-cert.pem')), keyPem = readFileSync(join(certs, 'selfsigned-key.pem'));
    assert.ok(pairMatches(certPem, keyPem), 'the published key and certificate belong together');
    assert.equal(calls() - before, 1, 'openssl ran exactly once');
    assert.deepEqual(readdirSync(certs).sort(), ['selfsigned-cert.pem', 'selfsigned-key.pem'], 'no temp files left behind');
    const onDisk = new X509Certificate(certPem).raw;
    for (const s of servers) {
      assert.ok(onDisk.equals(await peerCert(s.url)), `${s.url} presents the published certificate`);
      assert.equal((await request(s.url + PAGE_JS.slice(1))).status, 200);
    }
    // a later start reuses the pair as is (created once, never rewritten)
    const again = await startServe(['--port', '0', '--https', '--quiet'], { env });
    servers.push(again);
    assert.equal(calls() - before, 1, 'no second openssl run');
    assert.ok(readFileSync(join(certs, 'selfsigned-cert.pem')).equals(certPem));
    assert.ok(readFileSync(join(certs, 'selfsigned-key.pem')).equals(keyPem));
    assert.ok(onDisk.equals(await peerCert(again.url)));
  } finally {
    await Promise.all(servers.map((s) => s.stop()));
  }
});

test('--https: a mismatched key/cert pair left in out/certs is replaced instead of crashing', async () => {
  const { certs, env } = freshHome();
  // two independent self-signed pairs; publish key of one with cert of the other
  const tmp = tempDir('fw-certs-pairs-');
  for (const n of ['a', 'b']) {
    const r = spawnSync(REAL_OPENSSL, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=t', '-keyout', join(tmp, `${n}-key.pem`), '-out', join(tmp, `${n}-cert.pem`)], { stdio: 'ignore' });
    assert.equal(r.status, 0);
  }
  mkdirSync(certs, { recursive: true });
  copyFileSync(join(tmp, 'a-key.pem'), join(certs, 'selfsigned-key.pem'));
  copyFileSync(join(tmp, 'b-cert.pem'), join(certs, 'selfsigned-cert.pem'));
  const s = await startServe(['--port', '0', '--https', '--quiet'], { env, timeout: 60000 });
  try {
    const certPem = readFileSync(join(certs, 'selfsigned-cert.pem')), keyPem = readFileSync(join(certs, 'selfsigned-key.pem'));
    assert.ok(pairMatches(certPem, keyPem));
    assert.ok(new X509Certificate(certPem).raw.equals(await peerCert(s.url)));
    assert.equal((await request(s.url + PAGE_JS.slice(1))).status, 200);
  } finally {
    await s.stop();
  }
});

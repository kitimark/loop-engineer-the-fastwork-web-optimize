// T-106 #11: every serve.mjs records who runs it and what for in the shared servers registry (tools/lib/servers.mjs):
// pid, port, owner (--owner, else $FW_AGENT, else "unknown"), purpose (--doing), root/overlays, start and last request
// time (flushed, not written per request); the entry goes with the process (removed on a clean exit, else pruned by
// every reader). A test server without its own $FW_STATE_DIR records nothing.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, startServe, request, sleep } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';

let home, state, ov, S;
before(async () => {
  home = tempDir('fw-reg-home-');
  makeFixtureHome(home);
  state = tempDir('fw-reg-state-');
  ov = join(tempDir('fw-reg-ov-'), 'overlay');
  mkdirSync(ov, { recursive: true });
  process.env.FW_STATE_DIR = state;
  S = await import('../../tools/lib/servers.mjs');
});
const until = async (f, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await f()) return true; return false; };

test('serve.mjs records owner, purpose, port, root/overlays and its last request; gone with the process', async () => {
  const env = { FW_MIRROR_HOME: home, FW_STATE_DIR: state, FW_SERVERS_FLUSH_MS: '100', FW_AGENT: 'ts-env' };
  const a = await startServe(['--root', 'site-pretty', '--overlay', ov, '--port', '0', '--quiet', '--owner', 'fix-demo', '--doing', 'A/B of the demo fix'], { env });
  const b = await startServe(['--port', '0', '--quiet'], { env });
  try {
    const ea = S.getServer(a.proc.pid), eb = S.getServer(b.proc.pid);
    assert.deepEqual([ea.kind, ea.port, ea.owner, ea.doing, ea.overlays, ea.lastRequestAt], ['serve', a.port, 'fix-demo', 'A/B of the demo fix', [ov], null]);
    assert.match(ea.root, /site-pretty$/);
    assert.deepEqual([eb.owner, eb.doing], ['ts-env', null], 'no --owner: $FW_AGENT');
    assert.equal((await request(`${a.url}${PAGE_JS.slice(1)}`)).status, 200);
    assert.ok(await until(() => S.getServer(a.proc.pid).lastRequestAt), 'the last request time is flushed');
    assert.equal(S.getServer(b.proc.pid).lastRequestAt, null);
  } finally { await a.stop(); await b.stop('SIGKILL'); }
  // a signal ends serve.mjs without an exit hook (as before: no new signal handling); readers prune dead pids
  assert.equal(S.getServer(a.proc.pid), null, 'a stopped server is gone');
  assert.equal(S.getServer(b.proc.pid), null, 'a killed server is gone');
  assert.deepEqual(readdirSync(join(state, 'servers')).filter((f) => f.endsWith('.json')), []);
});

test('a test server without its own $FW_STATE_DIR records nothing (never the real registry)', async () => {
  const s = await startServe(['--port', '0', '--quiet', '--owner', 'fix-x'], { env: { FW_MIRROR_HOME: home } });
  try { assert.equal(S.getServer(s.proc.pid), null); } finally { await s.stop(); }
});

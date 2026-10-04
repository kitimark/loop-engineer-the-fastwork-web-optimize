// T-106 #11: the server registry (tools/lib/servers.mjs): who runs which mirror server, pruned when the pid is dead.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

let S;
before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-servers-');
  S = await import('../../tools/lib/servers.mjs');
});

test('ownerOf: --owner, else $FW_AGENT, else "unknown"; bad names are "unknown"', () => {
  assert.equal(S.ownerOf('fix-x', { FW_AGENT: 'y' }), 'fix-x');
  assert.equal(S.ownerOf(undefined, { FW_AGENT: 'ts-y' }), 'ts-y');
  assert.equal(S.ownerOf(undefined, {}), 'unknown');
  assert.equal(S.ownerOf('a b/../c', {}), 'unknown');
});

test('recordServer: written at once; hits stay in memory until a flush; listServers prunes dead pids; remove deletes only its own file', () => {
  let t = Date.parse('2026-10-04T12:00:00Z');
  const r = S.recordServer({ kind: 'serve', port: 5301, owner: 'fix-x', doing: 'A/B of the blur fix', root: '/h/site-pretty', overlays: ['/w/ov'] }, { flushMs: 3600e3, now: () => t });
  const f = join(S.serversDir(), `${process.pid}.json`);
  const disk = () => JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual([disk().owner, disk().doing, disk().port, disk().lastRequestAt, disk().startedAt], ['fix-x', 'A/B of the blur fix', 5301, null, '2026-10-04T12:00:00.000Z']);
  t += 5000; r.hit();
  assert.equal(disk().lastRequestAt, null, 'no write per request');
  r.flush();
  assert.equal(disk().lastRequestAt, '2026-10-04T12:00:05.000Z');
  // a dead pid's entry is pruned by the reader; a half-written file is skipped
  writeFileSync(join(S.serversDir(), '999999.json'), JSON.stringify({ pid: 999999, port: 1, startedAt: '2026-10-04T11:00:00Z' }));
  writeFileSync(join(S.serversDir(), '12345.json'), '{"pid": 12');
  const l = S.listServers({ isAlive: (pid) => pid === process.pid || pid === 12345 });
  assert.deepEqual(l.map((e) => e.pid), [process.pid]);
  assert.equal(existsSync(join(S.serversDir(), '999999.json')), false, 'pruned');
  assert.equal(existsSync(join(S.serversDir(), '12345.json')), true, 'not pruned: alive (only unreadable now)');
  assert.equal(S.getServer(process.pid).owner, 'fix-x');
  r.remove();
  assert.equal(existsSync(f), false);
  r.flush();
  assert.equal(existsSync(f), false, 'nothing written after remove');
});

test('listServers: no directory yet -> []', () => {
  const prev = process.env.FW_STATE_DIR;
  process.env.FW_STATE_DIR = join(tempDir('fw-servers-empty-'), 'none');
  try { assert.deepEqual(S.listServers(), []); } finally { process.env.FW_STATE_DIR = prev; mkdirSync(prev, { recursive: true }); }
});

test('a test child (FW_TEST_LIFELINE) without its own FW_STATE_DIR records nothing; with one it records there', () => {
  const off = S.recordServer({ port: 1 }, { env: { FW_TEST_LIFELINE: '123' } });
  assert.equal(off.off, true);
  off.hit(); off.flush();
  assert.equal(existsSync(join(S.serversDir(), `${process.pid}.json`)), false);
  const on = S.recordServer({ port: 2 }, { env: { FW_TEST_LIFELINE: '123', FW_STATE_DIR: process.env.FW_STATE_DIR } });
  assert.equal(on.off, undefined);
  assert.equal(S.getServer(process.pid).port, 2);
  on.remove();
});

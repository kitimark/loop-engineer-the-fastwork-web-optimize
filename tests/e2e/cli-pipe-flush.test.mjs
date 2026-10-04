// I-117 (2026-10-04, the I-110 pattern in more CLIs): `incident.mjs list --all --json | wc -c` and `finding.mjs list
// --json | wc -c` gave exactly 65536 on the live stores: the CLIs called process.exit() as soon as main() returned,
// while output past the pipe buffer was still queued, so it was dropped. incident, finding, wait, lock (and status,
// I-110) now exit through lib/exit.mjs once stdout and stderr flushed. Each case pipes > 64 KB through a real shell
// pipe whose reader starts late, and checks the exit code is kept. Temp FW_STATE_DIR only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, tool, run } from '../helpers.mjs';

const N = 300;
const at = '2026-10-04T04:00:00.000Z';
const pad = (s, n, c) => `${s} `.padEnd(n, c);
// the tool's output through `| (sleep 0.5; cat)`, a reader that starts late; `code` is the tool's own exit code
// (written to a file: a pipeline's status is its last command's)
function piped(env, name, ...args) {
  const f = join(tempDir('fw-pipe-code-'), 'code');
  const r = run('sh', ['-c', '{ "$0" "$@"; echo $? > "$FW_TEST_CODE_FILE"; } | (sleep 0.5; cat)', process.execPath, tool(name), ...args], { env: { ...env, FW_TEST_CODE_FILE: f } });
  return { ...r, code: Number(readFileSync(f, 'utf8')) };
}
const big = (r) => { assert.ok(r.stdout.length > 128 * 1024, `more than two pipe buffers (got ${r.stdout.length} bytes)`); return r.stdout; };

function state() {
  const s = tempDir('fw-pipe-flush-');
  return { s, env: { FW_STATE_DIR: s } };
}

test('I-117: incident.mjs list --all --json reaches a late pipe reader whole (> 64 KB)', () => {
  const { s, env } = state();
  const dir = join(s, 'incidents');
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= N; i++) {
    const id = `I-${String(i).padStart(3, '0')}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, title: pad(`incident ${i}`, 120, 't'), status: 'open', class: 'tool', sig: `sig:${i}`, reportedBy: 'ts-test', openedAt: at, blocking: false,
      error: pad(`error ${i}`, 200, 'e'), cmd: pad(`cmd ${i}`, 100, 'c'), affected: [], history: [] }));
  }
  const r = piped(env, 'incident.mjs', 'list', '--all', '--json');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(big(r)).length, N);
});

test('I-117: finding.mjs list --json reaches a late pipe reader whole (> 64 KB)', () => {
  const { s, env } = state();
  const dir = join(s, 'findings');
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= N; i++) {
    const id = `F-${String(i).padStart(3, '0')}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, kind: 'pitfall', topics: ['t'], title: pad(`finding ${i}`, 120, 't'), body: pad(`body ${i}`, 300, 'b'), by: 'ts-test', postedAt: at,
      status: 'open', acks: [], history: [] }));
  }
  const r = piped(env, 'finding.mjs', 'list', '--json');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(big(r)).length, N);
});

test('I-117: lock.mjs status --json (a long queue) reaches a late pipe reader whole (> 64 KB)', () => {
  const { s, env } = state();
  const dir = join(s, 'locks');
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(dir, 'chrome-measure.queue.json'), JSON.stringify(Array.from({ length: N }, (_, i) => ({ owner: `waiter-${i}`, kind: 'lease', checkout: pad(`/tmp/checkout-${i}`, 300, 'x'), since: now, lastSeen: now, queueTtlSec: 600 }))));
  const r = piped(env, 'lock.mjs', 'status', 'chrome-measure', '--no-host', '--json');
  assert.equal(r.code, 0, r.stderr);
  const [st] = JSON.parse(big(r));
  assert.equal(st.queue.length, N);
});

test('I-117: wait.mjs prints a > 64 KB matched line whole to a late pipe reader; exit 0 MET', () => {
  const { s, env } = state();
  const log = join(s, 'job.log');
  const line = 'X'.repeat(150 * 1024);
  writeFileSync(log, `start\n${line}\n`);
  const r = piped(env, 'wait.mjs', 'file', log, '--match', '^X', '--timeout', '10', '--owner', 'ts-test');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(big(r).includes(line), 'the whole matched line');
  assert.match(r.stdout, /^MET /m);
});

test('I-117: exit codes survive the flush: incident.mjs show of a missing id exits 1 with the reason on stderr', () => {
  const { env } = state();
  const r = piped(env, 'incident.mjs', 'show', 'I-999');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no incident I-999/);
});

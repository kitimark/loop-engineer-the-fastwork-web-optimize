// I-110 (2026-10-04): `status.mjs list --json | node -e 'JSON.parse(...)'` failed ("Unterminated string in JSON at
// position 65528"): status.mjs called process.exit() as soon as main() returned, while the >64 KB JSON was still
// queued for the pipe, so everything past the pipe buffer was dropped. Now the exit code is set and the process exits
// only once stdout (and stderr) have flushed. The reader is a real shell pipe that starts reading late, as a slow
// `node -e` consumer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, tool, run, node } from '../helpers.mjs';

test('I-110: status.mjs list --json and show --json reach a pipe reader whole (>64 KB); the exit code is kept', () => {
  const state = tempDir('fw-status-pipe-');
  const dir = join(state, 'status');
  mkdirSync(dir, { recursive: true });
  const now = '2026-10-04T04:00:00.000Z';
  const N = 400;
  for (let i = 0; i < N; i++) {
    const id = `item-${String(i).padStart(3, '0')}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({
      schema: 'fw-status/1', id, title: `Workstream number ${i} with a plain title`, kind: 'fix', owner: `fix-topic-${i}`, priority: null,
      state: 'researching', stateSince: now, waitingOn: null, createdAt: now, createdBy: `fix-topic-${i}`,
      note: `note ${i} `.padEnd(190, 'x'), next: `next ${i} `.padEnd(190, 'y'), history: [],
    }));
  }
  const env = { FW_STATE_DIR: state, FW_PROGRESS_FILE: join(state, 'none.json'), FW_PREDICTIONS_FILE: join(state, 'none.md') };
  // sh -c '<node> <status.mjs> list --json | (sleep 0.5; cat)': the reader starts late, the pipe fills first
  const piped = (...args) => run('sh', ['-c', '"$0" "$@" | (sleep 0.5; cat)', process.execPath, tool('status.mjs'), ...args], { env });
  const r = piped('list', '--json');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.length > 128 * 1024, `the output is well past one pipe buffer (${r.stdout.length} bytes)`);
  let v;
  assert.doesNotThrow(() => { v = JSON.parse(r.stdout); }, `whole JSON (got ${r.stdout.length} bytes, ends ${JSON.stringify(r.stdout.slice(-40))})`);
  assert.equal(v.items.length, N);
  assert.equal(v.items.at(-1).id, 'item-399');
  const s = piped('show', 'item-399', '--json');
  assert.equal(JSON.parse(s.stdout).item.id, 'item-399');
  // the exit codes still come through: 0 for a good run, 1 (and the reason on stderr) for a failed one
  assert.equal(node(tool('status.mjs'), ['list', '--json'], { env }).code, 0);
  const bad = node(tool('status.mjs'), ['show', 'no-such-item', '--json'], { env });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /no status item "no-such-item"/);
});

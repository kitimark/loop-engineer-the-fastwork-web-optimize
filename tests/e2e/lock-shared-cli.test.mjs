// Shared short holds through the CLI (ts-lock-bundle (f)): `lock.mjs run --short --share` from two checkouts (the worktree's
// tools and a copy in a temp dir, one FW_STATE_DIR) run at the same time; status shows both; a normal waiter that
// arrives blocks a third shared entry and is granted after the shared jobs end; holds.log marks the co-holder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, TOOLS, sleep } from '../helpers.mjs';

test('two short runs from two checkouts share chrome-measure; a normal waiter stops new shared entries and gets the lock after both', async () => {
  const state = tempDir('fw-sharedcli-');
  const other = tempDir('fw-sharedcli-co-');
  cpSync(TOOLS, join(other, 'tools'), { recursive: true });
  const L1 = tool('lock.mjs'), L2 = join(other, 'tools', 'lock.mjs');
  const env = { FW_STATE_DIR: state };
  const go = join(state, 'go');
  const waitGo = `const f=${JSON.stringify(go)};const t=setInterval(()=>{if(require('fs').existsSync(f)){clearInterval(t);process.exit(0)}},50)`;
  // npm-a holds (short) until the go file appears
  const a = nodeAsync(L1, ['run', 'chrome-measure', '--owner', 'npm-a', '--short', '--share', '--max-seconds', '60', '--', process.execPath, '-e', waitGo], { env, timeout: 60000 });
  const status = () => node(L1, ['status', 'chrome-measure', '--no-host'], { env }).stdout;
  for (let i = 0; i < 200 && !/held by "npm-a"/.test(status()); i++) await sleep(50);
  assert.match(status(), /held by "npm-a" \(short, max 60 s, may share\)/);
  // a short job without --share (one that runs Chrome) never joins; --share needs --short
  const ns = node(L2, ['run', 'chrome-measure', '--owner', 'test-chrome', '--short', '--max-seconds', '60', '--timeout', '2', '--', process.execPath, '-e', '0'], { env, timeout: 30000 });
  assert.notEqual(ns.code, 0, ns.out);
  assert.match(ns.stderr, /timed out after 2 s; held by npm-a/);
  const bad = node(L2, ['run', 'chrome-measure', '--owner', 'x', '--share', '--', process.execPath, '-e', '0'], { env });
  assert.notEqual(bad.code, 0);
  assert.match(bad.stderr, /--share is for short run \/ acquire/);
  // npm-b, from the other checkout, runs at once inside the shared hold and sees both holders
  const b = node(L2, ['run', 'chrome-measure', '--owner', 'npm-b', '--short', '--share', '--max-seconds', '60', '--timeout', '20', '--', process.execPath, L2, 'status', 'chrome-measure', '--no-host'], { env, timeout: 30000 });
  assert.equal(b.code, 0, b.out);
  assert.match(b.stdout, /^chrome-measure {2}held by "npm-a" \(short, max 60 s, may share\) .*\n(?: .*\n)*? {16}also held by "npm-b" \(short, max 60 s, shared with "npm-a"\) \[process pid \d+\] since \S+ until \S+, checkout /m);
  // the same checkout as the holder never shares (one worktree's out/)
  const same = node(L1, ['run', 'chrome-measure', '--owner', 'npm-same', '--short', '--share', '--max-seconds', '60', '--timeout', '2', '--', process.execPath, '-e', '0'], { env, timeout: 30000 });
  assert.notEqual(same.code, 0, same.out);
  assert.match(same.stderr, /timed out after 2 s; held by npm-a/);
  // a normal waiter arrives: BUSY, queued; a third short job from the other checkout no longer shares
  const n = node(L1, ['acquire', 'chrome-measure', '--owner', 'fix-ab'], { env });
  assert.equal(n.code, 3, n.out);
  const c = node(L2, ['run', 'chrome-measure', '--owner', 'npm-c', '--short', '--share', '--max-seconds', '60', '--timeout', '2', '--', process.execPath, '-e', '0'], { env, timeout: 30000 });
  assert.notEqual(c.code, 0, c.out);
  assert.match(c.stderr, /timed out after 2 s; held by npm-a/);
  // npm-a ends: the normal waiter is granted (quiet fake host)
  writeFileSync(go, '');
  const ra = await a;
  assert.equal(ra.code, 0, ra.out);
  const g = node(L1, ['acquire', 'chrome-measure', '--owner', 'fix-ab'], { env });
  assert.equal(g.code, 0, g.out);
  assert.match(g.stdout, /^ACQUIRED chrome-measure for "fix-ab"/m);
  assert.equal(node(L1, ['release', 'chrome-measure', '--owner', 'fix-ab'], { env }).code, 0);
  assert.equal(existsSync(join(state, 'locks', 'chrome-measure.cohold.json')), false);
  const holds = readFileSync(join(state, 'locks', 'holds.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(holds.map((h) => [h.owner, h.short, !!h.cohold]).sort(), [['npm-a', true, false], ['npm-b', true, true]]);
});

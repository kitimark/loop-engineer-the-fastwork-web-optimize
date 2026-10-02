// tools/lib/waits.mjs (incident I-058, user T-016): live wait records, so the status board shows who waits for what
// without the agent remembering to report it. One write at start, one unlink at exit; a killed wait's record counts
// as gone once its pid is dead; nothing personal stored (LAN hosts -> lan-host, home paths -> ~). Every test uses its
// own $FW_STATE_DIR (never the live .git/fastwork-mirror/). Example addresses are 192.168.77.x; none is real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDir } from '../helpers.mjs';

const W = await import('../../tools/lib/waits.mjs');
const S = await import('../../tools/lib/status.mjs');

let state;
beforeEach(() => { state = tempDir('fw-waits-'); process.env.FW_STATE_DIR = state; });
const files = () => { try { return readdirSync(join(state, 'waits')); } catch { return []; } };
/** A pid that certainly exited: a child that ran and was reaped. */
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid;

test('waitOwner: the given name, else $FW_AGENT, else $FW_LOCK_OWNER, else "unknown"; bad names fall through', () => {
  assert.equal(W.waitOwner('fix-a', { FW_AGENT: 'b' }), 'fix-a');
  assert.equal(W.waitOwner(undefined, { FW_AGENT: 'ts-b', FW_LOCK_OWNER: 'c' }), 'ts-b');
  assert.equal(W.waitOwner('', { FW_LOCK_OWNER: 'c' }), 'c');
  assert.equal(W.waitOwner(undefined, {}), 'unknown');
  assert.equal(W.waitOwner('has space/and slash', {}), 'unknown');
});

test('startWait: one record (owner, what, reason, since, timeout, until, pid); end() removes it; scrubbed of LAN hosts and home paths', () => {
  const now = Date.parse('2026-10-02T08:31:00Z');
  const w = W.startWait({ tool: 'wait.mjs url', owner: 'fix-a', what: `${W.urlText('https://192.168.77.12:5231/x')} to answer, log /Users/someone/out/x.log`, timeoutSec: 600, reason: 'see http://192.168.77.12:5231/', now, onExit: false });
  assert.equal(files().length, 1);
  const r = JSON.parse(readFileSync(join(state, 'waits', files()[0]), 'utf8'));
  assert.equal(r.schema, 'fw-wait/1');
  assert.equal(r.owner, 'fix-a');
  assert.equal(r.tool, 'wait.mjs url');
  assert.equal(r.pid, process.pid);
  assert.equal(r.since, '2026-10-02T08:31:00.000Z');
  assert.equal(r.timeoutSec, 600);
  assert.equal(r.until, '2026-10-02T08:41:00.000Z');
  assert.equal(r.what, 'lan-host:5231/x to answer, log ~/out/x.log');
  assert.ok(!JSON.stringify(r).includes('192.168'), 'no LAN address stored');
  assert.ok(!JSON.stringify(r).includes('someone'), 'no home path stored');
  assert.equal(r.reason, 'see <link>');
  assert.deepEqual(W.listWaits({ now }).map((x) => x.id), [r.id]);
  w.end();
  w.end(); // twice is fine
  assert.deepEqual(files(), []);
  assert.deepEqual(W.listWaits({ now }), []);
});

test('startWait: never throws (a broken state dir gives a no-op handle); owner falls back to "unknown"', () => {
  const f = join(state, 'not-a-dir');
  writeFileSync(f, 'x');
  process.env.FW_STATE_DIR = f;
  const w = W.startWait({ tool: 'wait.mjs pid', what: 'process 1 to exit', timeoutSec: 5, onExit: false });
  assert.equal(w.record, null);
  w.end();
  process.env.FW_STATE_DIR = state;
  const saved = { a: process.env.FW_AGENT, l: process.env.FW_LOCK_OWNER };
  delete process.env.FW_AGENT; delete process.env.FW_LOCK_OWNER;
  try {
    const u = W.startWait({ tool: 'lock.mjs wait', what: 'lock chrome-measure free', timeoutSec: 5, onExit: false });
    assert.equal(u.record.owner, 'unknown');
    u.end();
  } finally {
    if (saved.a !== undefined) process.env.FW_AGENT = saved.a;
    if (saved.l !== undefined) process.env.FW_LOCK_OWNER = saved.l;
  }
});

test('listWaits: a dead pid or a record 15 min past its timeout counts as gone; startWait drops dead-pid files', () => {
  const now = Date.parse('2026-10-02T09:00:00Z');
  const dir = join(state, 'waits');
  mkdirSync(dir, { recursive: true });
  const dead = deadPid();
  const rec = (pid, since, timeoutSec, owner) => ({ schema: W.SCHEMA, id: `${pid}-abc`, owner, tool: 'wait.mjs pid', what: 'x', since: new Date(since).toISOString(), timeoutSec, until: new Date(since + timeoutSec * 1000).toISOString(), pid });
  writeFileSync(join(dir, `${dead}-aaaaaa.json`), JSON.stringify(rec(dead, now - 60000, 600, 'killed')));
  writeFileSync(join(dir, `${process.pid}-bbbbbb.json`), JSON.stringify(rec(process.pid, now - 60 * 60000, 600, 'reused-pid'))); // until 08:10Z + 15 min < 09:00Z
  writeFileSync(join(dir, `${process.pid}-cccccc.json`), JSON.stringify(rec(process.pid, now - 120000, 600, 'live')));
  assert.deepEqual(W.listWaits({ now }).map((x) => x.owner), ['live']);
  const w = W.startWait({ tool: 't', owner: 'x', what: 'y', timeoutSec: 1, now, onExit: false });
  assert.ok(!files().includes(`${dead}-aaaaaa.json`), 'the killed wait\'s record is removed at the next start');
  assert.equal(files().length, 3);
  w.end();
});

test('waitPlain: "waiting for <what> since hh:mmZ (n min, timeout t)" and the reason', () => {
  const now = Date.parse('2026-10-02T08:34:00Z');
  const w = { what: 'the phone to cool to 37.1 °C or below (auto)', since: '2026-10-02T08:31:10.000Z', timeoutSec: 600 };
  assert.equal(W.waitPlain(w, now), 'waiting for the phone to cool to 37.1 °C or below (auto) since 08:31Z (3 min, timeout 10 min)');
  assert.equal(W.waitPlain({ ...w, since: '2026-10-02T08:33:50.000Z', timeoutSec: 3600, what: 'a fixed timer until 09:00Z', reason: 'block slot' }, now),
    'waiting for a fixed timer until 09:00Z since 08:33Z (under a minute, timeout 1 h); reason: block slot');
  assert.equal(W.waitPlain({ ...w, timeoutSec: 45 }, now), 'waiting for the phone to cool to 37.1 °C or below (auto) since 08:31Z (3 min, timeout 45 s)');
});

test('I-060: a wait whose text is a path, regex, pid or placeholder is shown by its --reason, else by a plain kind of wait; never the path or regex', () => {
  const now = Date.parse('2026-10-02T08:34:00Z');
  const base = { since: '2026-10-02T08:31:10.000Z', timeoutSec: 3600 };
  const file = { ...base, tool: 'wait.mjs file', what: 'a line of /private/tmp/claude-501/x/0d6a2c4e-1f2b-4c3d-9e8f-123456789abc/tasks/b2jrhp9be.output to match /A1-sent-open .*(PASS|FAIL)/' };
  assert.equal(W.waitPlain(file, now), 'waiting for a background job to report back since 08:31Z (3 min, timeout 1 h)');
  assert.equal(W.waitPlain({ ...file, reason: 'the A1 phone block to finish' }, now), 'waiting: the A1 phone block to finish since 08:31Z (3 min, timeout 1 h)');
  for (const [tool, what, plain] of [
    ['wait.mjs serve', 'the mirror server of out/serve-x.json to answer', 'a mirror server to start'],
    ['wait.mjs url', 'http://192.168.77.3:5200/ to answer', 'a server to answer'],
    ['wait.mjs pid', 'process 4242 to exit', 'a background process to finish'],
    ['wait.mjs git', 'a commit on main whose subject matches /I-060/', 'a commit to land on main'],
    ['something else', 'x <device id> y', 'something to finish'],
  ]) assert.equal(W.waitPlain({ ...base, tool, what }, now), `waiting for ${plain} since 08:31Z (3 min, timeout 1 h)`, tool);
  assert.equal(W.technicalWait('the phone to cool to 37.1 °C or below (auto)'), false);
  assert.equal(W.technicalWait('lock chrome-measure idle'), false);
  assert.equal(W.technicalWait('main to contain abc1234'), false);
});

test('board: a live wait shows on its owner\'s active row as "now: waiting for …" (a live wait: not stale); others under OTHER WAITS', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  const items = [
    { id: 'iphone-blocks', title: 'Phone blocks', kind: 'phone', owner: 'iphone-runner', state: 'measuring', stateSince: at(300), updatedAt: at(300), priority: null },
    { id: 'old', title: 'Old', kind: 'tool', owner: 'ts-old', state: 'done', updatedAt: at(10), priority: null },
  ];
  const waits = [
    { schema: W.SCHEMA, id: '1-a', owner: 'iphone-runner', tool: 'wait.mjs phone-temp', what: 'the phone to cool to 37.1 °C or below (auto)', since: at(3), timeoutSec: 600, pid: 1 },
    { schema: W.SCHEMA, id: '2-b', owner: 'ts-old', tool: 'lock.mjs wait', what: 'lock chrome-measure idle', since: at(1), timeoutSec: 3600, pid: 2 },
    { schema: W.SCHEMA, id: '3-c', owner: 'unknown', tool: 'wait.mjs url', what: 'http://192.168.77.3:5200/ to answer', since: at(0), timeoutSec: 120, pid: 3 },
  ];
  const v = S.buildStatusView({ items, live: { waits }, now });
  const row = v.items.find((x) => x.id === 'iphone-blocks');
  assert.deepEqual(row.derived.map((d) => d.plain), ['waiting for the phone to cool to 37.1 °C or below (auto) since 11:57Z (3 min, timeout 10 min)']);
  assert.equal(row.stale, false, 'a running wait is a live wait');
  assert.deepEqual(v.items.find((x) => x.id === 'old').derived, [], 'a finished row shows no waits');
  assert.deepEqual(v.otherWaits.map((x) => x.owner), ['ts-old', 'unknown']);
  const t = S.renderText(v);
  assert.match(t, /now: waiting for the phone to cool to 37\.1 °C or below \(auto\) since 11:57Z \(3 min, timeout 10 min\)/);
  assert.match(t, /OTHER WAITS \(no active workstream row for their owner\)\n {2}ts-old: waiting for lock chrome-measure idle since 11:59Z \(1 min, timeout 1 h\) {2}\[lock\.mjs wait\]\n {2}unknown: waiting for a server to answer since 12:00Z/, "I-060: a URL wait is shown by its kind, not the (scrubbed) URL");
  assert.ok(!t.includes('192.168'), 'shown text is sanitized again');
  assert.ok(!S.renderText(S.buildStatusView({ items, live: {}, now })).includes('OTHER WAITS'));
});

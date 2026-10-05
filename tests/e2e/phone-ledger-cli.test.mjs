// Phone ledger end to end (incident I-167, phone-hold v2 T1) on a temp state dir: `lock.mjs acquire|release iphone`
// leaves one ledger line in holds.log, a `lock.mjs run chrome-measure` line records when it began to wait (queuedAt,
// the ledger's Mac wait), and `idle.mjs report --day` sums a fixture day by cause. No phone, Chrome, real locks or store.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const IDLE = tool('idle.mjs');
const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-ledger-e2e-'); env = { FW_STATE_DIR: state, FW_NO_CAFFEINATE: '1' }; });
const holds = () => { const f = join(state, 'locks', 'holds.log'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };

const T0 = Date.parse('2026-09-20T08:00:00.000Z'); // a past day: today's report (--day alone) holds only the live lease below
const at = (min) => new Date(T0 + min * 60000).toISOString();
const line = (owner, a, b, x = {}) => ({ at: at(b), resource: 'iphone', ledger: 1, owner, kind: 'lease', token: 'abcdefabcdef', how: 'release', acquiredAt: at(a), endedAt: at(b), durationSec: (b - a) * 60, runSec: 0, coolingSec: 0, userWaitSec: 0, macHoldSec: 0, macWaitSec: 0, idleSec: 0, idleBeforeSec: 0, idleBetweenSec: 0, idleAfterSec: 0, waitersPresentSec: 0, idleWaitersSec: 0, macWaitWaitersSec: 0, ...x });

test('I-167: a released iphone lease leaves one ledger line; a chrome-measure run line carries queuedAt', () => {
  let r = node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'fix-x', '--ttl', '900'], { env });
  assert.equal(r.code, 0, r.out);
  r = node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'fix-y', '--ttl', '900'], { env });
  assert.equal(r.code, 3, r.out);
  r = node(LOCK, ['release', 'iphone', '--owner', 'fix-x'], { env });
  assert.equal(r.code, 0, r.out);
  let h = holds();
  assert.equal(h.length, 1);
  assert.equal(h[0].resource, 'iphone');
  assert.equal(h[0].owner, 'fix-x');
  assert.equal(h[0].kind, 'lease');
  assert.equal(h[0].how, 'release');
  assert.ok(h[0].waitersPresentSec >= 0);
  r = node(LOCK, ['run', 'chrome-measure', '--owner', 'fix-x', '--no-timing', '--max-seconds', '60', '--', process.execPath, '-e', ''], { env });
  assert.equal(r.code, 0, r.out);
  h = holds();
  const c = h.find((x) => x.resource === 'chrome-measure');
  assert.ok(c.queuedAt, JSON.stringify(c));
  assert.ok(Date.parse(c.queuedAt) <= Date.parse(c.acquiredAt));
});

test('I-167: idle.mjs report --day sums the day\'s holds by cause, by owner and per hold; --json; usage errors exit 1', () => {
  mkdirSync(join(state, 'locks'), { recursive: true });
  const lines = [
    line('cd-roll-ca', 36, 52, { runSec: 480, idleSec: 480, idleBeforeSec: 480, waitersPresentSec: 300, idleWaitersSec: 300 }),
    { at: at(60), resource: 'chrome-measure', owner: 'cd-roll-ca', queuedAt: at(53), acquiredAt: at(55), endedAt: at(60), durationSec: 300 },
    line('fix-nav-morph', 80, 91, { runSec: 300, macWaitSec: 120, macWaitWaitersSec: 60, idleSec: 240, idleBetweenSec: 120, idleAfterSec: 120 }),
    line('user-try', 100, 112, { kind: 'user', userWaitSec: 720 }),
    line('old', -24 * 60, -23 * 60, { idleSec: 3600, idleAfterSec: 3600 }),
  ];
  writeFileSync(join(state, 'locks', 'holds.log'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  let r = node(IDLE, ['report', '--day', '2026-09-20'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PHONE LEDGER 2026-09-20 \(UTC; holds that ended that day\): 3 holds, held 39 min, free between holds 37 min$/m);
  assert.match(r.stdout, /idle \(held, none of the above\): 12 min: before the first use 8 min \(H-early\), between uses 2 min \(H-gap\), after the last use 2 min \(H-done\); 5 min with a ready waiter/);
  assert.match(r.stdout, /avoidable \(held, idle or Mac wait, while a ready waiter was queued\): 6 min/);
  assert.match(r.stdout, /^ {2}08:36-08:52Z cd-roll-ca lease: 16 min; run 8 min, idle 8 min \(early 8 min, gap 0 min, done 0 min\); waiters 5 min; release$/m);
  assert.match(r.stdout, /^ {2}cd-roll-ca: 1 hold, 16 min;/m);
  assert.doesNotMatch(r.stdout, /\bold\b/);
  r = node(IDLE, ['report', '--day', '2026-09-20', '--json'], { env });
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(r.stdout);
  assert.equal(j.day, '2026-09-20');
  assert.equal(j.holds.length, 3);
  assert.equal(j.totals.idleSec, 720);
  r = node(IDLE, ['report', '--day', '2026-09-19'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PHONE LEDGER 2026-09-19 .*1 hold, held 60 min/m);
  // --day without a date: today (UTC); the open hold (a live lease) is in it so far
  r = node(LOCK, ['acquire', 'iphone', '--lead', '--reason', 'test fixture', '--owner', 'fix-live', '--ttl', '900'], { env });
  assert.equal(r.code, 0, r.out);
  r = node(IDLE, ['report', '--day'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^PHONE LEDGER ${new Date().toISOString().slice(0, 10)} \\(UTC; holds that ended that day, and the open hold so far\\): 1 hold`, 'm'));
  assert.match(r.stdout, /fix-live lease \(open\)/);
  assert.equal(node(IDLE, ['report', '--day', '04.10.2026'], { env }).code, 1);
  assert.equal(node(IDLE, ['report'], { env }).code, 1, 'report needs --day');
});

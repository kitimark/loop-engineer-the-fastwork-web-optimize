// I-203: `iphone.mjs gesture --idle-after-reload <ms>` idles after the script's own first reload (after readyPageMs is
// stamped, before the next step) without changing the program or its hash (P-129's L arm: 20-23 s idle before the first
// touch, script hash pinned by the card's G6 gate). Pure parts and runProgram against fakes here; the CLI (dry-run,
// refusal, record, summary line) in tests/e2e/iphone-gesture.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProgram, idleAfterReloadMs, runBudgetMs } from '../../tools/lib/gesture-run.mjs';
import { compileScript } from '../../tools/lib/gesture.mjs';

const S = (o) => ({ type: 'stroke', dir: 'up', px: 300, ms: 300, profile: 'still', ...o });
const prog = (steps) => compileScript({ name: 'idle', version: 1, screen: [430, 932], steps });

/** A page and WDA for runProgram that stamp every event with Date.now(): the reload, each state read, each stroke. */
function fakes() {
  const events = [];
  const at = (what) => events.push([what, Date.now()]);
  const page = {
    install: async () => at('install'),
    reload: async () => at('reload'),
    state: async () => { at('state'); return { y: 0, maxY: 3000, ih: 775, pageT: Date.now(), vis: 'visible', iw: 430, macBefore: Date.now(), macAfter: Date.now() }; },
    read: async () => ({ frames: [], touches: [], marks: [] }),
    mark: async () => at('mark'),
  };
  const wda = { actions: async () => { at('touch'); return { sentAt: Date.now(), returnedAt: Date.now(), ms: 0 }; } };
  return { page, wda, events };
}

test('I-203 runProgram idleAfterReloadMs: the idle lands after the first reload\'s ready stamp and before the next step; recorded in the run', async () => {
  const p = prog([{ type: 'reload' }, S({})]);
  const { page, wda, events } = fakes();
  const res = await runProgram(p, { wda, page, idleAfterReloadMs: 400, log: () => {} });
  assert.equal(res.aborted, null);
  const t = (w) => events.find((e) => e[0] === w)[1];
  const ready = events[events.findIndex((e) => e[0] === 'reload') + 2]; // reload, recorder install, the segment's first state read (readyPageMs)
  assert.equal(ready[0], 'state');
  assert.equal(res.reloads[0].readyPageMs, res.segments[0].sync[0][1], 'readyPageMs is the segment\'s first sync read');
  assert.ok(ready[1] <= res.reloads[0].readyPageMs + 1, 'ready stamped before the idle');
  assert.ok(t('touch') - res.reloads[0].readyPageMs >= 400, `first touch ${t('touch') - res.reloads[0].readyPageMs} ms after ready, wants >= 400`);
  assert.equal(res.idleAfterReloadMs, 400);
  assert.equal(res.reloads[0].idleAfterMs, 400, 'also on the reload it follows (iphone-runner\'s reader)');
  assert.equal(res.strokes.length, 1);

  const b = fakes();
  const plain = await runProgram(p, { wda: b.wda, page: b.page, log: () => {} });
  assert.ok(!('idleAfterReloadMs' in plain), 'default 0: no field in the run record (unchanged)');
  assert.ok(!('idleAfterMs' in plain.reloads[0]));
  assert.ok(b.events.find((e) => e[0] === 'touch')[1] - plain.reloads[0].readyPageMs < 300, 'default 0: no idle');
});

test('I-203 runProgram idleAfterReloadMs: only after the script\'s first reload, not after later ones; stops on check() like a pause', async () => {
  const p = prog([{ type: 'reload' }, S({}), { type: 'reload' }, S({})]);
  const { page, wda, events } = fakes();
  const res = await runProgram(p, { wda, page, idleAfterReloadMs: 300, log: () => {} });
  const touches = events.filter((e) => e[0] === 'touch').map((e) => e[1]);
  assert.equal(touches.length, 2);
  assert.ok(touches[0] - res.reloads[0].readyPageMs >= 300);
  assert.ok(touches[1] - res.reloads[1].readyPageMs < 250, 'the second reload gets no idle');
  assert.ok(!('idleAfterMs' in res.reloads[1]));

  const c = fakes();
  let n = 0;
  const t0 = Date.now();
  const stopped = await runProgram(prog([{ type: 'reload' }, S({})]), { wda: c.wda, page: c.page, idleAfterReloadMs: 60000, check: () => { if (++n > 3) throw new Error('lost the lease'); }, log: () => {} });
  assert.match(stopped.aborted, /lost the lease/);
  assert.ok(Date.now() - t0 < 5000, 'the idle polls check() (lease, signals) like a pause');
  assert.equal(c.events.filter((e) => e[0] === 'touch').length, 0);
});

test('I-203 idleAfterReloadMs(): 0-60000 integer, default 0; refused (exit 2) out of range, malformed, or when the script does not start with a reload', () => {
  const withReload = prog([{ type: 'reload' }, S({})]);
  const noReload = prog([S({})]);
  const argv = (...a) => ['gesture', 'x.json', '--owner', 'me', ...a];
  assert.equal(idleAfterReloadMs(argv(), withReload), 0);
  assert.equal(idleAfterReloadMs(argv(), noReload), 0, 'unset: any script, unchanged');
  assert.equal(idleAfterReloadMs(argv('--idle-after-reload', '0'), noReload), 0);
  assert.equal(idleAfterReloadMs(argv('--idle-after-reload', '20000'), withReload), 20000);
  assert.equal(idleAfterReloadMs(argv('--idle-after-reload=60000'), withReload), 60000);
  for (const bad of [['60001'], ['-1'], ['2.5'], ['abc'], ['', '--dry-run'], ['--dry-run'], []]) {
    assert.throws(() => idleAfterReloadMs(argv('--idle-after-reload', ...bad), withReload), (e) => e.exitCode === 2 && /--idle-after-reload wants whole ms 0-60000/.test(e.message), JSON.stringify(bad));
  }
  assert.throws(() => idleAfterReloadMs(argv('--idle-after-reload', '20000'), noReload), (e) => e.exitCode === 2 && /--idle-after-reload needs a script whose first step is a reload/.test(e.message));
});

test('I-203 runBudgetMs: the idle is added on top of max(150 s, 3x the estimate)', () => {
  assert.equal(runBudgetMs(10000), 150000);
  assert.equal(runBudgetMs(10000, 0), 150000);
  assert.equal(runBudgetMs(10000, 20000), 170000);
  assert.equal(runBudgetMs(100000, 20000), 320000);
});

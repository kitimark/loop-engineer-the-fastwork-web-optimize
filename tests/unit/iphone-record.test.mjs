// tools/lib/iphone-record.mjs (incident I-141): `iphone.mjs record` saves as it goes, notes what a failed read looked
// like, and reconnects once. A fake connection on a virtual clock (no phone, no proxy); URLs use .invalid hosts and one
// private address that must never reach the record (Hard rule 12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../tools/lib/iphone-record.mjs';

const HREF = 'http://10.1.2.3:5401/';
/** A page with the logger: one frame per 100 ms of virtual time since install. `fail(expr, t)` -> throw to simulate. */
function harness({ fail = () => null, reconnectTo = 'same', seconds = 45 } = {}) {
  let t = 1000;
  const clock = { now: () => t, sleep: async (ms) => { t += ms; } };
  const page = { t0: t, href: HREF, stop: null, reloaded: false };
  const frames = () => { const n = Math.floor(((page.stop ?? t) - page.t0) / 100); return Array.from({ length: n }, (_, i) => [i * 100, 100, i * 10, 775]); };
  const evals = [], saves = [];
  const conn = (name) => ({
    name, closed: null,
    close() { this.closed = { self: true }; },
    async evaluate(expr) {
      evals.push({ conn: name, at: t - page.t0, expr: expr.slice(0, 40) });
      const f = fail(expr, t - page.t0, name);
      if (f) throw new Error(f);
      if (expr === R.RECORD_STOP_JS) { if (page.reloaded) throw new TypeError('undefined is not an object'); page.stop = t; return JSON.stringify({ frames: frames(), href: page.href, vw: 430, vh0: 775, stop: true }); }
      if (expr === R.DIAG_JS) return JSON.stringify(page.reloaded ? { href: 'https://other.invalid/next', visibilityState: 'visible', readyState: 'complete', logger: false, frames: null, loggerHref: null } : { href: page.href, visibilityState: 'visible', readyState: 'complete', logger: true, frames: frames().length, loggerHref: page.href });
      const m = expr.match(/r\.frames\.slice\((\d+), n\)/);
      if (m) { if (page.reloaded) return null; const all = frames(); return JSON.stringify({ n: all.length, href: page.href, vw: 430, vh0: 775, f: all.slice(Number(m[1])) }); }
      throw new Error(`unexpected ${expr.slice(0, 40)}`);
    },
  });
  const c = conn('c1');
  const reconnects = [];
  const run = (o = {}) => R.recordRun({
    c, seconds, href: HREF, readMs: 15000, ...clock,
    save: async (rec) => { saves.push(JSON.parse(JSON.stringify(rec))); },
    reconnect: async (host) => { reconnects.push(host); if (reconnectTo === 'fail') throw new Error('BLOCKED: cannot reach Safari tab (no page target)'); return conn('c2'); },
    listTabs: async () => [{ url: HREF, title: 'Fastwork mirror', appId: 'PID:613' }, { url: 'https://mail.invalid/inbox', title: 'Private Inbox', appId: 'PID:613' }],
    ...o,
  });
  return { run, page, evals, saves, reconnects, clock, c };
}

test('I-141: a good run polls every 5 s (0.2 Hz), saves partial "in progress" each time, then the final read is the record', async () => {
  const h = harness();
  const r = await h.run();
  assert.equal(r.partial, false);
  assert.equal(r.rec.frames.length, 450, 'the final read: every frame of 45 s');
  assert.deepEqual(r.rec.stream, { pollSec: 5, polls: 8, lastPollSec: 40 }, 'polls at 5..40 s; the last 5 s end in the final read');
  assert.equal(h.saves.length, 8);
  assert.ok(h.saves.every((s) => s.partial === true && s.reason === R.IN_PROGRESS));
  assert.deepEqual(h.saves.map((s) => s.frames.length), [50, 100, 150, 200, 250, 300, 350, 400], 'each save holds every frame so far');
  assert.equal(h.evals.filter((e) => e.expr.startsWith(R.RECORD_STOP_JS.slice(0, 40))).length, 1);
  assert.equal(r.rec.diag, undefined);
  assert.equal(r.rec.recovered, undefined);
  assert.equal(h.clock.now() - h.page.t0, 45000, 'the run still lasts --seconds');
  assert.equal(h.c.closed.self, true);
  const intervals = h.evals.map((e) => e.at).slice(1).map((a, i, xs) => a - (i ? xs[i - 1] : 5000));
  assert.ok(intervals.every((d) => d >= 5000 || d === 0), 'never faster than one poll per --poll s');
});

test('I-141: --poll 0 is the old sequence (one final read at the end); parsePoll bounds', async () => {
  const h = harness();
  const r = await h.run({ pollSec: 0 });
  assert.equal(r.partial, false);
  assert.deepEqual(h.evals.map((e) => e.at), [45000]);
  assert.equal(h.saves.length, 0);
  assert.equal(R.parsePoll(undefined), 5);
  assert.equal(R.parsePoll('0'), 0);
  assert.equal(R.parsePoll('1'), 1);
  for (const bad of ['0.5', '-1', '61', 'x']) assert.throws(() => R.parsePoll(bad), /--poll must be 0 \(no polls\) or 1-60 seconds/);
  assert.equal(R.EXIT_PARTIAL, 6);
});

test('I-141 (C-045): the final read times out and the tab is gone: partial with the frames up to the last poll, diag, no address', async () => {
  const h = harness({ fail: (expr, at) => (at >= 45000 ? 'Runtime.evaluate timed out after 15000ms (is another inspector client attached…)' : null), reconnectTo: 'fail' });
  const r = await h.run();
  assert.equal(r.partial, true);
  assert.equal(r.rec.partial, true);
  assert.equal(r.rec.frames.length, 400, 'up to the poll at 40 s');
  assert.match(r.reason, /^the final read failed \(Runtime\.evaluate timed out after 15000ms/);
  assert.match(r.reason, /frames up to the last poll$/);
  const [d] = r.rec.diag;
  assert.equal(d.phase, 'final');
  assert.equal(d.afterSec, 45);
  assert.deepEqual(d.tabs, [{ url: 'http://lan-host:5401/', appId: 'PID:613', title: 'Fastwork mirror' }, { url: 'https://mail.invalid/inbox', appId: 'PID:613' }], 'titles only on the recording\'s host');
  assert.deepEqual(d.reconnect, { ok: false, error: 'BLOCKED: cannot reach Safari tab (no page target)' });
  assert.deepEqual(h.reconnects, ['10.1.2.3:5401'], 'one reconnect, to the recording\'s host');
  assert.doesNotMatch(JSON.stringify({ ...r.rec, href: null }), /10\.1\.2\.3/, 'nothing but the top-level href (lanSafeRecord) names the address');
});

test('I-141: a read that fails once but the logger is still there after the reconnect: the run goes on (recovered), the final read is whole', async () => {
  let failed = 0;
  const h = harness({ fail: (expr, at, conn) => (conn === 'c1' && at === 20000 && !failed++ ? 'Runtime.evaluate timed out after 15000ms' : null) });
  const r = await h.run();
  assert.equal(r.partial, false);
  assert.equal(r.rec.recovered, true);
  assert.equal(r.rec.frames.length, 450);
  assert.equal(r.rec.diag.length, 1);
  assert.deepEqual(r.rec.diag[0].reconnect, { ok: true, href: 'http://lan-host:5401/', visibilityState: 'visible', readyState: 'complete', logger: true, loggerFrames: 200, sameDocument: true });
  assert.ok(h.evals.filter((e) => e.at > 20000).every((e) => e.conn === 'c2'), 'the rest of the run uses the new connection');
});

test('I-141: the page navigated away mid-run (a link): the next poll sees no logger; partial at once with where the tab went', async () => {
  const h = harness();
  const r = await h.run({ sleep: async (ms) => { h.clock.sleep(ms); if (h.clock.now() - h.page.t0 >= 25000) h.page.reloaded = true; } });
  assert.equal(r.partial, true);
  assert.equal(r.rec.frames.length, 200, 'up to the poll at 20 s');
  assert.match(r.reason, /^a poll 25 s into the run failed \(the page has no frame logger \(window\.__fr\): it was reloaded or navigated\); after a reconnect the tab shows https:\/\/other\.invalid\/next \(visible\) without this run's logger/);
  assert.equal(r.rec.diag[0].reconnect.sameDocument, false);
  assert.ok(h.clock.now() - h.page.t0 < 45000, 'it ends at once, not after --seconds');
});

test('I-141: a second failure after the one reconnect ends the run as partial (one reconnect per run)', async () => {
  const h = harness({ fail: (expr, at, conn) => ((conn === 'c1' && at === 10000) || at >= 45000 ? 'Runtime.evaluate timed out after 15000ms' : null) });
  const r = await h.run();
  assert.equal(r.partial, true);
  assert.equal(r.rec.diag.length, 2);
  assert.equal(r.rec.diag[1].reconnect, 'not tried: one reconnect per run, already used');
  assert.equal(h.reconnects.length, 1);
  assert.equal(r.rec.frames.length, 400);
  assert.equal(r.rec.recovered, true, 'the first failure was recovered');
});

test('I-141: tabsForDiag names a proxy error without an address, and the poll expression reads only the new frames', () => {
  assert.deepEqual(R.tabsForDiag({ error: 'fetch failed http://192.168.1.20:9222/json' }, 'x'), { error: 'fetch failed http://lan-host:9222/json' });
  assert.match(R.RECORD_POLL_JS(120), /r\.frames\.slice\(120, n\)/);
  assert.match(R.RECORD_POLL_JS('x'), /r\.frames\.slice\(0, n\)/, 'never anything but a number in the expression');
});

// ---- I-218: `record --touches` (article clips: the user's finger gesture, replayed by WDA) ----------------------------
// A second in-page expression (RECORD_TOUCHES_JS) adds passive touch listeners to the record's own logger (window.__fr):
// rows in gesture-rec.mjs's touch layout plus clientX. RECORD_JS / RECORD_STOP_JS stay pinned (iphone-unchanged); the
// polls carry the new touches only when asked, so a record without --touches sends exactly what it sent before.
import vm from 'node:vm';
function touchWindow() {
  let now = 1000;
  const rafQ = [], listeners = [];
  const win = { scrollY: 0, innerWidth: 430, innerHeight: 775, location: { href: 'http://10.1.2.3:5401/' }, performance: { now: () => now },
    requestAnimationFrame: (cb) => { rafQ.push(cb); return rafQ.length; }, addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }), JSON, Math };
  win.window = win;
  const ctx = vm.createContext(win);
  return {
    win, listeners, run: (js) => vm.runInContext(js, ctx),
    frame(dt = 16.7) { now += dt; rafQ.splice(0).forEach((cb) => cb(now)); },
    dispatch(type, { touches = 1, x = 215, y = 500, ts } = {}) {
      const e = { type, cancelable: true, defaultPrevented: false, touches: { length: touches }, changedTouches: [{ clientX: x, clientY: y }], ...(ts === undefined ? {} : { timeStamp: ts }) };
      for (const l of listeners.filter((q) => q.type === type)) l.fn(e);
    },
  };
}

test('I-218: RECORD_TOUCHES_JS adds passive touch listeners to the record logger: gesture-rec rows + clientX; needs RECORD_JS first; idempotent; stops with the logger', () => {
  const w = touchWindow();
  assert.equal(w.run(R.RECORD_TOUCHES_JS), 'no logger', 'only on top of the record logger');
  assert.equal(w.run(R.RECORD_JS), 'ok');
  assert.equal(w.run(R.RECORD_TOUCHES_JS), 'installed');
  assert.equal(w.run(R.RECORD_TOUCHES_JS), 'already installed');
  assert.deepEqual(w.listeners.map((l) => [l.type, l.opts.passive, l.opts.capture]), [['touchstart', true, true], ['touchend', true, true], ['touchcancel', true, true], ['touchmove', true, false]], 'passive: never blocks scrolling');
  w.frame();
  w.dispatch('touchstart', { y: 600, x: 210.6, ts: 1016.7 });
  w.win.scrollY = 12.4;
  w.dispatch('touchmove', { y: 580.4, x: 211 });
  w.dispatch('touchend', { touches: 0, y: 560, x: 212 });
  assert.deepEqual(R.TOUCH_FIELDS, ['t', 'kind', 'touches', 'cancelable', 'defaultPrevented', 'scrollY', 'clientY', 'timeStamp', 'clientX']);
  const r = JSON.parse(w.run(R.RECORD_STOP_JS));
  assert.deepEqual(r.touches, [[1016.7, 's', 1, 1, 0, 0, 600, 1016.7, 211], [1016.7, 'm', 1, 1, 0, 12, 580, null, 211], [1016.7, 'e', 0, 1, 0, 12, 560, null, 212]]);
  assert.equal(r.frames.length, 1, 'the frame log is the record\'s own, unchanged');
  w.dispatch('touchstart');
  assert.equal(r.touches.length, 3);
  assert.equal(JSON.parse(w.run('JSON.stringify(window.__fr.touches)')).length, 3, 'after the stop read no more touches are logged');
});

test('I-218: recordRun({touches}) polls the new touches with the frames and saves them as it goes; the final read carries them; without it the polls are unchanged', async () => {
  let t = 0;
  const touches = [], frames = [];
  const page = { stop: false };
  const conn = { closed: null, close() { this.closed = { self: true }; }, evals: [],
    async evaluate(expr) {
      this.evals.push(expr);
      frames.push([t, 100, t / 10, 775]); touches.push([t, 'm', 1, 1, 0, t / 10, 500 - t / 20, t, 215]);
      if (expr === R.RECORD_STOP_JS) { page.stop = true; return JSON.stringify({ frames, touches, href: 'http://h.invalid/', vw: 430, vh0: 775, stop: true }); }
      const m = expr.match(/r\.frames\.slice\((\d+), n\)/), k = expr.match(/r\.touches\.slice\((\d+), k\)/);
      return JSON.stringify({ n: frames.length, href: 'http://h.invalid/', vw: 430, vh0: 775, f: frames.slice(Number(m[1])), ...(k ? { k: touches.length, tt: touches.slice(Number(k[1])) } : {}) });
    } };
  const saves = [];
  const r = await R.recordRun({ c: conn, seconds: 12, href: 'http://h.invalid/', pollSec: 5, touches: true, save: async (x) => saves.push(JSON.parse(JSON.stringify(x))), sleep: async (ms) => { t += ms; }, now: () => t });
  assert.equal(r.partial, false);
  assert.deepEqual(saves.map((s) => s.touches.length), [1, 2], 'each partial save holds every touch so far');
  assert.ok(conn.evals[0].includes('r.touches.slice(0, k)') && conn.evals[1].includes('r.touches.slice(1, k)'), 'each poll asks only for the touches since the last one');
  assert.equal(r.rec.touches.length, 3, 'the final read is authoritative and carries the touches');
  // without touches: exactly the old poll expression, and no touches key in the saves
  const conn2 = { ...conn, evals: [] };
  t = 0; frames.length = 0; touches.length = 0; saves.length = 0;
  await R.recordRun({ c: conn2, seconds: 12, href: 'http://h.invalid/', pollSec: 5, save: async (x) => saves.push(x), sleep: async (ms) => { t += ms; }, now: () => t });
  assert.deepEqual(conn2.evals.slice(0, 2), [R.RECORD_POLL_JS(0), R.RECORD_POLL_JS(1)]);
  assert.ok(saves.every((s) => !('touches' in s)));
  assert.match(R.RECORD_POLL_TOUCHES_JS('x', 'y'), /r\.frames\.slice\(0, n\).*r\.touches\.slice\(0, k\)/, 'never anything but a number in the expression');
});

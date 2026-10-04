// The console's shared top bar and notifications end to end (ts-console-nav): `console.mjs serve --notify --remind`
// on a temp state dir ($FW_STATE_DIR) with $FW_CONSOLE_NOTIFY_LOG (the notifier writes its osascript argv there
// instead of running osascript). Checks: the same menu on both pages, the shared assets, nothing external in anything
// served, /api/waiting (the badge count), /api/events (a new step arrives within 2 s), the --notify argv per new step
// and one reminder, the localhost guard. No port 5173 or 5559, no real osascript, phone, Chrome, locks or store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { tempDir, node, tool, startProc, request, sleep } from '../helpers.mjs';

const CON = tool('console.mjs');
const LAN = 'http://192.168.77.12:5497/';
let state, env, srv, base, notifyLog;
const cli = (...a) => node(CON, a, { env });
const get = async (p, headers = {}) => request(new URL(p, base).href, { headers });
const postedId = (r) => { assert.equal(r.code, 0, r.out); const m = r.stdout.match(/^POSTED (C-\d+): /m); assert.ok(m, r.stdout); return m[1]; };
const notifyLines = () => (existsSync(notifyLog) ? readFileSync(notifyLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const bodies = () => notifyLines().map((l) => `${l.argv[6]} | ${l.argv[7]}`);
async function until(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await sleep(50); } }

/** Open GET /api/events; returns {events: [parsed data], close()}. */
function sse() {
  const events = [];
  let buf = '';
  const req = http.get(new URL('api/events', base), (res) => {
    events.status = res.statusCode; events.type = res.headers['content-type'];
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (ev === 'waiting' && data) events.push({ at: Date.now(), v: JSON.parse(data) });
      }
    });
  });
  req.on('error', () => {});
  return { events, close: () => req.destroy() };
}

before(async () => {
  state = tempDir('fw-console-nav-e2e-');
  notifyLog = join(state, 'notify.log');
  env = { FW_STATE_DIR: state, FW_CONSOLE_NOTIFY_LOG: notifyLog };
  // a step that exists before the server starts: no notification for it (the watcher seeds silently)
  postedId(node(CON, ['post', '--by', 'lead', '--kind', 'question', '--title', 'Before the server'], { env }));
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0', '--notify', '--remind', '0.03'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('serve --notify: prints that notifications are on; a bad --remind is refused', async () => {
  assert.notEqual(srv.port, 5173); assert.notEqual(srv.port, 5559);
  await until(() => /notifications on/.test(srv.stdout()), 3000); // printed just after CONSOLE_URL
  assert.match(srv.stdout(), /macOS notifications on \(new steps; reminder after 0\.03 min\)/);
  const bad = node(CON, ['serve', '--port', '0', '--remind', 'soon'], { env: { FW_STATE_DIR: tempDir('fw-console-nav-bad-') } });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--remind must be minutes/);
});

test('both pages: the same top bar (Your steps + badge, Progress), the current one highlighted; shared assets; nothing external', async () => {
  const steps = await get('/'), prog = await get('/progress');
  assert.equal(steps.status, 200); assert.equal(prog.status, 200);
  const menu = (t) => t.match(/<nav class="menu"[\s\S]*?<\/nav>/)[0];
  assert.match(menu(steps.text), /class="mbtn on" aria-current="page" title="[^"]*" href="\/">Your steps<span class="badge" data-badge hidden>0<\/span>/);
  assert.match(menu(prog.text), /class="mbtn on" aria-current="page" title="[^"]*" href="\/progress">Progress</);
  assert.match(menu(prog.text), /href="\/">Your steps<span class="badge" data-badge/, 'the badge shows on the Progress page too');
  assert.equal(menu(steps.text).replace(' on" aria-current="page', ''), menu(prog.text).replace(' on" aria-current="page', ''));
  for (const p of [steps, prog]) {
    assert.ok(!p.text.includes('<!--console-menu-->'), 'the slot is filled');
    assert.match(p.text, /<script src="\/console-nav\.js"><\/script>/);
    assert.match(p.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'/);
  }
  const js = await get('/console-nav.js'), css = await get('/console-nav.css');
  assert.equal(js.status, 200); assert.match(js.headers['content-type'], /text\/javascript/);
  assert.equal(css.status, 200); assert.match(css.headers['content-type'], /text\/css/);
  for (const r of [steps, prog, js, css]) {
    const t = r.text.replace(/http:\/\/www\.w3\.org[^"']*/g, '');
    assert.ok(!/https?:\/\/(?!localhost)[a-z0-9]/i.test(t), `nothing external: ${(t.match(/https?:\/\/(?!localhost)\S+/i) || [])[0]}`);
    assert.ok(!/\b(src|href)=["']\/\//.test(t), 'no protocol-relative URLs');
  }
});

test('/api/waiting and /api/events: the badge count, a new step within 2 s, sanitized titles, --notify once per new step', async () => {
  const w0 = JSON.parse((await get('/api/waiting')).text);
  assert.equal(w0.count, 1);
  assert.deepEqual(w0.steps.map((s) => s.title), ['Before the server']);
  const feed = sse();
  await until(() => feed.events.length >= 1);
  assert.equal(feed.events.status, 200);
  assert.match(feed.events.type, /^text\/event-stream/);
  assert.equal(feed.events[0].v.count, 1, 'the current state at once');
  const t0 = Date.now();
  const id = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'action', '--title', `Open ${LAN} "now"; $(id)`, '--url', LAN, '--instructions', `Load ${LAN}`, '--meta', '{"key":"secret-key"}'));
  const got = await until(() => feed.events.find((e) => e.v.steps.some((s) => s.id === id)), 3000);
  assert.ok(got, 'the new step arrived on the event stream');
  assert.ok(got.at - t0 <= 2000, `within 2 s (took ${got.at - t0} ms)`);
  assert.equal(got.v.count, 2);
  const w1 = (await get('/api/waiting')).text;
  assert.equal(JSON.parse(w1).count, 2);
  for (const bad of ['192.168', 'http:', 'secret-key', 'Load ']) assert.ok(!w1.includes(bad), `${bad} leaked: ${w1}`);
  assert.equal(JSON.parse(w1).steps.find((s) => s.id === id).title, 'Open <link> "now"; $(id)');

  const line = await until(() => notifyLines().find((l) => l.argv[7].startsWith(`${id}: `)));
  assert.ok(line, 'a macOS notification for the new step');
  assert.equal(line.cmd, '/usr/bin/osascript');
  assert.deepEqual(line.argv.slice(0, 6), ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run']);
  assert.deepEqual(line.argv.slice(6), ['Console: new step', `${id}: Open <link> "now"; $(id)`]);
  assert.ok(!bodies().some((b) => b.includes('Before the server') && b.startsWith('Console: new step')), 'no notification for a step that was there at start');

  // one reminder after --remind (0.03 min = 1.8 s) on the user's turn; none for a gated pair the agent still loads
  const lease = node(tool('lock.mjs'), ['acquire', 'iphone', '--owner', 'iphone-runner', '--ttl', '900'], { env });
  assert.equal(lease.code, 0, `a swipe pair's poster holds the iphone lease (I-123): ${lease.out}`);
  const pair = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'swipe-pair', '--title', 'Pair 9', '--url', 'http://a.invalid/', '--url2', 'http://b.invalid/'));
  const rem = await until(() => bodies().find((b) => b.startsWith('Console: still waiting for you | ') && b.includes(`${id}: `)), 5000);
  assert.ok(rem, `a reminder: ${bodies().join('\n')}`);
  await sleep(2500);
  const all = bodies();
  assert.equal(all.filter((b) => b.includes(`${id}: `) && b.startsWith('Console: still waiting')).length, 1, 'only once');
  assert.equal(all.filter((b) => b.includes(`${id}: `) && b.startsWith('Console: new step')).length, 1, 'new only once');
  assert.ok(all.some((b) => b === `Console: new step | ${pair}: Pair 9`));
  assert.ok(!all.some((b) => b.startsWith('Console: still waiting') && b.includes(pair)), 'no reminder while the agent loads the gated part');
  assert.ok(feed.events.length >= 2);
  for (const l of notifyLines()) assert.ok(!JSON.stringify(l).includes('192.168'), 'no LAN address in any notification');

  // finished (here: withdrawn by its agent): the badge count drops at once
  const c = cli('cancel', id, '--by', 'iphone-runner');
  assert.equal(c.code, 0, c.out);
  const dropped = await until(() => feed.events.find((e) => !e.v.steps.some((s) => s.id === id)), 3000);
  assert.ok(dropped, 'the finished step left the feed');
  feed.close();
  for (const s of [pair, 'C-001']) cli('cancel', s, '--by', 'lead');
});

test('the new endpoints are localhost only and read-only', async () => {
  const port = new URL(base).port;
  for (const p of ['/api/waiting', '/api/events', '/console-nav.js']) assert.equal((await get(p, { host: `evil.invalid:${port}` })).status, 421, p);
  assert.equal((await request(new URL('api/waiting', base).href, { method: 'POST', headers: { 'x-console': '1' } })).status, 404);
});

test('serve without --notify runs no notifier', async () => {
  const st = tempDir('fw-console-nav-quiet-');
  const log = join(st, 'notify.log');
  const e2 = { FW_STATE_DIR: st, FW_CONSOLE_NOTIFY_LOG: log };
  const s2 = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env: e2, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  try {
    assert.ok(!/notifications on/.test(s2.stdout()));
    postedId(node(CON, ['post', '--by', 'lead', '--kind', 'question', '--title', 'Quiet'], { env: e2 }));
    const w = await until(async () => { const r = await request(new URL('api/waiting', s2.url).href); const v = JSON.parse(r.text); return v.count === 1 && v; });
    assert.equal(w.count, 1);
    await sleep(800);
    assert.ok(!existsSync(log), 'off by default');
  } finally { await s2.stop(); }
  writeFileSync(join(st, 'done'), '');
});

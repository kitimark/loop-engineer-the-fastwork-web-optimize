// tools/console.mjs end to end (ts-user-console): the page server on a temp state dir ($FW_STATE_DIR), steps posted
// with the CLI, the user's clicks sent over HTTP like the page sends them, and `console.mjs wait` exiting by itself
// (MET 0 with the answer as JSON, TIMEOUT 3, NEVER 4). No port 5173, no phone, no Chrome, no real locks or store.
// Example URLs use reserved .invalid hosts (no LAN addresses in committed tests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { tempDir, node, nodeAsync, tool, sleep, startProc } from '../helpers.mjs';

const CON = tool('console.mjs');
let state, env, srv, base;
const cli = (...a) => node(CON, a, { env });
const cliAsync = (...a) => nodeAsync(CON, a, { env });

/** One HTTP request to the console: {status, json, text}. */
function req(path, { method = 'GET', body, headers = {}, host } = {}) {
  return new Promise((res, rej) => {
    const u = new URL(path, base);
    const data = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request(u, { method, headers: { ...(data && { 'content-type': 'application/json' }), ...(host && { host }), ...headers } }, (resp) => {
      let t = ''; resp.setEncoding('utf8'); resp.on('data', (d) => (t += d));
      resp.on('end', () => { let json; try { json = JSON.parse(t); } catch {} res({ status: resp.statusCode, headers: resp.headers, json, text: t }); });
    });
    r.on('error', rej);
    if (data) r.write(data);
    r.end();
  });
}
const click = (id, action, body = {}) => req(`/api/steps/${id}/${action}`, { method: 'POST', body, headers: { 'x-console': '1' } });
const postedId = (r) => { assert.equal(r.code, 0, r.out); const m = r.stdout.match(/^POSTED (C-\d+): /m); assert.ok(m, r.stdout); return m[1]; };
/** I-123 (f): a phone step's poster holds the iphone lease (on this temp store); hand it over from the last holder. */
let phoneHolder = null;
function holdPhone(by) {
  if (phoneHolder === by) return;
  if (phoneHolder) assert.equal(node(tool('lock.mjs'), ['release', 'iphone', '--owner', phoneHolder], { env }).code, 0);
  const r = node(tool('lock.mjs'), ['acquire', 'iphone', '--owner', by, '--ttl', '900'], { env });
  assert.equal(r.code, 0, r.out);
  phoneHolder = by;
}

before(async () => {
  state = tempDir('fw-console-e2e-');
  env = { FW_STATE_DIR: state };
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

test('serve: localhost URL, server.json in the store, the page, a second serve reuses it, url prints it', async () => {
  assert.match(base, /^http:\/\/localhost:\d+\/$/);
  assert.notEqual(srv.port, 5173);
  const sj = JSON.parse(readFileSync(join(state, 'console', 'server.json'), 'utf8'));
  assert.deepEqual([sj.url, sj.port, sj.pid], [base, srv.port, srv.proc.pid]);
  const page = await req('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /<title>User console<\/title>/);
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.ok(!/https?:\/\/(?!localhost)[a-z]/i.test(page.text.replace(/http:\/\/www\.w3\.org[^"']*/g, '')), 'the page loads nothing from outside');
  const again = cli('serve', '--port', '0');
  assert.equal(again.code, 0, again.out);
  assert.match(again.stdout, new RegExp(`^CONSOLE_URL=${base}$`, 'm'));
  assert.match(again.stdout, /already running/);
  const u = cli('url');
  assert.equal(u.code, 0, u.out);
  assert.equal(u.stdout.trim(), `CONSOLE_URL=${base}`);
});

test('the API refuses a foreign Host (DNS rebinding) and a POST without x-console (other origins)', async () => {
  assert.equal((await req('/api/steps', { host: 'evil.invalid' })).status, 421);
  const id = postedId(cli('post', '--by', 'lead', '--kind', 'question', '--title', 'Guard check'));
  const r = await req(`/api/steps/${id}/start`, { method: 'POST', body: {} });
  assert.equal(r.status, 403);
  assert.equal(cli('show', id, '--json').code, 0);
  assert.equal(JSON.parse(cli('show', id, '--json').stdout).status, 'pending', 'nothing changed');
  assert.equal(cli('cancel', id, '--by', 'lead').code, 0);
});

test('swipe pair: wait --until started exits MET on Start, recording after ack, Done, part 2, the pick as JSON', async () => {
  holdPhone('iphone-runner');
  const id = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'swipe-pair', '--title', 'Pair 3: which follows your finger better?',
    '--instructions', 'Swipe each page the same way, then pick.', '--url', 'http://page-a.invalid:5401/', '--url2', 'http://page-b.invalid:5402/', '--meta', '{"key":"1=A"}'));
  // the page sees it, blind: no URLs, no meta
  const list = await req('/api/steps');
  const v = list.json.steps.find((s) => s.id === id);
  assert.deepEqual([v.status, v.parts.map((p) => p.state).join()], ['pending', 'waiting,waiting']);
  assert.ok(!list.text.includes('.invalid') && !list.text.includes('1=A'), 'blind: no URLs or key on the page');
  // gated: Start refused until the runner says ready
  const early = await click(id, 'start', { part: 1 });
  assert.equal(early.status, 409);
  assert.match(early.json.error, /not ready yet/);
  const w1 = cliAsync('wait', id, '--until', 'started', '--part', '1', '--timeout', '30');
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '1', '--state', 'loading', '--message', 'opening page 1').code, 0);
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '1', '--state', 'ready').code, 0);
  await sleep(400);
  const t0 = Date.now();
  const st = await click(id, 'start', { part: 1 });
  assert.equal(st.status, 200, st.text);
  assert.equal(st.json.step.parts[0].state, 'started');
  const r1 = await w1;
  assert.equal(r1.code, 0, r1.out);
  assert.match(r1.stdout, new RegExp(`^MET console ${id} part 1 started: \\{"id":"${id}","part":1,"state":"started","at":"[^"]+","attempt":1,"epoch":0\\} \\(after \\d+ s\\)\\n$`));
  assert.ok(Date.now() - t0 < 5000, 'the runner hears Start within seconds');
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '1', '--state', 'recording').code, 0);
  assert.equal((await req('/api/steps')).json.steps.find((s) => s.id === id).parts[0].state, 'recording', 'the page shows "recording… swipe now"');
  const d1 = cliAsync('wait', id, '--until', 'done', '--part', '1', '--timeout', '30', '--json', '--quiet');
  await sleep(300);
  assert.equal((await click(id, 'done', { part: 1 })).status, 200);
  const rd = await d1;
  assert.equal(rd.code, 0, rd.out);
  assert.equal(JSON.parse(rd.stdout).state, 'done', '--json prints the JSON alone');
  assert.equal(rd.stderr, '', '--quiet');
  // part 2, then the pick
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--state', 'ready').code, 0);
  assert.equal((await click(id, 'start', { part: 2 })).status, 200);
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--state', 'recording').code, 0);
  assert.equal((await click(id, 'done', { part: 2 })).status, 200);
  const wa = cliAsync('wait', id, '--until', 'answered', '--timeout', '30');
  await sleep(300);
  const bad = await click(id, 'answer', { value: 'maybe' });
  assert.equal(bad.status, 409);
  assert.equal((await click(id, 'answer', { value: '2', notes: 'page 2 lagged at the hero' })).status, 200);
  const ra = await wa;
  assert.equal(ra.code, 0, ra.out);
  const m = ra.stdout.match(/^MET console (C-\d+) answered: (\{.*\}) \(after \d+ s\)$/m);
  assert.ok(m, ra.stdout);
  const ans = JSON.parse(m[2]);
  assert.deepEqual([ans.value, ans.notes, ans.meta, ans.by], ['2', 'page 2 lagged at the hero', { key: '1=A' }, 'iphone-runner']);
  // the lead sees it without the user retyping it
  const l = cli('list');
  assert.match(l.stdout, new RegExp(`^${id} {2}\\[answered\\] {2}swipe-pair {2}by iphone-runner: Pair 3: which follows your finger better\\? -> "2" \\(notes: page 2 lagged at the hero\\)$`, 'm'));
  assert.ok(!cli('list', '--pending').stdout.includes(id));
  const sh = cli('show', id);
  assert.match(sh.stdout, /meta: \{"key":"1=A"\}/);
  assert.match(sh.stdout, /user done part 2/);
});

test('wait: NEVER (exit 4) when the user skips, TIMEOUT (exit 3), the user brings it back; usage errors exit 1', async () => {
  holdPhone('fix-x');
  const id = postedId(cli('post', '--by', 'fix-x', '--kind', 'action', '--title', 'Finger scroll top to bottom', '--record'));
  const t = cli('wait', id, '--until', 'started', '--timeout', '1', '--quiet');
  assert.equal(t.code, 3, t.out);
  assert.match(t.stdout, new RegExp(`^TIMEOUT console ${id} part 1 started after 1 s: pending, part 1 waiting$`, 'm'));
  const w = cliAsync('wait', id, '--until', 'started', '--timeout', '30');
  await sleep(400);
  assert.equal((await click(id, 'skip', { notes: 'phone is hot' })).status, 200);
  const r = await w;
  assert.equal(r.code, 4, r.out);
  assert.match(r.stdout, new RegExp(`^NEVER console ${id} part 1 started: the user skipped it \\(not now\\): phone is hot; node tools/console.mjs reopen ${id}`, 'm'));
  assert.equal((await click(id, 'reopen')).status, 200, 'the page’s "Bring back"');
  assert.equal(JSON.parse(cli('show', id, '--json').stdout).status, 'pending');
  assert.equal((await click(id, 'reopen')).status, 409);
  assert.equal((await click(id, 'fly')).status, 404);
  assert.equal(cli('wait', 'C-999').code, 1);
  assert.equal(cli('wait', id, '--until', 'soon').code, 1);
  assert.equal(cli('post', '--kind', 'question', '--title', 'x').code, 1, '--by required');
  const a = cli('ack', id, '--by', 'fix-x', '--state', 'recording');
  assert.equal(a.code, 1);
  assert.match(a.stderr, /has not clicked Start yet/);
  // the lead answers for the user who replied in chat
  const q = postedId(cli('post', '--by', 'lead', '--kind', 'question', '--title', 'Phone charged?'));
  const an = cli('answer', q, '--by', 'lead', '--value', 'yes');
  assert.equal(an.code, 0, an.out);
  assert.equal(JSON.parse(cli('show', q, '--json').stdout).history.at(-1).who, 'lead');
  assert.equal(cli('cancel', id, '--by', 'fix-x').code, 0, 'one phone step at a time (I-123): done with it');
});

test('I-059 --runner-ends: the page\'s Done is refused (403, plain message) on a runner-ended part; the runner\'s ack done ends it', async () => {
  const parts = JSON.stringify([{ label: 'Open the page' }, { label: 'Versions 1-4 play' }]);
  const bad = cli('post', '--by', 'iphone-runner', '--kind', 'action', '--title', 'x', '--parts', parts, '--runner-ends', '3');
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--runner-ends takes part numbers 1-2/);
  const id = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'action', '--title', 'Visual check', '--parts', parts, '--runner-ends', '2'));
  assert.match(cli('show', id).stdout, /part 2 Versions 1-4 play: waiting runner-ends/);
  assert.doesNotMatch(cli('show', id).stdout, /part 1 Open the page: waiting runner-ends/);
  // part 1 is the user's, as before
  assert.equal((await click(id, 'start', { part: 1 })).status, 200);
  assert.equal((await click(id, 'done', { part: 1 })).status, 200);
  const st = await click(id, 'start', { part: 2 });
  assert.equal(st.status, 200);
  assert.equal(st.json.step.parts[1].ends, 'runner');
  const wd = cliAsync('wait', id, '--until', 'done', '--part', '2', '--timeout', '30', '--json', '--quiet');
  const d = await click(id, 'done', { part: 2 });
  assert.equal(d.status, 403, d.text);
  assert.match(d.json.error, /part 2 \(Versions 1-4 play\) ends by itself: iphone-runner marks it done when it has finished\. Nothing to tap; the console will say when\./);
  assert.equal((await req('/api/steps')).json.steps.find((s) => s.id === id).parts[1].state, 'started', 'the refused Done changed nothing');
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--message', 'version 4 of 4').code, 0);
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--state', 'done').code, 0);
  const r = await wd;
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(r.stdout).state, 'done');
  const v = JSON.parse(cli('show', id, '--json').stdout);
  assert.deepEqual([v.status, v.result.value], ['answered', 'done'], 'the last part, ended by the runner, finishes the action');
  // the page serves the runner-ended text
  assert.match((await req('/')).text, /Running, please wait; this ends by itself\./);
});

test('I-059 B Start over: the page\'s restart wakes the runner\'s waits (exit 5 REDO, --until redo MET), a stale ack --attempt exits 1', async () => {
  const parts = JSON.stringify([{ label: 'Open the page' }, { label: 'Versions play', ends: 'runner' }]);
  const id = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'action', '--title', 'Visual check', '--parts', parts));
  assert.equal((await click(id, 'restart')).status, 409, 'nothing to start over before the first Start');
  assert.equal((await click(id, 'start', { part: 1 })).status, 200);
  assert.equal((await click(id, 'done', { part: 1 })).status, 200);
  const ws = cli('wait', id, '--until', 'started', '--part', '2', '--timeout', '1', '--json', '--quiet');
  assert.equal(ws.code, 3, 'not started yet');
  assert.equal((await click(id, 'start', { part: 2 })).status, 200);
  const wd = cliAsync('wait', id, '--until', 'done', '--part', '2', '--timeout', '30', '--quiet');
  const wr = cliAsync('wait', id, '--until', 'redo', '--timeout', '30', '--json', '--quiet');
  await sleep(600);
  const rs = await click(id, 'restart', { notes: 'I tapped the wrong thing' });
  assert.equal(rs.status, 200, rs.text);
  assert.deepEqual([rs.json.step.cur, rs.json.step.epoch, rs.json.step.parts.map((p) => p.attempt)], [0, 1, [2, 2]]);
  const d = await wd;
  assert.equal(d.code, 5, d.out);
  const m = d.stdout.match(new RegExp(`^REDO console ${id} part 2 done: (\\{.*\\}) \\(after \\d+ s\\)$`, 'm'));
  assert.ok(m, d.stdout);
  assert.deepEqual((({ action, by, part, attempts, epoch, note }) => ({ action, by, part, attempts, epoch, note }))(JSON.parse(m[1])),
    { action: 'restart', by: 'user', part: 1, attempts: [2, 2], epoch: 1, note: 'I tapped the wrong thing' });
  const r = await wr;
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(r.stdout).action, 'restart', '--until redo: MET with the JSON alone');
  // the old cycle's late ack is refused; the new attempt's acks work
  assert.equal((await click(id, 'start', { part: 1 })).status, 200);
  assert.equal((await click(id, 'done', { part: 1 })).status, 200);
  assert.equal((await click(id, 'start', { part: 2 })).status, 200);
  const stale = cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--attempt', '1', '--state', 'done');
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /is at attempt 2: your ack for attempt 1 is stale \(user started over at /);
  const wd2 = cli('wait', id, '--until', 'started', '--part', '2', '--timeout', '5', '--json', '--quiet');
  assert.equal(wd2.code, 0, wd2.out);
  assert.equal(JSON.parse(wd2.stdout).attempt, 2, 'the MET JSON names the attempt (for file labels)');
  assert.equal(cli('ack', id, '--by', 'iphone-runner', '--part', '2', '--attempt', '2', '--state', 'done').code, 0);
  const sh = cli('show', id);
  assert.match(sh.stdout, /part 2 Versions play: done runner-ends attempt 2/);
  assert.match(sh.stdout, /user restart part 1 \(epoch 1\): I tapped the wrong thing/);
  assert.equal(JSON.parse(cli('show', id, '--json').stdout).status, 'answered');
  // the runner's own redo through the same core also ends a wait with REDO
  holdPhone('iphone-runner');
  const id2 = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'action', '--title', 'Finger scroll', '--record'));
  assert.equal((await click(id2, 'start', { part: 1 })).status, 200);
  const w2 = cliAsync('wait', id2, '--until', 'recording', '--part', '1', '--timeout', '30', '--json', '--quiet');
  await sleep(600);
  assert.equal(cli('redo', id2, '--by', 'iphone-runner', '--part', '1', '--message', 'phone tab crashed').code, 0);
  const r2 = await w2;
  assert.equal(r2.code, 5, r2.out);
  assert.deepEqual((({ action, by, attempts }) => ({ action, by, attempts }))(JSON.parse(r2.stdout)), { action: 'redo', by: 'iphone-runner', attempts: [2] });
});

test('I-140 (C-045): redo prints REDO-ATTEMPT, a stale ack exits 1 with ONE STALE-ATTEMPT line, wait --until started on an unready gated part exits 6 NOT-READY', async () => {
  const parts = JSON.stringify([{ label: 'Hero', gate: true }, { label: 'Footer', gate: true }]);
  const id = postedId(cli('post', '--by', 'runner-x', '--kind', 'action', '--title', 'Gated check', '--parts', parts));
  assert.equal(cli('ack', id, '--by', 'runner-x', '--part', '1', '--attempt', '1', '--state', 'ready').code, 0);
  assert.equal((await click(id, 'start', { part: 1 })).status, 200);
  assert.equal((await click(id, 'done', { part: 1 })).status, 200);
  assert.equal(cli('ack', id, '--by', 'runner-x', '--part', '2', '--attempt', '1', '--state', 'ready').code, 0);
  assert.equal((await click(id, 'start', { part: 2 })).status, 200);
  const rd = cli('redo', id, '--by', 'runner-x', '--part', '2', '--message', 'read failed');
  assert.equal(rd.code, 0, rd.out);
  const m = rd.stdout.match(/^REDO-ATTEMPT (\{.*\})$/m);
  assert.ok(m, rd.stdout);
  assert.deepEqual(JSON.parse(m[1]), { id, part: 2, attempt: 2, attempts: [1, 2], epoch: 1 });
  // the runner's old `attempt` variable: refused, exit 1, one line naming the attempt to use
  const stale = cli('ack', id, '--by', 'runner-x', '--part', '2', '--attempt', '1', '--state', 'ready');
  assert.equal(stale.code, 1, stale.out);
  assert.equal(stale.stderr.trim().split('\n').length, 1, stale.stderr);
  assert.match(stale.stderr, new RegExp(`^STALE-ATTEMPT ${id} part 2: current attempt 2; re-run with --attempt 2 \\(`));
  // the wait that hung for 5 min in C-045: a hint at once on stderr, NOT-READY (exit 6) after the grace
  const w = cli('wait', id, '--until', 'started', '--part', '2', '--timeout', '30', '--ready-grace', '1', '--quiet');
  assert.equal(w.code, 6, w.out);
  assert.match(w.stderr, new RegExp(`^HINT console ${id} part 2 started: part 2 attempt 2 is still 'waiting'.*--attempt 2; without a ready ack this wait ends NOT-READY \\(exit 6\\) after 1 s$`, 'm'));
  const nr = w.stdout.match(new RegExp(`^NOT-READY console ${id} part 2 started: (\\{.*\\}) \\(after \\d+ s\\): ack ready first`, 'm'));
  assert.ok(nr, w.stdout);
  assert.deepEqual((({ part, attempt, state, epoch }) => ({ part, attempt, state, epoch }))(JSON.parse(nr[1])), { part: 2, attempt: 2, state: 'waiting', epoch: 1 });
  const wj = cli('wait', id, '--until', 'started', '--part', '2', '--timeout', '30', '--ready-grace', '0', '--json', '--quiet');
  assert.equal(wj.code, 6);
  assert.equal(JSON.parse(wj.stdout).ack, `node tools/console.mjs ack ${id} --by runner-x --part 2 --state ready --attempt 2`);
  // redo --json: the JSON alone; after the right ack the wait meets on the user's Start
  assert.equal(cli('ack', id, '--by', 'runner-x', '--part', '2', '--attempt', '2', '--state', 'ready').code, 0);
  const ws = cliAsync('wait', id, '--until', 'started', '--part', '2', '--timeout', '30', '--ready-grace', '0', '--quiet');
  await sleep(400);
  assert.equal((await click(id, 'start', { part: 2 })).status, 200);
  const s = await ws;
  assert.equal(s.code, 0, s.out);
  assert.doesNotMatch(s.stderr, /HINT/);
  const rj = cli('redo', id, '--by', 'runner-x', '--part', '2', '--json');
  assert.equal(rj.code, 0, rj.out);
  assert.equal(JSON.parse(rj.stdout).attempt, 3);
  assert.equal(cli('wait', id, '--ready-grace', 'soon').code, 1, 'a bad --ready-grace is a usage error');
  cli('cancel', id, '--by', 'runner-x');
});

test('I-084 post --topic: the page data names who gets the answer (to, topic), the click\'s reply too, show says it; a bad topic exits 1', async () => {
  const id = postedId(cli('post', '--by', 'fix-hero-exit-threaded', '--kind', 'question', '--title', 'Smoother now?', '--topic', 'hero-exit-threaded'));
  const view = (await req('/api/steps')).json.steps.find((s) => s.id === id);
  assert.deepEqual([view.to, view.topic], [['fix-hero-exit-threaded'], 'hero-exit-threaded']);
  assert.equal((await click(id, 'start')).status, 200);
  const ans = await click(id, 'answer', { value: 'yes' });
  assert.equal(ans.status, 200);
  assert.deepEqual(ans.json.step.to, ['fix-hero-exit-threaded'], 'the page\'s confirmation reads it from the reply');
  const show = cli('show', id);
  assert.equal(show.code, 0, show.out);
  assert.match(show.stdout, /^ {2}answers go to: fix-hero-exit-threaded \(topic hero-exit-threaded\)$/m);
  const plain = postedId(cli('post', '--by', 'iphone-runner', '--kind', 'question', '--title', 'No topic'));
  assert.match(cli('show', plain).stdout, /^ {2}answers go to: iphone-runner$/m);
  const bad = cli('post', '--by', 'x', '--kind', 'question', '--title', 'Q', '--topic', 'Not a topic!');
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.stderr, /--topic must be a status \/ PROGRESS id/);
});

test('stopping the server removes server.json; url then reports no server (exit 3)', async () => {
  const s2state = tempDir('fw-console-e2e2-');
  const e2 = { FW_STATE_DIR: s2state };
  const s2 = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env: e2, ready: (s) => /^CONSOLE_URL=/m.test(s) });
  assert.ok(existsSync(join(s2state, 'console', 'server.json')));
  await s2.stop();
  assert.ok(!existsSync(join(s2state, 'console', 'server.json')));
  const u = node(CON, ['url'], { env: e2 });
  assert.equal(u.code, 3, u.out);
  assert.match(u.stdout, /NO SERVER/);
  assert.equal(node(CON, ['serve', '--port', '5173'], { env: e2 }).code, 1, 'never port 5173');
});

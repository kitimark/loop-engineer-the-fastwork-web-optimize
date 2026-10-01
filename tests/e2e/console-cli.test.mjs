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
  assert.match(r1.stdout, new RegExp(`^MET console ${id} part 1 started: \\{"id":"${id}","part":1,"state":"started","at":"[^"]+"\\} \\(after \\d+ s\\)\\n$`));
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

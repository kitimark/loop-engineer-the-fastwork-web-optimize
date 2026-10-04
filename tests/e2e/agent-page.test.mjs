// I-118 (user T-074: "How do I trace the work of wi-stack? The wi-gpu-bundle as well, I cannot track them."): one
// agent's work on one page, end to end. `console.mjs serve` serves /agents, /agent/<name>, /api/agents and
// /api/agent/<name> from a temp state dir (status rows, a console step, a thread, a phone lease, holds.log) and a temp
// git repo as the write-up root (commits tagged "(wi-stack)", fixes/*/README.md); every agent name on Status, Progress
// and Threads links to its page; `status.mjs agent|agents` print the same. A LAN address in a lease, a step and a
// README never shows. No port 5173, phone, Chrome, real locks or real store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc, request, git } from '../helpers.mjs';
import { loadPage } from '../fixtures/page-dom.mjs';

const ST = tool('status.mjs');
const CON = tool('console.mjs');
const LAN = 'http://192.168.77.12:5497/';
let state, repo, env, srv, base, threadId;

const progress = {
  schema: 'fw-progress/1', updatedAt: '2026-10-01T17:00:00Z', updatedBy: 'mgmt-ops-6',
  goal: 'No frame over 50 ms on the iPhone.', complaints: [],
  items: [{ id: 'best-stack', title: 'Best stack', area: 'whole', state: 'testing', stage: 'V', next: 'block 3', owner: 'iphone-runner' }],
};
const commit = (msg) => git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', msg);

before(async () => {
  state = tempDir('fw-agent-e2e-');
  repo = tempDir('fw-agent-e2e-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  for (const m of ['init', 'fix: stack block 2 results (wi-stack)', 'ops: P-095 HIT (mgmt-ops-10)', 'tools: (wi-stack) is not the tag here']) commit(m);
  mkdirSync(join(repo, 'fixes', 'stack5'), { recursive: true });
  writeFileSync(join(repo, 'fixes', 'stack5', 'README.md'), `# Stack 5\n\nBuilt by wi-stack, checked on ${LAN} by wi-stack.\n`);
  const pf = join(state, 'PROGRESS.json'); writeFileSync(pf, JSON.stringify(progress));
  const lf = join(state, 'PREDICTIONS.md'); writeFileSync(lf, '');
  env = { FW_STATE_DIR: state, FW_PROGRESS_FILE: pf, FW_PREDICTIONS_FILE: lf, FW_WRITEUP_ROOT: repo };
  // the stores, written by the real libraries (the same ones the CLIs use)
  process.env.FW_STATE_DIR = state;
  const S = await import('../../tools/lib/status.mjs');
  const C = await import('../../tools/lib/console.mjs');
  const T = await import('../../tools/lib/console-threads.mjs');
  const L = await import('../../tools/lib/lock.mjs');
  await S.set('best-stack', { by: 'iphone-runner', kind: 'fix', title: 'Best stack', state: 'measuring', note: 'block 2' });
  await S.set('best-stack', { by: 'wi-stack', note: 'block 2 on the phone' });
  await S.set('stack-notes', { by: 'wi-stack', kind: 'research', title: 'Stack notes', state: 'done' });
  await C.post({ by: 'wi-stack', kind: 'action', title: 'Swipe the stack build', instructions: `Open ${LAN} and swipe.` });
  const { thread: t } = await T.createThread({ fromPage: true, title: 'How do I trace wi-stack?', text: 'I cannot track it.' }); // the user's, from the page
  threadId = t.id;
  await T.assign(t.id, { to: 'wi-stack', by: 'lead' });
  await T.replyAgent(t.id, { by: 'wi-stack', text: 'Here is what I did.' });
  assert.equal((await L.tryAcquire('iphone', { owner: 'wi-stack', kind: 'lease', ttlSec: 600, meta: { url: LAN, job: { text: `phone check on ${LAN}`, at: new Date().toISOString() } } })).ok, true);
  mkdirSync(L.lockDir(), { recursive: true });
  writeFileSync(L.holdsLogFile(), JSON.stringify({ at: new Date(Date.now() - 600000).toISOString(), resource: 'chrome-measure', owner: 'wi-stack', code: 0, durationSec: 132, start: new Date(Date.now() - 732000).toISOString() }) + '\n');
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

const get = async (p) => request(new URL(p, base).href);

test('/api/agents and /api/agent/<name>: every trace of wi-stack, running now; bad names 400; nothing personal', async () => {
  const lr = await get('api/agents');
  assert.equal(lr.status, 200);
  const l = JSON.parse(lr.text);
  assert.equal(l.schema, 'fw-agents/1');
  const ws = l.agents.find((a) => a.name === 'wi-stack');
  assert.ok(ws && ws.running, JSON.stringify(l.agents));
  assert.equal(ws.href, '/agent/wi-stack');
  assert.match(ws.now, /using the phone now since \d\d:\d\dZ: phone check on <link>/);
  assert.ok(l.agents.some((a) => a.name === 'mgmt-ops-10' && !a.running), 'a commit-only agent is listed as finished');
  const vr = await get('api/agent/wi-stack');
  assert.equal(vr.status, 200);
  const v = JSON.parse(vr.text);
  assert.equal(v.running, true);
  assert.deepEqual(v.commits.map((c) => c.subject), ['fix: stack block 2 results (wi-stack)']);
  assert.deepEqual(v.rows.map((r) => [r.id, r.how]), [['best-stack', 'updated it'], ['stack-notes', 'owns it']]);
  assert.deepEqual(v.steps.map((x) => x.title), ['Swipe the stack build']);
  assert.deepEqual(v.threads.map((x) => [x.id, x.how]), [[threadId, 'wrote 1 message, assigned to it']]);
  assert.deepEqual(v.writeups.map((w) => [w.path, w.mentions]), [['fixes/stack5/README.md', 2]]);
  assert.equal(v.holds.length, 1);
  for (const j of [lr.text, vr.text]) for (const bad of ['192.168', 'http://', 'Open ']) assert.ok(!j.includes(bad), `${bad} leaked`);
  for (const p of ['api/agent/user', 'api/agent/..%2Fx', 'api/agent/a%20b', 'agent/user', 'api/agent/']) assert.equal((await get(p)).status, 400, p);
  const h = await get('agent/wi-stack');
  assert.equal(h.status, 200);
  assert.match(h.text, /class="mbtn on" aria-current="page" title="[^"]*" href="\/agents">Agents</);
  assert.match(h.text, /<script src="\/console-comments.js" data-page="agents" defer><\/script>/);
  const lh = await get('agents');
  assert.equal(lh.status, 200);
  assert.match(lh.text, /href="\/agents">Agents</);
  assert.match((await get('status')).text, /href="\/agents">Agents<\/a>/, 'in the menu of every page');
});

test('/agent/wi-stack and /agents render: right now, rows, commits, write-ups, timeline; names are links', async () => {
  const p = await loadPage(base, '/agent/wi-stack');
  const d = p.document;
  assert.equal(d.getElementById('h1').textContent, 'wi-stack');
  assert.equal(d.getElementById('page-part').getAttribute('data-anchor'), 'agent:wi-stack', 'a comment here goes to wi-stack');
  assert.match(d.getElementById('upd').textContent, /^running now /);
  const sec = (label, doc = d) => doc.querySelectorAll('section').find((s) => s.getAttribute('aria-label') === label); // the fake DOM splits selectors on spaces
  assert.match(sec('Right now').textContent, /using the phone now since \d\d:\d\dZ: phone check on <link>/);
  assert.match(sec('Commits on main tagged (wi-stack)').textContent, /fix: stack block 2 results \(wi-stack\)/);
  assert.ok(sec('Status rows').querySelector('a[href="/status#best-stack"]'), 'the row links to the board');
  assert.ok(sec('Status rows').querySelector('a[href="/agent/iphone-runner"]'), 'its owner links to its own page');
  assert.ok(sec('Write-ups that name it').querySelector('a[href="/writeup/fixes/stack5/README.md"]'));
  assert.ok(sec('Threads').querySelector(`a[href="/threads#${threadId}"]`));
  assert.ok(sec('Steps it asked you for').querySelectorAll('a').some((a) => /^\/#C-\d+$/.test(a.getAttribute('href'))), 'the step links to Your steps');
  assert.match(sec('Steps it asked you for').textContent, /Swipe the stack build/);
  assert.ok(sec('Everything, newest first').querySelectorAll('li').length >= 6);
  assert.ok(!d.body.textContent.includes('192.168'), 'no address on the page');
  const l = await loadPage(base, '/agents');
  const li = l.document.querySelector('li[data-agent="wi-stack"]');
  assert.ok(li && li.querySelector('a[href="/agent/wi-stack"]'), 'the list links each agent');
  assert.match(sec('Running now', l.document).textContent, /wi-stack/);
  assert.match(sec('Finished', l.document).textContent, /mgmt-ops-10/);
});

test('Status, Progress and Threads: every agent name links to /agent/<name>', async () => {
  const hrefs = (n) => n.querySelectorAll('a').map((a) => a.getAttribute('href')).filter((h) => /^\/agent\//.test(h || ''));
  const sp = await loadPage(base, '/status');
  const row = sp.document.querySelector('tr[data-item="best-stack"]');
  assert.deepEqual(hrefs(row), ['/agent/iphone-runner', '/agent/wi-stack'], 'owner, then "by" the last updater');
  assert.match(row.textContent, /by wi-stack/);
  const pp = await loadPage(base, '/progress');
  const ph = hrefs(pp.document.documentElement);
  assert.ok(ph.includes('/agent/wi-stack'), `the phone's runner: ${ph}`);
  assert.ok(hrefs(pp.document.querySelector('section[data-item="best-stack"]')).includes('/agent/iphone-runner'), 'the item owner');
  const tp = await loadPage(base, '/threads', { hash: `#${threadId}` });
  const msgs = tp.document.getElementById('tv-msgs');
  assert.deepEqual(hrefs(msgs), ['/agent/wi-stack'], 'the agent who wrote; "You" stays text');
  assert.ok(hrefs(tp.document.getElementById('tv-meta')).includes('/agent/wi-stack'), 'handled by');
});

test('status.mjs agent <name> | agents: the same in plain text; bad names exit 1', () => {
  let r = node(ST, ['agent', 'wi-stack'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^wi-stack: RUNNING NOW/);
  assert.match(r.stdout, /commits on main:\n.*fix: stack block 2 results \(wi-stack\)/);
  assert.match(r.stdout, /write-ups:\n.*fixes\/stack5\/README\.md \(2 mentions\)/);
  assert.ok(!r.stdout.includes('192.168'));
  r = node(ST, ['agent', 'wi-stack', '--json'], { env });
  assert.equal(JSON.parse(r.stdout).name, 'wi-stack');
  r = node(ST, ['agents'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^RUNNING NOW \(\d+\):\n(?: {2}.*\n)*? {2}wi-stack /m);
  assert.match(r.stdout, /^FINISHED \(\d+\):\n(?: {2}.*\n)*? {2}mgmt-ops-10 /m);
  for (const a of [['agent', 'user'], ['agent', '../x'], ['agent']]) assert.equal(node(ST, a, { env }).code, 1, a.join(' '));
});

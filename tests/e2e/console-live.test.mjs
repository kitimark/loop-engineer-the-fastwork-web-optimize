// I-074 (user T-028) end to end: the console's "Try it" panel. A temp git repo with a committed
// fixes/demo/patch.diff (made on the fixture's site-pretty), the state dir inside its .git (as in production), the fixture
// baseline ($FW_MIRROR_HOME), `console.mjs serve --port 0` with a 4 s idle limit ($FW_CONSOLE_LIVE_IDLE_SEC).
// Checks: `proposal post --live-patch` and `proposal live` (also on an accepted proposal with options) from that repo;
// the proposals page's CSP may frame localhost only; POST /api/live/<id>/start is guarded like the thread POSTs and starts
// two serve.mjs children lazily (A = baseline, B = baseline + the patch's overlay) on 127.0.0.1, never 5173, whose
// documents carry the console's origins in frame-ancestors and no x-frame-options; reuse; ping; `measuring` while a
// timing hold is on; the idle kill and a lazy restart; the console's exit kills its children. No Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir, node, tool, startProc, request, git, sleep } from '../helpers.mjs';
import { makeFixtureHome, PAGE_JS } from '../fixtures/baseline.mjs';
import { writePng } from '../fixtures/fake-media.mjs';

const CON = tool('console.mjs');
let fx, repo, state, env, srv, base, src;
const cli = (...a) => node(CON, ['proposal', ...a], { env, cwd: repo });
const postJson = (p, body, headers = { 'x-console': '1' }) => request(new URL(p, base).href, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const json = (r) => JSON.parse(r.text);
const postedId = (r) => { assert.equal(r.code, 0, r.out); const m = r.stdout.match(/^POSTED (PR-\d+): /m); assert.ok(m, r.stdout); return m[1]; };
/** true when nothing listens at the URL's port any more */
const refused = (url) => new Promise((res) => {
  const u = new URL(url);
  const s = net.connect({ host: u.hostname, port: Number(u.port) });
  s.once('connect', () => { s.destroy(); res(false); });
  s.once('error', () => res(true));
});
async function until(fn, ms = 10000) { for (const t = Date.now() + ms; Date.now() < t;) { if (await fn()) return true; await sleep(100); } return fn(); }

function commitPatch(topic, newText) {
  const gen = tempDir('fw-live-e2e-gen-');
  const rel = PAGE_JS.slice(1);
  git(gen, 'init', '-q', '-b', 'main');
  git(gen, 'config', 'commit.gpgsign', 'false');
  const orig = readFileSync(join(fx.pretty, rel));
  mkdirSync(dirname(join(gen, rel)), { recursive: true });
  writeFileSync(join(gen, rel), orig);
  git(gen, 'add', '-A');
  git(gen, 'commit', '-q', '-m', 'base');
  writeFileSync(join(gen, rel), newText);
  const diff = git(gen, 'diff', '--no-color') + '\n';
  const text = `# fastwork mirror fix: ${topic}\n# baseline: site-pretty/ (Prettier-formatted copy of the production mirror); paths are URL paths\n# base-sha256 ${rel} ${createHash('sha256').update(orig).digest('hex')}\n${diff}`;
  mkdirSync(join(repo, 'fixes', topic), { recursive: true });
  writeFileSync(join(repo, 'fixes', topic, 'patch.diff'), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `fix ${topic}`);
  return git(repo, 'rev-parse', `HEAD:fixes/${topic}/patch.diff`);
}
const proposal = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Countdown faces', area: 'hero', topic: 'demo',
  problem: 'The countdown restyles every second.', idea: 'Swap whole faces.', looksSame: 'Same digits.',
  visualDiff: ['None at 1x.'], risk: 'Low.', gain: [{ what: 'Restyles per second', before: '120', after: '4', tag: 'OBSERVED', how: 'trace' }],
  compare: { a: { label: 'Original' }, b: { label: 'Faces' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'b-0.png' }], view: 'side' },
  ...over,
});
const writeProposal = (name, p) => { const f = join(src, name); writeFileSync(f, JSON.stringify(p)); return f; };

before(async () => {
  const home = tempDir('fw-live-e2e-home-');
  fx = makeFixtureHome(home);
  repo = tempDir('fw-live-e2e-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README'), 'temp\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  state = join(repo, '.git', 'fastwork-mirror');
  env = { FW_STATE_DIR: state, FW_MIRROR_HOME: home, FW_CONSOLE_LIVE_IDLE_SEC: '4' };
  src = tempDir('fw-live-e2e-src-');
  writePng(join(src, 'a-0.png'), 8, 6, [10, 20, 30]);
  writePng(join(src, 'b-0.png'), 8, 6, [10, 20, 30], [250, 250, 250]);
  commitPatch('demo', fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  commitPatch('other', fx.prettyFiles[PAGE_JS] + '/* PoC: other */\n');
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
});
after(async () => { await srv?.stop(); });

let urls;
test('post --live-patch from the repo; the page may frame localhost only; start is guarded; 404 without a live B', async () => {
  const id = postedId(cli('post', '--by', 'de-x', '--file', writeProposal('p1.json', proposal()), '--live-patch', 'fixes/demo/patch.diff'));
  assert.equal(id, 'PR-001');
  assert.match(cli('show', id).stdout, /live B: fixes\/demo\/patch\.diff @ [0-9a-f]{12} \(1 file\(s\) on site-pretty/);
  const bad = cli('post', '--by', 'de-x', '--file', writeProposal('p2.json', proposal()), '--live-patch', 'fixes/nope/patch.diff');
  assert.equal(bad.code, 1);
  assert.match(bad.out, /--live-patch\.patch: .*not committed/);
  // I-109 (user T-063 #2): no Try-it entry, no post; --live-none says why there is no page to try
  const none = cli('post', '--by', 'de-x', '--file', writeProposal('p3.json', proposal({ title: 'No live B' })));
  assert.equal(none.code, 1, none.out);
  assert.match(none.out, /live: required: a Try-it panel \(user T-063, I-109\)/);
  assert.equal(postedId(cli('post', '--by', 'de-x', '--file', join(src, 'p3.json'), '--live-none', 'Keep the original: B = A.')), 'PR-002');
  assert.match(cli('show', 'PR-002').stdout, /^ {2}live: none \(Keep the original: B = A\.\)$/m);
  assert.deepEqual(json(await request(new URL('/api/proposals/PR-002', base).href)).proposal.live, { none: 'Keep the original: B = A.' });

  const page = await request(new URL('/proposals', base).href);
  assert.equal(page.status, 200);
  const csp = page.headers['content-security-policy'];
  assert.match(csp, /frame-src http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*;/);
  assert.match(csp, /frame-ancestors 'none'/, 'nothing frames the console itself');
  assert.match(page.text, /One at a time/);
  assert.doesNotMatch((await request(new URL('/', base).href)).headers['content-security-policy'], /frame-src/, 'other console pages frame nothing');

  const view = json(await request(new URL('/api/proposals/PR-001', base).href)).proposal;
  assert.deepEqual(Object.keys(view.live).sort(), ['files', 'patch', 'version']);
  assert.equal(view.live.patch, 'fixes/demo/patch.diff');

  assert.equal((await postJson('/api/live/PR-001/start', {}, {})).status, 403, 'no x-console header');
  assert.equal((await postJson('/api/live/PR-001/start', {}, { 'x-console': '1', origin: 'http://127.0.0.1:5999' })).status, 403, 'foreign origin');
  assert.equal((await postJson('/api/live/ping', {}, {})).status, 403);
  // a console opened at http://[::1]:<port> can't be named in frame-ancestors: a plain 409, no children started
  const cport = new URL(base).port;
  const v6 = await postJson('/api/live/PR-001/start', {}, { 'x-console': '1', host: `[::1]:${cport}`, origin: `http://[::1]:${cport}` });
  assert.equal(v6.status, 409, v6.text);
  assert.match(json(v6).error, new RegExp(`only when the console is opened at http://localhost:${cport}/ or http://127\\.0\\.0\\.1:${cport}/`));
  assert.equal(json(await postJson('/api/live/ping', {})).running, 0, 'nothing started');
  assert.equal((await postJson('/api/live/PR-002/start', {})).status, 404);
  assert.equal((await postJson('/api/live/PR-099/start', {})).status, 404);
  assert.equal((await request(new URL('/api/live/PR-001/start', base).href)).status, 404, 'GET is not a route');
});

test('start: two page servers on 127.0.0.1 (never 5173), framed by this console only; B serves the patch; reused on the next open', async () => {
  const cport = new URL(base).port;
  const r = await postJson('/api/live/PR-001/start', {}, { 'x-console': '1', origin: `http://localhost:${cport}` });
  assert.equal(r.status, 200, r.text);
  urls = json(r);
  assert.equal(urls.measuring, false);
  assert.equal(typeof urls.idleMin, 'number');
  for (const k of ['a', 'b']) {
    const u = new URL(urls[k]);
    assert.equal(u.hostname, '127.0.0.1', k);
    assert.notEqual(u.port, '5173', k);
    assert.notEqual(u.port, cport, k);
    const doc = await request(urls[k]);
    assert.equal(doc.status, 200, k);
    assert.equal(doc.headers['x-frame-options'], undefined, k);
    assert.match(doc.headers['content-security-policy'], new RegExp(`frame-ancestors 'self' http://localhost:${cport} http://127\\.0\\.0\\.1:${cport}(;|$)`), k);
  }
  assert.notEqual(urls.a, urls.b);
  const a = await request(urls.a + PAGE_JS.slice(1));
  const b = await request(urls.b + PAGE_JS.slice(1));
  assert.equal(a.headers['x-mirror-source'], undefined);
  assert.equal(a.text, fx.prettyFiles[PAGE_JS], 'A is the pretty baseline');
  assert.equal(b.headers['x-mirror-source'], 'overlay');
  assert.equal(b.text, fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  assert.ok(existsSync(join(state, 'console', 'live', 'overlays')), 'the overlay lives in the store, inside .git');
  assert.equal(readFileSync(join(fx.pretty, PAGE_JS.slice(1)), 'utf8'), fx.prettyFiles[PAGE_JS], 'the baseline is untouched');
  const again = json(await postJson('/api/live/PR-001/start', {}));
  assert.equal(again.a, urls.a, 'A reused');
  assert.equal(again.b, urls.b, 'B reused');
  const ping = json(await postJson('/api/live/ping', {}));
  assert.deepEqual([ping.ok, ping.running, ping.measuring], [true, 2, false]);
});

test('measuring: a timing hold on chrome-measure shows in start and ping; a shared hold does not', async () => {
  const lock = (...a) => node(tool('lock.mjs'), a, { env });
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab-run', '--ttl', '60').code, 0);
  try {
    assert.equal(json(await postJson('/api/live/ping', {})).measuring, true);
    assert.equal(json(await postJson('/api/live/PR-001/start', {})).measuring, true);
  } finally { assert.equal(lock('release', 'chrome-measure', '--owner', 'ab-run').code, 0); }
  assert.equal(json(await postJson('/api/live/ping', {})).measuring, false);
});

test('idle: no ping for the idle limit and both children are killed; the next open starts them again', async () => {
  assert.ok(await until(async () => (await refused(urls.a)) && (await refused(urls.b)), 15000), 'killed after the idle limit');
  assert.equal(json(await postJson('/api/live/ping', {})).running, 0);
  const r = json(await postJson('/api/live/PR-001/start', {}));
  assert.equal((await request(r.a)).status, 200);
  assert.equal((await request(r.b + PAGE_JS.slice(1))).headers['x-mirror-source'], 'overlay');
  urls = r;
});

test('proposal live: an accepted proposal with options gets a B per option; start needs the option and restarts only B', async () => {
  const opt = (name) => ({ name, label: `L ${name}`, idea: `I ${name}.`, looksSame: 'Same.', visualDiff: ['None.'], risk: 'Low.', gain: [{ what: 'Restyles', before: '9', after: '1', tag: 'OBSERVED', how: 'trace' }], compare: { b: { label: `B ${name}` }, shots: [{ a: 'a-0.png', b: 'b-0.png' }] }, live: { none: 'Built later.' } });
  const raw = proposal({ title: 'With options', compare: { a: { label: 'Original' } }, options: [opt('full'), opt('pause-only')], recommended: { option: 'full', why: 'Most saved.' }, visualDiff: undefined, looksSame: undefined, risk: undefined, gain: undefined });
  const id = postedId(cli('post', '--by', 'de-x', '--file', writeProposal('p4.json', raw)));
  assert.equal(json(await postJson(`/api/proposals/${id}/decide`, { value: 'accept', option: 'full', rev: 1 })).proposal.state, 'accepted');
  let r = cli('live', id, '--by', 'lead', '--patch', 'fixes/other/patch.diff');
  assert.equal(r.code, 1);
  assert.match(r.out, /has options: say which one B is for/);
  r = cli('live', id, '--by', 'lead', '--option', 'full', '--patch', 'fixes/other/patch.diff');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^LIVE ${id} option full: B = baseline \\+ fixes/other/patch\\.diff @ [0-9a-f]{12} \\(1 file\\(s\\)\\)`, 'm'));
  assert.match(r.stdout, /on the user console http:\/\/localhost:\d+\/proposals#PR-\d+/);
  const view = json(await request(new URL(`/api/proposals/${id}`, base).href)).proposal;
  assert.equal(view.state, 'accepted', 'the decision stands');
  assert.equal(view.rev, 1, 'no new revision');
  assert.equal(view.options[0].live.patch, 'fixes/other/patch.diff');
  assert.deepEqual(view.options[1].live, { none: 'Built later.' }, 'I-109: a reason, no pages');
  assert.equal((await postJson(`/api/live/${id}/start`, {})).status, 400, 'which option?');
  assert.equal((await postJson(`/api/live/${id}/start`, { option: 'pause-only' })).status, 404, 'that option has no B');
  const s = json(await postJson(`/api/live/${id}/start`, { option: 'full' }));
  assert.equal(s.a, urls.a, 'A (the same baseline) is reused');
  // B restarts for the other patch (port auto may hand it the same port again): it now serves that patch
  assert.equal((await request(s.b + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS] + '/* PoC: other */\n');
  r = cli('live', id, '--by', 'lead', '--option', 'full', '--clear');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^LIVE ${id} option full: removed`, 'm'));
  assert.match(r.stderr, /now has no Try-it entry, which every posted proposal needs \(I-109\)/);
  r = cli('live', id, '--by', 'lead', '--option', 'full', '--none', 'Pages come with the next build.');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^LIVE ${id} option full: no live pages \\(Pages come with the next build\\.\\)`, 'm'));
  assert.equal(json(await request(new URL(`/api/proposals/${id}`, base).href)).proposal.state, 'accepted', 'the decision stands');
  urls = s;
});

test('I-093: a live A of its own (post --live-a-patch, live --a-patch): start serves A = baseline + that patch, says its version; without it A is the baseline again', async () => {
  const posted = cli('post', '--by', 'de-x', '--file', writeProposal('p5.json', proposal({ title: 'On the best build' })), '--live-patch', 'fixes/demo/patch.diff', '--live-a-patch', 'fixes/other/patch.diff');
  const id = postedId(posted);
  // demo is not built on other: posted, with a warning
  assert.match(posted.stderr, /^warning: --live-a-patch: B \(fixes\/demo\/patch\.diff\) does not carry all of A's \(fixes\/other\/patch\.diff\) changes: _app\/immutable\/nodes\/2\.fixture\.js \(1 line\(s\)\)/m);
  assert.match(cli('show', id).stdout, /live A: fixes\/other\/patch\.diff @ [0-9a-f]{12} \(1 file\(s\) on site-pretty/);
  const view = json(await request(new URL(`/api/proposals/${id}`, base).href)).proposal;
  assert.deepEqual(Object.keys(view.live.a).sort(), ['files', 'patch', 'version']);
  assert.equal(view.live.a.patch, 'fixes/other/patch.diff');
  let s = json(await postJson(`/api/live/${id}/start`, {}));
  assert.equal(s.aVersion, view.live.a.version);
  assert.equal(s.version, view.live.version);
  assert.equal((await request(s.a + PAGE_JS.slice(1))).headers['x-mirror-source'], 'overlay', 'A from its own overlay');
  assert.equal((await request(s.a + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS] + '/* PoC: other */\n');
  assert.equal((await request(s.b + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  // the CLI's refusals
  let r = cli('post', '--by', 'de-x', '--file', writeProposal('p6.json', proposal()), '--live-a-patch', 'fixes/other/patch.diff');
  assert.equal(r.code, 1);
  assert.match(r.out, /--live-a-patch \(A\) goes with --live-patch/);
  r = cli('post', '--by', 'de-x', '--file', writeProposal('p7.json', proposal()), '--live-patch', 'fixes/demo/patch.diff', '--live-a-patch', 'fixes/nope/patch.diff');
  assert.equal(r.code, 1);
  assert.match(r.out, /--live-a-patch\.patch: .*not committed/);
  // proposal live swaps the sides; A restarts and serves the new A
  r = cli('live', id, '--by', 'lead', '--patch', 'fixes/other/patch.diff', '--a-patch', 'fixes/demo/patch.diff');
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, new RegExp(`^LIVE ${id}: B = baseline \\+ fixes/other/patch\\.diff @ [0-9a-f]{12} \\(1 file\\(s\\)\\); A = baseline \\+ fixes/demo/patch\\.diff @ [0-9a-f]{12} \\(1 file\\(s\\)\\)`, 'm'));
  assert.match(r.stderr, /^warning: B \(fixes\/other\/patch\.diff\) does not carry all of A's \(fixes\/demo\/patch\.diff\) changes/m);
  s = json(await postJson(`/api/live/${id}/start`, {}));
  assert.equal((await request(s.a + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS] + '/* PoC: demo */\n');
  assert.equal((await request(s.b + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS] + '/* PoC: other */\n');
  // without A: the plain baseline again, no aVersion
  r = cli('live', id, '--by', 'lead', '--patch', 'fixes/other/patch.diff');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /A = baseline/);
  s = json(await postJson(`/api/live/${id}/start`, {}));
  assert.equal(s.aVersion, undefined);
  assert.equal((await request(s.a + PAGE_JS.slice(1))).text, fx.prettyFiles[PAGE_JS], 'A is the plain baseline');
  urls = s;
});

test('the console\'s exit stops its page servers', async () => {
  json(await postJson('/api/live/ping', {}));
  assert.equal(await refused(urls.a), false);
  await srv.stop();
  srv = null;
  assert.ok(await until(async () => (await refused(urls.a)) && (await refused(urls.b))), 'children gone with the console');
});

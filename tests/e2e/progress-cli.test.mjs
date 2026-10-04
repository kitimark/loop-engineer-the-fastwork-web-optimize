// The fix-progress page end to end (ts-progress): `console.mjs serve` on a temp state dir serves /progress and
// /api/progress (read-only, localhost only), the steps page links to it, and `console.mjs progress` prints the same
// model as text / JSON or validates a file (--check). A console step and an iPhone lease that name a LAN address
// never show on the progress page. No port 5173, phone, Chrome, real locks or real store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool, startProc, request } from '../helpers.mjs';
import { loadPage } from '../fixtures/page-dom.mjs';

const CON = tool('console.mjs');
const LAN = 'http://192.168.77.12:5497/';
let state, env, srv, base;

const progress = {
  schema: 'fw-progress/1', updatedAt: '2026-10-01T17:00:00Z', updatedBy: 'mgmt-ops-5',
  goal: 'No frame over 50 ms on the iPhone.', complaints: [{ area: 'end', text: 'the end feels laggy' }],
  changes: [{ at: '2026-10-01T16:00:00Z', text: 'Pair 3 answered same.' }],
  items: [{ id: 'cdwc', title: 'Countdown fix', area: 'end', state: 'testing', stage: 'V', next: 'P-032', owner: 'fix-nav-morph',
    checks: [{ id: 'P-032', what: 'robot finger', result: '' }] }],
  upcoming: [{ title: 'F3 swipe test', when: 'after P-036' }],
};

before(async () => {
  state = tempDir('fw-progress-e2e-');
  const pf = join(state, 'PROGRESS.json'); writeFileSync(pf, JSON.stringify(progress));
  const lf = join(state, 'PREDICTIONS.md'); writeFileSync(lf, '| P-032 | fix-nav-morph | d | b | G | m | p | V better | **HIT** | – | l |\n');
  env = { FW_STATE_DIR: state, FW_PROGRESS_FILE: pf, FW_PREDICTIONS_FILE: lf };
  srv = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env, ready: (s) => { const m = s.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  base = srv.url;
  const r = node(CON, ['post', '--by', 'iphone-runner', '--kind', 'action', '--title', `Open ${LAN} on the phone`, '--url', LAN, '--instructions', `Load ${LAN}`], { env });
  assert.equal(r.code, 0, r.out);
  const l = node(tool('lock.mjs'), ['acquire', 'iphone', '--owner', 'iphone-runner', '--ttl', '600', '--url', LAN], { env });
  assert.equal(l.code, 0, l.out);
});
after(async () => { await srv?.stop(); });

test('GET /progress: the page, linked both ways with the steps page', async () => {
  const p = await request(new URL('progress', base).href);
  assert.equal(p.status, 200);
  assert.match(p.headers['content-type'], /text\/html/);
  assert.match(p.text, /<title>Fix progress<\/title>/);
  assert.match(p.text, /href="\/">Your steps</);
  assert.match(p.text, /fetch\('\/api\/progress'/);
  const s = await request(base);
  assert.match(s.text, /href="\/progress">Progress</);
});

test('GET /api/progress: the model with live state; no LAN address; read-only; localhost only', async () => {
  const r = await request(new URL('api/progress', base).href);
  assert.equal(r.status, 200);
  const v = JSON.parse(r.text);
  assert.equal(v.goal, progress.goal);
  assert.equal(v.live.phone.holder.owner, 'iphone-runner');
  assert.equal(v.waiting.length, 1);
  assert.equal(v.waiting[0].title, 'Open <link> on the phone');
  assert.equal(v.sections[0].items[0].checks[0].newResult, true);
  for (const bad of ['192.168', 'http://', '/Users/']) assert.ok(!r.text.includes(bad), `${bad} leaked: ${r.text}`);
  assert.equal((await request(new URL('api/progress', base).href, { method: 'POST', headers: { 'x-console': '1' } })).status, 404);
  const port = new URL(base).port;
  assert.equal((await request(new URL('api/progress', base).href, { headers: { host: `evil.invalid:${port}` } })).status, 421);
});

test('console.mjs progress: text, --json, --details; --check validates a file', () => {
  const t = node(CON, ['progress'], { env });
  assert.equal(t.code, 0, t.out);
  assert.match(t.stdout, /^FIX PROGRESS {2}\(summary 17:00Z 2026-10-01 by mgmt-ops-5/m);
  assert.match(t.stdout, /phone: iphone-runner \(since/);
  assert.match(t.stdout, /check P-032 robot finger: NEW in the ledger: HIT/);
  assert.match(t.stdout, /waiting on the console now: C-001 Open <link> on the phone/);
  assert.ok(!t.stdout.includes('192.168'));
  const j = node(CON, ['progress', '--json'], { env });
  assert.equal(JSON.parse(j.stdout).summary.updatedBy, 'mgmt-ops-5');
  assert.equal(node(CON, ['progress', '--check'], { env }).code, 0);
  const bad = join(state, 'bad.json');
  writeFileSync(bad, JSON.stringify({ ...progress, goal: `see ${LAN}` }));
  const c = node(CON, ['progress', '--check', '--file', bad], { env });
  assert.equal(c.code, 1);
  assert.match(c.stdout, /PROGRESS INVALID[\s\S]*goal: contains a url/);
});

test('I-048: the chrome-measure shared lane on the page, the API and the text: every reader, the weight against the cap, the switch', async () => {
  // I-057: a quiet host by injection, not by luck: the second reader's join check must not read the real load1
  const lock = (args) => node(tool('lock.mjs'), args, { env: { ...env, FW_LOCK_LOAD1: '0.5', FW_LOCK_SHARED_JOIN_LOAD: '16', FW_LOCK_SHARED_JOIN_BUSY: '100' } });
  // the lane off, Chrome free: as before
  assert.match(node(CON, ['progress'], { env }).stdout, /^ {2}Chrome: free$/m);
  assert.equal(lock(['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e']).code, 0);
  assert.match(node(CON, ['progress'], { env }).stdout, /^ {2}Chrome: free; shared lane on, cap 3$/m);
  const a = lock(['acquire', 'chrome-measure', '--shared', '--max-seconds', '120', '--weight', '2', '--owner', 'fix-e2e-a', '--url', LAN]);
  assert.equal(a.code, 0, a.out);
  const b = lock(['acquire', 'chrome-measure', '--shared', '--max-seconds', '120', '--weight', '1', '--owner', 'fix-e2e-b']);
  assert.equal(b.code, 0, b.out);
  try {
    const r = await request(new URL('api/progress', base).href);
    const c = JSON.parse(r.text).live.chrome;
    assert.equal(c.holder, null);
    assert.deepEqual(c.shared.readers.map((x) => [x.owner, x.weight, Object.keys(x).sort().join()]), [['fix-e2e-a', 2, 'owner,since,weight'], ['fix-e2e-b', 1, 'owner,since,weight']]);
    assert.deepEqual([c.shared.used, c.shared.cap, c.shared.joinsClosed], [3, 3, false]);
    assert.deepEqual(c.lane, { on: true, cap: 3 });
    for (const bad of ['192.168', 'http://', '/Users/', '"token"', '"pid"', '"checkout"', '(shared)']) assert.ok(!r.text.includes(bad), `${bad} leaked: ${r.text}`);
    const t = node(CON, ['progress'], { env });
    assert.match(t.stdout, /^ {2}Chrome: fix-e2e-a \(w2, since \d\d:\d\dZ\), fix-e2e-b \(w1, since \d\d:\d\dZ\) \(shared lane 3\/3\)$/m);
    // the page renders the readers itself (text only, from the model): the names first (user T-008)
    const p = await request(new URL('progress', base).href);
    assert.match(p.text, /'joins closed: ' \+ s\.closedBy/);
    // I-118: rendered, each name a link to its agent page, then the weight against the cap
    const pg = await loadPage(base, '/progress');
    assert.match(pg.document.getElementById('main').textContent, /fix-e2e-a, fix-e2e-b \(shared lane 3\/3\)/);
    const links = pg.document.querySelectorAll('a').map((a) => a.getAttribute('href'));
    for (const n of ['fix-e2e-a', 'fix-e2e-b']) assert.ok(links.includes(`/agent/${n}`), `${n} links to its page`);
  } finally {
    lock(['release', 'chrome-measure', '--shared', '--owner', 'fix-e2e-a']);
    lock(['release', 'chrome-measure', '--shared', '--owner', 'fix-e2e-b']);
  }
  assert.match(node(CON, ['progress'], { env }).stdout, /^ {2}Chrome: free; shared lane on, cap 3$/m);
});

test('I-057: on a loaded host (injected load1 above the join load) a second reader is BUSY and queued; the page shows the one reader', async () => {
  const lock = (args) => node(tool('lock.mjs'), args, { env: { ...env, FW_LOCK_LOAD1: '50', FW_LOCK_SHARED_JOIN_LOAD: '16', FW_LOCK_SHARED_JOIN_BUSY: '100' } });
  assert.equal(lock(['shared', 'on', 'chrome-measure', '--by', 'lead', '--reason', 'e2e']).code, 0);
  const a = lock(['acquire', 'chrome-measure', '--shared', '--max-seconds', '120', '--weight', '2', '--owner', 'fix-e2e-a']);
  assert.equal(a.code, 0, a.out); // the opener ignores load
  try {
    const b = lock(['acquire', 'chrome-measure', '--shared', '--max-seconds', '120', '--weight', '1', '--owner', 'fix-e2e-b']);
    assert.equal(b.code, 3, b.out);
    assert.match(b.out, /BUSY chrome-measure: shared by "fix-e2e-a" .*\(load1 50 > 16: no new reader joins a loaded host\)/);
    const c = JSON.parse((await request(new URL('api/progress', base).href)).text).live.chrome;
    assert.deepEqual(c.shared.readers.map((x) => x.owner), ['fix-e2e-a']);
    assert.match(node(CON, ['progress'], { env }).stdout, /^ {2}Chrome: fix-e2e-a \(w2, since \d\d:\d\dZ\) \(shared lane 2\/3\)/m);
  } finally {
    lock(['dequeue', 'chrome-measure', '--shared', '--owner', 'fix-e2e-b']);
    lock(['release', 'chrome-measure', '--shared', '--owner', 'fix-e2e-a']);
  }
});

test('I-061: /build (the best build, the same top bar with "Best build" on), /api/progress has it, /writeup serves only write-ups, scrubbed; progress --check validates build', async () => {
  const st = tempDir('fw-build-e2e-'), root = tempDir('fw-build-root-');
  mkdirSync(join(root, 'fixes', 'lc-cq3'), { recursive: true });
  writeFileSync(join(root, 'fixes', 'lc-cq3', 'README.md'), '# lc-cq3\nmeasured on http://192.168.77.12:5497/\n');
  const pb = {
    ...progress,
    items: [...progress.items, { id: 'lc-cq3', title: 'Container query trick', area: 'end', state: 'dropped', stage: 'F', why: 'no gain on the phone' }],
    build: { name: 'stack5', since: '2026-10-02T08:00:00Z', fixes: ['cdwc'], combined: [{ what: 'frames over 50 ms', before: '4-9', after: '0-2', tag: 'OBSERVED', driver: 'scripted scroll', when: '2026-10-02T08:40:00Z', how: 'phone block A1, 9 runs' }] },
  };
  const pf = join(st, 'PROGRESS.json'); writeFileSync(pf, JSON.stringify(pb));
  const e = { FW_STATE_DIR: st, FW_PROGRESS_FILE: pf, FW_PREDICTIONS_FILE: join(st, 'none.md'), FW_WRITEUP_ROOT: root };
  const s = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env: e, ready: (x) => { const m = x.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  try {
    const page = await request(new URL('build', s.url).href);
    assert.equal(page.status, 200);
    assert.match(page.text, /class="mbtn on" aria-current="page" title="[^"]*" href="\/build">Best build</);
    const v = JSON.parse((await request(new URL('api/progress', s.url).href)).text);
    assert.equal(v.build.name, 'stack5');
    assert.deepEqual(v.build.tried.map((t) => [t.id, t.writeup?.url]), [['lc-cq3', '/writeup/fixes/lc-cq3/README.md']]);
    const w = await request(new URL('writeup/fixes/lc-cq3/README.md', s.url).href);
    assert.equal(w.status, 200);
    assert.match(w.headers['content-type'], /^text\/plain/);
    assert.equal(w.text, '# lc-cq3\nmeasured on <link>\n');
    for (const bad of ['writeup/fixes/%2e%2e/%2e%2e/x.md', 'writeup/fixes/lc-cq3/missing.md', 'writeup/tools/a.md', 'writeup/%E0%A4%A']) {
      assert.ok([400, 404].includes((await request(new URL(bad, s.url).href)).status), bad);
    }
    const t = node(CON, ['progress'], { env: e });
    assert.match(t.stdout, /TODAY'S BEST BUILD: stack5/);
    writeFileSync(pf, JSON.stringify({ ...pb, build: { ...pb.build, fixes: ['cdwc', 'lc-cq3'] } }));
    const c = node(CON, ['progress', '--check', '--file', pf], { env: e });
    assert.notEqual(c.code, 0, c.out);
    assert.match(c.out, /a dropped item can't be in build\.fixes/);
  } finally { await s.stop(); }
});

test('T-079, T-101: /build shows Versions newest first (improvement, result vs the previous, cost, hashes, Try-it with the Wi-Fi address now, running or not); text keeps lan', async () => {
  const net = await import('node:net');
  const up = net.createServer((c) => c.destroy());
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const upPort = up.address().port;
  const gone = net.createServer(); await new Promise((r) => gone.listen(0, '127.0.0.1', r));
  const downPort = gone.address().port; await new Promise((r) => gone.close(r));
  const st = tempDir('fw-versions-e2e-');
  const pv = {
    ...progress,
    build: { name: 'Stack 6', since: '2026-10-02T08:00:00Z', fixes: ['cdwc'] },
    versions: [
      { id: 'v0', name: 'Original page', since: '2026-10-01T00:00:00Z', improvement: 'The page as the site serves it.', hashes: { js: '4606120cf392', css: '27776f3d4138' }, tryIt: { port: upPort, server: 'baseline' } },
      { id: 'st6-rb', name: 'Stack 6', since: '2026-10-02T08:00:00Z', improvement: 'The countdown no longer repaints the end panel.', fixes: ['cdwc'], verdict: 'smoother', best: true,
        result: [{ what: 'frames over 50 ms', before: '4-9', after: '0-2', tag: 'OBSERVED', driver: 'scripted scroll', when: '2026-10-02T08:40:00Z' }],
        cost: 'nothing visible', hashes: { js: '59b23b3f57fd', css: 'd22542d0b5f8' }, tryIt: { port: downPort, scheme: 'https', path: '/?v=2' } },
      { id: 'gpu', name: 'GPU preview', since: '2026-10-03T08:00:00Z', improvement: 'The end morph runs on the GPU.',
        result: [{ what: 'frames over 34 ms', before: '3', after: '1', tag: 'UNRESOLVED', driver: 'robot finger' }], cost: 'none', landed: false, tryIt: { none: 'not served yet' } },
    ],
  };
  const pf = join(st, 'PROGRESS.json'); writeFileSync(pf, JSON.stringify(pv));
  const e = { FW_STATE_DIR: st, FW_PROGRESS_FILE: pf, FW_PREDICTIONS_FILE: join(st, 'none.md'), FW_LAN_ADDRESS: '10.9.8.7' };
  // the page's first /api/progress can take a while (it probes the Try-it ports): loadPage waits for it (I-132)
  const loadBuild = (url) => loadPage(url, '/build');
  const s = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env: e, ready: (x) => { const m = x.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  try {
    assert.deepEqual(node(CON, ['progress', '--check', '--file', pf], { env: e }).code, 0);
    const pg = await loadBuild(s.url);
    const sec = pg.document.querySelectorAll('section').find((x) => x.getAttribute('aria-label') === 'Versions');
    assert.ok(sec, 'a Versions section');
    const cards = sec.querySelectorAll('li').filter((x) => x.getAttribute('data-version'));
    assert.deepEqual(cards.map((c) => c.getAttribute('data-version')), ['gpu', 'st6-rb', 'v0'], 'newest first (T-101)');
    const [c2, c1, c0] = cards.map((c) => c.textContent);
    assert.match(c0, /Original page/); assert.match(c0, /The page as the site serves it\./); assert.match(c0, /js 4606120cf392 · css 27776f3d4138/);
    assert.match(c1, /today’s best build/); assert.ok(!/today’s best build/.test(c2), 'the newest version, a preview, is not the best build');
    assert.match(c2, /to try \(not landed\)/); assert.ok(!/to try/.test(c1)); assert.match(c1, /Adds: Countdown fix/);
    assert.match(c1, /Verdict: smoother/); assert.match(c0, /server: baseline/);
    assert.match(c1, /vs Original page/); assert.match(c1, /frames over 50 ms/); assert.match(c1, /4-90-2/); assert.match(c1, /Cost: nothing visible/);
    assert.match(c2, /Try it: no page \(not served yet\)/);
    const byId = (id) => cards.find((c) => c.getAttribute('data-version') === id);
    const a0 = byId('v0').querySelectorAll('a').find((a) => /Try it/.test(a.getAttribute('title') || ''));
    assert.equal(a0.getAttribute('href'), `http://10.9.8.7:${upPort}/`, 'the Wi-Fi address now');
    assert.equal(a0.textContent, `http://10.9.8.7:${upPort}/`);
    assert.equal(a0.getAttribute('target'), '_blank');
    assert.ok(!/not running/.test(c0));
    const a1 = byId('st6-rb').querySelectorAll('a').find((a) => /Try it/.test(a.getAttribute('title') || ''));
    assert.equal(a1.getAttribute('href'), `https://10.9.8.7:${downPort}/?v=2`);
    assert.match(c1, /nothing answers on this port now/);
    const t = node(CON, ['progress'], { env: e }).stdout;
    assert.match(t, new RegExp(`try it: http://lan:${upPort}/ \\[baseline\\] \\(running\\)`));
    assert.ok(!t.includes('10.9.8.7'), 'the text keeps the lan placeholder');
    const page = await request(new URL('build', s.url).href);
    assert.ok(!/https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9]/i.test(page.text.replace(/https?:\/\/(fonts|cdn)[^"' ]*/g, '')), 'no literal outside URL in the page source');
  } finally { await s.stop(); await new Promise((r) => up.close(r)); }
  // no Wi-Fi address: the placeholder as text, no link, and the note threads use too (ts-i119)
  const s2 = await startProc(process.execPath, [CON, 'serve', '--port', '0'], { env: { ...e, FW_LAN_ADDRESS: '', FW_LAN_IFACES: '{}' }, ready: (x) => { const m = x.match(/^CONSOLE_URL=(\S+)$/m); return m && m[1]; } });
  try {
    const pg = await loadBuild(s2.url);
    const card = pg.document.querySelectorAll('li').find((x) => x.getAttribute('data-version') === 'v0');
    assert.ok(card, `the v0 card (page: ${pg.document.getElementById('main').textContent.slice(0, 300)})`);
    assert.match(card.textContent, new RegExp(`Try it: http://lan:${upPort}/ \\(Wi-Fi address not available\\)`));
    assert.ok(!card.querySelectorAll('a').some((a) => /lan:/.test(a.getAttribute('href') || '')), 'no link to the placeholder');
  } finally { await s2.stop(); }
});

test('I-060: "Right now" says what the phone does (lock.mjs doing), for whom and the time left; the API and the text; no LAN address', async () => {
  const lk = (a) => node(tool('lock.mjs'), a, { env });
  const d = lk(['doing', 'iphone', '--owner', 'iphone-runner', '--text', 'timing test for the blur change (PR-003 A), run 3 of 9', '--for', 'wi-stack', '--eta-min', '20']);
  assert.equal(d.code, 0, d.out);
  try {
    const r = await request(new URL('api/progress', base).href);
    const job = JSON.parse(r.text).live.devices.phone.jobs[0];
    assert.match(job.line, /^timing test for the blur change \(PR-003 A\), run 3 of 9, about (19|20) min left$/);
    assert.match(job.byLine, /^Run by iphone-runner for wi-stack, since \d\d:\d\dZ\.$/);
    assert.equal(job.source, 'described');
    for (const bad of ['192.168', 'http://', '/Users/']) assert.ok(!r.text.includes(bad), `${bad} leaked`);
    const t = node(CON, ['progress'], { env });
    assert.equal(t.code, 0, t.out);
    assert.match(t.stdout, /doing: timing test for the blur change \(PR-003 A\), run 3 of 9, about (19|20) min left\. Run by iphone-runner for wi-stack/);
    assert.ok(!t.stdout.includes('192.168'));
  } finally {
    assert.equal(lk(['doing', 'iphone', '--owner', 'iphone-runner', '--clear']).code, 0);
  }
});

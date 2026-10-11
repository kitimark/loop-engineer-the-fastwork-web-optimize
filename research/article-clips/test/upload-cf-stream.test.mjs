// upload-cf-stream.sh against a local mock of the Cloudflare Stream API (no network, no real account, no token).
// Run: node --test research/article-clips/test/upload-cf-stream.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'upload-cf-stream.sh');
const PREFIX = 'fastwork-web-optimize';
const ACCT = 'acct-test';
const TOKEN = 'tok-SECRET-0123456789';
const HEAD = 'clip\tuid\tmedium\tready';
const PARAMS = 'loop=true&autoplay=true&muted=true';
const ALL = readFileSync(SCRIPT, 'utf8').match(/^ALL="([^"]*)"/m)[1].split(' ');
const SH = process.env.CF_TEST_SH || '/bin/sh';   // e.g. CF_TEST_SH=/bin/dash for a strict POSIX shell
const REAL_CURL = execFileSync('sh', ['-c', 'command -v curl'], { encoding: 'utf8' }).trim();

// ---- mock Stream API --------------------------------------------------------------------------------------------
function mockStream({ readyAfter = 0 } = {}) {
  const s = { videos: new Map(), uploads: 0, tags: 0, requests: [], badAuth: 0, n: 0 };
  const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const notFound = (res) => send(res, 404, { success: false, errors: [{ code: 10005, message: 'video not found' }], result: null });
  s.add = (name, { creator = PREFIX, ready = true, state } = {}) => {
    const uid = 'v' + String(++s.n).padStart(31, '0');
    s.videos.set(uid, { uid, meta: { name }, creator, readyToStream: ready, status: { state: state || (ready ? 'ready' : 'inprogress') }, gets: 0 });
    return uid;
  };
  s.server = http.createServer((req, res) => {
    let body = Buffer.alloc(0);
    req.on('data', (d) => { body = Buffer.concat([body, d]); });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      s.requests.push(`${req.method} ${u.pathname}${u.search}`);
      if (req.headers.authorization !== `Bearer ${TOKEN}`) { s.badAuth++; return send(res, 403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }); }
      const m = u.pathname.match(/^\/client\/v4\/accounts\/([^/]+)\/stream(?:\/([^/]+))?$/);
      if (!m || m[1] !== ACCT) return send(res, 404, { success: false, errors: [{ code: 7003, message: 'no route' }] });
      const uid = m[2];
      const out = (v) => ({ uid: v.uid, meta: v.meta, creator: v.creator, readyToStream: v.readyToStream, status: v.status });
      if (!uid && req.method === 'GET') {
        const search = u.searchParams.get('search'); const creator = u.searchParams.get('creator');
        const list = [...s.videos.values()].filter((v) => (!search || (v.meta.name || '').includes(search)) && (!creator || v.creator === creator));
        return send(res, 200, { success: true, errors: [], result: list.map(out) });
      }
      if (!uid && req.method === 'POST') {
        const fn = /filename="([^"]+)"/.exec(body.toString('latin1'));
        s.uploads++;
        const id = s.add(fn ? fn[1] : '', { creator: null, ready: false });
        return send(res, 200, { success: true, errors: [], result: out(s.videos.get(id)) });
      }
      const v = s.videos.get(uid);
      if (!v) return notFound(res);
      if (req.method === 'GET') {
        v.gets++;
        if (!v.readyToStream && v.gets > readyAfter) { v.readyToStream = true; v.status.state = 'ready'; }
        return send(res, 200, { success: true, errors: [], result: out(v) });
      }
      if (req.method === 'POST') {
        const j = JSON.parse(body.toString('utf8'));
        s.tags++;
        if (j.meta) v.meta = { ...v.meta, ...j.meta };
        if ('creator' in j) v.creator = j.creator;
        return send(res, 200, { success: true, errors: [], result: out(v) });
      }
      if (req.method === 'DELETE') { s.videos.delete(uid); res.writeHead(200); return res.end(); }
      send(res, 405, { success: false, errors: [] });
    });
  });
  return new Promise((ok) => s.server.listen(0, '127.0.0.1', () => { s.base = `http://127.0.0.1:${s.server.address().port}/client/v4`; ok(s); }));
}

// ---- a temp checkout: fake clips, the .tsv, a curl shim that logs its argv ----------------------------------------
function sandbox(clips = ALL) {
  const root = mkdtempSync(join(tmpdir(), 'cf-stream-test-'));
  const dir = join(root, 'video'); mkdirSync(dir);
  for (const c of clips) writeFileSync(join(dir, c + '.mp4'), Buffer.from('fake mp4 ' + c));
  const bin = join(root, 'bin'); mkdirSync(bin);
  const argvLog = join(root, 'curl-argv.log');
  writeFileSync(join(bin, 'curl'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${argvLog}'\nexec '${REAL_CURL}' "$@"\n`);
  chmodSync(join(bin, 'curl'), 0o755);
  return { root, dir, tsv: join(root, 'links.tsv'), bin, argvLog };
}

function run(sb, mock, args = [], { creds = true } = {}) {
  const env = {
    PATH: `${sb.bin}:${process.env.PATH}`, HOME: sb.root, TMPDIR: sb.root, NO_PROXY: '*', no_proxy: '*',
    CF_STREAM_DIR: sb.dir, CF_STREAM_OUT: sb.tsv, CF_API_BASE: mock ? mock.base : 'http://127.0.0.1:9/client/v4',
    CF_STREAM_POLL_S: '0', CF_STREAM_POLL_N: '5',
  };
  if (creds) { env.CF_STREAM_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACCT; }
  return new Promise((ok) => execFile(SH, [SCRIPT, ...args], { env, cwd: sb.root, timeout: 60000 }, (err, stdout, stderr) => {
    ok({ code: err ? (err.code ?? 1) : 0, out: stdout + stderr });
  }));
}

const rows = (sb) => readFileSync(sb.tsv, 'utf8').trimEnd().split('\n').map((l) => l.split('\t'));
const row = (c, uid, ready) => [c, uid, `https://iframe.videodelivery.net/${uid}?${PARAMS}`, String(ready)].join('\t');
function noLeak(sb, r) {
  assert.ok(!r.out.includes(TOKEN), 'token in the output');
  assert.ok(!readFileSync(sb.argvLog, 'utf8').includes(TOKEN), 'token in curl argv');
}

test('ALL lists 20 clips in page order, Fig. 2 first, no duplicates', () => {
  assert.equal(ALL.length, 20);
  assert.equal(ALL[0], 'fig2-frame-rhythms-60fps');
  assert.equal(ALL[1], 'hero-gesture-long-60fps-strip');
  assert.equal(new Set(ALL).size, 20);
});

test('fresh upload: uploads, names, waits for ready, writes rows in page order; no token in argv or output', async () => {
  const m = await mockStream({ readyAfter: 1 });
  try {
    const sb = sandbox();
    const clips = ['day8-menu-60fps-strip', 'fig2-frame-rhythms-60fps'];
    const r = await run(sb, m, clips);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 2);
    assert.equal(m.badAuth, 0);
    const vids = [...m.videos.values()];
    for (const c of clips) {
      const v = vids.find((x) => x.meta.name === `${PREFIX}/${c}.mp4`);
      assert.ok(v, `${c} named`); assert.equal(v.creator, PREFIX);
    }
    const uid = (c) => vids.find((x) => x.meta.name === `${PREFIX}/${c}.mp4`).uid;
    assert.deepEqual(readFileSync(sb.tsv, 'utf8').trimEnd().split('\n'),
      [HEAD, row('fig2-frame-rhythms-60fps', uid('fig2-frame-rhythms-60fps'), true), row('day8-menu-60fps-strip', uid('day8-menu-60fps-strip'), true)]);
    noLeak(sb, r);
  } finally { m.server.close(); }
});

test('rerun with every row ready=true: zero uploads and zero API calls', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const clips = ['fig2-frame-rhythms-60fps', 'middle-60fps-strip'];
    assert.equal((await run(sb, m, clips)).code, 0);
    const before = readFileSync(sb.tsv, 'utf8');
    m.requests.length = 0; m.uploads = 0;
    const r = await run(sb, m, clips);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 0);
    assert.deepEqual(m.requests, []);
    assert.match(r.out, /skip fig2-frame-rhythms-60fps/);
    assert.equal(readFileSync(sb.tsv, 'utf8'), before);
  } finally { m.server.close(); }
});

test('row missing but the video is on Stream: reused, row written, zero uploads', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const named = m.add(`${PREFIX}/day8-menu-2x-strip.mp4`);
    const plain = m.add('day3-carousel-60fps-strip.mp4', { creator: null });   // dashboard upload / killed before naming
    writeFileSync(sb.tsv, HEAD + '\n');
    const r = await run(sb, m, ['day8-menu-2x-strip', 'day3-carousel-60fps-strip']);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 0);
    assert.match(r.out, new RegExp(`reuse ${named} for day8-menu-2x-strip`));
    assert.equal(m.videos.get(plain).meta.name, `${PREFIX}/day3-carousel-60fps-strip.mp4`, 'the plain-named one is named on reuse');
    assert.equal(m.videos.get(plain).creator, PREFIX);
    assert.deepEqual(readFileSync(sb.tsv, 'utf8').trimEnd().split('\n'),
      [HEAD, row('day3-carousel-60fps-strip', plain, true), row('day8-menu-2x-strip', named, true)]);
  } finally { m.server.close(); }
});

test('row with ready=false is refreshed to true in place, no upload, no duplicate row', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const uid = m.add(`${PREFIX}/middle-60fps-strip.mp4`, { ready: true });
    const other = m.add(`${PREFIX}/day11-reveal-2x-strip.mp4`);
    writeFileSync(sb.tsv, [HEAD, row('day11-reveal-2x-strip', other, true), row('middle-60fps-strip', uid, false)].join('\n') + '\n');
    const r = await run(sb, m, ['middle-60fps-strip', 'day11-reveal-2x-strip']);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 0);
    assert.deepEqual(readFileSync(sb.tsv, 'utf8').trimEnd().split('\n'),
      [HEAD, row('day11-reveal-2x-strip', other, true), row('middle-60fps-strip', uid, true)]);
  } finally { m.server.close(); }
});

test('row whose video was renamed is still found by its uid and refreshed', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const uid = m.add('something-else.mp4', { creator: null, ready: false });
    writeFileSync(sb.tsv, [HEAD, row('middle-60fps-strip', uid, false)].join('\n') + '\n');
    const r = await run(sb, m, ['middle-60fps-strip']);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 0);
    assert.equal(m.videos.get(uid).meta.name, `${PREFIX}/middle-60fps-strip.mp4`);
    assert.deepEqual(rows(sb).slice(1), [row('middle-60fps-strip', uid, true).split('\t')]);
  } finally { m.server.close(); }
});

test('duplicate on Stream: lists both, picks none, uploads nothing, exit 1; other clips still done', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const a = m.add(`${PREFIX}/day9-join-closeup-2x-hq.mp4`);
    const b = m.add(`${PREFIX}/day9-join-closeup-2x-hq.mp4`);
    const r = await run(sb, m, ['day9-join-closeup-2x-hq', 'day9-logo-closeup-2x-hq']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /DUPLICATE day9-join-closeup-2x-hq: 2 videos/);
    assert.ok(r.out.includes(a) && r.out.includes(b));
    assert.match(r.out, /--delete <uid>/);
    assert.equal(m.uploads, 1, 'only the other clip');
    assert.deepEqual(rows(sb).map((x) => x[0]), ['clip', 'day9-logo-closeup-2x-hq']);
    // the dry run reports it too, without uploading
    const d = await run(sb, m, ['--dry-run', 'day9-join-closeup-2x-hq']);
    assert.equal(d.code, 1); assert.match(d.out, /DUPLICATE/); assert.equal(m.uploads, 1);
  } finally { m.server.close(); }
});

test('a row pointing to a deleted video, plus a new one under the name: duplicate only if both exist', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const old = m.add(`${PREFIX}/middle-60fps-strip.mp4`, { ready: false });
    const fresh = m.add(`${PREFIX}/middle-60fps-strip.mp4`, { ready: true });
    writeFileSync(sb.tsv, [HEAD, row('middle-60fps-strip', old, false)].join('\n') + '\n');
    const r1 = await run(sb, m, ['middle-60fps-strip']);
    assert.equal(r1.code, 1); assert.match(r1.out, new RegExp(`${old} .*\\(the .tsv row\\)`));
    m.videos.delete(old);
    const r2 = await run(sb, m, ['middle-60fps-strip']);
    assert.equal(r2.code, 0, r2.out);
    assert.equal(m.uploads, 0);
    assert.deepEqual(rows(sb).slice(1), [row('middle-60fps-strip', fresh, true).split('\t')]);
  } finally { m.server.close(); }
});

test('the .tsv keeps the header, page order of ALL then extra clips, one row per clip', async () => {
  const m = await mockStream();
  try {
    const extra = 'zz-extra-clip';
    const sb = sandbox([...ALL, extra]);
    const keep = m.add(`${PREFIX}/hero-gesture-stop-1x-strip.mp4`);
    // an older file: extra clip first, out of order, one clip twice (an old append)
    writeFileSync(sb.tsv, [HEAD, row(extra, 'old-extra', false), row('middle-60fps-strip', 'gone1', false),
      row('hero-gesture-stop-1x-strip', keep, true), row('middle-60fps-strip', 'gone2', false)].join('\n') + '\n');
    const r = await run(sb, m, [extra, 'middle-60fps-strip', 'fig2-frame-rhythms-60fps', 'hero-gesture-stop-1x-strip']);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 3);   // extra (its row's uid is gone), middle (both old uids gone), fig2
    const t = rows(sb);
    assert.deepEqual(t[0], HEAD.split('\t'));
    assert.deepEqual(t.map((x) => x[0]).slice(1), ['fig2-frame-rhythms-60fps', 'hero-gesture-stop-1x-strip', 'middle-60fps-strip', extra]);
    assert.ok(t.slice(1).every((x) => x[3] === 'true' && x.length === 4));
    assert.equal(t[2][1], keep);
    // a second run changes nothing and calls nothing
    const before = readFileSync(sb.tsv, 'utf8'); m.requests.length = 0;
    assert.equal((await run(sb, m, [extra, 'middle-60fps-strip', 'fig2-frame-rhythms-60fps'])).code, 0);
    assert.equal(readFileSync(sb.tsv, 'utf8'), before);
    assert.deepEqual(m.requests, []);
  } finally { m.server.close(); }
});

test('upload still encoding after the polls: row ready=false, next run refreshes it', async () => {
  const m = await mockStream({ readyAfter: 100 });
  try {
    const sb = sandbox();
    assert.equal((await run(sb, m, ['middle-60fps-strip'])).code, 0);
    assert.equal(rows(sb)[1][3], 'false');
    for (const v of m.videos.values()) v.gets = 1000;   // encoding done
    const r = await run(sb, m, ['middle-60fps-strip']);
    assert.equal(r.code, 0, r.out);
    assert.equal(m.uploads, 1);
    assert.equal(rows(sb).length, 2);
    assert.equal(rows(sb)[1][3], 'true');
  } finally { m.server.close(); }
});

test('--dry-run: with credentials says would reuse / would upload and changes nothing', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const uid = m.add(`${PREFIX}/middle-60fps-strip.mp4`);
    const r = await run(sb, m, ['--dry-run', 'middle-60fps-strip', 'fig2-frame-rhythms-60fps']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`would reuse ${uid} for middle-60fps-strip`));
    assert.match(r.out, /would upload fig2-frame-rhythms-60fps/);
    assert.equal(m.uploads, 0); assert.equal(m.tags, 0);
    assert.ok(!existsSync(sb.tsv));
    assert.ok(m.requests.every((q) => q.startsWith('GET ')));
    noLeak(sb, r);
  } finally { m.server.close(); }
});

test('--dry-run without credentials: all 20 in page order, lookup skipped, no API call', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const r = await run(sb, m, ['--dry-run'], { creds: false });
    assert.equal(r.code, 0, r.out);
    const lines = r.out.trim().split('\n');
    assert.equal(lines.length, 20);
    assert.ok(lines.every((l) => l.startsWith('lookup skipped for ')));
    assert.deepEqual(lines.map((l) => l.split(' ')[3]), ALL);
    assert.doesNotMatch(r.out, /would (reuse|upload)/);
    assert.deepEqual(m.requests, []);
  } finally { m.server.close(); }
});

test('a failed lookup (bad token) uploads nothing', async () => {
  const m = await mockStream();
  try {
    const sb = sandbox();
    const r = await new Promise((ok) => execFile(SH, [SCRIPT, 'middle-60fps-strip'], {
      env: { PATH: `${sb.bin}:${process.env.PATH}`, TMPDIR: sb.root, NO_PROXY: '*', CF_STREAM_DIR: sb.dir, CF_STREAM_OUT: sb.tsv,
        CF_API_BASE: m.base, CF_STREAM_TOKEN: 'wrong', CF_ACCOUNT_ID: ACCT }, cwd: sb.root,
    }, (err, so, se) => ok({ code: err ? err.code : 0, out: so + se })));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /Authentication error/);
    assert.equal(m.uploads, 0);
  } finally { m.server.close(); }
});

test('the committed .tsv: a dry run skips its ready clips and lists the rest of ALL (Fig. 2 until it is uploaded)', async () => {
  const sb = sandbox();
  const real = readFileSync(join(HERE, '..', 'cf-stream-links.tsv'), 'utf8');
  writeFileSync(sb.tsv, real);
  const ready = real.trimEnd().split('\n').slice(1).map((l) => l.split('\t')).filter((x) => x[3] === 'true').map((x) => x[0]);
  const r = await run(sb, null, ['--dry-run'], { creds: false });
  assert.equal(r.code, 0, r.out);
  const lines = r.out.trim().split('\n');
  assert.deepEqual(lines.filter((l) => l.startsWith('skip ')).map((l) => l.split(' ')[1]), ALL.filter((c) => ready.includes(c)));
  assert.deepEqual(lines.filter((l) => !l.startsWith('skip ')).map((l) => l.split(' ')[3]), ALL.filter((c) => !ready.includes(c)));
  assert.equal(readFileSync(sb.tsv, 'utf8'), real);
});

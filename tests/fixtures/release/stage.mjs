// Fixtures for the release export tests (I-270): a staged copy of tools/release (I-269's rules.mjs and check.mjs as they
// are; a stub in place of rewrite.mjs (I-269, needs git filter-repo)), a fixture known.json with made-up values, a console
// store, a source repo with a snapshot pin, and an out/ tree. Nothing here is a real personal value.
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, chmodSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { makeFixtureHome } from '../baseline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(HERE, '..', '..', '..', 'tools');
const B = await import(pathToFileURL(join(TOOLS, 'lib', 'baseline.mjs')).href);

/** Made-up personal values (the fixture known.json). */
export const V = {
  home: 'qzuser', name: 'Quentin Zorblax', email: 'qz.zorblax@mailbox.invalid', device: 'Quentin’s iPhone',
  udid: '00008130-000A1B2C3D4E5F60', lan: '10.77.31',
};
export const ALL_VALUES = [V.home, V.name, V.email, V.device, V.udid, `${V.lan}.12`, `${V.lan}.5`];
/** A made-up API key, mixed case (built at run time: no secret shape in this file). */
export const FAKE_KEY = ['Zq7', 'Xw9'.repeat(8), 'Lm2'].join('');
/** The snapshot file that holds it (vendored third-party code, as the real gtag/gtm.js hold a publicKey). */
export const SECRET_FILE = 'site-pretty/__vendor/tag.js';
/** Its minified copy in site/: the quotes escaped, so no secret shape matches there; the value is the same. */
export const SECRET_COPY = 'site/__vendor/tag.js';

/** Copy tools/release (+ the two lib files it needs) to <root>/tools, with the rewrite stub. */
export function stageTools(root) {
  const rel = join(root, 'tools', 'release');
  mkdirSync(rel, { recursive: true });
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true });
  for (const f of readdirSync(join(TOOLS, 'release')).filter((x) => x.endsWith('.mjs'))) copyFileSync(join(TOOLS, 'release', f), join(rel, f));
  for (const f of ['help.mjs', 'paths.mjs']) copyFileSync(join(TOOLS, 'lib', f), join(root, 'tools', 'lib', f));
  copyFileSync(join(HERE, 'rewrite-stub.mjs'), join(rel, 'rewrite.mjs'));
  return { dir: rel, url: (f) => pathToFileURL(join(rel, f)).href };
}

export function writeKnown(dir) {
  const p = join(dir, 'known.json');
  writeFileSync(p, JSON.stringify({
    literals: [{ value: V.home, token: '<user>' }, { value: V.name, token: '<name>' }, { value: V.email, token: '<email>' }, { value: V.device, token: '<device-name>' }, { value: V.udid, token: '<udid>' }],
    lanPrefixes: [V.lan],
    allow: [{ path: 'tests/fixtures/', pattern: `${V.lan.replace(/\./g, '\\.')}\\.200`, reason: 'fixture LAN address of a test' }],
  }, null, 2));
  chmodSync(p, 0o600);
  return p;
}

/** One PNG chunk (length, type, data, CRC). */
export const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const n = Buffer.alloc(4); n.writeUInt32BE(body.length - 4);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body));
  return Buffer.concat([n, body, c]);
};
/** A PNG header with the given size (enough for pngSize; the fake encoder never decodes); the salt in a private chunk. */
export function png(w, h, salt = '', extra = []) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  b.writeUInt32BE(crc32(b.subarray(12, 29)), 29);
  return Buffer.concat([b, ...(salt ? [pngChunk('slTx', salt)] : []), ...extra, pngChunk('IDAT', 'pixels'), pngChunk('IEND', '')]);
}
/** A 1x1 GIF; `extra` blocks go before the image. */
export function gif(extra = []) {
  return Buffer.concat([Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff', 'latin1'), ...extra,
    Buffer.from('\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b', 'latin1')]);
}
/** GIF extension blocks: a comment, and an application block with its id (NETSCAPE2.0 = looping, XMP DataXMP = XMP). */
export const gifComment = (text) => Buffer.concat([Buffer.from([0x21, 0xfe, text.length]), Buffer.from(text, 'latin1'), Buffer.from([0])]);
export const gifApp = (id, data) => Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from(id, 'latin1'), Buffer.from([data.length]), Buffer.from(data, 'latin1'), Buffer.from([0])]);
/** An XMP packet naming a made-up upload id (built at run time). */
export const xmp = (id = 'upload-1234') => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmp:Identifier="${id}"/></rdf:RDF></x:xmpmeta>`;
/** An ISO BMFF box. */
export const bmffBox = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + data.length); h.write(type, 4, 'latin1'); return Buffer.concat([h, Buffer.from(data)]); };
/** A minimal AVIF (brand `brand`): ftyp, an XMP packet in an xml box of the meta box when asked, mdat. */
export function avif(withXmp = false, brand = 'avif') {
  const meta = withXmp ? [bmffBox('meta', Buffer.concat([Buffer.alloc(4), bmffBox('xml ', xmp())]))] : [];
  return Buffer.concat([bmffBox('ftyp', Buffer.from(`${brand}\0\0\0\0avifmif1`, 'latin1')), ...meta, bmffBox('mdat', 'pixels')]);
}

const put = (root, rel, data) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); return p; };
const json = (v) => JSON.stringify(v, null, 2);

/** A console store (.git/fastwork-mirror) with every record kind, excluded folders and pictures. */
export function makeState(state) {
  put(state, 'console/threads/T-001.json', json({
    id: 'T-001', title: `Lag on ${V.device}`, status: 'open', createdBy: 'user', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T01:00:00Z', rev: 5, assignees: ['lead'],
    messages: [
      { n: 1, at: '2026-10-01T00:00:00Z', by: 'user', text: `My phone ${V.device} at ${V.lan}.12 lags. Please ask Bartholomew about it.` },
      { n: 2, at: '2026-10-01T00:01:00Z', by: 'lead', text: `Logs are in /Users/${V.home}/out and the phone is ${V.udid}. Chrome and Safari agree.` },
      { n: 3, at: '2026-10-01T00:02:00Z', by: 'user', text: 'ช่วยดูหน่อย' },
      { n: 4, at: '2026-10-01T00:03:00Z', by: 'user', text: `From: Partner Desk\nTo: ${V.email}\nSubject: study\n\nDear ${V.name}, approved.\nRegards` },
      { n: 5, at: '2026-10-01T00:04:00Z', by: 'user', text: 'see the picture', images: ['m5-1.png'] },
    ],
    history: [{ at: '2026-10-01T00:00:00Z', who: 'user', action: 'created' }],
  }));
  put(state, 'console/threads/T-002.json', json({ id: 'T-002', title: 'Plain thread', status: 'closed', createdBy: 'lead', createdAt: '2026-10-02T00:00:00Z', messages: [{ n: 1, at: '2026-10-02T00:00:00Z', by: 'lead', text: 'Chrome run done, numbers in out/lead/console-cited.txt.' }], history: [] }));
  put(state, 'console/threads/desk.json', json({ desk: V.name }));
  put(state, 'console/threads/topics.json', json({}));
  put(state, 'console/threads/T-001/m5-1.png', png(1290, 2796, V.name));
  put(state, 'console/C-001.json', json({ id: 'C-001', by: 'lead', kind: 'action', title: 'Swipe test', instructions: `Hold ${V.device} and swipe.`, url: `http://${V.lan}.12:5200/`, status: 'done', parts: [{ label: 'swipe', state: 'done', at: { started: 't1', done: 't2' } }], result: { value: 'B', notes: 'B felt smoother, Gwendolyn agreed', at: 't3' }, history: [] }));
  put(state, 'console/proposals/PR-001.json', json({
    id: 'PR-001', by: 'fix-hero', title: 'Hero blur', problem: `Laggy on ${V.device}`, state: 'decided', rev: 1, gain: [{ what: 'frames', before: '9', after: '0', tag: 'measured', how: 'Chrome' }],
    compare: { a: { label: 'old' }, shots: [{ caption: 'phone', a: 'r1-a-1.png', b: 'r1-b-1.png' }] },
    options: [{ name: 'o1', label: 'blur', idea: 'cache the blur', compare: { shots: [{ caption: 'mac', a: 'r1-o1-a-1.png', b: 'r1-o1-b-1.png' }] } }],
    decisions: [{ value: 'approve', notes: `ok, ${V.name}`, who: 'user', rev: 1, at: 't' }], revisions: [], history: [],
  }));
  put(state, 'console/proposals/PR-001/r1-a-1.png', png(430, 932, 'chrome'));
  put(state, 'console/proposals/PR-001/r1-b-1.png', png(1290, 2796, 'phone'));
  put(state, 'console/proposals/PR-001/r1-o1-a-1.png', png(1440, 900, 'mac'));
  put(state, 'console/proposals/PR-001/r1-o1-b-1.png', png(1440, 900, 'mac')); // identical to a-1: encoded once
  put(state, 'console/proposals/PR-001/r2-o1-a-1.png', png(1752, 968, 'mac2'));
  put(state, 'console/proposals/PR-001/r2-o1-b-1.png', png(640, 480, 'zoom'));
  put(state, 'console/proposals/PR-001/r1-video-a.mp4', Buffer.from('\x00\x00\x00\x18ftypmp42 fake video bytes'));
  put(state, 'console/live/overlays/x.js', `// ${V.name}`);
  put(state, 'console/server.json', json({ port: 7777, host: `${V.lan}.12` }));
  put(state, 'console/proposal-reads.json', json({}));
  put(state, 'console/answer-lint-overrides.jsonl', '{}\n');
  put(state, 'status/i001-hero.json', json({ id: 'i001-hero', title: 'Hero fix', kind: 'fix', owner: 'fix-hero', state: 'done', note: `measured on ${V.device}`, history: [] }));
  put(state, 'findings/F-001.json', json({ id: 'F-001', kind: 'pitfall', topics: ['hero'], title: 'Blur costs', body: `see /Users/${V.home}/x`, by: 'fix-hero', postedAt: 't', status: 'open', acks: [], history: [] }));
  put(state, 'incidents/I-001.json', json({ id: 'I-001', title: 'serve crash', status: 'resolved', class: 'tool', reportedBy: 'lead', openedAt: 't', env: `/Users/${V.home}/src node 24`, error: 'EADDRINUSE', affected: ['lead'], history: [] }));
  for (const d of ['locks', 'servers', 'wda', 'usage', 'idle', 'archive', 'sim', 'weird']) put(state, `${d}/x.json`, json({ secret: V.udid, host: `${V.lan}.12` }));
  return state;
}

/** A source repo: README, an allowlisted test fixture, licence files, the snapshot trees (with FAKE_KEY in SECRET_FILE)
 *  and their pin in baseline.json. */
export function makeSourceRepo(dir, git) {
  mkdirSync(dir, { recursive: true });
  makeFixtureHome(dir);
  put(dir, SECRET_FILE, `var cfg = {\n  apiKey: "${FAKE_KEY}",\n  region: 'x',\n};\n`);
  put(dir, SECRET_COPY, `var cfg=JSON.parse("{\\"apiKey\\":\\"${FAKE_KEY}\\",\\"region\\":\\"x\\"}");\n`);
  put(dir, 'README.md', `# study\nrun from /Users/${V.home}/src\n`);
  put(dir, 'tests/fixtures/lan.txt', `fixture ${V.lan}.200\nreal ${V.lan}.5\n`);
  put(dir, 'LICENSE', 'MIT License\n\nCopyright (c) 2026 the author\n');
  put(dir, 'LICENSES/MIT.txt', 'MIT License\n');
  put(dir, 'REUSE.toml', 'version = 1\n');
  // the write-ups cite these out/lead and out/tryit files by path (a log, a link and a `..` path among them: never shipped)
  put(dir, 'research/notes/README.md', '# notes\nSee out/lead/notes.txt, out/lead/pic.avif and out/tryit/t.diff. The run log: out/lead/run.log.\n'
    + 'A link: out/lead/link.txt. Up and over: out/lead/../tryit/x.txt.\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  const trees = { site: git(dir, 'rev-parse', 'HEAD:site'), 'site-pretty': git(dir, 'rev-parse', 'HEAD:site-pretty') };
  put(dir, 'baseline.json', json({ snapshot: B.snapshotId('1000', trees), build: '1000', trees, contentHash: B.contentHash(trees), prettier: '3.9.9' }));
  git(dir, 'add', 'baseline.json');
  // authored by the user (their name and e-mail are known literals): the release keeps it, check.mjs --source accepts it
  git(dir, 'commit', '-q', '-m', 'pin', '--author', `${V.name} <${V.email}>`);
  return dir;
}

/** An out/ tree: the include set, files never packed inside it, and folders never packed. */
export function makeOutRoot(out) {
  put(out, 'article-gifs/a.gif', gif([gifApp('NETSCAPE2.0', '\x01\x00\x00')]));
  put(out, 'article-video/v.mp4', Buffer.from('\x00\x00\x00\x18ftypisom video'));
  put(out, 'people-blink/art/p.mov', Buffer.from('\x00\x00\x00\x14ftypqt  mov'));
  put(out, 'people-blink/.DS_Store', Buffer.from('\x00\x00\x00\x01Bud1'));
  put(out, 'ab/hero/results.json', json({ host: `${V.lan}.12`, cwd: `/Users/${V.home}/src` }));
  put(out, 'ab/hero/shot.png', png(430, 932, 'ab'));
  put(out, 'iphone-screen/r.json', json({ device: V.device }));
  put(out, 'iphone-screen/r.mov', Buffer.from('\x00\x00mov'));
  put(out, 'iphone-screen/r.log', 'log\n');
  put(out, 'snapshots/best/x.js', 'export const a=1;\n');
  put(out, 'tryit/t.diff', `--- a\n+++ b\n# ${V.email}\n`);
  put(out, 'tryit/x.txt', 'cited only through out/lead/../\n');
  put(out, 'lead/notes.txt', `asked ${V.name}\n`);
  put(out, 'lead/console-cited.txt', 'cited by the console record only: never shipped\n');
  put(out, 'lead/t163-draft.txt', 'a reply draft nobody cites\n');
  put(out, 'lead/run.log', 'cited, but a log\n');
  put(out, 'ab/hero/run.log', 'a log inside an included folder\n');
  put(out, 'ab/hero/history.db', Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(84)])); // by its bytes, not its name
  put(out, 'ab/Login Data/state', 'login store');
  symlinkSync('notes.txt', join(out, 'lead', 'link.txt')); // links are never packed (npm run init refuses them)
  put(out, 'lead/pic.avif', avif());
  put(out, 'lead/key.pem', ['-----BEGIN ', 'PRIVATE KEY-----\n'].join('')); // built at run time: no secret shape in this file
  put(out, 'lead/chrome-x/Default/Cookies', 'cookie');
  put(out, 'certs/key.pem', 'k');
  put(out, 'chrome-verify-profile/Default/History', 'h');
  put(out, 'archive/x.txt', 'x');
  put(out, 'engines/e.bin', 'e');
  put(out, 'pages-repo/index.html', 'p');
  put(out, 'cf-review/r.txt', 'r');
  put(out, 'top.log', 'loose');
  put(out, 'other/thing.txt', 'o');
  return out;
}

/** Fake cwebp/tesseract/ffmpeg executables; their calls go to <dir>/<name>.log (one JSON line per call). */
export function fakeBins(dir) {
  const cwebp = put(dir, 'fake-cwebp.mjs', `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
if (a[0] === '-version') { console.log('1.6.0'); process.exit(0); }
appendFileSync(${JSON.stringify(join(dir, 'cwebp.log'))}, JSON.stringify(a) + '\\n');
const o = a[a.indexOf('-o') + 1];
const vals = new Set(['-q', '-metadata']);
const inp = a.find((x, i) => i < a.indexOf('-o') && !x.startsWith('-') && !vals.has(a[i - 1]));
const src = readFileSync(inp);
const px = Buffer.from(src.subarray(16, 24)), n = Buffer.alloc(4); n.writeUInt32LE(px.length);
const body = Buffer.concat([Buffer.from('VP8 '), n, px, px.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); // one well-formed VP8 chunk
const h = Buffer.alloc(12); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(body.length + 4, 4); h.write('WEBP', 8, 'latin1');
writeFileSync(o, Buffer.concat([h, body]));
`);
  const tess = put(dir, 'fake-tesseract.mjs', `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.5.1'); process.exit(0); }
appendFileSync(${JSON.stringify(join(dir, 'tesseract.log'))}, JSON.stringify(a) + '\\n');
const buf = readFileSync(a[0]);
const w = buf.length >= 20 && buf.toString('latin1', 1, 4) === 'PNG' ? buf.readUInt32BE(16) : 0;
const map = { 1290: '9:41 ${V.device} Wi-Fi', 1440: 'Finder File Edit ${V.lan}.12', 1752: 'just a chart' };
process.stdout.write((map[w] || '') + '\\n');
`);
  // ffmpeg: copies the input to the output (the last argument), as a metadata-stripping remux would keep the streams
  const ffmpeg = put(dir, 'fake-ffmpeg.mjs', `#!/usr/bin/env node
import { appendFileSync, copyFileSync } from 'node:fs';
const a = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(dir, 'ffmpeg.log'))}, JSON.stringify(a) + '\\n');
copyFileSync(a[a.indexOf('-i') + 1], a[a.length - 1]);
`);
  chmodSync(cwebp, 0o755); chmodSync(tess, 0o755); chmodSync(ffmpeg, 0o755);
  return { cwebp, tess, ffmpeg, missing: join(dir, 'no-such-binary'), env: { FW_CWEBP: cwebp, FW_TESSERACT: tess, FW_FFMPEG: ffmpeg } };
}

export const runGit = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'fw-test', GIT_AUTHOR_EMAIL: 'fw-test@example.invalid', GIT_COMMITTER_NAME: 'fw-test', GIT_COMMITTER_EMAIL: 'fw-test@example.invalid' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** The headers of an uncompressed tar archive: [{name, uid, gid, uname, gname}] (ustar fields, no tar binary). */
export function tarHeaders(buf) {
  const out = [];
  const str = (o, n) => buf.toString('latin1', o, o + n).replace(/\0.*$/s, '');
  for (let off = 0; off + 512 <= buf.length;) {
    if (buf.subarray(off, off + 512).every((b) => b === 0)) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    out.push({ name: str(off, 100), type: str(off + 156, 1), uid: str(off + 108, 8).trim(), gid: str(off + 116, 8).trim(), uname: str(off + 265, 32), gname: str(off + 297, 32) });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

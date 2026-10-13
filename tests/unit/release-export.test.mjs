// I-270: the release export of the console record (tools/release/export-console.mjs) and the picture encoder with its
// review sheet (tools/release/pictures.mjs), on a fixture store with made-up values. The tools run from a staged copy
// (tests/fixtures/release/stage.mjs) with I-269's rules.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { stageTools, writeKnown, makeState, makeOutRoot, fakeBins, png, pngChunk, avif, V, ALL_VALUES } from '../fixtures/release/stage.mjs';
import { spawnSync } from 'node:child_process';
import { walkFiles, knownFile, DEFAULT_KNOWN, show, scanFileLiterals, insideAny, tarMetaHits, tarCreate, tarFlags } from '../../tools/release/release-util.mjs';

const root = tempDir('fw-release-unit-');
const staged = stageTools(root);
const R = await import(staged.url('rules.mjs'));
const E = await import(staged.url('export-console.mjs'));
const P = await import(staged.url('pictures.mjs'));
const knownPath = writeKnown(root);
const rules = R.buildRules(R.loadKnown(knownPath));

/** Every file under dir that holds one of the made-up values (by relative path). */
function leaks(dir) {
  const bad = [];
  for (const f of walkFiles(dir)) { const b = readFileSync(join(dir, f)); for (const v of ALL_VALUES) if (b.includes(Buffer.from(v)) || f.includes(v)) bad.push(f); }
  return [...new Set(bad)];
}

test('I-270 export-console: Markdown + JSON per thread/step/proposal, board files and index; every value scrubbed', () => {
  const d = tempDir('fw-release-exp-');
  const state = makeState(join(d, 'state'));
  const out = join(d, 'console');
  const r = E.exportConsole({ state, out, rules });
  assert.deepEqual(r.counts, { threads: 2, steps: 1, proposals: 1, status: 1, findings: 1, incidents: 1 });
  for (const f of ['index.md', 'threads/T-001.md', 'threads/T-001.json', 'threads/T-002.md', 'steps/C-001.md', 'steps/C-001.json', 'proposals/PR-001.md', 'proposals/PR-001.json', 'status.md', 'status.json', 'findings.md', 'findings.json', 'incidents.md', 'incidents.json']) assert.ok(existsSync(join(out, f)), f);
  assert.deepEqual(leaks(out), [], 'no made-up value in the export');
  const t = JSON.parse(readFileSync(join(out, 'threads/T-001.json'), 'utf8'));
  assert.equal(t.title, 'Lag on <device-name>');
  assert.match(t.messages[0].text, /<device-name> at 192\.168\.0\.12 lags/);
  assert.match(t.messages[1].text, /\/Users\/<user>\/out and the phone is <udid>/);
  const md = readFileSync(join(out, 'threads/T-001.md'), 'utf8');
  assert.match(md, /^# T-001: Lag on <device-name>/);
  assert.match(md, /## #2 · lead · 2026-10-01T00:01:00Z/);
  assert.match(md, /1 picture\(s\) attached in the console; not exported/);
  assert.match(readFileSync(join(out, 'index.md'), 'utf8'), /\| \[T-001\]\(threads\/T-001\.md\) \| Lag on <device-name> \| open \| 5 \|/);
  assert.ok(r.hits.length >= 4 && r.hits.every((h) => h.count > 0 && !ALL_VALUES.some((v) => h.id.includes(v))), 'hits by rule id');
  const sum = r.hits.reduce((a, h) => a + h.count, 0);
  assert.ok(sum >= 12, `replaced ${sum}`);
});

test('I-270 export-console: values in any letter case and secrets are taken out; where a secret was is listed for a human read', () => {
  const d = tempDir('fw-release-exp-');
  const state = makeState(join(d, 'state'));
  const token = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join(''); // built at run time: no secret shape in this file
  writeFileSync(join(state, 'console/threads/T-003.json'), JSON.stringify({ id: 'T-003', title: 'Case', status: 'open', createdBy: 'lead', messages: [
    { n: 1, at: 't', by: 'lead', text: `${V.name.toUpperCase()} and ${V.home.toUpperCase()} pasted ${token} by mistake` }] }));
  const out = join(d, 'console');
  const r = E.exportConsole({ state, out, rules });
  const t = JSON.parse(readFileSync(join(out, 'threads/T-003.json'), 'utf8'));
  assert.equal(t.messages[0].text, '<name> and <user> pasted [secret omitted: secret-github] by mistake');
  assert.ok(!readFileSync(join(out, 'threads/T-003.md'), 'utf8').includes(token.slice(4)));
  assert.ok(r.hits.some((h) => h.id === 'secret-github' && h.count === 1));
  assert.deepEqual(r.needsHumanRead.find((n) => n.where === 'T-003 #1')?.kinds, ['secret-omitted']);
});

test('I-270 export-console: proposal pictures point at the .webp files; Markdown shows them from PR-NNN/', () => {
  const d = tempDir('fw-release-exp-');
  const state = makeState(join(d, 'state'));
  const out = join(d, 'console');
  E.exportConsole({ state, out, rules });
  const p = JSON.parse(readFileSync(join(out, 'proposals/PR-001.json'), 'utf8'));
  assert.deepEqual([p.compare.shots[0].a, p.compare.shots[0].b, p.options[0].compare.shots[0].a], ['r1-a-1.webp', 'r1-b-1.webp', 'r1-o1-a-1.webp']);
  const md = readFileSync(join(out, 'proposals/PR-001.md'), 'utf8');
  assert.match(md, /!\[A\]\(PR-001\/r1-o1-a-1\.webp\) !\[B\]\(PR-001\/r1-o1-b-1\.webp\)/);
  assert.match(md, /Problem\n\nLaggy on <device-name>/);
  assert.match(md, /rev 1 t user: \*\*approve\*\* - ok, <name>/);
});

test('I-270 export-console: never-export folders and console internals are not read; each is listed with a reason', () => {
  const d = tempDir('fw-release-exp-');
  const state = makeState(join(d, 'state'));
  const out = join(d, 'console');
  const r = E.exportConsole({ state, out, rules });
  assert.deepEqual(readdirSync(out).sort(), ['findings.json', 'findings.md', 'incidents.json', 'incidents.md', 'index.md', 'proposals', 'status.json', 'status.md', 'steps', 'threads']);
  assert.deepEqual(readdirSync(join(out, 'proposals')).sort(), ['PR-001.json', 'PR-001.md'], 'no pictures from the export (pictures.mjs ships them)');
  assert.ok(!readdirSync(join(out, 'threads')).some((f) => /desk|topics|^T-001$/.test(f)));
  const ex = Object.fromEntries(r.excluded.map((e) => [e.path, e.reason]));
  for (const k of ['locks/', 'servers/', 'wda/', 'usage/', 'idle/', 'archive/', 'sim/']) assert.equal(ex[k], E.EXCLUDED_DIRS[k.slice(0, -1)], k);
  assert.equal(ex['weird/'], 'not in the export allowlist');
  assert.equal(ex['console/live/'], E.EXCLUDED_DIRS.live);
  for (const k of ['console/server.json', 'console/proposal-reads.json', 'console/answer-lint-overrides.jsonl', 'console/threads/desk.json', 'console/threads/topics.json']) assert.ok(ex[k], k);
  assert.match(ex['console/threads/T-*/ (1)'], /attached to thread messages/);
  assert.match(ex['console/proposals/PR-*/ (1)'], /pictures\.mjs/);
  for (const k of ['live', 'archive', 'sim', 'usblink', 'phone-profile', 'servers', 'tryit', 'wda', 'locks', 'waits', 'space', 'thermal', 'usage']) assert.ok(E.EXCLUDED_DIRS[k], `never-export list names ${k}`);
});

test('I-270 export-console: needs-human-read names Thai text, a pasted e-mail and capitalised non-product words, never the text', () => {
  const d = tempDir('fw-release-exp-');
  const r = E.exportConsole({ state: makeState(join(d, 'state')), out: join(d, 'console'), rules });
  const by = Object.fromEntries(r.needsHumanRead.map((n) => [n.where, n.kinds]));
  assert.deepEqual(by['T-001 #1'], ['capitalised-words(1)'], 'Bartholomew mid-sentence; "My", "Please" start sentences');
  assert.deepEqual(by['T-001 #3'], ['thai-text']);
  assert.ok(by['T-001 #4'].includes('pasted-email'));
  assert.deepEqual(by['C-001 result'], ['capitalised-words(1)']);
  assert.equal(by['T-001 #2'], undefined, 'agent texts: only Thai counts');
  assert.equal(by['T-002 #1'], undefined);
  const txt = JSON.stringify(r.needsHumanRead);
  for (const w of ['Bartholomew', 'Gwendolyn', 'ช', 'Partner']) assert.ok(!txt.includes(w), w);
});

test('I-270 needs-human-read helpers: sentence starts, tokens and vocabulary', () => {
  assert.deepEqual(E.midSentenceCaps('Hello there. Ask Mark now\n- Item one, then Bob\'s idea (Yes) and <Token>'), ['Mark', 'Bob']);
  assert.equal(E.looksLikeEmail('From: a\nSubject: b\nhi'), true);
  assert.equal(E.looksLikeEmail('Hi team,\nthe build works.\nThanks'), true);
  assert.equal(E.looksLikeEmail('from the start: the subject is'), false);
  const texts = [1, 2, 3].map((i) => ({ where: `T-${i} #1`, record: `T-${i}`, by: 'lead', text: `we tested it on Lighthousey today, ${i}` }));
  texts.push({ where: 'T-9 #1', record: 'T-9', by: 'user', text: 'it broke on Lighthousey and Zed' });
  assert.deepEqual(E.needsHumanRead(texts), [{ where: 'T-9 #1', by: 'user', kinds: ['capitalised-words(1)'] }], 'a word agents use in 3+ records is vocabulary');
});

/** Run fn with process.env extended by env, then restore it. */
async function withEnv(env, fn) {
  const was = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

test('I-270 pictures: PNG -> WebP with -metadata none at quality 85 (or -lossless), identical pictures once, MP4 metadata stripped', async () => {
  const d = tempDir('fw-release-pic-');
  const state = makeState(join(d, 'state'));
  const bins = fakeBins(join(d, 'bin'));
  await withEnv(bins.env, async () => {
    const r = await P.encodePictures({ state, out: join(d, 'media'), sheet: join(d, 'review-sheet.md'), rules, jobs: 2 });
    assert.equal(r.pictures, 6);
    assert.equal(r.distinct, 5);
    assert.equal(r.videos, 1);
    const files = walkFiles(join(d, 'media'));
    assert.deepEqual(files, ['console/proposals/PR-001/r1-a-1.webp', 'console/proposals/PR-001/r1-b-1.webp', 'console/proposals/PR-001/r1-o1-a-1.webp', 'console/proposals/PR-001/r1-o1-b-1.webp', 'console/proposals/PR-001/r1-video-a.mp4', 'console/proposals/PR-001/r2-o1-a-1.webp', 'console/proposals/PR-001/r2-o1-b-1.webp']);
    for (const f of files.filter((x) => x.endsWith('.webp'))) { const b = readFileSync(join(d, 'media', f)); assert.equal(b.toString('latin1', 0, 4) + b.toString('latin1', 8, 12), 'RIFFWEBP', f); }
    const ff = readFileSync(join(d, 'bin/ffmpeg.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(ff.length, 1);
    assert.ok(ff[0].join(' ').includes('-map_metadata -1') && ff[0].join(' ').includes('-c copy'), 'ffmpeg strips the container metadata, streams copied');
    assert.equal(ff[0].at(-1), join(d, 'media/console/proposals/PR-001/r1-video-a.mp4'));
    const calls = readFileSync(join(d, 'bin/cwebp.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(calls.length, 5, 'one encode per distinct picture');
    for (const c of calls) { assert.deepEqual(c.slice(0, 5), ['-quiet', '-metadata', 'none', '-q', '85']); assert.ok(!c.includes('-lossless')); }
    const r2 = await P.encodePictures({ state, out: join(d, 'media2'), sheet: join(d, 'sheet2.md'), rules, lossless: true, jobs: 1 });
    assert.equal(r2.pictures, 6);
    const calls2 = readFileSync(join(d, 'bin/cwebp.log'), 'utf8').trim().split('\n').slice(5).map((l) => JSON.parse(l));
    for (const c of calls2) { assert.ok(c.includes('-lossless')); assert.ok(!c.includes('-q')); }
    assert.ok(!existsSync(join(d, 'media', '.encode')), 'no temp files left in the media tree');
    await withEnv({ FW_FFMPEG: bins.missing }, () => assert.rejects(P.encodePictures({ state, out: join(d, 'media3'), rules }), /ffmpeg not found/));
  });
});

test('I-270 pictures: review sheet lists every picture but 430x932 and every video, with OCR hit kinds, never the text', async () => {
  const d = tempDir('fw-release-pic-');
  const state = makeState(join(d, 'state'));
  const bins = fakeBins(join(d, 'bin'));
  await withEnv(bins.env, async () => {
    const r = await P.encodePictures({ state, out: join(d, 'media'), sheet: join(d, 'review-sheet.md'), rules });
    const by = Object.fromEntries(r.flagged.map((f) => [f.path.split('/').pop(), f.kinds ?? f.note]));
    assert.deepEqual(Object.keys(by).sort(), ['r1-b-1.webp', 'r1-o1-a-1.webp', 'r1-o1-b-1.webp', 'r1-video-a.mp4', 'r2-o1-a-1.webp', 'r2-o1-b-1.webp'], 'only the 430x932 shot is not listed');
    assert.deepEqual(by['r1-b-1.webp'], ['time-like', 'iphone', 'wifi', 'known-literal']);
    assert.deepEqual(by['r1-o1-a-1.webp'], ['ip-like']);
    assert.deepEqual(by['r2-o1-a-1.webp'], []);
    assert.deepEqual(by['r2-o1-b-1.webp'], []);
    assert.equal(by['r1-video-a.mp4'], 'video: watch it');
    const tcalls = readFileSync(join(d, 'bin/tesseract.log'), 'utf8').trim().split('\n');
    assert.equal(tcalls.length, 4, 'OCR once per distinct listed picture');
    const sheet = readFileSync(join(d, 'review-sheet.md'), 'utf8');
    assert.match(sheet, /\| console\/proposals\/PR-001\/r1-b-1\.webp \| 1290x2796 \| time-like, iphone, wifi, known-literal \|/);
    assert.match(sheet, /\| console\/proposals\/PR-001\/r2-o1-a-1\.webp \| 1752x968 \| none found \|/);
    assert.match(sheet, /\| console\/proposals\/PR-001\/r1-video-a\.mp4 \|  \| video: watch it \| container metadata stripped \|/);
    assert.match(sheet, /\| console\/proposals\/PR-001\/r1-b-1\.webp \| 1290x2796 \| [^|]+ \| none \|/, 'the WebP cwebp wrote carries no metadata');
    assert.ok(!/r1-a-1\.webp/.test(sheet));
    for (const w of ['9:41', 'Finder', 'chart', `${V.lan}.12`, V.device, 'Quentin']) assert.ok(!sheet.includes(w), `sheet holds no OCR text: ${w}`);
    await withEnv({ FW_TESSERACT: bins.missing }, async () => {
      const logged = [], log = console.log;
      console.log = (...a) => logged.push(a.join(' '));
      let r2;
      try { r2 = await P.encodePictures({ state, out: join(d, 'media2'), sheet: join(d, 'sheet2.md'), rules }); } finally { console.log = log; }
      assert.ok(logged.some((l) => /^WARN tesseract not found \(.*\): no OCR/.test(l)), 'a missing tesseract is said, not only written into the sheet');
      assert.equal(r2.ocr, null);
      assert.equal(r2.flagged.length, 6, 'without tesseract every picture and video is still listed');
      assert.match(readFileSync(join(d, 'sheet2.md'), 'utf8'), /OCR: not run \(tesseract not installed\)[\s\S]*\| 1290x2796 \| OCR not run \|/);
    });
    await withEnv({ FW_CWEBP: bins.missing }, () => assert.rejects(P.encodePictures({ state, out: join(d, 'media3'), rules }), /cwebp not found/));
  });
});

test('I-270 pictures: with --out-root the out/ images and videos pack.mjs ships are listed too (OCR on PNG/GIF/JPEG)', async () => {
  const d = tempDir('fw-release-pic-');
  const state = makeState(join(d, 'state'));
  const outRoot = makeOutRoot(join(d, 'out'));
  const bins = fakeBins(join(d, 'bin'));
  await withEnv(bins.env, async () => {
    writeFileSync(join(outRoot, 'lead', 'snap.avif'), avif(true));
    writeFileSync(join(outRoot, 'people-blink', 'meta.png'), png(800, 600, '', [pngChunk('tEXt', 'Author\0someone')]));
    // out/lead ships only what is cited: pic.avif and snap.avif here, not the other lead files
    const r = await P.encodePictures({ state, out: join(d, 'media'), sheet: join(d, 'review-sheet.md'), outRoot, cited: new Set(['out/lead/pic.avif', 'out/lead/snap.avif']), rules });
    const outRows = Object.fromEntries(r.flagged.filter((f) => f.path.startsWith('out/')).map((f) => [f.path, f.note ?? f.kinds]));
    assert.deepEqual(outRows, { 'out/article-gifs/a.gif': [], 'out/article-video/v.mp4': 'video: watch it', 'out/lead/pic.avif': 'no OCR for this format: look at it', 'out/lead/snap.avif': 'no OCR for this format: look at it', 'out/people-blink/art/p.mov': 'video: watch it', 'out/people-blink/meta.png': [], 'out/ab/hero/shot.png': [] }, 'the never-packed iphone-screen video is not listed; a 430x932 shot only for its metadata');
    const sheet = readFileSync(join(d, 'review-sheet.md'), 'utf8');
    assert.match(sheet, /\| out\/article-gifs\/a\.gif \| 1x1 \| none found \| none \|/);
    assert.match(sheet, /\| out\/lead\/snap\.avif \|  \| no OCR for this format: look at it \| \*\*refused\*\* \(xmp\): xmp \|/);
    assert.match(sheet, /\| out\/people-blink\/meta\.png \| 800x600 \| none found \| stripped: text \|/);
    assert.ok(!sheet.includes('someone') && !sheet.includes('upload-1234'), 'kinds only, never the values');
    assert.match(sheet, /\| out\/ab\/hero\/shot\.png \| 430x932 \| none found \| stripped: private-chunk \|/, 'a Chrome viewport shot is listed when it carries metadata');
    assert.match(sheet, /- out\/ media and data: 7 images and videos/);
    const none = await P.encodePictures({ state, out: join(d, 'media2'), sheet: join(d, 'sheet2.md'), outRoot, rules });
    assert.ok(!none.flagged.some((f) => f.path.startsWith('out/lead/')), 'nothing cited: nothing of out/lead');
  });
});

test('I-270 pictures: OCR hit kinds and the review sizes', () => {
  assert.deepEqual(P.ocrKinds('12:05 ...', []), ['time-like']);
  assert.deepEqual(P.ocrKinds('v1.2.3 build 3.14 and 25:99', []), []);
  assert.deepEqual(P.ocrKinds('at 10.0.0.12 on iPhone, WiFi', []), ['ip-like', 'iphone', 'wifi']);
  assert.deepEqual(P.ocrKinds('Quentin Zor blax', ['QuentinZorblax']), ['known-literal'], 'OCR spacing does not hide a literal');
  assert.equal(P.isReviewSize(430, 932), false);
  assert.equal(P.isReviewSize(1290, 2796), true);
  assert.equal(P.isReviewSize(1440, 900), true);
  assert.equal(P.isReviewSize(1752, 1452), true);
  assert.equal(P.isReviewSize(1152, 288), true, 'every size but the Chrome viewport is listed');
  assert.equal(P.isReviewSize(645, 1398), true, 'a half-size phone screenshot');
  assert.equal(P.isReviewSize(860, 1864), true);
  assert.deepEqual(P.gifSize(Buffer.from('GIF89a\x40\x01\xf0\x00', 'latin1')), [320, 240]);
  assert.equal(P.gifSize(Buffer.from('not a gif')), null);
  assert.deepEqual(P.pngSize(png(1290, 900)), [1290, 900]);
  assert.throws(() => P.pngSize(Buffer.from('GIF89a......................')), /not a PNG/);
});

test('I-270 known values file: --known, else $FW_RELEASE_KNOWN (as rules.mjs), else ~/.cache/fw-release/known.json', () => {
  const was = process.env.FW_RELEASE_KNOWN;
  try {
    delete process.env.FW_RELEASE_KNOWN;
    assert.equal(knownFile({}), DEFAULT_KNOWN);
    assert.match(DEFAULT_KNOWN, /\/\.cache\/fw-release\/known\.json$/);
    process.env.FW_RELEASE_KNOWN = '/tmp/k/known.json';
    assert.equal(knownFile({}), '/tmp/k/known.json');
    assert.equal(knownFile({ known: '/tmp/other.json' }), '/tmp/other.json');
  } finally {
    if (was === undefined) delete process.env.FW_RELEASE_KNOWN; else process.env.FW_RELEASE_KNOWN = was;
  }
});

test('I-270 release-util: print-safe paths (home as ~, values as tokens), outside-the-repo guard', () => {
  const home = os.homedir();
  assert.equal(show(`${home}/x/y and ${home}`), '~/x/y and ~');
  assert.equal(show(`cwd /Users/${V.home}/src, ${V.name.toUpperCase()}`, rules), 'cwd /Users/<user>/src, <name>');
  const d = tempDir('fw-release-guard-');
  mkdirSync(join(d, 'repo'));
  symlinkSync(join(d, 'repo'), join(d, 'link'));
  assert.equal(insideAny(join(d, 'link', 'new', 'out'), [join(d, 'repo')]), join(d, 'repo'), 'a symlink into the repo is inside it');
  assert.equal(insideAny(join(d, 'repo'), [join(d, 'repo')]), join(d, 'repo'));
  assert.equal(insideAny(join(d, 'elsewhere'), [join(d, 'repo')]), null);
});

test('I-270 release-util: literal byte scan finds values in any case, across stream chunks and inside gzip', async () => {
  const d = tempDir('fw-release-bytes-');
  const big = Buffer.alloc(65536 * 2, 0x20);
  Buffer.from(V.home.toUpperCase()).copy(big, 65536 - 3); // across the 64 KiB read boundary
  Buffer.from(V.email).copy(big, 1000);
  writeFileSync(join(d, 'a.bin'), big);
  const hits = Object.fromEntries((await scanFileLiterals(join(d, 'a.bin'), rules)).map((h) => [`${h.id} ${h.where}`, h.count]));
  const id = (v) => rules.find((x) => x.match === v).id;
  assert.deepEqual(hits, { [`${id(V.home)} bytes`]: 1, [`${id(V.email)} bytes`]: 1 });
  writeFileSync(join(d, 'b.gz'), gzipSync(Buffer.from(`ustar header ${V.home}\n`)));
  const gz = await scanFileLiterals(join(d, 'b.gz'), rules, { gunzip: true });
  assert.deepEqual(gz, [{ id: id(V.home), count: 1, where: 'gunzipped' }], 'compressed bytes hide it; the gunzipped bytes do not');
  // a read error or a broken gzip rejects (never a scan that waits forever)
  writeFileSync(join(d, 'bad.gz'), 'not gzip at all');
  await assert.rejects(scanFileLiterals(join(d, 'bad.gz'), rules, { gunzip: true }), /incorrect header check/);
  await assert.rejects(scanFileLiterals(join(d, 'no-such.gz'), rules, { gunzip: true }), /ENOENT/);
  await assert.rejects(scanFileLiterals(d, rules, { gunzip: true }), /EISDIR/);
});

/** One ustar entry (header + data padded to 512); `type` '0' file, 'x' pax header. */
function tarEntry(name, data = '', type = '0') {
  const h = Buffer.alloc(512), d = Buffer.from(data);
  h.write(name, 0, 'utf8'); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(d.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write(type, 156); h.write('ustar\0' + '00', 257);
  return Buffer.concat([h, d, Buffer.alloc((512 - (d.length % 512)) % 512)]);
}
/** A pax record "<len> key=value\n" (len counts itself). */
function pax(key, value) {
  const body = ` ${key}=${value}\n`;
  let n = body.length + 1;
  while (String(n).length + body.length !== n) n = String(n).length + body.length;
  return `${n}${body}`;
}
const tarOf = (...entries) => Buffer.concat([...entries, Buffer.alloc(1024)]);

test('I-270 release-util: tarMetaHits finds xattr, ACL and Apple pax records and ._ entries in the headers, never in file data', async () => {
  const d = tempDir('fw-release-tarmeta-');
  const w = (name, buf) => { writeFileSync(join(d, name), buf); return join(d, name); };
  const clean = w('clean.tar', tarOf(tarEntry('a.txt', 'a write-up may say SCHILY.xattr, LIBARCHIVE.xattr, com.apple and ._x'), tarEntry('dir/b.txt', 'b')));
  assert.deepEqual(await tarMetaHits(clean), []);
  const meta = tarOf(
    tarEntry('PaxHeader/a.txt', pax('LIBARCHIVE.xattr.com.apple.provenance', 'AQ') + pax('SCHILY.xattr.com.apple.provenance', 'x'), 'x'), tarEntry('a.txt', 'a'),
    tarEntry('PaxHeader/b.txt', pax('SCHILY.acl.access', 'user::rw-'), 'x'), tarEntry('b.txt', 'b'),
    tarEntry('dir/._c.txt', 'apple double'),
    tarEntry('PaxHeader/x', pax('path', 'deep/._d.png'), 'x'), tarEntry('short-name', 'd'));
  const want = [
    { entry: 'a.txt', what: 'xattr (LIBARCHIVE.xattr)' }, { entry: 'a.txt', what: 'xattr (SCHILY.xattr)' }, { entry: 'a.txt', what: 'Apple metadata (com.apple)' },
    { entry: 'b.txt', what: 'ACL (SCHILY.acl)' },
    { entry: 'dir/._c.txt', what: 'AppleDouble entry (._)' },
    { entry: 'deep/._d.png', what: 'AppleDouble entry (._)' },
  ];
  assert.deepEqual(await tarMetaHits(w('meta.tar', meta)), want, 'a pax record is named by the entry it belongs to');
  assert.deepEqual(await tarMetaHits(w('global.tar', tarOf(tarEntry('pax_global_header', pax('SCHILY.xattr.user.x', 'y'), 'g'), tarEntry('a.txt', 'a')))), [{ entry: '(pax global header)', what: 'xattr (SCHILY.xattr)' }]);
  assert.deepEqual(await tarMetaHits(w('meta.tar.gz', gzipSync(meta)), { gunzip: true }), want, 'gunzipped');
  await assert.rejects(tarMetaHits(w('bad.gz', 'not gzip'), { gunzip: true }), /incorrect header check/);
  // a file or a folder only: a Solaris 'X' record (xattrs in its data), a symlink, a device
  const odd = tarOf(tarEntry('dir/', '', '5'), tarEntry('X/a.txt', pax('SCHILY.xattr.com.apple.provenance', 'AQ'), 'X'), tarEntry('a.txt', 'a'), tarEntry('link', '', '2'), tarEntry('dev', '', '3'));
  assert.deepEqual(await tarMetaHits(w('odd.tar', odd)), [{ entry: 'X/a.txt', what: 'unexpected tar entry type X' }, { entry: 'link', what: 'unexpected tar entry type 2' }, { entry: 'dev', what: 'unexpected tar entry type 3' }]);
});

test('I-270 release-util: tarCreate passes --no-xattrs --no-acls (--no-mac-metadata on macOS); a file macOS tagged leaves no trace', { skip: process.platform !== 'darwin' && 'xattr and bsdtar defaults are macOS' }, async () => {
  const flags = tarFlags();
  for (const f of ['--no-xattrs', '--no-acls', '--no-mac-metadata']) assert.ok(flags.includes(f), f);
  const d = tempDir('fw-release-xattr-');
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'a.png'), 'pixels');
  writeFileSync(join(d, 'src', 'b.txt'), 'text');
  assert.equal(spawnSync('xattr', ['-w', 'com.apple.metadata:fwtest', 'made-up', join(d, 'src', 'a.png')]).status, 0);
  assert.equal(spawnSync('chmod', ['+a', 'everyone deny delete', join(d, 'src', 'b.txt')]).status, 0);
  // the system tar's defaults store both, as pax records and ._ entries: the scan sees them
  assert.equal(spawnSync('tar', ['-cf', join(d, 'plain.tar'), 'a.png', 'b.txt'], { cwd: join(d, 'src') }).status, 0);
  const plain = await tarMetaHits(join(d, 'plain.tar'));
  assert.ok(plain.some((h) => /xattr/.test(h.what)) && plain.some((h) => /AppleDouble/.test(h.what)), JSON.stringify(plain));
  tarCreate(join(d, 'release.tar'), join(d, 'src'), ['a.png', 'b.txt']);
  tarCreate(join(d, 'release.tar.gz'), join(d, 'src'), ['a.png', 'b.txt'], { gzip: true });
  assert.deepEqual(await tarMetaHits(join(d, 'release.tar')), []);
  assert.deepEqual(await tarMetaHits(join(d, 'release.tar.gz'), { gunzip: true }), []);
});

#!/usr/bin/env node
// selftest.mjs: self-test of medium-verify.mjs and draft-snapshot.js on the small fixtures in fixtures/.
// Run: node research/team-article/medium/selftest.mjs   (no Chrome, no network; prints SELFTEST PASS or exits 1)
// Fixtures: copy.html (a tiny paste copy: title, headings, quote, list, 3 PNG/JPEG figures and 1 GIF figure with
// data: headers), manifest.json, alt-short.json (a short alt for the over-500 v02), and three draft snapshots:
// draft-perfect.json (Medium-style: curly quotes, em dash, h3/h4, a leading section divider), draft-broken.json
// (v01 missing, the list pasted as paragraphs, an empty caption, a still image for the GIF, a stray empty
// paragraph, a moved paragraph, one changed word, v02 alt cut at 500) and draft-gif-unknown.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { norm, shortDiff, extractExpected, dataUriInfo, loadDraft, verify, checkTransfer, report } from './medium-verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), FX = join(HERE, 'fixtures');
const run = (...args) => {
  const r = spawnSync(process.execPath, [join(HERE, 'medium-verify.mjs'), '--copy', join(FX, 'copy.html'), '--manifest', join(FX, 'manifest.json'), ...args], { encoding: 'utf8' });
  const rows = Object.fromEntries(r.stdout.split('\n').filter((l) => /^\| [0-9+]/.test(l)).map((l, i) => {
    const c = l.split(' | ').map((s) => s.replace(/^\| ?| ?\|$/g, '').trim());
    return [c[0] === '+' ? `+${i}` : c[0], { type: c[1], item: c[2], state: c[3], img: c[4], cap: c[5], alt: c[6], gif: c[7], note: c[8] }];
  }));
  return { code: r.status, out: r.stdout, err: r.stderr, last: r.stdout.trim().split('\n').pop(), rows };
};
const draft = (n) => ['--draft', join(FX, `draft-${n}.json`)];
const short = ['--alt-overrides', join(FX, 'alt-short.json')], noShort = ['--alt-overrides', 'none'];

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('typographic punctuation does not count as a change', () => {
  assert.equal(norm('It wasn’t “smooth” — at all…'), norm('It wasn\'t "smooth" -- at all...'));
  assert.equal(norm('165–174 k px'), norm('165-174 k px'));
  assert.equal(norm('a​ b\n\n c'), 'a b c');
  assert.notEqual(norm('hold all of that'), norm('hold all of it'));
});
test('short diff names the changed words', () => {
  assert.match(shortDiff('one agent could not hold all of that, so each', 'one agent could not hold all of it, so each'), /\[-that,-\]\{\+it,\+\}/);
});
test('copy extraction: block types, labels, sizes, GIF items', () => {
  const E = extractExpected(readFileSync(join(FX, 'copy.html'), 'utf8'), JSON.parse(readFileSync(join(FX, 'manifest.json'), 'utf8')));
  const count = E.reduce((o, b) => ((o[b.type] = (o[b.type] || 0) + 1), o), {});
  assert.deepEqual(count, { h1: 1, p: 8, h2: 3, blockquote: 1, figure: 4, li: 3 });
  const figs = E.filter((e) => e.type === 'figure');
  assert.deepEqual(figs.map((f) => f.label), ['v01', 'v02', 'shot1', 'v03']);
  assert.deepEqual(figs.map((f) => f.gif), [false, false, false, true]);
  assert.deepEqual([figs[2].width, figs[2].height], [800, 600]); // JPEG size read from the data: URI
  assert.equal(E.find((e) => e.type === 'p' && /reaction/.test(e.text)).text, 'My first reaction was wow. The site said "smooth" and meant it.');
  assert.deepEqual(dataUriInfo('data:image/gif;base64,' + Buffer.from('GIF89a\x78\x05\x56\x01', 'latin1').toString('base64')), { mime: 'gif', width: 1400, height: 342 });
});
test('perfect draft: VERIFY PASS, exit 0, every row OK', () => {
  const r = run(...draft('perfect'), ...short);
  assert.equal(r.code, 0, r.out + r.err); assert.equal(r.last, 'VERIFY PASS');
  assert.equal(Object.values(r.rows).filter((x) => x.state !== 'OK').length, 0);
  assert.equal(Object.keys(r.rows).length, 20);
});
test('broken draft: each fault reported, typographic quotes not counted', () => {
  const r = run(...draft('broken'), ...short), R = r.rows;
  assert.equal(r.code, 1); assert.equal(r.last, 'VERIFY FAIL 10 issues', r.out);
  assert.equal(R[7].state, 'MISSING'); assert.match(R[7].item, /^v01/);                                // missing figure
  for (const n of [10, 11, 12]) { assert.equal(R[n].state, 'CHANGED'); assert.match(R[n].note, /pasted as p, expected li \(list flattened\?\)/); }
  assert.equal(R[15].state, 'CHANGED'); assert.equal(R[15].cap, 'NO'); assert.match(R[15].note, /caption empty/); // empty caption
  assert.equal(R[18].state, 'CHANGED'); assert.equal(R[18].gif, 'NO'); assert.match(R[18].note, /still image where a GIF is expected/);
  const extra = Object.values(R).filter((x) => x.state === 'EXTRA');
  assert.equal(extra.length, 1); assert.match(extra[0].note, /stray empty p/);                         // stray empty paragraph
  assert.equal(R[4].state, 'OK'); assert.equal(R[5].state, 'OK');                                       // curly quotes, em dash
  assert.equal(R[9].state, 'CHANGED'); assert.match(R[9].note, /\[-that,-\]\{\+it,\+\}/);               // changed word, short diff
  assert.equal(R[20].state, 'OUT-OF-ORDER'); assert.match(R[20].note, /found at draft block 4/);       // moved paragraph
  assert.equal(R[13].state, 'CHANGED'); assert.equal(R[13].alt, 'diff');                                // long alt where the short one is expected
  assert.equal(R[14].state, 'OK'); assert.equal(R[16].state, 'OK');                                     // the rest still aligns
});
test('alt cut by Medium at 500 is CUT; an expected alt over 500 is an issue by itself', () => {
  const b = run(...draft('broken'), ...noShort);
  assert.equal(b.rows[13].alt, 'CUT'); assert.match(b.rows[13].note, /alt cut at 500 of \d+ chars/);
  const p = run(...draft('perfect'), ...noShort);
  assert.equal(p.code, 1); assert.equal(p.last, 'VERIFY FAIL 1 issues');
  assert.equal(p.rows[13].alt, 'LONG'); assert.match(p.rows[13].note, /over Medium's 500/);
});
test('GIF that cannot be told apart: an issue, or a WARN with --gif-unknown-ok', () => {
  const r = run(...draft('gif-unknown'), ...short);
  assert.equal(r.code, 1); assert.equal(r.rows[18].gif, '?');
  const ok = run(...draft('gif-unknown'), ...short, '--gif-unknown-ok');
  assert.equal(ok.code, 0); assert.equal(ok.last, 'VERIFY PASS'); assert.match(ok.out, /^WARN v03: can't tell if GIF/m);
});
test('a broken image is an issue; an image still loading is a warning', () => {
  const E = extractExpected(readFileSync(join(FX, 'copy.html'), 'utf8'), JSON.parse(readFileSync(join(FX, 'manifest.json'), 'utf8')),
    JSON.parse(readFileSync(join(FX, 'alt-short.json'), 'utf8')));
  const snap = JSON.parse(readFileSync(join(FX, 'draft-perfect.json'), 'utf8'));
  const figs = snap.blocks.filter((b) => b.type === 'figure');
  Object.assign(figs[0].img, { naturalWidth: 0, naturalHeight: 0, complete: true });  // v01: failed to load
  Object.assign(figs[1].img, { naturalWidth: 0, naturalHeight: 0, complete: false }); // v02: not loaded yet
  const res = verify(E, loadDraft(snap));
  assert.equal(res.issues, 1);
  assert.equal(res.rows.find((r) => r.e?.label === 'v01').state, 'CHANGED');
  assert.match(res.rows.find((r) => r.e?.label === 'v01').notes.join(), /image broken/);
  assert.equal(res.rows.find((r) => r.e?.label === 'v02').state, 'OK');
  assert.deepEqual(res.warnings, ['v02: image not loaded yet (naturalWidth 0)']);
});
test('--issues-only prints only rows that are not OK', () => {
  const r = run(...draft('broken'), ...short, '--issues-only');
  assert.equal(Object.keys(r.rows).length, 10);
});
test('--help prints the header and exits 0; a bad draft exits 2', () => {
  const h = spawnSync(process.execPath, [join(HERE, 'medium-verify.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(h.status, 0); assert.match(h.stdout, /^medium-verify\.mjs: check a Medium draft/);
  const bad = run('--draft', join(FX, 'manifest.json'));
  assert.equal(bad.code, 2); assert.match(bad.err, /no "blocks" array/);
});
test('--expected-summary lists counts, headings and figures', () => {
  const r = run('--expected-summary', ...short);
  assert.equal(r.code, 0);
  assert.match(r.out, /\| figure \| 4 \|/); assert.match(r.out, /1\. \(title\) Sixteen Milliseconds: a fixture/);
  assert.match(r.out, /v02 \(v02-timeline\.png\) \| no \| \d+ \(short alt\)/); assert.match(r.out, /v03 \(v03-pace\.gif\) \| yes/);
});
test('draft-snapshot.js is a read-only expression: no network, no edits', () => {
  const src = readFileSync(join(HERE, 'draft-snapshot.js'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // full-line comments only: the code has regexes with //
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /new Image\b/, /cloneNode/, /\.click\s*\(/, /execCommand/,
    /\.(innerHTML|outerHTML|textContent|nodeValue|value|src)\s*=[^=]/, /\.(remove|append|appendChild|prepend|insertBefore|replaceWith|setAttribute|removeAttribute|focus|dispatchEvent)\s*\(/])
    assert.doesNotMatch(code, bad, `draft-snapshot.js must not use ${bad}`);
  assert.ok(src.split('\n').length <= 95, 'draft-snapshot.js stays under ~95 lines (~70 plus the 20-line SHA-256)');
  assert.doesNotThrow(() => new Function(src)); // parses as a script (it is pasted, not imported)
});

test('the in-page SHA-256 of draft-snapshot.js equals node:crypto', () => {
  const src = readFileSync(join(HERE, 'draft-snapshot.js'), 'utf8');
  const body = src.split('// sha256 begin')[1].split('// sha256 end')[0].replace(/^[^\n]*\n/, '');
  const sha256 = new Function(`${body}; return sha256;`)();
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 70000]) {
    const b = Buffer.alloc(n).map((_, i) => (i * 131 + n) & 255);
    assert.equal(sha256(b), createHash('sha256').update(b).digest('hex'), `length ${n}`);
  }
  const t = 'It wasn’t “smooth” — 165–174 → ✓';
  assert.equal(sha256(new TextEncoder().encode(t)), createHash('sha256').update(t, 'utf8').digest('hex'));
});
test('transfer: OK on a joined file (even pretty-printed), MISMATCH is an issue, absent is not', () => {
  const raw = readFileSync(join(FX, 'draft-perfect.json'), 'utf8');
  assert.equal(checkTransfer(raw).state, 'OK');
  const r = run(...draft('perfect'), ...short);
  assert.match(r.out, /^TRANSFER OK \(length \d+, sha256 [0-9a-f]{12}\)$/m); assert.equal(r.last, 'VERIFY PASS');
  const lost = JSON.parse(raw); lost.blocks[4].text = lost.blocks[4].text.slice(0, -1); // one character lost between parts
  const t = checkTransfer(lost); assert.equal(t.state, 'MISMATCH'); assert.match(t.line, /^TRANSFER MISMATCH/);
  const E = extractExpected(readFileSync(join(FX, 'copy.html'), 'utf8'), JSON.parse(readFileSync(join(FX, 'manifest.json'), 'utf8')),
    JSON.parse(readFileSync(join(FX, 'alt-short.json'), 'utf8')));
  const ok = JSON.parse(raw); ok.transfer.sha256 = '0'.repeat(64); // blocks fine, but the transfer does not prove it
  const res = verify(E, loadDraft(ok), { transfer: checkTransfer(ok) });
  assert.equal(res.issues, 1); assert.match(report(E, loadDraft(ok), res), /TRANSFER MISMATCH[^\n]*\nVERIFY FAIL 1 issues$/);
  assert.equal(checkTransfer(readFileSync(join(FX, 'draft-broken.json'), 'utf8')).state, 'ABSENT');
  assert.match(run(...draft('broken'), ...short).out, /^TRANSFER not checked/m);
});
test('title first: the banner is expected after the title; a wrong banner is still CHANGED', () => {
  const html = '<p><em>Educational study:</em> A personal study.</p><h1>The title</h1><p>Body one.</p><p>Body two.</p>';
  const E = extractExpected(html);
  assert.deepEqual(E.map((e) => e.type + ':' + e.text), ['h1:The title', 'p:Educational study: A personal study.', 'p:Body one.', 'p:Body two.']);
  const blk = (type, text, cls = []) => ({ type, text, cls });
  const good = [blk('h3', 'The title', ['graf--title']), blk('p', 'Educational study: A personal study.'), blk('p', 'Body one.'), blk('p', 'Body two.')];
  assert.equal(verify(E, loadDraft({ blocks: good })).issues, 0);
  const wrong = good.map((b) => ({ ...b })); wrong[1].text = 'Educational study: A private study.';
  const res = verify(E, loadDraft({ blocks: wrong }));
  assert.equal(res.issues, 1); assert.equal(res.rows[1].state, 'CHANGED'); assert.match(res.rows[1].notes[0], /\[-personal-\]\{\+private\+\}/);
  const before = [good[1], good[0], good[2], good[3]]; // banner above the title, as in the copy: Medium can't do that
  const b = verify(E, loadDraft({ blocks: before }));
  assert.equal(b.issues, 1); assert.deepEqual(b.rows.map((r) => r.state).filter((x) => x !== 'OK'), ['OUT-OF-ORDER']);
});
test("Medium's last empty paragraph (graf--trailing) is OK; any other empty p is EXTRA", () => {
  const E = extractExpected('<h1>T</h1><p>One.</p><p>Two.</p>');
  const blk = (type, text, cls = []) => ({ type, text, cls });
  const base = [blk('h3', 'T', ['graf--title']), blk('p', 'One.'), blk('p', 'Two.')];
  const trailing = blk('p', '', ['graf--p', 'graf--empty', 'graf--trailing']);
  assert.equal(verify(E, loadDraft({ blocks: [...base, trailing] })).issues, 0);
  const mid = verify(E, loadDraft({ blocks: [base[0], base[1], trailing, base[2], trailing] }));
  assert.equal(mid.issues, 1); assert.equal(mid.rows.filter((r) => r.state === 'EXTRA').length, 1); // the middle one only
  const plainLast = verify(E, loadDraft({ blocks: [...base, blk('p', '', ['graf--p', 'graf--empty'])] }));
  assert.equal(plainLast.issues, 1); assert.match(plainLast.rows.at(-1).notes[0], /stray empty p/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (e) { failed++; console.log(`not ok - ${name}\n  ${String(e.message).split('\n').slice(0, 6).join('\n  ')}`); }
}
console.log(failed ? `SELFTEST FAIL ${failed}/${tests.length}` : `SELFTEST PASS ${tests.length}/${tests.length}`);
process.exitCode = failed ? 1 : 0;

// I-053 (user, PR-001 decision 2026-10-02 06:31Z): one proposal carries several solutions ("options"), each with its
// own idea, visual difference, gain rows, risk and B shots against the shared original A; the user picks one when
// accepting. Covers the option model (normalize, Markdown form), post/revise/publish with options (add, change, drop;
// media kept per option), decide --option (accept needs one), the decision events and waits carrying `option`, the
// read-mark text, show/line/publicView, and backward compatibility: a stored single-option proposal written by the
// pre-I-053 tool (tests/fixtures/proposal-single-v1.json) loads and renders exactly as before.
// Temp state dir ($FW_STATE_DIR), fake images, fake addresses (192.168.77.x).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';
import { writePng, writeMp4 } from '../fixtures/fake-media.mjs';

const LAN = 'https://192.168.77.12:5612/';
const FIX = new URL('../fixtures/', import.meta.url);
let P, dir;

before(async () => {
  process.env.FW_STATE_DIR = tempDir('fw-proposal-opt-unit-');
  P = await import('../../tools/lib/proposal.mjs');
  dir = tempDir('fw-proposal-opt-src-');
  writePng(join(dir, 'a-0.png'), 8, 6, [200, 60, 60]);
  writePng(join(dir, 'tiles-0.png'), 8, 6, [200, 60, 60], [60, 60, 200]);
  writePng(join(dir, 'video-0.png'), 8, 6, [200, 60, 60], [60, 200, 60]);
  writePng(join(dir, 'copy-0.png'), 8, 6, [200, 60, 60], [200, 200, 60]);
  writeMp4(join(dir, 'a.mp4'));
  writeMp4(join(dir, 'video-b.mp4'));
});

const option = (name, over = {}) => ({
  name, label: `Label ${name}`,
  idea: `Idea ${name}.`, looksSame: `Looks the same ${name}.`,
  visualDiff: [`Diff ${name}: 0.3 % of pixels differ at 3x zoom.`],
  gain: [{ what: 'Elements restyled per frame', before: '120', after: name === 'tiles' ? '0' : '4', tag: 'OBSERVED', how: 'Chrome trace, 3 runs' }],
  risk: `Risk ${name}.`,
  live: { none: `No page for ${name}.` }, // I-109
  compare: { b: { label: `B ${name}`, url: 'http://localhost:5613/' }, shots: [{ caption: 'Top', a: 'a-0.png', b: `${name}-0.png` }] },
  ...over,
});
const sample = (over = {}) => ({
  schema: 'fw-proposal/1', title: 'Word swap without restyles', area: 'hero', topic: 'illusion-style',
  problem: 'The word swap restyles 120 elements per frame.',
  idea: 'Three ways to show the same word swap without a restyle.',
  compare: { a: { label: 'Original (SVG)', url: 'https://localhost:5612/' }, view: 'slider' },
  options: [option('tiles'), option('video', { compare: { b: { label: 'B video' }, shots: [{ a: 'a-0.png', b: 'video-0.png' }], video: { a: 'a.mp4', b: 'video-b.mp4' } } }), option('copy')],
  recommended: { option: 'tiles', why: 'Fewest restyles and 0 px differ.' },
  ...over,
});
const errs = (raw, opts = {}) => P.normalize(raw, { baseDir: dir, ...opts }).errors.join('\n');

test('normalize: options carry their own idea, visual difference, gain, risk and B shots; recommended names one with a reason', () => {
  const n = P.normalize(sample(), { baseDir: dir });
  assert.deepEqual(n.errors, []);
  assert.deepEqual(n.fields.options.map((o) => [o.name, o.label, o.idea, o.gain[0].after, o.compare.b.label]), [
    ['tiles', 'Label tiles', 'Idea tiles.', '0', 'B tiles'], ['video', 'Label video', 'Idea video.', '4', 'B video'], ['copy', 'Label copy', 'Idea copy.', '4', 'B copy'],
  ]);
  assert.deepEqual(n.fields.recommended, { option: 'tiles', why: 'Fewest restyles and 0 px differ.' });
  assert.equal(n.fields.compare.a.label, 'Original (SVG)');
  assert.equal(n.fields.compare.b, undefined, 'B lives in each option');
  assert.equal(n.fields.idea, 'Three ways to show the same word swap without a restyle.', 'a shared idea is allowed');
  assert.equal(n.media.options.length, 3);
  assert.equal(n.media.options[1].shots.length, 1);
  assert.ok(n.media.options[1].video.a && n.media.options[1].video.b);
  // a shared looksSame stands in for the options'
  const shared = sample({ looksSame: 'Same pixels, frozen at 7 times.', options: sample().options.map((o) => ({ ...o, looksSame: undefined })) });
  assert.equal(errs(shared), '');
  assert.match(errs(sample({ options: sample().options.map((o) => ({ ...o, looksSame: undefined })) })), /options\[0\]\.looksSame: required/);
});

test('normalize: option errors name the option path; options and top-level per-solution fields do not mix', () => {
  assert.match(errs(sample({ options: [option('tiles')] })), /options: at least 2 \(one solution: leave out "options"\)/);
  assert.match(errs(sample({ options: 'tiles' })), /options: a list of/);
  assert.match(errs(sample({ options: [option('tiles'), option('tiles')] })), /options\[1\]\.name: "tiles" is used twice/);
  assert.match(errs(sample({ options: [option('Tiles Big'), option('copy')] })), /options\[0\]\.name: a short id/);
  assert.match(errs(sample({ options: [option('tiles', { idea: '' }), option('copy')] })), /options\[0\]\.idea: required/);
  assert.match(errs(sample({ options: [option('tiles', { gain: [] }), option('copy')] })), /options\[0\]\.gain: at least one row/);
  assert.match(errs(sample({ options: [option('tiles', { gain: [{ what: 'x', before: '1', after: '2', tag: 'guess', how: 'h' }] }), option('copy')] })), /options\[0\]\.gain\[0\]\.tag: one of OBSERVED/);
  assert.match(errs(sample({ options: [option('tiles', { visualDiff: [] }), option('copy')] })), /options\[0\]\.visualDiff: at least one item/);
  assert.match(errs(sample({ options: [option('tiles', { compare: { b: { label: 'B' } } }), option('copy')] })), /options\[0\]\.compare: at least one screenshot pair/);
  assert.match(errs(sample({ options: [option('tiles', { compare: { b: { url: LAN }, shots: [{ a: 'a-0.png', b: 'tiles-0.png' }] } }), option('copy')] })), /options\[0\]\.compare\.b\.url: must be a localhost URL/);
  assert.match(errs(sample({ gain: [{ what: 'x', before: '1', after: '2', tag: 'OBSERVED', how: 'h' }] })), /gain: with options, give it in each option \(options\[\]\.gain\)/);
  assert.match(errs(sample({ visualDiff: ['x'] })), /visualDiff: with options, give it in each option/);
  assert.match(errs(sample({ compare: { ...sample().compare, shots: [{ a: 'a-0.png', b: 'tiles-0.png' }] } })), /compare\.shots: with options, B shots and videos go in each option/);
  assert.match(errs(sample({ compare: { ...sample().compare, b: { label: 'PoC' } } })), /compare\.b: with options, B goes in each option/);
  assert.match(errs(sample({ recommended: { option: 'nope', why: 'x' } })), /recommended\.option: one of tiles, video, copy/);
  assert.match(errs(sample({ recommended: { option: 'tiles' } })), /recommended\.why: required/);
  assert.match(errs(sample({ recommended: 'tiles' })), /recommended: \{option, why\}/);
  assert.match(errs(sample({ options: [...sample().options, option('d'), option('e'), option('f'), option('g')] })), /options: at most 6/);
  // a draft with options needs names only
  assert.deepEqual(P.normalize({ title: 'Later', area: 'end', options: [{ name: 'one' }, { name: 'two' }] }, { draft: true }).errors, []);
  // recommended only with options
  assert.match(errs({ ...sample(), options: undefined, recommended: { option: 'tiles', why: 'x' } }), /recommended: only with options/);
});

test('normalize: --shot-a/--shot-b/--video go to the option named by --option; without it they are refused', () => {
  const cli = { shotsA: [join(dir, 'a-0.png')], shotsB: [join(dir, 'copy-0.png')], captions: ['Middle'] };
  assert.match(errs(sample(), cli), /this proposal has options: say which one the --shot-a\/--shot-b\/--video flags are for \(--option <name>: tiles, video, copy\)/);
  assert.match(errs(sample(), { ...cli, option: 'nope' }), /--option: no option "nope" \(options: tiles, video, copy\)/);
  const n = P.normalize(sample(), { baseDir: dir, ...cli, option: 'copy' });
  assert.deepEqual(n.errors, []);
  assert.deepEqual(n.media.options.map((m) => m.shots.length), [1, 1, 2]);
  assert.equal(n.media.options[2].shots[1].caption, 'Middle');
  const single = { ...sample(), options: undefined, recommended: undefined, visualDiff: ['x'], gain: [{ what: 'x', before: '1', after: '2', tag: 'OBSERVED', how: 'h' }], looksSame: 'same', risk: 'low', live: { none: 'One way, no page.' }, compare: { a: { label: 'A' }, shots: [{ a: 'a-0.png', b: 'tiles-0.png' }] } };
  assert.equal(errs(single), '');
  assert.match(errs(single, { ...cli, option: 'copy' }), /--option: this proposal has no options/);
});

test('parseMarkdown: "## Option <name>: <label>" blocks with ### sections, "b:" lines and "recommended: <name> | <why>"', () => {
  const md = `---
title: Word swap without restyles
area: hero
topic: illusion-style
a: Original (SVG) | https://localhost:5612/
view: slider
recommended: tiles | Fewest restyles and 0 px differ.
---
## Problem
The word swap restyles 120 elements per frame.

## Idea
Three ways to show the same word swap without a restyle.

## Option tiles: Label tiles
b: B tiles | http://localhost:5613/
live: none: No page for tiles.
### Idea
Idea tiles.
### Looks the same
Looks the same tiles.
### Visual difference
- Diff tiles: 0.3 % of pixels differ at 3x zoom.
### Gain
| what | before | after | tag | how |
|---|---|---|---|---|
| Elements restyled per frame | 120 | 0 | OBSERVED | Chrome trace, 3 runs |
### Risk
Risk tiles.

## Option copy: Label copy
b: B copy | http://localhost:5613/
live: none: No page for copy.
### Idea
Idea copy.
### Looks the same
Looks the same copy.
### Visual difference
- Diff copy: 0.3 % of pixels differ at 3x zoom.
### Gain
| what | before | after | tag | how |
|---|---|---|---|---|
| Elements restyled per frame | 120 | 4 | OBSERVED | Chrome trace, 3 runs |
### Risk
Risk copy.
`;
  const raw = P.parseMarkdown(md);
  assert.deepEqual(raw.recommended, { option: 'tiles', why: 'Fewest restyles and 0 px differ.' });
  // Markdown options get their shots from the CLI (--option tiles --shot-a … --shot-b …), one option per post/revise
  const tilesShots = { shotsA: [join(dir, 'a-0.png')], shotsB: [join(dir, 'tiles-0.png')], captions: ['Top'], option: 'tiles' };
  const fromMd = P.normalize(raw, { baseDir: dir, ...tilesShots, draft: true });
  assert.deepEqual(fromMd.errors, []);
  const fromJson = P.normalize(sample({ options: [option('tiles'), option('copy')] }), { baseDir: dir });
  assert.deepEqual(fromMd.fields, fromJson.fields);
  assert.match(P.normalize(raw, { baseDir: dir, ...tilesShots }).errors.join(), /options\[1\]\.compare: at least one screenshot pair/, 'copy still needs shots to be proposed');
});

test('post with options: media per option (r1-oN-…), stored options and recommended; publicView, line, showText, pageProposals', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-opt', raw: sample(), baseDir: dir });
  assert.equal(p.state, 'proposed');
  assert.deepEqual(readdirSync(P.mediaDir(p.id)).sort(), ['r1-o1-a-1.png', 'r1-o1-b-1.png', 'r1-o2-a-1.png', 'r1-o2-b-1.png', 'r1-o2-video-a.mp4', 'r1-o2-video-b.mp4', 'r1-o3-a-1.png', 'r1-o3-b-1.png']);
  for (const f of readdirSync(P.mediaDir(p.id))) assert.match(f, P.MEDIA_NAME, f);
  assert.deepEqual(p.compare.shots, [], 'no top-level B shots');
  assert.deepEqual(p.options.map((o) => [o.name, o.compare.shots.map((s) => s.b), o.compare.video || null]), [
    ['tiles', ['r1-o1-b-1.png'], null], ['video', ['r1-o2-b-1.png'], { a: 'r1-o2-video-a.mp4', b: 'r1-o2-video-b.mp4' }], ['copy', ['r1-o3-b-1.png'], null],
  ]);
  assert.deepEqual(p.recommended, { option: 'tiles', why: 'Fewest restyles and 0 px differ.' });
  const v = P.publicView(P.get(p.id));
  assert.deepEqual(v.recommended, p.recommended);
  assert.deepEqual(v.options[1].compare, { b: { label: 'B video' }, shots: [{ caption: undefined, a: `/media/${p.id}/r1-o2-a-1.png`, b: `/media/${p.id}/r1-o2-b-1.png`, aSize: [8, 6], bSize: [8, 6] }], video: { a: `/media/${p.id}/r1-o2-video-a.mp4`, b: `/media/${p.id}/r1-o2-video-b.mp4`, both: undefined } });
  assert.deepEqual(v.options.map((o) => [o.name, o.label, o.idea, o.risk, o.visualDiff.length, o.gain.length]), [['tiles', 'Label tiles', 'Idea tiles.', 'Risk tiles.', 1, 1], ['video', 'Label video', 'Idea video.', 'Risk video.', 1, 1], ['copy', 'Label copy', 'Idea copy.', 'Risk copy.', 1, 1]]);
  assert.equal(P.mediaFile(p.id, 'r1-o2-video-b.mp4').type, 'video/mp4');
  for (const bad of ['r1-o-a-1.png', 'r1-o123-a-1.png', 'r1-ox-a-1.png', 'r1-o1-c-1.png']) assert.equal(P.mediaFile(p.id, bad), null, bad);
  assert.match(P.line(p), /^PR-\d{3} {2}\[proposed rev 1\] {2}hero {2}by de-opt: Word swap without restyles \(3 options\)$/);
  const s = P.showText(p);
  assert.match(s, /^ {2}options: tiles, video, copy; recommended: tiles \(Fewest restyles and 0 px differ\.\)$/m);
  assert.match(s, /^ {2}option tiles "Label tiles" \(recommended\):$/m);
  assert.match(s, /^ {4}idea: Idea video\.$/m);
  assert.match(s, /^ {4}gain:\n {6}Elements restyled per frame: 120 -> 0 \[OBSERVED\] \(Chrome trace, 3 runs\)$/m);
  assert.match(s, /^ {4}B: B video {3}shot 1: r1-o2-a-1\.png \| r1-o2-b-1\.png$/m);
  assert.match(s, /^ {4}video: a=r1-o2-video-a\.mp4 b=r1-o2-video-b\.mp4$/m);
  const row = P.pageProposals().find((x) => x.id === p.id);
  assert.equal(row.options, 3);
});

test('decide --option: accept needs one (by name or label); change may name one; reject and single proposals refuse it', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-opt-d', raw: sample(), baseDir: dir });
  await assert.rejects(P.decide(p.id, { value: 'accept' }), /has 3 options: say which one you accept \(--option <name>: tiles, video, copy\)/);
  await assert.rejects(P.decide(p.id, { value: 'accept', option: 'nope' }), /no option "nope" in PR-\d+ \(options: tiles, video, copy\)/);
  await assert.rejects(P.decide(p.id, { value: 'reject', option: 'tiles' }), /reject is for the whole proposal/);
  const c = await P.decide(p.id, { value: 'change', notes: 'tiles, but brighter', option: 'tiles' });
  assert.deepEqual([c.state, c.decision.option], ['changes-requested', 'tiles']);
  await P.undoDecision(p.id, { rev: 1 });
  const a = await P.decide(p.id, { value: 'accept', option: 'label VIDEO', notes: 'smallest file' });
  assert.deepEqual([a.state, a.decision.value, a.decision.option], ['accepted', 'accepted', 'video'], 'a label (any case) resolves to the name');
  assert.equal(a.decisions.at(-1).option, 'video');
  assert.match(P.line(a), / -> accepted, option: video \(notes: smallest file\)$/);
  assert.match(P.showText(a), /^ {2}decision: accepted, option: video \(rev 1, \S+, user\): smallest file$/m);
  assert.match(P.showText(a), / user decided rev 1 accepted, option: video: smallest file$/m);
  const r = await P.postProposal({ by: 'de-opt-d', raw: sample(), baseDir: dir });
  assert.equal((await P.decide(r.proposal.id, { value: 'reject', notes: 'none of them' })).decision.option, undefined, 'reject without an option');
  const single = await P.postProposal({ by: 'de-opt-d', raw: { ...sample(), options: undefined, recommended: undefined, visualDiff: ['x'], gain: [{ what: 'x', before: '1', after: '2', tag: 'OBSERVED', how: 'h' }], looksSame: 'same', risk: 'low', live: { none: 'One way, no page.' }, compare: { a: { label: 'A' }, shots: [{ a: 'a-0.png', b: 'tiles-0.png' }] } }, baseDir: dir });
  await assert.rejects(P.decide(single.proposal.id, { value: 'accept', option: 'tiles' }), /has no options/);
  assert.equal((await P.decide(single.proposal.id, { value: 'accept' })).decision.option, undefined);
});

test('decision events, waits and the read-mark text carry the option (and the undone one as wasOption)', async () => {
  const t0 = new Date(Date.now() - 1).toISOString();
  await P.initProposalMark('lead');
  const { proposal: p } = await P.postProposal({ by: 'de-opt-w', raw: sample(), baseDir: dir });
  const waitDecided = P.waitCondition(p.id);
  const any = P.waitAnyCondition({ by: 'de-opt-w', since: t0 });
  await P.decide(p.id, { value: 'accept', option: 'tiles', notes: 'go' });
  const d = JSON.parse(waitDecided.check().detail);
  assert.deepEqual([d.value, d.option], ['accepted', 'tiles']);
  const a = JSON.parse(any.check().detail);
  assert.deepEqual(a.decisions.map((x) => [x.id, x.value, x.option]), [[p.id, 'accepted', 'tiles']]);
  assert.deepEqual(a.events.map((e) => [e.event, e.value, e.option, e.wasOption]), [['decided', 'accepted', 'tiles', null]]);
  await new Promise((r) => setTimeout(r, 3));
  await P.undoDecision(p.id, { rev: 1 });
  await P.decide(p.id, { value: 'accept', option: 'copy' });
  const ev = P.decisionEvents(P.get(p.id));
  assert.deepEqual(ev.map((e) => [e.event, e.value, e.was, e.option, e.wasOption]), [
    ['decided', 'accepted', null, 'tiles', null], ['undecided', 'proposed', 'accepted', null, 'tiles'], ['decided', 'accepted', 'accepted', 'copy', 'tiles'],
  ]);
  const ch = JSON.parse(P.waitCondition(p.id, { until: 'changed', since: t0 }).check().detail);
  assert.equal(ch.decision.option, 'copy');
  assert.equal(P.proposalNewsText(ev[0]).split('\n')[0], `PROPOSAL ${p.id} decided accepted, option: tiles by user at ${ev[0].at}: go`);
  assert.equal(P.proposalNewsText(ev[1]).split('\n')[0], `PROPOSAL ${p.id} undecided (was accepted, option: tiles) by user at ${ev[1].at}: back to proposed, waiting for the user`);
  assert.equal(P.proposalNewsText(ev[2]).split('\n')[0], `PROPOSAL ${p.id} decided accepted, option: copy (was accepted, option: tiles) by user at ${ev[2].at}`);
  const news = P.proposalNews('lead', { all: true }).filter((e) => e.id === p.id);
  assert.deepEqual(news.map((e) => e.option), ['tiles', null, 'copy']);
});

test('revise with options: add, change and drop options; media kept for a same-name option without new shots; to and from one solution', async () => {
  const { proposal: p } = await P.postProposal({ by: 'de-opt-r', raw: sample(), baseDir: dir });
  await P.decide(p.id, { value: 'change', notes: 'drop copy, add a lighter tiles variant', option: 'tiles' });
  // drop "copy", change "tiles" (text only: its shots are kept), keep "video", add "tiles-lite" (needs its own shots)
  const next = sample({
    options: [
      { ...option('tiles', { idea: 'Idea tiles v2.' }), compare: { b: { label: 'B tiles' } } },
      { ...sample().options[1], compare: { b: { label: 'B video' } } },
      { ...option('tiles-lite'), compare: { b: { label: 'B lite' }, shots: [{ caption: 'Top', a: 'a-0.png', b: 'copy-0.png' }] } },
    ],
    recommended: { option: 'tiles-lite', why: 'Half the tiles.' },
  });
  const r = await P.reviseProposal(p.id, { by: 'de-opt-r', note: 'dropped copy; added tiles-lite', raw: next, baseDir: dir });
  const q = r.proposal;
  assert.deepEqual([q.state, q.rev, q.decision], ['proposed', 2, null]);
  assert.deepEqual(q.options.map((o) => [o.name, o.idea, o.compare.shots.map((s) => s.b)]), [
    ['tiles', 'Idea tiles v2.', ['r1-o1-b-1.png']], ['video', 'Idea video.', ['r1-o2-b-1.png']], ['tiles-lite', 'Idea tiles-lite.', ['r2-o3-b-1.png']],
  ]);
  assert.deepEqual(q.options[1].compare.video, { a: 'r1-o2-video-a.mp4', b: 'r1-o2-video-b.mp4' }, 'the video is kept too');
  assert.deepEqual(q.recommended, { option: 'tiles-lite', why: 'Half the tiles.' });
  // a new option without shots is refused
  const noShots = sample({ options: [...next.options.slice(0, 2), { ...option('fresh'), compare: { b: { label: 'B' } } }] });
  await assert.rejects(P.reviseProposal(p.id, { by: 'de-opt-r', note: 'x', raw: noShots, baseDir: dir }), /options\[2\] \(fresh\): at least one screenshot pair or a video/);
  // text-only revise (no --file): options and their media stay; --option with new CLI shots replaces only that option's
  const t = (await P.reviseProposal(p.id, { by: 'de-opt-r', note: 'new tiles shot', option: 'tiles', shotsA: [join(dir, 'a-0.png')], shotsB: [join(dir, 'tiles-0.png')], captions: ['Again'] })).proposal;
  assert.equal(t.rev, 3);
  assert.deepEqual(t.options.map((o) => [o.name, o.compare.shots.map((s) => s.b)]), [['tiles', ['r3-o1-b-1.png']], ['video', ['r1-o2-b-1.png']], ['tiles-lite', ['r2-o3-b-1.png']]]);
  assert.equal(t.options[0].idea, 'Idea tiles v2.');
  assert.deepEqual(t.recommended, { option: 'tiles-lite', why: 'Half the tiles.' });
  await assert.rejects(P.reviseProposal(p.id, { by: 'de-opt-r', note: 'x', shotsA: [join(dir, 'a-0.png')], shotsB: [join(dir, 'tiles-0.png')] }), /say which one/);
  // back to one solution: options and recommended go
  const one = { ...sample(), options: undefined, recommended: undefined, idea: 'Tiles only.', looksSame: 'same', risk: 'low', live: { none: 'One way, no page.' }, visualDiff: ['x'], gain: [{ what: 'x', before: '1', after: '2', tag: 'OBSERVED', how: 'h' }], compare: { a: { label: 'A' }, shots: [{ a: 'a-0.png', b: 'tiles-0.png' }] } };
  const s = (await P.reviseProposal(p.id, { by: 'de-opt-r', note: 'tiles only', raw: one, baseDir: dir })).proposal;
  assert.equal(s.options, undefined);
  assert.equal(s.recommended, undefined);
  assert.deepEqual(s.compare.shots.map((x) => x.b), ['r4-b-1.png']);
  assert.equal(P.publicView(s).options, undefined);
  // and to options again from one solution
  const o = (await P.reviseProposal(p.id, { by: 'de-opt-r', note: 'two ways again', raw: sample({ options: [option('tiles'), option('copy')], recommended: undefined }), baseDir: dir })).proposal;
  assert.deepEqual(o.options.map((x) => x.name), ['tiles', 'copy']);
  assert.deepEqual(o.compare.shots, []);
  assert.equal(o.recommended, undefined);
});

test('draft with options: publish checks every option, and media kept per option count', async () => {
  const { proposal: d } = await P.postProposal({ by: 'de-opt-p', raw: { title: 'Later', area: 'end', options: [{ name: 'one' }, { name: 'two' }] }, draft: true });
  assert.deepEqual(d.options.map((o) => [o.name, o.label]), [['one', 'one'], ['two', 'two']], 'the label defaults to the name');
  await assert.rejects(P.publishProposal(d.id, { by: 'de-opt-p' }), /options\[0\]\.idea: required[\s\S]*options\[0\] \(one\): at least one screenshot pair/);
  const filled = sample({ options: [option('tiles'), option('copy')] });
  await P.reviseProposal(d.id, { by: 'de-opt-p', note: 'filled in', raw: filled, baseDir: dir });
  assert.equal(P.get(d.id).state, 'draft');
  assert.equal((await P.publishProposal(d.id, { by: 'de-opt-p' })).state, 'proposed');
});

test('proposals-page.html: option cards as tabs, the recommendation, Accept asks which option and sends it; text only', () => {
  const html = readFileSync(new URL('../../tools/lib/proposals-page.html', import.meta.url), 'utf8');
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc']) assert.ok(!html.includes(sink), sink);
  for (const s of ["role: 'tablist'", "role: 'tab'", "role: 'tabpanel'", "'aria-selected'", "'Recommended'", "'Which option do you accept?'", "'About which option? (optional)'", "'The proposal as a whole'", 'ways to do it']) assert.ok(html.includes(s), s);
  assert.match(html, /if \(chosen\) body\.option = chosen;/, 'the picked option is sent with the decision');
  assert.match(html, /if \(p\.options && p\.options\.length\) \{[\s\S]*\} else \{\n {4}card\.appendChild\(section\('The idea', para\(p\.idea\)(?:, p\.id)?\)\);/, 'a proposal without options keeps the old layout'); // T-048: + the section's anchor
  assert.match(html, /: VERB\[choice\] \+ ' revision ' \+ p\.rev; \}/, 'the single-solution send button text is unchanged');
});

test('backward compatible: a stored single-option proposal from the pre-I-053 tool loads and renders exactly as before', async () => {
  mkdirSync(P.proposalsDir(), { recursive: true });
  const id = 'PR-900';
  const stored = JSON.parse(readFileSync(new URL('proposal-single-v1.json', FIX), 'utf8'));
  writeFileSync(join(P.proposalsDir(), `${id}.json`), JSON.stringify({ ...stored, id }));
  const want = JSON.parse(readFileSync(new URL('proposal-single-v1.expected.json', FIX), 'utf8'));
  const re = (x) => JSON.parse(JSON.stringify(x).replaceAll('PR-001', id));
  const p = P.get(id);
  assert.equal(P.line(p), re(want.line));
  assert.equal(P.showText(p).replace(P.mediaDir(id), '<MEDIA>'), re(want.show));
  // I-084 (intended): the views gain `to` (who receives the decision: the author and the lead), derived, never stored
  const to = ['de-fixture', 'lead'];
  assert.deepEqual(JSON.parse(JSON.stringify(P.publicView(p))), { ...re(want.view), to }, 'what the page gets, byte for byte');
  assert.deepEqual(JSON.parse(JSON.stringify(P.pageProposals().filter((x) => x.id === id))), re(want.page).map((x) => ({ ...x, to })));
  assert.deepEqual(P.decisionEvents(p).map(P.proposalNewsText), re(want.news), 'the PROPOSAL lines');
  // events and wait details only gain option: null (and wasOption: null), nothing else changes
  assert.deepEqual(P.decisionEvents(p), re(want.events).map((e) => ({ ...e, option: null, wasOption: null })));
  assert.deepEqual(JSON.parse(P.waitCondition(id).check().detail), { ...re(want.detail), option: null });
  // a copy waiting for the user takes a decision as before (no option)
  writeFileSync(join(P.proposalsDir(), 'PR-901.json'), JSON.stringify({ ...stored, id: 'PR-901', state: 'proposed', decision: null }));
  const a = await P.decide('PR-901', { value: 'accept', notes: 'fine', rev: 2 });
  assert.deepEqual([a.state, a.decision.option], ['accepted', undefined]);
  assert.ok(!('option' in a.decision), 'no option key on a single-option decision');
  assert.ok(!('option' in a.history.at(-1)), 'nor in its history entry');
  // the copy keeps its media names valid
  for (const s of stored.compare.shots) for (const f of [s.a, s.b]) assert.match(f, P.MEDIA_NAME);
});

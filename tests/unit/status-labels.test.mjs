// tools/lib/status.mjs, T-124/T-125 (user, via the lead; PR-020 "tools-and-check"): one label per row derived from
// fixes/PROGRESS.json (stage, best build) and the row's live state; a mismatch check (`status.mjs check`, red on
// /status); parked rows say what they are ("done, waits for build", "unfinished, paused until …", "standing by") and
// need --resume-on; "ready to resume" and "needs review" by themselves; `status.mjs sync` ties rows to landings on main.
// T-130: every label is plain words (never "landed" alone), one line per Progress item, one legend for both pages;
// T-133: the next build's parts grouped; T-135: a parked row shows its label plus its own reason.
// Every test uses its own $FW_STATE_DIR and a temp PROGRESS file (never the repo's, never the live store).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, git as g } from '../helpers.mjs';

const S = await import('../../tools/lib/status.mjs');
const P = await import('../../tools/lib/progress.mjs');

let state;
beforeEach(() => {
  state = tempDir('fw-status-lab-');
  process.env.FW_STATE_DIR = state;
  process.env.FW_PROGRESS_FILE = join(state, 'no-progress.json');
  delete process.env.FW_STATUS_STALE_MIN;
});

// A PROGRESS shaped like the real one: v7 is the best build (build.fixes), v5 never landed (to try), v6 landed
const DATA = {
  build: { fixes: ['cd-strip', 'rest-script'] },
  versions: [
    { id: 'v0-baseline', fixes: [] },
    { id: 'v5-gpu-preview', landed: false, fixes: ['gpu-only'] },
    { id: 'v6-best', fixes: ['wave1', 'r4-v3'] },
    { id: 'v7-best', best: true, fixes: ['cd-strip', 'rest-script'] },
  ],
  items: [
    { id: 'cd-strip', title: 'Strip', state: 'testing', stage: 'F' },
    { id: 'rest-script', title: 'Rest', state: 'landed', stage: 'L' },
    { id: 'r4-v3', title: 'Rotator', state: 'diagnosing', stage: 'D' },
    { id: 'illusion', title: 'Illusions', state: 'diagnosing', stage: 'R' },
    { id: 'anim', title: 'Anim', state: 'dropped', stage: 'F' },
    { id: 'gpu-only', title: 'GPU', state: 'testing', stage: 'F' },
    { id: 'morph', title: 'Morph', state: 'landed', stage: 'L' },
    { id: 'fresh', title: 'Fresh', state: 'testing', stage: 'I' },
  ],
};

test('T-125 #14: parseResumeOn accepts the six forms and refuses the rest with the list', () => {
  assert.deepEqual(S.parseResumeOn('never'), { kind: 'never' });
  assert.deepEqual(S.parseResumeOn('incident:136'), { kind: 'incident', target: 'I-136' });
  assert.deepEqual(S.parseResumeOn('incident:I-7'), { kind: 'incident', target: 'I-007' });
  assert.deepEqual(S.parseResumeOn('land:morph-gpu'), { kind: 'land', target: 'morph-gpu' });
  assert.deepEqual(S.parseResumeOn('land:852cefbe'), { kind: 'land', target: '852cefbe' });
  assert.deepEqual(S.parseResumeOn('after:2026-10-04T16:00Z'), { kind: 'after', target: '2026-10-04T16:00:00.000Z' });
  assert.deepEqual(S.parseResumeOn('decision:Lead'), { kind: 'decision', target: 'lead' });
  assert.deepEqual(S.parseResumeOn('build:v8'), { kind: 'build', target: 'v8' });
  for (const bad of ['', 'soon', 'incident:soon', 'after:tomorrow', 'decision:ops', 'build:eight', 'never:x', 'land:Bad Topic']) {
    assert.throws(() => S.parseResumeOn(bad), /bad --resume-on.*incident:I-NNN \| land:<topic\|sha> \| after:<ISO time> \| decision:lead\|user \| build:v8 \| never/, bad);
  }
});

test('T-125 #14 (a) + #10 (c): set --state parked needs --resume-on; kept while parked, dropped on leaving; parked/researching refused on a landed item', async () => {
  const base = { by: 'fix-a', kind: 'fix', title: 'Row', progressData: null };
  await S.set('a', { ...base, state: 'testing' });
  await assert.rejects(S.set('a', { ...base, state: 'parked' }), /--state parked needs --resume-on <when>: incident:I-NNN .* never/);
  await assert.rejects(S.set('a', { ...base, state: 'testing', resumeOn: 'never' }), /--resume-on goes with --state parked/);
  await assert.rejects(S.set('a', { ...base, note: 'x', resumeOn: 'never' }), /--resume-on goes with --state parked/, 'the row is not parked');
  await S.set('a', { ...base, state: 'parked', resumeOn: 'incident:I-136' });
  assert.deepEqual(S.get('a').resumeOn, { kind: 'incident', target: 'I-136' });
  await S.set('a', { ...base, note: 'still waiting' });
  await S.set('a', { ...base, state: 'parked', note: 'again' });
  assert.deepEqual(S.get('a').resumeOn, { kind: 'incident', target: 'I-136' }, 'kept: re-parking needs no new --resume-on');
  await S.set('a', { ...base, state: 'parked', resumeOn: 'decision:user' });
  assert.deepEqual(S.get('a').resumeOn, { kind: 'decision', target: 'user' });
  assert.deepEqual(S.get('a').history.at(-1).changes, { resumeOn: { kind: 'decision', target: 'user' } });
  await S.set('a', { ...base, state: 'implementing' });
  assert.equal('resumeOn' in S.get('a'), false, 'dropped when the row leaves parked');

  // the row's Progress item landed: parked and researching are refused with the way out; done and follow-up work are fine
  for (const st of ['parked', 'researching']) {
    await assert.rejects(S.set('morph', { by: 'fix-m', kind: 'fix', title: 'Morph', state: st, resumeOn: st === 'parked' ? 'never' : undefined, progressData: DATA }),
      /morph belongs to PROGRESS item morph, whose work is done \(done, not in a build\): when your part is over use --state done \(the board then shows "done, not in a build"\).*designing, implementing, testing or measuring/);
  }
  await assert.rejects(S.set('row-x', { by: 'fix-m', kind: 'fix', title: 'X', state: 'parked', resumeOn: 'never', progress: 'rest-script', progressData: DATA }), /PROGRESS item rest-script, whose work is done \(in best build \(v7\)\)/);
  // T-135: a part parked until its build comes out is fine (morph-gpu: done, waits for build v8)
  await S.set('row-y', { by: 'fix-m', kind: 'fix', title: 'Y', state: 'parked', resumeOn: 'build:v8', progress: 'morph', progressData: DATA });
  await S.set('morph', { by: 'fix-m', kind: 'fix', title: 'Morph', state: 'testing', progressData: DATA });
  await S.set('morph', { by: 'fix-m', state: 'done', progressData: DATA });
  await S.set('illusion', { by: 'fix-i', kind: 'fix', title: 'Ill', state: 'parked', resumeOn: 'never', progressData: DATA });
  // the default reads $FW_PROGRESS_FILE
  writeFileSync(process.env.FW_PROGRESS_FILE, JSON.stringify(DATA));
  await assert.rejects(S.set('r4-v3', { by: 'fix-r', kind: 'fix', title: 'R4', state: 'researching' }), /PROGRESS item r4-v3, whose work is done \(in best build \(v7\)\)/, 'in a landed build (v6): builds stack, so in the best one');
  await S.set('gpu-only', { by: 'fix-g', kind: 'fix', title: 'GPU', state: 'researching' }); // only in a to-try build
});

const NOW = Date.parse('2026-10-04T16:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const row = (id, state, extra = {}) => ({ id, title: `Row ${id}`, kind: 'fix', owner: `fix-${id}`, state, stateSince: ago(30), updatedAt: ago(30), priority: null, waitingOn: null, ...extra });

test('T-124 + T-130: one plain label per row from Progress (best build, done) and the row; never "landed" alone', () => {
  const items = [
    row('cd-strip', 'testing'),
    row('rest-script', 'landed'),
    row('illusion', 'done'),
    row('anim', 'dropped'),
    row('morph', 'testing', { note: 'rev 3 on the phone' }),
    row('fresh', 'implementing'),
    row('nolink', 'done'),
  ];
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: DATA });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by['cd-strip'].label, 'in best build (v7); being tested');
  assert.equal(by['rest-script'].label, 'in best build (v7)', 'the row says landed: the page says where it is');
  assert.equal(by['rest-script'].stateText, 'in best build (v7)');
  assert.equal(by.illusion.label, 'closed, no fix');
  assert.equal(by.illusion.statePlain, 'closed, no fix', 'T-124 (a): not "finished (nothing to land)"');
  assert.deepEqual(by.illusion.mismatch, ['Progress illusion: being diagnosed; status row: done'], 'illusion-proposals: Progress still at R');
  assert.equal(by.anim.label, 'dropped');
  assert.equal(by.morph.label, 'done, not in a build; being tested (rev 3)', 'its work is done, not in a build yet; follow-up testing, rev from the note');
  assert.equal(by.fresh.label, 'being built');
  assert.equal(by.nolink.label, null, 'no Progress item: no label');
  assert.equal(by.nolink.stateText, null);
  assert.equal(by.nolink.statePlain, 'finished, no build to land');
  assert.equal(by.nolink.group, 'finished');
  assert.equal(S.isFinished('closed-no-fix'), true);
  for (const x of v.items) if (x.label) assert.doesNotMatch(x.label, /\blanded\b/, `${x.id}: never "landed"`);
  // closed-no-fix and a done row on a done item
  const v2 = S.buildStatusView({ items: [row('ill-2', 'closed-no-fix', { progress: 'illusion' }), row('m2', 'done', { progress: 'morph' })], live: {}, now: NOW, progress: DATA });
  const b2 = Object.fromEntries(v2.items.map((x) => [x.id, x]));
  assert.equal(b2['ill-2'].label, 'closed, no fix');
  assert.equal(b2['ill-2'].statePlain, 'closed without a fix (nothing landed)');
  assert.equal(b2['ill-2'].group, 'finished');
  assert.equal(b2.m2.label, 'done, not in a build');
  assert.equal(b2.m2.statePlain, 'done, not in a build');
  // a bare items array (older callers) still labels, without build facts
  const bare = S.buildStatusView({ items: [row('morph', 'testing')], live: {}, now: NOW, progress: DATA.items });
  assert.equal(bare.items[0].label, 'done, not in a build; being tested');
  // /progress gets the label and the alerts for the item the row belongs to
  const links = S.progressLinks(v);
  assert.equal(links.get('cd-strip').label, 'in best build (v7); being tested');
  assert.equal(links.get('illusion').label, 'closed, no fix');
  assert.deepEqual(links.get('illusion').alerts, ['does not match: Progress illusion: being diagnosed; status row: done']);
  // T-130: one legend, shared by both pages, one line per label, "landed" nowhere
  assert.deepEqual(v.labelLegend.map((x) => x.label).slice(0, 8), ['in best build (v7)', 'done, waits for build (v8)', 'done, not in a build', 'being tested (rev 2)', 'being built', 'being diagnosed', 'unfinished, paused until …', 'standing by']);
  assert.ok(v.labelLegend.some((x) => x.label === 'dropped'));
  for (const x of v.labelLegend) { assert.ok(x.plain.length > 10, x.label); assert.doesNotMatch(`${x.label} ${x.plain}`, /\blanded\b/); }
});

test('T-124 (2): the mismatch check: Progress and the row contradict -> MISMATCH lines, red alerts, counts', () => {
  const items = [
    row('r4-v3', 'landed'), // Progress diagnosing, though in v6: its Progress state is stale (a real case)
    row('illusion', 'landed'), // Progress diagnosing, not built
    row('fresh', 'dropped'), // Progress testing
    row('rest-script', 'dropped'), // Progress landed (in v7)
    row('anim', 'landed'), // Progress dropped
    row('morph', 'parked', { note: 'x', resumeOn: { kind: 'never' } }), // Progress landed, row parked
    row('cd-strip', 'researching'), // in the best build, row researching
    row('gpu-only', 'testing'), // fine
  ];
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: DATA });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.deepEqual(by['r4-v3'].mismatch, ['Progress r4-v3: being diagnosed; status row: done (on main)']);
  assert.equal(by['r4-v3'].label, 'in best build (v7)', 'in v6, which landed: builds stack');
  assert.deepEqual(by.illusion.mismatch, ['Progress illusion: being diagnosed; status row: done (on main)']);
  assert.equal(by.illusion.label, 'being diagnosed', 'Progress words, not the stale row');
  assert.deepEqual(by.fresh.mismatch, ['Progress fresh: being tested; status row: dropped']);
  assert.deepEqual(by['rest-script'].mismatch, ['Progress rest-script: in best build (v7); status row: dropped']);
  assert.deepEqual(by.anim.mismatch, ['Progress anim: dropped; status row: done (on main)']);
  assert.deepEqual(by.morph.mismatch, ['Progress morph: done, not in a build; status row: paused (status.mjs sync sets it done)']);
  assert.deepEqual(by['cd-strip'].mismatch, ['Progress cd-strip: in best build (v7); status row: being diagnosed (status.mjs sync sets it done)']);
  assert.deepEqual(by['gpu-only'].mismatch, []);
  assert.deepEqual(by.anim.alerts, ['does not match: Progress anim: dropped; status row: done (on main)']);
  assert.equal(v.counts.alerts, 7);
  const c = S.checkLines(v);
  assert.equal(c.count, 7);
  assert.ok(c.lines.includes('MISMATCH anim (owner fix-anim): Progress anim: dropped; status row: done (on main)'));
  assert.ok(c.lines.every((l) => /^MISMATCH /.test(l)));
  const t = S.renderText(v, { all: true });
  assert.match(t, /7 to fix \(status\.mjs check\)/);
  assert.match(t, /\n {6}!! does not match: Progress anim: dropped; status row: done \(on main\)\n/);
  assert.match(t, /\n {6}in best build \(v7\); being diagnosed \[progress cd-strip\]; owner fix-cd-strip;/);
  // T-135: a part parked until its build comes out does not contradict a done item
  const wb = S.buildStatusView({ items: [row('morph', 'parked', { resumeOn: { kind: 'build', target: 'v8' }, note: 'phone check in v8' })], live: {}, now: NOW, progress: DATA });
  assert.deepEqual(wb.items[0].mismatch, []);
  assert.deepEqual(S.checkLines(S.buildStatusView({ items: [row('gpu-only', 'testing')], live: {}, now: NOW, progress: DATA })), { lines: [], count: 0 });
});

test('T-125 + T-135: parked reads "done, waits for build", "unfinished, paused until …", "standing by" plus its own reason; ready to resume; needs review without a reason', () => {
  const items = [
    row('morph', 'parked', { note: 'phone check done', resumeOn: { kind: 'decision', target: 'lead' } }), // its Progress item is done
    row('v8-part', 'parked', { note: 'waits for v8', resumeOn: { kind: 'build', target: 'v8' } }),
    row('fresh', 'parked', { note: 'waits for the lock fix', resumeOn: { kind: 'incident', target: 'I-136' } }),
    row('fresh-2', 'parked', { note: 'x', progress: 'fresh', updatedAt: ago(40), resumeOn: { kind: 'incident', target: 'I-140' } }),
    row('inc-parked', 'parked', { note: 'x', resumeOn: { kind: 'incident', target: 'I-141' } }),
    row('inc-unknown', 'parked', { note: 'x', resumeOn: { kind: 'incident', target: 'I-999' } }),
    row('ops-x', 'parked', { kind: 'ops', next: 'the 16:00 check-in', resumeOn: { kind: 'after', target: '2026-10-04T15:00:00.000Z' } }),
    row('runner', 'parked', { kind: 'phone', note: 'no phone work', resumeOn: { kind: 'decision', target: 'user' } }),
    row('gone', 'parked', { note: 'x', resumeOn: { kind: 'never' } }),
    row('old', 'parked', { stateSince: ago(5 * 60) }), // a legacy row: no reason, no --resume-on
    row('noted', 'parked', { note: 'paused for the usage cap' }), // a reason, nothing that brings it back
    row('reasonless', 'parked', { resumeOn: { kind: 'decision', target: 'lead' } }), // a way back, no reason
    row('t-land', 'parked', { note: 'x', stateSince: ago(120), resumeOn: { kind: 'land', target: 'other-topic' } }),
    row('t-old-land', 'parked', { note: 'x', stateSince: ago(30), resumeOn: { kind: 'land', target: 'stale-topic' } }),
    row('t-sha', 'parked', { note: 'x', resumeOn: { kind: 'land', target: 'abc1234' } }),
    row('t-prog', 'parked', { note: 'x', resumeOn: { kind: 'land', target: 'rest-script' } }),
    row('t-build', 'parked', { note: 'x', resumeOn: { kind: 'build', target: 'v7' } }),
    row('t-try', 'parked', { note: 'x', resumeOn: { kind: 'build', target: 'v5' } }),
    row('branch', 'parked', { note: 'x', resumeOn: { kind: 'decision', target: 'lead' }, branch: { name: 'wt-b', landHead: 'f'.repeat(40) } }),
  ];
  const live = {
    incidents: [{ id: 'I-140', title: 'open one', blocking: false }],
    incidentStatus: { 'I-136': 'resolved', 'I-140': 'open', 'I-141': 'parked' },
    git: { mainShas: ['abc1234' + '0'.repeat(33), 'f'.repeat(40)], merged: [], topics: { 'other-topic': { sha: 'd'.repeat(40), at: ago(60) }, 'stale-topic': { sha: 'e'.repeat(40), at: ago(90) } } },
  };
  const v = S.buildStatusView({ items, live, now: NOW, progress: DATA });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by.morph.statePlain, 'done, not in a build · phone check done');
  assert.equal(by.morph.stateText, 'done, not in a build · phone check done');
  assert.equal(by.morph.label, 'done, not in a build');
  assert.equal(by['v8-part'].statePlain, 'done, waits for build v8 · waits for v8');
  assert.equal(by.fresh.statePlain, 'unfinished, paused until I-136 is resolved · waits for the lock fix');
  assert.equal(by.fresh.label, 'unfinished, paused until I-136 is resolved');
  assert.equal(by.fresh.resume.ready, 'I-136 is resolved');
  assert.deepEqual(by.fresh.alerts, ['ready to resume: I-136 is resolved']);
  assert.equal(by['fresh-2'].foldedInto, 'fresh', 'T-130: two rows of one Progress item fold under the newest');
  assert.deepEqual(by.fresh.also.map((a) => a.id), ['fresh-2']);
  assert.equal(by['inc-parked'].resume.ready, 'I-141 was parked (no fix coming now)');
  assert.equal(by['inc-unknown'].resume.ready, null, 'an id the store does not know is never ready');
  assert.equal(by['fresh-2'].resume.ready, null, 'I-140 is still open');
  assert.deepEqual(by['fresh-2'].alerts, []);
  assert.equal(by['ops-x'].statePlain, 'standing by until 2026-10-04 15:00Z · next: the 16:00 check-in');
  assert.equal(by['ops-x'].resume.ready, 'it is past 15:00Z');
  assert.equal(by.runner.statePlain, 'standing by until the user decides · no phone work');
  assert.equal(by.runner.resume.ready, null, 'a decision is never guessed');
  assert.equal(by.gone.statePlain, 'done, nothing more to do · x');
  assert.equal(by.gone.resume.ready, null);
  // T-135: never the generic "paused on purpose; may resume"; red "needs review" when the reason or the way back is missing
  assert.equal(by.old.statePlain, 'unfinished, paused');
  assert.equal(by.old.needsReview, 'needs review: no reason given and nothing set to bring it back (--resume-on); paused 5 h 0 min');
  assert.equal(by.noted.needsReview, 'needs review: nothing set to bring it back (--resume-on); paused 30 min');
  assert.equal(by.reasonless.needsReview, 'needs review: no reason given; paused 30 min');
  assert.equal(by.reasonless.statePlain, 'unfinished, paused until the lead decides');
  assert.deepEqual(by.reasonless.alerts, ['needs review: no reason given; paused 30 min']);
  assert.equal(by.fresh.needsReview, null);
  for (const x of v.items) assert.doesNotMatch(x.statePlain, /paused on purpose|may resume/, x.id);
  assert.doesNotMatch(v.states.find((x) => x.key === 'parked').plain, /paused on purpose|may resume/, 'the states legend too');
  assert.equal(by['t-land'].resume.ready, `other-topic was saved on main (${'d'.repeat(8)})`);
  assert.equal(by['t-old-land'].resume.ready, null, 'a commit before the row was parked does not count');
  assert.equal(by['t-sha'].resume.ready, 'abc1234 is on main');
  assert.equal(by['t-prog'].resume.ready, 'rest-script is in best build (v7)');
  assert.equal(by['t-build'].resume.ready, 'build v7 is out');
  assert.equal(by['t-try'].resume.ready, null, 'v5 never landed');
  assert.equal(by.branch.statePlain, 'done, not in a build · x', 'its branch work is on main');
  const c = S.checkLines(v);
  assert.ok(c.lines.includes('READY fresh (owner fix-fresh): parked until I-136 is resolved; I-136 is resolved: ready to resume'));
  assert.ok(c.lines.includes('REVIEW old (owner fix-old): needs review: no reason given and nothing set to bring it back (--resume-on); paused 5 h 0 min'));
  assert.deepEqual(c.lines.filter((l) => l.startsWith('READY ')).map((l) => l.split(' ')[1]), ['fresh', 'inc-parked', 'ops-x', 't-build', 't-land', 't-prog', 't-sha']);
  assert.equal(c.lines.filter((l) => l.startsWith('REVIEW ')).length, 3);
  const t = S.renderText(v, { all: true });
  assert.match(t, /\n {6}resumes when: the lead decides \(not yet\)\n/);
  assert.match(t, /\n {6}unfinished, paused until I-136 is resolved · waits for the lock fix \[progress fresh\]; owner fix-fresh;/);
  assert.match(t, /\n {6}also: row fresh-2 \(owner fix-fresh-2, updated 40 min ago\): x\n/);
  assert.doesNotMatch(t, /\nfresh-2 {2}\[/, 'the folded row has no line of its own');
  // no Progress data: parked words still derive, no label
  const bare = S.buildStatusView({ items: [row('x', 'parked', { note: 'n', resumeOn: { kind: 'incident', target: 'I-1' } })], live: {}, now: NOW });
  assert.equal(bare.items[0].statePlain, 'unfinished, paused until I-1 is resolved · n');
  assert.equal(bare.items[0].label, null);
  assert.equal(bare.items[0].resume.ready, null, 'no incident list (a source down): not ready');
});

// The real case behind T-130/T-133/T-135: morph-gpu (stage L, not in a build yet) had a stale "testing" row and a newer
// parked one; v8 is the next build (cd-roll-ca K, countdown-faces from the integrator's list; accent-ca-v7 and morph-gpu
// by their "build" field); v5 is an old preview, not "next".
const V8 = {
  build: { fixes: ['cd-strip'] },
  versions: [
    { id: 'v5-old-preview', landed: false, fixes: ['old-try'] },
    { id: 'v7-best', best: true, fixes: ['cd-strip'] },
    { id: 'v8-next', landed: false, name: 'Build v8 (to try)', fixes: ['cd-roll-ca', 'countdown-faces'] },
  ],
  items: [
    { id: 'cd-strip', title: 'Strip', state: 'landed', stage: 'L' },
    { id: 'morph-gpu', title: 'Morph on the GPU', state: 'landed', stage: 'L', build: 'v8' },
    { id: 'accent-ca-v7', title: 'Accent', state: 'testing', stage: 'V', build: 'v8' },
    { id: 'cd-roll-ca', title: 'Countdown roll', state: 'testing', stage: 'V', next: 'rev K on the phone' },
    { id: 'countdown-faces', title: 'Faces', state: 'landed', stage: 'L' },
    { id: 'old-try', title: 'Old', state: 'testing', stage: 'F' },
  ],
};

test('T-130 + T-135: morph-gpu: the stale "testing" row and the parked one show as ONE line, "done, waits for build v8 · next: …"', () => {
  assert.deepEqual(P.validateProgress(V8).filter((e) => /\.build:/.test(e)), [], 'a "build": "v8" field is valid');
  const items = [
    row('morph-gpu', 'testing', { note: 'rev 3 on the phone', updatedAt: ago(113), stateSince: ago(113) }),
    row('morph-gpu-park', 'parked', { progress: 'morph-gpu', updatedAt: ago(5), next: "phone no-worse check in v8's block", resumeOn: { kind: 'build', target: 'v8' } }),
    row('blur', 'parked', { resumeOn: { kind: 'decision', target: 'lead' } }),
  ];
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: V8 });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  const m = by['morph-gpu-park'];
  assert.equal(m.stateText, "done, waits for build v8 · next: phone no-worse check in v8's block");
  assert.equal(m.label, 'done, waits for build v8');
  assert.deepEqual(m.alerts, [], 'waiting for its build agrees with Progress');
  assert.equal(m.needsReview, null);
  assert.equal(by['morph-gpu'].foldedInto, 'morph-gpu-park');
  assert.deepEqual(m.also, [{ id: 'morph-gpu', owner: 'fix-morph-gpu', state: 'testing', note: 'rev 3 on the phone', ageMin: 113 }]);
  assert.equal(v.counts.folded, 1);
  assert.equal(v.counts.total, 2);
  assert.equal(by.blur.needsReview, 'needs review: no reason given; paused 30 min');
  const t = S.renderText(v, { all: true });
  assert.equal(t.split('\n').filter((l) => /^\S+\s+morph-gpu/.test(l)).length, 1, 'one line for morph-gpu');
  assert.match(t, /\n {6}done, waits for build v8 · next: phone no-worse check in v8's block \[progress morph-gpu\]/);
  assert.match(t, /\n {6}!! needs review: no reason given; paused 30 min$/);
  const link = S.progressLinks(v).get('morph-gpu');
  assert.equal(link.id, 'morph-gpu-park', '/progress links the line, not the folded row');
  assert.equal(link.label, 'done, waits for build v8');
});

test('T-133 #6: the next build groups its parts (item "build" field + the integrator\'s list), each with its label; finished parts stay', () => {
  assert.deepEqual(P.targetBuilds(V8), [{ build: 'v8', name: 'Build v8 (to try)', parts: [
    { id: 'morph-gpu', via: 'item' }, { id: 'accent-ca-v7', via: 'item' },
    { id: 'cd-roll-ca', via: 'version v8-next' }, { id: 'countdown-faces', via: 'version v8-next' },
  ] }], 'v5 is older than the best build: not next');
  assert.deepEqual(P.targetBuilds({ ...V8, versions: [...V8.versions, { id: 'v8-best', fixes: ['cd-roll-ca'] }] }), [], 'a build that landed is no longer next');
  assert.equal(P.buildShort('v12-wave'), 'v12');
  assert.equal(P.buildShort('baseline'), null);
  assert.match(P.validateProgress({ ...V8, items: [{ ...V8.items[0], build: 'eight' }] }).join('; '), /items\[0\]\.build: the build it is meant for, like "v8"/);
  const items = [
    row('cd-roll-ca', 'testing', { note: 'rev K' }),
    row('morph-gpu-park', 'parked', { progress: 'morph-gpu', next: 'phone check', resumeOn: { kind: 'build', target: 'v8' } }),
  ];
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: V8 });
  assert.equal(v.buildGroups.length, 1);
  const g = v.buildGroups[0];
  assert.equal(g.build, 'v8');
  assert.deepEqual(g.parts.map((x) => [x.id, x.label, x.done, x.row]), [
    ['morph-gpu', 'done, waits for build v8', true, 'morph-gpu-park'],
    ['accent-ca-v7', 'being tested', false, null],
    ['cd-roll-ca', 'being tested', false, 'cd-roll-ca'],
    ['countdown-faces', 'done, waits for build v8', true, null],
  ]);
  const t = S.renderText(v);
  assert.match(t, /\nNEXT BUILD v8: Build v8 \(to try\)\n {2}morph-gpu: done, waits for build v8 \[row morph-gpu-park\]\n {2}accent-ca-v7: being tested\n {2}cd-roll-ca: being tested\n {2}countdown-faces: done, waits for build v8\n/);
  // /progress: the same groups and the same legend
  const pv = P.buildView({ progress: V8, statusLinks: S.progressLinks(v), buildGroups: v.buildGroups, labelLegend: v.labelLegend, now: NOW });
  assert.deepEqual(pv.targets, v.buildGroups);
  assert.deepEqual(pv.labelLegend, v.labelLegend);
  // without the board (it could not be read): from Progress alone, plain words too
  const alone = P.buildView({ progress: V8, now: NOW });
  assert.deepEqual(alone.targets[0].parts.map((x) => [x.id, x.label, x.done]), [
    ['morph-gpu', 'done, waits for build v8', true], ['accent-ca-v7', 'being tested', false],
    ['cd-roll-ca', 'being tested', false], ['countdown-faces', 'done, waits for build v8', true],
  ]);
});

test('T-130/T-133: both pages render the next-build groups and the shared legend', async () => {
  const { readFileSync } = await import('node:fs');
  const status = readFileSync(new URL('../../tools/lib/status-page.html', import.meta.url), 'utf8');
  const progress = readFileSync(new URL('../../tools/lib/progress-page.html', import.meta.url), 'utf8');
  assert.match(status, /id="labels-dl"/);
  assert.match(status, /v\.labelLegend/);
  assert.match(status, /v\.buildGroups/);
  assert.match(status, /v\.stateText/);
  assert.match(progress, /v\.targets/);
  assert.match(progress, /What the labels mean/);
  assert.match(progress, /v\.labelLegend/);
  assert.doesNotMatch(progress, /'chip good'/, 'no such chip class');
  assert.doesNotMatch(status + progress, /paused on purpose; may resume/);
});

test('T-125 #10 (a): sync ties rows to landings: landed {at, sha, via}; ready-to-land on main -> landed; parked/researching on a landed item -> done; dry run writes nothing', async () => {
  const mk = async (id, state, extra = {}) => {
    await S.set(id, { by: `fix-${id}`, kind: 'fix', title: `Row ${id}`, state: 'testing', progressData: null, ...extra.pre });
    if (state !== 'testing') await S.set(id, { by: `fix-${id}`, state, progressData: null, ...extra.opts });
  };
  await mk('morph', 'parked', { opts: { resumeOn: 'decision:lead' } });
  await mk('cd-strip', 'researching');
  await mk('fresh', 'testing');
  await mk('wt', 'ready-to-land', { pre: { branch: { name: 'wt-b', ahead: 1, head: 'a'.repeat(40) } } });
  await mk('rest-script', 'testing');
  const live = { git: { mainShas: ['a'.repeat(40)], merged: [], shaAt: { ['a'.repeat(40)]: '2026-10-04T15:10:00.000Z' }, topics: { morph: { sha: 'b'.repeat(40), at: '2026-10-04T14:00:00.000Z' } } } };
  const dry = await S.sync({ by: 'lead', live, progress: DATA, apply: false });
  assert.deepEqual(dry.map((r) => `${r.id} ${r.from}->${r.to}`).sort(), ['cd-strip researching->done', 'morph parked->done', 'rest-script testing->testing', 'wt ready-to-land->landed']);
  assert.equal(S.get('morph').state, 'parked', 'dry run: nothing written');
  const res = await S.sync({ by: 'lead', live, progress: DATA });
  const by = Object.fromEntries(res.map((r) => [r.id, r]));
  assert.deepEqual(by.morph.landed, { at: '2026-10-04T14:00:00.000Z', sha: 'b'.repeat(40), via: 'fixes/morph/ on main' });
  assert.deepEqual(by.wt.landed, { at: '2026-10-04T15:10:00.000Z', sha: 'a'.repeat(40), via: 'branch wt-b' });
  assert.deepEqual(by['cd-strip'].landed, { at: null, sha: null, via: 'PROGRESS cd-strip: in best build (v7)' });
  assert.equal(S.get('morph').state, 'done');
  assert.equal('resumeOn' in S.get('morph'), false);
  assert.equal(S.get('wt').state, 'landed');
  assert.equal(S.get('wt').waitingOn, null);
  assert.equal(S.get('cd-strip').state, 'done');
  assert.equal(S.get('rest-script').state, 'testing', 'follow-up work keeps its state');
  assert.deepEqual(S.get('rest-script').landed, { at: null, sha: null, via: 'PROGRESS rest-script: in best build (v7)' });
  assert.equal(S.get('morph').history.at(-1).action, 'sync');
  assert.equal(S.get('morph').history.at(-1).by, 'lead');
  assert.equal(S.get('fresh').state, 'testing');
  assert.equal(S.get('fresh').landed, undefined);
  // a second sync changes nothing
  assert.deepEqual((await S.sync({ by: 'lead', live, progress: DATA })).filter((r) => r.changed), []);
  // after the sync the board agrees with Progress
  const v = S.buildStatusView({ items: S.list(), live, now: Date.now(), progress: DATA });
  assert.deepEqual(S.checkLines(v).lines.filter((l) => l.startsWith('MISMATCH')), []);
});

test('T-125 #10: gitLive gives commit times and the newest main commit per fixes/<topic>/', () => {
  const d = tempDir('fw-status-topics-');
  const c = (...a) => g(d, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...a);
  const put = (rel, text) => { mkdirSync(join(d, rel, '..'), { recursive: true }); writeFileSync(join(d, rel), text); };
  g(d, 'init', '-q', '-b', 'main');
  c('commit', '-q', '--allow-empty', '-m', 'zero');
  put('fixes/alpha/README.md', 'a1');
  put('tools/x.mjs', 'x');
  g(d, 'add', '.');
  c('commit', '-q', '-m', 'alpha one');
  put('fixes/beta/README.md', 'b1');
  put('fixes/alpha/README.md', 'a2');
  put('fixes/PROGRESS.json', '{}');
  g(d, 'add', '.');
  c('commit', '-q', '-m', 'alpha two, beta one');
  const two = g(d, 'rev-parse', 'HEAD');
  g(d, 'checkout', '-q', '-b', 'side');
  put('fixes/gamma/README.md', 'g1');
  g(d, 'add', '.');
  c('commit', '-q', '-m', 'gamma, not on main');
  const live = P.gitLive(d, { maxAgeMs: 0 });
  assert.equal(live.mainShas.length, 3);
  assert.equal(live.mainShas[0], two);
  assert.match(live.shaAt[two], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/);
  assert.deepEqual(Object.keys(live.topics).sort(), ['alpha', 'beta'], 'only main; a file directly in fixes/ is no topic');
  assert.deepEqual(live.topics.alpha, { sha: two, at: live.shaAt[two] }, 'the newest commit');
  assert.equal(live.topics.beta.sha, two);
});

test('T-125 #14 (b): gatherLive gives every incident\'s status, so a row parked on a resolved incident reads ready', async () => {
  const I = await import('../../tools/lib/incident.mjs');
  const a = await I.open({ by: 'fix-a', title: 'tool breaks', error: 'Error: one' });
  const b = await I.open({ by: 'fix-b', title: 'other breaks', error: 'Error: two' });
  await I.resolve(a.incident?.id ?? a.id, { by: 'lead', resolution: 'not-a-bug', note: 'works as meant' });
  const ida = a.incident?.id ?? a.id;
  const idb = b.incident?.id ?? b.id;
  const live = await P.gatherLive();
  assert.equal(live.incidentStatus[ida], 'resolved');
  assert.equal(live.incidentStatus[idb], 'open');
  assert.deepEqual(live.incidents.map((i) => i.id), [idb], 'the active list is unchanged: open ones only');
  const v = S.buildStatusView({ items: [row('p1', 'parked', { resumeOn: { kind: 'incident', target: ida } }), row('p2', 'parked', { resumeOn: { kind: 'incident', target: idb } })], live, now: NOW });
  assert.equal(v.items.find((x) => x.id === 'p1').resume.ready, `${ida} is resolved`);
  assert.equal(v.items.find((x) => x.id === 'p2').resume.ready, null);
});

test('T-139 #3: a finished row says why: "in best build", "not used: <whyNot>", "closed, no fix: <whyNot>", "done, waits for build v8"; no Progress item: "finished, no build to land"', () => {
  const data = {
    build: { fixes: ['in-it'] },
    versions: [{ id: 'v7-best', best: true, fixes: ['in-it'] }, { id: 'v8-next', landed: false, fixes: ['next-part'] }],
    items: [
      { id: 'in-it', title: 'In', state: 'landed', stage: 'L', inBuild: true },
      { id: 'record', title: 'Record', state: 'landed', stage: 'L', inBuild: false, whyNot: 'Kept on main as a record only: the menu opened slower.' },
      { id: 'next-part', title: 'Next', state: 'landed', stage: 'L', whyNot: 'not in v7' },
      { id: 'tried', title: 'Tried', state: 'dropped', stage: 'F', whyNot: 'On the phone the cards came slower.' },
    ],
  };
  const items = [row('in-it', 'done'), row('record', 'done'), row('next-part', 'done'), row('tried', 'closed-no-fix'), row('tried-2', 'dropped', { progress: 'tried', kind: 'tool' }), row('ts-job', 'done', { kind: 'tool' })];
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: data });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by['in-it'].stateText, 'in best build (v7)');
  assert.equal(by.record.label, 'not used');
  assert.equal(by.record.stateText, 'not used: Kept on main as a record only: the menu opened slower.');
  assert.equal(by['next-part'].stateText, 'done, waits for build v8', 'a part of the next build waits for it, whyNot or not');
  assert.equal(by.tried.stateText, 'closed, no fix: On the phone the cards came slower.');
  assert.equal(by['tried-2'].stateText, 'dropped: On the phone the cards came slower.');
  assert.equal(by['ts-job'].stateText, null);
  // a dropped Progress item's own "why" (fwreskip) counts too
  const fw = S.buildStatusView({ items: [row('fwreskip', 'dropped')], live: {}, now: NOW, progress: { items: [{ id: 'fwreskip', title: 'F', state: 'dropped', stage: 'I', why: 'No gain on the phone.' }] } });
  assert.equal(fw.items[0].stateText, 'dropped: No gain on the phone.');
  assert.equal(by['ts-job'].statePlain, 'finished, no build to land');
  for (const x of v.items) assert.doesNotMatch(x.statePlain, /nothing to land/, x.id);
  assert.ok(v.labelLegend.some((x) => x.label === 'not used'));
});

test('T-140: the user\'s "done but landed" rows read as plain labels, never "finished (nothing to land)"', () => {
  // the real items, trimmed: style-recalc and rest-script in the best build, best-stack landed and superseded (no build
  // of its own), illusion-proposals tried and not used (after the data fix: dropped with its whyNot)
  const data = {
    build: { fixes: ['style-recalc', 'rest-script'] },
    versions: [{ id: 'v1-st6-rb', fixes: ['style-recalc'] }, { id: 'v7-best', best: true, fixes: ['rest-script'] }],
    items: [
      { id: 'style-recalc', title: 'Section switch', state: 'landed', stage: 'L', inBuild: true },
      { id: 'rest-script', title: 'Rest', state: 'landed', stage: 'L', inBuild: true },
      { id: 'best-stack', title: 'Best combined build', state: 'landed', stage: 'L' },
      { id: 'illusion-proposals', title: 'Illusions', state: 'dropped', stage: 'R', inBuild: false, whyNot: 'None of the 5 image or video ways beat today\'s drawing on the phone.' },
    ],
  };
  const items = ['style-recalc', 'rest-script', 'best-stack', 'illusion-proposals'].map((id) => row(id, 'done'));
  const v = S.buildStatusView({ items, live: {}, now: NOW, progress: data });
  const by = Object.fromEntries(v.items.map((x) => [x.id, x]));
  assert.equal(by['style-recalc'].stateText, 'in best build (v7)');
  assert.equal(by['rest-script'].stateText, 'in best build (v7)');
  assert.equal(by['best-stack'].stateText, 'done, not in a build');
  assert.equal(by['illusion-proposals'].stateText, 'closed, no fix: None of the 5 image or video ways beat today\'s drawing on the phone.');
  for (const x of v.items) {
    assert.doesNotMatch(`${x.stateText} ${x.statePlain}`, /nothing to land|\blanded\b/, x.id);
    assert.deepEqual(x.alerts, [], x.id);
  }
  // with a whyNot (superseded), best-stack reads "not used: …"
  data.items[2].whyNot = 'Superseded: it grew into today\'s best build (v7).';
  const v2 = S.buildStatusView({ items, live: {}, now: NOW, progress: data });
  assert.equal(v2.items.find((x) => x.id === 'best-stack').stateText, 'not used: Superseded: it grew into today\'s best build (v7).');
});

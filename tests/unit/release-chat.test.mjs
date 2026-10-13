// I-273: tools/release/export-chat.mjs, the release's chat export (the user's messages and the lead's text answers,
// scrubbed). Made-up transcripts only (tests/fixtures/chat-transcripts.mjs); the CLI is in tests/e2e/release-chat-cli.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { tempDir } from '../helpers.mjs';
import * as F from '../fixtures/chat-transcripts.mjs';

const C = await import('../../tools/release/export-chat.mjs');
const R = await import('../../tools/release/rules.mjs');
const P = await import('../../tools/lib/paths.mjs');
const T = await import('../../tools/lib/transcripts.mjs');

const rules = () => R.buildRules(F.KNOWN);
const mark = (kind) => `[secret omitted: ${kind}]`;
const readAll = (dir) => readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

test('I-273 classify: each record kind is kept or dropped under its kind', () => {
  const recs = F.sessionA().filter((r) => typeof r !== 'string');
  const kept = [], drop = {};
  for (const r of recs) {
    const c = C.classify(r);
    kept.push(...c.keep);
    for (const [k, n] of Object.entries(c.drop)) drop[k] = (drop[k] || 0) + n;
  }
  assert.deepEqual(kept.map((m) => m.who), ['you', 'lead', 'lead', 'you', 'you', 'you', 'you', 'you', 'lead']);
  assert.deepEqual(drop, {
    queue: 1, attachment: 2, thinking: 1, 'tool-call': 1, 'tool-result': 1, 'teammate-message': 1, 'cross-session': 1,
    'task-notification': 1, peer: 1, meta: 2, compaction: 1, system: 1, 'other:brand-new-record-type': 1, pasted: 1,
    'local-command': 1, image: 1, 'api-error': 1, sidechain: 1, interrupt: 1,
  });
  const queued = kept.find((m) => m.text === 'queued while busy');
  assert.equal(queued.at, new Date(Date.UTC(2026, 9, 1, 10, 7, 0)).toISOString(), 'a queued message carries the time it was typed');
});

test('I-273 classify: an unknown record type, a record with no message, null and odd parts never throw', () => {
  for (const r of [null, 7, {}, { type: 'user' }, { type: 'assistant' }, { type: 'assistant', message: { content: [{ type: 'mystery' }, null] } },
    { type: 'user', message: { content: [{ type: 'text' }, { type: 'mystery' }] } }, { type: 'attachment' }, { type: 'x'.repeat(500) }]) {
    const c = C.classify(r);
    assert.equal(c.keep.length, 0);
    assert.ok(Object.keys(c.drop).length >= 1);
    for (const k of Object.keys(c.drop)) assert.ok(k.length <= 60, 'a kind never carries a long transcript string');
  }
});

test('I-273 cleanUserText: reminders, caveats, command output, attached context and pastes out; commands kept', () => {
  assert.deepEqual(C.cleanUserText('<system-reminder>\nx\n</system-reminder>\nhello <system-reminder>y</system-reminder>there'), { text: 'hello there', pasted: 0 });
  assert.deepEqual(C.cleanUserText('before <system-reminder>never closed\nmore'), { text: 'before', pasted: 0 });
  assert.equal(C.cleanUserText('# userEmail\nsomeone@x.invalid\n# gitStatus\nCurrent branch: main\n# Question\nwhy?').text, '# Question\nwhy?');
  assert.equal(C.cleanUserText('Claude Code attached this context automatically; it is not part of the message.\nok').text, 'ok');
  assert.deepEqual(C.cleanUserText('<pasted_content id="a">mail text</pasted_content>\nmine\n<pasted_content id="b">more</pasted_content>'),
    { text: `${C.PASTED_MARKER}\nmine\n${C.PASTED_MARKER}`, pasted: 2 });
  assert.equal(C.cleanUserText('<command-name>/model</command-name><command-message>model</command-message><command-args>opus</command-args>').text, '/model opus');
  assert.equal(C.cleanUserText('<command-name>/clear</command-name>').text, '/clear');
  assert.equal(C.cleanUserText('<bash-input>git status</bash-input>').text, '! git status');
  assert.equal(C.cleanUserText('<local-command-caveat>c</local-command-caveat><local-command-stdout>out</local-command-stdout>').text, '');
});

test('I-273 scrubAll: literals in any letter case, the home path and the LAN address; hits counted by rule id', () => {
  const hits = {};
  const s = C.scrubAll(`${F.NAME} / ${F.NAME.toLowerCase()} at ${F.HOME_PATH} via ${F.LAN}`, rules(), hits);
  assert.equal(s, '<name> / <name> at /Users/<user>/proj/notes.txt via 192.168.0.42');
  assert.ok(!s.includes(homedir()));
  assert.deepEqual(Object.values(hits).reduce((a, b) => a + b, 0), 4);
  assert.deepEqual(R.scanText(s, rules()), []);
});

test('I-273 withIdentity: identity values (the git email) join the literals unless already there (any case) or too short', () => {
  const k = C.withIdentity(F.KNOWN, [{ value: F.EMAIL.toUpperCase(), token: '<email>' }, { value: 'Ann Other', token: '<name>' }, { value: 'ab', token: '<name>' }, { value: 'abcdef12', token: '<name>' }, { value: '', token: '<email>' }]);
  assert.deepEqual(k.literals.map((l) => l.token), ['<name>', '<email>', '<name>']);
  assert.equal(k.literals[2].value, 'Ann Other');
  assert.equal(F.KNOWN.literals.length, 2, 'the known values are not changed in place');
  assert.deepEqual(C.gitIdentity({ FW_STATE_DIR: '/x' }), [], 'a test never reads the machine identity');
  assert.deepEqual(C.IDENTITY_KEYS, [['user.email', '<email>']], 'the email only: the user keeps their name public (choice 4)');
});

test('I-273 defaultProjectsDir: derived from the home and the main checkout, never under a test state dir', () => {
  assert.equal(C.defaultProjectsDir({}), join(homedir(), '.claude', 'projects', T.projectSlug(P.mainCheckout())));
  assert.equal(C.defaultProjectsDir({ FW_STATE_DIR: '/x' }), null);
  assert.equal(C.defaultProjectsDir({ FW_STATE_DIR: '/x', FW_TRANSCRIPTS_DIR: '/y' }), '/y');
});

test('I-273 exportChat: only typed text and lead text, scrubbed; subagents and other dirs skipped; files per session', async () => {
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  const out = join(root, 'out');
  const st = await C.exportChat({ projectsDir: dir, out, rules: rules() });
  const chat = join(out, 'chat');
  assert.deepEqual(readdirSync(chat).sort(), ['2026-10-01-11111111.json', '2026-10-01-11111111.md', '2026-10-02-22222222.json', '2026-10-02-22222222.md', 'index.md', 'needs-human-read.md', 'stats.json']);
  const all = readAll(chat);
  assert.doesNotMatch(all, /SECRET-/, 'no thinking, tool input or output, injection, file content, subagent or other-dir text');
  assert.ok(!all.includes(homedir()), 'no home path');
  assert.ok(!all.includes('10.77.3.'), 'no LAN address');
  assert.ok(!all.toLowerCase().includes(F.NAME.toLowerCase()) && !all.includes(F.EMAIL), 'no name or email in any case');
  for (const s of ['Lead answer one.', 'queued while busy', 'my own words after the paste', C.PASTED_MARKER, '/compact keep the plan', 'see the screenshot', C.IMAGE_MARKER, 'a second day', '/Users/<user>/proj/notes.txt', '192.168.0.42']) assert.ok(all.includes(s), s);
  const a = JSON.parse(readFileSync(join(chat, '2026-10-01-11111111.json'), 'utf8'));
  assert.equal(a.session, F.SESSION_A);
  assert.deepEqual(a.messages.map((m) => [m.n, m.who]), [[1, 'you'], [2, 'lead'], [3, 'lead'], [4, 'you'], [5, 'you'], [6, 'you'], [7, 'you'], [8, 'you'], [9, 'lead']]);
  assert.equal(a.messages[0].text, 'Please look at /Users/<user>/proj/notes.txt from 192.168.0.42, <name> here');
  assert.ok(a.messages.every((m, i) => i === 0 || m.at >= a.messages[i - 1].at), 'chronological');
  const md = readFileSync(join(chat, '2026-10-01-11111111.md'), 'utf8');
  assert.match(md, /\*\*You\*\* · 2026-10-01 10:01:00Z · #1\n\nPlease look at/);
  assert.match(md, /\*\*Lead\*\* · 2026-10-01 10:02:00Z · #2\n\nLead answer one\./);
  assert.deepEqual(st.kept, { you: 7, lead: 3 }, 'every lead text by default, the chat as the user saw it');
  assert.equal(st.lead, 'all');
  assert.equal(st.sessions, 2);
  assert.equal(st.dropped.duplicate, 1, 'the record session B copied from A counts once');
  assert.equal(st.dropped['lead-other-turn'], undefined);
  assert.ok(all.includes('Lead reply to an agent.'), 'the lead\'s reply in a turn a task notification started');
  assert.equal(st.dropped.unparsable, 1);
  assert.ok(st.scrubHits && Object.keys(st.scrubHits).length >= 3);
  assert.ok(st.bytes > 1000 && st.bytes < 100000);
  const idx = readFileSync(join(chat, 'index.md'), 'utf8');
  assert.match(idx, /\| \[11111111\]\(2026-10-01-11111111\.md\) \| 2026-10-01 10:01:00Z \| 2026-10-01 10:16:00Z \| 6 \| 3 \|/);
  assert.match(idx, /\| \[22222222\]\(2026-10-02-22222222\.md\) \| .* \| 1 \| 0 \|/);
  assert.match(idx, /\| tool-result \| 1 \|/);
  const stats = JSON.parse(readFileSync(join(chat, 'stats.json'), 'utf8'));
  assert.deepEqual(stats.kept, st.kept);
});

test('I-273 turns: lead user-turns keeps lead text only in the turns the user started', async () => {
  const user = (o) => ({ type: 'user', message: { role: 'user', content: 'x' }, ...o });
  const start = (r) => C.turnStart(r, C.classify(r));
  assert.equal(start(user({ origin: { kind: 'human' } })), 'you');
  assert.equal(start({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'human' }, prompt: 'q' } }), 'you');
  assert.equal(start(user({ origin: { kind: 'task-notification' } })), 'other');
  assert.equal(start(user({ isMeta: true, origin: { kind: 'peer' } })), 'other');
  assert.equal(start(user({ isMeta: true, scheduledTaskId: 't1' })), 'other', 'a scheduled prompt');
  assert.equal(start(user({ message: { content: '<teammate-message>m</teammate-message>' } })), 'other');
  assert.equal(start(user({ isMeta: true })), null, 'a companion meta record (caveat, skill text)');
  assert.equal(start(user({ isCompactSummary: true })), null);
  assert.equal(start(user({ message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] } })), null);
  assert.equal(start(user({ message: { content: '<local-command-stdout>o</local-command-stdout>' } })), null);
  assert.equal(start({ type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } }), null);
  assert.equal(start({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'peer' }, isMeta: true, prompt: 'p' } }), null);
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  const st = await C.exportChat({ projectsDir: dir, out: root, rules: rules(), lead: 'user-turns' });
  assert.deepEqual(st.kept, { you: 7, lead: 2 });
  assert.equal(st.dropped['lead-other-turn'], 1, 'the lead\'s reply in a turn a task notification started');
  assert.match(readFileSync(join(root, 'chat', 'index.md'), 'utf8'), /in the turns the user started/);
  assert.ok(!readFileSync(join(root, 'chat', '2026-10-01-11111111.md'), 'utf8').includes('Lead reply to an agent.'));
  await C.exportChat({ projectsDir: dir, out: root, rules: rules() });
  assert.match(readFileSync(join(root, 'chat', 'index.md'), 'utf8'), /in every turn/);
});

test('I-273 needs-human-read: possible names and Thai text by session file and number, no text quoted', async () => {
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  await C.exportChat({ projectsDir: dir, out: root, rules: rules() });
  const rev = readFileSync(join(root, 'chat', 'needs-human-read.md'), 'utf8');
  assert.match(rev, /\| 2026-10-01-11111111\.md \| #8 \| You \| possible-name, thai \|/);
  assert.doesNotMatch(rev, /Wobbleton|ขอบคุณ/);
  assert.doesNotMatch(rev, /#9 /, 'a capitalised word the export also has in lowercase is no name');
  const flags = C.needsHumanRead([{ file: 'f.md', messages: [{ who: 'lead', text: 'Chrome and Safari on the iPhone; `Zed` in code; see /Users/<user>/Xyzzy/a' }, { who: 'you', text: 'Garply went home' }] }]);
  assert.deepEqual(flags, [{ session: 'f.md', n: 2, who: 'you', reasons: ['possible-name'] }]);
});

test('I-273 redactSecrets: each secret shape becomes its kind marker; paths, words and SHAs stay', () => {
  for (const [kind, v] of Object.entries(F.FAKE_SECRETS)) {
    const r = C.redactSecrets(`before ${v} after`);
    assert.deepEqual(r.hits, [{ id: kind, count: 1 }], kind);
    assert.ok(r.text.includes(mark(kind)) && r.text.startsWith('before ') && r.text.endsWith(' after'), kind);
    assert.ok(!r.text.includes(v.slice(-12)), kind);
  }
  assert.equal(C.redactSecrets('api_token=' + 'Zm9v'.repeat(4) + 'Q1x2'.repeat(4)).text, `api_token=${mark('secret-kv')}`, 'the key name stays');
  // built at run time: a literal would be a check.mjs secret-kv hit in the release's history (I-269 shapes)
  assert.equal(C.redactSecrets(['key', 'abcdefghijklmnopqrstuvwxyz'].join('=')).text, `key=${mark('secret-kv')}`, 'a word after key= goes too (the shared list)');
  const keep = ['monkey: tools/release/export-chat-and-more', 'commit 0123456789abcdef0123456789abcdef01234567',
    'the task-notification-with-a-long-name', 'Bearer of bad news', 'sk-short', 'BEGIN PUBLIC thoughts'];
  for (const t of keep) assert.deepEqual(C.redactSecrets(t), { text: t, hits: [] }, t);
});

test('I-273 secrets: the export redacts with rules.mjs (check.mjs\'s list), so nothing check.mjs flags stays', () => {
  assert.equal(C.redactSecrets, R.redactSecrets, 'one implementation');
  const samples = Object.values(F.FAKE_SECRETS).join(' ; ');
  assert.ok(R.scanText(samples, R.withSecrets(rules()), { allow: [] }).length >= Object.keys(F.FAKE_SECRETS).length, 'the shapes find the samples');
  assert.deepEqual(R.scanText(C.redactSecrets(samples).text, R.withSecrets(rules()), { allow: [] }), [], 'and nothing after the redaction');
});

test('I-273 exportChat: secret shapes are replaced and listed by kind and place only', async () => {
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  const st = await C.exportChat({ projectsDir: dir, out: root, rules: rules() });
  const chat = join(root, 'chat');
  const all = readAll(chat);
  for (const v of Object.values(F.FAKE_SECRETS)) assert.ok(!all.includes(v.slice(-12)), 'no secret value in any file');
  assert.deepEqual(st.secretHits, Object.fromEntries(Object.keys(F.FAKE_SECRETS).map((k) => [k, 1])));
  const rev = readFileSync(join(chat, 'needs-human-read.md'), 'utf8');
  const row = rev.split('\n').find((l) => l.startsWith('| 2026-10-01-11111111.md | #3 | Lead |'));
  assert.ok(row, 'the lead message with the secrets is listed');
  for (const k of Object.keys(F.FAKE_SECRETS)) assert.ok(row.includes(`secret:${k}`), k);
});

test('I-273 exportChat: a residual rule match after the scrub throws before anything is written (fail-closed)', async () => {
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  // a hand-made rule whose token contains its own value: buildRules refuses this, so it stands for any scrub gap
  const bad = [{ kind: 'literal', match: 'busy', token: 'xbusyx', id: 'lit-bad' }];
  mkdirSync(join(root, 'chat'));
  writeFileSync(join(root, 'chat', 'old.md'), 'old');
  await assert.rejects(C.exportChat({ projectsDir: dir, out: root, rules: bad }), (e) => {
    assert.ok(e.residual.length >= 1);
    assert.ok(e.residual.every((r) => /^lit-bad 2026-10-0\d-\w{8}\.md#\d+$/.test(r)), 'rule id and place only');
    return true;
  });
  assert.ok(existsSync(join(root, 'chat', 'old.md')), 'the earlier export stays untouched');
});

test('I-273 sessionFiles: top-level .jsonl files only', () => {
  const root = tempDir('fw-chat-');
  const { dir } = F.makeProjects(root);
  mkdirSync(join(dir, 'dir.jsonl'));
  assert.deepEqual(C.sessionFiles(dir).map((p) => p.slice(dir.length + 1)), [`${F.SESSION_A}.jsonl`, `${F.SESSION_B}.jsonl`]);
});

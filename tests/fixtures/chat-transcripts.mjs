// I-273: a made-up Claude Code projects dir for tools/release/export-chat.mjs (the record shapes OBSERVED in the lead's
// transcripts, Claude Code 2.1.28x-2.1.29x; every text is invented). Everything that must not reach the export carries
// a SECRET- marker; HOME_PATH and LAN are scrubbed by the known values in KNOWN.
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const HOME_PATH = `${homedir()}/proj/notes.txt`;
export const LAN = '10.77.3.42';
export const NAME = 'Zorblatt Quux';
export const EMAIL = 'zq.person@mail.invalid';
export const KNOWN = {
  literals: [{ value: NAME, token: '<name>' }, { value: EMAIL, token: '<email>' }],
  lanPrefixes: ['10.77.3'],
  allow: [],
};
// made-up secret shapes, built at run time so no token-like string sits in the repo
export const FAKE_SECRETS = {
  'github-token': 'ghp_' + 'Ab1'.repeat(12),
  'sk-key': 'sk-' + 'q9Z'.repeat(8),
  'aws-key-id': 'AKIA' + 'Q7'.repeat(8),
  'bearer-token': 'Bearer ' + 'eyJ' + 'h0Z'.repeat(10),
  'private-key': ['-----BEGIN RSA PRIVATE', 'KEY-----\nMIIfake\n-----END RSA PRIVATE', 'KEY-----'].join(' '),
  'key-value': 'api_token=' + 'Zm9v'.repeat(4) + 'Q1x2'.repeat(4),
};
export const SESSION_A = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESSION_B = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let n = 0;
const t = (min) => new Date(Date.UTC(2026, 9, 1, 10, min, 0)).toISOString();
const rec = (o, min) => ({ uuid: `u-${++n}`, timestamp: t(min), sessionId: SESSION_A, ...o });
const human = (content, min, extra = {}) => rec({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content }, ...extra }, min);
const lead = (content, min, extra = {}) => rec({ type: 'assistant', message: { role: 'assistant', model: 'claude-x', content }, ...extra }, min);

/** The records of session A, in file order, with the line that is not JSON at the end. */
export function sessionA() {
  n = 0;
  return [
    { type: 'queue-operation', operation: 'enqueue', content: 'SECRET-QUEUE', timestamp: t(0) },
    rec({ type: 'attachment', attachment: { type: 'file', filename: 'x.md', content: 'SECRET-FILE' } }, 0),
    human(`<system-reminder>\n# userEmail\nSECRET-REMINDER ${EMAIL}\n</system-reminder>\nPlease look at ${HOME_PATH} from ${LAN}, ${NAME} here`, 1),
    lead([{ type: 'thinking', thinking: 'SECRET-THINKING', signature: 'x' }], 2),
    lead([{ type: 'text', text: 'Lead answer one.' }], 2),
    lead([{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'SECRET-TOOL-INPUT' } }], 3),
    rec({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'SECRET-TOOL-OUTPUT' }] }, toolUseResult: { stdout: 'SECRET-TOOL-OUTPUT' } }, 3),
    rec({ type: 'user', message: { role: 'user', content: '<teammate-message teammate_id="x">SECRET-TEAMMATE</teammate-message>' } }, 4),
    rec({ type: 'user', message: { role: 'user', content: 'Another Claude session sent a message:\n<cross-session-message from="y">SECRET-CROSS</cross-session-message>' } }, 4),
    rec({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification><summary>SECRET-TASK</summary></task-notification>' } }, 5),
    lead([{ type: 'text', text: `Lead reply to an agent. ${Object.values(FAKE_SECRETS).join(' ; ')}` }], 5),
    rec({ type: 'user', isMeta: true, origin: { kind: 'peer', from: 'agent-z' }, message: { role: 'user', content: 'SECRET-PEER' } }, 5),
    rec({ type: 'user', isMeta: true, message: { role: 'user', content: 'SECRET-META scheduled prompt' } }, 5),
    rec({ type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'SECRET-COMPACT summary' } }, 6),
    rec({ type: 'system', subtype: 'compact_boundary', content: 'SECRET-SYSTEM' }, 6),
    rec({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'human' }, commandMode: 'prompt', prompt: 'queued while busy', timestamp: t(7) } }, 8),
    rec({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'peer' }, isMeta: true, commandMode: 'prompt', prompt: 'SECRET-QUEUED-PEER' } }, 8),
    rec({ type: 'brand-new-record-type', text: 'SECRET-UNKNOWN' }, 9),
    human('<pasted_content id="p1">SECRET-PASTE from an email</pasted_content>\nmy own words after the paste', 10),
    human('<command-name>/compact</command-name>\n<command-message>SECRET-CMDMSG</command-message>\n<command-args>keep the plan</command-args>', 11),
    rec({ type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>SECRET-CAVEAT</local-command-caveat>' } }, 11),
    rec({ type: 'user', message: { role: 'user', content: '<local-command-stdout>SECRET-STDOUT</local-command-stdout>' } }, 11),
    human([{ type: 'image', source: { type: 'base64', data: 'U0VDUkVULUlNQUdF' } }, { type: 'text', text: 'see the screenshot' }], 12),
    lead([{ type: 'text', text: 'SECRET-API-ERROR' }], 13, { isApiErrorMessage: true }),
    lead([{ type: 'text', text: 'SECRET-SIDECHAIN' }], 13, { isSidechain: true }),
    human('[Request interrupted by user]', 14, { origin: undefined }),
    human('ขอบคุณ, and Wobbleton asked about it', 15),
    lead([{ type: 'text', text: `Second answer, mentions ${NAME.toUpperCase()} and ${LAN}.` }], 16),
    '{this line is not json',
  ];
}

/** Session B: a later session, one message, and a record copied from A (same uuid: a duplicate). */
export function sessionB(dupOf) {
  return [
    { ...dupOf, sessionId: SESSION_B },
    { uuid: 'b-1', type: 'user', origin: { kind: 'human' }, timestamp: new Date(Date.UTC(2026, 9, 2, 9, 0, 0)).toISOString(), message: { role: 'user', content: 'a second day' } },
  ];
}

const jsonl = (recs) => recs.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';

/** Write the projects dir (sessions A, B, A's subagent transcript, another dir) and a known file; returns the paths. */
export function makeProjects(root) {
  const dir = join(root, 'projects');
  mkdirSync(join(dir, SESSION_A, 'subagents'), { recursive: true });
  const a = sessionA();
  writeFileSync(join(dir, `${SESSION_A}.jsonl`), jsonl(a));
  writeFileSync(join(dir, `${SESSION_B}.jsonl`), jsonl(sessionB(a[2])));
  writeFileSync(join(dir, SESSION_A, 'subagents', 'agent-1.jsonl'), jsonl([{ uuid: 's-1', type: 'user', origin: { kind: 'human' }, timestamp: t(1), message: { role: 'user', content: 'SECRET-SUBAGENT' } },
    { uuid: 's-2', type: 'assistant', timestamp: t(1), message: { role: 'assistant', content: [{ type: 'text', text: 'SECRET-SUBAGENT-ANSWER' }] } }]));
  mkdirSync(join(dir, 'memory'), { recursive: true });
  writeFileSync(join(dir, 'memory', 'x.jsonl'), jsonl([{ uuid: 'm-1', type: 'user', origin: { kind: 'human' }, timestamp: t(1), message: { role: 'user', content: 'SECRET-OTHER-DIR' } }]));
  const known = join(root, 'known.json');
  writeFileSync(known, JSON.stringify(KNOWN));
  chmodSync(known, 0o600);
  return { dir, known };
}

// I-191 (user T-170 #9): the claude.ai artifact links that console texts keep as written (thread messages and notes,
// proposal texts) and the Threads page and the Proposals page's talk make clickable, and the look-alikes that stay
// scrubbed to <link> (or plain text on a page). One case list, used by console-threads.test.mjs, proposal.test.mjs
// and live-phone.test.mjs. Not a test file itself (no .test.mjs). Made-up ids only.

/** Kept as written: https only, the host claude.ai exactly, /artifact/<id 6-64 of [A-Za-z0-9_-]> or /code/artifact/<UUID>. */
export const ARTIFACT_OK = [
  'https://claude.ai/artifact/AbC_de-12345',
  'https://claude.ai/artifact/abcdef',
  `https://claude.ai/artifact/${'a'.repeat(64)}`,
  'https://claude.ai/artifact/123e4567-e89b-12d3-a456-426614174000', // a UUID-shaped id: not redacted as a device id
  'https://claude.ai/code/artifact/123e4567-e89b-12d3-a456-426614174000',
  'https://claude.ai/code/artifact/123E4567-E89B-12D3-A456-426614174000',
];

/** Scrubbed whole, as any other web link: other hosts, http, other paths, query, fragment, user info, port, bad ids. */
export const ARTIFACT_BAD = [
  'https://claude.ai.evil.invalid/artifact/abcdef12',
  'https://www.claude.ai/artifact/abcdef12',
  'https://evilclaude.ai/artifact/abcdef12',
  'https://claude.ai/artifact/abcdef12?y=1',
  'https://claude.ai/artifact/abcdef12#x',
  'https://claude.ai/artifact/abcdef12?=',
  'http://claude.ai/artifact/abcdef12', // http rejected: claude.ai is https only
  'HTTPS://CLAUDE.AI/artifact/abcdef12', // the exact lower-case form only
  'https://claude.ai/artifact/abcde', // id too short
  `https://claude.ai/artifact/${'a'.repeat(65)}`, // id too long
  'https://claude.ai/artifact/abc.def12',
  'https://claude.ai/artifact/abcdef12/',
  'https://claude.ai/artifact/abcdef12/x',
  'https://claude.ai/artifact/',
  'https://claude.ai/chat/abcdef12',
  'https://claude.ai/',
  'https://claude.ai/code/artifact/abcdef12',
  'https://claude.ai/code/artifact/123e4567-e89b-12d3-a456-42661417400', // UUID one digit short
  'https://claude.ai/code/artifact/123e4567-e89b-12d3-a456-426614174000x',
  'https://user@claude.ai/artifact/abcdef12',
  'https://claude.ai:443/artifact/abcdef12',
  'https://claude.ai/artifact/someone@example.invalid',
  'xhttps://claude.ai/artifact/abcdef12',
  'https://evil.invalid/?u=https://claude.ai/artifact/abcdef12',
];

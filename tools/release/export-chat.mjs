// tools/release/export-chat.mjs: the release's short chat export (I-273; user T-170 #436, choice 3a; memory/public-release.md).
//   node tools/release/export-chat.mjs [--projects-dir <dir>] --out <dir> [--known <file>] [--lead all|user-turns]
// Reads the lead's Claude Code transcripts (default ~/.claude/projects/<slug of the main checkout>/, the home derived at
// run time; only its top-level <session>.jsonl files: subagents/ and every other directory stay out) and writes
// <out>/chat/ (replaced on every run):
//   <date>-<session8>.md / .json   one per session with kept messages: chronological, UTC times, "You" / "Lead"
//   index.md                       per session: dates and message counts; totals and the dropped counts by kind
//   needs-human-read.md            messages with capitalised non-product words (possible names) or Thai text, by
//                                  session file and message number only, no text quoted
//   stats.json                     counts only (sessions, kept, dropped by kind, scrub hits by rule id, bytes)
// Kept: (a) what the user typed (user records from a human, and messages the user queued mid-turn), with
// <system-reminder> blocks, local-command caveats and output, the context Claude Code attaches (gitStatus, userEmail)
// and <pasted_content> (a "[pasted text omitted]" marker) taken out; (b) the lead's text blocks, in every turn (the
// chat as the user saw it in Claude Code; --lead user-turns: only in the turns the user started). Dropped: tool calls
// and results, thinking, teammate, cross-session, peer and task-notification injections, meta records, compaction
// summaries, attachments (file contents), images, every other record type (unknown ones too: the format belongs to
// Claude Code and is OBSERVED, 2.1.28x-2.1.29x, 2026-10-13).
// Every kept string is scrubbed with tools/release/rules.mjs (the known values file, default
// ~/.cache/fw-release/known.json or $FW_RELEASE_KNOWN; literals in any letter case), plus the main checkout's git
// user.email (the user keeps it in commit headers only; their name stays public, user choice 4). Fail-closed: a
// residual rule match after the scrub aborts with "RESIDUAL <rule-id> <session file>#<n>" lines, writes nothing and exits 1.
// Secret shapes (GitHub and sk- tokens, AWS key ids, Bearer tokens, PEM key blocks, long values after key=/token=/
// secret=) are replaced by "[secret omitted: <kind>]" and listed in needs-human-read.md by kind and place.
// Never prints a value. Output: "CHAT <n> sessions, <you> you + <lead> lead messages, <d> dropped, <MB> MB -> <dir>";
// exit 0. Exit 2: usage, a bad known file, an --out inside this repo, no transcripts directory.
import { readdirSync, statSync, createReadStream, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { exitOnHelp, isMain } from '../lib/help.mjs';
import { mainCheckout } from '../lib/paths.mjs';
import { transcriptsDir } from '../lib/transcripts.mjs';
import { loadKnown, buildRules, scrubText, scanText } from './rules.mjs';

exitOnHelp(import.meta.url);

export const PASTED_MARKER = '[pasted text omitted]';
export const IMAGE_MARKER = '[image omitted]';
export const FILE_MARKER = '[file omitted]';

/** The lead's transcripts directory (see transcripts.mjs: none under $FW_STATE_DIR unless $FW_TRANSCRIPTS_DIR). */
export const defaultProjectsDir = (env = process.env) => transcriptsDir({ env, mainCheckout: mainCheckout() });

/** The top-level session files of a projects dir (regular *.jsonl files only; directories are never entered). */
export function sessionFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f))
    .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } }).sort();
}

const tagBlock = (name) => new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?(?:</${name}>|$)`, 'g');
const STRIP_TAGS = ['system-reminder', 'local-command-caveat', 'local-command-stdout', 'local-command-stderr', 'bash-stdout', 'bash-stderr', 'command-message'];
// the context Claude Code attaches to a prompt, when it stands outside a reminder: from its heading to the next other heading
const CONTEXT_HEADS = /^# (?:userEmail|gitStatus|currentDate|claudeMd)\b/;

/** Context blocks out of a text: `# userEmail` / `# gitStatus` sections and the "attached this context" line. */
function stripContext(s) {
  const out = [];
  let skip = false;
  for (const line of s.split('\n')) {
    if (CONTEXT_HEADS.test(line)) { skip = true; continue; }
    if (skip && /^# /.test(line)) skip = false;
    if (skip) continue;
    if (/^Claude Code attached this context automatically/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * A typed user text as it goes into the export: {text, pasted} (pasted = blocks replaced by the marker). Slash
 * commands become "/name args", `!` shell input "! cmd"; reminders, caveats, command output and attached context go.
 */
export function cleanUserText(raw) {
  let s = String(raw ?? '');
  let pasted = 0;
  s = s.replace(tagBlock('pasted_content'), () => { pasted++; return PASTED_MARKER; });
  for (const t of STRIP_TAGS) s = s.replace(tagBlock(t), '');
  const name = s.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (name) {
    const args = s.match(/<command-args>([\s\S]*?)<\/command-args>/);
    s = [name[1].trim(), args ? args[1].trim() : ''].filter(Boolean).join(' ');
  }
  s = s.replace(/<bash-input>([\s\S]*?)(?:<\/bash-input>|$)/g, (_, c) => `! ${c.trim()}`);
  s = stripContext(s);
  return { text: s.replace(/\n{3,}/g, '\n\n').trim(), pasted };
}

/** A message content (string or parts) as text, with markers for images and documents; tool parts are not text. */
function partsText(content, counts) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const out = [];
  for (const p of content) {
    if (p?.type === 'text' && typeof p.text === 'string') out.push(p.text);
    else if (p?.type === 'image') { out.push(IMAGE_MARKER); counts.image = (counts.image || 0) + 1; }
    else if (p?.type === 'document') { out.push(FILE_MARKER); counts.file = (counts.file || 0) + 1; }
  }
  return out.join('\n');
}

/** Injected (not typed) user texts by their first tag or line, after reminders are stripped. */
function injectedKind(s) {
  const t = s.trimStart();
  if (/^<teammate-message[\s>]/.test(t)) return 'teammate-message';
  if (/^<task-notification[\s>]/.test(t)) return 'task-notification';
  if (/<cross-session-message[\s>]/.test(t) || /^Another Claude session sent a message/.test(t)) return 'cross-session';
  if (/^\[Request interrupted/.test(t)) return 'interrupt';
  if (/^<(?:local-command-(?:stdout|stderr|caveat))[\s>]/.test(t)) return 'local-command';
  if (/^<bash-(?:stdout|stderr)[\s>]/.test(t)) return 'bash-output';
  return null;
}

/**
 * One transcript record -> {keep: [{who, at, text, pasted}], drop: {kind: count}}. Assistant text parts are kept one
 * message per record; everything not listed in the header is dropped under its kind (an unknown type: `other:<type>`).
 */
export function classify(r) {
  const drop = {};
  const d = (k, n = 1) => { drop[k] = (drop[k] || 0) + n; };
  const keep = [];
  const at = typeof r?.timestamp === 'string' ? r.timestamp : null;
  const typed = (content, { bash = false } = {}) => {
    const counts = {};
    const raw = partsText(content, counts);
    for (const [k, n] of Object.entries(counts)) d(k, n);
    const kind = injectedKind(raw.replace(tagBlock('system-reminder'), ''));
    if (kind) return d(kind);
    const c = cleanUserText(raw);
    if (c.pasted) d('pasted', c.pasted);
    if (!c.text) return d('empty');
    keep.push({ who: 'you', at, text: bash && !c.text.startsWith('!') ? `! ${c.text}` : c.text });
  };
  if (!r || typeof r !== 'object') { d('unparsable'); return { keep, drop }; }
  if (r.type === 'assistant') {
    const c = r.message?.content;
    if (r.isSidechain) d('sidechain');
    else if (r.isApiErrorMessage || r.message?.model === '<synthetic>') d('api-error');
    else if (typeof c === 'string') { if (c.trim()) keep.push({ who: 'lead', at, text: c.trim() }); else d('empty'); }
    else if (Array.isArray(c)) {
      const texts = [];
      for (const p of c) {
        if (p?.type === 'text') { if (typeof p.text === 'string' && p.text.trim()) texts.push(p.text.trim()); }
        else if (p?.type === 'thinking' || p?.type === 'redacted_thinking') d('thinking');
        else if (p?.type === 'tool_use' || p?.type === 'server_tool_use') d('tool-call');
        else d(`other-part:${String(p?.type).slice(0, 40)}`);
      }
      if (texts.length) keep.push({ who: 'lead', at, text: texts.join('\n\n') });
    } else d('empty');
    return { keep, drop };
  }
  if (r.type === 'user') {
    const c = r.message?.content;
    if (Array.isArray(c) && c.some((p) => p?.type === 'tool_result')) d('tool-result');
    else if (r.isCompactSummary) d('compaction');
    else if (r.isSidechain) d('sidechain');
    else if (r.origin?.kind && r.origin.kind !== 'human') d(r.origin.kind === 'peer' ? 'peer' : r.origin.kind === 'task-notification' ? 'task-notification' : `origin:${String(r.origin.kind).slice(0, 40)}`);
    else if (r.isMeta) d('meta');
    else typed(c);
    return { keep, drop };
  }
  if (r.type === 'attachment') {
    const a = r.attachment;
    // a message the user typed while the lead was busy: Claude Code queues it and records it as an attachment
    if (a?.type === 'queued_command' && a.origin?.kind === 'human' && !a.isMeta) {
      const t = typeof a.timestamp === 'string' ? a.timestamp : at;
      const before = keep.length;
      typed(a.prompt, { bash: a.commandMode === 'bash' });
      for (const m of keep.slice(before)) m.at = t;
    } else d('attachment');
    return { keep, drop };
  }
  d(r.type === 'system' ? 'system' : r.type === 'queue-operation' ? 'queue' : `other:${String(r.type).slice(0, 40)}`);
  return { keep, drop };
}

const addTo = (acc, drop) => { for (const [k, n] of Object.entries(drop)) acc[k] = (acc[k] || 0) + n; };

/**
 * Who started the turn a record opens: 'you' (a typed message, also one queued mid-turn), 'other' (an agent message,
 * a task notification, a scheduled prompt, ...), or null (the record opens no turn: tool results, compaction,
 * companion meta records such as caveats and skill text, command output, the lead's own records).
 */
export function turnStart(r, c) {
  if (c.keep.some((m) => m.who === 'you')) return 'you';
  if (r?.type !== 'user') return null;
  if (['tool-result', 'compaction', 'sidechain', 'local-command', 'bash-output', 'interrupt', 'empty'].some((k) => c.drop[k])) return null;
  if (r.isMeta && !r.origin && !r.scheduledTaskId) return null;
  return 'other';
}

/**
 * One session file -> {id, messages: [{who, at, text}], drop}. Records seen in `seen` (uuids) are duplicates.
 * lead 'all' (default) keeps every lead text; 'user-turns' keeps the lead's text only in turns the user started.
 */
export async function readSession(file, seen = new Set(), { lead = 'all' } = {}) {
  const messages = [], drop = {};
  let turn = null;
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { addTo(drop, { unparsable: 1 }); continue; }
    if (typeof r?.uuid === 'string') {
      if (seen.has(r.uuid)) { addTo(drop, { duplicate: 1 }); continue; }
      seen.add(r.uuid);
    }
    const c = classify(r);
    addTo(drop, c.drop);
    turn = turnStart(r, c) ?? turn;
    for (const m of c.keep) {
      if (m.who === 'lead' && lead !== 'all' && turn !== 'you') addTo(drop, { 'lead-other-turn': 1 });
      else messages.push(m);
    }
  }
  // chronological (a queued message carries the time it was typed); a stable sort keeps the record order otherwise
  messages.sort((a, b) => (a.at && b.at ? Date.parse(a.at) - Date.parse(b.at) : 0));
  return { id: basename(file, '.jsonl'), messages, drop };
}

// Secret shapes (I-273, lead): a match is replaced by its kind's marker, never printed. Values after key=/token=/secret=
// count only when they look like a token (a digit, a letter, and mixed case or 32+ hex), so a path or a word does not.
const tokenLike = (v) => /\d/.test(v) && /[A-Za-z]/.test(v) && ((/[a-z]/.test(v) && /[A-Z]/.test(v)) || /^[0-9a-f]{32,}$/i.test(v));
export const SECRET_SHAPES = [
  { kind: 'private-key', re: /-----BEGIN [A-Z0-9 ]*KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*KEY(?: BLOCK)?-----|$)/g },
  { kind: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { kind: 'sk-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'aws-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { kind: 'key-value', re: /\b([A-Za-z0-9_-]*(?:key|token|secret))(["']?\s*[=:]\s*["']?)([A-Za-z0-9+/_-]{24,}={0,2})/gi, value: 3, keep: (m) => `${m[1]}${m[2]}` },
];
export const secretMarker = (kind) => `[secret omitted: ${kind}]`;

/** {text, hits: {kind: count}}: every secret shape replaced by its marker. */
export function redactSecrets(text) {
  let s = String(text);
  const hits = {};
  for (const sh of SECRET_SHAPES) {
    s = s.replace(sh.re, (...m) => {
      if (sh.value && !tokenLike(m[sh.value])) return m[0];
      hits[sh.kind] = (hits[sh.kind] || 0) + 1;
      return (sh.keep ? sh.keep(m) : '') + secretMarker(sh.kind);
    });
  }
  return { text: s, hits };
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * Scrub one text: literal values in any letter case first (fail-closed, like scanText), then scrubText (literals
 * exactly, then the regexes). Adds the hits by rule id to `hits`.
 */
export function scrubAll(text, rules, hits = {}) {
  let s = String(text);
  for (const r of rules) {
    if (r.kind !== 'literal') continue;
    let n = 0;
    s = s.replace(new RegExp(escRe(r.match), 'gi'), (m) => (m === r.match ? m : (n++, r.token)));
    if (n) hits[r.id] = (hits[r.id] || 0) + n;
  }
  const out = scrubText(s, rules);
  for (const h of out.hits) hits[h.id] = (hits[h.id] || 0) + h.count;
  return out.text;
}

/** The known values plus identity values as literals (skipped when a value is there already, in any case, or too short). */
export function withIdentity(known, identity = []) {
  const literals = [...(known.literals || [])];
  const have = new Set(literals.map((l) => String(l.value).toLowerCase()));
  for (const { value, token } of identity) {
    const v = String(value ?? '').trim();
    if (v.length < 4 || /^[0-9a-f]+$/i.test(v) || have.has(v.toLowerCase())) continue;
    if (literals.some((l) => token.toLowerCase().includes(String(l.value).toLowerCase()))) continue;
    literals.push({ value: v, token });
    have.add(v.toLowerCase());
  }
  return { ...known, literals };
}

/** user.email of the main checkout ([] under $FW_STATE_DIR: a test never reads the machine's identity). The name is not
 *  scrubbed: the user keeps their name and GitHub account public (choice 4). */
export const IDENTITY_KEYS = [['user.email', '<email>']];
export function gitIdentity(env = process.env) {
  if (env.FW_STATE_DIR) return [];
  const get = (k) => { try { return execFileSync('git', ['-C', mainCheckout(), 'config', k], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  return IDENTITY_KEYS.map(([k, token]) => ({ value: get(k), token }));
}

// capitalised words that are products, tools or plain project vocabulary, not names (lowercase in the corpus counts too)
const PRODUCT_WORDS = new Set(('Chrome Chromium Safari Webkit Blink Firefox Gecko Apple Iphone Ipad Mac Macos Ios Xcode Instruments Simulator ' +
  'Fastwork Claude Opus Sonnet Haiku Anthropic Github Git Node Npm Prettier Serena Svelte Sveltekit Vite Lottie Swiper Gsap ' +
  'Google Cloudflare Vercel Netlify Linux Windows Android Javascript Typescript Html Css Json Markdown Wifi Bluetooth Usb ' +
  'Quicktime Ffmpeg Tesseract Cwebp Webp Mp4 Png Gif Jpeg Devtools Cdp Lighthouse Perfetto Timeline Thai English ' +
  'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December').split(' '));

// prose only: code, URLs, paths and scrub tokens (<user>, as a path segment too) are no names
const proseOf = (s) => String(s)
  .replace(/```[\s\S]*?(?:```|$)/g, ' ')
  .replace(/`[^`\n]*`/g, ' ')
  .replace(/<[^>\s]+>/g, 'x')
  .replace(/\bhttps?:\/\/\S+/g, ' ')
  .replace(/(?:~|\.{1,2})?\/[\w.@~-]+(?:\/[\w.@~-]+)+/g, ' ');
const capitalised = (s) => [...proseOf(s).matchAll(/(?<![\p{L}\p{N}_.'-])([A-Z][a-z]{2,})(?![\p{L}\p{N}_])/gu)].map((m) => m[1]);

/**
 * Messages a human should read before the release: [{session, n, who, reasons: ['possible-name', 'thai',
 * 'secret:<kind>', ...]}] (secret kinds from m.secrets, set by redactSecrets). A
 * capitalised word is a possible name when its lowercase form never occurs as a lowercase word in the whole export
 * and it is no product word.
 */
export function needsHumanRead(sessions) {
  const lower = new Set();
  for (const s of sessions) for (const m of s.messages) for (const w of proseOf(m.text).matchAll(/(?<![\p{L}])([a-z]{3,})(?![\p{L}])/gu)) lower.add(w[1]);
  const out = [];
  for (const s of sessions) s.messages.forEach((m, i) => {
    const reasons = [];
    if (capitalised(m.text).some((w) => !lower.has(w.toLowerCase()) && !PRODUCT_WORDS.has(w[0] + w.slice(1).toLowerCase()))) reasons.push('possible-name');
    if (/[\u0E00-\u0E7F]/.test(m.text)) reasons.push('thai');
    for (const k of Object.keys(m.secrets || {}).sort()) reasons.push(`secret:${k}`);
    if (reasons.length) out.push({ session: s.file, n: i + 1, who: m.who, reasons });
  });
  return out;
}

const day = (iso) => (iso ? iso.slice(0, 10) : 'undated');
const stamp = (iso) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z` : 'undated');
const LABEL = { you: 'You', lead: 'Lead' };

function sessionMarkdown(s) {
  const head = [`# Chat, session ${s.id.slice(0, 8)} (${day(s.from)} to ${day(s.to)})`, '',
    'The user\'s messages ("You") and the lead\'s text answers ("Lead") from the lead\'s Claude Code transcript, scrubbed. ' +
    'Tool calls and their output, thinking, agent messages and notifications are left out. Times are UTC.', ''];
  const body = s.messages.map((m, i) => `---\n\n**${LABEL[m.who]}** · ${stamp(m.at)} · #${i + 1}\n\n${m.text}\n`);
  return head.join('\n') + '\n' + body.join('\n');
}

const sortedDrop = (drop) => Object.entries(drop).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

function indexMarkdown(sessions, stats) {
  const lines = ['# Chat export', '',
    'Short export of the chat between the user and the lead (user choice 3a, T-170 #436): what the user typed and the ' +
    `lead's text answers (${stats.lead === 'all' ? 'in every turn' : 'in the turns the user started'}), from the lead's top-level ` +
    'Claude Code transcripts, scrubbed. Agents\' transcripts, tool calls, tool output, thinking and injected messages are not included.', '',
    '| session | from (UTC) | to (UTC) | You | Lead |', '|---|---|---|---:|---:|'];
  for (const s of sessions) {
    const n = (w) => s.messages.filter((m) => m.who === w).length;
    lines.push(s.file ? `| [${s.id.slice(0, 8)}](${s.file}) | ${stamp(s.from)} | ${stamp(s.to)} | ${n('you')} | ${n('lead')} |` : `| ${s.id.slice(0, 8)} | - | - | 0 | 0 |`);
  }
  lines.push('', `Total: ${stats.kept.you} messages from the user, ${stats.kept.lead} from the lead, in ${stats.sessions} sessions.`, '',
    '## Left out, by kind', '', '| kind | count |', '|---|---:|', ...sortedDrop(stats.dropped).map(([k, n]) => `| ${k} | ${n} |`), '');
  return lines.join('\n');
}

function reviewMarkdown(flags) {
  const lines = ['# Chat export: messages a human should read', '',
    'Messages with a capitalised word that is neither a product name nor a word the export also uses in lowercase ' +
    '(a possible name), with Thai text, or where a secret shape was replaced by "[secret omitted: <kind>]" (secret:<kind>). ' +
    'Listed by session file and message number only; read them in the session file.', ''];
  if (!flags.length) return lines.concat('None.', '').join('\n');
  lines.push('| session file | message | from | reason |', '|---|---:|---|---|');
  for (const f of flags) lines.push(`| ${f.session} | #${f.n} | ${LABEL[f.who]} | ${f.reasons.join(', ')} |`);
  return lines.concat('').join('\n');
}

/** Read, filter, scrub and write. Returns the stats (counts only); throws {residual: [...]} before writing on a residual. */
export async function exportChat({ projectsDir, out, rules, lead = 'all' }) {
  const seen = new Set(), dropped = {}, hits = {}, secretHits = {};
  const sessions = [];
  for (const f of sessionFiles(projectsDir)) {
    const s = await readSession(f, seen, { lead });
    addTo(dropped, s.drop);
    for (const m of s.messages) {
      const r = redactSecrets(scrubAll(m.text, rules, hits));
      m.text = r.text;
      if (Object.keys(r.hits).length) { m.secrets = r.hits; addTo(secretHits, r.hits); }
    }
    s.from = s.messages[0]?.at ?? null;
    s.to = s.messages.at(-1)?.at ?? null;
    s.file = s.messages.length ? `${day(s.from)}-${s.id.slice(0, 8)}.md` : null;
    sessions.push(s);
  }
  sessions.sort((a, b) => (a.from ?? '9') < (b.from ?? '9') ? -1 : (a.from ?? '9') > (b.from ?? '9') ? 1 : 0);
  const residual = [];
  for (const s of sessions) s.messages.forEach((m, i) => {
    for (const h of scanText(m.text, rules, { path: `chat/${s.file}`, allow: [] })) residual.push(`${h.id} ${s.file}#${i + 1}`);
  });
  if (residual.length) throw Object.assign(new Error(`${residual.length} residual rule matches after the scrub`), { residual });
  const kept = { you: 0, lead: 0 };
  for (const s of sessions) for (const m of s.messages) kept[m.who]++;
  const dir = join(out, 'chat');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  const put = (name, text) => { writeFileSync(join(dir, name), text); bytes += Buffer.byteLength(text); };
  const withMsgs = sessions.filter((s) => s.file);
  for (const s of withMsgs) {
    put(s.file, sessionMarkdown(s));
    put(s.file.replace(/\.md$/, '.json'), JSON.stringify({ session: s.id, from: s.from, to: s.to,
      messages: s.messages.map((m, i) => ({ n: i + 1, who: m.who, at: m.at, text: m.text })) }, null, 1) + '\n');
  }
  const flags = needsHumanRead(withMsgs);
  const stats = { lead, sessions: sessions.length, sessionsWithMessages: withMsgs.length, kept, dropped, scrubHits: hits, secretHits, needsHumanRead: flags.length };
  put('index.md', indexMarkdown(sessions, stats));
  put('needs-human-read.md', reviewMarkdown(flags));
  stats.bytes = bytes; // the files above; stats.json itself is a few hundred bytes more
  writeFileSync(join(dir, 'stats.json'), JSON.stringify(stats, null, 1) + '\n');
  return stats;
}

const tildify = (p) => { const h = homedir(); return h && (p === h || p.startsWith(h + '/')) ? '~' + p.slice(h.length) : p; };
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (p, root) => { const r = relative(real(root), p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

async function main(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--projects-dir' || a === '--out' || a === '--known' || a === '--lead') opt[a.slice(2)] = argv[++i];
    else { console.error(`export-chat: unknown argument ${JSON.stringify(a)} (see --help)`); return 2; }
  }
  if (!opt.out) { console.error('export-chat: --out <dir> is required'); return 2; }
  if (opt.lead && !['user-turns', 'all'].includes(opt.lead)) { console.error('export-chat: --lead is user-turns or all'); return 2; }
  const projectsDir = opt['projects-dir'] || defaultProjectsDir();
  if (!projectsDir || !existsSync(projectsDir)) { console.error('export-chat: no transcripts directory (give --projects-dir <dir>)'); return 2; }
  // the export holds the chat: never inside this repo (or a worktree of it), where it could be committed
  const outAbs = resolve(opt.out);
  let probe = outAbs;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  if (inside(join(real(probe), relative(probe, outAbs)), mainCheckout())) { console.error('export-chat: --out is inside this repo; write the export outside it (the release folder)'); return 2; }
  let rules;
  try { rules = buildRules(withIdentity(loadKnown(opt.known || undefined), gitIdentity())); }
  catch (e) { console.error(`export-chat: ${e.message}`); return 2; }
  let stats;
  try { stats = await exportChat({ projectsDir, out: outAbs, rules, lead: opt.lead || 'all' }); }
  catch (e) {
    if (!e.residual) throw e;
    for (const r of e.residual) console.log(`RESIDUAL ${r}`);
    console.error(`export-chat: ${e.message}; nothing written`);
    return 1;
  }
  const nd = Object.values(stats.dropped).reduce((a, b) => a + b, 0);
  console.log(`CHAT ${stats.sessions} sessions, ${stats.kept.you} you + ${stats.kept.lead} lead messages, ${nd} dropped, ${(stats.bytes / 1e6).toFixed(2)} MB -> ${tildify(join(outAbs, 'chat'))}`);
  console.log(`DROPPED ${sortedDrop(stats.dropped).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`SECRETS ${sortedDrop(stats.secretHits).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'} (replaced; places in needs-human-read.md)`);
  console.log(`NEEDS-HUMAN-READ ${stats.needsHumanRead} messages (needs-human-read.md)`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

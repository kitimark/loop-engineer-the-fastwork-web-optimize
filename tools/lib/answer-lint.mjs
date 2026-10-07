// Answer-format lint (I-146, user T-123: "Why this agent didn't apply rules of how to answer the threads"). The rule
// lives in memory/answer-format.md (user T-080); this checks it mechanically on every agent-written text the user reads,
// so no agent has to remember it: `console.mjs thread reply|new` (kind 'answer'), the step text of `console.mjs post`
// and the text fields of `console.mjs proposal post|revise` (kind 'field').
//
// Errors (the CLI refuses: nothing is posted, exit 1, one line per problem with a fix hint):
//   (a) action-line   'answer' only: the last non-empty line starts with "What you need to do" (markdown **, >, - before
//                     it are fine); or a "What you need to do:" line followed only by up to 6 list items ("- …", "1. …").
//   (b) too-long      more than LIMITS.maxLines (18) non-empty lines; a table counts its rows, its |---| line does not.
//                     Calibrated on the store (2026-10-04): ~10 lines was the target, 18 leaves room for a short table.
//   (c) long-line     a non-table line over LIMITS.maxLineChars (250) characters. Calibrated on the 227 replies since the
//                     rule (2026-10-04 06:41Z): 220 refused 30 % of them, 250 refuses 16 % and still catches the two the
//                     user complained about (T-034 #6/#7: 277 and 363 characters). Kind 'field' (proposal cards, step
//                     text: documents, not answers) refuses over LIMITS.fieldLineChars (600, a wall of text) and warns
//                     over 250: 250 would have refused 18 of the 20 proposals in the store on line length, 600 refuses 6 (1 of the 3
//                     posted since the rule) and none of the 46 steps.
//   (d) unexplained-id an internal id (T-, PR-, I-, P-, F-, C- plus digits, or a 7-40 character hex sha with a digit and a
//                     letter) with no plain words that explain it. Explained means one of:
//                       - it sits inside a parenthesis after plain words: "the heat check (P-094)", "(fixed in a4f43dda)";
//                       - a gloss follows it: "PR-017 (the countdown fix)", "PR-017: the countdown fix", "PR-017 - …",
//                         "T-081, a closed thread"; not a clause ("PR-015: you chose keep" is no explanation);
//                         a list of ids shares the gloss: "PR-017 and PR-018 (the two countdown fixes)";
//                       - a dash gloss comes before it: "the countdown fix - PR-017";
//                       - in a table row: the row has at least 2 plain words besides the ids;
//                       - the same id was explained earlier in the text, or the user wrote it in this thread (`known`).
//                     Ids inside a URL are not checked. A plain word: 3+ letters, not an id.
//   (e) table-separator 2+ consecutive lines that start and end with "|" (outside a ``` block) whose second line is no
//                     separator row ("|" plus cells of :?-{3,}:?, e.g. |---|:--:|): the console's renderer (I-129) shows
//                     such a table as raw pipes (I-232, user T-230). The hint offers the exact separator line when every
//                     row has the same number of cells; the text itself is never rewritten.
// Warnings (printed, the text still posts): a first line over 160 characters; a paragraph (or one list item) of more
// than 3 sentences.
// Gain rows (proposal post|revise only, user T-126: PR-018's "What it saves" table packed the claim, the numbers, the
// status tag, the driver and a long note into one cell): gainProblems() refuses (rule g)
//   gain-cell      a what over LIMITS.gainWhat (50) or a before/after over LIMITS.gainCell (40) characters;
//   gain-better    no `better` verdict (better | same | worse: the page's 4th column "Better?");
//   gain-tag       a status word (OBSERVED, CONFIRMED, UNRESOLVED, REFUTED, estimate) in a cell: it goes in `tag`;
//   gain-driver    a driver or run code in a cell ("S1", "G1b", "S/W", "driver", "n=3", an id): it goes in `how`;
//   gain-note      a note in a cell (a ";", or in before/after a parenthesis of 2+ words): it goes in `how`.
// The page shows tag, phone flag and `how` folded under the table ("details"). Calibrated on the 131 rows in the store
// (2026-10-04): what over 40 chars 75, over 50 41; before/after over 40: 7. Stored proposals are only warned about
// (`proposal lint <id>|--all`, warn-only: old revs still render, with "—" where no verdict was given).
// Overrides: `--force-format "<reason>"` posts anyway and appends {at, by, where, reason, errors} to
// <console>/answer-lint-overrides.jsonl. No author is exempt (the lead neither). FW_ANSWER_LINT=off is honoured only with
// $FW_STATE_DIR set (the test suites' temp stores), never on the real store.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const LIMITS = Object.freeze({ maxLines: 18, maxLineChars: 250, fieldLineChars: 600, firstLineWarn: 160, maxSentences: 3, maxActionItems: 6, gainWhat: 50, gainCell: 40 });

/** The rule, short, for --help and the refusal message (memory/answer-format.md). */
export const RULE_SUMMARY = [
  'Answer format (memory/answer-format.md, user rule T-080): every text the user reads',
  '  1. Answer first: the first line is the answer or the decision.',
  '  2. Short bullets, one idea each; no long paragraphs.',
  '  3. Plain words: explain every code in a few words, e.g. "the heat check (P-094)".',
  '  4. Numbers in a small table or list, saying which is better; a table needs its |---| line under the header.',
  `  5. About 10 lines (refused over ${LIMITS.maxLines}); no line over ${LIMITS.maxLineChars} characters.`,
  '  6. Last line: "What you need to do: …" (or "What you need to do: nothing.").',
];

/** The gain-row rule (proposal post|revise), printed after RULE_SUMMARY there. */
export const GAIN_RULE = [
  'Gain rows ("What it saves", user T-126): 4 short cells, everything else in the notes below the table',
  `  what (at most ${LIMITS.gainWhat} chars) | before | after (at most ${LIMITS.gainCell} each) | better: better, same or worse.`,
  '  No status word, driver/run code or note in a cell: the status goes in "tag", the rest in "how" (shown folded as details).',
];

const ID_RE = /\b(?:PR|T|I|P|F|C)-\d{2,4}\b/g;
const SHA_RE = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/g;
const ACTION_RE = /^[\s>*_#-]*(?:\*\*)?\s*what you need to do\b/i;
const LIST_ITEM_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;
const TABLE_RE = /^\s*\|/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/;
const FENCE_RE = /^\s*```/;
// (e) the separator row a table needs under its header (I-232): "|" plus cells of :?-{3,}:? ("|---|:--:|---:|")
const PIPE_SEP_RE = /^\|(?:\s*:?-{3,}:?\s*\|)+$/;
const LOOSE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/; // the renderer's MD_SEP: any dashes

/** The cells of a |…| row, as the console's renderer splits them (I-129 mdCells: outer pipes off, \| is no column). */
function pipeCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.replace(/\\\|/g, '').split('|');
}

/** Every internal id in `s` (strings, in order; duplicates kept). */
export function idsIn(s) {
  const t = String(s ?? '').replace(URL_RE, (u) => ' '.repeat(u.length));
  return [...t.matchAll(ID_RE), ...t.matchAll(SHA_RE)].sort((a, b) => a.index - b.index).map((m) => m[0]);
}

/** Plain words (3+ letters, not part of an id) in a piece of text. */
function plainWords(s) {
  const t = String(s).replace(URL_RE, ' ').replace(ID_RE, ' ').replace(SHA_RE, ' ');
  return t.match(/[A-Za-z][A-Za-z']{2,}/g) || [];
}

/** Occurrences of ids in one line: [{id, index, end}], URLs blanked out first. */
function occurrences(line) {
  const t = line.replace(URL_RE, (u) => ' '.repeat(u.length));
  const out = [];
  for (const re of [ID_RE, SHA_RE]) for (const m of t.matchAll(re)) out.push({ id: m[0], index: m.index, end: m.index + m[0].length });
  return out.sort((a, b) => a.index - b.index);
}

/** The innermost parenthesis group around position i: {open, close} or null. */
function parenAround(line, i) {
  let depth = 0, open = -1;
  for (let k = i - 1; k >= 0; k--) {
    if (line[k] === ')') depth++;
    else if (line[k] === '(') { if (depth === 0) { open = k; break; } depth--; }
  }
  if (open < 0) return null;
  depth = 0;
  for (let k = i; k < line.length; k++) {
    if (line[k] === '(') depth++;
    else if (line[k] === ')') { if (depth === 0) return { open, close: k }; depth--; }
  }
  return { open, close: line.length };
}

const CLAUSE_START = /^(?:["'*_]*)(?:you|i|we|it|they|he|she|is|was|are|were|has|had|have|will|which|that|so|but|and|then|now|done|see|please|do|did|not|no)\b/i;
const LIST_JOIN = /^(?:\s*(?:,|and|or|&|\/)\s*(?:(?:PR|T|I|P|F|C)-\d{2,4}|(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40})\b)+/;

/** Is the id occurrence `o` in `line` explained right there (paren, gloss after or before, table row)? */
function explainedInLine(line, o, table) {
  if (table) return plainWords(line).length >= 2;
  const p = parenAround(line, o.index);
  if (p) {
    if (plainWords(line.slice(0, p.open)).length >= 1) return true;
    if (plainWords(line.slice(p.open + 1, p.close)).length >= 2) return true;
  }
  // a gloss after the id (or after a list of ids that starts with it)
  let rest = line.slice(o.end);
  const lj = rest.match(LIST_JOIN);
  if (lj) rest = rest.slice(lj[0].length);
  const g = rest.match(/^\s*\(([^)]*)\)/);
  if (g && plainWords(g[1]).length >= 1) return true;
  // ": the countdown fix", " - the countdown fix", ", a closed thread": a noun phrase, not a clause ("PR-015: you chose keep")
  const d = rest.match(/^\s*(?::|,|\s-|–|—)\s*(.*)$/);
  if (d && !CLAUSE_START.test(d[1]) && plainWords(d[1].split(/[.;,:]/)[0]).length >= 2) return true;
  // a dash gloss before it: "the countdown fix - PR-017"
  const before = line.slice(0, o.index).match(/([^.;:(]*?)\s+(?:-|–|—)\s*$/);
  if (before && plainWords(before[1]).length >= 2) return true;
  // an apposition between commas: "the 1 is a closed thread, T-081, that still has …"
  const appo = line.slice(0, o.index).match(/([^.;:(,]*),\s*$/);
  if (appo && /^\s*,/.test(line.slice(o.end)) && plainWords(appo[1]).length >= 2) return true;
  return false;
}

/** Split a paragraph into sentences (rough: ". " / "! " / "? " before a capital, digit or quote). */
export function sentences(s) {
  const t = String(s).replace(/\b(?:e\.g|i\.e|etc|vs|approx|incl|no|cf)\./gi, (m) => m.replace(/\./g, '․'));
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(*‘“])/).filter((x) => /[A-Za-z]/.test(x));
}

/**
 * Lint one text. kind: 'answer' (thread replies: all checks) or 'field' (step text, proposal fields: no action line).
 * known: ids the user already knows here (written by the user in this thread, the thread's own id).
 * Returns {errors: [{code, rule, line, msg, hint}], warnings: [...], ok}.
 */
export function lintText(text, { kind = 'answer', known = [], label = '' } = {}) {
  const errors = [], warnings = [];
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const at = (n) => `${label ? `${label} ` : ''}line ${n}`;
  const isTable = (l) => TABLE_RE.test(l);
  let inFence = false;
  const rows = []; // {n, text, table, sep, fence}
  lines.forEach((l, i) => {
    if (FENCE_RE.test(l)) { inFence = !inFence; rows.push({ n: i + 1, text: l, fence: true }); return; }
    rows.push({ n: i + 1, text: l, table: !inFence && isTable(l), sep: !inFence && TABLE_SEP_RE.test(l) && /-{3,}/.test(l), fence: inFence });
  });
  const nonEmpty = rows.filter((r) => r.text.trim());
  if (!nonEmpty.length) return { errors, warnings, ok: true };

  // (a) the action line
  if (kind === 'answer') {
    const last = nonEmpty.at(-1).text.trim();
    let ok = ACTION_RE.test(last);
    if (!ok) {
      const k = nonEmpty.map((r) => ACTION_RE.test(r.text.trim())).lastIndexOf(true);
      if (k >= 0) {
        const after = nonEmpty.slice(k + 1);
        ok = after.length > 0 && after.length <= LIMITS.maxActionItems && after.every((r) => LIST_ITEM_RE.test(r.text)) && /:\s*(?:\*\*)?\s*$|do\s*(?:\*\*)?\s*$/i.test(nonEmpty[k].text.trim());
      }
    }
    if (!ok) {
      const inline = nonEmpty.some((r) => /what you need to do/i.test(r.text) && !ACTION_RE.test(r.text.trim()));
      errors.push({ code: 'action-line', rule: 'a', line: nonEmpty.at(-1).n, msg: inline ? '"What you need to do" is not on its own last line' : 'no last line starting with "What you need to do"', hint: 'end with its own line: "What you need to do: nothing." or "What you need to do: <the one action>"' });
    }
  }
  // (b) length
  const counted = nonEmpty.filter((r) => !r.sep && !(r.fence && FENCE_RE.test(r.text)));
  if (counted.length > LIMITS.maxLines) errors.push({ code: 'too-long', rule: 'b', line: counted[LIMITS.maxLines].n, msg: `${counted.length} lines, at most ${LIMITS.maxLines} (aim for about 10; a table counts its rows)`, hint: 'cut to the answer and the key numbers; put details on the progress page or in a README and point to it' });
  // (c) long lines
  for (const r of nonEmpty) {
    if (r.table || r.fence) continue;
    const len = [...r.text.trim()].length;
    const max = kind === 'field' ? LIMITS.fieldLineChars : LIMITS.maxLineChars;
    const msg = `${len} characters, at most ${max}: "${r.text.trim().slice(0, 50)}…"`;
    if (len > max) errors.push({ code: 'long-line', rule: 'c', line: r.n, msg, hint: 'split it into short bullets, one idea each' });
    else if (len > LIMITS.maxLineChars) warnings.push({ code: 'long-line', line: r.n, msg: `${len} characters (over ${LIMITS.maxLineChars})`, hint: 'split it into short bullets, one idea each' });
  }
  // (e) a table's separator line (I-232): 2+ consecutive |…| lines whose second line is no |---| row
  let run = [];
  const endRun = () => {
    if (run.length >= 2 && !PIPE_SEP_RE.test(run[1].text.trim())) {
      const head = run[0];
      const loose = LOOSE_SEP_RE.test(run[1].text); // "|-|-|": a separator meant, too few dashes
      const counts = (loose ? [run[0], ...run.slice(2)] : run).map((r) => pipeCells(r.text).length);
      const n = counts[0];
      const line = `|${' --- |'.repeat(n)}`;
      const hint = counts.every((c) => c === n)
        ? (loose ? `replace line ${run[1].n} with: "${line}"` : `insert this line after line ${head.n}: "${line}"`)
        : `add a separator line under the header, one --- per column (e.g. "| --- | --- |"); the rows have ${[...new Set(counts)].sort((a, b) => a - b).join(', ')} columns: give every row the same number first`;
      errors.push({ code: 'table-separator', rule: 'e', line: head.n, msg: `a table (lines ${head.n}-${run.at(-1).n}) has no |---| line under its header row, so the console shows it as raw text`, hint });
    }
    run = [];
  };
  for (const r of rows) {
    const t = r.text.trim();
    if (!r.fence && t.length >= 2 && t.startsWith('|') && t.endsWith('|')) run.push(r);
    else endRun();
  }
  endRun();
  // (d) internal ids
  // an id explained anywhere in the text (the first mention, or a table further down) is fine everywhere
  const explained = new Set(known.map(String));
  const idRows = nonEmpty.filter((r) => !r.sep && !r.fence);
  for (const r of idRows) for (const o of occurrences(r.text)) if (explainedInLine(r.text, o, r.table)) explained.add(o.id);
  const reported = new Set();
  for (const r of idRows) {
    for (const o of occurrences(r.text)) {
      if (explained.has(o.id) || reported.has(o.id)) continue;
      reported.add(o.id);
      const sha = !/-/.test(o.id);
      errors.push({ code: 'unexplained-id', rule: 'd', line: r.n, msg: `"${o.id}" is an internal ${sha ? 'commit id' : 'code'} with no plain-words explanation`, hint: `say what it is: "the <thing> (${o.id})" or "${o.id} (the <thing>)", or leave it out` });
    }
  }
  // warnings
  const first = nonEmpty[0].text.trim().replace(/\*\*/g, '');
  if (!nonEmpty[0].table && [...first].length > LIMITS.firstLineWarn) warnings.push({ code: 'long-first-line', line: nonEmpty[0].n, msg: `the first line has ${[...first].length} characters (over ${LIMITS.firstLineWarn})`, hint: 'put the answer alone in a short first line; reasons go in bullets below' });
  const paras = [];
  let cur = null;
  for (const r of rows) {
    const t = r.text.trim();
    if (!t || r.table || r.fence || /^#/.test(t)) { cur = null; continue; }
    if (LIST_ITEM_RE.test(r.text) || !cur) { cur = { n: r.n, text: t }; paras.push(cur); } else cur.text += ` ${t}`;
  }
  for (const p of paras) {
    const k = sentences(p.text).length;
    if (k > LIMITS.maxSentences) warnings.push({ code: 'long-paragraph', line: p.n, msg: `a paragraph of ${k} sentences (over ${LIMITS.maxSentences})`, hint: 'break it into bullets, one idea each' });
  }
  for (const e of [...errors, ...warnings]) e.where = at(e.line);
  return { errors, warnings, ok: !errors.length };
}

/** Lint several fields (proposal text, step text): [{path, text}] -> one result, each problem labelled with its field. */
export function lintFields(fields, { kind = 'field', known = [] } = {}) {
  const errors = [], warnings = [];
  for (const f of fields) {
    if (typeof f.text !== 'string' || !f.text.trim()) continue;
    const r = lintText(f.text, { kind, known, label: f.path });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { errors, warnings, ok: !errors.length };
}

/** The proposal file's prose fields (title, problem, idea, …, option texts, gain what/how): [{path, text}]. */
export function proposalTexts(raw) {
  const out = [];
  const PROSE = new Set(['title', 'problem', 'idea', 'looksSame', 'risk', 'visualDiff', 'what', 'how', 'label', 'why', 'none', 'caption']);
  const walk = (v, path, key) => {
    if (typeof v === 'string') { if (PROSE.has(key)) out.push({ path, text: v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, key)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, k);
  };
  walk(raw, '', '');
  return out;
}

const STATUS_RE = /\b(?:OBSERVED|CONFIRMED|UNRESOLVED|REFUTED)\b|\bestimated?\b/i;
const DRIVER_RE = /\b(?:[SWMGF]\d+[a-z]?|[SWMGF](?:\/[SWMGF])+|driver|n\s*=\s*\d+|(?:PR|T|I|P|F|C)-\d{2,4})\b|\(\s*[SWMGF]\s*\)/;
const GAIN_BETTER = ['better', 'same', 'worse'];

/** Problems of one gain row's cells (rule g). path: "gain[2]" or "options[1].gain[0]". */
function gainRowProblems(g, path) {
  const out = [];
  const add = (code, field, msg, hint) => out.push({ code, rule: 'g', line: 0, where: `${path}.${field}`, msg, hint });
  if (!g || typeof g !== 'object') return out;
  for (const f of ['what', 'before', 'after']) {
    const v = g[f];
    if (v === undefined || v === null) continue;
    const t = String(v).trim();
    const max = f === 'what' ? LIMITS.gainWhat : LIMITS.gainCell;
    const len = [...t].length;
    if (len > max) add('gain-cell', f, `${len} characters, at most ${max}: "${t.slice(0, 40)}…"`, 'a short cell: the claim or the number only; the rest goes in "how", shown as the row\'s details');
    const st = t.match(STATUS_RE);
    if (st) add('gain-tag', f, `status word "${st[0]}" in a cell`, `put it in "tag" (${['OBSERVED', 'CONFIRMED', 'estimate', 'UNRESOLVED', 'REFUTED'].join(', ')}); the page shows it in the details`);
    const dr = t.match(DRIVER_RE);
    if (dr) add('gain-driver', f, `driver or run code "${dr[0].trim()}" in a cell`, 'move it to the notes ("how") below the table');
    // a short qualifier in the claim is fine ("Paints (Simulator, 4 s)"); a parenthesised note in a number cell is not
    const paren = f !== 'what' && [...t.matchAll(/\(([^()]*)\)/g)].find((m) => (m[1].match(/[A-Za-z]{3,}/g) || []).length >= 2);
    if (paren || t.includes(';')) add('gain-note', f, `a note in a cell: "${(paren ? paren[0] : t.slice(t.indexOf(';'))).slice(0, 40)}"`, 'move it to the notes ("how") below the table; keep the cell to the number');
  }
  const b = g.better === undefined || g.better === null ? '' : String(g.better).trim().toLowerCase();
  if (!GAIN_BETTER.includes(b)) add('gain-better', 'better', b ? `"${g.better}" is not better, same or worse` : 'no verdict', 'add "better": "better" | "same" | "worse" (the page\'s "Better?" column; in a markdown table a "Better" column)');
  return out;
}

/** Rule g over a proposal file's gain rows (top level and every option's). Returns {errors, warnings, ok}. */
export function gainProblems(raw) {
  const errors = [];
  const rows = (list, base) => (Array.isArray(list) ? list : []).forEach((g, i) => errors.push(...gainRowProblems(g, `${base}gain[${i}]`)));
  if (raw && typeof raw === 'object') {
    rows(raw.gain, '');
    (Array.isArray(raw.options) ? raw.options : []).forEach((o, k) => rows(o?.gain, `options[${k}]${o?.name ? ` (${o.name})` : ''}.`));
  }
  return { errors, warnings: [], ok: !errors.length };
}

/** A proposal file's whole format check: its prose fields (kind 'field') plus the gain rows (rule g). */
export function lintProposal(raw, { extra = [], known = [] } = {}) {
  const f = lintFields([...(raw ? proposalTexts(raw) : []), ...extra], { known });
  const g = gainProblems(raw);
  const errors = [...f.errors, ...g.errors];
  return { errors, warnings: f.warnings, ok: !errors.length };
}

/** Warn-only: the same check on a stored proposal (old revs keep rendering; their problems are warnings). */
export function warnOnly(r) {
  return { errors: [], warnings: [...r.errors, ...r.warnings], ok: true };
}

/** The problem lines, one per problem: "FORMAT error (d) line 3: … Fix: …". */
export function problemLines(r) {
  return [
    ...r.errors.map((e) => `FORMAT error (${e.rule}) ${e.code}, ${e.where}: ${e.msg}. Fix: ${e.hint}.`),
    ...r.warnings.map((w) => `FORMAT warning ${w.code}, ${w.where}: ${w.msg}. Fix: ${w.hint}.`),
  ];
}

/** The refusal text (nothing posted): header, problems, the rule, the ways out. */
export function refusalText(r, { where, force = '--force-format "<reason>"', rule = RULE_SUMMARY } = {}) {
  return [
    `FORMAT REFUSED ${where}: ${r.errors.length} error(s), nothing posted`,
    ...problemLines(r).map((l) => `  ${l}`),
    ...rule,
    `Test a draft without posting: --check-format (or thread lint --file <f>). Post anyway, logged for the lead: ${force}.`,
  ].join('\n');
}

/** Is the lint switched off? Only in a test store ($FW_STATE_DIR set) with FW_ANSWER_LINT=off. */
export function lintDisabled(env = process.env) {
  return !!env.FW_STATE_DIR && /^(off|0|no)$/i.test(String(env.FW_ANSWER_LINT ?? ''));
}

/** Append one override record to <dir>/answer-lint-overrides.jsonl. */
export function logOverride(dir, { by, where, reason, errors }) {
  mkdirSync(dir, { recursive: true });
  const rec = { at: new Date().toISOString(), by: by ?? null, where, reason, errors: errors.map((e) => `${e.rule} ${e.code} ${e.where}`) };
  appendFileSync(join(dir, 'answer-lint-overrides.jsonl'), `${JSON.stringify(rec)}\n`);
  return rec;
}

/**
 * The CLI's gate: lint, then refuse, check or post. Returns {proceed, exit, out: [stdout lines], err: [stderr lines]}.
 * check: --check-format (print, never post); force: the --force-format reason (string) or undefined.
 */
export function gate(result, { where, check = false, force, by, dir, disabled = lintDisabled(), rule = RULE_SUMMARY } = {}) {
  if (disabled && !check) return { proceed: true, out: [], err: [] };
  if (check) {
    const head = result.ok ? `FORMAT OK ${where}${result.warnings.length ? `: ${result.warnings.length} warning(s)` : ''} (nothing posted: --check-format)` : `FORMAT FAIL ${where}: ${result.errors.length} error(s) (nothing posted: --check-format)`;
    return { proceed: false, exit: result.ok ? 0 : 1, out: [head, ...problemLines(result).map((l) => `  ${l}`), ...(result.ok ? [] : rule)], err: [] };
  }
  if (!result.ok) {
    if (force === undefined) return { proceed: false, exit: 1, out: [], err: [refusalText(result, { where, rule })] };
    if (typeof force !== 'string' || !force.trim() || force.startsWith('--')) return { proceed: false, exit: 1, out: [], err: ['--force-format needs a reason: --force-format "<why this text cannot follow the answer format>"'] };
    logOverride(dir, { by, where, reason: force.trim(), errors: result.errors });
    return { proceed: true, out: [], err: [`FORMAT OVERRIDE ${where}: posted with ${result.errors.length} error(s), reason logged for the lead: ${force.trim()}`, ...problemLines(result).map((l) => `  ${l}`)] };
  }
  return { proceed: true, out: [], err: problemLines(result).map((l) => `  ${l}`) };
}

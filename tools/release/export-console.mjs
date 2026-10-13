// export-console.mjs: export the console record (threads, user steps, proposals, status board, findings, incidents) from
// the shared state dir into <out>/ as readable Markdown and JSON, for the public release (I-270, memory/public-release.md).
//
//   node tools/release/export-console.mjs --out <dir> [--state <dir>] [--known <file>] [--summary <file>]
//
//   --state    the shared state dir (default: this repo's .git/fastwork-mirror, or $FW_STATE_DIR)
//   --known    known personal values (default $FW_RELEASE_KNOWN or ~/.cache/fw-release/known.json); every text field and key is scrubbed with
//              secrets redacted (rules.mjs redactSecrets), then rules.mjs scrubAll (known literals in any letter case,
//              then the regexes), before it is written;
//              --out and --summary must be outside this repo (exit 2)
//   --summary  also write the export summary (counts, rule hits, excluded folders, needs-human-read list) as JSON
//
// Layout of <out>: index.md; threads/T-NNN.{md,json}; steps/C-NNN.{md,json}; proposals/PR-NNN.{md,json} (picture
// references point at the .webp files pictures.mjs writes into proposals/PR-NNN/); status.{md,json};
// findings.{md,json}; incidents.{md,json}.
// Only that allowlist is read. Never exported: live/, archive/, sim/, usblink/, phone-profile/, servers/, tryit/, wda/,
// locks/, waits/, space/, thermal/, usage/ (and every other folder: listed with a reason in the summary), the console's
// own server/read/routing files, and pictures users attached to thread messages.
// Output names rule ids, counts and record ids only, never a value or a message text.
import { exitOnHelp } from '../lib/help.mjs';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKnown, buildRules, scrubAll, redactSecrets } from './rules.mjs';
import { parseArgs, knownFile, addHits, tallyToList, scrubJson, isDir, refuseInside, show } from './release-util.mjs';

exitOnHelp(import.meta.url);

/** Store folders never exported, with the reason the scrub report gives. */
export const EXCLUDED_DIRS = {
  live: 'Try-it overlays and served Fastwork bundles (Fastwork-derived; the patches are in the repo)',
  archive: 'raw logs and probe output of old runs, not reviewed',
  sim: 'Simulator device ids and session state',
  usblink: 'USB link logs, device ids and a built library',
  'phone-profile': 'per-run phone profiles with device state',
  servers: 'local server records (ports, LAN addresses, pids)',
  tryit: 'Try-it server records (ports, LAN addresses, pids)',
  wda: 'WebDriverAgent setup (signing team, device ids)',
  locks: 'lock state and audit logs (pids, hosts)',
  waits: 'live wait records (pids, commands)',
  space: 'disk telemetry of this Mac',
  thermal: 'phone thermal logs',
  usage: 'session usage meter',
  idle: 'idle-alarm state (process state)',
  iphone: 'phone link state',
};
/** Files inside console/ that are never exported. */
export const EXCLUDED_CONSOLE = {
  'console/live/': EXCLUDED_DIRS.live,
  'console/server.json': 'the console server record (port, pid)',
  'console/proposal-reads.json': 'who read which proposal when (console internals)',
  'console/answer-lint-overrides.jsonl': 'answer-lint overrides (console internals)',
  'console/threads/desk.json': 'thread routing config',
  'console/threads/steward.json': 'thread routing config',
  'console/threads/topics.json': 'thread routing config',
  'console/threads/T-*/': 'pictures users attached to thread messages (not in the reviewed picture set)',
  'console/proposals/PR-*/': 'proposal pictures and videos: re-encoded and reviewed by pictures.mjs, shipped as proposal-media.tar',
};

const ID_FILE = { threads: /^T-\d+\.json$/, steps: /^C-\d+\.json$/, proposals: /^PR-\d+\.json$/, findings: /^F-\d+\.json$/, incidents: /^I-\d+\.json$/, status: /\.json$/ };

const readJsonDir = (dir, re) => (isDir(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : []);

// ---- Markdown helpers ------------------------------------------------------------------------------------------------
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const list = (pairs) => pairs.filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? '`' + JSON.stringify(v) + '`' : v}`).join('\n');
const block = (title, text) => (text ? `\n## ${title}\n\n${text}\n` : '');
const codeJson = (v) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
const historyMd = (h) => (Array.isArray(h) && h.length ? `\n## History\n\n${h.map((e) => `- ${e.at || ''} ${e.who || e.by || ''}: ${e.action || ''}${e.rev ? ` (rev ${e.rev})` : ''}${e.note ? ` - ${cell(e.note)}` : ''}`).join('\n')}\n` : '');
const footer = (id) => `\n---\nFull record: [${id}.json](${id}.json)\n`;

function threadMd(t) {
  const head = `# ${t.id}: ${t.title || ''}\n\n${list([['status', t.status], ['created', `${t.createdAt || ''} by ${t.createdBy || ''}`], ['updated', t.updatedAt], ['assignees', t.assignees], ['topic', t.topic], ['related', t.related], ['merged', t.merged]])}\n`;
  const msgs = (t.messages || []).map((m) => {
    const marks = [m.ask && 'asks', m.forLead && 'for the lead', m.later && 'answer later'].filter(Boolean);
    const pics = Array.isArray(m.images) && m.images.length ? `\n\n_${m.images.length} picture(s) attached in the console; not exported._` : '';
    return `\n## #${m.n} · ${m.by} · ${m.at}${marks.length ? ` (${marks.join(', ')})` : ''}\n\n${m.text || ''}${pics}\n`;
  }).join('');
  return head + msgs + historyMd(t.history) + footer(t.id);
}

function stepMd(c) {
  const parts = Array.isArray(c.parts) && c.parts.length ? `\n## Parts\n\n| # | label | state | started | done |\n|---|---|---|---|---|\n${c.parts.map((p, i) => `| ${i + 1} | ${cell(p.label)} | ${cell(p.state)} | ${cell(p.at?.started)} | ${cell(p.at?.done)} |`).join('\n')}\n` : '';
  const result = c.result ? `\n## Result\n\n${list([['value', typeof c.result.value === 'object' ? JSON.stringify(c.result.value) : c.result.value], ['at', c.result.at]])}${c.result.notes ? `\n\n${c.result.notes}` : ''}\n` : '';
  const answer = c.answer?.options?.length ? `\n## Answer options\n\n${c.answer.options.map((o) => `- ${typeof o === 'object' ? cell(o.label ?? o.value ?? JSON.stringify(o)) : cell(o)}`).join('\n')}\n` : '';
  return `# ${c.id}: ${c.title || ''}\n\n${list([['kind', c.kind], ['by', c.by], ['status', c.status], ['topic', c.topic], ['created', c.createdAt], ['started', c.startedAt], ['url', c.url]])}\n`
    + block('Instructions', c.instructions) + parts + answer + result + (c.meta ? `\n## Meta\n\n${codeJson(c.meta)}\n` : '') + historyMd(c.history) + footer(c.id);
}

function gainMd(g) {
  if (!Array.isArray(g) || !g.length) return '';
  return `\n| what | before | after | tag | how |\n|---|---|---|---|---|\n${g.map((x) => `| ${cell(x.what)} | ${cell(x.before)} | ${cell(x.after)} | ${cell(x.tag)} | ${cell(x.how)} |`).join('\n')}\n`;
}
function shotsMd(id, shots) {
  if (!Array.isArray(shots) || !shots.length) return '';
  return '\n' + shots.map((s) => `**${cell(s.caption)}**\n\n${['a', 'b'].filter((k) => typeof s[k] === 'string').map((k) => `![${k.toUpperCase()}](${id}/${s[k]})`).join(' ')}\n`).join('\n');
}
function proposalMd(p) {
  const opts = (p.options || []).map((o) => `\n### Option ${o.name || ''}${o.label ? `: ${o.label}` : ''}\n${o.idea ? `\n${o.idea}\n` : ''}${o.risk ? `\nRisk: ${o.risk}\n` : ''}${(o.visualDiff || []).length ? `\nVisual difference:\n${o.visualDiff.map((v) => `- ${v}`).join('\n')}\n` : ''}${gainMd(o.gain)}${shotsMd(p.id, o.compare?.shots)}`).join('');
  const decisions = (p.decisions || []).length ? `\n## Decisions\n\n${p.decisions.map((d) => `- rev ${d.rev ?? ''} ${d.at || ''} ${d.who || ''}: **${d.value || ''}**${d.option ? ` (option ${d.option})` : ''}${d.notes ? ` - ${cell(d.notes)}` : ''}`).join('\n')}\n` : '';
  const revisions = (p.revisions || []).length ? `\n## Revisions\n\n${p.revisions.map((r) => `- rev ${r.rev} ${r.at || ''} ${r.by || ''}${r.note ? `: ${cell(r.note)}` : ''}`).join('\n')}\n` : '';
  return `# ${p.id}: ${p.title || ''}\n\n${list([['by', p.by], ['area', p.area], ['topic', p.topic], ['thread', p.thread], ['state', p.state], ['rev', p.rev], ['proposed', p.proposedAt], ['updated', p.updatedAt]])}\n`
    + block('Problem', p.problem) + block('Idea', p.idea) + block('Looks the same?', p.looksSame) + block('Risk', p.risk)
    + ((p.visualDiff || []).length ? `\n## Visual difference\n\n${p.visualDiff.map((v) => `- ${v}`).join('\n')}\n` : '')
    + (p.gain?.length ? `\n## Gain\n${gainMd(p.gain)}` : '') + (p.compare?.shots?.length ? `\n## Pictures\n${shotsMd(p.id, p.compare.shots)}` : '')
    + (opts ? `\n## Options\n${opts}` : '') + (p.recommended ? `\n## Recommended\n\nOption ${p.recommended.option || ''}: ${p.recommended.why || ''}\n` : '')
    + decisions + revisions + historyMd(p.history) + footer(p.id);
}

const statusMd = (rows) => `# Status board\n\n| id | title | kind | owner | state | note |\n|---|---|---|---|---|---|\n${rows.map((r) => `| ${cell(r.id)} | ${cell(r.title)} | ${cell(r.kind)} | ${cell(r.owner)} | ${cell(r.state)} | ${cell(r.note)} |`).join('\n')}\n\nFull records: [status.json](status.json)\n`;
const findingsMd = (rows) => `# Findings\n${rows.map((f) => `\n## ${f.id}: ${f.title || ''}\n\n${list([['kind', f.kind], ['topics', f.topics], ['by', f.by], ['posted', f.postedAt], ['status', f.status], ['where', f.where]])}\n${f.evidence ? `\nEvidence: ${f.evidence}\n` : ''}${f.body ? `\n${f.body}\n` : ''}`).join('')}\nFull records: [findings.json](findings.json)\n`;
const incidentsMd = (rows) => `# Incidents\n${rows.map((i) => `\n## ${i.id}: ${i.title || ''}\n\n${list([['status', i.status], ['class', i.class], ['blocking', i.blocking], ['reported', `${i.openedAt || ''} by ${i.reportedBy || ''}`], ['affected', i.affected], ['resolved', i.resolvedAt ? `${i.resolvedAt} by ${i.resolvedBy || ''}` : undefined], ['fix', i.fix], ['remeasure', i.remeasure]])}\n${i.error ? `\nError: \`${cell(i.error)}\`\n` : ''}${i.cmd ? `\nCommand: \`${cell(i.cmd)}\`\n` : ''}${i.workaround ? `\nWorkaround: ${i.workaround}\n` : ''}${i.resolution ? `\nResolution: ${i.resolution}\n` : ''}${i.resolutionNote ? `\n${i.resolutionNote}\n` : ''}`).join('')}\nFull records: [incidents.json](incidents.json)\n`;

// ---- needs-human-read ------------------------------------------------------------------------------------------------
/** Capitalised words that are product or study vocabulary, never a person's name. */
export const PRODUCT_WORDS = new Set(('Fastwork Chrome Chromium Safari WebKit Blink Apple Mac MacBook Xcode Simulator Google GitHub Claude Code Anthropic '
  + 'Node Prettier Serena Lighthouse Timeline Inspector Web Release Console Status Proposal Proposals Threads Thread Steps Step Progress '
  + 'Monitor Medium Thai English Wi Fi Bluetooth Low Power Mode Serious Fair Critical Nominal Hero Option Rev Lead User Done Start Yes No Okay '
  + 'Try Swipe Finger Phone Gesture Test Tests Page Pages Build Builds Agent Agents Card Cards Day Monday Tuesday Wednesday Thursday Friday '
  + 'Saturday Sunday January February March April May June July August September October November December').split(/\s+/));
const THAI = new RegExp('[\\u0E00-\\u0E7F]');
const isUser = (who) => /^user(-|$)/.test(String(who || ''));
const EMAIL_ADDR = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const STARTERS = new Set(['.', '!', '?', ':', ';', '(', '"', "'", '“', '‘', '*', '#', '>', '-', '•', '[', '_', '`', ')']);

/** Capitalised words of a text that do not start a sentence or a line. */
export function midSentenceCaps(text) {
  const out = [];
  const re = /[A-Za-z][A-Za-z'’-]*/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0].replace(/['’-]+$/, '');
    if (!/^[A-Z][a-z]+$/.test(w.replace(/['’]s$/, ''))) continue;
    let i = m.index - 1;
    while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
    if (i < 0 || text[i] === '\n' || STARTERS.has(text[i]) || /\d/.test(text[i])) continue;
    if (text[i] === '<' || text[m.index - 1] === '<') continue; // a <token>
    out.push(w.replace(/['’]s$/, ''));
  }
  return out;
}
/** Does a text look like a pasted e-mail (two header lines, or a greeting plus a sign-off)? */
export function looksLikeEmail(text) {
  const heads = new Set([...text.matchAll(/^\s*(from|to|subject|date|sent|cc)\s*:/gim)].map((x) => x[1].toLowerCase()));
  if (heads.size >= 2) return true;
  return /^\s*(dear|hi|hello)\b/im.test(text) && /\b(regards|sincerely|best wishes|cheers|thanks|thank you)\b[,.!]?\s*$/im.test(text);
}

/**
 * Texts a human must read before the release: Thai text (any author: scripts the rules cannot check), a redacted
 * secret (any author: the text around it may need a look), and in user texts a
 * pasted e-mail, an e-mail address, or capitalised words outside the study's vocabulary (maybe a name). Returns
 * [{where, by, kinds:[...]}]; never the text or the words.
 */
export function needsHumanRead(texts) {
  const seen = new Map();
  for (const t of texts) if (t.by !== 'user') for (const w of new Set(midSentenceCaps(t.text))) { if (!seen.has(w)) seen.set(w, new Set()); seen.get(w).add(t.record); }
  const vocab = new Set([...PRODUCT_WORDS, ...[...seen].filter(([, recs]) => recs.size >= 3).map(([w]) => w)]);
  const out = [];
  for (const t of texts) {
    const kinds = [];
    if (THAI.test(t.text)) kinds.push('thai-text');
    if (t.text.includes('[secret omitted: ')) kinds.push('secret-omitted');
    if (t.by === 'user') {
      if (looksLikeEmail(t.text)) kinds.push('pasted-email');
      if (EMAIL_ADDR.test(t.text)) kinds.push('email-address');
      const caps = new Set(midSentenceCaps(t.text).filter((w) => !vocab.has(w)));
      if (caps.size) kinds.push(`capitalised-words(${caps.size})`);
    }
    if (kinds.length) out.push({ where: t.where, by: t.by, kinds });
  }
  return out;
}

/** Point picture references at the re-encoded .webp files (shots[].a / shots[].b). */
export function webpRefs(v) {
  if (Array.isArray(v)) return v.map(webpRefs);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === 'shots' && Array.isArray(x)) o[k] = x.map((s) => { const c = webpRefs(s); for (const ab of ['a', 'b']) if (typeof c?.[ab] === 'string' && /^[\w.-]+\.png$/i.test(c[ab])) c[ab] = c[ab].replace(/\.png$/i, '.webp'); return c; });
    else o[k] = webpRefs(x);
  }
  return o;
}

/** Folders and console files of the store that the export leaves out, with reasons (only those that exist). */
export function excludedList(state) {
  const out = [];
  if (isDir(state)) for (const d of readdirSync(state).sort()) {
    if (['console', 'status', 'findings', 'incidents'].includes(d)) continue;
    out.push({ path: isDir(join(state, d)) ? `${d}/` : d, reason: EXCLUDED_DIRS[d] || 'not in the export allowlist' });
  }
  const c = join(state, 'console');
  if (isDir(c)) {
    for (const f of readdirSync(c).sort()) {
      if (/^C-\d+\.json$/.test(f) || f === 'threads' || f === 'proposals') continue;
      const key = `console/${f}${isDir(join(c, f)) ? '/' : ''}`;
      out.push({ path: key, reason: EXCLUDED_CONSOLE[key] || 'not in the export allowlist' });
    }
    for (const sub of ['threads', 'proposals']) {
      const d = join(c, sub);
      if (!isDir(d)) continue;
      const dirs = readdirSync(d).filter((f) => isDir(join(d, f)));
      const loose = readdirSync(d).filter((f) => !isDir(join(d, f)) && !ID_FILE[sub === 'threads' ? 'threads' : 'proposals'].test(f));
      for (const f of loose.sort()) out.push({ path: `console/${sub}/${f}`, reason: EXCLUDED_CONSOLE[`console/${sub}/${f}`] || 'not in the export allowlist' });
      if (dirs.length) out.push({ path: `console/${sub}/${sub === 'threads' ? 'T' : 'PR'}-*/ (${dirs.length})`, reason: EXCLUDED_CONSOLE[`console/${sub}/${sub === 'threads' ? 'T' : 'PR'}-*/`] });
    }
  }
  return out;
}

/** One console text: secrets out first ("[secret omitted: <shape id>]"), then the known values in any case and the regexes. */
export function scrubConsoleText(text, rules) {
  const a = redactSecrets(text), b = scrubAll(a.text, rules);
  return { text: b.text, hits: [...a.hits, ...b.hits] };
}

/**
 * Export the console record. Returns {counts, hits:[{id,count}], excluded:[{path,reason}], needsHumanRead:[...], files}.
 * `rules` from buildRules(loadKnown(file)).
 */
export function exportConsole({ state, out, rules }) {
  if (!isDir(state)) throw new Error(`state dir not found: ${state}`);
  const tally = new Map();
  const S = (v) => scrubJson(v, rules, scrubConsoleText, tally);
  const c = join(state, 'console');
  const threads = readJsonDir(join(c, 'threads'), ID_FILE.threads).map(S);
  const steps = readJsonDir(c, ID_FILE.steps).map(S);
  const proposals = readJsonDir(join(c, 'proposals'), ID_FILE.proposals).map((p) => webpRefs(S(p)));
  const status = readJsonDir(join(state, 'status'), ID_FILE.status).map(S);
  const findings = readJsonDir(join(state, 'findings'), ID_FILE.findings).map(S);
  const incidents = readJsonDir(join(state, 'incidents'), ID_FILE.incidents).map(S);
  const files = [];
  const w = (rel, text) => { const p = join(out, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, text); files.push(rel); };
  for (const [dir, rows, md] of [['threads', threads, threadMd], ['steps', steps, stepMd], ['proposals', proposals, proposalMd]]) {
    for (const r of rows) { w(`${dir}/${r.id}.json`, JSON.stringify(r, null, 2) + '\n'); w(`${dir}/${r.id}.md`, md(r)); }
  }
  w('status.json', JSON.stringify(status, null, 2) + '\n'); w('status.md', statusMd(status));
  w('findings.json', JSON.stringify(findings, null, 2) + '\n'); w('findings.md', findingsMd(findings));
  w('incidents.json', JSON.stringify(incidents, null, 2) + '\n'); w('incidents.md', incidentsMd(incidents));
  const counts = { threads: threads.length, steps: steps.length, proposals: proposals.length, status: status.length, findings: findings.length, incidents: incidents.length };
  const idx = `# Console record\n\nThe study's console record, exported for the public release: the user's and the agents' threads, the user steps, the `
    + `proposals, the status board, the findings board and the incident log. Personal values are replaced by tokens such as \`<user>\`.\n\n`
    + `| record | count |\n|---|---|\n${Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`
    + `Board pages: [status](status.md) · [findings](findings.md) · [incidents](incidents.md)\n`
    + `\n## Threads\n\n| id | title | status | messages |\n|---|---|---|---|\n${threads.map((t) => `| [${t.id}](threads/${t.id}.md) | ${cell(t.title)} | ${cell(t.status)} | ${(t.messages || []).length} |`).join('\n')}\n`
    + `\n## Steps\n\n| id | title | kind | status |\n|---|---|---|---|\n${steps.map((s) => `| [${s.id}](steps/${s.id}.md) | ${cell(s.title)} | ${cell(s.kind)} | ${cell(s.status)} |`).join('\n')}\n`
    + `\n## Proposals\n\n| id | title | state | rev |\n|---|---|---|---|\n${proposals.map((p) => `| [${p.id}](proposals/${p.id}.md) | ${cell(p.title)} | ${cell(p.state)} | ${cell(p.rev)} |`).join('\n')}\n`
    + `\nProposal pictures and videos are a release file (proposal-media.tar); \`npm run init\` unpacks them next to these pages.\n`;
  w('index.md', idx);
  const texts = [];
  for (const t of threads) for (const m of t.messages || []) texts.push({ where: `${t.id} #${m.n}`, record: t.id, by: isUser(m.by) ? 'user' : m.by || '', text: m.text || '' });
  for (const s of steps) if (s.result) texts.push({ where: `${s.id} result`, record: s.id, by: 'user', text: [typeof s.result.value === 'string' ? s.result.value : '', s.result.notes || ''].join('\n') });
  for (const p of proposals) for (const d of p.decisions || []) texts.push({ where: `${p.id} decision rev ${d.rev ?? ''}`, record: p.id, by: isUser(d.who) ? 'user' : d.who || '', text: d.notes || '' });
  for (const p of proposals) texts.push({ where: p.id, record: p.id, by: p.by || '', text: [p.problem, p.idea, p.risk].filter(Boolean).join('\n') });
  for (const f of findings) texts.push({ where: f.id, record: f.id, by: f.by || '', text: [f.title, f.body, f.evidence].filter(Boolean).join('\n') });
  return { counts, hits: tallyToList(tally), excluded: excludedList(state), needsHumanRead: needsHumanRead(texts), files };
}

let RULES = null;
async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.out) { console.error('usage: export-console.mjs --out <dir> [--state <dir>] [--known <file>] [--summary <file>]'); process.exit(2); }
  const { sharedStateDir, mainCheckout } = await import('../lib/paths.mjs');
  refuseInside('export-console.mjs', { '--out': a.out, '--summary': a.summary }, [mainCheckout()]);
  const state = resolve(a.state || sharedStateDir());
  const rules = RULES = buildRules(loadKnown(knownFile(a)));
  const r = exportConsole({ state, out: resolve(a.out), rules });
  if (a.summary) writeFileSync(resolve(a.summary), JSON.stringify(r, null, 2) + '\n');
  console.log(`EXPORTED ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(' ')} -> ${show(resolve(a.out), rules)}`);
  for (const h of r.hits) console.log(`SCRUB ${h.id} ${h.count}`);
  console.log(`EXCLUDED ${r.excluded.length} store entries; NEEDS-HUMAN-READ ${r.needsHumanRead.length}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`export-console: ${show(e.message, RULES)}`); process.exit(1); });

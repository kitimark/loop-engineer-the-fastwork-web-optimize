#!/usr/bin/env node
// Prints the helper-agent prompt for one task and arm: node prompt.mjs <T01..T16|all> <G|S|SO>
// G = text tools only, S = Serena-first, SO = Serena-only (+ Read for line ranges).
import fs from 'node:fs';
const { tasks } = JSON.parse(fs.readFileSync(new URL('../tasks.json', import.meta.url), 'utf8'));
const ARMS = {
  G: 'TOOLS: use only text tools: Grep, Glob, Read, and read-only Bash (grep, rg, sed, awk, wc, `node tools/fix.mjs grep <regex> [file]`, `node tools/fix.mjs show <file> --lines a-b`). Do NOT use or load any mcp__serena__ tool.',
  S: 'TOOLS: Serena-first. Load the Serena symbol tools with ToolSearch query "+serena" and use them first for anything symbol-related (mcp__serena__get_symbols_overview, find_symbol, find_referencing_symbols, find_declaration, find_implementations). Use Grep/Glob/Read/read-only Bash only for what Serena cannot do (strings, CSS, comments) or to read a few lines. Serena paths are relative to the repo root (e.g. site-pretty/_app/immutable/nodes/2.DyWL8TcE.js); Serena line numbers are 0-BASED, so add 1. Minified names repeat: pass relative_path. Skip initial_instructions, list_memories and read_memory. The Serena server is shared: at most 3 Serena calls in parallel.',
  SO: 'TOOLS: Serena only. Load the Serena symbol tools with ToolSearch query "+serena" and answer with them (mcp__serena__get_symbols_overview, find_symbol, find_referencing_symbols, find_declaration, find_implementations). You may use Read only to read a line range you located with Serena; no Grep, Glob or Bash. Serena paths are relative to the repo root; Serena line numbers are 0-BASED, so add 1. Minified names repeat: pass relative_path. Skip initial_instructions, list_memories and read_memory. At most 3 Serena calls in parallel. If Serena cannot answer part of the question, say so.',
};
// Extra arms added by the orchestrated follow-up study (see HANDOFF.md section 6).
//   GR: text first + a written decision rule for when to call Serena (the policy proposed in README "Decision rule").
//   GM / SM: G / S with the project's navigation notes (.serena/memories/hot_code_map.md, serena_usage.md, fixes/TOPICS.md) allowed.
//   GU / SU: G / S on the ORIGINAL minified site/ bundle (Serena ignores site/ by config).
// Arm labels may carry a model suffix (G-haiku): the suffix only labels the run; the model is chosen at spawn time.
const GR_RULE = 'TOOLS: text search first: Grep, Glob, Read, and read-only Bash (grep, rg, sed, awk, wc, `node tools/fix.mjs grep <regex> [file]`, `node tools/fix.mjs show <file> --lines a-b`). Use these for almost everything: strings, CSS, class names, "every line containing X", reading a function body, tooling. You may load Serena (ToolSearch query "+serena") ONLY for two cases. (1) You need to know what a short name or import alias at a call site really is, or which of several same-named functions a call resolves to: call mcp__serena__find_declaration with relative_path = the file of the call site and a regex that captures the name at the call (e.g. `o = (S)\\(i, `). (2) You need every reference to ONE named symbol and you already know its full name path (e.g. `dE`, `mM/y`, `uM/ne() callback/e`): call mcp__serena__find_referencing_symbols with relative_path. Never call find_referencing_symbols on tiny runtime helpers used everywhere (`Ln`, `z`, `s`, `e`, `ne`): it takes 30 s+ on a shared server. Serena line numbers (and the NNNN: prefixes in its snippets) are 0-BASED: add 1, and Read the lines before you rely on them. Skip initial_instructions, list_memories and read_memory.';
const NOTES = 'You MAY read the project navigation notes `.serena/memories/hot_code_map.md`, `.serena/memories/serena_usage.md` and `fixes/TOPICS.md` first (they describe hot code in the prettified bundle); still verify against the code. Do not read any other research/, fixes/ or README docs.';
const NODOCS = 'Answer from the code itself: do not read CLAUDE.md-linked docs such as research/, fixes/, .serena/memories/ or README files.';
export function prompt(t, armLabel) {
  const arm = armLabel.replace(/-haiku$/, '');
  const base = arm.replace(/^(GR)$/, 'G').replace(/^(GM|GU)$/, 'G').replace(/^(SM|SU)$/, 'S');
  const mem = arm === 'GM' || arm === 'SM';
  const minified = arm === 'GU' || arm === 'SU';
  let tools = arm === 'GR' ? GR_RULE : ARMS[base];
  if (minified) tools = tools.replace(/, and read-only Bash \(grep, rg, sed, awk, wc, `node tools\/fix.mjs grep <regex> \[file\]`, `node tools\/fix.mjs show <file> --lines a-b`\)/, ', and read-only Bash (grep, rg, sed, awk, wc, cut, head)');
  if (minified) tools = tools.replace('site-pretty/_app', 'site/_app');
  return [
    t.overlay
      ? `Code-navigation question for this repo: /Users/<user>/source/fastwork-com-web-optimize (main checkout). This question is about a fix agent's OVERLAY copy of a file, which lives under .claude/worktrees/nav-bench/fixes/nb-overlay/overlay/ inside that checkout: answer about that overlay file, not about the baseline copy under site-pretty/ and not about other overlays.`
      : `Code-navigation question for this repo: /Users/<user>/source/fastwork-com-web-optimize (main checkout; ignore copies under .claude/worktrees/).`,
    `READ-ONLY: do not edit/create/delete files, no git state changes, no servers, Chrome, locks or measurements. ${mem ? NOTES : NODOCS}`,
    minified
      ? `site/ holds the ORIGINAL minified bundles: files of one to a few lines, up to hundreds of KB per line, with 1-3 letter names that repeat across scopes. Answer only from site/ (do not use the prettified copy in site-pretty/). Avoid Read on a whole file: a line can be 366 KB; use grep -o with context, cut, or Read with small limits.`
      : `site-pretty/ holds prettified minified bundles (1-3 letter names that repeat across scopes). All line numbers in your answer must be 1-based file lines (as in sed -n / cat -n / the Read tool).`,
    tools,
    `QUESTION (${t.id}): ${t.question}`,
    `Be precise and complete; verify before answering. End with a short answer, then a fenced json block of exactly this shape: ${t.schema}`,
  ].join('\n\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, arm] = process.argv.slice(2);
  for (const t of tasks.filter((t) => id === 'all' || t.id === id)) console.log(`=== ${t.id} ${arm}\n${prompt(t, arm)}\n`);
}

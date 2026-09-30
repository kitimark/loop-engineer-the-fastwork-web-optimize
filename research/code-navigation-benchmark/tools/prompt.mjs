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
export function prompt(t, arm) {
  return [
    `Code-navigation question for this repo: /Users/<user>/source/fastwork-com-web-optimize (main checkout; ignore copies under .claude/worktrees/).`,
    `READ-ONLY: do not edit/create/delete files, no git state changes, no servers, Chrome, locks or measurements. Answer from the code itself: do not read CLAUDE.md-linked docs such as research/, fixes/, .serena/memories/ or README files.`,
    `site-pretty/ holds prettified minified bundles (1-3 letter names that repeat across scopes). All line numbers in your answer must be 1-based file lines (as in sed -n / cat -n / the Read tool).`,
    ARMS[arm],
    `QUESTION (${t.id}): ${t.question}`,
    `Be precise and complete; verify before answering. End with a short answer, then a fenced json block of exactly this shape: ${t.schema}`,
  ].join('\n\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, arm] = process.argv.slice(2);
  for (const t of tasks.filter((t) => id === 'all' || t.id === id)) console.log(`=== ${t.id} ${arm}\n${prompt(t, arm)}\n`);
}

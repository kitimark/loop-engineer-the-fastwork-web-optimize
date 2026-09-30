#!/usr/bin/env node
// Print the enclosing blocks (@media / @supports / @keyframes / selector) of 1-based CSS lines.
//   node research/code-navigation-benchmark/tools/css-context.mjs site-pretty/_app/immutable/assets/2.gBuqKVzi.css 5700 11343
// Brace-depth scan; the pretty CSS has no braces inside strings or comments (checked 2026-10-01).
import fs from 'node:fs';
const [file, ...lines] = process.argv.slice(2);
if (!file || !lines.length) { console.error('usage: css-context.mjs <file.css> <line>...'); process.exit(2); }
const css = fs.readFileSync(file, 'utf8').split('\n');
for (const L of lines.map(Number)) {
  const stack = [];
  for (let i = 0; i < L; i++) for (const ch of css[i]) { if (ch === '{') stack.push(i + 1); else if (ch === '}') stack.pop(); }
  console.log(`${L}: ${css[L - 1].trim()}`);
  for (const n of stack) console.log(`  in ${n}: ${css[n - 1].trim()}`);
}

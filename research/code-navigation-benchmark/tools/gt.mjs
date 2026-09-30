#!/usr/bin/env node
// Ground-truth helper for the code-navigation benchmark (independent of Serena's server,
// though it uses the same TypeScript compiler for `refs`). Needs a `typescript` package:
//   NAV_BENCH_TS=/path/to/node_modules/typescript node gt.mjs <cmd> ...
// Commands (all line numbers 1-based):
//   scope <file> <line>...          enclosing function chain for each line (Serena-style name path)
//   calls <file> <regex>            every call whose callee text matches <regex>, with enclosing chain
//   refs  <file> <line> <name>      TS language-service references of identifier <name> on <line>
//   funcs <file> [minLines]         every function with its name path and 1-based line range
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require(process.env.NAV_BENCH_TS || 'typescript');

const [cmd, file, ...rest] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

function fnName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) return node.name.getText(sf);
  if (ts.isClassDeclaration(node) && node.name) return node.name.text;
  const p = node.parent;
  if (p && ts.isVariableDeclaration(p) && p.initializer === node) return p.name.getText(sf);
  if (p && ts.isPropertyAssignment(p) && p.initializer === node) return p.name.getText(sf);
  if (p && ts.isBinaryExpression(p) && p.right === node) return p.left.getText(sf).slice(0, 30);
  if (p && ts.isCallExpression(p)) return `${p.expression.getText(sf).slice(0, 30)}() callback`;
  if (p && ts.isParenthesizedExpression(p)) return '(iife)';
  return '<anon>';
}
const isFn = (n) => ts.isFunctionLike(n) && (n.body !== undefined || ts.isArrowFunction(n)) || ts.isClassDeclaration(n);

function chainAt(pos) {
  const out = [];
  (function visit(n) {
    if (pos < n.getStart(sf) || pos >= n.getEnd()) return;
    if (n !== sf && isFn(n)) out.push(`${fnName(n)}@${lineOf(n.getStart(sf))}`);
    ts.forEachChild(n, visit);
  })(sf);
  return out.join(' / ') || '<module>';
}

if (cmd === 'scope') {
  for (const l of rest) {
    const pos = sf.getPositionOfLineAndCharacter(Number(l) - 1, 0);
    const lineText = text.split('\n')[Number(l) - 1];
    const col = lineText.search(/\S/);
    console.log(`${l}\t${chainAt(pos + Math.max(col, 0))}`);
  }
} else if (cmd === 'calls') {
  const re = new RegExp(rest[0]);
  (function visit(n) {
    if (ts.isCallExpression(n) && re.test(n.expression.getText(sf)))
      console.log(`${lineOf(n.getStart(sf))}\t${n.expression.getText(sf).slice(0, 60)}\t${chainAt(n.getStart(sf))}`);
    ts.forEachChild(n, visit);
  })(sf);
} else if (cmd === 'funcs') {
  const min = Number(rest[0] || 0);
  (function visit(n) {
    if (n !== sf && isFn(n)) {
      const a = lineOf(n.getStart(sf)), b = lineOf(n.getEnd());
      if (b - a + 1 >= min) console.log(`${a}-${b}\t${chainAt(n.getStart(sf) + 0)}`);
    }
    ts.forEachChild(n, visit);
  })(sf);
} else if (cmd === 'refs') {
  const [l, name] = rest;
  const abs = path.resolve(file);
  const host = {
    getScriptFileNames: () => [abs], getScriptVersion: () => '1',
    getScriptSnapshot: (f) => fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined,
    getCurrentDirectory: () => process.cwd(), getCompilationSettings: () => ({ allowJs: true, noResolve: true }),
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o), fileExists: fs.existsSync, readFile: (f) => fs.readFileSync(f, 'utf8'),
  };
  const ls = ts.createLanguageService(host);
  const lineText = text.split('\n')[Number(l) - 1];
  const m = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).exec(lineText);
  if (!m) throw new Error(`name ${name} not on line ${l}`);
  const pos = sf.getPositionOfLineAndCharacter(Number(l) - 1, m.index);
  for (const r of ls.getReferencesAtPosition(abs, pos) || []) {
    const ln = lineOf(r.textSpan.start);
    console.log(`${ln}\t${r.isWriteAccess ? 'W' : 'R'}\t${chainAt(r.textSpan.start)}\t${text.split('\n')[ln - 1].trim().slice(0, 90)}`);
  }
}

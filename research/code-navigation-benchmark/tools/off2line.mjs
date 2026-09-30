#!/usr/bin/env node
// Map character offsets in a minified mirror file (site/…, as quoted in research traces, e.g. "iE @75155")
// to the 1-based line in its prettified copy (site-pretty/…). Run in the main checkout (or set FW_MIRROR_HOME).
//   node research/code-navigation-benchmark/tools/off2line.mjs _app/immutable/nodes/2.DyWL8TcE.js 75155 343804
// Both files are reduced to a skeleton of identifier/number characters (Prettier only changes whitespace,
// parentheses and punctuation), then a 40-char skeleton window at the offset is located in the pretty copy.
import fs from 'node:fs';
import path from 'node:path';
const [rel, ...offs] = process.argv.slice(2);
if (!rel || !offs.length) { console.error('usage: off2line.mjs <path under site/> <offset>...'); process.exit(2); }
const home = process.env.FW_MIRROR_HOME || process.cwd();
const min = fs.readFileSync(path.join(home, 'site', rel), 'utf8');
const pretty = fs.readFileSync(path.join(home, 'site-pretty', rel), 'utf8');
const keep = /[A-Za-z0-9_$]/;
let sk = ''; const map = []; let line = 1;
for (const c of pretty) { if (c === '\n') line++; if (keep.test(c)) { sk += c; map.push(line); } }
for (const off of offs.map(Number)) {
  let w = ''; for (let i = off; i < min.length && w.length < 40; i++) if (keep.test(min[i])) w += min[i];
  const at = sk.indexOf(w), again = at >= 0 ? sk.indexOf(w, at + 1) : -1;
  console.log(`${off}\t${at < 0 ? 'not found' : `line ${map[at]}${again >= 0 ? ' (ambiguous: first match)' : ''}`}`);
}

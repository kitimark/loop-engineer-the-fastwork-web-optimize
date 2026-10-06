#!/usr/bin/env node
// v10 code parity (int-v8): the changed lines of C -> V must be exactly the union of the stacked deltas' changed lines.
// Per file, the multiset of removed lines and the multiset of added lines of `diff -U0 C V` are compared with the
// multisets of the deltas' own -/+ lines (context ignored, so line offsets don't matter). 0 differences = parity.
//   node fixes/v10/codeparity.mjs <C dir> <V dir> <delta.diff> [<delta.diff> ...]
// exit 0 parity, 1 differences, 2 usage
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [cDir, vDir, ...deltas] = process.argv.slice(2);
if (!cDir || !vDir || !deltas.length) { console.error('usage: codeparity.mjs <C dir> <V dir> <delta.diff>...'); process.exit(2); }

// unified diff text -> { file: { '-': Map(line -> n), '+': Map(line -> n) } }
function changed(text, into = {}) {
  let file = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).split('\t')[0].replace(/^b\//, ''); into[file] ||= { '-': new Map(), '+': new Map() }; continue; }
    if (l.startsWith('--- ') || l.startsWith('@@') || !file) continue;
    const k = l[0];
    if (k !== '-' && k !== '+') continue;
    const m = into[file][k]; m.set(l.slice(1), (m.get(l.slice(1)) || 0) + 1);
  }
  return into;
}
const want = {};
for (const d of deltas) changed(readFileSync(d, 'utf8'), want);
let bad = 0;
const files = Object.keys(want).sort();
for (const f of files) {
  const r = spawnSync('diff', ['-U0', '--label', `a/${f}`, '--label', `b/${f}`, join(cDir, f), join(vDir, f)], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status > 1) { console.error(`diff failed on ${f}: ${r.stderr}`); process.exit(2); }
  const got = changed(r.stdout)[f] || { '-': new Map(), '+': new Map() };
  const out = [];
  for (const k of ['-', '+']) {
    const a = want[f][k], b = got[k];
    let n = 0, diffs = 0;
    for (const [line, c] of a) { n += c; if ((b.get(line) || 0) !== c) { diffs++; if (diffs <= 3) console.log(`  ${f} ${k} deltas x${c}, C->V x${b.get(line) || 0}: ${line.slice(0, 120)}`); } }
    for (const [line, c] of b) if (!a.has(line)) { diffs++; if (diffs <= 3) console.log(`  ${f} ${k} only in C->V x${c}: ${line.slice(0, 120)}`); }
    bad += diffs;
    out.push(`${k}${n} (${diffs} differences)`);
  }
  console.log(`${f}: ${out.join(', ')}`);
}
console.log(bad ? `CODE PARITY FAIL: ${bad} differences` : `CODE PARITY ok: 0 differences over ${files.length} files`);
process.exit(bad ? 1 : 0);

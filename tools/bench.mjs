#!/usr/bin/env node
// Automated per-topic benchmarks (research/architecture/automated-benchmarks.md; fixes/README.md
// Definition of done items 7a and 8). Each done topic commits a data-only fixes/<topic>/bench.json.
//
//   node tools/bench.mjs lint [<topic>...]            # schema + "no code" lint of fixes/*/bench.json (in npm test)
//
// Exit codes: 0 pass, 1 a check failed / REGRESSED / lint errors, 2 usage, 3 INCONCLUSIVE / FLAKY / BASELINE-CHANGED.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './lib/paths.mjs';
import { lintTopic } from './lib/bench-spec.mjs';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const VALUED = [];
const pos = own.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(own[i - 1])));
const [cmd, ...args] = pos;
const FIXES = join(REPO, 'fixes');

/** Topics with a fixes/<topic>/bench.json in this checkout. */
function benchTopics(dir = FIXES) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => !d.startsWith('_') && statSync(join(dir, d)).isDirectory() && existsSync(join(dir, d, 'bench.json'))).sort();
}

function cmdLint(topics) {
  const list = topics.length ? topics : benchTopics();
  if (!list.length) { console.log('no fixes/*/bench.json yet'); return 0; }
  let bad = 0;
  for (const t of list) {
    const r = lintTopic(FIXES, t);
    if (r.errors.length) { bad++; console.log(`FAIL ${t}\n  ${r.errors.join('\n  ')}`); }
    else console.log(`OK   ${t}${r.warnings.length ? `\n  warning: ${r.warnings.join('\n  warning: ')}` : ''}`);
  }
  return bad ? 1 : 0;
}

const cmds = { lint: () => cmdLint(args) };
if (!cmd || !cmds[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(cmd ? 2 : 0);
}
Promise.resolve(cmds[cmd]()).then((c) => process.exit(c ?? 0), (e) => { console.error(e.stack || e); process.exit(1); });

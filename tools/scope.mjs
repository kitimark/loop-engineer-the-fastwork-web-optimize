#!/usr/bin/env node
// Scope guard (incident I-021; library tools/lib/scope.mjs). Fails when this branch changed the shared
// tooling (tools/, tests/, package.json, .githooks/, .claude/ except agents/) since its merge-base with
// main, counting committed, staged, unstaged and untracked paths. `npm run test:unit` runs it before the
// unit tests: roles that never change tooling run that instead of the full `npm test`.
//
//   node tools/scope.mjs [--base <ref>] [--dir <checkout>] [--tooling]      (npm run test:scope)
//     --dir: check another checkout, e.g. a reviewer checking a fix owner's worktree (default: cwd)
//   FW_TOOLING=1 node tools/scope.mjs                    # same as --tooling: a toolsmith branch opts out
//
// Prints SCOPE OK | SCOPE TOOLING-ALLOWED (stdout) or SCOPE TOOLING (stderr, with the paths and what to do).
// Exit codes: 0 clean or tooling explicitly allowed, 1 tooling changed, 2 usage or git error (e.g. no base).
import { checkScope, formatScope } from './lib/scope.mjs';

const argv = process.argv.slice(2);
let base = 'main';
let dir = process.cwd();
let tooling = process.env.FW_TOOLING === '1';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--tooling') tooling = true;
  else if (a === '--base') base = argv[++i];
  else if (a.startsWith('--base=')) base = a.slice(7);
  else if (a === '--dir') dir = argv[++i];
  else if (a.startsWith('--dir=')) dir = a.slice(6);
  else if (a === '-h' || a === '--help') { console.log('usage: node tools/scope.mjs [--base <ref>] [--dir <checkout>] [--tooling]   (FW_TOOLING=1 = --tooling)'); process.exit(0); }
  else { console.error(`scope.mjs: unknown argument ${a}`); process.exit(2); }
}
if (!base || !dir) { console.error('scope.mjs: --base and --dir need a value'); process.exit(2); }

let r;
try { r = checkScope({ cwd: dir, base, tooling }); } catch (e) { console.error(`scope.mjs: ${e.message}`); process.exit(2); }
if (r.ok) console.log(formatScope(r));
else console.error(formatScope(r));
process.exit(r.ok ? 0 : 1);

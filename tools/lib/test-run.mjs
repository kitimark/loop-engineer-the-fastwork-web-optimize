// The test suite runner's pure parts (tools/test-run.mjs, user T-105 #2, ts-testspeed; research/architecture/test-speed.md).
//
// 1. Order: `node --test` sorts the files by name, so the slowest e2e files (sim*, wait-cli, ...) started late and set the
//    wall time. The runner gives node:test's run() the files longest first (LPT scheduling), from the per-file seconds
//    in tests/durations.json; a file without an entry counts as DEFAULT_SEC.
// 2. Changed files (`npm run test:changed`, iteration only; the pre-commit hook and landing run the full suite): the
//    test files that reference a changed tools/ file, directly or through the tools that import or start it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const SUITE_DIRS = ['tests/unit', 'tests/e2e', 'tests/hooks'];
export const DURATIONS_FILE = 'tests/durations.json';
/** Seconds assumed for a test file not in tests/durations.json (a new file is usually small). */
export const DEFAULT_SEC = 3;
/** Changes that can affect any test: the whole suite runs. */
const EVERYTHING = [/^tests\/helpers\.mjs$/, /^package\.json$/, /^tools\/lib\/paths\.mjs$/];

/** The full suite: repo-relative paths of tests/{unit,e2e,hooks}/*.test.mjs, by name. */
export function listSuite(repo) {
  return SUITE_DIRS.flatMap((d) => (existsSync(join(repo, d)) ? readdirSync(join(repo, d)).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `${d}/${f}`) : []));
}

/** {file: seconds} from a durations file (tests/durations.json); {} when missing or unreadable. */
export function readDurations(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')).files || {}; } catch { return {}; }
}

/** Longest first (estimated seconds, unknown = DEFAULT_SEC); ties by name, so the order is stable. */
export function orderLongestFirst(files, durations = {}, defaultSec = DEFAULT_SEC) {
  const est = (f) => (Number.isFinite(durations[f]) ? durations[f] : defaultSec);
  return [...files].sort((a, b) => est(b) - est(a) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A greedy list schedule of `files` (in the given order) on `slots` parallel slots: the predicted wall time in seconds,
 * as node:test's run() does it (the next file starts when a slot frees). Used by `--plan` and the tests.
 */
export function predictWall(files, durations = {}, slots = 6, defaultSec = DEFAULT_SEC) {
  const free = Array(Math.max(1, slots)).fill(0);
  for (const f of files) {
    const i = free.indexOf(Math.min(...free));
    free[i] += Number.isFinite(durations[f]) ? durations[f] : defaultSec;
  }
  return Math.max(...free);
}

/** Per-file seconds from node:test events: the sum of the file's top-level test durations (a file runs them in order). */
export function fileSeconds(events) {
  const out = {};
  for (const e of events) {
    if (e.nesting !== 0 || !e.file || !e.details || !Number.isFinite(e.details.duration_ms)) continue;
    out[e.file] = (out[e.file] || 0) + e.details.duration_ms / 1000;
  }
  return out;
}

const QUOTED = /['"`]([^'"`\s]*?([\w.-]+\.(?:mjs|js|html|css)))['"`]/g;
/** Base names a source text names in quotes (imports, `tool('lock.mjs')`, `join(TOOLS, 'lib', 'x.mjs')`, spawned tools). */
export function namedFiles(text) {
  const s = new Set();
  for (const m of text.matchAll(QUOTED)) s.add(m[2]);
  return s;
}

/**
 * The tools/ files that depend on `changed` (repo-relative tools/ paths), including themselves: a file depends on
 * another when it names its base name in quotes (an import, or a tool it starts), transitively. Over-inclusive on
 * purpose (tools/lock.mjs and tools/lib/lock.mjs share a base name): this lane only picks what to run first.
 * `sources`: {toolsPath: text}.
 */
export function dependents(changed, sources) {
  const names = new Map(Object.entries(sources).map(([p, t]) => [p, namedFiles(t)]));
  const hit = new Set(changed);
  for (let grew = true; grew;) {
    grew = false;
    const bases = new Set([...hit].map((p) => basename(p)));
    for (const [p, ns] of names) if (!hit.has(p) && [...ns].some((n) => bases.has(n))) { hit.add(p); grew = true; }
  }
  return hit;
}

/**
 * Which suite files to run for the changed paths. Returns {all: true, why} when a change can affect every test
 * (tests/helpers.mjs, package.json, tools/lib/paths.mjs), else {all: false, files: [...] (by name), why: {file: reason}}.
 * Changed suite files run themselves; a changed tools/ file or test fixture runs every suite file that names it or a
 * tools/ file depending on it. `toolSources` {toolsPath: text}, `testSources` {suiteFile: text}.
 */
export function testsForChanges(changed, { suite, toolSources, testSources }) {
  const every = changed.find((p) => EVERYTHING.some((re) => re.test(p)));
  if (every) return { all: true, why: `${every} changed` };
  const why = {};
  for (const p of changed) if (suite.includes(p)) why[p] = 'changed';
  const tools = changed.filter((p) => p.startsWith('tools/'));
  const fixtures = changed.filter((p) => p.startsWith('tests/') && !suite.includes(p));
  const deps = dependents(tools, toolSources);
  const byBase = new Map();
  for (const p of [...deps, ...fixtures]) { const b = basename(p); if (!byBase.has(b)) byBase.set(b, p); }
  for (const f of suite) {
    if (why[f]) continue;
    const ns = namedFiles(testSources[f] || '');
    const via = [...byBase.keys()].find((b) => ns.has(b));
    if (via) why[f] = `names ${byBase.get(via)}`;
  }
  return { all: false, files: suite.filter((f) => why[f]), why };
}

/** Read every tools/ source text (for dependents()): {repo-relative path: text}. */
export function readToolSources(repo) {
  const out = {};
  const walk = (rel) => {
    for (const e of readdirSync(join(repo, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|html|css)$/.test(e.name)) out[p] = readFileSync(join(repo, p), 'utf8');
    }
  };
  walk('tools');
  return out;
}

// cli.mjs: shared argument parsing and default paths for the medium-check scripts.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourcesConfig, SourcesError, DEFAULT_MODE, MAP_FILE } from './sources.mjs';

export const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(HERE, '..', '..', '..');
export const DEFAULT_ARTICLE = join(REPO, 'research', 'team-article', 'artifacts', 'sixteen-milliseconds', 'index.html');
export const DEFAULT_CLIPS = join(REPO, 'research', 'article-clips', 'cf-stream-links.tsv');

/** The main checkout (out/ lives there for the owner); this checkout when git can't tell. */
export function mainCheckout() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? dirname(r.stdout.trim()) : REPO;
}

/** Default kit folder: this checkout's out/article/medium-kit, else the main checkout's; null when neither exists. */
export function defaultKit() {
  for (const base of [REPO, mainCheckout()]) {
    const d = join(base, 'out', 'article', 'medium-kit');
    if (existsSync(d)) return d;
  }
  return null;
}

export function parseArgs(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, inlineV] = a.slice(2).split(/=(.*)/s);
    if (!(k in spec)) throw new UsageError(`unknown option --${k}`);
    if (spec[k] === 'bool') out[k] = true;
    else {
      const v = inlineV !== undefined ? inlineV : argv[++i];
      if (v === undefined) throw new UsageError(`--${k} needs a value`);
      out[k] = v;
    }
  }
  return out;
}

export class UsageError extends Error {}

// ---- the sources mode (lib/sources.mjs), shared by build.mjs, check.mjs, model.mjs and changes.mjs ----------------
// --sources none|github|artifact (default none), --github-base <url> (github), --sources-map <json> (github)
export const SOURCES_SPEC = { sources: 'v', 'github-base': 'v', 'sources-map': 'v' };
export function sourcesFromArgs(o, key = 'sources') {
  if (o['sources-map'] && !existsSync(o['sources-map'])) throw new UsageError(`sources map not found: ${o['sources-map']}`);
  try {
    return sourcesConfig({ mode: o[key] || DEFAULT_MODE, base: o['github-base'] || null, map: o['sources-map'] || MAP_FILE });
  } catch (e) {
    if (e instanceof SourcesError) throw new UsageError(e.message.replace('--sources', '--' + key));
    throw e;
  }
}

/** --help: print the header comment of the calling script (the lines starting with //) and exit 0. */
export function helpIfAsked(url, argv) {
  if (!argv.includes('--help') && !argv.includes('-h')) return;
  const src = readFileSync(fileURLToPath(url), 'utf8').split('\n');
  const lines = [];
  for (const l of src) { if (l.startsWith('#!')) continue; if (!l.startsWith('//')) break; lines.push(l.replace(/^\/\/ ?/, '')); }
  console.log(lines.join('\n'));
  process.exit(0);
}

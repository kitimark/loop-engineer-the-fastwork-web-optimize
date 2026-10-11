#!/usr/bin/env node
// model.mjs: print the article model (JSON) of the article page or of a Medium story.
//
// Usage (from the repo root):
//   node research/team-article/medium-check/model.mjs [article.html] [--kit <dir|none>] [--clips <tsv>] [--out <file>]
//   node research/team-article/medium-check/model.mjs --dump <medium-dump.json> [--out <file>]
//   node research/team-article/medium-check/model.mjs --html <saved Medium page.html> [--out <file>]
//   --summary   print counts and the first lines instead of the whole JSON
//   --sources none|github|artifact   the Medium sources mode (lib/sources.mjs; default none: no Sources section, no
//               source references); github needs --github-base <url> (and takes --sources-map <json>); artifact =
//               the page as it is (the Claude artifact)
// The article page defaults to research/team-article/artifacts/sixteen-milliseconds/index.html, the kit to
// out/article/medium-kit (this checkout, else the main checkout). The model: { title, subtitle, byline, disclaimer[],
// blocks[] } with blocks {kind: p|heading|li|quote|hr|picture|clip, text (normalized), ...}; pictures carry
// n, file, caption, alt; clips n, uid, params, url, caption (lib/article.mjs has the rules). Exit 0, 2 on usage.
import { writeFileSync, existsSync } from 'node:fs';
import { extractArticleFile } from './lib/article.mjs';
import { readDumpFile, readHtmlFile } from './lib/medium.mjs';
import { parseArgs, helpIfAsked, UsageError, DEFAULT_ARTICLE, DEFAULT_CLIPS, defaultKit, SOURCES_SPEC, sourcesFromArgs } from './lib/cli.mjs';

const argv = process.argv.slice(2);
helpIfAsked(import.meta.url, argv);
try {
  const o = parseArgs(argv, { kit: 'v', clips: 'v', out: 'v', dump: 'v', html: 'v', summary: 'bool', ...SOURCES_SPEC });
  const sources = sourcesFromArgs(o);
  let m;
  if (o.dump) m = readDumpFile(o.dump);
  else if (o.html) m = readHtmlFile(o.html);
  else {
    const file = o._[0] || DEFAULT_ARTICLE;
    if (!existsSync(file)) throw new UsageError(`not found: ${file}`);
    const kit = o.kit === 'none' ? null : (o.kit || defaultKit());
    m = extractArticleFile(file, { kit, clips: o.clips || (existsSync(DEFAULT_CLIPS) ? DEFAULT_CLIPS : null), sources });
  }
  if (o.summary) {
    const counts = {};
    for (const b of m.blocks) counts[b.kind] = (counts[b.kind] || 0) + 1;
    console.log(JSON.stringify({ source: m.source, title: m.title, subtitle: m.subtitle, byline: m.byline, disclaimer: m.disclaimer.length, counts, warnings: m.warnings, kit: m.kit ? { from: m.kit.from, stale: m.kit.stale, sources: m.kit.sources } : null,
      sources: m.sources ? { mode: m.sources.mode, footer: m.sources.footer, removed: m.sources.removed, linked: m.sources.linked, changed: m.sources.changed.length, inPicture: m.sources.inPicture.length } : undefined,
      medium: m.medium || undefined }, null, 1));
  } else {
    const text = JSON.stringify(m, (k, v) => (k === 'areaHtml' ? undefined : v), 1);
    if (o.out) writeFileSync(o.out, text + '\n'); else console.log(text);
  }
  process.exit(0);
} catch (e) {
  console.error(e instanceof UsageError ? `usage: ${e.message} (see --help)` : `error: ${e.message}`);
  process.exit(2);
}

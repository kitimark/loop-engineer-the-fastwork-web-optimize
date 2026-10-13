#!/usr/bin/env node
// check.mjs: prove that a Medium story matches the article page, block by block.
//
// Usage (from the repo root):
//   node research/team-article/medium-check/check.mjs --dump <medium-dump.json>     # from medium-dump.js (draft or post)
//   node research/team-article/medium-check/check.mjs --html <saved-page.html>      # a saved Medium page
//   node research/team-article/medium-check/check.mjs --url <https://medium.com/...> # the published post, if public
// Options:
//   --article <html>   the article page (default research/team-article/artifacts/sixteen-milliseconds/index.html)
//   --kit <dir|none>   the Medium kit, for the alt text the owner pasted (default out/article/medium-kit of this
//                      checkout, else of the main checkout); "none" uses the article's alt rule without layout
//   --clips <tsv>      the Stream clip table (default research/article-clips/cf-stream-links.tsv)
//   --list             also print every picture and clip with its state
//   --json             print the result as JSON instead of the report
//   --model-out <f>    write the Medium side as an article model (JSON) to <f>
//   --no-links         don't compare link targets
//   --strict-alt       count alt text cut at Medium's limit as a difference (default: a note)
//   --allow-unproven   an embed whose Stream address is not visible, or whose loop/autoplay/muted are not visible,
//                      is a note instead of a difference
//   --sources <mode>   the Medium sources mode (lib/sources.mjs): none (default: no Sources section and no source
//                      references in Medium), github (--github-base <url>, --sources-map <json>: references link to
//                      GitHub), github-inline (the same links, no Sources section), artifact (the page as it is, as in
//                      kits built before the switch). A kit built in
//                      another mode (kit.json "sources") is a WARN line; its captions then show as KIT differences.
// What it checks: title, subtitle and the disclaimer lines exactly (after normalizing quotes, dashes, spaces);
// every block in order (missing, extra, moved, changed text as a short word diff, heading level, quote kind, list
// kind, link targets); every picture in order with its caption and alt text (pictures are re-encoded by Medium, so
// they are matched by order, caption and alt, never by bytes); every clip embedded with the right Stream uid and
// loop/autoplay/muted; no leftover kit markers ("[PICTURE", "[CLIP", "Caption:", a Stream link left as text).
// The last line is CHECK CLEAN or CHECK FAIL <n> differences. Exit 0 clean, 1 differences, 2 usage or bad input.
// --url fetches one public page with no cookies and no personal headers; nothing else goes over the network.
import { writeFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import { extractArticleFile } from './lib/article.mjs';
import { readDumpFile, readHtmlFile, readDump, dumpFromHtml, publicUrlOk } from './lib/medium.mjs';
import { compareModels } from './lib/compare.mjs';
import { parseArgs, helpIfAsked, UsageError, DEFAULT_ARTICLE, DEFAULT_CLIPS, REPO, defaultKit, SOURCES_SPEC, sourcesFromArgs } from './lib/cli.mjs';
import { modeLabel } from './lib/sources.mjs';

const SPEC = { dump: 'v', html: 'v', url: 'v', article: 'v', kit: 'v', clips: 'v', list: 'bool', json: 'bool', 'model-out': 'v',
  'no-links': 'bool', 'strict-alt': 'bool', 'allow-unproven': 'bool', ...SOURCES_SPEC };

export async function run(argv, io = { log: console.log }) {
  const o = parseArgs(argv, SPEC);
  const inputs = ['dump', 'html', 'url'].filter((k) => o[k]);
  if (inputs.length !== 1) throw new UsageError('give exactly one of --dump, --html or --url');
  const articleFile = o.article || DEFAULT_ARTICLE;
  if (!existsSync(articleFile)) throw new UsageError(`article not found: ${articleFile}`);
  const kit = o.kit === 'none' ? null : (o.kit || defaultKit());
  if (o.kit && o.kit !== 'none' && !existsSync(o.kit)) throw new UsageError(`kit folder not found: ${o.kit}`);
  const clips = o.clips || (existsSync(DEFAULT_CLIPS) ? DEFAULT_CLIPS : null);
  const sources = sourcesFromArgs(o);
  const src = extractArticleFile(articleFile, { kit, clips, sources });
  src.sourcesLabel = modeLabel(sources);

  let med;
  try {
    if (o.dump) med = readDumpFile(o.dump);
    else if (o.html) med = readHtmlFile(o.html, { host: null });
    else {
      if (!publicUrlOk(o.url)) throw new UsageError('--url must be a plain https address without query string or credentials');
      const res = await fetch(o.url, { redirect: 'follow', credentials: 'omit', headers: { accept: 'text/html' } });
      if (!res.ok) throw new UsageError(`fetch ${new URL(o.url).host}: HTTP ${res.status} (Medium may refuse plain fetches; save the page or use medium-dump.js)`);
      med = readDump(dumpFromHtml(await res.text(), { host: new URL(o.url).host, page: 'published' }), { source: o.url });
    }
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(`can't read the Medium side: ${e.message}`);
  }
  if (o['model-out']) writeFileSync(o['model-out'], JSON.stringify(med, null, 1));
  const r = compareModels(src, med, { noLinks: !!o['no-links'], strictAlt: !!o['strict-alt'], allowUnproven: !!o['allow-unproven'] });
  if (o.json) { io.log(JSON.stringify({ clean: r.issues.length === 0, sources: src.sourcesLabel, stats: r.stats, issues: r.issues, notes: r.notes, medium: med.medium, kit: src.kit, warnings: [...src.warnings, ...med.warnings] }, null, 1)); return r.issues.length ? 1 : 0; }
  report(src, med, r, o, io);
  return r.issues.length ? 1 : 0;
}

function report(src, med, r, o, io) {
  const L = io.log;
  const m = med.medium || {};
  const rel = (p) => (p && p.startsWith(REPO + '/') ? relative(REPO, p) : p);
  L(`medium-check: article ${rel(src.source)}`);
  L(`  vs Medium ${rel(med.source)} (${m.page || '?'} page, ${m.mode || '?'} markup, root ${m.root || '?'}${m.takenAt ? ', taken ' + m.takenAt : ''})`);
  L(`  alt text from ${src.kit ? 'the kit (' + rel(src.kit.dir) + '/' + src.kit.from + ')' : 'the article (no kit: static rule)'}`);
  L(`  sources mode ${src.sourcesLabel}${src.kit ? ' (kit: ' + (src.kit.sources || 'not recorded') + ')' : ''}${src.sources ? `: ${src.sources.removed} reference(s) removed, ${src.sources.linked} linked, Sources section ${src.sources.footer}` : ''}`);
  if (m.transfer) L(m.transfer.line);
  for (const w of [...src.warnings.map((x) => 'article: ' + x), ...med.warnings.map((x) => 'Medium: ' + x)]) L('WARN ' + w);
  const by = (t) => r.issues.filter((i) => i.type === t).length;
  const s = r.stats;
  const discl = src.disclaimer.length;
  L('');
  L(`HEADER    title ${by('TITLE') ? 'DIFFERS' : 'OK'} · subtitle ${by('SUBTITLE') ? 'DIFFERS' : 'OK'} · disclaimer ${discl - Math.min(discl, by('DISCLAIMER'))}/${discl} OK`);
  L(`BLOCKS    article ${s.article}, Medium ${s.medium}: ${s.matched} paired, ${s.missing} missing, ${s.extra} extra, ${s.moved} moved, ${by('TEXT')} text changed, ${by('KIND') + by('LEVEL') + by('PULL') + by('LIST')} kind/level`);
  L(`PICTURES  article ${s.pictures.article}, Medium ${s.pictures.medium}: ${s.pictures.ok} fully OK · captions ${by('CAPTION')} differ (pictures and clips) · alt ${by('ALT')} differ, ${r.notes.filter((n) => n.type === 'ALT-CUT').length + by('ALT-CUT')} cut at Medium's limit · images ${by('IMAGE')} missing`);
  L(`CLIPS     article ${s.clips.article}, Medium ${s.clips.medium}: ${s.clips.ok} fully OK · wrong uid ${by('CLIP-UID')} · params ${by('CLIP-PARAMS') + by('CLIP-PARAMS?')} · not provable ${by('CLIP-UNPROVEN')}`);
  L(`MARKERS   ${by('MARKER') ? by('MARKER') + ' leftover kit marker(s)' : 'none'}`);
  if (o.list) {
    L('');
    L('--- pictures and clips in article order ---');
    const pairOf = new Map([...r.pairs, ...r.moves.map((x) => [x[0], x[1]])]);
    for (const a of src.blocks.filter((b) => b.kind === 'picture' || b.kind === 'clip')) {
      const j = pairOf.get(a.i);
      const where = a.kind === 'picture' ? `Picture ${a.n} ${a.file}` : `Clip ${a.n} ${a.uid}`;
      const mine = r.issues.filter((i) => i.where.startsWith(a.kind === 'picture' ? `Picture ${a.n} ` : `Clip ${a.n}`));
      L(`${j === undefined ? 'MISSING ' : mine.length ? 'DIFFERS ' : 'OK      '} ${where}${j !== undefined ? ` -> Medium #${med.blocks[j].n || '?'}` : ''}${mine.length ? ' (' + mine.map((i) => i.type).join(', ') + ')' : ''}`);
    }
  }
  if (r.issues.length) {
    L('');
    L('--- differences ---');
    for (const i of r.issues) L(`${i.type.padEnd(13)} ${i.where}: ${i.detail}`);
  }
  if (r.notes.length) {
    L('');
    L('--- notes (not counted) ---');
    for (const n of r.notes) L(`${n.type.padEnd(13)} ${n.where}: ${n.detail}`);
  }
  L('');
  L(r.issues.length ? `CHECK FAIL ${r.issues.length} differences` : 'CHECK CLEAN');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/check.mjs')) {
  const argv = process.argv.slice(2);
  helpIfAsked(import.meta.url, argv);
  run(argv).then((code) => process.exit(code), (e) => {
    console.error(e instanceof UsageError ? `usage: ${e.message} (see --help)` : `error: ${e.stack || e.message}`);
    process.exit(2);
  });
}

#!/usr/bin/env node
// changes.mjs: what to change in Medium after the article page changed, as a to-do list.
//
// Usage (from the repo root):
//   node research/team-article/medium-check/changes.mjs <old.html> <new.html>
//   node research/team-article/medium-check/changes.mjs --from 105        # versions/p1-v105.html -> index.html
//   node research/team-article/medium-check/changes.mjs --from 104 --to 105
// Options: --json (the list as JSON), --dir <article folder> (default research/team-article/artifacts/sixteen-milliseconds)
//   --sources none|github|artifact   the Medium sources mode of both versions (lib/sources.mjs; default none: no
//                      Sources section and no source references); github takes --github-base <url>, --sources-map
//   --from-sources <mode>            the mode the OLD side is in Medium, when it differs: e.g. the draft pasted from
//                      a kit with sources, now going to none:  changes.mjs --from 109 --to 109 --from-sources artifact
//
// It reads both pages into the article model (lib/article.mjs), pairs their blocks in order (lib/compare.mjs) and
// prints one line per edit in story order: "Day 5 · Sun 4 Oct, paragraph 3 ("It started..."): change text: ...
// [-old-] {+new+} ...", "add paragraph after ...", "delete ...", "Picture 05 (05-fig-4.png): re-upload ...",
// "Clip 03: replace the embed ...". Then it says which kit pictures must be rebuilt: a captured picture is rebuilt
// when the HTML inside its .cap-area changed (or it is new); a copied picture when its src or size changed. If the
// page's <style> or <script> changed, every captured picture may look different although its HTML did not: the
// list says so and asks for a full rebuild. Exit 0 (also when there is nothing to do), 2 on usage errors.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractArticle } from './lib/article.mjs';
import { align, findMoves, kindName } from './lib/compare.mjs';
import { wordDiff, clip } from './lib/text.mjs';
import { parseHTML, findAll, isTag } from './lib/html.mjs';
import { parseArgs, helpIfAsked, UsageError, DEFAULT_ARTICLE, SOURCES_SPEC, sourcesFromArgs } from './lib/cli.mjs';
import { modeLabel } from './lib/sources.mjs';
import { dirname } from 'node:path';

const where = (b) => {
  if (!b) return 'at the top';
  if (b.kind === 'picture') return `Picture ${b.n} (${b.file})`;
  if (b.kind === 'clip') return `Clip ${b.n}`;
  const sec = b.section && b.section !== '(top)' ? b.section.replace(/:.*$/, '') + ', ' : '';
  if (b.kind === 'heading') return `${b.level === 1 ? 'heading' : 'subheading'} "${clip(b.text, 50)}"`;
  if (b.kind === 'hr') return `${sec}separator`;
  return `${sec}${kindName(b)} ${b.nth} ("${clip(b.text, 40)}")`;
};
const what = (b) => (b.kind === 'picture' ? `picture ${b.file}` : b.kind === 'clip' ? `clip (${b.url})` : b.kind === 'hr' ? 'separator' : `${kindName(b)}: "${b.text}"`);
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// the page-wide things a captured picture depends on besides its own HTML
function pageAssets(html) {
  const doc = parseHTML(html);
  const styles = findAll(doc, isTag('style')).map((e) => squash(e.textContent)).join('\n');
  const sheets = findAll(doc, (e) => e.localName === 'link' && /stylesheet/i.test(e.getAttribute('rel') || '')).map((e) => e.getAttribute('href')).join('\n');
  const scripts = findAll(doc, isTag('script')).map((e) => squash(e.textContent)).join('\n');
  return { styles: styles + '\n' + sheets, scripts };
}

// opts.sources / opts.fromSources: sources configs (lib/sources.mjs) for the new / old side; none given = artifact
export function changes(oldHtml, newHtml, opts = {}) {
  const fromSources = opts.fromSources !== undefined ? opts.fromSources : opts.sources;
  const A = extractArticle(oldHtml, { sources: fromSources }), B = extractArticle(newHtml, { sources: opts.sources });
  const ops = [];
  const rebuild = new Map(); // new picture number -> reason
  const add = (op, at, text) => ops.push({ op, at, text });
  if (A.title !== B.title) add('change', 'title', `title: ${wordDiff(A.title || '', B.title || '')}`);
  if (A.subtitle !== B.subtitle) add('change', 'subtitle', `subtitle: ${wordDiff(A.subtitle || '', B.subtitle || '')}`);

  const pairs = align(A.blocks, B.blocks);
  const { moves, unmatchedA, unmatchedB } = findMoves(A.blocks, B.blocks, pairs);
  const del = new Set(unmatchedA), ins = new Set(unmatchedB);
  const movedTo = new Map(moves.map(([i, j]) => [j, i]));
  const movedFrom = new Set(moves.map(([i]) => i));
  const pairOfNew = new Map(pairs.map(([i, j]) => [j, i]));

  // walk the new version in order; deletions are reported at their old place, before the next kept block
  let oi = 0;
  const flushDeletes = (upto) => {
    for (; oi < upto; oi++) {
      if (del.has(oi)) add('delete', where(A.blocks[oi]), `delete ${what(A.blocks[oi])}`);
    }
  };
  for (let j = 0; j < B.blocks.length; j++) {
    const b = B.blocks[j];
    const prev = j > 0 ? B.blocks[j - 1] : null;
    if (pairOfNew.has(j)) {
      const i = pairOfNew.get(j);
      flushDeletes(i);
      oi = Math.max(oi, i + 1);
      edits(A.blocks[i], b);
      continue;
    }
    if (movedTo.has(j)) {
      const a = A.blocks[movedTo.get(j)];
      add('move', where(a), `move it to after ${where(prev)}`);
      edits(a, b);
      continue;
    }
    if (ins.has(j)) {
      if (b.kind === 'picture') {
        rebuild.set(b.n, b.source === 'capture' ? `new figure #${b.id}` : `new copied picture ${b.src}`);
        add('add', `after ${where(prev)}`, `add picture ${b.file} (caption: "${clip(b.caption, 80)}"; alt text: alt.txt line ${b.n})`);
      } else if (b.kind === 'clip') add('add', `after ${where(prev)}`, `add clip: paste ${b.url} on its own line and press Enter (caption: "${clip(b.caption, 80)}")`);
      else add('add', `after ${where(prev)}`, `add ${what(b)}`);
    }
  }
  flushDeletes(A.blocks.length);
  for (const i of movedFrom) del.delete(i);

  function edits(a, b) {
    const at = where(a);
    if (a.kind !== b.kind) { add('change', at, `make it a ${kindName(b)} (was a ${kindName(a)})`); }
    if ((a.kind === 'p' || a.kind === 'heading' || a.kind === 'li' || a.kind === 'quote') && a.text !== b.text) add('change', at, `change text: ${wordDiff(a.text, b.text)}`);
    if (a.kind === 'heading' && b.kind === 'heading' && a.level !== b.level) add('change', at, `make it a ${b.level === 1 ? 'big' : 'small'} heading`);
    if (a.kind === 'quote' && b.kind === 'quote' && a.pull !== b.pull) add('change', at, b.pull ? 'make it a pull quote' : 'make it a plain quote');
    if (a.kind === 'li' && b.kind === 'li' && a.list !== b.list) add('change', at, `make it a ${b.list === 'ol' ? 'numbered' : 'bulleted'} list`);
    if (a.kind === 'p' && b.kind === 'p' && a.em !== b.em) add('change', at, b.em ? 'make the paragraph italic' : 'remove the italics');
    if ((a.links || []).join('\n') !== (b.links || []).join('\n')) add('change', at, `links now: ${(b.links || []).join(', ') || '(none)'}`);
    if (a.kind === 'picture' && b.kind === 'picture') {
      const label = `Picture ${b.n} (${b.file})${a.n !== b.n ? `, was ${a.n}` : ''}`;
      if (a.id !== b.id) { rebuild.set(b.n, `replaced (#${a.id} -> #${b.id})`); add('change', label, `replace the picture with ${b.file}`); }
      else if (b.source === 'capture' && squash(a.areaHtml) !== squash(b.areaHtml)) { rebuild.set(b.n, `#${b.id} drawing changed`); add('change', label, `picture changed: re-upload ${b.file} after rebuilding it`); }
      else if (b.source === 'copy' && (a.src !== b.src || a.width !== b.width || a.height !== b.height)) { rebuild.set(b.n, `copied picture now ${b.src}`); add('change', label, `picture changed: re-upload ${b.file}`); }
      if (a.caption !== b.caption) add('change', label, `caption: ${wordDiff(a.caption, b.caption)}`);
      if (a.alt !== b.alt) add('change', label, `alt text changed: paste alt.txt line ${b.n} (${wordDiff(a.alt, b.alt, { max: 2 })})`);
    }
    if (a.kind === 'clip' && b.kind === 'clip') {
      if (a.uid !== b.uid || a.url !== b.url) add('change', `Clip ${b.n}`, `replace the embed: delete it, paste ${b.url} on its own line and press Enter`);
      if (a.caption !== b.caption) add('change', `Clip ${b.n}`, `caption: ${wordDiff(a.caption, b.caption)}`);
    }
  }

  const renumbered = pairs.map(([i, j]) => [A.blocks[i], B.blocks[j]]).filter(([a, b]) => a.kind === 'picture' && b.kind === 'picture' && a.n !== b.n);
  const assetsA = pageAssets(oldHtml), assetsB = pageAssets(newHtml);
  const pageWide = [];
  if (assetsA.styles !== assetsB.styles) pageWide.push('the page styles (<style> or stylesheet links) changed');
  if (assetsA.scripts !== assetsB.scripts) pageWide.push('the page scripts changed (Fig. 2 and other drawn figures)');
  return { from: A, to: B, sources: [modeLabel(fromSources || null), modeLabel(opts.sources || null)], ops, rebuild: [...rebuild].sort(), renumbered: renumbered.map(([a, b]) => [a.n, b.n, b.file]), pageWide,
    counts: { old: A.blocks.length, new: B.blocks.length, pictures: [A.blocks.filter((x) => x.kind === 'picture').length, B.blocks.filter((x) => x.kind === 'picture').length],
      clips: [A.blocks.filter((x) => x.kind === 'clip').length, B.blocks.filter((x) => x.kind === 'clip').length] } };
}

function printReport(r, names, log = console.log) {
  log(`Medium update: ${names[0]} -> ${names[1]}`);
  log(`blocks ${r.counts.old} -> ${r.counts.new}, pictures ${r.counts.pictures.join(' -> ')}, clips ${r.counts.clips.join(' -> ')}`);
  if (r.sources) log(`sources mode ${r.sources[0] === r.sources[1] ? r.sources[1] : r.sources.join(' -> ')}`);
  log('');
  if (!r.ops.length) log('Nothing to change in Medium: same text, pictures and clips.');
  else {
    log(`To do in Medium, in story order (${r.ops.length}):`);
    r.ops.forEach((o, k) => log(`${String(k + 1).padStart(3)}. ${o.at}: ${o.text}`));
  }
  log('');
  if (r.rebuild.length) {
    log(`Kit pictures to rebuild (${r.rebuild.length}): ${r.rebuild.map(([n]) => n).join(', ')}`);
    for (const [n, why] of r.rebuild) log(`  ${n}: ${why}`);
  } else log('Kit pictures to rebuild: none (by their HTML)');
  if (r.pageWide.length) log(`WARNING: ${r.pageWide.join('; ')}: any captured picture may look different; rebuild the whole kit and compare the contact sheet.`);
  if (r.renumbered.length) log(`Note: ${r.renumbered.length} picture(s) get a new number (first: ${r.renumbered[0][0]} -> ${r.renumbered[0][1]}); the kit's file names change, the order in Medium does not.`);
  log('');
  log('Then: rebuild the kit (README "After an article update"), make the edits above, dump the Medium draft and run check.mjs.');
}

if (process.argv[1] && process.argv[1].endsWith('/changes.mjs')) {
  const argv = process.argv.slice(2);
  helpIfAsked(import.meta.url, argv);
  try {
    const o = parseArgs(argv, { from: 'v', to: 'v', dir: 'v', json: 'bool', 'from-sources': 'v', ...SOURCES_SPEC });
    const sources = sourcesFromArgs(o);
    const fromSources = o['from-sources'] ? sourcesFromArgs(o, 'from-sources') : sources;
    const dir = o.dir || dirname(DEFAULT_ARTICLE);
    const ver = (v) => join(dir, 'versions', `p1-v${String(v).replace(/^v/, '')}.html`);
    let files;
    if (o._.length === 2) files = o._;
    else if (o.from) files = [ver(o.from), o.to ? ver(o.to) : join(dir, 'index.html')];
    else throw new UsageError('give <old.html> <new.html>, or --from <version> [--to <version>]');
    for (const f of files) if (!existsSync(f)) throw new UsageError(`not found: ${f}`);
    const r = changes(readFileSync(files[0], 'utf8'), readFileSync(files[1], 'utf8'), { sources, fromSources });
    if (o.json) console.log(JSON.stringify({ files, sources: r.sources, ops: r.ops, rebuild: r.rebuild, renumbered: r.renumbered, pageWide: r.pageWide, counts: r.counts }, null, 1));
    else printReport(r, files.map((f) => f.split('/').slice(-2).join('/')));
    process.exit(0);
  } catch (e) {
    console.error(e instanceof UsageError ? `usage: ${e.message} (see --help)` : `error: ${e.stack || e.message}`);
    process.exit(2);
  }
}
export { printReport };

// sources.mjs: the article's Sources section and its "source" references, per Medium sources mode (owner's
// decision T-170 #367: the Medium version gets no Sources section and no source references for now; they come back
// as real GitHub links once Fastwork approves publishing the source code; the Claude artifact keeps them all).
//
// Modes (the --sources flag of kit/build.mjs, check.mjs, model.mjs, changes.mjs; written into kit.json):
//   none      (default) drop the footer Sources section (its heading, the note paragraphs before the list and
//             ol.figsrc) and every in-text reference to it: the #src-N links and the words and punctuation that only
//             exist for them ("(Fig. 1; source)" -> "(Fig. 1)", "real speed (source)." -> "real speed.",
//             "(Fig. 6; source, 11 Oct)" -> "(Fig. 6)").
//   github    keep the Sources list; every #src-N link points to <base>/<repo path> from the mapping file
//             (kit/sources-github.json, src-N -> repo path); a src-N without a path is removed as in none (a warning).
//   github-inline  the references as in github, the footer as in none (owner's decision T-279 #10: the Sources list
//             is too long for Medium; the inline "(source)" links stay and go to GitHub).
//   artifact  the page as it is (the Claude artifact, and every kit built before this switch): no change.
// Library calls without a sources option (extractArticle, changes) stay in artifact mode, so the artifact's own
// model is unchanged.
//
// applySourcesDom is the one transform for both sides: lib/article.mjs runs it on the lib/html.mjs tree, and
// kit/build.mjs injects its source text into the page and runs it on Chrome's DOM before the in-page walker. So it
// uses only members both trees have (children, localName, getAttribute, parentNode, textContent, innerHTML get and
// set, remove) and no outside names. It never touches anything inside a .cap-area: that is a picture, and pictures
// do not change with the mode (a reference drawn inside a picture is reported as inPicture, not removed).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MODES = ['none', 'github', 'github-inline', 'artifact'];
/** Modes whose references link to GitHub (they need --github-base), and modes that drop the Sources footer. */
export const linksGithub = (mode) => mode === 'github' || mode === 'github-inline';
export const dropsFooter = (mode) => mode === 'none' || mode === 'github-inline';
export const DEFAULT_MODE = 'none';
export const MAP_FILE = join(HERE, 'kit', 'sources-github.json');

/** The transform (see the header). cfg: { mode: 'none'|'github'|'github-inline', urls: { 'src-N': url } }. Returns a report. */
export function applySourcesDom(root, cfg) {
  const report = { mode: cfg.mode, blocks: [], inPicture: [], unhandled: [], unmapped: [], footer: null, linked: 0, removed: 0 };
  // (linksGithub/dropsFooter written out: this function's source text must run alone in Chrome)
  const link = cfg && (cfg.mode === 'github' || cfg.mode === 'github-inline');
  const dropFooter = cfg && (cfg.mode === 'none' || cfg.mode === 'github-inline');
  if (!root || !cfg || (!link && !dropFooter)) return report;
  const cls = (e, c) => (' ' + ((e.getAttribute && e.getAttribute('class')) || '') + ' ').replace(/\s+/g, ' ').indexOf(' ' + c + ' ') >= 0;
  const up = (e, pred) => { for (let x = e; x && x.nodeType === 1; x = x.parentNode) if (pred(x)) return x; return null; };
  const all = (e, pred, out = []) => { for (const c of e.children) { if (pred(c)) out.push(c); all(c, pred, out); } return out; };
  const txt = (e) => String(e.textContent || '').replace(/\s+/g, ' ').trim();
  const srcId = (a) => { const m = /^#(src-\d+)$/.exec(a.getAttribute('href') || ''); return m ? m[1] : null; };
  const BLOCK = ['p', 'li', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'td', 'th', 'dt', 'dd'];
  const figOf = (e) => { const f = up(e, (x) => x.localName === 'figure'); return f ? f.getAttribute('id') || '(figure)' : null; };

  // 1. the Sources list (ol.figsrc): none and github-inline drop it with its heading and the note paragraphs between them
  const lists = all(root, (e) => e.localName === 'ol' && cls(e, 'figsrc'));
  if (dropFooter) {
    report.footer = lists.length ? 'removed' : 'not found';
    for (const ol of lists) {
      const sib = Array.from(ol.parentNode.children);
      const drop = [ol];
      let heading = null;
      for (let i = sib.indexOf(ol) - 1; i >= 0; i--) {
        const s = sib[i];
        if (/^h[1-6]$/.test(s.localName)) { if (/^sources?$/i.test(txt(s))) heading = s; break; }
        if (s.localName !== 'p') break;
        drop.push(s);
      }
      if (heading) drop.push(heading);
      else { report.footer = 'removed, heading not found'; drop.length = 1; }
      report.footerText = drop.slice(1).reverse().map(txt);
      for (const e of drop) e.remove();
    }
  } else report.footer = lists.length ? 'kept' : 'not found';

  // 2. the references: every #src-N link outside the list, block by block
  const links = all(root, (e) => e.localName === 'a' && !!srcId(e) && !up(e, (x) => x.localName === 'ol' && cls(x, 'figsrc')));
  const blocks = [];
  for (const a of links) {
    if (up(a, (x) => cls(x, 'cap-area'))) { report.inPicture.push({ src: srcId(a), text: txt(a), figure: figOf(a), context: txt(up(a, (x) => BLOCK.indexOf(x.localName) >= 0) || a) }); continue; }
    const b = up(a, (x) => BLOCK.indexOf(x.localName) >= 0);
    if (!b) { report.unhandled.push({ src: srcId(a), text: txt(a), context: '(no block element around the link)' }); continue; }
    if (blocks.indexOf(b) < 0) blocks.push(b);
  }
  // one link: <a ... href="#src-N" ...>text</a>; a run: links joined by commas ("source, 11 Oct")
  const LINK = '<a\\b[^>]*?\\bhref="#src-\\d+"[^>]*>[\\s\\S]*?<\\/a>';
  const RUN = LINK + '(?:\\s*,\\s*' + LINK + ')*';
  const drop = (h) => h
    .replace(new RegExp('\\s*\\(\\s*' + RUN + '\\s*\\)', 'g'), '') // " (source)" -> ""
    .replace(new RegExp('\\s*[;,]\\s*' + RUN + '(?=\\s*\\))', 'g'), '') // "(Fig. 1; source)" -> "(Fig. 1)"
    .replace(new RegExp('\\(\\s*' + RUN + '\\s*[;,]\\s*', 'g'), '(') // "(source; Fig. 1)" -> "(Fig. 1)"
    .replace(new RegExp('\\s*;\\s*' + RUN + '(?=\\s*;)', 'g'), ''); // "(a; source; b)" -> "(a; b)"
  for (const b of blocks) {
    const before = b.innerHTML;
    let h = before;
    if (link) {
      h = h.replace(/(<a\b[^>]*?\bhref=")#(src-\d+)(")/g, (m, p, id, q) => {
        const u = cfg.urls && cfg.urls[id];
        if (!u) { report.unmapped.push(id); return m; }
        report.linked++;
        return p + String(u).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + q;
      });
    }
    const pending = (h.match(/href="#src-\d+"/g) || []).length;
    h = drop(h); // none: every reference; github, github-inline: the ones without a repo path
    const left = (h.match(/href="#src-\d+"/g) || []).length;
    if (left) report.unhandled.push({ src: (/#(src-\d+)/.exec(h) || [])[1], text: '', context: txt(b) });
    if (h === before) continue;
    report.removed += pending - left;
    const beforeText = txt(b);
    b.innerHTML = h;
    report.blocks.push({ tag: b.localName, figure: figOf(b), before: beforeText, after: txt(b) });
  }
  return report;
}

/**
 * Text that still looks like a reference to the Sources section (none mode must leave none). In github-inline the
 * "(source)" words stay (they are GitHub links), so only what points at the dropped list counts.
 */
export function sourceResidue(text, mode = 'none') {
  const s = String(text || '');
  const hits = [];
  const words = mode === 'github-inline' ? [] : [/\(\s*sources?\s*\)/gi, /[;,]\s*sources?\s*(?=[),;.]|$)/gi];
  for (const re of [/#src-\d+/g, /\bSources\b/g, ...words, /\bsee (?:the )?sources?\b/gi, /\bsrc-\d+\b/g]) {
    for (const m of s.matchAll(re)) hits.push(s.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20));
  }
  return hits;
}

/** The repo-path mapping (kit/sources-github.json): { 'src-N': 'path' or null }; "_" keys are comments. */
export function loadSourcesMap(file = MAP_FILE) {
  if (!file || !existsSync(file)) return {};
  const obj = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
}

export class SourcesError extends Error {}

/**
 * The mode the command line asked for -> the config the transform takes (null in artifact mode).
 * opts: { mode, base, map } (map: a file path or an object); github needs an http(s) base.
 */
export function sourcesConfig({ mode = DEFAULT_MODE, base = null, map = MAP_FILE } = {}) {
  if (!MODES.includes(mode)) throw new SourcesError(`--sources must be one of ${MODES.join(', ')} (got ${mode})`);
  if (mode === 'artifact') return null;
  if (mode === 'none') return { mode };
  if (!base || !/^https?:\/\/[^\s]+$/.test(base)) throw new SourcesError(`--sources ${mode} needs --github-base <https://github.com/<owner>/<repo>/blob/<ref>>`);
  const paths = typeof map === 'string' || !map ? loadSourcesMap(map) : map;
  const b = base.replace(/\/+$/, '');
  const urls = {};
  for (const [id, p] of Object.entries(paths)) if (p) urls[id] = b + '/' + String(p).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/%23/g, '#');
  return { mode, base: b, map: typeof map === 'string' ? map : '(object)', urls };
}

/** The mode a kit.json was built in: kits from before the switch have no "sources" field (artifact). */
export const kitMode = (kit) => (kit && kit.sources && kit.sources.mode) || 'artifact';

/** Short label for reports: "none", "github (https://...)", "github-inline (https://...)", "artifact". */
export const modeLabel = (cfg) => (!cfg ? 'artifact' : linksGithub(cfg.mode) ? `${cfg.mode} (${cfg.base})` : cfg.mode);

/** The kit.json record of the mode (kit/build.mjs): mode, base, map file, and the transform's report. */
export function kitRecord(cfg, report, repo) {
  const rec = { mode: cfg ? cfg.mode : 'artifact' };
  if (cfg && linksGithub(cfg.mode)) { rec.base = cfg.base; rec.map = repo && cfg.map.startsWith(repo + '/') ? relative(repo, cfg.map) : cfg.map; }
  if (report) rec.report = report;
  return rec;
}

/**
 * Seed a mapping from the Sources list itself: each src-N -> the first repo path written in its entry (fixes/...,
 * research/..., tools/..., summary/..., memory/..., CLAUDE.md), else null. root: a parsed page (lib/html.mjs).
 */
export function seedMap(root) {
  const out = {};
  const walk = (e) => { for (const c of e.children) { if (c.localName === 'li' && /^src-\d+$/.test(c.getAttribute('id') || '')) out[c.getAttribute('id')] = firstPath(c.textContent); walk(c); } };
  walk(root);
  return out;
}
export function firstPath(text) {
  const m = /(?:^|[\s(,;:"])((?:fixes|research|tools|summary|memory)\/[A-Za-z0-9._\-/]*[A-Za-z0-9_\-/]|CLAUDE\.md)/.exec(String(text || ''));
  return m ? m[1] : null;
}

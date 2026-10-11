// alt.mjs: the alt text that goes into Medium, one source for the kit (kit/build.mjs, kit/render.mjs) and the check
// (lib/article.mjs -> check.mjs).
//
// The article page keeps its long aria-labels (a full description for screen readers on the page). Medium takes at
// most about 500 characters of alt text (ALT_LIMIT; the limit is UNRESOLVED, a peer saw 16 long alts in a draft on
// 11 Oct), so kit/alt-medium.json holds a short alt for every picture whose page alt is too long: a JSON object
// keyed by figure id (figure.cap) or image file name (figure.gif <img>), each at most ALT_TARGET characters, written
// only from that figure's own content. Keys starting with "_" are comments. Pictures not listed keep the page's alt.
// Nothing here ever cuts text: an alt over ALT_LIMIT, or one ending in a cut mark ("…"), is a problem the kit build
// refuses (altProblems).
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALT_FILE = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'kit', 'alt-medium.json');
export const ALT_LIMIT = 500;
export const ALT_TARGET = 480;
const CUT = String.fromCharCode(0x2026);

/** figure id -> short alt, from a file path (default ALT_FILE), an object or a Map; null/false -> empty map. */
export function loadAltMedium(src = ALT_FILE) {
  if (!src) return new Map();
  if (src instanceof Map) return src;
  let obj = src;
  if (typeof src === 'string') {
    if (!existsSync(src)) return new Map();
    obj = JSON.parse(readFileSync(src, 'utf8'));
  }
  return new Map(Object.entries(obj).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string'));
}

/** The key of a picture: its figure id, else the copied image's file name (kit.json block or article model block). */
export const altKey = (p) => p.id || basename(p.src || String(p.file || '').replace(/^\d+-/, ''));

/**
 * Put the Medium alt on picture blocks (kit.json blocks with t:'picture', or article model blocks with
 * kind:'picture'). Idempotent: the page's alt is kept in altPage (and its rule in altPageFrom) the first time.
 * Returns { applied: [keys], unused: [keys in the file that match no picture] }.
 */
export function applyAltMedium(pictures, src = ALT_FILE) {
  const map = loadAltMedium(src);
  const applied = [], seen = new Set();
  for (const p of pictures) {
    if (p.altPage === undefined) { p.altPage = p.alt; p.altPageFrom = p.altFrom; }
    const k = altKey(p);
    seen.add(k);
    if (map.has(k)) { p.alt = map.get(k); p.altFrom = 'kit/alt-medium.json'; applied.push(k); }
    else { p.alt = p.altPage; p.altFrom = p.altPageFrom; }
  }
  return { applied, unused: [...map.keys()].filter((k) => !seen.has(k)) };
}

/** Problems that stop a kit build: an alt over the limit, a cut mark at the end, or an empty alt. */
export function altProblems(pictures, limit = ALT_LIMIT) {
  const out = [];
  for (const p of pictures) {
    const a = String(p.alt ?? '').trim(), where = `picture ${p.n || '?'} (${altKey(p)})`;
    if (!a) out.push(`${where}: no alt text`);
    else if (a.length > limit) out.push(`${where}: alt text is ${a.length} characters, over ${limit} (add a short one to kit/alt-medium.json)`);
    if (a.endsWith(CUT) || a.endsWith('...')) out.push(`${where}: alt text ends in a cut mark`);
  }
  return out;
}

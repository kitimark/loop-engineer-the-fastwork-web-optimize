// P-148 instrument overlay: the v9.1d base overlay (fixes/deck-contain--base/overlay, unchanged copies) plus
// /px148-gate.js and an index.html whose only change is <script src="/px148-gate.js"></script> as the first child of
// <head>. Writes fixes/deck-contain--px148/overlay (untracked, never committed) and prints sha256/12 of every file,
// so a run can show it served this exact instrument. usage: node fixes/deck-contain/mk-px148-overlay.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
const SRC = join(WT, 'fixes/deck-contain--base/overlay'), DST = join(WT, 'fixes/deck-contain--px148/overlay');
export const TAG = '<script src="/px148-gate.js"></script>';
const h12 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
export function gatedIndex(html) {
  const i = html.indexOf('<head>');
  if (i < 0 || html.indexOf('<head>', i + 1) >= 0) throw new Error('index.html: expected exactly one <head>');
  return html.slice(0, i + 6) + TAG + html.slice(i + 6);
}
export function build({ check = false } = {}) {
  const files = {};
  for (const p of walk(SRC)) {
    const rel = relative(SRC, p), b = readFileSync(p), out = join(DST, rel);
    if (!check) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, b); }
    files[rel] = h12(check && existsSync(out) ? readFileSync(out) : b);
  }
  const gate = readFileSync(join(HERE, 'px148-gate.js'));
  if (!check) writeFileSync(join(DST, 'px148-gate.js'), gate);
  files['px148-gate.js'] = h12(check ? readFileSync(join(DST, 'px148-gate.js')) : gate);
  const idx = gatedIndex(readFileSync(join(resolveTree('site-pretty'), 'index.html'), 'utf8'));
  if (!check) writeFileSync(join(DST, 'index.html'), idx);
  files['index.html'] = h12(check ? readFileSync(join(DST, 'index.html')) : Buffer.from(idx));
  return files;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const files = build({ check: process.argv.includes('--check') });
  for (const [k, v] of Object.entries(files)) console.log(v, k);
}

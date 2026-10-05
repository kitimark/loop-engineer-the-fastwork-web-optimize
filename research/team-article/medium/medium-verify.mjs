#!/usr/bin/env node
// medium-verify.mjs: check a Medium draft against the Medium paste copy, block by block (user T-170 #84).
//
// Usage:
//   node research/team-article/medium/medium-verify.mjs --draft <snapshot.json> [--copy <medium-copy.html>]
//        [--manifest <manifest.json>] [--alt-overrides <alt-short.json>] [--issues-only] [--gif-unknown-ok]
//   node research/team-article/medium/medium-verify.mjs --expected-summary [--copy …] [--manifest …] [--alt-overrides …]
//
//   --draft           the JSON that draft-snapshot.js returned in the Medium editor tab
//                     (saved as out/lead/medium-audit/draft-<UTC>.json in the main checkout)
//   --copy            the paste copy (default: <main checkout>/out/lead/medium-visuals/medium-copy.html)
//   --manifest        the image list (default: <main checkout>/out/lead/medium-visuals/manifest.json)
//   --alt-overrides   JSON {"<manifest file>": "<short alt>"}: replaces the manifest alt of those images
//                     (default: <main checkout>/out/lead/medium-audit/alt-short.json when it exists; "none" = off)
//   --issues-only     print only the rows that are not OK
//   --gif-unknown-ok  a GIF item whose draft image can't be told apart (gif "?") is a warning, not an issue
//   --expected-summary  print the expected checklist (Markdown) and exit
//
// What it does: reads the expected ordered blocks from the copy (headings, paragraphs, quotes, list items, figures;
// inline styling ignored), labels each figure from the manifest (matched by its alt text), and aligns them with the
// draft's blocks (a weighted longest-common-subsequence on normalized text, so one missing block does not shift the
// rest). Text compare ignores Medium's smart punctuation: curly quotes, dashes, ellipsis, non-breaking and
// zero-width spaces, and runs of whitespace.
// States: OK, MISSING (not in the draft), CHANGED (text, block type or a figure part differs; a short diff says
// how), EXTRA (in the draft, not in the copy; a leading Medium section divider is ignored), OUT-OF-ORDER (same
// block, other place). Figures also show image / caption / alt / GIF: alt is CUT when the draft alt is a prefix of
// the expected one (Medium cuts alt text at 500 characters), and an expected alt over 500 is an issue by itself.
// Medium puts the title first, so the copy's banner paragraph is expected right after the title; Medium's last
// empty paragraph (class graf--trailing, the very last block) is not EXTRA. A snapshot with transfer {length,
// sha256} is checked: TRANSFER OK, or TRANSFER MISMATCH (an issue: the parts were not joined back exactly).
// Last line: VERIFY PASS, or VERIFY FAIL <n> issues. Exit 0 on PASS, 1 on FAIL, 2 on bad input.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const ALT_MAX = 500;

// ---- text -------------------------------------------------------------------------------------------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', rarr: '→', middot: '·' };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));
export const stripTags = (h) => decode(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''));
export const norm = (s) => String(s ?? '').normalize('NFC')
  .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '')
  .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
  .replace(/[\u2018\u2019\u201a\u201b\u2032`]/g, "'")
  .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
  .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/--+/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/\s+/g, ' ').trim();

// Dice coefficient on character bigrams: 1 = same, 0 = nothing shared
const bigrams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; };
export function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.4) return 0;
  const A = bigrams(a), B = bigrams(b); let common = 0;
  for (const [k, n] of A) common += Math.min(n, B.get(k) || 0);
  return (2 * common) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}

// word diff around the first and last difference: "…ctx [-old-] {+new+} ctx…"
export function shortDiff(a, b) {
  const wa = a.split(' '), wb = b.split(' ');
  let p = 0; while (p < wa.length && p < wb.length && wa[p] === wb[p]) p++;
  let s = 0; while (s < wa.length - p && s < wb.length - p && wa[wa.length - 1 - s] === wb[wb.length - 1 - s]) s++;
  const cut = (x) => (x.length > 60 ? x.slice(0, 57) + '...' : x);
  const del = wa.slice(p, wa.length - s).join(' '), add = wb.slice(p, wb.length - s).join(' ');
  const pre = wa.slice(Math.max(0, p - 3), p).join(' '), post = wa.slice(wa.length - s, wa.length - s + 3).join(' ');
  return `${p > 3 ? '...' : ''}${pre} ${del ? `[-${cut(del)}-]` : ''}${add ? `{+${cut(add)}+}` : ''} ${post}${s > 3 ? '...' : ''}`.replace(/\s+/g, ' ').trim();
}

// ---- image size from a data: URI (PNG, GIF, JPEG) ----------------------------------------------------------------
export function dataUriInfo(src) {
  const m = /^data:image\/([a-z+]+);base64,/i.exec(src || ''); if (!m) return { mime: null };
  const head = Buffer.from(src.slice(m[0].length, m[0].length + 400000), 'base64');
  const mime = m[1].toLowerCase(); let w = 0, h = 0;
  if (mime === 'png' && head.length >= 24) { w = head.readUInt32BE(16); h = head.readUInt32BE(20); }
  else if (mime === 'gif' && head.length >= 10) { w = head.readUInt16LE(6); h = head.readUInt16LE(8); }
  else if (mime === 'jpeg' || mime === 'jpg') {
    for (let i = 2; i + 9 < head.length;) {
      if (head[i] !== 0xff) { i++; continue; }
      const mk = head[i + 1], len = head.readUInt16BE(i + 2);
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) { h = head.readUInt16BE(i + 5); w = head.readUInt16BE(i + 7); break; }
      i += 2 + len;
    }
  }
  return { mime, width: w || null, height: h || null };
}

// ---- expected blocks from the copy -------------------------------------------------------------------------------
export function extractExpected(html, manifest = { items: [] }, altOverrides = {}) {
  const items = manifest.items || [];
  const byAlt = new Map(items.map((it) => [norm(it.alt), it]));
  const body = html.replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '');
  const out = []; let shot = 0;
  const re = /<(h[1-6]|p|blockquote|ul|ol|figure|pre)\b[^>]*>([\s\S]*?)<\/\1>|<hr\b[^>]*>/gi;
  for (let m; (m = re.exec(body));) {
    const tag = (m[1] || 'hr').toLowerCase(), inner = m[2] || '';
    if (tag === 'hr') { out.push({ type: 'hr', text: '' }); continue; }
    if (tag === 'ul' || tag === 'ol') {
      for (const li of inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) out.push({ type: 'li', list: tag, text: norm(stripTags(li[1])) });
      continue;
    }
    if (tag === 'figure') {
      const src = (/\ssrc="([^"]*)"/i.exec(inner) || [])[1] || '';
      const alt = norm(decode((/\salt="([^"]*)"/i.exec(inner) || [])[1] || ''));
      const caption = norm(stripTags((/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner) || [])[1] || ''));
      const it = byAlt.get(alt), info = dataUriInfo(src);
      const label = it ? it.file.replace(/-.*$/, '') : `shot${++shot}`;
      const width = it?.width || info.width, height = it?.height || info.height;
      out.push({ type: 'figure', text: caption, caption, alt: it && altOverrides[it.file] ? norm(altOverrides[it.file]) : alt,
        label, file: it?.file || null, inManifest: !!it, altSource: it && altOverrides[it.file] ? 'override' : 'copy',
        gif: it ? /gif/i.test(it.kind || it.file) : info.mime === 'gif', width, height });
      continue;
    }
    const text = norm(stripTags(inner));
    if (text) out.push({ type: tag, text });
  }
  // Medium puts the title above everything, so the blocks before the title (the banner) are expected after it
  const t = out.findIndex((b) => b.type === 'h1');
  if (t > 0) out.unshift(...out.splice(t, 1));
  return out;
}

// ---- the draft ----------------------------------------------------------------------------------------------------
export function parseDraft(raw) {
  let d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof d === 'string') d = JSON.parse(d); // the javascript tool's result saved as a JSON string
  if (!d || !Array.isArray(d.blocks)) throw new Error('draft: no "blocks" array (is this a draft-snapshot.js result?)');
  return d;
}

// transfer {length, sha256}: computed in the page over JSON.stringify of the snapshot without it. Re-stringifying
// the parsed rest gives the same text (JSON.stringify output round-trips), so pretty-printing the file is harmless.
export function checkTransfer(raw) {
  const d = parseDraft(raw);
  if (!d.transfer) return { state: 'ABSENT', line: 'TRANSFER not checked (the snapshot has no length/sha256; older draft-snapshot.js)' };
  const { transfer, ...rest } = d, payload = JSON.stringify(rest);
  const got = { length: payload.length, sha256: createHash('sha256').update(payload, 'utf8').digest('hex') };
  if (got.length === transfer.length && got.sha256 === transfer.sha256) return { state: 'OK', line: `TRANSFER OK (length ${got.length}, sha256 ${got.sha256.slice(0, 12)})` };
  return { state: 'MISMATCH', line: `TRANSFER MISMATCH: the page sent length ${transfer.length}, sha256 ${String(transfer.sha256).slice(0, 12)}; the file has length ${got.length}, sha256 ${got.sha256.slice(0, 12)} (a part lost, doubled or changed while joining?)` };
}

export function loadDraft(raw) {
  const d = parseDraft(raw);
  return d.blocks.map((b, i) => ({ ...b, i, type: String(b.type || 'p').toLowerCase(), text: norm(b.type === 'figure' ? b.caption : b.text),
    caption: norm(b.caption), alt: norm(b.alt) }));
}

const cls = (t) => (/^h[1-6]$/.test(t) ? 'heading' : t);
const aspect = (w, h) => (w > 0 && h > 0 ? h / w : null);

// how well expected block e fits draft block d (0 = never pair them)
function score(e, d) {
  if ((e.type === 'figure') !== (d.type === 'figure')) return 0;
  if (e.type === 'hr' || d.type === 'hr') return e.type === d.type ? 2 : 0;
  if (e.type === 'figure') {
    if ((e.alt && e.alt === d.alt) || (e.caption && e.caption === d.caption)) return 3;
    if ((e.alt && d.alt && e.alt.startsWith(d.alt)) || similarity(e.caption, d.caption) >= 0.6 || similarity(e.alt, d.alt) >= 0.6) return 2;
    const ea = aspect(e.width, e.height), da = aspect(d.img?.dataWidth || d.img?.naturalWidth, d.img?.dataHeight || d.img?.naturalHeight);
    if (ea && da && Math.abs(ea - da) / ea < 0.03) return 1;
    return !d.caption && !d.alt ? 0.5 : 0;
  }
  const same = cls(e.type) === cls(d.type);
  if (e.text === d.text) return same ? 3 : 2;
  const s = similarity(e.text, d.text);
  return s >= 0.6 ? (same ? 1.5 : 1) * s : 0;
}

// weighted LCS: returns pairs [ei, di]
function align(E, D) {
  const n = E.length, m = D.length, S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const sc = Array.from({ length: n }, (_, i) => D.map((d) => score(E[i], d)));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    const k = sc[i][j];
    S[i][j] = Math.max(S[i + 1][j], S[i][j + 1], k > 0 ? k + S[i + 1][j + 1] : 0);
  }
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    const k = sc[i][j];
    if (k > 0 && Math.abs(S[i][j] - (k + S[i + 1][j + 1])) < 1e-9) { pairs.push([i, j]); i++; j++; }
    else if (S[i][j] === S[i + 1][j]) i++;
    else j++;
  }
  return pairs;
}

// one figure pair: parts and issues
function checkFigure(e, d, opts) {
  const notes = [], img = d.img || {};
  const part = { img: img.present === false || !(img.src || img.host || img.present) ? 'NO' : 'yes' };
  if (part.img === 'NO') notes.push('no image');
  part.cap = !e.caption ? (d.caption ? 'diff' : 'ok') : !d.caption ? 'NO' : d.caption === e.caption ? 'ok' : 'diff';
  if (part.cap === 'NO') notes.push('caption empty');
  if (part.cap === 'diff') notes.push(`caption: ${shortDiff(e.caption, d.caption)}`);
  if (e.alt.length > ALT_MAX) { part.alt = 'LONG'; notes.push(`expected alt is ${e.alt.length} chars, over Medium's ${ALT_MAX}: give a short one (--alt-overrides)`); }
  else if (!d.alt) { part.alt = e.alt ? 'NO' : 'ok'; if (e.alt) notes.push('alt empty'); }
  else if (d.alt === e.alt) part.alt = 'ok';
  else if (e.alt.startsWith(d.alt)) { part.alt = 'CUT'; notes.push(`alt cut at ${d.alt.length} of ${e.alt.length} chars`); }
  else { part.alt = 'diff'; notes.push(`alt: ${shortDiff(e.alt, d.alt)}`); }
  if (e.alt.length > ALT_MAX && d.alt && d.alt !== e.alt && e.alt.startsWith(d.alt)) { part.alt = 'CUT'; notes.push(`alt cut at ${d.alt.length} of ${e.alt.length} chars`); }
  let warnOnly = false;
  if (e.gif) {
    part.gif = img.gif === true ? 'yes' : img.gif === false ? 'NO' : '?';
    if (part.gif === 'NO') notes.push(`still image where a GIF is expected (${img.gifWhy || 'snapshot'})`);
    if (part.gif === '?') { notes.push(`can't tell if GIF (${img.gifWhy || 'no evidence'})`); if (opts.gifUnknownOk) warnOnly = true; }
  } else part.gif = img.gif === true ? 'GIF?' : '-';
  if (part.gif === 'GIF?') notes.push('a GIF where a still image is expected');
  const ea = aspect(e.width, e.height), da = aspect(img.dataWidth || img.naturalWidth, img.dataHeight || img.naturalHeight);
  let aspectBad = false;
  if (ea && da && Math.abs(ea - da) / ea >= 0.03) { aspectBad = true; notes.push(`image shape ${da.toFixed(3)} vs ${ea.toFixed(3)} (h/w): another image?`); }
  let broken = false;
  if (part.img === 'yes' && img.naturalWidth === 0) {
    if (img.complete === true) { broken = true; notes.push('image broken: loaded with no pixels'); }
    else notes.push('WARN image not loaded yet (naturalWidth 0)');
  }
  const bad = part.img === 'NO' || part.cap !== 'ok' || part.alt !== 'ok' || part.gif === 'NO' || part.gif === 'GIF?' || aspectBad || broken || (part.gif === '?' && !warnOnly);
  return { part, notes, bad };
}

export function verify(E, D, opts = {}) {
  const pairs = align(E, D), eTo = new Map(pairs), dUsed = new Set(pairs.map((p) => p[1]));
  // a block found elsewhere: OUT-OF-ORDER
  const moved = new Map();
  E.forEach((e, i) => {
    if (eTo.has(i)) return;
    const j = D.findIndex((d, j) => !dUsed.has(j) && score(e, d) >= 2.9);
    if (j >= 0) { moved.set(i, j); dUsed.add(j); }
  });
  const rows = [];
  E.forEach((e, i) => {
    const j = eTo.has(i) ? eTo.get(i) : moved.get(i);
    const row = { n: i + 1, e, d: j == null ? null : D[j], dIndex: j ?? null, notes: [] };
    if (j == null) { row.state = 'MISSING'; if (e.type === 'figure') row.part = { img: 'NO', cap: 'NO', alt: 'NO', gif: e.gif ? 'NO' : '-' }; }
    else {
      const d = D[j]; let bad = false;
      if (e.type === 'figure') { const f = checkFigure(e, d, opts); row.part = f.part; row.notes.push(...f.notes); bad = f.bad; }
      else {
        if (cls(e.type) !== cls(d.type)) { bad = true; row.notes.push(`pasted as ${d.type}, expected ${e.type}${e.type === 'li' ? ' (list flattened?)' : ''}`); }
        else if (e.type === 'li' && d.list && e.list !== d.list) { bad = true; row.notes.push(`in a ${d.list} list, expected ${e.list}`); }
        if (e.text !== d.text) { bad = true; row.notes.push(shortDiff(e.text, d.text)); }
      }
      row.state = moved.has(i) ? 'OUT-OF-ORDER' : bad ? 'CHANGED' : 'OK';
      if (moved.has(i)) row.notes.unshift(`found at draft block ${j + 1}`);
    }
    rows.push(row);
  });
  // EXTRA draft blocks, placed after the expected row that comes before them in the draft
  const lastE = new Map(); for (const r of rows) if (r.dIndex != null && r.state !== 'OUT-OF-ORDER') lastE.set(r.dIndex, r.n);
  const extras = []; let seenContent = false, prevE = 0;
  D.forEach((d, j) => {
    if (lastE.has(j)) prevE = lastE.get(j);
    if (dUsed.has(j)) { seenContent = true; return; }
    if (d.type === 'hr' && !seenContent) return; // Medium opens every story with a section divider
    if (j === D.length - 1 && d.type === 'p' && !d.text && (d.cls || []).includes('graf--trailing')) return; // Medium's own last empty line
    seenContent = true;
    const what = d.type === 'figure' ? `figure: ${d.caption || d.alt || '(no caption, no alt)'}` : d.text ? d.text : `(empty ${d.type})`;
    extras.push({ after: prevE, row: { n: null, e: null, d, dIndex: j, state: 'EXTRA', notes: [d.text || d.type === 'figure' ? `draft block ${j + 1}` : `stray empty ${d.type}, draft block ${j + 1}`], what } });
  });
  const all = [];
  for (const x of extras.filter((x) => x.after === 0)) all.push(x.row);
  for (const r of rows) { all.push(r); for (const x of extras.filter((x) => x.after === r.n)) all.push(x.row); }
  // notes on OK rows (an image still loading, a GIF accepted by --gif-unknown-ok) are printed, not counted
  const warnings = all.filter((r) => r.state === 'OK').flatMap((r) => r.notes.map((t) => `${r.e?.label || `#${r.n}`}: ${t.replace(/^WARN /, '')}`));
  const issues = all.filter((r) => r.state !== 'OK').length;
  const transfer = opts.transfer || null;
  return { rows: all, issues: issues + (transfer?.state === 'MISMATCH' ? 1 : 0), warnings, transfer };
}

// ---- report -------------------------------------------------------------------------------------------------------
const clip = (s, n) => (s.length > n ? s.slice(0, n - 3) + '...' : s);
export function report(E, D, res, opts = {}) {
  const lines = [];
  const count = (L) => L.reduce((o, b) => ((o[b.type] = (o[b.type] || 0) + 1), o), {});
  lines.push(`expected: ${E.length} blocks ${JSON.stringify(count(E))}; ${E.filter((e) => e.type === 'figure').length} figures, GIF items: ${E.filter((e) => e.gif).map((e) => e.label).join(', ') || 'none'}`);
  lines.push(`draft:    ${D.length} blocks ${JSON.stringify(count(D))}`);
  const st = res.rows.reduce((o, r) => ((o[r.state] = (o[r.state] || 0) + 1), o), {});
  lines.push(`states:   ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push('');
  lines.push('| # | type | expected item | state | img | cap | alt | gif | note |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of res.rows) {
    if (opts.issuesOnly && r.state === 'OK') continue;
    const e = r.e, p = r.part || {};
    const item = e ? (e.type === 'figure' ? `${e.label}${e.inManifest ? '' : ' (not in manifest)'}: ${e.caption}` : e.text) : r.what;
    const type = e ? (e.type === 'li' ? `li/${e.list}` : e.type) : r.d.type;
    const esc = (s) => s.replace(/\|/g, '\\|');
    lines.push(`| ${r.n ?? '+'} | ${type} | ${esc(clip(item, 70))} | ${r.state} | ${p.img || ''} | ${p.cap || ''} | ${p.alt || ''} | ${p.gif || ''} | ${esc(clip(r.notes.join('; '), 160))} |`);
  }
  for (const w of res.warnings) lines.push(`WARN ${w}`);
  if (res.transfer) lines.push(res.transfer.line);
  lines.push(res.issues === 0 ? 'VERIFY PASS' : `VERIFY FAIL ${res.issues} issues`);
  return lines.join('\n');
}

export function expectedSummary(E, src = {}) {
  const L = [];
  const count = E.reduce((o, b) => ((o[b.type] = (o[b.type] || 0) + 1), o), {});
  L.push('# What "complete" means for the Medium draft', '');
  L.push(`Generated by \`medium-verify.mjs --expected-summary\` from ${src.copy || 'the copy'} and ${src.manifest || 'the manifest'}${src.overrides ? ` with the short alts in ${src.overrides}` : ''}.`);
  L.push('Regenerate it whenever the copy is rebuilt. The verifier, not this page, decides PASS.', '');
  L.push('## Blocks by type', '', '| type | count |', '|---|---|');
  for (const [k, v] of Object.entries(count)) L.push(`| ${k} | ${v} |`);
  L.push(`| total | ${E.length} |`, '');
  L.push('## Headings in order', '', 'Medium puts the title first, so the opening banner paragraph is expected right after the title.', '');
  E.filter((e) => /^h\d$/.test(e.type)).forEach((e, i) => L.push(`${i + 1}. ${e.type === 'h1' ? '(title) ' : ''}${e.text}`));
  L.push('', '## Figures in order', '');
  L.push('Every figure needs the image, the caption and the alt text. GIF items must stay animated GIFs.', '');
  L.push('| # | item | GIF | alt chars | caption |', '|---|---|---|---|---|');
  E.filter((e) => e.type === 'figure').forEach((e, i) => L.push(`| ${i + 1} | ${e.label}${e.file ? ` (${e.file})` : ' (screenshot, not in manifest)'} | ${e.gif ? 'yes' : 'no'} | ${e.alt.length}${e.altSource === 'override' ? ' (short alt)' : ''}${e.alt.length > ALT_MAX ? ' (over 500: needs a short alt)' : ''} | ${e.caption.replace(/\|/g, '\\|')} |`));
  L.push('');
  return L.join('\n');
}

// ---- CLI ----------------------------------------------------------------------------------------------------------
function mainCheckout() {
  const here = dirname(fileURLToPath(import.meta.url));
  try { return dirname(resolve(here, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim())); }
  catch { return resolve(here, '../../..'); }
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    console.log(src.slice(1).filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const MAIN = mainCheckout();
  const copy = resolve(val('--copy') || join(MAIN, 'out/lead/medium-visuals/medium-copy.html'));
  const man = resolve(val('--manifest') || join(MAIN, 'out/lead/medium-visuals/manifest.json'));
  const ovArg = val('--alt-overrides'), ovDefault = join(MAIN, 'out/lead/medium-audit/alt-short.json');
  const ov = ovArg === 'none' ? null : ovArg ? resolve(ovArg) : existsSync(ovDefault) ? ovDefault : null;
  for (const f of [copy, man, ov].filter(Boolean)) if (!existsSync(f)) { console.error(`medium-verify: missing ${f}`); return 2; }
  const manifest = JSON.parse(readFileSync(man, 'utf8'));
  const overrides = ov ? JSON.parse(readFileSync(ov, 'utf8')) : {};
  const E = extractExpected(readFileSync(copy, 'utf8'), manifest, overrides);
  const rel = (f) => f && f.replace(MAIN + '/', '');
  if (argv.includes('--expected-summary')) { console.log(expectedSummary(E, { copy: rel(copy), manifest: rel(man), overrides: rel(ov) })); return 0; }
  const draft = val('--draft');
  if (!draft) { console.error('medium-verify: --draft <snapshot.json> is required (see --help)'); return 2; }
  let D, transfer;
  try { const raw = readFileSync(resolve(draft), 'utf8'); D = loadDraft(raw); transfer = checkTransfer(raw); }
  catch (e) { console.error(`medium-verify: ${e.message}`); return 2; }
  console.log(`copy: ${rel(copy)}\nmanifest: ${rel(man)}${ov ? `\nalt overrides: ${rel(ov)} (${Object.keys(overrides).join(', ')})` : ''}\ndraft: ${draft}`);
  const res = verify(E, D, { gifUnknownOk: argv.includes('--gif-unknown-ok'), transfer });
  console.log(report(E, D, res, { issuesOnly: argv.includes('--issues-only') }));
  return res.issues === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));

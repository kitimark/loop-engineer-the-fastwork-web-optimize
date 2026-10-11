// compare.mjs: align two article models block by block and list what differs.
// Used by check.mjs (article vs Medium) and changes.mjs (article version vs article version).
import { similarity, wordDiff, norm, clip } from './text.mjs';
import { label } from './article.mjs';

const TEXT_KINDS = new Set(['p', 'heading', 'li', 'quote']);
export const blockText = (b) => (b.kind === 'picture' || b.kind === 'clip' ? b.caption : b.text) || '';

// how alike two blocks are (0 = never pair them); same kind scores higher than a look-alike of another kind
export function pairScore(a, b) {
  if (TEXT_KINDS.has(a.kind) && TEXT_KINDS.has(b.kind)) {
    const s = similarity(a.text, b.text);
    return s < 0.5 ? 0 : s + (a.kind === b.kind ? 0.2 : 0);
  }
  if (a.kind !== b.kind) return 0;
  if (a.kind === 'hr') return 0.5;
  if (a.kind === 'picture') {
    const s = Math.max(similarity(a.caption || '', b.caption || ''), similarity(a.alt || '', b.alt || ''), a.id && a.id === b.id ? 1 : 0);
    return 0.6 + 0.6 * s;
  }
  if (a.kind === 'clip') {
    if (a.uid && a.uid === b.uid) return 1.5;
    return 0.6 + 0.6 * similarity(a.caption || '', b.caption || '');
  }
  return 0;
}

// order-keeping alignment with the best total score (gaps cost nothing); returns [[i, j]] pairs
export function align(A, B, score = pairScore) {
  const n = A.length, m = B.length;
  const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const sc = Array.from({ length: n }, () => new Float32Array(m));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) sc[i][j] = score(A[i], B[j]);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    let v = Math.max(S[i - 1][j], S[i][j - 1]);
    const s = sc[i - 1][j - 1];
    if (s > 0 && S[i - 1][j - 1] + s > v) v = S[i - 1][j - 1] + s;
    S[i][j] = v;
  }
  const pairs = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = sc[i - 1][j - 1];
    if (s > 0 && Math.abs(S[i][j] - (S[i - 1][j - 1] + s)) < 1e-9) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (S[i][j] === S[i - 1][j]) i--;
    else j--;
  }
  return pairs.reverse();
}

// unmatched blocks that exist on both sides with (nearly) the same content are moves, not missing + extra
export function findMoves(A, B, pairs) {
  const usedA = new Set(pairs.map((p) => p[0])), usedB = new Set(pairs.map((p) => p[1]));
  const moves = [];
  for (let i = 0; i < A.length; i++) {
    if (usedA.has(i)) continue;
    let best = -1, bs = 0;
    for (let j = 0; j < B.length; j++) {
      if (usedB.has(j)) continue;
      const a = A[i], b = B[j];
      if (a.kind === 'hr' || b.kind === 'hr') continue;
      let s = 0;
      if (a.kind === 'clip' && b.kind === 'clip') s = a.uid && a.uid === b.uid ? 1 : similarity(a.caption, b.caption);
      else if (a.kind === 'picture' && b.kind === 'picture') s = similarity(a.caption, b.caption);
      else if (TEXT_KINDS.has(a.kind) && TEXT_KINDS.has(b.kind)) s = similarity(a.text, b.text);
      if (s > bs) { bs = s; best = j; }
    }
    if (best >= 0 && bs >= 0.9) { moves.push([i, best, bs]); usedA.add(i); usedB.add(best); }
  }
  return { moves, unmatchedA: [...Array(A.length).keys()].filter((i) => !usedA.has(i)), unmatchedB: [...Array(B.length).keys()].filter((j) => !usedB.has(j)) };
}

// link targets compared without what Medium may add or wrap: medium.com/r/?url=..., trailing slash, source= params
export function normLink(h) {
  let s = String(h || '');
  try {
    const u = new URL(s);
    if (/(^|\.)medium\.com$/.test(u.host) && u.pathname === '/r/' && u.searchParams.get('url')) return normLink(u.searchParams.get('url'));
    for (const k of [...u.searchParams.keys()]) if (/^(source|sk|utm_)/.test(k)) u.searchParams.delete(k);
    s = u.href;
  } catch { /* not a URL */ }
  return s.replace(/\/$/, '');
}

export const MARKER_RE = /\[PICTURE\b|\[CLIP\b|(^|\s)Caption:|MISSING LINK/;
export const ALT_MAX = 500; // Medium's alt text limit as the earlier Medium verifier found it (OBSERVED there, UNVERIFIED here)

/**
 * Compare the article model (src) with the Medium model (med). Returns { issues, notes, stats }.
 * Each issue: { type, where, detail } (counted); notes: same shape, not counted.
 */
export function compareModels(src, med, opts = {}) {
  const issues = [], notes = [];
  const add = (type, where, detail) => issues.push({ type, where, detail });
  const note = (type, where, detail) => notes.push({ type, where, detail });
  const A = src.blocks, B = med.blocks;

  // header
  if (!med.title) add('TITLE', 'title', `no title found in Medium (expected "${clip(src.title, 80)}")`);
  else if (med.title !== src.title) add('TITLE', 'title', wordDiff(src.title, med.title));
  if (src.subtitle && !med.subtitle) add('SUBTITLE', 'subtitle', `no subtitle found in Medium (expected "${clip(src.subtitle, 80)}")`);
  else if (src.subtitle !== med.subtitle) add('SUBTITLE', 'subtitle', wordDiff(src.subtitle || '', med.subtitle || ''));
  if (med.medium && med.medium.transfer && med.medium.transfer.state === 'MISMATCH') add('TRANSFER', 'dump file', med.medium.transfer.line);
  if (src.kit && src.kit.stale && src.kit.stale.length) for (const s of src.kit.stale) add('KIT', 'kit', s + ' (rebuild the kit: kit/build.mjs)');

  // leftover kit markers anywhere in Medium (text, captions, alt)
  const markerBlocks = new Set(); // text blocks that are only a marker: not reported again as EXTRA
  for (const b of B) {
    for (const [what, s] of [['text', b.text], ['caption', b.caption], ['alt', b.alt]]) {
      if (s && MARKER_RE.test(s)) { add('MARKER', mLabel(b), `kit marker left in the ${what}: "${clip(s, 70)}"`); if (what === 'text') markerBlocks.add(b); }
    }
    if (TEXT_KINDS.has(b.kind) && /^https?:\/\/(iframe\.)?(videodelivery\.net|[a-z0-9-]+\.cloudflarestream\.com)\/\S+$/i.test(b.text || '')) {
      add('MARKER', mLabel(b), 'a Stream link left as text, not embedded (put the cursor at its end and press Enter)');
      markerBlocks.add(b);
    }
  }
  if (med.empties && med.empties.length) note('EMPTY', 'Medium', `${med.empties.length} empty paragraph(s) (blank lines) in the story`);

  const pairs = align(A, B);
  const { moves, unmatchedA, unmatchedB } = findMoves(A, B, pairs);

  // disclaimer: exact text and italics, right after the byline
  for (const d of A.filter((b) => b.role === 'disclaimer')) {
    const p = pairs.find((x) => x[0] === d.i);
    if (!p) add('DISCLAIMER', label(d), `disclaimer line missing in Medium: "${clip(d.text, 80)}"`);
    else {
      const m = B[p[1]];
      if (m.text !== d.text) add('DISCLAIMER', label(d), wordDiff(d.text, m.text));
      if (d.em && !m.em) add('DISCLAIMER', label(d), 'not italic in Medium');
    }
  }

  for (const i of unmatchedA) {
    const a = A[i];
    if (a.kind === 'hr') add('MISSING', label(a), 'separator (Medium: the "---" separator / new section) missing');
    else add('MISSING', label(a), a.kind === 'picture' ? `picture missing (caption "${clip(a.caption, 60)}")` : a.kind === 'clip' ? `clip missing (uid ${a.uid})` : `"${clip(blockText(a), 90)}"`);
  }
  for (const j of unmatchedB) {
    const b = B[j];
    if (markerBlocks.has(b)) continue; // already reported as a leftover marker
    add('EXTRA', mLabel(b), b.kind === 'hr' ? 'separator not in the article' : `in Medium, not in the article: "${clip(blockText(b) || (b.kind === 'picture' ? '(picture, no caption)' : b.kind), 90)}"`);
  }
  for (const [i, j] of moves) add('MOVED', label(A[i]), `found at Medium block ${j + 1} (${mLabel(B[j])}), out of order`);

  const stats = { article: A.length, medium: B.length, matched: pairs.length, missing: unmatchedA.length, extra: unmatchedB.length, moved: moves.length,
    pictures: { article: 0, ok: 0 }, clips: { article: 0, ok: 0 } };

  for (const [i, j] of [...pairs, ...moves.map((m) => [m[0], m[1]])]) {
    const a = A[i], b = B[j], where = label(a);
    const before = issues.length;
    if (a.kind !== b.kind) add('KIND', where, `${kindName(a)} in the article, ${kindName(b)} in Medium`);
    if (TEXT_KINDS.has(a.kind) && a.role !== 'disclaimer' && a.text !== b.text) add('TEXT', where, wordDiff(a.text, b.text));
    if (a.kind === 'heading' && b.kind === 'heading' && a.level !== b.level) add('LEVEL', where, `${a.level === 1 ? 'big' : 'small'} heading in the article, ${b.level === 1 ? 'big' : 'small'} in Medium (${b.levelFrom || ''})`);
    if (a.kind === 'quote' && b.kind === 'quote') {
      if (b.pull === null || b.pull === undefined) { if (a.pull) note('PULL?', where, 'pull quote in the article; Medium\'s markup does not say pull or plain here, check by eye'); }
      else if (a.pull !== b.pull) add('PULL', where, a.pull ? 'pull quote in the article, plain quote in Medium (press the quote button twice)' : 'plain quote in the article, pull quote in Medium');
    }
    if (a.kind === 'li' && b.kind === 'li' && a.list && b.list && a.list !== b.list) add('LIST', where, `${a.list === 'ol' ? 'numbered' : 'bulleted'} list in the article, ${b.list === 'ol' ? 'numbered' : 'bulleted'} in Medium`);
    if (!opts.noLinks && TEXT_KINDS.has(a.kind) && TEXT_KINDS.has(b.kind)) {
      const la = (a.links || []).map(normLink), lb = (b.links || []).map(normLink);
      if (la.join('\n') !== lb.join('\n')) {
        const miss = la.filter((x) => !lb.includes(x)), extra = lb.filter((x) => !la.includes(x));
        add('LINKS', where, [miss.length ? `missing link ${miss.map((x) => clip(x, 70)).join(', ')}` : '', extra.length ? `extra link ${extra.map((x) => clip(x, 70)).join(', ')}` : '', !miss.length && !extra.length ? 'links in another order' : ''].filter(Boolean).join('; '));
      }
    }
    if (a.kind === 'picture' && b.kind === 'picture') {
      stats.pictures.article++;
      if (!b.img) add('IMAGE', where, 'figure without an image in Medium');
      else if (b.img.host === 'blob:') add('IMAGE', where, 'image still uploading (blob: address); wait for "Saved" and dump again');
      if (a.caption !== b.caption) add('CAPTION', where, b.caption ? wordDiff(a.caption, b.caption) : `caption missing in Medium (expected "${clip(a.caption, 70)}")`);
      if (b.img && a.alt !== b.alt) {
        if (b.alt && a.alt.length > ALT_MAX && a.alt.startsWith(b.alt) && b.alt.length >= ALT_MAX - 20) {
          (opts.strictAlt ? add : note)('ALT-CUT', where, `alt text cut at ${b.alt.length} of ${a.alt.length} characters (Medium's limit); the kept part matches`);
        } else if (!b.alt) add('ALT', where, `alt text missing in Medium (${a.alt.length} characters expected, from ${a.altFrom})`);
        else if (/static approximation/.test(a.altFrom || '')) note('ALT?', where, `alt differs from the static approximation; pass --kit to compare with the kit's alt: ${wordDiff(a.alt, b.alt)}`);
        else add('ALT', where, wordDiff(a.alt, b.alt));
      }
      if (issues.length === before) stats.pictures.ok++;
    } else if (a.kind === 'picture') stats.pictures.article++;
    if (a.kind === 'clip' && b.kind === 'clip') {
      stats.clips.article++;
      if (!b.uid) (opts.allowUnproven ? note : add)('CLIP-UNPROVEN', where, `embed present, but no Stream address is visible in it (${b.evidence}); dump the editor page or check by eye that it plays ${a.uid}`);
      else if (b.uid !== a.uid) add('CLIP-UID', where, `embeds Stream uid ${b.uid}, the article links ${a.uid}`);
      else {
        const want = { loop: 'true', autoplay: 'true', muted: 'true', ...(a.params || {}) };
        const bad = Object.entries(want).filter(([k, v]) => String(b.params[k]) !== String(v));
        if (bad.length) {
          // no parameter visible at all: the embed address may simply not carry them (unproven, not wrong)
          const missingAll = Object.keys(b.params || {}).length === 0;
          (missingAll && opts.allowUnproven ? note : add)(missingAll ? 'CLIP-PARAMS?' : 'CLIP-PARAMS', where,
            bad.map(([k, v]) => `${k}=${b.params[k] === undefined ? '(not visible)' : b.params[k]} (want ${v})`).join(', '));
        }
      }
      if (a.caption !== b.caption) add('CAPTION', where, b.caption ? wordDiff(a.caption, b.caption) : `caption missing in Medium (expected "${clip(a.caption, 70)}")`);
      if (issues.length === before) stats.clips.ok++;
    } else if (a.kind === 'clip') stats.clips.article++;
  }
  for (const i of unmatchedA) { if (A[i].kind === 'picture') stats.pictures.article++; if (A[i].kind === 'clip') stats.clips.article++; }
  stats.pictures.medium = B.filter((b) => b.kind === 'picture').length;
  stats.clips.medium = B.filter((b) => b.kind === 'clip').length;
  const headingTags = [...new Set(B.filter((b) => b.kind === 'heading').map((b) => b.tag))];
  if (headingTags.length === 1 && A.some((b) => b.kind === 'heading' && b.level === 2) && !B.some((b) => /graf--h[34]/.test((b.cls || []).join(' ')))) {
    note('LEVEL?', 'headings', `Medium uses one heading tag (${headingTags[0]}) for all headings here; big vs small can't be told from the markup, check by eye`);
  }
  return { issues, notes, stats, pairs, moves };
}

export function kindName(b) {
  if (b.kind === 'heading') return b.level === 1 ? 'big heading' : 'small heading';
  if (b.kind === 'quote') return b.pull ? 'pull quote' : 'quote';
  if (b.kind === 'li') return 'list item';
  if (b.kind === 'p') return 'paragraph';
  if (b.kind === 'hr') return 'separator';
  return b.kind;
}
export function mLabel(b) { return `Medium ${kindName(b)} ${b.i + 1}${b.n ? ' (#' + b.n + ')' : ''}${b.text ? ' "' + clip(b.text, 40) + '"' : b.caption ? ' "' + clip(b.caption, 40) + '"' : ''}`; }
export { norm };

// text.mjs: text normalization, similarity and a short word-level diff for the medium-check scripts.

// What Medium (or a paste) may change without the reader seeing a difference: curly vs straight quotes, dash
// kinds, ellipsis, non-breaking / thin / zero-width spaces, runs of whitespace, Unicode composition.
// character classes from code points (kept as numbers so the source stays plain ASCII)
const cls = (...cps) => new RegExp('[' + cps.map((c) => (Array.isArray(c) ? String.fromCharCode(c[0]) + '-' + String.fromCharCode(c[1]) : String.fromCharCode(c))).join('') + ']', 'g');
const ZERO_WIDTH = cls(0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff);
const SPACES = cls(0xa0, [0x2000, 0x200a], 0x202f, 0x205f, 0x3000);
const SINGLE_Q = cls(0x2018, 0x2019, 0x201a, 0x201b, 0x2032, 0x60, 0xb4);
const DOUBLE_Q = cls(0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xab, 0xbb);
const DASHES = cls([0x2010, 0x2015], 0x2212);
const ELLIPSIS = cls(0x2026);
export function norm(s) {
  return String(s ?? '').normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(SPACES, ' ')
    .replace(SINGLE_Q, "'")
    .replace(DOUBLE_Q, '"')
    .replace(DASHES, '-')
    .replace(ELLIPSIS, '...')
    .replace(/\s+/g, ' ')
    .replace(/ ?--+ ?/g, ' - ') // "--" typed for a dash
    .trim();
}

// Dice coefficient on character bigrams: 1 = same, 0 = nothing shared. Cached bigram maps keep alignment fast.
const BG = new Map();
function bigrams(s) {
  let m = BG.get(s);
  if (m) return m;
  m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); }
  if (BG.size > 20000) BG.clear();
  BG.set(s, m);
  return m;
}
export function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.3) return 0;
  const A = bigrams(a), B = bigrams(b);
  let common = 0;
  const [small, big] = A.size < B.size ? [A, B] : [B, A];
  for (const [k, n] of small) common += Math.min(n, big.get(k) || 0);
  return (2 * common) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}

// Word-level diff (LCS on words), printed short: "…three words [-old words-] {+new words+} three words…".
// Several changed spots are joined with " | "; at most `max` spots are shown.
export function wordDiff(a, b, { ctx = 3, max = 4, cut = 70 } = {}) {
  const A = a ? a.split(' ') : [], B = b ? b.split(' ') : [];
  // trim the common head and tail first (most edits are small), then LCS on the middle
  let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0; while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const a2 = A.slice(p, A.length - s), b2 = B.slice(p, B.length - s);
  const ops = []; // [type, word] with type ' ', '-', '+'
  for (const w of A.slice(0, p)) ops.push([' ', w]);
  if (a2.length * b2.length > 4e6) { for (const w of a2) ops.push(['-', w]); for (const w of b2) ops.push(['+', w]); }
  else {
    const n = a2.length, m = b2.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) ops.push(['+', b2[j++]]);
      else ops.push(['-', a2[i++]]);
    }
  }
  for (const w of A.slice(A.length - s)) ops.push([' ', w]);
  // group into change spots with context
  const short = (x) => (x.length > cut ? x.slice(0, cut - 3) + '...' : x);
  const spots = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k][0] === ' ') { k++; continue; }
    const start = k;
    while (k < ops.length && ops[k][0] !== ' ') k++;
    const del = ops.slice(start, k).filter((o) => o[0] === '-').map((o) => o[1]).join(' ');
    const add = ops.slice(start, k).filter((o) => o[0] === '+').map((o) => o[1]).join(' ');
    const pre = ops.slice(Math.max(0, start - ctx), start).filter((o) => o[0] === ' ').map((o) => o[1]);
    const post = ops.slice(k, k + ctx).filter((o) => o[0] === ' ').map((o) => o[1]);
    spots.push(`${start - ctx > 0 ? '...' : ''}${pre.join(' ')} ${del ? `[-${short(del)}-]` : ''}${add ? `{+${short(add)}+}` : ''} ${post.join(' ')}${k + ctx < ops.length ? '...' : ''}`.replace(/\s+/g, ' ').trim());
  }
  if (!spots.length) return '(same words)';
  return spots.slice(0, max).join(' | ') + (spots.length > max ? ` | (+${spots.length - max} more)` : '');
}

export const clip = (s, n = 60) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 3) + '...' : s; };

// Self-test of build.mjs's strict applier and conflict rule, on synthetic text (no Fastwork code).
//   node fixes/best-build/selftest.mjs        # prints one line per case, exit 1 on any failure
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WT, spans, parseDiff, applyHunks, udiff } from './build.mjs';

const dir = join(WT, 'out/best-build'); mkdirSync(dir, { recursive: true });
const base = Array.from({ length: 40 }, (_, i) => `L${i + 1}\n`).join('');
const edit = (f) => { const a = base.split('\n'); f(a); return a.join('\n'); };
const d = (x) => parseDiff(udiff(base, x, 'a/f', 'b/f', dir)).f;
const gap = (p, q) => { let g = Infinity; for (const [a0, a1] of spans(p)) for (const [b0, b1] of spans(q)) g = Math.min(g, Math.max(b0 - a1, a0 - b1) - 1); return g; };
const A = d(edit((a) => { a[9] = 'A10'; }));                 // line 10 changed
const cases = {
  'same line: overlap (gap < 0)': gap(A, d(edit((a) => { a[9] = 'B10'; }))) < 0,
  'insert 1 line after: conflict (gap < 3)': gap(A, d(edit((a) => { a.splice(11, 0, 'Bins'); }))) < 3,
  'line 14 changed: 3 lines apart, no conflict': gap(A, d(edit((a) => { a[13] = 'B14'; }))) === 3,
  'line 31 changed: far apart': gap(A, d(edit((a) => { a[30] = 'B31'; }))) > 3,
  'stack far deltas': (() => { const r = applyHunks(applyHunks(base, A).text, d(edit((a) => { a[30] = 'B31'; }))); return !r.error && r.text.includes('A10\n') && r.text.includes('B31\n'); })(),
  'strict: same-line second delta refused': !!applyHunks(applyHunks(base, A).text, d(edit((a) => { a[9] = 'B10'; }))).error,
  'offset: hunk found after an earlier insertion': (() => { const pre = applyHunks(base, d(edit((a) => { a.splice(2, 0, 'x', 'y'); }))).text; const r = applyHunks(pre, d(edit((a) => { a[30] = 'B31'; }))); return !r.error && r.offsets[0] === 2; })(),
  'reverse apply restores': applyHunks(applyHunks(base, A).text, A, { reverse: true }).text === base,
};
let bad = 0;
for (const [k, ok] of Object.entries(cases)) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${k}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);

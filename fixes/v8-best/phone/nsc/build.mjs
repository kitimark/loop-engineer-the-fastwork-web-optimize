#!/usr/bin/env node
// v8 + nav-hit-cache + scroll-cb-phone (lead order 2026-10-05, for the combined phone no-worse ticket). Builds read-only
// snapshot copies out/nsc/snap/{C,V}/ (gitignored) + HASHES.txt (full sha256) with best-build's strict applier (exact
// context, no fuzz). Refuses (exit 3, nothing written) on any identity failure, or if out/nsc/snap exists.
//   C  v8-best = fixes/v8-best/patch.diff on the baseline (3e3e94cb6e9f / f836404b3728)
//   V  C + nav-hit-cache patch-on-v8.diff (branch nav-hit-cache 64ad0b9b, P-107's V) + scroll-cb-on-v8.diff (this folder)
// scroll-cb-on-v8.diff carries fix-scroll-cb's patch-on-best.diff (branch worktree-agent-afbb8899a928610ec 5e616aa5,
// P-108's V, made on the best build 65052c4a3902) onto v8. 14 of its 16 hunks apply to v8 unchanged; 2 (the future
// section mM, where rest-script v4 added fw* declarations and fwCheck() to u) conflict. Carry: the scb declarations
// go right before l (after rest-script's fwNearChange), and scbU calls fwCheck() when the gate skips u, so
// rest-script's per-frame jump check still runs on phones (the gate skips only the job's rAF).
// Identities: inputs = owners' builds (best + scb = 27f23f6a3878, C + nav = fd3688901f50); the 14 clean hunks apply
// to C; the carried diff's changed lines = the original's, except the scbU line and its 2-line comment; nav and scb
// commute (both orders give V); V - nav (reverse) = C + scb; CSS = C's; node --check on V.
//   node fixes/v8-best/phone/nsc/build.mjs [--dry]      (--dry: all checks, write nothing)
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { JS, CSS, FILES, sha, parseDiff, applyHunks } from '../../../best-build/build.mjs';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const DRY = process.argv.includes('--dry');
const OUT = join(WT, 'out/nsc/snap');
if (!DRY && existsSync(OUT)) { console.error(`${OUT} exists: refuse (immutable)`); process.exit(3); }
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(3); };
const H = (t) => Object.fromEntries(FILES.map((f) => [f, sha(t[f])]));
const fmt = (t) => { const h = H(t); return `${h[JS]} / ${h[CSS]}`; };
const full = (s) => createHash('sha256').update(s).digest('hex');
const ok = (name, pass, detail = '') => { if (!pass) die(`${name}${detail ? '  ' + detail : ''}`); console.log(`ok  ${name}${detail ? '  ' + detail : ''}`); };
const apply = (d, start, name, reverse = false) => {
  d = typeof d === 'string' ? parseDiff(d) : d; const out = { ...start };
  for (const f of Object.keys(d)) {
    if (!FILES.includes(f)) die(`${name}: unknown file ${f}`);
    const r = applyHunks(out[f], d[f], { reverse }); if (r.error) die(`CONFLICT ${name} ${f}${reverse ? ' (reverse)' : ''}: ${r.error}`); out[f] = r.text;
  }
  return out;
};
const pin = (name, t, js, css) => ok(`${name}`, H(t)[JS] === js && H(t)[CSS] === css, `${fmt(t)} (want ${js} / ${css})`);
const rd = (p) => readFileSync(join(WT, p), 'utf8');
const show = (rev, p) => { const r = spawnSync('git', ['-C', WT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status) die(`git show ${rev}:${p}: ${r.stderr.trim()}`); return r.stdout; };
const pinFile = (name, text, want) => { ok(`${name} file ${want}`, sha(text) === want, sha(text)); return text; };

const NAV = pinFile('nav-hit-cache patch-on-v8.diff (64ad0b9b)', show('64ad0b9b', 'fixes/nav-hit-cache/patch-on-v8.diff'), '7bbb6d4212ff');
const SCB0 = pinFile('scroll-cb patch-on-best.diff (5e616aa5)', show('5e616aa5', 'fixes/scroll-cb-phone/patch-on-best.diff'), 'c2dc144b7bd2');
const SCB = pinFile('scroll-cb-on-v8.diff (carried)', rd('fixes/v8-best/phone/nsc/scroll-cb-on-v8.diff'), '3abcd7008e61');

const baseDir = resolveTree('site-pretty');
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(baseDir, f), 'utf8')]));
const best = apply(rd('fixes/best-build/patch.diff'), base, 'best'); pin('input best-build', best, '65052c4a3902', 'e0f92804c521');
pin('input scroll-cb V = best + patch-on-best (P-108)', apply(SCB0, best, 'scb@best'), '27f23f6a3878', 'e0f92804c521');
const C = apply(rd('fixes/v8-best/patch.diff'), base, 'v8'); pin('C = v8-best (patch.diff)', C, '3e3e94cb6e9f', 'f836404b3728');
const CN = apply(NAV, C, 'nav@v8'); pin('input nav-hit-cache V = C + patch-on-v8 (P-107)', CN, 'fd3688901f50', 'f836404b3728');

const CONFLICT = [11539, 11570];
const clean = parseDiff(SCB0)[JS].filter((h) => !CONFLICT.includes(h.oldStart));
apply({ [JS]: clean }, C, 'scb clean hunks@v8');
ok(`scroll-cb: ${clean.length} of 16 hunks apply to C unchanged; only @@ -11539 and @@ -11570 (future section) conflict`, clean.length === 14);
const changed = (d) => d.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l)).map((l) => l.replace(/\s+$/, '')).sort();
const extra = [
  '+      // [scroll-cb-phone, carried onto v8] the gate skips only the job\'s rAF; rest-script\'s jump check (fwCheck: a',
  '+      // cached box, no layout read) still runs on every scroll/resize frame, as it does in v8',
  '+        ((scbPoke = !0), !scbOff || scbDirty || scbG.near() ? u() : fwCheck());',
].sort();
const gone = ['+        ((scbPoke = !0), (!scbOff || scbDirty || scbG.near()) && u());'];
const want = changed(SCB0).filter((l) => !gone.includes(l)).concat(extra).sort();
ok('carried diff changes the same lines as the original, except scbU (+ its comment)', JSON.stringify(changed(SCB)) === JSON.stringify(want));

const CS = apply(SCB, C, 'scb@v8');
const V = apply(SCB, CN, 'scb@v8+nav');
ok('nav and scroll-cb commute (C + scb + nav = C + nav + scb)', apply(NAV, CS, 'nav@v8+scb')[JS] === V[JS], fmt(V));
ok('V - nav (reverse) = C + scb', apply(NAV, V, 'V-nav', true)[JS] === CS[JS], fmt(CS));
ok('V CSS = C CSS (both fixes are JS only)', V[CSS] === C[CSS]);
const work = join(WT, 'out/nsc/work'); mkdirSync(work, { recursive: true });
const tmp = join(work, 'V.mjs'); writeFileSync(tmp, V[JS]);
const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
ok('node --check (ES module) on V\'s JS', r.status === 0, r.stderr.trim());

const arms = { C, V };
const lines = [];
for (const [arm, t] of Object.entries(arms)) for (const f of FILES) lines.push(`${full(t[f])}  ${arm}/${f}`);
console.log(`V = ${fmt(V)}  (C + nav = ${fmt(CN)}, C + scb = ${fmt(CS)})`);
console.log(lines.join('\n'));
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
for (const [arm, t] of Object.entries(arms)) {
  const d = join(OUT, arm);
  for (const f of FILES) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); }
}
writeFileSync(join(OUT, 'HASHES.txt'), lines.join('\n') + '\n'); chmodSync(join(OUT, 'HASHES.txt'), 0o444);
console.log('snap ok');

#!/usr/bin/env node
// panel-height Try-it patches (pattern of fix-end-morph-p1's tryit/mk-tryit.mjs, credit): baseline-relative patch files of
// the three arms, so the console's Try-it panel can serve them (it takes committed fixes/<topic>/patch.diff paths):
//   fixes/panel-height-base/patch.diff   A = today's v10 candidate (v9-final + F1/U2 + I-219 + P1 + P1b (a)), vh as today
//   fixes/panel-height-svh/patch.diff    S = A + delta-svh.diff
//   fixes/panel-height-dvh/patch.diff    D = A + delta-dvh.diff
// Source bytes: out/ph/{A,S,D} (fixes/panel-height/build.mjs), pinned below. Each patch is applied back onto the
// baseline with the strict applier (exact context, fixes/best-build/build.mjs) and must give those bytes.
//   node fixes/panel-height/mk-tryit.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, sha, parseDiff, applyHunks, udiff } from '../best-build/build.mjs';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const BASE = resolveTree('site-pretty');
const PIN = { A: ['f83aa54c2acc', 'cfb8b8c5b019'], S: ['f83aa54c2acc', '75c30c18d971'], D: ['f83aa54c2acc', '0546615f27ea'] };
const tmp = join(WT, 'out/ph/tryit-tmp'); mkdirSync(tmp, { recursive: true });
const base = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(BASE, f), 'utf8')]));
for (const [arm, topic] of [['A', 'panel-height-base'], ['S', 'panel-height-svh'], ['D', 'panel-height-dvh']]) {
  const t = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(WT, 'out/ph', arm, f), 'utf8')]));
  const got = FILES.map((f) => sha(t[f]));
  if (got.join('/') !== PIN[arm].join('/')) throw new Error(`${arm} is ${got.join('/')}, pinned ${PIN[arm].join('/')}`);
  const patch = FILES.map((f) => udiff(base[f], t[f], `a/${f}`, `b/${f}`, tmp)).join('');
  const per = parseDiff(patch);
  for (const f of FILES) {
    const r = applyHunks(base[f], per[f] || []);
    if (r.error) throw new Error(`${topic}: ${f}: ${r.error}`);
    if (sha(r.text) !== sha(t[f])) throw new Error(`${topic}: re-apply of ${f} gives ${sha(r.text)}, want ${sha(t[f])}`);
  }
  mkdirSync(join(WT, 'fixes', topic), { recursive: true });
  writeFileSync(join(WT, 'fixes', topic, 'patch.diff'), patch);
  console.log(`fixes/${topic}/patch.diff: ${arm} ${got.join('/')}, patch sha ${sha(patch)}, re-apply exact`);
}

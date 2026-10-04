#!/usr/bin/env node
// toolbar-resize P-115 follow-up (pre-staged while P-115 waits, roles v3 R3): build the CSS-only candidates on v8 as
// overlays fixes/toolbar-resize--p115-<arm>/overlay (gitignored): v8's JS unchanged, v8's CSS + p115-<arm>.css appended.
// Refuses unless the v8 overlay is the ticket's v8 (JS 3e3e94cb6e9f, CSS f836404b3728). Prints the candidate hashes.
//   node fixes/toolbar-resize/p115-cands.mjs [csl] [cva]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const v8 = join(WT, 'fixes/v8-best/overlay');
const js = readFileSync(join(v8, JS)), css = readFileSync(join(v8, CSS));
if (h(js) !== '3e3e94cb6e9f' || h(css) !== 'f836404b3728') { console.log(`STOP v8 overlay is ${h(js)} / ${h(css)}`); process.exit(3); }
const arms = process.argv.slice(2).length ? process.argv.slice(2) : ['csl', 'cva'];
for (const a of arms) {
  const delta = readFileSync(join(WT, `fixes/toolbar-resize/p115-${a}.css`));
  const out = join(WT, `fixes/toolbar-resize--p115-${a}/overlay`);
  mkdirSync(join(out, '_app/immutable/nodes'), { recursive: true });
  mkdirSync(join(out, '_app/immutable/assets'), { recursive: true });
  const c = Buffer.concat([css, delta]);
  writeFileSync(join(out, JS), js);
  writeFileSync(join(out, CSS), c);
  console.log(`${a} JS ${h(js)} CSS ${h(c)} (delta ${h(delta)})`);
}

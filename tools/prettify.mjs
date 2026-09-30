#!/usr/bin/env node
// Make a readable copy of the mirror: site/ -> site-pretty/ with every JS and CSS file run
// through Prettier (npx one-off, nothing installed globally). site/ itself is never touched, so
// `serve.mjs` keeps serving byte-identical production files by default.
//
//   node tools/prettify.mjs            # (re)build site-pretty/
//   node tools/serve.mjs --root site-pretty --port 5180   # optional: run the formatted copy;
//                                      # LoAF/DevTools line numbers then point at readable code
//
// HTML is copied verbatim on purpose: SvelteKit hydrates against the exact SSR markup
// (<!--[--> markers, whitespace), so reformatting index.html would break hydration.
// Production publishes no source maps (checked by mirror.mjs), so this is the closest
// thing to source that is available.
import { cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'site');
const DST = resolve(ROOT, 'site-pretty');
if (!existsSync(SRC)) { console.error('site/ missing — run node tools/mirror.mjs first'); process.exit(1); }

rmSync(DST, { recursive: true, force: true });
cpSync(SRC, DST, { recursive: true, filter: (p) => !p.includes('/.mirror/chrome-profile') });
const common = ['--yes', 'prettier@3', '--write', '--log-level', 'warn', '--print-width', '110', '--ignore-path', ''];
let r = spawnSync('npx', [...common, 'site-pretty/**/*.{js,css}', '!site-pretty/__vendor/**'], { cwd: ROOT, stdio: 'inherit' });
if (r.status !== 0) console.error('prettier reported problems for some first-party files (they were left as-is)');
// third-party scripts saved by `mirror.mjs --vendors` have odd names (.br, .gz, query hashes): force the JS parser
const manifest = JSON.parse(readFileSync(resolve(SRC, '.mirror/manifest.json'), 'utf8'));
const vendorFiles = Object.values(manifest.vendors || {}).map((v) => 'site-pretty/' + v.file);
if (vendorFiles.length) {
  r = spawnSync('npx', [...common, '--parser', 'babel', ...vendorFiles], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) console.error('prettier reported problems for some vendor files');
}
console.log('readable copy: site-pretty/  (serve with: node tools/serve.mjs --root site-pretty)');

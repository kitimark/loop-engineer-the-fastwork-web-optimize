// I-152 (PR-020 N10): `--help` (or `-h`) on any tool prints its usage and exits 0 before anything else runs: no server,
// no lock, no phone, no network, no file written. Before this, `serve.mjs --help` started a server and left a new
// agent's shell hanging. Each tool calls exitOnHelp(import.meta.url) right after its imports; the usage is the tool's
// header comment (the leading `//` block), so it never drifts from a second copy.
//   - Only tokens before the first `--` count: `lock.mjs run … -- node x.mjs --help` runs x's help, not lock's.
//   - Only when the file is the process's main script: a tool imported as a library never exits for its importer.
//   - `unless(argv)` keeps a tool's own subcommand help (console.mjs thread|proposal, iphone.mjs run).
import { readFileSync, realpathSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** true when argv (before any `--`) holds `--help` or `-h`. */
export function wantsHelp(argv = process.argv.slice(2)) {
  const end = argv.indexOf('--');
  const head = end < 0 ? argv : argv.slice(0, end);
  return head.some((a) => a === '--help' || a === '-h');
}

/** The leading `//` comment block of a source file (shebang skipped), comment markers removed, newline-terminated. */
export function headerUsage(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!out.length && line.startsWith('#!')) continue;
    if (!line.startsWith('//')) break;
    out.push(line.replace(/^\/\/ ?/, ''));
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.length ? `${out.join('\n')}\n` : `see the header of ${file}\n`;
}

// synchronous, so process.exit cannot cut the text short on a pipe (stdout pipes are async on macOS); EAGAIN retries
export function writeAllSync(fd, text) {
  const b = Buffer.from(text);
  let off = 0;
  while (off < b.length) {
    try { off += writeSync(fd, b, off); } catch (e) { if (e.code !== 'EAGAIN') throw e; }
  }
}

const real = (p) => { try { return realpathSync(p); } catch { return p; } };

/** true when metaUrl is the script node was started with. */
export function isMain(metaUrl, argv1 = process.argv[1]) {
  return !!argv1 && real(fileURLToPath(metaUrl)) === real(argv1);
}

/** Print the tool's header and exit 0 when --help/-h was asked for (see the file header). */
export function exitOnHelp(metaUrl, { argv = process.argv.slice(2), unless, argv1 = process.argv[1], write = (s) => writeAllSync(1, s), exit = (c) => process.exit(c) } = {}) {
  if (!isMain(metaUrl, argv1) || !wantsHelp(argv) || (unless && unless(argv))) return false;
  write(headerUsage(fileURLToPath(metaUrl)));
  exit(0);
  return true;
}

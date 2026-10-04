// A CLI's last step (I-110, I-117). process.exit() right after main() returned dropped whatever stdout still held for a
// pipe reader that reads late (`node tools/incident.mjs list --json | node -e 'JSON.parse(...)'`): everything past the
// pipe buffer (64 KB) was cut. exitWhenFlushed sets the exit code and exits only once stdout and stderr have flushed
// what was written before it (a write callback runs after the writes queued ahead of it), so the CLI keeps its exit
// code, still never waits on a leftover timer or handle, and exits at once if the reader went away (EPIPE).

/** Set process.exitCode = `code`, then exit with it once stdout and stderr have flushed (or failed). */
export function exitWhenFlushed(code, { stdout = process.stdout, stderr = process.stderr, exit = (c) => process.exit(c) } = {}) {
  process.exitCode = code;
  let done = false;
  const end = () => { if (!done) { done = true; exit(code); } };
  for (const s of [stdout, stderr]) s.once?.('error', end); // a closed pipe: nothing more to flush
  stdout.write('', () => stderr.write('', end));
}

/** The CLI tail: run `main`, exit with its code once flushed; a throw prints its message and exits with `errCode`. */
export function runMain(main, { errCode = 1, ...io } = {}) {
  return main().then((c) => exitWhenFlushed(c, io), (e) => { console.error(e.message || e); exitWhenFlushed(errCode, io); });
}

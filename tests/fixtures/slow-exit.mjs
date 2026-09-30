// Preload (`node --import <this> <tool>`) for signal tests: registers the first 'exit' listener, which
// writes $SLOW_EXIT_DIR/exit-started and then blocks until the test has sent a second signal
// ($SLOW_EXIT_DIR/second-sent, 5 s cap) plus 200 ms for it to land. The tool's own 'exit' listeners run
// after this one, so a test can check deterministically that a signal arriving during process.exit()
// does not kill the process before its cleanup (incidents I-008, I-009).
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.SLOW_EXIT_DIR;
if (dir) {
  process.on('exit', () => {
    writeFileSync(join(dir, 'exit-started'), String(process.pid));
    for (const t = Date.now() + 5000; Date.now() < t && !existsSync(join(dir, 'second-sent'));) {}
    for (const t = Date.now() + 200; Date.now() < t;) {}
    writeFileSync(join(dir, 'exit-done'), String(process.pid));
  });
}

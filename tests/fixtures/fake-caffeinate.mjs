// A stand-in for /usr/bin/caffeinate in tests (incident I-026): appends {pid, args} to $FAKE_CAFFEINATE_LOG,
// then lives like caffeinate: until the -w <pid> process is gone, -t <seconds> pass, or SIGTERM.
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_CAFFEINATE_LOG) appendFileSync(process.env.FAKE_CAFFEINATE_LOG, JSON.stringify({ pid: process.pid, args }) + '\n');
const at = (f) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : null; };
const w = at('-w'), t = at('-t');
const alive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
if (t) setTimeout(() => process.exit(0), t * 1000);
setInterval(() => { if (w && !alive(w)) process.exit(0); }, 100);

// I-072: a long-lived fixture (fake WDA runner, iproxy, iwdp, the fake Safari tab) never outlives the test process
// that started it. The tools start these detached (their own process group; ppid 1 once the tool has exited), so a
// test that failed or timed out before its `wda stop`, or a runner killed at the lane's --max-seconds, left them
// running for hours. tests/helpers.mjs cleanEnv() passes every child:
//   $FW_TEST_LIFELINE  the test process's pid: this fixture exits by itself within ~0.5 s once that pid is gone
//                      (also after a SIGKILL of the test runner, when no exit hook runs);
//   $FW_TEST_FIXTURES  a registry dir: this fixture writes <dir>/<pid>.json while it runs, so the test kills it
//                      (helpers.killFixtures: per test in afterEach, and for all at the test process's exit).
// Import it for its side effect (`import './lifeline.mjs'`), or `node --import <its file URL>` for an inline helper.
// Without $FW_TEST_LIFELINE (a fixture run by hand) the lifeline is the process that started it (I-237: two fake
// coredevice servers an agent started by hand ran on for 2 days with ppid 1, holding [::1] ports that serve.mjs --port 0
// then got, so localhost reached them); started by hand from a process that is already gone (ppid 1), it has none.
// Nothing at all inside a test file's own process ($NODE_TEST_CONTEXT, which cleanEnv drops for children), where a
// unit test imports a fixture module in-process.
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const KEY = Symbol.for('fw.test.lifeline');
if (!globalThis[KEY] && !process.env.NODE_TEST_CONTEXT) {
  globalThis[KEY] = true;
  const owner = process.env.FW_TEST_LIFELINE ? Number(process.env.FW_TEST_LIFELINE) : process.ppid;
  const dir = process.env.FW_TEST_FIXTURES;
  if (dir) {
    const f = join(dir, `${process.pid}.json`);
    try {
      writeFileSync(f, JSON.stringify({ pid: process.pid, script: process.argv[1] || null, at: Date.now() }));
      process.on('exit', () => { try { rmSync(f, { force: true }); } catch {} });
    } catch {} // the test process is gone and its registry with it: the lifeline below ends us
  }
  if (Number.isInteger(owner) && owner > 1 && owner !== process.pid) {
    const gone = () => { try { process.kill(owner, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
    const t = setInterval(() => { if (gone()) process.exit(0); }, 500);
    t.unref();
    if (gone()) process.exit(0);
  }
}

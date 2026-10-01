// Chrome state check of the morph driver hook on g, g+b, g+e, g+c (state only, no timing claims).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const WT = '/Users/<user>/source/fastwork-com-web-optimize/.claude/worktrees/agent-a277ea00c8773c1ea';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));
const OUT = '/private/tmp/claude-501/-Users-<user>-source-fastwork-com-web-optimize/391f6dee-c7ee-40f4-93c3-f4c2dce764ec/scratchpad/morph-webkit/out';
mkdirSync(OUT, { recursive: true });
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
try {
  for (const b of (process.env.BUILDS || 'mw-g-pinclamp-osb,mw-gb,mw-ge,mw-gc').split(',')) {
    const state = join(OUT, `serve-${b}.json`); rmSync(state, { force: true });
    const proc = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', '/Users/<user>/source/fastwork-com-web-optimize/site-pretty', '--overlay', `${WT}/fixes/${b}/overlay,${process.env.BASEOV || WT + "/fixes/aw1-10c/overlay"}`, '--port', '0', '--quiet', '--state', state, '--vendors=local', '--https', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
    let url; for (let i = 0; i < 200 && !url; i++) { if (existsSync(state)) { try { url = JSON.parse(readFileSync(state, 'utf8')).url; } catch {} } if (!url) await sleep(100); }
    const page = await cdp.newIsolatedPage();
    const errors = []; page.on((m) => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Page.bringToFront');
    await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
    if (!(await page.eval(`!!document.querySelector('header.start-selling-top-nav') && document.documentElement.scrollHeight - innerHeight > 1000`))) throw new Error('blank page ' + b);
    await page.eval(`window.__fwMorphDrive({ hold: 1500, cycles: 1 }); 'started'`);
    let r = null; for (let i = 0; i < 30 && !r; i++) { await sleep(500); r = await page.eval('window.__fwMD'); }
    const j = r && JSON.parse(r);
    console.log(b, j ? JSON.stringify({ maxMorph: Math.max(...j.frames.map((f) => f[3])), endMorph: j.frames.at(-1)[3], ys: [...new Set(j.frames.map((f) => f[2]))], all: j.all, moving: j.moving.frames, atOne: j.atOne.frames, osbAfter: await page.eval('document.documentElement.style.overscrollBehaviorY') }) : 'NO RESULT', 'errors', JSON.stringify(errors.slice(0, 3)));
    await page.close(); proc.kill();
  }
} finally { cdp.close(); await ch.close(); }
